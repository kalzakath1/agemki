#ifndef TIMER_H
#define TIMER_H
int  timer_hook(void);
int  timer_unhook(void);
void timer_process(void);              /* llamar desde el bucle principal */
void timer_reset_pending(void);        /* descartar ticks acumulados */
unsigned long timer_get_irq_count(void);
unsigned long timer_get_total_ticks(void);
#endif
