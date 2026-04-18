import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { useObjectStore, OBJECT_TYPES } from '../../store/objectStore'
import ObjectEditor from './ObjectEditor'
import { useLocaleStore } from '../../store/localeStore'
import InvArrowsPanel from './InvArrowsPanel'
import './ObjectLibrary.css'

// ── Tarjeta de objeto ─────────────────────────────────────────────────────────

function ObjectCard({ obj, isActive, onSelect, onRename, onDuplicate, onDelete }) {
  const [ctxMenu, setCtxMenu]   = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [nameVal, setNameVal]   = useState(obj.name)
  const inputRef = useRef(null)

  useEffect(() => { if (renaming) inputRef.current?.select() }, [renaming])

  const typeInfo = OBJECT_TYPES.find(t => t.id === obj.type) || OBJECT_TYPES[0]

  async function confirmRename() {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== obj.name) onRename(trimmed)
    setRenaming(false)
  }

  const handleCtx = (e) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <div
        className={`obj-card ${isActive ? 'obj-card--active' : ''}`}
        onClick={() => onSelect(obj)}
        onDoubleClick={() => setRenaming(true)}
        onContextMenu={handleCtx}
      >
        <span className="obj-card__icon">{typeInfo.icon}</span>
        <div className="obj-card__info">
          {renaming ? (
            <input ref={inputRef} className="obj-card__rename"
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmRename()
                if (e.key === 'Escape') { setNameVal(obj.name); setRenaming(false) }
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="obj-card__name">{obj.name}</span>
          )}
          <span className="obj-card__type">{typeInfo.label}</span>
        </div>
        {!obj.detectable && <span className="obj-card__badge" title="No detectable">👁‍🗨</span>}
      </div>

      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onEdit={() => onSelect(obj)}
          onRename={() => setRenaming(true)}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      )}
    </>
  )
}

function CtxMenu({ x, y, onClose, onEdit, onRename, onDuplicate, onDelete }) {
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }}>
      <button onClick={() => { onEdit(); onClose() }}>Editar</button>
      <button onClick={() => { onRename(); onClose() }}>Renombrar</button>
      <button onClick={() => { onDuplicate(); onClose() }}>Duplicar</button>
      <div className="ctx-menu__sep" />
      <button className="ctx-menu__danger" onClick={() => { onDelete(); onClose() }}>Eliminar</button>
    </div>
  )
}

// ── ObjectLibrary módulo ──────────────────────────────────────────────────────

export default function ObjectLibrary() {
  const { activeGame } = useAppStore()
  const {
    objects, loadObjects, createObject, deleteObject, duplicateObject,
    saveActiveObject, activeObject, dirty, openObject, updateObject,
  } = useObjectStore()

  const [search, setSearch]     = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [newType, setNewType]   = useState('scenery')
  const newInputRef = useRef(null)

  const gameDir = activeGame?.gameDir

  const { loadAll: loadLocales, loaded: localesLoaded } = useLocaleStore()
  useEffect(() => { if (gameDir) loadObjects(gameDir) }, [gameDir])
  useEffect(() => { if (gameDir && !localesLoaded) loadLocales(gameDir) }, [gameDir])
  useEffect(() => { if (creating) newInputRef.current?.focus() }, [creating])

  async function handleCreate() {
    const name = newName.trim()
    if (!name) { setCreating(false); return }
    const obj = await createObject(gameDir, name, newType)
    if (obj) openObject(obj)
    setNewName(''); setCreating(false)
  }

  async function handleRename(obj, name) {
    updateObject({ name })  // solo si es el activo
    await window.api.saveObject(gameDir, { ...obj, name })
    loadObjects(gameDir)
  }

  async function handleDelete(obj) {
    if (!confirm(`¿Eliminar "${obj.name}"?`)) return
    await deleteObject(gameDir, obj.id)
  }

  async function handleDuplicate(obj) {
    await duplicateObject(gameDir, obj.id)
  }

  const filtered = objects.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase())
  )

  // Agrupar por tipo
  const byType = OBJECT_TYPES.map(t => ({
    ...t,
    items: filtered.filter(o => o.type === t.id),
  })).filter(g => g.items.length > 0 || search === '')

  const [rightTab, setRightTab] = useState('obj') // 'obj' | 'arrows'

  return (
    <div className="obj-library">
      {/* Panel izquierdo: lista */}
      <div className="obj-library__list">
        <div className="obj-library__toolbar">
          <button className="btn-primary" onClick={() => setCreating(true)}>＋ Nuevo objeto</button>
          <input type="search" placeholder="Buscar..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <span className="count">{objects.length} objeto{objects.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="obj-library__scroll">
          {/* Formulario de creación inline */}
          {creating && (
            <div className="obj-create-form">
              <input ref={newInputRef} type="text" placeholder="Nombre del objeto"
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
              />
              <div className="obj-create-types">
                {OBJECT_TYPES.map(t => (
                  <button key={t.id}
                    className={`obj-type-mini ${newType === t.id ? 'active' : ''}`}
                    onClick={() => setNewType(t.id)} title={t.desc}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <div className="obj-create-actions">
                <button className="btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
                <button className="btn-primary" onClick={handleCreate}>Crear</button>
              </div>
            </div>
          )}

          {objects.length === 0 && !creating && (
            <div className="obj-empty-state">
              Sin objetos. Crea uno con el botón de arriba.
            </div>
          )}

          {OBJECT_TYPES.map(t => {
            const items = filtered.filter(o => o.type === t.id)
            if (items.length === 0) return null
            return (
              <div key={t.id} className="obj-group">
                <div className="obj-group__header">{t.icon} {t.label}</div>
                {items.map(obj => (
                  <ObjectCard
                    key={obj.id}
                    obj={obj}
                    isActive={activeObject?.id === obj.id}
                    onSelect={openObject}
                    onRename={(name) => handleRename(obj, name)}
                    onDuplicate={() => handleDuplicate(obj)}
                    onDelete={() => handleDelete(obj)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Panel derecho: editor con pestañas */}
      <div className="obj-library__editor">
        <div className="obj-right-tabs">
          <button className={`obj-right-tab ${rightTab === 'obj' ? 'active' : ''}`}
            onClick={() => setRightTab('obj')}>Objeto</button>
          <button className={`obj-right-tab ${rightTab === 'arrows' ? 'active' : ''}`}
            onClick={() => setRightTab('arrows')}>Flechas inventario</button>
        </div>
        {rightTab === 'obj'    && <ObjectEditor allObjects={objects} />}
        {rightTab === 'arrows' && <InvArrowsPanel />}
      </div>
    </div>
  )
}
