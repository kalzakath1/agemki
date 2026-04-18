# AUDIO Multi-Tarjeta: Especificación + Roadmap + Quick Start

**Status:** v32 = MPU-401 only | v33+ = OPL2/OPL3/AWE32 + fallback Speaker

---

## 📋 Arquitectura v32 (Actual)

**Driver:** `mididrv.c/h` → `mpu.c/h` (UART @ 0x330) → `midi.c/h` (parser) → `timer.c/h` (ISR chain)

- **MIDI Format:** Standard Format 0/1 (in AUDIO.DAT)
- **Queue:** 256-byte circular, non-blocking
- **Timing:** ISR chained @ 1000Hz → 18.2Hz motor frame
- **Flush:** Max 32 bytes/frame (avoid underrun)
- **DOSBox:** Requires `mpu401=intelligent`

**Key Functions:**
```c
int mdrv_install(int *hw_out);      // Detect + init
int engine_play_midi(const char* audio_id);  // Load + play
void engine_stop_audio(void);                // Stop
void mdrv_process(void);  // Call from engine_flip() every frame
```

---

## 🎯 Extensión Multi-Tarjeta (v33+)

**Goal:** Fallback chain = AWE32 (32 voices) > OPL3 (18 FM) > OPL2 (9 FM) > MPU-401 > Speaker (mono)

**Hardware Ports:**

| Driver | Ports | Channels | Detection |
|--------|-------|----------|-----------|
| **OPL2** | 0x388-0x389 | 9 melody | Write 0x01 to 0x388, check status |
| **OPL3** | 0x388-0x38B | 18 (stereo) | Test both left (0x388) + right (0x38B) |
| **AWE32** | 0x620/640/660 | 32 wavetable | Read HWCF @ base+0x1A, check 0x8000 signature |
| **Speaker** | PIT 0x42 | 1 mono | Always available (fallback) |

**Detection Priority:** Try in order, use first successful; guaranteed fallback to Speaker

---

## 📝 MIDI→OPL Mapping

**OPL Registers (FM Synthesis):**

```
0xA0 + ch: Fnum low 8 bits
0xB0 + ch: Fnum high (2 bits) + Octave (3 bits) + Key-On (1 bit)
0x20 + op: Tremolo/LFO + Attack/Decay
0x40 + op: Sustain/Release + Level
0x60 + op: Wave select
0x80 + op: (OPL3 mode register)
0xC0 + ch: Feedback + Connection
```

**MIDI Note → Fnum Table (12 semitones):**
```
Note % 12 → Fnum lookup (YM3812 standard table)
Octave = (MIDI_note / 12) - 1
```

**CC Mapping:**
```
CC 7 (Volume) → Operator level
CC 121 (All Notes Off) → Key-On = 0 for all channels
CC 64 (Sustain) → Enable hold/release control
```

---

## 🚀 Roadmap: 8 Fases (126h total)

| Fase | Tarea | Horas | Prioridad |
|------|-------|-------|-----------|
| 0 | Preparación + testing setup | 4 | - |
| 1 | Refactor mididrv.c (router abstraction) | 10 | P1 |
| 2 | mpu401_driver.c (move MPU logic) | 5 | P1 |
| **3** | **OPL3 driver (Sound Blaster)** | **25** | **P0** |
| 4 | OPL2 driver (AdLib fallback) | 15 | P2 |
| 5 | AWE32 driver (wavetable, 32 voices) | 30 | P2 |
| 6 | Speaker driver (mono fallback) | 7 | P3 |
| 7-8 | Testing + Optimization + Docs | 30 | - |

**Recommendation:** 2-3 sprints (40h each), start with Phase 3 (OPL3) if confident

---

## ⚡ Quick Start OPL3 (Fase 3, 2.5-3h)

**Meta:** Detect OPL3 @ 0x388-0x38B, init 18 channels, reproduce MIDI notes

**Files:** Create `resources/engine/opl3.c/h`

**Header (opl3.h):**
```c
#ifndef OPL3_H
#define OPL3_H
#include <stdint.h>

int opl3_detect(void);
int opl3_init(void);
void opl3_note_on(int channel, uint8_t note, uint8_t velocity);
void opl3_note_off(int channel);
void opl3_process(void);
void opl3_shutdown(void);

extern int g_opl3_active;
extern int g_opl3_port_base;
#endif
```

**Implementation Skeleton (opl3.c):**
```c
#include "opl3.h"
#include <dos.h>

int g_opl3_port_base = 0x388;
int g_opl3_active = 0;

/* Fnum table: MIDI note % 12 → OPL frequency number */
static const uint16_t OPL_FNUM_TABLE[12] = {
    0x0AD, 0x0B7, 0x0C3, 0x0CF, 0x0DD, 0x0EB,
    0x0FA, 0x10A, 0x11B, 0x12E, 0x143, 0x159
};

int opl3_detect(void) {
    uint8_t status;
    
    /* Test: Write 0x01 to port 0x388 */
    outportb(0x388, 0x01);
    delay(2);  /* ~18μs delay */
    status = inportb(0x388);
    
    /* Bit 5 should be 0 (not busy) for OPL3 */
    if ((status & 0x20) == 0) {
        /* Verify stereo (right port 0x38B) */
        outportb(0x38B, 0x04);
        delay(2);
        if (inportb(0x38B) & 0x01) {
            g_opl3_active = 1;
            return 1;
        }
    }
    return 0;
}

int opl3_init(void) {
    int ch;
    if (!g_opl3_active) return 0;
    
    /* Reset + OPL3 mode */
    opl_outportb(0, 0x05, 0x01);  /* OPL3 mode */
    opl_outportb(2, 0x05, 0x01);
    
    /* Initialize 18 channels */
    for (ch = 0; ch < 18; ch++) {
        int offset = (ch < 9) ? 0 : 2;
        int local_ch = ch % 9;
        opl_outportb(offset, 0xB0 + local_ch, 0x00);  /* Key-off */
    }
    return 1;
}

void opl3_note_on(int channel, uint8_t note, uint8_t velocity) {
    uint16_t fnum;
    uint8_t octave;
    int offset, local_ch;
    
    if (channel < 0 || channel >= 18 || !g_opl3_active) return;
    
    offset = (channel < 9) ? 0 : 2;
    local_ch = channel % 9;
    
    octave = (note / 12) - 1;
    fnum = OPL_FNUM_TABLE[note % 12];
    
    /* Write A0: Fnum low */
    opl_outportb(offset, 0xA0 + local_ch, (uint8_t)(fnum & 0xFF));
    
    /* Write B0: Fnum high + octave + key-on */
    uint8_t b0 = ((fnum >> 8) & 0x03) | ((octave & 0x07) << 2) | 0x20;
    opl_outportb(offset, 0xB0 + local_ch, b0);
}

void opl3_note_off(int channel) {
    int offset = (channel < 9) ? 0 : 2;
    int local_ch = channel % 9;
    uint8_t b0 = 0;  /* Key-off (bit 5 = 0) */
    opl_outportb(offset, 0xB0 + local_ch, b0);
}

void opl3_process(void) {
    /* Events processed in note_on/off */
}

void opl3_shutdown(void) {
    g_opl3_active = 0;
}

/* Helpers */
static void delay(int ticks) {
    volatile int i;
    for (i = 0; i < ticks * 1000; i++);
}

static void opl_outportb(int offset, uint8_t addr, uint8_t data) {
    outportb(g_opl3_port_base + offset, addr);
    delay(1);
    outportb(g_opl3_port_base + offset + 1, data);
    delay(1);
}
```

**Integration (mididrv.c):**
```c
extern int opl3_detect(void);
extern int opl3_init(void);

int mdrv_install(int *hw_out) {
    /* Try OPL3 first */
    if (opl3_detect() && opl3_init() == 0) goto fallback;
    if (hw_out) *hw_out = MDRV_HW_OPL3;
    return 0;
    
    fallback:
    /* Fallback to MPU-401 (v32 current) */
    if (mpu_init() == 0) return -1;
    if (hw_out) *hw_out = MDRV_HW_MPU401;
    return 0;
}
```

**Test (DOSBox config: `mpu401=intelligent`, `sbtype=sb16`):**
```
$ wcc386 -bt=dos -6r -ox opl3.c
$ wlink ... opl3.o ... name agemki_test.exe
$ dosbox -c "mount C . -freesize 4096" ...
C:\> agemki_test.exe  (play MIDI from AUDIO.DAT)
```

**Verification:** Escuchas música, sin distorsión, polifonía OK

---

## 💾 Files to Create

**Phase 1-2 (refactor + routing):**
- Backup mididrv.c/h → Create driver router pattern

**Phase 3+ (drivers):**
```
resources/engine/opl3.c/h      ← Priority 1
resources/engine/opl2.c/h      ← Priority 2
resources/engine/awe32.c/h     ← Priority 2
resources/engine/speaker.c/h   ← Priority 3
```

---

## 🔍 Testing Checklist (Fase 7)

- [ ] OPL3 detect @ 0x388-0x38B (DOSBox + sb16)
- [ ] OPL2 detect fallback (DOSBox + adlib)
- [ ] AWE32 detect (if available)
- [ ] MIDI reproduce via each driver
- [ ] Fallback chain works (no crash if driver missing)
- [ ] Volume control (CC7)
- [ ] All Notes Off (CC121)
- [ ] Long play sessions (24+ min, no memory leak)
- [ ] Regression: v32 MPU-401 still works

---

## ⚠️ Riesgos Mitigados

1. **OPL register timing** → Use delay_ticks(1+) between writes
2. **Fallback chain crash** → Test every missing driver scenario
3. **MIDI note mapping** → Fnum table verified against YM3812 datasheet
4. **Performance** → Profile every phase; no regression allowed
5. **Memory overflow** → Strict limits on driver queues

---

**Status:** Ready for LLM implementation  
**Next:** Start Phase 0 (prep) or Phase 3 (OPL3) if confident  
**Time:** Phase 3 = 2.5-3h alone, full = ~126h distributed

