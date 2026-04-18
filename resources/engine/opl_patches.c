/*
 * opl_patches.c -- Carga del banco de instrumentos GENMIDI.OP2
 *
 * GENMIDI.OP2 es el fichero de patches FM de Doom (DMX sound library).
 * Formato: cabecera "#OPL_II#" + 175 instrumentos de 32 bytes cada uno.
 * El fichero libre es el de Freedoom (GPL): https://github.com/freedoom/freedoom
 * Tambien sirve el GENMIDI.OP2 de cualquier instalacion de Doom.
 *
 * Sin malloc: la lectura es directa a g_genmidi[] (estatico, 5600 bytes).
 * Compatible con wcc386 -bt=dos.
 */
#include <stdio.h>
#include <string.h>
#include "opl_patches.h"

/* Banco global compartido entre opl2.c y opl3.c */
int          g_genmidi_loaded = 0;
GenmidiInstr g_genmidi[GENMIDI_TOTAL];

/*
 * Lee un short en little-endian desde dos bytes consecutivos.
 * Necesario porque Watcom puede generar lecturas no alineadas con -6r.
 */
static short _read_le16s(const unsigned char* p) {
    return (short)((unsigned short)p[0] | ((unsigned short)p[1] << 8));
}

static unsigned short _read_le16u(const unsigned char* p) {
    return (unsigned short)p[0] | ((unsigned short)p[1] << 8);
}

/*
 * Parsea un bloque de 6 bytes del disco en un GenmidiOp.
 * Orden en disco (formato Doom/DMX):
 *   [0] tremolo_vibrato → reg 0x20 (AM,VIB,EGT,KSR,MULT)
 *   [1] attack_decay    → reg 0x60 (AR nibble alto, DR nibble bajo)
 *   [2] sustain_release → reg 0x80 (SL nibble alto, RR nibble bajo)
 *   [3] waveform        → reg 0xE0 (WS, 2 bits OPL2 / 3 bits OPL3)
 *   [4] ksl             → bits 7:6 de reg 0x40 (Key Scaling Level, 0-3)
 *   [5] level           → bits 5:0 de reg 0x40 (Total Level = atenuacion, 0-63)
 * Combinados: reg 0x40 = (ksl << 6) | level
 */
static void _parse_op(GenmidiOp* op, const unsigned char* raw) {
    op->tremolo_vibrato  = raw[0];
    op->attack_decay     = raw[1];
    op->sustain_release  = raw[2];
    op->waveform         = raw[3];
    op->ksl_output       = (unsigned char)(((raw[4] & 0x03) << 6) | (raw[5] & 0x3F));
}

/*
 * Carga GENMIDI.OP2.
 * Formato:
 *   [0..7]   cabecera "#OPL_II#"
 *   [8..N]   175 instrumentos x 36 bytes:
 *              [0..1]   flags (LE)
 *              [2]      fine_tuning
 *              [3]      fixed_note
 *              [4..19]  voz 0: mod(6) + feedback(1) + car(6) + unused(1) + offset(2)
 *              [20..35] voz 1: igual
 */
int opl_patches_load(const char* filename) {
    FILE* f;
    char  header[8];
    unsigned char buf[36];
    int i;

    g_genmidi_loaded = 0;

    if (!filename || !filename[0]) return 0;

    f = fopen(filename, "rb");
    if (!f) return 0;

    /* Verificar cabecera */
    if (fread(header, 1, 8, f) != 8 || memcmp(header, GENMIDI_HEADER, 8) != 0) {
        fclose(f);
        return 0;
    }

    /* Leer los 175 instrumentos.
     * Cada instrumento ocupa 36 bytes en disco:
     *   [0..3]   cabecera: flags(2), fine_tuning(1), fixed_note(1)
     *   [4..19]  voz 0: mod(6)+feedback(1)+car(6)+unused(1)+offset(2) = 16 bytes
     *   [20..35] voz 1: igual, 16 bytes
     */
    for (i = 0; i < GENMIDI_TOTAL; i++) {
        GenmidiInstr* ins = &g_genmidi[i];

        if (fread(buf, 1, 36, f) != 36) break;

        /* Cabecera del instrumento */
        ins->flags       = _read_le16u(buf + 0);
        ins->fine_tuning = buf[2];
        ins->fixed_note  = buf[3];

        /* Voz 0 (offset 4..19) */
        _parse_op(&ins->voices[0].modulator, buf + 4);   /* buf[4..9]  */
        ins->voices[0].feedback         = buf[10];
        _parse_op(&ins->voices[0].carrier, buf + 11);    /* buf[11..16] */
        ins->voices[0].unused           = buf[17];
        ins->voices[0].base_note_offset = _read_le16s(buf + 18);

        /* Voz 1 (offset 20..35) */
        _parse_op(&ins->voices[1].modulator, buf + 20);  /* buf[20..25] */
        ins->voices[1].feedback         = buf[26];
        _parse_op(&ins->voices[1].carrier, buf + 27);    /* buf[27..32] */
        ins->voices[1].unused           = buf[33];
        ins->voices[1].base_note_offset = _read_le16s(buf + 34);
    }

    fclose(f);

    if (i < GENMIDI_TOTAL) return 0;   /* fichero truncado */

    g_genmidi_loaded = 1;
    return 1;
}
