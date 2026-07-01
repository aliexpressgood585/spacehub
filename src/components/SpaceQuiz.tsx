import { useState, useMemo } from 'react'

type Difficulty = 'easy' | 'medium' | 'hard'

const ALL_QUESTIONS: { q: string; opts: string[]; a: number; fact: string; d: Difficulty }[] = [
  { q: 'How many planets are in our Solar System?', opts: ['6', '7', '8', '9'], a: 2, fact: 'Pluto was reclassified as a dwarf planet in 2006, leaving us with 8 planets.', d: 'easy' },
  { q: 'What is the ISS?', opts: ['Spy satellite', 'International Space Station', 'Mars probe', 'Space telescope'], a: 1, fact: 'The ISS is the largest structure humans have ever placed in space — the size of a football field.', d: 'easy' },
  { q: 'Who was the first human in space?', opts: ['Neil Armstrong', 'Yuri Gagarin', 'Alan Shepard', 'John Glenn'], a: 1, fact: 'Yuri Gagarin orbited Earth on April 12, 1961, in a flight lasting 108 minutes.', d: 'easy' },
  { q: 'What does NASA stand for?', opts: ['North American Space Agency', 'National Aerospace Study Agency', 'National Aeronautics and Space Administration', 'New Astronautics and Science Administration'], a: 2, fact: 'NASA was established in 1958 and has sent humans to the Moon 6 times.', d: 'easy' },
  { q: 'What is the largest planet in our Solar System?', opts: ['Saturn', 'Uranus', 'Jupiter', 'Neptune'], a: 2, fact: 'Jupiter is so massive that all other planets could fit inside it — over 1,300 Earths would fit within Jupiter.', d: 'easy' },
  { q: 'Which planet is known as the Red Planet?', opts: ['Venus', 'Mars', 'Mercury', 'Jupiter'], a: 1, fact: "Mars gets its reddish colour from iron oxide (rust) on its surface. Temperatures there range from -125°C to 20°C.", d: 'easy' },
  { q: 'Who was the first person to walk on the Moon?', opts: ['Buzz Aldrin', 'Michael Collins', 'Neil Armstrong', 'Alan Shepard'], a: 2, fact: 'Neil Armstrong stepped onto the Moon on July 20, 1969, saying "That\'s one small step for man, one giant leap for mankind."', d: 'easy' },
  { q: 'How long does sunlight take to reach Earth?', opts: ['8 seconds', '8 minutes', '8 hours', '8 days'], a: 1, fact: 'Light travels at 300,000 km/s — covering 150 million km in just 8 minutes.', d: 'medium' },
  { q: 'Which planet has the most iconic ring system?', opts: ['Jupiter', 'Uranus', 'Saturn', 'Neptune'], a: 2, fact: "Saturn's rings are made of ice and rock, and are only about 10 metres thick despite being 282,000 km wide.", d: 'medium' },
  { q: 'How fast does the ISS travel?', opts: ['3 km/s', '7.7 km/s', '17 km/s', '50 km/s'], a: 1, fact: 'At 7.7 km/s, the ISS completes an orbit every 92 minutes — seeing 16 sunrises per day.', d: 'medium' },
  { q: 'How long does the ISS take to orbit Earth?', opts: ['45 minutes', '92 minutes', '3 hours', '24 hours'], a: 1, fact: 'The ISS orbits at ~408 km altitude, completing 15.5 orbits per day.', d: 'medium' },
  { q: 'What is the nearest star to us besides the Sun?', opts: ['Sirius', 'Alpha Centauri', 'Proxima Centauri', 'Vega'], a: 2, fact: 'Proxima Centauri is 4.24 light-years away — so close that light from it takes just 4 years to reach us.', d: 'medium' },
  { q: 'How many people have been to space?', opts: ['~100', '~300', '~600', '~1000'], a: 2, fact: 'As of 2026, approximately 600 people have reached space, with more going every year.', d: 'medium' },
  { q: 'What is a light-year?', opts: ['One year of sunlight', 'Distance light travels in a year', 'Time for light to reach the Moon', 'A unit of time'], a: 1, fact: 'One light-year is about 9.46 trillion kilometres — the distance light covers in a full year at 300,000 km/s.', d: 'medium' },
  { q: 'What keeps satellites in orbit around Earth?', opts: ['Rocket engines', 'Earth\'s magnetic field', 'Gravity balanced by orbital speed', 'Solar wind'], a: 2, fact: 'A satellite moves so fast horizontally (about 7.7 km/s for LEO) that as it falls, Earth curves away beneath it.', d: 'medium' },
  { q: 'How many moons does Mars have?', opts: ['0', '1', '2', '4'], a: 2, fact: "Mars has two moons — Phobos and Deimos — both tiny, irregularly shaped, and likely captured asteroids.", d: 'medium' },
  { q: 'What causes a solar eclipse?', opts: ['Earth passes between the Moon and Sun', 'The Moon passes between Earth and the Sun', 'Mars blocks the Sun', 'Earth\'s shadow falls on the Sun'], a: 1, fact: 'A total solar eclipse occurs when the Moon perfectly covers the Sun — a rare coincidence since the Moon is 400× smaller but 400× closer.', d: 'medium' },
  { q: 'What is the name of NASA\'s most famous space telescope?', opts: ['James Webb', 'Kepler', 'Hubble', 'Chandra'], a: 2, fact: 'The Hubble Space Telescope, launched in 1990, has captured images of galaxies 13 billion light-years away.', d: 'medium' },
  { q: 'Which planet spins on its side (98° axial tilt)?', opts: ['Neptune', 'Saturn', 'Venus', 'Uranus'], a: 3, fact: 'Uranus rotates at a 98° tilt — possibly knocked over by a giant impact early in the Solar System\'s history.', d: 'hard' },
  { q: 'What is the hottest planet in our Solar System?', opts: ['Mercury', 'Venus', 'Mars', 'Jupiter'], a: 1, fact: 'Venus reaches 465°C — hotter than Mercury despite being farther from the Sun — due to its thick CO₂ greenhouse atmosphere.', d: 'hard' },
  { q: 'What phenomenon causes black holes to slowly lose mass over time?', opts: ['Dark energy drain', 'Hawking Radiation', 'Neutron decay', 'Gravitational bleed'], a: 1, fact: 'Hawking Radiation, proposed by Stephen Hawking in 1974, predicts black holes emit thermal radiation due to quantum effects near the event horizon.', d: 'hard' },
  { q: 'What is the Chandrasekhar limit?', opts: ['The speed of a neutron star', 'The edge of the solar system', 'The maximum mass of a stable white dwarf (~1.4 solar masses)', 'The radius of a black hole'], a: 2, fact: 'The Chandrasekhar limit (~1.4 solar masses) is the maximum mass a white dwarf can have before collapsing into a neutron star or triggering a supernova.', d: 'hard' },
  { q: 'What boundary did Voyager 1 cross in August 2012, making it the first human-made object in interstellar space?', opts: ['The asteroid belt', 'The Kuiper Belt', 'The heliopause', 'The Oort Cloud'], a: 2, fact: "The heliopause is where the Sun's solar wind is stopped by the interstellar medium. Voyager 1, launched in 1977, reached it after 35 years of travel.", d: 'hard' },
  { q: 'What is the approximate age of the observable universe?', opts: ['4.5 billion years', '9.2 billion years', '13.8 billion years', '26 billion years'], a: 2, fact: 'The universe is approximately 13.8 billion years old, determined by measuring the cosmic microwave background radiation and the Hubble constant.', d: 'hard' },
]

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const QUESTION_COUNT = 10

const DIFF_CONFIG: Record<'all' | Difficulty, { label: string; emoji: string; color: string; border: string; bg: string }> = {
  all:    { label: 'All',    emoji: '🌌', color: '#c4b5fd', border: 'rgba(99,102,241,0.5)',  bg: 'rgba(99,102,241,0.15)' },
  easy:   { label: 'Easy',   emoji: '🟢', color: '#4ade80', border: 'rgba(74,222,128,0.5)',  bg: 'rgba(74,222,128,0.1)'  },
  medium: { label: 'Medium', emoji: '🟡', color: '#fbbf24', border: 'rgba(251,191,36,0.5)',  bg: 'rgba(251,191,36,0.1)'  },
  hard:   { label: 'Hard',   emoji: '🔴', color: '#f87171', border: 'rgba(248,113,113,0.5)', bg: 'rgba(248,113,113,0.1)' },
}

const GRADE = (pct: number) =>
  pct >= 90 ? { emoji: '🏆', title: 'Space Expert!', color: '#fbbf24' }
  : pct >= 70 ? { emoji: '🚀', title: 'Astronaut Material!', color: '#818cf8' }
  : pct >= 50 ? { emoji: '🌙', title: 'Space Enthusiast', color: '#60a5fa' }
  : { emoji: '🌱', title: 'Keep Exploring!', color: '#4ade80' }

export default function SpaceQuiz() {
  const [key, setKey] = useState(0)
  const [difficulty, setDifficulty] = useState<'all' | Difficulty>('all')
  const QUESTIONS = useMemo(() => {
    const pool = difficulty === 'all' ? ALL_QUESTIONS : ALL_QUESTIONS.filter(q => q.d === difficulty)
    return shuffle(pool).slice(0, QUESTION_COUNT)
  }, [key, difficulty]) // eslint-disable-line react-hooks/exhaustive-deps
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [answers, setAnswers] = useState<boolean[]>([])
  const [showFact, setShowFact] = useState(false)

  const q = QUESTIONS[current]
  const pct = Math.round(score / QUESTIONS.length * 100)
  const grade = GRADE(pct)

  const choose = (i: number) => {
    if (selected !== null) return
    setSelected(i)
    const correct = i === q.a
    if (correct) setScore(s => s + 1)
    setAnswers(prev => [...prev, correct])
    setShowFact(true)
    setTimeout(() => {
      setShowFact(false)
      if (current + 1 >= QUESTIONS.length) setDone(true)
      else { setCurrent(c => c + 1); setSelected(null) }
    }, 1800)
  }

  const restart = () => {
    setCurrent(0); setSelected(null); setScore(0)
    setDone(false); setAnswers([]); setShowFact(false)
    setKey(k => k + 1)
  }

  const changeDifficulty = (d: 'all' | Difficulty) => {
    setDifficulty(d)
    setCurrent(0); setSelected(null); setScore(0)
    setDone(false); setAnswers([]); setShowFact(false)
    setKey(k => k + 1)
  }

  if (done) return (
    <div className="space-card p-8 text-center">
      {/* Score circle */}
      <div className="relative inline-flex items-center justify-center mb-6">
        <svg width="120" height="120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="url(#quizGrad)" strokeWidth="8"
            strokeLinecap="round" strokeDasharray={2 * Math.PI * 52}
            strokeDashoffset={2 * Math.PI * 52 * (1 - pct / 100)}
            transform="rotate(-90 60 60)" />
          <defs>
            <linearGradient id="quizGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute text-center">
          <div className="text-3xl">{grade.emoji}</div>
          <div className="text-xl font-black text-white">{pct}%</div>
        </div>
      </div>

      <h3 className="text-2xl font-black text-white mb-2" style={{ color: grade.color }}>{grade.title}</h3>
      <p className="text-gray-400 text-sm mb-6">
        You got <span className="text-white font-bold">{score}</span> out of <span className="text-white font-bold">{QUESTIONS.length}</span> correct
      </p>

      {/* Answer dots */}
      <div className="flex gap-1.5 justify-center mb-8">
        {answers.map((correct, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full"
            style={{ background: correct ? '#4ade80' : '#ef4444', boxShadow: correct ? '0 0 8px rgba(74,222,128,0.5)' : '0 0 8px rgba(239,68,68,0.4)' }}
            title={`Q${i + 1}: ${correct ? 'Correct' : 'Wrong'}`}
          />
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={restart} className="btn-shimmer px-7 py-3 text-sm">
          🔄 Try Again
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`I scored ${score}/${QUESTIONS.length} (${pct}%) on the SpaceHub Space Quiz! 🚀 https://spacehubapp.com`)}`}
          target="_blank" rel="noopener noreferrer"
          className="btn-ghost px-7 py-3 text-sm"
        >
          📲 Share
        </a>
      </div>
    </div>
  )

  return (
    <div className="space-card overflow-hidden">
      {/* Progress bar */}
      <div className="h-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(current / QUESTIONS.length) * 100}%`,
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)',
          }}
        />
      </div>

      <div className="p-7">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="icon-box">🧠</div>
            <div>
              <h3 className="text-white font-bold text-base">Space Quiz</h3>
              <p className="text-gray-600 text-xs">Question {current + 1} of {QUESTIONS.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-green-400 font-bold text-sm">{score}</div>
            <div className="text-gray-600 text-xs">correct</div>
          </div>
        </div>

        {/* Difficulty filter */}
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {(Object.keys(DIFF_CONFIG) as ('all' | Difficulty)[]).map(d => {
            const cfg = DIFF_CONFIG[d]
            const active = difficulty === d
            return (
              <button
                key={d}
                onClick={() => changeDifficulty(d)}
                className="text-[10px] px-3 py-1 rounded-lg font-semibold transition-all"
                style={active
                  ? { background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
              >
                {cfg.emoji} {cfg.label}
              </button>
            )
          })}
        </div>

        {/* Question dots */}
        <div className="flex gap-1 mb-6">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1 rounded-full transition-all"
              style={{
                background: i < current
                  ? answers[i] ? '#4ade80' : '#ef4444'
                  : i === current
                  ? 'rgba(99,102,241,0.6)'
                  : 'rgba(255,255,255,0.06)',
              }}
            />
          ))}
        </div>

        {/* Question */}
        <p className="text-white text-lg font-bold mb-6 leading-snug">{q.q}</p>

        {/* Options */}
        <div className="space-y-2.5 mb-4">
          {q.opts.map((opt, i) => {
            const isCorrect = i === q.a
            const isSelected = i === selected
            let bg = 'rgba(255,255,255,0.02)'
            let border = 'rgba(255,255,255,0.07)'
            let color = '#9ca3af'
            let shadow = 'none'
            if (selected !== null) {
              if (isCorrect) {
                bg = 'rgba(74,222,128,0.08)'; border = 'rgba(74,222,128,0.45)'; color = '#4ade80'
                shadow = '0 0 20px rgba(74,222,128,0.15)'
              } else if (isSelected) {
                bg = 'rgba(239,68,68,0.08)'; border = 'rgba(239,68,68,0.45)'; color = '#f87171'
              } else {
                bg = 'rgba(255,255,255,0.01)'; border = 'rgba(255,255,255,0.04)'; color = '#4b5563'
              }
            }
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={selected !== null}
                className="w-full text-left px-5 py-3.5 rounded-2xl text-sm font-medium transition-all duration-200 disabled:cursor-default"
                style={{ background: bg, border: `1px solid ${border}`, color, boxShadow: shadow }}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'inherit' }}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                  {selected !== null && isCorrect && <span className="ml-auto">✓</span>}
                  {selected !== null && isSelected && !isCorrect && <span className="ml-auto">✗</span>}
                </span>
              </button>
            )
          })}
        </div>

        {/* Fun fact */}
        {showFact && (
          <div
            className="mt-4 p-4 rounded-2xl text-sm leading-relaxed animate-fade-up"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }}
          >
            💡 <strong style={{ color: '#c4b5fd' }}>Did you know?</strong> {q.fact}
          </div>
        )}
      </div>
    </div>
  )
}
