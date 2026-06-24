import { useState, useEffect } from 'react'

interface JWSTImage {
  title: string
  url: string
  date: string
}

// 9 verified JWST images from Wikimedia Commons — loaded with no-referrer to bypass hotlink protection
const CURATED: JWSTImage[] = [
  { title: "Webb's First Deep Field — SMACS 0723",       date: '2022-07-11', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Webb%27s_First_Deep_Field_%28NIRCam_Image%29_%28weic2219a%29.jpg/640px-Webb%27s_First_Deep_Field_%28NIRCam_Image%29_%28weic2219a%29.jpg' },
  { title: 'Carina Nebula — Cosmic Cliffs',              date: '2022-07-12', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Webb-Carina-Nebula-NIRCam.png/640px-Webb-Carina-Nebula-NIRCam.png' },
  { title: "Stephan's Quintet",                          date: '2022-07-12', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Stephan%27s_Quintet_JWST_NIRCam%2BMIRIv2.png/640px-Stephan%27s_Quintet_JWST_NIRCam%2BMIRIv2.png' },
  { title: 'Southern Ring Nebula',                       date: '2022-07-12', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Southern_Ring_Nebula_-_Webb_Space_Telescope%2C_July_2022.png/640px-Southern_Ring_Nebula_-_Webb_Space_Telescope%2C_July_2022.png' },
  { title: 'Pillars of Creation (NIRCam)',               date: '2022-10-19', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Webb_Pillars_of_Creation.jpg/640px-Webb_Pillars_of_Creation.jpg' },
  { title: 'Cartwheel Galaxy',                           date: '2022-08-02', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/James_Webb_Space_Telescope_image_of_Cartwheel_Galaxy.png/640px-James_Webb_Space_Telescope_image_of_Cartwheel_Galaxy.png' },
  { title: 'Tarantula Nebula (30 Doradus)',              date: '2022-09-06', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Webb_Tarantula_Nebula.jpg/640px-Webb_Tarantula_Nebula.jpg' },
  { title: 'IC 5332 — Grand Design Spiral',              date: '2022-10-12', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Webb%27s_Grand_Design_Spiral_Galaxy_IC_5332_%28NIRCam_Image%29.jpg/640px-Webb%27s_Grand_Design_Spiral_Galaxy_IC_5332_%28NIRCam_Image%29.jpg' },
  { title: 'NGC 1365 — Great Barred Spiral',             date: '2023-02-02', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Webb_NGC_1365.jpg/640px-Webb_NGC_1365.jpg' },
]

const GRADIENTS = [
  'linear-gradient(135deg,#1a0533 0%,#4c1d95 50%,#7c3aed 100%)',
  'linear-gradient(135deg,#0c1445 0%,#1e3a8a 50%,#3b82f6 100%)',
  'linear-gradient(135deg,#1a0022 0%,#701a75 50%,#c026d3 100%)',
  'linear-gradient(135deg,#061a10 0%,#14532d 50%,#16a34a 100%)',
  'linear-gradient(135deg,#1c1917 0%,#78350f 50%,#d97706 100%)',
  'linear-gradient(135deg,#0f172a 0%,#0f3460 50%,#16213e 100%)',
  'linear-gradient(135deg,#310154 0%,#c71585 50%,#ff1493 100%)',
  'linear-gradient(135deg,#1a0533 0%,#6d28d9 50%,#a78bfa 100%)',
  'linear-gradient(135deg,#0a1628 0%,#0369a1 50%,#0ea5e9 100%)',
]

export default function JWSTGallery() {
  const [images,    setImages]    = useState<JWSTImage[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<JWSTImage | null>(null)
  const [errors,    setErrors]    = useState<Set<number>>(new Set())

  useEffect(() => {
    // Primary: NASA APOD batch for the JWST first-light week (July 12–19 2022)
    // APOD images are served from apod.nasa.gov — reliable CDN, proper CORS
    fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&start_date=2022-07-12&end_date=2022-07-19')
      .then(r => r.json())
      .then((data: Array<{ title: string; url: string; date: string; media_type: string }>) => {
        const imgs = Array.isArray(data)
          ? data.filter(d => d.media_type === 'image').map(d => ({ title: d.title, url: d.url, date: d.date }))
          : []
        setImages(imgs.length >= 4 ? imgs : CURATED)
        setLoading(false)
      })
      .catch(() => { setImages(CURATED); setLoading(false) })
  }, [])

  const markError = (i: number) => setErrors(prev => new Set(prev).add(i))

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🔭</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">James Webb Space Telescope</h3>
          <p className="text-gray-500 text-xs">JWST First Light &amp; Discovery Images</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold"
          style={{ background:'rgba(168,85,247,0.15)', border:'1px solid rgba(168,85,247,0.4)', color:'#c084fc' }}>JWST</span>
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio:'1', background:'rgba(168,85,247,0.08)' }} />
          ))}
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <button key={i}
                onClick={() => setSelected(selected === img ? null : img)}
                className="relative rounded-xl overflow-hidden group"
                style={{ aspectRatio:'1' }}
              >
                {errors.has(i) ? (
                  /* Per-image CSS nebula fallback — no broken icons ever */
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2"
                    style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                    <div className="text-2xl">🌌</div>
                    <p className="text-white text-[8px] font-bold text-center leading-tight line-clamp-3">{img.title}</p>
                  </div>
                ) : (
                  <img
                    src={img.url}
                    alt={img.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => markError(i)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <p className="absolute bottom-1 left-1 right-1 text-white text-[9px] font-bold line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity leading-tight">
                  {img.title}
                </p>
              </button>
            ))}
          </div>

          {selected && (
            <div className="mt-4 p-4 rounded-2xl"
              style={{ background:'rgba(168,85,247,0.08)', border:'1px solid rgba(168,85,247,0.2)' }}>
              <p className="text-purple-300 font-semibold text-sm mb-1">{selected.title}</p>
              <p className="text-gray-600 text-xs mb-3">{selected.date}</p>
              <a href={selected.url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-xl font-semibold"
                style={{ background:'rgba(168,85,247,0.15)', border:'1px solid rgba(168,85,247,0.3)', color:'#c084fc' }}>
                View Full Resolution ↗
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
