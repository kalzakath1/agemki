import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Diálogos
  chooseFolder:   () => ipcRenderer.invoke('dialog:choose-folder'),
  openGameDialog: () => ipcRenderer.invoke('dialog:open-game'),
  openFileDialog: (title, filters) => ipcRenderer.invoke('dialog:open-file', { title, filters }),

  // Juego
  createGame:  (folderPath, name) => ipcRenderer.invoke('game:create',  { folderPath, name }),
  readGame:    (gameDir)          => ipcRenderer.invoke('game:read',    { gameDir }),
  saveGame:    (gameDir, game)    => ipcRenderer.invoke('game:save',    { gameDir, game }),
  renameGame:  (gameDir, name)    => ipcRenderer.invoke('game:rename',  { gameDir, name }),
  deleteGame:  (gameDir)          => ipcRenderer.invoke('game:delete',  { gameDir }),
  verifyGame:  (gameDir)          => ipcRenderer.invoke('game:verify',  { gameDir }),



  // Objects
  listObjects:     (gameDir)          => ipcRenderer.invoke('object:list',      { gameDir }),
  createObject:    (gameDir, name, type) => ipcRenderer.invoke('object:create', { gameDir, name, type }),
  saveObject:      (gameDir, object)  => ipcRenderer.invoke('object:save',      { gameDir, object }),
  deleteObject:    (gameDir, objectId)=> ipcRenderer.invoke('object:delete',    { gameDir, objectId }),
  duplicateObject: (gameDir, objectId)=> ipcRenderer.invoke('object:duplicate', { gameDir, objectId }),

  // Verbsets
  listVerbsets:     (gameDir)              => ipcRenderer.invoke('verbset:list',      { gameDir }),
  createVerbset:    (gameDir, name)        => ipcRenderer.invoke('verbset:create',    { gameDir, name }),
  saveVerbset:      (gameDir, verbset)     => ipcRenderer.invoke('verbset:save',      { gameDir, verbset }),
  deleteVerbset:    (gameDir, verbsetId)   => ipcRenderer.invoke('verbset:delete',    { gameDir, verbsetId }),
  duplicateVerbset: (gameDir, verbsetId)   => ipcRenderer.invoke('verbset:duplicate', { gameDir, verbsetId }),

  // Locales
  readLocale:    (gameDir, lang)       => ipcRenderer.invoke('locale:read',       { gameDir, lang }),
  saveLocale:    (gameDir, lang, data) => ipcRenderer.invoke('locale:save',       { gameDir, lang, data }),
  listLangs:     (gameDir)             => ipcRenderer.invoke('locale:list-langs', { gameDir }),
  addLanguage:   (gameDir, lang)       => ipcRenderer.invoke('lang:add',           { gameDir, lang }),
  deleteLanguage:(gameDir, lang)       => ipcRenderer.invoke('lang:delete',        { gameDir, lang }),
  renameAsset:   (oldPath, newName)    => ipcRenderer.invoke('asset:rename',        { oldPath, newName }),
  listAudioFiles:(gameDir, type)       => ipcRenderer.invoke('audio:list',          { gameDir, type }),
  importAudio:   (gameDir, type, srcPath, name) => ipcRenderer.invoke('audio:import', { gameDir, type, srcPath, name }),
  previewAudio:  (filePath)             => ipcRenderer.invoke('audio:preview',        { filePath }),
  stopPreview:   ()                     => ipcRenderer.invoke('audio:preview:stop',   {}),
  listChars:     (gameDir)             => ipcRenderer.invoke('char:list',      { gameDir }),
  createChar:    (gameDir, name, isProtagonist) => ipcRenderer.invoke('char:create', { gameDir, name, isProtagonist }),
  saveChar:      (gameDir, char)       => ipcRenderer.invoke('char:save',      { gameDir, char }),
  deleteChar:    (gameDir, charId)     => ipcRenderer.invoke('char:delete',    { gameDir, charId }),
  duplicateChar: (gameDir, charId)     => ipcRenderer.invoke('char:duplicate', { gameDir, charId }),

  // Rooms
  listRooms:     (gameDir)        => ipcRenderer.invoke('room:list',      { gameDir }),
  createRoom:    (gameDir, name)  => ipcRenderer.invoke('room:create',    { gameDir, name }),
  readRoom:      (gameDir, roomId)=> ipcRenderer.invoke('room:read',      { gameDir, roomId }),
  saveRoom:      (gameDir, room)  => ipcRenderer.invoke('room:save',      { gameDir, room }),
  deleteRoom:    (gameDir, roomId)=> ipcRenderer.invoke('room:delete',    { gameDir, roomId }),
  duplicateRoom: (gameDir, roomId)=> ipcRenderer.invoke('room:duplicate', { gameDir, roomId }),


  // Build Manager — todos los procesos corren en main (Node.js), no en el renderer
  // Editor settings (rutas Watcom, DOSBox-X)
  settingsLoad: () => ipcRenderer.invoke('settings:load'),
  settingsSave: (s) => ipcRenderer.invoke('settings:save', s),

  // Guía de usuario
  openHelp: () => ipcRenderer.invoke('help:open'),

  // Build Manager
  buildCheckTools: (gameDir)       => ipcRenderer.invoke('build:check-tools', { gameDir }),
  buildRun:        (gameDir, mode) => ipcRenderer.invoke('build:run',         { gameDir, mode }),
  buildListFiles:  (gameDir)       => ipcRenderer.invoke('build:list-files',  { gameDir }),
  buildOpenDir:    (gameDir)       => ipcRenderer.invoke('build:open-dir',    { gameDir }),
  // Suscripción al streaming de log de compilación en tiempo real
  // Devuelve función de unsuscripción para limpiar en useEffect
  onBuildLog: (callback) => {
    const handler = (_event, data) => callback(data.text)
    ipcRenderer.on('build:log', handler)
    return () => ipcRenderer.removeListener('build:log', handler)
  },
  // Sequences
  listSequences:     (gameDir)            => ipcRenderer.invoke('sequence:list',      { gameDir }),
  createSequence:    (gameDir, name)      => ipcRenderer.invoke('sequence:create',    { gameDir, name }),
  readSequence:      (gameDir, id)        => ipcRenderer.invoke('sequence:read',      { gameDir, id }),
  saveSequence:      (gameDir, sequence)  => ipcRenderer.invoke('sequence:save',      { gameDir, sequence }),
  deleteSequence:    (gameDir, id)        => ipcRenderer.invoke('sequence:delete',    { gameDir, id }),
  duplicateSequence: (gameDir, id)        => ipcRenderer.invoke('sequence:duplicate', { gameDir, id }),

  // Scripts
  listScripts:     (gameDir)          => ipcRenderer.invoke('script:list',      { gameDir }),
  createScript:    (gameDir, name)    => ipcRenderer.invoke('script:create',    { gameDir, name }),
  readScript:      (gameDir, id)      => ipcRenderer.invoke('script:read',      { gameDir, id }),
  saveScript:      (gameDir, script)  => ipcRenderer.invoke('script:save',      { gameDir, script }),
  deleteScript:    (gameDir, id)      => ipcRenderer.invoke('script:delete',    { gameDir, id }),
  duplicateScript: (gameDir, id)      => ipcRenderer.invoke('script:duplicate', { gameDir, id }),

  // Dialogues
  listDialogues:     (gameDir)               => ipcRenderer.invoke('dialogue:list',      { gameDir }),
  createDialogue:    (gameDir, name)          => ipcRenderer.invoke('dialogue:create',    { gameDir, name }),
  readDialogue:      (gameDir, id)            => ipcRenderer.invoke('dialogue:read',      { gameDir, id }),
  saveDialogue:      (gameDir, dialogue)      => ipcRenderer.invoke('dialogue:save',      { gameDir, dialogue }),
  deleteDialogue:    (gameDir, id)            => ipcRenderer.invoke('dialogue:delete',    { gameDir, id }),
  duplicateDialogue: (gameDir, id)            => ipcRenderer.invoke('dialogue:duplicate', { gameDir, id }),

  // Assets
  writeBinary:    (filePath, buffer)    => ipcRenderer.invoke('fs:write-binary',     { filePath, buffer }),
  readBinary:     (filePath)            => ipcRenderer.invoke('fs:read-binary',      { filePath }),
  listAssets:     (gameDir, type)       => ipcRenderer.invoke('fs:list-assets',      { gameDir, type }),
  deleteAsset:    (filePath)            => ipcRenderer.invoke('fs:delete-asset',     { filePath }),
  findAssetUses:  (gameDir, fileName)   => ipcRenderer.invoke('fs:find-asset-uses',  { gameDir, fileName }),
  removeSeqSteps: (gameDir, removals)   => ipcRenderer.invoke('fs:remove-seq-steps', { gameDir, removals }),
  resolvePcxName: (gameDir, type, name) => ipcRenderer.invoke('fs:resolve-pcx-name', { gameDir, type, name }),
  syncAssets:     (gameDir)             => ipcRenderer.invoke('assets:sync',         { gameDir }),
  readAssets:     (gameDir)             => ipcRenderer.invoke('assets:read',         { gameDir }),

  // Fuentes del juego
  listFonts:      (gameDir)             => ipcRenderer.invoke('font:list',           { gameDir }),
  importFontSlot: (gameDir, slot)       => ipcRenderer.invoke('font:import-slot',    { gameDir, slot }),

  // Herramientas integradas
  readToolHtml: (filename) => ipcRenderer.invoke('tools:read-html', { filename }),
})
