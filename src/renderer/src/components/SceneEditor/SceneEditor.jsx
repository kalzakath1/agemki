import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useObjectStore } from '../../store/objectStore'
import { useCharStore } from '../../store/charStore'
import { useSceneStore, TOOLS } from '../../store/sceneStore'
import SceneSidePanel from './SceneSidePanel'
import SceneCanvas from './SceneCanvas'
import './SceneEditor.css'

const ZOOM_LEVELS = [1, 2, 4, 8]

const PANEL_MODES = [
  { id: 'all',        icon: '⊞',  label: 'Todo' },
  { id: 'props',      icon: '⚙️',  label: 'Propiedades' },
  { id: 'walkmap',    icon: '🗺️',  label: 'Walkmap' },
  { id: 'objects',    icon: '📦',  label: 'Objetos' },
  { id: 'characters', icon: '🧍',  label: 'NPCs' },
  { id: 'exits',      icon: '🚪',  label: 'Salidas' },
  { id: 'lights',     icon: '💡',  label: 'Luces' },
  { id: 'layers',     icon: '🔲',  label: 'Capas' },
]

export default function SceneEditor({ onBack }) {
  const { activeGame } = useAppStore()
  const {
    activeRoom, dirty, zoom, setZoom,
    markClean, closeRoom,
    setBackgroundUrl,
  } = useSceneStore()

  const [panelMode, setPanelMode] = useState('all')
  const [mousePos, setMousePos]   = useState(null)

  // Ensure object and character libraries are loaded regardless of navigation order
  const loadObjects = useObjectStore(s => s.loadObjects)
  const loadChars   = useCharStore(s => s.loadChars)
  useEffect(() => {
    if (!activeGame?.gameDir) return
    loadObjects(activeGame.gameDir)
    loadChars(activeGame.gameDir)
  }, [activeGame?.gameDir])

  // Herramientas permitidas por panel. Al cambiar de panel se resetea
  // si la herramienta activa no tiene sentido en el nuevo contexto.
  const PANEL_TOOLS = {
    walkmap:    ['select', 'pan', 'polygon', 'rect', 'circle'],
    objects:    ['select', 'pan'],
    characters: ['select', 'pan'],
    exits:      ['select', 'pan'],
    props:      ['select', 'pan'],
    lights:     ['select', 'pan'],
    layers:     ['select', 'pan'],
    all:        ['select', 'pan', 'polygon', 'rect', 'circle'],
  }

  function handlePanelMode(mode) {
    const allowed = PANEL_TOOLS[mode] || ['select', 'pan']
    const current = useSceneStore.getState().activeTool
    if (!allowed.includes(current)) {
      // Resetear a SELECT y cancelar cualquier polígono en curso
      useSceneStore.getState().setTool('select')
    }
    setPanelMode(mode)
  }

  useEffect(() => {
    if (!activeRoom?.backgroundFilePath || !activeGame) return
    loadBackground(activeRoom.backgroundFilePath)
  }, [activeRoom?.id])

  async function loadBackground(filename) {
    if (!filename) { setBackgroundUrl(null); return }
    const path = `${activeGame.gameDir}/assets/converted/backgrounds/${filename}`
    const result = await window.api.readBinary(path)
    if (!result.ok) return
    const { pcxFileToDataURL } = await import('../../utils/pcxConverter')
    const url = pcxFileToDataURL(new Uint8Array(result.buffer), activeGame.game.palette)
    setBackgroundUrl(url)
  }

  async function handleSave() {
    if (!activeRoom) return
    const result = await window.api.saveRoom(activeGame.gameDir, activeRoom)
    if (result.ok) markClean()
  }

  function handleBack() {
    if (dirty && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return
    closeRoom()
    onBack()
  }

  if (!activeRoom) return null
  const zoomIdx = ZOOM_LEVELS.indexOf(zoom)

  return (
    <div className="scene-editor">

      {/* ── Toolbar principal ── */}
      <div className="scene-toolbar">
        <button className="btn-ghost scene-toolbar__back" onClick={handleBack}>← Rooms</button>
        <span className="scene-toolbar__sep" />
        <span className="scene-toolbar__title">
          {activeRoom.name}
          {dirty && <span className="scene-toolbar__dirty"> ●</span>}
        </span>
        <span className="scene-toolbar__sep" />
        <div className="scene-toolbar__zoom">
          <button className="btn-icon"
            onClick={() => setZoom(ZOOM_LEVELS[Math.max(0, zoomIdx - 1)])}
            disabled={zoomIdx === 0}>−</button>
          <span className="scene-toolbar__zoom-val">{zoom}x</span>
          <button className="btn-icon"
            onClick={() => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1)])}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}>＋</button>
        </div>
        <div style={{ flex: 1 }} />
        <button
          className={`btn-primary scene-toolbar__save ${!dirty ? 'btn-primary--disabled' : ''}`}
          onClick={handleSave} disabled={!dirty}>
          💾 Guardar
        </button>
      </div>

      {/* ── Barra de iconos de panel ── */}
      <div className="scene-panel-bar">
        {PANEL_MODES.map(m => (
          <button key={m.id}
            className={`scene-panel-btn ${panelMode === m.id ? 'active' : ''}`}
            onClick={() => handlePanelMode(m.id)}
            title={m.label}>
            <span className="scene-panel-btn__icon">{m.icon}</span>
            <span className="scene-panel-btn__label">{m.label}</span>
          </button>
        ))}
      </div>

      {/* ── Workspace ── */}
      <div className="scene-workspace">
        <SceneSidePanel panelMode={panelMode} />
        <div className="scene-canvas-area">
          <SceneCanvas panelMode={panelMode} onMousePosChange={setMousePos} />
        </div>
      </div>

      <SceneStatusBar mousePos={mousePos} />
    </div>
  )
}

function SceneStatusBar({ mousePos }) {
  const { activeRoom, zoom, activeTool, selectedShapeId } = useSceneStore()
  if (!activeRoom) return null
  const activeWm = activeRoom.walkmaps?.find(w => w.id === activeRoom.activeWalkmapId)
  const selectedShape = activeWm?.shapes?.find(s => s.id === selectedShapeId)
  return (
    <div className="scene-statusbar">
      <span>{activeRoom.backgroundSize.w}×{activeRoom.backgroundSize.h}px</span>
      <span className="sep">|</span>
      <span>{zoom}x</span>
      <span className="sep">|</span>
      <span>{activeTool}</span>
      {activeWm && <><span className="sep">|</span><span>Walkmap: {activeWm.name}</span></>}
      {selectedShape && <><span className="sep">|</span><span>{selectedShape.type} [{selectedShape.mode}]</span></>}
      <span className="scene-statusbar__spacer" />
      <span className="scene-statusbar__coords">
        {mousePos ? `x ${mousePos.x}  y ${mousePos.y}` : 'x —  y —'}
      </span>
    </div>
  )
}
