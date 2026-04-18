#ifndef MPU_H
#define MPU_H
int  mpu_detect(void);
void mpu_init(void);
void mpu_shutdown(void);
void mpu_send(unsigned char b);  /* encolar byte, nunca bloquea */
void mpu_flush(void);            /* enviar bytes pendientes, llamar cada frame */
void mpu_all_notes_off(void);
#endif
