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

Everything runs client-side; nothing is uploaded.

## Controls

| Setting | Effect |
| --- | --- |
| Resolution | How many character columns wide (detail vs. size) |
| Character set | `standard`, `detailed`, `blocks`, `binary`, `scramble`, … |
| Font size | Rendered glyph size |
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

Export: **copy as text**, **save `.txt`**, or **save `.png`**.

## How it works

`src/asciiEngine.js` downsamples the source into a low-res grid via an offscreen
canvas, computes each cell's Rec. 601 luminance, and maps brightness to a
character from a dark→light ramp. A monospace aspect correction (`0.5`) keeps
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
