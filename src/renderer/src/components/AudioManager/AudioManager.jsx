import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import './AudioManager.css'

/* ── Reproductor global singleton ───────────────────────────── */
let _currentAudio = null
let _currentPlayingPath = null
const _listeners = new Set()

function _notifyListeners() { _listeners.forEach(fn => fn(_currentPlayingPath)) }

function stopPreview() {
  // Detener proceso del sistema (vale para MIDI y WAV)
  window.api.stopPreview?.()
  _currentPlayingPath = null
  _notifyListeners()
}

async function playPreview(filePath, onEnd) {
  stopPreview()
  _currentPlayingPath = filePath
  _notifyListeners()
  // Reproducir via proceso del sistema (PowerShell/afplay/aplay)
  // Funciona con WAV y MIDI sin restricciones de seguridad del renderer
  const r = await window.api.previewAudio?.(filePath)
  if (!r?.ok && onEnd) onEnd()
}

function useNowPlaying() {
  const [playing, setPlaying] = useState(_currentPlayingPath)
  useEffect(() => {
    const fn = (p) => setPlaying(p)
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  }, [])
  return playing
}

const AUDIO_TYPES = [
  { id: 'music',   label: 'Música',    icon: '🎵', ext: 'MID/MIDI', desc: 'Ficheros MIDI para música de fondo de rooms y secuencias' },
  { id: 'sfx',     label: 'Efectos',   icon: '🔊', ext: 'WAV',      desc: 'Efectos de sonido para acciones, objetos y verbos' },
  { id: 'voice',   label: 'Voces',     icon: '🎙',  ext: 'WAV',      desc: 'Locuciones de diálogos (opcional)' },
]

function AudioCard({ f, type, onDelete }) {
  const nowPlaying = useNowPlaying()
  const isPlaying = nowPlaying === f.path

  function handlePlay() {
    if (isPlaying) { stopPreview(); return }
    playPreview(f.path)
  }

  return (
    <div className={'audio-file-card' + (isPlaying ? ' audio-file-card--playing' : '')}>
      <button
        className={'audio-file-card__play' + (isPlaying ? ' playing' : '')}
        title={isPlaying ? 'Detener' : 'Reproducir'}
        onClick={handlePlay}
      >
        {isPlaying ? '■' : '▶'}
      </button>
      <div className="audio-file-card__info">
        <div className="audio-file-card__name" title={f.name}>{f.name}</div>
        <div className="audio-file-card__size">{f.size ? (f.size / 1024).toFixed(1) + ' KB' : ''}</div>
      </div>
      <button className="btn-icon audio-file-card__del"
        title="Eliminar" onClick={onDelete}>🗑</button>
    </div>
  )
}

function AudioFileList({ gameDir, type }) {
  const [files, setFiles]   = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [gameDir, type])

  async function load() {
    if (!gameDir) return
    setLoading(true)
    const result = await window.api.listAudioFiles(gameDir, type)
    if (result.ok) setFiles(result.files)
    setLoading(false)
  }

  async function handleImport() {
    const filters = type === 'music'
      ? [{ name: 'MIDI', extensions: ['mid', 'midi'] }]
      : [{ name: 'WAV',  extensions: ['wav'] }]
    const title = type === 'music' ? 'Importar fichero MIDI' : 'Importar fichero WAV'
    const srcPath = await window.api.openFileDialog(title, filters)
    if (!srcPath) return
    const name = srcPath.split(/[\\/]/).pop()
    const result = await window.api.importAudio(gameDir, type, srcPath, name)
    if (result.ok) load()
    else alert('Error al importar: ' + result.error)
  }

  async function handleDelete(f) {
    if (!confirm(`¿Eliminar ${f.name}?`)) return
    await window.api.deleteAsset(f.path)
    load()
  }

  return (
    <div className="audio-file-list">
      <div className="audio-file-list__toolbar">
        <button className="btn-secondary" onClick={handleImport}>
          ＋ Importar {type === 'music' ? 'MIDI' : 'WAV'}
        </button>
      </div>

      {loading && <div className="audio-empty">Cargando…</div>}
      {!loading && files.length === 0 && (
        <div className="audio-empty">Sin ficheros de audio. Importa uno.</div>
      )}

      <div className="audio-file-grid">
        {files.map(f => (
          <AudioCard key={f.path} f={f} type={type} onDelete={() => handleDelete(f)} />
        ))}
      </div>
    </div>
  )
}

export default function AudioManager() {
  const { activeGame } = useAppStore()
  const [activeType, setActiveType] = useState('music')
  const gameDir = activeGame?.gameDir
  const typeInfo = AUDIO_TYPES.find(t => t.id === activeType)

  return (
    <div className="audio-manager">
      <div className="audio-sidebar">
        <div className="audio-sidebar__title">Audio</div>
        {AUDIO_TYPES.map(t => (
          <button key={t.id}
            className={'audio-type-btn' + (activeType === t.id ? ' active' : '')}
            onClick={() => setActiveType(t.id)}>
            <span className="audio-type-btn__icon">{t.icon}</span>
            <div className="audio-type-btn__info">
              <span className="audio-type-btn__label">{t.label}</span>
              <span className="audio-type-btn__ext">{t.ext}</span>
            </div>
          </button>
        ))}

        <div className="audio-sidebar__info">
          <p>{typeInfo?.desc}</p>
          <p className="audio-sidebar__note">
            El motor MS-DOS reproduce MIDI mediante OPL2/OPL3 (AdLib/Sound Blaster).
            Los WAV se reproducen en modo PCM 8-bit mono a 22050 Hz.
          </p>
        </div>
      </div>

      <div className="audio-main">
        <div className="audio-main__header">
          <span>{typeInfo?.icon} {typeInfo?.label}</span>
          <span className="audio-main__ext">.{typeInfo?.ext}</span>
        </div>
        {gameDir
          ? <AudioFileList gameDir={gameDir} type={activeType} />
          : <div className="audio-empty">Abre un juego para gestionar el audio.</div>}
      </div>
    </div>
  )
}
