import { useState, useMemo } from 'react'

interface Observation {
  id: string
  date: string // YYYY-MM-DD
  object: string
  telescope: string
  eyepiece: string
  magnification: number
  seeing: number // 1-5
  transparency: number // 1-5
  darkness: number // 1-5
  notes: string
  createdAt: number
}

const STORAGE_KEY = 'spacehub_obslog'
const OBJECT_SUGGESTIONS = [
  'Orion', 'M31', 'Saturn', 'Jupiter', 'Moon', 'M42', 'Pleiades',
  'M13', 'NGC 224', 'Venus', 'Mars',
]

const today = () => new Date().toISOString().slice(0, 10)

function loadObs(): Observation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Observation[]
  } catch {
    return []
  }
}

function saveObs(obs: Observation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obs)) } catch {}
}

function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${label} ${n} of 5`}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              padding: 0,
              lineHeight: 1,
              color: n <= value ? '#818cf8' : 'rgba(255,255,255,0.15)',
              transition: 'color 0.15s',
            }}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

function exportCSV(observations: Observation[]) {
  const headers = ['Date', 'Object', 'Telescope', 'Eyepiece', 'Magnification', 'Seeing (1-5)', 'Transparency (1-5)', 'Darkness (1-5)', 'Notes']
  const rows = observations.map(o => [
    o.date,
    `"${o.object.replace(/"/g, '""')}"`,
    `"${o.telescope.replace(/"/g, '""')}"`,
    `"${o.eyepiece.replace(/"/g, '""')}"`,
    o.magnification,
    o.seeing,
    o.transparency,
    o.darkness,
    `"${o.notes.replace(/"/g, '""')}"`,
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spacehub-observations-${today()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const emptyForm = () => ({
  date: today(),
  object: '',
  telescope: '',
  eyepiece: '',
  magnification: 0,
  seeing: 3,
  transparency: 3,
  darkness: 3,
  notes: '',
})

export default function ObservationLog() {
  const [observations, setObservations] = useState<Observation[]>(() =>
    loadObs().sort((a, b) => b.createdAt - a.createdAt)
  )
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [objInput, setObjInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const stats = useMemo(() => {
    const totalObs = observations.length
    const uniqueObjects = new Set(observations.map(o => o.object.trim().toLowerCase())).size
    const totalHours = (totalObs * 0.5).toFixed(1)
    return { totalObs, uniqueObjects, totalHours }
  }, [observations])

  const filteredSuggestions = OBJECT_SUGGESTIONS.filter(s =>
    objInput.length > 0 && s.toLowerCase().includes(objInput.toLowerCase())
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.object.trim()) return
    const newObs: Observation = {
      id: Date.now().toString(),
      date: form.date,
      object: form.object.trim(),
      telescope: form.telescope.trim(),
      eyepiece: form.eyepiece.trim(),
      magnification: Number(form.magnification) || 0,
      seeing: form.seeing,
      transparency: form.transparency,
      darkness: form.darkness,
      notes: form.notes.trim(),
      createdAt: Date.now(),
    }
    const updated = [newObs, ...observations]
    setObservations(updated)
    saveObs(updated)
    setForm(emptyForm())
    setObjInput('')
    setShowForm(false)
  }

  const deleteObs = (id: string) => {
    const updated = observations.filter(o => o.id !== id)
    setObservations(updated)
    saveObs(updated)
  }

  const setField = (field: string, value: string | number) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: 'white',
    padding: '8px 12px',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 5,
    display: 'block',
  }

  return (
    <div className="space-card p-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="icon-box text-xl">📓</div>
          <div>
            <h3 className="text-white font-bold text-base">Observation Journal</h3>
            <p className="text-gray-500 text-xs">Personal astronomy log — stored locally</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {observations.length > 0 && (
            <button
              onClick={() => exportCSV(observations)}
              aria-label="Export observations as CSV"
              style={{
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 10,
                color: '#a5b4fc',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.2s',
              }}
            >
              <span>⬇️</span> Export CSV
            </button>
          )}
          <button
            onClick={() => setShowForm(s => !s)}
            aria-label={showForm ? 'Cancel new observation' : 'Add new observation'}
            style={{
              background: showForm ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.2)',
              border: `1px solid ${showForm ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.4)'}`,
              borderRadius: 10,
              color: showForm ? '#f87171' : '#c4b5fd',
              fontSize: 13,
              fontWeight: 700,
              padding: '7px 14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {showForm ? '✕ Cancel' : '+ Add Observation'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 20,
      }}>
        {[
          { label: 'Total Observations', value: stats.totalObs, icon: '🔭' },
          { label: 'Unique Objects', value: stats.uniqueObjects, icon: '⭐' },
          { label: 'Hours Observing', value: stats.totalHours, icon: '🌙' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(99,102,241,0.07)',
            border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: 14,
            padding: '14px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#c4b5fd', letterSpacing: '-0.03em' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add observation form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'rgba(99,102,241,0.05)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 700, color: '#c4b5fd', marginBottom: 16, fontSize: 14 }}>New Observation</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Date */}
            <div>
              <label style={labelStyle} htmlFor="obs-date">Date</label>
              <input
                id="obs-date"
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
                required
              />
            </div>

            {/* Object name with autocomplete */}
            <div style={{ position: 'relative' }}>
              <label style={labelStyle} htmlFor="obs-object">Object Name</label>
              <input
                id="obs-object"
                type="text"
                value={objInput}
                onChange={e => {
                  setObjInput(e.target.value)
                  setField('object', e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="e.g. M42, Saturn…"
                style={inputStyle}
                required
                autoComplete="off"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'rgba(13,17,40,0.98)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 10,
                  zIndex: 50,
                  overflow: 'hidden',
                  marginTop: 4,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                  {filteredSuggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={() => {
                        setObjInput(s)
                        setField('object', s)
                        setShowSuggestions(false)
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        color: '#c4b5fd',
                        padding: '8px 12px',
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Telescope */}
            <div>
              <label style={labelStyle} htmlFor="obs-scope">Telescope</label>
              <input
                id="obs-scope"
                type="text"
                value={form.telescope}
                onChange={e => setField('telescope', e.target.value)}
                placeholder="e.g. 8&quot; Dob"
                style={inputStyle}
              />
            </div>

            {/* Eyepiece */}
            <div>
              <label style={labelStyle} htmlFor="obs-ep">Eyepiece</label>
              <input
                id="obs-ep"
                type="text"
                value={form.eyepiece}
                onChange={e => setField('eyepiece', e.target.value)}
                placeholder="e.g. 25mm Plössl"
                style={inputStyle}
              />
            </div>

            {/* Magnification */}
            <div>
              <label style={labelStyle} htmlFor="obs-mag">Magnification (×)</label>
              <input
                id="obs-mag"
                type="number"
                min={0}
                value={form.magnification || ''}
                onChange={e => setField('magnification', e.target.value)}
                placeholder="e.g. 48"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Sky conditions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <StarRating value={form.seeing} onChange={v => setField('seeing', v)} label="Seeing" />
            <StarRating value={form.transparency} onChange={v => setField('transparency', v)} label="Transparency" />
            <StarRating value={form.darkness} onChange={v => setField('darkness', v)} label="Darkness" />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="obs-notes">Notes</label>
            <textarea
              id="obs-notes"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="What did you see? Colours, detail, comparisons…"
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
          </div>

          <button
            type="submit"
            className="btn-shimmer"
            style={{ padding: '10px 24px', fontSize: 14, width: '100%' }}
          >
            Save Observation
          </button>
        </form>
      )}

      {/* Observation list */}
      {observations.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#4b5563',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔭</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>No observations yet.</div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>Add your first tonight!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {observations.map(obs => (
            <div
              key={obs.id}
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, color: '#e0e0e0', fontSize: 15 }}>{obs.object}</span>
                  <span style={{ fontSize: 11, color: '#6b7280', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '2px 8px' }}>
                    {obs.date}
                  </span>
                  {obs.telescope && (
                    <span style={{ fontSize: 11, color: '#818cf8', background: 'rgba(99,102,241,0.1)', borderRadius: 6, padding: '2px 8px', border: '1px solid rgba(99,102,241,0.2)' }}>
                      🔭 {obs.telescope}
                    </span>
                  )}
                  {obs.magnification > 0 && (
                    <span style={{ fontSize: 11, color: '#a78bfa', background: 'rgba(139,92,246,0.1)', borderRadius: 6, padding: '2px 8px', border: '1px solid rgba(139,92,246,0.2)' }}>
                      ×{obs.magnification}
                    </span>
                  )}
                </div>

                {/* Conditions summary */}
                <div style={{ display: 'flex', gap: 12, marginBottom: obs.notes ? 6 : 0, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Seeing', value: obs.seeing },
                    { label: 'Transp.', value: obs.transparency },
                    { label: 'Dark', value: obs.darkness },
                  ].map(c => (
                    <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{c.label}:</span>
                      <span style={{ color: '#818cf8', fontSize: 12 }}>{'★'.repeat(c.value)}{'☆'.repeat(5 - c.value)}</span>
                    </div>
                  ))}
                </div>

                {obs.notes && (
                  <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5, marginTop: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {obs.notes}
                  </p>
                )}
              </div>

              <button
                onClick={() => deleteObs(obs.id)}
                aria-label={`Delete observation of ${obs.object}`}
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8,
                  color: '#f87171',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '5px 9px',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                }}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
