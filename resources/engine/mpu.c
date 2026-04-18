/*
 * mpu.c — MPU-401 UART mode, non-blocking send con cola circular
 */
#include <conio.h>
#include "mpu.h"

#define MPU_DATA    0x330
#define MPU_STATUS  0x331
#define MPU_CMD     0x331
#define MPU_RESET   0xFF
#define MPU_UART    0x3F

/* Cola circular para bytes MIDI pendientes */
#define MPU_QUEUE_SIZE 256
static unsigned char g_queue[MPU_QUEUE_SIZE];
static unsigned      g_q_head = 0;  /* siguiente a leer */
static unsigned      g_q_tail = 0;  /* siguiente a escribir */

static int g_ready = 0;

static int _mpu_can_write(void) {
    return !(inp(MPU_STATUS) & 0x40);
}

int mpu_detect(void) {
    int i;
    /* Intentar reset */
    for (i = 0; i < 10000; i++) if (!(inp(MPU_STATUS) & 0x40)) break;
    outp(MPU_CMD, MPU_RESET);
    for (i = 0; i < 50000; i++) inp(MPU_STATUS);
    /* Entrar en modo UART directamente */
    for (i = 0; i < 10000; i++) if (!(inp(MPU_STATUS) & 0x40)) break;
    outp(MPU_CMD, MPU_UART);
    g_ready = 1;
    g_q_head = g_q_tail = 0;
    return 1;
}

void mpu_init(void)     { if (!g_ready) mpu_detect(); }
void mpu_shutdown(void) { mpu_flush(); mpu_all_notes_off(); g_ready = 0; }

/* Encolar byte — nunca bloquea */
void mpu_send(unsigned char b) {
    unsigned next = (g_q_tail + 1) & (MPU_QUEUE_SIZE - 1);
    if (next != g_q_head) {  /* cola no llena */
        g_queue[g_q_tail] = b;
        g_q_tail = next;
    }
    /* Si llena, descartar — mejor perder una nota que colgarse */
}

/* Llamar frecuentemente desde el game loop para vaciar la cola */
static unsigned long g_bytes_sent = 0;
unsigned long mpu_get_bytes_sent(void) { return g_bytes_sent; }

void mpu_flush(void) {
    int budget = 32;
    while (g_q_head != g_q_tail && budget-- > 0) {
        if (!_mpu_can_write()) break;
        outp(MPU_DATA, g_queue[g_q_head]);
        g_q_head = (g_q_head + 1) & (MPU_QUEUE_SIZE - 1);
        g_bytes_sent++;
    }
}

void mpu_all_notes_off(void) {
    int ch;
    /* Enviar directamente sin cola para silencio inmediato */
    for (ch = 0; ch < 16; ch++) {
        int i;
        for (i = 0; i < 10000; i++) if (_mpu_can_write()) break;
        outp(MPU_DATA, 0xB0 | ch);
        for (i = 0; i < 10000; i++) if (_mpu_can_write()) break;
        outp(MPU_DATA, 123);
        for (i = 0; i < 10000; i++) if (_mpu_can_write()) break;
        outp(MPU_DATA, 0);
    }
}
