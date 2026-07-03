import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

interface AIModel {
  id: string
  ownedBy: string
  category: string
  categoryLabel: string
  description: string
}

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: 'הכל', icon: '✨' },
  { key: 'llm', label: 'שיחה וטקסט', icon: '💬' },
  { key: 'vision-language', label: 'ראייה + שפה', icon: '🖼️' },
  { key: 'image', label: 'יצירת תמונות', icon: '🎨' },
  { key: 'speech', label: 'קול ודיבור', icon: '🎙️' },
  { key: 'embedding', label: 'חיפוש סמנטי', icon: '🔍' },
  { key: 'bio', label: 'ביולוגיה וכימיה', icon: '🧬' },
]

const CHATTABLE = new Set(['llm', 'vision-language'])

export default function AIModelsPage() {
  const [models, setModels] = useState<AIModel[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ai')
      .then(r => r.json())
      .then((d: { models: AIModel[]; error?: string }) => {
        if (d.error === 'missing_key') { setLoadError('מפתח ה-API של NVIDIA עדיין לא הוגדר בשרת.'); return }
        if (d.error) { setLoadError('לא הצלחנו לטעון את רשימת המודלים כרגע.'); return }
        setModels(d.models || [])
      })
      .catch(() => setLoadError('לא הצלחנו לטעון את רשימת המודלים כרגע.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return models.filter(m => {
      if (category !== 'all' && m.category !== category) return false
      if (query && !m.id.toLowerCase().includes(query.toLowerCase())) return false
      return true
    })
  }, [models, category, query])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of models) c[m.category] = (c[m.category] || 0) + 1
    return c
  }, [models])

  const toggleOpen = (id: string) => {
    setOpenId(prev => (prev === id ? null : id))
    setChatInput('')
    setChatReply('')
    setChatError(null)
  }

  const sendChat = async (model: string) => {
    if (!chatInput.trim() || chatBusy) return
    setChatBusy(true)
    setChatError(null)
    setChatReply('')
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, message: chatInput.trim() }),
      })
      const data = await r.json() as { reply?: string; error?: string }
      if (data.error === 'rate_limited') { setChatError('שלחת יותר מדי הודעות. המתן דקה ונסה שוב.'); return }
      if (data.error) { setChatError('מודל זה אינו זמין עם המפתח הנוכחי, נסה מודל אחר.'); return }
      setChatReply(data.reply || '')
    } catch {
      setChatError('שגיאת רשת - נסה שוב.')
    } finally {
      setChatBusy(false)
    }
  }

  return (
    <div dir="rtl" lang="he" style={{ background: '#020510', minHeight: '100vh' }}>
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '30%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        <div className="max-w-4xl mx-auto px-4 pt-8">
          <Link to="/" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors group">
            <span className="group-hover:translate-x-1 transition-transform">→</span>
            חזרה ל-SpaceHub
          </Link>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-widest"
              style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#6ee7b7' }}>
              🧠 מודלי AI חינמיים
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white mb-4 leading-tight tracking-tight">
              קטלוג מודלי הבינה המלאכותית של <span className="gradient-text">NVIDIA</span>
            </h1>
            <p className="text-gray-400 text-base max-w-xl mx-auto leading-relaxed">
              כאן מוצגים כל המודלים הזמינים דרך NVIDIA API, מה כל מודל יודע לעשות, ואיך אפשר לנסות אותו ישירות מהעמוד.
            </p>
          </div>

          {/* Search + filters */}
          <div className="mb-8 space-y-4">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חיפוש מודל לפי שם..."
              className="w-full px-4 py-3 rounded-2xl text-sm text-white placeholder-gray-600 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                  style={category === c.key
                    ? { background: 'rgba(52,211,153,0.2)', border: '1px solid rgba(52,211,153,0.45)', color: '#6ee7b7' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#9ca3af' }}
                >
                  <span>{c.icon}</span>
                  {c.label}
                  {c.key !== 'all' && counts[c.key] ? <span className="opacity-60">({counts[c.key]})</span> : null}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="text-center text-gray-500 text-sm py-16">טוען את רשימת המודלים...</div>
          )}

          {!loading && loadError && (
            <div className="space-card p-6 text-center text-sm text-gray-400">
              {loadError}
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-16">לא נמצאו מודלים תואמים לחיפוש.</div>
          )}

          {!loading && !loadError && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map(m => {
                const isOpen = openId === m.id
                const chattable = CHATTABLE.has(m.category)
                return (
                  <div key={m.id} className="space-card overflow-hidden">
                    <button
                      onClick={() => toggleOpen(m.id)}
                      className="w-full text-right p-5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-bold text-sm break-all">{m.id}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                            {m.categoryLabel}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">{m.description}</p>
                      </div>
                      <span className="text-gray-500 flex-shrink-0" style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.2s' }}>◀</span>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        {chattable ? (
                          <div className="pt-4 space-y-3">
                            <textarea
                              value={chatInput}
                              onChange={e => setChatInput(e.target.value)}
                              placeholder="כתוב כאן שאלה או בקשה למודל..."
                              rows={3}
                              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none resize-none"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                            />
                            <button
                              onClick={() => sendChat(m.id)}
                              disabled={chatBusy || !chatInput.trim()}
                              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                              style={{ background: 'rgba(52,211,153,0.2)', border: '1px solid rgba(52,211,153,0.4)', color: '#6ee7b7' }}
                            >
                              {chatBusy ? '⏳ שולח...' : '🚀 שלח למודל'}
                            </button>
                            {chatError && <p className="text-red-400 text-xs">{chatError}</p>}
                            {chatReply && (
                              <div className="p-4 rounded-xl text-sm text-gray-300 leading-relaxed whitespace-pre-wrap"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                {chatReply}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="pt-4">
                            <p className="text-gray-500 text-xs leading-relaxed">
                              מודל מסוג זה דורש שילוב ייעודי (מעבר לצ'אט טקסט פשוט) - לדוגמה שליחת קובץ שמע, תמונה או קבלת פלט שאינו טקסט.
                              אפשר לבקש מאיתנו להוסיף לו ממשק שימוש מלא בעמוד בהמשך.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
