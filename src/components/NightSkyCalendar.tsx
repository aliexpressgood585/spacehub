import { useState } from 'react'

type EventType = 'meteor' | 'eclipse' | 'conjunction' | 'opposition' | 'transit' | 'comet' | 'moon'

interface SkyEvent {
  date: string
  month: number
  day: number
  name: string
  type: EventType
  emoji: string
  peakTime?: string
  duration?: string
  magnitude?: number
  zenithalRate?: number
  visibility: string
  description: string
  tips: string[]
  rating: 1 | 2 | 3 | 4 | 5
}

const EVENTS_2025_2026: SkyEvent[] = [
  // Meteor showers
  { date: '2025-01-03', month: 1, day: 3, name: 'Quadrantids Peak', type: 'meteor', emoji: '🌠', peakTime: '9:00 UT', duration: '6 hours', zenithalRate: 120, visibility: 'Northern Hemisphere', description: 'One of the best annual meteor showers but with a narrow peak. Rich in bright fireballs. Radiant in Boötes (near Big Dipper handle).', tips: ['Best viewing: 3–6 AM local time', 'Need dark skies — moonlight can wash out', 'Wrap up warm, it\'s January!'], rating: 4 },
  { date: '2025-04-22', month: 4, day: 22, name: 'Lyrids Peak', type: 'meteor', emoji: '🌠', peakTime: 'All night', duration: '2–3 days', zenithalRate: 20, visibility: 'Both hemispheres', description: 'One of the oldest recorded meteor showers (687 BC). Associated with Comet Thatcher. Occasional outbursts of 100+/hr.', tips: ['Radiant near Vega — look NE after midnight', 'Can produce fireballs', 'Dark skies essential'], rating: 3 },
  { date: '2025-05-06', month: 5, day: 6, name: 'Eta Aquariids Peak', type: 'meteor', emoji: '🌠', peakTime: 'Pre-dawn', duration: '1 week broad', zenithalRate: 50, visibility: 'Southern Hemisphere best', description: 'Debris from Halley\'s Comet! Best shower for Southern Hemisphere observers. Long meteor trails (Earth grazing) at 66 km/s.', tips: ['Best viewed 3 AM onward', 'Southern observers get 60+ meteors/hr', 'Northern: 10–30/hr; mostly short streaks'], rating: 4 },
  { date: '2025-07-27', month: 7, day: 27, name: 'Delta Aquariids Peak', type: 'meteor', emoji: '🌠', peakTime: 'All night', duration: 'Weeks long', zenithalRate: 25, visibility: 'Tropics and Southern Hemisphere', description: 'Long-lasting shower that overlaps with Perseids. Swift meteors from unknown parent comet.', tips: ['Radiant in Aquarius', 'Combine with early Perseids for more action', 'Low radiant = long grazing trails in south'], rating: 2 },
  { date: '2025-08-12', month: 8, day: 12, name: 'Perseids Peak', type: 'meteor', emoji: '🌠', peakTime: 'Midnight – dawn', duration: '3 days', zenithalRate: 100, visibility: 'Northern Hemisphere best', description: 'The most beloved annual meteor shower. Warm August nights, reliable 100 meteors/hr, bright fireballs. Debris from Comet Swift-Tuttle.', tips: ['Best viewed after midnight, peak at 3 AM', 'No telescope needed — lie back and watch', 'Radiant in Perseus (NE sky)'], rating: 5 },
  { date: '2025-10-08', month: 10, day: 8, name: 'Draconids', type: 'meteor', emoji: '🌠', zenithalRate: 10, visibility: 'Northern Hemisphere', description: 'Unusual shower best seen at dusk (not midnight). Parent: Comet 21P Giacobini-Zinner. Outbursts possible in years of dense debris streams.', tips: ['Best viewed evening, 7–10 PM', 'Radiant near head of Draco constellation', 'Low rate normally but outbursts reach 1000+/hr'], rating: 2 },
  { date: '2025-10-22', month: 10, day: 22, name: 'Orionids Peak', type: 'meteor', emoji: '🌠', peakTime: '2 AM local', zenithalRate: 25, visibility: 'Both hemispheres', description: 'Second meteor shower from Halley\'s Comet! Swift, bright meteors at 66 km/s. Many persistent trains.', tips: ['Radiant in Orion (near Betelgeuse)', 'Best after midnight', 'Sometimes produces long persistent meteor trains'], rating: 3 },
  { date: '2025-11-17', month: 11, day: 17, name: 'Leonids Peak', type: 'meteor', emoji: '🌠', peakTime: 'Pre-dawn', zenithalRate: 15, visibility: 'Both hemispheres', description: 'Famous for historic storms of 1000+ meteors/min. From Comet Tempel-Tuttle. Next storm potential: 2033. Very fast at 71 km/s.', tips: ['Radiant in Leo (NE sky pre-dawn)', 'Swift meteors, many fireballs', 'Storm years: 1833, 1966, 1999, 2001'], rating: 3 },
  { date: '2025-12-14', month: 12, day: 14, name: 'Geminids Peak', type: 'meteor', emoji: '🌠', peakTime: '2 AM local', duration: '2 days', zenithalRate: 150, visibility: 'Both hemispheres', description: 'The best annual meteor shower! Unlike others, originates from asteroid 3200 Phaethon (not a comet). Unusually colorful — white, yellow, green, red.', tips: ['Best from 10 PM – 4 AM', 'Radiant in Gemini (near Castor)', 'Active even before midnight unlike most showers', 'Colorful fireballs!'], rating: 5 },
  { date: '2025-12-22', month: 12, day: 22, name: 'Ursids Peak', type: 'meteor', emoji: '🌠', zenithalRate: 10, visibility: 'Northern Hemisphere only', description: 'Final shower of the year. Radiant near Polaris — circumpolar all night for northern observers. Parent: Comet 8P Tuttle.', tips: ['Radiant near Ursa Minor', 'All-night event in the north', 'Rate modest but outbursts have reached 50+/hr'], rating: 2 },

  // Eclipses
  { date: '2025-03-29', month: 3, day: 29, name: 'Partial Solar Eclipse', type: 'eclipse', emoji: '🌑', visibility: 'North Atlantic, Europe, North Africa', description: 'A partial solar eclipse visible from Europe and North Africa. Maximum coverage ~50% in northwest Europe.', tips: ['Use eclipse glasses or solar filter!', 'NEVER look directly at the Sun without protection', 'Partial eclipses are safe only with proper eyewear'], rating: 3 },
  { date: '2025-09-07', month: 9, day: 7, name: 'Total Lunar Eclipse', type: 'eclipse', emoji: '🌕', duration: '3h 28m (total: 1h 23m)', visibility: 'Europe, Africa, Asia, Australia', description: 'A beautiful total lunar eclipse ("Blood Moon") visible across Europe, Africa, and Asia. The Moon turns deep red as it passes through Earth\'s shadow.', tips: ['No special equipment needed — safe to look at directly', 'Red color from sunsets/sunrises refracted around Earth', 'Bring binoculars for detail'], rating: 5 },
  { date: '2026-02-17', month: 2, day: 17, name: 'Annular Solar Eclipse', type: 'eclipse', emoji: '💍', duration: '7 min 22 sec (annular)', visibility: 'Antarctica, Southern South America', description: 'A "ring of fire" eclipse visible from the southern tip of South America and Antarctica. An annular eclipse occurs when the Moon is too far from Earth to completely cover the Sun.', tips: ['Travel to path for the ring effect', 'Eye protection required even for annular eclipses', 'The ring lasts up to 7 minutes at central line'], rating: 4 },
  { date: '2026-08-12', month: 8, day: 12, name: 'Total Solar Eclipse', type: 'eclipse', emoji: '🌑', duration: '2 min 18 sec (totality)', visibility: 'Arctic, Greenland, Iceland, Spain, North Africa', description: 'A total solar eclipse visible from Spain! Totality path crosses Iceland, Greenland, and northern Spain including major cities. Possibly the most accessible totality of the decade.', tips: ['Totality is the only safe time to view without glasses', 'Look for corona, prominences, Bailey\'s beads', 'Plan well in advance — totality paths are narrow (~150 km)'], rating: 5 },

  // Oppositions & Conjunctions
  { date: '2025-01-10', month: 1, day: 10, name: 'Mars at Opposition', type: 'opposition', emoji: '🔴', magnitude: -1.4, visibility: 'Both hemispheres', description: 'Mars reaches opposition — closest to Earth and brightest in the sky. Shines at magnitude -1.4, brighter than most stars. Best time for Mars observation in 2025.', tips: ['Visible all night long', 'Use telescope for polar ice caps and surface features', 'Mars appears 14 arcseconds wide — best in years'], rating: 4 },
  { date: '2025-06-14', month: 6, day: 14, name: 'Saturn at Opposition', type: 'opposition', emoji: '🪐', magnitude: 0.6, visibility: 'Both hemispheres', description: 'Saturn at its best — rings tilted 22° (excellent) and rising at sunset. Rings make Saturn unmistakable even in binoculars.', tips: ['Even small telescopes show the rings', 'Look for Titan (Saturn\'s brightest moon)', 'Golden color in the sky — can\'t miss it'], rating: 5 },
  { date: '2025-07-05', month: 7, day: 5, name: 'Venus-Jupiter Conjunction', type: 'conjunction', emoji: '✨', visibility: 'Both hemispheres', description: 'Venus and Jupiter pair up in the dawn sky, separated by just 0.4 degrees — less than a full Moon width. A stunning naked-eye spectacle.', tips: ['Look east just before sunrise', 'Binoculars show both planets side-by-side', 'Photo opportunity: pair with foreground elements'], rating: 4 },
  { date: '2025-10-07', month: 10, day: 7, name: 'Jupiter at Opposition', type: 'opposition', emoji: '🟠', magnitude: -2.9, visibility: 'Both hemispheres', description: 'Jupiter at its annual best — largest and brightest in the night sky at magnitude -2.9. Belts, zones, and four Galilean moons visible in any telescope.', tips: ['Rise at sunset, visible all night', 'Telescope shows cloud bands and Great Red Spot', 'Track moon movements night-to-night'], rating: 5 },
  { date: '2025-11-21', month: 11, day: 21, name: 'Mercury Greatest Elongation', type: 'conjunction', emoji: '⚪', visibility: 'Both hemispheres', description: 'Mercury reaches its greatest angular distance from the Sun, making it easiest to observe in the evening sky.', tips: ['Look WSW 30–45 min after sunset', 'Act fast — Mercury sets within 2 hours of the Sun', 'Binoculars help locate it'], rating: 2 },

  // Special events
  { date: '2025-09-19', month: 9, day: 19, name: 'Neptune at Opposition', type: 'opposition', emoji: '🔵', magnitude: 7.8, visibility: 'Both hemispheres', description: 'Neptune at its annual opposition — slightly brighter but still requires binoculars. A small blue-grey disk in even modest telescopes.', tips: ['Binoculars minimum (mag 7.8)', 'Telescope reveals pale blue disc', 'Use a star chart to identify it'], rating: 2 },
  { date: '2025-11-07', month: 11, day: 7, name: 'Uranus at Opposition', type: 'opposition', emoji: '🔷', magnitude: 5.6, visibility: 'Both hemispheres', description: 'Uranus reaches opposition and is technically visible to the naked eye under perfect conditions (mag 5.6). Blue-green disc visible in any telescope.', tips: ['Binoculars make it easy to find', 'Pale blue-green color distinguishes it from stars', 'Look in Taurus constellation'], rating: 3 },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TYPE_COLORS: Record<EventType, string> = {
  meteor: 'bg-yellow-900/50 text-yellow-300',
  eclipse: 'bg-red-900/50 text-red-300',
  conjunction: 'bg-blue-900/50 text-blue-300',
  opposition: 'bg-orange-900/50 text-orange-300',
  transit: 'bg-green-900/50 text-green-300',
  comet: 'bg-cyan-900/50 text-cyan-300',
  moon: 'bg-slate-700 text-slate-200',
}

export default function NightSkyCalendar() {
  const [selectedMonth, setSelectedMonth] = useState<number>(0)
  const [filterType, setFilterType] = useState<string>('all')
  const [selectedEvent, setSelectedEvent] = useState<SkyEvent | null>(EVENTS_2025_2026[0])

  const filtered = EVENTS_2025_2026.filter(ev => {
    const matchMonth = selectedMonth === 0 || ev.month === selectedMonth
    const matchType = filterType === 'all' || ev.type === filterType
    return matchMonth && matchType
  })

  const ratingStars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Night Sky Calendar 2025–2026</h2>
      <p className="text-slate-400 text-sm mb-5">Meteor showers, eclipses, oppositions, and conjunctions — never miss a celestial event</p>

      {/* Month selector */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setSelectedMonth(0)}
          className={`px-2 py-1 rounded text-xs font-medium transition-all ${selectedMonth === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >
          All
        </button>
        {MONTHS.map((m, i) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(i + 1)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${selectedMonth === i + 1 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        {([['all', '⭐ All'], ['meteor', '🌠 Meteors'], ['eclipse', '🌑 Eclipses'], ['opposition', '🔭 Oppositions'], ['conjunction', '✨ Conjunctions']] as const).map(([type, label]) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterType === type ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Event list */}
        <div className="lg:col-span-1 space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {filtered.map((ev, i) => (
            <button
              key={i}
              onClick={() => setSelectedEvent(ev)}
              className={`w-full text-left p-3 rounded-xl transition-all ${
                selectedEvent?.name === ev.name ? 'bg-slate-700 ring-1 ring-indigo-500' : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span>{ev.emoji}</span>
                  <span className="text-white text-xs font-semibold">{ev.name}</span>
                </div>
                <span className="text-yellow-400 text-xs">{ratingStars(ev.rating)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">{ev.date}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${TYPE_COLORS[ev.type]}`}>{ev.type}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-8">No events match your filters</div>
          )}
        </div>

        {/* Detail panel */}
        {selectedEvent && (
          <div className="lg:col-span-2 bg-slate-900 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedEvent.emoji}</span>
                <div>
                  <h3 className="text-white font-bold text-lg">{selectedEvent.name}</h3>
                  <div className="text-slate-400 text-sm">{selectedEvent.date}</div>
                </div>
              </div>
              <div className="text-yellow-400 text-lg">{ratingStars(selectedEvent.rating)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-800 rounded-lg p-2">
                <div className="text-slate-500 text-xs">Visibility</div>
                <div className="text-white text-xs mt-0.5">{selectedEvent.visibility}</div>
              </div>
              {selectedEvent.zenithalRate && (
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Peak Rate (ZHR)</div>
                  <div className="text-white text-xs mt-0.5">{selectedEvent.zenithalRate}/hr</div>
                </div>
              )}
              {selectedEvent.magnitude !== undefined && (
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Magnitude</div>
                  <div className="text-white text-xs mt-0.5">{selectedEvent.magnitude}</div>
                </div>
              )}
              {selectedEvent.peakTime && (
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Peak Time</div>
                  <div className="text-white text-xs mt-0.5">{selectedEvent.peakTime}</div>
                </div>
              )}
              {selectedEvent.duration && (
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Duration</div>
                  <div className="text-white text-xs mt-0.5">{selectedEvent.duration}</div>
                </div>
              )}
            </div>

            <p className="text-slate-300 text-sm leading-relaxed mb-4">{selectedEvent.description}</p>

            <div>
              <div className="text-slate-400 text-xs mb-2 font-semibold">OBSERVING TIPS</div>
              <div className="space-y-1.5">
                {selectedEvent.tips.map((tip, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-green-400 text-xs mt-0.5">✓</span>
                    <span className="text-slate-300 text-sm">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upcoming highlights */}
      <div className="mt-6">
        <h4 className="text-white font-semibold mb-3">Top Events — Don't Miss</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {EVENTS_2025_2026.filter(ev => ev.rating >= 5).map((ev, i) => (
            <button
              key={i}
              onClick={() => { setSelectedEvent(ev); setSelectedMonth(0); setFilterType('all') }}
              className="bg-gradient-to-br from-indigo-900/40 to-slate-800 rounded-xl p-4 text-left hover:from-indigo-900/60 transition-all"
            >
              <div className="text-2xl mb-1">{ev.emoji}</div>
              <div className="text-white font-semibold text-sm">{ev.name}</div>
              <div className="text-slate-400 text-xs">{ev.date}</div>
              <div className="text-yellow-400 text-xs mt-1">{ratingStars(ev.rating)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
