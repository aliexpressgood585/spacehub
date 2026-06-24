import { useState } from 'react'

interface Milestone {
  year: number
  date: string
  title: string
  description: string
  icon: string
  category: 'human' | 'robotic' | 'discovery' | 'technology'
  significance: number // 1-5
}

const MILESTONES: Milestone[] = [
  { year: 1957, date: 'Oct 4, 1957', title: 'Sputnik 1 Launched', icon: '🛰️', category: 'robotic', significance: 5,
    description: 'The Soviet Union launches the first artificial satellite, beginning the Space Age. Its radio beeps were heard worldwide.' },
  { year: 1957, date: 'Nov 3, 1957', title: 'Laika in Space', icon: '🐕', category: 'human', significance: 4,
    description: 'Laika the dog becomes the first living creature in Earth orbit aboard Sputnik 2, paving the way for human spaceflight.' },
  { year: 1961, date: 'Apr 12, 1961', title: 'Yuri Gagarin — First Human in Space', icon: '👨‍🚀', category: 'human', significance: 5,
    description: '27-year-old Soviet cosmonaut Yuri Gagarin orbits Earth in Vostok 1 for 108 minutes. "Poyekhali!" (Let\'s go!)' },
  { year: 1963, date: 'Jun 16, 1963', title: 'Valentina Tereshkova — First Woman', icon: '👩‍🚀', category: 'human', significance: 5,
    description: 'Soviet cosmonaut Valentina Tereshkova becomes the first woman in space, completing 48 orbits aboard Vostok 6.' },
  { year: 1965, date: 'Mar 18, 1965', title: 'First Spacewalk', icon: '🌌', category: 'human', significance: 5,
    description: 'Alexei Leonov exits Voskhod 2 for 12 minutes — the first-ever extravehicular activity (EVA) in history.' },
  { year: 1966, date: 'Feb 3, 1966', title: 'Luna 9 — First Soft Moon Landing', icon: '🌕', category: 'robotic', significance: 4,
    description: 'Soviet Luna 9 spacecraft achieves the first soft landing on the Moon, transmitting photographs from the surface.' },
  { year: 1969, date: 'Jul 20, 1969', title: 'Apollo 11 — Moon Landing', icon: '🚀', category: 'human', significance: 5,
    description: 'Neil Armstrong and Buzz Aldrin become the first humans on the Moon. "One small step for man, one giant leap for mankind."' },
  { year: 1971, date: 'Apr 19, 1971', title: 'Salyut 1 — First Space Station', icon: '🏗️', category: 'technology', significance: 4,
    description: 'The Soviet Union launches the world\'s first space station, Salyut 1, orbiting Earth for 175 days.' },
  { year: 1972, date: 'Mar 3, 1972', title: 'Pioneer 10 — First Outer Solar System', icon: '🌌', category: 'robotic', significance: 4,
    description: 'Pioneer 10 launches on a mission to Jupiter and beyond, becoming the first spacecraft to travel through the asteroid belt.' },
  { year: 1973, date: 'May 14, 1973', title: 'Skylab — US Space Station', icon: '🔭', category: 'technology', significance: 4,
    description: 'NASA launches Skylab, America\'s first space station. Three crews conducted extensive scientific experiments over its lifetime.' },
  { year: 1977, date: 'Sep 5, 1977', title: 'Voyager 1 Launched', icon: '🛸', category: 'robotic', significance: 5,
    description: 'Voyager 1 begins its epic journey to the outer solar system. In 2012, it became the first human-made object to enter interstellar space.' },
  { year: 1981, date: 'Apr 12, 1981', title: 'Space Shuttle Columbia — First Flight', icon: '✈️', category: 'technology', significance: 5,
    description: 'NASA\'s Space Shuttle Columbia makes its maiden flight, inaugurating the era of reusable spacecraft.' },
  { year: 1986, date: 'Feb 20, 1986', title: 'Mir Space Station', icon: '🏗️', category: 'technology', significance: 4,
    description: 'The Soviet Union launches Mir, the first permanently crewed space station, which hosted international crews for 15 years.' },
  { year: 1990, date: 'Apr 24, 1990', title: 'Hubble Space Telescope', icon: '🔭', category: 'technology', significance: 5,
    description: 'The Hubble Space Telescope is launched, eventually revolutionizing our understanding of the universe with millions of stunning images.' },
  { year: 1995, date: 'Jun 29, 1995', title: 'Shuttle-Mir Program', icon: '🤝', category: 'human', significance: 3,
    description: 'Space Shuttle Atlantis docks with Mir for the first time, marking a new era of US-Russia space cooperation.' },
  { year: 1997, date: 'Jul 4, 1997', title: 'Mars Pathfinder Lands', icon: '🔴', category: 'robotic', significance: 4,
    description: 'NASA\'s Mars Pathfinder and Sojourner rover land on Mars, the first successful Mars lander in over 20 years.' },
  { year: 1998, date: 'Nov 20, 1998', title: 'ISS Construction Begins', icon: '🌍', category: 'technology', significance: 5,
    description: 'The first module of the International Space Station, Zarya, is launched — beginning the largest cooperative space project in history.' },
  { year: 2000, date: 'Nov 2, 2000', title: 'ISS Permanently Crewed', icon: '👨‍🚀', category: 'human', significance: 4,
    description: 'Expedition 1 arrives at the ISS, beginning a continuous human presence in space that has lasted over 24 years.' },
  { year: 2003, date: 'Oct 15, 2003', title: 'China — Third Nation in Space', icon: '🇨🇳', category: 'human', significance: 4,
    description: 'Yang Liwei becomes the first Chinese taikonaut in space aboard Shenzhou 5, making China the third nation to achieve independent human spaceflight.' },
  { year: 2004, date: 'Jan 3, 2004', title: 'Spirit Rover Lands on Mars', icon: '🔴', category: 'robotic', significance: 4,
    description: 'NASA\'s Spirit rover lands in Gusev Crater, Mars. It operated for 2,208 days — vastly exceeding its 90-day mission.' },
  { year: 2006, date: 'Jan 19, 2006', title: 'New Horizons Launched', icon: '💫', category: 'robotic', significance: 4,
    description: 'NASA launches New Horizons on a 9-year journey to Pluto, which it would reach in July 2015 with stunning close-up images.' },
  { year: 2012, date: 'Aug 5, 2012', title: 'Curiosity Lands on Mars', icon: '🔴', category: 'robotic', significance: 5,
    description: 'NASA\'s Curiosity rover lands in Gale Crater using the "sky crane" system, becoming the largest rover ever sent to Mars.' },
  { year: 2015, date: 'Jul 14, 2015', title: 'New Horizons Flies by Pluto', icon: '❄️', category: 'robotic', significance: 4,
    description: 'New Horizons makes its closest approach to Pluto, revealing a heart-shaped nitrogen glacier and towering ice mountains.' },
  { year: 2016, date: 'Apr 27, 2016', title: 'SpaceX Lands Falcon 9 Booster', icon: '🚀', category: 'technology', significance: 5,
    description: 'SpaceX successfully lands its Falcon 9 first stage for the first time, revolutionizing rocket reusability and reducing launch costs.' },
  { year: 2019, date: 'Apr 10, 2019', title: 'First Black Hole Image', icon: '⚫', category: 'discovery', significance: 5,
    description: 'The Event Horizon Telescope releases the first-ever image of a black hole — M87*, 55 million light-years away.' },
  { year: 2020, date: 'May 30, 2020', title: 'SpaceX Crew Dragon — Humans to ISS', icon: '🐉', category: 'human', significance: 5,
    description: 'SpaceX Demo-2 carries NASA astronauts to the ISS for the first time, restoring US human launch capability after 9 years.' },
  { year: 2021, date: 'Apr 19, 2021', title: 'Ingenuity — First Mars Helicopter', icon: '🚁', category: 'robotic', significance: 5,
    description: 'NASA\'s Ingenuity helicopter makes the first powered, controlled flight on another planet — 17 seconds on Mars.' },
  { year: 2021, date: 'Dec 25, 2021', title: 'James Webb Space Telescope', icon: '🌌', category: 'technology', significance: 5,
    description: 'JWST launches, eventually delivering the deepest and sharpest infrared images of the universe ever captured.' },
  { year: 2022, date: 'Nov 16, 2022', title: 'Artemis I — Return to Moon', icon: '🌙', category: 'human', significance: 4,
    description: 'NASA\'s Orion spacecraft flies around the Moon on an uncrewed mission, paving the way for Artemis II and eventual crewed lunar landing.' },
  { year: 2024, date: 'Jun 5, 2024', title: 'Boeing Starliner First Crew', icon: '🚀', category: 'human', significance: 3,
    description: 'Boeing\'s Starliner carries its first crew (Butch Wilmore and Suni Williams) to the ISS, completing its crewed flight test.' },
]

const CATEGORY_COLORS: Record<string, string> = {
  human: '#3b82f6',
  robotic: '#8b5cf6',
  discovery: '#f59e0b',
  technology: '#10b981',
}

const CATEGORY_LABELS: Record<string, string> = {
  human: 'Human Spaceflight',
  robotic: 'Robotic Missions',
  discovery: 'Scientific Discovery',
  technology: 'Technology Milestones',
}

export default function SpaceTimeline() {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = MILESTONES.filter(m => {
    const matchCat = filter === 'all' || m.category === filter
    const matchSearch = !search || m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase()) ||
      m.year.toString().includes(search)
    return matchCat && matchSearch
  })

  return (
    <div className="card-dark p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-2xl">🕰️</span>
        <div>
          <h2 className="text-xl font-bold text-white">Space Exploration Timeline</h2>
          <p className="text-slate-400 text-sm">67 years of human spaceflight</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search milestones…"
          className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'human', 'robotic', 'discovery', 'technology'].map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={{
                borderColor: cat === 'all' ? '#6b7280' : CATEGORY_COLORS[cat],
                background: filter === cat ? (cat === 'all' ? '#6b7280' : CATEGORY_COLORS[cat]) : 'transparent',
                color: filter === cat ? '#fff' : cat === 'all' ? '#9ca3af' : CATEGORY_COLORS[cat],
              }}
            >
              {cat === 'all' ? 'All' : CATEGORY_LABELS[cat].split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-4">{filtered.length} milestone{filtered.length !== 1 ? 's' : ''}</div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-700" />
        <div className="space-y-1">
          {filtered.map((m, i) => {
            const isExpanded = expanded === `${m.year}-${m.title}`
            const isFirst = i === 0 || filtered[i - 1].year !== m.year
            return (
              <div key={`${m.year}-${m.title}`}>
                {isFirst && (
                  <div className="pl-14 pt-2 pb-1">
                    <span className="text-xs font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded">{m.year}</span>
                  </div>
                )}
                <button
                  onClick={() => setExpanded(isExpanded ? null : `${m.year}-${m.title}`)}
                  className="w-full text-left relative pl-14 pr-3 py-3 rounded-xl hover:bg-slate-800/50 transition-all"
                >
                  {/* Dot */}
                  <div
                    className="absolute left-3.5 top-4 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]"
                    style={{ borderColor: CATEGORY_COLORS[m.category], background: '#0f172a' }}
                  >
                    {m.significance === 5 ? '★' : '·'}
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base">{m.icon}</span>
                        <span className="text-white font-semibold text-sm">{m.title}</span>
                        {m.significance === 5 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: CATEGORY_COLORS[m.category] + '33',
                            color: CATEGORY_COLORS[m.category]
                          }}>KEY</span>
                        )}
                      </div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{m.date}</div>
                      {isExpanded && (
                        <p className="text-slate-300 text-sm mt-2 leading-relaxed">{m.description}</p>
                      )}
                    </div>
                    <span className="text-slate-600 text-xs mt-1 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category legend */}
      <div className="mt-6 flex flex-wrap gap-3 pt-4 border-t border-slate-800">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[key] }} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-auto">
          <span className="text-yellow-400">★</span> = Landmark event
        </div>
      </div>
    </div>
  )
}
