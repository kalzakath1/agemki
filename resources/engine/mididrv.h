#ifndef MIDIDRV_H
#define MIDIDRV_H

#define MDRV_OK           0
#define MDRV_ERR_NOMEM    1
#define MDRV_ERR_NOHW     2
#define MDRV_ERR_BADMID   3
#define MDRV_ERR_ALREADY  4
#define MDRV_ERR_NOTINST  5

#define MDRV_HW_NONE      0
#define MDRV_HW_OPL2      1
#define MDRV_HW_OPL3      2
#define MDRV_HW_SPEAKER   3
#define MDRV_HW_MPU401    4

#define MDRV_STATE_STOPPED  0
#define MDRV_STATE_PLAYING  1
#define MDRV_STATE_PAUSED   2

/* Establece preferencia de driver antes de mdrv_install().
 * hw: MDRV_HW_OPL2, MDRV_HW_MPU401, etc. MDRV_HW_NONE = auto. */
void mdrv_set_hw_pref(int hw);
int  mdrv_install(int *hw_out);
int  mdrv_remove(void);
int  mdrv_load_mid(const unsigned char *buf, unsigned long size);
void mdrv_play(void);
void mdrv_stop(void);
void mdrv_pause(void);
int  mdrv_rewind(void);   /* rebobina sin reproducir; 0=ok */
void mdrv_replay(void);   /* rebobina y reproduce */
int  mdrv_state(void);
void mdrv_set_volume(unsigned char vol);
void mdrv_set_loop(int loop);
int  mdrv_hw_type(void);
void mdrv_process(void);  /* llamar desde el game loop */

#endif
