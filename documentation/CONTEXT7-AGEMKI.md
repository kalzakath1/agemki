# AGEMKI v32 — Contexto Compacto

**v32 | Marzo 2026 | Target:** 486DX2 66MHz, 8MB RAM, DOS4GW  
**Editor:** Electron 33 + React 18.3 + Zustand → Genera C code + GAME.DAT  
**Motor:** C puro (Open Watcom 2.0) → GAME.EXE (32-bit protegido)

---

## 🎯 Restricciones Críticas

| Parámetro | Valor | Impacto |
|-----------|-------|--------|
| CPU | 486DX2/66MHz (27 MIPS) | Precomputed tables, no loops complejos |
| RAM | 8MB (7.3MB extended) | DAT < 2MB; stack > malloc |
| Video | VGA 13h (320×200×256) | 64KB framebuffer, sprites ≤ 256×256 |
| Timer | 18.2 Hz ISR | **Chain interrupts; vital** |
| Audio | MPU-401 @ 0x330 | 256-byte queue, flush 32 bytes/frame |

**Charset:** ISO-8859-1 (PC Spanish compatible)  
**DAT Format:** AGMK magic + sorted chunks (binary search O(log N))

---

## 🏗️ Stack y Carpetas

| Zona | Tech | Carpeta | Descripción |
|------|------|---------|------------|
| **Editor** | React 18.3 + Zustand | `src/renderer/` | UI game design |
| **Build** | Node.js codegen | `src/main/` | Generate C code + DAT |
| **Motor** | C + asm (Watcom) | `resources/engine/` | VGA, input, pathfind, inventory, verbs |
| **Audio** | C (MPU-401 driver) | `resources/engine/mididrv.c` | MIDI playback, interrupt chained |

**v32 Features:**
- Custom MPU-401 driver (MIDI sequential, non-blocking)
- Inventory fixed: each InvSlot owns PCX buffer (no sprite corruption)
- Keyboard support: arrow keys + Enter/Space/Ctrl/Esc
- New triggers: `on_verb_inv`, `on_usar_con` (compiled code generated)

### Compilador & Linker
```
Open Watcom 2.0
├── wcc386 (compilador C, -bt=dos para DOS)
├── wlink (linker)
└── DOS4GW runtime (dpmi0.exe incluido)
```

### Motor (C en DOS)
```
Modo protegido 32-bit
├── Framebuffer: modo 13h VGA directo
├── Timers: IRQ0 @ 1000Hz → chain a ISR motor @ 18.2Hz
├── Audio: MPU-401 UART MIDI directo
├── Input: teclado (INT 16h) + ratón (INT 33h)
└── Formato DAT: tabla de chunks + búsqueda binaria
```

---

## 📁 Estructura de Ficheros

### Proyecto Editor
```
c:\DOS\scumm-editor-v32\
├── src/main/
│   ├── index.js              ← IPC handlers, build system
│   ├── datGenerator.js       ← Generador DAT files
│   ├── fontGenerator.js      ← Convesor PCX → bitmap
│   └── dat/AGEMKI_DAT_SPEC.md
├── src/renderer/
│   ├── App.jsx, main.jsx
│   └── components/
│       ├── GameManager/
│       ├── SceneEditor/       ← Edición de rooms
│       ├── CharacterLibrary/  ← Editor personajes
│       ├── ObjectLibrary/     ← Editor objetos (v32: tabs)
│       ├── VerbsetEditor/
│       ├── SequenceEditor/
│       ├── DialogueEditor/
│       ├── ScriptEditor/      ← v32: nuevos triggers
│       ├── AudioManager/
│       └── [otros]
├── resources/
│   ├── engine/               ← Motor C compilado
│   │   ├── agemki_engine.c/h
│   │   ├── agemki_audio.c/h
│   │   ├── mididrv.c/h      ← API del driver MIDI
│   │   ├── mpu.c/h          ← Bajo nivel MPU-401
│   │   ├── midi.c/h         ← Secuenciador MIDI
│   │   ├── timer.c/h        ← Timer hook IRQ0
│   │   └── DIGPLAY.H        ← Legacy (no usado)
│   ├── tools/               ← DOS4GW, scripts build
│   └── drivers/
└── documentation/
    ├── agemki-doc-v32.txt
    ├── open-watcom-guide.pdf
    └── CONTEXT7-AGEMKI.md ← Este archivo
```

### Proyecto Juego (generado en editor)
```
proyecto1\                    ← Carpeta del juego
├── game.json                 ← Config global, paleta
├── rooms\                    ← room.json por room
├── characters\               ← char.json por personaje
├── objects\                  ← obj.json por objeto
├── dialogues\                ← dialogue nodes
├── scripts\                  ← script handlers
├── verbsets\                 ← verbset.json
├── sequences\                ← sequence steps
├── locales\
│   ├── es.json, en.json
├── assets\converted\
│   ├── backgrounds\          ← PCX rooms (320×200)
│   ├── sprites\              ← PCX sprites (max 256×256)
│   ├── objects\              ← PCX objetos
│   └── fonts\                ← Fuentes bitmap
└── build\
    ├── GAME.EXE              ← Motor compilado
    ├── GAME.DAT              ← Assets (binario)
    ├── build.log
    ├── watcom.log
    └── [ficheros temp]
```

### Formato DAT

**Estructura:**
```
┌─ FILE HEADER (16 bytes) ────┐
│ Magic: "AGMK"               │
│ Version: 0x0100             │
│ Num chunks: N               │
│ Data offset: ptr            │
│ CRC32 data area             │
├─ CHUNK TABLE (N×16 bytes) ──┤
│ [type(4), id(4), offset(4), size(4)] ×N
│ (ordered lexicographically) │
├─ DATA AREA ─────────────────┤
│ chunk 0 data                │
│ chunk 1 data                │
│ ...                         │
└─────────────────────────────┘
```

**Tipos de chunk:**
- `GLBL` — Config global, paleta (1 chunk)
- `ROOM` — Datos room (fondos, walkmap, objetos, exits)
- `CHAR` — Datos personaje (sprites, velocidad)
- `VERB` — Verbset
- `SEQU` — Secuencia
- `DLNG` — Diálogo node
- `PCX_` — Imagen PCX (fondos, sprites, objetos)
- `FONT` — Fuente bitmap
- `MIDI` — Fichero MIDI (Format 0/1)
- `TEXT` — String localizado (key→textos por idioma)

---

## ⚙️ Sistema de Audio (v32 → v33+)

### Arquitectura Actual (v32 — MPU-401)

**Componentes Base:**
| Fichero | Responsabilidad |
|---------|-----------------|
| `mididrv.c/h` | API pública: init, load_mid, play, stop, pause, state, volume, process |
| `mpu.c/h` | Driver MPU-401 UART, cola circular no bloqueante (256 bytes) |
| `midi.c/h` | Parser MIDI Format 0/1, secuenciador eventos |
| `timer.c/h` | Hook IRQ0 @ 1000Hz, chain al ISR del motor a 18.2Hz |
| `agemki_audio.c/h` | Wrapper del motor |

**Flow Actual:**
1. `engine_audio_init()` → `mdrv_install()` (hook IRQ0)
2. `engine_play_midi(id)` → carga MIDI de AUDIO.DAT → `mdrv_load_mid()` + `mdrv_play()`
3. Timer @ 1000Hz llama `mdrv_process()` → avanza secuenciador
4. `engine_flip()` llama `engine_audio_update()` → `mpu_flush()` (max 32 bytes/frame)
5. `engine_quit()` → `engine_audio_shutdown()` + restaura timer

**Características v32:**
- MIDI Format 0 y Format 1 soportados
- Detección automática de MPU-401 @ 0x330
- Sincronización con timer del motor (ISR chain)
- Cola UART no bloqueante
- Volumen 0-15 configurable
- **Nota:** DOSBox requiere `mpu401=intelligent` en dosbox.conf

### Extensión Multi-Tarjeta (v33+ Planificado)

**Hardware Soportado (en orden de prioridad):**
| Hardware | Tipo | Canales | Puertos | Estado |
|----------|------|---------|---------|--------|
| AWE32 | Wavetable | 32 voces | 0x620/0x640/0x660 | Planificado |
| OPL3 | FM Synth | 18 canales | 0x388-0x38B | Planificado |
| OPL2 | FM Synth | 9 canales | 0x388-0x389 | Planificado |
| MPU-401 | UART MIDI | Unlimited | 0x330 | ✅ Implementado |
| PC Speaker | Beep | 1 (mono) | PIT 0x42 | Fallback |

**Detección Automática:**
```
mdrv_install() → try_awe32() → try_opl3() → try_opl2() → 
try_mpu401() → fallback_speaker()
```

**OPL2/OPL3 Específico (Síntesis FM):**
- MIDI Note On → Fnum (frequency number) en registros OPL
- Mapeo MIDI channel → OPL channel (9 para OPL2, 18 para OPL3)
- CC 7 (Volume) → Level Register
- CC 121 (Reset) → All Notes Off
- Feedback + operator configuration presets

**AWE32 Específico (Wavetable):**
- 32 voces polifonía (vs 9-18 OPL)
- Bank Select + Program Change para wavetable selection
- MIDI input nativo (puerto en tarjeta)
- Reverb/Chorus procesamiento
- Mejor calidad que OPL pero requiere hardware

**Guía Completa:** Ver `documentation/AUDIO-SOUNDCARD-GUIDE.md` (>200 líneas detalladas)

---

## 🕹️ Motor C — Sistemas Clave

### 3.1 Render (Modo 13h VGA)

```c
// Flujo por frame
engine_flip() {
  1. Render fondo (scroll si aplica)
  2. Render personajes (con escala por perspectiva)
  3. Render objetos
  4. Render inventario (barra inferior)
  5. Render línea de acción (verbo + objeto)
  6. Render overlays (4 independientes para globos)
  7. Actualizar audio (engine_audio_update)
  8. Sincronizar pantalla VGA
}
```

**Perspectiva:**
- ScaleZones dividen la room por Y
- Cada zone: scale factor (0.5 - 1.0) interpolado linealmente
- Sprites escalados usando lookup tables precomputadas

### 3.2 Sistema de Verbos (SCUMM-style)

**Estructura:**
```c
Verbset {
  id, name, verbs[] = [
    { name, x, y, color, flags: isMovement, approach }
  ]
}
```

**Flow:**
1. Hover sobre objeto → detecta colisión rect
2. Muestra línea de acción: `{verbo activo} {nombre objeto}`
3. Click → busca handler: `object.verb.{VERB_ID}`
4. Si `isMovement=1`: walk + approach si aplica
5. Si `approach=1` y está lejos: walk más cerca antes de ejecutar

**Objetos de inventario:**
- Hover sin verbo: muestra verbo "movimiento" por defecto
- Hover con verbo: muestra `{verbo} {nombre inv item}`
- Click verbo sobre inv: busca `object.inv_verb.{VERB_ID}` → fallback a `object.verb.{VERB_ID}`

### 3.3 Sistema usar_con (v32 nuevo)

```c
// Cuando selecciona verbo + obj inventario con handler usar_con:
g_usar_con_mode = 1
// Línea de acción: "Usar X con ..."

// Click segundo objetivo:
engine_on_usar_con(inv_obj, target, fn)
// target = objeto inventario | objeto room | personaje | nullptr (cancel)

// Cancelación:
// - Click derecho
// - Click cualquier verbo
// - ESC
```

### 3.4 Walkmap & Pathfinding

```c
walkmap: bitmap[40×25]  // 1=transitable, 0=bloqueado (1 tile = 8×8 px)
Algorithm: BFS sobre tiles, encuentra ruta más corta
Si no hay ruta: aproximarse máximo posible + mensaje sys.cannot_reach
```

### 3.5 Input Teclado (v32 nuevo)

```c
INT 16h (teclado):
  Flechas UP/DOWN/LEFT/RIGHT → mover cursor @ 4px/evento
  Enter / Espacio → click izquierdo
  Ctrl → click derecho (INT 16h AH=02h bit shift 2)
  ESC → menu pausa (siempre activo)

Sincronización cursor ratón:
  Tras mover con teclado → INT 33h AX=04h (set cursor position)

Durante g_script_running:
  - Flechas, Enter/Espacio, clicks BLOQUEADOS
  - ESC sigue activo (permite menu pausa)
```

### 3.6 Scripts Bloqueantes (v32 nuevo)

```c
g_script_running = 1 durante ANY handler
  ↓
Input del usuario ignorado (flechas, Enter/Espacio, clicks)
  ↓
Funciones de motor internas (engine_show_text, engine_walk_char) 
  siguen leyendo g_mouse.buttons directamente
  ↓
g_script_running = 0 al terminar handler
```

### 3.7 Inventario (v32 mejorado)

**Cambios críticos:**
- Cada `InvSlot` tiene su propio buffer PCX (`owns_buf=1`)
- **No comparte** puntero con sprite del objeto en room
- Al cambiar room: libera sprite room, inventario conserva su buffer

**Bugfix resuelto:** Sprites random al cambiar room (v31 → v32)

---

## 🛠️ Modulos del Editor

### GameManager
- Crear/abrir/renombrar/eliminar juegos
- Settings globales: paleta, idiomas, verbset inicial, secuencia inicio

### SceneEditor (Rooms)
- Fondo PCX (scroll habilitado/deshabilitado)
- Walkmap bitmap interactivo
- Objetos y exits en escena
- Scale zones por perspectiva
- MIDI de fondo

### CharacterLibrary
- Sprites por dirección (idle, walk up/down/left/right)
- Flip automático para economizar assets
- Velocidad base configurable
- Flag protagonista

### ObjectLibrary (v32 restructurado)
```
Tabs:
  ├─ General: nombre, tipo, sprites, estados
  ├─ Respuestas: verbo → texto/script (para objeto en room)
  ├─ Inv. Respuestas: verbo → texto/script (para objeto en inventario)
  │  • Fallback a "Respuestas" si no hay inv_verb definido
  └─ Combinar: lista [target] → script (usar_con)
```

### VerbsetEditor
- Grid visual de verbos
- Posición, color, flags
- Preview en tiempo real

### SequenceEditor
- Pasos: change_room, play_midi, show_text, wait, call_sequence, run_dialogue
- Drag & drop
- Vista tree o timeline

### DialogueEditor
- Nodos de diálogo
- Líneas múltiples simultáneas (max 4)
- Respuestas conectadas

### ScriptEditor (v32 con nuevos triggers)
**Triggers disponibles:**
- `on_enter_room` / `on_exit_room`
- `on_verb_object` (verbo sobre objeto escena)
- `on_verb_inv` (verbo sobre objeto inventario) — **NUEVO v32**
- `on_usar_con` (usar inv con target) — **NUEVO v32**
- `on_examine_object`
- `on_pickup_object`

### AudioManager
- Importar MIDI
- Asignar a rooms/secuencias
- Preview en editor
- Gerenciador volumen

---

## 🔄 Flow de Build

1. **Validación:** Chequea datos, rutas assets
2. **Generación DATs:**
   - `datGenerator.js`: lee game.json, genera GAME.DAT
   - `fontGenerator.js`: PCX → bitmap fonts
   - Valida chunks, construye tabla ordenada
3. **Generación código C:**
   - Crea `main.c` con handlers de scripts compilados
   - `engine_on_verb_object(verb_id, obj_id, fn)`
   - `engine_on_verb_inv(verb_id, inv_obj_id, fn)` — **v32**
   - `engine_on_usar_con(inv_obj_id, target, fn)` — **v32**
4. **Compilación Watcom:**
   ```
   wcc386 -bt=dos -6r -ox -w=3 main.c agemki_engine.c agemki_audio.c
   wcc386 -bt=dos -6r -ox -w=3 mididrv.c mpu.c midi.c timer.c
   wlink ... main.obj agemki_engine.obj agemki_audio.obj ...
   → GAME.EXE (+ DOS4GW runtime)
   ```
5. **Emulación DOSBox:**
   - Copia GAME.EXE + GAME.DAT a build/
   - Lanza DOSBox con dosbox.conf (mpu401=intelligent)
   - Logs en ENGINE.LOG, AUDIO.LOG

---

## 📚 Convenciones Clave

| Regla | Descripción |
|------|-------------|
| **? = Justo hablar** | Si usuario pone `?` → solo explicar, no escribir código |
| **base_speed** | Velocidad configurable del personaje |
| **speed** | Velocidad actual del walk (escala con perspectiva) |
| **Pending action** | Se asigna ANTES de `engine_walk_char_to_obj` |
| **Handler + fn** | Si `fn != NULL` tiene prioridad sobre `isPickup` automático |
| **g_script_running** | `=1` durante any handler, bloquea input excepto ESC |
| **Overlay verbo** | Respuestas sobre protagonista, NO en línea de acción |
| **AUDIO.DAT** | MIDI estandar (no XMI), se carga con `engine_dat_load_audio()` |
| **Lexicográfico** | CHUNK TABLE en DAT ordenada por `(type, id_crc32)` |
| **Chain ISR** | timer.c usa `_chain_intr()` frecuencia engine, no sobrescribe |

---

## 🐛 Problemas Históricos Resueltos

| v | Problema | Solución |
|---|----------|----------|
| v31 | AIL/32 incompatible DOS4GW | Eliminado, creado driver MPU-401 propio |
| v31 | Timer engine no avanzaba | Timer.c ahora hace chain al ISR motor @ 18.2Hz |
| v31 | Sprites random en inventario | Cada InvSlot tiene buffer PCX propio (owns_buf=1) |
| v32 | Audio bloqueante en secuencias | engine_audio_update() en engine_flip(), no engine_loop() |
| v32 | XMI conversion errors | AUDIO.DAT guarda MIDI directo, sin convertMidToXmi |

---

## 🔍 Fetch Documentation System

### How to Access Help During Development

**Ficheros en documentation/ que contienen información critical:**

```
documentation/
├── agemki-doc-v32.txt         ← Documentación maestra (5 secciones)
│   • Stack tecnológico, arquitectura, sistemas C, audio, historia
│   • USO: Fetch sección por sección con preguntas específicas
│
├── open-watcom-guide.pdf      ← Manual compilador Watcom
│   • Opciones compilación, linker, modo DOS
│   • USO: Consultar para flags -bt=dos, -6r, -ox, etc.
│
├── CONTEXT7-AGEMKI.md         ← Este archivo (contexto completo)
│   • Overview, restricciones, arquitectura, convenciones
│   • USO: Referencia rápida durante coding
│
└── ../src/main/dat/AGEMKI_DAT_SPEC.md  
    ← Especificación formato DAT binario
    • Estructura chunks, tipos, búsqueda binaria
    • USO: Cuando genera/parsa DATs
```

### Query Examples

**¿Cómo parseo un CHUNK TABLE?**
→ Lee `CONTEXT7-AGEMKI.md` sección "Formato DAT"

**¿Cuáles son las flags de compilación Watcom?**
→ Fetch `open-watcom-guide.pdf` + `agemki-doc-v32.txt` sección "1.2 Motor C"

**¿Cómo funciona el timer del motor?**
→ Fetch `agemki-doc-v32.txt` sección "4.3 Problema resuelto: timer del engine"

**¿Cuáles son los nuevos triggers v32?**
→ Lee `CONTEXT7-AGEMKI.md` sección "ScriptEditor (v32 con nuevos triggers)"

---

## 📋 Quick Reference: Valores Importantes

| Parámetro | Valor | Ubicación |
|-----------|-------|-----------|
| Resolución | 320×200 | Modo 13h VGA |
| Paleta | 256 colores | GLBL chunk |
| Walkmap tiles | 40×25 (8×8 px cada) | ROOM chunk |
| Max simultaneous overlays | 4 | engine.c global |
| Timer IRQ | 1000Hz → 18.2Hz | timer.c chain |
| MPU-401 cola | 256 bytes circular | mpu.c |
| DAT chunk table | Búsqueda binaria O(log N) | agemki_engine.c |
| Max PCX sprite | 256×256 png (sin especificar) | Convención |
| Script running flag | `g_script_running` | agemki_engine.h |
| Usar_con mode flag | `g_usar_con_mode` | agemki_engine.h |

---

## 🚀 Checklists Comunes

### Antes de compilar
- [ ] GAME.DAT válido (magic AGMK, chunks ordenados)
- [ ] Todos los sprites PCX existen en GRAPHICS.DAT
- [ ] Verbset ID válido en SCRIPTS.DAT
- [ ] MIDI Format 0/1 en AUDIO.DAT (no XMI)
- [ ] game.json tiene paleta 256 RGB completa
- [ ] Open Watcom variables PATH configuradas

### Debugging audio
- [ ] DOSBox: `mpu401=intelligent` en dosbox.conf
- [ ] MPU-401 puerto 0x330 en BIOS VM
- [ ] AUDIO.LOG muestra eventos MIDI
- [ ] Timer chain visible en ENGINE.LOG

### Debugging video
- [ ] Modo 13h VGA (no SVGA)
- [ ] Paleta 256 colores cargada
- [ ] PCX fondos 320×200 o menores
- [ ] Sprites en bounds 256×256 máx
- [ ] ScaleZones Y-coords válidas

---

## 📞 Soporte

**Problemas comunes durante desarrollo:**
1. **"DAT file corrupted"** → Verify CRC32 en header
2. **"No sprite found"** → Check PCX_ chunk ID en GRAPHICS.DAT
3. **"Audio no suena"** → Verify mpu401=intelligent DOSBox + test AUDIO.LOG
4. **"Timer hang"** → Verify timer.c chain ISR + engine.c ISR handler
5. **"Wrong colors"** → Verify paleta en GLBL chunk (256×3 bytes RGB)

---

**Documento generado:** Marzo 2026  
**Versión:** AGEMKI v32 — Context for LLM/AI  
**Status:** En desarrollo

