import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { useAttributeStore } from '../../store/attributeStore'
import { useLocaleStore } from '../../store/localeStore'
import './AttributeEditor.css'

// ── Fila de atributo ──────────────────────────────────────────────────────────
function AttrRow({ attr, index, total, langs, locales, activeLang, onUpdate, onMove, onSetDeath }) {
  const name = (locales[activeLang] || {})[attr.nameKey] || attr.id

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
              onChange={e => {
                useLocaleStore.getState().setKey(lang, attr.nameKey, e.target.value)
              }}
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

// ── Módulo principal ──────────────────────────────────────────────────────────
export default function AttributeEditor() {
  const gameDir  = useAppStore(s => s.activeGame?.gameDir)
  const { enabled, attributes, dirty, load, setEnabled, updateAttr, setDeathAttr, save } =
    useAttributeStore()
  const { langs, locales, activeLang, loadAll, saveAll } = useLocaleStore()
  const allLangs = langs?.length ? langs : ['es', 'en']

  useEffect(() => {
    if (gameDir) { load(gameDir); loadAll(gameDir) }
  }, [gameDir])

  function handleMove(id, dir) {
    const idx = attributes.findIndex(a => a.id === id)
    const next = idx + dir
    if (next < 0 || next >= attributes.length) return
    const arr = [...attributes]
    const tmp = arr[idx]; arr[idx] = arr[next]; arr[next] = tmp
    useAttributeStore.setState({ attributes: arr, dirty: true })
  }

  async function handleSave() {
    await save(gameDir)
    await saveAll(gameDir)
  }

  if (!gameDir) return (
    <div className="attr-empty">Abre un proyecto para gestionar los atributos.</div>
  )

  return (
    <div className="attr-editor">
      <div className="attr-editor__header">
        <h2 className="attr-editor__title">Módulo de Atributos</h2>
        <div className="attr-editor__toolbar">
          <label className="attr-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
            />
            <span>Activar sistema de atributos en este juego</span>
          </label>
          <button
            className="btn-primary"
            disabled={!dirty}
            onClick={handleSave}
          >
            Guardar
          </button>
        </div>
      </div>

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
                activeLang={activeLang || allLangs[0]}
                onUpdate={partial => updateAttr(attr.id, partial)}
                onMove={dir => handleMove(attr.id, dir)}
                onSetDeath={() => setDeathAttr(attr.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
