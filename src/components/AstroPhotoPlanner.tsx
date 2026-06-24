import { useState, useMemo } from 'react'

// Telescope presets [name, aperture_mm, focal_mm, type]
const SCOPES = [
  { name: 'Refractor 70mm',      apt: 70,  fl: 420,  type: 'Refractor' },
  { name: 'Refractor ED80',       apt: 80,  fl: 480,  type: 'APO'       },
  { name: 'Refractor 102mm',      apt: 102, fl: 660,  type: 'Refractor' },
  { name: 'William Optics GT71',  apt: 71,  fl: 336,  type: 'APO'       },
  { name: 'Dobsonian 6"',         apt: 152, fl: 1200, type: 'Reflector' },
  { name: 'Dobsonian 8"',         apt: 203, fl: 1200, type: 'Reflector' },
  { name: 'Dobsonian 10"',        apt: 254, fl: 1270, type: 'Reflector' },
  { name: 'SCT 6" (f/10)',        apt: 150, fl: 1500, type: 'SCT'       },
  { name: 'SCT 8" (f/10)',        apt: 203, fl: 2032, type: 'SCT'       },
  { name: 'SCT 11" (f/10)',       apt: 279, fl: 2800, type: 'SCT'       },
  { name: 'RC 6"',                apt: 152, fl: 1370, type: 'RC'        },
  { name: 'RC 8"',                apt: 203, fl: 1624, type: 'RC'        },
  { name: 'Camera Lens 50mm',     apt: 35,  fl: 50,   type: 'Lens'      },
  { name: 'Camera Lens 135mm',    apt: 40,  fl: 135,  type: 'Lens'      },
  { name: 'Camera Lens 200mm',    apt: 50,  fl: 200,  type: 'Lens'      },
]

// Camera sensor presets [name, w_mm, h_mm]
const CAMERAS = [
  { name: 'Canon 6D (Full Frame)',     w: 35.8, h: 23.9, ps: 6.54 },
  { name: 'Canon 700D (APS-C)',        w: 22.3, h: 14.9, ps: 4.3  },
  { name: 'Nikon D800 (Full Frame)',   w: 35.9, h: 24.0, ps: 4.88 },
  { name: 'Sony A7III (Full Frame)',   w: 35.6, h: 23.8, ps: 5.93 },
  { name: 'Sony A6400 (APS-C)',        w: 23.5, h: 15.6, ps: 3.92 },
  { name: 'ZWO ASI294MC Pro',          w: 19.1, h: 13.0, ps: 4.63 },
  { name: 'ZWO ASI533MC Pro',          w: 11.3, h: 11.3, ps: 3.76 },
  { name: 'ZWO ASI071MC Pro',          w: 23.4, h: 15.7, ps: 4.78 },
  { name: 'ZWO ASI2400MC Pro',         w: 35.6, h: 23.8, ps: 5.94 },
  { name: 'ZWO ASI585MC',              w: 8.0,  h: 6.0,  ps: 2.9  },
  { name: 'QHY268C',                   w: 23.1, h: 15.5, ps: 3.76 },
  { name: 'Player One Neptune-C II',   w: 16.0, h: 12.7, ps: 4.63 },
]

// DSO imaging targets with size in arcminutes
const TARGETS = [
  { id:'M42',   name:'Orion Nebula',      type:'Nebula',   ra:5.588,  dec:-5.39,  size:65,  mag:4.0,  desc:'Largest nearby star-forming region; stunning in any focal length',        bestFL:'300–600mm'  },
  { id:'M31',   name:'Andromeda Galaxy',  type:'Galaxy',   ra:0.712,  dec:41.27,  size:190, mag:3.4,  desc:'Nearest large galaxy; needs a wide field to capture full extent',          bestFL:'100–300mm'  },
  { id:'M45',   name:'Pleiades',          type:'Cluster',  ra:3.791,  dec:24.11,  size:120, mag:1.6,  desc:'Blue reflection nebulosity around the Seven Sisters',                     bestFL:'100–300mm'  },
  { id:'M13',   name:'Hercules Cluster',  type:'Globular', ra:16.695, dec:36.46,  size:20,  mag:5.8,  desc:'Finest northern globular; resolves into stars at f/6+',                   bestFL:'600–1500mm' },
  { id:'M51',   name:'Whirlpool Galaxy',  type:'Galaxy',   ra:13.498, dec:47.19,  size:11,  mag:8.4,  desc:'Classic grand-design spiral with companion NGC 5195',                    bestFL:'600–1200mm' },
  { id:'M57',   name:'Ring Nebula',       type:'Nebula',   ra:18.893, dec:33.03,  size:1.4, mag:8.8,  desc:'Iconic planetary nebula; needs very long focal length',                   bestFL:'1500mm+'    },
  { id:'M101',  name:'Pinwheel Galaxy',   type:'Galaxy',   ra:14.054, dec:54.35,  size:29,  mag:7.9,  desc:'Face-on grand design spiral in Ursa Major',                               bestFL:'400–900mm'  },
  { id:'M82',   name:'Cigar Galaxy',      type:'Galaxy',   ra:9.928,  dec:69.68,  size:11,  mag:8.4,  desc:'Starburst galaxy with dramatic Hα hydrogen jets',                         bestFL:'600–1200mm' },
  { id:'M27',   name:'Dumbbell Nebula',   type:'Nebula',   ra:19.993, dec:22.72,  size:8,   mag:7.4,  desc:'Brightest planetary nebula; shows structure even in short exposures',     bestFL:'600–1200mm' },
  { id:'M33',   name:'Triangulum Galaxy', type:'Galaxy',   ra:1.564,  dec:30.66,  size:67,  mag:5.7,  desc:'Large low-surface-brightness galaxy; needs dark skies',                   bestFL:'200–400mm'  },
  { id:'NGC7293',name:'Helix Nebula',     type:'Nebula',   ra:22.494, dec:-20.84, size:16,  mag:7.6,  desc:'"Eye of God" — large planetary nebula best seen from southern latitudes', bestFL:'400–900mm'  },
  { id:'NGC891', name:'Silver Sliver',    type:'Galaxy',   ra:2.381,  dec:42.35,  size:14,  mag:9.9,  desc:'Perfect edge-on galaxy with dramatic dust lane',                          bestFL:'600–1200mm' },
  { id:'NGC6992',name:'Eastern Veil',     type:'Nebula',   ra:20.947, dec:31.73,  size:60,  mag:7.0,  desc:'Supernova remnant; Hα filter dramatically improves contrast',             bestFL:'200–600mm'  },
  { id:'IC1805', name:'Heart Nebula',     type:'Nebula',   ra:2.550,  dec:61.45,  size:60,  mag:6.5,  desc:'Emission nebula in Perseus arm; Hα or SHO palette ideal',                bestFL:'200–500mm'  },
  { id:'M16',   name:'Eagle Nebula',      type:'Nebula',   ra:18.313, dec:-13.79, size:35,  mag:6.0,  desc:'"Pillars of Creation" — stunning in Hα narrowband',                       bestFL:'400–900mm'  },
  { id:'M20',   name:'Trifid Nebula',     type:'Nebula',   ra:18.042, dec:-22.97, size:20,  mag:6.3,  desc:'Three-lobed emission nebula with blue reflection region',                 bestFL:'600–1200mm' },
  { id:'M81',   name:"Bode's Galaxy",     type:'Galaxy',   ra:9.926,  dec:69.07,  size:21,  mag:6.9,  desc:'Grand spiral paired with M82; wide field shows both',                     bestFL:'400–900mm'  },
  { id:'M104',  name:'Sombrero Galaxy',   type:'Galaxy',   ra:12.666, dec:-11.62, size:9,   mag:8.0,  desc:'Prominent dark dust lane and large central bulge',                        bestFL:'600–1200mm' },
  { id:'NGC4631',name:'Whale Galaxy',     type:'Galaxy',   ra:12.703, dec:32.54,  size:15,  mag:9.2,  desc:'Edge-on galaxy with dwarf companion NGC 4627',                            bestFL:'500–1000mm' },
  { id:'IC434', name:'Horsehead Nebula',  type:'Nebula',   ra:5.683,  dec:-2.46,  size:8,   mag:7.3,  desc:'Dark nebula against IC 434 emission; needs Hα filter',                   bestFL:'600–1200mm' },
]

const TYPE_ICONS: Record<string, string> = {
  Nebula: '🌫', Galaxy: '🌀', Cluster: '✨', Globular: '💫',
}
const TYPE_COLORS: Record<string, string> = {
  Nebula: '#f472b6', Galaxy: '#60a5fa', Cluster: '#fbbf24', Globular: '#a78bfa',
}

function fovArcmin(sensorMM: number, focalMM: number) {
  if (!focalMM || !sensorMM) return 0
  return (sensorMM / focalMM) * (180 / Math.PI) * 60
}

function imageScale(pixelUM: number, focalMM: number) {
  if (!focalMM || !pixelUM) return 0
  return (pixelUM / 1000 / focalMM) * (180 / Math.PI) * 3600 // arcsec/px
}

// 0=too small, 100=perfect
function matchScore(fovW: number, size: number): number {
  if (!fovW || !size) return 0
  const ratio = size / fovW
  if (ratio > 1.3)  return 0
  if (ratio > 0.85) return 65
  if (ratio > 0.5)  return 100
  if (ratio > 0.25) return 85
  if (ratio > 0.1)  return 60
  return 35
}

function scoreColor(s: number) {
  if (s >= 90) return '#34d399'
  if (s >= 70) return '#fbbf24'
  if (s >= 40) return '#f97316'
  return '#ef4444'
}

// Simplified altitude at transit (culmination) = 90 - |lat - dec|
// For a rough "can I image this tonight" check, good enough
function transAlt(dec: number, lat: number) {
  return 90 - Math.abs(lat - dec)
}



export default function AstroPhotoPlanner() {
  const [scopeIdx,   setScopeIdx]   = useState(1)
  const [camIdx,     setCamIdx]     = useState(4)
  const [customFL,   setCustomFL]   = useState(480)
  const [customW,    setCustomW]    = useState(11.3)
  const [customH,    setCustomH]    = useState(11.3)
  const [customPS,   setCustomPS]   = useState(3.76)
  const [lat,        setLat]        = useState(40)
  const [typeFilter, setTypeFilter] = useState<string>('All')
  const [expanded,   setExpanded]   = useState<string|null>(null)

  const scope = SCOPES[scopeIdx]
  const cam   = CAMERAS[camIdx]
  const isCustomScope = scope.name === 'Custom'
  const isCustomCam   = cam.name === 'Custom'

  const fl  = isCustomScope ? customFL : scope.fl
  const sW  = isCustomCam   ? customW  : cam.w
  const sH  = isCustomCam   ? customH  : cam.h
  const ps  = isCustomCam   ? customPS : cam.ps

  const fovW  = useMemo(() => fovArcmin(sW, fl), [sW, fl])
  const fovH  = useMemo(() => fovArcmin(sH, fl), [sH, fl])
  const scale = useMemo(() => imageScale(ps, fl), [ps, fl])

  const ranked = useMemo(() => {
    return TARGETS
      .filter(t => typeFilter === 'All' || t.type === typeFilter)
      .map(t => ({ ...t, score: matchScore(fovW, t.size), maxAlt: transAlt(t.dec, lat) }))
      .sort((a, b) => b.score - a.score || b.maxAlt - a.maxAlt)
  }, [fovW, typeFilter, lat])

  const types = ['All', 'Nebula', 'Galaxy', 'Cluster', 'Globular']

  return (
    <div className="space-card p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-2xl">📷</div>
        <div>
          <h3 className="text-white font-bold text-lg">Astrophotography Planner</h3>
          <p className="text-gray-500 text-xs">FOV calculator + best targets for your equipment</p>
        </div>
      </div>

      {/* Equipment selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Telescope */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block font-semibold">🔭 Telescope / Lens</label>
          <select
            value={scopeIdx}
            onChange={e => setScopeIdx(+e.target.value)}
            className="w-full text-xs rounded-xl px-3 py-2.5 font-medium"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', color:'#e2e8f0' }}
          >
            {SCOPES.map((s, i) => <option key={s.name} value={i} style={{background:'#1e1e2e'}}>{s.name}{s.fl ? ` — f${s.fl}mm` : ''}</option>)}
          </select>
          {isCustomScope && (
            <div className="flex gap-2 mt-2">
              <div className="flex-1">
                <label className="text-xs text-gray-600 block mb-1">Focal length (mm)</label>
                <input type="number" value={customFL} onChange={e => setCustomFL(+e.target.value)} min={50} max={5000}
                  className="w-full text-xs rounded-lg px-2.5 py-2" style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0' }} />
              </div>
            </div>
          )}
          {!isCustomScope && <p className="text-xs text-gray-600 mt-1">{scope.apt}mm aperture · {scope.type}</p>}
        </div>

        {/* Camera */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block font-semibold">📷 Camera</label>
          <select
            value={camIdx}
            onChange={e => setCamIdx(+e.target.value)}
            className="w-full text-xs rounded-xl px-3 py-2.5 font-medium"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', color:'#e2e8f0' }}
          >
            {CAMERAS.map((c, i) => <option key={c.name} value={i} style={{background:'#1e1e2e'}}>{c.name}</option>)}
          </select>
          {isCustomCam ? (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[['W (mm)', customW, setCustomW], ['H (mm)', customH, setCustomH], ['px (µm)', customPS, setCustomPS]].map(([lbl, val, setter]) => (
                <div key={lbl as string}>
                  <label className="text-xs text-gray-600 block mb-1">{lbl as string}</label>
                  <input type="number" value={val as number} onChange={e => (setter as (v:number)=>void)(+e.target.value)} step={0.1}
                    className="w-full text-xs rounded-lg px-2 py-2" style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0' }} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600 mt-1">{cam.w} × {cam.h}mm · {cam.ps}µm pixels</p>
          )}
        </div>
      </div>

      {/* Latitude */}
      <div className="mb-4 flex items-center gap-3">
        <label className="text-xs text-gray-400 font-semibold shrink-0">🌍 Your Latitude</label>
        <input type="range" min={-80} max={80} value={lat} onChange={e => setLat(+e.target.value)} className="flex-1" style={{ accentColor:'#6366f1' }} />
        <span className="text-xs font-bold text-violet-300 w-12 text-right">{lat > 0 ? `${lat}°N` : `${-lat}°S`}</span>
      </div>

      {/* FOV display */}
      <div className="rounded-2xl p-4 mb-5" style={{ background:'rgba(99,102,241,0.07)', border:'1px solid rgba(99,102,241,0.2)' }}>
        <div className="flex flex-wrap gap-4 items-center justify-between">
          {/* FOV preview box */}
          <div className="flex items-center gap-3">
            <div className="relative rounded-lg overflow-hidden flex-shrink-0" style={{ width:80, height:54, background:'#0a0a1a', border:'1px solid rgba(99,102,241,0.3)' }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div style={{ width:'70%', height:'70%', border:'1px dashed rgba(99,102,241,0.6)', borderRadius:2 }} />
              </div>
              <div className="absolute bottom-0.5 right-1 text-gray-600" style={{fontSize:7}}>FOV</div>
            </div>
            <div>
              <div className="text-white font-bold text-xl">
                {fovW ? `${fovW.toFixed(1)}′ × ${fovH.toFixed(1)}′` : '—'}
              </div>
              <div className="text-xs text-gray-500">
                {fovW ? `${(fovW/60).toFixed(2)}° × ${(fovH/60).toFixed(2)}°` : 'Set equipment above'}
              </div>
            </div>
          </div>
          {/* Stats */}
          <div className="flex gap-4 flex-wrap">
            <div className="text-center">
              <div className="text-sm font-bold text-yellow-400">{scale ? `${scale.toFixed(2)}"` : '—'}</div>
              <div className="text-xs text-gray-500">arcsec/px</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-emerald-400">{fl ? `f/${(fl/(scope.apt||80)).toFixed(1)}` : '—'}</div>
              <div className="text-xs text-gray-500">focal ratio</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-violet-300">{fl}mm</div>
              <div className="text-xs text-gray-500">focal length</div>
            </div>
          </div>
        </div>

        {/* Sampling advice */}
        {scale > 0 && (
          <div className="mt-3 text-xs rounded-lg px-3 py-2" style={{
            background: scale < 0.5 ? 'rgba(239,68,68,0.1)' : scale < 1.2 ? 'rgba(52,211,153,0.1)' : scale < 3 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: scale < 0.5 ? '#f87171' : scale < 1.2 ? '#34d399' : scale < 3 ? '#fbbf24' : '#f87171',
          }}>
            {scale < 0.5  ? '⚠️ Oversampled — atmosphere limits resolution below ~1"/px. Consider a Barlow or reducer.'
           : scale < 1.2  ? '✅ Excellent sampling — sharp stars and detail in good seeing.'
           : scale < 2.5  ? '✅ Good sampling — well matched for typical suburban seeing.'
           : scale < 3.5  ? '⚡ Slightly undersampled — fine for wide-field nebulae; stars may look blocky.'
           :                 '⚠️ Undersampled — best for large widefield targets only.'}
          </div>
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {types.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
            style={{
              background: typeFilter===t ? `${TYPE_COLORS[t] ?? 'rgba(99,102,241,0.3)'}22` : 'rgba(255,255,255,0.04)',
              color: typeFilter===t ? TYPE_COLORS[t] ?? '#a5b4fc' : '#6b7280',
              border: `1px solid ${typeFilter===t ? TYPE_COLORS[t] ?? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            {t !== 'All' ? (TYPE_ICONS[t] ?? '') + ' ' : ''}{t}
          </button>
        ))}
      </div>

      {/* Target list */}
      <div className="flex flex-col gap-2">
        {ranked.map(t => {
          const col    = TYPE_COLORS[t.type] ?? '#94a3b8'
          const sc     = t.score
          const isOpen = expanded === t.id
          const altOk  = t.maxAlt > 20
          return (
            <div key={t.id}
              onClick={() => setExpanded(isOpen ? null : t.id)}
              className="rounded-xl px-3 py-2.5 cursor-pointer transition"
              style={{ background: isOpen ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)', border:`1px solid ${isOpen ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
              <div className="flex items-center gap-3">
                {/* Score ring */}
                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background:`${scoreColor(sc)}18`, border:`2px solid ${scoreColor(sc)}`, color:scoreColor(sc) }}>
                  {sc}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">{t.id}</span>
                    <span className="text-sm text-gray-300">{t.name}</span>
                    <span className="text-xs rounded px-1.5 py-0.5 font-semibold" style={{background:`${col}18`, color:col, fontSize:9}}>{t.type}</span>
                    {!altOk && <span className="text-xs text-red-400" style={{fontSize:9}}>LOW ALTITUDE</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                    <span>⟷ {t.size}′</span>
                    <span>mag {t.mag}</span>
                    <span>max alt {t.maxAlt.toFixed(0)}°</span>
                    {isOpen && <span style={{color:'#a5b4fc'}}>Best FL: {t.bestFL}</span>}
                  </div>
                  {isOpen && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{t.desc}</p>}
                </div>
                {/* FOV match bar */}
                <div className="shrink-0 text-right w-16">
                  <div className="text-xs font-bold mb-1" style={{color:scoreColor(sc)}}>
                    {sc >= 90 ? 'Perfect' : sc >= 70 ? 'Great' : sc >= 40 ? 'OK' : 'Poor'} fit
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
                    <div className="h-full rounded-full transition-all" style={{width:`${sc}%`, background:scoreColor(sc)}} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-gray-700 text-xs text-center mt-4">
        Score = how well the target fills your FOV · Click any row for details
      </p>
    </div>
  )
}
