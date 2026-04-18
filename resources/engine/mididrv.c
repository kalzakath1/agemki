#include <string.h>
#include "mididrv.h"
#include "mpu.h"
#include "midi.h"
#include "opl2.h"
#include "opl3.h"
#include "timer.h"

static int g_installed = 0;
static int g_hw        = MDRV_HW_NONE;
static int g_loop_flag = 0;
static int g_vol       = 127;
/* Preferencia de driver establecida antes de mdrv_install().
 * MDRV_HW_NONE (0) = auto-detectar (comportamiento por defecto). */
static int g_hw_pref   = MDRV_HW_NONE;

/* Establece la preferencia de hardware antes de llamar a mdrv_install().
 * Usar constantes MDRV_HW_OPL2, MDRV_HW_MPU401, etc.
 * MDRV_HW_NONE = auto-detectar. */
void mdrv_set_hw_pref(int hw) { g_hw_pref = hw; }

int mdrv_install(int *hw_out) {
    if (g_installed) return MDRV_ERR_ALREADY;

    /* --- Preferencia explicita del usuario (desde CONFIG.CFG) --- */

    /* Preferencia MPU-401 */
    if (g_hw_pref == MDRV_HW_MPU401 && mpu_detect()) {
        mpu_init();
        g_hw = MDRV_HW_MPU401;
        goto hw_found;
    }

    /* Preferencia OPL3 */
    if (g_hw_pref == MDRV_HW_OPL3 && opl3_detect() && opl3_init() == 0) {
        midi_set_output(opl3_send, opl3_all_notes_off);
        g_hw = MDRV_HW_OPL3;
        goto hw_found;
    }

    /* Preferencia OPL2 */
    if (g_hw_pref == MDRV_HW_OPL2 && opl2_detect() && opl2_init() == 0) {
        midi_set_output(opl2_send, opl2_all_notes_off);
        g_hw = MDRV_HW_OPL2;
        goto hw_found;
    }

    /* --- Auto-deteccion: orden OPL3 > OPL2 > MPU-401 --- */

    /* OPL3 es prioritario sobre OPL2: mas canales (18 vs 9) y estereo */
    if (opl3_detect() && opl3_init() == 0) {
        midi_set_output(opl3_send, opl3_all_notes_off);
        g_hw = MDRV_HW_OPL3;
        goto hw_found;
    }

    /* OPL2 (AdLib / Sound Blaster FM) */
    if (opl2_detect() && opl2_init() == 0) {
        midi_set_output(opl2_send, opl2_all_notes_off);
        g_hw = MDRV_HW_OPL2;
        goto hw_found;
    }

    /* Fallback: MPU-401 (sintetizador externo Roland/compatibles) */
    if (!mpu_detect()) return MDRV_ERR_NOHW;
    mpu_init();
    /* midi_set_output no necesario: defaults ya apuntan a mpu_send */
    g_hw = MDRV_HW_MPU401;

hw_found:
    if (hw_out) *hw_out = g_hw;
    if (timer_hook() != 0) return MDRV_ERR_NOMEM;
    g_installed = 1;
    return MDRV_OK;
}

int mdrv_remove(void) {
    if (!g_installed) return MDRV_ERR_NOTINST;
    mdrv_stop();
    timer_unhook();
    if (g_hw == MDRV_HW_OPL3) {
        opl3_shutdown();
        midi_set_output(0, 0);  /* restaurar defaults MPU-401 */
    } else if (g_hw == MDRV_HW_OPL2) {
        opl2_shutdown();
        midi_set_output(0, 0);  /* restaurar defaults MPU-401 */
    } else {
        mpu_shutdown();
    }
    g_installed = 0;
    return MDRV_OK;
}

int mdrv_load_mid(const unsigned char *buf, unsigned long size) {
    if (!g_installed) return MDRV_ERR_NOTINST;
    if (!buf || size < 14) return MDRV_ERR_BADMID;
    /* Detectar formato: MIDI (MThd) o XMI (FORM...XMID) */
    if (size >= 4 && buf[0]=='M'&&buf[1]=='T'&&buf[2]=='h'&&buf[3]=='d') {
        if (midi_load(buf, size) != 0) return MDRV_ERR_BADMID;
    } else {
        if (midi_load_xmi(buf, size) != 0) return MDRV_ERR_BADMID;
    }
    midi_set_loop(g_loop_flag);
    midi_set_volume((unsigned char)g_vol);
    return MDRV_OK;
}

void mdrv_play(void)  { if(g_installed) midi_play(); }
void mdrv_stop(void)  { if(g_installed) midi_stop(); }
void mdrv_pause(void) { if(g_installed) midi_pause(); }

int mdrv_rewind(void) {
    if (!g_installed) return MDRV_ERR_NOTINST;
    if (midi_rewind() != 0) return MDRV_ERR_BADMID;
    return MDRV_OK;
}

void mdrv_replay(void) {
    if (!g_installed) return;
    midi_replay();
}

int mdrv_state(void) {
    if (!g_installed) return MDRV_STATE_STOPPED;
    if (midi_is_paused())  return MDRV_STATE_PAUSED;
    if (midi_is_playing()) return MDRV_STATE_PLAYING;
    return MDRV_STATE_STOPPED;
}

void mdrv_set_volume(unsigned char vol) {
    g_vol = vol;
    if (g_hw == MDRV_HW_OPL3) {
        /* OPL3: volumen via nivel de carrier en registros FM */
        opl3_set_volume(vol);
    } else if (g_hw == MDRV_HW_OPL2) {
        /* OPL2: volumen via nivel de carrier en registros FM */
        opl2_set_volume(vol);
    } else if (g_hw == MDRV_HW_MPU401) {
        /* MPU-401: enviar CC7 (Main Volume) en los 16 canales MIDI */
        midi_set_volume(vol);
    }
}
void mdrv_set_loop(int loop) { g_loop_flag = loop; midi_set_loop(loop); }
int  mdrv_hw_type(void) { return g_hw; }

/* Llamar desde el game loop */
void mdrv_process(void) { if(g_installed) timer_process(); }
