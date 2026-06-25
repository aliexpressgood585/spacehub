import { useState } from 'react'

type Era = 'ancient' | 'renaissance' | 'modern' | 'space' | 'digital'

interface Milestone {
  id: string
  year: string
  yearNum: number
  era: Era
  icon: string
  color: string
  title: string
  who: string
  what: string
  why: string
  howWeKnow: string
  impact: string
  quote?: string
  quoteAuthor?: string
}

const MILESTONES: Milestone[] = [
  {
    id: 'heliocentric',
    year: '1543',
    yearNum: 1543,
    era: 'renaissance',
    icon: '☀️',
    color: '#fbbf24',
    title: 'Heliocentric Model of the Solar System',
    who: 'Nicolaus Copernicus',
    what: 'Published "De revolutionibus orbium coelestium" — the first rigorous mathematical model placing the Sun, not Earth, at the center of the solar system.',
    why: 'Until 1543, the Ptolemaic geocentric model (Earth at center) had been accepted for 1,400 years. Church doctrine and common sense agreed: the Earth feels stationary; the sky moves. Copernicus dared to suggest otherwise.',
    howWeKnow: 'Copernicus noticed the geocentric model required extremely complex "epicycles" to explain planetary retrograde motion. A Sun-centered model was far simpler and more elegant. He feared the reaction — the book was published anonymously as he lay dying.',
    impact: 'Triggered the Scientific Revolution. Led to Galileo\'s conflict with the Church. Led to Kepler\'s laws, then Newton\'s gravity, then Einstein\'s relativity. Everything in modern physics traces back to this moment of intellectual courage.',
    quote: 'To know that we know what we know, and to know that we do not know what we do not know, that is true knowledge.',
    quoteAuthor: 'Nicolaus Copernicus'
  },
  {
    id: 'telescope',
    year: '1610',
    yearNum: 1610,
    era: 'renaissance',
    icon: '🔭',
    color: '#a855f7',
    title: 'Galileo Turns Telescope to the Sky',
    who: 'Galileo Galilei',
    what: 'First systematic telescopic observations of the heavens — discovered Jupiter\'s four largest moons, lunar craters, sunspots, the phases of Venus, and countless stars in the Milky Way.',
    why: 'The telescope was invented around 1608 in the Netherlands. Galileo built his own and pointed it upward — a revolutionary act. What he saw contradicted the dogma that celestial objects were perfect spheres moving in perfect circles.',
    howWeKnow: 'Galileo observed Jupiter\'s moons (Io, Europa, Ganymede, Callisto) moving night after night. Their motion could only be explained if they orbited Jupiter, not Earth. This proved other worlds had their own satellites. Venus showed phases like the Moon — only possible if it orbited the Sun.',
    impact: 'Definitively proved the Copernican model. Led to Galileo\'s trial by the Inquisition. Established the principle that nature is understood by observation, not dogma. The birth of empirical science.',
    quote: 'I do not feel obliged to believe that the same God who has endowed us with sense, reason, and intellect has intended us to forgo their use.',
    quoteAuthor: 'Galileo Galilei'
  },
  {
    id: 'gravity',
    year: '1687',
    yearNum: 1687,
    era: 'renaissance',
    icon: '🍎',
    color: '#22c55e',
    title: 'Law of Universal Gravitation',
    who: 'Isaac Newton',
    what: 'Published "Principia Mathematica" — discovered that the same force making apples fall also keeps the Moon in orbit and governs all planetary motion. Gravity follows an inverse-square law: F = Gm₁m₂/r².',
    why: 'Kepler had described how planets move (elliptical orbits, equal areas in equal times) but not why. Newton unified terrestrial and celestial mechanics into a single mathematical framework.',
    howWeKnow: 'Newton showed mathematically that an inverse-square gravitational force naturally produces Kepler\'s laws. He could calculate the Moon\'s orbital period from Earth\'s surface gravity — and it matched perfectly. He could also explain tides, the precession of Earth\'s axis, and the trajectories of comets.',
    impact: 'The foundation of classical mechanics. Used to navigate spacecraft to this day. Predicted Neptune\'s existence before it was seen (1846). Its replacement — general relativity — was needed only at extreme velocities and masses.',
    quote: 'If I have seen further than others, it is by standing upon the shoulders of giants.',
    quoteAuthor: 'Isaac Newton'
  },
  {
    id: 'uranus',
    year: '1781',
    yearNum: 1781,
    era: 'renaissance',
    icon: '🪐',
    color: '#06b6d4',
    title: 'Discovery of Uranus — First New Planet',
    who: 'William Herschel',
    what: 'Discovered Uranus using a homemade telescope — the first planet found since antiquity, and the first discovered with a telescope. Doubled the known size of the solar system overnight.',
    why: 'Mercury, Venus, Mars, Jupiter, and Saturn were known since ancient times (visible to the naked eye). For millennia, humanity\'s solar system had 5 planets. Herschel changed that.',
    howWeKnow: 'Herschel initially thought he\'d found a comet. But follow-up observations showed a circular orbit at 19 AU — clearly a planet. Subsequent analysis of Uranus\'s orbit revealed perturbations that led to the prediction and discovery of Neptune in 1846.',
    impact: 'Proved the solar system was vastly larger than thought. Led to the discovery of Neptune (1846) and Pluto (1930). Established that the solar system could still yield surprises — inspiring systematic sky surveys.',
    quote: 'By reflecting on this matter in every point of view, I could no longer doubt that the object I had seen was a new planet.',
    quoteAuthor: 'William Herschel'
  },
  {
    id: 'spectroscopy',
    year: '1859',
    yearNum: 1859,
    era: 'modern',
    icon: '🌈',
    color: '#f97316',
    title: 'Spectroscopy — Reading the Composition of Stars',
    who: 'Gustav Kirchhoff & Robert Bunsen',
    what: 'Discovered that each element produces a unique spectral fingerprint when heated. Applied to sunlight — found sodium, calcium, iron, and other elements in the Sun. For the first time, humanity could know what distant stars are made of.',
    why: 'Physicist Auguste Comte had declared (1835) that knowing the composition of stars would forever be beyond human reach. Kirchhoff proved him wrong within 24 years.',
    howWeKnow: 'Every element absorbs and emits light at specific wavelengths — an atomic fingerprint. By passing starlight through a prism, astronomers can read off the chemical composition, temperature, velocity, and magnetic field strength of stars millions of light-years away.',
    impact: 'The foundation of modern astrophysics. Led to the discovery of helium (found in the Sun\'s spectrum before it was found on Earth, 1868). Now used to detect exoplanet atmospheres, measure galactic rotation, and discover dark matter.',
    quote: 'The spectrum of the Sun contains lines that coincide with those of sodium... Thus the existence of sodium in the solar atmosphere is demonstrated.',
    quoteAuthor: 'Gustav Kirchhoff (1859)'
  },
  {
    id: 'island_universes',
    year: '1924',
    yearNum: 1924,
    era: 'modern',
    icon: '🌀',
    color: '#8b5cf6',
    title: 'The Universe Has Other Galaxies',
    who: 'Edwin Hubble',
    what: 'Resolved individual stars in the Andromeda "nebula" using Cepheid variable stars as distance markers — proved Andromeda was a separate galaxy 2.5 million light-years away, not a gas cloud within the Milky Way.',
    why: 'The Great Debate (1920) between astronomers Harlow Shapley and Heber Curtis had split the astronomical community: was the Milky Way the entire universe, with spiral "nebulae" being nearby gas clouds? Or were they "island universes" — separate galaxies?',
    howWeKnow: 'Cepheid variable stars pulse at a period directly related to their luminosity (discovered by Henrietta Leavitt, 1908). By measuring a Cepheid\'s period and apparent brightness, you can calculate its true distance. Hubble found Cepheids in Andromeda and measured: 2.5 million light-years — far outside any possible extent of the Milky Way.',
    impact: 'Transformed our understanding of scale. The Milky Way went from being the universe to being one of ~2 trillion galaxies. Hubble continued to find that these galaxies are all moving away from us — leading to the discovery of the expanding universe.',
    quote: 'Equipped with his five senses, man explores the universe around him and calls the adventure Science.',
    quoteAuthor: 'Edwin Hubble'
  },
  {
    id: 'expanding_universe',
    year: '1929',
    yearNum: 1929,
    era: 'modern',
    icon: '📈',
    color: '#ef4444',
    title: 'The Universe Is Expanding',
    who: 'Edwin Hubble (with Vesto Slipher & Georges Lemaître)',
    what: 'Discovered that all distant galaxies are receding from us, with recession velocity proportional to distance (Hubble\'s Law). The universe is expanding — implying it was once much smaller and hotter.',
    why: 'Vesto Slipher had measured galactic redshifts since 1912. Lemaître proposed the expanding universe in 1927 (largely ignored). Hubble\'s 1929 paper, combining distances and redshifts for 24 galaxies, made the case irrefutable.',
    howWeKnow: 'Redshift: light from a receding source is stretched to longer (redder) wavelengths. By combining the spectroscopic redshift (recession velocity) with Cepheid distances, Hubble found the linear relationship: v = H₀ × d.',
    impact: 'Forced Einstein to retract his "cosmological constant" (added to keep the universe static) — his "greatest blunder." Led to the Big Bang theory. Led to the discovery of the CMB (1965). Led to the discovery of dark energy (1998). All modern cosmology begins here.',
    quote: 'We find ourselves in the midst of nothing so much as enormous bubbles...',
    quoteAuthor: 'Edwin Hubble'
  },
  {
    id: 'cmb',
    year: '1965',
    yearNum: 1965,
    era: 'space',
    icon: '📡',
    color: '#3b82f6',
    title: 'Cosmic Microwave Background Discovered',
    who: 'Arno Penzias & Robert Wilson (Bell Labs)',
    what: 'Accidentally discovered a persistent microwave noise in their antenna that corresponded to a blackbody temperature of 2.73 K — the afterglow of the Big Bang, permeating all of space.',
    why: 'They were calibrating a horn antenna for satellite communications. No matter where they pointed it, they found a constant microwave background — including after removing pigeon droppings from the antenna.',
    howWeKnow: 'The CMB is the thermal afterglow of the hot plasma that filled the universe ~380,000 years after the Big Bang — when it first cooled enough for atoms to form and photons to travel freely. The 2.73 K temperature matches theoretical predictions from the Big Bang model almost exactly.',
    impact: 'Definitive proof of the Big Bang. Won the 1978 Nobel Prize. Later mapped in exquisite detail by COBE (1992), WMAP (2003), and Planck (2013) — revealing the primordial density fluctuations that became today\'s galaxies. One of the most important scientific discoveries of the 20th century.',
    quote: 'We had stumbled upon the echo of the Big Bang.',
    quoteAuthor: 'Arno Penzias'
  },
  {
    id: 'first_exoplanet',
    year: '1995',
    yearNum: 1995,
    era: 'digital',
    icon: '🌍',
    color: '#10b981',
    title: 'First Confirmed Exoplanet Around Sun-like Star',
    who: 'Michel Mayor & Didier Queloz',
    what: 'Detected 51 Pegasi b — the first exoplanet confirmed around a main-sequence star, using the radial velocity (Doppler wobble) method. A Jupiter-mass planet in a 4.2-day orbit.',
    why: 'Astronomers had searched for decades. A pulsar planet was found in 1992 (PSR 1257+12), but pulsars are exotic. Mayor and Queloz found a planet around a normal Sun-like star.',
    howWeKnow: 'When a planet orbits a star, it gravitationally tugs the star, causing a tiny periodic Doppler shift in the star\'s spectral lines. Over many observations, this "wobble" traces the planet\'s orbital period and mass. 51 Peg b wobbled its star by 56 m/s every 4.2 days.',
    impact: 'Launched the exoplanet era. By 2026, over 5,600 exoplanets are confirmed. Kepler (2009–2018) found thousands more. James Webb Space Telescope is now characterizing exoplanet atmospheres. The discovery transformed the question "Are we alone?" from philosophy to science.',
    quote: 'We found a planet that had no right to exist — yet there it was.',
    quoteAuthor: 'Didier Queloz'
  },
  {
    id: 'dark_energy',
    year: '1998',
    yearNum: 1998,
    era: 'digital',
    icon: '💨',
    color: '#64748b',
    title: 'Discovery of Dark Energy — Accelerating Expansion',
    who: 'Saul Perlmutter, Brian Schmidt & Adam Riess',
    what: 'Discovered that distant Type Ia supernovae were dimmer than expected — the universe\'s expansion is not slowing due to gravity, but accelerating. An unknown repulsive energy (dark energy) pervades all space.',
    why: 'Everyone expected gravity to be slowing the expansion. The two competing teams (Supernova Cosmology Project and High-Z Supernova Search Team) were trying to measure the deceleration rate — and both independently found acceleration.',
    howWeKnow: 'Type Ia supernovae are "standard candles" — they all reach the same peak brightness. By comparing apparent brightness (distance) vs. redshift (recession velocity), you can map the universe\'s expansion history. The 1998 data showed supernovae were ~10% dimmer than expected — they were farther than they should be if expansion was decelerating.',
    impact: '2011 Nobel Prize in Physics. Dark energy makes up ~68% of the universe\'s energy content. It drives the expansion that will eventually isolate our Local Group from all other galaxies. Its fundamental nature remains completely unknown — the biggest unsolved problem in cosmology.',
    quote: 'My reaction was: this is crazy. Maybe we made a mistake.',
    quoteAuthor: 'Adam Riess (on discovering the accelerating expansion)'
  },
  {
    id: 'gravitational_waves',
    year: '2015',
    yearNum: 2015,
    era: 'digital',
    icon: '〰️',
    color: '#a855f7',
    title: 'First Detection of Gravitational Waves',
    who: 'LIGO Scientific Collaboration',
    what: 'Detected gravitational waves from the merger of two black holes (~29 and 36 solar masses), ~1.3 billion light-years away — the ripples in spacetime predicted by Einstein in 1915, finally observed 100 years later.',
    why: 'The signal (GW150914, detected September 14, 2015) was a 0.2-second chirp that moved LIGO\'s mirrors by 10⁻¹⁸ m — one-thousandth the diameter of a proton — over a 4 km baseline. This required the most precise measurement in the history of science.',
    howWeKnow: 'LIGO (Laser Interferometer Gravitational-Wave Observatory) uses laser interferometry to measure spacetime stretching. The entire process — two black holes inspiraling over billions of years, emitting gravitational waves — was predicted exactly by general relativity and matched observations to extraordinary precision.',
    impact: '2017 Nobel Prize in Physics. Opened an entirely new observational window on the universe. LIGO+Virgo have since detected dozens of black hole and neutron star mergers. Multi-messenger astronomy: GW170817 was observed in gravitational waves AND electromagnetic radiation simultaneously — neutron star merger that confirmed heavy elements (gold, platinum) are made in these events.',
    quote: 'We have detected gravitational waves. We did it.',
    quoteAuthor: 'David Reitze (LIGO Executive Director, announcement on February 11, 2016)'
  },
  {
    id: 'bh_image',
    year: '2019',
    yearNum: 2019,
    era: 'digital',
    icon: '🕳️',
    color: '#f97316',
    title: 'First Image of a Black Hole',
    who: 'Event Horizon Telescope Collaboration',
    what: 'First direct image of a black hole shadow — M87*\'s event horizon, 6.5 billion solar masses, 55 million light-years away. Followed by the Milky Way\'s central black hole Sagittarius A* (2022).',
    why: 'Despite black holes being predicted by general relativity in 1915, no direct image had ever been captured. The problem: M87*\'s event horizon subtends just 40 microarcseconds — like reading a newspaper in New York from Paris.',
    howWeKnow: 'Eight radio telescopes across the world (from Antarctica to Hawaii to Spain) were synchronized via atomic clocks, creating a virtual Earth-sized telescope. The collective data (petabytes) was shipped to processing centers and combined using Very Long Baseline Interferometry (VLBI).',
    impact: 'Confirmed predictions of general relativity in the strongest gravity regime ever tested. Measured the mass and spin of a supermassive black hole. Began an era of "black hole astronomy." The 2022 Sgr A* image shows our own galaxy\'s 4-million-solar-mass black hole.',
    quote: 'We\'ve seen what we thought was unseeable.',
    quoteAuthor: 'Sheperd Doeleman (EHT Director)'
  },
]

const ERAS: { id: Era; label: string; color: string; range: string }[] = [
  { id: 'ancient', label: 'Ancient', color: '#92400e', range: 'Before 1500' },
  { id: 'renaissance', label: 'Renaissance', color: '#fbbf24', range: '1500–1800' },
  { id: 'modern', label: 'Modern', color: '#3b82f6', range: '1800–1957' },
  { id: 'space', label: 'Space Age', color: '#22c55e', range: '1957–1990' },
  { id: 'digital', label: 'Digital', color: '#a855f7', range: '1990–Today' },
]

export default function AstronomyMilestones() {
  const [selected, setSelected] = useState<Milestone>(MILESTONES[0])
  const [filterEra, setFilterEra] = useState<Era | 'all'>('all')

  const visible = filterEra === 'all' ? MILESTONES : MILESTONES.filter(m => m.era === filterEra)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Astronomy's Greatest Discoveries</h2>
      <p className="text-gray-400 text-sm mb-5">The breakthroughs that transformed how humanity sees the universe — from the heliocentric model to gravitational waves</p>

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
        >All Eras</button>
        {ERAS.map(era => (
          <button
            key={era.id}
            onClick={() => setFilterEra(era.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: filterEra === era.id ? era.color + '30' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${filterEra === era.id ? era.color + '80' : 'rgba(255,255,255,0.05)'}`,
              color: filterEra === era.id ? era.color : '#94a3b8',
            }}
          >
            {era.label} <span className="opacity-60 text-[10px]">{era.range}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Timeline list */}
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700/60" />
          <div className="space-y-2">
            {visible.map(ms => (
              <button
                key={ms.id}
                onClick={() => setSelected(ms)}
                className="w-full text-left pl-9 pr-3 py-2.5 rounded-xl transition-all relative"
                style={{
                  background: selected.id === ms.id ? ms.color + '18' : 'transparent',
                  border: `1px solid ${selected.id === ms.id ? ms.color + '45' : 'transparent'}`,
                }}
              >
                <div className="absolute left-2.5 top-3.5 w-3 h-3 rounded-full border-2 z-10"
                  style={{ background: selected.id === ms.id ? ms.color : '#1e293b', borderColor: ms.color }} />
                <div className="font-mono text-xs mb-0.5" style={{ color: ms.color }}>{ms.year}</div>
                <div className="text-sm font-semibold" style={{ color: selected.id === ms.id ? ms.color : '#e2e8f0' }}>{ms.title}</div>
                <div className="text-gray-500 text-xs">{ms.who}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3">
              <span className="text-4xl flex-shrink-0">{selected.icon}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-mono text-sm font-bold" style={{ color: selected.color }}>{selected.year}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full text-gray-400" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    {ERAS.find(e => e.id === selected.era)?.label}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-0.5">{selected.title}</h3>
                <div className="text-sm" style={{ color: selected.color }}>by {selected.who}</div>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mt-3">{selected.what}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Historical Context</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.why}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">How We Know</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.howWeKnow}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="text-emerald-400 text-xs uppercase font-semibold mb-2">Lasting Impact</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.impact}</p>
          </div>

          {selected.quote && (
            <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}20` }}>
              <div className="text-xl mb-2" style={{ color: selected.color, opacity: 0.5 }}>"</div>
              <p className="text-gray-200 text-sm italic leading-relaxed mb-2">{selected.quote}</p>
              <div className="text-xs font-semibold" style={{ color: selected.color }}>— {selected.quoteAuthor}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
