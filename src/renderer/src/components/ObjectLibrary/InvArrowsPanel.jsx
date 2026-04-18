/**
 * InvArrowsPanel — configura los sprites de las flechas de scroll del inventario.
 *
 * Almacena 4 sprites en game.json bajo `invArrows`:
 *   up        — flecha arriba (estado normal)
 *   upHover   — flecha arriba (cursor encima)
 *   down      — flecha abajo (estado normal)
 *   downHover — flecha abajo (cursor encima)
 *
 * El DAT Generator los empaqueta como chunks PCX_ con IDs:
 *   inv_arrow_up, inv_arrow_up_hover, inv_arrow_down, inv_arrow_down_hover
 *
 * El engine carga estos sprites en init y los renderiza en la columna ARROW_X.
 */
import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'

// ── Preview mínima de un PCX ──────────────────────────────────────────────────
function PCXPreview({ filename, gameDir, palette }) {
  const [url, setUrl]   = useState(null)
  const [size, setSize] = useState(null)

  useEffect(() => {
    if (!filename || !gameDir || !palette) { setUrl(null); setSize(null); return }
    let cancelled = false
    ;(async () => {
      const result = await window.api.readBinary(`${gameDir}/assets/converted/objects/${filename}`)
      if (cancelled || !result.ok) return
      const { pcxFileToDataURL } = await import('../../utils/pcxConverter')
      const u = pcxFileToDataURL(new Uint8Array(result.buffer), palette)
      if (cancelled) return
      setUrl(u)
      const img = new Image()
      img.onload = () => { if (!cancelled) setSize({ w: img.naturalWidth, h: img.naturalHeight }) }
      img.src = u
    })()
    return () => { cancelled = true }
  }, [filename, gameDir])

  if (!filename) return <div className="pcx-mini-preview pcx-mini-preview--empty"><span>Sin sprite</span></div>
  return (
    <div className="pcx-mini-preview">
      {url
        ? <><div className="pcx-mini-preview__canvas-wrap">
              <img src={url} alt={filename} style={{ imageRendering:'pixelated', maxWidth:'100%', maxHeight:'100%' }} />
            </div>
            {size && <span className="pcx-mini-preview__info">{size.w}×{size.h}px</span>}</>
        : <span className="pcx-mini-preview__loading">Cargando…</span>}
    </div>
  )
}

// ── Modal de selección de sprite ─────────────────────────────────────────────
function SpriteModalPicker({ gameDir, palette, onSelect, onClose }) {
  const [assets, setAssets] = useState(null)
  const [thumbs, setThumbs] = useState({})

  useEffect(() => {
    window.api.listAssets(gameDir, 'objects').then(r => {
      const files = r.ok ? r.files : []
      setAssets(files)
      files.forEach(a => {
        window.api.readBinary(a.path).then(br => {
          if (br.ok) {
            import('../../utils/pcxConverter').then(({ pcxFileToDataURL }) => {
              const url = pcxFileToDataURL(new Uint8Array(br.buffer), palette)
              setThumbs(prev => ({ ...prev, [a.name]: url }))
            })
          }
        })
      })
    })
  }, [])

  return (
    <div className="sprite-modal-overlay" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }}>
      <div className="sprite-modal" onClick={e => e.stopPropagation()}>
        <div className="sprite-modal__header">
          <span>Seleccionar sprite</span>
          <div className="sprite-modal__header-btns">
            <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          </div>
        </div>
        <div className="sprite-modal__grid">
          {assets === null && <div className="sprite-modal__empty">Cargando…</div>}
          {assets?.length === 0 && <div className="sprite-modal__empty">Sin assets. Importa uno en Asset Studio.</div>}
          {assets?.map(a => (
            <div key={a.name} className="sprite-modal__item"
              onDoubleClick={() => onSelect(a.name)}
              onClick={e => e.currentTarget.classList.toggle('selected')}>
              <div className="sprite-modal__thumb">
                {thumbs[a.name]
                  ? <img src={thumbs[a.name]} alt={a.name} style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%' }} />
                  : <span>⏳</span>}
              </div>
              <div className="sprite-modal__name" title={a.name}>{a.name}</div>
              <button className="sprite-modal__select-btn btn-primary" onClick={() => onSelect(a.name)}>✓ Usar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Picker de un sprite de flecha ─────────────────────────────────────────────
function ArrowSpritePicker({ label, value, gameDir, palette, onChange }) {
  const [showModal, setShowModal] = useState(false)
  return (
    <div className="arrow-sprite-picker">
      <div className="arrow-sprite-picker__label">{label}</div>
      <div className="arrow-sprite-picker__row">
        <span className="arrow-sprite-picker__current">{value || 'Sin sprite'}</span>
        <button className="btn-ghost" onClick={() => setShowModal(true)}>
          {value ? '✏ Cambiar' : '＋ Elegir'}
        </button>
        {value && (
          <button className="btn-icon" onClick={() => onChange(null)} title="Quitar sprite">✕</button>
        )}
      </div>
      <PCXPreview filename={value} gameDir={gameDir} palette={palette} />
      {showModal && (
        <SpriteModalPicker gameDir={gameDir} palette={palette}
          onSelect={name => { onChange(name); setShowModal(false) }}
          onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}

// ── Panel principal ───────────────────────────────────────────────────────────
export default function InvArrowsPanel() {
  const { activeGame, updateGame } = useAppStore()
  const gameDir = activeGame?.gameDir
  const game    = activeGame?.game
  const palette = game?.palette || []

  const [arrows, setArrows] = useState(null)
  const [dirty,  setDirty]  = useState(false)
  const [saved,  setSaved]  = useState(false)

  // Inicializar estado desde game.json
  useEffect(() => {
    if (!game) return
    setArrows(game.invArrows || { up: null, upHover: null, down: null, downHover: null })
    setDirty(false)
    setSaved(false)
  }, [game])

  function up(key, val) {
    setArrows(a => ({ ...a, [key]: val }))
    setDirty(true)
    setSaved(false)
  }

  async function handleSave() {
    if (!dirty || !gameDir) return
    const updatedGame = { ...game, invArrows: arrows }
    const r = await window.api.saveGame(gameDir, updatedGame)
    if (r?.ok) {
      updateGame(updatedGame)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (!game) return (
    <div className="inv-arrows-panel inv-arrows-panel--empty">
      Abre un juego para configurar las flechas de inventario.
    </div>
  )

  return (
    <div className="inv-arrows-panel">
      <div className="inv-arrows-panel__header">
        <div>
          <div className="inv-arrows-panel__title">Flechas de inventario</div>
          <div className="inv-arrows-panel__subtitle">
            Sprites para las flechas de scroll del inventario (columna central del HUD).
            Deben caber en 20×27 px. Si no se asigna sprite, se usa texto &quot;^&quot;/&quot;v&quot; por defecto.
          </div>
        </div>
        <div className="inv-arrows-panel__actions">
          {dirty && <span className="dirty-dot">● sin guardar</span>}
          {saved && <span className="inv-arrows-panel__saved">✓ guardado</span>}
          <button className="btn-primary" disabled={!dirty} onClick={handleSave}>
            💾 Guardar
          </button>
        </div>
      </div>

      {arrows && (
        <div className="inv-arrows-panel__body">
          {/* Flecha arriba */}
          <div className="inv-arrows-group">
            <div className="inv-arrows-group__title">▲ Flecha arriba</div>
            <div className="inv-arrows-group__pickers">
              <ArrowSpritePicker
                label="Normal"
                value={arrows.up}
                gameDir={gameDir}
                palette={palette}
                onChange={v => up('up', v)}
              />
              <ArrowSpritePicker
                label="Hover (cursor encima)"
                value={arrows.upHover}
                gameDir={gameDir}
                palette={palette}
                onChange={v => up('upHover', v)}
              />
            </div>
          </div>

          {/* Flecha abajo */}
          <div className="inv-arrows-group">
            <div className="inv-arrows-group__title">▼ Flecha abajo</div>
            <div className="inv-arrows-group__pickers">
              <ArrowSpritePicker
                label="Normal"
                value={arrows.down}
                gameDir={gameDir}
                palette={palette}
                onChange={v => up('down', v)}
              />
              <ArrowSpritePicker
                label="Hover (cursor encima)"
                value={arrows.downHover}
                gameDir={gameDir}
                palette={palette}
                onChange={v => up('downHover', v)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
