import { create } from 'zustand'

export const OBJECT_TYPES = [
  { id: 'scenery',          label: 'Decorado',   icon: '🌿', desc: 'Solo decorativo, sin interacción' },
  { id: 'pickable',         label: 'Cogible',    icon: '🖐', desc: 'Se puede coger al inventario' },
  { id: 'obstacle',         label: 'Obstáculo',  icon: '🧱', desc: 'Tapa personajes según z-order' },
  { id: 'animated_scenery', label: 'Animado',    icon: '✨', desc: 'Decorado con animación de frames' },
]

export const useObjectStore = create((set, get) => ({
  objects:       [],      // biblioteca global cargada
  activeObject:  null,    // objeto siendo editado
  dirty:         false,

  // ── Cargar biblioteca ──────────────────────────────────────────────────
  loadObjects: async (gameDir) => {
    const result = await window.api.listObjects(gameDir)
    console.log('[objectStore] loadObjects', gameDir, '->', result)
    if (result.ok) set({ objects: result.objects })
    return result
  },

  // ── CRUD ───────────────────────────────────────────────────────────────
  createObject: async (gameDir, name, type) => {
    const result = await window.api.createObject(gameDir, name, type)
    if (result.ok) {
      set(state => ({ objects: [...state.objects, result.object] }))
      return result.object
    }
    return null
  },

  saveActiveObject: async (gameDir) => {
    const { activeObject } = get()
    if (!activeObject) return
    console.log('[objectStore] saveActiveObject gameDir=', gameDir, 'id=', activeObject.id)
    const result = await window.api.saveObject(gameDir, activeObject)
    console.log('[objectStore] saveActiveObject result=', result)
    if (result.ok) {
      set(state => ({
        objects: state.objects.map(o => o.id === result.object.id ? result.object : o),
        activeObject: result.object,
        dirty: false,
      }))
    } else {
      alert('Error al guardar objeto: ' + result.error)
    }
  },

  deleteObject: async (gameDir, objectId) => {
    await window.api.deleteObject(gameDir, objectId)
    set(state => ({
      objects: state.objects.filter(o => o.id !== objectId),
      activeObject: state.activeObject?.id === objectId ? null : state.activeObject,
    }))
  },

  duplicateObject: async (gameDir, objectId) => {
    const result = await window.api.duplicateObject(gameDir, objectId)
    if (result.ok) set(state => ({ objects: [...state.objects, result.object] }))
  },

  // ── Editor ─────────────────────────────────────────────────────────────
  openObject: (obj) => set({ activeObject: JSON.parse(JSON.stringify(obj)), dirty: false }),
  closeObject: ()  => set({ activeObject: null, dirty: false }),

  updateObject: (partial) => set(state => ({
    activeObject: state.activeObject ? { ...state.activeObject, ...partial } : null,
    dirty: true,
  })),

  // ── Estados ────────────────────────────────────────────────────────────
  addState: () => set(state => {
    if (!state.activeObject) return {}
    const id = `state_${Date.now()}`
    const newState = { id, name: `estado_${state.activeObject.states.length + 1}`, spriteFile: null, inventorySprite: null, animated: false, frameCount: 1, fps: 8, frameWidth: 0 }
    return {
      activeObject: { ...state.activeObject, states: [...state.activeObject.states, newState] },
      dirty: true,
    }
  }),

  updateState: (stateId, partial) => set(state => {
    if (!state.activeObject) return {}
    return {
      activeObject: {
        ...state.activeObject,
        states: state.activeObject.states.map(s => s.id === stateId ? { ...s, ...partial } : s),
      },
      dirty: true,
    }
  }),

  deleteState: (stateId) => set(state => {
    if (!state.activeObject || state.activeObject.states.length <= 1) return {}
    const states = state.activeObject.states.filter(s => s.id !== stateId)
    const activeStateId = state.activeObject.activeStateId === stateId
      ? states[0]?.id : state.activeObject.activeStateId
    return { activeObject: { ...state.activeObject, states, activeStateId }, dirty: true }
  }),

  // ── VerbActions ────────────────────────────────────────────────────────
  addVerbAction: (verb) => set(state => {
    if (!state.activeObject) return {}
    const va = { id: `va_${Date.now()}`, verb, condition: '', script: '' }
    return {
      activeObject: { ...state.activeObject, verbActions: [...state.activeObject.verbActions, va] },
      dirty: true,
    }
  }),

  updateVerbAction: (vaId, partial) => set(state => {
    if (!state.activeObject) return {}
    return {
      activeObject: {
        ...state.activeObject,
        verbActions: state.activeObject.verbActions.map(v => v.id === vaId ? { ...v, ...partial } : v),
      },
      dirty: true,
    }
  }),

  deleteVerbAction: (vaId) => set(state => {
    if (!state.activeObject) return {}
    return {
      activeObject: { ...state.activeObject, verbActions: state.activeObject.verbActions.filter(v => v.id !== vaId) },
      dirty: true,
    }
  }),

  // ── Combinations ───────────────────────────────────────────────────────
  setVerbResponse: (verbId, partial) => set(state => {
    if (!state.activeObject) return {}
    const existing = (state.activeObject.verbResponses || []).find(r => r.verbId === verbId)
    let verbResponses
    if (existing) {
      verbResponses = state.activeObject.verbResponses.map(r => r.verbId === verbId ? { ...r, ...partial } : r)
    } else {
      verbResponses = [...(state.activeObject.verbResponses || []), { verbId, mode: 'text', scriptId: '', ...partial }]
    }
    return { activeObject: { ...state.activeObject, verbResponses }, dirty: true }
  }),

  setInvVerbResponse: (verbId, partial) => set(state => {
    if (!state.activeObject) return {}
    const existing = (state.activeObject.invVerbResponses || []).find(r => r.verbId === verbId)
    let invVerbResponses
    if (existing) {
      invVerbResponses = state.activeObject.invVerbResponses.map(r => r.verbId === verbId ? { ...r, ...partial } : r)
    } else {
      invVerbResponses = [...(state.activeObject.invVerbResponses || []), { verbId, mode: 'text', scriptId: '', ...partial }]
    }
    return { activeObject: { ...state.activeObject, invVerbResponses }, dirty: true }
  }),

    addCombination: () => set(state => {
    if (!state.activeObject) return {}
    const c = { id: `comb_${Date.now()}`, withId: '', scriptId: '' }
    return {
      activeObject: { ...state.activeObject, combinations: [...state.activeObject.combinations, c] },
      dirty: true,
    }
  }),

  updateCombination: (cId, partial) => set(state => {
    if (!state.activeObject) return {}
    return {
      activeObject: {
        ...state.activeObject,
        combinations: state.activeObject.combinations.map(c => c.id === cId ? { ...c, ...partial } : c),
      },
      dirty: true,
    }
  }),

  deleteCombination: (cId) => set(state => {
    if (!state.activeObject) return {}
    return {
      activeObject: { ...state.activeObject, combinations: state.activeObject.combinations.filter(c => c.id !== cId) },
      dirty: true,
    }
  }),

  // ── Flags propios ──────────────────────────────────────────────────────
  addFlag: () => set(state => {
    if (!state.activeObject) return {}
    const f = { id: `flag_${Date.now()}`, name: 'nueva_flag', type: 'boolean', defaultValue: false }
    return {
      activeObject: { ...state.activeObject, flags: [...state.activeObject.flags, f] },
      dirty: true,
    }
  }),

  updateFlag: (fId, partial) => set(state => {
    if (!state.activeObject) return {}
    return {
      activeObject: {
        ...state.activeObject,
        flags: state.activeObject.flags.map(f => f.id === fId ? { ...f, ...partial } : f),
      },
      dirty: true,
    }
  }),

  deleteFlag: (fId) => set(state => {
    if (!state.activeObject) return {}
    return {
      activeObject: { ...state.activeObject, flags: state.activeObject.flags.filter(f => f.id !== fId) },
      dirty: true,
    }
  }),
}))
