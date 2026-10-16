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
//      a motion vector per block (where did this block come from?)
//   2. pull cells from the *moshed* buffer along those vectors instead of
//      from the real previous frame
//   3. optionally let the real frame "bleed" through: blocks whose motion
//      the vectors can't explain (a codec's residual), plus a slow random
//      heal of blocks that look wrong, so the picture reassembles over time
// A keyframe (manual or on a timer) snaps back to the clean image.

// Search window, in cells, for block matching.
const SEARCH = 3
// Slight preference for "no motion" so flat areas don't jitter.
const ZERO_BIAS = 0.92
// Per-frame heal chance for a wrong-looking block at bleed = 1.
const HEAL_RATE = 0.15

export function createMosh() {
  return { prevLum: null, cells: null, lum: null, cols: 0, rows: 0 }
}

export function resetMosh(state) {
  Object.assign(state, createMosh())
}

/**
 * Mosh one frame.
 * @param state   from createMosh()
 * @param result  output of imageToAscii for the live frame
 * @param opts    { block, smear, bleed, keyframe }
 *   block    block size in cells (2..8)
 *   smear    vector multiplier (1 = faithful, higher = more violent)
 *   bleed    0..1, how readily changed blocks let the real frame through
 *   keyframe true to snap back to the clean frame this call
 * @returns a result-shaped object ({ text, cells, lum, cols, rows })
 */
export function moshFrame(state, result, opts) {
  const { block = 4, smear = 1, bleed = 0.15, keyframe = false } = opts
  const { cells, lum, cols, rows } = result

  if (keyframe || !state.cells || state.cols !== cols || state.rows !== rows) {
    state.cells = cells.slice()
    state.lum = Float32Array.from(lum)
    state.prevLum = Float32Array.from(lum)
    state.cols = cols
    state.rows = rows
    return result
  }

  const prev = state.prevLum
  const mosh = state.cells
  const moshLum = state.lum
  const out = new Array(cols * rows)
  const outLum = new Float32Array(cols * rows)
  // bleed 0 = pure smear, never refresh; higher = refresh on smaller errors.
  const refreshAt = bleed > 0 ? 0.02 + (1 - bleed) * 0.28 : Infinity
  const healChance = bleed * bleed * HEAL_RATE

  for (let by = 0; by < rows; by += block) {
    const bh = Math.min(block, rows - by)
    for (let bx = 0; bx < cols; bx += block) {
      const bw = Math.min(block, cols - bx)

      // Find where this block came from in the previous live frame.
      let bestDx = 0, bestDy = 0
      let best = sad(lum, prev, cols, rows, bx, by, bw, bh, 0, 0) * ZERO_BIAS
      for (let dy = -SEARCH; dy <= SEARCH; dy++) {
        for (let dx = -SEARCH; dx <= SEARCH; dx++) {
          if (!dx && !dy) continue
          const e = sad(lum, prev, cols, rows, bx, by, bw, bh, dx, dy)
          if (e < best) { best = e; bestDx = dx; bestDy = dy }
        }
      }

      const err = best / (bw * bh)
      const sx = Math.round(bestDx * smear)
      const sy = Math.round(bestDy * smear)

      let refresh = err > refreshAt
      if (!refresh && healChance > 0 && Math.random() < healChance) {
        // Only heal blocks where the mosh visibly differs from reality.
        refresh = sad(lum, moshLum, cols, rows, bx, by, bw, bh, sx, sy) / (bw * bh) > 0.05
      }

      // Apply the vector to the stale moshed image (or bleed the real one).
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const i = y * cols + x
          if (refresh) {
            out[i] = cells[i]
            outLum[i] = lum[i]
          } else {
            const j = clamp(y + sy, 0, rows - 1) * cols + clamp(x + sx, 0, cols - 1)
            out[i] = mosh[j]
            outLum[i] = moshLum[j]
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
  return { text, cells: out, lum: outLum, cols, rows }
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
