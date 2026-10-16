// ── Receipt ticket ───────────────────────────────────────────────
// Frames the ASCII render as a thermal-printer receipt: torn paper edges,
// a store header with barcode, a meta block, the art printed in ink, and a
// totals footer. Drawn entirely on canvas so photos and PNG exports carry
// the whole ticket (with transparent space around the torn edges).

export const PAPER = '#ecebe5'
export const INK = '#1c1b19'

const FONT = '"SF Mono", "Menlo", "Consolas", monospace'
const TEAR = 14     // depth of the torn edge
const PAD_X = 26    // paper margin either side of the art
const LINE = 15     // small-text line height

// Header & footer heights, so the caller can size the art to fit.
const HEADER = TEAR + 18 + 24 + 10 + 20 + 14 + 1 + 12 + LINE * 2 + 8 + 1 + 14
const FOOTER = 14 + 1 + 12 + LINE * 5 + 12 + 14 + 14 + LINE * 2 + 16 + TEAR

export function receiptChrome() {
  return { padX: PAD_X, header: HEADER, footer: FOOTER }
}

// Per-session ticket numbers, so they stay put frame to frame.
const session = {
  check: String(1 + Math.floor(Math.random() * 999)).padStart(3, '0'),
  cust: String(10000 + Math.floor(Math.random() * 89999)),
}

/**
 * Compose the receipt onto the display canvas.
 * @param canvas  display canvas (resized here)
 * @param art     canvas holding the rendered ASCII art
 * @param metrics { width, height } of the art in CSS px
 * @param opts    { title, currency, cols, rows }
 */
export function drawReceipt(canvas, art, metrics, opts) {
  const { title = 'ASCII MARKET', currency = '¥', cols, rows } = opts
  const dpr = window.devicePixelRatio || 1
  const artW = metrics.width
  const artH = metrics.height
  const W = Math.ceil(artW + PAD_X * 2)
  const H = Math.ceil(HEADER + artH + FOOTER)

  canvas.width = Math.ceil(W * dpr)
  canvas.height = Math.ceil(H * dpr)
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  // Paper with torn top and bottom edges.
  ctx.save()
  paperPath(ctx, W, H)
  ctx.clip()
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)
  // Faint shading toward the edges, like paper curling off the roll.
  const shade = ctx.createLinearGradient(0, 0, W, 0)
  shade.addColorStop(0, 'rgba(0,0,0,0.07)')
  shade.addColorStop(0.12, 'rgba(0,0,0,0)')
  shade.addColorStop(0.88, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.07)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  ctx.textBaseline = 'top'
  const cx = W / 2
  const left = PAD_X
  const right = W - PAD_X
  let y = TEAR + 18

  // Store name, widely tracked like a receipt printer's double-width font.
  ctx.font = `700 20px ${FONT}`
  spaced(ctx, title.toUpperCase(), cx, y, 3, 'center')
  y += 24 + 10

  barcode(ctx, cx, y, Math.min(140, W - PAD_X * 2), 20, title)
  y += 20 + 14

  dashed(ctx, left, right, y)
  y += 1 + 12

  const now = new Date()
  const date = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  ctx.font = `500 11px ${FONT}`
  pair(ctx, date, time, left, right, y)
  y += LINE
  pair(ctx, `CHECK: ${session.check}`, `CUST: ${session.cust}`, left, right, y)
  y += LINE + 8

  dashed(ctx, left, right, y)
  y += 1 + 14

  // The art itself, slightly faded like thermal ink.
  // Drawn at the layer's own pixel size so glyph rows aren't resampled.
  const layerW = art.width / dpr
  const layerH = art.height / dpr
  ctx.globalAlpha = 0.94
  ctx.drawImage(art, Math.round(left), Math.round(y), layerW, layerH)
  ctx.globalAlpha = 1
  y += Math.round(artH) + 14

  dashed(ctx, left, right, y)
  y += 1 + 12

  const glyphs = cols * rows
  const total = glyphs / 100
  const cash = Math.ceil((total + 1) / 50) * 50
  const money = (v) => `${currency}${v.toFixed(2)}`
  ctx.font = `500 11px ${FONT}`
  pair(ctx, 'GLYPHS', glyphs.toLocaleString('en-US'), left, right, y); y += LINE
  pair(ctx, 'RESOLUTION', `${cols}x${rows}`, left, right, y); y += LINE
  ctx.font = `700 11px ${FONT}`
  pair(ctx, 'TOTAL', money(total), left, right, y); y += LINE
  ctx.font = `500 11px ${FONT}`
  pair(ctx, 'CASH', money(cash), left, right, y); y += LINE
  pair(ctx, 'CHANGE', money(cash - total), left, right, y); y += LINE + 12

  ctx.font = `700 12px ${FONT}`
  spaced(ctx, '********', cx, y, 2, 'center')
  y += 14 + 14

  ctx.font = `600 10px ${FONT}`
  spaced(ctx, 'THANKS FOR DOING BUSINESS', cx, y, 1.5, 'center')
  y += LINE
  spaced(ctx, 'WITH US !!', cx, y, 1.5, 'center')

  // Paper grain over everything, ink included, for an uneven print.
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat')
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

/** Plain-text receipt wrapped around the ASCII lines, for copy / .txt. */
export function receiptText(text, opts) {
  const { title = 'ASCII MARKET', currency = '¥', cols, rows } = opts
  const w = Math.max(cols, 32)
  const center = (s) => ' '.repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s
  const pairLine = (a, b) => a + ' '.repeat(Math.max(1, w - a.length - b.length)) + b
  const rule = '-'.repeat(w)
  const now = new Date()
  const glyphs = cols * rows
  const total = glyphs / 100
  const cash = Math.ceil((total + 1) / 50) * 50
  const money = (v) => `${currency}${v.toFixed(2)}`

  return [
    center(title.toUpperCase().split('').join(' ')),
    center('|| ||| | |||| || ||| |'),
    rule,
    pairLine(now.toLocaleDateString('en-US'), now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })),
    pairLine(`CHECK: ${session.check}`, `CUST: ${session.cust}`),
    rule,
    text.replace(/\n$/, ''),
    rule,
    pairLine('GLYPHS', glyphs.toLocaleString('en-US')),
    pairLine('RESOLUTION', `${cols}x${rows}`),
    pairLine('TOTAL', money(total)),
    pairLine('CASH', money(cash)),
    pairLine('CHANGE', money(cash - total)),
    '',
    center('********'),
    '',
    center('THANKS FOR DOING BUSINESS'),
    center('WITH US !!'),
    '',
  ].join('\n')
}

// ── drawing helpers ──────────────────────────────────────────────

// Seeded PRNG so the torn edge and barcode don't shimmer every frame.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function paperPath(ctx, W, H) {
  const r = rng(7)
  ctx.beginPath()
  ctx.moveTo(0, TEAR * (0.4 + r() * 0.6))
  for (let x = 0; x < W;) {
    x = Math.min(W, x + 3 + r() * 6)
    ctx.lineTo(x, TEAR * (0.15 + r() * 0.85))
  }
  ctx.lineTo(W, H - TEAR * (0.4 + r() * 0.6))
  for (let x = W; x > 0;) {
    x = Math.max(0, x - 3 - r() * 6)
    ctx.lineTo(x, H - TEAR * (0.15 + r() * 0.85))
  }
  ctx.closePath()
}

function spaced(ctx, text, x, y, gap, align) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1)
  let cx = align === 'center' ? x - total / 2 : x
  ;[...text].forEach((ch, i) => {
    ctx.fillText(ch, cx, y)
    cx += widths[i] + gap
  })
}

function pair(ctx, a, b, left, right, y) {
  ctx.textAlign = 'left'
  ctx.fillText(a, left, y)
  ctx.textAlign = 'right'
  ctx.fillText(b, right, y)
  ctx.textAlign = 'left'
}

function dashed(ctx, left, right, y) {
  ctx.save()
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.moveTo(left, y + 0.5)
  ctx.lineTo(right, y + 0.5)
  ctx.stroke()
  ctx.restore()
}

function barcode(ctx, cx, y, w, h, seedText) {
  const r = rng(hash(seedText))
  const bars = []
  let total = 0
  while (total < w) {
    const bw = 1 + Math.floor(r() * 3)
    const gap = 1 + Math.floor(r() * 2)
    bars.push([total, bw])
    total += bw + gap
  }
  const x0 = Math.round(cx - total / 2)
  for (const [x, bw] of bars) ctx.fillRect(x0 + x, y, bw, h)
}

let grainCanvas = null
function grain() {
  if (grainCanvas) return grainCanvas
  grainCanvas = document.createElement('canvas')
  grainCanvas.width = grainCanvas.height = 160
  const g = grainCanvas.getContext('2d')
  const img = g.createImageData(160, 160)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 255 - Math.floor(Math.random() ** 4 * 34)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return grainCanvas
}
