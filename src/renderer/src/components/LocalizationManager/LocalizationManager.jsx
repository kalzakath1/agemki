import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { useLocaleStore } from '../../store/localeStore'
import './LocalizationManager.css'

const LANG_NAMES = {
  es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch',
  it: 'Italiano', pt: 'Português', ca: 'Català', eu: 'Euskara',
  gl: 'Galego',  nl: 'Nederlands', pl: 'Polski',  ru: 'Русский',
}
const LANG_FLAGS = {
  es: '🇪🇸', en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹',
  pt: '🇵🇹', ca: '🏴', eu: '🏴', gl: '🏴', nl: '🇳🇱', pl: '🇵🇱', ru: '🇷🇺',
}

// ── Barra de cobertura ────────────────────────────────────────────────────────
function CoverageBar({ pct }) {
  const color = pct === 100 ? '#4caf50' : pct >= 60 ? '#ff9800' : '#f44336'
  return (
    <div className="coverage-bar">
      <div className="coverage-bar__fill" style={{ width: pct + '%', background: color }} />
      <span className="coverage-bar__label">{pct}%</span>
    </div>
  )
}

// ── Tarjeta de idioma ─────────────────────────────────────────────────────────
function LangCard({ info, isBase, isActive, onSelect, onDelete }) {
  return (
    <div className={'lang-card' + (isActive ? ' selected' : '') + (isBase ? ' base' : '')}
      onClick={onSelect}>
      <div className="lang-card__header">
        <span className="lang-card__flag">{LANG_FLAGS[info.lang] || '🌐'}</span>
        <div className="lang-card__info">
          <span className="lang-card__code">{info.lang.toUpperCase()}</span>
          <span className="lang-card__name">{LANG_NAMES[info.lang] || info.lang}</span>
        </div>
        {isBase && <span className="lang-card__base-badge">BASE</span>}
        {!isBase && (
          <button className="btn-icon lang-card__del" title="Eliminar idioma"
            onClick={e => { e.stopPropagation(); onDelete() }}>🗑</button>
        )}
      </div>
      <CoverageBar pct={info.pct} />
      <div className="lang-card__stats">
        <span>{info.covered}/{info.total} claves</span>
        {info.totalMissing > 0 && <span className="missing-count">⚠ {info.totalMissing} sin traducir</span>}
      </div>
    </div>
  )
}

// ── Panel añadir idioma ───────────────────────────────────────────────────────
function AddLangPanel({ existing, onAdd, onCancel }) {
  const [code, setCode] = useState('')
  const [custom, setCustom] = useState(false)
  const presets = Object.keys(LANG_NAMES).filter(l => !existing.includes(l))

  async function handleAdd() {
    const lang = code.trim().toLowerCase()
    if (!lang || !/^[a-z]{2,3}$/.test(lang)) {
      alert('Código de idioma inválido. Usa 2-3 letras minúsculas (ej: it, fr, de)')
      return
    }
    onAdd(lang)
  }

  return (
    <div className="add-lang-panel">
      <div className="add-lang-panel__title">Añadir idioma</div>

      {!custom && presets.length > 0 && (
        <>
          <div className="add-lang-panel__subtitle">Idiomas predefinidos</div>
          <div className="add-lang-presets">
            {presets.map(l => (
              <button key={l} className={'preset-btn' + (code === l ? ' active' : '')}
                onClick={() => setCode(l)}>
                {LANG_FLAGS[l]} {LANG_NAMES[l]} <span className="preset-code">({l})</span>
              </button>
            ))}
          </div>
          <button className="btn-ghost add-lang-panel__custom-toggle"
            onClick={() => setCustom(true)}>Otro código ISO…</button>
        </>
      )}

      {(custom || presets.length === 0) && (
        <div className="add-lang-panel__custom">
          <label>Código ISO 639-1</label>
          <input type="text" value={code} maxLength={3} placeholder="ej: it"
            onChange={e => setCode(e.target.value.toLowerCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
        </div>
      )}

      <div className="add-lang-panel__actions">
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" disabled={!code.trim()} onClick={handleAdd}>
          ＋ Añadir {code ? code.toUpperCase() : ''}
        </button>
      </div>
    </div>
  )
}

// ── Textos del sistema (sys.* y menu.*) ──────────────────────────────────────
const SYS_KEYS = [
  { group: 'Mensajes del motor', keys: [
    { key: 'sys.cannot_reach',       label: 'No se puede llegar' },
    { key: 'sys.cannot_pickup',      label: 'No se puede coger' },
    { key: 'sys.cannot_use',         label: 'No se puede usar' },
    { key: 'sys.usar_con.no_result', label: 'Combinación no válida (usar X con Y sin script)' },
    { key: 'sys.usar_con.no_inv',    label: 'Combinación no válida (falta objeto en inventario)' },
    { key: 'sys.new_game_confirm',label: 'Confirmar nueva partida' },
    { key: 'sys.yes',             label: 'Botón Sí' },
    { key: 'sys.no',              label: 'Botón No' },
  ]},
  { group: 'Menú in-game (ESC)', keys: [
    { key: 'menu.titulo',            label: 'Título del menú' },
    { key: 'menu.continuar',         label: 'Continuar' },
    { key: 'menu.nueva_partida',     label: 'Nueva partida' },
    { key: 'menu.guardar_partida',   label: 'Guardar partida' },
    { key: 'menu.restaurar_partida', label: 'Restaurar partida' },
    { key: 'menu.configuracion',     label: 'Configuración' },
    { key: 'menu.salir',             label: 'Salir a DOS' },
  ]},
]

function SystemTextsPanel({ lang }) {
  const { locales, setKey, saveAll } = useLocaleStore()
  const gameDir = useAppStore(s => s.activeGame?.gameDir)

  return (
    <div className="sys-texts-panel">
      <div className="sys-texts-panel__title">⚙ Textos del sistema</div>
      <p className="sys-texts-panel__desc">
        Textos globales del motor. Vacío = no se muestra (usa el fallback en inglés).
      </p>
      {SYS_KEYS.map(({ group, keys }) => (
        <div key={group} className="sys-texts-group">
          <div className="sys-texts-group__label">{group}</div>
          {keys.map(({ key, label }) => (
            <div key={key} className="sys-texts-row">
              <span className="sys-texts-row__label">{label}</span>
              <code className="sys-texts-row__key">{key}</code>
              <input
                type="text"
                className="sys-texts-row__input"
                placeholder={`${label} en ${lang.toUpperCase()}…`}
                value={(locales[lang] || {})[key] || ''}
                onChange={e => {
                  setKey(lang, key, e.target.value)
                  saveAll(gameDir)
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Panel de cobertura (claves faltantes) ─────────────────────────────────────
function CoveragePanel({ langInfo, onNavigate }) {
  const [expandedGroup, setExpandedGroup] = useState(null)
  const { locales, setKey } = useLocaleStore()

  if (langInfo.totalMissing === 0) return (
    <div className="coverage-complete">
      <span>✅</span>
      <p>Traducción completa</p>
      <small>Todas las claves tienen texto en {langInfo.lang.toUpperCase()}</small>
    </div>
  )

  return (
    <div className="coverage-panel">
      <div className="coverage-panel__title">
        Claves sin traducir en {LANG_FLAGS[langInfo.lang]} {langInfo.lang.toUpperCase()}
        <span className="coverage-panel__count">{langInfo.totalMissing}</span>
      </div>

      {Object.entries(langInfo.missing).map(([groupId, group]) => (
        <div key={groupId} className="coverage-group">
          <button className={'coverage-group__header' + (expandedGroup === groupId ? ' open' : '')}
            onClick={() => setExpandedGroup(expandedGroup === groupId ? null : groupId)}>
            <span>{group.icon} {group.label}</span>
            <span className="coverage-group__badge">{group.count}</span>
            <span className="coverage-group__arrow">{expandedGroup === groupId ? '▼' : '▶'}</span>
          </button>

          {expandedGroup === groupId && (
            <div className="coverage-group__keys">
              {group.missingKeys.map(key => {
                const baseVal = (locales['es'] || {})[key] || ''
                return (
                  <div key={key} className="missing-key-row">
                    <div className="missing-key-row__key" title={key}>
                      <code>{key}</code>
                    </div>
                    <div className="missing-key-row__base" title="Valor en ES (base)">
                      {baseVal || <em className="no-base">Sin valor base</em>}
                    </div>
                    <input
                      type="text"
                      placeholder={`Traducción ${langInfo.lang.toUpperCase()}…`}
                      defaultValue={(locales[langInfo.lang] || {})[key] || ''}
                      onBlur={e => {
                        if (e.target.value.trim()) setKey(langInfo.lang, key, e.target.value.trim())
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Editor de locale completo (tabla) ─────────────────────────────────────────
function LocaleTable({ lang }) {
  const { locales, setKey } = useLocaleStore()
  const [filter, setFilter] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')

  const loc     = locales[lang]     || {}
  const baseLoc = locales['es']     || {}
  const allKeys = useMemo(() => {
    const keys = new Set([...Object.keys(baseLoc), ...Object.keys(loc)])
    return [...keys].sort()
  }, [locales])

  const groups = [
    { id: 'all',       label: 'Todos' },
    { id: 'verb',      label: '🖱 Verbos' },
    { id: 'obj',       label: '📦 Objetos' },
    { id: 'room_',     label: '🏠 Rooms' },
    { id: 'dialogue_', label: '💬 Diálogos' },
  ]

  const filtered = useMemo(() => allKeys.filter(k => {
    if (filterGroup !== 'all' && !k.startsWith(filterGroup)) return false
    if (filter && !k.toLowerCase().includes(filter.toLowerCase()) &&
        !(loc[k] || '').toLowerCase().includes(filter.toLowerCase())) return false
    return true
  }), [allKeys, filter, filterGroup, loc])

  return (
    <div className="locale-table-wrap">
      <div className="locale-table__toolbar">
        <input type="text" className="locale-table__search"
          value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Buscar clave o texto…" />
        <div className="locale-table__groups">
          {groups.map(g => (
            <button key={g.id} className={'group-btn' + (filterGroup === g.id ? ' active' : '')}
              onClick={() => setFilterGroup(g.id)}>{g.label}</button>
          ))}
        </div>
      </div>

      <div className="locale-table">
        <div className="locale-table__header">
          <span>Clave</span>
          <span>ES (base)</span>
          <span>{lang.toUpperCase()}</span>
        </div>
        <div className="locale-table__body">
          {filtered.length === 0 && (
            <div className="locale-table__empty">Sin resultados</div>
          )}
          {filtered.map(key => {
            const baseVal = baseLoc[key] || ''
            const val     = loc[key]     || ''
            const missing = !val.trim() && lang !== 'es'
            return (
              <div key={key} className={'locale-row' + (missing ? ' missing' : '')}>
                <code className="locale-row__key" title={key}>{key}</code>
                <span className="locale-row__base">{baseVal || <em>—</em>}</span>
                <input type="text" className="locale-row__input"
                  defaultValue={val}
                  onBlur={e => setKey(lang, key, e.target.value)} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function LocalizationManager() {
  const { activeGame, updateGame } = useAppStore()
  const { langs, locales, activeLang, setActiveLang,
          loadAll, addLang, deleteLang, getCoverage, saveAll, dirty } = useLocaleStore()

  const [view, setView]         = useState('coverage') // 'coverage' | 'table'
  const [showAddLang, setShowAddLang] = useState(false)
  const [selectedLang, setSelectedLang] = useState(null)

  const gameDir = activeGame?.gameDir

  useEffect(() => { if (gameDir) loadAll(gameDir) }, [gameDir])

  // Default selected lang to activeLang
  useEffect(() => {
    if (!selectedLang && langs.length > 0) setSelectedLang(langs[0])
  }, [langs])

  const coverage = useMemo(() => getCoverage(), [locales, langs])
  const selectedInfo = coverage.find(c => c.lang === selectedLang) || coverage[0]

  async function handleAddLang(lang) {
    const result = await addLang(gameDir, lang)
    if (result.ok) {
      // Update game.json languages field via appStore
      const updatedGame = { ...activeGame.game, languages: [...langs, lang] }
      updateGame(updatedGame)
      setShowAddLang(false)
      setSelectedLang(lang)
    } else {
      alert('Error: ' + result.error)
    }
  }

  async function handleDeleteLang(lang) {
    const result = await deleteLang(gameDir, lang)
    if (result.ok) {
      const updatedGame = { ...activeGame.game, languages: langs.filter(l => l !== lang) }
      updateGame(updatedGame)
      if (selectedLang === lang) setSelectedLang('es')
    }
  }

  async function handleSave() {
    await saveAll(gameDir)
  }

  const hasDirty = dirty.size > 0

  return (
    <div className="localization-manager">

      {/* Panel izquierdo — idiomas */}
      <div className="loc-sidebar">
        <div className="loc-sidebar__header">
          <span className="loc-sidebar__title">Idiomas</span>
          <button className="btn-icon" onClick={() => setShowAddLang(true)} title="Añadir idioma">＋</button>
        </div>

        {showAddLang && (
          <AddLangPanel existing={langs}
            onAdd={handleAddLang}
            onCancel={() => setShowAddLang(false)} />
        )}

        <div className="loc-lang-list">
          {coverage.map(info => (
            <LangCard key={info.lang} info={info}
              isBase={info.lang === 'es'}
              isActive={selectedLang === info.lang}
              onSelect={() => { setSelectedLang(info.lang); setActiveLang(info.lang) }}
              onDelete={() => handleDeleteLang(info.lang)} />
          ))}
        </div>

        {hasDirty && (
          <div className="loc-sidebar__save">
            <button className="btn-primary loc-save-btn" onClick={handleSave}>
              💾 Guardar cambios
            </button>
            <small>{dirty.size} idioma{dirty.size !== 1 ? 's' : ''} modificado{dirty.size !== 1 ? 's' : ''}</small>
          </div>
        )}
      </div>

      {/* Panel derecho */}
      <div className="loc-main">
        {selectedInfo && (
          <>
            <div className="loc-main__header">
              <div className="loc-main__lang">
                <span className="loc-main__flag">{LANG_FLAGS[selectedInfo.lang] || '🌐'}</span>
                <span className="loc-main__lang-name">
                  {LANG_NAMES[selectedInfo.lang] || selectedInfo.lang} ({selectedInfo.lang.toUpperCase()})
                </span>
                <CoverageBar pct={selectedInfo.pct} />
              </div>
              <div className="loc-view-tabs">
                <button className={'view-tab' + (view === 'coverage' ? ' active' : '')}
                  onClick={() => setView('coverage')}>⚠ Sin traducir ({selectedInfo.totalMissing})</button>
                <button className={'view-tab' + (view === 'table' ? ' active' : '')}
                  onClick={() => setView('table')}>📋 Todas las claves ({selectedInfo.total})</button>
              </div>
            </div>

            <SystemTextsPanel lang={selectedInfo.lang} />
            {view === 'coverage' && <CoveragePanel langInfo={selectedInfo} />}
            {view === 'table'    && <LocaleTable lang={selectedInfo.lang} />}
          </>
        )}

        {!selectedInfo && (
          <div className="loc-empty">
            <span>🌐</span>
            <p>Selecciona un idioma para gestionar sus traducciones</p>
          </div>
        )}
      </div>
    </div>
  )
}
