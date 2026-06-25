import { useState } from 'react'

interface Myth {
  culture: string
  flag: string
  name: string
  story: string
}

interface Constellation {
  name: string
  latin: string
  area: number
  stars: number
  brightest: string
  season: string
  icon: string
  color: string
  myths: Myth[]
  science: string
  visibility: string
}

const CONSTELLATIONS: Constellation[] = [
  {
    name: 'Orion', latin: 'Orion (The Hunter)', area: 594, stars: 7, brightest: 'Rigel (β Ori, mag 0.13)', season: 'Winter (Northern Hemisphere)', icon: '🏹', color: '#60a5fa',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'Orion the Hunter', story: 'Orion was the greatest hunter in the world, son of Poseidon. He boasted he would kill every animal on Earth. Gaia, Earth herself, was angered and sent a giant scorpion to kill him. Zeus placed both Orion and Scorpius in the sky on opposite sides so they never meet — which is why Orion sets just as Scorpius rises.' },
      { culture: 'Egyptian', flag: '🇪🇬', name: 'Sah / Osiris', story: 'The Ancient Egyptians identified Orion with Osiris, god of death and resurrection. Orion\'s Belt (the three stars) pointed to where the sun rose at the winter solstice. The Great Pyramid\'s ventilation shaft aligns with Orion\'s Belt. The stars represented Osiris\'s journey through the sky.' },
      { culture: 'Lakota', flag: '🪶', name: 'Hand Constellation', story: 'The Lakota people of North America see Orion\'s Belt and the stars above as a severed hand, cut off in a battle with a star chief. The nebula below the belt (M42) is the blood dripping from the wound. It reminds warriors of the consequences of battle.' },
      { culture: 'Japanese', flag: '🇯🇵', name: 'Tsuyu Hoshi (Drum Stars)', story: 'In Japan, Orion\'s Belt stars were called Mitsu-boshi (three stars) and used as a drum pattern. The constellation as a whole was associated with the agricultural calendar — when Orion rose in the east, it was time to plant rice seedlings.' },
    ],
    science: 'Orion contains two supergiants: Betelgeuse (red) at the top-left, and Rigel (blue-white) at bottom-right. The Orion Nebula (M42), visible to the naked eye as a fuzzy star in the "sword," is an active stellar nursery 1,344 light-years away — one of the most-studied objects in astronomy. The Horsehead Nebula and Flame Nebula also lie in Orion.',
    visibility: 'Visible from all latitudes. Best December–February in the Northern Hemisphere.'
  },
  {
    name: 'Ursa Major', latin: 'Ursa Major (The Great Bear)', area: 1280, stars: 7, brightest: 'Epsilon UMa (Alioth), mag 1.77', season: 'Year-round (Northern)', icon: '🐻', color: '#f97316',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'Callisto', story: 'Zeus seduced Callisto, a huntress of Artemis. When she became pregnant, the jealous Hera transformed her into a bear. Zeus later placed her in the sky as Ursa Major, and her son Arcas (who almost hunted her) became Ursa Minor beside her. The long tail of the bear is an artistic addition — bears don\'t have long tails — added when Greeks pulled the bear into the sky by its short tail, stretching it.' },
      { culture: 'Native American (Iroquois)', flag: '🪶', name: 'The Great Bear Hunt', story: 'The Iroquois see the four-star bowl as a bear, and the three "handle" stars as hunters pursuing it. Each autumn, the hunters catch the bear — represented by the constellation tilting low and the leaves turning red with the bear\'s blood. In spring the bear escapes and climbs back up the sky-mountain.' },
      { culture: 'Hindu', flag: '🇮🇳', name: 'Saptarishi (Seven Sages)', story: 'In Hindu astronomy, the seven bright stars of the Big Dipper are the Saptarishi — the Seven Sages or Great Rishis. These are the seven mind-born sons of Brahma who helped create the universe: Marichi, Atri, Angirasa, Pulastya, Pulaha, Kratu, and Vasishtha. They rotate around Dhruva (Polaris) in eternal devotion.' },
      { culture: 'Chinese', flag: '🇨🇳', name: 'Beidou (Northern Dipper)', story: 'The Big Dipper is Beidou — the Northern Ladle. In Chinese mythology it is the chariot of Taiyi, the Supreme Unity god. The ladle scoops heavenly essence and pours it to Earth. It was also used in ancient Taoist ritual — pointing the handle toward a direction determined the ruling spirit of that season.' },
    ],
    science: 'The seven bright stars form the famous Big Dipper asterism. Five of the seven (Alioth, Mizar, Merak, Phecda, Megrez) actually form a moving star cluster called the Ursa Major Moving Group, traveling together through space. Mizar (the middle handle star) is a remarkable sextuple star system — two visual doubles, each itself a spectroscopic binary.',
    visibility: 'Circumpolar from latitudes above 41°N — never sets. Best March–May.'
  },
  {
    name: 'Scorpius', latin: 'Scorpius (The Scorpion)', area: 497, stars: 18, brightest: 'Antares (α Sco), mag 0.96', season: 'Summer (Northern Hemisphere)', icon: '🦂', color: '#ef4444',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'The Scorpion of Gaia', story: 'Gaia created the scorpion to kill the boastful hunter Orion. The scorpion\'s venom killed him instantly. Zeus honored both by placing them in the sky on opposite sides — as Scorpius rises, Orion sets, so the two enemies never meet. Antares, the red heart of the scorpion, rivals Mars in brilliance, hence its name Anti-Ares (rival of Ares/Mars).' },
      { culture: 'Polynesian', flag: '🌺', name: 'The Fish Hook of Māui', story: 'In Polynesian tradition, the curved tail of Scorpius is the magical fish hook of the demigod Māui. With this hook, Māui fished up the North Island of New Zealand (Te Ika-a-Māui) from the sea. The hook is also called Manaiakalani in Hawaiian tradition. The tail of the scorpion is said to reach down into the cosmic ocean from which islands were pulled.' },
      { culture: 'Aztec', flag: '🦅', name: 'Colotl (The Scorpion)', story: 'The Aztecs also recognized a scorpion and associated it with Xolotl, the dog-headed god who guides the dead through the underworld. The heliacal rising of Antares was used as an agricultural calendar marker for planting maize. The red star represented fire and the underworld.' },
      { culture: 'Japanese', flag: '🇯🇵', name: 'Naga-boshi (The Fishhook)', story: 'In Japanese culture, the curve of Scorpius is called Naga-boshi, "the fishhook." Japanese fishermen used it for navigation. Antares was called Nakago, the middle of the hook, and its heliacal rising marked the start of summer fishing season.' },
    ],
    science: 'Antares is one of the largest stars visible to the naked eye — a red supergiant 700× the Sun\'s diameter. If placed at our solar system\'s center, it would engulf Mercury, Venus, Earth, Mars, and approach Jupiter. It is a future supernova candidate. The constellation sits on the Milky Way and contains spectacular open clusters (M6, M7) and the scorpion\'s tail nebulae visible in dark skies.',
    visibility: 'Best June–August. High in summer sky; low or below horizon for northern observers above 55°N.'
  },
  {
    name: 'Leo', latin: 'Leo (The Lion)', area: 947, stars: 9, brightest: 'Regulus (α Leo), mag 1.35', season: 'Spring (Northern Hemisphere)', icon: '🦁', color: '#fbbf24',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'The Nemean Lion', story: 'The first of Hercules\' Twelve Labors was to kill the Nemean Lion — a monstrous creature whose hide was impervious to all weapons. Hercules strangled it with his bare hands and used its own claws to skin it, wearing the pelt as indestructible armor. Zeus honored the lion by placing it among the stars.' },
      { culture: 'Egyptian', flag: '🇪🇬', name: 'The Lion of Ra', story: 'To ancient Egyptians, Leo was sacred to Ra, the sun god. The Nile flood season, which brought life to Egypt, began when the sun entered Leo — lions were seen drinking at the Nile as the waters rose. The Great Sphinx at Giza likely represents a lion with the Pharaoh\'s head, oriented toward Leo\'s rising at the spring equinox around 10,500 BC.' },
      { culture: 'Mesopotamian', flag: '🏛️', name: 'The Great Lion', story: 'Babylonian astronomers called this constellation Ur-Gula (Great Lion) over 4,000 years ago. It was one of the first constellations documented in the MUL.APIN tablet (1200 BC). The Babylonians associated Leo with the god Nergal (Mars) and used it to track the movements of Jupiter across the ecliptic.' },
      { culture: 'Persian', flag: '🇮🇷', name: 'Shir (The Lion)', story: 'In Persian astronomy, Leo (Shir) was one of the four royal stars. Regulus — the heart of Leo — was called Miyan, "the center." Persian astronomers tracked Jupiter\'s conjunctions with Regulus to make astrological predictions for their kings, associating Jupiter-Leo conjunctions with royal power.' },
    ],
    science: 'Leo contains the Leo Triplet (M65, M66, NGC 3628) — three galaxies in interaction visible through a small telescope. Regulus is unusual: it rotates so fast (96% of its break-up speed) that it is strongly oblate — its equatorial diameter is 32% larger than its polar diameter. The Leonid meteor shower originates from Leo\'s head every November.',
    visibility: 'Best March–May. The famous "sickle" asterism marking the head is easy to identify.'
  },
  {
    name: 'Lyra', latin: 'Lyra (The Harp)', area: 286, stars: 5, brightest: 'Vega (α Lyr), mag 0.03', season: 'Summer (Northern Hemisphere)', icon: '🎵', color: '#a78bfa',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'Orpheus and the Lyre', story: 'The lyre belonged to Orpheus, the greatest musician who ever lived. His music could charm animals, rocks, and trees. When his wife Eurydice died of a serpent bite, Orpheus descended to the Underworld and played his lyre so beautifully that Hades himself wept and agreed to release her — on the condition that Orpheus not look back. He looked back at the last moment, losing her forever. Apollo placed the lyre in the sky in grief.' },
      { culture: 'Arabic', flag: '🌙', name: 'Al-Nasr al-Waki (The Swooping Eagle)', story: 'Arab astronomers saw Vega as the bright star of Al-Nasr al-Waki — the swooping eagle or vulture. This contrasts with the nearby Altair (in Aquila), which was the other eagle. The entire summer triangle was seen as a great bird grouping across the sky.' },
      { culture: 'Welsh', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', name: 'King Arthur\'s Harp', story: 'In Welsh mythology, Lyra is Talyn Arthur — Arthur\'s Harp. Some Welsh traditions hold that King Arthur sleeps beneath a hill and that his harp hangs in the sky, awaiting his return. When Arthur wakes, the harp will play again, heralding a new golden age for Britain.' },
      { culture: 'Japanese', flag: '🇯🇵', name: 'Orihime (Weaving Princess)', story: 'Vega is Orihime, the Weaving Princess, daughter of the Sky King. She fell in love with Hikoboshi (Altair, the cowherd). So consumed were they in love that they neglected their duties. The king separated them across the Milky Way, allowing them to meet only once a year on the 7th night of the 7th month (Tanabata festival). Lyra represents her weaving shuttle.' },
    ],
    science: 'Vega was the North Star 12,000 years ago due to Earth\'s axial precession and will be again in ~13,727 years. The Ring Nebula (M57) in Lyra is one of the most beautiful planetary nebulae — the ejected shell of a dying white dwarf, 2,283 light-years away. Vega was the first star (other than the Sun) to be photographed (1850) and the first to have its spectrum recorded.',
    visibility: 'Vega is nearly overhead in summer from mid-northern latitudes. Part of the Summer Triangle.'
  },
  {
    name: 'Cassiopeia', latin: 'Cassiopeia (The Queen)', area: 598, stars: 5, brightest: 'Segin (ε Cas) or Schedar (α Cas)', season: 'Year-round (Northern)', icon: '👑', color: '#f472b6',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'The Vain Queen', story: 'Cassiopeia was queen of Ethiopia (Aethiopia), wife of King Cepheus, mother of Andromeda. She boasted that she and her daughter were more beautiful than the Nereids (sea nymphs). Poseidon, enraged, sent the sea monster Cetus to devastate their coast. Only by sacrificing Andromeda to Cetus could they appease the gods — until Perseus arrived and rescued her. As punishment for her vanity, Cassiopeia was placed in the sky and spins around the North Pole, sometimes hanging upside-down in humiliation.' },
      { culture: 'Arabic', flag: '🌙', name: 'Al-Kursiyy (The Throne)', story: 'Arab astronomers called this constellation Al-Kursiyy dhi al-Jawza — the Chair of the Pleiades. The W or M shape was seen as a throne. Individual stars were seen as women\'s hands adorned with henna for a celebration.' },
      { culture: 'Inuit', flag: '🧊', name: 'The Caribou', story: 'The Inuit of North America see Cassiopeia as part of a great caribou running across the sky. The W-shape represents the antlers of the caribou. The constellation was used for navigation — it always points toward the North Star, helping Inuit hunters navigate across featureless Arctic ice.' },
      { culture: 'Chinese', flag: '🇨🇳', name: 'Wang Liang (Celestial Charioteer)', story: 'In Chinese astronomy, the W-shape of Cassiopeia was Wang Liang, a famous charioteer from the Zhou dynasty. Other stars nearby formed his chariot and horses. Wang Liang was said to be so skilled he could drive horses up into the sky itself.' },
    ],
    science: 'Cassiopeia sits in the Milky Way and contains spectacular open clusters (M52, NGC 457 — the "Owl Cluster"). Tycho Brahe observed a brilliant supernova (now Tycho\'s Supernova or SN 1572) in Cassiopeia in 1572 — it was briefly visible in daylight. Cassiopeia A is the strongest radio source in the sky beyond our solar system — the remnant of a supernova around 1680 AD.',
    visibility: 'Circumpolar from latitudes above 20°N. Easily identified as a W or M shape depending on orientation.'
  },
  {
    name: 'Cygnus', latin: 'Cygnus (The Swan)', area: 804, stars: 9, brightest: 'Deneb (α Cyg), mag 1.25', season: 'Summer (Northern Hemisphere)', icon: '🦢', color: '#e2e8f0',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'Zeus as a Swan', story: 'Zeus transformed into a swan to seduce Leda, Queen of Sparta. From their union came Castor and Pollux (the Gemini twins) and Helen of Troy. Alternatively, the swan is Orpheus, placed in the sky after his death so he could be with his beloved lyre (Lyra). Or it is Cycnus, a friend of Phaethon who drowned in the Eridanus river mourning Phaethon\'s fall from the sun\'s chariot.' },
      { culture: 'Chinese', flag: '🇨🇳', name: 'The Celestial River Crossing', story: 'In the Chinese Tanabata legend, Deneb (in Cygnus) is the bridge across the Milky Way (the "River of Heaven") that allows the Weaving Princess (Vega/Orihime) and the Cowherd (Altair/Hikoboshi) to meet once a year. Deneb forms the head of a great bird (Que Niao) whose wings form the bridge across the celestial river.' },
      { culture: 'Native American (Navajo)', flag: '🪶', name: 'Yikáísdáhá (Milky Way Region)', story: 'The Navajo people see the Milky Way as the path of the Holy Ones, and Cygnus sits at a key crossing point. The cross shape of Cygnus (the Northern Cross) was seen as a sacred directional marker used in ceremonial navigation.' },
      { culture: 'Finnish', flag: '🇫🇮', name: 'The Swan of Tuonela', story: 'Finnish mythology speaks of the Swan of Tuonela — a great swan swimming on the dark river surrounding the underworld (Tuonela). This image may be connected to the constellation Cygnus, which ancient Finns tracked across the night sky. The swan is immortal and its song foretells death — inspiring Sibelius\'s famous tone poem.' },
    ],
    science: 'Cygnus X-1 (in Cygnus) was the first confirmed stellar black hole (detected 1971) — a binary system where a blue supergiant orbits an unseen ~21 solar-mass companion. Deneb is one of the most luminous stars known — ~196,000 times more luminous than our Sun, and possibly 2,600+ light-years away. The Kepler space telescope stared at Cygnus for 4 years, discovering thousands of exoplanets.',
    visibility: 'Dominant summer constellation. The Northern Cross is prominent; Deneb is the top of the Summer Triangle.'
  },
  {
    name: 'Perseus', latin: 'Perseus (The Hero)', area: 615, stars: 9, brightest: 'Mirfak (α Per), mag 1.79', season: 'Autumn–Winter (Northern)', icon: '⚔️', color: '#34d399',
    myths: [
      { culture: 'Greek', flag: '🇬🇷', name: 'Perseus and the Gorgon', story: 'Perseus was sent on what seemed an impossible mission: slay Medusa, the Gorgon whose gaze turned men to stone. Armed with a mirrored shield from Athena, winged sandals from Hermes, and a cap of invisibility from Hades, Perseus decapitated Medusa without looking at her directly. From Medusa\'s neck sprang Pegasus the winged horse and the giant Chrysaor. Perseus then used Medusa\'s head to rescue Andromeda from the sea monster Cetus, turning Cetus to stone and marrying her.' },
      { culture: 'Arabic', flag: '🌙', name: 'Ra\'s al-Ghul (The Demon\'s Head)', story: 'The star Algol (β Persei) — the most famous variable star in the sky — was known in Arabic as Ra\'s al-Ghul, "the head of the demon/ghoul." Arab astronomers noticed that Algol periodically dimmed (we now know it\'s an eclipsing binary) and associated its irregular blinking with a sinister omen. It is the origin of our word "ghoul."' },
      { culture: 'Chinese', flag: '🇨🇳', name: 'Ji Gui (Rooster)', story: 'Chinese astronomers saw in Perseus the body of a rooster, with Algol being Dajin, a group of stacked corpses or a heap of things. The constellation played a role in Chinese astrological predictions about military affairs.' },
      { culture: 'Egyptian', flag: '🇪🇬', name: 'Horus', story: 'Some Egyptologists associate Perseus with Horus, the falcon-headed god of sky and kingship. The raised arm of Perseus (in sky maps) resembles the outstretched wing of a falcon. The Eye of Horus may be connected to Algol\'s blinking nature.' },
    ],
    science: 'Algol (β Per) is the prototype eclipsing binary — two stars orbiting each other that periodically block each other\'s light, dimming from magnitude 2.1 to 3.4 every 2.87 days. Perseus contains the Double Cluster (NGC 869 and NGC 884) — two spectacular open clusters 7,500 light-years away, visible to the naked eye as a fuzzy patch. The Perseid meteor shower radiates from Perseus every August, producing up to 100 meteors/hour.',
    visibility: 'Best October–February. Contains the radiant of the Perseid meteor shower (peak August 11–13).'
  },
]

export default function ConstellationMythology() {
  const [selected, setSelected] = useState(CONSTELLATIONS[0])
  const [activeCulture, setActiveCulture] = useState(0)

  const myth = selected.myths[activeCulture] ?? selected.myths[0]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Constellation Mythology</h2>
      <p className="text-gray-400 text-sm mb-5">The same stars — different stories. How cultures across human history interpreted the night sky</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Constellation picker */}
        <div className="space-y-1">
          {CONSTELLATIONS.map(c => (
            <button key={c.name} onClick={() => { setSelected(c); setActiveCulture(0) }}
              className="w-full text-left px-3 py-2.5 rounded-lg transition-all"
              style={{
                background: selected.name === c.name ? c.color + '18' : 'rgba(30,41,59,0.5)',
                border: `1px solid ${selected.name === c.name ? c.color + '50' : 'transparent'}`,
              }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{c.icon}</span>
                <div>
                  <div className="text-white text-sm font-medium">{c.name}</div>
                  <div className="text-gray-500 text-xs">{c.season}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.latin}</h3>
                <div className="text-sm" style={{ color: selected.color }}>Brightest: {selected.brightest}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                ['Season', selected.season.split('(')[0].trim()],
                ['Area', selected.area + ' sq°'],
                ['Named stars', selected.stars + ' Bayer'],
                ['Visibility', selected.visibility.split('.')[0]],
              ].map(([k, v]) => (
                <div key={k} className="bg-black/20 rounded-lg p-2">
                  <div className="text-gray-500">{k}</div>
                  <div className="text-gray-200 font-medium">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Culture tabs */}
          <div className="flex flex-wrap gap-2">
            {selected.myths.map((m, i) => (
              <button key={i} onClick={() => setActiveCulture(i)}
                className="px-3 py-1.5 text-sm rounded-full transition-all"
                style={{
                  background: activeCulture === i ? selected.color + '25' : 'rgba(30,41,59,0.7)',
                  border: `1px solid ${activeCulture === i ? selected.color + '60' : 'rgba(255,255,255,0.05)'}`,
                  color: activeCulture === i ? selected.color : '#94a3b8',
                }}>
                {m.flag} {m.culture}
              </button>
            ))}
          </div>

          {/* Myth story */}
          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{myth.flag}</span>
              <div>
                <div className="text-white font-bold">{myth.name}</div>
                <div className="text-gray-500 text-xs">{myth.culture} tradition</div>
              </div>
            </div>
            <p className="text-gray-200 text-sm leading-relaxed">{myth.story}</p>
          </div>

          {/* All cultures at a glance */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">All Cultural Names at a Glance</div>
            <div className="grid grid-cols-2 gap-2">
              {selected.myths.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span>{m.flag}</span>
                  <span className="text-gray-500">{m.culture}:</span>
                  <span className="text-gray-300">{m.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Science */}
          <div className="bg-indigo-900/20 rounded-xl p-4 border border-indigo-800/30">
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">What Astronomers Know Today</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.science}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
