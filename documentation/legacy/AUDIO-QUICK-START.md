# ⚡ Quick Start: Audio Multi-Tarjeta OPL3

**Objetivo:** Empezar OPL3 driver (Fase 3) en 2-3 horas  
**Requisitos:** Entender mididrv.c actual + leer AUDIO-SOUNDCARD-GUIDE.md § OPL3  
**Stack:** Open Watcom C, DOS protected mode (DOS4GW)

---

## 🎯 Meta Fase 3

Escribir código que:
1. **Detecta** OPL3 @ 0x388-0x38B (puertos I/O)
2. **Inicializa** 18 canales FM (modo estéreo)
3. **Reproduce** notas MIDI sin distorsión
4. **Fallback:** Si OPL3 no existe → vuelve a MPU-401

---

## 📋 Checklist: Lo que ya existe

```
[x] mididrv.c/h     — Driver abstracción (router)
[x] midi.c/h        — Parser MIDI events
[x] mpu.c/h         — Detector MPU @ 0x330
[x] timer.c/h       — ISR timer (frame sync)
[x] agemki_audio.c  — Init función principal

[ ] opl3.c/h        ← CREAR (este es el trabajo)
```

---

## 🚀 Paso 1: Estructura Base (15 min)

Crea `resources/engine/opl3.c` y `resources/engine/opl3.h`:

**opl3.h:**
```c
#ifndef OPL3_H
#define OPL3_H

#include <stdint.h>

/* Detectar OPL3 en puertos estándar */
int opl3_detect(void);

/* Inicializar 18 canales */
int opl3_init(void);

/* Nota ON (MIDI note 0-127, velocity 0-127) */
void opl3_note_on(int channel, uint8_t note, uint8_t velocity);

/* Nota OFF */
void opl3_note_off(int channel);

/* Procesar estado cada frame */
void opl3_process(void);

/* Shutdown driver */
void opl3_shutdown(void);

/* Estado del driver */
extern int g_opl3_active;
extern int g_opl3_port_base;

#endif
```

**opl3.c skeleton:**
```c
#include "opl3.h"
#include <dos.h>

/* Porto base: 0x388 (izquierdo) + 0x389 (derecho) */
int g_opl3_port_base = 0x388;
int g_opl3_active = 0;

/* Tabla de frecuencias MIDI → OPL Fnum (ver AUDIO-SOUNDCARD-GUIDE.md) */
static const uint16_t OPL_FNUM_TABLE[12] = {
    0x0AD, 0x0B7, 0x0C3, 0x0CF, 
    0x0DD, 0x0EB, 0x0FA, 0x10A, 
    0x11B, 0x12E, 0x143, 0x159
};

int opl3_detect(void) {
    /* TODO: Detectar OPL3 */
    return 0;
}

int opl3_init(void) {
    /* TODO: Inicializar registros */
    return 0;
}

void opl3_note_on(int channel, uint8_t note, uint8_t velocity) {
    /* TODO: Reproducir nota */
}

void opl3_note_off(int channel) {
    /* TODO: Silenciar nota */
}

void opl3_process(void) {
    /* TODO: Procesar cada frame */
}

void opl3_shutdown(void) {
    g_opl3_active = 0;
}
```

**Añade a `resources/engine/mididrv.h`:**
```c
#define MDRV_HW_OPL3    3  /* Ya existe probablemente */
```

---

## 🔧 Paso 2: Función Detectar (30 min)

Implementa `opl3_detect()` usando puertos I/O OPL3:

```c
int opl3_detect(void) {
    uint8_t status, test1, test2;
    int port_left = 0x388;    /* Puerto control izquierdo */
    int port_right = 0x38B;   /* Puerto control derecho */
    
    /* Test 1: Escribir 0x01 al registro, leer status */
    outportb(port_left, 0x01);
    delay_ticks(2);  /* 2 ticks ISR = ~18μs @ 18.2 Hz */
    test1 = inportb(port_left);
    
    if ((test1 & 0x20) == 0) {
        /* Esperamos que bit 5 = 0 (no busy) */
        /* Prueba registros specific OPL3 */
        outportb(port_right, 0x04);
        delay_ticks(2);
        test2 = inportb(port_right);
        
        if (test2 & 0x01) {
            /* OPL3 mode signature detected */
            g_opl3_port_base = 0x388;
            g_opl3_active = 1;
            return 1;
        }
    }
    
    return 0;  /* No OPL3 detected */
}
```

**Helper functions:**
```c
static void delay_ticks(int ticks) {
    /* Usar timer (ya existe timer.c) */
    volatile int i;
    for (i = 0; i < ticks * 1000; i++);  /* Rough delay */
}

static void opl_outportb(int port_offset, uint8_t addr, uint8_t data) {
    int port = g_opl3_port_base + port_offset;
    outportb(port, addr);
    delay_ticks(1);
    outportb(port + 1, data);
    delay_ticks(1);
}

static uint8_t opl_inportb(int port_offset, uint8_t addr) {
    int port = g_opl3_port_base + port_offset;
    outportb(port, addr);
    delay_ticks(1);
    return inportb(port + 1);
}
```

---

## 🎹 Paso 3: Inicializar (30 min)

Implementa `opl3_init()` — Configura registros para síntesis FM:

```c
int opl3_init(void) {
    int ch;
    
    if (!g_opl3_active) return 0;
    
    /* Reset hardare */
    opl_outportb(0, 0x60, 0);  /* No vibrato, sustain */
    opl_outportb(0, 0x80, 0xFF);
    
    /* Modo OPL3 */
    opl_outportb(0, 0x05, 0x01);  /* Set OPL3 mode */
    opl_outportb(2, 0x05, 0x01);  
    
    /* Inicializar 18 canales (9 izq, 9 der) */
    for (ch = 0; ch < 18; ch++) {
        int offset = (ch < 9) ? 0 : 2;
        int local_ch = ch % 9;
        
        /* Silenciar canales */
        opl_outportb(offset, 0xB0 + local_ch, 0x00);  /* Key off */
        opl_outportb(offset, 0xC0 + local_ch, 0x30);  /* Feedback + connection */
    }
    
    return 1;
}
```

---

## 🎶 Paso 4: Reproducir Notas (45 min)

Implementa `opl3_note_on()` y `opl3_note_off()`:

```c
static uint16_t g_opl3_fnum[18] = {0};  /* Fnum por canal */
static uint8_t  g_opl3_note[18] = {0};  /* Nota MIDI por canal */

void opl3_note_on(int channel, uint8_t note, uint8_t velocity) {
    uint16_t fnum;
    uint8_t octave;
    int offset, local_ch;
    
    if (channel < 0 || channel >= 18 || !g_opl3_active) return;
    
    offset = (channel < 9) ? 0 : 2;
    local_ch = channel % 9;
    
    /* Calcular Fnum y octave desde nota MIDI */
    octave = (note / 12) - 1;     /* MIDI nota 12 = octava 0 */
    int note_in_octave = note % 12;
    fnum = OPL_FNUM_TABLE[note_in_octave];
    
    g_opl3_fnum[channel] = fnum;
    g_opl3_note[channel] = note;
    
    /* Escribir registro A0 (Fnum bajo 8 bits) */
    opl_outportb(offset, 0xA0 + local_ch, (uint8_t)(fnum & 0xFF));
    
    /* Escribir registro B0 (Fnum alto, octave, key on) */
    uint8_t b0_val = ((fnum >> 8) & 0x03) | ((octave & 0x07) << 2) | 0x20;
    
    opl_outportb(offset, 0xB0 + local_ch, b0_val);
}

void opl3_note_off(int channel) {
    uint8_t b0_val;
    int offset, local_ch;
    
    if (channel < 0 || channel >= 18 || !g_opl3_active) return;
    
    offset = (channel < 9) ? 0 : 2;
    local_ch = channel % 9;
    
    /* Limpiar bit key-on (bit 5 = 0) */
    b0_val = (g_opl3_fnum[channel] >> 8) & 0x03;
    b0_val |= ((g_opl3_note[channel] / 12 - 1) & 0x07) << 2;
    
    opl_outportb(offset, 0xB0 + local_ch, b0_val);
    
    g_opl3_note[channel] = 0;
}

void opl3_process(void) {
    /* Por ahora empty — events procesados en opl3_note_on/off */
}
```

---

## 🔌 Paso 5: Integración mididrv.c (15 min)

Actualiza `resources/engine/mididrv.c` para usar OPL3:

**Agregar en mididrv.h:**
```c
extern int opl3_detect(void);
extern int opl3_init(void);
```

**Actualizar mdrv_install() detection loop:**
```c
int mdrv_install(int *hw_out) {
    int detected_hw = MDRV_HW_NONE;
    
    /* Intentar OPL3 primero (mejor calidad) */
    if (opl3_detect()) {
        if (opl3_init() == 0) goto next;
        detected_hw = MDRV_HW_OPL3;
        g_active_driver = OPL3;
        if (hw_out) *hw_out = detected_hw;
        return 0;
    }
    
    next:
    /* Fallback a MPU-401 (v32 actual) */
    if (mpu_detect()) {
        if (mpu_init() == 0) goto fail;
        detected_hw = MDRV_HW_MPU401;
        g_active_driver = MPU401;
        if (hw_out) *hw_out = detected_hw;
        return 0;
    }
    
    fail:
    return -1;  /* No audio disponible */
}
```

---

## 🧪 Paso 6: Compilar + Test (30 min)

**Compilar:**
```bash
cd resources/engine
wcc386 -bt=dos -6r -ox -zq -I. opl3.c -fo=opl3.o
wcc386 -bt=dos -6r -ox -zq -I. mididrv.c -fo=mididrv.o
# Listar con motor resto...
wlink ... opl3.o mididrv.o ... name engine.exe
```

**Test en DOSBox:**
```
mount C c:\DOS\scumm-editor-v32\resources\engine
cd C:\
C:\> agemki_test.exe  (o juego que reproduza MIDI)
```

**Verificar audio:**
- ¿Se escucha música de fondo?
- ¿Múltiples notas simultáneamente (polifonía)?
- ¿Sin distorsión/crackle?

**Si fallido → debug:**
1. Verifica detección (printf "OPL3 detected\n")
2. Verifica frecuencias (check FNUM table)
3. Verifica timing port I/O (delay_ticks suficiente)

---

## 📊 Tiempo Estimado Completo

| Tarea | Tiempo |
|-------|--------|
| 1. Estructura base | 15 min |
| 2. Detectar OPL3 | 30 min |
| 3. Inicializar | 30 min |
| 4. Notas ON/OFF | 45 min |
| 5. Integración mididrv | 15 min |
| 6. Compilar + Test | 30 min |
| **TOTAL** | **~2.5-3 horas** |

---

## ✅ Checklist Completar Fase 3

```
[ ] opl3.c/h creado y compilable
[ ] opl3_detect() funciona (detecta OPL3 @ 0x388)
[ ] opl3_init() inicializa 18 canales
[ ] opl3_note_on/off escritura registros correcta
[ ] mididrv.c router actualizado
[ ] Compila sin errores
[ ] DOSBox test reproduce MIDI via OPL3
[ ] Fallback a MPU-401 si OPL3 no disponible
[ ] Commit git con "Fase 3 complete OPL3 driver"
```

---

## 🔗 Referencias Claves

- **AUDIO-SOUNDCARD-GUIDE.md** § OPL3 Detection + MIDI→OPL Mapping
- **AUDIO-IMPLEMENTATION-ROADMAP.md** § Fase 3 (OPL3)
- **CONTEXT7-AGEMKI.md** § Audio § Extensión Multi-Tarjeta
- **agemki-doc-v32.txt** § 4 Sistema Audio (MPU-401 actual, pista fallback)

---

## 💡 Tips

1. **Usa DOSBox debugger** si audio no se escucha — verifica puertos I/O
2. **OPL register timing crítico** — delay_ticks() DEBE ser > 1 microsegundo
3. **Fnum table verificada** — copiada de YM3812 datasheet estándar
4. **No cambies API pública** — mididrv.c interfaz debe ser igual
5. **Test con DOSBox sbtype=sb16** — emula OPL3 correctamente

---

**¡Listo para iniciar! 🚀**

