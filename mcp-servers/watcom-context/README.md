# MCP Server: Watcom Context7 + Fetch

**Propósito:** Servidor MCP para programación C90s + DOS4GW + Open Watcom en contexto AGEMKI v32

## 📦 Capacidades

### 1. **Context7 — Información Local AGEMKI v32**
Acceso rápido a documentación compilada del proyecto:
- `audio_mpu401` — Driver MPU-401 architecture
- `motor_c` — Sistemas motor C principales
- `format_dat` — Especificación DAT binario
- `inventory_v32` — Fix inventario v32
- `scripts_triggers` — Triggers nuevos v32
- `hardware_constraints` — Restricciones 486DX2
- `compilation_pipeline` — Flujo compilación

### 2. **Fetch — Documentación Watcom Oficial (Online + Local)**
Búsqueda en fuentes:
- **official_guide** — GitHub + open-watcom.org (web)
- **local_pdf** — PDF local `documentation/open-watcom-guide.pdf`
- **man_pages** — Commandos Watcom
- **all** — Todas las fuentes

### 3. **C90s Best Practices**
Guías de programación para DOS4GW:
- `memory_management` — Malloc/free, far pointers, chunking
- `dos_interrupts` — INT 16h, 33h, ISR chain
- `hmm_allocation` — HMM vs Himem vs DOS4GW
- `runtime_errors` — Errores comunes C90s
- `inlineasm_watcom` — Inline asm Watcom syntax

## 🚀 Instalación

```bash
cd mcp-servers/watcom-context
npm install
```

## ▶️ Uso

### Modo Interactivo (test)
```bash
npm start
```

Inicia:
1. Conversación con Claude
2. Invoca herramientas automáticamente
3. Respuestas mixtas local + online

### Integración VS Code + Claude Extension

```json
// .vscode/settings.json
{
  "anthropic.mcp.servers": {
    "watcom-context": {
      "command": "node",
      "args": [
        "${workspaceFolder}/mcp-servers/watcom-context/index.js"
      ]
    }
  }
}
```

Luego en Claude Extension:
```
@watcom-context "¿Cómo compilo para DOS con Open Watcom?"
```

### Ejemplos de Queries

```
// Contexto local AGEMKI
@watcom-context context7_agemki(audio_mpu401)
→ Retorna: Arquitectura driver MPU-401

// Fetch documentación Watcom
@watcom-context fetch_watcom_documentation("wcc386 flags", "official_guide")
→ Retorna: Flags compilación, URLs oficiales

// Best practices
@watcom-context fetch_c90s_best_practices("memory_management")
→ Retorna: Guías gestión memoria DOS4GW
```

## 🛠️ Herramientas Disponibles

### `fetch_watcom_documentation`
```json
{
  "query": "¿Cómo compilar para DOS?",
  "source": "official_guide | local_pdf | man_pages | all"
}
```

**Retorna:**
- URLs documentación oficial
- Ruta PDF local
- Comandos disponibles
- Recomendaciones búsqueda

### `context7_agemki`
```json
{
  "topic": "audio_mpu401 | motor_c | format_dat | inventory_v32 | ..."
}
```

**Retorna:**
- Fichero fuente
- Sección referencia
- Resumen contexto
- Detalles arquitectura

### `fetch_c90s_best_practices`
```json
{
  "practice": "memory_management | dos_interrupts | inlineasm_watcom | ..."
}
```

**Retorna:**
- Título práctica
- Guías específicas
- Ejemplos código
- Errores comunes

## 📚 Ficheros Referenciados

```
proyecto/
├── documentation/
│   ├── CONTEXT7-AGEMKI.md           ← Fuente Context7
│   ├── open-watcom-guide.pdf        ← PDF local
│   └── ...
├── src/main/dat/
│   └── AGEMKI_DAT_SPEC.md           ← DAT format
└── mcp-servers/watcom-context/      ← Este servidor
```

## 🔗 Fuentes Externas

**Open Watcom Oficial:**
- https://open-watcom.github.io/
- https://github.com/open-watcom/open-watcom-v2
- https://en.wikipedia.org/wiki/DOS4GW

**Documentación:**
- Compiler flags: `-bt=dos`, `-6r`, `-ox`, etc.
- Linking: `wlink system dos4gw`
- Opciones DOS mode protegido

## 💡 Ejemplo Completo

```javascript
// Query al servidor
const query = {
  tool: "fetch_watcom_documentation",
  input: {
    query: "¿Cómo callback de IRQ0 en DOS4GW?",
    source: "official_guide"
  }
};

// Respuesta:
{
  source: "official_documentation",
  sources: [
    {
      name: "Open Watcom Docs",
      url: "https://open-watcom.github.io/",
      topics: ["interrupt_handlers", "chain_intr", "ISR"]
    }
  ],
  search_recommendations: [
    "_chain_intr() function",
    "_dos_setvect() para hooks",
    "interrupt pragma"
  ]
}
```

## 🔧 Configuración Avanzada

### Para Copilot en VS Code
```json
{
  "github.copilot.advanced": {
    "contextProviders": ["watcom-context"],
    "maxCompletionTokens": 2048
  }
}
```

### Para Claude Direct (si MCP oficial disponible)
Detecta automáticamente `.instructions.md` + MCP servers en `mcp-servers/`

## 📋 Roadmap

- [x] Context7 local (AGEMKI v32)
- [x] Fetch Watcom docs (web + local)
- [x] C90s best practices
- [ ] Parser PDF automático (pdfjs)
- [ ] Cache responses (Redis opcional)
- [ ] Interactive IDE plugin
- [ ] Benchmark comparator (Watcom vs otros compiladores)

## 🐛 Troubleshooting

**"Node no encuentra @anthropic-ai/sdk"**
```bash
npm install @anthropic-ai/sdk
```

**"Fetch web documentación falla"**
→ Usa `source: "local_pdf"` o `source: "man_pages"`

**"Claude no invoca herramientas"**
→ Verifica que `tools` array está en create.messages y modelo soporta tools

## 📞 Soporte

1. Ejecuta `npm start` para test interactivo
2. Verifica que respuestas Context7 son correctas
3. Consulta URLs oficiales para actualizaciones Watcom

---

**Versión:** 1.0.0  
**Proyecto:** AGEMKI v32  
**Fecha:** Marzo 2026  
**Status:** Production Ready ✅

