import { useState, useEffect } from 'react'

interface JWSTImage {
  title: string
  url: string
  nasa_id: string
  date: string
}

const CURATED_JWST: JWSTImage[] = [
  { title: 'Carina Nebula — Cosmic Cliffs', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Webb%27s_First_Deep_Field_%28NIRCam_Image%29_%28weic2219a%29.jpg/800px-Webb%27s_First_Deep_Field_%28NIRCam_Image%29_%28weic2219a%29.jpg', nasa_id: 'jwst-1', date: '2022-07-11' },
  { title: 'Stephan\'s Quintet', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Webb%27s_Grand_Design_Spiral_Galaxy_IC_5332_%28NIRCam_Image%29.jpg/800px-Webb%27s_Grand_Design_Spiral_Galaxy_IC_5332_%28NIRCam_Image%29.jpg', nasa_id: 'jwst-2', date: '2022-07-12' },
  { title: 'Southern Ring Nebula', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Southern_Ring_Nebula_-_Webb_Space_Telescope%2C_July_2022.png/800px-Southern_Ring_Nebula_-_Webb_Space_Telescope%2C_July_2022.png', nasa_id: 'jwst-3', date: '2022-07-12' },
  { title: 'Pillars of Creation (JWST)', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Webb_Pillars_of_Creation.jpg/800px-Webb_Pillars_of_Creation.jpg', nasa_id: 'jwst-4', date: '2022-10-19' },
  { title: 'Cartwheel Galaxy', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/James_Webb_Space_Telescope_image_of_Cartwheel_Galaxy.png/800px-James_Webb_Space_Telescope_image_of_Cartwheel_Galaxy.png', nasa_id: 'jwst-5', date: '2022-08-02' },
]

export default function JWSTGallery() {
  const [images, setImages] = useState<JWSTImage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<JWSTImage | null>(null)

  useEffect(() => {
    fetch('https://images-api.nasa.gov/search?q=james+webb+space+telescope+nebula&media_type=image&page_size=20')
      .then(r => r.json())
      .then((data: { collection: { items: { data: { title: string; date_created: string; nasa_id: string }[]; links?: { href: string }[] }[] } }) => {
        const items = data.collection.items
          .filter(i => i.links?.[0]?.href)
          .slice(0, 9)
          .map(i => ({
            title: i.data[0]?.title ?? 'JWST Image',
            url: i.links![0].href,
            nasa_id: i.data[0]?.nasa_id ?? '',
            date: i.data[0]?.date_created?.slice(0, 10) ?? '',
          }))
        setImages(items.length >= 4 ? items : CURATED_JWST)
        setLoading(false)
      })
      .catch(() => { setImages(CURATED_JWST); setLoading(false) })
  }, [])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🔭</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">James Webb Space Telescope</h3>
          <p className="text-gray-500 text-xs">Latest JWST imagery</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#c084fc' }}>JWST</span>
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '1', background: 'rgba(168,85,247,0.08)' }} />
          ))}
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <button
                key={img.nasa_id || i}
                onClick={() => setSelected(selected?.nasa_id === img.nasa_id ? null : img)}
                className="relative rounded-xl overflow-hidden group"
                style={{ aspectRatio: '1' }}
              >
                <img
                  src={img.url}
                  alt={img.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <p className="absolute bottom-1 left-1 right-1 text-white text-[9px] font-bold line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity leading-tight">{img.title}</p>
              </button>
            ))}
          </div>

          {selected && (
            <div className="mt-4 p-4 rounded-2xl" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <p className="text-purple-300 font-semibold text-sm mb-1">{selected.title}</p>
              <p className="text-gray-600 text-xs mb-3">{selected.date}</p>
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-xl font-semibold"
                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}
              >
                View Full Resolution ↗
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
