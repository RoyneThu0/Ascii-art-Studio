// ── Blob Tracker ─────────────────────────────────────────────────
// Finds "blobs" (connected regions of interest) on the same low-res
// luminance grid the ASCII engine samples, follows them from frame to
// frame with persistent IDs, and draws a technical overlay on top of the
// rendered glyphs.
//
// Detection modes:
//   motion — cells whose brightness changed vs. a running background
//   bright — cells brighter than a cutoff
//   dark   — cells darker than a cutoff
//
// Working on the character grid (not full-res pixels) keeps this cheap
// enough to run every frame alongside the ASCII render.

export const BLOB_MODES = ['motion', 'bright', 'dark']

// How quickly the motion background catches up with the scene (0..1).
// Lower = longer trails / slower adaptation.
const BG_ADAPT = 0.6
// Frames a track may go unseen before it is dropped.
const MAX_MISSED = 6
// Matches needed before a new track is drawn (suppresses one-frame flicker).
const MIN_HITS = 2
// Box smoothing: share of the new detection blended in each frame.
const SMOOTH = 0.45

export function createBlobTracker() {
  return { bg: null, cols: 0, rows: 0, tracks: [], nextId: 1 }
}

export function resetBlobTracker(state) {
  Object.assign(state, createBlobTracker())
}

/**
 * Detect and track blobs for one frame.
 * @param state  from createBlobTracker()
 * @param lum    Float32Array of 0..1 luminance, row-major (cols × rows)
 * @param opts   { mode, sensitivity, minSize, maxBlobs, persist }
 *   sensitivity 0..1 — higher picks up more
 *   minSize     % of the frame area a blob must cover
 *   persist     false for static sources: no IDs carried between calls
 * @returns array of { id, x0, y0, x1, y1, cx, cy, area, alpha }
 *   in grid-cell units.
 */
export function trackBlobs(state, lum, cols, rows, opts) {
  const {
    mode = 'motion',
    sensitivity = 0.5,
    minSize = 0.5,
    maxBlobs = 6,
    persist = true,
  } = opts

  // Grid size changed (resolution slider, new source) — start over.
  if (state.cols !== cols || state.rows !== rows) {
    resetBlobTracker(state)
    state.cols = cols
    state.rows = rows
  }

  const n = cols * rows
  const mask = new Uint8Array(n)

  if (mode === 'motion') {
    if (!state.bg) {
      state.bg = Float32Array.from(lum)
      return []
    }
    const cut = 0.02 + 0.3 * (1 - sensitivity)
    const bg = state.bg
    for (let i = 0; i < n; i++) {
      if (Math.abs(lum[i] - bg[i]) > cut) mask[i] = 1
      bg[i] += (lum[i] - bg[i]) * BG_ADAPT
    }
  } else if (mode === 'bright') {
    const cut = 1 - 0.6 * sensitivity
    for (let i = 0; i < n; i++) if (lum[i] > cut) mask[i] = 1
  } else {
    const cut = 0.6 * sensitivity
    for (let i = 0; i < n; i++) if (lum[i] < cut) mask[i] = 1
  }

  // Motion masks are speckly; one dilation pass knits fragments together.
  const solid = mode === 'motion' ? dilate(mask, cols, rows) : mask

  // A moving object mostly changes along its edges, so motion splits it
  // into fragments. Merge fragments that sit close together before
  // applying the size filter.
  const minArea = Math.max(2, (minSize / 100) * n)
  let found = label(solid, cols, rows, 1)
  if (mode === 'motion') found = mergeNearby(found, Math.max(2, Math.round(cols * 0.05)))
  const blobs = found
    .filter((b) => b.area >= minArea)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxBlobs)

  if (!persist) {
    // Static image: number blobs in reading order so IDs are stable.
    return blobs
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
      .map((b, i) => ({ ...b, id: i + 1, alpha: 1 }))
  }

  return updateTracks(state, blobs, cols, rows)
}

// 3×3 dilation of a binary grid.
function dilate(src, cols, rows) {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!src[y * cols + x]) continue
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= rows) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < cols) out[yy * cols + xx] = 1
        }
      }
    }
  }
  return out
}

// Connected-component labelling (4-connected) with an explicit stack.
function label(mask, cols, rows, minArea) {
  const seen = new Uint8Array(mask.length)
  const stack = new Int32Array(mask.length)
  const blobs = []

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue

    let sp = 0
    stack[sp++] = start
    seen[start] = 1
    let area = 0, sx = 0, sy = 0
    let x0 = cols, y0 = rows, x1 = -1, y1 = -1

    while (sp) {
      const i = stack[--sp]
      const x = i % cols
      const y = (i - x) / cols
      area++
      sx += x
      sy += y
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y

      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1 }
      if (x < cols - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1 }
      if (y > 0 && mask[i - cols] && !seen[i - cols]) { seen[i - cols] = 1; stack[sp++] = i - cols }
      if (y < rows - 1 && mask[i + cols] && !seen[i + cols]) { seen[i + cols] = 1; stack[sp++] = i + cols }
    }

    if (area >= minArea) {
      blobs.push({ x0, y0, x1, y1, cx: sx / area, cy: sy / area, area })
    }
  }
  return blobs
}

// Merge blobs whose boxes come within `gap` cells of each other.
function mergeNearby(blobs, gap) {
  const list = blobs.slice()
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        if (
          a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 &&
          a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1
        ) {
          const area = a.area + b.area
          list[i] = {
            x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
            cx: (a.cx * a.area + b.cx * b.area) / area,
            cy: (a.cy * a.area + b.cy * b.area) / area,
            area,
          }
          list.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  return list
}

// Greedy nearest-centroid matching against velocity-predicted positions.
function updateTracks(state, blobs, cols, rows) {
  const maxDist = 0.2 * Math.hypot(cols, rows)
  const tracks = state.tracks

  const pairs = []
  for (let t = 0; t < tracks.length; t++) {
    const tr = tracks[t]
    const px = tr.cx + tr.vx
    const py = tr.cy + tr.vy
    for (let b = 0; b < blobs.length; b++) {
      const d = Math.hypot(blobs[b].cx - px, blobs[b].cy - py)
      if (d < maxDist) pairs.push({ t, b, d })
    }
  }
  pairs.sort((a, b) => a.d - b.d)

  const usedT = new Set()
  const usedB = new Set()
  for (const { t, b } of pairs) {
    if (usedT.has(t) || usedB.has(b)) continue
    usedT.add(t)
    usedB.add(b)
    const tr = tracks[t]
    const bl = blobs[b]
    const ncx = lerp(tr.cx, bl.cx, SMOOTH)
    const ncy = lerp(tr.cy, bl.cy, SMOOTH)
    tr.vx = lerp(tr.vx, ncx - tr.cx, 0.5)
    tr.vy = lerp(tr.vy, ncy - tr.cy, 0.5)
    tr.cx = ncx
    tr.cy = ncy
    tr.x0 = lerp(tr.x0, bl.x0, SMOOTH)
    tr.y0 = lerp(tr.y0, bl.y0, SMOOTH)
    tr.x1 = lerp(tr.x1, bl.x1, SMOOTH)
    tr.y1 = lerp(tr.y1, bl.y1, SMOOTH)
    tr.area = bl.area
    tr.hits++
    tr.missed = 0
  }

  // Unseen tracks coast on their velocity and fade out.
  for (let t = 0; t < tracks.length; t++) {
    if (usedT.has(t)) continue
    const tr = tracks[t]
    tr.missed++
    tr.vx *= 0.8
    tr.vy *= 0.8
    tr.cx += tr.vx; tr.x0 += tr.vx; tr.x1 += tr.vx
    tr.cy += tr.vy; tr.y0 += tr.vy; tr.y1 += tr.vy
  }

  // New detections become new tracks.
  for (let b = 0; b < blobs.length; b++) {
    if (usedB.has(b)) continue
    tracks.push({ ...blobs[b], id: state.nextId++, vx: 0, vy: 0, hits: 1, missed: 0 })
  }

  // Unconfirmed tracks are noise if they vanish; confirmed ones get a grace period.
  state.tracks = tracks.filter((tr) =>
    tr.hits >= MIN_HITS ? tr.missed <= MAX_MISSED : tr.missed === 0)

  return state.tracks
    .filter((tr) => tr.hits >= MIN_HITS)
    .map((tr) => ({
      id: tr.id,
      x0: tr.x0, y0: tr.y0, x1: tr.x1, y1: tr.y1,
      cx: tr.cx, cy: tr.cy, area: tr.area,
      alpha: tr.missed ? Math.max(0.15, 1 - tr.missed / MAX_MISSED) : 1,
    }))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Draw tracked blobs over an already-rendered ASCII canvas.
 * @param metrics { cellW, cellH, width } from renderToCanvas
 * @param opts    { color, links, bg, mode }
 */
export function drawBlobOverlay(ctx, blobs, metrics, opts) {
  const { cellW, cellH, width } = metrics
  const { color = '#e8481c', links = true, bg = '#12151c', mode = 'motion' } = opts
  const fontPx = Math.round(Math.min(13, Math.max(9, cellH * 1.1)))

  ctx.save()
  ctx.font = `600 ${fontPx}px "SF Mono", "Menlo", "Consolas", monospace`
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'miter'

  const px = (b) => ({
    x: b.x0 * cellW,
    y: b.y0 * cellH,
    w: (b.x1 - b.x0 + 1) * cellW,
    h: (b.y1 - b.y0 + 1) * cellH,
    cx: (b.cx + 0.5) * cellW,
    cy: (b.cy + 0.5) * cellH,
  })
  const boxes = blobs.map((b) => ({ b, r: px(b) }))

  // Links: each blob to its nearest neighbour, drawn once per pair.
  if (links && boxes.length > 1) {
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    const drawn = new Set()
    for (let i = 0; i < boxes.length; i++) {
      let best = -1, bestD = Infinity
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue
        const d = Math.hypot(boxes[i].r.cx - boxes[j].r.cx, boxes[i].r.cy - boxes[j].r.cy)
        if (d < bestD) { bestD = d; best = j }
      }
      const key = i < best ? `${i}-${best}` : `${best}-${i}`
      if (drawn.has(key)) continue
      drawn.add(key)
      ctx.globalAlpha = 0.55 * Math.min(boxes[i].b.alpha, boxes[best].b.alpha)
      ctx.beginPath()
      ctx.moveTo(boxes[i].r.cx, boxes[i].r.cy)
      ctx.lineTo(boxes[best].r.cx, boxes[best].r.cy)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  for (const { b, r } of boxes) {
    ctx.globalAlpha = b.alpha

    // Faint fill + hairline frame.
    ctx.fillStyle = color
    ctx.globalAlpha = 0.07 * b.alpha
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.globalAlpha = 0.6 * b.alpha
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    // Heavier corner brackets.
    ctx.globalAlpha = b.alpha
    ctx.lineWidth = 2
    const k = Math.max(4, Math.min(14, r.w / 4, r.h / 4))
    ctx.beginPath()
    corner(ctx, r.x, r.y, k, k)
    corner(ctx, r.x + r.w, r.y, -k, k)
    corner(ctx, r.x, r.y + r.h, k, -k)
    corner(ctx, r.x + r.w, r.y + r.h, -k, -k)
    ctx.stroke()

    // Centroid crosshair.
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(r.cx - 4, r.cy); ctx.lineTo(r.cx + 4, r.cy)
    ctx.moveTo(r.cx, r.cy - 4); ctx.lineTo(r.cx, r.cy + 4)
    ctx.stroke()

    // Tag: ID + centroid in grid coords. Sits above the box, or inside
    // when the box touches the top edge.
    const tag = `${String(b.id).padStart(2, '0')} ${Math.round(b.cx)},${Math.round(b.cy)}`
    const tw = ctx.measureText(tag).width + 8
    const th = fontPx + 4
    let tx = Math.min(r.x, width - tw)
    let ty = r.y - th
    if (ty < 0) ty = r.y
    tx = Math.max(0, tx)
    ctx.fillStyle = color
    ctx.fillRect(tx, ty, tw, th)
    ctx.fillStyle = bg
    ctx.fillText(tag, tx + 4, ty + 2)
  }

  // HUD readout, top-left.
  ctx.globalAlpha = 0.9
  const hud = `TRACK ${mode.toUpperCase()} · ${String(blobs.length).padStart(2, '0')}`
  const hw = ctx.measureText(hud).width + 10
  ctx.fillStyle = bg
  ctx.fillRect(6, 6, hw, fontPx + 6)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.strokeRect(6.5, 6.5, hw - 1, fontPx + 5)
  ctx.fillStyle = color
  ctx.fillText(hud, 11, 9)

  ctx.restore()
}

function corner(ctx, x, y, dx, dy) {
  ctx.moveTo(x + dx, y)
  ctx.lineTo(x, y)
  ctx.lineTo(x, y + dy)
}
