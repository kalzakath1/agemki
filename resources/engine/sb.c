/*
 * sb.c — Driver Sound Blaster: deteccion, DMA, reproduccion PCM 8-bit
 *
 * Soporta SB 1.0 / 2.0 / Pro / 16 usando DMA 8-bit canal 1.
 * El buffer DMA se aloja en memoria convencional (<1MB) via _dos_allocmem
 * para que el controlador DMA 8237 pueda acceder a el.
 * Bajo DOS4GW el primer MB esta mapeado 1:1, por lo que el puntero
 * logico coincide con la direccion fisica.
 *
 * Sincronizacion: sin ISR, usamos conteo de ticks del timer para
 * detectar fin de reproduccion (aprox, puede tardar 1-2ms de mas).
 */
#include <conio.h>
#include <dos.h>
#include <stdlib.h>   /* getenv */
#include <string.h>
#include "sb.h"
#include "timer.h"   /* timer_get_irq_count() */

/* ------------------------------------------------------------------ */
/* Estado global                                                        */
/* ------------------------------------------------------------------ */

int          g_sb_active = 0;
unsigned int g_sb_port   = 0x220;
int          g_sb_dma    = 1;
int          g_sb_irq    = 5;

static int           g_sb_playing    = 0;
static unsigned long g_sb_done_tick  = 0;   /* tick (1000Hz) en el que termina */
static unsigned long g_sb_alloc_seg  = 0;   /* segmento DOS asignado */
static unsigned char* g_dma_buf      = 0;   /* puntero logico al buffer DMA */
static unsigned long  g_dma_phys     = 0;   /* direccion fisica del buffer DMA */

/* ------------------------------------------------------------------ */
/* DSP helpers                                                          */
/* ------------------------------------------------------------------ */

/* Escribe un byte al DSP; espera hasta que este listo (bit7=0 en port+0x0C) */
static int _dsp_write(unsigned char val) {
    int t;
    for (t = 0; t < 65535; t++) {
        if (!(inp((unsigned)(g_sb_port + 0x0C)) & 0x80)) {
            outp((unsigned)(g_sb_port + 0x0C), val);
            return 1;
        }
    }
    return 0;   /* timeout */
}

/* Lee un byte del DSP; espera hasta que haya dato (bit7=1 en port+0x0E) */
static int _dsp_read(void) {
    int t;
    for (t = 0; t < 65535; t++) {
        if (inp((unsigned)(g_sb_port + 0x0E)) & 0x80)
            return (int)(unsigned int)inp((unsigned)(g_sb_port + 0x0A));
    }
    return -1;  /* timeout */
}

/* Resetea el DSP; devuelve 1 si OK */
static int _dsp_reset(void) {
    int t;
    outp((unsigned)(g_sb_port + 0x06), 0x01);
    /* Delay ~3us: 6 lecturas del puerto de estado */
    (void)inp((unsigned)(g_sb_port + 0x06));
    (void)inp((unsigned)(g_sb_port + 0x06));
    (void)inp((unsigned)(g_sb_port + 0x06));
    (void)inp((unsigned)(g_sb_port + 0x06));
    (void)inp((unsigned)(g_sb_port + 0x06));
    (void)inp((unsigned)(g_sb_port + 0x06));
    outp((unsigned)(g_sb_port + 0x06), 0x00);
    /* Esperar 0xAA del DSP */
    for (t = 0; t < 65535; t++) {
        if (_dsp_read() == 0xAA) return 1;
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* Parseo de variable BLASTER                                          */
/* ------------------------------------------------------------------ */

/* Parsea "A220 I5 D1 H5 P330 T6" y actualiza g_sb_port/dma/irq */
static void _parse_blaster(void) {
    char* s = getenv("BLASTER");
    if (!s) return;
    while (*s) {
        while (*s == ' ') s++;
        if (!*s) break;
        { char c = (char)(*s >= 'a' ? *s - 32 : *s); s++;
          unsigned int v = 0;
          while (*s >= '0' && *s <= '9') { v = v*10 + (unsigned)(*s - '0'); s++; }
          if      (c == 'A') g_sb_port = v;
          else if (c == 'D') g_sb_dma  = (int)v;
          else if (c == 'I') g_sb_irq  = (int)v;
        }
    }
}

/* ------------------------------------------------------------------ */
/* Gestion del buffer DMA                                              */
/* ------------------------------------------------------------------ */

/*
 * Aloca SB_DMA_BUF_SIZE bytes en memoria convencional (<1MB).
 * Garantiza que el buffer no cruza un limite de 64KB (requisito del DMA 8237).
 * Devuelve 1 si OK, 0 si error.
 */
static int _alloc_dma_buf(void) {
    unsigned int  seg;    /* _dos_allocmem espera unsigned int* en Watcom */
    unsigned long phys;
    /* Alloc 2x para tener margen y evitar cruce de pagina de 64KB */
    unsigned para = (SB_DMA_BUF_SIZE * 2U + 15U) >> 4;
    if (_dos_allocmem(para, &seg) != 0) return 0;
    phys = (unsigned long)seg << 4;
    /* Comprobar si buf[0..SB_DMA_BUF_SIZE-1] cruza limite de 64KB */
    if ((phys & 0xFFFF0000UL) == ((phys + SB_DMA_BUF_SIZE - 1UL) & 0xFFFF0000UL)) {
        g_dma_phys = phys;
    } else {
        /* Avanzar al inicio de la siguiente pagina de 64KB */
        g_dma_phys = (phys + 0xFFFFUL) & 0xFFFF0000UL;
    }
    g_dma_buf     = (unsigned char*)g_dma_phys;  /* DOS4GW: lineal = fisico < 1MB */
    g_sb_alloc_seg = (unsigned long)seg;
    return 1;
}

/* ------------------------------------------------------------------ */
/* Programacion del DMA 8237 (canal 8-bit, canal 1)                   */
/* ------------------------------------------------------------------ */

/*
 * Tablas de puertos para canales DMA 8-bit (0-3).
 * Canal 1: addr=0x02, count=0x03, page=0x83
 */
static const unsigned char _dma_page[4]  = { 0x87, 0x83, 0x81, 0x82 };
static const unsigned char _dma_addr[4]  = { 0x00, 0x02, 0x04, 0x06 };
static const unsigned char _dma_count[4] = { 0x01, 0x03, 0x05, 0x07 };

static void _dma_start(unsigned long phys, unsigned long count) {
    int ch = g_sb_dma & 0x03;
    unsigned char page    = (unsigned char)((phys >> 16) & 0xFF);
    unsigned char addr_lo = (unsigned char)(phys & 0xFF);
    unsigned char addr_hi = (unsigned char)((phys >> 8) & 0xFF);
    unsigned long cnt     = count - 1UL;
    unsigned char cnt_lo  = (unsigned char)(cnt & 0xFF);
    unsigned char cnt_hi  = (unsigned char)((cnt >> 8) & 0xFF);

    outp(0x0A, (unsigned char)(0x04 | ch));   /* Mask channel */
    outp(0x0C, 0x00);                          /* Clear flip-flop */
    outp(0x0B, (unsigned char)(0x48 | ch));   /* Mode: single, read, ch */
    outp(_dma_addr[ch],  addr_lo);
    outp(_dma_addr[ch],  addr_hi);
    outp(_dma_page[ch],  page);
    outp(_dma_count[ch], cnt_lo);
    outp(_dma_count[ch], cnt_hi);
    outp(0x0A, (unsigned char)ch);             /* Unmask channel */
}

/* ------------------------------------------------------------------ */
/* API publica                                                          */
/* ------------------------------------------------------------------ */

int sb_detect(void) {
    unsigned int saved_port = g_sb_port;
    _parse_blaster();
    if (_dsp_reset()) return 1;
    /* Si BLASTER no estaba o dio puerto malo, probar 0x220 */
    if (g_sb_port != 0x220) {
        g_sb_port = 0x220;
        if (_dsp_reset()) return 1;
    }
    /* Probar 0x240 */
    g_sb_port = 0x240;
    if (_dsp_reset()) return 1;
    g_sb_port = saved_port;
    return 0;
}

int sb_init(void) {
    if (!_alloc_dma_buf()) return -1;
    if (!_dsp_reset())     { _dos_freemem((unsigned short)g_sb_alloc_seg); return -1; }
    _dsp_write(0xD1);   /* Speaker ON */
    g_sb_active  = 1;
    g_sb_playing = 0;
    return 0;
}

void sb_shutdown(void) {
    if (!g_sb_active) return;
    sb_stop();
    _dsp_write(0xD3);   /* Speaker OFF */
    if (g_sb_alloc_seg) {
        _dos_freemem((unsigned short)g_sb_alloc_seg);
        g_sb_alloc_seg = 0;
        g_dma_buf  = 0;
        g_dma_phys = 0;
    }
    g_sb_active = 0;
}

void sb_play_pcm(const unsigned char* buf, unsigned long len, unsigned short rate) {
    unsigned char tc;
    unsigned long play_len;

    if (!g_sb_active || !buf || len == 0) return;

    sb_stop();

    /* Limitar al tamano del buffer DMA */
    play_len = (len > SB_DMA_BUF_SIZE) ? SB_DMA_BUF_SIZE : len;

    /* Copiar datos al buffer DMA */
    memcpy(g_dma_buf, buf, (unsigned)play_len);

    /* Time constant: tc = 256 - (1000000 / rate) */
    { unsigned long divisor = (rate > 0) ? (1000000UL / (unsigned long)rate) : 91UL;
      tc = (unsigned char)(256UL - (divisor < 255UL ? divisor : 255UL)); }

    /* Estimar tick de finalizacion (timer a 1000Hz) */
    { unsigned long ms = (play_len * 1000UL) / (unsigned long)rate;
      g_sb_done_tick = timer_get_irq_count() + ms + 5UL; }

    /* Programar DMA */
    _dma_start(g_dma_phys, play_len);

    /* Enviar comandos DSP */
    _dsp_write(0x40);              /* Set time constant */
    _dsp_write(tc);
    _dsp_write(0x14);              /* 8-bit single-cycle DMA output */
    _dsp_write((unsigned char)((play_len - 1UL) & 0xFF));
    _dsp_write((unsigned char)(((play_len - 1UL) >> 8) & 0xFF));

    g_sb_playing = 1;
}

void sb_stop(void) {
    if (!g_sb_active) return;
    _dsp_write(0xD0);   /* Pause DMA */
    g_sb_playing = 0;
}

int sb_is_playing(void) {
    if (!g_sb_active || !g_sb_playing) return 0;
    if (timer_get_irq_count() >= g_sb_done_tick) {
        g_sb_playing = 0;
        return 0;
    }
    return 1;
}

void sb_update(void) {
    if (!g_sb_active) return;
    /* Actualizar flag de reproduccion por tiempo */
    if (g_sb_playing && timer_get_irq_count() >= g_sb_done_tick)
        g_sb_playing = 0;
}
