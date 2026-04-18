/**
 * @fileoverview localeStore — Sistema de localización del juego
 *
 * Gestiona todos los textos localizables del juego en todos los idiomas.
 * Los textos se guardan en locales/es.json, locales/en.json, etc.
 *
 * ARQUITECTURA DE CLAVES:
 *   Todas las claves siguen un prefijo según su categoría:
 *   - verb.ID.name           → nombre del verbo (ej: "Mirar")
 *   - obj.ID.name            → nombre del objeto (ej: "Espada")
 *   - obj.ID.desc            → descripción del objeto
 *   - room_ID.name           → nombre de la room
 *   - char.ID.name           → nombre del personaje
 *   - dialogue_ID.node_ID    → texto de un nodo de diálogo
 *   - msg.clave              → mensaje genérico del juego
 *
 * FLUJO DE EDICIÓN:
 *   loadAll(gameDir) → puebla locales{} y langs[]
 *   setKey(lang, key, value) → marca el lang como dirty
 *   saveAll(gameDir) → persiste solo los langs con dirty=true
 *
 * DIRTY STATE:
 *   dirty es un Set<string> de códigos de idioma con cambios sin guardar.
 *   Usar Set permite añadir y eliminar idiomas individualmente sin crear
 *   un nuevo objeto en cada edit (React identifica cambios por referencia,
 *   pero Zustand acepta el setState inmutable vía spread).
 *
 * COBERTURA:
 *   getCoverage() compara cada idioma con el base (es) y devuelve
 *   estadísticas de cuántas claves tienen traducción. Agrupa por tipo de clave.
 *   Se usa en el módulo Textos para el panel de cobertura.
 *
 * HUÉRFANAS:
 *   getOrphans(lang) devuelve claves que existen en un idioma pero no en es.
 *   Aparecen cuando se elimina un objeto/verbo pero no se limpia la localización.
 *
 * INTERACCIÓN CON OTROS STORES:
 *   charStore, objectStore, verbsetStore llaman a localeStore tras crear/eliminar
 *   entidades para mantener las claves sincronizadas. Usan importaciones
 *   dinámicas (import('./localeStore')) para evitar dependencias circulares.
 *
 * @module localeStore
 */
import { create } from 'zustand' 

export const useLocaleStore = create((set, get) => ({

  /** @type {string[]} Códigos de idioma del juego (ej: ['es', 'en']) */
  langs: ['es', 'en'],

  /** @type {string} Idioma activo en el editor (para mostrar textos y editar) */
  activeLang: 'es',

  /**
   * Todos los textos del juego en memoria.
   * @type {Record<string, Record<string, string>>} { lang: { key: value } }
   */
  locales: {},

  /**
   * Set de idiomas con cambios no guardados.
   * Usar Set (no array) para operaciones O(1) de add/delete/has.
   * @type {Set<string>}
   */
  dirty: new Set(),

  /** @type {boolean} true si locales ya fue cargado desde disco */
  loaded: false,

  // ── Carga ────────────────────────────────────────────────────────────────────

  /**
   * Carga todos los idiomas y sus locales desde disco.
   * Detecta automáticamente los idiomas existentes en el proyecto.
   * Si no hay ninguno configurado, usa ['es', 'en'] como fallback.
   * @param {string} gameDir
   */
  loadAll: async (gameDir) => {
    const langsResult = await window.api.listLangs(gameDir)
    const langs = langsResult.ok && langsResult.langs.length
      ? langsResult.langs
      : ['es', 'en']

    const locales = {}
    await Promise.all(langs.map(async lang => {
      const r = await window.api.readLocale(gameDir, lang)
      locales[lang] = r.ok ? r.data : {}
    }))

    set({ langs, locales, dirty: new Set(), loaded: true })
  },

  /**
   * Recarga los locales desde disco sin cambiar la lista de idiomas.
   * Se llama desde otros stores (charStore, objectStore...) tras crear/eliminar
   * entidades que añaden o quitan claves del fichero de localización.
   * @param {string} gameDir
   */
  reload: async (gameDir) => {
    const { langs } = get()
    const locales = {}
    await Promise.all(langs.map(async lang => {
      const r = await window.api.readLocale(gameDir, lang)
      locales[lang] = r.ok ? r.data : {}
    }))
    set({ locales, dirty: new Set() })
  },

  // ── Gestión de idiomas ────────────────────────────────────────────────────────

  /**
   * Añade un idioma nuevo al proyecto.
   * Crea un fichero JSON vacío en locales/ y actualiza game.json.
   * Si el idioma ya existe, devuelve error sin modificar nada.
   *
   * @param {string} gameDir
   * @param {string} lang - Código ISO 639-1 (ej: 'fr', 'de')
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  addLang: async (gameDir, lang) => {
    const { langs, locales } = get()
    const code = lang.toLowerCase().trim()
    if (!code || langs.includes(code)) return { ok: false, error: 'Ya existe' }

    const result = await window.api.saveLocale(gameDir, code, {})
    if (!result.ok) return result

    const gameResult = await window.api.addLanguage(gameDir, code)
    if (!gameResult.ok) return gameResult

    set({ langs: [...langs, code], locales: { ...locales, [code]: {} } })
    return { ok: true }
  },

  /**
   * Elimina un idioma del proyecto.
   * Pide confirmación al usuario si el idioma tiene traducciones.
   * El idioma base 'es' no se puede eliminar.
   *
   * @param {string} gameDir
   * @param {string} lang
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  deleteLang: async (gameDir, lang) => {
    const { langs, locales } = get()
    if (lang === 'es') return { ok: false, error: 'No se puede eliminar el idioma base (es)' }

    // Contar traducciones existentes para avisar al usuario
    const loc = locales[lang] || {}
    const keysWithText = Object.values(loc).filter(v => v && v.trim()).length

    if (keysWithText > 0) {
      const confirmed = confirm(
        `El idioma "${lang.toUpperCase()}" tiene ${keysWithText} texto${keysWithText !== 1 ? 's' : ''} traducido${keysWithText !== 1 ? 's' : ''}.\n\n¿Eliminar igualmente? Esta acción no se puede deshacer.`
      )
      if (!confirmed) return { ok: false, error: 'Cancelado' }
    }

    await window.api.deleteLanguage(gameDir, lang)

    const newLocales = { ...locales }
    delete newLocales[lang]
    const newDirty = new Set(get().dirty)
    newDirty.delete(lang)

    set({
      langs:      langs.filter(l => l !== lang),
      locales:    newLocales,
      dirty:      newDirty,
      // Si el idioma eliminado era el activo, volver al base
      activeLang: get().activeLang === lang ? 'es' : get().activeLang,
    })
    return { ok: true }
  },

  /** @param {string} lang */
  setActiveLang: (lang) => set({ activeLang: lang }),

  // ── Edición de claves ─────────────────────────────────────────────────────────

  /**
   * Establece el valor de una clave en un idioma.
   * Marca el idioma como dirty para ser guardado en el próximo saveAll().
   *
   * @param {string} lang
   * @param {string} key  - Clave de localización (ej: 'obj.obj_001.name')
   * @param {string} value - Texto localizado
   */
  setKey: (lang, key, value) => set(state => {
    const newDirty = new Set(state.dirty)
    newDirty.add(lang)
    return {
      locales: {
        ...state.locales,
        [lang]: { ...(state.locales[lang] || {}), [key]: value },
      },
      dirty: newDirty,
    }
  }),

  /**
   * Establece múltiples claves en un idioma en una sola operación.
   * Más eficiente que llamar a setKey() múltiples veces (un solo setState).
   *
   * @param {string} lang
   * @param {Record<string, string>} entries - { key: value, ... }
   */
  setKeys: (lang, entries) => set(state => {
    const newDirty = new Set(state.dirty)
    newDirty.add(lang)
    return {
      locales: {
        ...state.locales,
        [lang]: { ...(state.locales[lang] || {}), ...entries },
      },
      dirty: newDirty,
    }
  }),

  /**
   * Devuelve el valor de una clave en un idioma.
   * Devuelve '' si la clave no existe.
   *
   * @param {string} lang
   * @param {string} key
   * @returns {string}
   */
  getKey: (lang, key) => {
    const loc = get().locales[lang] || {}
    return loc[key] || ''
  },

  // ── Persistencia ──────────────────────────────────────────────────────────────

  /**
   * Guarda todos los idiomas con cambios pendientes (dirty).
   * Solo escribe los ficheros que realmente han cambiado.
   * Si todo va bien, limpia el dirty set.
   *
   * @param {string} gameDir
   * @returns {Promise<{ok:boolean}>}
   */
  saveAll: async (gameDir) => {
    const { locales, dirty } = get()
    const results = await Promise.all(
      [...dirty].map(lang => window.api.saveLocale(gameDir, lang, locales[lang] || {}))
    )
    const allOk = results.every(r => r.ok)
    if (allOk) set({ dirty: new Set() })
    return { ok: allOk }
  },

  /**
   * Guarda un único idioma. Útil cuando el usuario guarda manualmente desde el módulo Textos.
   * @param {string} gameDir
   * @param {string} lang
   */
  saveLang: async (gameDir, lang) => {
    const { locales } = get()
    const result = await window.api.saveLocale(gameDir, lang, locales[lang] || {})
    if (result.ok) {
      const newDirty = new Set(get().dirty)
      newDirty.delete(lang)
      set({ dirty: newDirty })
    }
    return result
  },

  // ── Análisis de cobertura ─────────────────────────────────────────────────────

  /**
   * Calcula el porcentaje de cobertura de traducción para cada idioma.
   * El idioma base es siempre 'es': sus claves son el 100% a cubrir.
   *
   * Agrupa las claves por tipo de entidad para identificar qué áreas
   * necesitan más trabajo de traducción.
   *
   * @returns {Array<{
   *   lang: string,
   *   total: number,
   *   covered: number,
   *   totalMissing: number,
   *   pct: number,
   *   missing: Record<string, {label:string, icon:string, keys:string[], count:number}>
   * }>}
   */
  getCoverage: () => {
    const { langs, locales } = get()
    const base    = locales['es'] || {}
    const allKeys = Object.keys(base)

    // Clasificar claves por prefijo
    const groups = {
      verbs:     { label: 'Verbos',    icon: '🖱',  keys: [] },
      objects:   { label: 'Objetos',   icon: '📦', keys: [] },
      rooms:     { label: 'Rooms',     icon: '🏠', keys: [] },
      dialogues: { label: 'Diálogos',  icon: '💬', keys: [] },
      other:     { label: 'Otros',     icon: '📄', keys: [] },
    }

    allKeys.forEach(key => {
      if      (key.startsWith('verb.'))     groups.verbs.keys.push(key)
      else if (key.startsWith('obj.'))      groups.objects.keys.push(key)
      else if (key.startsWith('room_'))     groups.rooms.keys.push(key)
      else if (key.startsWith('dialogue_')) groups.dialogues.keys.push(key)
      else                                  groups.other.keys.push(key)
    })

    return langs.map(lang => {
      const loc = locales[lang] || {}
      const missing = {}
      let totalMissing = 0

      Object.entries(groups).forEach(([groupId, group]) => {
        const missingKeys = group.keys.filter(k => !loc[k] || !loc[k].trim())
        if (missingKeys.length > 0) {
          missing[groupId] = { ...group, missingKeys, count: missingKeys.length }
          totalMissing += missingKeys.length
        }
      })

      const total   = allKeys.length
      const covered = total - totalMissing
      const pct     = total === 0 ? 100 : Math.round((covered / total) * 100)

      return { lang, total, covered, totalMissing, pct, missing }
    })
  },

  /**
   * Devuelve las claves del idioma que no existen en el idioma base (es).
   * Estas claves son "huérfanas": su entidad (objeto, verbo, room...) fue eliminada
   * pero la clave de localización no se limpió.
   *
   * @param {string} lang
   * @returns {string[]}
   */
  getOrphans: (lang) => {
    const { locales } = get()
    const base = locales['es'] || {}
    const loc  = locales[lang] || {}
    return Object.keys(loc).filter(k => !(k in base))
  },
}))
