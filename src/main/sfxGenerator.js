/*
 * sfxGenerator.js — Convierte WAV a SFX.DAT para el engine AGEMKI
 *
 * SFX.DAT (formato "SFXD"):
 *   [0..3]   "SFXD"       magic
 *   [4..5]   num_sfx      uint16 LE
 *   [6..7]   0x0100       version
 *   TOC (num_sfx × 12 bytes, ordenado por id_crc32 ASC):
 *     [0..3]  id_crc32    uint32 LE
 *     [4..7]  offset      uint32 LE  (desde inicio del fichero)
 *     [8..11] size        uint32 LE  (bytes PCM = num_samples)
 *   DATA:
 *     PCM crudo: 8-bit unsigned, 11025 Hz, mono (concatenado)
 *
 * Los WAV origen pueden ser cualquier tasa/bits/canales.
 * La conversion los lleva a 11025 Hz mono 8-bit unsigned.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import path from 'path'

/* ------------------------------------------------------------------ */
/* CRC32 (mismo algoritmo que en datGenerator para coherencia)         */
/* ------------------------------------------------------------------ */

const _CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32str(str) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < str.length; i++)
    c = _CRC_TABLE[(c ^ str.charCodeAt(i)) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

/* ------------------------------------------------------------------ */
/* Parser WAV                                                           */
/* ------------------------------------------------------------------ */

/**
 * Parsea un buffer WAV y devuelve { sampleRate, channels, bitsPerSample, data: Buffer }
 * data contiene los bytes raw del chunk "data" en el formato original.
 * Lanza Error si el formato no es soportado.
 */
function parseWav(buf) {
  if (buf.length < 44) throw new Error('WAV demasiado pequeño')
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('No es RIFF')
  if (buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('No es WAVE')

  let pos = 12
  let fmt = null
  let data = null

  while (pos + 8 <= buf.length) {
    const tag  = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    pos += 8
    if (tag === 'fmt ') {
      const audioFmt    = buf.readUInt16LE(pos)       // 1=PCM, 3=float
      const channels    = buf.readUInt16LE(pos + 2)
      const sampleRate  = buf.readUInt32LE(pos + 4)
      const bitsPerSample = buf.readUInt16LE(pos + 14)
      if (audioFmt !== 1) throw new Error(`Formato WAV no soportado: ${audioFmt} (solo PCM=1)`)
      fmt = { channels, sampleRate, bitsPerSample }
    } else if (tag === 'data') {
      data = buf.slice(pos, pos + size)
    }
    pos += size + (size & 1)  /* padding IFF */
  }

  if (!fmt)  throw new Error('Chunk fmt no encontrado')
  if (!data) throw new Error('Chunk data no encontrado')
  if (fmt.bitsPerSample !== 8 && fmt.bitsPerSample !== 16 && fmt.bitsPerSample !== 24)
    throw new Error(`Bits por muestra no soportados: ${fmt.bitsPerSample}`)

  return { ...fmt, data }
}

/* ------------------------------------------------------------------ */
/* Conversion a 8-bit unsigned mono 11025 Hz                          */
/* ------------------------------------------------------------------ */

const TARGET_RATE = 11025

/**
 * Convierte raw PCM de cualquier formato a Float32 mono normalizado [-1, 1].
 */
function toFloatMono(raw, channels, bitsPerSample) {
  const bytes   = bitsPerSample >> 3
  const nFrames = Math.floor(raw.length / (channels * bytes))
  const out     = new Float32Array(nFrames)

  for (let i = 0; i < nFrames; i++) {
    let sample = 0
    for (let ch = 0; ch < channels; ch++) {
      const off = (i * channels + ch) * bytes
      let s
      if (bitsPerSample === 8) {
        s = (raw[off] - 128) / 128.0        // 8-bit unsigned → signed float
      } else if (bitsPerSample === 16) {
        s = raw.readInt16LE(off) / 32768.0
      } else { /* 24 */
        let v = raw[off] | (raw[off+1] << 8) | (raw[off+2] << 16)
        if (v & 0x800000) v |= 0xFF000000   // sign-extend
        s = v / 8388608.0
      }
      sample += s
    }
    out[i] = sample / channels  // mix to mono
  }
  return out
}

/**
 * Resamplea Float32 mono de srcRate a dstRate con interpolacion lineal.
 */
function resample(samples, srcRate, dstRate) {
  if (srcRate === dstRate) return samples
  const ratio   = srcRate / dstRate
  const outLen  = Math.ceil(samples.length / ratio)
  const out     = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const lo  = Math.floor(pos)
    const hi  = Math.min(lo + 1, samples.length - 1)
    const t   = pos - lo
    out[i] = samples[lo] * (1 - t) + samples[hi] * t
  }
  return out
}

/**
 * Float32 mono [-1,1] → Buffer 8-bit unsigned (0=silencio, 128=cero, 255=max)
 */
function toUint8Pcm(samples) {
  const out = Buffer.allocUnsafe(samples.length)
  for (let i = 0; i < samples.length; i++) {
    let v = Math.round(samples[i] * 127 + 128)
    if (v < 0)   v = 0
    if (v > 255) v = 255
    out[i] = v
  }
  return out
}

/**
 * WAV Buffer → PCM Buffer (8-bit unsigned, 11025Hz, mono)
 */
function wavToPcm(wavBuf) {
  const { channels, sampleRate, bitsPerSample, data } = parseWav(wavBuf)
  const floatMono  = toFloatMono(data, channels, bitsPerSample)
  const resampled  = resample(floatMono, sampleRate, TARGET_RATE)
  return toUint8Pcm(resampled)
}

/* ------------------------------------------------------------------ */
/* Escritura de SFX.DAT                                                */
/* ------------------------------------------------------------------ */

/**
 * Escribe el fichero SFX.DAT.
 * @param {Array<{id: string, pcm: Buffer}>} sfxList
 * @param {string} outPath
 */
function writeSfxDat(sfxList, outPath) {
  const N       = sfxList.length
  const TOC_OFF = 8                /* bytes de cabecera */
  const DAT_OFF = TOC_OFF + N * 12 /* primer byte de datos PCM */

  /* Ordenar por id_crc32 para busqueda binaria en el engine */
  const entries = sfxList.map(({ id, pcm }) => ({ id, pcm, crc: crc32str(id) }))
  entries.sort((a, b) => (a.crc < b.crc ? -1 : a.crc > b.crc ? 1 : 0))

  /* Calcular offsets */
  let offset = DAT_OFF
  for (const e of entries) { e.offset = offset; offset += e.pcm.length }

  const total = offset
  const out   = Buffer.alloc(total, 0)

  /* Cabecera */
  out.write('SFXD', 0, 'ascii')
  out.writeUInt16LE(N, 4)
  out.writeUInt16LE(0x0100, 6)

  /* TOC */
  for (let i = 0; i < entries.length; i++) {
    const base = TOC_OFF + i * 12
    out.writeUInt32LE(entries[i].crc,    base)
    out.writeUInt32LE(entries[i].offset, base + 4)
    out.writeUInt32LE(entries[i].pcm.length, base + 8)
  }

  /* Datos PCM */
  for (const e of entries) e.pcm.copy(out, e.offset)

  writeFileSync(outPath, out)
}

/* ------------------------------------------------------------------ */
/* Punto de entrada principal                                           */
/* ------------------------------------------------------------------ */

/**
 * generateSfxDat(gameDir, buildDir, log)
 * Lee game.json → sfx[], convierte WAVs y escribe SFX.DAT en buildDir.
 */
async function generateSfxDat(gameDir, buildDir, log) {
  const gameJsonPath = path.join(gameDir, 'game.json')
  let gameJson = {}
  try { gameJson = JSON.parse(readFileSync(gameJsonPath, 'utf8')) } catch {}

  /* Entradas explícitas de game.json.sfx[] (id + ruta wav personalizada) */
  const sfxList = gameJson.sfx || []

  /* Completar con WAVs de la carpeta audio/sfx/ que no estén ya en sfxList.
   * El id se genera a partir del nombre de fichero sin extensión en minúsculas,
   * con el prefijo "sfx_" para evitar colisiones. */
  const sfxFolder = path.join(gameDir, 'audio', 'sfx')
  if (existsSync(sfxFolder)) {
    readdirSync(sfxFolder)
      .filter(f => /\.wav$/i.test(f))
      .forEach(f => {
        const id = 'sfx_' + f.replace(/\.wav$/i, '').toLowerCase().replace(/[^a-z0-9_]/g, '_')
        /* Solo añadir si no hay ya una entrada con ese id */
        if (!sfxList.some(e => e.id === id)) {
          sfxList.push({ id, wav: path.join(sfxFolder, f) })
        }
      })
  }

  if (sfxList.length === 0) {
    log('  SFX: sin archivos WAV — SFX.DAT omitido', 'info')
    return { ok: true }
  }

  const results = []
  const errors  = []

  for (const entry of sfxList) {
    if (!entry.id || !entry.wav) {
      errors.push(`Entrada SFX sin id o wav: ${JSON.stringify(entry)}`)
      continue
    }
    const wavPath = path.isAbsolute(entry.wav)
      ? entry.wav
      : path.join(gameDir, entry.wav)

    if (!existsSync(wavPath)) {
      errors.push(`WAV no encontrado: ${wavPath}`)
      continue
    }

    try {
      const wavBuf = readFileSync(wavPath)
      const pcm    = wavToPcm(wavBuf)
      results.push({ id: entry.id, pcm })
      log(`  SFX: ${entry.id} — ${pcm.length} bytes PCM (${(pcm.length/TARGET_RATE).toFixed(2)}s)`, 'info')
    } catch (e) {
      errors.push(`Error convirtiendo ${entry.id}: ${e.message}`)
    }
  }

  if (results.length === 0) {
    const msg = errors.length ? errors[0] : 'Sin SFX validos'
    return { ok: false, error: msg, errors }
  }

  const outPath = path.join(buildDir, 'SFX.DAT')
  try {
    writeSfxDat(results, outPath)
    log(`  SFX.DAT: ${results.length} efectos → ${outPath}`, 'success')
  } catch (e) {
    return { ok: false, error: `Error escribiendo SFX.DAT: ${e.message}` }
  }

  if (errors.length) {
    errors.forEach(e => log(`  AVISO SFX: ${e}`, 'warn'))
  }

  return { ok: true, errors: errors.length ? errors : undefined }
}

export { generateSfxDat, wavToPcm, writeSfxDat }
