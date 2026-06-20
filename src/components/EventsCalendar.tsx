import { useState, useEffect } from 'react'
import MeteorShower3D from './MeteorShower3D'

interface Event {
  date: string
  title: string
  description: string
  icon: string
  type: 'meteor' | 'eclipse' | 'launch' | 'conjunction'
}

export default function EventsCalendar() {
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    const mockEvents: Event[] = [
      {
        date: '22 יוני 2026',
        title: 'מטאור קפלי',
        description: 'מטאור shower עם ~100 מטאורים בשעה',
        icon: '☄️',
        type: 'meteor',
      },
      {
        date: '2 ספטמבר 2026',
        title: 'ליקוי חמה חלקי',
        description: 'ליקוי חמה חלקי נראה בחלקים של בעולם',
        icon: '🌑',
        type: 'eclipse',
      },
      {
        date: '15 יוני 2026',
        title: 'SpaceX Starship STS-5',
        description: 'שיגור משימת ניסיון SpaceX',
        icon: '🚀',
        type: 'launch',
      },
      {
        date: '28 יוני 2026',
        title: 'צפיפות ונוס-יופיטר',
        description: 'שני כוכבי הלכת יהיו קרובים בשמיים',
        icon: '⭐',
        type: 'conjunction',
      },
    ]
    setEvents(mockEvents)
  }, [])

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'meteor':
        return 'border-blue-500'
      case 'eclipse':
        return 'border-red-500'
      case 'launch':
        return 'border-green-500'
      case 'conjunction':
        return 'border-purple-500'
      default:
        return 'border-space-700'
    }
  }

  return (
    <>
      {/* Meteor Shower 3D */}
      <div className="neon-border glass rounded-lg p-6 mb-6">
        <h3 className="text-xl font-bold text-white mb-4">☄️ גשם מטאורים — הדמיה תלת מימד</h3>
        <MeteorShower3D />
      </div>

    <div className="neon-border glass rounded-lg p-8">
      <h3 className="text-2xl font-bold text-white mb-6">🌠 אירועים אסטרונומיים</h3>

      <div className="space-y-4">
        {events.map((event, idx) => (
          <div key={idx} className={`border-l-4 ${getTypeColor(event.type)} rounded-lg p-6 glass`}>
            <div className="flex items-start gap-4">
              <div className="text-4xl">{event.icon}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-white text-lg">{event.title}</h4>
                  <span className="text-sm text-gray-400">{event.date}</span>
                </div>
                <p className="text-gray-300">{event.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 bg-space-900 rounded-lg border border-space-700">
        <p className="text-gray-400">
          💡 עצה: הורד את הטלסקופ שלך וחכה ל-meteor showers בליל צלול!
        </p>
      </div>
    </div>
    </>
  )
}
