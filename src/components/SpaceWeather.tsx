import { useState, useEffect } from 'react'

interface WeatherData {
  label: string
  value: string
  icon: string
  level: 'low' | 'moderate' | 'high' | 'severe'
}

export default function SpaceWeather() {
  const [weather, setWeather] = useState<WeatherData[]>([])

  useEffect(() => {
    const mockWeather: WeatherData[] = [
      {
        label: 'סערת שמש',
        value: 'מתונה',
        icon: '☀️',
        level: 'moderate',
      },
      {
        label: 'קרינה קוסמית',
        value: 'נמוכה',
        icon: '☢️',
        level: 'low',
      },
      {
        label: 'זוהרים אורוראליים',
        value: 'צפויים הלילה',
        icon: '🌌',
        level: 'high',
      },
      {
        label: 'שדה מגנטי',
        value: 'יציב',
        icon: '🧲',
        level: 'low',
      },
    ]
    setWeather(mockWeather)
  }, [])

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'bg-green-500 bg-opacity-20 border-green-500'
      case 'moderate':
        return 'bg-yellow-500 bg-opacity-20 border-yellow-500'
      case 'high':
        return 'bg-orange-500 bg-opacity-20 border-orange-500'
      case 'severe':
        return 'bg-red-500 bg-opacity-20 border-red-500'
      default:
        return 'bg-space-700 border-space-700'
    }
  }

  return (
    <div className="space-y-6">
      <div className="neon-border glass rounded-lg p-8">
        <h3 className="text-2xl font-bold text-white mb-6">⛈️ מזג אוויר חלל</h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {weather.map((item, idx) => (
            <div key={idx} className={`rounded-lg p-6 border ${getLevelColor(item.level)}`}>
              <div className="flex items-start gap-4">
                <div className="text-4xl">{item.icon}</div>
                <div className="flex-1">
                  <h4 className="font-bold text-white text-lg mb-2">{item.label}</h4>
                  <p className="text-gray-300">{item.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="neon-border glass rounded-lg p-8">
        <h4 className="text-xl font-bold text-white mb-4">📊 ניתוח מפורט</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">רמת סערה מגנטית</span>
            <div className="w-32 h-2 bg-space-700 rounded-full overflow-hidden">
              <div className="w-1/3 h-full bg-indigo-500 rounded-full"></div>
            </div>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">קרינה קוסמית</span>
            <div className="w-32 h-2 bg-space-700 rounded-full overflow-hidden">
              <div className="w-1/12 h-full bg-green-500 rounded-full"></div>
            </div>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">סיכוי לזוהרים</span>
            <div className="w-32 h-2 bg-space-700 rounded-full overflow-hidden">
              <div className="w-2/3 h-full bg-indigo-400 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
