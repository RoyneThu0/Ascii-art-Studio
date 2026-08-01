// Tunable settings for the ASCII conversion & rendering.
export default function Controls({ settings, setSettings, charSets }) {
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

      <Field label={`Font size — ${settings.fontSize}px`}>
        <input type="range" min="4" max="20" step="1"
          value={settings.fontSize} onChange={set('fontSize')} />
      </Field>

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
