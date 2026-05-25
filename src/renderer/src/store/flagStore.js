import { create } from 'zustand'

export const useFlagStore = create((set, get) => ({
  flags: [],
  dirty: false,

  load: async (gameDir) => {
    const result = await window.api.readFlags(gameDir)
    set({
      flags: result.ok ? result.flags : [],
      dirty: false,
    })
  },

  addFlag: (name, description) => {
    const id = `flag_${Date.now()}`
    set(state => ({
      flags: [...state.flags, { id, name: String(name || '').trim(), description: String(description || '').trim() }],
      dirty: true,
    }))
    return id
  },

  updateFlag: (id, partial) => set(state => ({
    flags: state.flags.map(f => f.id === id ? { ...f, ...partial } : f),
    dirty: true,
  })),

  removeFlag: (id) => set(state => ({
    flags: state.flags.filter(f => f.id !== id),
    dirty: true,
  })),

  save: async (gameDir) => {
    await window.api.saveFlags(gameDir, get().flags)
    set({ dirty: false })
  },
}))
