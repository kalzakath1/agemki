/**
 * @fileoverview SceneCanvas — Canvas 2D interactivo del Scene Editor
 *
 * Componente central del editor de escenarios. Renderiza la vista del juego
 * en un <canvas> HTML y gestiona toda la interacción de ratón para:
 *
 *   - Walkmap: dibujar y editar shapes (polígono, rectángulo, círculo)
 *     con modos add/sub para definir áreas transitables.
 *   - Objetos: colocar instancias y arrastrarlas.
 *   - Personajes: colocar instancias y arrastrarlas (ancladas por los pies).
 *   - Exits: rectángulos de salida con resize desde la esquina SE.
 *   - Entry points: puntos de entrada arrastrables.
 *
 * ARQUITECTURA DE RENDERIZADO:
 *   - Toda la lógica de estado vive en sceneStore (Zustand).
 *   - El canvas lee el estado via stateRef (ref de objeto sincronizado con el store)
 *     para poder acceder a valores actuales desde dentro de handlers de eventos
 *     sin re-registrar listeners en cada render.
 *   - drawAll() se llama explícitamente cada vez que cambia algo visible.
 *
 * SISTEMA DE COORDENADAS:
 *   - Coords canvas: píxeles del elemento <canvas> en pantalla.
 *   - Coords room: píxeles del fondo de la room (320×H px).
 *   - Conversión: canvasToRoom(cx, cy) aplica zoom y pan.
 *   - El pan (panX, panY) es la traslación del origen de la room en el canvas.
 *
 * WALKMAP — TÉCNICA DE MÁSCARA ACUMULADA:
 *   Las shapes se aplican en orden con composite operations (source-over para add,
 *   destination-out para sub) sobre un canvas offscreen de alpha pura.
 *   Luego se colorea con un canvas de color (WALKMAP_MASK_COLOR) usando
 *   destination-in. Esto produce una máscara de color único con holes correctos.
 *
 * SPRITE CACHE:
 *   - spriteCache: Map con clave 'objId:stateId:file' → HTMLImageElement|'loading'|'error'
 *   - charSpriteCache: Map con clave 'charId:animFile:frameWidth' → HTMLImageElement|...
 *   - Las cargas son async; cuando el img.onload dispara, llama a drawAll() para redibujar.
 *   - Los caches se limpian cuando cambia la biblioteca de objetos/personajes.
 *
 * @module SceneCanvas
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import { useSceneStore, TOOLS, LAYERS } from '../../store/sceneStore'
import { useCharStore } from '../../store/charStore'
import { useObjectStore } from '../../store/objectStore'
import { useAppStore } from '../../store/appStore'
import './SceneCanvas.css'

/** Color de relleno semitransparente de la máscara de walkmap (verde suave) */
const WALKMAP_MASK_COLOR = 'rgba(80, 200, 100, 0.45)'
/** Color del borde del shape seleccionado en el walkmap */
const WALKMAP_SEL_STROKE = '#5a9fd4'
/** Color de relleno de las celdas realmente transitables según el motor */
const WALKMAP_CELL_COLOR  = 'rgba(255, 220, 0, 0.35)'
/** Color del borde de la cuadrícula del motor */
const WALKMAP_GRID_STROKE = 'rgba(255, 200, 0, 0.5)'
/** Color de relleno del preview de arrastre (rect/circle) */
const PREVIEW_COLOR      = 'rgba(255, 220, 50, 0.25)'
/** Color del borde del preview de arrastre */
const PREVIEW_STROKE     = 'rgba(255, 220, 50, 0.9)'

/**
 * Canvas interactivo del Scene Editor.
 *
 * @param {Object} props
 * @param {'all'|'connections'} [props.panelMode='all'] - 'all' muestra el editor completo;
 *   'connections' muestra solo el mapa de exits para el panel de conexiones entre rooms.
 */
export default function SceneCanvas({ panelMode = 'all', onMousePosChange }) {
  const canvasRef  = useRef(null)
  /**
   * Ref de estado sincronizada con el store. Permite a los handlers de eventos
   * (mousedown, mousemove, etc.) leer valores actuales del store sin necesidad de
   * re-registrar los listeners en cada render (lo que causaría parpadeo).
   * Se actualiza en cada render via useEffect sin dependencias.
   */
  const stateRef   = useRef({})
  /**
   * Estado del drag activo. null si no hay ninguno.
   * Estructura según el tipo:
   *   rect/circle walkmap: { type:'rect'|'circle', startX, startY, cx?, cy? }
   *   move shape:          { type:'move-shape', shapeId, origPoints|origX|origY|origCX|origCY, startX, startY }
   *   move object inst:    { type:'move-obj', instId, startX, startY, origX, origY }
   *   move char inst:      { type:'move-char', instId, startX, startY, origX, origY }
   *   move exit:           { type:'move-exit', exitId, startX, startY, origX, origY }
   *   resize exit (SE):    { type:'resize-exit', exitId, startX, startY, origW, origH }
   *   move entry:          { type:'move-entry', entryId, startX, startY, origX, origY }
   *   pan:                 { type:'pan', startX, startY, origPanX, origPanY }
   */
  const dragRef    = useRef(null)
  /** Posición actual del ratón en coordenadas room (actualizada en onMouseMove) */
  const mouseRef   = useRef({ x: 0, y: 0 })
  const [cursor, setCursor] = useState('default')
  const spriteCache     = useRef(new Map())  // 'objId:stateId' → HTMLImageElement | 'loading' | 'error'
  const charSpriteCache = useRef(new Map())  // 'charId:animName:frameWidth' → HTMLImageElement | 'loading' | 'error'
  const animFrameRef    = useRef(new Map())  // 'objId:stateId' → { cur, timer } — frame actual del preview animado

  const store        = useSceneStore()
  const objectLibrary = useObjectStore(s => s.objects)
  const charLibrary   = useCharStore(s => s.chars)
  const activeGame    = useAppStore(s => s.activeGame)

  // Sync store → ref
  useEffect(() => {
    stateRef.current = {
      activeRoom:      store.activeRoom,
      backgroundUrl:   store.backgroundUrl,
      zoom:            store.zoom,
      panX:            store.panX,
      panY:            store.panY,
      activeTool:      store.activeTool,
      layers:          store.layers,
      selectedShapeId: store.selectedShapeId,
      pendingPolygon:  store.pendingPolygon,
      drawMode:        store.drawMode,
      selectedInstanceId: store.selectedInstanceId,
      objectInstances:    store.activeRoom?.objects || [],
      charInstances:      store.activeRoom?.characters || [],
      selectedCharInstId: store.selectedCharInstId,
      selectedExitId:     store.selectedExitId,
      selectedEntryId:    store.selectedEntryId,
      selectedLightId:    store.selectedLightId,
      panelMode:          panelMode,
      objectLibrary:      objectLibrary,
      charLibrary:        charLibrary,
      activeGame:         activeGame,
      onMousePosChange:   onMousePosChange,
    }
  })

  // Clear sprite cache when object library changes (e.g. sprite assigned)
  useEffect(() => { spriteCache.current.clear() }, [objectLibrary])
  useEffect(() => { charSpriteCache.current.clear() }, [charLibrary])

  // Global keydown — only fires when no input/textarea has focus
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const { selectedShapeId, activeTool, pendingPolygon, selectedInstanceId, selectedCharInstId, selectedExitId, selectedEntryId } = stateRef.current
      if (e.key === 'Delete') {
        if (selectedShapeId)     { store.deleteShape(selectedShapeId); return }
        if (selectedInstanceId)  { store.deleteObjectInstance(selectedInstanceId); return }
        if (selectedCharInstId)  { store.deleteCharInstance(selectedCharInstId); return }
        if (selectedExitId)      { store.deleteExit(selectedExitId); return }
        if (selectedEntryId)     { store.deleteEntry(selectedEntryId); return }
      }
      if (e.key === 'Escape' && activeTool === TOOLS.POLYGON) store.setPendingPolygon(null)
      if (e.key === 'Enter' && activeTool === TOOLS.POLYGON && pendingPolygon?.length >= 3) {
        store.commitPendingPolygon(stateRef.current.drawMode || 'add')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => { drawAll() }, [
    store.activeRoom, store.backgroundUrl,
    store.zoom, store.panX, store.panY,
    store.layers, store.selectedShapeId,
    store.pendingPolygon, store.activeTool,
    store.selectedCharInstId,
    store.selectedExitId, store.selectedEntryId,
    store.selectedLightId,
    objectLibrary, charLibrary,
  ])

  // ── Coordenadas ──────────────────────────────────────────────────────────

  /**
   * Convierte coordenadas del canvas (píxeles pantalla) a coordenadas room (píxeles del fondo).
   * Aplica la inversa del transform: x_room = (x_canvas - panX) / zoom.
   *
   * @param {number} cx - X en coordenadas canvas
   * @param {number} cy - Y en coordenadas canvas
   * @returns {{x:number, y:number}} Coordenadas room redondeadas a entero
   */
  function canvasToRoom(cx, cy) {
    const { zoom, panX, panY } = stateRef.current
    return {
      x: Math.round((cx - panX) / zoom),
      y: Math.round((cy - panY) / zoom),
    }
  }

  /**
   * Clamp de coordenadas al área del fondo de la room.
   * Evita colocar shapes u objetos fuera del área visible.
   *
   * @param {number} x - X en coords room
   * @param {number} y - Y en coords room
   * @returns {{x:number, y:number}}
   */
  function clampToRoom(x, y) {
    const room = stateRef.current.activeRoom
    if (!room) return { x, y }
    const { w, h } = room.backgroundSize
    return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) }
  }

  // ── Dibujo principal ────────────────────────────────────────────────────

  /**
   * Renderiza el estado completo del canvas. Se llama:
   *   - En cada cambio de dependencias del useEffect principal.
   *   - Desde los handlers de mouse cuando cambia algo visual (drag, hover).
   *   - Desde los callbacks de carga de sprites (img.onload).
   *
   * Orden de capas (de abajo a arriba):
   *   1. Fondo PCX (si la capa BACKGROUND está activa)
   *   2. Walkmap: máscara acumulada + borde del shape seleccionado
   *   3. Objetos instanciados (si la capa OBJECTS está activa)
   *   4. Personajes instanciados (si la capa CHARACTERS está activa)
   *   5. Exits (rectángulos naranjas con handle SE de resize)
   *   6. Entry points (círculos verdes)
   *   7. Marco del área de room + indicador de límite si hay herramienta activa
   *
   * Todo se dibuja dentro de un ctx.save()/restore() con translate(panX, panY)
   * y un clip estricto al área del fondo (0,0 → w*zoom, h*zoom).
   */
  function drawAll() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { activeRoom, backgroundUrl, zoom, panX, panY, layers, selectedShapeId, pendingPolygon, activeTool } = stateRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!activeRoom) return

    const { w, h } = activeRoom.backgroundSize

    ctx.save()
    ctx.translate(panX, panY)

    // Clip estricto al área del fondo
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w * zoom, h * zoom)
    ctx.clip()

    // Fondo
    if (layers[LAYERS.BACKGROUND] && backgroundUrl) {
      const img = new Image()
      img.src = backgroundUrl
      if (img.complete) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0, w * zoom, h * zoom)
      } else {
        img.onload = () => drawAll()
        // Fondo placeholder mientras carga
        ctx.fillStyle = '#1e1e1e'
        ctx.fillRect(0, 0, w * zoom, h * zoom)
      }
    } else {
      ctx.fillStyle = '#1e1e1e'
      ctx.fillRect(0, 0, w * zoom, h * zoom)
    }

    // Walkmap: máscara acumulada única + cuadrícula de celdas del motor
    if (layers[LAYERS.WALKMAP]) {
      const activeWm = activeRoom.walkmaps?.find(wm => wm.id === activeRoom.activeWalkmapId)
      if (activeWm && activeWm.shapes.length > 0) {
        drawWalkmapMask(ctx, activeWm.shapes, w, h, zoom, selectedShapeId)
        // Cuadrícula amarilla: celdas exactas que el motor marca como transitables
        const bgW = activeRoom.backgroundSize?.w || 320
        const scrollW = activeRoom.scroll?.halves
          ? (bgW > 320 ? bgW : 640)  // modo mitades: ancho completo del PCX
          : (activeRoom.scroll?.enabled && activeRoom.scroll?.directionH)
            ? Math.max(activeRoom.scroll?.totalW || 320, bgW) : 320
        const roomW    = scrollW > 320 ? scrollW : 320
        const wmCell   = activeGame?.game?.walkmapCellSize === 4 ? 4 : 8
        drawWalkmapGrid(ctx, activeWm.shapes, roomW, zoom, wmCell)
      }
      // Polígono en construcción
      if (pendingPolygon && pendingPolygon.length > 0) {
        drawPendingPolygon(ctx, pendingPolygon, zoom)
      }
      // Preview rect/circle mientras se arrastra
      if (dragRef.current) {
        drawDragPreview(ctx, zoom)
      }
    }

    // Objetos instanciados en la room
    if (layers[LAYERS.OBJECTS]) {
      const insts = activeRoom.objects || []
      const selInstId = selectedShapeId ? null : stateRef.current.selectedInstanceId
      for (const inst of insts) {
        drawObjectInstance(ctx, inst, zoom, inst.id === selInstId)
      }
    }

    // Personajes instanciados en la room
    if (layers[LAYERS.CHARACTERS]) {
      const charInsts = activeRoom.characters || []
      const selCharId = stateRef.current.selectedCharInstId
      for (const inst of charInsts) {
        drawCharInstance(ctx, inst, zoom, inst.id === selCharId)
      }
    }


    // Exits
    if (layers[LAYERS.EXITS]) {
      const selExitId = stateRef.current.selectedExitId
      for (const exit of (activeRoom.exits || [])) {
        const tz = exit.triggerZone
        const x = tz.x * zoom, y = tz.y * zoom, w = tz.w * zoom, h = tz.h * zoom
        const sel = exit.id === selExitId
        ctx.save()
        ctx.fillStyle   = sel ? 'rgba(255,120,40,0.30)' : 'rgba(255,160,30,0.18)'
        ctx.strokeStyle = sel ? '#ff7820' : 'rgba(255,160,30,0.85)'
        ctx.lineWidth   = sel ? 2 : 1.5
        ctx.setLineDash(sel ? [] : [5, 3])
        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
        // SE corner resize handle only
        if (sel) {
          ctx.fillStyle   = '#ff7820'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth   = 1
          ctx.fillRect(x + w - 8, y + h - 8, 8, 8)
          ctx.strokeRect(x + w - 8, y + h - 8, 8, 8)
        }
        // Arrow icon
        ctx.font = `${Math.max(9, zoom * 5)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = sel ? '#ff7820' : 'rgba(255,160,30,0.9)'
        ctx.fillText('→', x + w / 2, y + h / 2)
        // Label
        ctx.font = `${Math.max(7, zoom * 3.5)}px sans-serif`
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillText(exit.name, x + w / 2 + 1, y - 2)
        ctx.fillStyle = sel ? '#ff7820' : 'rgba(255,200,80,0.95)'
        ctx.fillText(exit.name, x + w / 2, y - 3)
        ctx.textAlign = 'left'
        ctx.restore()
      }
    }

    // Línea central de scroll-por-mitades
    if (activeRoom.scroll?.halves) {
      const halfX = Math.round((activeRoom.backgroundSize?.w || 640) / 2) * zoom
      const roomH = (activeRoom.backgroundSize?.h || 144) * zoom
      const triggerW = 10 * zoom  // zona de trigger ±10px
      ctx.save()
      // Zona de trigger sombreada
      ctx.fillStyle = 'rgba(80,200,255,0.12)'
      ctx.fillRect(halfX - triggerW, 0, triggerW * 2, roomH)
      // Línea central
      ctx.strokeStyle = 'rgba(80,200,255,0.9)'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(halfX, 0)
      ctx.lineTo(halfX, roomH)
      ctx.stroke()
      ctx.setLineDash([])
      // Label
      ctx.font = `${Math.max(8, zoom * 4)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(80,200,255,0.95)'
      ctx.fillText('½', halfX, 4)
      ctx.restore()
    }

    // Entry points
    if (layers[LAYERS.ENTRIES]) {
      const selEntryId = stateRef.current.selectedEntryId
      for (const entry of (activeRoom.entries || [])) {
        const x = entry.x * zoom, y = entry.y * zoom
        const sel = entry.id === selEntryId
        const r = sel ? 7 : 5
        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, r * zoom / 2, 0, Math.PI * 2)
        ctx.fillStyle   = sel ? 'rgba(60,220,120,0.5)' : 'rgba(60,220,120,0.25)'
        ctx.strokeStyle = sel ? '#3cdc78' : 'rgba(60,220,120,0.8)'
        ctx.lineWidth   = sel ? 2 : 1.5
        ctx.fill()
        ctx.stroke()
        // Cross marker — longer when selected
        const cr = sel ? (r + 6) * zoom / 2 : (r + 2) * zoom / 2
        ctx.beginPath()
        ctx.moveTo(x - cr, y); ctx.lineTo(x + cr, y)
        ctx.moveTo(x, y - cr); ctx.lineTo(x, y + cr)
        ctx.strokeStyle = sel ? '#3cdc78' : 'rgba(60,220,120,0.9)'
        ctx.lineWidth   = sel ? 2 : 1
        ctx.stroke()
        // Move handle square when selected
        if (sel) {
          ctx.fillStyle   = '#3cdc78'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth   = 1
          ctx.fillRect(x - 4, y - 4, 8, 8)
          ctx.strokeRect(x - 4, y - 4, 8, 8)
        }
        // Label
        ctx.font = `${Math.max(7, zoom * 3.5)}px sans-serif`
        ctx.textAlign   = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle   = 'rgba(0,0,0,0.5)'
        ctx.fillText(entry.name, x + cr + 2, y + 1)
        ctx.fillStyle   = sel ? '#3cdc78' : 'rgba(100,255,150,0.95)'
        ctx.fillText(entry.name, x + cr + 1, y)
        ctx.textBaseline = 'alphabetic'
        ctx.restore()
      }
    }

    // Luces
    if (layers[LAYERS.LIGHTS]) {
      const selLightId = stateRef.current.selectedLightId
      for (const light of (activeRoom.lights || [])) {
        const lx  = light.x * zoom
        const ly  = light.y * zoom
        const r   = (light.radius || 80) * zoom
        const sel = light.id === selLightId
        const angle = light.coneAngle ?? 360
        const isCone = angle < 360

        ctx.save()

        if (isCone) {
          // Sector del cono
          const dirX  = light.dirX ?? 1
          const dirY  = light.dirY ?? 0
          const half  = (angle / 2) * (Math.PI / 180)
          const baseA = Math.atan2(dirY, dirX)
          const grad  = ctx.createRadialGradient(lx, ly, 0, lx, ly, r)
          grad.addColorStop(0,   sel ? 'rgba(255,220,80,0.65)' : 'rgba(255,220,80,0.45)')
          grad.addColorStop(0.7, sel ? 'rgba(255,180,40,0.25)' : 'rgba(255,180,40,0.18)')
          grad.addColorStop(1,   'rgba(255,180,40,0)')
          ctx.beginPath()
          ctx.moveTo(lx, ly)
          ctx.arc(lx, ly, r, baseA - half, baseA + half)
          ctx.closePath()
          ctx.fillStyle = grad
          ctx.fill()
          // Borde del cono
          ctx.strokeStyle = sel ? 'rgba(255,210,60,0.95)' : 'rgba(255,210,60,0.7)'
          ctx.lineWidth   = sel ? 1.5 : 1
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
          // Línea de dirección
          ctx.beginPath()
          ctx.moveTo(lx, ly)
          ctx.lineTo(lx + Math.cos(baseA) * r, ly + Math.sin(baseA) * r)
          ctx.strokeStyle = sel ? 'rgba(255,220,80,0.9)' : 'rgba(255,220,80,0.6)'
          ctx.lineWidth   = 1
          ctx.stroke()
        } else {
          // Radial omnidireccional
          const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r)
          grad.addColorStop(0,   sel ? 'rgba(255,220,80,0.60)' : 'rgba(255,220,80,0.40)')
          grad.addColorStop(0.6, sel ? 'rgba(255,180,40,0.25)' : 'rgba(255,180,40,0.18)')
          grad.addColorStop(1,   'rgba(255,180,40,0)')
          ctx.beginPath()
          ctx.arc(lx, ly, r, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
          // Anillo exterior
          ctx.strokeStyle = sel ? 'rgba(255,210,60,0.95)' : 'rgba(255,210,60,0.65)'
          ctx.lineWidth   = sel ? 1.5 : 1
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Centro — punto fijo siempre visible
        const dotR = sel ? 6 : 5
        ctx.beginPath()
        ctx.arc(lx, ly, dotR, 0, Math.PI * 2)
        ctx.fillStyle   = '#ffe040'
        ctx.strokeStyle = '#222'
        ctx.lineWidth   = 1.5
        ctx.fill()
        ctx.stroke()

        // Cruz para localizar mejor la posición exacta
        const arm = sel ? 10 : 7
        ctx.beginPath()
        ctx.moveTo(lx - arm, ly); ctx.lineTo(lx + arm, ly)
        ctx.moveTo(lx, ly - arm); ctx.lineTo(lx, ly + arm)
        ctx.strokeStyle = sel ? 'rgba(255,230,80,0.9)' : 'rgba(255,230,80,0.65)'
        ctx.lineWidth   = 1
        ctx.stroke()

        // Handle de arrastre cuando está seleccionado
        if (sel) {
          ctx.fillStyle   = '#ffe040'
          ctx.strokeStyle = '#222'
          ctx.lineWidth   = 1.5
          ctx.fillRect(lx - 5, ly - 5, 10, 10)
          ctx.strokeRect(lx - 5, ly - 5, 10, 10)
        }

        ctx.restore()
      }
    }

    ctx.restore() // fin clip

    // Marco del área
    ctx.strokeStyle = 'rgba(90,159,212,0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, w * zoom, h * zoom)

    // Indicador límite si hay herramienta de dibujo activa
    if (activeTool !== TOOLS.SELECT && activeTool !== TOOLS.PAN) {
      ctx.save()
      ctx.strokeStyle = 'rgba(220,60,60,0.4)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(-1, -1, w * zoom + 2, h * zoom + 2)
      ctx.restore()
    }

    ctx.restore()
  }

  // ── Preview de arrastre (rect y circle) ───────────────────────────────

  function drawDragPreview(ctx, zoom) {
    const drag = dragRef.current
    if (!drag) return
    const cur = mouseRef.current

    ctx.save()
    ctx.fillStyle   = PREVIEW_COLOR
    ctx.strokeStyle = PREVIEW_STROKE
    ctx.lineWidth   = 1.5
    ctx.setLineDash([4, 3])

    if (drag.type === 'rect') {
      const x = Math.min(drag.startX, cur.x)
      const y = Math.min(drag.startY, cur.y)
      const w = Math.abs(cur.x - drag.startX)
      const h = Math.abs(cur.y - drag.startY)
      ctx.fillRect(x * zoom, y * zoom, w * zoom, h * zoom)
      ctx.strokeRect(x * zoom, y * zoom, w * zoom, h * zoom)
      // Dimensiones
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,220,50,0.9)'
      ctx.font = `${Math.max(10, zoom * 5)}px monospace`
      ctx.fillText(`${w}×${h}`, x * zoom + 4, y * zoom - 4)
    }

    if (drag.type === 'circle') {
      const r = Math.round(Math.hypot(cur.x - drag.cx, cur.y - drag.cy))
      ctx.beginPath()
      ctx.arc(drag.cx * zoom, drag.cy * zoom, r * zoom, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Radio
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,220,50,0.9)'
      ctx.font = `${Math.max(10, zoom * 5)}px monospace`
      ctx.fillText(`r=${r}`, drag.cx * zoom + 4, drag.cy * zoom - 4)
      // Línea desde centro al borde
      ctx.beginPath()
      ctx.moveTo(drag.cx * zoom, drag.cy * zoom)
      ctx.lineTo(cur.x * zoom, cur.y * zoom)
      ctx.strokeStyle = 'rgba(255,220,50,0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 2])
      ctx.stroke()
    }

    ctx.restore()
  }

  // ── Máscara acumulada de walkmap ────────────────────────────────────────
  //
  // TÉCNICA: Two-pass offscreen compositing.
  //
  // Paso 1 — canvas de alpha pura:
  //   Itera las shapes en orden. Add = source-over (pinta blanco opaco).
  //   Sub = destination-out (borra los píxeles ya pintados).
  //   Resultado: canvas con alpha=1 donde se puede caminar, alpha=0 donde no.
  //
  // Paso 2 — canvas de color:
  //   Pinta el color WALKMAP_MASK_COLOR en todo el canvas.
  //   Aplica destination-in con la alpha del paso 1.
  //   Resultado: WALKMAP_MASK_COLOR donde caminar, transparente donde no.
  //
  // Después vuelca el canvas de color sobre el principal (un solo drawImage).
  // Por encima pinta el borde del shape seleccionado con applyShapePath + stroke.
  //
  // Ventaja: un único color en toda la máscara, sin artifacts de superposición
  // entre shapes add adyacentes, y los sub generan agujeros correctos.

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} shapes - Array de shapes del walkmap activo
   * @param {number} roomW - Ancho de la room en px
   * @param {number} roomH - Alto de la room en px
   * @param {number} zoom
   * @param {string|null} selectedShapeId - ID del shape seleccionado (para borde)
   */
  function drawWalkmapMask(ctx, shapes, roomW, roomH, zoom, selectedShapeId) {
    const W = roomW * zoom
    const H = roomH * zoom

    // Paso 1 — canvas de máscara alpha pura (blanco opaco)
    const maskC = document.createElement('canvas')
    maskC.width = W; maskC.height = H
    const mc = maskC.getContext('2d')
    mc.globalCompositeOperation = 'source-over'

    for (const shape of shapes) {
      if (shape.mode === 'sub') {
        // Restar: borrar pixels ya pintados
        mc.globalCompositeOperation = 'destination-out'
        mc.fillStyle = 'rgba(0,0,0,1)'
      } else {
        mc.globalCompositeOperation = 'source-over'
        mc.fillStyle = 'rgba(255,255,255,1)'
      }
      applyShapePath(mc, shape, zoom)
      mc.fill()
    }

    // Paso 2 — canvas de color: pinta WALKMAP_MASK_COLOR donde la máscara tiene alpha
    const colorC = document.createElement('canvas')
    colorC.width = W; colorC.height = H
    const cc = colorC.getContext('2d')
    cc.fillStyle = WALKMAP_MASK_COLOR
    cc.fillRect(0, 0, W, H)
    cc.globalCompositeOperation = 'destination-in'
    cc.drawImage(maskC, 0, 0)

    // Volcar sobre el canvas principal
    ctx.drawImage(colorC, 0, 0)

    // Borde del shape seleccionado (encima, sin afectar la máscara)
    if (selectedShapeId) {
      const sel = shapes.find(s => s.id === selectedShapeId)
      if (sel) {
        ctx.save()
        ctx.strokeStyle = WALKMAP_SEL_STROKE
        ctx.lineWidth = 2
        ctx.setLineDash([4, 2])
        applyShapePath(ctx, sel, zoom)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  /**
   * Rasteriza las shapes del walkmap a un bitmap 40×25 usando exactamente la
   * misma lógica que el codegen (index.js):
   *   ADD rect/circle → AABB  (permisivo, captura formas < una celda)
   *   SUB rect/circle → centro-punto (conservador, no erosiona bordes)
   *   polygon         → centro-punto siempre
   *
   * @param {Array} shapes
   * @param {number} roomW - ancho real de la room (px)
   * @returns {Uint8Array} bitmap[gy*40+gx] = 1 si transitable
   */
  function computeWalkmapBitmap(shapes, roomW, cellSize = 8) {
    const CELL_W = cellSize, CELL_H = cellSize
    const GRID_W = Math.ceil(roomW / CELL_W)
    const GRID_H = Math.ceil(144  / CELL_H)
    const bitmap = new Uint8Array(GRID_W * GRID_H)

    function ptInPoly(px, py, pts) {
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
          inside = !inside
      }
      return inside
    }

    for (const shape of shapes) {
      const add = shape.mode !== 'sub'
      for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
          const cellX = gx * CELL_W, cellY = gy * CELL_H
          const cellX2 = cellX + CELL_W, cellY2 = cellY + CELL_H
          const cx = cellX + CELL_W / 2, cy = cellY + CELL_H / 2
          let hit = false
          if (shape.type === 'rect') {
            if (add)
              hit = cellX < shape.x + shape.w && cellX2 > shape.x &&
                    cellY < shape.y + shape.h && cellY2 > shape.y
            else
              hit = cx >= shape.x && cx < shape.x + shape.w &&
                    cy >= shape.y && cy < shape.y + shape.h
          } else if (shape.type === 'circle') {
            if (add) {
              const nearX = Math.max(cellX, Math.min(shape.cx, cellX2))
              const nearY = Math.max(cellY, Math.min(shape.cy, cellY2))
              const dx = shape.cx - nearX, dy = shape.cy - nearY
              hit = dx * dx + dy * dy <= shape.r * shape.r
            } else {
              const dx = cx - shape.cx, dy = cy - shape.cy
              hit = dx * dx + dy * dy <= shape.r * shape.r
            }
          } else if (shape.type === 'polygon' && shape.points?.length >= 3) {
            hit = ptInPoly(cx, cy, shape.points)
          }
          if (hit) bitmap[gy * GRID_W + gx] = add ? 1 : 0
        }
      }
    }
    return bitmap
  }

  /**
   * Dibuja la cuadrícula de celdas transitables tal como las ve el motor.
   * Las celdas walkable se rellenan en amarillo semitransparente.
   * Se dibuja encima de la máscara verde para poder comparar ambas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} shapes
   * @param {number} roomW
   * @param {number} zoom
   */
  function drawWalkmapGrid(ctx, shapes, roomW, zoom, cellSize = 8) {
    const CELL_W = cellSize, CELL_H = cellSize
    const GRID_W = Math.ceil(roomW / CELL_W)
    const GRID_H = Math.ceil(144  / CELL_H)
    const bitmap = computeWalkmapBitmap(shapes, roomW, cellSize)

    ctx.save()
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        if (!bitmap[gy * GRID_W + gx]) continue
        const px = gx * CELL_W * zoom
        const py = gy * CELL_H * zoom
        const pw = CELL_W * zoom
        const ph = CELL_H * zoom
        ctx.fillStyle = WALKMAP_CELL_COLOR
        ctx.fillRect(px, py, pw, ph)
        ctx.strokeStyle = WALKMAP_GRID_STROKE
        ctx.lineWidth = 0.5
        ctx.strokeRect(px, py, pw, ph)
      }
    }
    ctx.restore()
  }

  /**
   * Aplica el path de un shape al contexto dado sin hacer fill ni stroke.
   * El llamador decide qué operación aplicar (fill para máscara, stroke para borde).
   *
   * @param {CanvasRenderingContext2D} c
   * @param {{type:'polygon'|'rect'|'circle', points?:Array, x?:number, y?:number, w?:number, h?:number, cx?:number, cy?:number, r?:number}} shape
   * @param {number} zoom
   */
  function applyShapePath(c, shape, zoom) {
    c.beginPath()
    if (shape.type === 'polygon') {
      if (!shape.points?.length) return
      c.moveTo(shape.points[0].x * zoom, shape.points[0].y * zoom)
      for (let i = 1; i < shape.points.length; i++)
        c.lineTo(shape.points[i].x * zoom, shape.points[i].y * zoom)
      c.closePath()
    } else if (shape.type === 'rect') {
      c.rect(shape.x * zoom, shape.y * zoom, shape.w * zoom, shape.h * zoom)
    } else if (shape.type === 'circle') {
      c.arc(shape.cx * zoom, shape.cy * zoom, shape.r * zoom, 0, Math.PI * 2)
    }
  }

  function drawPendingPolygon(ctx, points, zoom) {
    if (points.length === 0) return
    ctx.save()
    ctx.strokeStyle = PREVIEW_STROKE
    ctx.fillStyle   = PREVIEW_COLOR
    ctx.lineWidth   = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(points[0].x * zoom, points[0].y * zoom)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * zoom, points[i].y * zoom)
    }
    if (points.length >= 3) { ctx.closePath(); ctx.fill() }
    ctx.stroke()
    for (const pt of points) {
      ctx.beginPath()
      ctx.arc(pt.x * zoom, pt.y * zoom, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#ffe032'
      ctx.setLineDash([])
      ctx.fill()
    }
    ctx.restore()
  }


  // ── Sprite cache — personajes ───────────────────────────────────────────
  //
  // Carga el PCX de la animación idle (o la primera animación disponible)
  // de un personaje y renderiza solo el primer frame.
  //
  // El PCX de un personaje es un spritesheet horizontal: todos los frames
  // en una fila. frameWidth = ancho total / frameCount.
  // Para el preview en el Scene Editor solo necesitamos el primer frame.
  //
  // La carga es async: mientras el img no esté listo devuelve 'loading'.
  // Cuando img.onload dispara llama a drawAll() para actualizar el canvas.

  /**
   * Carga y devuelve el sprite (primer frame) de la animación idle del personaje.
   *
   * @param {Object} charDef - Definición del personaje del charStore
   * @param {string} gameDir - Ruta al directorio del juego
   * @param {Array|undefined} palette - Paleta del juego [[r,g,b]×256] o undefined
   * @returns {HTMLImageElement|'loading'|null} Imagen si ya cargó, 'loading' si está en proceso, null si no hay sprite
   */
  function loadCharSprite(charDef, gameDir, palette) {
    const anims = charDef.animations || []
    if (anims.length === 0) return null
    const anim = anims.find(a => a.name?.toLowerCase().includes('idle')) || anims[0]
    if (!anim?.spriteFile) return null

    const fw = anim.frameWidth || null
    const cacheKey = `${charDef.id}:${anim.spriteFile}:${fw}`
    const cached = charSpriteCache.current.get(cacheKey)
    if (cached) return cached

    charSpriteCache.current.set(cacheKey, 'loading')
    ;(async () => {
      try {
        const path = `${gameDir}/assets/converted/sprites/${anim.spriteFile}`
        const result = await window.api.readBinary(path)
        if (!result.ok) { charSpriteCache.current.set(cacheKey, 'error'); return }
        const buf = new Uint8Array(result.buffer)
        const { pcxFileToDataURL, getPcxDimensions } = await import('../../utils/pcxConverter')

        let url
        if (fw) {
          // Render only first frame
          try {
            const dv = new DataView(buf.buffer, buf.byteOffset)
            const totalW = dv.getUint16(8, true) + 1
            const h      = dv.getUint16(10, true) + 1
            const bpl    = dv.getUint16(66, true)
            const frameW = Math.min(fw, totalW)
            const pixels = new Uint8Array(bpl * h)
            let pos = 128, out = 0
            while (out < pixels.length && pos < buf.length - 769) {
              const byte = buf[pos++]
              if ((byte & 0xC0) === 0xC0) {
                const count = byte & 0x3F, val = buf[pos++]
                for (let i = 0; i < count && out < pixels.length; i++) pixels[out++] = val
              } else { pixels[out++] = byte }
            }
            const palOff = buf.length - 769
            const pal = buf[palOff] === 0x0C
              ? Array.from({ length: 256 }, (_, i) => [buf[palOff+1+i*3], buf[palOff+2+i*3], buf[palOff+3+i*3]])
              : (palette || [])
            const canvas = document.createElement('canvas')
            canvas.width = frameW; canvas.height = h
            const ctx2 = canvas.getContext('2d')
            const imgData = ctx2.createImageData(frameW, h)
            for (let y = 0; y < h; y++) for (let x = 0; x < frameW; x++) {
              const idx = pixels[y * bpl + x]
              const [r, g, b] = pal[idx] || [0,0,0]
              const p = (y * frameW + x) * 4
              imgData.data[p]=r; imgData.data[p+1]=g; imgData.data[p+2]=b; imgData.data[p+3]=idx===0?0:255
            }
            ctx2.putImageData(imgData, 0, 0)
            url = canvas.toDataURL('image/png')
          } catch { url = pcxFileToDataURL(buf, palette) }
        } else {
          url = pcxFileToDataURL(buf, palette)
        }

        const img = new Image()
        img.onload = () => { charSpriteCache.current.set(cacheKey, img); drawAll() }
        img.src = url
      } catch { charSpriteCache.current.set(cacheKey, 'error') }
    })()
    return 'loading'
  }

  // ── Dibujar instancia de personaje ───────────────────────────────────────
  //
  // ANCLAJE POR LOS PIES: los personajes se posicionan en (x, y) donde y es
  // la coordenada del suelo (donde están los pies). El sprite se dibuja con
  // su esquina inferior-central en (x*zoom, y*zoom):
  //   ctx.drawImage(sprite, x - sw/2, y - sh, sw, sh)
  //
  // El protagonista se resalta en violeta (#a78bfa); los NPCs en blanco.
  // Si el sprite no está listo se muestra un placeholder rectangular.

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{id:string, charId:string, x:number, y:number, charName?:string}} inst
   * @param {number} zoom
   * @param {boolean} selected
   */
  function drawCharInstance(ctx, inst, zoom, selected) {
    const x = inst.x * zoom
    const y = inst.y * zoom
    const { charLibrary, activeGame } = stateRef.current
    const charDef = charLibrary?.find(c => c.id === inst.charId)

    let sprite = null
    if (charDef && activeGame) {
      const result = loadCharSprite(charDef, activeGame.gameDir, activeGame.game?.palette)
      if (result instanceof HTMLImageElement) sprite = result
    }

    ctx.save()
    if (selected) { ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10 }

    const label = inst.charName || inst.charId
    const isProto = charDef?.isProtagonist

    if (sprite) {
      const sw = sprite.naturalWidth * zoom
      const sh = sprite.naturalHeight * zoom
      // Draw anchored at feet (bottom-center)
      ctx.drawImage(sprite, x - sw / 2, y - sh, sw, sh)
      if (selected) {
        ctx.shadowBlur = 0
        ctx.strokeStyle = '#a78bfa'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.strokeRect(x - sw / 2, y - sh, sw, sh)
        ctx.setLineDash([])
      }
      ctx.shadowBlur = 0
      const labelY = y - sh - 3
      ctx.font = `${Math.max(8, zoom * 4)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillText(label, x + 1, labelY + 1)
      ctx.fillStyle = isProto ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.9)'
      ctx.fillText(label, x, labelY)
      ctx.textAlign = 'left'
    } else {
      // Placeholder
      const size = 28 * zoom
      ctx.fillStyle = selected ? 'rgba(167,139,250,0.35)' : 'rgba(100,180,100,0.2)'
      ctx.strokeStyle = selected ? '#a78bfa' : 'rgba(100,200,100,0.7)'
      ctx.lineWidth = 1.5
      // Draw a simple figure placeholder anchored at feet
      ctx.fillRect(x - size/2, y - size, size, size)
      ctx.strokeRect(x - size/2, y - size, size, size)
      ctx.shadowBlur = 0
      ctx.fillStyle = isProto ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.85)'
      ctx.font = `${Math.max(7, zoom * 3.5)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(label, x, y - size - 3)
      ctx.textAlign = 'left'
    }
    ctx.restore()
  }

  // ── Sprite cache — objetos ───────────────────────────────────────────────
  //
  // Carga el PCX del estado activo del objeto. A diferencia de los personajes,
  // los objetos no tienen frameWidth (se renderiza el PCX completo).
  // La clave de cache incluye el stateId para invalidar cuando cambia el estado.

  /**
   * @param {Object} objDef - Definición del objeto del objectStore
   * @param {string} gameDir
   * @param {Array|undefined} palette
   * @returns {HTMLImageElement|'loading'|null}
   */
  function loadSprite(objDef, gameDir, palette) {
    const activeState = objDef.states?.find(s => s.id === (objDef.stateOverride || objDef.activeStateId))
                     || objDef.states?.[0]
    if (!activeState?.spriteFile) return null

    const cacheKey = `${objDef.id}:${activeState.id}:${activeState.spriteFile}`
    const cached = spriteCache.current.get(cacheKey)
    if (cached) return cached  // HTMLImageElement | 'loading' | 'error'

    // Start async load
    spriteCache.current.set(cacheKey, 'loading')
    ;(async () => {
      try {
        const path = `${gameDir}/assets/converted/objects/${activeState.spriteFile}`
        const result = await window.api.readBinary(path)
        if (!result.ok) { spriteCache.current.set(cacheKey, 'error'); return }
        const { pcxFileToDataURL } = await import('../../utils/pcxConverter')
        const url = pcxFileToDataURL(new Uint8Array(result.buffer), palette)
        const img = new Image()
        img.onload = () => {
          spriteCache.current.set(cacheKey, img)
          drawAll()  // redraw once image is ready
        }
        img.src = url
      } catch {
        spriteCache.current.set(cacheKey, 'error')
      }
    })()

    return 'loading'
  }

  // ── Dibujar instancia de objeto ───────────────────────────────────────

  function drawObjectInstance(ctx, inst, zoom, selected) {
    const x = inst.x * zoom
    const y = inst.y * zoom

    // Buscar definición del objeto en la biblioteca
    const { objectLibrary, activeGame } = stateRef.current
    const objDef = objectLibrary?.find(o => o.id === inst.objectId)

    // Intentar obtener el sprite del estado activo
    let sprite = null
    if (objDef && activeGame) {
      const result = loadSprite(objDef, activeGame.gameDir, activeGame.game?.palette)
      if (result instanceof HTMLImageElement) sprite = result
    }

    ctx.save()
    if (selected) { ctx.shadowColor = '#5a9fd4'; ctx.shadowBlur = 8 }

    if (sprite) {
      // Estado activo del objeto (puede ser animado)
      const activeState = objDef?.states?.find(s => s.id === (objDef.stateOverride || objDef.activeStateId)) || objDef?.states?.[0]
      const isAnim = activeState?.animated && (activeState?.frameCount || 1) > 1
      const nFrames = isAnim ? (activeState.frameCount || 1) : 1
      const fw = isAnim
        ? (activeState.frameWidth > 0 ? activeState.frameWidth : Math.floor(sprite.naturalWidth / nFrames))
        : sprite.naturalWidth
      const animKey = `${inst.objectId}:${activeState?.id}`
      const frameCur = isAnim ? (animFrameRef.current.get(animKey)?.cur || 0) : 0
      const sx = frameCur * fw   // offset horizontal en el spritesheet

      const sh_img = sprite.naturalHeight
      const dw = fw * zoom
      const dh_img = sh_img * zoom
      // Dibujar solo el frame actual, anclado por los pies (bottom-center), igual que el engine
      ctx.drawImage(sprite, sx, 0, fw, sh_img, x - dw / 2, y - dh_img, dw, dh_img)
      const sw = dw
      const sh = dh_img
      // Marco de selección
      if (selected) {
        ctx.shadowBlur = 0
        ctx.strokeStyle = '#5a9fd4'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.strokeRect(x - sw / 2, y - sh, sw, sh)
        ctx.setLineDash([])
      }
      // Nombre encima
      ctx.shadowBlur = 0
      const labelY = y - sh - 3
      ctx.font = `${Math.max(8, zoom * 4)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillText(inst.objectName || inst.objectId, x + 1, labelY + 1)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText(inst.objectName || inst.objectId, x, labelY)
      ctx.textAlign = 'left'
    } else {
      // Placeholder mientras carga o si no hay sprite
      const size = 24 * zoom
      // Placeholder anclado por los pies (bottom-center)
      ctx.fillStyle = selected ? 'rgba(90,159,212,0.35)' : 'rgba(255,200,50,0.25)'
      ctx.strokeStyle = selected ? '#5a9fd4' : 'rgba(255,200,50,0.8)'
      ctx.lineWidth = 1.5
      ctx.fillRect(x - size / 2, y - size, size, size)
      ctx.strokeRect(x - size / 2, y - size, size, size)
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fillStyle = selected ? '#5a9fd4' : 'rgba(255,200,50,0.9)'
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = `${Math.max(8, zoom * 4)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(inst.objectName || inst.objectId, x, y - size - 3)
      ctx.textAlign = 'left'
    }

    ctx.restore()
  }

  // ── Eventos ────────────────────────────────────────────────────────────

  function getCanvasPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = useCallback((e) => {
    const { activeTool, zoom, panX, panY } = stateRef.current
    const canvasPos = getCanvasPos(e)
    const roomPos   = canvasToRoom(canvasPos.x, canvasPos.y)
    const clamped   = clampToRoom(roomPos.x, roomPos.y)

    if (activeTool === TOOLS.PAN || e.button === 1) {
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, panX, panY }
      setCursor('grabbing')
      return
    }

    // Herramientas de walkmap solo actúan si el panel activo lo permite
    const walkmapAllowed = ['walkmap', 'all'].includes(stateRef.current.panelMode)

    if (activeTool === TOOLS.POLYGON) {
      if (!walkmapAllowed) return
      if (e.detail === 2) { store.commitPendingPolygon(stateRef.current.drawMode || 'add'); return }
      const pending = stateRef.current.pendingPolygon || []
      store.setPendingPolygon([...pending, clamped])
      return
    }

    if (activeTool === TOOLS.RECT) {
      if (!walkmapAllowed) return
      dragRef.current = { type: 'rect', startX: clamped.x, startY: clamped.y }
      return
    }

    if (activeTool === TOOLS.CIRCLE) {
      if (!walkmapAllowed) return
      dragRef.current = { type: 'circle', cx: clamped.x, cy: clamped.y }
      return
    }

    if (activeTool === TOOLS.SELECT) {
      const room = stateRef.current.activeRoom
      const pm   = stateRef.current.panelMode

      // When in exits panel, exits/entries have exclusive priority
      const exitsMode   = pm === 'exits'
      const objectsMode = pm === 'objects' || pm === 'all'
      const charsMode   = pm === 'characters' || pm === 'all'

      // Hit test instancias de objetos (sólo si no estamos en modo exits)
      if (!exitsMode) {
      const insts = room?.objects || []
      let hitInst = null
      for (let i = insts.length - 1; i >= 0; i--) {
        const inst = insts[i]
        // Objetos anclados por los pies: inst.y es la base, sprite sube desde ahí
        const halfW = 14  // tolerancia horizontal
        const hitH  = 28  // altura aproximada de hit (inst.y-28 .. inst.y)
        if (Math.abs(roomPos.x - inst.x) <= halfW &&
            roomPos.y >= inst.y - hitH && roomPos.y <= inst.y) {
          hitInst = inst.id; break
        }
      }
      if (hitInst) {
        store.selectInstance(hitInst)
        dragRef.current = { type: 'instance', instId: hitInst }
        return
      }
      } // end !exitsMode

      // Hit test character instances (anchored at feet, only when not in exits mode)
      // Use real sprite dimensions from cache when available
      let hitChar = null
      if (!exitsMode) {
      const charInsts = room?.characters || []
      const { charLibrary: cl, activeGame: ag } = stateRef.current
      for (let i = charInsts.length - 1; i >= 0; i--) {
        const ci      = charInsts[i]
        const charDef = cl?.find(c => c.id === ci.charId)
        const anims   = charDef?.animations || []
        const anim    = anims.find(a => a.name?.toLowerCase().includes('idle')) || anims[0]
        const fw      = anim?.frameWidth || null
        const cacheKey = charDef ? `${charDef.id}:${anim?.spriteFile}:${fw}` : null
        const cached   = cacheKey ? charSpriteCache.current.get(cacheKey) : null
        const sprite   = cached instanceof HTMLImageElement ? cached : null
        const halfW    = sprite ? sprite.naturalWidth  / 2 : 16
        const sprH     = sprite ? sprite.naturalHeight     : 32
        if (roomPos.x >= ci.x - halfW && roomPos.x <= ci.x + halfW &&
            roomPos.y >= ci.y - sprH  && roomPos.y <= ci.y + 4) {
          hitChar = ci.id; break
        }
      }
      if (hitChar) {
        store.selectCharInst(hitChar)
        dragRef.current = { type: 'charInst', instId: hitChar }
        return
      }
      } // end !exitsMode

      // Hit test exits
      const { layers: hitLayers } = stateRef.current
      if (hitLayers[LAYERS.EXITS] !== false) {
        const exits = room?.exits || []
        let hitExit = null
        for (let i = exits.length - 1; i >= 0; i--) {
          const ex = exits[i]; const tz = ex.triggerZone
          if (roomPos.x >= tz.x && roomPos.x <= tz.x + tz.w &&
              roomPos.y >= tz.y && roomPos.y <= tz.y + tz.h) {
            hitExit = ex.id; break
          }
        }
        if (hitExit) {
          store.selectExit(hitExit)
          const ex = exits.find(e => e.id === hitExit)
          const tz = ex?.triggerZone
          // Only SE corner (bottom-right 12px) triggers resize — rest is move
          if (tz) {
            const onSE = roomPos.x >= tz.x + tz.w - 12 && roomPos.y >= tz.y + tz.h - 12
            if (onSE) {
              dragRef.current = { type: 'exitResize', instId: hitExit, origTz: { ...tz }, startX: roomPos.x, startY: roomPos.y }
              return
            }
          }
          dragRef.current = { type: 'exit', instId: hitExit,
            offX: ex ? roomPos.x - ex.triggerZone.x : 0,
            offY: ex ? roomPos.y - ex.triggerZone.y : 0 }
          return
        }
      }

      // Hit test entry points
      if (hitLayers[LAYERS.ENTRIES] !== false) {
        const entries = room?.entries || []
        let hitEntry = null
        for (let i = entries.length - 1; i >= 0; i--) {
          const en = entries[i]; const R = 8
          if (Math.abs(roomPos.x - en.x) <= R && Math.abs(roomPos.y - en.y) <= R) {
            hitEntry = en.id; break
          }
        }
        if (hitEntry) {
          store.selectEntry(hitEntry)
          dragRef.current = { type: 'entry', instId: hitEntry }
          return
        }
      }

      // Hit test walkmap shapes
      const activeWm = room?.walkmaps?.find(w => w.id === room.activeWalkmapId)
      if (activeWm) {
        let hit = null
        for (let i = activeWm.shapes.length - 1; i >= 0; i--) {
          if (hitTestShape(activeWm.shapes[i], roomPos.x, roomPos.y)) {
            hit = activeWm.shapes[i].id; break
          }
        }
        store.selectShape(hit)
        if (hit) { store.selectInstance(null); store.selectCharInst(null) }
        if (!hit && !hitChar) store.selectCharInst(null)
      }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const { activeTool } = stateRef.current
    const canvasPos = getCanvasPos(e)
    const clamped   = clampToRoom(...Object.values(canvasToRoom(canvasPos.x, canvasPos.y)))
    mouseRef.current = clamped
    stateRef.current.onMousePosChange?.(clamped)

    if (dragRef.current?.type === 'pan') {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      store.setPan(dragRef.current.panX + dx, dragRef.current.panY + dy)
      return
    }

    // Drag instancia de objeto
    if (dragRef.current?.type === 'instance') {
      store.updateObjectInstance(dragRef.current.instId, { x: clamped.x, y: clamped.y })
      drawAll()
      return
    }

    // Resize exit trigger zone (SE corner only)
    if (dragRef.current?.type === 'exitResize') {
      const { instId, origTz, startX, startY } = dragRef.current
      if (origTz) {
        const dx = clamped.x - startX, dy = clamped.y - startY
        store.updateExit(instId, { triggerZone: {
          x: origTz.x, y: origTz.y,
          w: Math.max(8, origTz.w + dx),
          h: Math.max(6, origTz.h + dy),
        }})
        drawAll()
      }
      return
    }

    // Drag exit trigger zone (move whole rect)
    if (dragRef.current?.type === 'exit') {
      store.updateExit(dragRef.current.instId, {
        triggerZone: {
          ...(stateRef.current.activeRoom?.exits?.find(e => e.id === dragRef.current.instId)?.triggerZone || {}),
          x: clamped.x - (dragRef.current.offX || 0),
          y: clamped.y - (dragRef.current.offY || 0),
        }
      })
      drawAll(); return
    }

    // Drag entry point
    if (dragRef.current?.type === 'entry') {
      store.updateEntry(dragRef.current.instId, { x: clamped.x, y: clamped.y })
      drawAll(); return
    }

    // Drag instancia de personaje
    if (dragRef.current?.type === 'charInst') {
      store.updateCharInstance(dragRef.current.instId, { x: clamped.x, y: clamped.y })
      drawAll()
      return
    }

    // Redibujar para mostrar preview en tiempo real
    if (dragRef.current?.type === 'rect' || dragRef.current?.type === 'circle') {
      drawAll()
    }

    const wkAllowed = ['walkmap', 'all'].includes(stateRef.current.panelMode)
    if (activeTool === TOOLS.PAN) {
      setCursor('grab')
    } else if (wkAllowed && [TOOLS.POLYGON, TOOLS.RECT, TOOLS.CIRCLE].includes(activeTool)) {
      setCursor('crosshair')
    } else if (activeTool === TOOLS.SELECT) {
      // Show move cursor when hovering over an object or char instance
      const room2 = stateRef.current.activeRoom
      const rp = canvasToRoom(getCanvasPos(e).x, getCanvasPos(e).y)
      // SE corner of selected exit → resize cursor; rest → move
      const selExitId2 = stateRef.current.selectedExitId
      const selExit2   = selExitId2 ? (room2?.exits||[]).find(e=>e.id===selExitId2) : null
      let exitCursor = null
      if (selExit2) {
        const tz = selExit2.triggerZone
        const onSE = rp.x >= tz.x + tz.w - 12 && rp.y >= tz.y + tz.h - 12
        exitCursor = onSE ? 'se-resize' : null
      }
      const onExit  = (room2?.exits   || []).some(ex => { const tz = ex.triggerZone; return rp.x>=tz.x && rp.x<=tz.x+tz.w && rp.y>=tz.y && rp.y<=tz.y+tz.h })
      const onEntry = (room2?.entries || []).some(en => Math.abs(rp.x-en.x)<=8 && Math.abs(rp.y-en.y)<=8)
      const onObj  = (room2?.objects || []).some(o => Math.abs(rp.x - o.x) <= 12 && Math.abs(rp.y - o.y) <= 12)
      const { charLibrary: cl2 } = stateRef.current
      const onChar = (room2?.characters || []).some(c => {
        const cd  = cl2?.find(x => x.id === c.charId)
        const an  = (cd?.animations || []).find(a => a.name?.toLowerCase().includes('idle')) || cd?.animations?.[0]
        const fw  = an?.frameWidth || null
        const ck  = cd ? `${cd.id}:${an?.spriteFile}:${fw}` : null
        const sp  = ck && charSpriteCache.current.get(ck) instanceof HTMLImageElement ? charSpriteCache.current.get(ck) : null
        const hw  = sp ? sp.naturalWidth / 2 : 16
        const sh  = sp ? sp.naturalHeight    : 32
        return rp.x >= c.x - hw && rp.x <= c.x + hw && rp.y >= c.y - sh && rp.y <= c.y + 4
      })
      if (exitCursor) setCursor(exitCursor)
      else setCursor(onObj || onChar || onExit || onEntry ? 'move' : 'default')
    } else {
      setCursor('default')
    }
  }, [])

  const handleMouseUp = useCallback((e) => {
    const drag = dragRef.current
    dragRef.current = null
    setCursor(stateRef.current.activeTool === TOOLS.PAN ? 'grab' : 'default')

    if (!drag || drag.type === 'pan') return

    const canvasPos = getCanvasPos(e)
    const clamped   = clampToRoom(...Object.values(canvasToRoom(canvasPos.x, canvasPos.y)))

    // Sólo confirmar shapes de walkmap si el panel lo permite
    const walkmapOk = ['walkmap', 'all'].includes(stateRef.current.panelMode)

    if (drag.type === 'rect' && walkmapOk) {
      const x = Math.min(drag.startX, clamped.x)
      const y = Math.min(drag.startY, clamped.y)
      const w = Math.abs(clamped.x - drag.startX)
      const h = Math.abs(clamped.y - drag.startY)
      if (w > 2 && h > 2) {
        const mode = stateRef.current.drawMode || 'add'
        store.addShape({ id: `shape_${Date.now()}`, type: 'rect', mode, x, y, w, h })
      }
    }

    if (drag.type === 'circle' && walkmapOk) {
      const r = Math.round(Math.hypot(clamped.x - drag.cx, clamped.y - drag.cy))
      if (r > 2) {
        const circleMode = stateRef.current.drawMode || 'add'
        store.addShape({ id: `shape_${Date.now()}`, type: 'circle', mode: circleMode, cx: drag.cx, cy: drag.cy, r })
      }
    }

    drawAll()
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    if (e.ctrlKey) {
      // Ctrl+Wheel → zoom
      const { zoom } = stateRef.current
      const LEVELS = [1, 2, 4, 8]
      const idx = LEVELS.indexOf(zoom)
      const nextIdx = Math.max(0, Math.min(LEVELS.length - 1, idx + (e.deltaY < 0 ? 1 : -1)))
      store.setZoom(LEVELS[nextIdx])
    } else if (e.shiftKey) {
      // Shift+Wheel → pan horizontal
      const { panX, panY } = stateRef.current
      store.setPan(panX - e.deltaY, panY)
    } else {
      // Wheel → pan vertical
      const { panX, panY } = stateRef.current
      store.setPan(panX, panY - e.deltaY)
    }
  }, [])



  // ── Hit testing ────────────────────────────────────────────────────────

  function hitTestShape(shape, x, y) {
    if (shape.type === 'rect')
      return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h
    if (shape.type === 'circle')
      return Math.hypot(x - shape.cx, y - shape.cy) <= shape.r
    if (shape.type === 'polygon' && shape.points?.length >= 3)
      return pointInPolygon(x, y, shape.points)
    return false
  }

  function pointInPolygon(x, y, pts) {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
    }
    return inside
  }

  // ── Loop de animación para objetos animados ─────────────────────────────

  useEffect(() => {
    let rafId
    const tick = (now) => {
      const { objectLibrary, activeRoom } = stateRef.current
      if (!activeRoom?.objects?.length || !objectLibrary) { rafId = requestAnimationFrame(tick); return }
      let needsRedraw = false
      for (const inst of activeRoom.objects) {
        const objDef = objectLibrary.find(o => o.id === inst.objectId)
        const st = objDef?.states?.find(s => s.id === (objDef.stateOverride || objDef.activeStateId)) || objDef?.states?.[0]
        if (!st?.animated || (st.frameCount || 1) <= 1) continue
        const key = `${inst.objectId}:${st.id}`
        const state = animFrameRef.current.get(key) || { cur: 0, last: now }
        const fps = st.fps || 8
        const interval = 1000 / fps
        if (now - state.last >= interval) {
          state.cur  = (state.cur + 1) % (st.frameCount || 1)
          state.last = now
          animFrameRef.current.set(key, state)
          needsRedraw = true
        }
      }
      if (needsRedraw) drawAll()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // ── Resize ─────────────────────────────────────────────────────────────

  const wrapRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = wrap.clientWidth  - SB_SIZE
      canvas.height = wrap.clientHeight - SB_SIZE
      drawAll()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // ── Scrollbars ─────────────────────────────────────────────────────────────
  const SB_SIZE = 12  // grosor de la barra en px

  // Tamaño del contenido visible en coordenadas room
  const { zoom, panX, panY, activeRoom } = store
  const roomW  = (activeRoom?.backgroundSize?.w || 320) * zoom
  const roomH  = (activeRoom?.backgroundSize?.h || 144) * zoom
  const canvas = canvasRef.current
  const viewW  = canvas ? canvas.width  : 0
  const viewH  = canvas ? canvas.height : 0

  // Rango de pan: el usuario puede ir desde -roomW/2 hasta 0 (al principio) o hasta viewW-roomW (al final)
  const minPanX = Math.min(0, viewW - roomW)
  const minPanY = Math.min(0, viewH - roomH)
  const maxPanX = 0
  const maxPanY = 0

  // Tamaño relativo del thumb (fracción visible del contenido)
  const thumbWFrac = viewW > 0 && roomW > viewW ? viewW / roomW : 1
  const thumbHFrac = viewH > 0 && roomH > viewH ? viewH / roomH : 1

  const sbDragRef = useRef(null)

  function handleSBMouseDown(axis, e) {
    e.stopPropagation()
    sbDragRef.current = { axis, startMouse: axis === 'x' ? e.clientX : e.clientY, startPan: axis === 'x' ? panX : panY }
    function onMove(ev) {
      const { axis, startMouse, startPan } = sbDragRef.current
      const delta = (axis === 'x' ? ev.clientX : ev.clientY) - startMouse
      const trackLen = axis === 'x' ? (viewW - SB_SIZE) : (viewH - SB_SIZE)
      const contentLen = axis === 'x' ? roomW : roomH
      const panRange = axis === 'x' ? (minPanX) : (minPanY)
      // thumb delta → pan delta: thumb travels trackLen*(1-thumbFrac), pan travels -panRange
      const thumbTravel = trackLen * (1 - (axis === 'x' ? thumbWFrac : thumbHFrac))
      const panDelta = thumbTravel > 0 ? delta * panRange / thumbTravel : 0
      const newPan = Math.max(panRange, Math.min(0, startPan + panDelta))
      if (axis === 'x') store.setPan(newPan, panY)
      else              store.setPan(panX, newPan)
    }
    function onUp() {
      sbDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Thumb position as px offset inside track
  const trackW = viewW - SB_SIZE
  const trackH = viewH - SB_SIZE
  const thumbW = Math.max(20, trackW * thumbWFrac)
  const thumbH = Math.max(20, trackH * thumbHFrac)
  const thumbX = minPanX < 0 ? (panX - maxPanX) / minPanX * (trackW - thumbW) : 0
  const thumbY = minPanY < 0 ? (panY - maxPanY) / minPanY * (trackH - thumbH) : 0

  const showSBH = roomW > viewW
  const showSBV = roomH > viewH

  return (
    <div ref={wrapRef} className="scene-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="scene-canvas"
        style={{ cursor, position: 'absolute', top: 0, left: 0 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />
      {/* Scrollbar horizontal */}
      {showSBH && (
        <div className="scene-sb scene-sb--h" style={{ bottom: SB_SIZE, height: SB_SIZE, left: 0, right: SB_SIZE }}>
          <div className="scene-sb__thumb"
            style={{ left: thumbX, width: thumbW }}
            onMouseDown={(e) => handleSBMouseDown('x', e)} />
        </div>
      )}
      {/* Scrollbar vertical */}
      {showSBV && (
        <div className="scene-sb scene-sb--v" style={{ right: 0, width: SB_SIZE, top: 0, bottom: SB_SIZE }}>
          <div className="scene-sb__thumb"
            style={{ top: thumbY, height: thumbH }}
            onMouseDown={(e) => handleSBMouseDown('y', e)} />
        </div>
      )}
      {/* Corner square when both bars visible */}
      {showSBH && showSBV && (
        <div className="scene-sb__corner" style={{ width: SB_SIZE, height: SB_SIZE, right: 0, bottom: 0 }} />
      )}
    </div>
  )
}
