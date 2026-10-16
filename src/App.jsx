import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAR_SETS, DITHERS, imageToAscii, renderToCanvas } from './asciiEngine'
import {
  BLOB_MODES,
  createBlobTracker,
  drawBlobOverlay,
  resetBlobTracker,
  trackBlobs,
} from './blobTracker'
import { createMosh, moshFrame, resetMosh } from './datamosh'
import { INK, PAPER, drawReceipt, receiptChrome, receiptText } from './receipt'
import { PHOSPHORS, drawCRT } from './crt'
import Controls from './components/Controls.jsx'
import SourcePanel from './components/SourcePanel.jsx'

const MODES = [
  { id: 'image', icon: '▣' },
  { id: 'webcam', icon: '◉' },
  { id: 'video', icon: '▶' },
]

const DEFAULT_SETTINGS = {
  cols: 140,
  charSet: 'standard',
  dither: 'off',
  solidDither: true,
  invert: false,
  color: false,
  autoLevels: true,
  brightness: 1,
  contrast: 1,
  fg: '#c8d0d8',
  bg: '#12151c',
  // Blob tracking overlay
  blobs: false,
  blobMode: 'motion',
  blobSensitivity: 0.5,
  blobMinSize: 0.5, // % of frame area
  blobMax: 6,
  blobLinks: true,
  blobColor: '#e8481c',
  // Datamosh
  mosh: false,
  moshBlock: 4,
  moshSmear: 1,
  moshBleed: 0.15,
  moshKeyframe: 0, // seconds between auto keyframes, 0 = never
  // Look: how the finished render is framed
  look: 'none', // 'none' | 'receipt' | 'crt'
  receiptTitle: 'ASCII MARKET',
  receiptCurrency: '¥',
  crtCurve: 0.12,
  crtScanlines: 0.5,
  crtGlow: 0.5,
  crtPhosphor: 'off', // 'off' | 'green' | 'amber'
}

const LOOKS = ['none', 'receipt', 'crt']

export default function App() {
  const [mode, setMode] = useState('image') // 'image' | 'webcam' | 'video'
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [source, setSource] = useState(null) // { el } drawable element
  const [status, setStatus] = useState('Load an image, webcam, or video to begin.')
  const [flash, setFlash] = useState(false)

  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const lastText = useRef('')
  const rafRef = useRef(0)
  const trackerRef = useRef(createBlobTracker())
  const levelsRef = useRef({}) // smoothed auto-levels limits for live sources
  const moshRef = useRef(createMosh())
  const artCanvasRef = useRef(null) // offscreen art layer for framed looks
  const keyframeRef = useRef({ pending: false, last: 0 })

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Render one frame from the current source.
  const renderFrame = useCallback(() => {
    const el = source?.el
    const canvas = canvasRef.current
    if (!el || !canvas) return
    const s = settingsRef.current
    // Webcam is shown mirrored, like a selfie view.
    const receipt = s.look === 'receipt'
    const raw = imageToAscii(el, {
      ...s,
      mirror: mode === 'webcam',
      levels: mode === 'image' ? undefined : levelsRef.current,
      // Receipts print portrait, dark ink on light paper — the glyph ramp is
      // tuned for light-on-dark, so flip it to keep the photo positive.
      aspect: receipt ? 4 / 5 : 0,
      invert: receipt ? !s.invert : s.invert,
    })
    if (!raw) return

    // Datamosh needs motion between frames, so it only runs on live sources.
    let result = raw
    if (s.mosh && mode !== 'image') {
      const kf = keyframeRef.current
      const now = performance.now()
      const due = s.moshKeyframe > 0 && now - kf.last >= s.moshKeyframe * 1000
      const keyframe = kf.pending || due
      if (keyframe) { kf.pending = false; kf.last = now }
      result = moshFrame(moshRef.current, raw, {
        block: s.moshBlock,
        smear: s.moshSmear,
        bleed: s.moshBleed,
        keyframe,
      })
    }
    lastText.current = result.text

    // Fill the stage: glyphs are sized to the available box each frame.
    const box = stageRef.current?.getBoundingClientRect()
    let fit = box ? { w: box.width - 28, h: box.height - 28 } : null

    // Framed looks render the art to an offscreen layer, then compose.
    let target = canvas
    let renderOpts = { ...s, fit }
    if (receipt) {
      const chrome = receiptChrome()
      if (fit) {
        fit = {
          w: Math.max(40, fit.w - chrome.padX * 2),
          h: Math.max(40, fit.h - chrome.header - chrome.footer),
        }
      }
      if (!artCanvasRef.current) artCanvasRef.current = document.createElement('canvas')
      target = artCanvasRef.current
      // Thermal paper: one ink, no color.
      renderOpts = { ...s, fit, color: false, fg: INK, bg: PAPER }
    } else if (s.look === 'crt') {
      if (!artCanvasRef.current) artCanvasRef.current = document.createElement('canvas')
      target = artCanvasRef.current
      const tint = PHOSPHORS[s.crtPhosphor]
      if (tint) renderOpts = { ...s, fit, color: false, fg: tint.fg, bg: tint.bg }
    }
    const metrics = renderToCanvas(target, result, renderOpts)

    if (s.blobs) {
      const live = mode !== 'image'
      // Motion needs successive frames, so stills fall back to brightness.
      const blobMode = !live && s.blobMode === 'motion' ? 'bright' : s.blobMode
      const blobs = trackBlobs(trackerRef.current, raw.lum, raw.cols, raw.rows, {
        mode: blobMode,
        sensitivity: s.blobSensitivity,
        minSize: s.blobMinSize,
        maxBlobs: s.blobMax,
        persist: live,
      })
      drawBlobOverlay(metrics.ctx, blobs, metrics, {
        color: s.blobColor,
        links: s.blobLinks,
        bg: renderOpts.bg,
        mode: blobMode,
      })
    }

    if (receipt) {
      const ticket = {
        title: s.receiptTitle || 'ASCII MARKET',
        currency: s.receiptCurrency,
        cols: result.cols,
        rows: result.rows,
      }
      drawReceipt(canvas, target, metrics, ticket)
      lastText.current = receiptText(result.text, ticket)
    } else if (s.look === 'crt') {
      drawCRT(canvas, target, {
        curve: s.crtCurve,
        scanlines: s.crtScanlines,
        glow: s.crtGlow,
        flicker: mode !== 'image',
      })
    }
  }, [source, mode])

  // Static sources (image) render on demand; live sources loop.
  const isLive = mode === 'webcam' || mode === 'video'

  // Fresh tracks (and motion background) whenever the input or detector changes.
  useEffect(() => {
    resetBlobTracker(trackerRef.current)
  }, [source, mode, settings.blobs, settings.blobMode])

  useEffect(() => {
    levelsRef.current = {}
  }, [source, mode])

  useEffect(() => {
    resetMosh(moshRef.current)
    keyframeRef.current.last = performance.now()
  }, [source, mode, settings.mosh])

  // Snap back to a clean frame on the next render.
  const dropKeyframe = () => {
    keyframeRef.current.pending = true
  }

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!source) return

    if (isLive) {
      const loop = () => {
        renderFrame()
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(rafRef.current)
    }
    renderFrame()
  }, [source, isLive, renderFrame])

  // Re-render static source when settings change.
  useEffect(() => {
    if (source && !isLive) renderFrame()
  }, [settings, source, isLive, renderFrame])

  // Static sources also need a redraw when the stage size changes.
  useEffect(() => {
    if (!source || isLive) return
    const onResize = () => renderFrame()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [source, isLive, renderFrame])

  const copyText = async () => {
    if (!lastText.current) return
    await navigator.clipboard.writeText(lastText.current)
    setStatus('Copied ASCII text to clipboard.')
  }

  const downloadText = () => {
    if (!lastText.current) return
    downloadBlob(new Blob([lastText.current], { type: 'text/plain' }), 'ascii.txt')
  }

  // Shutter: grab the exact frame on screen and save it as a PNG.
  // The live loop keeps redrawing, and toBlob() encodes asynchronously, so the
  // frame is copied to an offscreen canvas synchronously first.
  const takePhoto = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const shot = document.createElement('canvas')
    shot.width = canvas.width
    shot.height = canvas.height
    shot.getContext('2d').drawImage(canvas, 0, 0)

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    shot.toBlob((blob) => blob && downloadBlob(blob, `ascii-photo-${stamp}.png`), 'image/png')

    setFlash(true)
    setTimeout(() => setFlash(false), 180)
    setStatus(`Photo saved — ascii-photo-${stamp}.png`)
  }

  const downloadPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => blob && downloadBlob(blob, 'ascii.png'), 'image/png')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">#</span>
          <div>
            <h1>ASCII Art Studio</h1>
          </div>
        </div>

        <nav className="modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? 'mode active' : 'mode'}
              onClick={() => {
                setSource(null)
                lastText.current = ''
                setMode(m.id)
              }}
            >
              <span className="mode-icon" aria-hidden>{m.icon}</span>
              {m.id}
            </button>
          ))}
        </nav>

        <div className="topbar-right" />
      </header>

      <main className="layout">
        <aside className="sidebar">
          <Controls
            settings={settings}
            setSettings={setSettings}
            charSets={Object.keys(CHAR_SETS)}
            blobModes={BLOB_MODES}
            isLive={isLive}
            onKeyframe={dropKeyframe}
            looks={LOOKS}
            dithers={DITHERS}
          />
          <div className="exports">
            <button onClick={copyText}>Copy text</button>
            <button onClick={downloadText}>Save .txt</button>
            <button onClick={downloadPng}>Save .png</button>
          </div>
        </aside>

        <section className="stage">
          <div className="stage-inner" ref={stageRef}>
            {mode === 'webcam' && source && (
              <div className="live-badge">
                <span className="live-dot on" />
                live
              </div>
            )}

            <canvas
              ref={canvasRef}
              className={`output look-${settings.look}`}
              style={{ display: source ? 'block' : 'none' }}
            />

            {/* Source picker lives in the centre of the stage; kept mounted
                (hidden) once a source is loaded so its media elements survive. */}
            <div
              className="stage-source"
              style={{ display: source ? 'none' : 'flex' }}
            >
              <SourcePanel mode={mode} onSource={setSource} onStatus={setStatus} />
            </div>

            {mode === 'webcam' && source && (
              <button className="shutter" onClick={takePhoto} title="Take photo">
                <span className="shutter-ring" />
                take photo
              </button>
            )}

            {flash && <div className="flash" />}
          </div>
          <div className="status">{status}</div>
        </section>
      </main>
    </div>
  )
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
