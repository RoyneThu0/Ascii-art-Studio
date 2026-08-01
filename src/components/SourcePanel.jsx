import { useEffect, useRef, useState } from 'react'

// Handles acquiring the drawable source for each mode and reports it up
// via onSource({ el }). Keeps hidden <img>/<video> elements alive.
export default function SourcePanel({ mode, onSource, onStatus }) {
  const imgRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [fileName, setFileName] = useState('')

  // Tear down webcam stream when leaving webcam mode / unmounting.
  useEffect(() => {
    return () => stopStream(streamRef)
  }, [])

  useEffect(() => {
    if (mode !== 'webcam') stopStream(streamRef)
    setFileName('')
    onSource(null)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleImage = (file) => {
    if (!file) return
    const img = imgRef.current
    img.onload = () => {
      onSource({ el: img })
      onStatus(`Image loaded — ${img.naturalWidth}×${img.naturalHeight}px.`)
    }
    img.src = URL.createObjectURL(file)
    setFileName(file.name)
  }

  const handleVideoFile = (file) => {
    if (!file) return
    const v = videoRef.current
    v.srcObject = null
    v.src = URL.createObjectURL(file)
    v.loop = true
    v.muted = true
    v.play().then(() => {
      onSource({ el: v })
      onStatus(`Playing ${file.name}`)
    })
    setFileName(file.name)
  }

  const startWebcam = async () => {
    try {
      onStatus('Requesting camera…')
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      const v = videoRef.current
      v.src = ''
      v.srcObject = stream
      v.muted = true
      await v.play()
      onSource({ el: v })
      onStatus('Webcam live.')
    } catch (err) {
      onStatus(`Camera error: ${err.message}`)
    }
  }

  return (
    <div className="panel source">
      <h2>Source</h2>

      {mode === 'image' && (
        <label className="dropzone">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleImage(e.target.files[0])}
          />
          <span>{fileName || 'Choose an image…'}</span>
        </label>
      )}

      {mode === 'video' && (
        <label className="dropzone">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => handleVideoFile(e.target.files[0])}
          />
          <span>{fileName || 'Choose a video…'}</span>
        </label>
      )}

      {mode === 'webcam' && (
        <button className="primary" onClick={startWebcam}>
          Start webcam
        </button>
      )}

      {/* Hidden working elements */}
      <img ref={imgRef} alt="" style={{ display: 'none' }} />
      <video ref={videoRef} playsInline style={{ display: 'none' }} />
    </div>
  )
}

function stopStream(ref) {
  if (ref.current) {
    ref.current.getTracks().forEach((t) => t.stop())
    ref.current = null
  }
}
