/*
 * timer.c — Hook IRQ0 que coexiste con el timer del engine.
 *
 * El engine instala su propio ISR a 18.2Hz para g_ticks_ms.
 * Nosotros lo reemplazamos a 1000Hz pero ENCADENAMOS al ISR del engine
 * cada 55 ticks (55ms) para que g_ticks_ms siga avanzando correctamente.
 *
 * Tick pendientes se acumulan y se procesan en el game loop via timer_process().
 */
#include <conio.h>
#include <i86.h>
#include <dos.h>
#include "timer.h"
#include "midi.h"

#define PIT_CHANNEL0    0x40
#define PIT_COMMAND     0x43
#define PIT_MODE3       0x36
#define PIT_CLOCK       1193182UL
#define DRIVER_HZ       1000
#define DRIVER_DIVISOR  (PIT_CLOCK / DRIVER_HZ)
#define US_PER_TICK     (1000000UL / DRIVER_HZ)

/* Cada cuantos ticks nuestros llamar al ISR del engine (18.2Hz = ~55ms) */
#define ENGINE_CHAIN_TICKS  55

static int g_hooked = 0;
static void (_interrupt _far *g_old_isr)(void) = 0;
volatile unsigned long g_tick_pending = 0;
volatile unsigned long g_irq_count    = 0;
static unsigned long   g_chain_accum  = 0;

static void _interrupt _far _timer_isr(void) {
    g_tick_pending++;
    g_irq_count++;

    /* Chainear al ISR anterior cada ENGINE_CHAIN_TICKS para mantener g_ticks_ms */
    g_chain_accum++;
    if (g_chain_accum >= ENGINE_CHAIN_TICKS) {
        g_chain_accum = 0;
        /* _chain_intr llama al handler anterior y el envia su propio EOI */
        _chain_intr(g_old_isr);
    } else {
        outp(0x20, 0x20);
    }
}

void timer_process(void) {
    unsigned long pending;
    static unsigned long s_total_ticks = 0;
    _disable();
    pending = g_tick_pending;
    g_tick_pending = 0;
    _enable();
    /* Sin cap: procesamos todos los ticks acumulados para que el secuenciador
     * MIDI avance al ritmo real aunque el juego baje a 12 FPS. El limite
     * anterior (16) causaba que la musica se ralentizara a ~50% a 12 FPS. */
    if (pending > 200) pending = 200; /* tope de seguridad: max 200ms de golpe */
    s_total_ticks += pending;
    while (pending > 0) {
        midi_tick(US_PER_TICK);
        pending--;
    }
}

unsigned long timer_get_total_ticks(void) { return g_irq_count; }

void timer_reset_pending(void) {
    _disable();
    g_tick_pending = 0;
    g_chain_accum  = 0;
    _enable();
}

int timer_hook(void) {
    _disable();
    if (g_hooked) {
        g_tick_pending = 0;
        g_chain_accum  = 0;
        _enable();
        return 0;
    }
    g_tick_pending = 0;
    g_irq_count    = 0;
    g_chain_accum  = 0;
    g_old_isr = _dos_getvect(0x08);
    _dos_setvect(0x08, _timer_isr);
    outp(PIT_COMMAND,  PIT_MODE3);
    outp(PIT_CHANNEL0, (unsigned char)(DRIVER_DIVISOR & 0xFF));
    outp(PIT_CHANNEL0, (unsigned char)((DRIVER_DIVISOR >> 8) & 0xFF));
    g_hooked = 1;
    _enable();
    return 0;
}

int timer_unhook(void) {
    _disable();
    if (!g_hooked) {
        _enable();
        return 0;
    }
    /* Restaurar PIT a 18.2Hz */
    outp(PIT_COMMAND,  PIT_MODE3);
    outp(PIT_CHANNEL0, 0x00);
    outp(PIT_CHANNEL0, 0x00);
    _dos_setvect(0x08, g_old_isr);
    g_tick_pending = 0;
    g_chain_accum  = 0;
    g_hooked = 0;
    _enable();
    return 0;
}

unsigned long timer_get_irq_count(void) { return g_irq_count; }
