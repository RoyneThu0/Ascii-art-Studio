// ── ASCII Art Engine ─────────────────────────────────────────────
// Converts any drawable source (image, video, canvas) into ASCII.
// The pipeline: downsample the source into a low-res grid, read each
// cell's average brightness/color, then map brightness → a character
// whose visual "ink density" matches that tone.

// Character ramps, ordered DARK → LIGHT (dense glyph first, space last).
export const CHAR_SETS = {
  standard: '@%#*+=-:. ',
  detailed:
    "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  blocks: '█▓▒░ ',
  binary: '10 ',
  minimal: '#. ',
  // The "scrambled letters" look from classic image-to-ASCII filters.
  scramble: '@MHNWgkjihmnpqdbwOZLCJUYXzcvunxrft/|()1{}[]?-_+~<>il!;:,"^`\'. ',
}

// Monospace glyphs are taller than they are wide. This ratio corrects
// the vertical squash so output keeps the source's proportions.
const CHAR_ASPECT = 0.5

// One reusable offscreen canvas for sampling — avoids per-frame allocs.
const sampler = document.createElement('canvas')
const sctx = sampler.getContext('2d', { willReadFrequently: true })

function sourceSize(source) {
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight }
  }
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth, h: source.naturalHeight }
  }
  return { w: source.width, h: source.height }
}

/**
 * Convert a source into an ASCII representation.
 * @returns {{ text, cells, cols, rows } | null}
 *   cells: flat array of { char, r, g, b } in row-major order.
 */
export function imageToAscii(source, options) {
  const {
    cols = 120,
    charSet = 'standard',
    invert = false,
    mirror = false,
    brightness = 1,
    contrast = 1,
  } = options

  const { w: sw, h: sh } = sourceSize(source)
  if (!sw || !sh) return null

  const chars = CHAR_SETS[charSet] ?? CHAR_SETS.standard
  const rows = Math.max(1, Math.round((cols * (sh / sw)) * CHAR_ASPECT))

  sampler.width = cols
  sampler.height = rows
  if (mirror) {
    // Flip horizontally: translate to the right edge, then draw at -1 x-scale.
    sctx.save()
    sctx.setTransform(-1, 0, 0, 1, cols, 0)
    sctx.drawImage(source, 0, 0, cols, rows)
    sctx.restore()
  } else {
    sctx.drawImage(source, 0, 0, cols, rows)
  }

  let data
  try {
    data = sctx.getImageData(0, 0, cols, rows).data
  } catch {
    // Tainted canvas (cross-origin image without CORS) — cannot read pixels.
    return null
  }

  const cells = new Array(cols * rows)
  const lastIndex = chars.length - 1
  const cFactor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255))

  for (let i = 0; i < cols * rows; i++) {
    const p = i * 4
    let r = data[p]
    let g = data[p + 1]
    let b = data[p + 2]

    // Perceptual luminance (Rec. 601), 0..1
    let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    lum *= brightness
    // Contrast around mid-gray
    lum = ((cFactor * (lum * 255 - 128) + 128) / 255)
    lum = Math.min(1, Math.max(0, lum))
    if (invert) lum = 1 - lum

    // Bright pixel → light glyph (end of ramp); dark → dense glyph (start).
    const idx = Math.round((1 - lum) * lastIndex)
    cells[i] = { char: chars[idx], r, g, b }
  }

  // Build the plain-text version (row-major, newline per row).
  let text = ''
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) text += cells[y * cols + x].char
    text += '\n'
  }

  return { text, cells, cols, rows }
}

/**
 * Paint an ASCII result onto a display canvas.
 * @param result  output of imageToAscii
 * @param opts     { color, fg, bg, fontSize }
 */
export function renderToCanvas(canvas, result, opts) {
  const { color = false, fg = '#c8d0d8', bg = '#12151c', fontSize = 8 } = opts
  const { cells, cols, rows } = result

  const cellW = fontSize * CHAR_ASPECT * 2 // char cell width in px
  const cellH = fontSize
  const dpr = window.devicePixelRatio || 1

  canvas.width = Math.ceil(cols * cellW * dpr)
  canvas.height = Math.ceil(rows * cellH * dpr)
  canvas.style.width = cols * cellW + 'px'
  canvas.style.height = rows * cellH + 'px'

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cols * cellW, rows * cellH)

  ctx.font = `${fontSize}px "SF Mono", "Menlo", "Consolas", monospace`
  ctx.textBaseline = 'top'

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = cells[y * cols + x]
      if (c.char === ' ') continue
      ctx.fillStyle = color ? `rgb(${c.r},${c.g},${c.b})` : fg
      ctx.fillText(c.char, x * cellW, y * cellH)
    }
  }
}
