import { useState } from 'react'

const QUESTIONS = [
  { q: 'How long does sunlight take to reach Earth?', opts: ['8 seconds', '8 minutes', '8 hours', '8 days'], a: 1 },
  { q: 'How many planets are in our Solar System?', opts: ['6', '7', '8', '9'], a: 2 },
  { q: 'What is the ISS?', opts: ['Spy satellite', 'International Space Station', 'Mars probe', 'Space telescope'], a: 1 },
  { q: 'Which planet has the most beautiful rings?', opts: ['Jupiter', 'Uranus', 'Saturn', 'Neptune'], a: 2 },
  { q: 'How fast does the ISS travel?', opts: ['7 km/s', '17 km/s', '7.7 km/s', '50 km/s'], a: 2 },
  { q: 'Who was the first human in space?', opts: ['Neil Armstrong', 'Yuri Gagarin', 'Alan Shepard', 'John Glenn'], a: 1 },
  { q: 'How long does the ISS take to orbit Earth?', opts: ['45 minutes', '92 minutes', '3 hours', '24 hours'], a: 1 },
  { q: 'What is the nearest star to us (besides the Sun)?', opts: ['Sirius', 'Alpha Centauri', 'Proxima Centauri', 'Vega'], a: 2 },
  { q: 'Approximately how many people have been to space?', opts: ['100', '250', '600', '1000'], a: 2 },
  { q: 'What does NASA stand for?', opts: ['European Space Agency', 'National Aerospace Study Agency', 'National Aeronautics and Space Administration', 'Private space company'], a: 2 },
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
  const grade = pct >= 90 ? '🏆 Space Expert!' : pct >= 70 ? '🚀 Astronaut!' : pct >= 50 ? '🌙 Space Fan' : '👶 Beginner'

  if (done) return (
    <div className="space-card p-6 text-center">
      <div className="text-5xl mb-4">{grade.split(' ')[0]}</div>
      <h3 className="text-xl font-bold text-white mb-1">{grade.split(' ').slice(1).join(' ')}</h3>
      <p className="text-gray-400 mb-6">You answered {score} out of {QUESTIONS.length} questions correctly</p>

      <div className="relative h-3 bg-white/5 rounded-full mb-6 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-10 gap-1 mb-6">
        {answers.map((a, i) => (
          <div key={i} className={`h-2 rounded-full ${a ? 'bg-green-500' : 'bg-red-500/60'}`} />
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={restart} className="btn-shimmer px-6 py-2.5 text-sm">Try Again</button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`I scored ${score}/${QUESTIONS.length} on the SpaceHub Space Quiz! 🚀 https://spacehub-nu.vercel.app`)}`}
          target="_blank" rel="noopener noreferrer"
          className="px-6 py-2.5 text-sm border border-white/10 text-gray-400 hover:text-white rounded-xl transition bg-white/[0.03]"
        >
          📲 Share Result
        </a>
      </div>
    </div>
  )

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🧠</span>
        <div>
          <h3 className="text-white font-bold text-lg">Space Quiz</h3>
          <p className="text-gray-500 text-xs">Question {current + 1} of {QUESTIONS.length}</p>
        </div>
        <div className="ml-auto text-sm font-bold text-indigo-300">{score} ✓</div>
      </div>

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
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition ${cls} disabled:cursor-default`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
