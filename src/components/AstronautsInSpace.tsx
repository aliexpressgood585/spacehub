import { useState, useEffect } from 'react'

interface Astronaut {
  name: string
  craft: string
  photo?: string
  agency?: string
  nationality?: string
}

const FALLBACK: Astronaut[] = [
  { name: 'Oleg Kononenko',       craft: 'ISS', agency: 'Roscosmos' },
  { name: 'Nikolai Chub',         craft: 'ISS', agency: 'Roscosmos' },
  { name: 'Tracy Caldwell Dyson', craft: 'ISS', agency: 'NASA' },
  { name: 'Butch Wilmore',        craft: 'ISS', agency: 'NASA' },
  { name: 'Sunita Williams',      craft: 'ISS', agency: 'NASA' },
  { name: 'Nick Hague',           craft: 'ISS', agency: 'NASA' },
  { name: 'Aleksandr Gorbunov',   craft: 'ISS', agency: 'Roscosmos' },
]

const CRAFT_CONFIG: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  ISS:      { emoji: '🛸', color: '#818cf8', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.2)' },
  Tiangong: { emoji: '🚀', color: '#f87171', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)' },
  CSS:      { emoji: '🔴', color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.2)' },
}

const AVATAR_COLORS = [
  ['#4f46e5','#7c3aed'], ['#0891b2','#0e7490'], ['#059669','#047857'],
  ['#7c3aed','#6d28d9'], ['#db2777','#be185d'], ['#d97706','#b45309'],
  ['#dc2626','#b91c1c'],
]

export default function AstronautsInSpace() {
  const [people, setPeople] = useState<Astronaut[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([p, new Promise<T>(res => setTimeout(() => res(fallback), ms))])

    const notifyP = withTimeout(
      fetch('https://api.open-notify.org/astros.json')
        .then(r => r.json())
        .then(d => d.people as { name: string; craft: string }[])
        .catch(() => FALLBACK.map(p => ({ name: p.name, craft: p.craft }))),
      4000,
      FALLBACK.map(p => ({ name: p.name, craft: p.craft }))
    )

    const photosP = withTimeout(
      fetch('https://ll.thespacedevs.com/2.2.0/astronaut/?in_space=true&limit=30&format=json')
        .then(r => r.json())
        .then((d: { results: { name: string; profile_image_thumbnail?: string; profile_image?: string; agency?: { name: string }; nationality?: string }[] }) => d.results)
        .catch(() => []),
      5000,
      []
    )

    Promise.all([notifyP, photosP]).then(([names, photos]) => {
      const merged: Astronaut[] = names.map(n => {
        const match = photos.find(p =>
          p.name.toLowerCase().includes(n.name.split(' ').pop()!.toLowerCase()) ||
          n.name.toLowerCase().includes(p.name.split(' ').pop()!.toLowerCase())
        )
        return {
          name: n.name,
          craft: n.craft,
          photo: match?.profile_image_thumbnail || match?.profile_image,
          agency: match?.agency?.name,
          nationality: match?.nationality,
        }
      })
      setPeople(merged.length > 0 ? merged : FALLBACK)
      setLoading(false)
    })
  }, [])

  const crafts = [...new Set(people.map(p => p.craft))]

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">👨‍🚀</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base" dir="ltr">Who's in Space Now?</h3>
          <p className="text-gray-500 text-xs" dir="ltr">Aboard spacecraft right now</p>
        </div>
        {!loading && <div className="live-badge"><span className="live-dot" /> LIVE</div>}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-2xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {crafts.map(craft => {
            const cfg = CRAFT_CONFIG[craft] ?? CRAFT_CONFIG.ISS
            const crew = people.filter(p => p.craft === craft)
            return (
              <div key={craft}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl mb-2 w-fit" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <span className="text-base">{cfg.emoji}</span>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: cfg.color }}>{craft}</span>
                  <span className="text-xs" style={{ color: cfg.color, opacity: 0.6 }}>· {crew.length} crew</span>
                </div>

                <div className="space-y-1.5">
                  {crew.map((p, idx) => {
                    const [from, to] = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                    const initials = p.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                    return (
                      <div key={p.name} className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {p.photo ? (
                          <img
                            src={p.photo}
                            alt={p.name}
                            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                            style={{ border: `2px solid ${from}60` }}
                            onError={e => {
                              const el = e.target as HTMLImageElement
                              el.style.display = 'none'
                              el.nextElementSibling?.removeAttribute('style')
                            }}
                          />
                        ) : null}
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                          style={p.photo ? { display: 'none', background: `linear-gradient(135deg, ${from}, ${to})` } : { background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 2px 8px ${from}40` }}
                        >
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-300 font-medium truncate">{p.name}</p>
                          {p.agency && <p className="text-[10px] text-gray-600">{p.agency}</p>}
                        </div>
                        <span className="text-[10px] text-gray-700 font-medium flex-shrink-0">{craft}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="flex items-center justify-center gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-lg">🌍</span>
            <p className="text-xs text-gray-600">
              <span className="text-white font-bold">{people.length}</span> humans currently off planet
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
