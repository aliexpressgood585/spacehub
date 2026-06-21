import { useState } from 'react'

const ARTICLES = [
  {
    slug: 'how-to-see-iss',
    title: 'How to See the ISS With the Naked Eye',
    date: 'June 15, 2026',
    readTime: '4 min read',
    icon: '🛸',
    preview: 'The International Space Station is one of the most beautiful things you can see in the night sky — but how do you know when and where to look?',
    content: `The International Space Station (ISS) orbits Earth at about 400 km altitude, traveling at 28,000 km/h. It completes 16 orbits per day!

**When to Look for the ISS?**

The ISS appears to the naked eye as a bright white moving dot — similar to a star, but moving much faster. You can see it when:
- **30–45 minutes before sunrise** — the sky is still dark but sunlight catches the station
- **30–45 minutes after sunset** — the same principle applies
- **Clear skies** — no cloud cover

**How Long Does a Pass Last?**

A typical ISS pass lasts 3–6 minutes. It moves from west to east across the sky.

**How Do You Know When to Look?**

Use SpaceHub! Enter your city and you'll get a precise alert when the ISS is overhead.

**Amazing ISS Facts:**
- It's as large as a football field
- Construction cost: $150 billion
- 15 countries collaborate to operate it
- Astronauts have lived aboard continuously since the year 2000`
  },
  {
    slug: 'perseid-meteor-shower-2026',
    title: 'Perseid Meteor Shower 2026 — Everything You Need to Know',
    date: 'June 20, 2026',
    readTime: '3 min read',
    icon: '☄️',
    preview: 'The Perseid meteor shower is one of the most spectacular astronomical events of the year — up to 100 meteors per hour!',
    content: `The Perseid meteor shower arrives every August when Earth passes through the debris trail left by Comet 109P/Swift-Tuttle.

**When to Watch?**

**2026:** Peak activity is expected on the nights of August 11–13.
Maximum: the night of August 12–13, between midnight and dawn.

**How Many Meteors?**

In a typical year: 50–100 meteors per hour. In a strong year (like 2026): up to 150!

**How to Watch?**

1. Go somewhere dark, away from city lights
2. Lie on your back and look toward the northeast
3. Wait 20 minutes for your eyes to adjust to the dark
4. Avoid your phone screen — it ruins your night vision

**Best Viewing Tips:**
- Face away from the Moon if it's up
- A sleeping bag or reclining chair makes it comfortable
- No telescope needed — your eyes are the best tool
- Bring a friend — it's more fun to share the experience`
  },
  {
    slug: 'starlink-satellites-how-to-see',
    title: 'How to See Starlink Satellites Tonight — Complete Guide 2026',
    date: 'June 21, 2026',
    readTime: '5 min read',
    icon: '🛸',
    preview: 'SpaceX Starlink satellites form a dazzling "train of lights" in the night sky. Here\'s exactly how to find them tonight — no telescope needed.',
    content: `SpaceX has launched over 6,000 Starlink satellites into orbit. Shortly after launch, they appear as a mesmerizing train of bright dots moving in a perfectly straight line across the sky — and they're visible to the naked eye from anywhere on Earth.

**What Do Starlink Satellites Look Like?**

Newly launched Starlink satellites appear as a bright chain of 50–60 dots moving in a line, evenly spaced, like a pearl necklace in the sky. They travel from west to east and a pass typically lasts 4–6 minutes. Older Starlinks are dimmer and harder to spot since they've moved to higher orbits.

**When Are They Visible?**

Starlink satellites are best seen:
- **30–60 minutes after sunset** (most common)
- **30–60 minutes before sunrise**
- On clear, dark nights away from city lights

Just like the ISS, they need to be in sunlight while you're in darkness — which only happens in the hours right after sunset or before sunrise.

**How to Track Them Tonight**

1. Use **SpaceHub's Satellite Tracker** to find tonight's passes over your city
2. Go outside 5 minutes before the predicted pass
3. Look toward the west-northwest part of the sky
4. Watch for a chain of moving dots — they'll cross the sky in about 5 minutes
5. Take a photo with a long exposure for the best results!

**Best Camera Settings for Photographing Starlink**

- **ISO:** 1600–3200
- **Aperture:** f/2.8 or wider
- **Shutter speed:** 20–30 seconds
- **Focus:** Manual, set to infinity
- Use a tripod for a sharp, streak-free image

**Why Are They So Bright After Launch?**

Freshly launched satellites are at a lower orbit (approximately 250–350 km) before raising to their operational orbit of 550 km. At the lower altitude, they're much closer to Earth and reflect more sunlight — making them spectacular to see. After a few weeks, they become much dimmer.

**How Many Starlink Satellites Are There?**

As of 2026, SpaceX operates over 6,000 active Starlink satellites. They're launching approximately 60 new satellites every few weeks. Their goal: 42,000 satellites for global internet coverage.

**Controversies**

Not everyone is happy about Starlink. Astronomers worry that the satellites create light pollution that interferes with telescope observations. SpaceX has responded by adding "visors" to newer satellites to reduce reflectivity.

**The Bottom Line**

Starlink satellite trains are one of the most accessible and stunning night sky events you can see right now — no telescope, no planning, just a clear sky and the right timing. Track them live on SpaceHub!`
  },
  {
    slug: 'best-telescopes-beginners-2026',
    title: 'Best Telescopes for Beginners in 2026 — See the Moon, Saturn & Jupiter',
    date: 'June 19, 2026',
    readTime: '6 min read',
    icon: '🔭',
    preview: 'The right beginner telescope will show you Saturn\'s rings, Jupiter\'s moons, and craters on the Moon in stunning detail. Here\'s what to buy in 2026.',
    content: `Buying your first telescope is exciting — but confusing. There are hundreds of options, and a bad choice can ruin the experience. This guide cuts through the noise and tells you exactly what to get based on your budget and goals.

**What Can You Actually See With a Beginner Telescope?**

A good beginner telescope will show you:
- **The Moon** — craters, mountains, and valleys in stunning detail
- **Jupiter** — the four Galilean moons and cloud bands
- **Saturn** — the rings are clearly visible even at 50× magnification!
- **Mars** — the polar ice cap during opposition
- **Star clusters** like the Pleiades and Beehive Cluster
- **Nebulae** — the Orion Nebula looks incredible

**The 3 Types of Telescopes**

**Refractor (lens)** — Best for beginners. Simple, low-maintenance, great for planets.
**Reflector (mirror, Newtonian)** — Best value for large aperture. Great for deep-sky.
**Cassegrain/SCT** — Compact and powerful. More expensive. Best for advanced users.

**Our Top Picks for 2026**

**Budget ($100–$200): Celestron PowerSeeker 127EQ**
- 127mm mirror, shows Saturn's rings and Jupiter's moons
- Equatorial mount — tracks objects as Earth rotates
- Comes with 2 eyepieces and a 3× Barlow lens
- Perfect first telescope for ages 10+

[🛒 Buy Celestron PowerSeeker 127EQ on Amazon](https://www.amazon.com/s?k=Celestron+PowerSeeker+127EQ)

**Mid-Range ($200–$400): Orion StarBlast 6i IntelliScope**
- 150mm aperture, superb views of deep-sky objects
- IntelliScope computer helps you find 14,000 objects
- Compact tabletop design — easy to use anywhere
- Highly rated by astronomy communities worldwide

[🛒 Buy Orion StarBlast 6i IntelliScope on Amazon](https://www.amazon.com/s?k=Orion+StarBlast+6i+IntelliScope)

**Best Value ($400–$700): Sky-Watcher 8" Dobsonian**
- Massive 200mm aperture at a surprisingly low price
- "Light bucket" — collects more light than any telescope in this price range
- You'll see spiral arms of galaxies at dark sky sites
- Manual tracking — you push the telescope by hand

[🛒 Buy Sky-Watcher 8" Dobsonian on Amazon](https://www.amazon.com/s?k=Sky-Watcher+8+inch+Dobsonian)

**What to Avoid**

- **Department store telescopes** (Walmart, toy stores) — usually have poor optics and flimsy mounts
- **Telescopes advertised by magnification** ("500× power!") — magnification means nothing without aperture
- **Alt-az mounts under $100** — too wobbly to use comfortably

**Essential Accessories**

Once you have a telescope, these accessories make a huge difference:
- **A red flashlight** — preserves your night vision while reading star charts
- **Planisphere or SkySafari app** — tells you what's visible tonight
- **Moon filter** — the Moon is surprisingly bright through a telescope!
- **Extra eyepieces** — a 25mm for wide views and a 9mm for detail

**The Most Important Rule**

Whatever telescope you buy — use SpaceHub to know WHAT to look at tonight. Knowing that Jupiter is high in the sky, or that the Moon is at first quarter, makes every observing session more rewarding.

Clear skies! 🌙`
  },
  {
    slug: 'northern-lights-2026-guide',
    title: 'Northern Lights 2026 — When and Where to See the Aurora Borealis',
    date: 'June 18, 2026',
    readTime: '5 min read',
    icon: '🌌',
    preview: 'We are at solar maximum in 2026, meaning the northern lights are more active than they\'ve been in 20 years. Here\'s your complete guide to seeing them.',
    content: `The Aurora Borealis — Northern Lights — is arguably the most spectacular natural phenomenon on Earth. Shimmering curtains of green, pink, and purple light dancing across the night sky. And in 2026, chances are better than ever to see them.

**Why 2026 Is Special**

The Sun follows an approximately 11-year cycle of activity. 2025–2026 marks Solar Maximum — the peak of this cycle. During solar maximum, the Sun produces more solar flares and coronal mass ejections (CMEs) that trigger auroras.

We're seeing auroras at latitudes that normally never experience them — including parts of the United States, central Europe, and even northern Australia. This is a rare window of opportunity.

**Where to See the Northern Lights**

**Best locations in the world:**
- **Tromsø, Norway** — the aurora capital of the world
- **Reykjavik, Iceland** — easy flights, incredible scenery
- **Finnish Lapland** — glass-roofed aurora cabins
- **Yukon, Canada** — remote and dark skies
- **Fairbanks, Alaska** — 240+ aurora nights per year

**During Solar Maximum, also visible from:**
- Scotland and Ireland
- Northern Germany and Scandinavia
- Northern US states (Minnesota, Michigan, Maine)
- New Zealand (the Southern Lights — Aurora Australis)

**When to See the Aurora**

- **Season:** September–March (dark nights essential)
- **Time:** Midnight ±2 hours is peak activity
- **Moon:** New moon phase = darkest skies = best aurora visibility
- **Solar activity:** Check the Kp index on SpaceHub's Space Weather page!

**The Kp Index — Your Aurora Forecast**

The Kp index measures geomagnetic activity from 0 (quiet) to 9 (extreme storm):
- **Kp 3–4:** Visible from northern Scandinavia and Canada
- **Kp 5–6:** Visible from Scotland, Germany, northern US
- **Kp 7+:** Visible from central Europe and even parts of the Middle East!

SpaceHub shows the real-time Kp index. Set up alerts for when Kp exceeds 5.

**How to Photograph the Aurora**

You don't need expensive gear:
- **Any DSLR or mirrorless camera** works great
- Settings: ISO 1600, f/2.8, 10–15 second exposure
- **Modern smartphones** (iPhone 14+, Pixel 7+) have dedicated night modes that capture auroras surprisingly well
- Use a tripod — any movement will blur the shot
- Take RAW photos for better editing

**Aurora Myths Debunked**

❌ "You need to go to the Arctic" — Not during solar maximum!
❌ "It's too cold to enjoy" — Dress properly and you'll love every minute
❌ "It only lasts a few minutes" — Active displays can last hours
❌ "You need a special camera" — Your phone can capture it

**The Bottom Line**

2026 is one of the best years in a decade to see the Northern Lights. Monitor the Kp index on SpaceHub's Space Weather section, plan a trip to a dark location when Kp is forecast above 5, and prepare to be amazed.`
  },
  {
    slug: 'space-weather-explained',
    title: 'What Is Space Weather and Why Does It Matter?',
    date: 'June 10, 2026',
    readTime: '5 min read',
    icon: '⛈️',
    preview: 'Solar storms can affect satellites, GPS, and even power grids. Here is everything you need to know about space weather.',
    content: `Space weather refers to phenomena originating from the Sun that can affect Earth and our technology.

**What Causes Space Weather?**

The Sun constantly emits particles and energy — the "solar wind." Sometimes there are stronger bursts called:
- **CME** (Coronal Mass Ejection) — a cloud of charged particles that can strike Earth
- **Solar Flare** — an intense burst of radiation

**What Can They Do?**

- Trigger auroras (Northern/Southern Lights) at lower latitudes than usual
- Disrupt GPS and radio communications
- Damage satellites in orbit
- In extreme cases — knock out power grids on the ground

**The Kp Index**

Geomagnetic storm strength is measured on the Kp scale from 0 to 9:
- Kp 0–2: Quiet
- Kp 3–5: Minor storm
- Kp 6–7: Moderate storm — auroras possible at mid-latitudes!
- Kp 8–9: Severe storm — extreme effects possible`
  },
]

export default function BlogPage() {
  const [active, setActive] = useState<string | null>(null)
  const article = ARTICLES.find(a => a.slug === active)

  if (article) return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <button onClick={() => setActive(null)} className="text-indigo-400 text-sm mb-6 hover:text-indigo-300 flex items-center gap-1">
        ← Back to Blog
      </button>
      <div className="space-card p-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{article.icon}</span>
          <div>
            <p className="text-xs text-gray-600">{article.date} • {article.readTime}</p>
          </div>
        </div>
        <h1 className="text-2xl font-black text-white mb-6 leading-snug">{article.title}</h1>
        <div className="prose prose-invert max-w-none">
          {article.content.split('\n\n').map((para, i) => {
            if (para.startsWith('**') && para.endsWith('**')) {
              return <h3 key={i} className="text-indigo-300 font-bold text-base mt-6 mb-2">{para.replace(/\*\*/g, '')}</h3>
            }
            const buyMatch = para.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
            if (buyMatch) {
              return <a key={i} href={buyMatch[2]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg font-semibold transition mb-5 mt-1">{buyMatch[1]} ↗</a>
            }
            if (para.includes('**') || para.includes('[')) {
              const html = para
                .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:text-indigo-300 underline">$1</a>')
              return <p key={i} className="text-gray-300 text-sm leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: html }} />
            }
            if (para.startsWith('-')) {
              const items = para.split('\n').filter(l => l.startsWith('-'))
              return <ul key={i} className="space-y-1 mb-4">{items.map((item, j) => <li key={j} className="text-gray-400 text-sm flex gap-2"><span className="text-indigo-500">•</span>{item.slice(2)}</li>)}</ul>
            }
            return <p key={i} className="text-gray-300 text-sm leading-relaxed mb-3">{para}</p>
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <span className="section-label mb-4 inline-flex">📝 Space Blog</span>
        <h2 className="text-3xl font-black text-white mt-3">Articles on Space & Astronomy</h2>
        <p className="text-gray-500 text-sm mt-2">Guides, facts, and upcoming events</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ARTICLES.map(a => (
          <button key={a.slug} onClick={() => setActive(a.slug)} className="space-card p-5 text-left hover:border-indigo-500/40 transition">
            <div className="text-3xl mb-3">{a.icon}</div>
            <h3 className="text-white font-bold text-sm mb-2 leading-snug">{a.title}</h3>
            <p className="text-gray-500 text-xs mb-3 line-clamp-2">{a.preview}</p>
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <span>{a.date}</span>
              <span>•</span>
              <span>{a.readTime}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
