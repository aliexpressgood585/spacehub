import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ISSAlertSystem from '../components/ISSAlertSystem'

export const CITY_DATA: Record<string, { name: string; nameEn: string; lat: number; lng: number; desc: string }> = {
  'new-york':        { name: 'New York',        nameEn: 'New York',        lat: 40.71,  lng: -74.00,  desc: 'NYC — ISS is visible above the iconic skyline up to 5 times per day' },
  'london':          { name: 'London',          nameEn: 'London',          lat: 51.51,  lng: -0.13,   desc: 'London — High latitude means longer, more frequent ISS passes' },
  'los-angeles':     { name: 'Los Angeles',     nameEn: 'Los Angeles',     lat: 34.05,  lng: -118.24, desc: 'LA — Clear skies make ISS passes spectacular from the hills' },
  'paris':           { name: 'Paris',           nameEn: 'Paris',           lat: 48.86,  lng: 2.35,    desc: 'Paris — ISS can be seen passing near the Eiffel Tower' },
  'tokyo':           { name: 'Tokyo',           nameEn: 'Tokyo',           lat: 35.68,  lng: 139.65,  desc: 'Tokyo — ISS passes are a popular sight for Japanese astronomy fans' },
  'sydney':          { name: 'Sydney',          nameEn: 'Sydney',          lat: -33.87, lng: 151.21,  desc: 'Sydney — Southern hemisphere offers unique views of the night sky' },
  'toronto':         { name: 'Toronto',         nameEn: 'Toronto',         lat: 43.65,  lng: -79.38,  desc: 'Toronto — ISS passes are clearly visible from Lake Ontario shores' },
  'berlin':          { name: 'Berlin',          nameEn: 'Berlin',          lat: 52.52,  lng: 13.41,   desc: 'Berlin — High latitude city with excellent ISS visibility' },
  'dubai':           { name: 'Dubai',           nameEn: 'Dubai',           lat: 25.20,  lng: 55.27,   desc: 'Dubai — Clear desert skies make ISS very bright when passing overhead' },
  'chicago':         { name: 'Chicago',         nameEn: 'Chicago',         lat: 41.88,  lng: -87.63,  desc: 'Chicago — Lake Michigan provides a clear western horizon for ISS rises' },
  'tel-aviv':        { name: 'Tel Aviv',        nameEn: 'Tel Aviv',        lat: 32.08,  lng: 34.78,   desc: 'Tel Aviv — ISS passes over Israel 4-5 times daily' },
  'jerusalem':       { name: 'Jerusalem',       nameEn: 'Jerusalem',       lat: 31.77,  lng: 35.21,   desc: 'Jerusalem — Track ISS from the rooftops of the Old City' },
  'amsterdam':       { name: 'Amsterdam',       nameEn: 'Amsterdam',       lat: 52.37,  lng: 4.90,    desc: 'Amsterdam — Flat horizon makes ISS easily visible from the city' },
  'madrid':          { name: 'Madrid',          nameEn: 'Madrid',          lat: 40.42,  lng: -3.70,   desc: 'Madrid — Clear Spanish skies offer great ISS viewing conditions' },
  'rome':            { name: 'Rome',            nameEn: 'Rome',            lat: 41.90,  lng: 12.50,   desc: 'Rome — Watch ISS glide above the ancient city' },
  'moscow':          { name: 'Moscow',          nameEn: 'Moscow',          lat: 55.75,  lng: 37.62,   desc: 'Moscow — Very frequent ISS passes due to high latitude' },
  'beijing':         { name: 'Beijing',         nameEn: 'Beijing',         lat: 39.91,  lng: 116.39,  desc: 'Beijing — ISS visible from Tiananmen Square area on clear nights' },
  'singapore':       { name: 'Singapore',       nameEn: 'Singapore',       lat: 1.35,   lng: 103.82,  desc: 'Singapore — Equatorial location gives unique ISS viewing angles' },
  'mumbai':          { name: 'Mumbai',          nameEn: 'Mumbai',          lat: 19.08,  lng: 72.88,   desc: 'Mumbai — Arabian Sea horizon makes ISS rises dramatic' },
  'cairo':           { name: 'Cairo',           nameEn: 'Cairo',           lat: 30.04,  lng: 31.24,   desc: 'Cairo — Desert air clarity makes ISS exceptionally bright' },
  'mexico-city':     { name: 'Mexico City',     nameEn: 'Mexico City',     lat: 19.43,  lng: -99.13,  desc: 'Mexico City — High altitude location improves ISS visibility' },
  'buenos-aires':    { name: 'Buenos Aires',    nameEn: 'Buenos Aires',    lat: -34.60, lng: -58.38,  desc: 'Buenos Aires — Southern sky views make ISS passes unique' },
  'sao-paulo':       { name: 'São Paulo',       nameEn: 'Sao Paulo',       lat: -23.55, lng: -46.63,  desc: 'São Paulo — Brazil\'s largest city with frequent ISS passes' },
  'johannesburg':    { name: 'Johannesburg',    nameEn: 'Johannesburg',    lat: -26.20, lng: 28.04,   desc: 'Johannesburg — Southern Africa offers pristine dark sky views' },
  'seoul':           { name: 'Seoul',           nameEn: 'Seoul',           lat: 37.57,  lng: 126.98,  desc: 'Seoul — ISS frequently visible from Han River parks' },
  'bangkok':         { name: 'Bangkok',         nameEn: 'Bangkok',         lat: 13.75,  lng: 100.52,  desc: 'Bangkok — Tropical skies offer clear ISS sightings' },
  'istanbul':        { name: 'Istanbul',        nameEn: 'Istanbul',        lat: 41.01,  lng: 28.95,   desc: 'Istanbul — Watch ISS cross the Bosphorus from Europe to Asia' },
  'vienna':          { name: 'Vienna',          nameEn: 'Vienna',          lat: 48.21,  lng: 16.37,   desc: 'Vienna — Central Europe location with excellent ISS visibility' },
  'stockholm':       { name: 'Stockholm',       nameEn: 'Stockholm',       lat: 59.33,  lng: 18.07,   desc: 'Stockholm — Arctic proximity means ISS is visible in broad daylight sometimes' },
  'miami':           { name: 'Miami',           nameEn: 'Miami',           lat: 25.77,  lng: -80.19,  desc: 'Miami — Ocean horizon gives dramatic ISS rise and set views' },
  'houston':         { name: 'Houston',         nameEn: 'Houston',         lat: 29.76,  lng: -95.37,  desc: 'Houston — Home of NASA Mission Control, ISS passes are extra special here' },
  'san-francisco':   { name: 'San Francisco',   nameEn: 'San Francisco',   lat: 37.77,  lng: -122.42, desc: 'San Francisco — Golden Gate makes a stunning ISS backdrop' },
  'cape-town':       { name: 'Cape Town',       nameEn: 'Cape Town',       lat: -33.92, lng: 18.42,   desc: 'Cape Town — Table Mountain frames ISS passes beautifully' },
  'melbourne':       { name: 'Melbourne',       nameEn: 'Melbourne',       lat: -37.81, lng: 144.96,  desc: 'Melbourne — Southern hemisphere ISS passes often last longer' },
}

export default function CityPage() {
  const { city } = useParams<{ city: string }>()
  const data = city ? CITY_DATA[city] : null
  const [issPos, setIssPos] = useState<{ lat: number; lng: number; alt: number } | null>(null)

  useEffect(() => {
    if (!data) return
    document.title = `ISS over ${data.name} — Live Tracker | SpaceHub`
    const desc = document.querySelector('meta[name="description"]')
    if (desc) desc.setAttribute('content', `Track the International Space Station live over ${data.name}. See real-time ISS position, distance, altitude and get notified when it passes overhead.`)
  }, [data])

  useEffect(() => {
    if (!data) return
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => setIssPos({ lat: d.latitude, lng: d.longitude, alt: d.altitude }))
      .catch(() => {})
  }, [data])

  if (!data) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-4xl mb-4">🌍</p>
      <h2 className="text-2xl font-bold text-white mb-4">City Not Found</h2>
      <Link to="/" className="text-indigo-400 hover:text-indigo-300">Back to SpaceHub</Link>
    </div>
  )

  const dist = issPos ? (() => {
    const R = 6371
    const dLat = (issPos.lat - data.lat) * Math.PI / 180
    const dLng = (issPos.lng - data.lng) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(data.lat*Math.PI/180)*Math.cos(issPos.lat*Math.PI/180)*Math.sin(dLng/2)**2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
  })() : null

  return (
    <div className="min-h-screen" style={{ background: '#050816' }}>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/" className="text-indigo-400 text-sm mb-8 hover:text-indigo-300 flex items-center gap-1">← Back to SpaceHub</Link>

        <div className="text-center mb-10">
          <span className="section-label mb-4 inline-flex">🛸 ISS</span>
          <h1 className="text-4xl font-black text-white mt-3">
            ISS over <span className="gradient-text">{data.name}</span>
          </h1>
          <p className="text-gray-500 mt-2">{data.desc}</p>
        </div>

        {/* Live stats */}
        {issPos && dist !== null && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{dist.toLocaleString()}</p>
              <p className="text-xs text-gray-600">km from ISS</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{issPos.alt.toFixed(0)}</p>
              <p className="text-xs text-gray-600">ISS Altitude (km)</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">92</p>
              <p className="text-xs text-gray-600">mins per orbit</p>
            </div>
          </div>
        )}

        <ISSAlertSystem />

        {/* SEO content */}
        <div className="space-card p-6 mt-6">
          <h2 className="text-lg font-bold text-white mb-3">When to See the ISS from {data.name}?</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">
            The International Space Station (ISS) passes over {data.name} (lat {data.lat.toFixed(1)}°, lon {data.lng.toFixed(1)}°) several times each day.
            It is visible to the naked eye as a bright moving white dot in the sky, typically 30–45 minutes before sunrise or after sunset.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            Use SpaceHub's ISS Live system to know exactly when the ISS passes over {data.name} and get an alert in advance.
          </p>
        </div>

        {/* Other cities */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">More Cities</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CITY_DATA).filter(([slug]) => slug !== city).map(([slug, c]) => (
              <Link key={slug} to={`/iss/${slug}`} className="text-xs px-3 py-1.5 glass rounded-lg border border-white/5 text-gray-500 hover:text-indigo-400 hover:border-indigo-500/30 transition">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
