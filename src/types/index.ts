export interface Satellite {
  norad_id: string
  name: string
  latitude: number
  longitude: number
  altitude: number
  velocity: number
  footprint: number
  next_rise: string
  next_set: string
  visibility: 'visible' | 'daylight' | 'eclipsed'
}

export interface SpaceWeatherData {
  solarWind: {
    speed: number
    density: number
  }
  magneticIndex: {
    kp: number
    ap: number
  }
  auroraAlert: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE'
  timestamp: string
}

export interface SpaceEvent {
  id: string
  date: string
  title: string
  description: string
  type: 'meteor' | 'eclipse' | 'launch' | 'conjunction'
  icon: string
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  date: string
  url?: string
  image?: string
}

export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
  preferences: {
    notifications: boolean
    language: 'he' | 'en'
    theme: 'dark' | 'light'
  }
}

export interface Subscription {
  userId: string
  satelliteId: string
  alertType: 'rise' | 'culmination' | 'set'
}
