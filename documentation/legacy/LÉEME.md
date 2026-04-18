# AGEMKI v32 — Guía de Contexto para IA

**Proyecto:** Editor de Aventuras Gráficas para MS-DOS  
**Versión:** 32 | **Fecha:** Marzo 2026  
**Target:** 486DX2 66MHz, 8MB RAM, DOS4GW

---

## 📖 ¿Qué Es AGEMKI?

**AGEMKI** = **ACHUS Game Engine Mark I**

- **Editor:** Aplicación Electron con React (Windows/Linux/macOS)
- **Motor:** Código C compilado con Open Watcom 2.0 para MS-DOS
- **Género:** Aventuras gráficas estilo LucasArts (SCUMM-compatible)
- **Target:** MS-DOS 5.0+ en máquinas 486DX2 con 8MB de RAM

### Características Principales
✅ Modo VGA 13h (320×200, 256 colores)  
✅ Sistema de verbos contextual (SCUMM)  
✅ Inventario interactivo con verbos  
✅ Diálogos no bloqueantes  
✅ Audio MIDI nativo (driver MPU-401 propio)  
✅ Pathfinding BFS en walkmap  
✅ Secuencias de eventos  
✅ Scripts compilables con triggers nuevos (v32)  

---

## 🎯 Restricciones de Hardware (CRÍTICAS)

| Parámetro | Valor | Implicación |
|-----------|-------|-----------|
| **CPU** | 486DX2 @ 66MHz | ~27-30 MIPS real → evita loops complejos |
| **RAM** | 8 MB total | DATs máximo ~2MB; sé eficiente en memoria |
| **Video** | VGA 13h (320×200) | 64KB framebuffer; sin trucos SVGA |
| **Timer** | 18.2 Hz | g_ticks_ms controla timing; chain interrupts |
| **Audio** | MPU-401 UART | Cola no bloqueante 256 bytes, flush max 32 b/frame |

**REGLA ORO:** Todo código debe funcionar en este hardware. **Sin excepciones.**

---

## 📁 ¿Dónde Encontrar Información?

### 1️⃣ Empezar Aquí (Tú lees esto)
**Archivo:** `documentation/LÉEME.md` (este)  
**Contenido:** Overview rápido, para entender contexto general  

### 2️⃣ Después: Búsqueda Rápida
**Archivo:** `documentation/FETCH-SYSTEM.md`  
**Contenido:** Tabla de preguntas → respuestas + ubicación fuente  
**USO:** "¿Cómo reproducir MIDI?" → busca tabla → encuentra respuesta + link  

### 3️⃣ Referencia Completa
**Archivo:** `documentation/CONTEXT7-AGEMKI.md`  
**Contenido:** Todo lo que necesitas saber (excepto detalles PDF)  
**USO:** Cuando FETCH no es suficiente, lee sección correspondiente  

### 4️⃣ Detalles Técnicos Profundos
**Archivo:** `documentation/agemki-doc-v32.txt`  
**Contenido:** Especificación completa del proyecto (5 secciones)  
**USO:** Cuando necesitas entender arquitectura audio, motor, historia versiones  

### 5️⃣ Compilador Watcom
**Archivo:** `documentation/open-watcom-guide.pdf`  
**Contenido:** Manual oficial Open Watcom 2.0  
**USO:** Flags compilación, opciones linker, instrucciones inline asm  

### 6️⃣ Formato DAT Binario
**Archivo:** `src/main/dat/AGEMKI_DAT_SPEC.md`  
**Contenido:** Especificación exacta del formato fichero juego  
**USO:** Cuando generas/parseas GAME.DAT  

### 7️⃣ Instrucciones Agente IA
**Archivo:** `.instructions.md` (raíz del proyecto)  
**Contenido:** Configuración para Copilot/IA — MÁS TÉCNICO  
**USO:** Cuando IA necesita contexto muy específico  

---

## 🔍 Procedimiento: Tengo una Pregunta

### ✅ PROCESO RECOMENDADO

**Paso 1:** ¿Está en FETCH-SYSTEM.md?
```
Abre: documentation/FETCH-SYSTEM.md
Busca tu pregunta en la tabla
  ✅ Si está → Lee "Respuesta" + "Fuente"
  ❌ Si no → Ir Paso 2
```

**Paso 2:** ¿Está en CONTEXT7-AGEMKI.md?
```
Abre: documentation/CONTEXT7-AGEMKI.md
Busca sección temática (Audio, Motor C, DAT, etc.)
  ✅ Si encuentras → Lee explicación detallada
  ❌ Si no → Ir Paso 3
```

**Paso 3:** ¿Está en agemki-doc-v32.txt?
```
Abre: documentation/agemki-doc-v32.txt
Busca palabra clave (Ctrl+F)
  ✅ Si encuentras → Lee sección relevante
  ❌ Si no → Preguntar directamente
```

---

## 💡 Ejemplos de Búsqueda

### Ejemplo 1: "¿Cómo reproducir MIDI?"
```
1. Abre FETCH-SYSTEM.md
2. Busca "MIDI" en tabla
3. Encuentra: "engine_play_midi(audio_id)" + fuente agemki_audio.h
4. Lee agemki_audio.h para ver firma función
✅ Resuelto en 30 segundos
```

### Ejemplo 2: "¿Cómo guardo sprites en PCX?"
```
1. Abre FETCH-SYSTEM.md
2. Busca "PCX" en tabla
3. Encuentra sección "Formato DAT" + fuente AGEMKI_DAT_SPEC.md
4. Lee AGEMKI_DAT_SPEC.md sección "PCX_"
✅ Resuelto con especificación exacta
```

### Ejemplo 3: "¿Cómo complico código con usar_con?"
```
1. Abre FETCH-SYSTEM.md
2. Busca "usar_con" en tabla
3. Encuentra: "engine_on_usar_con(inv_obj_id, target, fn)"
4. Lee agemki-doc-v32.txt sección 3.4 para flujo completo
5. Si aún dudas → lee CONTEXT7 sección "3.4 Sistema usar_con"
✅ Entiendes flujo completo
```

---

## 🏗️ Estructura del Proyecto

```
scumm-editor-v32/
┣ .instructions.md               ← Configuración IA (Copilot)
┣ src/
┃ ┣ main/
┃ ┃ ┣ index.js                 ← IPC, build system
┃ ┃ ┣ datGenerator.js          ← Genera GAME.DAT
┃ ┃ ┗ fontGenerator.js         ← PCX → bitmap fonts
┃ ┣ renderer/
┃ ┃ ┗ components/              ← UI: SpeedEditor, CharLib, ObjLib, etc.
┃ ┗ preload/
┣ resources/
┃ ┣ engine/                      ← Motor C para DOS
┃ ┃ ┣ agemki_engine.c/h        ← Core motor
┃ ┃ ┣ agemki_audio.c/h         ← Wrapper audio
┃ ┃ ┣ mididrv.c/h              ← API driver MIDI
┃ ┃ ┣ mpu.c/h                  ← MPU-401 bajo nivel
┃ ┃ ┣ midi.c/h                 ← Sequencer MIDI
┃ ┃ ┣ timer.c/h                ← Hook IRQ0 @ 1000Hz
┃ ┗ tools/                       ← DOS4GW, scripts build
┗ documentation/
  ┣ LÉEME.md                    ← Este archivo (ES)
  ┣ CONTEXT7-AGEMKI.md          ← Overview técnico (ES)
  ┣ FETCH-SYSTEM.md             ← Tabla búsqueda rápida (ES)
  ┣ agemki-doc-v32.txt          ← Especificación completa (ES)
  ┗ open-watcom-guide.pdf       ← Manual Watcom (PDF)
```

---

## 🎨 Stack Tecnológico

### Editor (Windows)
```javascript
Electron 33.0
├ Vite 5.4 (bundler)
├ React 18.3 (UI)
├ Zustand 5.0.1 (estado global)
└ Node.js (codegen)
```

### Compilador
```
Open Watcom 2.0
├ wcc386 -bt=dos -6r -ox   (compilar para DOS)
└ wlink system dos4gw      (linkear DOS4GW)
```

### Motor (DOS)
```
Protegido 32-bit
├ Modo 13h VGA: 320×200, 256 colores
├ Timer: IRQ0 @ 1000Hz (chain @ 18.2Hz motor)
├ Audio: MPU-401 @ 0x330 (UART MIDI)
├ Input: INT 16h (teclado) + INT 33h (ratón)
└ Formato DAT: tabla chunks, búsqueda binaria
```

---

## ⚡ Conceptos Clave (v32)

### Audio (NEW v32 — Matador de AIL/32)
- ❌ **Eliminado:** AIL/32 (incompatible DOS4GW)
- ✅ **Nuevo:** Driver MPU-401 propio (`mididrv.c`)
- 📋 **Componentes:** mpu.c (UART), midi.c (sequencer), timer.c (IRQ0 chain)
- 🎵 **Formato:** MIDI estandar (Format 0/1), no XMI
- 🔧 **DoSBox:** Requiere `mpu401=intelligent` en config

### Inventario FIX (v31 → v32)
- ❌ **Problema v31:** Sprites random al cambiar rooms
- ✅ **Fix v32:** Cada InvSlot tiene buffer PCX propio (`owns_buf=1`)
- 💾 **Consecuencia:** +memoria usada, pero gráficos estables

### Scripts Blocking (NEW v32)
- Durante handler: `g_script_running = 1`
- Input bloqueado (flechas, Enter, clicks)
- ESC siempre activo (pause menu)
- Bucles internos leen eventos directamente

### New Triggers (v32 ScriptEditor)
- `on_verb_inv`: Verbo sobre objeto inventario
- `on_usar_con`: Usar objeto inv CON otro objetivo
- Generan `engine_on_verb_inv()` + `engine_on_usar_con()` en codegen

---

## 🔴 Top 8 Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| Timer engine se cuelga | No chain ISR en timer.c | Verificar `_chain_intr()` cada 55 ticks |
| Sprites random en inv | Buffer compartido (v31) | Actualizar a v32 (cada slot buffer propio) |
| DAT "corrupted" | Chunks desordenados | Verificar orden lexicográfico tabla |
| No suena MIDI | Formato XMI en AUDIO.DAT | Convertir a MIDI Format 0/1 |
| No suena en DOSBox | `mpu401=intelligent` falta | Añadir a dosbox.conf |
| Scripts freezean input | No guarda `g_script_running` | Encapsula con guards en handlers |
| Watcom no compila | Flags incorrecto | Usar `-bt=dos -6r -ox` para DOS |
| Motor no carga DAT | CRC32 header inválido | Regenerar GAME.DAT desde editor |

---

## 🎓 Quick Start: Generar Código

### Caso 1: Añadir Handler Verbo
```javascript
// Fuente: FETCH-SYSTEM.md §Scripts §"¿Cómo generop handler?"
// Ubicación: src/main/index.js en build system

// Durante codegen, genera en main.c:
void on_verb_object_look_door(void) {
  engine_show_text_ex("room1.door.look", 255, 3000);  // 3 segundos
}

// Registra:
engine_on_verb_object(VERB_ID_LOOK, OBJ_ID_DOOR, on_verb_object_look_door);
```

### Caso 2: Añadir Chunk DAT
```c
// Fuente: AGEMKI_DAT_SPEC.md + FETCH-SYSTEM.md §DAT
// Ubicación: src/main/datGenerator.js

// En CHUNK TABLE:
{
  type: "MYCC",              // Tu tipo chunk (4 chars)
  id: crc32("my_custom_id"),
  offset: current_offset,
  size: data.length
}

// En DATA AREA:
// tus bytes raw (sin compresión)
```

### Caso 3: Reproducir MIDI
```c
// Fuente: FETCH-SYSTEM.md §Audio
// Ubicación: resources/engine/agemki_engine.c

// En handler de room:
void on_enter_room_tavern(void) {
  uint32_t audio_id = crc32("tavern_theme");
  engine_play_midi(audio_id);  // Carga de AUDIO.DAT
}

// En engine_flip() cada frame:
engine_audio_update();
```

---

## 📋 Checklist Antes de Compilar

Antes de presionar "Build" en el editor:

- [ ] Todos los PCX sprites existen y son < 256×256
- [ ] DAT tiene magic "AGMK" válido
- [ ] Chunks tabla ordenados lexicográficamente
- [ ] CRC32 header coincide con DATA AREA
- [ ] MIDI está en Format 0/1 (no XMI)
- [ ] game.json tiene paleta 256 RGB completa
- [ ] Watcom PATH configurado (C:\WATCOM\BINW)
- [ ] DOSBox config tiene `mpu401=intelligent`
- [ ] No hay bucles blocking en handlers (excepto scripts permitidos)

---

## 🚀 Próximos Pasos Típicos

### Si necesitas...

**→ Compilar para DOS**
1. Lee: `.instructions.md` sección "Compilation Pipeline"
2. Verifica: `wcc386 -bt=dos` flags correctos
3. Enlaza: `wlink system dos4gw`

**→ Generar nuevo tipo chunk DAT**
1. Busca: AGEMKI_DAT_SPEC.md
2. Define: estructura binaria
3. Implementa: en datGenerator.js
4. Registra: en CHUNK TABLE

**→ Añadir soporte audio**
1. Busca: FETCH-SYSTEM.md §Audio
2. Lee: agemki-doc-v32.txt §4 (architecture)
3. Usa: API mididrv.c (engine_play_midi, engine_audio_update)
4. Verifica: DOSBox config mpu401=intelligent

**→ Entender inventario nueva (v32)**
1. Lee: FETCH-SYSTEM.md §Inventory
2. Profundiza: CONTEXT7 §3.3
3. Referencia: agemki-doc-v32.txt §3.3

---

## 📞 ¿Preguntas Frecuentes?

**P: ¿Por qué 486DX2 66MHz tan viejo?**  
R: Es nostalgia del usuario. Hardware v32 está optimizado para máximo compatibilidad retro con DOS5.

**P: ¿Por qué DOS4GW no DOS4G o Phar Lap?**  
R: DOS4GW es extensor DPMI open-source, soportado por Open Watcom, compatible con 486.

**P: ¿Puedo usar XMI en AUDIO.DAT?**  
R: No. Solo MIDI Format 0/1. XMI requería AIL/32 (eliminado por incompatibilidades).

**P: ¿Watcom gratis?**  
R: Open Watcom 2.0 es open-source (github.com/open-watcom).

**P: ¿Máximo sprites por room?**  
R: Sin límite teórico, pero recuerda: ~2MB DAT, 8MB RAM total, 18.2 Hz frame rate.

**P: ¿Motor multitarea?**  
R: No. Juego simple secuencial: gameloop → input → scripts → render → audio.

---

## 🎖️ Referencias Rápidas

| Cuando necesites... | Busca en... | Sección/Tabla |
|-------------------|-----------|---------|
| Vista general | CONTEXT7-AGEMKI.md | § Overview / § Restricciones |
| Respuesta rápida | FETCH-SYSTEM.md | Tabla 10 secciones |
| Detalles profundos | agemki-doc-v32.txt | § Tema (Audio, Motor, Editor) |
| Binary format | AGEMKI_DAT_SPEC.md | § Estructura / § Tipos chunk |
| Watcom flags | open-watcom-guide.pdf | Índice / Opciones compilador |
| IA context | .instructions.md | § Arquitectura / § Pitfalls |
| Código | resources/engine/ | Ficheros .c/.h |

---

## ✅ Validación de Entendimiento

Si entiendes todo esto, puedes:
- ✅ Describir flujo compilación Electron → Watcom → DOS
- ✅ Explicar por qué timer.c hace chain ISR
- ✅ Identificar problema sprites v31 vs fix v32
- ✅ Generar código C compatible 486DX2
- ✅ Construir chunks DAT válidos
- ✅ Debuggear audio MPU-401 en DOSBox
- ✅ Responder preguntas sin leer docstring completo

Si NO puedes → **Lee CONTEXT7-AGEMKI.md** (20 minutos).

---

**Versión:** AGEMKI v32  
**Última actualización:** 26 de marzo de 2026  
**Idioma:** Español  
**Status:** ✅ Proyecto en desarrollo activo

