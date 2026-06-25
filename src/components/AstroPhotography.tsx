import { useState } from 'react'

type Target = 'moon' | 'planets' | 'widefield' | 'deepsky' | 'aurora' | 'meteors'
type Budget = 'beginner' | 'intermediate' | 'advanced'

interface CameraSettings {
  target: string
  iso: string
  aperture: string
  shutter: string
  focus: string
  tips: string[]
}

interface Equipment {
  category: string
  beginner: { name: string; price: string; why: string }
  intermediate: { name: string; price: string; why: string }
  advanced: { name: string; price: string; why: string }
}

const SETTINGS: Record<Target, CameraSettings> = {
  moon: {
    target: 'Moon',
    iso: '100–400',
    aperture: 'f/8–f/11 (telescope prime focus)',
    shutter: '1/250 – 1/1000 s (full moon); 1/30 – 1/125 s (crescent)',
    focus: 'Manual focus using live view at 10× zoom on a crater edge',
    tips: [
      'Shoot during twilight — contrast is lower, less glare, beautiful blue sky backdrop',
      'First/Last Quarter Moon gives best crater shadow detail (shadows at the terminator)',
      'Use a remote shutter release or 2-second timer to avoid camera shake',
      'Shoot RAW, not JPEG — you need the dynamic range for processing',
      'Moon moves fast — use tracking mount or short exposure bursts',
      'Full moon is actually the worst time — flat lighting, no shadow detail',
    ]
  },
  planets: {
    target: 'Planets',
    iso: '400–1600',
    aperture: 'f/15–f/25 (effective focal ratio with Barlow lens)',
    shutter: '1/30 – 1/100 s per video frame',
    focus: 'Critical — use SharpCap or FireCapture with focus assistant; aim for diffraction rings',
    tips: [
      'Use a planetary camera (ASI120, ZWO, etc.) — not a DSLR — for best results',
      'Shoot video (hundreds of frames), then stack the best 10–20% using AutoStakkert!3',
      'Stacking cancels atmospheric turbulence — the key to sharp planetary images',
      'Best time: opposition (planet closest to Earth) AND when planet is highest in sky',
      'Use ADC (Atmospheric Dispersion Corrector) when planets are below 40° altitude',
      'Jupiter rotates in 10 hours — shoot in under 90 minutes or features will smear during stacking',
    ]
  },
  widefield: {
    target: 'Wide-Field Milky Way',
    iso: '1600–6400',
    aperture: 'f/2 – f/2.8 (fastest lens you have)',
    shutter: '500-rule: divide 500 by focal length in mm. 24mm = 20s maximum',
    focus: 'Live view on a bright star at 10× zoom; manual focus; focus before dark',
    tips: [
      'New Moon period is essential — even a half moon drowns the Milky Way',
      'Drive 30–60 minutes from city lights to a dark site (Bortle 4 or better)',
      'The galactic core (summer): visible June–September from Northern Hemisphere',
      'Stack multiple exposures (20–100) in Sequator (free) or Starry Landscape Stacker',
      'Shoot the foreground separately (longer exposure/headlamp lit) and composite',
      'White balance: set to 3200–4000K for natural Milky Way colors (not Auto WB)',
    ]
  },
  deepsky: {
    target: 'Deep Sky Objects (DSOs)',
    iso: '800–3200 (depends on sensor)',
    aperture: 'f/5–f/8 (usually telescope prime focus)',
    shutter: '3–10 minutes per sub-frame (unguided: follow 500-rule)',
    focus: 'Bahtinov mask is essential for DSO work — creates a spike pattern showing perfect focus',
    tips: [
      'Equatorial mount with guiding is mandatory for 3+ minute exposures',
      'Guide with PHD2 (free software) + guide camera + guide scope or OAG',
      'Stack 30–100+ sub-frames in DeepSkyStacker (free) or PixInsight (paid, pro standard)',
      'Narrowband filters (Ha, OIII, SII) let you shoot from light-polluted cities',
      'Process in Photoshop/Lightroom or AstroPixelProcessor after stacking',
      'RGB vs Narrowband: broadband gives natural colors; narrowband gives stunning false-color like Hubble Palette',
    ]
  },
  aurora: {
    target: 'Northern/Southern Lights',
    iso: '1600–6400',
    aperture: 'f/2.8 or faster — wider is better',
    shutter: '2–15 seconds (depends on aurora speed)',
    focus: 'Same as wide-field: infinity focus on stars before aurora appears',
    tips: [
      'Aurora forecast: SpaceWeatherLive.com or NASA\'s 3-day forecast. Kp ≥ 5 for mid-latitudes',
      'Best locations: Iceland, Norway, Alaska, northern Canada, New Zealand (for Aurora Australis)',
      'Active aurora moves fast — use shorter exposures (2–5s) to freeze movement',
      'Pillars and rays: 5–10 second exposures capture structure while showing movement',
      'Face north (or south for aurora australis) and get a dark horizon with no light pollution',
      'Geomagnetic storms (G2+) push the aurora visible as far south as 50°N latitude',
    ]
  },
  meteors: {
    target: 'Meteor Showers',
    iso: '3200–6400',
    aperture: 'f/2 – f/2.8',
    shutter: '15–30 seconds per frame (intervalometer essential)',
    focus: 'Manual infinity focus on stars',
    tips: [
      'Set camera to continuous shooting with an intervalometer for hours of coverage',
      'Wide-angle lens (14–24mm) covers more sky — more chance of catching a meteor',
      'Aim toward the zenith or slightly away from the radiant to catch longer meteor trails',
      'Peak: 2–4 AM local time when your location faces into the meteor stream',
      'In post-processing: check each frame manually or use StarStaX (free) to find meteors',
      'Cold nights: keep spare batteries warm in your pocket — cold kills battery life',
    ]
  },
}

const EQUIPMENT: Equipment[] = [
  {
    category: 'Camera',
    beginner: { name: 'Your existing DSLR / mirrorless', price: '$0 extra', why: 'Any interchangeable lens camera works for wide-field and moon/planet basics. CMOS sensor preferred.' },
    intermediate: { name: 'Used Canon 6D / Nikon D610', price: '$400–700', why: 'Full-frame sensor dramatically reduces noise at high ISO. Excellent for wide-field Milky Way.' },
    advanced: { name: 'Dedicated astronomy camera (ZWO ASI2600MC)', price: '$2,000', why: 'Cooled sensor (−20°C reduces thermal noise), astronomy-optimized sensitivity, no IR cut filter.' },
  },
  {
    category: 'Telescope',
    beginner: { name: '70mm refractor or 6" Dobsonian', price: '$100–350', why: 'Good starting point for Moon, planets, and bright DSOs. No tracking = challenging for DSOs.' },
    intermediate: { name: 'Sky-Watcher 8" f/6 Newtonian + EQ5 mount', price: '$800–1,200', why: 'Serious aperture on a motorized equatorial mount. Track stars for longer exposures.' },
    advanced: { name: 'William Optics Redcat 51 + HEQ5 Pro', price: '$2,500–4,000', why: 'Compact apochromatic doublet, no coma, ultra-wide field. Paired with a goto equatorial mount.' },
  },
  {
    category: 'Mount',
    beginner: { name: 'iOptron SkyGuider Pro', price: '$350', why: 'Star tracker for wide-field Milky Way shots with a camera and lens. 1–3 minute exposures possible.' },
    intermediate: { name: 'Sky-Watcher HEQ5 Pro', price: '$900', why: 'GoTo equatorial mount. 13.6 kg payload. EQMOD compatible. Industry standard beginner-intermediate EQ mount.' },
    advanced: { name: 'Pegasus Astro iEQ45 or 10Micron', price: '$2,500+', why: 'Precision payload capacity. Permanently programmed periodic error correction. Used for serious imaging.' },
  },
  {
    category: 'Filters',
    beginner: { name: 'Light pollution filter (Optolong L-Pro)', price: '$100', why: 'Cuts light pollution in RGB images. Allows some DSO work from suburban skies.' },
    intermediate: { name: 'Ha narrowband filter (7nm)', price: '$250', why: 'Cuts almost all light pollution. Reveals nebula hydrogen emission invisible in broadband.' },
    advanced: { name: 'Ha+OIII+SII set (3nm)', price: '$900–1,500', why: 'Full Hubble Palette narrowband imaging from city centers. Professional-grade false color images.' },
  },
]

const MONTHLY_TARGETS: { month: string; targets: string[]; highlight: string }[] = [
  { month: 'Jan–Feb', targets: ['Orion Nebula (M42)', 'Pleiades (M45)', 'Rosette Nebula', 'Crab Nebula (M1)'], highlight: 'Best window for Orion Nebula — high in the sky, winter transparency' },
  { month: 'Mar–Apr', targets: ['Leo Triplet (M65, M66, NGC 3628)', 'Virgo Cluster galaxies', 'Markarian\'s Chain'], highlight: 'Galaxy season begins — look north of Leo and toward Virgo' },
  { month: 'May–Jun', targets: ['M3 globular cluster', 'Hercules Cluster (M13)', 'Antares region', 'Rho Ophiuchi'], highlight: 'Rho Ophiuchi cloud complex is the most colorful astrophoto target in the sky' },
  { month: 'Jul–Aug', targets: ['Milky Way galactic core', 'Lagoon Nebula (M8)', 'Trifid Nebula (M20)', 'Eagle Nebula (M16)'], highlight: 'Peak galactic core season — dark skies, high core altitude. Shoot from the southern hemisphere for better core altitude.' },
  { month: 'Sep–Oct', targets: ['Andromeda Galaxy (M31)', 'Double Cluster in Perseus', 'Pacman Nebula (NGC 281)'], highlight: 'Andromeda is highest in autumn — stunning with a wide-field setup' },
  { month: 'Nov–Dec', targets: ['Heart & Soul Nebulae', 'California Nebula (NGC 1499)', 'Triangulum Galaxy (M33)'], highlight: 'Narrowband targets in Cassiopeia and Perseus — great for city-based imagers' },
]

export default function AstroPhotography() {
  const [activeTarget, setActiveTarget] = useState<Target>('moon')
  const [activeBudget, setActiveBudget] = useState<Budget>('beginner')

  const settings = SETTINGS[activeTarget]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Astrophotography Guide</h2>
      <p className="text-gray-400 text-sm mb-5">Camera settings, equipment, and techniques for capturing the cosmos — from Moon to deep space</p>

      {/* Target selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {([
          { id: 'moon', label: '🌕 Moon', color: '#fbbf24' },
          { id: 'planets', label: '🪐 Planets', color: '#f97316' },
          { id: 'widefield', label: '🌌 Milky Way', color: '#8b5cf6' },
          { id: 'deepsky', label: '🔭 Deep Sky', color: '#3b82f6' },
          { id: 'aurora', label: '🌈 Aurora', color: '#22c55e' },
          { id: 'meteors', label: '☄️ Meteors', color: '#94a3b8' },
        ] as { id: Target; label: string; color: string }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTarget(t.id)}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: activeTarget === t.id ? t.color + '20' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${activeTarget === t.id ? t.color + '60' : 'rgba(255,255,255,0.05)'}`,
              color: activeTarget === t.id ? t.color : '#94a3b8',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Camera settings */}
      <div className="bg-gray-800/60 rounded-xl p-5 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Camera Settings — {settings.target}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ['ISO', settings.iso],
            ['Aperture', settings.aperture],
            ['Shutter', settings.shutter],
            ['Focus', 'Manual (see tips)'],
          ].map(([k, v]) => (
            <div key={k} className="bg-gray-900/60 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">{k}</div>
              <div className="text-white text-xs font-mono font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Focus Technique</div>
        <p className="text-gray-300 text-sm mb-3">{settings.focus}</p>
        <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Pro Tips</div>
        <div className="space-y-2">
          {settings.tips.map((tip, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-indigo-400 flex-shrink-0">→</span>
              <span className="text-gray-300">{tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Equipment */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-gray-400 text-xs uppercase font-semibold">Equipment Recommendations</div>
          <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
            {(['beginner', 'intermediate', 'advanced'] as Budget[]).map(b => (
              <button key={b} onClick={() => setActiveBudget(b)}
                className="px-3 py-1 text-xs rounded-md capitalize transition-all"
                style={{
                  background: activeBudget === b ? 'rgba(99,102,241,0.3)' : 'transparent',
                  color: activeBudget === b ? '#a5b4fc' : '#64748b',
                }}>
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EQUIPMENT.map(eq => (
            <div key={eq.category} className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-500 text-xs uppercase font-semibold mb-1">{eq.category}</div>
              <div className="text-white font-semibold text-sm mb-0.5">{eq[activeBudget].name}</div>
              <div className="text-indigo-400 text-xs mb-2">{eq[activeBudget].price}</div>
              <p className="text-gray-400 text-xs">{eq[activeBudget].why}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly targets */}
      <div>
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Monthly Sky Targets</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {MONTHLY_TARGETS.map(m => (
            <div key={m.month} className="bg-gray-800/50 rounded-xl p-3">
              <div className="text-indigo-400 text-xs font-bold mb-1">{m.month}</div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {m.targets.map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-700/80 text-gray-300">{t}</span>
                ))}
              </div>
              <p className="text-gray-500 text-xs">{m.highlight}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
