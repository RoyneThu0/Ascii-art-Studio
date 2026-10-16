// ── Datamosh ─────────────────────────────────────────────────────
// Recreates the "dropped keyframe" glitch from compressed video.
//
// A codec stores most frames as motion vectors: "this block came from
// over there in the previous frame". If the keyframe is lost, those
// vectors get applied to whatever stale image is still on screen, so the
// old picture smears and melts along with the new motion.
//
// Here the same thing happens on the ASCII grid:
//   1. block-match the live frame against the previous live frame to get
//      a motion vector per block, and drop lone vectors no neighbour agrees
//      with, so noisy matches don't scramble flat areas
//   2. hold each block's vector and let it decay slowly ("melt"), so the
//      stale image keeps flowing after the motion that started it
//   3. pull cells from the *moshed* buffer along the held vectors, with
//      sub-cell movement carried over between frames; cells pulled from
//      outside the frame come from the live image, like new content
//      sliding in
//   4. optionally let the real frame "bleed" through: blocks whose motion
//      the vectors can't explain (a codec's residual), plus a slow random
//      heal of blocks that look wrong
// A keyframe (manual or on a timer) snaps back to the clean image.

// Search window, in cells, for block matching.
const SEARCH = 3
// A non-zero vector must beat "no motion" by this factor to count.
const MATCH_GAIN = 0.8
// Blocks changing less than this (mean abs luminance) are treated as still.
const STILL = 0.02
// Per-frame heal chance for a wrong-looking block at bleed = 1.
const HEAL_RATE = 0.15

export function createMosh() {
  return {
    prevLum: null, cells: null, lum: null, cols: 0, rows: 0, block: 0,
    hx: null, hy: null, ax: null, ay: null, last: null,
  }
}

export function resetMosh(state) {
  Object.assign(state, createMosh())
}

/**
 * Mosh one frame.
 * @param state   from createMosh()
 * @param result  output of imageToAscii for the live frame
 * @param opts    { block, smear, bleed, melt, keyframe }
 *   block    block size in cells (2..8)
 *   smear    vector multiplier (1 = faithful, higher = more violent)
 *   bleed    0..1, how readily the real frame leaks back through
 *   melt     0..0.98, how long a block keeps moving after its motion stops
 *   keyframe true to snap back to the clean frame this call
 * @returns a result-shaped object ({ text, cells, lum, cols, rows })
 */
export function moshFrame(state, result, opts) {
  const { block = 4, smear = 1, bleed = 0.1, melt = 0.9, keyframe = false } = opts
  const { cells, lum, cols, rows } = result
  const bxN = Math.ceil(cols / block)
  const byN = Math.ceil(rows / block)
  const nb = bxN * byN

  if (
    keyframe || !state.cells || state.cols !== cols || state.rows !== rows || state.block !== block
  ) {
    Object.assign(state, {
      cells: cells.slice(),
      lum: Float32Array.from(lum),
      prevLum: Float32Array.from(lum),
      cols, rows, block,
      hx: new Float32Array(nb), hy: new Float32Array(nb),
      ax: new Float32Array(nb), ay: new Float32Array(nb),
      last: result,
    })
    return result
  }

  // Video decodes at 24–30fps but we render at display rate. A repeated
  // frame carries no new motion, so re-show the last moshed frame. After a
  // few repeats the source has genuinely stopped (paused video, still
  // scene), so carry on and let held vectors keep melting.
  if (sameFrame(lum, state.prevLum)) {
    state.repeats = (state.repeats || 0) + 1
    if (state.repeats < 4) return state.last
  } else {
    state.repeats = 0
  }

  const prev = state.prevLum

  // 1. Measure a vector per block.
  const mx = new Float32Array(nb)
  const my = new Float32Array(nb)
  const errs = new Float32Array(nb)
  for (let j = 0; j < byN; j++) {
    const by = j * block
    const bh = Math.min(block, rows - by)
    for (let i = 0; i < bxN; i++) {
      const bx = i * block
      const bw = Math.min(block, cols - bx)
      const n = bw * bh
      const zero = sad(lum, prev, cols, rows, bx, by, bw, bh, 0, 0)
      let best = zero, bdx = 0, bdy = 0
      if (zero / n > STILL) {
        for (let dy = -SEARCH; dy <= SEARCH; dy++) {
          for (let dx = -SEARCH; dx <= SEARCH; dx++) {
            if (!dx && !dy) continue
            const e = sad(lum, prev, cols, rows, bx, by, bw, bh, dx, dy)
            if (e < best) { best = e; bdx = dx; bdy = dy }
          }
        }
        if (best > zero * MATCH_GAIN) { best = zero; bdx = 0; bdy = 0 }
      }
      const k = j * bxN + i
      mx[k] = bdx
      my[k] = bdy
      errs[k] = best / n
    }
  }
  const [fx, fy] = denoise(mx, my, bxN, byN)

  // 2. Hold: new motion replaces a block's vector; where nothing moves, the
  // old vector keeps going and decays by `melt` each frame.
  const { hx, hy, ax, ay } = state
  for (let k = 0; k < nb; k++) {
    if (fx[k] || fy[k]) {
      hx[k] = fx[k]; hy[k] = fy[k]
    } else {
      hx[k] *= melt; hy[k] *= melt
      if (Math.abs(hx[k]) < 0.05) hx[k] = 0
      if (Math.abs(hy[k]) < 0.05) hy[k] = 0
    }
  }

  // 3–4. Move the stale image along the held vectors, with optional bleed.
  const mosh = state.cells
  const moshLum = state.lum
  const out = new Array(cols * rows)
  const outLum = new Float32Array(cols * rows)
  // bleed 0 = pure smear, never refresh; higher = refresh on smaller errors.
  const refreshAt = bleed > 0 ? 0.03 + (1 - bleed) * 0.3 : Infinity
  const healChance = bleed * bleed * HEAL_RATE

  for (let j = 0; j < byN; j++) {
    const by = j * block
    const bh = Math.min(block, rows - by)
    for (let i = 0; i < bxN; i++) {
      const bx = i * block
      const bw = Math.min(block, cols - bx)
      const k = j * bxN + i

      // Sub-cell movement accumulates until it adds up to a whole cell.
      ax[k] += hx[k] * smear
      ay[k] += hy[k] * smear
      const sx = Math.trunc(ax[k])
      const sy = Math.trunc(ay[k])
      ax[k] -= sx
      ay[k] -= sy

      let refresh = errs[k] > refreshAt
      if (!refresh && healChance > 0 && Math.random() < healChance) {
        // Only heal blocks where the mosh visibly differs from reality.
        refresh = sad(lum, moshLum, cols, rows, bx, by, bw, bh, 0, 0) / (bw * bh) > 0.05
      }

      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const i2 = y * cols + x
          const px = x + sx
          const py = y + sy
          if (refresh || px < 0 || py < 0 || px >= cols || py >= rows) {
            out[i2] = cells[i2]
            outLum[i2] = lum[i2]
          } else {
            const src = py * cols + px
            out[i2] = mosh[src]
            outLum[i2] = moshLum[src]
          }
        }
      }
    }
  }

  state.cells = out
  state.lum = outLum
  state.prevLum = Float32Array.from(lum)

  let text = ''
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) text += out[y * cols + x].char
    text += '\n'
  }
  state.last = { text, cells: out, lum: outLum, cols, rows }
  return state.last
}

function sameFrame(a, b) {
  // Exits at the first difference, so real frames cost almost nothing.
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-4) return false
  return true
}

// Real motion is spatially coherent: a moving object's edge spans several
// blocks heading the same way. Keep a block's vector only if at least one
// of its 8 neighbours has a similar one (within a cell on each axis).
// Unlike a median, this keeps the thin edges of small moving objects.
function denoise(vx, vy, w, h) {
  const ox = new Float32Array(vx.length)
  const oy = new Float32Array(vy.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (!vx[k] && !vy[k]) continue
      let agree = false
      for (let dy = -1; dy <= 1 && !agree; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if ((!dx && !dy) || xx < 0 || xx >= w) continue
          const n = yy * w + xx
          if ((vx[n] || vy[n]) && Math.abs(vx[n] - vx[k]) <= 1 && Math.abs(vy[n] - vy[k]) <= 1) {
            agree = true
            break
          }
        }
      }
      if (agree) { ox[k] = vx[k]; oy[k] = vy[k] }
    }
  }
  return [ox, oy]
}

// Sum of absolute luminance differences between the current block and the
// previous frame's block offset by (dx, dy). Out-of-bounds samples clamp.
function sad(cur, prev, cols, rows, bx, by, bw, bh, dx, dy) {
  let s = 0
  for (let y = by; y < by + bh; y++) {
    const py = clamp(y + dy, 0, rows - 1) * cols
    const row = y * cols
    for (let x = bx; x < bx + bw; x++) {
      s += Math.abs(cur[row + x] - prev[py + clamp(x + dx, 0, cols - 1)])
    }
  }
  return s
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
