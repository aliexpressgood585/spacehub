import { useState, useEffect } from 'react'

interface TickItem { icon: string; text: string }

const STATIC: TickItem[] = [
  { icon: '🛸', text: 'ISS מקיפה את כדור הארץ כל 92 דקות' },
  { icon: '🌍', text: 'כדור הארץ נע במהירות 107,000 ק"מ/שעה סביב השמש' },
  { icon: '🌙', text: 'הירח מתרחק מכדור הארץ 3.8 ס"מ בכל שנה' },
  { icon: '⭐', text: 'הכוכב הקרוב ביותר — פרוקסימה קנטאורי — נמצא 4.24 שנות אור מאיתנו' },
  { icon: '🚀', text: 'SpaceX בצעה יותר מ-300 שיגורי Falcon 9 מוצלחים' },
  { icon: '☀️', text: 'אור השמש לוקח 8 דקות ו-20 שניות להגיע לכדור הארץ' },
  { icon: '🪐', text: 'שבתאי קל מספיק שהוא יצוף על גבי אוקיינוס מים' },
  { icon: '👨‍🚀', text: 'מאז 2000 תמיד יש בני אדם בחלל על ה-ISS' },
]

export default function LiveTicker() {
  const [issData, setIssData] = useState<string>('')

  useEffect(() => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => setIssData(`ISS: ${d.latitude.toFixed(2)}°N, ${d.longitude.toFixed(2)}°E — גובה ${d.altitude.toFixed(0)} ק"מ — ${(d.velocity / 3.6).toFixed(1)} ק"מ/שנ`))
      .catch(() => {})
  }, [])

  const items: TickItem[] = [
    ...(issData ? [{ icon: '📡', text: issData }] : []),
    ...STATIC,
  ]

  const doubled = [...items, ...items]

  return (
    <div className="bg-black/40 border-y border-white/[0.04] py-2 overflow-hidden">
      <div className="ticker-wrap">
        <div className="ticker-inner flex gap-12 items-center" style={{ width: 'max-content' }}>
          {doubled.map((item, i) => (
            <span key={i} className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
              <span>{item.icon}</span>
              <span>{item.text}</span>
              <span className="text-gray-800 mx-4">•</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
