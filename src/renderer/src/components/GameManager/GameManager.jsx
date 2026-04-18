import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import './GameManager.css'

// ── Tarjeta de juego ─────────────────────────────────────────────────────────

function GameCard({ recent, onOpen, onRemoveRecent }) {
  const [renaming, setRenaming] = useState(false)
  const [nameValue, setNameValue] = useState(recent.name)
  const [missing, setMissing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const handleOpen = async () => {
    const result = await window.api.verifyGame(recent.gameDir)
    if (!result.ok || !result.valid) {
      setMissing(true)
      return
    }
    const read = await window.api.readGame(recent.gameDir)
    if (read.ok) onOpen(recent.gameDir, read.game)
  }

  const handleRenameStart = (e) => {
    e.stopPropagation()
    setRenaming(true)
  }

  const handleRenameConfirm = async () => {
    const trimmed = nameValue.trim()
    if (!trimmed) { setNameValue(recent.name); setRenaming(false); return }
    await window.api.renameGame(recent.gameDir, trimmed)
    useAppStore.getState().updateRecentName(recent.gameDir, trimmed)
    setRenaming(false)
  }

  const handleRenameKey = (e) => {
    if (e.key === 'Enter') handleRenameConfirm()
    if (e.key === 'Escape') { setNameValue(recent.name); setRenaming(false) }
  }

  if (missing) {
    return (
      <div className="game-card game-card--missing">
        <div className="game-card__thumb game-card__thumb--missing">
          <span>⚠</span>
        </div>
        <div className="game-card__info">
          <span className="game-card__name">{recent.name}</span>
          <span className="game-card__meta">Carpeta no encontrada</span>
          <span className="game-card__path">{recent.gameDir}</span>
        </div>
        <button
          className="btn-icon game-card__remove"
          title="Quitar de recientes"
          onClick={(e) => { e.stopPropagation(); onRemoveRecent(recent.gameDir) }}
        >✕</button>
      </div>
    )
  }

  return (
    <div className="game-card" onDoubleClick={handleOpen}>
      <div className="game-card__thumb">
        <span className="game-card__thumb-icon">🎮</span>
      </div>
      <div className="game-card__info">
        {renaming ? (
          <input
            ref={inputRef}
            className="game-card__rename-input"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={handleRenameConfirm}
            onKeyDown={handleRenameKey}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="game-card__name"
            onDoubleClick={handleRenameStart}
            title="Doble click para renombrar"
          >
            {recent.name}
          </span>
        )}
        <span className="game-card__meta">
          {recent.openedAt ? new Date(recent.openedAt).toLocaleDateString() : ''}
        </span>
        <span className="game-card__path" title={recent.gameDir}>{recent.gameDir}</span>
      </div>
      <div className="game-card__actions">
        <button className="btn-ghost game-card__open-btn" onClick={handleOpen} title="Abrir juego">
          Abrir
        </button>
        <button
          className="btn-icon game-card__remove"
          title="Quitar de recientes"
          onClick={(e) => { e.stopPropagation(); onRemoveRecent(recent.gameDir) }}
        >✕</button>
      </div>
    </div>
  )
}

// ── Modal: Nuevo juego ────────────────────────────────────────────────────────

function NewGameModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleChooseFolder = async () => {
    const path = await window.api.chooseFolder()
    if (path) setFolder(path)
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError('El juego necesita un nombre.'); return }
    if (!folder) { setError('Elige una carpeta donde guardar el juego.'); return }
    setLoading(true)
    setError('')
    const result = await window.api.createGame(folder, name.trim())
    setLoading(false)
    if (result.ok) {
      onCreate(result.gameDir, result.game)
    } else {
      setError(result.error || 'Error al crear el juego.')
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} onKeyDown={handleKey}>
        <div className="modal__header">
          <h2>Nuevo juego</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <div className="form-field">
            <label>Nombre del juego</label>
            <input
              ref={nameRef}
              type="text"
              placeholder="Mi Aventura"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Carpeta</label>
            <div className="folder-picker">
              <input
                type="text"
                placeholder="Elige una carpeta..."
                value={folder}
                readOnly
                onClick={handleChooseFolder}
                style={{ cursor: 'pointer' }}
              />
              <button className="btn-secondary" onClick={handleChooseFolder}>
                📁 Examinar
              </button>
            </div>
            {folder && (
              <span className="form-field__hint">
                Se creará: {folder}/{`game_${Date.now().toString().slice(-7)}`}
              </span>
            )}
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creando...' : 'Crear juego'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Confirmar borrado ──────────────────────────────────────────────────

function DeleteModal({ game, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Eliminar juego</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <p>¿Seguro que quieres eliminar <strong>{game.name}</strong>?</p>
          <p className="text-muted" style={{ marginTop: 8 }}>
            Se borrará la carpeta completa del juego. Esta acción no se puede deshacer.
          </p>
        </div>
        <div className="modal__footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-danger" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

// ── GameManager principal ─────────────────────────────────────────────────────

export default function GameManager() {
  const { recentGames, openGame, removeRecent, theme, toggleTheme } = useAppStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { gameDir, name }
  const [search, setSearch] = useState('')

  const filtered = recentGames.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.gameDir.toLowerCase().includes(search.toLowerCase())
  )

  const handleOpen = (gameDir, game) => {
    openGame(gameDir, game)
  }

  const handleCreate = (gameDir, game) => {
    setShowNewModal(false)
    openGame(gameDir, game)
  }

  const handleOpenExisting = async () => {
    const dir = await window.api.openGameDialog()
    if (!dir) return
    const result = await window.api.readGame(dir)
    if (result.ok) {
      openGame(dir, result.game)
    } else {
      alert('La carpeta seleccionada no contiene un juego válido (falta game.json).')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await window.api.deleteGame(deleteTarget.gameDir)
    removeRecent(deleteTarget.gameDir)
    setDeleteTarget(null)
  }

  return (
    <div className="game-manager">
      {/* Header */}
      <header className="gm-header">
        <div className="gm-header__brand">
          <span className="gm-header__logo">🕹</span>
          <div>
            <h1>ACHUS Game Engine<br/><span style={{fontSize:"0.6em",opacity:0.7}}>Mark I · AGEMKI</span></h1>
            <span className="gm-header__version">v0.1.0</span>
          </div>
        </div>
        <div className="gm-header__actions">
          <button className="btn-icon" onClick={toggleTheme} title="Cambiar tema">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Contenido */}
      <main className="gm-main">
        {/* Sidebar de acciones */}
        <aside className="gm-sidebar">
          <button className="btn-primary gm-sidebar__btn" onClick={() => setShowNewModal(true)}>
            ＋ Nuevo juego
          </button>
          <button className="btn-secondary gm-sidebar__btn" onClick={handleOpenExisting}>
            📂 Abrir juego...
          </button>
          <hr className="gm-sidebar__divider" />
          <p className="gm-sidebar__label">Recientes</p>
          <input
            type="search"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </aside>

        {/* Lista de juegos */}
        <section className="gm-content">
          {filtered.length === 0 ? (
            <div className="gm-empty">
              <span className="gm-empty__icon">🎮</span>
              <p>{recentGames.length === 0
                ? 'No hay juegos recientes. ¡Crea uno nuevo!'
                : 'No hay resultados para esa búsqueda.'
              }</p>
            </div>
          ) : (
            <div className="gm-games-list">
              {filtered.map(recent => (
                <GameCard
                  key={recent.gameDir}
                  recent={recent}
                  onOpen={handleOpen}
                  onRemoveRecent={removeRecent}
                  onDelete={() => setDeleteTarget(recent)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
      {showNewModal && (
        <NewGameModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          game={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  )
}
