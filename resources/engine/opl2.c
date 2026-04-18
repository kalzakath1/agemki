/*
 * opl2.c -- Driver OPL2 (Yamaha YM3812 / AdLib) para AGEMKI v33+
 *
 * Arquitectura:
 *   midi_tick() -> opl2_send() -> maquina de estado -> _opl2_dispatch()
 *   -> note_on/note_off/cc/program_change -> escrituras a puerto 0x388/0x389
 *
 * Instrumentos: banco GENMIDI.OP2 cargado via opl_patches_load().
 *   Si no hay banco cargado se usa un patch FM minimo (onda seno).
 *   Program Change (0xC0) selecciona el instrumento por canal MIDI.
 *   Canal MIDI 9 = percusion (notas 35-81 mapean a instrumentos 128-174).
 *
 * Restricciones:
 *   - Sin malloc; todo en estaticos
 *   - Sin stdlib; solo <conio.h> para inp/outp
 *   - Compatible wcc386 -bt=dos -6r -ox
 */
#include <conio.h>
#include "opl2.h"
#include "opl_patches.h"

int g_opl2_active = 0;

/* ------------------------------------------------------------------ */
/* Tablas                                                               */
/* ------------------------------------------------------------------ */

/*
 * Fnum para cada semitono (0=C ... 11=B) al bloque de referencia.
 * Block = (midi_note / 12) - 1, clamped [0,7].
 * Verificado: nota 69 (A4=440Hz) -> fnum=0x241 block=4 (~438Hz, <1%)
 */
static const unsigned short g_fnum[12] = {
    0x157, 0x16B, 0x181, 0x198, 0x1B0, 0x1CA,
    0x1E5, 0x202, 0x220, 0x241, 0x263, 0x287
};

/*
 * Offsets de operador modulator y carrier para canales OPL2 0-8.
 * Layout YM3812: mod=[0,1,2,8,9,A,10,11,12] car=mod+3
 */
static const unsigned char g_mod_off[9] = {
    0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x10, 0x11, 0x12
};
static const unsigned char g_car_off[9] = {
    0x03, 0x04, 0x05, 0x0B, 0x0C, 0x0D, 0x13, 0x14, 0x15
};

/* ------------------------------------------------------------------ */
/* Estado interno                                                       */
/* ------------------------------------------------------------------ */

#define OPL2_CHANNELS 9
#define MIDI_PERC_CH  9    /* canal MIDI de percusion (0-indexado) */

typedef struct {
    unsigned char midi_ch;
    unsigned char note;
    unsigned char vel;          /* velocidad de la nota (para re-escalar en CC7) */
    unsigned char active;
    unsigned long age;
    unsigned char is_secondary; /* 1 = canal secundario 2VOICE (no robar directamente) */
    int           pair;         /* indice del canal pareja, -1 = sin pareja */
} OplChan;

static OplChan        g_chan[OPL2_CHANNELS];
static unsigned long  g_age_counter = 0;
static unsigned char  g_midi_vol[16];    /* volumen por canal MIDI 0-127  */
static unsigned char  g_midi_prog[16];   /* programa actual por canal MIDI */
static unsigned char  g_master_vol = 100;

/* Maquina de estado para opl2_send() */
static unsigned char  g_ev_status       = 0;
static unsigned char  g_ev_data[2];
static int            g_ev_bytes_needed = 0;
static int            g_ev_bytes_got    = 0;

/* ------------------------------------------------------------------ */
/* I/O helpers                                                          */
/* ------------------------------------------------------------------ */

/*
 * Delays via lecturas del puerto status (no bloquean el PIT).
 *   Tras escribir registro : 3.3 us -> 6 lecturas
 *   Tras escribir dato     : 23 us  -> 36 lecturas
 */
static void _opl2_delay_addr(void) {
    (void)inp(OPL2_PORT_ADDR); (void)inp(OPL2_PORT_ADDR);
    (void)inp(OPL2_PORT_ADDR); (void)inp(OPL2_PORT_ADDR);
    (void)inp(OPL2_PORT_ADDR); (void)inp(OPL2_PORT_ADDR);
}

static void _opl2_delay_data(void) {
    int i;
    for (i = 0; i < 36; i++) (void)inp(OPL2_PORT_ADDR);
}

static void _opl2_write(unsigned char reg, unsigned char val) {
    outp(OPL2_PORT_ADDR, reg);
    _opl2_delay_addr();
    outp(OPL2_PORT_DATA, val);
    _opl2_delay_data();
}

/* ------------------------------------------------------------------ */
/* Calculo de frecuencia                                               */
/* ------------------------------------------------------------------ */

static void _opl2_get_freq(unsigned char note,
                            unsigned char *fnum_lo,
                            unsigned char *b0_base) {
    int block = (int)(note / 12) - 1;
    unsigned short fnum;
    if (block < 0) block = 0;
    if (block > 7) block = 7;
    fnum     = g_fnum[note % 12];
    *fnum_lo = (unsigned char)(fnum & 0xFF);
    *b0_base = (unsigned char)(((fnum >> 8) & 0x03) | ((block & 0x07) << 2));
}

/* ------------------------------------------------------------------ */
/* Volumen                                                              */
/* ------------------------------------------------------------------ */

/*
 * Combina el TL base del instrumento con volumen MIDI, master y velocidad.
 * TL: 0=maximo, 63=silencio (escala invertida).
 * vol_efectivo = (midi_vol * master_vol / 127) * vel / 127
 * Preserva los bits KSL (bits 7:6) del patch.
 */
static unsigned char _opl2_scale_tl(unsigned char patch_ksl_output,
                                     unsigned char midi_ch,
                                     unsigned char vel) {
    unsigned char ksl      = patch_ksl_output & 0xC0;
    unsigned char base_tl  = patch_ksl_output & 0x3F;
    unsigned long eff_vol  = ((unsigned long)g_midi_vol[midi_ch & 0x0F] *
                               (unsigned long)g_master_vol) / 127UL;
    eff_vol = (eff_vol * (unsigned long)vel) / 127UL;
    { unsigned int tl = (unsigned int)base_tl +
                        ((unsigned int)(63 - base_tl) * (127U - (unsigned int)eff_vol)) / 127U;
      if (tl > 63) tl = 63;
      return ksl | (unsigned char)tl; }
}

/* Para el patch de fallback (sin banco cargado): TL por volumen + velocity */
static unsigned char _opl2_vol_to_tl(unsigned char midi_ch, unsigned char vel) {
    unsigned long eff = ((unsigned long)g_midi_vol[midi_ch & 0x0F] *
                         (unsigned long)g_master_vol) / 127UL;
    eff = (eff * (unsigned long)vel) / 127UL;
    if (eff == 0) return 63;
    return (unsigned char)(63 - ((unsigned int)eff * 63U) / 127U);
}

/* ------------------------------------------------------------------ */
/* Aplicar patch del banco de instrumentos                             */
/* ------------------------------------------------------------------ */

/*
 * Devuelve el instrumento GM a usar para el canal MIDI dado.
 * Canal 9 = percusion: mapeamos por nota (no por programa).
 * Los demas canales usan g_midi_prog[ch].
 */
static const GenmidiInstr* _opl2_get_instr(unsigned char midi_ch,
                                            unsigned char note) {
    int prog;
    if (!g_genmidi_loaded) return 0;

    if ((midi_ch & 0x0F) == MIDI_PERC_CH) {
        /* Percusion: nota MIDI -> instrumento 128..174 */
        prog = GENMIDI_NUM_MELODIC + ((int)note - GENMIDI_PERC_BASE);
        if (prog < GENMIDI_NUM_MELODIC) prog = GENMIDI_NUM_MELODIC;
        if (prog >= GENMIDI_TOTAL)      prog = GENMIDI_TOTAL - 1;
    } else {
        prog = g_midi_prog[midi_ch & 0x0F];
        if (prog >= GENMIDI_NUM_MELODIC) prog = 0;
    }
    return &g_genmidi[prog];
}

/*
 * Escribe los parametros FM del instrumento en el canal OPL indicado.
 * voice_idx: 0 = voz primaria, 1 = voz secundaria (2VOICE).
 * Para canal de percusion aplica fixed_note si GENMIDI_FLAG_FIXED esta activo.
 */
static void _opl2_apply_patch_v(int opl_ch, unsigned char midi_ch,
                                 unsigned char note, unsigned char vel,
                                 unsigned char *note_out, int voice_idx) {
    unsigned char mod = g_mod_off[opl_ch];
    unsigned char car = g_car_off[opl_ch];
    const GenmidiInstr* ins = _opl2_get_instr(midi_ch, note);
    int vi = (voice_idx == 1) ? 1 : 0;  /* indice de voz seguro */

    if (note_out) *note_out = note;

    if (ins) {
        const GenmidiVoice* v = &ins->voices[vi];
        int adj_note;

        /* Nota ajustada con el base_note_offset de la voz seleccionada */
        adj_note = (int)note + (int)v->base_note_offset;
        if (adj_note < 0)   adj_note = 0;
        if (adj_note > 127) adj_note = 127;
        if (note_out) *note_out = (unsigned char)adj_note;

        /* Nota fija para percusion (p.ej. bombo siempre en misma afinacion) */
        if ((ins->flags & GENMIDI_FLAG_FIXED) && note_out)
            *note_out = ins->fixed_note;

        /* Modulator: TL escalado solo en modo aditivo (con=1, bit0 del feedback).
         * En FM puro (con=0) el modulador controla el timbre, no el volumen. */
        _opl2_write(0x20 + mod, v->modulator.tremolo_vibrato);
        _opl2_write(0x40 + mod, (v->feedback & 0x01)
                                 ? _opl2_scale_tl(v->modulator.ksl_output, midi_ch, vel)
                                 : v->modulator.ksl_output);
        _opl2_write(0x60 + mod, v->modulator.attack_decay);
        _opl2_write(0x80 + mod, v->modulator.sustain_release);
        _opl2_write(0xE0 + mod, v->modulator.waveform & 0x03);  /* OPL2: 2 bits */

        /* Carrier: TL escalado por volumen MIDI + master + velocity */
        _opl2_write(0x20 + car, v->carrier.tremolo_vibrato);
        _opl2_write(0x40 + car, _opl2_scale_tl(v->carrier.ksl_output, midi_ch, vel));
        _opl2_write(0x60 + car, v->carrier.attack_decay);
        _opl2_write(0x80 + car, v->carrier.sustain_release);
        _opl2_write(0xE0 + car, v->carrier.waveform & 0x03);

        /* Conexion FM: usar el feedback del instrumento */
        _opl2_write(0xC0 + opl_ch, v->feedback & 0x0F);
    } else {
        /* Fallback: patch minimo (onda seno) — solo relevante para voz 0 */
        _opl2_write(0x20 + mod, 0x01);
        _opl2_write(0x60 + mod, 0xF0);
        _opl2_write(0x80 + mod, 0x77);
        _opl2_write(0xE0 + mod, 0x00);
        _opl2_write(0x40 + mod, 0x20);

        _opl2_write(0x20 + car, 0x01);
        _opl2_write(0x60 + car, 0xF0);
        _opl2_write(0x80 + car, 0x77);
        _opl2_write(0xE0 + car, 0x00);
        _opl2_write(0x40 + car, _opl2_vol_to_tl(midi_ch, vel));

        _opl2_write(0xC0 + opl_ch, 0x00);
    }
}

/* Actualiza solo el TL del carrier de un canal activo (para cambios de volumen CC7).
 * Si el canal tiene una segunda voz 2VOICE emparejada, la actualiza tambien. */
static void _opl2_update_vol(int opl_ch, unsigned char midi_ch) {
    const GenmidiInstr* ins = _opl2_get_instr(midi_ch, g_chan[opl_ch].note);
    unsigned char mod = g_mod_off[opl_ch];
    unsigned char car = g_car_off[opl_ch];
    unsigned char vel = g_chan[opl_ch].vel;

    if (ins) {
        const GenmidiVoice* v = &ins->voices[0];
        if (v->feedback & 0x01)
            _opl2_write(0x40 + mod, _opl2_scale_tl(v->modulator.ksl_output, midi_ch, vel));
        _opl2_write(0x40 + car, _opl2_scale_tl(v->carrier.ksl_output, midi_ch, vel));
        /* Actualizar TL de la segunda voz si existe */
        if (g_chan[opl_ch].pair >= 0) {
            int sec = g_chan[opl_ch].pair;
            const GenmidiVoice* v2 = &ins->voices[1];
            unsigned char mod2 = g_mod_off[sec];
            unsigned char car2 = g_car_off[sec];
            if (v2->feedback & 0x01)
                _opl2_write(0x40 + mod2, _opl2_scale_tl(v2->modulator.ksl_output, midi_ch, vel));
            _opl2_write(0x40 + car2, _opl2_scale_tl(v2->carrier.ksl_output, midi_ch, vel));
        }
    } else {
        _opl2_write(0x40 + car, _opl2_vol_to_tl(midi_ch, vel));
    }
}

/* ------------------------------------------------------------------ */
/* Voice allocation                                                     */
/* ------------------------------------------------------------------ */

static int _opl2_alloc_chan(void) {
    int i;
    int oldest_i = -1;
    unsigned long oldest_age = 0xFFFFFFFFUL;

    /* Canal libre (activo=0) */
    for (i = 0; i < OPL2_CHANNELS; i++) {
        if (!g_chan[i].active) return i;
    }
    /* Voice stealing: no robar secundarios directamente (se liberan con su primario) */
    for (i = 0; i < OPL2_CHANNELS; i++) {
        if (g_chan[i].is_secondary) continue;
        if (g_chan[i].age < oldest_age) {
            oldest_age = g_chan[i].age;
            oldest_i   = i;
        }
    }
    if (oldest_i < 0) oldest_i = 0;  /* fallback extremo: todos son secundarios */
    /* Si el canal robado tenia segunda voz, silenciarla y liberarla */
    if (g_chan[oldest_i].pair >= 0) {
        int sec = g_chan[oldest_i].pair;
        _opl2_write(0xB0 + sec, 0x00);
        g_chan[sec].active       = 0;
        g_chan[sec].is_secondary = 0;
        g_chan[sec].pair         = -1;
    }
    _opl2_write(0xB0 + oldest_i, 0x00);
    g_chan[oldest_i].active = 0;
    g_chan[oldest_i].pair   = -1;
    return oldest_i;
}

/* Reserva un canal libre para la segunda voz 2VOICE excluyendo not_this.
 * Si no hay libre, roba el primario activo mas antiguo (excepto not_this).
 * Devuelve -1 si no es posible asignar. */
static int _opl2_alloc_secondary(int not_this) {
    int i;
    int oldest_i = -1;
    unsigned long oldest_age = 0xFFFFFFFFUL;

    /* Buscar canal libre */
    for (i = 0; i < OPL2_CHANNELS; i++) {
        if (i == not_this) continue;
        if (!g_chan[i].active) return i;
    }
    /* Voice stealing entre primarios (no secundarios, no not_this) */
    for (i = 0; i < OPL2_CHANNELS; i++) {
        if (i == not_this) continue;
        if (g_chan[i].is_secondary) continue;
        if (g_chan[i].age < oldest_age) {
            oldest_age = g_chan[i].age;
            oldest_i   = i;
        }
    }
    if (oldest_i < 0) return -1;
    /* Si el robado tenia pareja, liberarla */
    if (g_chan[oldest_i].pair >= 0) {
        int sec = g_chan[oldest_i].pair;
        _opl2_write(0xB0 + sec, 0x00);
        g_chan[sec].active       = 0;
        g_chan[sec].is_secondary = 0;
        g_chan[sec].pair         = -1;
    }
    _opl2_write(0xB0 + oldest_i, 0x00);
    g_chan[oldest_i].active = 0;
    g_chan[oldest_i].pair   = -1;
    return oldest_i;
}

/* Busca el canal PRIMARIO activo con ese midi_ch y note (ignora secundarios). */
static int _opl2_find_chan(unsigned char midi_ch, unsigned char note) {
    int i;
    for (i = 0; i < OPL2_CHANNELS; i++) {
        if (g_chan[i].active       &&
            !g_chan[i].is_secondary &&
            g_chan[i].midi_ch == midi_ch &&
            g_chan[i].note    == note) return i;
    }
    return -1;
}

/* ------------------------------------------------------------------ */
/* Handlers de eventos MIDI                                             */
/* ------------------------------------------------------------------ */

static void _opl2_note_off(unsigned char midi_ch, unsigned char note) {
    unsigned char fnum_lo, b0_base;
    int opl_ch = _opl2_find_chan(midi_ch, note);
    if (opl_ch < 0) return;
    _opl2_get_freq(note, &fnum_lo, &b0_base);
    _opl2_write(0xB0 + opl_ch, b0_base);   /* Key-On=0 */
    /* Silenciar y liberar segunda voz si existe */
    if (g_chan[opl_ch].pair >= 0) {
        int sec = g_chan[opl_ch].pair;
        _opl2_write(0xB0 + sec, 0x00);
        g_chan[sec].active       = 0;
        g_chan[sec].is_secondary = 0;
        g_chan[sec].pair         = -1;
    }
    g_chan[opl_ch].active = 0;
    g_chan[opl_ch].pair   = -1;
}

static void _opl2_note_on(unsigned char midi_ch, unsigned char note,
                           unsigned char vel) {
    unsigned char fnum_lo, b0_base, play_note;
    int opl_ch;
    const GenmidiInstr* ins;

    if (vel == 0) { _opl2_note_off(midi_ch, note); return; }

    opl_ch = _opl2_alloc_chan();
    g_chan[opl_ch].midi_ch      = midi_ch;
    g_chan[opl_ch].note         = note;
    g_chan[opl_ch].vel          = vel;
    g_chan[opl_ch].active       = 1;
    g_chan[opl_ch].age          = ++g_age_counter;
    g_chan[opl_ch].is_secondary = 0;
    g_chan[opl_ch].pair         = -1;

    /* Aplicar voz 0 del instrumento (modifica play_note si hay offset o fixed) */
    _opl2_apply_patch_v(opl_ch, midi_ch, note, vel, &play_note, 0);

    _opl2_get_freq(play_note, &fnum_lo, &b0_base);
    _opl2_write(0xA0 + opl_ch, fnum_lo);
    _opl2_write(0xB0 + opl_ch, b0_base | 0x20);    /* Key-On voz primaria */

    /* Segunda voz 2VOICE: requiere un canal adicional con patch de voices[1].
     * voices[1].base_note_offset proporciona el detune (chorus) respecto a voices[0]. */
    ins = _opl2_get_instr(midi_ch, note);
    if (ins && (ins->flags & GENMIDI_FLAG_2VOICE)) {
        int sec_ch = _opl2_alloc_secondary(opl_ch);
        if (sec_ch >= 0) {
            unsigned char sec_note;
            g_chan[sec_ch].midi_ch      = midi_ch;
            g_chan[sec_ch].note         = note;
            g_chan[sec_ch].vel          = vel;
            g_chan[sec_ch].active       = 1;
            g_chan[sec_ch].age          = g_chan[opl_ch].age;  /* misma edad que primario */
            g_chan[sec_ch].is_secondary = 1;
            g_chan[sec_ch].pair         = opl_ch;
            g_chan[opl_ch].pair         = sec_ch;

            _opl2_apply_patch_v(sec_ch, midi_ch, note, vel, &sec_note, 1);

            _opl2_get_freq(sec_note, &fnum_lo, &b0_base);
            _opl2_write(0xA0 + sec_ch, fnum_lo);
            _opl2_write(0xB0 + sec_ch, b0_base | 0x20);   /* Key-On voz secundaria */
        }
    }
}

static void _opl2_control_change(unsigned char midi_ch,
                                  unsigned char cc, unsigned char val) {
    int i;
    switch (cc) {
    case 7:     /* CC7: Main Volume */
        g_midi_vol[midi_ch & 0x0F] = val;
        for (i = 0; i < OPL2_CHANNELS; i++) {
            if (g_chan[i].active && g_chan[i].midi_ch == midi_ch)
                _opl2_update_vol(i, midi_ch);
        }
        break;
    case 121:   /* Reset All Controllers */
        g_midi_vol[midi_ch & 0x0F] = 100;
        break;
    case 123:   /* All Notes Off */
        opl2_all_notes_off();
        break;
    default:
        break;
    }
}

static void _opl2_dispatch(unsigned char status,
                            unsigned char d0, unsigned char d1) {
    unsigned char type = status & 0xF0;
    unsigned char ch   = status & 0x0F;

    switch (type) {
    case 0x90: _opl2_note_on(ch, d0, d1);          break;
    case 0x80: _opl2_note_off(ch, d0);             break;
    case 0xB0: _opl2_control_change(ch, d0, d1);   break;
    case 0xC0: /* Program Change: guardar programa del canal */
        g_midi_prog[ch & 0x0F] = d0 & 0x7F;
        break;
    default: break;
    }
}

/* ------------------------------------------------------------------ */
/* API publica                                                          */
/* ------------------------------------------------------------------ */

int opl2_detect(void) {
    unsigned char s1, s2;
    int i;

    outp(OPL2_PORT_ADDR, 0x04); _opl2_delay_addr();
    outp(OPL2_PORT_DATA, 0x60); _opl2_delay_data();
    outp(OPL2_PORT_ADDR, 0x04); _opl2_delay_addr();
    outp(OPL2_PORT_DATA, 0x80); _opl2_delay_data();

    s1 = inp(OPL2_PORT_ADDR) & 0xE0;
    if (s1 != 0x00) return 0;

    outp(OPL2_PORT_ADDR, 0x02); _opl2_delay_addr();
    outp(OPL2_PORT_DATA, 0xFF); _opl2_delay_data();
    outp(OPL2_PORT_ADDR, 0x04); _opl2_delay_addr();
    outp(OPL2_PORT_DATA, 0x21); _opl2_delay_data();

    for (i = 0; i < 100; i++) (void)inp(OPL2_PORT_ADDR);

    s2 = inp(OPL2_PORT_ADDR) & 0xE0;

    outp(OPL2_PORT_ADDR, 0x04); _opl2_delay_addr();
    outp(OPL2_PORT_DATA, 0x60); _opl2_delay_data();
    outp(OPL2_PORT_ADDR, 0x04); _opl2_delay_addr();
    outp(OPL2_PORT_DATA, 0x80); _opl2_delay_data();

    return (s1 == 0x00 && s2 == 0xC0) ? 1 : 0;
}

int opl2_init(void) {
    int i;

    /* Habilitar waveform select (bit5=1, requerido en YM3812) */
    _opl2_write(0x01, 0x20);

    for (i = 0; i < OPL2_CHANNELS; i++) {
        _opl2_write(0xB0 + i, 0x00);
        _opl2_write(0xA0 + i, 0x00);
        g_chan[i].active       = 0;
        g_chan[i].age          = 0;
        g_chan[i].midi_ch      = 0;
        g_chan[i].note         = 0;
        g_chan[i].vel          = 100;
        g_chan[i].is_secondary = 0;
        g_chan[i].pair         = -1;
    }

    for (i = 0; i < 16; i++) {
        g_midi_vol[i]  = 100;
        g_midi_prog[i] = 0;
    }

    g_age_counter     = 0;
    g_ev_status       = 0;
    g_ev_bytes_needed = 0;
    g_ev_bytes_got    = 0;
    g_master_vol      = 100;

    g_opl2_active = 1;
    return 0;
}

void opl2_shutdown(void) {
    opl2_all_notes_off();
    g_opl2_active = 0;
}

void opl2_all_notes_off(void) {
    int i;
    for (i = 0; i < OPL2_CHANNELS; i++) {
        _opl2_write(0xB0 + i, 0x00);
        g_chan[i].active       = 0;
        g_chan[i].is_secondary = 0;
        g_chan[i].pair         = -1;
    }
}

void opl2_set_volume(unsigned char vol) {
    g_master_vol = vol;
}

/*
 * Maquina de estado MIDI: acumula bytes hasta completar un evento.
 * Soporta running status. Firma identica a mpu_send().
 */
void opl2_send(unsigned char b) {
    unsigned char type;

    if (b & 0x80) {
        g_ev_status    = b;
        g_ev_bytes_got = 0;
        type           = b & 0xF0;

        if (type >= 0xF0) { g_ev_bytes_needed = 0; return; }
        switch (type) {
        case 0x80: case 0x90:
        case 0xB0: case 0xA0: case 0xE0:
            g_ev_bytes_needed = 2; break;
        case 0xC0: case 0xD0:
            g_ev_bytes_needed = 1; break;
        default:
            g_ev_bytes_needed = 0; break;
        }
    } else {
        if (g_ev_bytes_needed == 0) return;
        if (g_ev_bytes_got < 2) g_ev_data[g_ev_bytes_got] = b;
        g_ev_bytes_got++;

        if (g_ev_bytes_got >= g_ev_bytes_needed) {
            _opl2_dispatch(g_ev_status, g_ev_data[0], g_ev_data[1]);
            g_ev_bytes_got = 0;
        }
    }
}
