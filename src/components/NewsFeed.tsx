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
        date: 'June 20, 2026',
        title: 'James Webb Telescope Discovers New Exoplanet',
        summary: 'The James Webb Space Telescope has discovered a new terrestrial exoplanet in its star\'s habitable zone.',
        source: 'NASA',
        icon: '🔭',
      },
      {
        date: 'June 19, 2026',
        title: 'SpaceX Launches 60 More Starlink Satellites',
        summary: 'SpaceX launched 60 additional Starlink satellites, bringing the network closer to completion.',
        source: 'SpaceX',
        icon: '🛰️',
      },
      {
        date: 'June 18, 2026',
        title: 'ISS Welcomes New Crew Member',
        summary: 'The International Space Station received a new crew member on the Soyuz MS-27 mission.',
        source: 'Roscosmos',
        icon: '👨‍🚀',
      },
      {
        date: 'June 17, 2026',
        title: 'New Gravitational Wave Detected',
        summary: 'LIGO has detected a new gravitational wave from the collision of two neutron stars.',
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
          More News
        </button>
      </div>
    </div>
  )
}
