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
            if (para.includes('**')) {
              return <p key={i} className="text-gray-300 text-sm leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
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
