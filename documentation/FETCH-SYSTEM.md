# AGEMKI v32 — Sistema de Fetch para Documentación

**Propósito:** Referencia rápida para LLM cuando tiene dudas sobre código a generar.  
**Modo:** Busca esta tabla antes de preguntar. Si no está aquí, consulta CONTEXT7-AGEMKI.md o agemki-doc-v32.txt.

---

## 🔍 Tabla de Consultas

### **1. AUDIO / MPU-401 + MULTI-TARJETA**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Cómo inicializo audio en el motor? | `engine_audio_init(NULL, NULL, volume, sfx_volume)` | agemki_audio.h |
| ¿Cómo reproducir MIDI? | `engine_play_midi(audio_id)` carga de AUDIO.DAT | agemki_audio.h |
| ¿Qué formatos MIDI soporta? | Format 0 y Format 1 solamente | agemki-doc-v32.txt §4.1 |
| ¿Dónde se actualiza audio? | `engine_audio_update()` en `engine_flip()` cada frame | agemki-doc-v32.txt §4.2 |
| ¿Qué es la cola MPU-401? | Circular, 256 bytes, no bloqueante, flush max 32 bytes/frame | CONTEXT7 §Audio §4.1 |
| ¿Cómo funciona timer audio? | Hook IRQ0 @ 1000Hz → chain al ISR motor @ 18.2Hz | agemki-doc-v32.txt §4.3 |
| ¿Por qué se cuelga el timer? | Si ISR motor no recibe interrupciones, g_ticks_ms no avanza | agemki-doc-v32.txt §4.3 |
| ¿DOSBox necesita config? | Sí: `mpu401=intelligent` en dosbox.conf | agemki-doc-v32.txt §4.2 |
| ¿AUDIO.DAT en qué formato? | MIDI estandar (MThd), no XMI | agemki-doc-v32.txt §4.2 |
| **¿Soporta múltiples tarjetas?** | **AWE32 > OPL3 > OPL2 > MPU401 > Speaker** | **AUDIO-SOUNDCARD-GUIDE.md** |
| **¿OPL2 puerto?** | **0x388-0x389**, detección write/read test | **AUDIO-SOUNDCARD-GUIDE.md** |
| **¿OPL3 puerto?** | **0x388-0x38B**, test left+right chips | **AUDIO-SOUNDCARD-GUIDE.md** |
| **¿AWE32 puerto?** | **0x620/0x640/0x660**, read HWCF @ +0x1A | **AUDIO-SOUNDCARD-GUIDE.md** |
| **¿MIDI→OPL?** | **Note→Fnum, CC7→Level**, mapeo channels | **AUDIO-SOUNDCARD-GUIDE.md** |
| **¿OPL canales?** | **OPL2=9, OPL3=18, AWE32=32 voces** | **AUDIO-SOUNDCARD-GUIDE.md** |

### **2. COMPILACIÓN / WATCOM**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Cómo compilo para DOS? | `wcc386 -bt=dos -6r -ox -w=3 archivo.c` | agemki-doc-v32.txt §1.2 |
| ¿Qué es DOS4GW? | Extensor DPMI Phar Lap, modo protegido 32-bit | CONTEXT7 §Restricciones |
| ¿Qué opciones -bt ? | `-bt=dos` = DOS extendido, `-bt=nt` = Windows | open-watcom-guide.pdf |
| ¿-6r vs -6s vs -6? | `-6r` = 32-bit registros (mejor), `-6s` = stack, `-6` = default | open-watcom-guide.pdf |
| ¿-ox vs -os vs -ot? | `-ox` = optimizar velocidad, `-os` = tamaño, `-ot` = tiempo compilación | open-watcom-guide.pdf |
| ¿Cómo linkeo? | `wlink system dos4gw ... main.obj engine.obj ...` | agemki-doc-v32.txt §5.4 |
| ¿Qué es DIGPLAY.H? | Legacy (no usado en v32), ignorar | resources/engine/ |
| ¿Falta runtime DOS4GW? | Incluido automáticamente, en carpeta resources/tools/ | CONTEXT7 §Estructura |

### **3. MOTOR C / ENGINE**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Cuál es la resolución? | 320×200, 256 colores, modo 13h VGA | CONTEXT7 §Restricciones |
| ¿Cómo renderizo un frame? | Llamar `engine_flip()` — usa buffer global framebuffer | agemki_engine.h |
| ¿Qué son ScaleZones? | Divisiones room por Y coord con escala perspectiva lineal | agemki-doc-v32.txt §3.1 |
| ¿Cómo funciona walkmap? | Bitmap 40×25 (8×8 px cada tile), BFS para pathfinding | CONTEXT7 §3.4 |
| ¿Qué significa isMovement? | Flag verbo que hace walk al objeto antes de handler | CONTEXT7 §3.2 |
| ¿Qué es approach? | Flag verbo que hace caminar hacia objeto antes de ejecutar | CONTEXT7 §3.2 |
| ¿Cómo cargo MIDI? | `engine_dat_load_audio(audio_id)` interno, `engine_play_midi()` user-facing | agemki_audio.h |
| ¿Qué es g_script_running? | Flag = 1 durante handler, bloquea input excepto ESC | CONTEXT7 §Convenciones |
| ¿Qué es g_usar_con_mode? | Flag = 1 cuando selecciona verbo inv + obj con usar_con | agemki-doc-v32.txt §3.4 |
| ¿Cómo detecto colisiones? | Rects objeto vs mouse, usando engine rect intersect interna | agemki_engine.c |
| ¿Screen dimensions? | 320×200, pero algunos sistemas usan 40×25 tiles para pathfind | CONTEXT7 §Restricciones |

### **4. DAT / FORMATO BINARIO**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Qué es AGMK? | Magic number fichero DAT | AGEMKI_DAT_SPEC.md |
| ¿Qué contiene CHUNK TABLE? | Entradas [type, id_crc32, offset, size] ordenadas lexicográficamente | CONTEXT7 §Formato DAT |
| ¿Cómo busco chunk? | Búsqueda binaria O(log N) en CHUNK TABLE | CONTEXT7 §Formato DAT |
| ¿Qué es GLBL chunk? | Config global: name, idiomas, verbset inicial, paleta 256 RGB | AGEMKI_DAT_SPEC.md |
| ¿Qué contiene ROOM chunk? | ID, nombre, fondo, walkmap, objetos, exits, scale zones | AGEMKI_DAT_SPEC.md |
| ¿Qué contiene GRAPHICS.DAT? | Fondos PCX + sprites PCX personajes/objetos | agemki-doc-v32.txt §2.2 |
| ¿Qué es PCX_? | Tipo chunk para imágenes PCX individuales | CONTEXT7 §Formato DAT |
| ¿CRC32 para qué? | Verificar integridad DATA AREA en header + ID chunks | AGEMKI_DAT_SPEC.md |
| ¿Máx tamaño DAT? | ~2MB práctico con 8MB RAM y DOS4GW | CONTEXT7 §Restricciones |

### **5. INVENTORY / OBJETOS (v32)**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Cómo funciona inventario? | Array InvSlot, cada slot tiene buffer PCX propio (owns_buf=1) | agemki-doc-v32.txt §3.3 |
| ¿Por qué buffer propio? | Los objetos room liberan buffer al cambiar room, inv conserva copia | agemki-doc-v32.txt §3.3 |
| ¿Qué es verb_inv? | Verbo aplicado a objeto inventario, handler engine_on_verb_inv() | CONTEXT7 §ScriptEditor |
| ¿Qué es inv_verb response? | Respuesta verbo cuando obj está en inventario, fallback a verb | agemki-doc-v32.txt §3.3 |
| ¿Cómo cancelar usar_con? | Click derecho, ESC, o pulsar nuevo verbo | agemki-doc-v32.txt §3.4 |
| ¿Qué objetivos usar_con? | Otro inv item, objeto room, o personaje | agemki-doc-v32.txt §3.4 |
| ¿Cómo renderizo inventario? | Barra inferior con iconos PCX, texto nombre al hover | agemki-doc-v32.txt §3.1 |

### **6. INPUT / TECLADO (v32)**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Cómo leo teclado? | `kbhit()` + `getch()` para flechas @ KB_SPEED=4 px/evento | CONTEXT7 §3.5 |
| ¿Cómo sincronizo cursor? | INT 33h AX=04h tras mover cursor con teclado | CONTEXT7 §3.5 |
| ¿Enter = qué? | Click izquierdo (con detección flanco prev_kb) | CONTEXT7 §3.5 |
| ¿Ctrl = qué? | Click derecho (INT 16h AH=02h shift bit 2) | CONTEXT7 §3.5 |
| ¿ESC durante script? | **Siempre activo**, permite menu pausa | CONTEXT7 §3.5 |
| ¿Blocos input script? | Sí, durante g_script_running=1, excepto ESC | CONTEXT7 §3.6 |

### **7. SCRIPTS / HANDLERS**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Triggers disponibles? | on_enter_room, on_exit_room, on_verb_object, on_verb_inv, on_usar_con | CONTEXT7 §ScriptEditor |
| ¿Cómo generop handler codegen? | Crea `engine_on_verb_object(verb_id, obj_id, fn)` en main.c | agemki-doc-v32.txt §5.4 |
| ¿Cómo paso función? | Pointer `fn` con signatura `void fn(void)` | agemki_engine.h |
| ¿Qué es pending action? | Almacena walk pendiente + handler a ejecutar al llegar | CONTEXT7 §Convenciones |
| ¿Orden: pending vs walk? | Asigna pending **ANTES** de `engine_walk_char_to_obj()` | CONTEXT7 §Convenciones |
| ¿Handler + fn prioridad? | `fn != NULL` → ejecuta handler, ignora isPickup automático | CONTEXT7 §Convenciones |

### **8. RUTAS / BUILD**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Dónde está Open Watcom? | C:\WATCOM\ (variable PATH configurada) | agemki-doc-v32.txt §8 |
| ¿Build carpeta game? | `{gameDir}/build/` con GAME.EXE + GAME.DAT | CONTEXT7 §Estructura |
| ¿Dónde logs build? | `build/build.log` (stdout editor) + `build/watcom.log` (wcc386) | agemki-doc-v32.txt §8.2 |
| ¿ENGINE.LOG ubicación? | Mismo directorio que GAME.EXE (raíz {gameDir}/build/) | agemki-doc-v32.txt §8.2 |
| ¿AUDIO.LOG ubicación? | Mismo directorio que ENGINE.LOG | agemki-doc-v32.txt §8.2 |
| ¿Recursos compilación? | `resources/engine/` para motor, `resources/tools/` para DOS4GW | CONTEXT7 §Estructura |

### **9. HARDWARE / RESTRICCIONES**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Target CPU? | 486DX2 @ 66MHz ≈ 27-30 MIPS real | CONTEXT7 §Restricciones |
| ¿RAM? | 8 MB total: 640KB DOS + 7.3MB extended | CONTEXT7 §Restricciones |
| ¿Frame rate? | 18.2 Hz (1 frame per INt 08h del timer) | CONTEXT7 §Hardware |
| ¿Límite buffer? | ~2 MB para DATs | CONTEXT7 §Restricciones |
| ¿Velocidad script? | Rápida, sin bucles largos sin escaneo eventos | CONTEXT7 §Restricciones |

### **10. DEBUG / TROUBLESHOOTING**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| "DAT file corrupted" | Chequea magic AGMK + CRC32 header + orden chunks | CONTEXT7 §Troubleshooting |
| "No sprite found" | Verifica PCX_ chunk ID existe en GRAPHICS.DAT | CONTEXT7 §Troubleshooting |
| "Audio no suena" | Chequea mpu401=intelligent DOSBox + test AUDIO.LOG | CONTEXT7 §Troubleshooting |
| "Timer hang" | Verifica timer.c _chain_intr() + ISR motor handler | CONTEXT7 §Troubleshooting |
| "Wrong colors" | Verifica paleta GLBL chunk = 256×3 bytes RGB | CONTEXT7 §Troubleshooting |
| "Sprites random inv" | Fix v32: cada InvSlot buffer propio (v31 → v32) | agemki-doc-v32.txt §3.3 |

### **11. AUDIO MULTI-TARJETA (v33+)**

| Pregunta | Respuesta | Fuente |
|----------|-----------|--------|
| ¿Qué tarjetas soportar? | AWE32 > OPL3 > OPL2 > MPU401 > Speaker (fallback) | AUDIO-SOUNDCARD-GUIDE.md |
| ¿Detección automática? | mdrv_install() intenta cada una en orden prioridad | AUDIO-SOUNDCARD-GUIDE.md |
| ¿OPL2 = AdLib? | Sí, Yamaha YM3812 @ puerto 0x388-0x389 | AUDIO-SOUNDCARD-GUIDE.md |
| ¿OPL3 = Sound Blaster? | Sí, Yamaha YM262 @ puerto 0x388-0x38B | AUDIO-SOUNDCARD-GUIDE.md |
| ¿AWE32 = Sound Blaster AWE? | Sí, E-mu EMU8000 @ puerto 0x620/0x640/0x660 | AUDIO-SOUNDCARD-GUIDE.md |
| ¿Cómo detectar OPL2? | Write test 0x01, read status (bit 7 = ready) | AUDIO-SOUNDCARD-GUIDE.md |
| ¿Cómo detectar OPL3? | Test izquierdo (OPL2) + derecho (0x05→0x01) | AUDIO-SOUNDCARD-GUIDE.md |
| ¿Cómo detectar AWE32? | Read HWCF @ base+0x1A, check 0xF000==0x8000 | AUDIO-SOUNDCARD-GUIDE.md |
| ¿MIDI Note On→OPL? | Note % 12 → Fnum tabla, octave=(note-12)/12, write regs | AUDIO-SOUNDCARD-GUIDE.md |
| ¿OPL registros? | 0xA0+ch (fnum low), 0xB0+ch (fnum high+octave+keyon) | AUDIO-SOUNDCARD-GUIDE.md |
| ¿MIDI CC→OPL? | CC7→Level, CC64→Sustain, CC121→AllNotesOff | AUDIO-SOUNDCARD-GUIDE.md |
| ¿Fallback graceful? | Si hardware falla: siguiente en lista, hasta Speaker | AUDIO-SOUNDCARD-GUIDE.md |
| ¿Ficheros crear? | opl2.c/h, opl3.c/h, awe32.c/h, speaker.c/h | AUDIO-SOUNDCARD-GUIDE.md |
| ¿Modificar mididrv.c? | Reescribir mdrv_install() + router en mdrv_process() | AUDIO-SOUNDCARD-GUIDE.md |

---

## 📂 Cómo Usar Este Sistema

### Paso 1: Busca tu pregunta aquí
Si está → Lee **Respuesta** columna + **Fuente**  
Si no está → Ir Paso 2

### Paso 2: Consulta documento Fuente
- **CONTEXT7-AGEMKI.md** → Referencia rápida, overview
- **agemki-doc-v32.txt** → Detalle técnico profundo
- **open-watcom-guide.pdf** → Flags compilador Watcom
- **AGEMKI_DAT_SPEC.md** → Estructura DAT binario

### Paso 3: Si aún no encuentras
Describe exactamente qué quieres generar:
- ¿Es código C para motor o codegen en Node.js?
- ¿Afecta audio, input, render, o lógica game?
- ¿Necesitas interactuar con DAT?

---

## 🗂️ Índice de Secciones por Tema

| Tema | CONTEXT7 §? | agemki-doc-v32.txt §? |
|------|-------------|----------------------|
| Audio | §Audio | §4 |
| Compilación | §Stack | §1.2 |
| Motor C | §Motor C | §3 |
| DAT | §Formato DAT | §2.2 / AGEMKI_DAT_SPEC.md |
| Inventario | §3.3 | §3.3 |
| Input | §3.5 | §3.7 |
| Scripts | §ScriptEditor | §5.3 |
| Build | §Flow Build | §5.4 / §8 |

---

## ⚡ Shortcuts Frecuentes

> **"Necesito código que reproduce MIDI desde DAT"**
```
// Fuentes: agemki-doc-v32.txt §4.2, agemki_audio.h
engine_play_midi(audio_id);  // ID = CRC32 del MIDI en AUDIO.DAT
engine_audio_update();       // llamar cada frame desde engine_flip()
```

> **"Necesito traducir getch() en walkmap BFS"**
```
// Fuentes: CONTEXT7 §3.4, agemki-doc-v32.txt §3.5
walkmap_bfs(40*25, start_tile, target_tile, path_buf);
```

> **"Necesito generar handler verb_inv"**
```
// Fuentes: agemki-doc-v32.txt §5.3, CONTEXT7 §ScriptEditor
engine_on_verb_inv(verb_id, inv_obj_id, my_handler);
// donde my_handler(void) ejecuta la lógica
```

> **"¿Cómo detecto colisión mouse vs objeto?"**
```
// Fuentes: agemki_engine.c, CONTEXT7 §3.3
if (rect_overlaps(obj.rect, g_mouse)) { ... }
```

---

**Versión:** AGEMKI v32 — Fetch System v1.0  
**Última actualización:** Marzo 2026  
**Mantenedor:** LLM Context

