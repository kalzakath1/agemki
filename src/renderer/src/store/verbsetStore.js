import { create } from 'zustand'

export const useVerbsetStore = create((set, get) => ({
  verbsets:      [],
  activeVerbset: null,
  dirty:         false,

  // ── Carga ─────────────────────────────────────────────────────────────────

  loadVerbsets: async (gameDir) => {
    const result = await window.api.listVerbsets(gameDir)
    set({ verbsets: result.ok ? result.verbsets : [] })
  },

  // ── CRUD verbsets ─────────────────────────────────────────────────────────

  createVerbset: async (gameDir, name) => {
    const result = await window.api.createVerbset(gameDir, name)
    if (!result.ok) return null
    // Reload localeStore after create (main process wrote new verb keys to locales)
    const { useLocaleStore } = await import('./localeStore')
    await useLocaleStore.getState().reload(gameDir)
    set(state => ({ verbsets: [...state.verbsets, result.verbset] }))
    return result.verbset
  },

  saveActiveVerbset: async (gameDir) => {
    const { activeVerbset } = get()
    if (!activeVerbset) return
    const vsResult = await window.api.saveVerbset(gameDir, activeVerbset)
    const { useLocaleStore } = await import('./localeStore')
    await useLocaleStore.getState().saveAll(gameDir)
    if (vsResult.ok) {
      set(state => ({
        verbsets: state.verbsets.map(v => v.id === vsResult.verbset.id ? vsResult.verbset : v),
        activeVerbset: vsResult.verbset,
        dirty: false,
      }))
    } else {
      alert('Error al guardar verbset: ' + vsResult.error)
    }
  },

  deleteVerbset: async (gameDir, verbsetId) => {
    // Eliminar claves de locale de este verbset
    const { activeVerbset: av, locales, langs } = get()
    const vsToDelete = get().verbsets.find(v => v.id === verbsetId)
    const newLocales = { ...locales }
    if (vsToDelete) {
      vsToDelete.verbs.forEach(verb => {
        langs.forEach(lang => {
          if (newLocales[lang]) delete newLocales[lang][`verb.${verb.id}`]
        })
      })
      await Promise.all(langs.map(lang => window.api.saveLocale(gameDir, lang, newLocales[lang] || {})))
    }
    await window.api.deleteVerbset(gameDir, verbsetId)
    set(state => ({
      verbsets: state.verbsets.filter(v => v.id !== verbsetId),
      activeVerbset: state.activeVerbset?.id === verbsetId ? null : state.activeVerbset,
      locales: newLocales,
      dirty: state.activeVerbset?.id === verbsetId ? false : state.dirty,
    }))
  },

  duplicateVerbset: async (gameDir, verbsetId) => {
    const result = await window.api.duplicateVerbset(gameDir, verbsetId)
    if (!result.ok) return
    // El duplicado tiene IDs nuevos de verbos — copiar locales con nuevas claves
    const src = get().verbsets.find(v => v.id === verbsetId)
    const { locales, langs } = get()
    const newLocales = { ...locales }
    if (src) {
      src.verbs.forEach((origVerb, i) => {
        const newVerb = result.verbset.verbs[i]
        if (!newVerb) return
        langs.forEach(lang => {
          if (!newLocales[lang]) newLocales[lang] = {}
          newLocales[lang][`verb.${newVerb.id}`] = newLocales[lang]?.[`verb.${origVerb.id}`] || ''
        })
      })
      await Promise.all(langs.map(lang => window.api.saveLocale(gameDir, lang, newLocales[lang])))
    }
    set(state => ({ verbsets: [...state.verbsets, result.verbset], locales: newLocales }))
  },

  openVerbset: (verbset) => set({ activeVerbset: { ...verbset }, dirty: false }),
  closeVerbset: ()       => set({ activeVerbset: null, dirty: false }),

  // ── Edición ───────────────────────────────────────────────────────────────

  updateVerbset: (patch) => set(state => ({
    activeVerbset: state.activeVerbset ? { ...state.activeVerbset, ...patch } : null,
    dirty: true,
  })),

  setVerbLabel: async (verbId, lang, label) => {
    // Escribir directamente en localeStore (fuente de verdad para locales)
    const { useLocaleStore } = await import('./localeStore')
    useLocaleStore.getState().setKey(lang, `verb.${verbId}`, label)
    set({ dirty: true })
  },

  getVerbLabel: (verbId, lang) => {
    // Leer del localeStore directamente
    const { useLocaleStore } = require('./localeStore')
    const loc = useLocaleStore.getState().locales[lang] || {}
    return loc[`verb.${verbId}`] || ''
  },

  addVerb: () => { /* eliminado — no se puede añadir verbos */ },

  updateVerb: (verbId, patch) => set(state => {
    if (!state.activeVerbset) return {}
    let verbs = state.activeVerbset.verbs.map(v => v.id === verbId ? { ...v, ...patch } : v)
    if (patch.isMovement === true) verbs = verbs.map(v => v.id !== verbId ? { ...v, isMovement: false } : v)
    if (patch.isDefault  === true) verbs = verbs.map(v => v.id !== verbId ? { ...v, isDefault:  false } : v)
    return { activeVerbset: { ...state.activeVerbset, verbs }, dirty: true }
  }),

  deleteVerb: async (verbId) => {
    // Eliminar clave del localeStore
    const { useLocaleStore } = await import('./localeStore')
    const { langs, locales } = useLocaleStore.getState()
    langs.forEach(lang => {
      const loc = locales[lang]
      if (loc && loc[`verb.${verbId}`] !== undefined) {
        useLocaleStore.getState().setKey(lang, `verb.${verbId}`, undefined)
      }
    })
    set(state => {
      if (!state.activeVerbset) return {}
      const verbs = state.activeVerbset.verbs.filter(v => v.id !== verbId).map((v,i) => ({ ...v, order: i }))
      return { activeVerbset: { ...state.activeVerbset, verbs }, dirty: true }
    })
  },

  moveVerb: (verbId, direction) => set(state => {
    if (!state.activeVerbset) return {}
    const verbs = [...state.activeVerbset.verbs]
    const idx = verbs.findIndex(v => v.id === verbId)
    const target = idx + direction
    if (target < 0 || target >= verbs.length) return {}
    ;[verbs[idx], verbs[target]] = [verbs[target], verbs[idx]]
    verbs.forEach((v, i) => { v.order = i })
    return { activeVerbset: { ...state.activeVerbset, verbs }, dirty: true }
  }),

  // Helper: verbos del verbset activo del juego con labels resueltos
  // Devuelve [{id, icon, label}] ordenados, excluyendo isMovement
  // NOTA: lang y locales vienen de localeStore — se pasan como argumento para evitar import circular
  getGameVerbs: (game, lang, locales) => {
    const { verbsets } = get()
    const vs = verbsets.find(v => v.id === game?.activeVerbSet)
    if (!vs || !locales) return []
    const loc = locales[lang] || locales['es'] || {}
    return [...vs.verbs]
      .sort((a, b) => a.order - b.order)
      .filter(v => !v.isMovement)
      .map(v => ({ id: v.id, icon: v.icon, label: loc['verb.' + v.id] || v.id }))
  },
}))
