/**
 * PalettePicker — selector de color por índice de paleta VGA (256 colores).
 * Componente compartido, importable desde cualquier módulo del editor.
 *
 * Props:
 *   palette   — array de 256 entradas [r, g, b] (0-255 cada canal)
 *   value     — índice actual (0-255)
 *   onChange  — callback(nuevoÍndice)
 */
import { useState } from 'react'

// Paleta VGA por defecto si el juego no tiene paleta cargada
export const DEFAULT_VGA_PALETTE = Array.from({ length: 256 }, (_, i) => {
  if (i < 16) {
    const basic = [
      [0,0,0],[0,0,168],[0,168,0],[0,168,168],
      [168,0,0],[168,0,168],[168,84,0],[168,168,168],
      [84,84,84],[84,84,252],[84,252,84],[84,252,252],
      [252,84,84],[252,84,252],[252,252,84],[252,252,252],
    ]
    return basic[i]
  }
  return [i, i, i]
})

export function palIdx2css(palette, idx) {
  const pal = (palette && palette.length === 256) ? palette : DEFAULT_VGA_PALETTE
  const [r, g, b] = pal[idx] || [0, 0, 0]
  return `rgb(${r},${g},${b})`
}

export default function PalettePicker({ palette, value, onChange }) {
  const pal = (palette && palette.length === 256) ? palette : DEFAULT_VGA_PALETTE
  const [open, setOpen] = useState(false)
  const idx = value !== '' && value !== undefined && value !== null ? Number(value) : 0
  const [r, g, b] = pal[idx] || [0, 0, 0]
  const selectedCss = `rgb(${r},${g},${b})`

  return (
    <div style={{ position:'relative', display:'inline-flex', alignItems:'center', gap:6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        title={`Índice ${idx} — rgb(${r},${g},${b})`}
        style={{
          width: 36, height: 28, borderRadius: 4, cursor: 'pointer',
          background: selectedCss,
          border: '2px solid #888', flexShrink: 0
        }} />
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#aaa' }}>#{idx}</span>
      {open && (
        <div style={{
          position:'absolute', top:34, left:0, zIndex:999,
          background:'#1a1a2e', border:'1px solid #555', borderRadius:6,
          padding:6, display:'grid', gridTemplateColumns:'repeat(32,12px)',
          gap:1, boxShadow:'0 4px 20px #000a'
        }}>
          {pal.map(([pr, pg, pb], i) => (
            <div key={i}
              title={`#${i} rgb(${pr},${pg},${pb})`}
              onClick={() => { onChange(i); setOpen(false) }}
              style={{
                width:12, height:12,
                background: `rgb(${pr},${pg},${pb})`,
                cursor:'pointer', borderRadius:1,
                outline: idx === i ? '2px solid #fff' : 'none'
              }} />
          ))}
        </div>
      )}
    </div>
  )
}
