import { useState, useRef, useEffect, useCallback } from 'react'
import { decodePCXToIndexed, encodePCX } from '../../utils/pcxConverter'

const ASSET_TYPES = [
  { id: 'backgrounds', icon: '🏞', label: 'Fondos' },
  { id: 'sprites',     icon: '🧍', label: 'Sprites' },
  { id: 'objects',     icon: '📦', label: 'Objetos' },
  { id: 'fonts',       icon: '🔤', label: 'Fuentes' },
]

const DRAW_TOOLS = [
  { id: 'pencil',  icon: '✏',  title: 'Lápiz (B)' },
  { id: 'eraser',  icon: '⬜', title: 'Borrador (E)' },
  { id: 'fill',    icon: '🪣', title: 'Relleno (F)' },
  { id: 'eyedrop', icon: '💉', title: 'Cuentagotas (I)' },
]

const SEL_TOOLS = [
  { id: 'rect', icon: '▭', title: 'Selección rectangular (R)' },
  { id: 'wand', icon: '✦', title: 'Varita mágica — misma zona de color (W)' },
]

const ZOOMS    = [1, 2, 4, 8, 12, 16]
const MAX_UNDO = 20

// ── Flood fill (dibujo) ───────────────────────────────────────────────────────
function floodFill(px, w, h, x0, y0, from, to) {
  if (from === to) return
  const stack = [y0 * w + x0]
  while (stack.length) {
    const i = stack.pop()
    if (i < 0 || i >= w * h || px[i] !== from) continue
    px[i] = to
    const x = i % w
    if (x > 0)          stack.push(i - 1)
    if (x < w - 1)      stack.push(i + 1)
    if (i >= w)         stack.push(i - w)
    if (i < w * (h-1)) stack.push(i + w)
  }
}

// ── Flood select (varita) ─────────────────────────────────────────────────────
function floodSelect(px, mask, w, h, x0, y0) {
  const from = px[y0 * w + x0]
  const stack = [y0 * w + x0]
  const visited = new Uint8Array(w * h)
  while (stack.length) {
    const i = stack.pop()
    if (i < 0 || i >= w * h || visited[i] || px[i] !== from) continue
    visited[i] = 1
    mask[i] = 1
    const x = i % w
    if (x > 0)          stack.push(i - 1)
    if (x < w - 1)      stack.push(i + 1)
    if (i >= w)         stack.push(i - w)
    if (i < w * (h-1)) stack.push(i + w)
  }
}

// ── Render canvas ─────────────────────────────────────────────────────────────
function renderCanvas(canvas, px, w, h, pal, zoom, grid, selMask, selDrag, pasteClip, pastePos) {
  if (!canvas || !px || !w || !h) return
  canvas.width  = w * zoom
  canvas.height = h * zoom
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // Píxeles base
  const tmp = document.createElement('canvas')
  tmp.width = w; tmp.height = h
  const tc = tmp.getContext('2d')
  const id = tc.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const idx = px[i]
    if (idx === 0) {
      const bx = (i % w) >> 2, by = ((i / w) | 0) >> 2
      const v  = (bx + by) % 2 === 0 ? 160 : 120
      id.data[i*4] = v; id.data[i*4+1] = v; id.data[i*4+2] = v; id.data[i*4+3] = 255
    } else {
      const c = pal[idx] || [0, 0, 0]
      id.data[i*4] = c[0]; id.data[i*4+1] = c[1]; id.data[i*4+2] = c[2]; id.data[i*4+3] = 255
    }
  }
  tc.putImageData(id, 0, 0)
  ctx.drawImage(tmp, 0, 0, w * zoom, h * zoom)

  // Cuadrícula
  if (grid && zoom >= 4) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth   = 0.5
    for (let x = 0; x <= w; x++) {
      ctx.beginPath(); ctx.moveTo(x*zoom, 0); ctx.lineTo(x*zoom, h*zoom); ctx.stroke()
    }
    for (let y = 0; y <= h; y++) {
      ctx.beginPath(); ctx.moveTo(0, y*zoom); ctx.lineTo(w*zoom, y*zoom); ctx.stroke()
    }
  }

  // Overlay de selección (tinte azul)
  if (selMask) {
    const sc = document.createElement('canvas')
    sc.width = w; sc.height = h
    const sctx = sc.getContext('2d')
    const sid  = sctx.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      if (!selMask[i]) continue
      sid.data[i*4] = 60; sid.data[i*4+1] = 120; sid.data[i*4+2] = 255; sid.data[i*4+3] = 90
    }
    sctx.putImageData(sid, 0, 0)
    ctx.drawImage(sc, 0, 0, w*zoom, h*zoom)

    // Borde (edge detection, una sola llamada a stroke)
    ctx.strokeStyle = '#4080ff'
    ctx.lineWidth   = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    for (let py = 0; py <= h; py++) {
      for (let qx = 0; qx < w; qx++) {
        const above = py > 0 && selMask[(py-1)*w + qx]
        const below = py < h && selMask[py*w + qx]
        if (!!above !== !!below) { ctx.moveTo(qx*zoom, py*zoom); ctx.lineTo((qx+1)*zoom, py*zoom) }
      }
    }
    for (let qx = 0; qx <= w; qx++) {
      for (let py = 0; py < h; py++) {
        const left  = qx > 0 && selMask[py*w + qx-1]
        const right = qx < w && selMask[py*w + qx]
        if (!!left !== !!right) { ctx.moveTo(qx*zoom, py*zoom); ctx.lineTo(qx*zoom, (py+1)*zoom) }
      }
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Preview rect drag
  if (selDrag?.active) {
    const x0 = Math.min(selDrag.x0, selDrag.x1), y0 = Math.min(selDrag.y0, selDrag.y1)
    const x1 = Math.max(selDrag.x0, selDrag.x1), y1 = Math.max(selDrag.y0, selDrag.y1)
    ctx.strokeStyle = '#4080ff'
    ctx.lineWidth   = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(x0*zoom, y0*zoom, (x1-x0+1)*zoom, (y1-y0+1)*zoom)
    ctx.setLineDash([])
  }

  // Preview de pegado
  if (pasteClip && pastePos) {
    const { data: pd, w: pw, h: ph } = pasteClip
    const pt = document.createElement('canvas')
    pt.width = pw; pt.height = ph
    const ptc = pt.getContext('2d')
    const pid = ptc.createImageData(pw, ph)
    for (let i = 0; i < pw * ph; i++) {
      const idx = pd[i]
      if (!idx) continue
      const c = pal[idx] || [0, 0, 0]
      pid.data[i*4]=c[0]; pid.data[i*4+1]=c[1]; pid.data[i*4+2]=c[2]; pid.data[i*4+3]=200
    }
    ptc.putImageData(pid, 0, 0)
    ctx.save()
    ctx.globalAlpha = 0.85
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(pt, pastePos.x*zoom, pastePos.y*zoom, pw*zoom, ph*zoom)
    ctx.restore()
    ctx.strokeStyle = '#ffe040'
    ctx.lineWidth   = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(pastePos.x*zoom, pastePos.y*zoom, pw*zoom, ph*zoom)
    ctx.setLineDash([])
  }
}

// ═════════════════════════════════════════════════════════════════════════════
export default function AssetEditor({ gameDir, palette }) {
  // ── Asset list ──────────────────────────────────────────────────────────
  const [assetType, setAssetType] = useState('sprites')
  const [assetList, setAssetList] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [curAsset, setCurAsset] = useState(null)

  // ── Imagen en edición ───────────────────────────────────────────────────
  const [imgW, setImgW]           = useState(0)
  const [imgH, setImgH]           = useState(0)
  const [activePal, setActivePal] = useState(palette)

  // ── Herramienta y vista ─────────────────────────────────────────────────
  const [tool, setTool]       = useState('pencil')
  const [color, setColor]     = useState(1)
  const [zoomIdx, setZoomIdx] = useState(2)
  const [grid, setGrid]       = useState(true)

  // ── Selección ───────────────────────────────────────────────────────────
  const [hasSel,  setHasSel]  = useState(false)
  const [hasClip, setHasClip] = useState(false)
  const [inPaste, setInPaste] = useState(false)

  // ── Estado general ──────────────────────────────────────────────────────
  const [dirty,  setDirty]  = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [tick,   setTick]   = useState(0)

  // ── Refs (mutación directa, no provocan re-render) ──────────────────────
  const pxRef        = useRef(null)   // Uint8Array índices
  const undoRef      = useRef([])
  const painting     = useRef(false)
  const canvasRef    = useRef(null)
  const selMaskRef   = useRef(null)   // Uint8Array 0/1
  const selDragRef   = useRef({ active: false, x0:0, y0:0, x1:0, y1:0 })
  const clipboardRef = useRef(null)   // { data, w, h }
  const pastePosRef  = useRef({ x:0, y:0 })
  const inPasteRef   = useRef(false)
  const actionsRef   = useRef({})

  inPasteRef.current = inPaste

  const zoom = ZOOMS[zoomIdx]

  // ── Cargar lista ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameDir) return
    setListLoading(true)
    window.api.listAssets(gameDir, assetType).then(r => {
      setAssetList(r.ok ? r.files : [])
      setListLoading(false)
    })
  }, [assetType, gameDir])

  // ── Redraw canvas ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!pxRef.current || !imgW) return
    renderCanvas(
      canvasRef.current, pxRef.current, imgW, imgH, activePal, zoom, grid,
      selMaskRef.current, selDragRef.current,
      inPaste ? clipboardRef.current : null,
      inPaste ? pastePosRef.current  : null,
    )
  }, [tick, zoom, grid, imgW, imgH, activePal, inPaste])

  // ── Abrir asset ─────────────────────────────────────────────────────────
  async function openAsset(a) {
    setError('')
    const r = await window.api.readBinary(a.path)
    if (!r.ok) { setError(r.error); return }
    const buf = new Uint8Array(r.buffer)
    const { indices, width, height, embeddedPalette } = decodePCXToIndexed(buf)
    pxRef.current = new Uint8Array(indices)
    undoRef.current = []
    selMaskRef.current = null
    selDragRef.current = { active: false, x0:0, y0:0, x1:0, y1:0 }
    setImgW(width); setImgH(height)
    setActivePal(embeddedPalette || palette)
    setCurAsset(a)
    setHasSel(false); setInPaste(false)
    setDirty(false)
    setTick(t => t + 1)
  }

  // ── Undo ────────────────────────────────────────────────────────────────
  function pushUndo() {
    undoRef.current = [...undoRef.current.slice(-(MAX_UNDO-1)), new Uint8Array(pxRef.current)]
  }

  const handleUndo = useCallback(() => {
    if (!undoRef.current.length) return
    pxRef.current = new Uint8Array(undoRef.current[undoRef.current.length - 1])
    undoRef.current = undoRef.current.slice(0, -1)
    setDirty(true); setTick(t => t + 1)
  }, [])

  // ── Coordenadas canvas → pixel ──────────────────────────────────────────
  function getXY(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.floor((e.clientX - rect.left) / zoom),
      y: Math.floor((e.clientY - rect.top)  / zoom),
    }
  }

  // ── Herramientas de dibujo ──────────────────────────────────────────────
  function applyAt(x, y, newStroke) {
    const px = pxRef.current
    if (!px || x < 0 || y < 0 || x >= imgW || y >= imgH) return
    const i = y * imgW + x
    if (tool === 'eyedrop') { setColor(px[i]); setTool('pencil'); return }
    if (newStroke) pushUndo()
    let changed = false
    if      (tool === 'pencil' && px[i] !== color) { px[i] = color; changed = true }
    else if (tool === 'eraser' && px[i] !== 0)      { px[i] = 0;     changed = true }
    else if (tool === 'fill')  { floodFill(px, imgW, imgH, x, y, px[i], color); changed = true }
    if (changed) { setDirty(true); setTick(t => t + 1) }
  }

  // ── Selección ───────────────────────────────────────────────────────────
  function applyRectMask(x1, y1) {
    const d = selDragRef.current
    const x0 = Math.min(d.x0, x1), y0 = Math.min(d.y0, y1)
    const xE = Math.max(d.x0, x1), yE = Math.max(d.y0, y1)
    const mask = new Uint8Array(imgW * imgH)
    for (let py = y0; py <= yE; py++)
      for (let px = x0; px <= xE; px++)
        if (px >= 0 && py >= 0 && px < imgW && py < imgH)
          mask[py * imgW + px] = 1
    selMaskRef.current = mask
    selDragRef.current = { active: false, x0:0, y0:0, x1:0, y1:0 }
    setHasSel(true); setTick(t => t + 1)
  }

  function doWandSelect(x, y, add) {
    if (!pxRef.current || x < 0 || y < 0 || x >= imgW || y >= imgH) return
    const mask = add && selMaskRef.current
      ? new Uint8Array(selMaskRef.current)
      : new Uint8Array(imgW * imgH)
    floodSelect(pxRef.current, mask, imgW, imgH, x, y)
    selMaskRef.current = mask
    setHasSel(true); setTick(t => t + 1)
  }

  function clearSel() {
    selMaskRef.current = null
    selDragRef.current = { active: false, x0:0, y0:0, x1:0, y1:0 }
    setHasSel(false); setTick(t => t + 1)
  }

  // ── Clipboard ───────────────────────────────────────────────────────────
  function getSelBounds() {
    const mask = selMaskRef.current
    if (!mask) return null
    let x0 = imgW, y0 = imgH, x1 = -1, y1 = -1
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue
      const x = i % imgW, y = (i / imgW) | 0
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1-x0+1, h: y1-y0+1 }
  }

  function doCopy() {
    const b = getSelBounds()
    if (!b) return
    const { x, y, w, h } = b
    const mask = selMaskRef.current, px = pxRef.current
    const data = new Uint8Array(w * h)
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const si = (y+dy)*imgW + (x+dx)
        data[dy*w+dx] = mask[si] ? px[si] : 0
      }
    clipboardRef.current = { data, w, h }
    setHasClip(true)
  }

  function doDelete() {
    const mask = selMaskRef.current
    if (!mask || !pxRef.current) return
    pushUndo()
    for (let i = 0; i < pxRef.current.length; i++)
      if (mask[i]) pxRef.current[i] = 0
    setDirty(true); setTick(t => t + 1)
  }

  function doCut() { doCopy(); doDelete() }

  function enterPaste() {
    if (!clipboardRef.current) return
    pastePosRef.current = { x: 0, y: 0 }
    setInPaste(true); setTick(t => t + 1)
  }

  function stampPaste(px_x, py_y) {
    if (!clipboardRef.current || !pxRef.current) return
    pushUndo()
    const { data, w, h } = clipboardRef.current
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const tx = px_x+dx, ty = py_y+dy
        if (tx < 0 || ty < 0 || tx >= imgW || ty >= imgH) continue
        const v = data[dy*w+dx]
        if (v !== 0) pxRef.current[ty*imgW+tx] = v
      }
    setDirty(true); setInPaste(false); setTick(t => t + 1)
  }

  // Exponer en ref para el handler de teclado (evita closures viejos)
  actionsRef.current = { handleUndo, doCopy, doCut, doDelete, enterPaste, clearSel }

  // ── Teclado ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const { handleUndo, doCopy, doCut, doDelete, enterPaste, clearSel } = actionsRef.current
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl) {
        if (e.key === 'z') { e.preventDefault(); handleUndo() }
        if (e.key === 'c') { e.preventDefault(); doCopy() }
        if (e.key === 'x') { e.preventDefault(); doCut() }
        if (e.key === 'v') { e.preventDefault(); enterPaste() }
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); doDelete() }
      if (e.key === 'Escape') {
        if (inPasteRef.current) { setInPaste(false); setTick(t => t + 1) }
        else clearSel()
      }
      if (e.key === 'b') setTool('pencil')
      if (e.key === 'e') setTool('eraser')
      if (e.key === 'f') setTool('fill')
      if (e.key === 'i') setTool('eyedrop')
      if (e.key === 'r') setTool('rect')
      if (e.key === 'w') setTool('wand')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Mouse ────────────────────────────────────────────────────────────────
  function onMouseDown(e) {
    e.preventDefault()
    if (!canvasRef.current) return
    const { x, y } = getXY(e)

    if (inPasteRef.current) {
      stampPaste(pastePosRef.current.x, pastePosRef.current.y)
      return
    }

    if (tool === 'rect') {
      selMaskRef.current = null
      selDragRef.current = { active: true, x0: x, y0: y, x1: x, y1: y }
      setHasSel(false); setTick(t => t + 1)
      return
    }

    if (tool === 'wand') {
      doWandSelect(x, y, e.shiftKey)
      return
    }

    if (!pxRef.current) return
    painting.current = true
    applyAt(x, y, true)
  }

  function onMouseMove(e) {
    if (!canvasRef.current) return
    const { x, y } = getXY(e)

    if (inPasteRef.current && clipboardRef.current) {
      const { w, h } = clipboardRef.current
      pastePosRef.current = {
        x: Math.max(0, Math.min(imgW - w, x - (w >> 1))),
        y: Math.max(0, Math.min(imgH - h, y - (h >> 1))),
      }
      setTick(t => t + 1)
      return
    }

    if (selDragRef.current?.active) {
      selDragRef.current = { ...selDragRef.current, x1: x, y1: y }
      setTick(t => t + 1)
      return
    }

    if (!painting.current || tool === 'fill' || tool === 'eyedrop' ||
        tool === 'rect' || tool === 'wand') return
    applyAt(x, y, false)
  }

  function onMouseUp(e) {
    if (selDragRef.current?.active) {
      const { x, y } = getXY(e)
      applyRectMask(x, y)
      return
    }
    painting.current = false
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!curAsset || !pxRef.current) return
    setSaving(true); setError('')
    try {
      const buf = encodePCX(pxRef.current, imgW, imgH, activePal)
      const r   = await window.api.writeBinary(curAsset.path, Array.from(buf))
      if (!r.ok) throw new Error(r.error)
      setDirty(false)
    } catch(err) { setError('Error: ' + err.message) }
    setSaving(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isSelTool  = tool === 'rect' || tool === 'wand'
  const cursorMap  = {
    pencil: 'crosshair', eraser: 'cell', fill: 'copy', eyedrop: 'zoom-in',
    rect: 'crosshair', wand: 'crosshair',
  }
  const activeCursor = inPaste ? 'move' : (cursorMap[tool] || 'crosshair')
  const colorCss = color === 0
    ? 'repeating-conic-gradient(#aaa 0% 25%,#ccc 0% 50%) 0 0/6px 6px'
    : `rgb(${(activePal[color]||[0,0,0]).join(',')})`

  return (
    <div className="ped-root">

      {/* ── Lista de assets ── */}
      <div className="ped-left">
        <div className="ped-type-tabs">
          {ASSET_TYPES.map(t => (
            <button key={t.id} title={t.label}
              className={`asset-tab ${assetType === t.id ? 'active' : ''}`}
              onClick={() => setAssetType(t.id)}>
              {t.icon}
            </button>
          ))}
        </div>
        <div className="ped-asset-list">
          {listLoading && <div className="ped-empty">Cargando...</div>}
          {!listLoading && assetList.length === 0 && <div className="ped-empty">Sin assets</div>}
          {assetList.map(a => (
            <button key={a.path}
              className={`ped-asset-row ${curAsset?.path === a.path ? 'active' : ''}`}
              onClick={() => openAsset(a)}>
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor ── */}
      <div className="ped-center">
        <div className="ped-toolbar">

          {/* Herramientas de dibujo */}
          {DRAW_TOOLS.map(t => (
            <button key={t.id} title={t.title}
              className={`ped-tbtn ${tool === t.id ? 'active' : ''}`}
              onClick={() => setTool(t.id)}>
              {t.icon}
            </button>
          ))}

          <div className="ped-sep" />

          {/* Herramientas de selección */}
          {SEL_TOOLS.map(t => (
            <button key={t.id} title={t.title}
              className={`ped-tbtn ${tool === t.id ? 'active' : ''}`}
              onClick={() => setTool(t.id)}>
              {t.icon}
            </button>
          ))}

          <div className="ped-sep" />

          {/* Operaciones de selección */}
          <button className="ped-tbtn" title="Copiar selección (Ctrl+C)"
            disabled={!hasSel} onClick={doCopy}>⎘</button>
          <button className="ped-tbtn" title="Cortar selección (Ctrl+X)"
            disabled={!hasSel} onClick={doCut}>✂</button>
          <button className="ped-tbtn" title="Borrar selección (Del)"
            disabled={!hasSel} onClick={doDelete}>⌦</button>
          <button className="ped-tbtn" title="Pegar (Ctrl+V)"
            disabled={!hasClip} onClick={enterPaste}>⎗</button>
          {hasSel && (
            <button className="ped-tbtn" title="Deseleccionar (Esc)"
              onClick={clearSel}>✕</button>
          )}

          <div className="ped-sep" />

          {/* Color activo */}
          <div className="ped-color-swatch" style={{ background: colorCss }}
            title={`Índice ${color} · rgb(${(activePal[color]||[0,0,0]).join(',')})`} />

          <div className="ped-sep" />

          {/* Zoom */}
          <button className="ped-tbtn" disabled={zoomIdx === 0}
            onClick={() => setZoomIdx(i => Math.max(0, i-1))}>−</button>
          <span className="ped-zoom-lbl">{zoom}×</span>
          <button className="ped-tbtn" disabled={zoomIdx === ZOOMS.length-1}
            onClick={() => setZoomIdx(i => Math.min(ZOOMS.length-1, i+1))}>+</button>

          <div className="ped-sep" />

          <button className={`ped-tbtn ${grid ? 'active' : ''}`} title="Cuadrícula"
            onClick={() => setGrid(g => !g)}>⊞</button>
          <button className="ped-tbtn" title="Deshacer (Ctrl+Z)"
            disabled={!undoRef.current.length} onClick={handleUndo}>↩</button>

          <div className="ped-spacer" />

          {inPaste && <span className="ped-paste-hint">Clic para pegar · Esc cancela</span>}
          {curAsset && !inPaste && (
            <span className="ped-info">{curAsset.name} · {imgW}×{imgH}</span>
          )}
          {dirty && <span className="ped-dot">●</span>}
          {error && <span className="ped-err">{error}</span>}
          <button className="btn-primary ped-save"
            disabled={!dirty || saving || !curAsset} onClick={handleSave}>
            {saving ? '...' : '💾'}
          </button>
        </div>

        {!curAsset ? (
          <div className="ped-placeholder">← Selecciona un asset para editar</div>
        ) : (
          <div className="ped-canvas-wrap">
            <canvas ref={canvasRef}
              style={{ cursor: activeCursor, display: 'block', userSelect: 'none' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { painting.current = false }}
            />
          </div>
        )}
      </div>

      {/* ── Paleta ── */}
      <div className="ped-palette">
        <div className="panel-header">Paleta</div>
        <div className="ped-palette-grid">
          {(activePal.length ? activePal : palette).slice(0, 256).map((c, i) => (
            <div key={i}
              className={`ped-sw ${color === i ? 'sel' : ''}`}
              style={{
                background: i === 0
                  ? 'repeating-conic-gradient(#aaa 0% 25%,#ccc 0% 50%) 0 0/6px 6px'
                  : `rgb(${c.join(',')})`,
              }}
              title={`${i}: rgb(${c.join(',')})`}
              onClick={() => { setColor(i); if (!isSelTool) setTool('pencil') }}
            />
          ))}
        </div>
      </div>

    </div>
  )
}
