// Space Agencies & Data Sources
export const DATA_SOURCES = {
  NASA: 'https://api.nasa.gov',
  NOAA: 'https://www.swpc.noaa.gov/products/json',
  N2YO: 'https://api.n2yo.com/rest/v1/satellite',
  ESA: 'https://api.esa.int',
} as const

// Common Satellites
export const POPULAR_SATELLITES = [
  { id: '25544', name: 'ISS (ZARYA)', type: 'Space Station' },
  { id: '20580', name: 'Hubble Space Telescope', type: 'Observatory' },
  { id: '39444', name: 'JAMES WEBB SPACE TELESCOPE', type: 'Observatory' },
  { id: '28654', name: 'NOAA 18', type: 'Weather Satellite' },
  { id: '29499', name: 'NOAA 19', type: 'Weather Satellite' },
  { id: '39083', name: 'CERES', type: 'Earth Observer' },
] as const

// Hebrew Translations
export const TRANSLATIONS = {
  TRACKING: 'עקיבה',
  WEATHER: 'מזג אוויר',
  EVENTS: 'אירועים',
  NEWS: 'חדשות',
  SATELLITES: 'לוויינים',
  SPACE_WEATHER: 'מזג אוויר חלל',
  AURORA: 'זוהר',
  SOLAR_STORM: 'סערת שמש',
  METEOR_SHOWER: 'מטאור shower',
  ECLIPSE: 'ליקוי',
} as const

// Units
export const UNITS = {
  DISTANCE: 'km',
  VELOCITY: 'km/s',
  TIME: 'UTC',
  TEMPERATURE: '°C',
} as const

// API Keys (from environment)
export const API_CONFIG = {
  mongodbUri: import.meta.env.VITE_MONGODB_URI,
  n2yoKey: import.meta.env.VITE_N2YO_API_KEY,
  nasaKey: import.meta.env.VITE_NASA_API_KEY,
  updateInterval: 10000, // 10 seconds
} as const
