# ASCII Art Studio

Turn **images, your webcam, and video files** into ASCII text art, right in the
browser. Built with React + Vite.

![#](https://img.shields.io/badge/made%20with-canvas-5eead4)

## What it does

- **Image → ASCII** — drop in a photo, get a static ASCII rendering.
- **Webcam → ASCII** — live camera feed rendered as animated text art.
- **Video → ASCII** — play a local video file through the ASCII filter.

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

Export: **copy as text**, **save `.txt`**, or **save `.png`**.

## How it works

`src/asciiEngine.js` downsamples the source into a low-res grid via an offscreen
canvas, computes each cell's Rec. 601 luminance, and maps brightness to a
character from a dark→light ramp. A monospace aspect correction (`0.5`) keeps
proportions. `renderToCanvas` paints the glyphs (mono or per-cell color) onto a
display canvas, which doubles as the PNG export surface.

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
