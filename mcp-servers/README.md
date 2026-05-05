# MCP Servers — AGEMKI v32

Este directorio contiene **Model Context Protocol servers** para ampliar capacidades de Claude y otros LLMs trabajando en AGEMKI v32.

## 📁 Estructura

```
mcp-servers/
└── watcom-context/           ← MCP Server principal
    ├── index.js              ← Implementación server
    ├── package.json          ← Dependencias
    └── README.md             ← Documentación detallada
```

## 🎯 Propósito

Proporcionar a Claude/IA:
1. **Context7** — Información compilada AGEMKI v32 (local)
2. **Fetch** — Acceso a documentación Watcom oficial (online + local)
3. **Best Practices** — Guías programación C90s + DOS4GW

## 🚀 Quick Start

### 1. Instalar dependencias
```bash
cd watcom-context
npm install
```

### 2. Test interactivo
```bash
npm start
```

Inicia conversación con Claude usando herramientas MCP automáticamente.

### 3. Integración VS Code
VS Code se configura automáticamente via `.vscode/settings.json`:

```json
"anthropic.mcp.servers": {
  "watcom-context": {
    "command": "node",
    "args": ["${workspaceFolder}/mcp-servers/watcom-context/index.js"]
  }
}
```

## 🔧 Herramientas Disponibles

### `fetch_watcom_documentation`
Busca documentación Open Watcom (oficial online o local PDF):
```
Query: "¿Cómo compilar para DOS?"
Source: "official_guide" | "local_pdf" | "man_pages" | "all"
→ Retorna: URLs, PDFs, comandos disponibles
```

### `context7_agemki`
Obtiene información local del proyecto AGEMKI v32:
```
Topic: "audio_mpu401" | "motor_c" | "format_dat" | "inventory_v32" | ...
→ Retorna: Resumen arquitectura, referencias ficheros, detalles clave
```

### `fetch_c90s_best_practices`
Guías programación C90s compatible DOS4GW:
```
Practice: "memory_management" | "dos_interrupts" | "inlineasm_watcom" | ...
→ Retorna: Guías, ejemplos, errores comunes
```

## 📚 Ejemplos de Uso

### Desde Claude en VS Code
```
@watcom-context "¿Cómo funciona el driver MPU-401?"
```
→ Invoca automáticamente `context7_agemki(audio_mpu401)`

### Desde línea comando
```bash
npm start
# Inicia conversación interactiva con Claude
# Las herramientas se invocan automáticamente
```

### Desde código JavaScript
```javascript
const server = new WatcomContextMCPServer();
const result = await server.processTool(
  "fetch_watcom_documentation",
  { query: "-bt=dos flags", source: "official_guide" }
);
```

## 🔗 Integración con Ecosystem

```
.instructions.md (Context7 base)
         ↓
mcp-servers/watcom-context/ (MCP Server amplificado)
         ↓
documentation/ (Fuentes locales)
         ↓
Claude / Copilot (Recibe contexto completo)
```

## 📋 Como Instalar en Producción

1. **VS Code Extension:**
```json
// settings.json
"anthropic.mcp.servers": {
  "watcom-context": {
    "command": "node",
    "args": ["/ruta/proyecto/mcp-servers/watcom-context/index.js"]
  }
}
```

2. **Claude Desktop (si disponible):**
```json
// claude_desktop_config.json
{
  "mcpServers": {
    "watcom-context": {
      "command": "node",
      "args": ["/ruta/proyecto/mcp-servers/watcom-context/index.js"]
    }
  }
}
```

3. **Custom Integration:**
```javascript
import { WatcomContextMCPServer } from "./watcom-context/index.js";
const server = new WatcomContextMCPServer();
// Usa server.processTool() en tu aplicación
```

## ⚙️ Configuración Avanzada

### Variables Entorno
```bash
# .env
WATCOM_DOC_PATH=/path/to/open-watcom-guide.pdf
DOS4GW_SEARCH_URLS=https://open-watcom.github.io/
```

### Cache Responses
```javascript
// watcom-context/index.js (futuro)
const cacheConfig = {
  enabled: true,
  ttl: 3600000, // 1 hora
  storage: "redis" // o "memory"
};
```

## 🔄 Workflow Típico

```
1. Desarrollador: "¿Cómo manejo interrupts en DOS4GW?"
   ↓
2. Claude lee .instructions.md + invoca MCP
   ↓
3. MCP busca en:
   - Context7: Información AGEMKI timer.c
   - Fetch: Docs Watcom (INT 08h, ISR chain)
   - Best Practices: "dos_interrupts" guidelines
   ↓
4. Claude responde con:
   - Ejemplos código compatible
   - Referencias documentación oficial
   - Guías best practices
   ↓
5. Desarrollador implementa genera código MS-DOS compatible ✅
```

## 📞 Troubleshooting

| Problema | Solución |
|----------|----------|
| MCP no invoca herramientas | Verifica que modelo soporta tools (Claude 3.5+) |
| "Module not found" | `npm install @anthropic-ai/sdk` |
| Fetch web falla | Usa `source: "local_pdf"` como fallback |
| VS Code no detecta MCP | Reinicia VS Code, verifica ruta en settings.json |

## 🎓 Arquitectura Interna

```javascript
WatcomContextMCPServer
├── fetchWatcomDocumentation()     ← Online + local search
├── getContext7AGEMKI()            ← Local info
├── getC90sBestPractices()         ← Guías programación
├── processTool()                   ← Dispatcher
└── startConversation()             ← Claude interaction loop
```

## 🔮 Roadmap

- [x] Context7 local
- [x] Fetch Watcom (web schemas)
- [x] C90s best practices
- [ ] PDF parsing automático (pdfjs)
- [ ] Response caching
- [ ] Real-time Watcom docs webscrape
- [ ] Interactive debugger integration
- [ ] Performance benchmarker

## 📝 Licencia

Same as AGEMKI project

---

**Versión:** 1.0.0  
**Fecha:** Marzo 2026  
**Status:** Production Ready ✅

Para detalles completos ver `watcom-context/README.md`

