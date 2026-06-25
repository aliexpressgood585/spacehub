import { useState } from 'react'

interface Myth {
  id: number
  myth: string
  reality: string
  category: string
  explanation: string
  whyBelieved: string
  source: string
  icon: string
}

const MYTHS: Myth[] = [
  {
    id: 1,
    myth: 'Space is completely silent',
    reality: 'Space has sound — you just can\'t hear it the normal way',
    category: 'Space Physics',
    explanation: 'Sound requires a medium to travel through, and deep space is indeed near-vacuum. However, in nebulae and galaxy clusters, the gas density is high enough for pressure waves (sound) to propagate — just at frequencies billions of times too low for human ears to detect. NASA has converted these into audible range: the Perseus cluster produces a B-flat 57 octaves below middle C.',
    whyBelieved: 'The famous tagline "In Space, No One Can Hear You Scream" (Alien, 1979) is technically correct for the vacuum between stars — but inaccurate for the interstellar medium within nebulae and clusters.',
    source: 'NASA Chandra X-ray Observatory, Perseus Cluster sound recordings (2003, 2022)',
    icon: '🔊'
  },
  {
    id: 2,
    myth: 'You can see the Great Wall of China from space',
    reality: 'You cannot — it\'s far too narrow',
    category: 'Geography',
    explanation: 'The Great Wall is 5-8 meters wide. From the ISS (400 km up), you would need a visual acuity of 20/1.5 — 14× better than perfect human vision — to resolve an object that narrow. No astronaut has credibly reported seeing it without optical aid. Chinese astronaut Yang Liwei explicitly stated he could not see it on his 2003 mission.',
    whyBelieved: 'This myth appears in travel guides as early as 1932, predating the Space Age. It confuses "long" with "wide" — the wall is thousands of km long but only meters wide, making it essentially invisible from orbit.',
    source: 'NASA, ISS crew reports; Chinese astronaut Yang Liwei\'s statement (2003)',
    icon: '🧱'
  },
  {
    id: 3,
    myth: 'The sun is on fire / is burning',
    reality: 'The Sun generates energy through nuclear fusion, not combustion',
    category: 'Stellar Physics',
    explanation: 'Fire (combustion) is a chemical reaction requiring oxygen and producing CO₂ and H₂O. The Sun generates energy by fusing hydrogen atoms into helium at its core (15 million K, 250 billion atmospheres pressure). Nuclear fusion releases energy via E=mc² — 620 million tons of hydrogen fused per second, releasing 3.8 × 10²⁶ watts. There is no oxygen in the Sun\'s core to support burning.',
    whyBelieved: 'The Sun looks like fire and produces heat and light. This is an intuitive but incorrect analogy. If the Sun were burning chemically, it would exhaust its fuel in about 10,000 years — not the 5 billion years it has already burned.',
    source: 'Basic stellar physics; Eddington (1920) first proposed nuclear fusion as the energy source',
    icon: '☀️'
  },
  {
    id: 4,
    myth: 'Black holes are giant cosmic vacuum cleaners that suck everything in',
    reality: 'Black holes only pull objects that are already on a trajectory toward them',
    category: 'Black Holes',
    explanation: 'A black hole of the same mass as the Sun would have Earth orbiting it in exactly the same orbit — nothing would be "sucked in." The event horizon is only a few km across. Objects fall into black holes only if they lose orbital angular momentum (through tidal forces, accretion disk drag, or gravitational wave emission in binary systems). From a safe distance, a black hole\'s gravity is identical to any other object of the same mass.',
    whyBelieved: 'Sci-fi and popular culture portray black holes as dangerous vacuums. The word "hole" implies suction. In reality, black holes are simply objects with extreme gravity concentrated in a small volume.',
    source: 'General relativity; confirmed by observations of stars orbiting Sgr A* (Nobel Prize 2020)',
    icon: '🕳️'
  },
  {
    id: 5,
    myth: 'The Moon has a dark side that never sees sunlight',
    reality: 'Every part of the Moon receives sunlight — just not all at the same time',
    category: 'Moon',
    explanation: 'The Moon has a "far side" (permanently facing away from Earth due to tidal locking) and a "near side," but both sides experience day and night cycles. A lunar day is ~29.5 Earth days — during each cycle, every square meter of the Moon\'s surface receives about 14 Earth days of sunlight and 14 days of darkness. The "far side" gets just as much total sunlight as the near side.',
    whyBelieved: 'Pink Floyd\'s album "The Dark Side of the Moon" (1973) cemented this misconception. "Dark side" has also been used as a synonym for "far side" in popular culture, conflating the two different concepts.',
    source: 'Lunar science; China\'s Chang\'e 4 successfully landed on the far side (January 2019)',
    icon: '🌑'
  },
  {
    id: 6,
    myth: 'Astronauts are weightless in space because gravity is absent',
    reality: 'Gravity is very much present in orbit — astronauts are in freefall',
    category: 'Microgravity',
    explanation: 'At the ISS (400 km altitude), gravity is about 88% as strong as at Earth\'s surface. Astronauts float because they and the station are both in continuous freefall toward Earth — but moving horizontally fast enough (7.7 km/s) that they keep "missing" the planet. This is orbital mechanics. The correct term is "microgravity" or "freefall," not "zero gravity" or "weightlessness."',
    whyBelieved: 'Observing astronauts floating looks like there\'s no gravity. "Zero-G" and "weightlessness" language is used even by NASA for simplicity. The concept of freefall equals weightlessness is counterintuitive.',
    source: 'Newton\'s orbital mechanics; confirmed by ISS operations; GPS satellites require general relativity corrections for time dilation due to Earth\'s gravity',
    icon: '🚀'
  },
  {
    id: 7,
    myth: 'Stars twinkle; in space, they would twinkle too',
    reality: 'Stars only twinkle from Earth because of atmospheric turbulence',
    category: 'Optics',
    explanation: 'Stars appear to twinkle (scintillate) because their light passes through layers of Earth\'s atmosphere with varying temperature, density, and refractive index — the turbulence bends light in slightly different directions rapidly. From space, stars appear as steady pinpoints of light. Planets don\'t twinkle much from Earth because they have an angular diameter — larger than a point source — averaging out the atmospheric variations.',
    whyBelieved: 'Twinkling is such a ubiquitous feature of stars seen from Earth that it\'s embedded in nursery rhymes ("Twinkle, Twinkle, Little Star"). Astronomy wasn\'t advanced enough to easily demonstrate this misconception before space telescopes.',
    source: 'Atmospheric optics; confirmed by Hubble Space Telescope and all space observatories showing steady stars',
    icon: '⭐'
  },
  {
    id: 8,
    myth: 'The Big Bang was an explosion that happened at a point in space',
    reality: 'The Big Bang was an expansion of space itself, everywhere at once',
    category: 'Cosmology',
    explanation: 'The Big Bang did not happen at a location — it happened everywhere simultaneously. Space itself expanded from an extremely hot, dense state. There is no center of the Big Bang, no "edge" of the universe, and no direction you can point to say "it happened there." Every point in space was the origin of the Big Bang. This is why the Cosmic Microwave Background looks the same in every direction.',
    whyBelieved: 'The word "bang" and "explosion" imply a firecracker — an event in a preexisting space with a center and an edge. But the Big Bang created space itself; it was not an explosion within existing space.',
    source: 'General relativity (Einstein), confirmed by CMB isotropy; cosmological principle',
    icon: '💥'
  },
  {
    id: 9,
    myth: 'Humans would instantly explode in the vacuum of space',
    reality: 'Unprotected exposure to space would kill you, but not by explosion',
    category: 'Human Biology',
    explanation: 'Human skin is strong enough to contain your internal pressure in vacuum. You would not explode. The actual dangers: hypoxia (loss of consciousness in ~15 seconds due to oxygen deprivation); blood boiling (water in tissues vaporizes at body temperature in vacuum — painful but not explosive); extreme temperature; UV and radiation. Exposure for 90-120 seconds may be survivable if you return quickly to pressurized environment. NASA emergency protocols assume ~15 seconds of useful consciousness.',
    whyBelieved: 'Movies (Total Recall, 2001 Odyssey) show astronauts exploding or instantly freezing in space. The dramatic visuals stick even though the science is wrong. Real dangerous effects are less cinematically explosive.',
    source: 'NASA vacuum exposure studies; accidental decompression incidents (Soyuz 11, 1971); animal studies',
    icon: '🫁'
  },
  {
    id: 10,
    myth: 'The Milky Way is the only galaxy, and the other "nebulae" are part of it',
    reality: 'The universe contains ~2 trillion galaxies, each with billions of stars',
    category: 'History of Science',
    explanation: 'Until 1924, the prevailing view was that the Milky Way was the entire universe. The "Great Debate" (Curtis vs. Shapley, 1920) argued whether spiral nebulae were inside our galaxy or were "island universes" at enormous distances. Edwin Hubble settled it in 1924 by resolving individual Cepheid variable stars in Andromeda (M31) — proving it was a separate galaxy 2.5 million light-years away.',
    whyBelieved: 'This was the scientific consensus — not a popular myth — until 1924. The angular size of the Milky Way made it seem vast enough to be the whole universe. Without distance measurements, "fuzzy nebulae" simply looked like gas clouds within our galaxy.',
    source: 'Hubble (1924) Cepheid measurements of M31; Nobel-eligible discovery that transformed cosmology',
    icon: '🌌'
  },
  {
    id: 11,
    myth: 'Space is black because there are no stars nearby',
    reality: 'Space is black because the universe isn\'t old enough / large enough to fill every line of sight with starlight',
    category: 'Cosmology',
    explanation: 'This is Olbers\' Paradox (1823): if the universe were infinite, eternal, and static, every line of sight would eventually hit a star, and the night sky would be blindingly bright. The sky is dark because: (1) the universe has a finite age (13.8 Gyr — light from distant stars hasn\'t reached us yet); (2) the expansion of the universe redshifts distant starlight out of the visible range; (3) stars have finite lifetimes.',
    whyBelieved: 'It seems obvious — "Space is dark because there\'s nothing out there." But a truly infinite static universe would have a bright sky. The darkness of night is actually profound evidence for the Big Bang and an expanding universe.',
    source: 'Olbers (1823); Edgar Allan Poe (1848!) first hinted at the correct solution; modern resolution by Harrison (1987)',
    icon: '🌃'
  },
  {
    id: 12,
    myth: 'We only use 10% of our brains (often attributed to Einstein)',
    reality: 'Not about space, but Einstein didn\'t say it — and we use virtually all of our brain',
    category: 'Debunked Quote',
    explanation: 'Einstein never said this. The quote is often falsely attributed to him to add authority. Brain imaging shows virtually all regions are active, just not always simultaneously. The quote may have originated from misinterpretation of early neuroscience (noting that only ~10% of brain cells are neurons; the rest are glial cells — but glial cells are essential). As for "Einstein said" space quotes: "The definition of insanity is doing the same thing over and over" — also NOT Einstein. Verified Einstein quotes are carefully archived at Princeton.',
    whyBelieved: 'Misattributing quotes to famous scientists (especially Einstein) makes them seem more credible. The "10% of the brain" myth is also used by self-help gurus implying you can unlock hidden potential.',
    source: 'Einstein Archives, Princeton University; neuroscience consensus; Snopes.com fact-checks',
    icon: '🧠'
  },
]

const CATEGORIES = ['All', 'Space Physics', 'Stellar Physics', 'Black Holes', 'Moon', 'Microgravity', 'Cosmology', 'History of Science', 'Optics', 'Human Biology', 'Geography', 'Debunked Quote']

export default function SpaceMythsDebunked() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [expandedId, setExpandedId] = useState<number | null>(1)

  const filtered = activeCategory === 'All' ? MYTHS : MYTHS.filter(m => m.category === activeCategory)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Myths Debunked</h2>
      <p className="text-gray-400 text-sm mb-5">12 common misconceptions about space, astronomy, and the universe — with the real science behind each one</p>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: activeCategory === cat ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${activeCategory === cat ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
              color: activeCategory === cat ? '#a5b4fc' : '#94a3b8',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Myths list */}
      <div className="space-y-2">
        {filtered.map(myth => (
          <div
            key={myth.id}
            className="rounded-xl overflow-hidden transition-all"
            style={{ border: `1px solid ${expandedId === myth.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)'}` }}
          >
            {/* Header */}
            <button
              className="w-full text-left p-4 flex items-start gap-3 transition-all"
              style={{ background: expandedId === myth.id ? 'rgba(99,102,241,0.08)' : 'rgba(15,23,42,0.5)' }}
              onClick={() => setExpandedId(expandedId === myth.id ? null : myth.id)}
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">{myth.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-800/30 font-medium">MYTH</span>
                  <span className="text-xs text-gray-500">{myth.category}</span>
                </div>
                <div className="text-white text-sm font-medium mb-1 line-clamp-2">"{myth.myth}"</div>
                <div className="flex items-start gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-emerald-400 border border-green-800/30 font-medium flex-shrink-0">REALITY</span>
                  <div className="text-emerald-300 text-xs">{myth.reality}</div>
                </div>
              </div>
              <span className="text-gray-600 flex-shrink-0 mt-1">{expandedId === myth.id ? '▲' : '▼'}</span>
            </button>

            {/* Expanded content */}
            {expandedId === myth.id && (
              <div className="border-t border-gray-700/50 p-4 space-y-3 bg-gray-900/30">
                <div>
                  <div className="text-gray-400 text-xs uppercase font-semibold mb-1.5">The Science</div>
                  <p className="text-gray-200 text-sm leading-relaxed">{myth.explanation}</p>
                </div>
                <div>
                  <div className="text-gray-400 text-xs uppercase font-semibold mb-1.5">Why People Believe It</div>
                  <p className="text-gray-300 text-sm leading-relaxed">{myth.whyBelieved}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Source</div>
                  <p className="text-gray-400 text-xs">{myth.source}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500">No myths in this category.</div>
      )}
    </div>
  )
}
