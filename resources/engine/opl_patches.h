/*
 * opl_patches.h -- Banco de instrumentos GM en formato GENMIDI.OP2 (Doom/DMX)
 *
 * El formato OP2 define 175 instrumentos (128 melodicos + 47 de percusion)
 * con los parametros FM completos para OPL2/OPL3.
 * Compatible con GENMIDI.OP2 de Doom/Freedoom.
 *
 * Referencia: Doom source, genmidi.h (id Software / GPL)
 */
#ifndef OPL_PATCHES_H
#define OPL_PATCHES_H

/* ---- Constantes del formato ---- */
#define GENMIDI_HEADER      "#OPL_II#"  /* 8 bytes, cabecera del fichero */
#define GENMIDI_NUM_MELODIC  128        /* instrumentos melodicos (prog 0-127) */
#define GENMIDI_NUM_PERC      47        /* instrumentos de percusion           */
#define GENMIDI_TOTAL        175        /* total instrumentos en el fichero    */
#define GENMIDI_PERC_BASE     35        /* nota MIDI de inicio de percusion    */

/* Flags de instrumento */
#define GENMIDI_FLAG_FIXED   0x01   /* usar fixed_note en vez de la nota MIDI */
#define GENMIDI_FLAG_2VOICE  0x02   /* instrumento de 2 voces OPL (no usamos) */

/*
 * Datos de un operador OPL (6 bytes en disco, formato Doom/DMX).
 * En el fichero OP2, KSL y TL van como bytes separados; al parsear
 * se combinan en ksl_output = (ksl << 6) | tl para uso directo en reg 0x40.
 *   byte 0 → reg 0x20: tremolo_vibrato (AM,VIB,EGT,KSR,MULT)
 *   byte 1 → reg 0x60: attack_decay
 *   byte 2 → reg 0x80: sustain_release
 *   byte 3 → reg 0xE0: waveform
 *   byte 4 → KSL (0-3, bits 7:6 de reg 0x40)
 *   byte 5 → TL  (0-63, bits 5:0 de reg 0x40)
 *   combinados → ksl_output = reg 0x40
 */
typedef struct {
    unsigned char tremolo_vibrato;  /* reg 0x20+op: AM,VIB,EGT,KSR,MULT */
    unsigned char attack_decay;     /* reg 0x60+op: Attack, Decay        */
    unsigned char sustain_release;  /* reg 0x80+op: Sustain, Release     */
    unsigned char waveform;         /* reg 0xE0+op: waveform (0-7 OPL3)  */
    unsigned char ksl_output;       /* reg 0x40+op: KSL(7:6), TL(5:0)   */
} GenmidiOp;  /* 5 bytes en memoria; 6 bytes en disco */

/*
 * Una voz del instrumento (16 bytes en disco).
 * Un instrumento OPL2 tiene 1 voz; OPL3 puede tener 2 (flag GENMIDI_FLAG_2VOICE).
 */
typedef struct {
    GenmidiOp    modulator;         /* operador modulador (6 bytes disco) */
    unsigned char feedback;         /* reg 0xC0: fb[3:1]+con[0]           */
    GenmidiOp    carrier;           /* operador carrier   (6 bytes disco) */
    unsigned char unused;           /* padding                            */
    short        base_note_offset;  /* semitono de afinacion              */
} GenmidiVoice;  /* 16 bytes en disco */

/*
 * Un instrumento completo (36 bytes en disco).
 */
typedef struct {
    unsigned short flags;       /* GENMIDI_FLAG_FIXED | GENMIDI_FLAG_2VOICE */
    unsigned char  fine_tuning; /* afinacion fina (no usamos)               */
    unsigned char  fixed_note;  /* nota fija (usada si GENMIDI_FLAG_FIXED)  */
    GenmidiVoice   voices[2];   /* voz 0 siempre presente; voz 1 opcional   */
} GenmidiInstr;  /* 36 bytes en disco */

/* ---- API publica ---- */

/*
 * Carga GENMIDI.OP2 desde un fichero.
 * filename: ruta al fichero (p.ej. "GENMIDI.OP2")
 * Devuelve 1 si cargado OK, 0 si no (usa fallback minimo).
 */
int opl_patches_load(const char* filename);

/* 1 si el banco esta cargado, 0 si se usa el patch minimo por defecto. */
extern int g_genmidi_loaded;

/* Banco de instrumentos: 175 entradas (melodicos 0-127 + percusion 128-174). */
extern GenmidiInstr g_genmidi[GENMIDI_TOTAL];

#endif /* OPL_PATCHES_H */
