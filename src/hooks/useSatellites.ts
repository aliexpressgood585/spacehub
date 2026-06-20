import { useState, useEffect, useCallback } from 'react'

interface Satellite {
  id: string
  name: string
  latitude: number
  longitude: number
  altitude: number
  velocity: number
}

export const useSatellites = () => {
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSatellites = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Mock data for now - replace with real N2YO API call
      const mockData: Satellite[] = [
        { id: '25544', name: 'ISS', latitude: 34.5, longitude: 35.2, altitude: 408, velocity: 7.66 },
        { id: '20580', name: 'HUBBLE', latitude: 12.3, longitude: 45.6, altitude: 593, velocity: 7.55 },
      ]
      setSatellites(mockData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSatellites()
    const interval = setInterval(fetchSatellites, 10000) // Update every 10 seconds
    return () => clearInterval(interval)
  }, [fetchSatellites])

  return { satellites, loading, error, refetch: fetchSatellites }
}

export const useSpaceWeather = () => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    // Mock data
    const mockWeather = {
      solarWind: { speed: 450, density: 5.2 },
      magneticIndex: { kp: 3, ap: 15 },
      auroraAlert: 'LOW',
    }
    setData(mockWeather)
    setLoading(false)
  }, [])

  return { data, loading }
}
