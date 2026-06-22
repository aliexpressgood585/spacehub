import { useMemo } from 'react'

const EVENTS: { month: number; day: number; year: number; text: string; emoji: string }[] = [
  { month: 1, day: 27, year: 1967, text: 'Apollo 1 fire kills Grissom, White & Chaffee on the launchpad', emoji: '🔥' },
  { month: 1, day: 31, year: 1958, text: 'Explorer 1, first US satellite, enters orbit', emoji: '🛰️' },
  { month: 2,  day: 1, year: 2003, text: 'Space Shuttle Columbia disintegrates on re-entry, killing all 7 crew', emoji: '🕊️' },
  { month: 2, day: 18, year: 2021, text: 'Perseverance rover lands on Mars in Jezero Crater', emoji: '🔴' },
  { month: 2, day: 20, year: 1962, text: 'John Glenn becomes first American to orbit Earth', emoji: '🌍' },
  { month: 3,  day: 2, year: 1972, text: 'Pioneer 10 launched — first spacecraft to travel through asteroid belt', emoji: '🚀' },
  { month: 3, day: 18, year: 1965, text: 'Alexei Leonov performs first spacewalk in history', emoji: '👨‍🚀' },
  { month: 4,  day: 1, year: 1960, text: 'TIROS 1, world\'s first weather satellite, is launched', emoji: '🌦️' },
  { month: 4, day: 12, year: 1961, text: 'Yuri Gagarin becomes first human in space (Vostok 1)', emoji: '⭐' },
  { month: 4, day: 12, year: 1981, text: 'Space Shuttle Columbia makes its first flight (STS-1)', emoji: '🚀' },
  { month: 4, day: 24, year: 1990, text: 'Hubble Space Telescope launched aboard Discovery', emoji: '🔭' },
  { month: 5,  day: 5, year: 1961, text: 'Alan Shepard becomes first American in space (Freedom 7)', emoji: '🇺🇸' },
  { month: 5, day: 14, year: 1973, text: 'Skylab, America\'s first space station, is launched', emoji: '🛸' },
  { month: 5, day: 25, year: 1961, text: 'JFK announces goal to put a man on the Moon before the decade ends', emoji: '🌙' },
  { month: 6,  day: 3, year: 1965, text: 'Ed White completes first American spacewalk', emoji: '👨‍🚀' },
  { month: 6, day: 16, year: 1963, text: 'Valentina Tereshkova becomes first woman in space (Vostok 6)', emoji: '👩‍🚀' },
  { month: 7,  day: 4, year: 1997, text: 'Mars Pathfinder and Sojourner rover land on Mars', emoji: '🔴' },
  { month: 7, day: 11, year: 1979, text: 'Skylab re-enters atmosphere and breaks apart over Australia', emoji: '🌏' },
  { month: 7, day: 20, year: 1969, text: 'Apollo 11: Neil Armstrong and Buzz Aldrin land on the Moon', emoji: '🌕' },
  { month: 7, day: 20, year: 1976, text: 'Viking 1 becomes first spacecraft to land successfully on Mars', emoji: '🔴' },
  { month: 8, day: 20, year: 1977, text: 'Voyager 2 launched — will visit all 4 outer planets', emoji: '🚀' },
  { month: 8, day: 25, year: 2012, text: 'Voyager 1 becomes first human-made object to enter interstellar space', emoji: '✨' },
  { month: 9,  day: 1, year: 1979, text: 'Pioneer 11 becomes first spacecraft to fly past Saturn', emoji: '🪐' },
  { month: 9, day: 5,  year: 1977, text: 'Voyager 1 launched — will become the farthest human-made object', emoji: '🚀' },
  { month: 10, day: 4, year: 1957, text: 'Sputnik 1, the world\'s first satellite, is launched by the USSR', emoji: '📡' },
  { month: 10, day: 11, year: 1958, text: 'NASA officially opens for business', emoji: '🏛️' },
  { month: 10, day: 15, year: 1997, text: 'Cassini-Huygens mission to Saturn is launched', emoji: '🪐' },
  { month: 11, day: 2,  year: 2000, text: 'First crew (Expedition 1) arrives at the International Space Station', emoji: '🛸' },
  { month: 11, day: 19, year: 1969, text: 'Apollo 12 lands on the Moon — Pete Conrad and Alan Bean walk on it', emoji: '🌕' },
  { month: 12, day: 14, year: 1972, text: 'Apollo 17\'s Gene Cernan becomes the last person to walk on the Moon', emoji: '🌕' },
  { month: 12, day: 25, year: 2021, text: 'James Webb Space Telescope launches on Ariane 5 rocket', emoji: '🔭' },
  { month: 3, day: 14, year: 2023, text: 'NASA releases first full-color images from James Webb Space Telescope', emoji: '🌌' },
]

export default function SpaceHistory() {
  const now = new Date()
  const todayEvents = useMemo(() =>
    EVENTS.filter(e => e.month === now.getMonth() + 1 && e.day === now.getDate())
  , []) // eslint-disable-line react-hooks/exhaustive-deps

  const upcomingEvents = useMemo(() => {
    return [...EVENTS]
      .filter(e => {
        const d = new Date(now.getFullYear(), e.month - 1, e.day)
        const diff = d.getTime() - now.getTime()
        return diff > 0 && diff < 7 * 864e5
      })
      .sort((a, b) => {
        const da = new Date(now.getFullYear(), a.month - 1, a.day)
        const db = new Date(now.getFullYear(), b.month - 1, b.day)
        return da.getTime() - db.getTime()
      })
      .slice(0, 5)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const display = todayEvents.length > 0 ? todayEvents : upcomingEvents

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">📅</div>
        <div>
          <h3 className="text-white font-bold text-base">
            {todayEvents.length > 0 ? 'Today in Space History' : 'This Week in Space History'}
          </h3>
          <p className="text-gray-500 text-xs">
            {now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {display.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-600 text-sm">No major events in the next 7 days</p>
        </div>
      ) : (
        <div className="space-y-3">
          {display.map((e, i) => (
            <div
              key={i}
              className="flex gap-3 p-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-2xl flex-shrink-0">{e.emoji}</span>
              <div>
                <p className="text-white text-sm font-semibold leading-snug">{e.text}</p>
                <p className="text-indigo-400 text-xs mt-0.5 font-mono">
                  {e.month}/{String(e.day).padStart(2, '0')}/{e.year}
                  {todayEvents.length === 0 && (
                    <span className="text-gray-600 ml-2">
                      · {Math.ceil((new Date(now.getFullYear(), e.month - 1, e.day).getTime() - now.getTime()) / 864e5)}d away
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
