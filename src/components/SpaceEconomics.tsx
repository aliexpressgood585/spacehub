import { useState } from 'react'

interface LaunchVehicle {
  name: string
  operator: string
  costPerKg: number
  costPerLaunch: string
  payload: string
  reusable: boolean
  status: 'active' | 'development' | 'retired'
  firstFlight: number
  flights: number
}

interface MarketSegment {
  name: string
  size2024: string
  size2040: string
  cagr: string
  description: string
  leaders: string[]
  color: string
}

interface SpaceCompany {
  name: string
  founded: number
  country: string
  valuation: string
  focus: string
  milestone: string
  type: 'launch' | 'satellite' | 'services' | 'tourism' | 'mining'
  icon: string
}

const LAUNCH_VEHICLES: LaunchVehicle[] = [
  { name: 'Falcon 9 (reused)', operator: 'SpaceX', costPerKg: 2720, costPerLaunch: '$62M', payload: '22.8 t LEO', reusable: true, status: 'active', firstFlight: 2010, flights: 350 },
  { name: 'Falcon Heavy', operator: 'SpaceX', costPerKg: 1410, costPerLaunch: '$97M', payload: '63.8 t LEO', reusable: true, status: 'active', firstFlight: 2018, flights: 12 },
  { name: 'Starship (target)', operator: 'SpaceX', costPerKg: 100, costPerLaunch: '<$10M', payload: '100–150 t LEO', reusable: true, status: 'development', firstFlight: 2023, flights: 8 },
  { name: 'New Glenn', operator: 'Blue Origin', costPerKg: 4000, costPerLaunch: '$80M', payload: '45 t LEO', reusable: true, status: 'active', firstFlight: 2025, flights: 2 },
  { name: 'Vulcan Centaur', operator: 'ULA', costPerKg: 8700, costPerLaunch: '$110M', payload: '27.2 t LEO', reusable: false, status: 'active', firstFlight: 2024, flights: 3 },
  { name: 'Ariane 6', operator: 'ArianeGroup', costPerKg: 10000, costPerLaunch: '$115M', payload: '21.6 t LEO', reusable: false, status: 'active', firstFlight: 2024, flights: 2 },
  { name: 'H3', operator: 'JAXA/Mitsubishi', costPerKg: 5000, costPerLaunch: '$50M', payload: '16.5 t LEO', reusable: false, status: 'active', firstFlight: 2024, flights: 2 },
  { name: 'Saturn V (historical)', operator: 'NASA', costPerKg: 100000, costPerLaunch: '$1.16B (2023$)', payload: '140 t LEO', reusable: false, status: 'retired', firstFlight: 1967, flights: 13 },
]

const MARKET_SEGMENTS: MarketSegment[] = [
  { name: 'Satellite Services', size2024: '$142B', size2040: '$310B', cagr: '4.8%', description: 'TV/radio broadcast, broadband internet (Starlink, OneWeb), GPS, Earth observation', leaders: ['Starlink', 'OneWeb', 'SES', 'Intelsat', 'Planet Labs'], color: '#3b82f6' },
  { name: 'Launch Services', size2024: '$10B', size2040: '$40B', cagr: '8.5%', description: 'Commercial rocket launches for satellites, cargo, and eventually passengers', leaders: ['SpaceX', 'Rocket Lab', 'ULA', 'Arianespace'], color: '#f59e0b' },
  { name: 'Earth Observation', size2024: '$5.5B', size2040: '$18B', cagr: '7.5%', description: 'Satellite imagery, analytics, monitoring: agriculture, defense, climate, shipping', leaders: ['Planet Labs', 'Maxar', 'Airbus', 'BlackSky'], color: '#10b981' },
  { name: 'Space Tourism', size2024: '$0.8B', size2040: '$9B', cagr: '18%', description: 'Suborbital (Blue Origin, Virgin Galactic), orbital (SpaceX Crew Dragon), future hotels', leaders: ['SpaceX', 'Blue Origin', 'Virgin Galactic', 'Axiom Space'], color: '#ef4444' },
  { name: 'In-Space Manufacturing', size2024: '$0.1B', size2040: '$5B', cagr: '40%', description: 'Producing fiber optics, pharmaceuticals, semiconductors in microgravity', leaders: ['Varda Space', 'Space Forge', 'Axiom Space'], color: '#8b5cf6' },
  { name: 'Space Mining', size2024: '<$0.1B', size2040: '$2B', cagr: '50%+', description: 'Helium-3, platinum-group metals, water ice (rocket fuel), asteroid resources', leaders: ['AstroForge', 'TransAstra', 'ispace (Japan)'], color: '#06b6d4' },
]

const COMPANIES: SpaceCompany[] = [
  { name: 'SpaceX', founded: 2002, country: 'USA', valuation: '$350B', focus: 'Launch, Starlink, Mars', milestone: 'First commercial crew to ISS (2020)', type: 'launch', icon: '🚀' },
  { name: 'Blue Origin', founded: 2000, country: 'USA', valuation: '$8B', focus: 'Launch, space tourism', milestone: 'First commercial suborbital tourism (2021)', type: 'tourism', icon: '🔵' },
  { name: 'Rocket Lab', founded: 2006, country: 'USA/NZ', valuation: '$1B', focus: 'Small launch, spacecraft', milestone: 'Electron booster recovery (2022)', type: 'launch', icon: '⚡' },
  { name: 'Planet Labs', founded: 2010, country: 'USA', valuation: '$1.5B', focus: 'Earth observation', milestone: 'Daily global imaging with 200+ satellites', type: 'satellite', icon: '🌍' },
  { name: 'Axiom Space', founded: 2016, country: 'USA', valuation: '$2B', focus: 'Commercial ISS, station', milestone: 'First all-private ISS mission (2022)', type: 'tourism', icon: '🛸' },
  { name: 'Astroscale', founded: 2013, country: 'Japan', valuation: '$1B', focus: 'Space debris removal', milestone: 'First debris inspection satellite (2021)', type: 'services', icon: '🧹' },
  { name: 'ispace', founded: 2010, country: 'Japan', valuation: '$0.5B', focus: 'Lunar exploration', milestone: 'First commercial lunar landing attempt (2023)', type: 'mining', icon: '🌕' },
  { name: 'Relativity Space', founded: 2015, country: 'USA', valuation: '$4.2B', focus: '3D-printed rockets', milestone: 'First 3D-printed rocket launch (2023)', type: 'launch', icon: '🖨️' },
]

const TYPE_COLORS: Record<string, string> = {
  launch: 'bg-blue-500/20 text-blue-400',
  satellite: 'bg-green-500/20 text-green-400',
  services: 'bg-purple-500/20 text-purple-400',
  tourism: 'bg-yellow-500/20 text-yellow-400',
  mining: 'bg-orange-500/20 text-orange-400',
}

type TabType = 'market' | 'launch' | 'companies'

export default function SpaceEconomics() {
  const [activeTab, setActiveTab] = useState<TabType>('market')
  const [selectedVehicle, setSelectedVehicle] = useState<LaunchVehicle>(LAUNCH_VEHICLES[0])

  const maxCost = Math.max(...LAUNCH_VEHICLES.map(v => v.costPerKg))

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">💰</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Economy</h2>
          <p className="text-gray-400 text-sm">The $600B+ commercial space industry and NewSpace revolution</p>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { value: '$630B', label: 'Global Space Economy', sub: '2023' },
          { value: '$1.8T', label: 'Projected Size', sub: 'by 2035' },
          { value: '115×', label: 'Launch Cost Drop', sub: 'since 2000 ($/kg)' },
          { value: '600+', label: 'Space Companies', sub: 'founded since 2010' },
        ].map(s => (
          <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
            <div className="text-blue-400 font-bold text-xl">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['market', 'launch', 'companies'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'market' ? 'Market Segments' : t === 'launch' ? 'Launch Costs' : 'Key Companies'}
          </button>
        ))}
      </div>

      {activeTab === 'market' && (
        <div className="space-y-4">
          {MARKET_SEGMENTS.map(seg => (
            <div key={seg.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: seg.color }} />
                  <span className="text-white font-bold">{seg.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400">{seg.size2024} now</span>
                  <span className="text-green-400">→ {seg.size2040} by 2040</span>
                  <span className="text-yellow-400">+{seg.cagr}/yr</span>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-3">{seg.description}</p>
              {/* Growth bar */}
              <div className="relative h-3 bg-white/10 rounded-full mb-3 overflow-hidden">
                <div className="absolute h-full rounded-full" style={{ width: '25%', background: seg.color + '80' }} />
                <div className="absolute h-full rounded-full opacity-60" style={{ width: '65%', background: seg.color + '40', left: '25%' }} />
                <div className="absolute top-0 left-1/4 bottom-0 w-0.5 bg-white/30" />
                <span className="absolute text-white" style={{ fontSize: '8px', top: '2px', left: '2px' }}>2024</span>
                <span className="absolute text-white" style={{ fontSize: '8px', top: '2px', right: '2px' }}>2040</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {seg.leaders.map(l => (
                  <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{l}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'launch' && (
        <div className="space-y-4">
          {/* Cost to orbit bar chart */}
          <div className="bg-white/5 rounded-xl p-4">
            <div className="text-white font-semibold mb-4">Cost per kg to LEO (USD)</div>
            {LAUNCH_VEHICLES.map(v => (
              <div key={v.name} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => setSelectedVehicle(v)}
                    className={`text-sm transition-colors ${selectedVehicle.name === v.name ? 'text-blue-400 font-bold' : 'text-gray-300 hover:text-white'}`}
                  >
                    {v.name}
                  </button>
                  <div className="flex items-center gap-2">
                    {v.reusable && <span className="text-xs text-green-400">♻️ reusable</span>}
                    <span className="text-gray-400 text-xs font-mono">${v.costPerKg.toLocaleString()}/kg</span>
                  </div>
                </div>
                <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(v.costPerKg / maxCost) * 100}%`,
                      background: v.reusable ? '#3b82f6' : '#6b7280',
                      opacity: v.status === 'retired' ? 0.4 : 1,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Selected vehicle details */}
          <div className="bg-white/5 rounded-xl p-4 border border-blue-500/30">
            <h3 className="text-white font-bold text-lg mb-3">{selectedVehicle.name}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Operator', value: selectedVehicle.operator },
                { label: 'Cost/Launch', value: selectedVehicle.costPerLaunch },
                { label: 'Cost/kg', value: `$${selectedVehicle.costPerKg.toLocaleString()}` },
                { label: 'Payload to LEO', value: selectedVehicle.payload },
                { label: 'First Flight', value: selectedVehicle.firstFlight.toString() },
                { label: 'Total Flights', value: selectedVehicle.flights.toString() },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4">
            <div className="text-green-300 font-bold mb-2">The Reusability Revolution</div>
            <p className="text-gray-300 text-sm">
              SpaceX's reusable first stages reduced launch costs by 10–20× over expendable rockets. A Falcon 9 booster has flown up to 23 times. Starship aims for $100/kg to orbit — an additional 27× reduction — making large-scale space colonization economically viable for the first time in history.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {COMPANIES.map(c => (
            <div key={c.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl">{c.icon}</span>
                <div>
                  <div className="text-white font-bold text-lg">{c.name}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[c.type]}`}>{c.type}</span>
                    <span className="text-gray-400 text-xs">{c.country} · {c.founded}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white/5 rounded-lg p-2">
                  <div className="text-gray-400 text-xs">Valuation</div>
                  <div className="text-white text-sm font-bold">{c.valuation}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <div className="text-gray-400 text-xs">Focus</div>
                  <div className="text-white text-sm">{c.focus}</div>
                </div>
              </div>
              <div className="text-yellow-300 text-xs">⭐ {c.milestone}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'SpaceX Valuation', value: '$350B', desc: 'largest private space company' },
          { label: 'Active Satellites', value: '10,000+', desc: 'Starlink leads with 7,000+' },
          { label: 'VC Investment', value: '$25B+', desc: 'into space startups (2023)' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-blue-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
