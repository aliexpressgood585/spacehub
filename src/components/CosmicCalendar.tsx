import { useState, useRef, useEffect } from 'react'

interface SpaceEvent {
  year: number
  event: string
  significance: string
  emoji: string
}

const EVENTS: Record<string, SpaceEvent[]> = {
  '01-06': [{ year: 1998, event: 'Lunar Prospector launched to map Moon\'s surface and detect water ice at the poles', significance: 'Confirmed water ice at lunar poles — critical for future Moon bases', emoji: '🌕' }],
  '01-14': [{ year: 2005, event: 'Huygens probe successfully lands on Titan, Saturn\'s largest moon', significance: 'First landing in the outer solar system; revealed methane lakes and rivers', emoji: '🪐' }],
  '01-16': [{ year: 2003, event: 'Space Shuttle Columbia\'s final launch (STS-107)', significance: 'Columbia disintegrated on re-entry Feb 1, 2003; loss of all 7 crew', emoji: '🚀' }],
  '01-19': [{ year: 2006, event: 'New Horizons launched toward Pluto', significance: 'Took 9.5 years to reach Pluto; revealed heart-shaped nitrogen ice plain', emoji: '🛸' }],
  '01-27': [{ year: 1967, event: 'Apollo 1 fire on the launch pad at Cape Kennedy; three astronauts lost', significance: 'Gus Grissom, Ed White, Roger Chaffee died; led to major redesign of Apollo spacecraft', emoji: '🔥' }],
  '01-28': [{ year: 1986, event: 'Space Shuttle Challenger breaks apart 73 seconds after launch', significance: 'Loss of all 7 crew members; led to 32-month shuttle stand-down and major safety reforms', emoji: '💔' }],
  '02-01': [{ year: 2003, event: 'Space Shuttle Columbia disintegrates during re-entry', significance: 'All 7 crew members lost; foam strike from launch had damaged heat shield', emoji: '💔' }],
  '02-14': [{ year: 1990, event: 'Voyager 1 photographs the "Pale Blue Dot" from 6 billion km away', significance: 'Carl Sagan described Earth as "a mote of dust suspended in a sunbeam"', emoji: '🌍' }],
  '02-18': [{ year: 1930, event: 'Clyde Tombaugh discovers Pluto at Lowell Observatory', significance: 'Classified as a planet until 2006; redefined our understanding of the outer solar system', emoji: '🔭' }],
  '02-20': [{ year: 1962, event: 'John Glenn becomes the first American to orbit Earth (Friendship 7)', significance: 'Completed 3 orbits in 4h 55m; turned the tide of the Space Race', emoji: '🌍' }],
  '03-03': [{ year: 1972, event: 'Pioneer 10 launched — first spacecraft designed to leave the solar system', significance: 'First to cross the asteroid belt and reach Jupiter; carries a gold plaque for extraterrestrials', emoji: '🚀' }],
  '03-18': [{ year: 1965, event: 'Alexei Leonov performs first ever spacewalk (Voskhod 2)', significance: '12 minutes outside the spacecraft; nearly couldn\'t re-enter due to suit inflation', emoji: '👨‍🚀' }],
  '04-01': [{ year: 1960, event: 'TIROS-1, first successful weather satellite, launched', significance: 'Revolutionized weather forecasting; beginning of the Earth observation era', emoji: '🌦️' }],
  '04-12': [
    { year: 1961, event: 'Yuri Gagarin becomes the first human in space (Vostok 1)', significance: '108-minute flight; changed history and ignited the Space Race', emoji: '🚀' },
    { year: 1981, event: 'Space Shuttle Columbia launches on STS-1, the first shuttle mission', significance: 'First operational reusable spacecraft; ushered in the shuttle era', emoji: '🚀' },
  ],
  '04-17': [{ year: 1970, event: 'Apollo 13 crew splashes down safely after harrowing emergency', significance: '"Houston, we have a problem" — the crew survived against the odds using the LEM as a lifeboat', emoji: '🛸' }],
  '04-24': [{ year: 1990, event: 'Hubble Space Telescope launched aboard STS-31', significance: 'Despite initial mirror flaw, became the most scientifically productive telescope in history', emoji: '🔭' }],
  '05-05': [{ year: 1961, event: 'Alan Shepard becomes the first American in space (Freedom 7)', significance: '15-minute suborbital flight; answered Gagarin\'s achievement 3 weeks earlier', emoji: '🚀' }],
  '05-14': [{ year: 1973, event: 'Skylab space station launched — first American space station', significance: 'Hosted 3 crews for 171 days total; showed humans could live and work in orbit for months', emoji: '🛸' }],
  '05-25': [{ year: 1961, event: 'President JFK challenges the nation to land on the Moon before the decade ends', significance: 'The speech that launched the Apollo program; Americans landed on July 20, 1969', emoji: '🌕' }],
  '05-29': [{ year: 1919, event: 'Solar eclipse confirms Einstein\'s General Theory of Relativity', significance: 'Eddington measured light bending around the Sun; made Einstein world-famous overnight', emoji: '☀️' }],
  '06-03': [{ year: 1965, event: 'Ed White performs first American spacewalk (Gemini 4)', significance: '23 minutes outside; did not want to come back in — "It\'s the saddest moment of my life"', emoji: '👨‍🚀' }],
  '06-16': [{ year: 1963, event: 'Valentina Tereshkova becomes the first woman in space (Vostok 6)', significance: 'She spent 3 days in orbit — more time in space than all US astronauts combined at that point', emoji: '👩‍🚀' }],
  '06-18': [{ year: 1983, event: 'Sally Ride becomes first American woman in space (STS-7)', significance: 'Broke barriers; later founded Sally Ride Science to inspire girls in STEM', emoji: '👩‍🚀' }],
  '07-04': [{ year: 1997, event: 'Mars Pathfinder lands; Sojourner rover explores Mars surface', significance: 'First Mars rover; proved the concept of affordable planetary exploration', emoji: '🔴' }],
  '07-16': [{ year: 1969, event: 'Apollo 11 launches from Kennedy Space Center', significance: 'The mission that would deliver humanity\'s first footsteps on another world 4 days later', emoji: '🚀' }],
  '07-20': [
    { year: 1969, event: 'Neil Armstrong and Buzz Aldrin land on the Moon (Apollo 11)', significance: '"One small step for man, one giant leap for mankind" — 530 million people watched live', emoji: '🌕' },
    { year: 1976, event: 'Viking 1 lander touches down on Mars — first successful Mars landing', significance: 'First images from Mars surface; life detection experiments gave ambiguous results', emoji: '🔴' },
  ],
  '08-06': [{ year: 2012, event: 'Curiosity rover lands in Gale Crater, Mars (Sky Crane landing)', significance: 'Most complex Mars landing ever; found ancient habitable lake environment in Jezero', emoji: '🔴' }],
  '08-12': [{ year: 1977, event: 'Space Shuttle Enterprise makes its first atmospheric glide test', significance: 'Named after the USS Enterprise by fans; never flew in space but validated the shuttle design', emoji: '🚀' }],
  '08-20': [{ year: 1977, event: 'Voyager 2 launches (before Voyager 1) on Grand Tour of outer planets', significance: 'Only spacecraft to visit all 4 gas giants; still transmitting from interstellar space', emoji: '🛸' }],
  '09-05': [{ year: 1977, event: 'Voyager 1 launches toward Jupiter and beyond', significance: 'Now the most distant human-made object — over 24 billion km from Earth and still talking', emoji: '🛸' }],
  '09-12': [{ year: 1962, event: 'JFK delivers "We Choose to Go to the Moon" speech at Rice University', significance: '"We choose to go to the Moon in this decade and do the other things, not because they are easy, but because they are hard"', emoji: '🌕' }],
  '09-23': [{ year: 1846, event: 'Neptune discovered by Urbain Le Verrier and Johann Galle', significance: 'Predicted mathematically before being observed — triumph of Newtonian gravity', emoji: '🔵' }],
  '10-04': [{ year: 1957, event: 'Sputnik 1 launched — the Space Age begins', significance: '"Beep beep beep" heard round the world; shocked the West and sparked the Space Race', emoji: '🛰️' }],
  '10-10': [{ year: 1967, event: 'Outer Space Treaty enters into force', significance: 'Bans nuclear weapons in space and on Moon; treats space as province of all mankind', emoji: '🌍' }],
  '10-15': [{ year: 1997, event: 'Cassini-Huygens spacecraft launches to Saturn', significance: '7-year journey; 13 years at Saturn transformed our understanding of the ringed planet and its moons', emoji: '🪐' }],
  '10-29': [{ year: 1998, event: 'John Glenn returns to space at 77 — oldest human in orbit (STS-95)', significance: '36 years after his historic first orbital flight; participated in aging research', emoji: '👴' }],
  '11-02': [{ year: 2000, event: 'First crew arrives at the International Space Station (Expedition 1)', significance: 'Bill Shepherd and Sergei Krikalev began continuous human presence in space — over 24 years ago', emoji: '🛸' }],
  '11-03': [{ year: 1957, event: 'Laika, the first animal in orbit (Sputnik 2)', significance: 'Proved living creatures could survive launch; Laika did not survive but paved the way for human spaceflight', emoji: '🐕' }],
  '11-20': [{ year: 1998, event: 'Zarya module launched — first piece of the International Space Station', significance: 'Beginning of humanity\'s most ambitious cooperative engineering project', emoji: '🛸' }],
  '12-11': [{ year: 1972, event: 'Apollo 17 crew lands at Taurus-Littrow Valley — final Moon landing', significance: 'Gene Cernan and Jack Schmitt (last geologist on Moon) collected 110 kg of samples', emoji: '🌕' }],
  '12-14': [{ year: 1972, event: 'Gene Cernan becomes last human to walk on the Moon', significance: '"We leave as we came and, God willing, as we shall return, with peace and hope for all mankind"', emoji: '🌕' }],
  '12-21': [{ year: 1968, event: 'Apollo 8 launches — first humans to leave Earth orbit', significance: 'Frank Borman, Jim Lovell, Bill Anders became first humans to see Earth as a whole sphere', emoji: '🌍' }],
  '12-24': [{ year: 1968, event: '"Earthrise" — Apollo 8 crew photographs Earth rising over the Moon', significance: 'Called "the most influential environmental photograph ever taken" by nature photographer Galen Rowell', emoji: '🌍' }],
  '12-25': [{ year: 2021, event: 'James Webb Space Telescope launches from Kourou, French Guiana', significance: 'Most powerful telescope ever built; opened a new window on the universe\'s first galaxies', emoji: '🔭' }],
}

const MOON_NAMES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent']
const MOON_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']

function getMoonPhase(date: Date): { phase: number; name: string; icon: string } {
  const known = new Date('2000-01-06T18:14:00Z')
  const synodic = 29.53059
  const diff = (date.getTime() - known.getTime()) / (1000 * 60 * 60 * 24)
  const raw = ((diff % synodic) + synodic) % synodic
  const phase = raw / synodic
  const idx = Math.round(phase * 8) % 8
  return { phase, name: MOON_NAMES[idx], icon: MOON_ICONS[idx] }
}

function getZodiac(month: number, day: number): string {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '♈ Aries'
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '♉ Taurus'
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return '♊ Gemini'
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return '♋ Cancer'
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '♌ Leo'
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '♍ Virgo'
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return '♎ Libra'
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return '♏ Scorpius'
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return '♐ Sagittarius'
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '♑ Capricornus'
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '♒ Aquarius'
  return '♓ Pisces'
}

function getSpaceEra(year: number): { era: string; color: string; desc: string } {
  if (year < 1957) return { era: 'Pre-Space Age', color: '#94a3b8', desc: 'Born before humanity reached the stars' }
  if (year < 1969) return { era: 'Space Race', color: '#f59e0b', desc: 'Born in the era of Sputnik, Gagarin, and Gemini' }
  if (year < 1981) return { era: 'Apollo & Skylab', color: '#f97316', desc: 'Born when humans walked on the Moon' }
  if (year < 1998) return { era: 'Space Shuttle', color: '#6366f1', desc: 'Born in the era of the reusable spacecraft' }
  if (year < 2011) return { era: 'ISS Construction', color: '#22c55e', desc: 'Born as the International Space Station was being built' }
  if (year < 2020) return { era: 'Commercial Space', color: '#3b82f6', desc: 'Born in the SpaceX era of commercial spaceflight' }
  return { era: 'New Space Age', color: '#a855f7', desc: 'Born as humanity returns to the Moon and eyes Mars' }
}

function MoonCanvas({ phase }: { phase: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const W = 80, H = 80
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#03061a'
    ctx.fillRect(0, 0, W, H)

    const cx = W / 2, cy = H / 2, r = 30
    // Full moon circle
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#d1d5db'; ctx.fill()

    // Shadow
    const p = phase
    ctx.beginPath()
    if (p < 0.5) {
      // Waxing: shadow on left
      ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, true)
      const k = (1 - p * 4)
      ctx.bezierCurveTo(cx + r * k, cy - r, cx + r * k, cy + r, cx, cy + r)
      ctx.fillStyle = '#03061a'; ctx.fill()
    } else {
      // Waning: shadow on right
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false)
      const k = (p - 0.5) * 4 - 1
      ctx.bezierCurveTo(cx + r * k, cy + r, cx + r * k, cy - r, cx, cy - r)
      ctx.fillStyle = '#03061a'; ctx.fill()
    }
  }, [phase])
  return <canvas ref={ref} width={80} height={80} className="rounded-full" />
}

export default function CosmicCalendar() {
  const today = new Date()
  const [year, setYear] = useState(1990)
  const [month, setMonth] = useState(7)
  const [day, setDay] = useState(20)
  const [result, setResult] = useState<null | {
    date: Date; moon: ReturnType<typeof getMoonPhase>; era: ReturnType<typeof getSpaceEra>
    daysAlive: number; orbits: number; moonCycles: number; events: SpaceEvent[]; zodiac: string
  }>(null)

  const calculate = () => {
    const date = new Date(year, month - 1, day)
    if (isNaN(date.getTime())) return
    const moon = getMoonPhase(date)
    const era = getSpaceEra(year)
    const daysAlive = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    const orbits = (daysAlive / 365.25).toFixed(2)
    const moonCycles = Math.floor(daysAlive / 29.53)
    const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const events = EVENTS[key] ?? []
    const zodiac = getZodiac(month, day)
    setResult({ date, moon, era, daysAlive, orbits: parseFloat(orbits), moonCycles, events, zodiac })
  }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Birthday Calculator</h2>
      <p className="text-gray-400 text-sm mb-6">Discover your place in the universe — what was happening in space the day you were born?</p>

      {/* Input */}
      <div className="bg-gray-800/50 rounded-xl p-5 mb-6">
        <div className="text-gray-400 text-sm font-medium mb-3">Enter your birthday</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-gray-500 text-xs block mb-1">Month</label>
            <select value={month} onChange={e => setMonth(+e.target.value)} className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => (
                <option key={m} value={i+1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">Day</label>
            <select value={day} onChange={e => setDay(+e.target.value)} className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
              {Array.from({length: 31}, (_,i) => i+1).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">Year</label>
            <input type="number" value={year} onChange={e => setYear(+e.target.value)} min={1900} max={today.getFullYear()} className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-24" />
          </div>
          <button onClick={calculate} className="btn-shimmer px-5 py-2 text-sm font-semibold">
            🚀 Calculate
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4 animate-fade-up">
          {/* Era banner */}
          <div className="rounded-xl p-4" style={{ background: result.era.color + '15', border: `1px solid ${result.era.color}40` }}>
            <div className="flex items-center gap-3">
              <div className="text-3xl">🌌</div>
              <div>
                <div className="font-bold text-white">{result.era.era} Generation</div>
                <div className="text-sm text-gray-400">{result.era.desc}</div>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{result.orbits.toLocaleString()}</div>
              <div className="text-gray-400 text-xs mt-1">Earth orbits around the Sun</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{result.moonCycles.toLocaleString()}</div>
              <div className="text-gray-400 text-xs mt-1">Full Moon cycles completed</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{result.daysAlive.toLocaleString()}</div>
              <div className="text-gray-400 text-xs mt-1">Days as a cosmic traveler</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{Math.round(result.daysAlive * 29.8).toLocaleString()}</div>
              <div className="text-gray-400 text-xs mt-1">km traveled around Sun (millions)</div>
            </div>
          </div>

          {/* Moon phase */}
          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="text-gray-400 text-sm font-semibold uppercase mb-4">Moon on Your Birth Date</div>
            <div className="flex items-center gap-5">
              <MoonCanvas phase={result.moon.phase} />
              <div>
                <div className="text-xl font-bold text-white">{result.moon.icon} {result.moon.name}</div>
                <div className="text-gray-400 text-sm mt-1">{Math.round(result.moon.phase * 100)}% through the lunar cycle</div>
                <div className="text-gray-500 text-sm mt-1">Sun in constellation: <span className="text-white">{result.zodiac}</span></div>
              </div>
            </div>
          </div>

          {/* Space events on this day */}
          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="text-gray-400 text-sm font-semibold uppercase mb-4">
              Space Events on {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} {day}
            </div>
            {result.events.length > 0 ? (
              <div className="space-y-3">
                {result.events.map((ev, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="text-2xl">{ev.emoji}</div>
                    <div>
                      <div className="text-white font-semibold">{ev.year} — {ev.event}</div>
                      <div className="text-gray-400 text-sm mt-0.5">{ev.significance}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-sm">No major recorded space event on this specific date — but the universe was busy elsewhere! Every day something remarkable happens in the cosmos.</div>
            )}
          </div>

          {/* Fun cosmic facts */}
          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="text-gray-400 text-sm font-semibold uppercase mb-4">Your Cosmic Fingerprint</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-3 bg-gray-900/50 rounded-lg p-3">
                <span className="text-xl">☀️</span>
                <div>
                  <div className="text-white font-semibold">Distance from Sun</div>
                  <div className="text-gray-400">You've traveled ~{(result.daysAlive * 29.78 / 1000).toLocaleString()} million km around the Sun since birth</div>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-gray-900/50 rounded-lg p-3">
                <span className="text-xl">⭐</span>
                <div>
                  <div className="text-white font-semibold">Light travel time</div>
                  <div className="text-gray-400">Light from your birth day is now {(result.orbits).toFixed(1)} light-years from Earth — past the nearest stars</div>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-gray-900/50 rounded-lg p-3">
                <span className="text-xl">🛸</span>
                <div>
                  <div className="text-white font-semibold">ISS orbits since birth</div>
                  <div className="text-gray-400">If ISS existed your whole life, it would have orbited Earth ~{Math.round(result.daysAlive * 15.5).toLocaleString()} times</div>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-gray-900/50 rounded-lg p-3">
                <span className="text-xl">🌌</span>
                <div>
                  <div className="text-white font-semibold">Galactic travel</div>
                  <div className="text-gray-400">Our solar system has traveled ~{Math.round(result.daysAlive * 220 * 86400 / 9.461e12 * 1000) / 1000} light-years through the Milky Way since you were born</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!result && (
        <div className="text-center py-10 text-gray-600">
          <div className="text-6xl mb-4">🎂</div>
          <div className="text-lg text-gray-500">Enter your birthday above to discover your cosmic story</div>
          <div className="text-sm text-gray-600 mt-2">Moon phase, space events, your place in the exploration timeline, and more</div>
        </div>
      )}
    </div>
  )
}
