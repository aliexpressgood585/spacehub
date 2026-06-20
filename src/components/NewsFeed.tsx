import { useState, useEffect } from 'react'

interface NewsItem {
  date: string
  title: string
  summary: string
  source: string
  icon: string
}

export default function NewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([])

  useEffect(() => {
    const mockNews: NewsItem[] = [
      {
        date: '20 יוני 2026',
        title: 'טלסקופ וויב מגלה כוכב לכת חדש',
        summary: 'טלסקופ ג\'יימס וויב גילה כוכב לכת טרא-ארצי חדש באזור הגן עדן של הכוכב שלו.',
        source: 'NASA',
        icon: '🔭',
      },
      {
        date: '19 יוני 2026',
        title: 'SpaceX משגרת 60 לוויינים Starlink נוספים',
        summary: 'SpaceX השגירה 60 לוויינים נוספים של Starlink, הקרובים לשלמות הרשת.',
        source: 'SpaceX',
        icon: '🛰️',
      },
      {
        date: '18 יוני 2026',
        title: 'ISS מתקבלת קצין חדש',
        summary: 'תחנת החלל הבינלאומית קיבלה קצין חלל חדש במשימה Soyuz MS-27.',
        source: 'Roscosmos',
        icon: '👨‍🚀',
      },
      {
        date: '17 יוני 2026',
        title: 'גילוי של גל כבידה חדש',
        summary: 'מרכז LIGO גילה גל כבידה חדש מהתנגשות של שני כוכבי ניוטרון.',
        source: 'LIGO',
        icon: '📡',
      },
    ]
    setNews(mockNews)
  }, [])

  return (
    <div className="space-y-4">
      {news.map((item, idx) => (
        <div key={idx} className="neon-border glass rounded-lg p-6 hover:border-indigo-500 transition">
          <div className="flex items-start gap-4">
            <div className="text-3xl">{item.icon}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-white text-lg">{item.title}</h4>
                <div className="flex gap-2 text-xs">
                  <span className="px-3 py-1 bg-indigo-500 bg-opacity-20 text-indigo-400 rounded">
                    {item.source}
                  </span>
                  <span className="px-3 py-1 bg-space-700 text-gray-400 rounded">
                    {item.date}
                  </span>
                </div>
              </div>
              <p className="text-gray-300">{item.summary}</p>
            </div>
          </div>
        </div>
      ))}

      <div className="mt-8 text-center">
        <button className="px-6 py-3 border border-indigo-500 text-indigo-400 hover:bg-indigo-500 hover:bg-opacity-10 rounded-lg font-medium transition">
          עוד חדשות
        </button>
      </div>
    </div>
  )
}
