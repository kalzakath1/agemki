# 📚 Documentation Index — AGEMKI v32

---

## 🚀 Start Here

1. **Base:** `.instructions.md` in project root
2. **Auto-load on keyword:** Topic detected → relevant doc loads
3. **Force load:** Mention doc name explicitly (e.g., "from FETCH-SYSTEM.md...")

---

## 📖 Core Documentation

### Base (Always)
- **[.instructions.md](../.instructions.md)** — Mission, constraints, zones, pipeline, pitfalls

### Auto-Load on Keywords

**[FETCH-SYSTEM.md](FETCH-SYSTEM.md)**  
Keywords: MIDI | audio | compile | DAT | motor

**[CONTEXT7-AGEMKI.md](CONTEXT7-AGEMKI.md)**  
Keywords: "how does" | architecture | structure

**[AUDIO-GUIDE.md](AUDIO-GUIDE.md)**  
Keywords: OPL | soundcard | MIDI synthesis

### On-Demand
- **[AGEMKI_DAT_SPEC.md](../src/main/dat/AGEMKI_DAT_SPEC.md)** — Binary format
- **[legacy/](legacy/)** — Reference docs

---

##  Find by Use Case

| You need... | Go to... |
|---|---|
| Quick answer | FETCH-SYSTEM.md |
| Architecture overview | CONTEXT7-AGEMKI.md |
| Audio multi-card | AUDIO-GUIDE.md |
| Motor full specs | legacy/agemki-doc-v32.txt |
| DAT format | AGEMKI_DAT_SPEC.md |
| Debugging | FETCH-SYSTEM.md |

---

## 📁 File Structure

```
documentation/
├── .instructions.md (root)  ← Gate document
├── INDEX.md                 ← Navigation (this file)
├── FETCH-SYSTEM.md          ← Q&A lookup
├── CONTEXT7-AGEMKI.md       ← Architecture
├── AUDIO-GUIDE.md           ← Audio spec
│
└── legacy/
    ├── README.md            ← Why archived
    ├── ÍNDICE-MAESTRO.md
    ├── AUDIO-*.md
    ├── LÉEME.md
    ├── agemki-doc-v32.txt
    ├── MCP-SETUP.md
    └── open-watcom-guide.pdf

../src/main/dat/
└── AGEMKI_DAT_SPEC.md       ← DAT format spec
```

