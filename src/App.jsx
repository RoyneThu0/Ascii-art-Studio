import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAR_SETS, imageToAscii, renderToCanvas } from './asciiEngine'
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
  invert: false,
  color: false,
  brightness: 1,
  contrast: 1,
  fg: '#c8d0d8',
  bg: '#12151c',
}

export default function App() {
  const [mode, setMode] = useState('image') // 'image' | 'webcam' | 'video'
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [source, setSource] = useState(null) // { el } drawable element
  const [status, setStatus] = useState('Load an image, webcam, or video to begin.')

  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const lastText = useRef('')
  const rafRef = useRef(0)

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Render one frame from the current source.
  const renderFrame = useCallback(() => {
    const el = source?.el
    const canvas = canvasRef.current
    if (!el || !canvas) return
    const s = settingsRef.current
    // Webcam is shown mirrored, like a selfie view.
    const result = imageToAscii(el, { ...s, mirror: mode === 'webcam' })
    if (!result) return
    lastText.current = result.text

    // Fill the stage: glyphs are sized to the available box each frame.
    const box = stageRef.current?.getBoundingClientRect()
    const fit = box ? { w: box.width - 28, h: box.height - 28 } : null
    renderToCanvas(canvas, result, { ...s, fit })
  }, [source, mode])

  // Static sources (image) render on demand; live sources loop.
  const isLive = mode === 'webcam' || mode === 'video'

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
              className="output"
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
