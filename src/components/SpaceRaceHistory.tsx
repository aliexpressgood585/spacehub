import { useState } from 'react'

interface Mission {
  year: number
  date: string
  nation: 'USA' | 'USSR' | 'Both'
  name: string
  achievement: string
  description: string
  crew?: string[]
  significance: string
  outcome: 'success' | 'failure' | 'partial'
}

interface KeyFigure {
  name: string
  nation: 'USA' | 'USSR'
  role: string
  dates: string
  contribution: string
  quote?: string
}

const MISSIONS: Mission[] = [
  { year: 1957, date: '1957-10-04', nation: 'USSR', name: 'Sputnik 1', achievement: 'First satellite in orbit', description: 'First artificial Earth satellite. A 83.6 kg sphere with four radio antennas transmitted a simple beep heard worldwide. Shocked the West and started the Space Race.', significance: 'Proved space was accessible; caused the "Sputnik Crisis" leading to NASA creation and massive US space investment.', outcome: 'success' },
  { year: 1957, date: '1957-11-03', nation: 'USSR', name: 'Sputnik 2', achievement: 'First living creature in orbit', description: 'Carried Laika the dog — first living creature in orbit. Laika had no return capability and died within hours from overheating. Mission proved organisms could survive launch.', crew: ['Laika (dog)'], significance: 'Demonstrated mammals could survive launch forces, even if return was still unsolved.', outcome: 'partial' },
  { year: 1958, date: '1958-01-31', nation: 'USA', name: 'Explorer 1', achievement: 'First US satellite; discovers Van Allen belts', description: 'First successful American satellite. Its cosmic ray detector discovered the Van Allen radiation belts — a major scientific discovery. The US response to Sputnik.', significance: 'First major US space achievement; Van Allen belts remain critical to spacecraft design.', outcome: 'success' },
  { year: 1958, date: '1958-10-01', nation: 'USA', name: 'NASA Founded', achievement: 'NASA established', description: 'National Aeronautics and Space Administration established by President Eisenhower, absorbing NACA and space activities from military branches.', significance: 'Unified US civil space program; foundation for all American space achievements.', outcome: 'success' },
  { year: 1959, date: '1959-01-04', nation: 'USSR', name: 'Luna 1', achievement: 'First spacecraft to escape Earth gravity', description: 'First spacecraft to reach the vicinity of the Moon and enter heliocentric orbit. Missed the Moon due to a trajectory error.', significance: 'Proved spacecraft could travel to other bodies in the solar system.', outcome: 'partial' },
  { year: 1959, date: '1959-09-14', nation: 'USSR', name: 'Luna 2', achievement: 'First spacecraft to reach the Moon', description: 'First spacecraft to impact the Moon\'s surface. Impact confirmed the Moon has no significant magnetic field.', significance: 'First human-made object to reach another celestial body.', outcome: 'success' },
  { year: 1959, date: '1959-10-07', nation: 'USSR', name: 'Luna 3', achievement: 'First photos of Moon\'s far side', description: 'Photographed 70% of the Moon\'s far side for the first time. Revealed the far side is very different — fewer maria (dark plains) than the near side.', significance: 'First look at a part of the Moon never seen by humans. Named 500+ features.', outcome: 'success' },
  { year: 1961, date: '1961-04-12', nation: 'USSR', name: 'Vostok 1', achievement: 'First human in space', crew: ['Yuri Gagarin'], description: '108-minute flight; one orbit of Earth. Gagarin ejected and parachuted to the ground separately from the capsule (secret for years). His "Poyekhali!" ("Let\'s go!") was broadcast worldwide.', significance: 'The pinnacle of Soviet space achievement. Gagarin became a global hero. JFK responded with the Moon declaration.', outcome: 'success' },
  { year: 1961, date: '1961-05-05', nation: 'USA', name: 'Mercury Freedom 7', achievement: 'First American in space', crew: ['Alan Shepard'], description: '15-minute suborbital flight. Shepard manually controlled the spacecraft for several minutes — a contrast to Gagarin who mostly flew automatically. "The greatest day of my life."', significance: 'Restored American confidence; Shepard became a national hero. Led directly to JFK\'s Moon speech.', outcome: 'success' },
  { year: 1961, date: '1961-05-25', nation: 'USA', name: 'JFK Moon Speech', achievement: 'Moon mission declared', description: 'President Kennedy challenged the nation before Congress: "I believe that this nation should commit itself to achieving the goal, before this decade is out, of landing a man on the Moon."', significance: 'Galvanized the entire US space program with a clear, audacious, time-bound goal.', outcome: 'success' },
  { year: 1962, date: '1962-02-20', nation: 'USA', name: 'Friendship 7', achievement: 'First American to orbit Earth', crew: ['John Glenn'], description: 'Glenn became the first American to orbit Earth — three orbits. A faulty sensor threatened disaster (incorrectly indicated heat shield loose); mission continued. Glenn became the most celebrated American astronaut.', significance: 'Restored American morale; Glenn became a national hero comparable to Lindbergh.', outcome: 'success' },
  { year: 1963, date: '1963-06-16', nation: 'USSR', name: 'Vostok 6', achievement: 'First woman in space', crew: ['Valentina Tereshkova'], description: 'Tereshkova orbited Earth 48 times over 3 days. A textile worker and parachutist with no pilot experience before cosmonaut training. Still the only woman to fly solo in space.', significance: 'A major propaganda victory; no American woman would fly until Sally Ride in 1983 (20 years later).', outcome: 'success' },
  { year: 1965, date: '1965-03-18', nation: 'USSR', name: 'Voskhod 2', achievement: 'First spacewalk (EVA)', crew: ['Alexei Leonov', 'Pavel Belyayev'], description: 'Leonov performed history\'s first spacewalk — 12 minutes. His suit inflated in vacuum; he had to bleed air to squeeze back in. Terrifying improvised emergency landing into Siberian forest.', significance: 'First human to float freely in space. Demonstrated EVA was possible (and dangerous).', outcome: 'success' },
  { year: 1965, date: '1965-06-03', nation: 'USA', name: 'Gemini 4', achievement: 'First American spacewalk', crew: ['Ed White', 'James McDivitt'], description: 'Ed White performed first American EVA — 23 minutes with a maneuvering gas gun. "Probably the most comfortable part of the flight," White said. Mission controllers had to order him back in.', significance: 'Closed the EVA gap with USSR; demonstrated US spacewalk capability.', outcome: 'success' },
  { year: 1966, date: '1966-02-03', nation: 'USSR', name: 'Luna 9', achievement: 'First soft landing on Moon', description: 'First spacecraft to soft-land on the Moon. Settled on surface and transmitted the first close-up photographs of the lunar surface over 3 days. Proved Moon surface could support spacecraft weight.', significance: 'Ended debate about whether Moon surface would swallow a lander. Cleared way for human landing planning.', outcome: 'success' },
  { year: 1967, date: '1967-01-27', nation: 'USA', name: 'Apollo 1 Fire', achievement: 'Tragic fire kills 3 astronauts', crew: ['Gus Grissom', 'Ed White', 'Roger Chaffee'], description: 'Fire during launch rehearsal killed all three astronauts in 17 seconds. Pure oxygen atmosphere at higher-than-sea-level pressure was catastrophically flammable. Entire Apollo program redesigned.', significance: 'Costliest disaster of Space Race; led to complete redesign of Apollo capsule. Delayed program by 18 months.', outcome: 'failure' },
  { year: 1967, date: '1967-04-24', nation: 'USSR', name: 'Soyuz 1', achievement: 'First in-flight death', crew: ['Vladimir Komarov'], description: 'Parachute failure on re-entry killed Komarov — first in-flight space death. Spacecraft had 203 documented problems before launch; Komarov knew the risks. Mission was politically motivated.', significance: 'Revealed systemic problems in Soviet space program. Soyuz capsule was redesigned extensively.', outcome: 'failure' },
  { year: 1968, date: '1968-12-24', nation: 'USA', name: 'Apollo 8', achievement: 'First humans to orbit the Moon', crew: ['Frank Borman', 'Jim Lovell', 'Bill Anders'], description: 'First crewed spacecraft to reach the Moon. Orbited 10 times. The "Earthrise" photo taken by Bill Anders became one of the most influential photographs ever taken.', significance: '"We came all this way to explore the Moon, and the most important thing is that we discovered the Earth." — Bill Anders', outcome: 'success' },
  { year: 1969, date: '1969-07-20', nation: 'USA', name: 'Apollo 11', achievement: 'First humans on the Moon! 🌙', crew: ['Neil Armstrong', 'Buzz Aldrin', 'Michael Collins'], description: '"That\'s one small step for man, one giant leap for mankind." Armstrong and Aldrin spent 2h 31m on the surface. Collected 21.5 kg of samples. Collins orbited above. 600 million watched on TV.', significance: 'Greatest achievement in human exploration. The Space Race was won. US national goal achieved 5 months before decade\'s end.', outcome: 'success' },
  { year: 1971, date: '1971-04-19', nation: 'USSR', name: 'Salyut 1', achievement: 'First space station', description: 'First space station in orbit. Three cosmonauts visited (Soyuz 11) and lived aboard for 22 days — a record at the time. All three died on re-entry due to a valve failure.', significance: 'Established Soviet dominance in long-duration spaceflight — a field the US conceded after winning the Moon race.', outcome: 'partial' },
  { year: 1972, date: '1972-12-19', nation: 'USA', name: 'Apollo 17', achievement: 'Last humans to walk on Moon (so far)', crew: ['Gene Cernan', 'Harrison Schmitt', 'Ron Evans'], description: 'Last Apollo mission. Schmitt was the only professional scientist (geologist) to walk on the Moon. "The Blue Marble" photo taken en route. Cernan\'s last words on the Moon: "We leave as we came and God willing we shall return."', significance: 'End of the Apollo era. No human has returned to the Moon since December 1972.', outcome: 'success' },
  { year: 1975, date: '1975-07-17', nation: 'Both', name: 'Apollo-Soyuz Test Project', achievement: 'First US-Soviet space cooperation', crew: ['Thomas Stafford', 'Vance Brand', 'Deke Slayton', 'Alexei Leonov', 'Valeri Kubasov'], description: 'American and Soviet spacecraft docked in orbit. Crews exchanged visits, conducted joint experiments, and shook hands in space. Cold War rivals became collaborators.', significance: 'Symbolic end of the Space Race. Seeds of future cooperation that led to ISS.', outcome: 'success' },
]

const KEY_FIGURES: KeyFigure[] = [
  { name: 'Wernher von Braun', nation: 'USA', role: 'Chief rocket architect (NASA)', dates: '1912–1977', contribution: 'Designed the Saturn V — the rocket that took humans to the Moon. Former WWII German V-2 rocket engineer who came to the US under Operation Paperclip. Directed Marshall Space Flight Center.', quote: '"I have learned to use the word impossible with the greatest caution."' },
  { name: 'Sergei Korolev', nation: 'USSR', role: 'Chief Designer (secret identity)', dates: '1907–1966', contribution: 'Designed Sputnik, Vostok, and early Soyuz. His identity was top-secret. Had survived Stalin\'s gulags. His death in 1966 from botched surgery may have cost the USSR the Moon race.', quote: '"The simplest solution is always the correct one."' },
  { name: 'Yuri Gagarin', nation: 'USSR', role: 'First human in space', dates: '1934–1968', contribution: 'Orbited Earth on April 12, 1961 — 108 minutes that changed history. Died in a MiG-15 training crash. April 12 is now "Cosmonautics Day" worldwide.', quote: '"Poyekhali!" (Let\'s go!)' },
  { name: 'Neil Armstrong', nation: 'USA', role: 'First human on the Moon', dates: '1930–2012', contribution: 'Commanded Apollo 11. First human to set foot on the Moon, July 20, 1969. Quiet, intensely private test pilot who became the most famous person on Earth.', quote: '"That\'s one small step for man, one giant leap for mankind."' },
  { name: 'Valentina Tereshkova', nation: 'USSR', role: 'First woman in space', dates: '1937–', contribution: 'Orbited Earth 48 times in Vostok 6 (1963). A textile worker and amateur parachutist who beat professional pilots for the slot. Still the only woman to fly solo in space.', quote: '"Once you\'ve been in space, you appreciate how small and fragile Earth is."' },
  { name: 'Katherine Johnson', nation: 'USA', role: 'NASA mathematician', dates: '1918–2020', contribution: 'Calculated trajectories for Alan Shepard\'s flight, John Glenn\'s orbit, and Apollo 11. Her manual calculations were so trusted that Glenn refused to fly until she personally verified the computer\'s numbers.', quote: '"I counted everything. I counted the steps to the road, the steps up to church, the number of dishes and silverware I washed... anything that could be counted, I did."' },
]

export default function SpaceRaceHistory() {
  const [filterNation, setFilterNation] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'timeline' | 'figures' | 'scorecard'>('timeline')
  const [selectedMission, setSelectedMission] = useState<Mission | null>(MISSIONS[7])

  const filtered = MISSIONS.filter(m => filterNation === 'all' || m.nation === filterNation || m.nation === 'Both')


  const nationColor = (n: 'USA' | 'USSR' | 'Both') =>
    n === 'USA' ? 'text-blue-400 bg-blue-900/30' : n === 'USSR' ? 'text-red-400 bg-red-900/30' : 'text-purple-400 bg-purple-900/30'

  const outcomeColor = (o: Mission['outcome']) =>
    o === 'success' ? 'text-green-400' : o === 'failure' ? 'text-red-400' : 'text-yellow-400'

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Race History</h2>
      <p className="text-slate-400 text-sm mb-5">The Cold War competition that took humanity to the Moon (1957–1975)</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {([['timeline', '📅 Timeline'], ['figures', '👤 Key Figures'], ['scorecard', '🏆 Scorecard']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'timeline' && (
        <div>
          {/* Nation filter */}
          <div className="flex gap-2 mb-4">
            {[['all', '🌍 All'], ['USA', '🇺🇸 USA'], ['USSR', '⭐ USSR']] .map(([n, label]) => (
              <button
                key={n}
                onClick={() => setFilterNation(n)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterNation === n ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
              {filtered.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedMission(m)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    selectedMission?.name === m.name ? 'bg-slate-700 ring-1 ring-indigo-500' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-xs font-bold">{m.name}</span>
                    <span className={`text-xs font-bold ${outcomeColor(m.outcome)}`}>
                      {m.outcome === 'success' ? '✓' : m.outcome === 'failure' ? '✗' : '~'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${nationColor(m.nation)}`}>{m.nation}</span>
                    <span className="text-slate-400 text-xs">{m.year}</span>
                  </div>
                  <div className="text-slate-400 text-xs mt-1">{m.achievement}</div>
                </button>
              ))}
            </div>

            {selectedMission && (
              <div className="lg:col-span-2 bg-slate-900 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white font-bold text-lg">{selectedMission.name}</h3>
                    <div className="flex gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${nationColor(selectedMission.nation)}`}>{selectedMission.nation}</span>
                      <span className="text-slate-400 text-xs">{selectedMission.date}</span>
                      <span className={`text-xs font-bold ${outcomeColor(selectedMission.outcome)}`}>
                        {selectedMission.outcome.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-900/30 border border-indigo-700/50 rounded-lg p-3 mb-4">
                  <span className="text-indigo-300 text-sm font-semibold">🏆 {selectedMission.achievement}</span>
                </div>

                {selectedMission.crew && (
                  <div className="mb-3">
                    <div className="text-slate-500 text-xs mb-1">Crew</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMission.crew.map((c, i) => (
                        <span key={i} className="bg-slate-700 text-white text-xs px-2 py-1 rounded-full">👨‍🚀 {c}</span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-slate-300 text-sm leading-relaxed mb-4">{selectedMission.description}</p>

                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-slate-500 text-xs mb-1">Historical Significance</div>
                  <p className="text-slate-200 text-sm leading-relaxed">{selectedMission.significance}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'figures' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KEY_FIGURES.map((fig, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-2">
                <div className="text-2xl">{'USA' === fig.nation ? '🇺🇸' : '⭐'}</div>
                <div>
                  <div className="text-white font-bold">{fig.name}</div>
                  <div className="text-slate-400 text-xs">{fig.dates} · {fig.role}</div>
                </div>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-3">{fig.contribution}</p>
              {fig.quote && (
                <blockquote className="border-l-2 border-indigo-500 pl-3 text-slate-400 text-xs italic">
                  {fig.quote}
                </blockquote>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'scorecard' && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[
              { nation: 'USSR ⭐', color: 'red', milestones: ['First satellite (Sputnik, 1957)', 'First living creature in orbit (Laika, 1957)', 'First human in space (Gagarin, 1961)', 'First spacewalk (Leonov, 1965)', 'First woman in space (Tereshkova, 1963)', 'First Moon impact (Luna 2, 1959)', 'First far-side Moon photos (Luna 3, 1959)', 'First Moon soft landing (Luna 9, 1966)', 'First space station (Salyut 1, 1971)'] },
              { nation: 'USA 🇺🇸', color: 'blue', milestones: ['First American satellite + Van Allen belts (1958)', 'First American in orbit (Glenn, 1962)', 'First lunar flyby photos (Ranger 7, 1964)', 'First Moon landing! (Apollo 11, 1969)', 'First Moon rover (Apollo 15, 1971)', 'First planetary gravity assist (Mariner 10, 1973)', 'Space Shuttle Program (1981–2011)', '12 humans walked on the Moon (only nation)'] },
            ].map(({ nation, color, milestones }) => (
              <div key={nation} className={`bg-${color}-900/20 border border-${color}-700/30 rounded-xl p-4`}>
                <h4 className="text-white font-bold text-lg mb-3">{nation}</h4>
                <ul className="space-y-1.5">
                  {milestones.map((m, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="text-green-400 text-xs mt-0.5 flex-shrink-0">✓</span>
                      <span className="text-slate-300 text-xs">{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="bg-slate-800 rounded-xl p-4">
            <h4 className="text-white font-semibold mb-3">📊 Race Statistics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total missions', usa: '~50', ussr: '~70+' },
                { label: 'Humans in space', usa: '73 (1961–75)', ussr: '32 (1961–75)' },
                { label: 'Moon landings', usa: '6 successful', ussr: '0' },
                { label: 'Fatalities', usa: '3 (Apollo 1)', ussr: '4 (Komarov + Soyuz 11)' },
              ].map((stat, i) => (
                <div key={i} className="bg-slate-900 rounded-lg p-3 text-center text-xs">
                  <div className="text-slate-500 mb-2">{stat.label}</div>
                  <div className="text-blue-300">🇺🇸 {stat.usa}</div>
                  <div className="text-red-300">⭐ {stat.ussr}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
            <h4 className="text-white font-semibold mb-2">The Verdict</h4>
            <p className="text-slate-300 text-sm leading-relaxed">
              The USSR won virtually every milestone before 1969: first satellite, first human, first spacewalk, first Moon impact. But the US set the highest bar — humans on the Moon — and achieved it. The Apollo program involved 400,000 engineers, scientists, and technicians. Total cost: ~$280 billion in today's dollars. The Space Race transformed telecommunications, computing, materials science, and our understanding of our place in the cosmos.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
