import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
})

// Satellite APIs
export const getSatellitePosition = async (satId: string) => {
  try {
    const response = await api.get(`/satellites/${satId}`)
    return response.data
  } catch (error) {
    console.error('Error fetching satellite position:', error)
    return null
  }
}

// Space Weather
export const getSpaceWeather = async () => {
  try {
    const response = await api.get('/space-weather')
    return response.data
  } catch (error) {
    console.error('Error fetching space weather:', error)
    return null
  }
}

// Events
export const getSpaceEvents = async () => {
  try {
    const response = await api.get('/events')
    return response.data
  } catch (error) {
    console.error('Error fetching space events:', error)
    return []
  }
}

// News
export const getSpaceNews = async () => {
  try {
    const response = await api.get('/news')
    return response.data
  } catch (error) {
    console.error('Error fetching space news:', error)
    return []
  }
}

export default api
