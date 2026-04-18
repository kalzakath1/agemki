/*
 * opl3.c -- Driver OPL3 (Yamaha YMF262 / Sound Blaster 16) para AGEMKI v33+
 *
 * Arquitectura:
 *   midi_tick() -> opl3_send() -> maquina de estado -> _opl3_dispatch()
 *   -> note_on/note_off/cc/program_change -> escrituras a 0x388-0x38B
 *
 * Diferencias respecto a OPL2:
 *   - 2 bancos de registros (banco0=0x388/389, banco1=0x38A/38B)
 *   - 18 canales melodicos (9 por banco)
 *   - Modo OPL3: banco1 reg 0x05 = 0x01 (habilita nuevas funciones)
 *   - Estereo: reg 0xC0+ch bits 5:4 = 0x30 (L+R habilitados)
 *   - Waveforms: 3 bits (8 ondas) en vez de 2
 *   - Instrumentos: banco GENMIDI.OP2 (misma logica que opl2.c)
 *
 * Restricciones: sin malloc, sin stdlib, wcc386 -bt=dos -6r -ox
 */
#include <conio.h>
#include "opl3.h"
#include "opl_patches.h"

int g_opl3_active = 0;

/* ------------------------------------------------------------------ */
/* Tablas                                                               */
/* ------------------------------------------------------------------ */

static const unsigned short g_fnum[12] = {
    0x157, 0x16B, 0x181, 0x198, 0x1B0, 0x1CA,
    0x1E5, 0x202, 0x220, 0x241, 0x263, 0x287
};

/* Offsets de operador por canal local (identicos a OPL2 por banco) */
static const unsigned char g_mod_off[9] = {
    0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x10, 0x11, 0x12
};
static const unsigned char g_car_off[9] = {
    0x03, 0x04, 0x05, 0x0B, 0x0C, 0x0D, 0x13, 0x14, 0x15
};

/* ------------------------------------------------------------------ */
/* Estado interno                                                       */
/* ------------------------------------------------------------------ */

#define MIDI_PERC_CH  9

typedef struct {
    unsigned char midi_ch;
    unsigned char note;
    unsigned char vel;
    unsigned char active;
    unsigned long age;
    unsigned char is_secondary; /* 1 = canal secundario 2VOICE (no robar directamente) */
    int           pair;         /* indice del canal pareja, -1 = sin pareja */
} OplChan;

static OplChan        g_chan[OPL3_CHANNELS];
static unsigned long  g_age_counter = 0;
static unsigned char  g_midi_vol[16];    /* volumen por canal MIDI 0-127 */
static unsigned char  g_midi_prog[16];   /* programa actual por canal    */
static unsigned char  g_master_vol = 100;

/* Maquina de estado para opl3_send() */
static unsigned char  g_ev_status       = 0;
static unsigned char  g_ev_data[2];
static int            g_ev_bytes_needed = 0;
static int            g_ev_bytes_got    = 0;

/* ------------------------------------------------------------------ */
/* I/O helpers                                                          */
/* ------------------------------------------------------------------ */

static void _opl3_delay_addr(int bank) {
    unsigned port = (bank == 0) ? OPL3_PORT_ADDR0 : OPL3_PORT_ADDR1;
    (void)inp(port); (void)inp(port); (void)inp(port);
    (void)inp(port); (void)inp(port); (void)inp(port);
}

static void _opl3_delay_data(int bank) {
    unsigned port = (bank == 0) ? OPL3_PORT_ADDR0 : OPL3_PORT_ADDR1;
    int i;
    for (i = 0; i < 36; i++) (void)inp(port);
}

static void _opl3_write(int bank, unsigned char reg, unsigned char val) {
    unsigned ap = (bank == 0) ? OPL3_PORT_ADDR0 : OPL3_PORT_ADDR1;
    unsigned dp = (bank == 0) ? OPL3_PORT_DATA0 : OPL3_PORT_DATA1;
    outp(ap, reg);  _opl3_delay_addr(bank);
    outp(dp, val);  _opl3_delay_data(bank);
}

static void _opl3_w0(unsigned char reg, unsigned char val) { _opl3_write(0, reg, val); }
static void _opl3_w1(unsigned char reg, unsigned char val) { _opl3_write(1, reg, val); }

static int  _opl3_bank(int ch) { return (ch < 9) ? 0 : 1; }
static int  _opl3_lch (int ch) { return (ch < 9) ? ch : ch - 9; }

static void _opl3_wch(int ch, unsigned char reg_base, unsigned char val) {
    _opl3_write(_opl3_bank(ch), reg_base + (unsigned char)_opl3_lch(ch), val);
}

/* ------------------------------------------------------------------ */
/* Calculo de frecuencia                                               */
/* ------------------------------------------------------------------ */

static void _opl3_get_freq(unsigned char note,
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

static unsigned char _opl3_scale_tl(unsigned char patch_ksl_output,
                                     unsigned char midi_ch,
                                     unsigned char vel) {
    unsigned char ksl     = patch_ksl_output & 0xC0;
    unsigned char base_tl = patch_ksl_output & 0x3F;
    unsigned long eff_vol = ((unsigned long)g_midi_vol[midi_ch & 0x0F] *
                              (unsigned long)g_master_vol) / 127UL;
    eff_vol = (eff_vol * (unsigned long)vel) / 127UL;
    { unsigned int tl = (unsigned int)base_tl +
                        ((unsigned int)(63 - base_tl) * (127U - (unsigned int)eff_vol)) / 127U;
      if (tl > 63) tl = 63;
      return ksl | (unsigned char)tl; }
}

static unsigned char _opl3_vol_to_tl(unsigned char midi_ch, unsigned char vel) {
    unsigned long eff = ((unsigned long)g_midi_vol[midi_ch & 0x0F] *
                         (unsigned long)g_master_vol) / 127UL;
    eff = (eff * (unsigned long)vel) / 127UL;
    if (eff == 0) return 63;
    return (unsigned char)(63 - ((unsigned int)eff * 63U) / 127U);
}

/* ------------------------------------------------------------------ */
/* Aplicar patch del banco de instrumentos                             */
/* ------------------------------------------------------------------ */

static const GenmidiInstr* _opl3_get_instr(unsigned char midi_ch,
                                            unsigned char note) {
    int prog;
    if (!g_genmidi_loaded) return 0;

    if ((midi_ch & 0x0F) == MIDI_PERC_CH) {
        prog = GENMIDI_NUM_MELODIC + ((int)note - GENMIDI_PERC_BASE);
        if (prog < GENMIDI_NUM_MELODIC) prog = GENMIDI_NUM_MELODIC;
        if (prog >= GENMIDI_TOTAL)      prog = GENMIDI_TOTAL - 1;
    } else {
        prog = g_midi_prog[midi_ch & 0x0F];
        if (prog >= GENMIDI_NUM_MELODIC) prog = 0;
    }
    return &g_genmidi[prog];
}

/* Aplica el patch de una voz especifica del instrumento en el canal OPL3 dado.
 * voice_idx: 0 = voz primaria, 1 = voz secundaria (2VOICE). */
static void _opl3_apply_patch_v(int opl_ch, unsigned char midi_ch,
                                 unsigned char note, unsigned char vel,
                                 unsigned char *note_out, int voice_idx) {
    int   bank = _opl3_bank(opl_ch);
    int   lc   = _opl3_lch(opl_ch);
    unsigned char mod = g_mod_off[lc];
    unsigned char car = g_car_off[lc];
    const GenmidiInstr* ins = _opl3_get_instr(midi_ch, note);
    int vi = (voice_idx == 1) ? 1 : 0;

    if (note_out) *note_out = note;

    if (ins) {
        const GenmidiVoice* v = &ins->voices[vi];
        int adj_note;

        /* Nota ajustada con el base_note_offset de la voz seleccionada */
        adj_note = (int)note + (int)v->base_note_offset;
        if (adj_note < 0)   adj_note = 0;
        if (adj_note > 127) adj_note = 127;
        if (note_out) *note_out = (unsigned char)adj_note;
        if ((ins->flags & GENMIDI_FLAG_FIXED) && note_out)
            *note_out = ins->fixed_note;

        /* Modulator: TL escalado solo en modo aditivo (con=1) */
        _opl3_write(bank, 0x20 + mod, v->modulator.tremolo_vibrato);
        _opl3_write(bank, 0x40 + mod, (v->feedback & 0x01)
                                       ? _opl3_scale_tl(v->modulator.ksl_output, midi_ch, vel)
                                       : v->modulator.ksl_output);
        _opl3_write(bank, 0x60 + mod, v->modulator.attack_decay);
        _opl3_write(bank, 0x80 + mod, v->modulator.sustain_release);
        _opl3_write(bank, 0xE0 + mod, v->modulator.waveform & 0x07);  /* OPL3: 3 bits */

        /* Carrier: TL escalado por volumen + velocity */
        _opl3_write(bank, 0x20 + car, v->carrier.tremolo_vibrato);
        _opl3_write(bank, 0x40 + car, _opl3_scale_tl(v->carrier.ksl_output, midi_ch, vel));
        _opl3_write(bank, 0x60 + car, v->carrier.attack_decay);
        _opl3_write(bank, 0x80 + car, v->carrier.sustain_release);
        _opl3_write(bank, 0xE0 + car, v->carrier.waveform & 0x07);

        /* Canal: feedback del instrumento + estereo L+R (bits 5:4 = 0x30) */
        _opl3_write(bank, 0xC0 + lc, (v->feedback & 0x0F) | 0x30);
    } else {
        /* Fallback: patch minimo — solo relevante para voz 0 */
        _opl3_write(bank, 0x20 + mod, 0x01);
        _opl3_write(bank, 0x40 + mod, 0x20);
        _opl3_write(bank, 0x60 + mod, 0xF0);
        _opl3_write(bank, 0x80 + mod, 0x77);
        _opl3_write(bank, 0xE0 + mod, 0x00);

        _opl3_write(bank, 0x20 + car, 0x01);
        _opl3_write(bank, 0x40 + car, _opl3_vol_to_tl(midi_ch, vel));
        _opl3_write(bank, 0x60 + car, 0xF0);
        _opl3_write(bank, 0x80 + car, 0x77);
        _opl3_write(bank, 0xE0 + car, 0x00);

        _opl3_write(bank, 0xC0 + lc, 0x30);
    }
}

/* Actualiza TL del canal activo ante cambios de volumen CC7.
 * Si tiene segunda voz emparejada, la actualiza tambien. */
static void _opl3_update_vol(int opl_ch, unsigned char midi_ch) {
    int   bank = _opl3_bank(opl_ch);
    int   lc   = _opl3_lch(opl_ch);
    const GenmidiInstr* ins = _opl3_get_instr(midi_ch, g_chan[opl_ch].note);
    unsigned char vel = g_chan[opl_ch].vel;

    if (ins) {
        const GenmidiVoice* v = &ins->voices[0];
        if (v->feedback & 0x01)
            _opl3_write(bank, 0x40 + g_mod_off[lc],
                        _opl3_scale_tl(v->modulator.ksl_output, midi_ch, vel));
        _opl3_write(bank, 0x40 + g_car_off[lc],
                    _opl3_scale_tl(v->carrier.ksl_output, midi_ch, vel));
        /* Actualizar TL de la segunda voz si existe */
        if (g_chan[opl_ch].pair >= 0) {
            int sec = g_chan[opl_ch].pair;
            int   bank2 = _opl3_bank(sec);
            int   lc2   = _opl3_lch(sec);
            const GenmidiVoice* v2 = &ins->voices[1];
            if (v2->feedback & 0x01)
                _opl3_write(bank2, 0x40 + g_mod_off[lc2],
                            _opl3_scale_tl(v2->modulator.ksl_output, midi_ch, vel));
            _opl3_write(bank2, 0x40 + g_car_off[lc2],
                        _opl3_scale_tl(v2->carrier.ksl_output, midi_ch, vel));
        }
    } else {
        _opl3_write(bank, 0x40 + g_car_off[lc], _opl3_vol_to_tl(midi_ch, vel));
    }
}

/* ------------------------------------------------------------------ */
/* Voice allocation (18 canales)                                        */
/* ------------------------------------------------------------------ */

static int _opl3_alloc_chan(void) {
    int i;
    int oldest_i = -1;
    unsigned long oldest_age = 0xFFFFFFFFUL;

    /* Canal libre */
    for (i = 0; i < OPL3_CHANNELS; i++) {
        if (!g_chan[i].active) return i;
    }
    /* Voice stealing: no robar secundarios directamente */
    for (i = 0; i < OPL3_CHANNELS; i++) {
        if (g_chan[i].is_secondary) continue;
        if (g_chan[i].age < oldest_age) {
            oldest_age = g_chan[i].age;
            oldest_i   = i;
        }
    }
    if (oldest_i < 0) oldest_i = 0;
    /* Liberar secundario emparejado si existe */
    if (g_chan[oldest_i].pair >= 0) {
        int sec = g_chan[oldest_i].pair;
        _opl3_wch(sec, 0xB0, 0x00);
        g_chan[sec].active       = 0;
        g_chan[sec].is_secondary = 0;
        g_chan[sec].pair         = -1;
    }
    _opl3_wch(oldest_i, 0xB0, 0x00);
    g_chan[oldest_i].active = 0;
    g_chan[oldest_i].pair   = -1;
    return oldest_i;
}

/* Reserva un canal libre para la segunda voz 2VOICE excluyendo not_this. */
static int _opl3_alloc_secondary(int not_this) {
    int i;
    int oldest_i = -1;
    unsigned long oldest_age = 0xFFFFFFFFUL;

    for (i = 0; i < OPL3_CHANNELS; i++) {
        if (i == not_this) continue;
        if (!g_chan[i].active) return i;
    }
    for (i = 0; i < OPL3_CHANNELS; i++) {
        if (i == not_this) continue;
        if (g_chan[i].is_secondary) continue;
        if (g_chan[i].age < oldest_age) {
            oldest_age = g_chan[i].age;
            oldest_i   = i;
        }
    }
    if (oldest_i < 0) return -1;
    if (g_chan[oldest_i].pair >= 0) {
        int sec = g_chan[oldest_i].pair;
        _opl3_wch(sec, 0xB0, 0x00);
        g_chan[sec].active       = 0;
        g_chan[sec].is_secondary = 0;
        g_chan[sec].pair         = -1;
    }
    _opl3_wch(oldest_i, 0xB0, 0x00);
    g_chan[oldest_i].active = 0;
    g_chan[oldest_i].pair   = -1;
    return oldest_i;
}

/* Busca el canal PRIMARIO activo con ese midi_ch y note (ignora secundarios). */
static int _opl3_find_chan(unsigned char midi_ch, unsigned char note) {
    int i;
    for (i = 0; i < OPL3_CHANNELS; i++) {
        if (g_chan[i].active        &&
            !g_chan[i].is_secondary  &&
            g_chan[i].midi_ch == midi_ch &&
            g_chan[i].note    == note) return i;
    }
    return -1;
}

/* ------------------------------------------------------------------ */
/* Handlers de eventos MIDI                                             */
/* ------------------------------------------------------------------ */

static void _opl3_note_off(unsigned char midi_ch, unsigned char note) {
    unsigned char fnum_lo, b0_base;
    int opl_ch = _opl3_find_chan(midi_ch, note);
    if (opl_ch < 0) return;
    _opl3_get_freq(note, &fnum_lo, &b0_base);
    _opl3_wch(opl_ch, 0xB0, b0_base);   /* Key-On=0 */
    /* Silenciar y liberar segunda voz si existe */
    if (g_chan[opl_ch].pair >= 0) {
        int sec = g_chan[opl_ch].pair;
        _opl3_wch(sec, 0xB0, 0x00);
        g_chan[sec].active       = 0;
        g_chan[sec].is_secondary = 0;
        g_chan[sec].pair         = -1;
    }
    g_chan[opl_ch].active = 0;
    g_chan[opl_ch].pair   = -1;
}

static void _opl3_note_on(unsigned char midi_ch, unsigned char note,
                           unsigned char vel) {
    unsigned char fnum_lo, b0_base, play_note;
    int opl_ch;
    const GenmidiInstr* ins;

    if (vel == 0) { _opl3_note_off(midi_ch, note); return; }

    opl_ch = _opl3_alloc_chan();
    g_chan[opl_ch].midi_ch      = midi_ch;
    g_chan[opl_ch].note         = note;
    g_chan[opl_ch].vel          = vel;
    g_chan[opl_ch].active       = 1;
    g_chan[opl_ch].age          = ++g_age_counter;
    g_chan[opl_ch].is_secondary = 0;
    g_chan[opl_ch].pair         = -1;

    /* Aplicar voz 0 del instrumento */
    _opl3_apply_patch_v(opl_ch, midi_ch, note, vel, &play_note, 0);

    _opl3_get_freq(play_note, &fnum_lo, &b0_base);
    _opl3_wch(opl_ch, 0xA0, fnum_lo);
    _opl3_wch(opl_ch, 0xB0, b0_base | 0x20);    /* Key-On voz primaria */

    /* Segunda voz 2VOICE: voices[1].base_note_offset da el detune (chorus). */
    ins = _opl3_get_instr(midi_ch, note);
    if (ins && (ins->flags & GENMIDI_FLAG_2VOICE)) {
        int sec_ch = _opl3_alloc_secondary(opl_ch);
        if (sec_ch >= 0) {
            unsigned char sec_note;
            g_chan[sec_ch].midi_ch      = midi_ch;
            g_chan[sec_ch].note         = note;
            g_chan[sec_ch].vel          = vel;
            g_chan[sec_ch].active       = 1;
            g_chan[sec_ch].age          = g_chan[opl_ch].age;
            g_chan[sec_ch].is_secondary = 1;
            g_chan[sec_ch].pair         = opl_ch;
            g_chan[opl_ch].pair         = sec_ch;

            _opl3_apply_patch_v(sec_ch, midi_ch, note, vel, &sec_note, 1);

            _opl3_get_freq(sec_note, &fnum_lo, &b0_base);
            _opl3_wch(sec_ch, 0xA0, fnum_lo);
            _opl3_wch(sec_ch, 0xB0, b0_base | 0x20);  /* Key-On voz secundaria */
        }
    }
}

static void _opl3_control_change(unsigned char midi_ch,
                                  unsigned char cc, unsigned char val) {
    int i;
    switch (cc) {
    case 7:
        g_midi_vol[midi_ch & 0x0F] = val;
        for (i = 0; i < OPL3_CHANNELS; i++) {
            if (g_chan[i].active && g_chan[i].midi_ch == midi_ch)
                _opl3_update_vol(i, midi_ch);
        }
        break;
    case 121:
        g_midi_vol[midi_ch & 0x0F] = 100;
        break;
    case 123:
        opl3_all_notes_off();
        break;
    default:
        break;
    }
}

static void _opl3_dispatch(unsigned char status,
                            unsigned char d0, unsigned char d1) {
    unsigned char type = status & 0xF0;
    unsigned char ch   = status & 0x0F;

    switch (type) {
    case 0x90: _opl3_note_on(ch, d0, d1);          break;
    case 0x80: _opl3_note_off(ch, d0);             break;
    case 0xB0: _opl3_control_change(ch, d0, d1);   break;
    case 0xC0: /* Program Change */
        g_midi_prog[ch & 0x0F] = d0 & 0x7F;
        break;
    default: break;
    }
}

/* ------------------------------------------------------------------ */
/* API publica                                                          */
/* ------------------------------------------------------------------ */

int opl3_detect(void) {
    unsigned char s1, s2;
    int i;

    outp(OPL3_PORT_ADDR0, 0x04); _opl3_delay_addr(0);
    outp(OPL3_PORT_DATA0, 0x60); _opl3_delay_data(0);
    outp(OPL3_PORT_ADDR0, 0x04); _opl3_delay_addr(0);
    outp(OPL3_PORT_DATA0, 0x80); _opl3_delay_data(0);

    s1 = inp(OPL3_PORT_ADDR0) & 0xE0;
    if (s1 != 0x00) return 0;

    outp(OPL3_PORT_ADDR0, 0x02); _opl3_delay_addr(0);
    outp(OPL3_PORT_DATA0, 0xFF); _opl3_delay_data(0);
    outp(OPL3_PORT_ADDR0, 0x04); _opl3_delay_addr(0);
    outp(OPL3_PORT_DATA0, 0x21); _opl3_delay_data(0);

    for (i = 0; i < 100; i++) (void)inp(OPL3_PORT_ADDR0);

    s2 = inp(OPL3_PORT_ADDR0) & 0xE0;

    outp(OPL3_PORT_ADDR0, 0x04); _opl3_delay_addr(0);
    outp(OPL3_PORT_DATA0, 0x60); _opl3_delay_data(0);
    outp(OPL3_PORT_ADDR0, 0x04); _opl3_delay_addr(0);
    outp(OPL3_PORT_DATA0, 0x80); _opl3_delay_data(0);

    if (s1 != 0x00 || s2 != 0xC0) return 0;

    /* Distinguir OPL3 (YMF262) de OPL2 (YM3812):
     * Tras reset completo, YM3812 deja bits [2:1] a 1 (0x06).
     * YMF262 deja todos los bits de reserva a 0.
     * DOSBox emula este comportamiento: adlib→0x06, sb16→0x00. */
    { unsigned char s3 = inp(OPL3_PORT_ADDR0) & 0x06;
      if (s3 != 0x00) return 0; }

    return 1;
}

int opl3_init(void) {
    int i;

    /* Habilitar modo OPL3: banco1 reg 0x05 = 0x01 */
    _opl3_w1(0x05, 0x01);
    /* Habilitar waveform select: banco0 reg 0x01 = 0x20 */
    _opl3_w0(0x01, 0x20);

    for (i = 0; i < OPL3_CHANNELS; i++) {
        int bank = _opl3_bank(i);
        int lc   = _opl3_lch(i);
        _opl3_write(bank, 0xB0 + lc, 0x00);
        _opl3_write(bank, 0xA0 + lc, 0x00);
        _opl3_write(bank, 0xC0 + lc, 0x30);   /* estereo L+R */
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

    g_opl3_active = 1;
    return 0;
}

void opl3_shutdown(void) {
    opl3_all_notes_off();
    _opl3_w1(0x05, 0x00);   /* deshabilitar modo OPL3 */
    g_opl3_active = 0;
}

void opl3_all_notes_off(void) {
    int i;
    for (i = 0; i < OPL3_CHANNELS; i++) {
        _opl3_wch(i, 0xB0, 0x00);
        g_chan[i].active       = 0;
        g_chan[i].is_secondary = 0;
        g_chan[i].pair         = -1;
    }
}

void opl3_set_volume(unsigned char vol) {
    g_master_vol = vol;
}

void opl3_send(unsigned char b) {
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
            _opl3_dispatch(g_ev_status, g_ev_data[0], g_ev_data[1]);
            g_ev_bytes_got = 0;
        }
    }
}
