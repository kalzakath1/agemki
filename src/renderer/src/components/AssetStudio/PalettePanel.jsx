import { useState, useRef } from 'react'
import { useAppStore } from '../../store/appStore'

// ── Parser JASC-PAL (formato Aseprite) ────────────────────────────────────────
function parseJascPal(text) {
  const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines[0] !== 'JASC-PAL') {
    throw new Error(
      'Formato no reconocido. Se esperaba JASC-PAL.\n' +
      'En Aseprite: File → Export → Palette → .pal'
    )
  }
  const count = parseInt(lines[2], 10)
  if (isNaN(count) || count < 1 || count > 256) {
    throw new Error(`Número de colores inválido: "${lines[2]}"`)
  }
  const colors = []
  for (let i = 0; i < count; i++) {
    const line = lines[3 + i] || ''
    const parts = line.split(/\s+/)
    const r = parseInt(parts[0], 10)
    const g = parseInt(parts[1], 10)
    const b = parseInt(parts[2], 10)
    if ([r, g, b].some(v => isNaN(v) || v < 0 || v > 255)) {
      throw new Error(`Color inválido en línea ${4 + i}: "${line}"`)
    }
    colors.push([r, g, b])
  }
  return colors
}

// ── SlotEditor ────────────────────────────────────────────────────────────────
function SlotEditor({ slotIndex, initial, onSave, onCancel }) {
  const [r, setR] = useState(initial?.[0] ?? 128)
  const [g, setG] = useState(initial?.[1] ?? 128)
  const [b, setB] = useState(initial?.[2] ?? 128)

  const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

  function fromHex(h) {
    const m = h.replace('#', '').match(/.{2}/g)
    if (!m || m.length < 3) return
    const [rh, gh, bh] = m.map(x => parseInt(x, 16))
    if (![rh, gh, bh].some(isNaN)) { setR(rh); setG(gh); setB(bh) }
  }

  return (
    <div className="pp-slot-editor" onClick={e => e.stopPropagation()}>
      <div className="pp-slot-editor__title">Slot #{slotIndex}</div>
      <div className="pp-slot-editor__preview" style={{ background: `rgb(${r},${g},${b})` }} />
      <div className="pp-slot-editor__hex-row">
        <input type="color" value={hex} onChange={e => fromHex(e.target.value)} />
        <span className="pp-slot-editor__hex">{hex.toUpperCase()}</span>
        <span className="pp-slot-editor__rgb">rgb({r},{g},{b})</span>
      </div>
      {[
        ['R', r, setR, '#d46060'],
        ['G', g, setG, '#60c060'],
        ['B', b, setB, '#6090d4'],
      ].map(([lbl, val, set, clr]) => (
        <div key={lbl} className="pp-slot-editor__channel">
          <span style={{ color: clr, fontWeight: 700 }}>{lbl}</span>
          <input
            type="range" min={0} max={255} value={val}
            onChange={e => set(+e.target.value)}
            style={{ accentColor: clr }}
          />
          <input
            type="number" min={0} max={255} value={val}
            onChange={e => set(Math.max(0, Math.min(255, +e.target.value || 0)))}
            className="pp-slot-editor__num"
          />
        </div>
      ))}
      <div className="pp-slot-editor__actions">
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" onClick={() => onSave([r, g, b])}>Guardar</button>
      </div>
    </div>
  )
}

// ── WarningModal ──────────────────────────────────────────────────────────────
function WarningModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="pp-overlay" onClick={onCancel}>
      <div className="pp-modal" onClick={e => e.stopPropagation()}>
        <div className="pp-modal__icon">⚠</div>
        <div className="pp-modal__title">{title}</div>
        <div className="pp-modal__body">{message}</div>
        <div className="pp-modal__actions">
          <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="pp-btn-danger" onClick={onConfirm}>Continuar igualmente</button>
        </div>
      </div>
    </div>
  )
}

// ── PalettePanel ──────────────────────────────────────────────────────────────
export default function PalettePanel() {
  const { activeGame, updateGame } = useAppStore()
  const gameDir = activeGame?.gameDir
  const game    = activeGame?.game
  const palette = game?.palette || []

  const usedSlots = palette.length
  const freeSlots = 256 - usedSlots

  const [saving, setSaving]           = useState(false)
  const [importError, setImportError] = useState('')
  const [dragOver, setDragOver]       = useState(false)
  const [warning, setWarning]         = useState(null)  // { type:'import'|'edit', payload }
  const [editor, setEditor]           = useState(null)  // { slotIndex, initial }

  async function savePalette(next) {
    setSaving(true)
    try {
      const updated = { ...game, palette: next }
      const r = await window.api.saveGame(gameDir, updated)
      if (r?.ok) updateGame(updated)
    } finally {
      setSaving(false)
    }
  }

  async function handleFile(file) {
    setImportError('')
    try {
      const text = await file.text()
      const colors = parseJascPal(text)
      if (usedSlots > 0) {
        setWarning({ type: 'import', payload: colors })
      } else {
        await savePalette(colors.slice(0, 256))
      }
    } catch (e) {
      setImportError(e.message)
    }
  }

  async function handleWarningConfirm() {
    const { type, payload } = warning
    setWarning(null)
    if (type === 'import') {
      await savePalette(payload.slice(0, 256))
    } else {
      // type === 'edit': abrir editor tras confirmar aviso
      setEditor({ slotIndex: payload, initial: palette[payload] })
    }
  }

  function handleSlotClick(i) {
    if (i === 0 || i >= usedSlots) return
    setWarning({ type: 'edit', payload: i })
  }

  async function handleEditorSave(rgb) {
    const { slotIndex } = editor
    setEditor(null)
    const next = [...palette]
    if (slotIndex < next.length) {
      next[slotIndex] = rgb
    } else {
      next.push(rgb)
    }
    await savePalette(next)
  }

  if (!gameDir) {
    return (
      <div className="pp-root">
        <div className="pp-no-game">Abre un juego para gestionar su paleta.</div>
      </div>
    )
  }

  return (
    <div className="pp-root">
      {/* ── Modales ── */}
      {warning && warning.type === 'import' && (
        <WarningModal
          title="Reimportar paleta"
          message="Si importas una nueva paleta, los colores de todos los slots existentes cambiarán. Los assets ya importados dejarán de verse correctamente a menos que los reimportes uno a uno desde las imágenes originales."
          onConfirm={handleWarningConfirm}
          onCancel={() => setWarning(null)}
        />
      )}
      {warning && warning.type === 'edit' && !editor && (
        <WarningModal
          title={`Modificar slot #${warning.payload}`}
          message={`El índice ${warning.payload} puede estar en uso en assets existentes. Si cambias su color, esos assets se verán con colores incorrectos en el juego hasta que los reimportes.`}
          onConfirm={handleWarningConfirm}
          onCancel={() => setWarning(null)}
        />
      )}
      {editor && (
        <div className="pp-overlay" onClick={() => setEditor(null)}>
          <SlotEditor
            slotIndex={editor.slotIndex}
            initial={editor.initial}
            onSave={handleEditorSave}
            onCancel={() => setEditor(null)}
          />
        </div>
      )}

      {/* ── Cabecera ── */}
      <div className="pp-header">
        <div className="pp-header__info">
          <span className="pp-header__count">
            <strong>{usedSlots}</strong>/256 colores
          </span>
          {freeSlots > 0 && (
            <span className="pp-header__free">{freeSlots} libres</span>
          )}
          {usedSlots === 256 && (
            <span className="pp-header__full">Paleta completa</span>
          )}
        </div>
        <div className="pp-header__actions">
          {freeSlots > 0 && usedSlots > 0 && (
            <button className="btn-ghost pp-btn-sm" onClick={() => setEditor({ slotIndex: usedSlots, initial: null })} disabled={saving}>
              + Color
            </button>
          )}
          <label className={`btn-secondary pp-btn-sm${saving ? ' pp-btn-disabled' : ''}`}>
            Importar .pal
            <input
              type="file" accept=".pal" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = '' }}
              disabled={saving}
            />
          </label>
        </div>
      </div>

      {importError && (
        <div className="pp-error">
          <strong>Error:</strong> {importError}
        </div>
      )}

      {/* ── Contenido ── */}
      {usedSlots === 0 ? (
        <div
          className={`pp-drop ${dragOver ? 'pp-drop--over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) handleFile(f)
          }}
        >
          <span style={{ fontSize: 38, opacity: 0.4 }}>🎨</span>
          <p style={{ margin: 0, fontSize: 13 }}>No hay paleta definida</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
            Arrastra un fichero .pal de Aseprite aquí
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
            o usa el botón <strong>Importar .pal</strong>
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Aseprite: File → Export → Palette → .pal (JASC-PAL)
          </p>
        </div>
      ) : (
        <div className="pp-grid-wrap">
          <div className="pp-grid">
            {Array.from({ length: 256 }, (_, i) => {
              const color   = palette[i]
              const isEmpty = i >= usedSlots
              const isT     = i === 0
              return (
                <div
                  key={i}
                  className={[
                    'pp-slot',
                    isEmpty ? 'pp-slot--empty' : '',
                    isT     ? 'pp-slot--transp' : '',
                    !isEmpty && !isT ? 'pp-slot--used' : '',
                  ].filter(Boolean).join(' ')}
                  style={color ? { background: `rgb(${color[0]},${color[1]},${color[2]})` } : undefined}
                  title={
                    isEmpty ? `#${i} — libre`
                    : isT   ? `#0 — transparencia (reservado)`
                    :         `#${i} — rgb(${color[0]},${color[1]},${color[2]})`
                  }
                  onClick={() => handleSlotClick(i)}
                />
              )
            })}
          </div>
          <div className="pp-legend">
            <span className="pp-legend__item">
              <span className="pp-legend__dot pp-legend__dot--transp" /> #0 transparencia
            </span>
            <span className="pp-legend__item">
              <span className="pp-legend__dot pp-legend__dot--used" /> usado (clic para editar)
            </span>
            <span className="pp-legend__item">
              <span className="pp-legend__dot pp-legend__dot--empty" /> libre
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
