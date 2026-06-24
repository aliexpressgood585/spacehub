import { useState } from 'react'

const DEG = Math.PI / 180

// Angular separation between two RA/Dec pairs (degrees)
function angularSep(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const r1 = ra1 * 15 * DEG, d1 = dec1 * DEG
  const r2 = ra2 * 15 * DEG, d2 = dec2 * DEG
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(r1 - r2)
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
}

// Convert degrees decimal to DMS
function toDMS(deg: number): string {
  const sign = deg < 0 ? '-' : '+'
  const abs = Math.abs(deg)
  const d = Math.floor(abs)
  const m = Math.floor((abs - d) * 60)
  const s = ((abs - d) * 60 - m) * 60
  return `${sign}${d}° ${m}' ${s.toFixed(1)}"`
}

// Convert hours decimal to HMS
function toHMS(h: number): string {
  const hrs = Math.floor(h)
  const m = Math.floor((h - hrs) * 60)
  const s = ((h - hrs) * 60 - m) * 60
  return `${String(hrs).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${s.toFixed(1)}s`
}

// Parse degree input: accept decimal or D:M:S
function parseDeg(s: string): number {
  const t = s.trim()
  if (t.includes(':')) {
    const parts = t.split(':').map(Number)
    const sign = parts[0] < 0 || t.startsWith('-') ? -1 : 1
    return sign * (Math.abs(parts[0]) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600)
  }
  return Number(t)
}

// Telescope exit pupil and magnification
function exitPupil(aperture: number, mag: number): number { return aperture / mag }
function lightGathering(aperture: number): number { return (aperture / 7) * (aperture / 7) }
function limitingMag(aperture: number): number { return 2 + 5 * Math.log10(aperture) }

// Convert Alt/Az to RA/Dec given LST and latitude
function altAzToRaDec(alt: number, az: number, lst: number, lat: number) {
  const altR = alt * DEG, azR = az * DEG, latR = lat * DEG
  const sinDec = Math.sin(altR) * Math.sin(latR) + Math.cos(altR) * Math.cos(latR) * Math.cos(azR)
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec))) * 180 / Math.PI
  const cosHa = (Math.sin(altR) - Math.sin(latR) * Math.sin(dec * DEG)) / (Math.cos(latR) * Math.cos(dec * DEG))
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) * 180 / Math.PI / 15
  const haSign = Math.sin(azR) > 0 ? ha : -ha
  const ra = ((lst - haSign) % 24 + 24) % 24
  return { ra, dec }
}

type Tool = 'separation' | 'telescope' | 'convert' | 'altaz'

export default function AstroCalculator() {
  const [tool, setTool] = useState<Tool>('separation')

  // Angular separation
  const [ra1, setRa1] = useState('5.9')
  const [dec1, setDec1] = useState('7.4')
  const [ra2, setRa2] = useState('5.6')
  const [dec2, setDec2] = useState('45.9')
  const sep = angularSep(parseDeg(ra1), parseDeg(dec1), parseDeg(ra2), parseDeg(dec2))

  // Telescope
  const [aperture, setAperture] = useState(200)
  const [focalLen, setFocalLen] = useState(1000)
  const [epFl, setEpFl] = useState(25)
  const mag = focalLen / epFl
  const ep = exitPupil(aperture, mag)
  const lg = lightGathering(aperture)
  const lm = limitingMag(aperture)
  const fov = 52 / mag

  // Coordinate convert
  const [convRA, setConvRA] = useState('5.919')
  const [convDec, setConvDec] = useState('7.407')
  const raH = parseDeg(convRA)
  const decD = parseDeg(convDec)

  // Alt/Az to RA/Dec
  const [altIn, setAltIn] = useState('45')
  const [azIn, setAzIn] = useState('180')
  const [lstIn, setLstIn] = useState('12')
  const [latIn, setLatIn] = useState('32')
  const converted = altAzToRaDec(parseDeg(altIn), parseDeg(azIn), parseDeg(lstIn), parseDeg(latIn))

  const TOOLS: { id: Tool; label: string; icon: string }[] = [
    { id: 'separation', label: 'Angular Separation', icon: '📐' },
    { id: 'telescope', label: 'Telescope Calculator', icon: '🔭' },
    { id: 'convert', label: 'Coordinate Convert', icon: '🌐' },
    { id: 'altaz', label: 'Alt/Az ↔ RA/Dec', icon: '🧭' },
  ]

  const Input = ({ label, value, onChange, unit }: { label: string; value: string; onChange: (v: string) => void; unit?: string }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        {unit && <span className="text-slate-500 text-xs shrink-0">{unit}</span>}
      </div>
    </div>
  )

  const NumInput = ({ label, value, onChange, unit, min, max }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(+e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        {unit && <span className="text-slate-500 text-xs shrink-0">{unit}</span>}
      </div>
    </div>
  )

  const Result = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-blue-950/50 border border-blue-700/40' : 'bg-slate-800/60'}`}>
      <div className="text-slate-400 text-xs mb-0.5">{label}</div>
      <div className={`font-bold text-sm ${highlight ? 'text-blue-300' : 'text-white'}`}>{value}</div>
    </div>
  )

  return (
    <div className="card-dark p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-2xl">🧮</span>
        <div>
          <h2 className="text-xl font-bold text-white">Astronomy Calculator</h2>
          <p className="text-slate-400 text-sm">Precision tools for observing and planning</p>
        </div>
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            style={{
              background: tool === t.id ? 'rgba(59,130,246,0.2)' : 'transparent',
              borderColor: tool === t.id ? '#3b82f6' : '#374151',
              color: tool === t.id ? '#93c5fd' : '#9ca3af',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Angular Separation */}
      {tool === 'separation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/40 rounded-xl p-3 space-y-3">
              <div className="text-xs font-bold text-slate-300 mb-2">Object 1</div>
              <Input label="RA (hours)" value={ra1} onChange={setRa1} />
              <Input label="Dec (degrees)" value={dec1} onChange={setDec1} />
            </div>
            <div className="bg-slate-800/40 rounded-xl p-3 space-y-3">
              <div className="text-xs font-bold text-slate-300 mb-2">Object 2</div>
              <Input label="RA (hours)" value={ra2} onChange={setRa2} />
              <Input label="Dec (degrees)" value={dec2} onChange={setDec2} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Result label="Angular Separation" value={`${sep.toFixed(4)}°`} highlight />
            <Result label="In Arcminutes" value={`${(sep * 60).toFixed(2)}'`} />
            <Result label="In Arcseconds" value={`${(sep * 3600).toFixed(1)}"`} />
          </div>
          <p className="text-xs text-slate-600">
            Example: Betelgeuse (5.919h, 7.4°) and Rigel (5.243h, -8.2°) are separated by ~{angularSep(5.919, 7.4, 5.243, -8.2).toFixed(1)}°
          </p>
        </div>
      )}

      {/* Telescope Calculator */}
      {tool === 'telescope' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <NumInput label="Aperture" value={aperture} onChange={setAperture} unit="mm" min={50} max={1000} />
            <NumInput label="Focal Length" value={focalLen} onChange={setFocalLen} unit="mm" min={200} max={5000} />
            <NumInput label="Eyepiece FL" value={epFl} onChange={setEpFl} unit="mm" min={2} max={55} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Result label="Magnification" value={`${mag.toFixed(0)}×`} highlight />
            <Result label="Exit Pupil" value={`${ep.toFixed(2)} mm`} highlight={ep >= 2 && ep <= 7} />
            <Result label="True FOV" value={`${fov.toFixed(2)}°`} />
            <Result label="f/ratio" value={`f/${(focalLen / aperture).toFixed(1)}`} />
            <Result label="Light Gathering" value={`${lg.toFixed(0)}× naked eye`} />
            <Result label="Limiting Magnitude" value={`mag ${lm.toFixed(1)}`} />
          </div>
          {ep < 2 && <p className="text-amber-400 text-xs">⚠️ Exit pupil below 2mm — bright point sources, uncomfortable for extended viewing</p>}
          {ep > 7 && <p className="text-amber-400 text-xs">⚠️ Exit pupil above 7mm exceeds the eye's dark-adapted pupil — light is wasted</p>}
          {ep >= 2 && ep <= 7 && <p className="text-green-400 text-xs">✅ Excellent exit pupil for this aperture ({ep.toFixed(2)}mm)</p>}
        </div>
      )}

      {/* Coordinate Converter */}
      {tool === 'convert' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="RA (decimal hours or H:M:S)" value={convRA} onChange={setConvRA} />
            <Input label="Dec (decimal° or D:M:S)" value={convDec} onChange={setConvDec} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Result label="RA (HMS)" value={toHMS(raH)} highlight />
            <Result label="Dec (DMS)" value={toDMS(decD)} highlight />
            <Result label="RA (decimal hours)" value={`${raH.toFixed(6)}h`} />
            <Result label="RA (degrees)" value={`${(raH * 15).toFixed(4)}°`} />
            <Result label="Dec (decimal degrees)" value={`${decD.toFixed(6)}°`} />
            <Result label="Dec (radians)" value={`${(decD * DEG).toFixed(6)} rad`} />
          </div>
          <p className="text-xs text-slate-600">Tip: Enter H:M:S format like 5:55:10.3 or decimal like 5.919</p>
        </div>
      )}

      {/* Alt/Az → RA/Dec */}
      {tool === 'altaz' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Altitude (°)" value={altIn} onChange={setAltIn} />
            <Input label="Azimuth (°)" value={azIn} onChange={setAzIn} />
            <Input label="LST (hours)" value={lstIn} onChange={setLstIn} />
            <Input label="Latitude (°)" value={latIn} onChange={setLatIn} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Result label="Right Ascension" value={toHMS(converted.ra)} highlight />
            <Result label="Declination" value={toDMS(converted.dec)} highlight />
            <Result label="RA (decimal)" value={`${converted.ra.toFixed(4)}h`} />
            <Result label="Dec (decimal)" value={`${converted.dec.toFixed(4)}°`} />
          </div>
          <p className="text-xs text-slate-600">
            LST = Local Sidereal Time. Find it in the StarMap's coordinate display or calculate it from UT and your longitude.
          </p>
        </div>
      )}
    </div>
  )
}
