/*
 * opl3.h -- Driver OPL3 (Yamaha YMF262 / Sound Blaster 16) para AGEMKI v33+
 *
 * Hardware: dos bancos de registros en puertos 0x388-0x38B.
 *   Banco 0 (canales 0-8 ): addr=0x388  data=0x389
 *   Banco 1 (canales 9-17): addr=0x38A  data=0x38B
 * 18 canales melodicos en modo OPL3 estereo.
 * Compatible con Watcom wcc386 -bt=dos, sin stdlib, sin malloc.
 */
#ifndef OPL3_H
#define OPL3_H

/* Puertos hardware */
#define OPL3_PORT_ADDR0  0x388   /* banco 0: escritura de registro */
#define OPL3_PORT_DATA0  0x389   /* banco 0: escritura de dato     */
#define OPL3_PORT_ADDR1  0x38A   /* banco 1: escritura de registro */
#define OPL3_PORT_DATA1  0x38B   /* banco 1: escritura de dato     */

/* Numero de canales OPL3 (9 por banco x 2 bancos) */
#define OPL3_CHANNELS    18

/* Devuelve 1 si detecta YMF262 en 0x388-0x38B, 0 si no.
 * No modifica estado del chip. */
int  opl3_detect(void);

/* Inicializa hardware: habilita modo OPL3, pone 18 canales en silencio.
 * Llamar solo tras opl3_detect()==1.
 * Devuelve 0 en exito, -1 en error. */
int  opl3_init(void);

/* Silencia los 18 canales y marca g_opl3_active=0. */
void opl3_shutdown(void);

/* Key-Off en los 18 canales. Firma compatible con mpu_all_notes_off(). */
void opl3_all_notes_off(void);

/* Acumula bytes MIDI y dispara escrituras OPL3 cuando el evento esta completo.
 * Firma compatible con mpu_send() para usar con midi_set_output(). */
void opl3_send(unsigned char b);

/* Volumen master 0-127 (127=maximo). */
void opl3_set_volume(unsigned char vol);

/* 1 cuando el driver esta activo, 0 en caso contrario. */
extern int g_opl3_active;

#endif /* OPL3_H */
