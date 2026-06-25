import { useState } from 'react'

interface WeirdObject {
  id: string
  name: string
  nickname: string
  type: string
  icon: string
  color: string
  location: string
  discovered: string
  whatWeKnow: string
  theWeirdPart: string
  theories: { name: string; likelihood: string; explanation: string }[]
  currentStatus: string
  whyItMatters: string
}

const OBJECTS: WeirdObject[] = [
  {
    id: 'tabby',
    name: 'KIC 8462852',
    nickname: 'Tabby\'s Star / WTF Star',
    type: 'Unusual F-type Star',
    icon: '⭐',
    color: '#f59e0b',
    location: '1,480 light-years, Cygnus constellation',
    discovered: 'Tabetha Boyajian et al. (2016) via Kepler Space Telescope data',
    whatWeKnow: 'This star shows unprecedented, irregular dips in brightness — dropping by up to 22% over days, unlike any known natural stellar phenomenon. Unlike exoplanet transits (which are regular and shallow), these dips are irregular, asymmetric, and vary in depth. Long-term observations also show the star has dimmed by ~3% over 100 years.',
    theWeirdPart: 'No known natural phenomenon explains all the observed dimming patterns simultaneously. A solid object transiting would need to cover 22% of the star\'s face — far larger than any planet. The dimming events occur over different timescales from hours to months. The star also shows dimming at UV wavelengths more than infrared — suggesting dust rather than a solid object.',
    theories: [
      { name: 'Dust cloud (cometary family)', likelihood: 'Most likely', explanation: 'A swarm of comets or disrupted planetesimals creates asymmetric dust clouds. Dust explains the wavelength-dependent dimming. A comet family could explain irregular timing.' },
      { name: 'Circumstellar disk disruption', likelihood: 'Plausible', explanation: 'A tilted, warped disk of debris from a recent planetary collision is consuming the stellar flux. Post-collision debris could explain the irregular patterns.' },
      { name: 'Alien megastructure (Dyson sphere)', likelihood: 'Extremely unlikely', explanation: 'A Dyson sphere in partial construction by a Type II civilization would block starlight irregularly. SETI searches for radio signals from Tabby\'s Star have found nothing.' },
    ],
    currentStatus: 'Ongoing monitoring by amateur and professional astronomers. Multiwavelength campaigns confirmed dust as the likely culprit. The exact mechanism remains unknown. The "Tabby\'s Star Alert Network" triggers observations when new dipping events occur.',
    whyItMatters: 'Tabby\'s Star is the most anomalous star ever observed in long-duration photometric surveys. It proves that our models of stellar variability are incomplete — and reminds us that unprecedented observations sometimes lead to new physics.'
  },
  {
    id: 'oumuamua',
    name: '1I/\'Oumuamua',
    nickname: 'The First Interstellar Visitor',
    type: 'Interstellar Object',
    icon: '🪨',
    color: '#94a3b8',
    location: 'Passed through inner Solar System October 2017',
    discovered: 'Robert Weryk using Pan-STARRS telescope at Haleakalā Observatory, October 19, 2017',
    whatWeKnow: 'Oumuamua (Hawaiian: "first distant messenger") was the first known interstellar object to visit our Solar System. It had an extreme elongation (aspect ratio ~6:1 or greater) — unlike any known asteroid or comet. It came from the direction of Vega and exited the Solar System at 26 km/s faster than expected from gravity alone, with no observed outgassing.',
    theWeirdPart: 'Its trajectory showed non-gravitational acceleration — it was pushed by something beyond solar gravity and radiation pressure. It had no visible coma or cometary activity. Its brightness varied by a factor of 10 every 8 hours, suggesting it was tumbling and was either extremely elongated (cigar-shaped) or extremely flat (pancake-shaped). It came from a direction that matched interstellar origin.',
    theories: [
      { name: 'Exotic hydrogen iceberg', likelihood: 'Possible', explanation: 'A fragment of molecular hydrogen ice would sublimate invisibly (H₂ is transparent to visible light), explaining the non-gravitational acceleration without visible outgassing. But such an object should have evaporated over interstellar transit.' },
      { name: 'Nitrogen ice fragment', likelihood: 'Plausible', explanation: 'A chunk of solid nitrogen from a planet\'s surface ejected by an impact. N₂ sublimation could provide thrust invisibly. Similar to Pluto\'s surface composition.' },
      { name: 'Alien light sail', likelihood: 'Speculative (Prof. Loeb)', explanation: 'Avi Loeb of Harvard argues a thin, flat geometry is consistent with an artificial light sail. The lack of outgassing and unusual trajectory are cited. Most astronomers find natural explanations more parsimonious.' },
    ],
    currentStatus: 'Now beyond Neptune and unreachable by any current spacecraft. A proposed mission ("Project Lyra") could theoretically intercept it using a solar-powered or laser-driven probe but is beyond current technology. A second interstellar object (Borisov, 2I) was discovered in 2019 and behaved more normally.',
    whyItMatters: 'The first confirmed interstellar visitor proved objects travel between star systems. If such objects are common (models suggest ~10¹⁵ in our Solar System at any time), they may exchange organic material between planetary systems — relevant to panspermia.'
  },
  {
    id: 'wow',
    name: 'Wow! Signal',
    nickname: 'The Most Suspicious Radio Signal',
    type: 'Radio Anomaly',
    icon: '📡',
    color: '#22c55e',
    location: 'Sagittarius constellation direction, ~2.5 light-years or farther',
    discovered: 'Jerry Ehman at Big Ear Radio Observatory, August 15, 1977',
    whatWeKnow: 'The Wow! Signal was a strong narrowband radio signal at 1420.406 MHz (the hydrogen line — a frequency often proposed as SETI contact frequency). It lasted 72 seconds — exactly the time the radio telescope\'s beam would track a fixed point in space. Jerry Ehman circled the output and wrote "Wow!" in the margin.',
    theWeirdPart: 'The signal matched ALL the expected characteristics of an interstellar radio signal: correct frequency (hydrogen line), correct bandwidth (narrowband), correct duration (72s beam transit). It has NEVER been detected again despite hundreds of follow-up observations of the same sky region since 1977, including with more sensitive telescopes.',
    theories: [
      { name: 'Extraterrestrial intelligence', likelihood: 'Unknown — not ruled out', explanation: 'The signal had all hallmarks of a deliberate SETI transmission. A single transmission or brief broadcast window would explain non-detection in follow-ups. The signal\'s source has not been identified.' },
      { name: 'Cometary hydrogen cloud', likelihood: 'Proposed (Paris 2017)', explanation: 'A 2017 study proposed comets 266P/Christensen or 335P/Gibbs in the beam could produce hydrogen emission. Critics note the signal\'s narrowband nature is inconsistent with diffuse cometary gas.' },
      { name: 'Terrestrial radio interference', likelihood: 'Unlikely', explanation: 'Earth-based RFI would not match the beam transit time profile. Satellites didn\'t pass through. The Big Ear operated two feeds — the signal appeared in only one, consistent with a fixed sky source.' },
    ],
    currentStatus: 'The Wow! Signal remains the strongest candidate for an artificial extraterrestrial radio signal — and the most tantalizing SETI detection in history. The Allen Telescope Array and other facilities continue searching the region. In 2020, a new search using the Parkes Telescope found no repeat signal.',
    whyItMatters: 'Whether natural or artificial, the Wow! Signal represents the limits of our ability to verify a single non-repeating event. It demonstrates why SETI scientists require confirmed repeat detections before claiming a discovery.'
  },
  {
    id: 'frb',
    name: 'Fast Radio Bursts',
    nickname: 'FRBs — Milliseconds from Billions of Light-Years',
    type: 'Transient Radio Phenomenon',
    icon: '⚡',
    color: '#8b5cf6',
    location: 'Extragalactic (billions of light-years away), except for galactic FRB 200428',
    discovered: 'Duncan Lorimer & Matthew Bailes (2007), discovered in archival Parkes data from 2001',
    whatWeKnow: 'FRBs are intense millisecond bursts of radio waves with energies equivalent to the Sun\'s total energy output for years, compressed into milliseconds. Over 600 unique sources known. Most are "one-off" events, but ~50 are "repeaters" emitting multiple bursts. Their extragalactic origin is confirmed by dispersion measure (delay of lower frequencies vs. higher) consistent with billions of light-years of intergalactic plasma.',
    theWeirdPart: 'One FRB (FRB 20191221A) emitted periodic bursts every 0.217 seconds for 3 seconds — longer than any known FRB. Another (FRB 20201124A) changed behavior rapidly between bursts. FRB 200428 was detected from a magnetar in our own galaxy (SGR 1935+2154) — proving at least some FRBs come from magnetars. Yet some FRB properties don\'t fit the magnetar model.',
    theories: [
      { name: 'Magnetar flares', likelihood: 'Confirmed for at least some FRBs', explanation: 'Highly magnetized neutron stars can release enormous energy in milliseconds. The galactic FRB 200428 came from known magnetar SGR 1935+2154. However, repeating FRBs may require a different mechanism.' },
      { name: 'Cataclysmic events', likelihood: 'Likely for non-repeating FRBs', explanation: 'One-off FRBs could be neutron star mergers, supernovae, or other catastrophic events. These would produce single, non-repeating bursts.' },
      { name: 'Extraterrestrial technology', likelihood: 'Extremely speculative', explanation: 'Loeb proposed FRBs could be leakage from alien spacecraft propulsion beams. This is considered fringe; magnetar origin is mainstream consensus.' },
    ],
    currentStatus: 'CHIME telescope in Canada detects dozens of FRBs per year with unprecedented sensitivity. FAST telescope in China has found thousands of bursts from single repeating sources. The field is one of the fastest-moving in astronomy. FRBs are now used as cosmological tools to measure the intergalactic medium\'s baryon density.',
    whyItMatters: 'FRBs release more energy in a millisecond than the Sun emits in days — from sources billions of light-years away. They probe the intergalactic medium between galaxies and may help solve the "missing baryon problem." Each detected FRB maps the gas along its path through cosmic history.'
  },
  {
    id: 'bootes_void',
    name: 'Boötes Void',
    nickname: 'The Great Nothing',
    type: 'Cosmic Supervoid',
    icon: '🌑',
    color: '#1e293b',
    location: 'Boötes constellation, ~700 million light-years away',
    discovered: 'Robert Kirshner, Augustus Oemler, Paul Schechter, Stephen Shectman (1981)',
    whatWeKnow: 'The Boötes Void is a roughly spherical region of space approximately 330 million light-years across — almost completely empty of galaxies. It contains only ~60 galaxies where you\'d expect thousands based on the average galaxy density of the universe. It makes up about 0.27% of the observable universe\'s volume.',
    theWeirdPart: 'The Boötes Void is almost too empty to exist within standard cosmological models. Structure in the universe forms hierarchically — smaller structures merge into larger ones. But voids grow too — they form when matter flows away along cosmic filaments. The Boötes Void is so large and empty that it suggests it may have formed from the merger of many smaller voids.',
    theories: [
      { name: 'Merged supervoid', likelihood: 'Standard explanation', explanation: 'A superposition of ~27 smaller voids that merged over cosmic time. The cosmic web naturally creates voids as matter flows toward filaments and clusters. Boötes is at the extreme end of normal void distribution.' },
      { name: 'Statistical outlier', likelihood: 'Possible', explanation: 'Given enough volume, extreme voids should exist by chance. Boötes may be within the expected statistical variation, though near the edge of plausibility.' },
      { name: 'Non-standard physics', likelihood: 'Speculative', explanation: 'Some physicists have explored whether modified gravity or early dark energy could produce unusually large voids. No compelling evidence for deviation from ΛCDM.' },
    ],
    currentStatus: 'Ongoing surveys with DESI and Euclid are mapping void distributions across the universe to test cosmological models. If the Boötes Void is truly anomalous, it would challenge the standard model of structure formation.',
    whyItMatters: 'If you lived in a galaxy inside the Boötes Void, your night sky would be almost completely dark — neighboring galaxies would be too far away to see with the naked eye. You would be more isolated than any astronomer today can truly comprehend.'
  },
  {
    id: 'cold_spot',
    name: 'CMB Cold Spot',
    nickname: 'The Hole in the Universe',
    type: 'CMB Anomaly / Possible Supervoid',
    icon: '❄️',
    color: '#60a5fa',
    location: 'Eridanus constellation, extends over ~4° of sky (about 600–1,000 Mly away)',
    discovered: 'Kate Land and Joao Magueijo (2005) in WMAP data; confirmed by Planck (2013)',
    whatWeKnow: 'The CMB Cold Spot is a region in the cosmic microwave background that is significantly colder (about 70 microkelvin below average) than surrounding regions, spanning a much larger area than statistical models predict. If the cold spot corresponds to a real structure, that structure would be ~1.8 billion light-years across.',
    theWeirdPart: 'A supervoid of that size at the right distance could explain part of the temperature depression (via the Integrated Sachs-Wolfe effect — photons lose energy crossing a large underdense region). But surveys of that sky region have found a supervoid (Finelli et al. 2016) only about 20% of the right size to fully explain the cold spot. The remaining temperature deficit is unexplained.',
    theories: [
      { name: 'Large supervoid + ISW effect', likelihood: 'Partial explanation', explanation: 'A confirmed underdense region (supervoid) at z~0.2-0.3 contributes via the ISW effect. But calculations show it can only explain ~50% of the observed temperature deficit.' },
      { name: 'Statistical fluke', likelihood: 'Possible but unlikely (~1%)', explanation: 'The CMB cold spot may be a chance statistical anomaly in the otherwise random temperature fluctuations. Probability of occurrence by chance: ~1-2% in standard ΛCDM.' },
      { name: 'Bubble collision (multiverse)', likelihood: 'Highly speculative', explanation: 'In eternal inflation theories, our universe is a bubble among many. A collision with another bubble universe could leave a cold spot imprint. This is not testable with current technology.' },
    ],
    currentStatus: 'The cold spot remains one of several "anomalies" in the CMB that don\'t fit perfectly within the standard model. The Square Kilometre Array (SKA) will survey the supervoid region with unprecedented sensitivity. It\'s not currently considered evidence of anomalous physics, but remains a puzzle.',
    whyItMatters: 'The CMB cold spot is a reminder that our "standard model of cosmology" may have gaps. Even the oldest light in the universe — a snapshot from 380,000 years after the Big Bang — still holds surprises.'
  },
]

export default function SpaceWeirdObjects() {
  const [selected, setSelected] = useState<WeirdObject>(OBJECTS[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space\'s Greatest Mysteries</h2>
      <p className="text-gray-400 text-sm mb-5">The universe\'s most baffling objects and signals — things that challenge our best theories and remain unexplained</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Object list */}
        <div className="space-y-2">
          {OBJECTS.map(obj => (
            <button
              key={obj.id}
              onClick={() => setSelected(obj)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === obj.id ? obj.color + '15' : 'rgba(15,23,42,0.6)',
                border: `1px solid ${selected.id === obj.id ? obj.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-lg">{obj.icon}</span>
                <div>
                  <div className="text-white text-sm font-semibold leading-tight">{obj.nickname}</div>
                  <div className="text-gray-500 text-xs">{obj.type}</div>
                </div>
              </div>
              <div className="text-gray-600 text-xs ml-7">{obj.location.split(',')[0]}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <div className="text-xs uppercase font-semibold mb-0.5" style={{ color: selected.color }}>{selected.type}</div>
                <h3 className="text-xl font-bold text-white">{selected.nickname}</h3>
                <div className="text-gray-400 text-sm">{selected.name}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <div className="bg-black/20 rounded-lg p-2.5">
                <div className="text-gray-500 text-xs">Location</div>
                <div className="text-gray-200 text-xs font-medium">{selected.location}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-2.5">
                <div className="text-gray-500 text-xs">Discovered</div>
                <div className="text-gray-200 text-xs font-medium">{selected.discovered}</div>
              </div>
            </div>
          </div>

          {/* What we know */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What We Know</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.whatWeKnow}</p>
          </div>

          {/* The weird part */}
          <div className="bg-yellow-900/10 border border-yellow-800/20 rounded-xl p-4">
            <div className="text-yellow-500 text-xs uppercase font-semibold mb-2">The Unexplained Part</div>
            <p className="text-yellow-100/80 text-sm leading-relaxed">{selected.theWeirdPart}</p>
          </div>

          {/* Theories */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Current Theories</div>
            <div className="space-y-2.5">
              {selected.theories.map(theory => (
                <div key={theory.name} className="bg-gray-900/60 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-xs font-semibold">{theory.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: theory.likelihood.includes('likely') || theory.likelihood.includes('Confirmed') ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)',
                        color: theory.likelihood.includes('likely') || theory.likelihood.includes('Confirmed') ? '#86efac' : '#a5b4fc',
                        border: `1px solid ${theory.likelihood.includes('likely') || theory.likelihood.includes('Confirmed') ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.3)'}`,
                      }}
                    >
                      {theory.likelihood}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">{theory.explanation}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Current status */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Current Status</div>
            <p className="text-gray-300 text-sm">{selected.currentStatus}</p>
          </div>

          {/* Why it matters */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}25` }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>Why It Matters</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.whyItMatters}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
