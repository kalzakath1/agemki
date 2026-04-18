import { create } from 'zustand'

export const DEFAULT_ATTRIBUTES = [
  { id: 'attr_fuerza',     nameKey: 'attr.fuerza.name',     isDeathAttr: false, defaultValue: 10 },
  { id: 'attr_resistencia',nameKey: 'attr.resistencia.name', isDeathAttr: false, defaultValue: 10 },
  { id: 'attr_agilidad',   nameKey: 'attr.agilidad.name',   isDeathAttr: false, defaultValue: 10 },
  { id: 'attr_percepcion', nameKey: 'attr.percepcion.name',  isDeathAttr: false, defaultValue: 10 },
  { id: 'attr_inteligencia',nameKey:'attr.inteligencia.name',isDeathAttr: false, defaultValue: 10 },
  { id: 'attr_carisma',    nameKey: 'attr.carisma.name',    isDeathAttr: false, defaultValue: 10 },
  { id: 'attr_vida',       nameKey: 'attr.vida.name',       isDeathAttr: true,  defaultValue: 100 },
  { id: 'attr_poder',      nameKey: 'attr.poder.name',      isDeathAttr: false, defaultValue: 100 },
  { id: 'attr_experiencia',nameKey: 'attr.experiencia.name', isDeathAttr: false, defaultValue: 0 },
  { id: 'attr_armadura',   nameKey: 'attr.armadura.name',   isDeathAttr: false, defaultValue: 0 },
  { id: 'attr_libre1',     nameKey: 'attr.libre1.name',     isDeathAttr: false, defaultValue: 0 },
  { id: 'attr_libre2',     nameKey: 'attr.libre2.name',     isDeathAttr: false, defaultValue: 0 },
]

export const DEFAULT_ATTR_NAMES = {
  es: {
    'attr.fuerza.name': 'Fuerza', 'attr.resistencia.name': 'Resistencia',
    'attr.agilidad.name': 'Agilidad', 'attr.percepcion.name': 'Percepción',
    'attr.inteligencia.name': 'Inteligencia', 'attr.carisma.name': 'Carisma',
    'attr.vida.name': 'Puntos de Vida', 'attr.poder.name': 'Puntos de Poder',
    'attr.experiencia.name': 'Experiencia', 'attr.armadura.name': 'Armadura',
    'attr.libre1.name': 'Libre 1', 'attr.libre2.name': 'Libre 2',
  },
  en: {
    'attr.fuerza.name': 'Strength', 'attr.resistencia.name': 'Endurance',
    'attr.agilidad.name': 'Agility', 'attr.percepcion.name': 'Perception',
    'attr.inteligencia.name': 'Intelligence', 'attr.carisma.name': 'Charisma',
    'attr.vida.name': 'Hit Points', 'attr.poder.name': 'Power Points',
    'attr.experiencia.name': 'Experience', 'attr.armadura.name': 'Armor',
    'attr.libre1.name': 'Free 1', 'attr.libre2.name': 'Free 2',
  }
}

export const useAttributeStore = create((set, get) => ({
  enabled: false,
  attributes: DEFAULT_ATTRIBUTES,
  dirty: false,

  load: async (gameDir) => {
    const result = await window.api.loadGame(gameDir)
    if (!result.ok) return
    const game = result.game
    set({
      enabled: game.systems?.rpgAttributes || false,
      attributes: game.attributes?.length ? game.attributes : DEFAULT_ATTRIBUTES,
      dirty: false,
    })
  },

  setEnabled: (enabled) => set({ enabled, dirty: true }),

  updateAttr: (id, partial) => set(state => ({
    attributes: state.attributes.map(a => a.id === id ? { ...a, ...partial } : a),
    dirty: true,
  })),

  setDeathAttr: (id) => set(state => ({
    attributes: state.attributes.map(a => ({ ...a, isDeathAttr: a.id === id })),
    dirty: true,
  })),

  save: async (gameDir) => {
    const { enabled, attributes } = get()
    const result = await window.api.loadGame(gameDir)
    if (!result.ok) return
    const game = result.game
    game.systems = { ...(game.systems || {}), rpgAttributes: enabled }
    game.attributes = attributes
    await window.api.saveGame(gameDir, game)
    // Inyectar nombres por defecto en locales si no existen
    const { useLocaleStore } = await import('./localeStore')
    const ls = useLocaleStore.getState()
    for (const [lang, keys] of Object.entries(DEFAULT_ATTR_NAMES)) {
      for (const [k, v] of Object.entries(keys)) {
        if (!(ls.locales[lang] || {})[k]) ls.setKey(lang, k, v)
      }
    }
    await ls.saveAll(gameDir)
    set({ dirty: false })
  },
}))
