import { useState } from 'react'

interface Message {
  id: string
  name: string
  year: number
  icon: string
  color: string
  mission: string
  type: string
  shortDesc: string
  what: string
  where: string
  howFar: string
  contents: string[]
  funniest: string
  controversy?: string
  currentLocation: string
  wouldAliensUnderstand: string
  quote: string
  quoteAuthor: string
}

const MESSAGES: Message[] = [
  {
    id: 'pioneer',
    name: 'Pioneer Plaque',
    year: 1972,
    icon: '🪧',
    color: '#fbbf24',
    mission: 'Pioneer 10 & 11',
    type: 'Physical metal plaque',
    shortDesc: 'Gold-anodized aluminum plates attached to Pioneer 10 and 11 — humanity\'s first deliberate physical message to possible alien civilizations',
    what: 'A 15×23 cm gold-anodized aluminum plaque depicting a nude man and woman, the Pioneer spacecraft for scale, a pulsar map showing our location, a hydrogen hyperfine transition diagram (universal clock), and a silhouette of the solar system showing the spacecraft\'s origin.',
    where: 'Attached to the antenna support struts of Pioneer 10 and Pioneer 11',
    howFar: 'Pioneer 10 is ~130 AU from the Sun (beyond the heliopause). It takes ~18 hours for a signal at light-speed to reach it.',
    contents: [
      'Nude man and woman (standing, man\'s hand raised in greeting)',
      'Pulsar map with 14 pulsars — unique cosmic "address" to find our Sun',
      'Hydrogen atom hyperfine transition (defines time and length units)',
      'Schematic of solar system with spacecraft trajectory',
      'Pioneer spacecraft itself for physical scale reference',
      'Binary representation of the number 8 (woman\'s height in H wavelengths)',
    ],
    funniest: 'When the plaque was revealed, some critics called it "cosmic pornography" for the nude figures. NASA received angry letters. Carl Sagan\'s response: "Extraterrestrials will not be offended."',
    controversy: 'The woman was depicted slightly behind the man, with a less prominent pose. Critics noted the implicit gender hierarchy. The woman also had no genitalia depicted, while the man\'s was more suggested.',
    currentLocation: 'Pioneer 10: ~130 AU from Sun, heading toward Aldebaran (68 light-years away, will arrive in ~2 million years). Pioneer 11: heading toward Aquila constellation.',
    wouldAliensUnderstand: 'Possibly — the pulsar map is clever (pulsars have unique spin rates = cosmic GPS). But the figures assume bipedal upright stance is obvious. Carl Sagan admitted the woman\'s bent arm might not read as relaxed — could look hostile.',
    quote: 'The Pioneer 10 spacecraft has left the solar system. It is now the farthest human-made object from the Sun. Somewhere out there it carries a message.',
    quoteAuthor: 'Carl Sagan'
  },
  {
    id: 'arecibo',
    name: 'Arecibo Message',
    year: 1974,
    icon: '📡',
    color: '#3b82f6',
    mission: 'Arecibo Radio Telescope, Puerto Rico',
    type: 'Radio signal (binary)',
    shortDesc: 'A 1,679-bit binary message broadcast from Arecibo toward M13 globular cluster — 25,000 light-years away. Humanity\'s first deliberate radio message to extraterrestrials.',
    what: '1,679 bits arranged in a 23×73 pixel bitmap (both prime — prevents alternative factorizations). Encodes the numbers 1–10, DNA base atoms (C, H, N, O, P), double helix, a human figure, solar system, and the Arecibo telescope itself.',
    where: 'Broadcast November 16, 1974 at 2,380 MHz toward the globular cluster M13 (Hercules Cluster, ~300,000 stars)',
    howFar: 'The signal has traveled ~52 light-years since broadcast (as of 2026). It will reach M13 in roughly 24,948 years.',
    contents: [
      'Numbers 1–10 in binary',
      'Atomic numbers of DNA elements: H(1), C(6), N(7), O(8), P(15)',
      'Formulas for DNA nucleotides (sugars and bases)',
      'Number of nucleotides in human DNA (~4.3 billion, encoded in binary)',
      'DNA double helix graphic',
      'Human figure with height ~14 wavelengths = 168 cm',
      'Human population of Earth (~4.29 billion in 1974)',
      'Solar system diagram (Pluto included!)',
      'Arecibo telescope and its diameter (~305 m)',
    ],
    funniest: 'The message was aimed at M13, but M13 will have moved by the time it arrives (25,000 years of proper motion). Carl Sagan acknowledged this was "more a demonstration of human technical capacity than a serious attempt at communication."',
    currentLocation: 'Expanding outward at light speed — currently a spherical shell ~52 light-years from Earth, still only 0.2% of the way to M13.',
    wouldAliensUnderstand: 'It\'s a puzzle that requires figuring out the binary grid — not obvious. A civilization with enough math could decode it. But is binary assumed universal? We think so: two states (on/off) are the simplest possible system.',
    quote: 'A message was sent. It was a concrete demonstration that we could communicate across interstellar space. The fact that no one answered back is not discouraging. We just sent it 50 years ago.',
    quoteAuthor: 'Frank Drake (designer of the message)'
  },
  {
    id: 'golden_record',
    name: 'Voyager Golden Records',
    year: 1977,
    icon: '💿',
    color: '#a855f7',
    mission: 'Voyager 1 & Voyager 2',
    type: 'Physical phonograph record (gold-plated copper)',
    shortDesc: 'Two gold-plated copper phonograph records, each containing 116 images, 90 minutes of music, and greetings in 55 languages — humanity\'s most ambitious message to the cosmos',
    what: 'A 12-inch gold-plated copper disk with a stylus and playback instructions etched on the cover (including how to decode images, and a pulsar map). Contains sounds, music, greetings, and images designed to survive billions of years in interstellar space.',
    where: 'Attached to Voyager 1 and Voyager 2, launched in 1977',
    howFar: 'Voyager 1: ~164 AU from the Sun (as of 2026) — in interstellar space, the farthest human object ever. Voyager 2: ~136 AU. Both are in the void between stars.',
    contents: [
      '116 encoded images: human anatomy, food, DNA, Earth from space, Rush hour traffic, Great Wall of China, Olympic sprinters, dolphins, schoolrooms',
      'Sounds of Earth: rain, surf, wind, thunder, bird song, whales, baby crying, footsteps',
      '90 minutes of music: Bach (3 pieces), Beethoven, Mozart, Stravinsky, Louis Armstrong (Melancholy Blues), Chuck Berry (Johnny B. Goode), Blind Willie Johnson, Navajo chants, Peruvian panpipes, Pygmy girls\' initiation song, Bulgarian folk song',
      'Greetings in 55 human languages (including Ancient Akkadian)',
      'Message from UN Secretary-General Kurt Waldheim',
      'Message from US President Jimmy Carter',
      'Cover: playback instructions, pulsar map, hydrogen atom diagram, binary encoding',
    ],
    funniest: 'Jimmy Carter\'s recorded message says Earth is "a small and lovely world" — which Carl Sagan pointed out was generous. Also: Chuck Berry\'s "Johnny B. Goode" was controversial; one scientist objected "no punk rock on the Golden Record."',
    controversy: 'Ann Druyan (who fell in love with Carl Sagan during the project and later married him) recorded her brainwaves while meditating on the "history of Earth for one hour." Those brainwaves — a love-struck human thinking about life — are encoded on the record.',
    currentLocation: 'Voyager 1 is in interstellar space, heading toward the star AC+79 3888 in 40,000 years. The golden record will outlast Earth (the Sun will engulf Earth in 5B years; the record could survive for billions more).',
    wouldAliensUnderstand: 'The cover has extremely detailed playback instructions in binary/pictographic form. A sufficiently advanced civilization could play it. Carl Sagan said the record was "a bottle thrown into the cosmic ocean." Optimistic, not practical.',
    quote: 'The record is a gift to the cosmos. Whatever we send, whatever we do, we are saying: here we are, on a pale blue dot, and we are alive, and we love, and we make music. That message may outlast civilization.',
    quoteAuthor: 'Carl Sagan'
  },
  {
    id: 'cosmic_call',
    name: 'Cosmic Call 1 & 2',
    year: 1999,
    icon: '📻',
    color: '#22c55e',
    mission: 'Evpatoria Radio Telescope, Ukraine',
    type: 'Radio signal',
    shortDesc: 'A series of targeted radio transmissions toward sun-like stars, designed by Canadian engineer Yvan Dutil and Stéphane Dumas to be self-decoding',
    what: 'Complex mathematical/physical encyclopedia designed to teach an alien receiver the basics of math, physics, and humanity from first principles — starting with the simplest binary concepts and building up to molecules, the solar system, and a digitized image of the Earth.',
    where: 'Transmitted to 4 star systems including 55 Cancri (41 ly), HD 10307 (42 ly), and 47 Ursae Majoris (46 ly). Cosmic Call 2 (2003) targeted 5 more Sun-like stars.',
    howFar: 'The 1999 signal has traveled ~27 light-years. The earliest possible reply (from the nearest target) could arrive around 2068.',
    contents: [
      'Rosetta Stone-style mathematical primer (binary counting, basic arithmetic)',
      'Chemical element table (designed to be deciphered without prior knowledge)',
      'Physical constants in self-defined units',
      'DNA and biological information',
      'Map of Earth and solar system',
      'Digitized images of Earth and selected people',
      'Musical piece included (Across the Universe by The Beatles, sent in 2008 NASA transmission)',
    ],
    funniest: '"Across the Universe" was transmitted by NASA in 2008 toward Polaris (431 ly away). John Lennon would have been 67. Yoko Ono called it "a great honour" and "absolutely amazing." Polaris won\'t receive it until 2439.',
    currentLocation: 'Various expanding radio shells, 1999 signal now ~27 light-years out',
    wouldAliensUnderstand: 'Dutil and Dumas designed a truly self-decoding message — arguably the best-designed METI (Messaging Extra-Terrestrial Intelligence) transmission. Tested on isolated humans who decoded it successfully without instruction.',
    quote: 'We can\'t be sure aliens will understand our language. So we built a language that teaches itself from the ground up.',
    quoteAuthor: 'Yvan Dutil (designer)'
  },
  {
    id: 'meti_debate',
    name: 'The METI Controversy',
    year: 2015,
    icon: '⚠️',
    color: '#ef4444',
    mission: 'Scientific debate — should we actively transmit?',
    type: 'Ongoing scientific & ethical debate',
    shortDesc: 'Should humanity deliberately broadcast our existence? Stephen Hawking said no. SETI scientists say we already have. A fierce debate about the most consequential decision our species may ever make.',
    what: 'Active METI (Messaging Extra-Terrestrial Intelligence) vs. passive SETI (Search for Extra-Terrestrial Intelligence). In 2015, a group of scientists and technologists — including Elon Musk, David Brin, and others — signed a petition calling for a moratorium on METI until global consensus is reached.',
    where: 'The debate occurs across scientific conferences, papers, and op-eds. No international treaty governs METI. Any group with a large enough radio telescope can transmit.',
    howFar: 'Our earliest accidental radio emissions (from WWII radar and TV broadcasts) have now traveled ~80 years = ~80 light-years, creating a sphere encompassing ~3,500 star systems.',
    contents: [
      'FOR METI: We\'re already detectable (80ly radio bubble + radar reflections of our planets). The "cosmic silence" argument may be the answer.',
      'AGAINST METI: A civilization that developed FTL travel or advanced weapons could destroy us. The risk is asymmetric: the cost of silence is low; the cost of a hostile contact is extinction.',
      'Stephen Hawking (2010): "Meeting an advanced civilization could be like Native Americans meeting Columbus — that didn\'t turn out well."',
      'David Brin: "What\'s the rush? Let\'s figure out the Great Filter first."',
      'SETI Institute response: "We shouldn\'t fear others — we\'re already visible."',
      'Fermi Paradox: if civilizations exist, why haven\'t we heard them?',
    ],
    funniest: 'In 2017, a "Teen-Age Message" was broadcast from Evpatoria including a theremin concert performed by Russian teenagers. The target was 6 nearby Sun-like stars. No permission was sought from anyone.',
    currentLocation: 'N/A — this is a living, unresolved debate',
    wouldAliensUnderstand: 'Unknown. And that\'s precisely the point. We don\'t know if intelligence is fundamentally convergent (all smart things develop the same concepts) or completely alien (literally impossible to communicate with).',
    quote: 'If we are alone in the universe, it seems like an awful waste of space. If we are not alone, then perhaps we should be quiet.',
    quoteAuthor: 'Stephen Hawking'
  },
  {
    id: 'beacon',
    name: 'The 1977 "Wow!" Signal',
    year: 1977,
    icon: '❓',
    color: '#f97316',
    mission: 'Big Ear Radio Observatory, Ohio State University',
    type: 'Possible incoming alien signal (unverified)',
    shortDesc: 'The strongest candidate for an extraterrestrial signal ever detected — a 72-second burst matching all predicted characteristics of an alien transmission. Never heard again.',
    what: 'On August 15, 1977, astronomer Jerry Ehman detected a narrowband radio signal at 1420.4556 MHz (the hydrogen line — where SETI scientists predicted aliens would transmit). It lasted exactly 72 seconds — the duration of Big Ear\'s beam. Ehman circled it and wrote "Wow!" in the margin. The signal was 30× stronger than background noise.',
    where: 'Originating from the direction of the Chi Sagittarii star group (~220 light-years away)',
    howFar: 'If genuine, the signal originated ~220 light-years away — a region that contains no identified planetary system matching modern surveys',
    contents: [
      '"6EQUJ5" — the signal\'s amplitude sequence encoded in Big Ear\'s alphanumeric system (6 = 6× background, E = 14×, Q = 26×, U = 30×)',
      'Hydrogen line frequency (1420 MHz) — a universal frequency unlikely to be random noise',
      '72-second duration matching Earth\'s rotation through telescope beam (confirming it\'s a point source)',
      'Narrowband: the signal was extraordinarily narrow — natural astrophysical sources are broadband. Narrow = artificial.',
      'Never repeated: 50+ years of follow-up observations at that location found nothing',
    ],
    funniest: 'In 2012, a response to the Wow! signal was transmitted by the National Geographic Channel from the Arecibo telescope. The response included crowd-sourced Twitter messages including "@aliens: please leave a message after the beep."',
    controversy: 'A 2017 paper proposed the signal was caused by comets (outgassing hydrogen). The original Wow! team rejected this — the bandwidth was too narrow for a comet. As of 2026, there is no consensus explanation. It remains the most tantalizing unexplained signal in SETI history.',
    currentLocation: 'Unknown origin. If a reply was sent in 1977, we wouldn\'t receive it until ~2197 (440 light-year round trip).',
    wouldAliensUnderstand: 'If the signal was intentional, the sender knew humans would be listening at 1420 MHz. The signal itself carries no decipherable information — it\'s like a lighthouse beam saying "here I am," not a message.',
    quote: '"Wow!" — three letters that changed how seriously we take the search for extraterrestrial intelligence.',
    quoteAuthor: 'Jerry Ehman (Big Ear astronomer, 1977)'
  },
]

export default function DeepSpaceMessages() {
  const [selected, setSelected] = useState<Message>(MESSAGES[0])
  const [showContents, setShowContents] = useState(false)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Humanity's Messages to the Cosmos</h2>
      <p className="text-gray-400 text-sm mb-5">Every signal, plaque, and radio burst we've sent — or received — in our quest to reach the stars</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Message selector */}
        <div className="space-y-2">
          {MESSAGES.map(msg => (
            <button
              key={msg.id}
              onClick={() => { setSelected(msg); setShowContents(false) }}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === msg.id ? msg.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === msg.id ? msg.color + '55' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xl">{msg.icon}</span>
                <div className="font-semibold text-sm" style={{ color: selected.id === msg.id ? msg.color : '#e2e8f0' }}>{msg.name}</div>
              </div>
              <div className="flex items-center gap-2 ml-8">
                <span className="text-gray-500 text-xs">{msg.year}</span>
                <span className="text-gray-700 text-xs">•</span>
                <span className="text-gray-500 text-xs">{msg.type}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3">
              <span className="text-4xl flex-shrink-0">{selected.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: selected.color + '20', color: selected.color, border: `1px solid ${selected.color}40` }}>
                    {selected.year}
                  </span>
                </div>
                <div className="text-sm" style={{ color: selected.color }}>{selected.mission}</div>
                <div className="text-gray-400 text-xs mt-0.5">{selected.type}</div>
              </div>
            </div>
            <p className="text-gray-300 text-sm mt-3 leading-relaxed">{selected.shortDesc}</p>
          </div>

          {/* What it contains */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400 text-xs uppercase font-semibold">What It Contains</div>
              <button
                onClick={() => setShowContents(v => !v)}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                {showContents ? 'Hide' : 'Show'} Details
              </button>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.what}</p>
            {showContents && (
              <div className="mt-3 space-y-1.5">
                {selected.contents.map((c, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="flex-shrink-0" style={{ color: selected.color }}>▸</span>
                    <span className="text-gray-300">{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Distance & location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Where It Is Now</div>
              <p className="text-gray-300 text-xs leading-relaxed">{selected.currentLocation}</p>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Distance Traveled</div>
              <p className="text-gray-300 text-xs leading-relaxed">{selected.howFar}</p>
            </div>
          </div>

          {/* Would aliens understand */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Would Aliens Understand It?</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.wouldAliensUnderstand}</p>
          </div>

          {/* Funny/controversy */}
          <div className="bg-amber-900/20 rounded-xl p-4 border border-amber-800/30">
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">😄 The Human Part</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funniest}</p>
            {selected.controversy && (
              <div className="mt-3 pt-3 border-t border-amber-800/20">
                <div className="text-amber-500 text-xs uppercase font-semibold mb-1">Controversy</div>
                <p className="text-gray-400 text-xs leading-relaxed">{selected.controversy}</p>
              </div>
            )}
          </div>

          {/* Quote */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}20` }}>
            <div className="text-2xl mb-2" style={{ color: selected.color, opacity: 0.6 }}>"</div>
            <p className="text-gray-200 text-sm italic leading-relaxed mb-2">{selected.quote}</p>
            <div className="text-xs font-semibold" style={{ color: selected.color }}>— {selected.quoteAuthor}</div>
          </div>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="mt-6 bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Timeline of Humanity's Cosmic Outreach</div>
        <div className="relative">
          <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-700" />
          <div className="flex justify-between relative">
            {MESSAGES.filter(m => typeof m.year === 'number' && m.year < 2010).map(msg => (
              <div key={msg.id} className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => setSelected(msg)}>
                <div className="w-3 h-3 rounded-full border-2 relative z-10 transition-transform hover:scale-125"
                  style={{ background: selected.id === msg.id ? msg.color : '#1e293b', borderColor: msg.color }} />
                <div className="text-center mt-1">
                  <div className="text-xs font-bold" style={{ color: msg.color }}>{msg.year}</div>
                  <div className="text-gray-600 text-[10px] leading-tight max-w-[60px] text-center">{msg.name.split(' ')[0]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
