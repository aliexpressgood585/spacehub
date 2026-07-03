import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface ISSPos {
  latitude: number
  longitude: number
  altitude: number
  velocity: number
  timestamp: number
}

interface ISSCtxValue {
  iss: ISSPos | null
  astros: number | null
  liveOk: boolean
}

const ISSCtx = createContext<ISSCtxValue>({ iss: null, astros: null, liveOk: false })

export function ISSProvider({ children }: { children: ReactNode }) {
  const [iss, setIss] = useState<ISSPos | null>(null)
  const [astros, setAstros] = useState<number | null>(null)
  const [liveOk, setLiveOk] = useState(false)

  useEffect(() => {
    const poll = () =>
      fetch('/api/iss')
        .then(r => r.ok ? r.json() as Promise<ISSPos> : Promise.reject())
        .then(d => { setIss(d); setLiveOk(true) })
        .catch(() => setLiveOk(false))
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch('/api/space-extra?type=astros')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { number: number }) => setAstros(d.number))
      .catch(() => {})
  }, [])

  return <ISSCtx.Provider value={{ iss, astros, liveOk }}>{children}</ISSCtx.Provider>
}

export const useISS = () => useContext(ISSCtx)
