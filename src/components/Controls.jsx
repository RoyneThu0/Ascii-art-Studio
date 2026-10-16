// Tunable settings for the ASCII conversion & rendering.
export default function Controls({
  settings, setSettings, charSets, blobModes, isLive, onKeyframe, looks,
}) {
  const set = (key) => (e) => {
    const t = e.target
    const value =
      t.type === 'checkbox' ? t.checked
      : t.type === 'range' || t.type === 'number' ? Number(t.value)
      : t.value
    setSettings((s) => ({ ...s, [key]: value }))
  }

  return (
    <div className="panel controls">
      <h2>Settings</h2>

      <Field label={`Resolution — ${settings.cols} cols`}>
        <input type="range" min="40" max="320" step="2"
          value={settings.cols} onChange={set('cols')} />
      </Field>

      <Field label="Character set">
        <select value={settings.charSet} onChange={set('charSet')}>
          {charSets.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>

      <Field label="Look">
        <select value={settings.look} onChange={set('look')}>
          {looks.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>

      {settings.look === 'receipt' && (
        <div className="row">
          <Field label="Store name">
            <input type="text" maxLength={24} value={settings.receiptTitle}
              onChange={set('receiptTitle')} />
          </Field>
          <Field label="Currency">
            <input type="text" maxLength={4} value={settings.receiptCurrency}
              onChange={set('receiptCurrency')} className="short" />
          </Field>
        </div>
      )}

      <Field label={`Brightness — ${settings.brightness.toFixed(2)}`}>
        <input type="range" min="0.2" max="2" step="0.05"
          value={settings.brightness} onChange={set('brightness')} />
      </Field>

      <Field label={`Contrast — ${settings.contrast.toFixed(2)}`}>
        <input type="range" min="0.2" max="3" step="0.05"
          value={settings.contrast} onChange={set('contrast')} />
      </Field>

      <div className="row">
        <label className="check">
          <input type="checkbox" checked={settings.invert} onChange={set('invert')} />
          Invert
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.color} onChange={set('color')} />
          Color
        </label>
      </div>

      <div className="row">
        <Field label="Text">
          <input type="color" value={settings.fg} onChange={set('fg')}
            disabled={settings.color} />
        </Field>
        <Field label="Background">
          <input type="color" value={settings.bg} onChange={set('bg')} />
        </Field>
      </div>

      <div className="subsection">
        <label className="check toggle">
          <input type="checkbox" checked={settings.blobs} onChange={set('blobs')} />
          Blob tracking
        </label>

        {settings.blobs && (
          <div className="subsection-body">
            <Field label="Detect">
              <select value={settings.blobMode} onChange={set('blobMode')}>
                {blobModes.map((m) => (
                  <option key={m} value={m} disabled={m === 'motion' && !isLive}>
                    {m}
                  </option>
                ))}
              </select>
              {!isLive && settings.blobMode === 'motion' && (
                <span className="hint">Motion needs webcam or video — using bright.</span>
              )}
            </Field>

            <Field label={`Sensitivity — ${settings.blobSensitivity.toFixed(2)}`}>
              <input type="range" min="0.05" max="1" step="0.05"
                value={settings.blobSensitivity} onChange={set('blobSensitivity')} />
            </Field>

            <Field label={`Min size — ${settings.blobMinSize.toFixed(1)}% of frame`}>
              <input type="range" min="0.1" max="10" step="0.1"
                value={settings.blobMinSize} onChange={set('blobMinSize')} />
            </Field>

            <Field label={`Max blobs — ${settings.blobMax}`}>
              <input type="range" min="1" max="16" step="1"
                value={settings.blobMax} onChange={set('blobMax')} />
            </Field>

            <div className="row">
              <label className="check">
                <input type="checkbox" checked={settings.blobLinks} onChange={set('blobLinks')} />
                Links
              </label>
              <Field label="Box">
                <input type="color" value={settings.blobColor} onChange={set('blobColor')} />
              </Field>
            </div>
          </div>
        )}
      </div>

      <div className="subsection">
        <label className="check toggle">
          <input type="checkbox" checked={settings.mosh} onChange={set('mosh')} />
          Datamosh
        </label>

        {settings.mosh && (
          <div className="subsection-body">
            {!isLive && (
              <span className="hint first">Needs motion — switch to webcam or video.</span>
            )}

            <Field label={`Block — ${settings.moshBlock} cells`}>
              <input type="range" min="2" max="8" step="1"
                value={settings.moshBlock} onChange={set('moshBlock')} />
            </Field>

            <Field label={`Smear — ${settings.moshSmear.toFixed(1)}×`}>
              <input type="range" min="1" max="3" step="0.5"
                value={settings.moshSmear} onChange={set('moshSmear')} />
            </Field>

            <Field label={`Bleed — ${settings.moshBleed.toFixed(2)}`}>
              <input type="range" min="0" max="1" step="0.05"
                value={settings.moshBleed} onChange={set('moshBleed')} />
            </Field>

            <Field label={`Auto keyframe — ${settings.moshKeyframe ? settings.moshKeyframe + 's' : 'off'}`}>
              <input type="range" min="0" max="10" step="1"
                value={settings.moshKeyframe} onChange={set('moshKeyframe')} />
            </Field>

            <button type="button" className="ghost" onClick={onKeyframe} disabled={!isLive}>
              Drop keyframe
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}
