import { useState } from 'react'

interface Treaty {
  name: string
  year: number
  parties: number
  status: 'in force' | 'not in force' | 'proposed'
  keyPoints: string[]
  summary: string
  agency: string
}

interface LegalIssue {
  title: string
  description: string
  challenge: string
  currentStatus: string
  icon: string
}

interface SpaceAgency {
  name: string
  country: string
  founded: number
  budget: number
  budget_unit: string
  employees: number
  missions: number
  flag: string
}

const treaties: Treaty[] = [
  {
    name: 'Outer Space Treaty (OST)',
    year: 1967,
    parties: 114,
    status: 'in force',
    agency: 'UN COPUOS',
    summary: 'The "Magna Carta of Space Law." Prohibits national appropriation of celestial bodies, WMD in space, and military bases on the Moon. Requires states to authorize and supervise national activities including commercial.',
    keyPoints: ['Space exploration for benefit of all mankind', 'No sovereign claims over celestial bodies', 'No nuclear weapons in orbit', 'States liable for damage by their nationals', 'Astronauts are envoys of mankind']
  },
  {
    name: 'Rescue Agreement',
    year: 1968,
    parties: 98,
    status: 'in force',
    agency: 'UN COPUOS',
    summary: 'Requires states to rescue and return astronauts in distress, regardless of nationality. Also covers return of space objects.',
    keyPoints: ['Rescue astronauts of any nation', 'Return astronauts promptly', 'Return space objects to launching state', 'Notify UN of distress situations']
  },
  {
    name: 'Liability Convention',
    year: 1972,
    parties: 98,
    status: 'in force',
    agency: 'UN COPUOS',
    summary: 'Establishes that launching states are absolutely liable for damage caused by their space objects on Earth and liable for fault-based damage in outer space. Cosmos 954 satellite crash in Canada invoked this.',
    keyPoints: ['Absolute liability for damage on Earth', 'Fault liability in outer space', 'State liable for all nationals\' objects', 'Claims settled diplomatically', 'Cosmos 954 case established precedent']
  },
  {
    name: 'Registration Convention',
    year: 1976,
    parties: 73,
    status: 'in force',
    agency: 'UN COPUOS',
    summary: 'Requires states to register objects launched into Earth orbit or beyond in a national registry and furnish information to UN Secretary-General.',
    keyPoints: ['National registry mandatory', 'Report to UN Secretary-General', 'Parameters: name, launch date, orbital info', 'Helps identify debris-causing objects']
  },
  {
    name: 'Moon Agreement',
    year: 1979,
    parties: 18,
    status: 'in force',
    agency: 'UN COPUOS',
    summary: 'Declares Moon and its resources as common heritage of mankind. Notably rejected by major space powers (USA, Russia, China). Commercial resource extraction remains legally contested.',
    keyPoints: ['Moon = common heritage of mankind', 'No resource exploitation without international framework', 'Not ratified by USA, Russia, China', 'Effectively toothless for major powers']
  },
  {
    name: 'Artemis Accords',
    year: 2020,
    parties: 47,
    status: 'in force',
    agency: 'NASA',
    summary: 'US-led bilateral agreements setting norms for lunar exploration: transparency, deconfliction, heritage site protection, resource utilization, and orbital debris mitigation. Not a UN treaty.',
    keyPoints: ['Peaceful purposes', 'Transparency and interoperability', 'Resource extraction permitted', 'Heritage site preservation', 'Debris mitigation required']
  },
]

const issues: LegalIssue[] = [
  {
    title: 'Space Resource Rights',
    description: 'Who owns resources extracted from the Moon, asteroids, and other celestial bodies?',
    challenge: 'OST prohibits national appropriation of celestial bodies but is silent on resources. US (2015) and Luxembourg (2017) passed laws allowing citizens to own extracted resources, without territorial claims.',
    currentStatus: 'No international consensus. Artemis Accords support extraction. Moon Agreement (18 parties) says "common heritage." Major gap in international law.',
    icon: '⛏️'
  },
  {
    title: 'Orbital Debris Liability',
    description: 'Who is liable when satellite debris causes collision damage, and who must clean it up?',
    challenge: 'The Liability Convention applies but proof of fault in space is extremely difficult. Iridium-Cosmos collision (2009) generated 2,000+ pieces — no compensation paid. Mega-constellations (Starlink 12,000+ satellites) raise scale issues.',
    currentStatus: 'ITU spectrum/orbital slot coordination is voluntary. IADC guidelines non-binding. No mandatory debris removal law exists internationally.',
    icon: '🛸'
  },
  {
    title: 'Military Activities',
    description: 'What military activities are permitted under international space law?',
    challenge: 'OST bans WMD and military bases on celestial bodies but NOT conventional weapons in orbit or military satellites. Anti-satellite tests (ASAT) are legally ambiguous despite creating debris clouds.',
    currentStatus: 'US, Russia, China, India tested ASATs. UN called for debris-creating ASAT test moratorium (2022 resolution). No binding treaty.',
    icon: '⚔️'
  },
  {
    title: 'Private Space Tourism',
    description: 'How should governments regulate commercial human spaceflight safety?',
    challenge: 'Current US law (Commercial Space Launch Act) uses "informed consent" model for passengers — they sign waivers, not FAA safety rules. As industry matures, this minimal regulation approach faces scrutiny.',
    currentStatus: 'FAA licenses launches. Crew safety standards limited by law until 2025 moratorium expired. Industry developing voluntary standards.',
    icon: '🚀'
  },
  {
    title: 'Mega-Constellation Interference',
    description: 'Starlink, OneWeb, and others are filling low Earth orbit — threatening radio astronomy and dark skies.',
    challenge: 'ITU assigns spectrum and orbital slots but cannot cap constellation sizes. Astronomers report satellite trails contaminating images. Light pollution affects ground-based observatories globally.',
    currentStatus: 'SpaceX added sun-shading (VisorSat), developing DarkSat. IAU calling for dark sky regulations. No binding law yet.',
    icon: '📡'
  },
]

const agencies: SpaceAgency[] = [
  { name: 'NASA', country: 'USA 🇺🇸', founded: 1958, budget: 25.4, budget_unit: 'B USD', employees: 18000, missions: 300, flag: '🇺🇸' },
  { name: 'ESA', country: 'Europe 🇪🇺', founded: 1975, budget: 9.1, budget_unit: 'B USD', employees: 2500, missions: 80, flag: '🇪🇺' },
  { name: 'Roscosmos', country: 'Russia 🇷🇺', founded: 1992, budget: 4.5, budget_unit: 'B USD', employees: 250000, missions: 200, flag: '🇷🇺' },
  { name: 'CNSA', country: 'China 🇨🇳', founded: 1993, budget: 12, budget_unit: 'B USD', employees: 150000, missions: 90, flag: '🇨🇳' },
  { name: 'ISRO', country: 'India 🇮🇳', founded: 1969, budget: 1.9, budget_unit: 'B USD', employees: 16000, missions: 120, flag: '🇮🇳' },
  { name: 'JAXA', country: 'Japan 🇯🇵', founded: 2003, budget: 2.1, budget_unit: 'B USD', employees: 1500, missions: 50, flag: '🇯🇵' },
]

type Tab = 'treaties' | 'issues' | 'agencies'

export default function SpaceLaw() {
  const [tab, setTab] = useState<Tab>('treaties')
  const [selected, setSelected] = useState<Treaty>(treaties[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'treaties', label: 'Space Treaties' },
    { id: 'issues', label: 'Legal Issues' },
    { id: 'agencies', label: 'Space Agencies' },
  ]

  const statusColor = { 'in force': 'text-green-400 bg-green-900/30', 'not in force': 'text-red-400 bg-red-900/30', 'proposed': 'text-yellow-400 bg-yellow-900/30' }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Law & Governance</h2>
      <p className="text-gray-400 text-sm mb-5">The legal framework governing humanity's expansion into space</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'treaties' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {treaties.map(t => (
              <button key={t.name} onClick={() => setSelected(t)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === t.name ? 'bg-teal-900/40 border border-teal-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="text-white font-semibold text-sm leading-snug">{t.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-gray-500 text-xs">{t.year}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${statusColor[t.status]}`}>{t.status}</span>
                </div>
                <div className="text-gray-500 text-xs mt-0.5">{t.parties} parties</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-gray-800/60 rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <div className="text-gray-400 text-sm mt-0.5">{selected.year} · {selected.parties} state parties · {selected.agency}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusColor[selected.status]}`}>{selected.status}</span>
            </div>
            <p className="text-gray-300 text-sm mb-4">{selected.summary}</p>
            <div>
              <h4 className="text-gray-400 text-xs font-semibold uppercase mb-2">Key Provisions</h4>
              <ul className="space-y-1.5">
                {selected.keyPoints.map(kp => (
                  <li key={kp} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-teal-400 mt-0.5 flex-shrink-0">▸</span>
                    {kp}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'issues' && (
        <div className="space-y-4">
          {issues.map(issue => (
            <div key={issue.title} className="bg-gray-800/60 rounded-lg p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{issue.icon}</span>
                <h3 className="text-white font-bold text-lg">{issue.title}</h3>
              </div>
              <p className="text-gray-300 text-sm mb-3">{issue.description}</p>
              <div className="space-y-3">
                <div className="bg-orange-900/20 rounded p-3 border border-orange-800/30">
                  <div className="text-orange-400 text-xs font-semibold uppercase mb-1">Challenge</div>
                  <p className="text-gray-300 text-sm">{issue.challenge}</p>
                </div>
                <div className="bg-teal-900/20 rounded p-3 border border-teal-800/30">
                  <div className="text-teal-400 text-xs font-semibold uppercase mb-1">Current Status</div>
                  <p className="text-gray-300 text-sm">{issue.currentStatus}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'agencies' && (
        <div className="space-y-3">
          {agencies.map(a => (
            <div key={a.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{a.flag}</span>
                <div>
                  <h4 className="text-white font-bold">{a.name}</h4>
                  <p className="text-gray-400 text-sm">{a.country} · Founded {a.founded}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-teal-300 font-bold text-lg">${a.budget}{a.budget_unit}</div>
                  <div className="text-gray-500 text-xs">Annual Budget</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-blue-300 font-bold text-lg">{a.employees.toLocaleString()}</div>
                  <div className="text-gray-500 text-xs">Employees</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-purple-300 font-bold text-lg">{a.missions}+</div>
                  <div className="text-gray-500 text-xs">Missions</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
