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

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  }, [lang])

  const t = (key: string) =>
    translations[lang][key] ?? translations['en'][key] ?? key

  return (
    <Ctx.Provider value={{ lang, setLang, t, dir: lang === 'he' ? 'rtl' : 'ltr' }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLang = () => useContext(Ctx)
