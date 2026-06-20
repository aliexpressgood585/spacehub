import { useState, useEffect } from 'react'

interface Astronaut { name: string; craft: string }

const FALLBACK: Astronaut[] = [
  { name: 'Sunita Williams', craft: 'ISS' },
  { name: 'Butch Wilmore', craft: 'ISS' },
  { name: 'Nick Hague', craft: 'ISS' },
  { name: 'Aleksandr Gorbunov', craft: 'ISS' },
  { name: 'Oleg Kononenko', craft: 'ISS' },
  { name: 'Nikolai Chub', craft: 'ISS' },
  { name: 'Tracy Caldwell Dyson', craft: 'ISS' },
]

const CRAFT_EMOJI: Record<string, string> = { ISS: '🛸', Tiangong: '🚀', CSS: '🔴' }

export default function AstronautsInSpace() {
  const [people, setPeople] = useState<Astronaut[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('http://api.open-notify.org/astros.json')
      .then(r => r.json())
      .then(d => { setPeople(d.people); setLoading(false) })
      .catch(() => { setPeople(FALLBACK); setLoading(false) })
  }, [])

  const crafts = [...new Set(people.map(p => p.craft))]

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">👨‍🚀</span>
        <div>
          <h3 className="text-white font-bold text-lg">Who's in Space Now?</h3>
          <p className="text-gray-500 text-xs">Astronauts currently aboard spacecraft</p>
        </div>
        {!loading && (
          <div className="ml-auto">
            <div className="live-badge"><span className="live-dot" /> LIVE</div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {crafts.map(craft => (
            <div key={craft}>
              <div className="flex items-center gap-2 mb-2">
                <span>{CRAFT_EMOJI[craft] ?? '🚀'}</span>
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">{craft}</span>
                <span className="text-xs text-gray-600">— {people.filter(p => p.craft === craft).length} people</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {people.filter(p => p.craft === craft).map(p => (
                  <div key={p.name} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 hover:border-indigo-500/30 transition">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-sm text-gray-300">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-700 text-center pt-2">{people.length} humans in space right now</p>
        </div>
      )}
    </div>
  )
}
