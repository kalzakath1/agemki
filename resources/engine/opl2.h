/*
 * opl2.h -- Driver OPL2 (Yamaha YM3812 / AdLib) para AGEMKI v33+
 *
 * Hardware: Puerto 0x388 (addr) / 0x389 (data), 9 canales melodicos.
 * Compatible con Watcom wcc386 -bt=dos, sin stdlib, sin malloc.
 */
#ifndef OPL2_H
#define OPL2_H

#define OPL2_PORT_ADDR  0x388
#define OPL2_PORT_DATA  0x389

/* Devuelve 1 si detecta YM3812 en puerto 0x388, 0 si no. No modifica estado. */
int  opl2_detect(void);

/* Inicializa hardware y estado interno. Llama solo tras detect()==1.
 * Pone g_opl2_active=1. Devuelve 0 en exito, -1 en error. */
int  opl2_init(void);

/* Silencia todo y marca g_opl2_active=0. */
void opl2_shutdown(void);

/* Silencia los 9 canales OPL2. Firma compatible con mpu_all_notes_off(). */
void opl2_all_notes_off(void);

/* Acumula bytes MIDI y dispara escrituras OPL2 cuando el evento esta completo.
 * Firma compatible con mpu_send() para usar con midi_set_output(). */
void opl2_send(unsigned char b);

/* Volumen master 0-127 (127=maximo). */
void opl2_set_volume(unsigned char vol);

/* 1 cuando el driver esta activo, 0 en caso contrario. */
extern int g_opl2_active;

#endif /* OPL2_H */
