import { useState } from 'react'

const QUESTIONS = [
  { q: 'כמה זמן לוקח לאור מהשמש להגיע לכדור הארץ?', opts: ['8 שניות', '8 דקות', '8 שעות', '8 ימים'], a: 1 },
  { q: 'כמה כוכבי לכת יש במערכת השמש?', opts: ['6', '7', '8', '9'], a: 2 },
  { q: 'מהי תחנת ISS?', opts: ['לוויין ריגול', 'תחנת חלל בינלאומית', 'גשושית מאדים', 'טלסקופ חלל'], a: 1 },
  { q: 'איזה כוכב לכת יש לו הטבעות היפות ביותר?', opts: ['צדק', 'אורנוס', 'שבתאי', 'נפטון'], a: 2 },
  { q: 'מה המהירות של ISS?', opts: ['7 ק"מ/שנ', '17 ק"מ/שנ', '28 ק"מ/שנ', '50 ק"מ/שנ'], a: 2 },
  { q: 'מי היה האדם הראשון בחלל?', opts: ['ניל ארמסטרונג', 'יורי גגארין', 'אלן שפרד', 'ג׳ון גלן'], a: 1 },
  { q: 'כמה זמן לוקח ל-ISS להקיף את כדור הארץ?', opts: ['45 דקות', '92 דקות', '3 שעות', '24 שעות'], a: 1 },
  { q: 'מה הכוכב הקרוב ביותר אלינו (אחרי השמש)?', opts: ['סיריוס', 'אלפא קנטאורי', 'פרוקסימה קנטאורי', 'וגה'], a: 2 },
  { q: 'כמה אנשים חיו בחלל עד היום (בערך)?', opts: ['100', '250', '600', '1000'], a: 2 },
  { q: 'מה NASA?', opts: ['סוכנות חלל אירופאית', 'סוכנות חלל ישראלית', 'סוכנות החלל האמריקאית', 'חברת חלל פרטית'], a: 2 },
]

export default function SpaceQuiz() {
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [answers, setAnswers] = useState<boolean[]>([])

  const q = QUESTIONS[current]

  const choose = (i: number) => {
    if (selected !== null) return
    setSelected(i)
    const correct = i === q.a
    if (correct) setScore(s => s + 1)
    setAnswers(a => [...a, correct])
    setTimeout(() => {
      if (current + 1 >= QUESTIONS.length) setDone(true)
      else { setCurrent(c => c + 1); setSelected(null) }
    }, 900)
  }

  const restart = () => { setCurrent(0); setSelected(null); setScore(0); setDone(false); setAnswers([]) }

  const pct = Math.round(score / QUESTIONS.length * 100)
  const grade = pct >= 90 ? '🏆 מומחה חלל!' : pct >= 70 ? '🚀 אסטרונאוט!' : pct >= 50 ? '🌙 חובב חלל' : '👶 מתחיל'

  if (done) return (
    <div className="space-card p-6 text-center">
      <div className="text-5xl mb-4">{grade.split(' ')[0]}</div>
      <h3 className="text-xl font-bold text-white mb-1">{grade.split(' ').slice(1).join(' ')}</h3>
      <p className="text-gray-400 mb-6">ענית נכון על {score} מתוך {QUESTIONS.length} שאלות</p>

      <div className="relative h-3 bg-white/5 rounded-full mb-6 overflow-hidden">
        <div className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-indigo-500 to-purple-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-10 gap-1 mb-6">
        {answers.map((a, i) => (
          <div key={i} className={`h-2 rounded-full ${a ? 'bg-green-500' : 'bg-red-500/60'}`} />
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={restart} className="btn-shimmer px-6 py-2.5 text-sm">נסה שוב</button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`ענيתי על ${score}/${QUESTIONS.length} שאלות בקוויז החלל של SpaceHub! 🚀 https://spacehub-nu.vercel.app`)}`}
          target="_blank" rel="noopener noreferrer"
          className="px-6 py-2.5 text-sm border border-white/10 text-gray-400 hover:text-white rounded-xl transition bg-white/[0.03]"
        >
          📲 שתף תוצאה
        </a>
      </div>
    </div>
  )

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🧠</span>
        <div>
          <h3 className="text-white font-bold text-lg">קוויז חלל</h3>
          <p className="text-gray-500 text-xs">שאלה {current + 1} מתוך {QUESTIONS.length}</p>
        </div>
        <div className="ml-auto text-sm font-bold text-indigo-300">{score} ✓</div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-white/5 rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{ width: `${(current / QUESTIONS.length) * 100}%` }} />
      </div>

      <p className="text-white text-base font-semibold mb-4 leading-snug">{q.q}</p>

      <div className="space-y-2">
        {q.opts.map((opt, i) => {
          let cls = 'border-white/8 text-gray-300 hover:border-indigo-500/40 hover:bg-white/[0.04]'
          if (selected !== null) {
            if (i === q.a) cls = 'border-green-500/60 bg-green-900/20 text-green-300'
            else if (i === selected && i !== q.a) cls = 'border-red-500/60 bg-red-900/20 text-red-300'
            else cls = 'border-white/5 text-gray-600'
          }
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={selected !== null}
              className={`w-full text-right px-4 py-3 rounded-xl border text-sm transition ${cls} disabled:cursor-default`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
