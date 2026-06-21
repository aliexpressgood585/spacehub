import MeteorShower3D from './MeteorShower3D'

interface Event {
  date: string
  daysUntil: number
  title: string
  description: string
  icon: string
  type: 'meteor' | 'eclipse' | 'launch' | 'conjunction'
}

const TYPE_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  meteor:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)',  label: 'Meteor Shower' },
  eclipse:     { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', label: 'Eclipse' },
  launch:      { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.25)',  label: 'Launch' },
  conjunction: { color: '#c4b5fd', bg: 'rgba(196,181,253,0.08)', border: 'rgba(196,181,253,0.25)', label: 'Conjunction' },
}

const EVENTS: Event[] = [
  {
    date: 'June 22, 2026',
    daysUntil: 1,
    title: 'Capillid Meteor Shower',
    description: 'Up to 100 meteors per hour visible from dark skies. Best viewing after midnight.',
    icon: '☄️',
    type: 'meteor',
  },
  {
    date: 'June 28, 2026',
    daysUntil: 7,
    title: 'Venus–Jupiter Conjunction',
    description: 'The two brightest planets will appear within 0.5° of each other in the evening sky.',
    icon: '⭐',
    type: 'conjunction',
  },
  {
    date: 'July 3, 2026',
    daysUntil: 12,
    title: 'Ariane 6 | Multi-Payload',
    description: 'European Space Agency launches multiple commercial satellites from Kourou, French Guiana.',
    icon: '🚀',
    type: 'launch',
  },
  {
    date: 'September 2, 2026',
    daysUntil: 73,
    title: 'Partial Solar Eclipse',
    description: 'Partial solar eclipse visible from North America, Europe, and northern Africa.',
    icon: '🌑',
    type: 'eclipse',
  },
]

export default function EventsCalendar() {
  return (
    <div className="space-y-5">

      {/* Events list */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-box">🌠</div>
          <div>
            <h3 className="text-white font-bold text-xl">Astronomical Events</h3>
            <p className="text-gray-500 text-xs">Upcoming sky events — don't miss them</p>
          </div>
        </div>

        <div className="space-y-3">
          {EVENTS.map((ev, i) => {
            const cfg = TYPE_CONFIG[ev.type]
            return (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-2xl transition-all"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
              >
                {/* Date column */}
                <div
                  className="flex-shrink-0 w-14 text-center py-2 px-1 rounded-xl"
                  style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${cfg.border}` }}
                >
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
                    {ev.date.split(' ')[0]}
                  </p>
                  <p className="text-white font-black text-xl leading-none">
                    {ev.date.split(' ')[1]?.replace(',', '')}
                  </p>
                  <p className="text-[9px] text-gray-600 mt-0.5">{ev.date.split(' ')[2]}</p>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xl">{ev.icon}</span>
                    <h4 className="text-white font-bold text-sm">{ev.title}</h4>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'rgba(0,0,0,0.3)', color: cfg.color, border: `1px solid ${cfg.border}` }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">{ev.description}</p>
                </div>

                {/* Countdown */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-white font-black text-lg leading-none">{ev.daysUntil}</p>
                  <p className="text-gray-600 text-[10px] font-semibold">days</p>
                </div>
              </div>
            )
          })}
        </div>

        <div
          className="mt-4 p-4 rounded-2xl text-xs text-gray-500 leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
        >
          💡 <span className="text-gray-400 font-semibold">Stargazing tip:</span> Set up at least 20 minutes before the event starts to let your eyes adjust to the dark.
        </div>
      </div>

      {/* Meteor Shower 3D */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-box">☄️</div>
          <div>
            <h3 className="text-white font-bold text-base">Meteor Shower — 3D Simulation</h3>
            <p className="text-gray-500 text-xs">Interactive real-time visualization</p>
          </div>
        </div>
        <MeteorShower3D />
      </div>
    </div>
  )
}
