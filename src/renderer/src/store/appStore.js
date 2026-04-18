/**
 * @fileoverview appStore — Estado global de la aplicación
 *
 * Este store gestiona el juego activo, el módulo activo en la UI y
 * la lista de juegos recientes. Es el "router" central del editor:
 * cuando activeGame es null, se muestra el GameManager (pantalla de inicio);
 * cuando tiene valor, se muestra el EditorLayout con sus módulos.
 *
 * Patrón de uso:
 *   const { activeGame, openGame } = useAppStore()
 *   const { setActiveModule }      = useAppStore()
 *
 * @module appStore
 */
import { create } from 'zustand'

/** Clave de localStorage donde se persisten los juegos recientes entre sesiones */
const RECENT_KEY = 'scumm-editor:recent-games'
/** Máximo de entradas en la lista de recientes */
const MAX_RECENT = 10

/**
 * Lee la lista de juegos recientes de localStorage.
 * @returns {Array<{gameDir:string, name:string, openedAt:number}>}
 */
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') }
  catch { return [] } // JSON corrompido — ignorar
}

/** @param {Array} list */
function saveRecent(list) { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) }

/**
 * @typedef {Object} ActiveGame
 * @property {string} gameDir - Ruta absoluta al directorio del juego
 * @property {Object} game    - Objeto game.json completo en memoria
 */

/** @typedef {'rooms'|'assets'|'objects'|'characters'|'verbsets'|'locales'|'audio'|'dialogues'|'scripts'|'sequences'|'build'} ModuleId */

export const useAppStore = create((set, get) => ({

  // ── Estado ──────────────────────────────────────────────────────────────────

  /** @type {ActiveGame|null} null = pantalla de inicio (GameManager) */
  activeGame: null,

  /** @type {ModuleId|null} null si no hay juego abierto */
  activeModule: null,

  /** @type {boolean} Panel partido activo */
  splitActive: false,

  /** @type {ModuleId} Módulo del panel secundario (derecha) */
  secondaryModule: 'scripts',

  /** @type {Array<{gameDir:string, name:string, openedAt:number}>} */
  recentGames: loadRecent(),

  /** @type {'dark'|'light'} */
  theme: 'dark',

  // ── Tema ────────────────────────────────────────────────────────────────────

  /**
   * Alterna tema oscuro/claro.
   * Aplica data-theme al <html> para que los CSS custom properties surtan efecto.
   */
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    set({ theme: next })
  },

  // ── Juego activo ────────────────────────────────────────────────────────────

  /**
   * Abre un juego y navega al editor.
   *
   * Garantiza que el juego tenga al menos un verbset: si no lo tiene
   * (juego recién creado), crea uno por defecto y lo persiste en game.json.
   * Este check es secundario y no bloquea la apertura si falla.
   *
   * @param {string} gameDir
   * @param {Object} game - Objeto game.json ya leído del disco
   */
  openGame: async (gameDir, game) => {
    get().addRecent(gameDir, game.name)
    set({ activeGame: { gameDir, game }, activeModule: 'rooms' })

    // Guardia: juego nuevo puede llegar sin verbsets — el motor necesita al menos uno
    try {
      const vsResult = await window.api.listVerbsets(gameDir)
      if (vsResult.ok && vsResult.verbsets.length === 0) {
        const created = await window.api.createVerbset(gameDir, 'default')
        if (created.ok) {
          // Actualizar game.json en disco Y en memoria para que todos los módulos
          // vean el activeVerbSet inmediatamente sin recargar
          const updatedGame = { ...game, activeVerbSet: created.verbset.id }
          await window.api.saveGame(gameDir, updatedGame)
          set({ activeGame: { gameDir, game: updatedGame } })
        }
      }
    } catch (e) { console.warn('[openGame] verbset check failed', e) }
  },

  /**
   * Cierra el juego y vuelve a la pantalla de inicio.
   * AVISO: no guarda cambios. El llamador (EditorLayout) debe confirmar antes
   * si algún store tiene dirty=true.
   */
  closeGame: () => set({ activeGame: null, activeModule: null }),

  /**
   * Actualiza el objeto game en memoria tras cambios en Settings.
   * No escribe en disco (eso lo hace el módulo correspondiente via IPC).
   * @param {Object} game
   */
  updateGame: (game) =>
    set(state => ({ activeGame: state.activeGame ? { ...state.activeGame, game } : null })),

  /**
   * Cambia el módulo activo.
   * La guardia de dirty-check se gestiona en EditorLayout.handleModuleSwitch
   * (no aquí) para evitar dependencias circulares entre stores.
   * @param {ModuleId} module
   */
  setActiveModule: (module) => set({ activeModule: module }),

  /** Activa/desactiva panel partido */
  toggleSplit: () => set(s => ({ splitActive: !s.splitActive })),

  /** Cambia el módulo del panel secundario */
  setSecondaryModule: (module) => set({ secondaryModule: module }),

  // ── Juegos recientes ────────────────────────────────────────────────────────

  /**
   * Añade o mueve al inicio un juego en recientes.
   * Limita la lista a MAX_RECENT entradas (FIFO).
   * @param {string} gameDir
   * @param {string} name
   */
  addRecent: (gameDir, name) => {
    const list = get().recentGames.filter(r => r.gameDir !== gameDir)
    const updated = [{ gameDir, name, openedAt: Date.now() }, ...list].slice(0, MAX_RECENT)
    saveRecent(updated)
    set({ recentGames: updated })
  },

  /**
   * Elimina un juego de recientes SIN borrar del disco.
   * Se usa cuando el usuario pulsa ✕ en la tarjeta de recientes.
   * @param {string} gameDir
   */
  removeRecent: (gameDir) => {
    const updated = get().recentGames.filter(r => r.gameDir !== gameDir)
    saveRecent(updated)
    set({ recentGames: updated })
  },

  /**
   * Actualiza el nombre de un reciente (ej: tras renombrar el juego).
   * @param {string} gameDir
   * @param {string} name
   */
  updateRecentName: (gameDir, name) => {
    const updated = get().recentGames.map(r => r.gameDir === gameDir ? { ...r, name } : r)
    saveRecent(updated)
    set({ recentGames: updated })
  },
}))
