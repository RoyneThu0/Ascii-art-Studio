// ── CRT ──────────────────────────────────────────────────────────
// Puts the ASCII render behind old tube glass: barrel curvature, phosphor
// bloom, scanlines, an RGB aperture-grille mask, vignette and a faint glass
// glare. Everything is composited on the display canvas so photos and PNG
// exports look exactly like the screen.

export const PHOSPHORS = {
  off: null,
  green: { fg: '#5dff8a', bg: '#03140a' },
  amber: { fg: '#ffb43a', bg: '#140b02' },
}

// Reused scratch layers, sized on demand.
const passA = document.createElement('canvas')
const passB = document.createElement('canvas')

/**
 * @param canvas display canvas (resized here)
 * @param art    canvas holding the rendered ASCII art
 * @param opts   { curve, scanlines, glow, flicker }
 *   curve     0..0.3 barrel strength
 *   scanlines 0..1 scanline / mask darkness
 *   glow      0..1 bloom strength
 *   flicker   true on live sources for a faint brightness wobble
 */
export function drawCRT(canvas, art, opts) {
  const { curve = 0.12, scanlines = 0.5, glow = 0.5, flicker = false } = opts
  const dpr = window.devicePixelRatio || 1
  const W = art.width
  const H = art.height

  canvas.width = W
  canvas.height = H
  canvas.style.width = W / dpr + 'px'
  canvas.style.height = H / dpr + 'px'

  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, W, H)

  // Rounded tube face; everything below is clipped to it.
  const radius = Math.min(W, H) * 0.05
  ctx.save()
  roundRect(ctx, 0, 0, W, H, radius)
  ctx.clip()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const screen = curve > 0 ? barrel(art, W, H, curve) : art

  ctx.drawImage(screen, 0, 0)

  // Phosphor bloom: a blurred copy added on top.
  if (glow > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.45 * glow
    ctx.filter = `blur(${Math.round(4 * dpr)}px)`
    ctx.drawImage(screen, 0, 0)
    ctx.filter = 'none'
    ctx.restore()
  }

  if (scanlines > 0) {
    // Horizontal scanlines (every 3 CSS px) …
    ctx.save()
    ctx.globalAlpha = 0.55 * scanlines
    ctx.fillStyle = ctx.createPattern(scanPattern(dpr), 'repeat')
    ctx.fillRect(0, 0, W, H)
    // … and the RGB aperture grille.
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.5 * scanlines
    ctx.fillStyle = ctx.createPattern(gridPattern(dpr), 'repeat')
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  // Vignette toward the tube edges.
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.6)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)

  // Glass glare, upper left.
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.6)
  g.addColorStop(0, 'rgba(255,255,255,0.07)')
  g.addColorStop(0.5, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  if (flicker) {
    ctx.fillStyle = `rgba(0,0,0,${(Math.random() * 0.05).toFixed(3)})`
    ctx.fillRect(0, 0, W, H)
  }

  ctx.restore()
}

// Separable barrel distortion: squeeze each row by how far it is from the
// vertical centre, then each column by its distance from the horizontal
// centre. Edges bow inward like a curved tube face.
function barrel(src, W, H, k) {
  const strip = 2

  passA.width = W
  passA.height = H
  const a = passA.getContext('2d')
  a.clearRect(0, 0, W, H)
  for (let y = 0; y < H; y += strip) {
    const ny = ((y + strip / 2) / H) * 2 - 1
    const w = W / (1 + k * ny * ny)
    a.drawImage(src, 0, y, W, strip, (W - w) / 2, y, w, strip)
  }

  passB.width = W
  passB.height = H
  const b = passB.getContext('2d')
  b.clearRect(0, 0, W, H)
  for (let x = 0; x < W; x += strip) {
    const nx = ((x + strip / 2) / W) * 2 - 1
    const h = H / (1 + k * nx * nx)
    b.drawImage(passA, x, 0, strip, H, x, (H - h) / 2, strip, h)
  }
  return passB
}

let scanCache = null
function scanPattern(dpr) {
  if (scanCache?.dpr === dpr) return scanCache.c
  const c = document.createElement('canvas')
  const step = Math.max(2, Math.round(3 * dpr))
  c.width = 1
  c.height = step
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.fillRect(0, step - Math.max(1, Math.round(dpr)), 1, Math.max(1, Math.round(dpr)))
  scanCache = { dpr, c }
  return c
}

let gridCache = null
function gridPattern(dpr) {
  if (gridCache?.dpr === dpr) return gridCache.c
  const c = document.createElement('canvas')
  const col = Math.max(1, Math.round(dpr))
  c.width = col * 3
  c.height = 1
  const g = c.getContext('2d')
  ;['#ff8c8c', '#8cff8c', '#8c8cff'].forEach((color, i) => {
    g.fillStyle = color
    g.fillRect(i * col, 0, col, 1)
  })
  gridCache = { dpr, c }
  return c
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
