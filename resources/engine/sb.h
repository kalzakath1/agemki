/*
 * sb.h — Driver Sound Blaster para SFX PCM (8-bit DMA)
 *
 * Deteccion via variable BLASTER o sondeo directo del puerto 0x220.
 * Reproduce PCM 8-bit unsigned mono via DMA canal 1 (SB estandar).
 * Coexiste con mididrv (musica) sin conflicto.
 *
 * Restricciones: sin malloc en runtime, wcc386 -bt=dos
 */
#ifndef SB_H
#define SB_H

/* Tamano del buffer DMA interno: ~3 segundos a 11025 Hz */
#define SB_DMA_BUF_SIZE  32768U

int  sb_detect(void);   /* 1 si hay SB, 0 si no */
int  sb_init(void);     /* 0 = OK, -1 = error    */
void sb_shutdown(void);

/* Copia buf (PCM 8-bit unsigned mono) al buffer DMA y arranca reproduccion.
 * len clampeado a SB_DMA_BUF_SIZE. rate tipico: 11025. */
void sb_play_pcm(const unsigned char* buf, unsigned long len, unsigned short rate);
void sb_stop(void);
int  sb_is_playing(void);
void sb_update(void);   /* llamar desde engine_audio_update */

extern int          g_sb_active;   /* 1 tras sb_init() exitoso */
extern unsigned int g_sb_port;     /* puerto base (defecto 0x220)  */
extern int          g_sb_dma;      /* canal DMA 8-bit (defecto 1)  */
extern int          g_sb_irq;      /* IRQ (defecto 5)              */

#endif /* SB_H */
