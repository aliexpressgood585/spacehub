import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ISSAlertSystem from '../components/ISSAlertSystem'

const CITY_DATA: Record<string, { name: string; nameEn: string; lat: number; lng: number; desc: string }> = {
  'tel-aviv':    { name: 'תל אביב',    nameEn: 'Tel Aviv',    lat: 32.08, lng: 34.78, desc: 'מרכז ישראל — ISS עובר מעל תל אביב כ-4-5 פעמים ביום' },
  'jerusalem':   { name: 'ירושלים',    nameEn: 'Jerusalem',   lat: 31.77, lng: 35.21, desc: 'עיר הבירה — עקוב אחרי ISS מגגות העיר העתיקה' },
  'haifa':       { name: 'חיפה',       nameEn: 'Haifa',       lat: 32.79, lng: 34.99, desc: 'עיר הכרמל — נוף מרהיב לשמיים מהכרמל' },
  'beer-sheva':  { name: 'באר שבע',    nameEn: 'Be\'er Sheva', lat: 31.25, lng: 34.79, desc: 'שער הנגב — שמיים חשוכים ונוחים לצפייה' },
  'eilat':       { name: 'אילת',       nameEn: 'Eilat',       lat: 29.56, lng: 34.95, desc: 'ים סוף — אחת הנקודות הטובות ביותר לצפייה בישראל' },
  'new-york':    { name: 'ניו יורק',   nameEn: 'New York',    lat: 40.71, lng: -74.00, desc: 'עיר ניו יורק — ISS נראה אפילו מעל הסקייליין' },
  'london':      { name: 'לונדון',     nameEn: 'London',      lat: 51.51, lng: -0.13,  desc: 'לונדון — קו רוחב גבוה, העברות ארוכות יותר' },
  'paris':       { name: 'פריז',       nameEn: 'Paris',       lat: 48.86, lng: 2.35,   desc: 'פריז — ISS נראה לעיתים ממגדל אייפל' },
}

export default function CityPage() {
  const { city } = useParams<{ city: string }>()
  const data = city ? CITY_DATA[city] : null
  const [issPos, setIssPos] = useState<{ lat: number; lng: number; alt: number } | null>(null)

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
      <h2 className="text-2xl font-bold text-white mb-4">עיר לא נמצאה</h2>
      <Link to="/" className="text-indigo-400 hover:text-indigo-300">חזרה לעמוד הראשי</Link>
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
        <Link to="/" className="text-indigo-400 text-sm mb-8 hover:text-indigo-300 flex items-center gap-1">→ חזרה ל-SpaceHub</Link>

        <div className="text-center mb-10">
          <span className="section-label mb-4 inline-flex">🛸 ISS</span>
          <h1 className="text-4xl font-black text-white mt-3">
            ISS מעל <span className="gradient-text">{data.name}</span>
          </h1>
          <p className="text-gray-500 mt-2">{data.desc}</p>
        </div>

        {/* Live stats */}
        {issPos && dist !== null && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{dist.toLocaleString()}</p>
              <p className="text-xs text-gray-600">ק"מ מ-ISS</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{issPos.alt.toFixed(0)}</p>
              <p className="text-xs text-gray-600">גובה ISS (ק"מ)</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">92</p>
              <p className="text-xs text-gray-600">דקות להקפה</p>
            </div>
          </div>
        )}

        <ISSAlertSystem />

        {/* SEO content */}
        <div className="space-card p-6 mt-6">
          <h2 className="text-lg font-bold text-white mb-3">מתי לראות ISS מ{data.name}?</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">
            תחנת החלל הבינלאומית (ISS) עוברת מעל {data.name} (קו רוחב {data.lat.toFixed(1)}°, קו אורך {data.lng.toFixed(1)}°) מספר פעמים ביום.
            היא נראית לעין ערומה כנקודת אור לבנה נעה בשמיים, בדרך כלל 30-45 דקות לפני זריחה או אחרי שקיעה.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            השתמש במערכת ה-ISS Live של SpaceHub כדי לדעת בדיוק מתי ה-ISS עובר מעל {data.name} ולקבל התראה מראש.
          </p>
        </div>

        {/* Other cities */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">ערים נוספות</h3>
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
