import { useRef, useState } from 'react'
import { useLang } from '../i18n/LangContext'

const CURATED = [
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Earth_from_Space.jpg/1280px-Earth_from_Space.jpg',
    title: 'Earth from the ISS',
    author: 'NASA',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg/800px-Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg',
    title: 'Pillars of Creation',
    author: 'NASA/ESA/Hubble',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/The_Milky_Way_galaxy_-_GPN-2000-000983.jpg/1280px-The_Milky_Way_galaxy_-_GPN-2000-000983.jpg',
    title: 'Milky Way Galaxy',
    author: 'NASA',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Hubble_ultra_deep_field.jpg/800px-Hubble_ultra_deep_field.jpg',
    title: 'Hubble Ultra Deep Field',
    author: 'NASA/ESA/Hubble',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Saturn_from_Cassini_Orbiter_%282004-10-06%29.jpg/1280px-Saturn_from_Cassini_Orbiter_%282004-10-06%29.jpg',
    title: 'Saturn from Cassini',
    author: 'NASA/JPL/Cassini',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Aurore_Bor%C3%A9ale_1.jpg/1280px-Aurore_Bor%C3%A9ale_1.jpg',
    title: 'Aurora Borealis',
    author: 'Olivier Staiger',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/NASA_Mars_Rover.jpg/1280px-NASA_Mars_Rover.jpg',
    title: 'Mars Perseverance Rover',
    author: 'NASA/JPL-Caltech',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/1280px-The_Earth_seen_from_Apollo_17.jpg',
    title: 'Blue Marble — Apollo 17',
    author: 'NASA',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/NASA-HS201427a-HubbleUltraDeepField2014-20140603.jpg/800px-NASA-HS201427a-HubbleUltraDeepField2014-20140603.jpg',
    title: 'Hubble eXtreme Deep Field',
    author: 'NASA/ESA/Hubble',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Crab_Nebula.jpg/800px-Crab_Nebula.jpg',
    title: 'Crab Nebula',
    author: 'NASA/ESA/Hubble',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/1280px-FullMoon2010.jpg',
    title: 'Full Moon',
    author: 'Gregory H. Revera',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Above_Gotland.jpg/1280px-Above_Gotland.jpg',
    title: 'Earth from Low Orbit',
    author: 'NASA/ISS',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Double_Helix_Nebula.jpg/800px-Double_Helix_Nebula.jpg',
    title: 'Double Helix Nebula',
    author: 'NASA/JPL-Caltech',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/ISS_above_Earth.jpg/1280px-ISS_above_Earth.jpg',
    title: 'ISS Above Earth',
    author: 'NASA',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/PIA23122-Jupiter-NewHorizons-20070228.jpg/1280px-PIA23122-Jupiter-NewHorizons-20070228.jpg',
    title: 'Jupiter — New Horizons',
    author: 'NASA/Johns Hopkins APL',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Solarsystemscope_texture_8k_stars_milky_way.jpg/1280px-Solarsystemscope_texture_8k_stars_milky_way.jpg',
    title: 'Night Sky Panorama',
    author: 'Solar System Scope',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png',
    title: 'Comet Approaching Sun',
    author: 'ESA',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Perseid_meteor_shower_%28August_2009%29.jpg/1280px-Perseid_meteor_shower_%28August_2009%29.jpg',
    title: 'Perseid Meteor Shower',
    author: 'NASA/JPL',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Eagle_Nebula_from_ESO.jpg/800px-Eagle_Nebula_from_ESO.jpg',
    title: 'Eagle Nebula',
    author: 'ESO',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/GPN-2000-001444.jpg/800px-GPN-2000-001444.jpg',
    title: 'Buzz Aldrin on the Moon',
    author: 'NASA/Neil Armstrong',
  },
]

export default function AstroGallery() {
  const { t } = useLang()
  const inputRef = useRef<HTMLInputElement>(null)
  const [userPhoto, setUserPhoto] = useState<string | null>(null)
  const [selected, setSelected] = useState<typeof CURATED[0] | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setUserPhoto(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const shareX = (title: string) => {
    const text = `🔭 ${title} — via SpaceHub`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://spacehub-nu.vercel.app')}`, '_blank')
  }

  const shareWA = (title: string) => {
    const text = `🔭 ${title} — SpaceHub https://spacehub-nu.vercel.app`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="space-y-5">
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="icon-box">🔭</div>
          <div>
            <h3 className="text-white font-bold text-lg">{t('gallery.title')}</h3>
            <p className="text-gray-500 text-xs">{t('gallery.subtitle')}</p>
          </div>
        </div>

        <div className="divider-glow my-5" />

        {/* Upload section */}
        <div className="mb-6">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          {userPhoto ? (
            <div className="rounded-2xl overflow-hidden border border-indigo-500/30 relative group">
              <img src={userPhoto} alt="Your photo" className="w-full max-h-80 object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  onClick={() => shareX(t('gallery.preview'))}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: 'rgba(29,161,242,0.8)' }}
                >
                  {t('gallery.shareX')}
                </button>
                <button
                  onClick={() => shareWA(t('gallery.preview'))}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: 'rgba(37,211,102,0.8)' }}
                >
                  {t('gallery.shareWA')}
                </button>
              </div>
              <button
                onClick={() => { setUserPhoto(null); if (inputRef.current) inputRef.current.value = '' }}
                className="absolute top-3 right-3 text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#9ca3af' }}
              >
                {t('gallery.chooseAnother')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full py-10 rounded-2xl border-2 border-dashed border-indigo-500/30 hover:border-indigo-500/60 transition-all flex flex-col items-center gap-2"
              style={{ background: 'rgba(99,102,241,0.04)' }}
            >
              <span className="text-4xl">📷</span>
              <span className="text-white font-semibold text-sm">{t('gallery.upload')}</span>
              <span className="text-gray-600 text-xs">JPG, PNG, HEIC</span>
            </button>
          )}
        </div>

        {/* Curated gallery */}
        <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold mb-4">{t('gallery.inspire')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CURATED.map((photo, i) => (
            <button
              key={i}
              onClick={() => setSelected(selected?.title === photo.title ? null : photo)}
              className="relative rounded-xl overflow-hidden group text-left"
              style={{ aspectRatio: '4/3' }}
            >
              <img
                src={photo.url}
                alt={photo.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                <p className="text-white text-[10px] font-bold leading-tight">{photo.title}</p>
                <p className="text-gray-400 text-[9px]">{photo.author}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Selected photo actions */}
        {selected && (
          <div className="mt-4 p-4 rounded-2xl flex items-center justify-between gap-3 flex-wrap" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p className="text-white text-sm font-semibold">{selected.title}</p>
            <div className="flex gap-2">
              <button
                onClick={() => shareX(selected.title)}
                className="text-xs px-3 py-1.5 rounded-xl font-semibold transition"
                style={{ background: 'rgba(29,161,242,0.15)', border: '1px solid rgba(29,161,242,0.3)', color: '#60a5fa' }}
              >
                {t('gallery.shareX')}
              </button>
              <button
                onClick={() => shareWA(selected.title)}
                className="text-xs px-3 py-1.5 rounded-xl font-semibold transition"
                style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#4ade80' }}
              >
                {t('gallery.shareWA')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
