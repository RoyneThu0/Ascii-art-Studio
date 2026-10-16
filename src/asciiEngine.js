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

// 1-bit dithering modes: each cell becomes fully inked or blank.
export const DITHERS = ['off', 'floyd-steinberg', 'atkinson', 'bayer']

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map((v) => (v + 0.5) / 16)

// Quantize tones (0..1, row-major) to 0/1 in place.
function dither(tone, cols, rows, mode) {
  if (mode === 'bayer') {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        tone[i] = tone[i] > BAYER4[(y % 4) * 4 + (x % 4)] ? 1 : 0
      }
    }
    return
  }

  // Error diffusion. Atkinson spreads only 6/8 of the error, which keeps
  // highlights and shadows crisper; Floyd–Steinberg spreads all of it.
  const kernel = mode === 'atkinson'
    ? [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]]
    : [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const old = tone[i]
      const q = old >= 0.5 ? 1 : 0
      const err = old - q
      tone[i] = q
      for (const [dx, dy, w] of kernel) {
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < cols && yy < rows) tone[yy * cols + xx] += err * w
      }
    }
  }
}

// A monospace glyph cell is taller than it is wide — roughly 0.6:1 for
// SF Mono / Menlo / Consolas. Rows are reduced by this ratio and the
// render uses the same ratio for cell width, so proportions are preserved.
const CHAR_ASPECT = 0.6

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
 * @returns {{ text, cells, lum, cols, rows } | null}
 *   cells: flat array of { char, r, g, b } in row-major order.
 *   lum:   Float32Array of adjusted 0..1 luminance (before invert), used
 *          by the blob tracker.
 */
export function imageToAscii(source, options) {
  const {
    cols = 120,
    charSet = 'standard',
    invert = false,
    mirror = false,
    brightness = 1,
    contrast = 1,
    aspect = 0, // optional width/height to centre-crop the source to
    dither: ditherMode = 'off',
  } = options

  const { w: fullW, h: fullH } = sourceSize(source)
  if (!fullW || !fullH) return null

  // Source rectangle: the whole frame, or a centred crop to `aspect`.
  let sx = 0, sy = 0, sw = fullW, sh = fullH
  if (aspect > 0) {
    if (fullW / fullH > aspect) {
      sw = fullH * aspect
      sx = (fullW - sw) / 2
    } else {
      sh = fullW / aspect
      sy = (fullH - sh) / 2
    }
  }

  const chars = CHAR_SETS[charSet] ?? CHAR_SETS.standard
  const rows = Math.max(1, Math.round((cols * (sh / sw)) * CHAR_ASPECT))

  sampler.width = cols
  sampler.height = rows
  if (mirror) {
    // Flip horizontally: translate to the right edge, then draw at -1 x-scale.
    sctx.save()
    sctx.setTransform(-1, 0, 0, 1, cols, 0)
    sctx.drawImage(source, sx, sy, sw, sh, 0, 0, cols, rows)
    sctx.restore()
  } else {
    sctx.drawImage(source, sx, sy, sw, sh, 0, 0, cols, rows)
  }

  let data
  try {
    data = sctx.getImageData(0, 0, cols, rows).data
  } catch {
    // Tainted canvas (cross-origin image without CORS) — cannot read pixels.
    return null
  }

  const cells = new Array(cols * rows)
  const lumGrid = new Float32Array(cols * rows)
  const tone = new Float32Array(cols * rows)
  const lastIndex = chars.length - 1

  for (let i = 0; i < cols * rows; i++) {
    const p = i * 4
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]

    // Perceptual luminance (Rec. 601), 0..1
    let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    lum *= brightness
    // Contrast as a multiplier around mid-gray (1 = unchanged).
    lum = (lum - 0.5) * contrast + 0.5
    lum = Math.min(1, Math.max(0, lum))
    lumGrid[i] = lum
    tone[i] = invert ? 1 - lum : lum
  }

  if (ditherMode !== 'off') dither(tone, cols, rows, ditherMode)

  for (let i = 0; i < cols * rows; i++) {
    const p = i * 4
    // Tone 1 → densest glyph (start of ramp), tone 0 → blank (end).
    // Dithered tones are exactly 0 or 1, so only those two glyphs appear.
    const t = Math.min(1, Math.max(0, tone[i]))
    const idx = Math.round((1 - t) * lastIndex)
    cells[i] = { char: chars[idx], r: data[p], g: data[p + 1], b: data[p + 2] }
  }

  // Build the plain-text version (row-major, newline per row).
  let text = ''
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) text += cells[y * cols + x].char
    text += '\n'
  }

  return { text, cells, lum: lumGrid, cols, rows }
}

/**
 * Paint an ASCII result onto a display canvas.
 * @param result  output of imageToAscii
 * @param opts     { color, fg, bg, fontSize, fit }
 * @returns {{ ctx, cellW, cellH, width, height }} so overlays can be drawn
 *   in the same coordinate space.
 */
export function renderToCanvas(canvas, result, opts) {
  const { color = false, fg = '#c8d0d8', bg = '#12151c', fit } = opts
  const { cells, cols, rows } = result

  // When a fit box is given, scale the glyphs so the art fills the stage at
  // native resolution — far crisper than rendering small and CSS-scaling up.
  const fontSize = fit
    ? Math.max(1, Math.min(fit.w / (cols * CHAR_ASPECT), fit.h / rows))
    : (opts.fontSize ?? 8)

  const cellW = fontSize * CHAR_ASPECT // glyph advance width
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

  return { ctx, cellW, cellH, width: cols * cellW, height: rows * cellH }
}
