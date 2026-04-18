/*
 * midi.h — Secuenciador MIDI interno
 */
#ifndef MIDI_H
#define MIDI_H

/* Tamaño maximo de un fichero MIDI en RAM (64KB) */
#define MIDI_MAX_SIZE  65536UL

int  midi_load      (const unsigned char *buf, unsigned long size);
void midi_play      (void);
void midi_stop      (void);
void midi_pause     (void);
int  midi_is_playing(void);
int  midi_is_paused (void);
void midi_set_loop  (int loop);
void midi_set_volume(unsigned char vol);

/*
 * midi_tick(us_elapsed):
 * Llamar desde IRQ0 con los microsegundos transcurridos.
 * CRITICO: debe ser rapido — sin llamadas a DOS, sin malloc.
 */
void midi_tick(unsigned long us_elapsed);
int  midi_load_xmi(const unsigned char *xmi, unsigned long size);

/*
 * midi_set_output(send_fn, notes_off_fn):
 * Redirige la salida MIDI a un driver distinto de MPU-401.
 * send_fn      -- sustituye a mpu_send()
 * notes_off_fn -- sustituye a mpu_all_notes_off()
 * Pasar NULL en cualquier argumento restaura el default (MPU-401).
 */
void midi_set_output(void (*send_fn)(unsigned char),
                     void (*notes_off_fn)(void));

/* midi_rewind: re-parsea el buffer ya cargado sin reproducir.
 * midi_replay: rebobina y reproduce desde el principio.
 * Retornan 0 en exito, -1 si no hay buffer cargado. */
int  midi_rewind(void);
int  midi_replay(void);

#endif
