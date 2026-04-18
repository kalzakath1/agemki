/**
 * @fileoverview sceneStore — Estado del Scene Editor
 *
 * Gestiona todo el estado de la vista de edición de una room concreta:
 * la room activa, el zoom/pan, las capas visibles, la herramienta activa,
 * y las selecciones de shapes, objetos, personajes, exits y entry points.
 *
 * ESTRUCTURA DE DATOS DE UNA ROOM (activeRoom):
 * ```json
 * {
 *   "id": "room_001", "name": "taberna",
 *   "backgroundSize": { "w": 320, "h": 144 },
 *   "backgroundFile": "TABERNA.PCX",
 *   "walkmaps": [
 *     {
 *       "id": "wm_default", "name": "default",
 *       "shapes": [
 *         { "id": "sh_001", "type": "polygon", "mode": "add",
 *           "points": [{"x":10,"y":80}, {"x":310,"y":80}, ...] },
 *         { "id": "sh_002", "type": "rect", "mode": "sub",
 *           "x": 100, "y": 60, "w": 80, "h": 20 }
 *       ]
 *     }
 *   ],
 *   "activeWalkmapId": "wm_default",
 *   "objects": [
 *     { "id": "inst_001", "objectId": "obj_001", "x": 120, "y": 100,
 *       "stateOverride": null, "visible": true }
 *   ],
 *   "characters": [
 *     { "id": "cinst_001", "charId": "char_001", "x": 80, "y": 110 }
 *   ],
 *   "exits": [
 *     { "id": "exit_001", "name": "puerta_norte", "targetRoomId": "room_002",
 *       "targetEntryId": "entry_default",
 *       "triggerZone": { "x": 140, "y": 0, "w": 40, "h": 20 } }
 *   ],
 *   "entries": [
 *     { "id": "entry_default", "name": "entry_default", "x": 160, "y": 100 }
 *   ]
 * }
 * ```
 *
 * HERRAMIENTAS (TOOLS):
 *   SELECT  → selección y arrastre de shapes, objetos, personajes, exits, entries
 *   PAN     → mover la vista (también con botón central del ratón)
 *   POLYGON → dibujar polígono vértice a vértice (Enter para cerrar, Esc para cancelar)
 *   RECT    → dibujar rectángulo por arrastre
 *   CIRCLE  → dibujar círculo por arrastre desde el centro
 *
 * CAPAS (LAYERS):
 *   Cada capa se puede mostrar/ocultar independientemente. El SceneCanvas
 *   lee layers[LAYERS.X] antes de dibujar cada tipo de elemento.
 *
 * WALKMAP — SHAPES:
 *   Cada shape tiene mode: 'add' | 'sub'.
 *   - add: añade área transitable (source-over en el canvas offscreen)
 *   - sub: resta área (destination-out) — crea "agujeros" en la zona transitable
 *   Las shapes se aplican en orden: el orden importa (un sub solo afecta
 *   a las áreas add que ya están pintadas encima de él).
 *
 *   pendingPolygon: array de puntos del polígono en construcción (herramienta POLYGON).
 *   drawMode: 'add' | 'sub' — modo para el próximo shape a crear.
 *
 * SELECCIÓN:
 *   Solo puede haber un elemento seleccionado a la vez. Las funciones
 *   selectX() limpian las demás selecciones al activar la suya.
 *   selectedShapeId, selectedInstanceId, selectedCharInstId, selectedExitId, selectedEntryId
 *
 * @module sceneStore
 */
import { create } from 'zustand' 

/** @type {Record<string, string>} Herramientas disponibles en el Scene Editor */
export const TOOLS = {
  SELECT:  'select',   // Selección y arrastre
  PAN:     'pan',      // Mover la vista
  POLYGON: 'polygon',  // Dibujar polígono vértice a vértice
  RECT:    'rect',     // Dibujar rectángulo por arrastre
  CIRCLE:  'circle',   // Dibujar círculo por arrastre
}

/** @type {Record<string, string>} Identificadores de capas de visualización */
export const LAYERS = {
  EXITS:       'exits',
  ENTRIES:     'entries',
  BACKGROUND:  'background',
  WALKMAP:     'walkmap',
  OBJECTS:     'objects',
  CHARACTERS:  'characters',
  VISIBILITY:  'visibility',  // zona de visibilidad del jugador (no implementada)
  LIGHTS:      'lights',      // capa de luces (pendiente de implementar)
  EFFECTS:     'effects',     // efectos visuales (pendiente de implementar)
}

const DEFAULT_LAYERS = {
  [LAYERS.BACKGROUND]:  true,
  [LAYERS.WALKMAP]:     true,
  [LAYERS.OBJECTS]:     true,
  [LAYERS.CHARACTERS]:  true,
  [LAYERS.VISIBILITY]:  false,
  [LAYERS.EXITS]:       true,
  [LAYERS.ENTRIES]:     true,
  [LAYERS.LIGHTS]:      true,
  [LAYERS.EFFECTS]:     false,
}

export const useSceneStore = create((set, get) => ({

  // ── Room activa ──────────────────────────────────────────────────────────────

  /** @type {Object|null} Objeto room completo. null = ninguna room abierta en el Scene Editor. */
  activeRoom: null,

  /**
   * Data URL del fondo PCX cargado para renderizar en el canvas.
   * Se genera al abrir la room con pcxFileToDataURL().
   * null = sin fondo asignado o no cargado aún.
   * @type {string|null}
   */
  backgroundUrl: null,

  /** @type {boolean} true si hay cambios en la room sin guardar a disco */
  dirty: false,

  // ── Vista ────────────────────────────────────────────────────────────────────

  /** @type {number} Factor de zoom del canvas (1=1px:1px, 2=2px:1px, 4x, etc.) */
  zoom: 2,
  /** @type {number} Desplazamiento horizontal del canvas en píxeles de pantalla */
  panX: 0,
  /** @type {number} Desplazamiento vertical del canvas en píxeles de pantalla */
  panY: 0,

  // ── Herramientas y capas ─────────────────────────────────────────────────────

  /** @type {string} Herramienta activa (clave de TOOLS) */
  activeTool: TOOLS.SELECT,

  /**
   * Estado de visibilidad de cada capa. true = visible en el canvas.
   * Copia del objeto DEFAULT_LAYERS al inicializar.
   * @type {Record<string, boolean>}
   */
  layers: { ...DEFAULT_LAYERS },

  // ── Walkmap ─────────────────────────────────────────────────────────────────

  /** @type {string|null} ID del shape de walkmap seleccionado actualmente */
  selectedShapeId: null,

  /**
   * Puntos del polígono en construcción (herramienta POLYGON).
   * null = no hay polígono en curso.
   * Al pulsar Enter o cerrar el polígono, se llama a commitPendingPolygon().
   * @type {Array<{x:number, y:number}>|null}
   */
  pendingPolygon: null,

  /**
   * Modo de dibujo para el próximo shape que se cree.
   * 'add' = añadir área transitable | 'sub' = restar área
   * @type {'add'|'sub'}
   */
  drawMode: 'add',

  // ── Instancias de objetos en la room ─────────────────────────────────────────
  addObjectInstance: (objectId, objectName, x, y) => set(state => {
    if (!state.activeRoom) return {}
    const inst = {
      id: `inst_${Date.now()}`,
      objectId, objectName,
      x, y, zOrder: 0,
      stateOverride: null,
      pickable: false,
      invGfxId: '',
      states: [],       // [{ id, gfxId }]
    }
    return {
      activeRoom: { ...state.activeRoom, objects: [...(state.activeRoom.objects || []), inst] },
      dirty: true,
      selectedInstanceId: inst.id,
    }
  }),

  updateObjectInstance: (instId, partial) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: {
        ...state.activeRoom,
        objects: state.activeRoom.objects.map(o => o.id === instId ? { ...o, ...partial } : o),
      },
      dirty: true,
    }
  }),

  deleteObjectInstance: (instId) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: { ...state.activeRoom, objects: state.activeRoom.objects.filter(o => o.id !== instId) },
      dirty: true,
      selectedInstanceId: state.selectedInstanceId === instId ? null : state.selectedInstanceId,
    }
  }),

  selectedInstanceId:  null,
  selectedCharInstId:  null,
  selectInstance:    (id) => set({ selectedInstanceId: id, selectedShapeId: null, selectedCharInstId: null }),
  selectCharInst:    (id) => set({ selectedCharInstId: id, selectedInstanceId: null, selectedShapeId: null }),

  // ── Acciones: personajes en room ──────────────────────────────────────────
  addCharInstance: (charId, charName, x, y) => set(state => {
    if (!state.activeRoom) return {}
    const inst = { id: `cinst_${Date.now()}`, charId, charName, x, y, facingDir: 'front', currentAnimation: null, patrolOverride: [] }
    return {
      activeRoom: { ...state.activeRoom, characters: [...(state.activeRoom.characters || []), inst] },
      dirty: true,
      selectedCharInstId: inst.id,
    }
  }),

  updateCharInstance: (instId, partial) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: {
        ...state.activeRoom,
        characters: (state.activeRoom.characters || []).map(c => c.id === instId ? { ...c, ...partial } : c),
      },
      dirty: true,
    }
  }),

  deleteCharInstance: (instId) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: { ...state.activeRoom, characters: (state.activeRoom.characters || []).filter(c => c.id !== instId) },
      dirty: true,
      selectedCharInstId: state.selectedCharInstId === instId ? null : state.selectedCharInstId,
    }
  }),


  // ── Acciones: exits ───────────────────────────────────────────────────────
  // ── Acciones: luces de room ───────────────────────────────────────────────
  selectedLightId: null,
  selectLight: (id) => set({ selectedLightId: id, selectedInstanceId: null, selectedCharInstId: null, selectedShapeId: null, selectedExitId: null, selectedEntryId: null }),

  addLight: () => set(state => {
    if (!state.activeRoom) return {}
    const room = state.activeRoom
    const id   = `light_${Date.now()}`
    const light = {
      id,
      x: Math.round((room.backgroundSize?.w || 320) / 2),
      y: Math.round((room.backgroundSize?.h || 140) / 2),
      radius: 80,
      coneAngle: 360,
      dirX: 1, dirY: 0,
      intensity: 80,
      flicker: { amplitude: 0, speed: 2.0, noise: 0.3 },
    }
    return {
      activeRoom: { ...room, lights: [...(room.lights || []), light] },
      dirty: true,
      selectedLightId: id,
    }
  }),

  updateLight: (lightId, partial) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: {
        ...state.activeRoom,
        lights: (state.activeRoom.lights || []).map(l => l.id === lightId ? { ...l, ...partial } : l),
      },
      dirty: true,
    }
  }),

  updateLightFlicker: (lightId, partial) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: {
        ...state.activeRoom,
        lights: (state.activeRoom.lights || []).map(l =>
          l.id === lightId ? { ...l, flicker: { ...l.flicker, ...partial } } : l
        ),
      },
      dirty: true,
    }
  }),

  deleteLight: (lightId) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: { ...state.activeRoom, lights: (state.activeRoom.lights || []).filter(l => l.id !== lightId) },
      dirty: true,
      selectedLightId: state.selectedLightId === lightId ? null : state.selectedLightId,
    }
  }),

  selectedExitId: null,
  selectExit: (id) => set({ selectedExitId: id, selectedInstanceId: null, selectedCharInstId: null, selectedShapeId: null }),

  addExit: () => set(state => {
    if (!state.activeRoom) return {}
    const id   = `exit_${Date.now()}`
    const room = state.activeRoom
    const w    = room.backgroundSize?.w || 320
    const h    = room.backgroundSize?.h || 140
    const exit = {
      id, name: 'nueva_salida',
      triggerZone: { x: Math.round(w * 0.4), y: Math.round(h * 0.8), w: 40, h: 20 },
      targetRoom: null, targetEntry: null,
      condition: null, transitionAnimation: null,
    }
    return {
      activeRoom: { ...room, exits: [...(room.exits || []), exit] },
      dirty: true, selectedExitId: id,
    }
  }),

  updateExit: (exitId, partial) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: {
        ...state.activeRoom,
        exits: (state.activeRoom.exits || []).map(e => e.id === exitId ? { ...e, ...partial } : e),
      },
      dirty: true,
    }
  }),

  deleteExit: (exitId) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: { ...state.activeRoom, exits: (state.activeRoom.exits || []).filter(e => e.id !== exitId) },
      dirty: true,
      selectedExitId: state.selectedExitId === exitId ? null : state.selectedExitId,
    }
  }),

  // ── Acciones: entry points ────────────────────────────────────────────────
  selectedEntryId: null,
  selectEntry: (id) => set({ selectedEntryId: id, selectedExitId: null, selectedInstanceId: null, selectedCharInstId: null, selectedShapeId: null }),

  addEntry: () => set(state => {
    if (!state.activeRoom) return {}
    const id    = `entry_${Date.now()}`
    const room  = state.activeRoom
    const entry = { id, name: 'nueva_entrada', x: Math.round((room.backgroundSize?.w || 320) / 2), y: Math.round((room.backgroundSize?.h || 140) * 0.7) }
    return {
      activeRoom: { ...room, entries: [...(room.entries || []), entry] },
      dirty: true, selectedEntryId: id,
    }
  }),

  updateEntry: (entryId, partial) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: {
        ...state.activeRoom,
        entries: (state.activeRoom.entries || []).map(e => e.id === entryId ? { ...e, ...partial } : e),
      },
      dirty: true,
    }
  }),

  deleteEntry: (entryId) => set(state => {
    if (!state.activeRoom) return {}
    return {
      activeRoom: { ...state.activeRoom, entries: (state.activeRoom.entries || []).filter(e => e.id !== entryId) },
      dirty: true,
      selectedEntryId: state.selectedEntryId === entryId ? null : state.selectedEntryId,
    }
  }),

  // ── Acciones: room ────────────────────────────────────────────────────────
  openRoom: (room) => set({
    activeRoom: {
      ambientLight: 100,
      lights: [],
      ...room,
    },
    backgroundUrl: null,
    dirty: false,
    zoom: 2, panX: 0, panY: 0,
    activeTool: TOOLS.SELECT,
    selectedShapeId: null,
    selectedInstanceId: null,
    selectedCharInstId: null,
    selectedExitId: null,
    selectedEntryId: null,
    selectedLightId: null,
    pendingPolygon: null,
  }),

  closeRoom: () => set({
    activeRoom: null,
    backgroundUrl: null,
    dirty: false,
    selectedShapeId: null,
    pendingPolygon: null,
  }),

  setBackgroundUrl: (url) => set({ backgroundUrl: url }),

  updateRoom: (partial) => set(state => ({
    activeRoom: state.activeRoom ? { ...state.activeRoom, ...partial } : null,
    dirty: true,
  })),

  markClean: () => set({ dirty: false }),

  // ── Acciones: vista ───────────────────────────────────────────────────────
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(8, zoom)) }),
  setPan:  (panX, panY) => set({ panX, panY }),

  // ── Acciones: herramientas ────────────────────────────────────────────────
  setTool:  (tool)  => set({ activeTool: tool, pendingPolygon: null }),
  setDrawMode: (mode) => set({ drawMode: mode }),
  toggleLayer: (layer) => set(state => ({
    layers: { ...state.layers, [layer]: !state.layers[layer] }
  })),

  // ── Acciones: walkmap ─────────────────────────────────────────────────────
  setActiveWalkmap: (id) => set(state => ({
    activeRoom: state.activeRoom ? { ...state.activeRoom, activeWalkmapId: id } : null,
    dirty: true,
    selectedShapeId: null,
  })),

  addWalkmap: () => set(state => {
    if (!state.activeRoom) return {}
    const id = `wm_${Date.now()}`
    const wm = { id, name: `walkmap_${state.activeRoom.walkmaps.length + 1}`, shapes: [] }
    return {
      activeRoom: {
        ...state.activeRoom,
        walkmaps: [...state.activeRoom.walkmaps, wm],
        activeWalkmapId: id,
      },
      dirty: true,
    }
  }),

  deleteWalkmap: (id) => set(state => {
    if (!state.activeRoom || state.activeRoom.walkmaps.length <= 1) return {}
    const walkmaps = state.activeRoom.walkmaps.filter(w => w.id !== id)
    const activeWalkmapId = state.activeRoom.activeWalkmapId === id
      ? walkmaps[0]?.id || null
      : state.activeRoom.activeWalkmapId
    return {
      activeRoom: { ...state.activeRoom, walkmaps, activeWalkmapId },
      dirty: true,
    }
  }),

  addShape: (shape) => set(state => {
    if (!state.activeRoom) return {}
    const walkmaps = state.activeRoom.walkmaps.map(wm =>
      wm.id === state.activeRoom.activeWalkmapId
        ? { ...wm, shapes: [...wm.shapes, shape] }
        : wm
    )
    return {
      activeRoom: { ...state.activeRoom, walkmaps },
      dirty: true,
      selectedShapeId: shape.id,
      pendingPolygon: null,
    }
  }),

  deleteShape: (shapeId) => set(state => {
    if (!state.activeRoom) return {}
    const walkmaps = state.activeRoom.walkmaps.map(wm => ({
      ...wm,
      shapes: wm.shapes.filter(s => s.id !== shapeId)
    }))
    return {
      activeRoom: { ...state.activeRoom, walkmaps },
      dirty: true,
      selectedShapeId: null,
    }
  }),

  selectShape: (id) => set({ selectedShapeId: id }),

  setPendingPolygon: (points) => set({ pendingPolygon: points }),

  commitPendingPolygon: (mode) => {
    const { pendingPolygon, activeRoom } = get()
    const { drawMode } = get()
    const resolvedMode = mode || drawMode
    if (!pendingPolygon || pendingPolygon.length < 3) {
      set({ pendingPolygon: null })
      return
    }
    const shape = {
      id: `shape_${Date.now()}`,
      type: 'polygon',
      mode: resolvedMode,
      points: [...pendingPolygon],
    }
    get().addShape(shape)
  },
}))
