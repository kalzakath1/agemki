import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useAttributeStore } from '../../store/attributeStore'
import { useFlagStore } from '../../store/flagStore'
import { useLocaleStore } from '../../store/localeStore'
import './AttributeEditor.css'

// ── Fila de atributo ──────────────────────────────────────────────────────────
function AttrRow({ attr, index, total, langs, locales, onUpdate, onMove, onSetDeath }) {
  return (
    <div className={`attr-row ${attr.isDeathAttr ? 'attr-row--death' : ''}`}>
      <div className="attr-row__order">
        <button className="btn-icon" disabled={index === 0} onClick={() => onMove(-1)}>▲</button>
        <span className="attr-row__num">{index + 1}</span>
        <button className="btn-icon" disabled={index === total - 1} onClick={() => onMove(1)}>▼</button>
      </div>
      <div className="attr-row__names">
        {langs.map(lang => (
          <div key={lang} className="attr-row__lang">
            <span className="attr-row__lang-label">{lang.toUpperCase()}</span>
            <input
              className="attr-row__name-input"
              value={(locales[lang] || {})[attr.nameKey] || ''}
              placeholder={`Nombre en ${lang.toUpperCase()}`}
              onChange={e => useLocaleStore.getState().setKey(lang, attr.nameKey, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="attr-row__default">
        <span className="attr-row__field-label">Valor inicial</span>
        <input
          type="number"
          className="attr-row__number"
          value={attr.defaultValue ?? 0}
          onChange={e => onUpdate({ defaultValue: Number(e.target.value) })}
        />
      </div>
      <div className="attr-row__death">
        <button
          className={`attr-death-btn ${attr.isDeathAttr ? 'attr-death-btn--active' : ''}`}
          title="Marcar como atributo de muerte (llegar a 0 = muerte)"
          onClick={onSetDeath}
        >
          {attr.isDeathAttr ? '💀 Muerte' : '☠'}
        </button>
      </div>
    </div>
  )
}

// ── Fila de flag ──────────────────────────────────────────────────────────────
function FlagRow({ flag, onUpdate, onRemove }) {
  return (
    <div className="gvar-flag-row">
      <div className="gvar-flag-row__fields">
        <input
          className="gvar-flag-row__name"
          value={flag.name || ''}
          placeholder="Nombre del flag"
          onChange={e => onUpdate({ name: e.target.value })}
        />
        <input
          className="gvar-flag-row__desc"
          value={flag.description || ''}
          placeholder="Descripción (para qué sirve)"
          onChange={e => onUpdate({ description: e.target.value })}
        />
      </div>
      <span className="gvar-flag-row__id" title={flag.id}>{flag.id}</span>
      <button className="btn-icon gvar-flag-row__del" title="Eliminar" onClick={onRemove}>✕</button>
    </div>
  )
}

// ── Módulo principal ──────────────────────────────────────────────────────────
export default function AttributeEditor() {
  const gameDir = useAppStore(s => s.activeGame?.gameDir)

  // Flag store (global, compartido con todos los módulos)
  const flags      = useFlagStore(s => s.flags)
  const flagDirty  = useFlagStore(s => s.dirty)
  const loadFlags  = useFlagStore(s => s.load)
  const addFlag    = useFlagStore(s => s.addFlag)
  const updateFlag = useFlagStore(s => s.updateFlag)
  const removeFlag = useFlagStore(s => s.removeFlag)
  const saveFlags  = useFlagStore(s => s.save)

  // Attribute store (solo atributos RPG)
  const enabled    = useAttributeStore(s => s.enabled)
  const attributes = useAttributeStore(s => s.attributes)
  const attrDirty  = useAttributeStore(s => s.dirty)
  const loadAttrs  = useAttributeStore(s => s.load)
  const setEnabled = useAttributeStore(s => s.setEnabled)
  const updateAttr = useAttributeStore(s => s.updateAttr)
  const setDeathAttr = useAttributeStore(s => s.setDeathAttr)
  const saveAttrs  = useAttributeStore(s => s.save)

  const { langs, locales, loadAll, saveAll } = useLocaleStore()
  const allLangs = langs?.length ? langs : ['es', 'en']

  const [tab, setTab]         = useState('flags')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    if (gameDir) {
      loadFlags(gameDir)
      loadAttrs(gameDir)
      loadAll(gameDir)
    }
  }, [gameDir])

  const dirty = flagDirty || attrDirty

  function handleMove(id, dir) {
    const idx = attributes.findIndex(a => a.id === id)
    const next = idx + dir
    if (next < 0 || next >= attributes.length) return
    const arr = [...attributes]
    const tmp = arr[idx]; arr[idx] = arr[next]; arr[next] = tmp
    useAttributeStore.setState({ attributes: arr, dirty: true })
  }

  function handleAddFlag() {
    if (!newName.trim()) return
    addFlag(newName, newDesc)
    setNewName('')
    setNewDesc('')
  }

  async function handleSave() {
    if (flagDirty) await saveFlags(gameDir)
    if (attrDirty) await saveAttrs(gameDir)
    if (attrDirty) await saveAll(gameDir)
  }

  if (!gameDir) return (
    <div className="attr-empty">Abre un proyecto para gestionar las variables globales.</div>
  )

  return (
    <div className="attr-editor">

      {/* Cabecera */}
      <div className="attr-editor__header">
        <h2 className="attr-editor__title">Variables Globales</h2>
        <div className="attr-editor__toolbar">
          <button className="btn-primary" disabled={!dirty} onClick={handleSave}>Guardar</button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="gvar-tabs">
        <button className={`gvar-tab${tab === 'flags' ? ' gvar-tab--on' : ''}`} onClick={() => setTab('flags')}>
          🚩 Flags {flags.length > 0 && <span className="gvar-tab-badge">{flags.length}</span>}
        </button>
        <button className={`gvar-tab${tab === 'attributes' ? ' gvar-tab--on' : ''}`} onClick={() => setTab('attributes')}>
          ⚔️ Atributos RPG
        </button>
      </div>

      {/* ── Pestaña: Flags ── */}
      {tab === 'flags' && (
        <div className="gvar-pane">
          <p className="gvar-flags-hint">
            Variables booleanas/numéricas que el juego recuerda: puertas abiertas, objetos recogidos, eventos ocurridos…
          </p>

          <div className="gvar-flag-list">
            {flags.length === 0 && (
              <div className="gvar-flag-empty">Sin flags definidos. Añade el primero abajo.</div>
            )}
            {flags.map(flag => (
              <FlagRow
                key={flag.id}
                flag={flag}
                onUpdate={partial => updateFlag(flag.id, partial)}
                onRemove={() => removeFlag(flag.id)}
              />
            ))}
          </div>

          {/* Formulario de nuevo flag */}
          <div className="gvar-flag-add">
            <span className="gvar-flag-add__label">Nuevo flag</span>
            <input
              className="gvar-flag-add__name"
              placeholder="Nombre (ej: puerta_norte_abierta)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddFlag()}
            />
            <input
              className="gvar-flag-add__desc"
              placeholder="Descripción (opcional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddFlag()}
            />
            <button className="btn-primary" disabled={!newName.trim()} onClick={handleAddFlag}>
              ＋ Añadir
            </button>
          </div>
        </div>
      )}

      {/* ── Pestaña: Atributos RPG ── */}
      {tab === 'attributes' && (
        <div className="gvar-pane">
          <label className="attr-toggle" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span>Activar sistema de atributos RPG</span>
          </label>

          {!enabled && (
            <div className="attr-disabled-notice">
              El sistema de atributos está desactivado. Todos los personajes tendrán vida &gt; 0 automáticamente.
              Actívalo para configurar atributos personalizados.
            </div>
          )}

          {enabled && (
            <>
              <div className="attr-editor__info">
                12 atributos configurables · El marcado con 💀 provoca la muerte del personaje al llegar a 0
              </div>
              <div className="attr-list">
                {attributes.map((attr, i) => (
                  <AttrRow
                    key={attr.id}
                    attr={attr}
                    index={i}
                    total={attributes.length}
                    langs={allLangs}
                    locales={locales}
                    onUpdate={partial => updateAttr(attr.id, partial)}
                    onMove={dir => handleMove(attr.id, dir)}
                    onSetDeath={() => setDeathAttr(attr.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

    </div>
  )
}
