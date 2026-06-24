import { useState, useRef, useEffect } from 'react'

interface Sound {
  id: string
  title: string
  source: string
  duration: string
  category: 'planet' | 'star' | 'nebula' | 'mission' | 'cosmic'
  description: string
  url: string
  icon: string
  credit: string
  year: number
}

const SOUNDS: Sound[] = [
  {
    id: 'saturn-radio',
    title: 'Saturn Radio Emissions',
    source: 'Cassini–Huygens (NASA)',
    duration: '0:73',
    category: 'planet',
    description: 'Saturn\'s rotating magnetic field generates intense radio waves. Cassini captured these emissions — sped up 44× to bring into the audible range — revealing a haunting, rhythmic pulse.',
    url: 'https://www.nasa.gov/wp-content/uploads/2018/06/saturn_radio_cassini_short.mp3',
    icon: '🪐',
    credit: 'NASA/JPL-Caltech',
    year: 2004,
  },
  {
    id: 'jupiter-lightning',
    title: 'Jupiter\'s Lightning',
    source: 'Juno (NASA)',
    duration: '0:22',
    category: 'planet',
    description: 'NASA\'s Juno spacecraft recorded electromagnetic signatures of lightning in Jupiter\'s upper atmosphere, then converted them into audio. Lightning on Jupiter occurs near the poles, unlike Earth.',
    url: 'https://www.nasa.gov/wp-content/uploads/2018/06/jupiter_lightning_juno_short.mp3',
    icon: '⚡',
    credit: 'NASA/JPL-Caltech/SwRI/Univ. of Iowa',
    year: 2018,
  },
  {
    id: 'earth-chorus',
    title: 'Earth\'s Chorus',
    source: 'Van Allen Probes (NASA)',
    duration: '0:31',
    category: 'planet',
    description: 'Radio waves emitted by electrons in Earth\'s Van Allen radiation belts, converted to audio. Scientists call this phenomenon "chorus" because it sounds remarkably like birdsong.',
    url: 'https://www.nasa.gov/wp-content/uploads/2012/09/chorus_sound.mp3',
    icon: '🌍',
    credit: 'NASA/GSFC/Space Sciences Laboratory',
    year: 2012,
  },
  {
    id: 'black-hole-perseus',
    title: 'Black Hole in Perseus Cluster',
    source: 'Chandra X-Ray Observatory (NASA)',
    duration: '0:33',
    category: 'cosmic',
    description: 'The supermassive black hole at the center of the Perseus galaxy cluster sends pressure waves through the hot gas — detected as X-ray ripples. NASA converted these into audio, shifted up 57–58 octaves.',
    url: 'https://www.nasa.gov/wp-content/uploads/2022/05/perseus_blackhole_1.mp3',
    icon: '🕳️',
    credit: 'NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M.Russo, A.Santaguida)',
    year: 2022,
  },
  {
    id: 'milky-way-center',
    title: 'Milky Way Center',
    source: 'Chandra X-Ray Observatory (NASA)',
    duration: '0:33',
    category: 'cosmic',
    description: 'The center of our galaxy in sound — data from Chandra (X-ray), Hubble (optical) and Spitzer (infrared) combined. Different light frequencies mapped to different audio frequencies.',
    url: 'https://www.nasa.gov/wp-content/uploads/2022/05/milkywaycenter_synth_-_web_excerpt.mp3',
    icon: '🌌',
    credit: 'NASA/CXC/SAO/K.Arcand, SYSTEM Sounds',
    year: 2022,
  },
  {
    id: 'stardust',
    title: 'Comet Dust Impacts',
    source: 'Stardust (NASA)',
    duration: '0:18',
    category: 'mission',
    description: 'When NASA\'s Stardust spacecraft flew through the tail of Comet Wild 2, dust particles impacted its collector. The impacts were detected by microphones and converted into this acoustic recording.',
    url: 'https://www.nasa.gov/wp-content/uploads/2004/01/stardust_dust_impacts.mp3',
    icon: '☄️',
    credit: 'NASA/JPL',
    year: 2004,
  },
  {
    id: 'voyager-heliosphere',
    title: 'Entering Interstellar Space',
    source: 'Voyager 1 (NASA)',
    duration: '0:60',
    category: 'mission',
    description: 'Voyager 1 crossed into interstellar space in 2012. This audio recreates plasma density waves detected as the probe crossed the heliopause — humanity\'s first recorded sound from beyond our solar system.',
    url: 'https://www.nasa.gov/wp-content/uploads/2013/09/voyager1_interstellar_boundary.mp3',
    icon: '🛸',
    credit: 'NASA/JPL-Caltech',
    year: 2013,
  },
  {
    id: 'pulsar',
    title: 'Vela Pulsar',
    source: 'Chandra X-Ray Observatory',
    duration: '0:08',
    category: 'star',
    description: 'A pulsar is a neutron star spinning hundreds of times per second, emitting beams of radiation. This recording converts Chandra\'s X-ray detections of the Vela Pulsar (1,000 ly away) into sound.',
    url: 'https://www.nasa.gov/wp-content/uploads/2010/04/chandra_pulse_vela.mp3',
    icon: '⭐',
    credit: 'NASA/CXC/SAO',
    year: 2010,
  },
  {
    id: 'apollo-11',
    title: 'Apollo 11 Moon Landing',
    source: 'Apollo 11 (NASA)',
    duration: '0:24',
    category: 'mission',
    description: '"Houston, Tranquility Base here. The Eagle has landed." — Commander Neil Armstrong\'s historic words on July 20, 1969, the moment humanity first set foot on the Moon.',
    url: 'https://www.nasa.gov/wp-content/uploads/1969/07/eagle_has_landed.mp3',
    icon: '🌙',
    credit: 'NASA',
    year: 1969,
  },
  {
    id: 'mars-wind',
    title: 'Martian Wind',
    source: 'InSight Lander (NASA)',
    duration: '0:60',
    category: 'planet',
    description: 'The first sounds ever recorded on Mars. NASA\'s InSight lander captured vibrations from wind blowing across the Martian surface on November 26, 2018 — a gentle 10–15 mph breeze.',
    url: 'https://www.nasa.gov/wp-content/uploads/2018/12/insight_wind_sound_20181201.mp3',
    icon: '🔴',
    credit: 'NASA/JPL-Caltech/CNES/IPGP',
    year: 2018,
  },
]

const CATEGORIES = [
  { id: 'all', label: '🎵 All' },
  { id: 'planet', label: '🪐 Planets' },
  { id: 'star', label: '⭐ Stars' },
  { id: 'cosmic', label: '🕳️ Cosmic' },
  { id: 'mission', label: '🚀 Missions' },
]

function WaveformBar({ active, progress }: { active: boolean; progress: number }) {
  const bars = 24
  return (
    <div className="flex items-center gap-0.5 h-8">
      {Array.from({ length: bars }).map((_, i) => {
        const filled = active && (i / bars) < progress
        const height = 4 + Math.abs(Math.sin(i * 0.7 + 1.2)) * 24
        return (
          <div key={i} className="flex-1 rounded-full transition-all duration-75"
            style={{
              height: height,
              background: filled
                ? 'linear-gradient(to top, #6366f1, #a78bfa)'
                : active
                  ? 'rgba(99,102,241,0.4)'
                  : 'rgba(255,255,255,0.08)'
            }} />
        )
      })}
    </div>
  )
}

export default function SpaceSounds() {
  const [category, setCategory] = useState('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)

  const filtered = SOUNDS.filter(s => category === 'all' || s.category === category)

  const updateProgress = () => {
    const a = audioRef.current
    if (a && a.duration) {
      setProgress(a.currentTime / a.duration)
      rafRef.current = requestAnimationFrame(updateProgress)
    }
  }

  const play = (sound: Sound) => {
    setLoadError(null)
    if (playingId === sound.id) {
      audioRef.current?.pause()
      cancelAnimationFrame(rafRef.current)
      setPlayingId(null)
      setProgress(0)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    const audio = new Audio(sound.url)
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio
    setPlayingId(sound.id)
    setProgress(0)
    audio.play().then(() => {
      rafRef.current = requestAnimationFrame(updateProgress)
    }).catch(() => {
      setLoadError(sound.id)
      setPlayingId(null)
    })
    audio.onended = () => {
      setPlayingId(null)
      setProgress(0)
      cancelAnimationFrame(rafRef.current)
    }
  }

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">🎵</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Space Sounds</h3>
          <p className="text-gray-500 text-xs">Real recordings from NASA spacecraft — the universe in audio</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-bold"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
          {SOUNDS.length} sounds
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className="text-xs px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all shrink-0"
            style={category === c.id
              ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(sound => {
          const isPlaying = playingId === sound.id
          const hasError = loadError === sound.id
          return (
            <div key={sound.id}
              className="rounded-2xl p-4 transition-all"
              style={{
                background: isPlaying ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${isPlaying ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`
              }}>
              <div className="flex items-start gap-3">
                <button onClick={() => play(sound)}
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: isPlaying
                      ? 'linear-gradient(135deg, #6366f1, #a78bfa)'
                      : 'rgba(99,102,241,0.15)',
                    border: `1px solid ${isPlaying ? 'rgba(99,102,241,0.8)' : 'rgba(99,102,241,0.3)'}`,
                    color: '#c4b5fd',
                  }}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm">{sound.icon}</span>
                    <span className="text-sm font-bold text-white truncate">{sound.title}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">{sound.source} · {sound.year}</p>
                  {isPlaying && (
                    <div className="mt-2">
                      <WaveformBar active={isPlaying} progress={progress} />
                    </div>
                  )}
                  {hasError && (
                    <p className="text-[10px] text-red-400 mt-1">Audio unavailable — browser may block external audio</p>
                  )}
                  {!isPlaying && !hasError && (
                    <p className="text-[10px] text-gray-600 mt-1 line-clamp-2">{sound.description}</p>
                  )}
                  {isPlaying && (
                    <p className="text-[10px] text-indigo-300 mt-2 leading-relaxed">{sound.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-gray-600">{sound.duration}</div>
                  <div className="text-[9px] text-gray-700 mt-0.5 capitalize">{sound.category}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          <span className="text-indigo-400 font-semibold">How these work:</span> Space sounds are created by converting data (electromagnetic waves, pressure waves, particle impacts) into audible audio frequencies using a process called sonification.
        </p>
      </div>
      <p className="text-[10px] text-gray-700 mt-3 text-center">Audio: NASA Scientific Visualization Studio · NASA/JPL-Caltech · Chandra X-Ray Center</p>
    </div>
  )
}
