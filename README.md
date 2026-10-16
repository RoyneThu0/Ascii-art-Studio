# ASCII Art Studio

Turn **images, your webcam, and video files** into ASCII text art, right in the
browser. Built with React + Vite.

![#](https://img.shields.io/badge/made%20with-canvas-5eead4)

## What it does

- **Image → ASCII** — drop in a photo, get a static ASCII rendering.
- **Webcam → ASCII** — live camera feed rendered as animated text art.
- **Video → ASCII** — play a local video file through the ASCII filter.
- **Blob tracking** — detect moving, bright or dark regions and follow them
  with persistent IDs, drawn as a technical overlay (boxes, corner brackets,
  centroid tags, nearest-neighbour links). It's baked into photos and `.png`
  exports.
- **Datamosh** — the dropped-keyframe glitch: motion vectors from the live feed
  are applied to a stale frame, so the old picture smears along with the new
  motion until a keyframe snaps it back.
- **Receipt ticket** — prints the art onto a thermal receipt: torn paper
  edges, store name and barcode, date and check number, and a totals footer.
  Crops to portrait; the store name and currency are editable, and `.txt`
  exports get a plain-text receipt too.
- **CRT** — behind old tube glass: barrel curvature, phosphor bloom,
  scanlines, an RGB aperture grille, vignette and glare, with optional green or
  amber phosphor.
- **1-bit dither** — quantize to fully inked or blank cells with
  Floyd–Steinberg, Atkinson or Bayer before glyphs are picked. Pair it with
  the `blocks` set for true pixels, or the receipt for a halftone print.

Everything runs client-side; nothing is uploaded.

## Controls

| Setting | Effect |
| --- | --- |
| Resolution | How many character columns wide (detail vs. size) |
| Character set | `standard`, `detailed`, `blocks`, `binary`, `scramble`, … |
| 1-bit dither | `off`, `floyd-steinberg`, `atkinson`, `bayer` |
| Font size | Rendered glyph size |
| Auto levels | Stretch each frame's brightness to the full range (on by default) |
| Brightness / Contrast | Tone-map the source before mapping to glyphs |
| Invert | Swap dark/light mapping (for dark vs. light backgrounds) |
| Color | Keep the source's per-cell color instead of a single ink color |
| Text / Background | Colors for mono mode |
| Blob tracking | Toggle the tracking overlay |
| Detect | `motion` (webcam/video), `bright` or `dark` |
| Sensitivity | Higher picks up fainter motion / more of the tonal range |
| Min size | Smallest blob kept, as % of the frame |
| Max blobs | Cap on tracked blobs (largest first) |
| Links / Box | Toggle connecting lines; overlay color |
| Look | `none`, `receipt` (thermal ticket) or `crt` (tube screen) |
| Store name / Currency | Receipt header and totals |
| Phosphor / Curvature / Scanlines / Glow | CRT tint and tube settings |
| Datamosh | Toggle the mosh (webcam/video) |
| Block / Smear | Motion block size; vector multiplier for a more violent smear |
| Bleed | How readily the real frame leaks back through |
| Auto keyframe / Drop keyframe | Snap back to a clean frame on a timer or on demand |

Export: **copy as text**, **save `.txt`**, or **save `.png`**.

## How it works

`src/asciiEngine.js` downsamples the source into a low-res grid via an offscreen
canvas, computes each cell's Rec. 601 luminance, and maps brightness to a
character by how much ink it actually puts down (each glyph's coverage is
measured once, so mid-tones land on mid-density glyphs). A monospace aspect correction (`0.5`) keeps
proportions. `renderToCanvas` paints the glyphs (mono or per-cell color) onto a
display canvas, which doubles as the PNG export surface.

`src/blobTracker.js` reuses that same luminance grid. It builds a mask
(difference from a running background for motion, or a brightness cutoff),
labels connected regions, merges nearby motion fragments, then matches blobs to
existing tracks by velocity-predicted centroid so IDs persist. Lost tracks coast
and fade for a few frames before being dropped.

## Run

```bash
npm install
npm run dev
```

Then open the printed local URL.

## Build

```bash
npm run build
npm run preview
```
