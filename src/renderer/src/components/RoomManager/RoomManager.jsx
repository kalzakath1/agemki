import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { useSceneStore } from '../../store/sceneStore'
import { pcxFileToDataURL } from '../../utils/pcxConverter'
import './RoomManager.css'

// ── Menú contextual ───────────────────────────────────────────────────────────

function ContextMenu({ x, y, room, onClose, onRename, onDuplicate, onDelete, onOpen }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }}>
      <button onClick={() => { onOpen(); onClose() }}>Abrir</button>
      <button onClick={() => { onRename(); onClose() }}>Renombrar</button>
      <button onClick={() => { onDuplicate(); onClose() }}>Duplicar</button>
      <div className="ctx-menu__sep" />
      <button className="ctx-menu__danger" onClick={() => { onDelete(); onClose() }}>Eliminar</button>
    </div>
  )
}

// ── Tarjeta de room ───────────────────────────────────────────────────────────

function RoomCard({ room, gameDir, palette, onOpen, onRefresh }) {
  const [thumbUrl, setThumbUrl]     = useState(null)
  const [renaming, setRenaming]     = useState(false)
  const [nameVal, setNameVal]       = useState(room.name)
  const [ctxMenu, setCtxMenu]       = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { loadThumb() }, [room.backgroundFilePath])
  useEffect(() => { if (renaming) inputRef.current?.select() }, [renaming])

  async function loadThumb() {
    if (!room.backgroundFilePath) { setThumbUrl(null); return }
    const filePath = `${gameDir}/assets/converted/backgrounds/${room.backgroundFilePath}`
    const result = await window.api.readBinary(filePath)
    if (!result.ok) return
    const url = pcxFileToDataURL(new Uint8Array(result.buffer), palette)
    setThumbUrl(url)
  }

  async function handleRenameConfirm() {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== room.name) {
      await window.api.saveRoom(gameDir, { ...room, name: trimmed })
      onRefresh()
    }
    setRenaming(false)
  }

  async function handleDuplicate() {
    await window.api.duplicateRoom(gameDir, room.id)
    onRefresh()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la room "${room.name}"?`)) return
    await window.api.deleteRoom(gameDir, room.id)
    onRefresh()
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <div
        className="room-card"
        onDoubleClick={() => onOpen(room)}
        onContextMenu={handleContextMenu}
      >
        {/* Thumbnail */}
        <div className="room-card__thumb">
          {thumbUrl
            ? <img src={thumbUrl} alt={room.name} style={{ imageRendering: 'pixelated' }} />
            : <span className="room-card__no-bg">Sin fondo</span>
          }
          {room.scroll?.enabled && (
            <span className="room-card__badge">
              {room.scroll.directionH && room.scroll.directionV ? '↔↕' :
               room.scroll.directionH ? '↔' : '↕'}
            </span>
          )}
        </div>

        {/* Nombre */}
        {renaming ? (
          <input
            ref={inputRef}
            className="room-card__rename"
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={handleRenameConfirm}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameConfirm()
              if (e.key === 'Escape') { setNameVal(room.name); setRenaming(false) }
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div className="room-card__name" title={room.name}>{room.name}</div>
        )}

        {/* Info */}
        <div className="room-card__meta">
          {room.backgroundSize.w}×{room.backgroundSize.h}px
          {room.backgroundFilePath && <span> · {room.backgroundFilePath}</span>}
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          room={room}
          onClose={() => setCtxMenu(null)}
          onOpen={() => onOpen(room)}
          onRename={() => setRenaming(true)}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}


// ── Vista mapa de conexiones ──────────────────────────────────────────────────

function RoomMapView({ rooms, gameDir, onOpenRoom }) {
  const canvasRef   = useRef(null)
  const [roomData, setRoomData]   = useState({})     // roomId → full room JSON
  const [positions, setPositions] = useState({})     // roomId → {x, y}
  const [dragging, setDragging]   = useState(null)   // { roomId, offX, offY }
  const [hover, setHover]         = useState(null)   // roomId

  // Load full JSON for all rooms to get exits
  useEffect(() => {
    if (!gameDir || rooms.length === 0) return
    Promise.all(rooms.map(r => window.api.readRoom(gameDir, r.id)))
      .then(results => {
        const data = {}
        results.forEach((res, i) => { if (res.ok) data[rooms[i].id] = res.room })
        setRoomData(data)
      })
  }, [rooms, gameDir])

  // Auto-layout: arrange in a loose grid if no saved positions
  useEffect(() => {
    if (rooms.length === 0) return
    setPositions(prev => {
      const next = { ...prev }
      const COLS = Math.max(1, Math.ceil(Math.sqrt(rooms.length)))
      rooms.forEach((r, i) => {
        if (!next[r.id]) {
          const col = i % COLS, row = Math.floor(i / COLS)
          next[r.id] = { x: 40 + col * 200, y: 40 + row * 130 }
        }
      })
      return next
    })
  }, [rooms])

  const CARD_W = 160, CARD_H = 80
  const EXIT_COLOR   = 'rgba(255,160,30,0.9)'
  const ARROW_COLOR  = '#ff9820'
  const SEL_COLOR    = '#5a9fd4'

  // Draw connections on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    canvas.width  = parent.clientWidth  || 900
    canvas.height = parent.clientHeight || 600
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw arrows for each exit
    Object.values(roomData).forEach(room => {
      const exits = room.exits || []
      exits.forEach(exit => {
        if (!exit.targetRoom) return
        const src = positions[room.id]
        const dst = positions[exit.targetRoom]
        if (!src || !dst) return

        const sx = src.x + CARD_W / 2, sy = src.y + CARD_H / 2
        const dx = dst.x + CARD_W / 2, dy = dst.y + CARD_H / 2

        // Offset slightly for bidirectional arrows
        const angle = Math.atan2(dy - sy, dx - sx)
        const off   = 8
        const ox    = Math.sin(angle) * off, oy = -Math.cos(angle) * off

        ctx.save()
        ctx.strokeStyle = EXIT_COLOR
        ctx.lineWidth   = 1.5
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(sx + ox, sy + oy)
        ctx.lineTo(dx + ox, dy + oy)
        ctx.stroke()
        ctx.setLineDash([])

        // Arrowhead
        const headLen = 10
        ctx.fillStyle = ARROW_COLOR
        ctx.beginPath()
        ctx.moveTo(dx + ox, dy + oy)
        ctx.lineTo(
          dx + ox - headLen * Math.cos(angle - Math.PI / 6),
          dy + oy - headLen * Math.sin(angle - Math.PI / 6)
        )
        ctx.lineTo(
          dx + ox - headLen * Math.cos(angle + Math.PI / 6),
          dy + oy - headLen * Math.sin(angle + Math.PI / 6)
        )
        ctx.closePath()
        ctx.fill()

        // Exit name label at midpoint
        const mx = (sx + dx) / 2 + ox, my = (sy + dy) / 2 + oy
        ctx.font       = '9px sans-serif'
        ctx.textAlign  = 'center'
        ctx.fillStyle  = 'rgba(255,200,80,0.85)'
        ctx.fillText(exit.name, mx, my - 4)
        ctx.restore()
      })
    })
  }, [roomData, positions])

  function getPosFromEvent(e) {
    const rect = canvasRef.current?.getBoundingClientRect() || { left: 0, top: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function hitTestCard(x, y) {
    for (const room of rooms) {
      const pos = positions[room.id]
      if (!pos) continue
      if (x >= pos.x && x <= pos.x + CARD_W && y >= pos.y && y <= pos.y + CARD_H) return room.id
    }
    return null
  }

  function handleMouseDown(e) {
    const { x, y } = getPosFromEvent(e)
    const hit = hitTestCard(x, y)
    if (hit) {
      const pos = positions[hit]
      setDragging({ roomId: hit, offX: x - pos.x, offY: y - pos.y })
    }
  }

  function handleMouseMove(e) {
    const { x, y } = getPosFromEvent(e)
    if (dragging) {
      setPositions(prev => ({
        ...prev,
        [dragging.roomId]: { x: x - dragging.offX, y: y - dragging.offY },
      }))
    } else {
      setHover(hitTestCard(x, y))
    }
  }

  function handleMouseUp(e) {
    setDragging(null)
  }

  function handleDblClick(e) {
    const { x, y } = getPosFromEvent(e)
    const hit = hitTestCard(x, y)
    if (hit) {
      const room = rooms.find(r => r.id === hit)
      if (room) onOpenRoom(room)
    }
  }

  return (
    <div className="room-map" style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#0d1117', cursor: dragging ? 'grabbing' : 'default' }}>
      {/* SVG/canvas for arrows */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Room cards as absolutely positioned divs */}
      <div style={{ position: 'absolute', inset: 0 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDblClick}
      >
        {rooms.map(room => {
          const pos = positions[room.id]
          if (!pos) return null
          const rd    = roomData[room.id]
          const exits = rd?.exits || []
          const entries = rd?.entries || []
          const isHovered = hover === room.id

          return (
            <div key={room.id} className={`map-card ${isHovered ? 'map-card--hover' : ''}`}
              style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
              title={`${room.name}\nDoble clic para editar`}>
              <div className="map-card__name">{room.name}</div>
              <div className="map-card__size" style={{ fontSize: 9, opacity: 0.5, marginBottom: 2 }}>
                {room.backgroundSize?.w}×{room.backgroundSize?.h}px
              </div>
              <div className="map-card__badges">
                {exits.length > 0 && (
                  <span className="map-badge map-badge--exit" title={exits.map(e => `→ ${e.name}`).join('\n')}>
                    {exits.length} salida{exits.length !== 1 ? 's' : ''}
                  </span>
                )}
                {entries.length > 0 && (
                  <span className="map-badge map-badge--entry" title={entries.map(e => e.name).join('\n')}>
                    {entries.length} entrada{entries.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="map-card__hint">doble clic para editar</div>
            </div>
          )
        })}
      </div>

      {rooms.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, color: '#fff' }}>
          Sin rooms — crea una desde la vista de lista
        </div>
      )}
    </div>
  )
}

// ── RoomManager ───────────────────────────────────────────────────────────────

export default function RoomManager({ onOpenRoom }) {
  const { activeGame } = useAppStore()
  const [rooms, setRooms]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [search, setSearch]     = useState('')
  const [viewMode, setViewMode]   = useState('grid')  // 'grid' | 'map'
  const newInputRef = useRef(null)

  const gameDir = activeGame?.gameDir
  const palette = activeGame?.game?.palette || []

  useEffect(() => { loadRooms() }, [gameDir])
  useEffect(() => { if (creating) newInputRef.current?.focus() }, [creating])

  async function loadRooms() {
    setLoading(true)
    const result = await window.api.listRooms(gameDir)
    if (result.ok) setRooms(result.rooms)
    setLoading(false)
  }

  async function handleCreateConfirm() {
    const trimmed = newName.trim()
    if (!trimmed) { setCreating(false); return }
    const result = await window.api.createRoom(gameDir, trimmed)
    if (result.ok) {
      setNewName('')
      setCreating(false)
      await loadRooms()
    }
  }

  const filtered = rooms.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="room-manager">
      {/* Toolbar */}
      <div className="rm-toolbar">
        <button
          className="btn-primary"
          onClick={() => setCreating(true)}
        >
          ＋ Nueva room
        </button>
        <input
          type="search"
          placeholder="Buscar room..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 200 }}
        />
        <span className="rm-toolbar__count">{rooms.length} room{rooms.length !== 1 ? 's' : ''}</span>
        <div className="rm-toolbar__sep" />
        <button className={`btn-ghost rm-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
          onClick={() => setViewMode('grid')} title="Vista cuadrícula">⊞ Lista</button>
        <button className={`btn-ghost rm-view-btn ${viewMode === 'map' ? 'active' : ''}`}
          onClick={() => setViewMode('map')} title="Vista mapa">🗺 Mapa</button>
      </div>

      {viewMode === 'map' && (
        <RoomMapView rooms={rooms} gameDir={gameDir} onOpenRoom={onOpenRoom} />
      )}

      {/* Grid */}
      {viewMode === 'grid' && <div className="rm-grid">
        {/* Campo de nueva room inline */}
        {creating && (
          <div className="room-card room-card--new">
            <div className="room-card__thumb room-card__thumb--new">🏠</div>
            <input
              ref={newInputRef}
              className="room-card__rename"
              value={newName}
              placeholder="Nombre de la room"
              onChange={e => setNewName(e.target.value)}
              onBlur={handleCreateConfirm}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateConfirm()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
            />
            <div className="room-card__meta">Enter para confirmar · Esc para cancelar</div>
          </div>
        )}

        {loading && <div className="rm-empty">Cargando...</div>}

        {!loading && filtered.length === 0 && !creating && (
          <div className="rm-empty">
            {rooms.length === 0
              ? 'No hay rooms. Crea una con el botón de arriba.'
              : 'Sin resultados para esa búsqueda.'
            }
          </div>
        )}

        {filtered.map(room => (
          <RoomCard
            key={room.id}
            room={room}
            gameDir={gameDir}
            palette={palette}
            onOpen={onOpenRoom}
            onRefresh={loadRooms}
          />
        ))}
      </div>}
    </div>
  )
}
