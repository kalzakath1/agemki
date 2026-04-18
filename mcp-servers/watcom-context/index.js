#!/usr/bin/env node

/**
 * MCP Server: Watcom Context7 + Fetch
 *
 * Servidor MCP nativo (stdio JSON-RPC) para Claude Code y otros clientes MCP.
 * Proporciona contexto para programación C90s + DOS4GW + Open Watcom en AGEMKI v32.
 *
 * Herramientas:
 *   - fetch_watcom_documentation  → Docs Open Watcom (web + PDF local)
 *   - context7_agemki             → Contexto local AGEMKI v32
 *   - fetch_c90s_best_practices   → Best practices C DOS4GW
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// Lógica de las herramientas
// ─────────────────────────────────────────────────────────────────────────────

function fetchWatcomDocumentation(query, source = "all") {
  const results = [];

  if (source === "local_pdf" || source === "all") {
    const pdfPath = path.join(
      projectRoot,
      "documentation",
      "legacy",
      "open-watcom-guide.pdf"
    );
    results.push({
      source: "local_pdf",
      path: pdfPath,
      available: fs.existsSync(pdfPath),
      hint: "Usa Read tool de Claude Code para leer el PDF directamente.",
    });
  }

  if (source === "official_guide" || source === "all") {
    results.push({
      source: "official_documentation",
      sources: [
        {
          name: "Open Watcom GitHub",
          url: "https://github.com/open-watcom/open-watcom-v2",
          topics: ["compiler", "linker", "tools"],
        },
        {
          name: "Open Watcom Docs",
          url: "https://open-watcom.github.io/",
          topics: ["usage", "reference", "c_language", "dos_mode"],
        },
        {
          name: "DOS/4GW",
          url: "https://en.wikipedia.org/wiki/DOS4GW",
          topics: ["dpmi", "protected_mode", "memory_model"],
        },
      ],
      query_hint: `Términos clave: "${query}"`,
      search_recommendations: [
        "wcc386 -bt=dos (compilar para DOS)",
        "wlink system dos4gw (linker)",
        "-6r (32-bit registros, mejor rendimiento)",
        "-ox (optimizar velocidad)",
        "inline assembly Watcom: __asm { }",
        "_chain_intr() para chain ISR",
      ],
    });
  }

  if (source === "man_pages" || source === "all") {
    results.push({
      source: "man_pages_watcom",
      available_commands: ["wcc386", "wcl386", "wlink", "wdisasm", "wstrip"],
      usage: "wcc386 -h  →  muestra help completo",
      path: "C:\\WATCOM\\BINW\\",
    });
  }

  return results;
}

function getContext7AGEMKI(topic) {
  const contextData = {
    audio_mpu401: {
      file: "resources/engine/mididrv.c",
      reference: "documentation/CONTEXT7-AGEMKI.md §Audio",
      summary: `Driver MPU-401 propio (sin dependencias externas):
- mididrv.c/h → API pública (init, load_mid, play, stop, pause, volume, process)
- mpu.c/h     → UART MPU-401 @ 0x330, cola circular 256 bytes, no bloqueante
- midi.c/h    → Parser + secuenciador MIDI Format 0/1
- timer.c/h   → Hook IRQ0 @ 1000Hz, chain al ISR motor @ 18.2Hz
Flujo: engine_audio_init() → mdrv_install() → hook IRQ0
       engine_play_midi(id) → carga DAT → mdrv_load_mid() + mdrv_play()
       engine_flip() llama engine_audio_update() → mpu_flush() (max 32 b/frame)
DOSBox: requiere mpu401=intelligent en dosbox.conf`,
    },
    motor_c: {
      file: "resources/engine/agemki_engine.c",
      reference: "documentation/CONTEXT7-AGEMKI.md §Motor C",
      summary: `Sistemas principales del motor (modo protegido 32-bit):
- Render: VGA Modo 13h, 320×200, 256 colores, framebuffer 64KB
- engine_flip(): fondo → chars → objetos → inventario → overlays → audio → VGA sync
- Verbos: SCUMM-style, hover detecta colisión rect, línea de acción
- Walkmap: bitmap 40×25 tiles (8×8px), BFS pathfinding
- ScaleZones: perspectiva lineal por Y coord
- Input: INT 16h (teclado) + INT 33h (ratón)
- g_script_running=1 bloquea input durante handlers (excepto ESC)
- InvSlots: cada uno con buffer PCX propio (owns_buf=1) — fix v32`,
    },
    format_dat: {
      file: "src/main/dat/AGEMKI_DAT_SPEC.md",
      reference: "documentation/CONTEXT7-AGEMKI.md §Formato DAT",
      summary: `Formato binario GAME.DAT (magic "AGMK"):
Estructura:
  FILE HEADER (16 bytes): magic "AGMK" | version 0x0100 | num_chunks | data_offset | CRC32
  CHUNK TABLE (N×16 bytes): [type(4), id_crc32(4), offset(4), size(4)] ×N — ORDENADO lexicográficamente
  DATA AREA: chunks consecutivos
Tipos: GLBL ROOM CHAR VERB SEQU DLNG PCX_ FONT MIDI TEXT
Búsqueda: binaria O(log N) por (type, id_crc32)
CRC32 valida DATA AREA completa`,
    },
    inventory_v32: {
      file: "resources/engine/agemki_engine.c",
      reference: "documentation/CONTEXT7-AGEMKI.md §3.3 Inventario",
      summary: `Fix crítico v31 → v32 (sprites random al cambiar room):
- Causa: InvSlots compartían puntero con sprite del objeto en room
- Fix: Cada InvSlot copia su propio buffer PCX (owns_buf=1)
- Al cambiar room: libera sprite room, inventario conserva su buffer
Nuevos triggers v32:
  engine_on_verb_inv(verb_id, inv_obj_id, fn)    → verbo sobre inv item
  engine_on_usar_con(inv_obj_id, target_id, fn)  → usar X con Y
Fallback: inv_verb → verb → default message`,
    },
    scripts_triggers: {
      file: "src/main/index.js",
      reference: "documentation/CONTEXT7-AGEMKI.md §ScriptEditor",
      summary: `Triggers disponibles en v32:
  engine_on_enter_room(room_id, fn)
  engine_on_exit_room(room_id, fn)
  engine_on_verb_object(verb_id, obj_id, fn)
  engine_on_verb_inv(verb_id, inv_obj_id, fn)    ← NUEVO v32
  engine_on_usar_con(inv_obj_id, target_id, fn)  ← NUEVO v32
Convenciones:
  - fn tiene signatura: void fn(void)
  - g_script_running=1 durante cualquier handler
  - Pending action se asigna ANTES de engine_walk_char_to_obj()
  - ESC siempre activo (menú pausa)`,
    },
    hardware_constraints: {
      file: "documentation/CONTEXT7-AGEMKI.md",
      reference: "documentation/CONTEXT7-AGEMKI.md §Restricciones Críticas",
      summary: `Target hardware 486DX2 @ 66MHz, 8MB RAM:
  CPU:   ~27-30 MIPS reales → tablas precomputadas, sin bucles O(n²)
  RAM:   640KB DOS + 7.3MB extended → DATs máx ~2MB, stack > malloc
  Video: VGA 13h (320×200, 64KB framebuffer) → sprites ≤ 256×256
  Timer: 18.2 Hz ISR → CHAIN con _chain_intr(), NUNCA reemplazar
  Audio: MPU-401 cola 256 bytes, flush máx 32 bytes/frame
  DAT:   ~2MB práctico (con 8MB RAM y DOS4GW overhead)
Top pitfalls: ISR sin chain, buffers compartidos inv, chunks DAT sin ordenar,
              MIDI en formato XMI, DOSBox sin mpu401=intelligent`,
    },
    compilation_pipeline: {
      file: "src/main/index.js",
      reference: "documentation/.instructions.md §Build Pipeline",
      summary: `Flujo completo de build:
  1. Editor (React/Zustand) → game.json + room/char/obj JSONs
  2. datGenerator.js → GAME.DAT (chunks binarios ordenados)
  3. Codegen → main.c con handlers compilados
  4. wcc386 -bt=dos -6r -ox -w=3 *.c  (compilar)
  5. wlink system dos4gw ... → GAME.EXE
  6. DOSBox-X con mpu401=intelligent

Flags Watcom:
  -bt=dos  → target DOS extendido
  -6r      → 486 modo registros (mejor rendimiento)
  -ox      → optimización velocidad máxima
  -w=3     → warnings nivel 3

Logs: build/build.log | build/watcom.log | build/ENGINE.LOG | build/AUDIO.LOG
Watcom en: C:\\WATCOM\\BINW\\`,
    },
  };

  return (
    contextData[topic] || {
      error: `Topic no encontrado: "${topic}"`,
      available_topics: Object.keys(contextData),
    }
  );
}

function getC90sBestPractices(practice) {
  const practices = {
    memory_management: {
      title: "Gestión de Memoria C90s (Watcom + DOS4GW)",
      guidelines: [
        "Prefiere stack allocation con arrays de tamaño fijo sobre malloc dinámico",
        "malloc/free escasamente: fragmenta el heap en DOS",
        "Far pointers para extended memory (modelo seg:offset ya no aplica en DOS4GW flat)",
        "Divide estructuras grandes en bloques ≤ 64KB para compatibilidad",
        "No confíes en realloc(): puede fallar en DOS con memoria fragmentada",
        "InvSlots: cada slot con su propio buffer (owns_buf=1) — ver fix v32",
        "Libera explícitamente al cambiar room o al salir del motor",
      ],
      example: `/* Stack allocation (correcto) */
char buf[320 * 200];

/* Heap (solo si necesario) */
void *p = malloc(size);
if (!p) { /* handle error */ }
free(p); p = NULL;`,
    },
    dos_interrupts: {
      title: "Interrupciones DOS (INT 16h, 33h, 08h, ISR chain)",
      guidelines: [
        "INT 08h (timer): SIEMPRE chain con _chain_intr() de Watcom",
        "INT 16h: Teclado (kbhit/getch, scan codes flechas)",
        "INT 33h AX=03h: Estado ratón (posición + botones)",
        "INT 33h AX=04h: Forzar posición cursor (sincronización teclado)",
        "ISR propia: usar pragma interrupt o __interrupt en Watcom",
        "cli/sti: protege secciones críticas que acceden a datos compartidos",
        "NUNCA sobrescribas el vector del timer — el motor depende del chain",
      ],
      example: `/* Chain ISR timer — timer.c */
void __interrupt __far timer_isr(void) {
    g_ticks_ms++;
    _chain_intr(old_timer_isr);  /* CRÍTICO: chain al ISR previo */
}`,
    },
    hmm_allocation: {
      title: "DOS4GW: Modelo de Memoria Protegido 32-bit",
      guidelines: [
        "DOS4GW (Phar Lap DPMI): modo protegido 32-bit, pointers lineales",
        "No necesitas far/huge pointers — es modelo flat de 32-bit",
        "Límite práctico: ~7.3MB extended + 640KB convencional",
        "HMA (High Memory Area): DOS4GW lo gestiona automáticamente",
        "XMS/EMS: no necesarios, DOS4GW los abstrae via DPMI",
        "Stack overflow: sin protección automática en DOS — cuidado recursión",
        "DATs máx ~2MB para dejar margen al motor y stack",
      ],
    },
    runtime_errors: {
      title: "Errores Runtime Comunes C90s (DOS)",
      guidelines: [
        "Stack overflow: sin excepción — el programa simplemente corrompe datos",
        "Buffer overflow: sin segfault en DOS real — busca corrupción silenciosa",
        "Port I/O sin permiso: en DOS real tienes acceso completo (ring 0)",
        "Timer no avanza: verifica que _chain_intr() está en el ISR",
        "Sprites corruptos en inventario: buffers compartidos (fix v32: owns_buf=1)",
        "DAT 'file corrupted': magic AGMK inválido o CRC32 incorrecto",
        "Audio silencioso: verifica mpu401=intelligent en DOSBox + AUDIO.LOG",
      ],
      debug_hints: [
        "ENGINE.LOG → eventos motor durante ejecución",
        "AUDIO.LOG → eventos MIDI y driver",
        "watcom.log → warnings/errors del compilador",
        "build.log → log del proceso de build completo",
      ],
    },
    inlineasm_watcom: {
      title: "Inline Assembly en Open Watcom (C90s)",
      guidelines: [
        "Sintaxis Watcom: __asm { instrucción; } (no asm() como GCC)",
        "Registros disponibles: EAX EBX ECX EDX ESI EDI EBP ESP",
        "Calling convention default: __cdecl (args en stack, EAX retorna)",
        "Salva registros ESI EDI EBX EBP si los modificas",
        "pragma aux: define calling conventions custom (más potente)",
        "volatile keyword para evitar que el compilador reordene",
        "outp/inp: para I/O de puertos (alternativa a __asm)",
      ],
      example: `/* Ejemplo: escribir al puerto VGA DAC */
__asm {
    mov dx, 0x3C8   ; DAC write index port
    mov al, 0       ; color index 0
    out dx, al
}

/* outp (más portable en Watcom) */
outp(0x3C8, 0);`,
    },
  };

  return (
    practices[practice] || {
      error: `Practice no encontrada: "${practice}"`,
      available_practices: Object.keys(practices),
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursos retro curados
// ─────────────────────────────────────────────────────────────────────────────

const RETRO_RESOURCES = {
  dos_programming: {
    description: "Programación general MS-DOS (interrupciones, memoria, BIOS)",
    resources: [
      {
        name: "Ralf Brown's Interrupt List (RBIL)",
        url: "https://www.ctyme.com/rbrown.htm",
        mirror: "http://www.delorie.com/djgpp/doc/rbinter/",
        description: "La referencia definitiva de interrupciones DOS/BIOS. INT 08h, 16h, 33h, etc.",
        topics: ["INT 08h timer", "INT 16h keyboard", "INT 33h mouse", "INT 21h DOS", "BIOS calls"],
      },
      {
        name: "RBIL búsqueda online",
        url: "https://www.ctyme.com/intr/int.htm",
        description: "Índice completo de interrupciones por número",
      },
      {
        name: "DOS Internals (Geoff Chappell)",
        url: "https://www.geoffchappell.com/studies/dos/",
        description: "Internals de MS-DOS, estructuras internas, PSP, MCB",
      },
      {
        name: "PC BIOS Reference",
        url: "https://stanislavs.org/helppc/",
        description: "HelpPC: referencia BIOS, DOS, hardware. Ideal para programación retro.",
        topics: ["ports", "BIOS", "DOS functions", "VGA registers", "keyboard scan codes"],
      },
    ],
  },
  vga_graphics: {
    description: "Programación VGA: Modo 13h, paleta DAC, registros, sprites",
    resources: [
      {
        name: "FreeVGA Project",
        url: "http://www.osdever.net/FreeVGA/home.htm",
        description: "Documentación completa de registros VGA. La mejor referencia para Modo 13h.",
        topics: ["mode 13h", "DAC palette", "VGA registers", "sequencer", "CRT controller"],
      },
      {
        name: "VGA/SVGA Programming (Brennan's Guide)",
        url: "http://www.delorie.com/djgpp/doc/brennan/",
        description: "Guía práctica programación VGA en modo protegido",
      },
      {
        name: "256-Color VGA Programming in C",
        url: "https://www.brackeen.com/vga/",
        description: "Tutorial completo modo 320x200x256 con código C. Muy práctico.",
        topics: ["mode 13h setup", "double buffering", "sprites", "palette animation"],
      },
      {
        name: "PCX File Format",
        url: "https://web.archive.org/web/20080703011322/http://www.qzx.com/pc-gpe/pcx.txt",
        description: "Especificación formato PCX (ZSoft). Relevante para carga de sprites.",
      },
    ],
  },
  open_watcom: {
    description: "Open Watcom 2.0: compilador, linker, opciones DOS",
    resources: [
      {
        name: "Open Watcom Documentation (oficial)",
        url: "https://open-watcom.github.io/open-watcom-v2-wikidocs/",
        description: "Wiki docs oficial Open Watcom 2.0",
        topics: ["wcc386", "wlink", "-bt=dos", "-6r", "pragma", "inline asm"],
      },
      {
        name: "Open Watcom GitHub",
        url: "https://github.com/open-watcom/open-watcom-v2",
        description: "Repositorio oficial. Issues, documentación, ejemplos.",
      },
      {
        name: "Open Watcom C Compiler User's Guide",
        url: "https://open-watcom.github.io/open-watcom-v2-wikidocs/cguide.html",
        description: "Guía completa del compilador C de Watcom",
      },
      {
        name: "DOS4GW / DPMI Reference",
        url: "https://en.wikipedia.org/wiki/DOS4GW",
        description: "Información sobre el extensor DOS4GW (Phar Lap)",
      },
      {
        name: "DPMI Specification 1.0",
        url: "http://www.delorie.com/djgpp/doc/dpmi/",
        description: "Especificación DPMI 1.0 — modo protegido desde DOS",
      },
    ],
  },
  midi_audio: {
    description: "MIDI, MPU-401, OPL2/OPL3, Sound Blaster, audio DOS",
    resources: [
      {
        name: "MPU-401 Interface Specification",
        url: "https://www.vogons.org/viewtopic.php?t=3013",
        description: "VOGONS: discusión técnica MPU-401 UART mode y intelligent mode",
      },
      {
        name: "OPL2/OPL3 FM Synthesis Guide",
        url: "https://www.fit.vutbr.cz/~arnost/opl/opl3.html",
        description: "Guía técnica completa OPL3 (Yamaha YMF262): registros, canales, operadores",
        topics: ["OPL2 YM3812", "OPL3 YMF262", "FM synthesis", "register map", "AdLib"],
      },
      {
        name: "AdLib Programming Guide",
        url: "http://www.shipbrook.net/jeff/sb.html",
        description: "Programación AdLib/OPL2 desde C",
      },
      {
        name: "MIDI File Format Specification",
        url: "http://www.music.mcgill.ca/~ich/classes/mumt306/StandardMIDIfileformat.html",
        description: "Especificación completa formato MIDI (Format 0, Format 1, Format 2)",
        topics: ["MThd", "MTrk", "delta time", "MIDI events", "SysEx"],
      },
      {
        name: "Sound Blaster Programming Guide",
        url: "http://www.inverse.it/sb/",
        description: "Guía técnica Sound Blaster (DSP, mixer, DMA, AWE32)",
        topics: ["SB16", "AWE32", "DSP commands", "DMA transfer", "mixer registers"],
      },
    ],
  },
  retro_game_dev: {
    description: "Desarrollo de juegos retro DOS: SCUMM, engines, técnicas clásicas",
    resources: [
      {
        name: "VOGONS - DOS Gaming & Programming",
        url: "https://www.vogons.org/viewforum.php?f=61",
        description: "Foro principal retro DOS programming. Mucha info sobre hardware real.",
      },
      {
        name: "Game Engine Black Book: DOOM",
        url: "https://fabiensanglard.net/gebbdoom/",
        description: "Análisis técnico profundo del motor DOOM. Técnicas renderizado DOS.",
      },
      {
        name: "Game Engine Black Book: Wolfenstein",
        url: "https://fabiensanglard.net/gebbwolf3d/",
        description: "Raycasting, VGA programming, técnicas DOS años 90",
      },
      {
        name: "SCUMM Engine Documentation (ScummVM wiki)",
        url: "https://wiki.scummvm.org/index.php/SCUMM",
        description: "Documentación del motor SCUMM original (LucasArts). Muy relevante para AGEMKI.",
        topics: ["script system", "verb interface", "walkmap", "room format", "inventory"],
      },
      {
        name: "Classic Game Dev (flipcode archive)",
        url: "https://www.flipcode.com/archives/",
        description: "Artículos clásicos de desarrollo de juegos DOS/Windows 95",
      },
    ],
  },
  x86_assembly: {
    description: "Ensamblador x86: 386/486, modo protegido, optimización",
    resources: [
      {
        name: "Intel 486 Developer's Manual",
        url: "https://archive.org/details/intel-i486-microprocessor-programmers-reference-manual-1990",
        description: "Manual oficial Intel 486. Referencia para código optimizado 486DX2.",
      },
      {
        name: "Agner Fog's Optimization Guides",
        url: "https://www.agner.org/optimize/",
        description: "Guías optimización código x86/C. Muy útil para 486DX2 @ 66MHz.",
        topics: ["instruction timing", "pipeline", "memory access", "loop optimization"],
      },
      {
        name: "x86 Instruction Reference (Felix Cloutier)",
        url: "https://www.felixcloutier.com/x86/",
        description: "Referencia completa instrucciones x86 con tiempos de ejecución",
      },
      {
        name: "Art of Assembly Language (Randall Hyde)",
        url: "https://www.plantation-productions.com/Webster/",
        description: "Libro clásico asm x86 con HLA. Conceptos válidos para programación DOS.",
      },
    ],
  },
  tools_emulation: {
    description: "Herramientas: DOSBox, DOSBox-X, emulación, debugging retro",
    resources: [
      {
        name: "DOSBox-X Wiki",
        url: "https://dosbox-x.com/wiki/",
        description: "Wiki DOSBox-X: configuración MPU-401, hardware emulado, opciones",
        topics: ["mpu401=intelligent", "VGA emulation", "sound cards", "DOS extenders"],
      },
      {
        name: "DOSBox Configuration Guide",
        url: "https://www.dosbox.com/wiki/Dosbox.conf",
        description: "Referencia completa dosbox.conf",
      },
      {
        name: "NASM Documentation",
        url: "https://www.nasm.us/doc/",
        description: "Assembler NASM: sintaxis, directivas, macros (complemento a Watcom asm)",
      },
    ],
  },
};

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
  Accept: "text/html,application/xhtml+xml",
};

// Decodifica URLs de redirección de DuckDuckGo (/l/?uddg=...)
function decodeDdgUrl(raw) {
  try {
    const m = raw.match(/uddg=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : raw;
  } catch {
    return raw;
  }
}

async function webSearch(query, maxResults = 8) {
  const results = { query, sources: [] };

  // ── 1. DuckDuckGo HTML (sin API key, sin scraping agresivo) ──────────────
  try {
    const ddgResp = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (ddgResp.ok) {
      const html = await ddgResp.text();
      const ddgResults = [];
      // Extrae pares (url, title) de los enlaces de resultados
      const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(html)) && ddgResults.length < maxResults) {
        const url = decodeDdgUrl(m[1]);
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (url && title && !url.startsWith("//duckduckgo")) {
          ddgResults.push({ title, url });
        }
      }
      // Extrae snippets (aparecen justo después de cada resultado)
      const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const snippets = [];
      while ((m = snipRe.exec(html))) {
        snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
      }
      ddgResults.forEach((r, i) => { if (snippets[i]) r.snippet = snippets[i]; });

      if (ddgResults.length > 0) {
        results.sources.push({ engine: "DuckDuckGo", results: ddgResults });
      }
    }
  } catch (_) {
    // red caída o bloqueada — continúa
  }

  // ── 2. Stack Exchange (retrocomputing + SO) — 300 req/día sin key ────────
  const seQuery = encodeURIComponent(query);
  const seSites = ["retrocomputing", "stackoverflow"];
  for (const site of seSites) {
    try {
      const seResp = await fetch(
        `https://api.stackexchange.com/2.3/search?order=desc&sort=relevance` +
          `&intitle=${seQuery}&site=${site}&pagesize=${Math.ceil(maxResults / 2)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (seResp.ok) {
        const data = await seResp.json();
        const seResults = (data.items || []).map((q) => ({
          title: q.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
          url: q.link,
          score: q.score,
          answered: q.is_answered,
          tags: q.tags,
        }));
        if (seResults.length > 0) {
          results.sources.push({ engine: `StackExchange/${site}`, results: seResults });
        }
      }
    } catch (_) {
      // continúa
    }
  }

  // ── 3. Sugerencias de búsqueda en sites retro clave ─────────────────────
  const q = query.toLowerCase();
  results.retro_search_urls = [
    {
      site: "VOGONS (DOS gaming & programming)",
      url: `https://www.vogons.org/search.php?keywords=${encodeURIComponent(query)}&fid%5B%5D=61`,
    },
    {
      site: "Archive.org (software histórico)",
      url: `https://archive.org/search?query=${encodeURIComponent(query)}`,
    },
    {
      site: "DuckDuckGo (búsqueda general)",
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    },
    ...(q.includes("watcom") || q.includes("wcc") || q.includes("wlink") ? [{
      site: "Open Watcom GitHub",
      url: `https://github.com/search?q=${encodeURIComponent(query)}+repo%3Aopen-watcom%2Fopen-watcom-v2&type=issues`,
    }] : []),
    ...(q.includes("vga") || q.includes("mode13") || q.includes("pcx") ? [{
      site: "OSDev Wiki",
      url: `https://wiki.osdev.org/index.php?search=${encodeURIComponent(query)}`,
    }] : []),
  ];
  results.retro_search_urls.push({
    tip: "Usa la herramienta 'fetch' con cualquiera de estas URLs para leer el contenido completo",
  });

  if (results.sources.length === 0) {
    results.offline_fallback = "Sin resultados online — usa search_retro_docs para recursos curados locales";
  }

  return results;
}

function searchRetroDocs(topic, keywords) {
  const topicKey = topic.toLowerCase().replace(/[^a-z_]/g, "_");

  // Búsqueda exacta por topic
  if (RETRO_RESOURCES[topicKey]) {
    const data = RETRO_RESOURCES[topicKey];
    const result = { topic: topicKey, ...data };
    if (keywords) {
      // Filtra recursos que mencionan las keywords
      result.filtered_by = keywords;
      result.resources = data.resources.filter((r) => {
        const text = JSON.stringify(r).toLowerCase();
        return keywords.toLowerCase().split(" ").some((kw) => text.includes(kw));
      });
      if (result.resources.length === 0) result.resources = data.resources;
    }
    return result;
  }

  // Búsqueda por keywords en todos los topics
  const matches = [];
  for (const [key, data] of Object.entries(RETRO_RESOURCES)) {
    const matchingResources = data.resources.filter((r) => {
      const text = JSON.stringify(r).toLowerCase();
      const searchIn = (topicKey + " " + (keywords || "")).toLowerCase();
      return searchIn.split(" ").some((kw) => kw.length > 2 && text.includes(kw));
    });
    if (matchingResources.length > 0) {
      matches.push({ topic: key, description: data.description, resources: matchingResources });
    }
  }

  if (matches.length > 0) {
    return { search_query: topic, matches };
  }

  return {
    error: `No se encontraron recursos para: "${topic}"`,
    available_topics: Object.keys(RETRO_RESOURCES),
    hint: "Usa un topic exacto o keywords como: vga, midi, watcom, dos, scumm, x86",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Definición de herramientas MCP
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "fetch_watcom_documentation",
    description:
      "Busca documentación de Open Watcom. Retorna rutas locales (PDF) y URLs oficiales con recomendaciones de búsqueda.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Término o pregunta a buscar (ej: 'wcc386 flags', '-bt=dos', 'ISR chain')",
        },
        source: {
          type: "string",
          enum: ["official_guide", "local_pdf", "man_pages", "all"],
          description:
            "Fuente: official_guide (URLs web), local_pdf (PDF local), man_pages (comandos Watcom), all (todas)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "context7_agemki",
    description:
      "Obtiene contexto técnico detallado del proyecto AGEMKI v32: arquitectura, restricciones hardware, sistemas del motor y convenciones.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: [
            "audio_mpu401",
            "motor_c",
            "format_dat",
            "inventory_v32",
            "scripts_triggers",
            "hardware_constraints",
            "compilation_pipeline",
          ],
          description:
            "Tema: audio_mpu401 | motor_c | format_dat | inventory_v32 | scripts_triggers | hardware_constraints | compilation_pipeline",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "fetch_c90s_best_practices",
    description:
      "Retorna guías de programación C90s compatibles con Open Watcom y DOS4GW: gestión memoria, interrupciones, inline asm, errores comunes.",
    inputSchema: {
      type: "object",
      properties: {
        practice: {
          type: "string",
          enum: [
            "memory_management",
            "dos_interrupts",
            "hmm_allocation",
            "runtime_errors",
            "inlineasm_watcom",
          ],
          description:
            "Práctica: memory_management | dos_interrupts | hmm_allocation | runtime_errors | inlineasm_watcom",
        },
      },
      required: ["practice"],
    },
  },
  {
    name: "web_search",
    description:
      "Búsqueda web sin API key. Usa DuckDuckGo Instant Answers + SearXNG (meta-buscador open source). Ideal para documentación retro, DOS, Watcom, VGA, MIDI, SCUMM.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Términos de búsqueda (ej: 'MPU-401 UART mode programming', 'VGA mode 13h palette DOS')",
        },
        max_results: {
          type: "number",
          description: "Máximo de resultados SearXNG (default 8)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_retro_docs",
    description:
      "Busca recursos de documentación retro curados: DOS, VGA, MIDI/MPU-401, Open Watcom, SCUMM, ensamblador x86, DOSBox. Retorna URLs y descripciones para consultar con fetch.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Tema principal: dos_programming | vga_graphics | open_watcom | midi_audio | retro_game_dev | x86_assembly | tools_emulation. También acepta keywords libres (ej: 'interrupt', 'pcx', 'scumm').",
        },
        keywords: {
          type: "string",
          description: "Keywords adicionales para filtrar recursos dentro del topic (opcional)",
        },
      },
      required: ["topic"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Servidor MCP
// ─────────────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "watcom-context", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result;
  switch (name) {
    case "fetch_watcom_documentation":
      result = fetchWatcomDocumentation(args.query, args.source ?? "all");
      break;
    case "context7_agemki":
      result = getContext7AGEMKI(args.topic);
      break;
    case "fetch_c90s_best_practices":
      result = getC90sBestPractices(args.practice);
      break;
    case "web_search":
      result = await webSearch(args.query, args.max_results ?? 8);
      break;
    case "search_retro_docs":
      result = searchRetroDocs(args.topic, args.keywords);
      break;
    default:
      return {
        content: [{ type: "text", text: `Error: herramienta desconocida "${name}"` }],
        isError: true,
      };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
