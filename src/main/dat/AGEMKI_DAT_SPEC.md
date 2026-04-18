# AGEMKI — Especificación del formato GAME.DAT
_Revisión 1.0 — ACHUS Game Engine Mark I_

## Visión general

El juego final se distribuye como dos ficheros en el mismo directorio:

```
GAME.EXE    Motor compilado (Watcom DOS4GW, modo protegido 32-bit)
GAME.DAT    Todos los assets del juego (gráficos, audio, datos, scripts)
```

El motor abre `GAME.DAT` una vez al inicio, mapea la chunk table en RAM y usa
`fseek + fread` para cargar recursos individuales bajo demanda.
**No hay descompresión** — los datos van raw para máxima velocidad de carga.

---

## Estructura del fichero

```
┌─────────────────────────────────────────┐
│  FILE HEADER   (16 bytes)               │
├─────────────────────────────────────────┤
│  CHUNK TABLE   (N × 16 bytes)           │
│  (ordenada por type+id para búsqueda    │
│   binaria O(log N))                     │
├─────────────────────────────────────────┤
│  DATA AREA                              │
│  chunk 0 data                           │
│  chunk 1 data                           │
│  ...                                    │
│  chunk N-1 data                         │
└─────────────────────────────────────────┘
```

---

## FILE HEADER (16 bytes, offset 0)

| Offset | Tamaño | Tipo     | Descripción                        |
|--------|--------|----------|------------------------------------|
| 0      | 4      | char[4]  | Magic: `"AGMK"` (0x41 0x47 0x4D 0x4B) |
| 4      | 2      | uint16_le| Versión del formato: `0x0100` (1.0)|
| 6      | 2      | uint16_le| Número de chunks (N)               |
| 8      | 4      | uint32_le| Offset al inicio del DATA AREA     |
| 12     | 4      | uint32_le| CRC32 del DATA AREA (verificación) |

---

## CHUNK TABLE (N × 16 bytes, offset 16)

Cada entrada:

| Offset | Tamaño | Tipo     | Descripción                              |
|--------|--------|----------|------------------------------------------|
| 0      | 4      | char[4]  | Tipo de chunk (ej: `"ROOM"`, `"PCX_"`)  |
| 4      | 4      | uint32_le| ID del recurso (CRC32 del string ID)     |
| 8      | 4      | uint32_le| Offset del chunk en el fichero           |
| 12     | 4      | uint32_le| Tamaño del chunk en bytes                |

La tabla está **ordenada lexicográficamente** por `(type[4], id_crc32)`.
El motor usa búsqueda binaria para localizar cualquier chunk en O(log N).

---

## Tipos de chunk

### `GLBL` — Datos globales del juego (1 chunk)

Serialización binaria de `game.json`:

```
uint16_le  longitud del nombre del juego
char[]     nombre del juego (sin null terminator)
uint8      número de idiomas
  per lang:
    char[4]  código de idioma (ej: "es\0\0", "en\0\0")
uint16_le  número de verbsets
uint32_le  CRC32 del ID del verbset activo al inicio (0 = ninguno)
uint32_le  CRC32 del ID de la secuencia de inicio (0 = ninguna)
uint8[768] paleta: 256 × [R,G,B]  (3 bytes por color)
```

### `ROOM` — Datos de una room

```
uint32_le  CRC32 del room ID (coincide con el campo id de la chunk table)
uint16_le  longitud del nombre
char[]     nombre de la room
uint16_le  ancho del fondo en pixels
uint16_le  alto del fondo en pixels
uint32_le  CRC32 del PCX_ del fondo (0 = sin fondo)
uint8      scroll habilitado (0/1)
uint16_le  scroll total W
uint16_le  scroll total H

uint8      número de entry points
  per entry:
    uint32_le  CRC32 del entry ID
    int16_le   x
    int16_le   y

uint8      número de exits
  per exit:
    uint32_le  CRC32 del exit ID
    int16_le   x, y, w, h    (8 bytes)
    uint32_le  CRC32 del room destino ID
    uint32_le  CRC32 del entry destino ID
    uint8      dirección (0=N 1=S 2=E 3=O)

uint8      número de objetos en la room
  per objeto:
    uint32_le  CRC32 del object ID
    int16_le   x, y

uint8      número de personajes iniciales en la room
  per personaje:
    uint32_le  CRC32 del char ID
    int16_le   x, y

uint32_le  CRC32 del script room_load (0 = ninguno)
uint32_le  CRC32 del script room_exit (0 = ninguno)

uint8      número de walkmaps
  per walkmap:
    uint32_le  CRC32 del walkmap ID
    uint8      número de shapes
      per shape:
        uint8      tipo (0=rect 1=poly)
        uint8      habilitado (0/1)
        uint16_le  número de vértices
          per vértice: int16_le x, int16_le y
```

### `PCX_` — Gráfico PCX (raw)

El fichero `.PCX` tal cual, sin modificar. El motor lo lee directamente con su
propio decoder PCX (formato PCX tipo 5, 256 colores, RLE).

```
<bytes raw del fichero .PCX>
```

### `OBJ_` — Definición de objeto

```
uint32_le  CRC32 del object ID
uint16_le  longitud del nombre
char[]     nombre
uint8      estado inicial (0=normal 1=usado 2=invisible)
uint8      es coleccionable (0/1)
int16_le   x, y por defecto en room (si no está en inventario)
uint32_le  CRC32 del PCX_ del sprite (0 = sin sprite)
uint16_le  sprite frame width (0 = PCX entero)
uint8      número de verbos habilitados
  per verbo:
    uint16_le  longitud del verb ID
    char[]     verb ID
    uint32_le  CRC32 del script que se activa
```

### `CHR_` — Definición de personaje

```
uint32_le  CRC32 del char ID
uint16_le  longitud del nombre
char[]     nombre
uint8      es protagonista (0/1)
uint8      walkSpeed (1-10)
uint32_le  CRC32 del PCX_ del spritesheet por defecto
uint16_le  frame width del sprite
int16_le   anchor offset Y (desde los pies)
uint32_le  CRC32 del diálogo por defecto (0 = ninguno)

uint8      número de animaciones
  per animación:
    char[16]   ID de la animación (null-padded)
    uint32_le  CRC32 del PCX_ del spritesheet
    uint16_le  frame width
    uint8      frames totales
    uint8      fps
    uint8      loop (0/1)

uint8      número de dialogue conditions
  per condition:
    char[32]   flag ID (null-padded)
    uint8      valor esperado (0/1)
    uint32_le  CRC32 del diálogo
```

### `DLG_` — Árbol de diálogo

```
uint32_le  CRC32 del dialogue ID
uint16_le  número de nodos
  per nodo:
    char[32]   node ID (null-padded)
    uint8      tipo (0=line 1=choice 2=condition 3=end)
    uint32_le  CRC32 del locale key del texto (LOCL)
    uint32_le  CRC32 del nodo siguiente (0 = fin)
    uint8      número de opciones / condiciones
      per opción (si tipo=choice):
        uint32_le  CRC32 locale key
        uint32_le  CRC32 del nodo destino
      per condición (si tipo=condition):
        char[32]   flag ID
        uint8      valor
        uint32_le  CRC32 del nodo si true
        uint32_le  CRC32 del nodo si false
```

### `SEQ_` — Secuencia de pasos

```
uint32_le  CRC32 del sequence ID
uint16_le  número de pasos
  per paso:
    uint8      opcode (ver tabla de opcodes de secuencia)
    <params>   parámetros según el opcode
```

**Opcodes de secuencia:**

| Opcode | Nombre       | Parámetros                                        |
|--------|--------------|---------------------------------------------------|
| 0x01   | WAIT         | uint16_le ms                                      |
| 0x02   | SHOW_TEXT    | uint32_le locale_crc, uint8 font, uint16_le duration_ms, uint8 position |
| 0x03   | SCROLL_TEXT  | uint32_le locale_crc, uint8 font, uint16_le speed, int16_le y_start, int16_le y_end, int16_le x_center, int8 angle, uint8[3] color_rgb |
| 0x04   | FADE_IN      | uint16_le ms                                      |
| 0x05   | FADE_OUT     | uint16_le ms                                      |
| 0x06   | PLAY_MIDI    | uint32_le midi_crc                                |
| 0x07   | STOP_MIDI    | (sin parámetros)                                  |
| 0x08   | PLAY_SFX     | uint32_le sfx_crc                                 |
| 0x09   | SHOW_IMAGE   | uint32_le pcx_crc, int16_le x, int16_le y         |
| 0x0A   | HIDE_IMAGE   | (sin parámetros)                                  |
| 0x0B   | MOVE_CHAR    | uint32_le char_crc, int16_le x, int16_le y        |
| 0x0C   | CALL_SCRIPT  | uint32_le script_crc                              |
| 0x0D   | SET_FLAG     | char[32] flag, uint8 value                        |
| 0x0E   | GOTO_ROOM    | uint32_le room_crc, uint32_le entry_crc           |
| 0xFF   | END          | (fin de secuencia)                                |

### `SCR_` — Script compilado (bytecode)

```
uint32_le  CRC32 del script ID
uint8      tipo de trigger (0=verb 1=room_load 2=room_exit 3=flag 4=dialogue_end 5=sequence_end 6=attr)
<trigger params según tipo>
uint16_le  número de instrucciones
  per instrucción:
    uint8    opcode
    <params>
```

**Opcodes de instrucción:**

| Opcode | Nombre          | Parámetros                                              |
|--------|-----------------|---------------------------------------------------------|
| 0x01   | SET_FLAG        | char[32] flag, uint8 value                              |
| 0x02   | CALL_SCRIPT     | uint32_le script_crc                                    |
| 0x03   | GOTO_ROOM       | uint32_le room_crc, uint32_le entry_crc                 |
| 0x04   | MOVE_CHAR       | uint32_le char_crc, int16_le x, int16_le y              |
| 0x05   | WALK_CHAR       | uint32_le char_crc, int16_le x, int16_le y              |
| 0x06   | PLAY_ANIM       | uint32_le char_crc, char[16] anim_id                    |
| 0x07   | SHOW_TEXT       | uint32_le locale_crc, uint8 font, uint16_le ms, uint8 pos |
| 0x08   | PLAY_MIDI       | uint32_le midi_crc                                      |
| 0x09   | STOP_MIDI       | —                                                       |
| 0x0A   | PLAY_SFX        | uint32_le sfx_crc                                       |
| 0x0B   | SET_OBJECT_STATE| uint32_le obj_crc, uint8 state                          |
| 0x0C   | ADD_INVENTORY   | uint32_le obj_crc                                       |
| 0x0D   | REMOVE_INVENTORY| uint32_le obj_crc                                       |
| 0x0E   | START_DIALOGUE  | uint32_le dlg_crc                                       |
| 0x0F   | START_SEQUENCE  | uint32_le seq_crc                                       |
| 0x10   | FADE_IN         | uint16_le ms                                            |
| 0x11   | FADE_OUT        | uint16_le ms                                            |
| 0x12   | SET_VERBSET     | uint32_le verbset_crc                                   |
| 0x13   | IF_FLAG         | char[32] flag, uint8 val, uint16_le skip_count          |
| 0x14   | SET_VAR         | char[16] var, int16_le value                            |
| 0x15   | ADD_VAR         | char[16] var, int16_le delta                            |
| 0x16   | IF_VAR          | char[16] var, uint8 op, int16_le val, uint16_le skip    |
| 0xFF   | END             | —                                                       |

### `MIDI` — Fichero MIDI (raw)

```
<bytes raw del fichero .MID>
```

### `SFX_` — Fichero de sonido (raw)

```
<bytes raw del fichero .WAV>
```

### `FONT` — Fuente bitmap

```
uint32_le  CRC32 del font ID
char[16]   nombre (null-padded)
uint8      height en pixels
uint8      primer carácter ASCII (normalmente 32 = espacio)
uint8      último carácter ASCII (normalmente 126 = ~)
uint8[]    anchos de cada carácter (último-primero+1 bytes)
uint32_le  CRC32 del PCX_ del bitmap de fuente
```

El bitmap de fuente es un PCX con todos los glifos en una sola fila horizontal.

### `LOCL` — Strings de localización

Un chunk `LOCL` por idioma:

```
char[4]    código de idioma (ej: "es\0\0")
uint16_le  número de strings
  per string:
    uint32_le  CRC32 de la clave (locale key)
    uint16_le  longitud del texto
    char[]     texto UTF-8 (sin null terminator)
```

### `VRBS` — Verbset

```
uint32_le  CRC32 del verbset ID
uint16_le  longitud del nombre
char[]     nombre
uint8      número de verbos
  per verbo:
    uint32_le  CRC32 del verb ID
    uint16_le  longitud del nombre del verbo
    char[]     nombre del verbo
    uint8      isMovement (0/1)
    int16_le   x, y, w, h del botón en la UI
```

---

## Función CRC32

El motor usa CRC32 estándar (polinomio 0xEDB88320) para convertir strings a IDs
de 32 bits. El editor usa la misma función al serializar y al generar referencias.

```c
uint32_t crc32(const char *str) {
    uint32_t crc = 0xFFFFFFFF;
    while (*str) {
        crc ^= (uint8_t)*str++;
        for (int i = 0; i < 8; i++)
            crc = (crc >> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return ~crc;
}
```

---

## Ejemplo de carga en el motor C

```c
/* Cargar una room */
uint32_t room_crc = crc32("room_1749000000001");
Chunk *c = dat_find(DAT_TYPE_ROOM, room_crc);   /* búsqueda binaria */
if (c) {
    fseek(dat_file, c->offset, SEEK_SET);
    fread(room_buf, 1, c->size, dat_file);
    room_parse(room_buf, &current_room);
}
```

---

## Notas de implementación del motor

- `GAME.DAT` se abre con `fopen("GAME.DAT", "rb")` y se mantiene abierto toda la partida.
- La chunk table entera se carga en RAM al inicio (~N×16 bytes, trivial).
- Los PCX se cachean en memoria expandida (XMS via DPMI) tras la primera carga.
- El audio (MIDI/SFX) se carga on-demand al reproducirse.
- Las rooms se cargan completas al cambiar de room; la room anterior se descarta.
