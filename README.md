# AGEMKI — Achus Game Engine Mark I

Editor visual de aventuras gráficas estilo SCUMM para DOS.  
Stack: **Electron + React 18 + Zustand** (editor) · **C + Open Watcom** (motor DOS) · Target: **486DX2@66MHz, 8 MB RAM, DOS4GW**

---

## Requisitos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Node.js | 18 LTS | |
| npm | 9+ | incluido con Node |
| [Open Watcom](https://github.com/open-watcom/open-watcom-v2/releases/tag/Current-build) | 2.0 | solo para compilar el motor DOS |
| [DOSBox-X](https://dosbox-x.com/) | cualquier reciente | `mpu401=intelligent` para audio MIDI |

> El editor (Electron) no requiere Watcom. Solo es necesario para generar el `.EXE` del juego.

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/TU_USUARIO/agemki.git
cd agemki

# 2. Instalar dependencias del editor
npm install
```

---

## Ejecución

### Editor (modo desarrollo)

```bash
npm run dev
```

Abre la ventana de Electron con hot-reload.

### Editor (build de producción)

```bash
npm run build      # compila React + main
npm run dist       # genera instalador (NSIS en Windows, DMG en Mac, AppImage en Linux)
```

El instalador queda en `dist/`.

---

## Compilar el motor DOS

Requiere Open Watcom instalado en `C:\WATCOM\`.

```bash
# Desde el panel Build del editor (recomendado)
# O manualmente:

wcc386 -bt=dos -6r -ox -w=3 resources/engine/agemki_engine.c
wcc386 -bt=dos -6r -ox -w=3 resources/engine/mididrv.c
wcc386 -bt=dos -6r -ox -w=3 resources/engine/timer.c
# ... resto de módulos

wlink system dos4gw file { agemki_engine.obj mididrv.obj timer.obj ... } name game/GAME.EXE
```

Los logs de compilación se generan en `build/build.log` y `build/watcom.log`.

---

## Ejecutar el juego en DOSBox-X

```ini
# dosbox-x.conf
[sblaster]
sbtype=sb16

[midi]
mpu401=intelligent
mididevice=default
```

```bash
dosbox-x -conf dosbox-x.conf game/GAME.EXE
```

---

## Estructura del proyecto

```
agemki/
├── src/
│   ├── main/           # proceso principal Electron (codegen C + DAT)
│   └── renderer/       # UI React (editor visual)
├── resources/
│   └── engine/         # motor C para DOS (wcc386)
└── game/               # salida: GAME.EXE + GAME.DAT (generados, no en git)
```

---


