# AGEMKI Audio: Extensión Multi-Tarjeta (AdLib, Sound Blaster, AWE32)

**Versión:** 1.0 | **Fecha:** Marzo 2026  
**Objetivo:** Guía LLM para extender `mididrv.c` soportando múltiples tarjetas de sonido DOS

---

## 🎵 Arquitectura Actual

### State Actual (v32)
```c
// mididrv.h - YA DEFINIDO pero parcialmente implementado
#define MDRV_HW_NONE      0
#define MDRV_HW_OPL2      1    ← AdLib
#define MDRV_HW_OPL3      2    ← Sound Blaster OPL3
#define MDRV_HW_SPEAKER   3    ← PC Speaker
#define MDRV_HW_MPU401    4    ← Actual (implementado)

// mididrv.c - API pública (Ya existe)
int  mdrv_install(int *hw_out);        ← Detectar HW
int  mdrv_load_mid(const unsigned char *buf, unsigned long size);
void mdrv_play(void);
void mdrv_stop(void);
void mdrv_process(void);
```

**Situación:**
- ✅ API interface está diseñada para multi-tarjeta
- ✅ MPU-401 totalmente implementado (`mpu.c`)
- ❌ OPL2/OPL3 (AdLib/Sound Blaster) solo stubs
- ❌ Detección automática de hardware incompleta

---

## 🎯 Tarea: Extender para AdLib/SB/AWE32

### Fases de Implementación

```
Fase 1: Arquitectura Base (hardware detection)
  ├─ Detectar hardware disponible (puerto I/O scanning)
  ├─ Inicializar driver correspondiente
  └─ Mantener fallback a MPU-401 o PC Speaker

Fase 2: OPL2/OPL3 Drivers (AdLib + SoundBlaster)
  ├─ opl2.c/h  ← Yamaha OPL2 (AdLib base)
  ├─ opl3.c/h  ← Yamaha OPL3 (Sound Blaster+)
  └─ MIDI → OPL2/3 conversion (note on/off, CC, etc.)

Fase 3: AWE32 Driver
  ├─ awe32.c/h ← E-mu AWE32 (Sound Blaster AWE)
  └─ Wave table synthesis vía tarjeta

Fase 4: Fallback & Compatibility
  ├─ Si no hay hardware: PC Speaker beep
  ├─ Si detecta múltiple: prioridad (AWE32 > OPL3 > OPL2 > MPU > Speaker)
  └─ Config CONFIG.CFG para override manual
```

---

## 📋 Detección de Hardware (mdrv_install)

### Pseudocode
```c
int mdrv_install(int *hw_out) {
  int detected = MDRV_HW_NONE;
  
  // 1. Check MPU-401 (puerto 0x330)
  if (mpu_detect() == MDRV_OK) {
    detected = MDRV_HW_MPU401;
    mpu_init();
    goto FOUND;
  }
  
  // 2. Check OPL3 (Sound Blaster OPL3)
  //    Típicamente puerto 0x388 (left) + 0x38A (right)
  if (opl3_detect() == MDRV_OK) {
    detected = MDRV_HW_OPL3;
    opl3_init();
    goto FOUND;
  }
  
  // 3. Check OPL2 (AdLib)
  //    Típicamente puerto 0x388
  if (opl2_detect() == MDRV_OK) {
    detected = MDRV_HW_OPL2;
    opl2_init();
    goto FOUND;
  }
  
  // 4. Check AWE32
  //    E-mu puerto base 0x620, alternativas: 0x640, 0x660
  if (awe32_detect() == MDRV_OK) {
    detected = MDRV_HW_AWE32;
    awe32_init();
    goto FOUND;
  }
  
  // 5. Fallback: PC Speaker (sistema siempre disponible)
  detected = MDRV_HW_SPEAKER;
  
FOUND:
  *hw_out = detected;
  return MDRV_OK;
}
```

---

## 🔌 Hardware Puertos & Detección

### AdLib (OPL2) - YM3812
```c
#define OPL2_PORT_ADDR  0x388   // Address/Status port
#define OPL2_PORT_DATA  0x389   // Data port

// Detección
int opl2_detect(void) {
  // Escribir test al registro 01
  outp(OPL2_PORT_ADDR, 0x01);
  outp(OPL2_PORT_DATA, 0x00);
  
  // Leer status (bit 7 = ready)
  unsigned char status = inp(OPL2_PORT_ADDR);
  
  return (status & 0x80) ? MDRV_OK : MDRV_ERR_NOHW;
}
```

### Sound Blaster OPL3 - YM262
```c
#define OPL3_PORT_LEFT_ADDR   0x388  // Left chips address
#define OPL3_PORT_LEFT_DATA   0x389
#define OPL3_PORT_RIGHT_ADDR  0x38A  // Right chips address (OPL3 extension)
#define OPL3_PORT_RIGHT_DATA  0x38B

// Detección
int opl3_detect(void) {
  // Test izquierdo (OPL2 base)
  outp(OPL3_PORT_LEFT_ADDR, 0x01);
  outp(OPL3_PORT_LEFT_DATA, 0x00);
  
  unsigned char status = inp(OPL3_PORT_LEFT_ADDR);
  if (!(status & 0x80)) return MDRV_ERR_NOHW;
  
  // Test derecho (OPL3 extension)
  outp(OPL3_PORT_RIGHT_ADDR, 0x05);  // OPL3 mode register
  outp(OPL3_PORT_RIGHT_DATA, 0x01);  // Enable OPL3
  
  return MDRV_OK;  // Es OPL3
}
```

### Sound Blaster AWE32
```c
#define AWE32_PORT_BASE_0  0x620
#define AWE32_PORT_BASE_1  0x640
#define AWE32_PORT_BASE_2  0x660

// AWE32 tiene: MIDI input (puerto), wavetable synth, reverb/chorus
// Detección en datasheet Emu8000

int awe32_detect(void) {
  for (int base = 0x620; base <= 0x660; base += 0x20) {
    // Read HWCF (hardware config) @ offset 0x1A
    unsigned short val = inpw(base + 0x1A);
    
    if ((val & 0xFF00) == 0x0000) continue;  // No response
    
    // Verificar IDs conocidas EMU8000
    if ((val & 0xF000) == 0x8000) return MDRV_OK;
  }
  
  return MDRV_ERR_NOHW;
}
```

---

## 🎹 Conversión MIDI → OPL2/OPL3

### OPL (Operator Level) Basics

**OPL2/3 tienen 9 canales (mono), cada uno = 2 operadores con FM synthesis**

```c
// Canales: 0-8 (OPL2), 0-17 (OPL3)
#define OPL2_CHANNELS 9
#define OPL3_CHANNELS 18

// Registros principales
#define OPL_REG_FEEDBACK    0xC0+ch   // Channel config (feedback+connection)
#define OPL_REG_FREQ_LOW    0xA0+ch   // Frequency low byte
#define OPL_REG_FREQ_HIGH   0xB0+ch   // Frequency high + octave + key-on

struct OplChannel {
  unsigned short freq_fnum;    // Fnum (frequency)
  unsigned char octave;         // Octave 0-7
  unsigned char key_on;         // Key on flag
  unsigned char volume;         // Expression
  int midi_note;                // MIDI nota (0-127)
  int midi_chan;                // MIDI channel
};
```

### Tabla MIDI Note → Fnum (Frequency Number)

```c
// MIDI nota 12 → Fnum = 345 (aproximado)
// MIDI nota 69 = A4 (440 Hz) → Fnum = ~488

const unsigned short midi_to_fnum[12] = {
  // C, C#, D, D#, E, F, F#, G, G#, A, A#, B
  343, 363, 385, 408, 432, 458, 485, 514, 544, 577, 611, 647
};

// Para convertir MIDI nota a OPL:
unsigned char opl_get_fnum(int midi_note, int *octave_out) {
  int note_in_octave = midi_note % 12;
  *octave_out = (midi_note - 12) / 12;  // 0-7
  return midi_to_fnum[note_in_octave];
}
```

### MIDI Note On → OPL Write

```c
void opl_note_on(int opl_chan, int midi_note, int velocity) {
  int octave;
  unsigned short fnum = opl_get_fnum(midi_note, &octave);
  
  // Escribir frecuencia
  outp(OPL_PORT_ADDR, 0xA0 + opl_chan);
  outp(OPL_PORT_DATA, (unsigned char)fnum);
  
  outp(OPL_PORT_ADDR, 0xB0 + opl_chan);
  outp(OPL_PORT_DATA, 0x20 | (octave << 2) | (fnum >> 8));
}
```

---

## 📊 MIDI → Hardware Mapping

### Canales MIDI → Hardware Canales

```c
// MIDI tiene 16 canales (0-15)
// Hardware tiene limitado (OPL2=9, OPL3=18, MPU=unlimited)

struct MidiChannelMap {
  int hw_type;
  int num_hw_channels;
  int midi_chan_to_hw[16];  // Mapeo MIDI ch → HW ch
};

// Para OPL2 (9 channels):
// MIDI ch 0-8 → OPL ch 0-8 (directo)
// MIDI ch 9-15 → Overflow, usar round-robin o steal voice antigua

// Para AWE32 (32 voices):
// MIDI ch 0-15 → AWE ch 0-15 (directo)
// Voces adicionales para polifonía
```

### Control Change (CC) Mapping

```c
// MIDI CC 7 = Volume → OPL Level
// MIDI CC 10 = Pan → (No OPL, ignora)
// MIDI CC 64 = Sustain → (No OPL, bufferea note-off)
// MIDI CC 121 = Reset All Controllers → opl_all_notes_off()

void opl_handle_cc(int opl_chan, int cc, int value) {
  switch (cc) {
    case 7:   // Volume
      opl_set_level(opl_chan, value);  // 0-127 → OPL level
      break;
    case 64:  // Sustain
      // Bufferea note-off si sustain=off
      break;
    case 121: // Reset All Controllers
      opl_all_notes_off();
      break;
  }
}
```

---

## 🏗️ Estructura de Ficheros a Crear

### Ficheros Nuevos Necesarios

```
resources/engine/
├── opl2.c / opl2.h         ← AdLib OPL2 driver
├── opl3.c / opl3.h         ← SoundBlaster OPL3 driver
├── awe32.c / awe32.h        ← Soundblaster AWE32 driver
├── speaker.c / speaker.h    ← Fallback PC Speaker
└── audio_common.h           ← Defs compartidas, port I/O macros
```

### Ficheros a Modificar

```
mididrv.c
  ├─ mdrv_install(): Detección automática hardware
  ├─ mdrv_load_mid(): Router según hw_type
  ├─ mdrv_play(): Iniciar secuencia según driver
  ├─ mdrv_process(): Procesar eventos según driver
  └─ mdrv_hw_type(): Retornar tipo detectado

mididrv.h
  ├─ Quizá adicionar MDRV_HW_AWE32
  └─ Nueva flag: MDRV_FLAG_AUTODETECT
```

---

## 🔄 API Abstracta (Sin Cambios Externos)

El punto fuerte: **La API de `mididrv.c` NO cambia**:

```c
// Cliente código (motor) sigue igual:
engine_play_midi(midi_id);    // Funciona con cualquier tarjeta
engine_audio_update();        // Llama mdrv_process()
engine_stop_midi();           // Detiene reproducción

// Internamente mididrv.c rutea:
if (hw_type == MDRV_HW_OPL3)
  opl3_process();
else if (hw_type == MDRV_HW_MPU401)
  mpu_process();
else if (hw_type == MDRV_HW_AWE32)
  awe32_process();
```

---

## 🎛️ configuración (CONFIG.CFG)

Permitir override manual si usuario prefiere una tarjeta específica:

```ini
# CONFIG.CFG (léído en engine_audio_init)
[AUDIO]
driver=auto      # auto | mpu401 | opl3 | opl2 | awe32 | speaker
port_base=0x330  # Puerto base para hardware (si es necesario)
samplerate=11025 # Muestreo para WAV (futuro)
```

---

## 📝 Checklist para Implementación

### OPL2 (AdLib) - Prioridad MEDIA
- [ ] `opl2.c`: Detección puerto 0x388-0x389
- [ ] `opl2.c`: Inicialización operadores (melodía + bass drum)
- [ ] `opl2.c`: opl2_note_on() / opl2_note_off()
- [ ] `opl2.c`: opl2_process() llamado cada frame
- [ ] MIDI→OPL2: Mapeo notas + velocidad
- [ ] Fallback: Si detecta OPL3, usar como OPL2

### OPL3 (Sound Blaster) - Prioridad ALTA
- [ ] `opl3.c`: Detención puerto 0x388-0x38B
- [ ] `opl3.c`: Inicialización OPL3 mode
- [ ] `opl3.c`: 18 canales soportados
- [ ] `opl3.c`: opl3_note_on() / opl3_note_off()
- [ ] MIDI→OPL3: Mapeo MIDI Ch → OPL Ch
- [ ] CC support: Volume, Sustain, All Off
- [ ] Test en DOSBox + hardware real

### AWE32 (Sound Blaster AWE) - Prioridad MEDIA-ALTA
- [ ] `awe32.c`: Detección puerto base (0x620/0x640/0x660)
- [ ] `awe32.c`: MIDI input enable (tarjeta tiene MIDI host)
- [ ] `awe32.c`: Wavetable synthesis inicialización
- [ ] `awe32.c`: Bank select + program change
- [ ] 32 voices polifonía
- [ ] Reverb/Chorus control (futuro)

### PC Speaker (Fallback) - Prioridad BAJA
- [ ] `speaker.c`: Beep frequencies @ puerto PIT (0x42)
- [ ] Genera tono + silencio (mono, no MIDI realmente)
- [ ] Fallback último recurso si no hay hardware

### mididrv.c Extensión - Prioridad ALTA
- [ ] Reescribir `mdrv_install()` con detection lógica
- [ ] Añadir `mdrv_hw_type()` getter
- [ ] Router `mdrv_process()` según hw_type
- [ ] Router `mdrv_set_volume()` según driver
- [ ] Graceful fallback si inicialización falla

### Testing - Prioridad CRÍTICA
- [ ] Test cada driver en DOSBox
- [ ] Test fallback (OPL3→OPL2→MPU→Speaker)
- [ ] Test switching entre salidas
- [ ] CONFIG.CFG override en juego

---

## 🔗 Integración con AGEMKI

### Motor No Cambia
```c
// En agemki_engine.c
engine_audio_init(NULL, NULL, music_vol, sfx_vol);  // Mismo
engine_play_midi(audio_id);                         // Mismo
engine_audio_update();  // Stack: engine_flip()      // Mismo
```

### DAT Audio Sigue Siendo MIDI Estándar
```c
// AUDIO.DAT contiene MIDI Format 0/1 (sin cambios)
// Pero ahora soporta:
// ✅ MPU-401 (actual)
// ✅ OPL2/OPL3 (nuevo)
// ✅ AWE32 (nuevo)
// ✅ PC Speaker beep (nuevo - fallback)
```

### Editor Electron No Cambia
```javascript
// src/renderer/AudioManager.jsx
// Sigue importando MIDI, generando AUDIO.DAT
// Solo añadir UI selector de "driver preferido" (opcional)
```

---

## 🧪 Pruebas Sugeridas

### Test 1: Detección Automática
```c
// En DOSBox virtual machine
// Cambiar emulación de audio, verificar:
"mpu401=intelligent"  → Detecta MPU-401
"nosound"             → Detecta OPL3 (SB por defecto)
"sbtype=sb16"         → Detecta OPL3
"sbtype=none"         → Detecta PC Speaker (fallback)
```

### Test 2: Reproducción Completa
```c
// Load MIDI desde AUDIO.DAT
// Reproducir en cada tarjeta
// Verificar: notas reproduce, volumen OK, timbre razonable

// MIDI cc evento mapping:
CC 7 (Volume)   → OPL level (audible)
CC 64 (Sustain) → Sustain pedal logic
CC 121 (Reset)  → All notes off
```

### Test 3: Fallback Graceful
```c
// Si OPL3 no disponible → fallback OPL2
// Si OPL2 no disponible → fallback MPU
// Si MPU no disponible → fallback Speaker
// Juego no crashea, sonido funciona aunque degradado
```

---

## 📚 Referencias Técnicas

### Datasheets / Documentation
- **OPL2 (YM3812)**: Yamaha datasheet @ `resources/documentation/`
- **OPL3 (YM262)**: Yamaha OPL3 reference
- **AWE32**: E-mu documentation
- **DOSBox OPL emulation**: DOSBox fuente @ github.com/dosbox/dosbox

### Code References
- **AdLib: PLAY.C** en GUS SDK (AdLib emulation)
- **SEAL**: Desarrolló drivers multicard (referencia arquitectura)
- **SoundBlaster SDK**: SB16 MIDI handler

---

## 🎯 Objetivos Finales

**Post-implementación:**
1. ✅ AGEMKI soporta múltiples tarjetas de sonido DOS
2. ✅ Detección automática de hardware
3. ✅ Fallback graceful si tarjeta no disponible
4. ✅ Sonido MIDI en máquinas 486DX2 con cualquier tarjeta
5. ✅ API interna interna, sin cambios fuera mididrv.c

**Compatibilidad:**
- ✅ AdLib (1987+) — Clásica
- ✅ Sound Blaster (1989+) — Estándar DOS
- ✅ Sound Blaster AWE32 (1994+) — Wavetable
- ✅ MPU-401 (1989+) — Actual
- ✅ PC Speaker (siempre) — Fallback absoluto

---

## 🚀 Próximos Pasos para LLM

Cuando implementes:

1. **Empieza por OPL3** (Sound Blaster más común)
   - Detecta 0x388-0x38B
   - Mapea MIDI→OPL3
   - Prueba en DOSBox

2. **Luego OPL2** (compatible con OPL3)
   - Reutiliza lógica OPL3
   - Test fallback: OPL3→OPL2

3. **Finalmente AWE32** (upgrade)
   - Más complejo (wavetable)
   - Pero mismo MIDI input

4. **PC Speaker fallback** (last resort)
   - Permite jugar sin tarjeta sonido

---

**Guía Completa Creada** ✅  
**Listo para LLM**: Sí, ya sabe qué hacer  
**Complejidad**: Media (arquitectura clara, drivers separados)  
**Tiempo estimado**: 100-150 líneas código por driver

