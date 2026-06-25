import { useState, useRef, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  followups?: string[]
}

interface KEntry {
  keys: string[]
  text: string
  next: string[]
}

const DB: KEntry[] = [
  {
    keys: ['black hole', 'event horizon', 'singularity', 'hawking', 'schwarzschild', 'accretion disk'],
    text: `**Black holes** are regions of spacetime where gravity is so extreme that nothing — not even light — can escape once it crosses the **event horizon**.

**Formation:** Stellar black holes form when massive stars (>25 M☉) exhaust nuclear fuel. The iron core collapses in under a second; the outer layers explode as a supernova. Supermassive black holes (millions to billions of M☉) inhabit the centers of most large galaxies.

**Anatomy:**
• **Singularity** — central point where density is theoretically infinite (physics breaks down here)
• **Event horizon** — the point of no return; radius = 2GM/c² (Schwarzschild radius)
• **Photon sphere** — at 1.5× event horizon radius; light orbits circularly here
• **Accretion disk** — superheated infalling matter glowing at millions of Kelvin

**Types:**
• Stellar: 3–100 M☉ | Intermediate: 100–100,000 M☉
• Supermassive: 10⁶–10¹⁰ M☉ | Primordial: hypothetical, from early-universe density fluctuations

**Famous examples:** Sagittarius A* (our galactic center, 4.1M M☉), M87* (first black hole ever imaged by Event Horizon Telescope in 2019, 6.5B M☉), Cygnus X-1 (first confirmed stellar black hole, 1971).

**Hawking radiation:** Quantum effects near the horizon cause black holes to slowly radiate thermal energy and eventually evaporate — a process so slow that a solar-mass black hole would take ~2 × 10⁶⁷ years.`,
    next: ['What is Hawking radiation?', 'What happens if you fall into a black hole?', 'What are gravitational waves?']
  },
  {
    keys: ['big bang', 'origin universe', 'beginning universe', 'cosmic inflation', 'cmb', 'cosmic microwave'],
    text: `The **Big Bang** was not an explosion in space — it was the rapid expansion of space itself from an incredibly hot, dense state approximately **13.8 billion years ago**.

**Timeline from the beginning:**
• **t = 10⁻⁴³ s** — Planck epoch: known physics breaks down
• **t = 10⁻³⁶ s** — Cosmic inflation: space expands exponentially (explains why the universe is flat and uniform)
• **t = 10⁻⁶ s** — Quarks combine into protons and neutrons
• **t = 3 min** — Big Bang nucleosynthesis: hydrogen and helium nuclei form (H:He ≈ 75:25 by mass)
• **t = 380,000 yr** — Recombination: electrons bind to nuclei, universe becomes transparent; **CMB is released**
• **t = 200 million yr** — First stars ignite (Population III stars)
• **t = 1 billion yr** — First galaxies form

**Four pillars of evidence:**
1. **Hubble expansion** — all galaxies recede; velocity proportional to distance (1929)
2. **Cosmic Microwave Background** — 2.725 K thermal glow in every direction (Penzias & Wilson, 1965)
3. **BBN abundances** — predicted H:He ratio matches observations precisely
4. **Galaxy evolution** — distant (older) galaxies look structurally different from nearby ones

The CMB has been mapped to extraordinary precision by WMAP and Planck satellites, revealing quantum fluctuations from inflation that seeded today's galaxies and cosmic web.`,
    next: ['What is dark energy?', 'What existed before the Big Bang?', 'What is the cosmic microwave background?']
  },
  {
    keys: ['dark matter', 'missing mass', 'galaxy rotation curve', 'wimp', 'axion', 'dark matter candidate'],
    text: `**Dark matter** is invisible material making up ~27% of the universe's total energy content. It neither emits, absorbs, nor reflects light — we infer it only through gravity.

**Key evidence:**
• **Galaxy rotation curves** — stars at the edges of galaxies orbit faster than visible mass alone could explain; a vast invisible halo must surround every galaxy
• **Gravitational lensing** — galaxy clusters bend background light more than their visible mass predicts
• **Bullet Cluster (2006)** — two colliding galaxy clusters; dark matter (traced by lensing) separated cleanly from hot gas (traced by X-rays) — smoking-gun proof it's not modified gravity
• **CMB acoustic peaks** — the pattern of temperature fluctuations requires cold dark matter to match observations

**Leading candidates:**
• **WIMPs** (Weakly Interacting Massive Particles): ~100 GeV, supersymmetric particles — most-searched but not yet found
• **Axions**: ultra-light particles (~10⁻⁶ eV) originally proposed to solve the strong CP problem
• **Sterile neutrinos**: hypothetical heavier neutrino species

**Status:** No dark matter particle has been directly detected. LUX-ZEPLIN, XENONnT, and PandaX experiments have ruled out large portions of the WIMP parameter space. Modified gravity theories (MOND) struggle with the Bullet Cluster.

Dark matter forms diffuse **halos** around galaxies. The Milky Way's dark matter halo extends ~200,000 light-years and contains ~10× more mass than all visible stars.`,
    next: ['What is dark energy?', 'What is the Bullet Cluster?', 'Are WIMPs real?']
  },
  {
    keys: ['dark energy', 'accelerating expansion', 'cosmological constant', 'lambda', 'vacuum energy'],
    text: `**Dark energy** is the mysterious force driving the universe's accelerating expansion. It comprises ~68% of the total energy content of the cosmos.

**Discovery (1998):** Two independent teams measuring Type Ia supernovae as standard candles (Perlmutter, Schmidt, Riess — Nobel Prize 2011) found distant supernovae were *fainter* than expected — meaning they're farther away than a decelerating universe would predict. The expansion is *speeding up*.

**Properties:**
• Uniform density throughout space (~7 × 10⁻³⁰ g/cm³ — extraordinarily dilute)
• Negative pressure (equation of state w ≈ −1)
• Appears constant over cosmic time (so far)
• Causes galaxies beyond ~4 billion light-years to recede faster than light

**Leading candidates:**
• **Cosmological constant (Λ):** Einstein's "greatest blunder" reborn — vacuum energy of empty space. Problem: quantum field theory predicts a value 10¹²⁰× too large (the worst prediction in all of physics)
• **Quintessence:** A dynamic scalar field varying in space and time

**Possible futures:**
• w = −1 exactly → Heat Death: eternal expansion, everything cools and disperses
• w &lt; −1 (phantom) → Big Rip in ~22 billion years: expansion tears apart galaxies, stars, then atoms
• **DESI 2024 results** hint dark energy may be evolving with cosmic time — potentially the biggest cosmology story in decades.`,
    next: ['Will the universe end?', 'What is the Big Rip?', 'What is the cosmological constant problem?']
  },
  {
    keys: ['life mars', 'martian life', 'perseverance', 'mars water', 'mars habitability', 'mars methane'],
    text: `Mars is the most intensively studied candidate for past or present life in our solar system.

**Signs of ancient habitability:**
• **Jezero Crater** (Perseverance landing site): ancient river delta and lake sediments — water existed ~3.5 billion years ago
• **Phyllosilicates (clays):** require liquid water to form; found globally by CRISM spectrometer on MRO
• **Valley networks:** global system of river valleys carved when Mars had a thicker atmosphere and magnetic field
• **Hematite "blueberries":** mineral concretions found by Opportunity rover, indicating prolonged water saturation

**Current surface conditions:**
• Temperature: −143°C to +35°C (average −60°C)
• Atmosphere: 95% CO₂, pressure just 0.6% of Earth's — liquid water unstable at surface
• Perchlorates: toxic salts in soil, but some Earth bacteria metabolize them
• UV radiation: intense, no ozone layer protection

**Intriguing ongoing findings:**
• **Methane spikes:** Curiosity detected seasonal methane — source could be geological or biological
• **South polar lake:** MARSIS radar detected possible subsurface liquid water brine (2018) — still contested
• **Organic molecules:** Curiosity found complex organics preserved in ancient mudstone

**The verdict:** Most scientists believe early Mars (~3.5 Gya) could have supported microbial life. Whether anything survives underground today is the central question. **Mars Sample Return** (planned 2030s) will bring Perseverance's collected rocks to Earth for definitive analysis.`,
    next: ['How do we search for life in space?', 'What is the Fermi Paradox?', 'Could life exist on Europa?']
  },
  {
    keys: ['neutron star', 'pulsar', 'magnetar', 'millisecond pulsar', 'neutron star merger'],
    text: `**Neutron stars** are the ultra-dense remnants of stellar core-collapse supernovae — among the most extreme objects in the known universe.

**Formation:** Stars between ~8–20 M☉ exhaust nuclear fuel. The iron core collapses in &lt;0.1 seconds — faster than you can blink. Electron degeneracy fails; protons and electrons merge into neutrons. The resulting neutron star forms almost instantaneously while the outer envelope explodes as a Type II supernova.

**Physical extremes:**
• Mass: 1.4–2.3 M☉ packed into ~20 km diameter
• Density: ~4 × 10¹⁷ kg/m³ — one teaspoon weighs ~1 billion tons
• Surface gravity: 2 × 10¹¹ × Earth's
• Rotation: up to 716 Hz (PSR J1748−2446ad, fastest known)
• Surface temperature: ~10⁶ K

**Types:**
• **Pulsars:** emit radio/X-ray beams from magnetic poles — appear to pulse as they rotate. First detected 1967 (Jocelyn Bell Burnell).
• **Millisecond pulsars:** spun up by accreting matter from a companion star; timing stability rivals atomic clocks
• **Magnetars:** extreme magnetic field (~10¹⁵ G); occasionally unleash devastating soft gamma-ray bursts

**Historic milestone — GW170817 (2017):** First neutron star merger detected in both gravitational waves AND light. Proved that neutron star mergers produce r-process elements: gold, platinum, and uranium. The entire observable universe's gold supply was made in events like this.`,
    next: ['What are gravitational waves?', 'What is the r-process?', 'How do pulsars keep time so precisely?']
  },
  {
    keys: ['milky way', 'galactic center', 'sagittarius a', 'our galaxy', 'milky way structure', 'spiral arm'],
    text: `The **Milky Way** is our home galaxy — a barred spiral galaxy containing 200–400 billion stars, spanning ~100,000 light-years in diameter.

**Structure (inside out):**
• **Galactic core:** Sagittarius A* (SgrA*), a 4.1-million M☉ supermassive black hole, imaged by the Event Horizon Telescope in 2022. Surrounded by a dense central bulge of old stars.
• **Bar:** A rectangular stellar bar ~27,000 light-years long through the center
• **Spiral arms:** 4 major arms (Perseus, Sagittarius-Carina, Centaurus, Norma) — we live in the **Orion Spur**, a minor arm between Perseus and Sagittarius
• **Disk:** ~1,000 light-years thick; contains most stars, gas (H I clouds, molecular clouds), and dust
• **Stellar halo:** Spherical envelope of old metal-poor stars and ~150 globular clusters
• **Dark matter halo:** Extends ~200,000+ ly; contains most of the galaxy's mass

**Our address:**
The Sun orbits 26,000 light-years from the galactic center, moving at ~220 km/s. One galactic orbit (1 "cosmic year") takes ~225 million years. Last time Earth was at this location: Cretaceous period, dinosaurs still roamed.

**Collision ahead:** The Andromeda Galaxy (M31, ~2.5 million ly away) is approaching at 110 km/s. In ~4.5 billion years, the two galaxies will collide and merge into an elliptical galaxy astronomers call **Milkomeda**. The Sun will survive — stellar collisions are extremely rare due to vast interstellar distances.`,
    next: ['Will the Milky Way collide with Andromeda?', 'What is Sagittarius A*?', 'How many planets exist in our galaxy?']
  },
  {
    keys: ['exoplanet', 'habitable zone', 'goldilocks', 'trappist', 'kepler', 'earth-like planet', 'biosignature'],
    text: `**Exoplanets** are planets orbiting stars other than our Sun. As of 2025, over 5,700 confirmed exoplanets have been found, with billions more estimated to exist in the Milky Way alone.

**Detection methods:**
• **Transit photometry** (Kepler, TESS): planet crosses the star's disk, dimming starlight by a tiny fraction
• **Radial velocity:** planet's gravity tugs the star toward/away from us, causing Doppler shifts
• **Direct imaging:** blocking starlight with a coronagraph and imaging the planet directly (rare, works for large planets far from their star)
• **Gravitational microlensing:** planet's gravity bends and amplifies background starlight

**The habitable zone (HZ):**
The range of orbital distances where liquid water could exist on a planet's surface — depends on stellar luminosity and planet atmosphere. Earth sits comfortably at 1 AU from the Sun.

**Landmark systems:**
• **TRAPPIST-1** (40 ly): 7 Earth-sized planets around an ultracool red dwarf; e, f, and g are in the HZ. JWST has begun characterizing their atmospheres.
• **Proxima Centauri b** (4.24 ly): In the HZ of our nearest stellar neighbor, but subject to intense stellar flares.
• **Kepler-452b:** "Earth's cousin" — 60% larger than Earth, 385-day orbit around a Sun-like star, 1,400 ly away

**The big question:** JWST has detected CO₂ and H₂O in exoplanet atmospheres, and potential traces of DMS (dimethyl sulfide — a possible biosignature) in K2-18b. Definitive detection of life remains elusive but tantalizingly closer.`,
    next: ['What is TRAPPIST-1?', 'What has JWST discovered?', 'How do we detect exoplanet atmospheres?']
  },
  {
    keys: ['james webb', 'jwst', 'webb telescope', 'infrared telescope', 'webb space telescope'],
    text: `The **James Webb Space Telescope (JWST)** is the most powerful space observatory ever built, launched Christmas Day 2021 and fully operational since July 2022.

**Engineering marvel:**
• Primary mirror: 6.5 m across (18 gold-coated beryllium hexagons) — collects 7× more light than Hubble
• Wavelength coverage: 0.6–28 microns (near-IR to mid-IR) — perfectly matched to red-shifted light from the early universe
• Location: Sun-Earth L2 point, 1.5 million km from Earth
• Operating temperature: −233°C, maintained by a 5-layer sunshield the size of a tennis court
• Design lifetime: 10+ years (enough propellant for 20+ years)

**Why infrared?** Light from the earliest galaxies is redshifted to infrared. Infrared also penetrates dust clouds that block visible light, revealing star-forming regions and galactic nuclei.

**Major discoveries (2022–2025):**
• **Earliest galaxies:** JADES-GS-z13-0 exists when the universe was only 320 million years old — challenging galaxy formation models
• **Exoplanet atmospheres:** CO₂ definitively detected in WASP-39b; potential DMS (biosignature?) in K2-18b; H₂O in dozens of systems
• **Star formation:** Pillars of Creation, Carina Nebula in unprecedented detail — individual protostars visible
• **55 Cancri e:** Lava world with evidence of a thin rock-vapor atmosphere
• **Solar system:** Neptune's rings resolved; Uranus's seasonal changes documented
• **Galaxy evolution:** Stephan's Quintet, early galaxy mergers, cosmic web filaments

JWST can detect the heat of a bumblebee at the distance of the Moon.`,
    next: ['What has JWST discovered?', 'What is the habitable zone?', 'How do we detect exoplanet atmospheres?']
  },
  {
    keys: ['gravitational waves', 'ligo', 'black hole merger', 'gw150914', 'gw170817', 'ripples spacetime'],
    text: `**Gravitational waves** are ripples in the fabric of spacetime itself, produced by accelerating massive objects. Predicted by Einstein in 1916 as part of general relativity; first directly detected on **September 14, 2015** (GW150914) by LIGO.

**GW150914 — first ever detection:**
• Two black holes: 29 M☉ + 36 M☉, 1.3 billion light-years away
• Produced: 62 M☉ black hole
• Energy radiated: 3 M☉ converted to gravitational wave energy in under a second — more power than *all stars in the observable universe combined*
• Peak strain: h ~ 10⁻²¹ — LIGO's mirrors moved 1/1,000 the width of a proton

**GW170817 — neutron star merger:**
• First "multi-messenger" event: gravitational waves + gamma-ray burst + optical kilonova + X-ray + radio
• Confirmed neutron star mergers as the source of r-process elements: gold, platinum, uranium
• Estimated gold produced: ~200 Earth masses

**How detection works:**
LIGO uses laser interferometry — a 4-km beam splitter compares two laser beam paths with picometer precision. A passing gravitational wave compresses one arm while stretching the other, creating a detectable phase shift.

**Global network:** LIGO (Hanford, WA + Livingston, LA), Virgo (Italy), KAGRA (Japan underground), and future LISA (space-based, 2030s — will detect supermassive black hole mergers across the observable universe).

**Nobel Prize 2017:** Weiss, Barish, Thorne.`,
    next: ['What happened in GW170817?', 'What is LIGO?', 'How can gravitational waves be used in astronomy?']
  },
  {
    keys: ['sun', 'solar', 'proton proton', 'stellar fusion', 'solar structure', 'photosphere', 'corona'],
    text: `The **Sun** is a G2V main-sequence star — the ordinary, middle-aged star at the center of our solar system that makes all life on Earth possible.

**Key data:**
• Mass: 1.989 × 10³⁰ kg (333,000 Earth masses)
• Radius: 696,000 km (109 Earth radii)
• Luminosity: 3.83 × 10²⁶ W (power output)
• Core temperature: 15.7 million K | Surface: 5,778 K
• Age: 4.6 billion years (halfway through main-sequence life)
• Light travel time to Earth: 8 minutes 20 seconds

**Internal structure:**
1. **Core** (0–25% radius): Nuclear fusion zone — T = 15.7 MK, P = 250 billion atm
2. **Radiative zone** (25–70%): Energy transported by photon diffusion — individual photons take ~170,000 years to escape!
3. **Convection zone** (70–100%): Plasma boils like water, transporting heat efficiently to the surface
4. **Photosphere:** The visible "surface" — where light finally escapes; sunspots appear here
5. **Chromosphere:** Layer above, temperature paradoxically rises to ~20,000 K
6. **Corona:** Outer atmosphere; T = 1–3 million K (the "coronal heating problem" is still unsolved). Source of the solar wind.

**Power source:** The proton-proton chain: 4H → ⁴He + energy (26.7 MeV per reaction). The Sun fuses ~620 million tonnes of hydrogen per second.

**Future:** In ~5 billion years, the Sun expands into a red giant (possibly engulfing Earth), then sheds its outer layers as a planetary nebula, leaving a white dwarf cooling for billions of years.`,
    next: ['What are solar flares?', 'What is the solar wind?', 'What will happen when the Sun dies?']
  },
  {
    keys: ['supernova', 'stellar death', 'core collapse', 'type ia supernova', 'betelgeuse', 'stellar explosion'],
    text: `A **supernova** is the catastrophic explosive death of a star — one of the most energetic events in the universe, briefly outshining entire galaxies.

**Type II — Core-Collapse (massive stars, >8 M☉):**
1. Star fuses progressively heavier elements: H → He → C → Ne → O → Si → Fe
2. Iron cannot release energy by fusion — the core collapses in 0.1 seconds
3. Core reaches nuclear density; neutron degeneracy pressure halts collapse
4. Outer layers bounce off the stiff core — shockwave powered by ~10⁵³ J of neutrinos (99% of explosion energy!)
5. Stellar envelope is expelled at ~10,000–30,000 km/s
6. Leaves behind a neutron star or black hole

**Type Ia — Thermonuclear (white dwarf in binary):**
1. White dwarf accretes matter from companion star until it reaches the Chandrasekhar limit (~1.4 M☉)
2. Carbon ignites throughout the entire degenerate star simultaneously — complete thermonuclear detonation
3. No remnant left — entire star is destroyed
4. Consistent peak luminosity makes Type Ia supernovae *standard candles* for measuring cosmic distances — how dark energy was discovered!

**Famous supernovae:**
• **SN 1054:** Crab Nebula — visible in daylight for 23 days; recorded by Chinese and Arab astronomers
• **SN 1987A:** Magellanic Cloud; first neutrinos detected from an extragalactic event
• **Betelgeuse (future):** Red supergiant in Orion, 700 ly away — will explode within the next 100,000 years; its 2019–2020 "Great Dimming" caused brief excitement (turned out to be dust ejection)

Every iron atom in your blood was forged in a stellar explosion.`,
    next: ['When will Betelgeuse explode?', 'What is a neutron star?', 'How are heavy elements created?']
  },
  {
    keys: ['telescope', 'amateur astronomy', 'stargazing', 'binoculars', 'start astronomy', 'beginner astronomy'],
    text: `Getting started in astronomy is more rewarding than ever — and you don't need a telescope to begin.

**Step 1: Your eyes first**
Learn major constellations with free apps: **Stellarium** (web & mobile), **SkySafari**, or **Star Walk 2**.
Find the Big Dipper → follow the two "pointer stars" to Polaris (North Star, within 1° of true north).
Dark adaptation: your eyes take 20–30 minutes to fully adjust. Even suburban skies reveal thousands of stars once adapted.

**Step 2: Binoculars (best first purchase)**
• Ideal: **7×50** or **10×50** (magnification × objective lens diameter in mm)
• With binoculars you can see Jupiter's 4 Galilean moons, lunar craters, the Orion Nebula, Pleiades, Andromeda Galaxy
• Far wider field than a telescope — essential for sweeping the Milky Way

**Step 3: Your first telescope**
• **Best value: Dobsonian reflector** — 6" or 8" aperture. Simple design, no electronics needed. $200–$450.
• The #1 rule: **aperture matters most** — bigger mirror = more light = fainter objects
• Avoid: department-store refractors claiming 500× magnification (marketing lies)

**What you can see with an 8" Dob:**
Moon craters (1 km resolution), Jupiter's cloud belts + Great Red Spot, Saturn's rings + Cassini Division, Mars polar caps, double stars, globular clusters (M13!), the Orion Nebula's core, dozens of galaxies.

**Dark sky tip:** Even 30 minutes drive from a city makes an enormous difference. Apps like **Light Pollution Map** show dark zones near you.`,
    next: ['What are the best objects to observe tonight?', 'What is the best telescope for beginners?', 'How do I find dark skies?']
  },
  {
    keys: ['saturn', 'saturn rings', 'titan', 'enceladus', 'cassini', 'saturn moons'],
    text: `**Saturn** — ringed giant and the most visually stunning planet in our solar system.

**Ring system:**
• Composed of 90–95% water ice + rocky debris; particles range from dust to house-sized boulders
• Radial extent: 282,000 km — yet the main rings average only ~10 meters thick (thinner relative to diameter than a sheet of paper)
• Age: surprisingly young! Formed within the last 100–400 million years — possibly a shattered moon or comet
• Temporary: Saturn's gravity is pulling ring material in ("ring rain") at thousands of kg/second — rings may disappear in 100–300 million years

**Top moons (Saturn has 146+ confirmed):**

🌕 **Titan** — only moon in the solar system with a dense atmosphere (1.5 bar, mostly N₂). Has lakes, rivers, and seas of liquid methane (Ligeia Mare, Kraken Mare). Cassini's Huygens probe landed there in 2005. NASA's **Dragonfly** rotorcraft (launching 2028) will explore its surface.

🌕 **Enceladus** — 500 km ice-covered moon. Active water geysers at south pole shoot plumes into space. Confirmed liquid subsurface ocean containing organics, H₂, molecular hydrogen, and silica nanoparticles — all potential signs of hydrothermal activity. Prime candidate for life.

🌕 **Mimas** — giant crater makes it look like the Death Star. Recent data hints at a possible subsurface ocean.

**Cassini mission (1997–2017):** 13 years at Saturn transformed our understanding. Ended its mission by diving into Saturn's atmosphere — protecting Enceladus from contamination.`,
    next: ['Could there be life on Enceladus?', 'What is the Dragonfly mission?', 'How do planetary rings form?']
  },
  {
    keys: ['fermi paradox', 'where aliens', 'extraterrestrial', 'seti', 'drake equation', 'great filter', 'zoo hypothesis'],
    text: `The **Fermi Paradox** is the contradiction between the high probability estimates for extraterrestrial civilizations and the complete absence of any evidence for them.

**The probability argument:**
The Milky Way has ~200 billion stars, billions in habitable zones, and has existed for 10+ billion years. Even if the probability of technological life is one in a billion, that still means hundreds of civilizations should exist — some thousands of times older than humanity. So where is everyone?

**Major proposed explanations:**

🔴 **The Great Filter** (Robin Hanson, 1998): Some step in the development chain (simple life → complex life → intelligence → civilization → survival) is extraordinarily difficult. If the filter is behind us, we're rare and lucky. If it's ahead of us, civilizations consistently destroy themselves — deeply unsettling.

🔴 **Rare Earth:** Specific conditions are required for complex life — a large moon stabilizing axial tilt, a giant planet (Jupiter) shielding from comet impacts, plate tectonics, right distance from galactic center. Complex life may be fantastically rare.

🔴 **Zoo Hypothesis:** ETIs deliberately avoid contact, allowing us to develop independently (like a nature reserve).

🔴 **Dark Forest Theory** (Liu Cixin): Every civilization hides because announcing your presence gets you destroyed. The rational strategy is silence.

🔴 **They're already here:** AARO (All-domain Anomaly Resolution Office) and the Galileo Project are investigating UAP/UFO reports scientifically.

**Drake Equation:** N = R* × fₚ × nₑ × fₗ × fᵢ × fᶜ × L — estimates range from &lt;1 to millions depending on assumptions about each term.`,
    next: ['What is the Great Filter?', 'Has SETI detected any signals?', 'What is the Drake Equation?']
  },
  {
    keys: ['iss', 'international space station', 'astronaut life', 'microgravity', 'living space', 'weightless'],
    text: `The **International Space Station** is humanity's largest structure in orbit — a football field-sized laboratory that has been continuously inhabited since November 2, 2000.

**The numbers:**
• Mass: 420,000 kg | Size: 109 m × 73 m
• Pressurized volume: 916 m³ (6-bedroom house equivalent)
• Altitude: 400–410 km | Speed: 7.66 km/s
• Orbits Earth: 15.5 times per day (90-minute orbit)
• Visited by: 280+ people from 20+ countries

**Daily life in microgravity:**
• **Exercise (2.5 hrs/day mandatory):** Resistance and aerobic machines combat bone density loss (~1.5%/month) and muscle atrophy
• **Sleep:** In sleeping bags strapped to walls — otherwise you float into equipment while unconscious
• **Food:** Rehydrated pouches, some fresh food arrives on cargo runs; no carbonated drinks (gas bubbles don't separate from liquid in microgravity)
• **Hygiene:** No-rinse shampoo, waterless soap, special toothpaste — water forms blobs that can damage electronics

**Health effects (long missions):**
• Bone and muscle loss despite exercise | Fluid shift toward head (puffy face, "chicken legs")
• **SANS** (Space-Associated Neuro-ocular Syndrome): intracranial pressure changes affect vision — a major challenge for Mars missions
• Immune system changes | Elevated radiation exposure (10× Earth surface)

**Future:** ISS retires by ~2030, to be intentionally deorbited into the Pacific Ocean at Point Nemo. NASA is partnering with commercial operators (Axiom Space, Orbital Reef) to build its successors.`,
    next: ['How does the body change in space?', 'What is the Artemis program?', 'Could we live on the Moon?']
  },
  {
    keys: ['moon', 'lunar', 'artemis', 'apollo', 'lunar landing', 'moon formation'],
    text: `Earth's Moon — our constant companion and the only extraterrestrial body humans have ever visited.

**Physical facts:**
• Distance: 384,400 km (average) — 1.28 light-seconds; 3-day journey by spacecraft
• Diameter: 3,474 km (27% of Earth) | Mass: 7.34 × 10²² kg
• Surface gravity: 1.62 m/s² (1/6 Earth) | Rotation: tidally locked (we always see the same face)
• Temperature: −173°C (night) to +127°C (day)
• Atmosphere: essentially none (thin helium/sodium exosphere)

**Formation — Giant Impact Hypothesis:**
~4.5 billion years ago, a Mars-sized protoplanet (Theia) struck proto-Earth. The debris coalesced into the Moon. Evidence: Moon's isotopic composition nearly identical to Earth's; low iron content (Earth's heavy iron core wasn't hit); the Moon is the largest satellite relative to its parent planet in the solar system.

**Apollo program (1969–1972):**
• 6 successful landings; 12 men walked on the Moon
• 382 kg of lunar rocks returned — still being analyzed
• Retroreflectors still used today: lasers from Earth measure the Moon's distance to millimeter precision
• The Moon is receding at 3.8 cm/year due to tidal interaction

**Artemis (NASA, 2020s–2030s):**
• Artemis I ✅ (2022): Uncrewed Orion around Moon and back
• Artemis II: First crewed lunar flyby (2025/2026)
• Artemis III: First woman and next man on the Moon (2026/2027)
• Gateway: Mini space station in lunar orbit (2028+)
• Goal: Permanent human presence; south pole base for water ice access`,
    next: ['Is there water on the Moon?', 'What is the Artemis program?', 'Could humans live on the Moon?']
  },
  {
    keys: ['hawking radiation', 'black hole evaporate', 'virtual particles', 'information paradox', 'bekenstein'],
    text: `**Hawking radiation** is Stephen Hawking's 1974 prediction that black holes slowly radiate energy and will eventually evaporate — a profound result that unifies quantum mechanics with general relativity.

**The mechanism:**
Quantum field theory tells us that "empty" space seethes with virtual particle-antiparticle pairs constantly popping into and out of existence. Near a black hole's event horizon, occasionally one particle falls in while the other escapes before they can annihilate. The escaping particle is real — it carries away energy that the black hole must supply by losing mass.

**Temperature:**
T_H = ℏc³ / (8πGMk_B)
For a solar-mass black hole: T ≈ 60 nanokelvin — far colder than the 2.725 K CMB. Stellar black holes are *absorbing* more radiation than they emit!

**Evaporation timescale:**
t ~ 5120π G² M³ / (ℏc⁴)
Solar-mass black hole: ~2 × 10⁶⁷ years — 10⁵⁷ times the current age of the universe.

**The Information Paradox:**
If Hawking radiation is purely thermal (random), then information about what fell into the black hole is irretrievably lost — violating quantum mechanics' requirement of unitarity (information is always conserved). This paradox has been debated for 50 years. Recent breakthroughs using "island formulas" from holography suggest information does escape encoded in subtle correlations in the radiation — but the mechanism remains mysterious.

**Experimental analog:** Sonic black holes in Bose-Einstein condensates produce analogous "acoustic Hawking radiation" and have been experimentally observed (Steinhauer, 2016).`,
    next: ['What is the black hole information paradox?', 'Does quantum mechanics break down near black holes?', 'What is quantum gravity?']
  },
  {
    keys: ['interstellar travel', 'travel to stars', 'alpha centauri', 'warp drive', 'light speed', 'breakthrough starshot'],
    text: `Reaching the nearest stars presents engineering challenges at the edge of what physics permits.

**The distance problem:**
• Proxima Centauri: 4.24 light-years = 40.2 trillion km
• At Parker Solar Probe's record speed (163 km/s): **78,000 years** to arrive
• At 1% the speed of light (3,000 km/s): ~430 years

**Serious propulsion proposals:**

🚀 **Nuclear Pulse Propulsion (Project Orion):** Detonate nuclear bombs behind spacecraft. Could reach 3–10% c. A study in the 1950s–60s showed this is technically feasible. Takes 50–100 years to Proxima.

🚀 **Laser Lightsails (Breakthrough Starshot):** Gram-scale "StarChip" + ultra-thin sail, accelerated by an Earth-based GW-scale laser array to **20% c** in minutes. Could reach Alpha Centauri in ~20 years! $100M project backed by Yuri Milner. Key challenges: pointing the laser, surviving interstellar dust at 20% c.

🚀 **Fusion Rockets:** Theoretical. Require sustained fusion. Could achieve ~10% c.

🚀 **Antimatter Rockets:** Perfect fuel (E = mc²). 1 gram of antimatter = 43 megaton explosion. Problem: making antimatter costs ~10²⁰× its energy content to produce.

**Speculative (new physics required):**
• **Alcubierre warp drive:** Contract space ahead, expand behind. Requires exotic matter with negative energy density — not known to exist. Would need Jupiter's mass-energy.
• **Wormholes:** Topological shortcuts through spacetime — unstable without exotic matter.

**Relativistic effects:** At 90% c, time dilation means a crew ages far slower than Earth. A trip to Andromeda (2.5 million ly) could take 28 crew-years but 2.5 million Earth-years.`,
    next: ['What is time dilation?', 'What is the Breakthrough Starshot project?', 'Could we survive a journey to another star?']
  },
  {
    keys: ['planet formation', 'solar system formation', 'protoplanetary disk', 'planetesimal', 'nice model'],
    text: `Planets form from **protoplanetary disks** — rotating disks of gas and dust around young stars. The process takes millions to tens of millions of years.

**Stage 1: Molecular cloud collapse**
A cold molecular cloud (~10 K) is triggered to collapse — perhaps by a nearby supernova shockwave. As it collapses, conservation of angular momentum spins it faster, flattening it into a disk around the central protostar.

**Stage 2: Dust coagulation**
Micron-sized grains collide and stick via van der Waals forces → mm aggregates → centimeter pebbles. The infamous "meter barrier": ~1-meter rocks spiral into the star before growing further due to gas drag.

**Stage 3: Planetesimal formation**
Solution: streaming instability — aerodynamic interactions concentrate pebbles into dense clumps that self-gravitate into **planetesimals** (~100 km) almost instantly (1,000 years). This step was recently confirmed in computer simulations.

**Stage 4: Runaway and oligarchic growth**
Larger bodies have bigger gravitational cross-sections — they grow faster ("runaway accretion"). In ~1 million years, dominant "oligarchs" (1,000+ km) emerge.

**Stage 5: Gas giant formation (must happen fast!)**
Beyond the snow line (~2.7 AU for our Sun): ice greatly increases solid material. Cores above ~10 Earth masses can rapidly capture surrounding gas → gas giants. This must happen before the disk disperses (~3–5 million years).

**Stage 6: Late Heavy Bombardment**
The **Nice model** predicts that Jupiter and Saturn's orbital resonance ~4 billion years ago destabilized Uranus/Neptune, sending a wave of planetesimals through the inner solar system — explaining the densely cratered Moon.`,
    next: ['How did Earth form?', 'Why does Jupiter protect Earth?', 'What is the Nice model?']
  },
]

const QUICK = [
  'What is a black hole?',
  'How did the universe begin?',
  'Is there life on Mars?',
  'What are gravitational waves?',
  'What has JWST discovered?',
  'What is dark matter?',
  'How do supernovae work?',
  'How can I start stargazing?',
  'What is dark energy?',
  'What is the Fermi Paradox?',
  'Tell me about neutron stars',
  'How do planets form?',
]

const CATS = [
  { icon: '🌌', label: 'Cosmology', qs: ['How did the universe begin?', 'What is dark energy?', 'What is dark matter?', 'Will the universe end?'] },
  { icon: '⭐', label: 'Stars', qs: ['How do supernovae work?', 'Tell me about neutron stars', 'What is Hawking radiation?', 'Tell me about the Sun'] },
  { icon: '🌀', label: 'Galaxies', qs: ['Tell me about the Milky Way', 'What is Sagittarius A*?', 'Will the Milky Way collide with Andromeda?'] },
  { icon: '🪐', label: 'Planets', qs: ['Is there life on Mars?', 'Tell me about Saturn', 'How do planets form?', 'What is the habitable zone?'] },
  { icon: '🚀', label: 'Exploration', qs: ['What has JWST discovered?', 'Tell me about the ISS', 'Tell me about the Moon and Artemis', 'How do we travel to other stars?'] },
  { icon: '🔭', label: 'Observe', qs: ['How can I start stargazing?', 'What telescope should I buy?', 'What can I see tonight?'] },
]

function findAnswer(q: string): { text: string; next: string[] } {
  const lq = q.toLowerCase()
  let best: KEntry | null = null
  let bestScore = 0
  for (const e of DB) {
    let score = 0
    for (const k of e.keys) {
      if (lq.includes(k)) score += k.split(' ').length
    }
    if (score > bestScore) { bestScore = score; best = e }
  }
  if (best && bestScore > 0) return { text: best.text, next: best.next }
  return {
    text: `Great question about astronomy! I have detailed knowledge on these topics — try asking about one:\n\n• **Black holes** — formation, types, Hawking radiation\n• **The Big Bang** — timeline, evidence, inflation\n• **Dark matter & dark energy** — what they are and how we know\n• **Exoplanets & JWST** — discoveries, habitable worlds\n• **Stars** — formation, supernovae, neutron stars\n• **The Milky Way** — structure, galactic center\n• **Space missions** — Artemis, ISS, Mars exploration\n• **Gravitational waves** — LIGO, mergers, multimessenger astronomy\n• **Stargazing guide** — telescopes, tips, what to see\n• **Saturn** — rings, Titan, Enceladus\n• **Interstellar travel** — propulsion concepts, Breakthrough Starshot\n• **Fermi Paradox** — Great Filter, Drake Equation, where is everyone?`,
    next: ['What is a black hole?', 'How did the universe begin?', 'What is dark matter?']
  }
}

function md(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#1e293b;padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.88em;color:#93c5fd">$1</code>')
    .replace(/^• (.+)$/gm, '<li style="margin:3px 0;padding-left:2px;list-style:none">• $1</li>')
    .replace(/\n\n/g, '</p><p style="margin:10px 0">')
    .replace(/\n/g, '<br/>')
}

export default function AstroAI() {
  const [msgs, setMsgs] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Welcome to **AstroAI** — your personal astronomy expert powered by the SpaceHub Knowledge Engine.\n\nI can explain black holes, gravitational waves, dark matter, exoplanets, stellar physics, space missions, and much more — backed by peer-reviewed science.\n\nWhat would you like to explore today?`,
      followups: QUICK.slice(0, 4),
    }
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'explore'>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, thinking])

  const send = (q: string) => {
    const text = q.trim()
    if (!text || thinking) return
    setInput('')
    const uid = Date.now().toString()
    setMsgs(m => [...m, { id: uid, role: 'user', content: text }])
    setThinking(true)
    const delay = 800 + Math.random() * 600
    setTimeout(() => {
      const { text: ans, next } = findAnswer(text)
      setMsgs(m => [...m, { id: uid + 'r', role: 'assistant', content: ans, followups: next }])
      setThinking(false)
    }, delay)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <div className="space-card p-0 overflow-hidden" style={{ minHeight: 600 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)' }}>🤖</div>
          <div>
            <div className="text-white font-bold text-lg">AstroAI</div>
            <div className="text-xs" style={{ color: '#818cf8' }}>Space Intelligence Engine · 20 Deep Knowledge Areas</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 text-xs font-medium">Online</span>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="flex border-b border-white/5">
        {(['chat', 'explore'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="flex-1 py-2.5 text-sm font-medium capitalize transition-colors"
            style={{ color: activeTab === t ? '#818cf8' : '#64748b', borderBottom: activeTab === t ? '2px solid #818cf8' : '2px solid transparent', background: 'transparent' }}>
            {t === 'chat' ? '💬 Chat' : '🔭 Explore Topics'}
          </button>
        ))}
      </div>

      {activeTab === 'explore' && (
        <div className="p-5">
          <p className="text-gray-400 text-sm mb-4">Browse by topic — click any question to get a detailed explanation.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATS.map(c => (
              <div key={c.label} className="rounded-xl p-3" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-white font-semibold text-sm">{c.label}</span>
                </div>
                <div className="space-y-1">
                  {c.qs.map(q => (
                    <button key={q} onClick={() => { setActiveTab('chat'); setTimeout(() => send(q), 100) }}
                      className="w-full text-left text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-white/10"
                      style={{ color: '#94a3b8' }}>
                      → {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="flex flex-col" style={{ height: 520 }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
            {msgs.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 mr-2 mt-1" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.3)' }}>🤖</div>
                )}
                <div className="max-w-[85%]">
                  {msg.role === 'user' ? (
                    <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm text-white" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div className="rounded-2xl rounded-tl-sm p-4 text-sm" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(99,102,241,0.15)', color: '#cbd5e1', lineHeight: 1.65 }}>
                      <p dangerouslySetInnerHTML={{ __html: md(msg.content) }} style={{ margin: 0 }} />
                    </div>
                  )}
                  {msg.followups && msg.followups.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.followups.map(f => (
                        <button key={f} onClick={() => send(f)}
                          className="text-xs px-3 py-1.5 rounded-full transition-all hover:scale-105"
                          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm mr-2 flex-shrink-0" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.3)' }}>🤖</div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-indigo-400"
                        style={{ animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-4 pb-2 border-t border-white/5 pt-3">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {QUICK.map(q => (
                <button key={q} onClick={() => send(q)}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all hover:scale-105"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#94a3b8' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2">
            <div className="flex gap-2 items-center rounded-xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything about the universe…"
                className="flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder-gray-600"
                disabled={thinking}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || thinking}
                className="px-4 py-3 text-sm font-semibold transition-all disabled:opacity-40"
                style={{ color: '#818cf8' }}
              >
                ↑
              </button>
            </div>
            <p className="text-center text-gray-600 text-xs mt-2">SpaceHub Knowledge Engine · Backed by peer-reviewed science</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
