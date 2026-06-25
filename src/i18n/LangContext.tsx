import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { translations, type Lang } from './translations'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
  dir: 'ltr' | 'rtl'
}

const Ctx = createContext<LangCtx>({
  lang: 'en', setLang: () => {}, t: k => k, dir: 'ltr',
})

const SUPPORTED: Lang[] = ['en', 'he', 'es', 'fr', 'de', 'ar']

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem('spacehub_lang') as Lang | null
    if (stored && SUPPORTED.includes(stored)) return stored
  } catch {}
  try {
    const nav = navigator.language.slice(0, 2).toLowerCase()
    return (SUPPORTED.includes(nav as Lang) ? nav : 'en') as Lang
  } catch {}
  return 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = (l: Lang) => {
    try { localStorage.setItem('spacehub_lang', l) } catch {}
    setLangState(l)
  }

  const isRtl = lang === 'he' || lang === 'ar'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
  }, [lang, isRtl])

  const t = (key: string) =>
    translations[lang][key] ?? translations['en'][key] ?? key

  return (
    <Ctx.Provider value={{ lang, setLang, t, dir: isRtl ? 'rtl' : 'ltr' }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLang = () => useContext(Ctx)
