/**
 * @fileoverview BuildManager — Módulo de compilación y distribución
 *
 * Panel completo de build con tres modos:
 *   - Debug (F5): compila con Open Watcom en modo debug, lanza DOSBox-X
 *   - Release (F6): compila en release, genera ficheros DAT de distribución
 *   - Build + Run (F7): equivalente a Debug + lanzar DOSBox-X automáticamente
 *
 * El panel muestra:
 *   - Estado de las herramientas externas (Watcom y DOSBox-X detectados o no)
 *   - Log de compilación en tiempo real (streaming via IPC)
 *   - Resumen de assets del proyecto (rooms, chars, objetos, secuencias, scripts)
 *   - Ficheros generados en build/ con su tamaño
 *
 * Todos los procesos de compilación corren en el proceso main (Node.js) via IPC
 * porque el renderer no puede ejecutar procesos del SO directamente.
 */
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import './BuildManager.css'

// ── Constantes de estado de build ─────────────────────────────────────────────

/** @typedef {'idle'|'building'|'success'|'error'} BuildStatus */

const STATUS_LABEL = {
  idle:     'Listo',
  building: 'Compilando…',
  success:  'Completado',
  error:    'Error',
}

const STATUS_COLOR = {
  idle:     'var(--text-muted)',
  building: '#f59e0b',
  success:  '#10b981',
  error:    '#ef4444',
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function BuildManager() {
  const { activeGame } = useAppStore()
  const gameDir = activeGame?.gameDir
  const game    = activeGame?.game

  // ── Estado del panel ───────────────────────────────────────────────────────

  /** @type {BuildStatus} */
  const [status, setStatus]         = useState('idle')
  const [logLines, setLogLines]     = useState([])
  const [buildFiles, setBuildFiles] = useState([])
  const [summary, setSummary]       = useState(null)
  const [tools, setTools]           = useState({ watcom: null, dosbox: null }) // null = no comprobado
  const [activeMode, setActiveMode] = useState(null) // 'debug'|'release'|'run'

  const logRef = useRef(null)

  // ── Efectos ────────────────────────────────────────────────────────────────

  // Al montar: comprobar herramientas externas y cargar resumen del proyecto
  useEffect(() => {
    if (!gameDir) return
    checkTools()
    loadSummary()
    loadBuildFiles()
  }, [gameDir])

  // Scroll automático al final del log cuando llegan nuevas líneas
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logLines])

  // Escuchar eventos de compilación enviados desde el proceso main via IPC
  useEffect(() => {
    if (!window.api?.onBuildLog) return
    // El main emite líneas de log del proceso Watcom en tiempo real
    const unsub = window.api.onBuildLog((line) => {
      setLogLines(prev => [...prev, { text: line, ts: Date.now() }])
    })
    return () => unsub?.()
  }, [])

  // ── Funciones ──────────────────────────────────────────────────────────────

  /**
   * Verifica si Open Watcom y DOSBox-X están instalados y accesibles.
   * El proceso main comprueba las rutas configuradas en preferencias.
   */
  async function checkTools() {
    try {
      const r = await window.api.buildCheckTools(gameDir)
      if (r.ok) setTools(r.tools)
    } catch { /* no crítico */ }
  }

  /**
   * Carga el resumen del proyecto: cuántas rooms, personajes, scripts, etc.
   * Se usa para mostrar un inventario rápido antes de compilar.
   */
  async function loadSummary() {
    try {
      const [rooms, chars, objects, scripts, sequences, dialogues] = await Promise.all([
        window.api.listRooms(gameDir),
        window.api.listChars(gameDir),
        window.api.listObjects(gameDir),
        window.api.listScripts(gameDir),
        window.api.listSequences(gameDir),
        window.api.listDialogues(gameDir),
      ])
      setSummary({
        rooms:     rooms.ok     ? (rooms.rooms?.length      ?? 0) : '?',
        chars:     chars.ok     ? (chars.chars?.length       ?? 0) : '?',
        objects:   objects.ok   ? (objects.objects?.length   ?? 0) : '?',
        scripts:   scripts.ok   ? (scripts.scripts?.length   ?? 0) : '?',
        sequences: sequences.ok ? (sequences.sequences?.length ?? 0) : '?',
        dialogues: dialogues.ok ? (dialogues.dialogues?.length ?? 0) : '?',
      })
    } catch { /* no crítico */ }
  }

  /**
   * Lista los ficheros generados en la carpeta build/ del proyecto.
   * Muestra nombre, tamaño y fecha de modificación.
   */
  async function loadBuildFiles() {
    try {
      const r = await window.api.buildListFiles(gameDir)
      if (r.ok) setBuildFiles(r.files || [])
    } catch { /* no crítico */ }
  }

  /**
   * Lanza un proceso de compilación.
   *
   * @param {'debug'|'release'|'run'} mode
   *   debug   → -DDEBUG_MODE, sin DAT, con símbolos de debug
   *   release → optimizado, genera DAT de distribución
   *   run     → debug + lanza DOSBox-X automáticamente al terminar
   */
  async function handleBuild(mode) {
    if (status === 'building') return // ya hay un build en curso

    setStatus('building')
    setActiveMode(mode)
    setLogLines([{ text: `▶ Iniciando compilación en modo ${mode.toUpperCase()}…`, ts: Date.now(), type: 'info' }])

    try {
      const r = await window.api.buildRun(gameDir, mode)
      if (r.ok) {
        setStatus('success')
        setLogLines(prev => [...prev,
          { text: '', ts: Date.now() },
          { text: `✓ Build completado en ${(r.elapsedMs / 1000).toFixed(1)}s`, ts: Date.now(), type: 'success' },
        ])
        // Si mode=run, el main ya lanzó DOSBox-X — informar al usuario
        if (mode === 'run') {
          setLogLines(prev => [...prev,
            { text: '▶ DOSBox-X lanzado con el ejecutable generado', ts: Date.now(), type: 'info' }
          ])
        }
        await loadBuildFiles() // actualizar lista de ficheros generados
      } else {
        setStatus('error')
        setLogLines(prev => [...prev,
          { text: '', ts: Date.now() },
          { text: `✗ Error: ${r.error || 'Compilación fallida'}`, ts: Date.now(), type: 'error' },
        ])
      }
    } catch (e) {
      setStatus('error')
      setLogLines(prev => [...prev,
        { text: `✗ Error inesperado: ${e.message}`, ts: Date.now(), type: 'error' },
      ])
    }
  }

  /** Abre el directorio build/ en el explorador de ficheros del SO */
  async function openBuildDir() {
    try { await window.api.buildOpenDir(gameDir) } catch { /* no crítico */ }
  }

  /** Limpia el log de compilación */
  function clearLog() { setLogLines([]) }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!activeGame) return null

  const isBuilding = status === 'building'

  return (
    <div className="build-manager">

      {/* Cabecera */}
      <div className="build-header">
        <h2>🔨 Build Manager</h2>
        <p>Compila el juego para MS-DOS y lanza DOSBox-X para probarlo.</p>
      </div>

      <div className="build-body">

        {/* Columna izquierda: controles */}
        <div className="build-sidebar">

          {/* Resumen del proyecto */}
          {summary && (
            <div className="build-card">
              <div className="build-card__title">📊 Proyecto</div>
              <div className="build-summary">
                {[
                  ['🏠','Rooms',     summary.rooms],
                  ['🧍','Personajes',summary.chars],
                  ['📦','Objetos',   summary.objects],
                  ['💬','Diálogos', summary.dialogues],
                  ['🎬','Secuencias',summary.sequences],
                  ['📜','Scripts',   summary.scripts],
                ].map(([icon, label, count]) => (
                  <div key={label} className="build-summary__row">
                    <span>{icon} {label}</span>
                    <span className="build-summary__count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estado herramientas */}
          <div className="build-card">
            <div className="build-card__title">🛠 Herramientas</div>
            <div className="build-tools">
              <ToolStatus label="Open Watcom" ok={tools.watcom} path={tools.watcomPath} />
              <ToolStatus label="DOSBox-X"    ok={tools.dosbox} path={tools.dosboxPath} />
            </div>
            {(tools.watcom === false || tools.dosbox === false) && (
              <p className="build-tools__hint">
                Configura las rutas en Archivo → Preferencias → Herramientas externas.
              </p>
            )}
          </div>

          {/* Botones de build */}
          <div className="build-card">
            <div className="build-card__title">⚡ Compilar</div>

            <button
              className={`build-btn build-btn--debug ${isBuilding && activeMode==='debug' ? 'build-btn--active' : ''}`}
              onClick={() => handleBuild('debug')}
              disabled={isBuilding || tools.watcom === false}
              title="Compila con símbolos de debug. F5"
            >
              {isBuilding && activeMode==='debug' ? '⏳' : '🐛'} Debug (F5)
            </button>

            <button
              className={`build-btn build-btn--run ${isBuilding && activeMode==='run' ? 'build-btn--active' : ''}`}
              onClick={() => handleBuild('run')}
              disabled={isBuilding || tools.watcom === false || tools.dosbox === false}
              title="Debug + lanza DOSBox-X automáticamente. F7"
            >
              {isBuilding && activeMode==='run' ? '⏳' : '▶'} Build + Run (F7)
            </button>

            <button
              className={`build-btn build-btn--release ${isBuilding && activeMode==='release' ? 'build-btn--active' : ''}`}
              onClick={() => handleBuild('release')}
              disabled={isBuilding || tools.watcom === false}
              title="Compila optimizado y genera ficheros DAT para distribución. F6"
            >
              {isBuilding && activeMode==='release' ? '⏳' : '📦'} Release (F6)
            </button>

            <div className="build-status" style={{ color: STATUS_COLOR[status] }}>
              {STATUS_LABEL[status]}
            </div>
          </div>

          {/* Ficheros generados */}
          <div className="build-card">
            <div className="build-card__title">
              📁 Ficheros generados
              <button className="btn-ghost build-open-dir" onClick={openBuildDir} title="Abrir carpeta build/">↗</button>
            </div>
            {buildFiles.length === 0
              ? <p className="build-empty">Sin compilaciones previas.</p>
              : (
                <div className="build-files">
                  {buildFiles.map(f => (
                    <div key={f.name} className="build-file">
                      <span className="build-file__name">{f.name}</span>
                      <span className="build-file__size">{formatBytes(f.size)}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>

        {/* Área principal: log de compilación */}
        <div className="build-log-area">
          <div className="build-log-toolbar">
            <span className="build-log-title">📋 Log de compilación</span>
            <button className="btn-ghost" onClick={clearLog} title="Limpiar log">🗑 Limpiar</button>
          </div>
          <div className="build-log" ref={logRef}>
            {logLines.length === 0
              ? <span className="build-log__empty">El log de compilación aparecerá aquí…</span>
              : logLines.map((l, i) => (
                  <div key={i} className={`build-log__line build-log__line--${l.type || 'default'}`}>
                    {l.text}
                  </div>
                ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

/**
 * Muestra el estado (detectada/no detectada) de una herramienta externa.
 * @param {{label:string, ok:boolean|null, path:string|undefined}} props
 */
function ToolStatus({ label, ok, path }) {
  const icon  = ok === null ? '⏳' : ok ? '✅' : '❌'
  const color = ok === null ? 'var(--text-muted)' : ok ? '#10b981' : '#ef4444'
  return (
    <div className="build-tool-row">
      <span style={{ color }}>{icon} {label}</span>
      {path && <span className="build-tool-path" title={path}>{path.split('/').pop() || path.split('\\').pop()}</span>}
    </div>
  )
}

// ── Utilidades ────────────────────────────────────────────────────────────────

/**
 * Formatea bytes en una cadena legible (KB, MB).
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/(1024*1024)).toFixed(2)} MB`
}
