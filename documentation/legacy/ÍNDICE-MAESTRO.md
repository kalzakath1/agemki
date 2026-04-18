# 📚 Índice de Documentación — AGEMKI v32

**Última actualización:** 26 de marzo de 2026  
**Versión:** AGEMKI v32  
**Status:** Sistema de contexto IA configurado ✅

---

## 🗂️ Ficheros de Documentación

### 1. **LÉEME.md** ⭐ COMIENZA AQUÍ
**Idioma:** Español  
**Audiencia:** Cualquiera (IA, desarrolladores)  
**Contenido:**
- Overview general del proyecto
- Procedimiento: "Tengo una pregunta" (paso a paso)
- Stack tecnológico resumido
- Top 8 errores comunes
- Quick start para casos típicos

**Cuándo usarlo:** Primer contacto, orientación general, ejemplos.

---

### 2. **CONTEXT7-AGEMKI.md**
**Idioma:** Español  
**Audiencia:** IA generadora de código, desarrolladores técnicos  
**Contenido:**
- Descripción detallada: 4 zonas de arquitectura
- Restricciones hardware (críticas)
- Stack tecnológico completo
- Estructura ficheros: editor, motor, DAT
- Formato DAT binario (completo)
- Sistema de audio MPU-401 (v32)
- Modulos del motor C (render, verbos, pathfinding, inventario, etc.)
- Convenciones clave
- Checklist debugging
- Soporte / troubleshooting

**Cuándo usarlo:** Necesitas entender profundamente una sección específica.

---

### 3. **FETCH-SYSTEM.md**
**Idioma:** Español  
**Audiencia:** Búsqueda rápida durante desarrollo  
**Contenido:**
- Tabla de 10 secciones con +60 preguntas/respuestas
- Audio, Compilación, Motor C, DAT, Inventario, Input, Scripts, Rutas, Hardware, Debug
- Cada Q/A tiene: Pregunta | Respuesta | Fuente documento
- Shortcuts frecuentes con código ejemplo
- Índice de secciones por tema

**Cuándo usarlo:** 
- "¿Cómo reproducir MIDI?" → Búsqueda 10 segundos
- "¿Qué flags compilador Watcom?" → Tabla directa
- No necesitas leer 100 páginas, solo tabla

---

### 4. **agemki-doc-v32.txt**
**Idioma:** Español  
**Audiencia:** Referencia técnica completa  
**Contenido:**
- 8 secciones mayores (2500+ líneas)
  1. Stack tecnológico (1.1 editor, 1.2 motor, 1.3 audio)
  2. Arquitectura proyecto
  3. Motor C — sistemas implementados (10 subsecciones)
  4. Sistema audio MPU-401 (4 subsecciones, problemas históricos)
  5. Módulos UI editor (5 subsecciones)
  6. Historial versiones (v22 → v32)
  7. Pendientes (audio WAV, motor, editor)
  8. Rutas entorno desarrollo

**Cuándo usarlo:** Cuando necesitas especificación técnica profunda (no overview).

---

### 5. **open-watcom-guide.pdf**
**Idioma:** English (PDF oficial)  
**Audiencia:** Desarrolladores compilación C  
**Contenido:**
- Manual oficial Open Watcom 2.0
- Opciones compilador (wcc386)
- Opciones linker (wlink)
- Targets DOS, Windows, OS/2, QNX
- Inline assembly
- Pragmas y directivas

**Cuándo usarlo:** "¿Cuál es el flag para optimizar velocidad?" → Consulta PDF directamente.

---

### 6. **AUDIO-SOUNDCARD-GUIDE.md** ⭐ NUEVO
**Idioma:** Español  
**Audiencia:** Implementación soporte multi-tarjeta, LLM  
**Contenido:**
- Arquitectura actual MPU-401 (v32)
- Extensión multi-tarjeta (AdLib/SB/AWE32)
- Detección automática hardware
- Puertos I/O, registro mapping MIDI→OPL
- Estructura ficheros a crear (opl2.c, opl3.c, etc.)
- Checklist implementación por driver
- Integración sin cambios API externa
- Pruebas sugeridas fallback graceful

**Cuándo usarlo:** Cuando necesitas extender audio para múltiples tarjetas de sonido.

---

### 7. **AUDIO-IMPLEMENTATION-ROADMAP.md** ⭐ NUEVO
**Idioma:** Español  
**Audiencia:** Planificación implementación, LLM desarrollo  
**Contenido:**
- 8 fases de desarrollo (Preparación → Testing → Docs)
- Timeline detallado: ~126 horas total
- Desglose por driver: OPL3 (25h, PRIORITY), OPL2, AWE32, PC Speaker
- Milestones de revisión
- Riesgos y mitigaciones
- Quick start para LLM (cómo empezar ahora)
- Sprint recommendations

**Cuándo usarlo:** Cuando planificas o ejecutas la extensión audio multi-tarjeta.

---

### 8. **AUDIO-QUICK-START.md** ⭐ NUEVO
**Idioma:** Español/English  
**Audiencia:** LLM codificando OPL3 inmediatamente  
**Contenido:**
- Meta Fase 3: Detectar + Inicializar + Reproducir MIDI via OPL3
- Checklist "lo que ya existe"
- 6 pasos concretos: Estructura → Detectar → Init → Notas → Integración → Test
- Code skeleton compilable
- Tabla frecuencias MIDI→OPL (lista para pegar)
- Helpers: delay, opl_outportb, opl_inportb
- DOSBox test procedure
- Timing estimado: 2.5-3 horas
- Tips debugging + referencias
- ✅ Checklist completar Fase 3

**Cuándo usarlo:** Cuando AHORA MISMO quieres escribir OPL3.c.

---

### 9. **AGEMKI_DAT_SPEC.md**
**Ubicación:** `../src/main/dat/`  
**Idioma:** Español  
**Audiencia:** Generadores DAT, parsers  
**Contenido:**
- Estructura fichero GAME.DAT (3 secciones)
  - FILE HEADER (16 bytes)
  - CHUNK TABLE (N × 16 bytes)
  - DATA AREA
- Tipos chunk: GLBL, ROOM, CHAR, VERB, SEQU, DLNG, PCX_, FONT, MIDI, TEXT
- Búsqueda binaria (O log N)

**Cuándo usarlo:** Cuando generas/parseas GAME.DAT directamente.

---

### 9. **.instructions.md** (raíz proyecto)
**Idioma:** English/Spanish  
**Audiencia:** IA (Copilot, Custom Agent)  
**Contenido:**
- 11 secciones técnicas
- Core Mission
- Hardware constraints
- Architecture zones
- Compilation pipeline
- v32 features
- DAT format
- Communication rules
- Pitfalls
- Success criteria

**Cuándo usarlo:** IA/Copilot lee automáticamente este fichero (instrucciones agente).

---

## 🎯 Mapa de Búsqueda

### "¿Cómo...?"

| Ruta Recomendada | Sección |
|-----------------|---------|
| Reproducir MIDI | FETCH → Audio → lea agemki_audio.h |
| Compilar C para DOS | FETCH → Compilación → vea flags |
| Parsear DAT | FETCH → DAT → lea AGEMKI_DAT_SPEC.md |
| Entender inventario v32 | FETCH → Inventory → lea CONTEXT7 §3.3 |
| Generar handler verbo | FETCH → Scripts → vea ejemplo codegen |
| Debugear audio | FETCH → Debug → Audio troubleshooting checklist |
| Inicializar motor | Busca "engine_flip" en agemki_engine.c |
| Entender timer ISR | FETCH → Audio → chain ISR explanation |

### "Necesito especificación de..."

| Tema | Fichero | Sección |
|------|---------|---------|
| Format DAT | AGEMKI_DAT_SPEC.md | § FILE HEADER, CHUNK TABLE, DATA AREA |
| Motor render | agemki-doc-v32.txt | § 3.1 Render y modos |
| Audio MPU-401 | agemki-doc-v32.txt | § 4 Sistema Audio |
| Verbos | CONTEXT7-AGEMKI.md | § 3.2 Sistema verbos |
| Inventario | CONTEXT7-AGEMKI.md | § 3.3 Inventario |
| Scripts | CONTEXT7-AGEMKI.md | § ScriptEditor (v32) |
| Compilación | .instructions.md | § Compilation pipeline |

---

## 📞 Flujo de Ayuda Típico

```
Usuario: "¿Cómo reproducir MIDI?"
    ↓
1. Lee LÉEME.md (1-2 min) → Entiende contexto general
    ↓
2. Busca FETCH-SYSTEM.md tabla "Audio"
    ↓
3. Encuentra: engine_play_midi(audio_id) + source agemki_audio.h
    ↓
4. ✅ Respuesta rápida conseguida
    
Si necesita más detalles:
    ↓
5. Lee CONTEXT7-AGEMKI.md § Audio § 4.1-4.4
    ↓
6. ✅ Arquitectura completa entendida
```

---

## 🔧 Integración con IA

### Para Copilot (GitHub Copilot)
1. Lee automáticamente `.instructions.md` (raíz proyecto)
2. Tiene contexto completo de proyecto, restricciones, arquitectura
3. Pregunta: "Cómo genero handler verbo?" → Referencia .instructions. md § Success Criteria

### Para Custom Agent (si aplica)
1. Fichero de memoria: `/memories/repo/agemki-context.md`
2. Hace búsqueda semántica en documentación/
3. Fetch automático si referencia externa

### Para LLM/Claude (este contexto)
1. `.instructions.md` + `CONTEXT7-AGEMKI.md` loaded en contexto
2. FETCH-SYSTEM.md como referencia rápida
3. agemki-doc-v32.txt para detalle técnico

---

## ✨ Características del Sistema

### ✅ Completado Marzo 26, 2026
- [x] LÉEME.md — Overview español (user-friendly)
- [x] CONTEXT7-AGEMKI.md — Referencia técnica español
- [x] FETCH-SYSTEM.md — Tabla búsqueda rápida español
- [x] .instructions.md — Config IA (raíz)
- [x] Índice maestro (este fichero)

### 📋 Estructura de Ficheros
```
documentation/
├── ÍNDICE-MAESTRO.md          ← Tú estás aquí
├── LÉEME.md                   ← Comienza aquí
├── CONTEXT7-AGEMKI.md         ← Referencia técnica
├── FETCH-SYSTEM.md            ← Búsqueda rápida
├── agemki-doc-v32.txt         ← Especificación completa
├── open-watcom-guide.pdf      ← Manual Watcom
└── ../src/main/dat/
    └── AGEMKI_DAT_SPEC.md     ← Format DAT binario
```

---

## 📌 Guía Rápida para Elegir Fichero

| Pregunta | Respuesta | Fichero |
|----------|-----------|---------|
| Acabo de llegar, ¿qué leo? | Overview rápido (10 min) | **LÉEME.md** |
| Tengo una pregunta específica | Tabla 60+ Q/A | **FETCH-SYSTEM.md** |
| Necesito información profunda | Referencia técnica | **CONTEXT7-AGEMKI.md** |
| Busco especificación | Detail técnico completo | **agemki-doc-v32.txt** |
| ¿Cómo uso compilador Watcom? | Manual oficial PDF | **open-watcom-guide.pdf** |
| ¿Estructura binaria DAT? | Formato exacto bytes | **AGEMKI_DAT_SPEC.md** |
| ¿IA necesita config? | Solo IA/agentes | **.instructions.md** |

---

## 🎓 Orden de Lectura Recomendado

### Para nuevos desarrolladores (1-2 horas)
1. LÉEME.md (15 min)
2. CONTEXT7-AGEMKI.md (45 min)
3. FETCH-SYSTEM.md (30 min) — hojea tabla

### Para generación de código rápida
1. FETCH-SYSTEM.md (busca en tabla)
2. Si no encuentra → CONTEXT7-AGEMKI.md (sección temática)
3. Si aún no → agemki-doc-v32.txt (Ctrl+F palabra clave)

### Para debugging profundo
1. CONTEXT7-AGEMKI.md (§ Troubleshooting)
2. agemki-doc-v32.txt (histórico versiones)
3. Ficheros .c/.h (resources/engine/)

---

## 🚀 Próximas Mejoras (futuro)

- [ ] Diagrama ASCII de flujo compilación
- [ ] Snippets code para patrones comunes
- [ ] Video tutorial (grabación compilación)
- [ ] Interactive DAT builder (web tool)
- [ ] Debugger visual en DOSBox

---

## 📞 Soporte

Si documentación no es clara:
1. Busca patrón similar en fichero existente
2. Lee fuente .c/.h correspondiente
3. Prueba en DOSBox con logs ENGINE.LOG + AUDIO.LOG

---

**Sistema de contexto IA configurado exitosamente** ✅  
**Fecha:** 26 de marzo de 2026  
**Versión:** AGEMKI v32  
**Mantenedor:** Proyecto ACHEMKI Development

