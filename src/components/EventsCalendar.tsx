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
        date: 'June 22, 2026',
        title: 'Capillid Meteor Shower',
        description: 'Meteor shower with ~100 meteors per hour',
        icon: '☄️',
        type: 'meteor',
      },
      {
        date: 'September 2, 2026',
        title: 'Partial Solar Eclipse',
        description: 'Partial solar eclipse visible from parts of the world',
        icon: '🌑',
        type: 'eclipse',
      },
      {
        date: 'June 15, 2026',
        title: 'SpaceX Starship STS-5',
        description: 'SpaceX experimental mission launch',
        icon: '🚀',
        type: 'launch',
      },
      {
        date: 'June 28, 2026',
        title: 'Venus-Jupiter Conjunction',
        description: 'Two planets will appear close together in the sky',
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
        <h3 className="text-xl font-bold text-white mb-4">☄️ Meteor Shower — 3D Simulation</h3>
        <MeteorShower3D />
      </div>

    <div className="neon-border glass rounded-lg p-8">
      <h3 className="text-2xl font-bold text-white mb-6">🌠 Astronomical Events</h3>

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
          💡 Tip: Set up your telescope and wait for meteor showers on a clear night!
        </p>
      </div>
    </div>
    </>
  )
}
