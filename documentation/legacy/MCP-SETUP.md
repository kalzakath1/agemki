# MCP Server Setup — AGEMKI v32

**Componente:** Model Context Protocol Server  
**Target:** Claude + VS Code + LLM  
**Versión:** 1.0 | **Fecha:** Marzo 2026

---

## 🎯 Propósito

Amplificar capacidades de IA (Claude, Copilot) cuando programa en C90s + DOS4GW + Open Watcom para AGEMKI v32:

1. **Context7 Local** — Arquitectura AGEMKI instantáneamente
2. **Fetch Online** — Documentación Watcom oficial (GitHub, web)
3. **Best Practices** — Guías C90s + DOS + interrupts + memory

---

## 📦 Componentes Instalados

### Servidor MCP
```
mcp-servers/watcom-context/
├── index.js          ← Node.js MCP server (Claude auto-tool invocation)
├── package.json      ← Dependencias
└── README.md         ← Documentación detallada
```

### Configuración VS Code
```
.vscode/
├── settings.json     ← MCP servers config + Watcom env
├── extensions.json   ← Recomendaciones (Copilot, C++, etc.)
└── launch.json       ← Debug configs
```

### Documentación Complementaria
```
mcp-servers/
└── README.md         ← Overview MCP ecosystem
```

---

## 🚀 Quick Start

### 1. Instalar MCP Server
```bash
cd mcp-servers/watcom-context
npm install
```

### 2. Test Interactivo
```bash
npm start
```

Inicia conversación con Claude que invoca herramientas automáticamente.

### 3. Usar en VS Code

VS Code automáticamente detecta MCP via `.vscode/settings.json`:

```json
"anthropic.mcp.servers": {
  "watcom-context": {
    "command": "node",
    "args": ["${workspaceFolder}/mcp-servers/watcom-context/index.js"]
  }
}
```

En Claude Extension, pregunta normalmente:
```
"¿Cómo compilar main.c para DOS con Watcom?"
```

Claude automáticamente invoca:
- `context7_agemki(compilation_pipeline)`
- `fetch_watcom_documentation("wcc386 -bt=dos")`
- Retorna respuesta amplificada con contexto real

---

## 🛠️ Herramientas MCP Disponibles

### 1. `fetch_watcom_documentation`
**Busca documentación Open Watcom oficial**

```json
Input:
{
  "query": "¿Cómo compilar para DOS?",
  "source": "official_guide | local_pdf | man_pages | all"
}

Output:
{
  "official_sources": [
    { "name": "Open Watcom GitHub", "url": "...", "topics": [...] },
    { "name": "Open Watcom Docs", "url": "...", "topics": [...] }
  ],
  "search_recommendations": ["wcc386", "-bt=dos", "DOS4GW", ...],
  "local_pdf": "disponible en documentation/open-watcom-guide.pdf"
}
```

**Ejemplos Queries:**
- "¿Qué flags compilador para DOS?"
- "¿Cómo hacer chain ISR en DOS4GW?"
- "inline assembly Watcom sintaxis"

### 2. `context7_agemki`
**Información AGEMKI v32 compilada localmente**

```json
Input:
{
  "topic": "audio_mpu401 | motor_c | format_dat | ..."
}

Output:
{
  "file": "documentation/CONTEXT7-AGEMKI.md",
  "section": "§ Audio § 4.",
  "summary": "Resumen arquitectura",
  "details": "Detalles técnicos completos"
}
```

**Tópicos Disponibles:**
- `audio_mpu401` — Driver MPU-401 architecture
- `motor_c` — Sistemas motor C
- `format_dat` — DAT binary spec
- `inventory_v32` — Fix inventario
- `scripts_triggers` — Nuevos triggers v32
- `hardware_constraints` — 486DX2 restrictions
- `compilation_pipeline` — Flujo build

### 3. `fetch_c90s_best_practices`
**Guías programación C90s compatible DOS4GW**

```json
Input:
{
  "practice": "memory_management | dos_interrupts | inlineasm_watcom | ..."
}

Output:
{
  "title": "Gestión Memoria C90s",
  "guidelines": [
    "Usa malloc/free sparingly (evita fragmentación DOS)",
    "Prefiere stack allocation con arrays fijos",
    "Far pointers para extended memory",
    "..."
  ]
}
```

**Prácticas Disponibles:**
- `memory_management` — Malloc, far pointers, chunking
- `dos_interrupts` — INT 16h, 33h, ISR chain
- `hmm_allocation` — HMM vs DOS4GW
- `runtime_errors` — Errores comunes C90s
- `inlineasm_watcom` — Inline asm sintaxis

---

## 📊 Arquitectura Flujo

```
┌─────────────────────────────────┐
│  Developer Query (EN/ES)        │
│  "¿Cómo usar verbo inv?"        │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│ Claude recibe query             │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│ MCP Server invoca herramientas: │
│ ① context7_agemki              │
│ ② fetch_watcom_documentation   │
│ ③ fetch_c90s_best_practices    │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│ Respuestas integrales:          │
│ - Contexto AGEMKI              │
│ - Referencias Watcom oficial    │
│ - Best practices C90s           │
│ - Ejemplos código compatible    │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│ ✅ Código 486DX2 + DOS4GW       │
│    compilable con Watcom        │
└─────────────────────────────────┘
```

---

## 💡 Ejemplos Reales

### Ejemplo 1: Driver MPU-401
```
Dev: "@watcom-context ¿cómo reproducir MIDI en DOS?"

MCP invoca:
→ context7_agemki(audio_mpu401)
→ fetch_watcom_documentation("MPU-401 port 0x330")
→ fetch_c90s_best_practices("dos_interrupts")

Claude responde:
"El driver MPU-401 en AGEMKI v32:
1. Cola circular 256 bytes (mpu.c)
2. UART mode, no bloqueante
3. Puerto 0x330, INT 0x330 reservado
4. Engine_flip() llama engine_audio_update()
5. Timer @ 1000Hz → chain @ 18.2Hz motor

Para implementar:
- Alto: mididrv.c API pública
- Medio: midi.c sequencer
- Bajo: mpu.c direct I/O + interrupt handler

Watcom flags: -bt=dos -6r -ox (protegido 32-bit, velocidad)"

✅ Developer ya tiene contexto completo
```

### Ejemplo 2: Compilación Watcom
```
Dev: "¿Cuáles son los flags -bt=dos -6r -ox?"

MCP invoca:
→ fetch_watcom_documentation("-6r flags", "official_guide")
→ context7_agemki(compilation_pipeline)
→ fetch_c90s_best_practices("memory_management")

Claude responde:
"-bt=dos : Compilar para DOS extendido (no Windows)
-6r     : Procesador 386+, usar registros (32-bit)
-ox     : Optimizar para velocidad (no tamaño)

En AGEMKI v32 compilation_pipeline:
$ wcc386 -bt=dos -6r -ox main.c agemki_engine.c ...
$ wlink system dos4gw main.obj agemki_engine.obj ...
→ GAME.EXE (protegido 32-bit con DOS4GW runtime)

Referencia oficial: open-watcom.github.io/ compiler flags"

✅ Developer sabe exactamente qué hacer
```

---

## 🔄 Integración Completa

**Three-tier contexto para IA:**

```
Tier 1: .instructions.md
├─ Restricciones hardware
├─ Stack tecnológico
├─ Arquitectura 4 zonas
└─ Pitfalls críticos

Tier 2: documentation/*.md
├─ CONTEXT7-AGEMKI.md (referencia)
├─ FETCH-SYSTEM.md (tabla Q/A)
├─ agemki-doc-v32.txt (especificación)
└─ PDF Watcom (manual oficial)

Tier 3: MCP Server
├─ context7_agemki() → info local
├─ fetch_watcom_documentation() → web+local
└─ fetch_c90s_best_practices() → guías
```

---

## 🎓 Cómo Funciona MCP

**MCP = Model Context Protocol**

1. **Claude** necesita información externa
2. **MCP Server** expone "herramientas"
3. **Claude** automáticamente invoca herramientas
4. **Servidor** retorna resultados
5. **Claude** integra en respuesta

```javascript
// Dentro MCP Server:
const tools = [
  {
    name: "fetch_watcom_documentation",
    description: "Busca docs Watcom...",
    input_schema: { type: "object", properties: { ... } }
  }
];

// Claude ve `tools`, decide invocar automáticamente:
if (response.stop_reason === "tool_use") {
  for (const tool of toolUseBlocks) {
    const result = await server.processTool(tool.name, tool.input);
    // Retorna a Claude
  }
}
```

---

## 📋 Instalación Final

### 1. Dependencias
```bash
npm install -g node  # Si no lo tienes
cd mcp-servers/watcom-context
npm install
```

### 2. Extensión VS Code
Abrir `Extensions` → Buscar `GitHub Copilot` + `Claude`

### 3. Test
```bash
npm start
# Inicia conversación MCP con Claude
```

### 4. Producción
VS Code automáticamente detecta MCP via `.vscode/settings.json`

---

## ✅ Verificación

Después de setup, verifica:

- [ ] `npm start` en `mcp-servers/watcom-context/` funciona
- [ ] Claude invoca herramientas automáticamente
- [ ] `context7_agemki()` retorna info AGEMKI
- [ ] `fetch_watcom_documentation()` retorna URLs
- [ ] `fetch_c90s_best_practices()` retorna guías
- [ ] VS Code abre MCP sin errores
- [ ] Copilot en VS Code reconoce MCP

---

## 🔧 Troubleshooting

| Problema | Solución |
|----------|----------|
| "MCP not found" | Verifica path en `.vscode/settings.json` |
| "Module not found" | `npm install @anthropic-ai/sdk` |
| Claude no invoca tools | Modelo debe sopor tools (Claude 3.5+) |
| Fetch web falla | Usa `source: "local_pdf"` fallback |
| Respuestas lentas | Aumenta timeout en settings.json |

---

## 🎯 Resultado Final

### Antes (sin MCP):
```
Dev: "¿Cómo compilar para DOS?"
Claude: "Usa wcc386.exe... (vago)"
❌ Developer necesita buscar documentación
```

### Después (con MCP):
```
Dev: "¿Cómo compilar para DOS?"
Claude (MCP automático):
  → context7_agemki(compilation_pipeline)
  → fetch_watcom_documentation("wcc386 -bt=dos")
  → fetch_c90s_best_practices("memory_management")
Claude: "En AGEMKI v32:
  $ wcc386 -bt=dos -6r -ox ...
  $ wlink system dos4gw ...
  → GAME.EXE protegido 32-bit
  Referencia oficial: open-watcom.github.io/..."
✅ Developer tiene respuesta completa + referencias
```

---

**Sistema MCP Configurado** ✅  
**Context7 + Fetch + Best Practices** ✅  
**Lista para programación C90s + MS-DOS** ✅

