import { useState, useEffect } from 'react'

// Returns a data URL of the first frame of a character's idle (or first) animation.
// frameWidth determines the crop. Falls back to full spritesheet if not set.

export function useCharFirstFrame(char, gameDir, palette) {
  const [url, setUrl] = useState(null)

  const animKey = JSON.stringify((char?.animations || []).map(a => `${a.spriteFile}:${a.frameWidth}`))

  useEffect(() => {
    if (!char || !gameDir) { setUrl(null); return }
    const anims = char.animations || []
    if (anims.length === 0) { setUrl(null); return }

    // Prefer animation whose name contains 'idle', otherwise use first
    const anim = anims.find(a => a.name?.toLowerCase().includes('idle')) || anims[0]
    if (!anim?.spriteFile) { setUrl(null); return }

    setUrl(null)
    let cancelled = false

    window.api.readBinary(`${gameDir}/assets/converted/sprites/${anim.spriteFile}`)
      .then(r => {
        if (cancelled || !r.ok) return
        const buf = new Uint8Array(r.buffer)
        const fw = anim.frameWidth || null

        import('../utils/pcxConverter').then(({ pcxFileToDataURL }) => {
          if (cancelled) return
          if (!fw) { setUrl(pcxFileToDataURL(buf, palette)); return }

          try {
            const dv      = new DataView(buf.buffer, buf.byteOffset)
            const totalW  = dv.getUint16(8, true) + 1
            const h       = dv.getUint16(10, true) + 1
            const bpl     = dv.getUint16(66, true)
            const frameW  = Math.min(fw, totalW)

            const pixels  = new Uint8Array(bpl * h)
            let pos = 128, out = 0
            while (out < pixels.length && pos < buf.length - 769) {
              const byte = buf[pos++]
              if ((byte & 0xC0) === 0xC0) {
                const count = byte & 0x3F, val = buf[pos++]
                for (let i = 0; i < count && out < pixels.length; i++) pixels[out++] = val
              } else { pixels[out++] = byte }
            }

            const palOffset = buf.length - 769
            const pal = buf[palOffset] === 0x0C
              ? Array.from({ length: 256 }, (_, i) => [
                  buf[palOffset + 1 + i * 3],
                  buf[palOffset + 2 + i * 3],
                  buf[palOffset + 3 + i * 3],
                ])
              : (palette || [])

            const canvas  = document.createElement('canvas')
            canvas.width  = frameW
            canvas.height = h
            const ctx     = canvas.getContext('2d')
            const imgData = ctx.createImageData(frameW, h)

            for (let y = 0; y < h; y++) {
              for (let x = 0; x < frameW; x++) {
                const idx     = pixels[y * bpl + x]
                const [r, g, b] = pal[idx] || [0, 0, 0]
                const p       = (y * frameW + x) * 4
                imgData.data[p]   = r
                imgData.data[p+1] = g
                imgData.data[p+2] = b
                imgData.data[p+3] = idx === 0 ? 0 : 255
              }
            }
            ctx.putImageData(imgData, 0, 0)
            if (!cancelled) setUrl(canvas.toDataURL('image/png'))
          } catch { if (!cancelled) setUrl(null) }
        })
      })

    return () => { cancelled = true }
  }, [char?.id, animKey, gameDir])

  return url
}
