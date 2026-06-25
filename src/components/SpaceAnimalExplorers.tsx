import { useState } from 'react'

type Era = '1940s' | '1950s' | '1960s' | '1970s' | '2000s'

interface AnimalExplorer {
  id: string
  name: string
  species: string
  icon: string
  color: string
  country: string
  flag: string
  date: string
  era: Era
  mission: string
  survived: boolean
  survivalDetail: string
  purpose: string
  what: string
  legacy: string
  funFact: string
}

const ANIMALS: AnimalExplorer[] = [
  {
    id: 'laika',
    name: 'Laika',
    species: 'Dog (Husky-Terrier mix)',
    icon: '🐕',
    color: '#ef4444',
    country: 'USSR',
    flag: '🇷🇺',
    date: 'November 3, 1957',
    era: '1950s',
    mission: 'Sputnik 2',
    survived: false,
    survivalDetail: 'Died within hours of launch from overheating. The spacecraft had no re-entry capability — she was never expected to return.',
    purpose: 'To prove a living organism could survive launch and orbital spaceflight. Sputnik 2 launched just one month after Sputnik 1 for political reasons (70th anniversary of the Revolution) — Laika was essentially sacrificed for propaganda.',
    what: 'Laika ("Barker" in Russian) was a stray dog found on Moscow streets. She was approximately 3 years old, female, ~6 kg. She orbited Earth in Sputnik 2 for 5 months (the satellite orbited until April 1958, when it re-entered and burned up).',
    legacy: 'The first animal to orbit Earth. Laika proved that living things could survive launch forces and weightlessness — at least for a time. Her mission accelerated the space race and directly influenced the development of life-support systems for future human spaceflight. There are memorials to her in Moscow.',
    funFact: 'For 45 years, the Soviet Union claimed Laika survived 4 days and was euthanized. In 2002, scientist Oleg Gazenko revealed she died within 5-7 hours from heat stress and panic. He said: "The more time passes, the more I\'m sorry about it. We didn\'t learn enough from this mission to justify the death of the dog."'
  },
  {
    id: 'ham',
    name: 'Ham',
    species: 'Chimpanzee (Pan troglodytes)',
    icon: '🐒',
    color: '#f97316',
    country: 'USA',
    flag: '🇺🇸',
    date: 'January 31, 1961',
    era: '1960s',
    mission: 'Mercury-Redstone 2',
    survived: true,
    survivalDetail: 'Survived the flight and recovery. Ham lived until 1983 at the Cincinnati Zoo (age ~26), having appeared in the film "Project X."',
    purpose: 'To test the Mercury capsule life-support systems and prove an occupant could perform tasks during spaceflight. NASA needed to confirm that astronauts could function during acceleration, weightlessness, and re-entry — not just survive passively.',
    what: 'Ham (Holloman Aerospace Medical Center) was trained to pull levers in response to flashing lights. During his 16-minute suborbital flight, he correctly performed his tasks — showing that fine motor control was possible in microgravity. His capsule reached an altitude of 253 km and landed in the Atlantic, where he was recovered 3 hours later.',
    legacy: 'Ham\'s successful flight directly preceded Alan Shepard\'s flight just 3 months later (May 5, 1961) — America\'s first human in space. Ham proved the Mercury capsule was human-ready. He\'s often called "Ham the Astrochimp."',
    funFact: 'Ham reportedly bit one of the recovery crew during retrieval. He was hungry — the flight had disrupted his feeding schedule. Upon seeing his capsule after the flight (opened for inspection), Ham reportedly ran in the opposite direction.'
  },
  {
    id: 'enos',
    name: 'Enos',
    species: 'Chimpanzee (Pan troglodytes)',
    icon: '🐒',
    color: '#fbbf24',
    country: 'USA',
    flag: '🇺🇸',
    date: 'November 29, 1961',
    era: '1960s',
    mission: 'Mercury-Atlas 5',
    survived: true,
    survivalDetail: 'Completed two orbits of Earth and was recovered safely after 3 hours 20 minutes. Enos died 11 months later from an unrelated illness (shigellosis, a bacterial infection).',
    purpose: 'The last test before John Glenn\'s orbital flight. NASA needed to prove the Mercury capsule could handle a full orbital mission. Enos was the first American (and second animal after Laika) to orbit Earth.',
    what: 'Enos performed complex tasks during his two orbits — pushing levers to avoid mild electric shocks and responding to visual stimuli. The test successfully verified all systems. The mission was cut short from 3 planned orbits due to a thruster problem — not Enos\'s performance.',
    legacy: 'Enos\'s flight directly enabled John Glenn\'s historic orbital mission (February 20, 1962). He proved both the capsule and biological systems could support three orbital passes. He\'s the forgotten chimp of the Space Age — Ham gets the glory, but Enos actually orbited.',
    funFact: 'During training, Enos was accidentally set up so that correct lever pulls gave him shocks, while wrong ones gave him bananas. He reportedly did the correct action anyway, then spent the next 48 hours pulling his hair out. They quickly fixed the training error.'
  },
  {
    id: 'belka_strelka',
    name: 'Belka & Strelka',
    species: 'Dogs (mixed breed)',
    icon: '🐕',
    color: '#22c55e',
    country: 'USSR',
    flag: '🇷🇺',
    date: 'August 19, 1960',
    era: '1960s',
    mission: 'Sputnik 5 (Korabl-Sputnik 2)',
    survived: true,
    survivalDetail: 'Both survived and were recovered after 1 day and 17 orbits. Belka and Strelka became Soviet celebrities. Strelka later had puppies — one of which (Pushinka) was gifted to US President John F. Kennedy\'s daughter Caroline.',
    purpose: 'To test whether a living creature could survive extended orbital spaceflight and safe re-entry — the full mission profile that would be needed for Yuri Gagarin\'s flight less than a year later.',
    what: 'Belka ("Squirrel") and Strelka ("Little Arrow") spent approximately 25 hours in orbit, completing 17 orbits. They were accompanied by 40 mice, 2 rats, flies, plants, fungi, and other biological samples. The entire biological payload was recovered intact.',
    legacy: 'Proved beyond doubt that mammals could survive extended orbital spaceflight and re-entry. Directly enabled Yuri Gagarin\'s mission (April 12, 1961). Pushinka (Strelka\'s puppy), gifted to the Kennedys, had her own puppies in the White House — nicknamed "Pupniks" by JFK.',
    funFact: 'Belka reportedly barked and vomited during orbit — which concerned Soviet scientists and led to the mission of Voskhod 1 including a physician. Strelka was the calmer of the two. They were paraded through Moscow after recovery and are now taxidermied exhibits in a Moscow museum.'
  },
  {
    id: 'fruit_flies',
    name: 'Fruit Flies',
    species: 'Drosophila melanogaster',
    icon: '🦟',
    color: '#8b5cf6',
    country: 'USA',
    flag: '🇺🇸',
    date: 'February 20, 1947',
    era: '1940s',
    mission: 'V-2 rocket (White Sands, NM)',
    survived: true,
    survivalDetail: 'The capsule was recovered and the flies were alive — the first animals recovered from space. They reached an altitude of 109 km (above the Kármán line).',
    purpose: 'To study the effects of radiation at high altitude on living organisms. Fruit flies were chosen because their genetics are well-understood (genome nearly identical in function to humans in key genes) and they reproduce quickly, making radiation-induced mutations easy to study.',
    what: 'A V-2 rocket captured from Nazi Germany was repurposed for research. The flies reached 109 km altitude, passing the Kármán line. The capsule with the flies was recovered by parachute 32 minutes after launch.',
    legacy: 'The first animals in space (technically) and the first recovered. Their radiation exposure study helped establish radiation limits for later human spaceflight. Today, fruit flies are still sent to the ISS to study muscle atrophy, immune function, and cardiac effects of spaceflight.',
    funFact: 'Fruit flies share 75% of the disease-causing genes found in humans. When researchers want to understand what happens to human cells in space, fruit flies are still the fastest way to get answers — a generation takes only 2 weeks. ISS crews regularly tend to fly cultures.'
  },
  {
    id: 'spiders',
    name: 'Arabella & Anita',
    species: 'Cross Spiders (Araneus diadematus)',
    icon: '🕷️',
    color: '#64748b',
    country: 'USA',
    flag: '🇺🇸',
    date: 'July 28, 1973',
    era: '1970s',
    mission: 'Skylab 3',
    survived: true,
    survivalDetail: 'Both spiders survived the 59-day mission. Arabella built a web on day 2 (thinner than on Earth due to lack of gravity). Both were found dead shortly after return — likely from dehydration.',
    purpose: 'A student experiment proposed by 17-year-old Judy Miles from Massachusetts to see whether spiders could spin webs in weightlessness. NASA accepted the proposal.',
    what: 'Arabella struggled on day 1 — she seemed disoriented by weightlessness. By day 2, she had built a web. It was thinner and more irregular than webs on Earth, but still functional. Anita was the control (Earth equivalent). Both survived 59 days aboard Skylab.',
    legacy: 'Showed that spiders can adapt their web-building behavior to microgravity. Led to ongoing research on how organisms adapt their spatial navigation in space. The spiders (now taxidermied) are at the Smithsonian National Air and Space Museum.',
    funFact: 'The webs Arabella built in space were analyzed and found to be more complex in some ways than Earth webs — thinner, but with more varied thread thicknesses (whereas Earth webs are more uniform). Scientists think this may be the spider compensating for the lack of gravity cues.'
  },
  {
    id: 'nemo',
    name: 'Fish on Skylab / ISS',
    species: 'Mummichog (Fundulus heteroclitus) + Medaka fish',
    icon: '🐟',
    color: '#06b6d4',
    country: 'USA / Japan',
    flag: '🇺🇸',
    date: '1973 (Skylab) / 2012 (ISS)',
    era: '2000s',
    mission: 'Skylab 3 & ISS experiments',
    survived: true,
    survivalDetail: 'Skylab fish initially swam in circles (no up/down orientation). Medaka fish on ISS bred and had offspring — the first vertebrate animals to mate and reproduce in space.',
    purpose: 'Fish have an otolith (inner ear balance system) similar to humans. Studying how fish orient in microgravity helps understand human vestibular adaptation — the disorientation and nausea that astronauts experience.',
    what: 'Skylab mummichog fish initially swam in looping spirals — searching for "up" but finding none. They gradually adapted. ISS medaka fish (a Japanese rice fish) were studied in JAXA aquarium modules. In 2012, medaka fish mated, spawned eggs, and the eggs hatched — the first vertebrate reproduction in space.',
    legacy: 'Fish research has directly informed countermeasures for space motion sickness. The medaka reproduction study is crucial for understanding whether humans could breed during long-duration deep space missions — a critical question for any multi-generational interstellar voyage.',
    funFact: 'When Skylab fish were returned to Earth, they immediately began swimming normally — their brains had adapted to space and then re-adapted to gravity. Some of the fish recovered from zero-g disorientation remarkably quickly, suggesting vertebrate brains are more flexible than expected.'
  },
  {
    id: 'worms',
    name: 'C. elegans Roundworms',
    species: 'Caenorhabditis elegans',
    icon: '🪱',
    color: '#10b981',
    country: 'USA',
    flag: '🇺🇸',
    date: '1999 – present (multiple missions)',
    era: '2000s',
    mission: 'STS-42, STS-107 (Columbia), ISS',
    survived: true,
    survivalDetail: 'C. elegans survived aboard Columbia (STS-107), which disintegrated on re-entry. The worm canisters were recovered intact from the Texas debris field — the organisms had survived the catastrophe. The Columbia worms are now preserved in the Smithsonian.',
    purpose: 'C. elegans is a 1mm transparent worm whose entire nervous system (302 neurons, all mapped) and genome are completely known. It\'s the best organism for studying muscle atrophy, aging, and genetic responses to spaceflight.',
    what: 'Multiple generations of C. elegans have been raised in space. They show muscle atrophy similar to human astronauts — but also activate protective genes. In some experiments, worms that spent multiple generations in space showed heritable genetic changes that help resist microgravity effects.',
    legacy: 'The Columbia worms\' survival was extraordinary. Their descendants have been studied extensively. C. elegans research has identified the TGF-β signaling pathway as a key regulator of muscle loss in space — now a target for pharmaceutical countermeasures for human astronauts.',
    funFact: 'C. elegans is the only organism whose entire connectome (wiring diagram of all neurons) is completely mapped. By studying how its 302 neurons change in space, researchers are building a fundamental understanding of how microgravity affects the nervous system at the molecular level.'
  },
]

const ERAS: { id: Era; label: string }[] = [
  { id: '1940s', label: '1940s' },
  { id: '1950s', label: '1950s' },
  { id: '1960s', label: '1960s' },
  { id: '1970s', label: '1970s' },
  { id: '2000s', label: '2000s+' },
]

export default function SpaceAnimalExplorers() {
  const [selected, setSelected] = useState<AnimalExplorer>(ANIMALS[0])
  const [filterEra, setFilterEra] = useState<Era | 'all'>('all')

  const visible = filterEra === 'all' ? ANIMALS : ANIMALS.filter(a => a.era === filterEra)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Animal Explorers of Space</h2>
      <p className="text-gray-400 text-sm mb-5">Every creature that has ventured beyond our atmosphere — from fruit flies to chimpanzees — and what their sacrifice taught us</p>

      {/* Era filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterEra('all')}
          className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
          style={{
            background: filterEra === 'all' ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
            border: `1px solid ${filterEra === 'all' ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
            color: filterEra === 'all' ? '#a5b4fc' : '#94a3b8',
          }}
        >All</button>
        {ERAS.map(era => (
          <button
            key={era.id}
            onClick={() => setFilterEra(era.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: filterEra === era.id ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${filterEra === era.id ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
              color: filterEra === era.id ? '#a5b4fc' : '#94a3b8',
            }}
          >{era.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Animal list */}
        <div className="space-y-2">
          {visible.map(animal => (
            <button
              key={animal.id}
              onClick={() => setSelected(animal)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === animal.id ? animal.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === animal.id ? animal.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{animal.icon}</span>
                <div>
                  <div className="font-bold text-sm" style={{ color: selected.id === animal.id ? animal.color : '#e2e8f0' }}>{animal.name}</div>
                  <div className="text-gray-500 text-xs">{animal.species}</div>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span>{animal.flag}</span>
                  <div
                    className="text-xs px-1.5 py-0.5 rounded-md font-bold"
                    style={{
                      background: animal.survived ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: animal.survived ? '#86efac' : '#fca5a5',
                    }}
                  >
                    {animal.survived ? '✓ Survived' : '✕ Lost'}
                  </div>
                </div>
              </div>
              <div className="text-gray-600 text-xs">{animal.date} • {animal.mission}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3">
              <span className="text-5xl flex-shrink-0">{selected.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <span>{selected.flag}</span>
                  <div
                    className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{
                      background: selected.survived ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: selected.survived ? '#86efac' : '#fca5a5',
                      border: `1px solid ${selected.survived ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}
                  >
                    {selected.survived ? '✓ Survived' : '✕ Did Not Return'}
                  </div>
                </div>
                <div className="text-sm" style={{ color: selected.color }}>{selected.species}</div>
                <div className="text-gray-400 text-xs mt-0.5">{selected.mission} • {selected.date}</div>
              </div>
            </div>
            <p className="text-gray-300 text-sm mt-3 leading-relaxed">{selected.what}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Why They Were Sent</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.purpose}</p>
          </div>

          <div className="rounded-xl p-4" style={{
            background: selected.survived ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${selected.survived ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.survived ? '#86efac' : '#fca5a5' }}>
              {selected.survived ? '✓ Survival & Return' : '✕ Fate'}
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.survivalDetail}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Scientific Legacy</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.legacy}</p>
          </div>

          <div className="bg-amber-900/20 rounded-xl p-4 border border-amber-800/30">
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">😄 The Fascinating Part</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="bg-gray-800/40 rounded-xl p-3 text-center border border-gray-700/30">
          <div className="text-2xl font-black text-white">32+</div>
          <div className="text-gray-500 text-xs">Species sent to space</div>
        </div>
        <div className="bg-gray-800/40 rounded-xl p-3 text-center border border-gray-700/30">
          <div className="text-2xl font-black text-emerald-400">1947</div>
          <div className="text-gray-500 text-xs">First animals in space (flies)</div>
        </div>
        <div className="bg-gray-800/40 rounded-xl p-3 text-center border border-gray-700/30">
          <div className="text-2xl font-black text-indigo-400">ISS</div>
          <div className="text-gray-500 text-xs">Animals still sent today</div>
        </div>
      </div>
    </div>
  )
}
