# ROADMAP: Audio Multi-Tarjeta para AGEMKI (v33+)

**Fecha:** Marzo 2026  
**Estado:** Planificación  
**Objetivo:** Extender soporte audio de MPU-401 único a múltiples tarjetas (OPL2/OPL3/AWE32)  
**Nivel Dificultad:** Media (arquitectura clara, drivers modulares)  
**Tiempo Estimado:** 80-120 horas de desarrollo + testing

---

## 📋 Fases de Desarrollo

### **Fase 0: Preparación (2-4 horas)**
**Objetivo:** Entender arquitectura actual, crear estructura modular

```
TASKS:
[ ] Leer y entender mididrv.c/h actual
[ ] Leer AUDIO-SOUNDCARD-GUIDE.md completamente
[ ] Crear rama `feature/audio-multi-card` en git
[ ] Documentar casos test para cada driver
[ ] Planificar fallback strategy
```

**Deliverables:**
- Documento: "IMPLEMENTATION-PLAN.md" (detalle cada driver)
- Rama Git con commits iniciales
- Test cases en `tests/audio/`

---

### **Fase 1: Refactorización mididrv.c (8-12 horas)**
**Objetivo:** Preparar `mididrv.c` para soportar múltiples drivers

```
TASKS:
[ ] Crear driver interface abstracta
    ├─ struct audio_driver {
    │   int (*detect)(void);
    │   int (*init)(void);
    │   void (*shutdown)(void);
    │   int (*load_midi)(const unsigned char *buf, unsigned long size);
    │   void (*play)(void);
    │   void (*stop)(void);
    │   void (*process)(void);  // Llamar cada frame
    │   void (*set_volume)(unsigned char vol);
    │   }
    └─ Define instancias: mpu401_driver, opl3_driver, opl2_driver, etc.

[ ] Reescribir mdrv_install() con loop detección:
    ├─ for cada driver en orden prioridad:
    │  ├─ if (driver->detect() == OK)
    │  │  ├─ driver->init()
    │  │  ├─ g_active_driver = driver
    │  │  └─ return OK
    │  └─ endif
    └─ Fallback: g_active_driver = speaker_driver

[ ] Reescribir mdrv_process():
    └─ if (g_active_driver) g_active_driver->process()

[ ] Reescribir mdrv_play/stop/set_volume():
    └─ Router a g_active_driver→funcion()

[ ] Mantener API pública igual (sin cambios para engine)
```

**Deliverables:**
- mididrv.c refactorizado
- mididrv.h avec nuevicas defines (hw types actualizados)
- Tests de routing funcionando
- Fallback a MPU-401 actual funciona (regression test)

---

### **Fase 2: Driver MPU-401 Simplificación (4-6 horas)**
**Objetivo:** Mover lógica MPU-401 a driver separado

```
TASKS:
[ ] Crear mpu401_driver.c/h:
    ├─ mpu401_detect()
    ├─ mpu401_init()
    ├─ mpu401_process()
    └─ Reutilizar código mpu.c/midi.c

[ ] Verificar retrocompatibilidad:
    └─ Tests con DOSBox (mpu401=intelligent)
```

**Deliverables:**
- mpu401_driver.c compilable
- Tests regressión: MIDI reproduce igual que antes

---

### **Fase 3: Driver OPL3 (Sound Blaster) (20-30 horas)**
**Objetivo:** Síntesis FM via OPL3

```
TASKS (Priority HIGH):
[ ] crear opl3.c/h estructura base
    ├─ opl3_detect()      ← Detectar puerto 0x388-0x38B
    ├─ opl3_init()        ← Inicializar operadores
    ├─ opl3_note_on()     ← MIDI note → OPL register
    ├─ opl3_note_off()    ← Silenciar nota  
    └─ opl3_process()     ← Procesar eventos cada frame

[ ] Port I/O helpers:
    ├─ opl_write_addr(port, addr)
    ├─ opl_write_data(port, data)
    └─ opl_read_status(port)

[ ] MIDI → OPL mapping:
    ├─ MIDI note (0-127) → Fnum table lookup
    ├─ Octave calculation: (note-12)/12
    ├─ Velocity → Operator level
    └─ CC 7/121/64 mapping

[ ] Operator setup:
    ├─ Melodía channels: 0-8 (default init)
    ├─ Drum mode: Channel 6 (opcional, v1)
    └─ Feedback/connection register (0xC0+ch)

[ ] Test cases:
    ├─ Test OPL3 detección en DOSBox
    ├─ Cargar MIDI de AUDIO.DAT
    ├─ Reproducir notas (verificar audio)
    ├─ Test CC7 (volume)
    ├─ Test CC121 (all notes off)
    └─ Fallback a MPU si OPL3 falla
```

**Deliverables:**
- opl3.c/h compilable, linkeable con mididrv
- tests/opl3_detect_test.c
- tests/opl3_midi_test.c (cargar MIDI, reproducir)
- DOSBox test log (audio reproduciendo)

---

### **Fase 4: Driver OPL2 (AdLib) (12-18 horas)**
**Objetivo:** Síntesis FM via OPL2 (9 canales)

```
TASKS (Priority MEDIUM):
[ ] Crear opl2.c/h (reutilizar opl3.c ~70%):
    ├─ opl2_detect()   ← Puerto 0x388-0x389 solamente
    ├─ opl2_init()     ← 9 canales
    ├─ opl2_note_on()  ← Similar OPL3
    ├─ opl2_process()  ← Similar OPL3
    └─ OPL3 como fallback si ambos presentes

[ ] Diferencias vs OPL3:
    └─ Solo puerto izquierdo (0x388-0x389)
    └─ Max 9 canales (vs 18 OPL3)
    └─ Sin registro OPL3 mode (0x05→0x01 skipped)

[ ] Test cases:
    ├─ DOSBox emulación OPL3 pero como OPL2
    ├─ Fallback detección: OPL3 no disponible → OPL2
    ├─ MIDI reproducción básica
    └─ Volumen OK
```

**Deliverables:**
- opl2.c/h compilable
- tests/opl2_fallback_test.c
- DOSBox test (sin OPL3, solo AdLib)

---

### **Fase 5: Driver AWE32 (Sound Blaster AWE) (24-36 horas)**
**Objetivo:** Wavetable synthesis via E-mu EMU8000

```
TASKS (Priority MEDIUM-HIGH):
[ ] Crear awe32.c/h estructura:
    ├─ awe32_detect()        ← Detectar puerto base + HWCF
    ├─ awe32_init()          ← Inicializar modo MIDI
    ├─ awe32_set_bank()      ← Program change
    ├─ awe32_note_on()       ← 32 voces polifonía
    ├─ awe32_note_off()
    ├─ awe32_process()       ← Procesar eventos
    └─ awe32_effects()       ← Reverb/Chorus (optional)

[ ] Hardware detection:
    ├─ Try ports: 0x620, 0x640, 0x660
    ├─ Read HWCF @ base+0x1A
    ├─ Check ID: 0x8000 in 0xF000 mask
    └─ Almacenar 'base' para futuros accesos

[ ] MIDI voice management:
    ├─ 32 voces max (vs 18 OPL3)
    ├─ Asignar MIDI ch → AWE voces (round-robin si overflow)
    ├─ Track notaon, velocity per voice
    └─ Sustain pedal support (CC64)

[ ] Wavetable bank selection:
    ├─ Program change (CC programData) → setear wavetable
    ├─ Bank select (CC0, CC32) → puntero banco
    └─ Defaults: General MIDI wavetables

[ ] Test cases:
    ├─ AWE32 detección (si disponible)
    ├─ MIDI reproducción con wavetable
    ├─ Volume + CC controls
    ├─ 32 voces simultáneas (stress test)
    ├─ Fallback si AWE32 falla → OPL3
    └─ DOSBox AWE32 emulation (si disponible)
```

**Deliverables:**
- awe32.c/h compilable
- tests/awe32_detect_test.c
- tests/awe32_32voices_test.c
- DOSBox test (si emulación disponible)

---

### **Fase 6: Driver PC Speaker Fallback (6-8 horas)**
**Objetivo:** Fallback absoluto (beep mono)

```
TASKS (Priority LOW):
[ ] Crear speaker.c/h:
    ├─ speaker_detect()    ← Sempre OK (PIT siempre disponible)
    ├─ speaker_init()      ← Porto 0x61 (speaker enable)
    ├─ speaker_note_on()   ← PIT frequency tone
    ├─ speaker_note_off()  ← Silence
    └─ speaker_process()   ← Simple tone generation

[ ] PIT (Programmable Interval Timer) @ 0x42:
    ├─ Write divisor para frequency
    ├─ Rango aprox: 20Hz (freq alta) a 2000Hz (freq baja)
    ├─ Note: muy limitado, solo mono
    └─ Pero funciona en prácticamente TODO

[ ] Mapeamos solo frecuencia, timing es software
```

**Deliverables:**
- speaker.c/h compilable
- tests/speaker_fallback_test.c
- "Juego se puede jugar" sin audio (no crashea)

---

### **Fase 7: Testing & Validation (16-24 horas)**
**Objetivo:** Verificar todos drivers funcionan + fallback robusto

```
TASKS:
[ ] Test cada driver aisladamente:
    ├─ opl3_test.exe (DOSBox, sbtype=sb16)
    ├─ opl2_test.exe (DOSBox, sbtype=adlib)
    ├─ awe32_test.exe (DOSBox con emulación AWE32)
    ├─ mpu401_test.exe (DOSBox, mpu401=intelligent)
    └─ speaker_test.exe (sin emulación audio)

[ ] Test fallback completo:
    ├─ Sin hardware alguno → Speaker (beep fallback)
    ├─ Solo Speaker disponible → Funciona
    ├─ OPL2 no disponible → fallback MPU
    ├─ OPL3 falla inicialización → fallback OPL2
    ├─ AWE32 no detectada → fallback OPL3
    └─ Ningún fallback crashea

[ ] Integration tests:
    ├─ Cargar AGEMKI juego completo
    ├─ Reproducir múltiples MIDIs
    ├─ Cambiar rooms (stop/play audio)
    ├─ Volume changes (CC7 events)
    ├─ Long play sessions (24+ minutos)
    └─ Salvar/restaurar estado

[ ] Regression tests:
    ├─ MPU-401 reproduce igual que v32
    ├─ Engine API sin cambios externos
    ├─ Juego NO crashea
    ├─ Performance ~18fps (igual que antes)
    └─ Memory usage ≤ 8MB

[ ] Stress tests:
    ├─ 32 voces AWE32 simultáneas
    ├─ CC events flooding
    ├─ Program change rapid fire
    ├─ Very long MIDI files (10+ minutes)
    └─ Edge cases: MIDI corruption handling
```

**Deliverables:**
- `tests/` directorio completo con .exe compilados
- `TEST-RESULTS.md` con logs de cada test
- DOSBox snapshots (before/after screenshots)
- Performance benchmark CSV

---

### **Fase 8: Documentation & Optimization (8-12 horas)**
**Objetivo:** Documentar código, optimizar, entregar

```
TASKS:
[ ] Documentación código:
    ├─ Comentarios en cada función (español)
    ├─ Structs documentados (register mappings)
    ├─ Inline comments para lógica compleja
    └─ Docstring en cada .h (API publica)

[ ] Optimizaciones:
    ├─ Profile con DOSBox debugger
    ├─ Eliminar operaciones innecesarias
    ├─ Cache frequency tables si no existen
    ├─ Batch register writes si es posible
    └─ Memory footprint análisis

[ ] Configuration:
    ├─ CONFIG.CFG soporta driver=auto|mpu|opl3|opl2|awe32|speaker
    ├─ Port override si usuario lo necesita
    └─ Fallback strategy configurable

[ ] Version bump:
    ├─ Cambiar a v33 si implementación completa
    ├─ o v32.1 si es patch menor
    └─ Update VERSION.txt + headers

[ ] Final Review:
    ├─ Code review con usuario
    ├─ Test suite verde
    ├─ Documentation completa
    ├─ No regressions
    └─ Entregar branch final
```

**Deliverables:**
- Código documentado + comentado
- CONFIG.CFG schema documentation
- VERSION v33 update
- CHANGELOG entry
- Merge ready PR/branch

---

## 🎯 Timeline Summary

| Fase | Tarea | Horas | Acumulado |
|------|-------|-------|-----------|
| 0 | Preparación | 4 | 4 |
| 1 | mididrv refactor | 10 | 14 |
| 2 | mpu401 driver | 5 | 19 |
| 3 | **OPL3 (PRIORITY)** | **25** | **44** |
| 4 | OPL2 | 15 | 59 |
| 5 | AWE32 | 30 | 89 |
| 6 | Speaker | 7 | 96 |
| 7 | Testing | 20 | 116 |
| 8 | Docs + Optimization | 10 | 126 |
| **TOTAL** | | | **~126 horas** |

**Recomendación:** Distribuir en sprints de 2-3 semanas (4-6 horas diarias)

---

## 🚀 Quick Start para LLM

Si el LLM quiere empezar AHORA:

1. **Lee esto:** `AUDIO-SOUNDCARD-GUIDE.md` (20 min)
2. **Entiende:** Arquitectura mididrv.c actual + driver interface (30 min)
3. **Crea:** `opl3.c` skeleton + `opl3_detect()` (1 hora)
4. **Test:** Detecta presencia OPL3 en DOSBox (30 min)
5. **Itera:** Agrega `opl3_note_on()`, test reproducción (2-3 horas)

**Goal Fase 3:** Reproducir MIDI en OPL3, fallback a MPU si falla

---

## ⚠️ Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| OPL register timing issues | MEDIA | Test con DOSBox debugger |
| Fallback logic bug (crash) | ALTA | Test exhaustivo fallback chain |
| MIDI note mapping incorrecto | MEDIA | Tabla frequency verificada |
| DOSBox emulación incompleta | BAJA | Test hardware real si posible |
| Memory overflow (driver queue) | BAJA | Límites estrictos en structs |
| Performance regression | BAJA | Profile continuo cada fase |

---

## 📞 Revisión y Aprobación

Hitos para revisión con usuario:

- [ ] Fase 1 completa: mididrv refactorizado, tests regressión OK
- [ ] Fase 3 completa: OPL3 reproduciendo MIDI
- [ ] Fase 6 completa: Fallback speaker OK (juego playable sin audio)
- [ ] Fase 7 completa: Todos drivers testados
- [ ] **FINAL:** Code review, merge a main branch

---

**Guía Implementación** ✅  
**Status:** Lista para LLM  
**Documento Vivo:** Actualizar según progress

