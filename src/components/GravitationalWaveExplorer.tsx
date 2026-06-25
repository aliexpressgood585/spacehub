import { useState, useRef, useEffect, useCallback } from 'react'

interface GWEvent {
  id: string
  name: string
  date: string
  type: string
  m1: number
  m2: number
  distance: number
  snr: number
  detectors: string[]
  significance: string
  description: string
  peakFreq: number
  duration: number
}

const GW_EVENTS: GWEvent[] = [
  { id: 'GW150914', name: 'GW150914', date: '2015-09-14', type: 'BBH', m1: 35.6, m2: 30.6, distance: 410, snr: 24, detectors: ['LIGO-H', 'LIGO-L'], significance: 'First ever gravitational wave detection! Proved Einstein right after 100 years.', description: 'Two black holes collided 1.3 billion years ago, releasing more power than all stars in the observable universe combined for a fraction of a second.', peakFreq: 150, duration: 0.45 },
  { id: 'GW170817', name: 'GW170817', date: '2017-08-17', type: 'BNS', m1: 1.46, m2: 1.27, distance: 40, snr: 32, detectors: ['LIGO-H', 'LIGO-L', 'Virgo'], significance: 'First neutron star merger — confirmed origin of heavy elements like gold and platinum!', description: 'The first multimessenger event: gravitational waves + gamma-ray burst + optical kilonova. Neutron stars created all gold in your jewelry.', peakFreq: 1500, duration: 100 },
  { id: 'GW190521', name: 'GW190521', date: '2019-05-21', type: 'BBH', m1: 85, m2: 66, distance: 5300, snr: 14, detectors: ['LIGO-H', 'LIGO-L', 'Virgo'], significance: 'Heaviest BBH merger detected, created an intermediate-mass black hole of ~142 M☉', description: 'The resulting 142 solar mass black hole is the first of the elusive intermediate-mass class ever confirmed. The progenitor black holes may themselves be merger products.', peakFreq: 60, duration: 0.1 },
  { id: 'GW170104', name: 'GW170104', date: '2017-01-04', type: 'BBH', m1: 31.2, m2: 19.4, distance: 880, snr: 13, detectors: ['LIGO-H', 'LIGO-L'], significance: 'Challenged formation models — evidence that black holes may have anti-aligned spins', description: 'The black hole spins appear to be misaligned with the orbital plane, suggesting a chaotic formation environment rather than binary star evolution.', peakFreq: 120, duration: 0.3 },
  { id: 'GW151226', name: 'GW151226', date: '2015-12-26', type: 'BBH', m1: 14.2, m2: 7.5, distance: 440, snr: 13, detectors: ['LIGO-H', 'LIGO-L'], significance: 'Second detection — confirmed GW150914 was not a fluke', description: 'Nicknamed the "Boxing Day event". The inspiral lasted 55 cycles, much longer than GW150914, allowing precise spin measurements.', peakFreq: 450, duration: 1.0 },
  { id: 'GW200105', name: 'GW200105', date: '2020-01-05', type: 'NSBH', m1: 8.9, m2: 1.9, distance: 900, snr: 13, detectors: ['LIGO-L', 'Virgo'], significance: 'First confirmed neutron star-black hole merger', description: 'A black hole devoured a neutron star. The neutron star was likely swallowed whole rather than disrupted, so no electromagnetic counterpart was expected.', peakFreq: 500, duration: 0.8 },
]

const TYPE_COLORS: Record<string, string> = {
  BBH: '#a78bfa',
  BNS: '#34d399',
  NSBH: '#fb923c',
}

const TYPE_LABELS: Record<string, string> = {
  BBH: 'Binary Black Hole',
  BNS: 'Binary Neutron Star',
  NSBH: 'Neutron Star–Black Hole',
}

export default function GravitationalWaveExplorer() {
  const [selected, setSelected] = useState<GWEvent>(GW_EVENTS[0])
  const [playing, setPlaying] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)

  const drawWaveform = useCallback((t: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height

    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, W, H)

    // Grid lines
    ctx.strokeStyle = 'rgba(99,102,241,0.15)'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke()
    }
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(W * i / 8, 0); ctx.lineTo(W * i / 8, H); ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(99,102,241,0.3)'
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()

    // Chirp waveform: h(t) ~ A(t) * cos(phi(t))
    // Simplified: amplitude grows, frequency increases as merger approaches
    const ev = selected
    const totalDur = ev.duration
    const f0 = Math.max(20, ev.peakFreq * 0.05)
    const f1 = ev.peakFreq

    const gradient = ctx.createLinearGradient(0, 0, W, 0)
    gradient.addColorStop(0, 'rgba(99,102,241,0.3)')
    gradient.addColorStop(0.7, 'rgba(167,139,250,0.8)')
    gradient.addColorStop(0.92, '#ffffff')
    gradient.addColorStop(1, 'rgba(167,139,250,0.2)')

    ctx.strokeStyle = gradient
    ctx.lineWidth = 2
    ctx.beginPath()

    const pts = 512
    const mergerX = W * 0.92
    const offset = (t * 0.3) % 1

    for (let i = 0; i <= pts; i++) {
      const x = (i / pts) * W
      const frac = (i / pts - offset + 1) % 1
      const tminus = (1 - frac) * totalDur

      // Chirp mass scaling
      const tcoal = Math.max(0.001, tminus)
      const freq = f0 + (f1 - f0) * Math.pow(Math.max(0, 1 - tcoal / totalDur), 0.375)
      const amp = 0.05 + 0.95 * Math.pow(Math.max(0, 1 - tcoal / totalDur), 0.5)

      // Ringdown after merger
      const isMerger = frac > 0.92
      const ringdownFac = isMerger ? Math.exp(-(frac - 0.92) * 80) : 1

      const phase = frac * freq * Math.PI * 2 * totalDur * 3
      const y = H / 2 - amp * (H * 0.42) * Math.cos(phase) * ringdownFac

      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Merger marker
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(mergerX, 0); ctx.lineTo(mergerX, H); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '11px monospace'
    ctx.fillText('MERGER', mergerX + 4, 16)

    // Frequency label
    ctx.fillStyle = 'rgba(167,139,250,0.7)'
    ctx.font = '10px monospace'
    ctx.fillText(`Peak: ${ev.peakFreq} Hz`, 8, H - 8)

    if (playing) {
      timeRef.current += 0.016
      animRef.current = requestAnimationFrame(() => drawWaveform(timeRef.current))
    }
  }, [selected, playing])

  useEffect(() => {
    timeRef.current = 0
    drawWaveform(0)
  }, [selected, drawWaveform])

  useEffect(() => {
    if (playing) {
      animRef.current = requestAnimationFrame(() => drawWaveform(timeRef.current))
    } else {
      cancelAnimationFrame(animRef.current)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [playing, drawWaveform])

  const playChirp = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') await ctx.resume()

    const duration = Math.min(3, selected.duration > 1 ? 3 : 2)
    const bufSize = Math.floor(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = buf.getChannelData(0)

    const f0 = Math.max(40, selected.peakFreq * 0.02)
    const f1 = Math.min(2000, selected.peakFreq * 2)

    let phase = 0
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate
      const frac = t / duration
      const mergerFrac = 0.9
      const freq = frac < mergerFrac
        ? f0 + (f1 - f0) * Math.pow(frac / mergerFrac, 2)
        : f1 * Math.exp(-(frac - mergerFrac) * 8)
      const amp = frac < mergerFrac
        ? 0.05 + 0.95 * Math.pow(frac / mergerFrac, 1.5)
        : Math.exp(-(frac - mergerFrac) * 10)
      phase += (2 * Math.PI * freq) / ctx.sampleRate
      data[i] = amp * Math.cos(phase) * 0.5
    }

    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    gain.gain.value = 0.8
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start()
    setPlaying(true)
    src.onended = () => setPlaying(false)
  }

  const chirpMass = (m1: number, m2: number) => {
    return Math.pow(m1 * m2, 3 / 5) / Math.pow(m1 + m2, 1 / 5)
  }

  const totalMass = selected.m1 + selected.m2
  const mc = chirpMass(selected.m1, selected.m2)
  const finalMass = totalMass * 0.95

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">〰️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Gravitational Wave Explorer</h2>
          <p className="text-purple-300 text-sm">LIGO & Virgo detections — ripples in spacetime</p>
        </div>
      </div>

      {/* Event selector */}
      <div className="grid grid-cols-2 gap-2 mb-6 sm:grid-cols-3">
        {GW_EVENTS.map(ev => (
          <button
            key={ev.id}
            onClick={() => { setSelected(ev); setPlaying(false) }}
            className={`p-3 rounded-lg border text-left transition-all ${selected.id === ev.id ? 'border-purple-500 bg-purple-900/40' : 'border-white/10 hover:border-purple-500/50 bg-white/5'}`}
          >
            <div className="text-sm font-bold text-white">{ev.name}</div>
            <div className="text-xs mt-0.5" style={{ color: TYPE_COLORS[ev.type] }}>{ev.type}</div>
            <div className="text-xs text-gray-400">{ev.date}</div>
          </button>
        ))}
      </div>

      {/* Waveform canvas */}
      <div className="relative mb-4">
        <canvas
          ref={canvasRef}
          width={700}
          height={160}
          className="w-full rounded-lg"
          style={{ height: 160 }}
        />
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1">
          <span className="text-xs text-purple-300 font-mono">Strain h(t)</span>
        </div>
        <div className="absolute top-2 right-2 bg-black/60 rounded px-2 py-1">
          <span className="text-xs text-purple-300 font-mono">Time →</span>
        </div>
      </div>

      {/* Play button */}
      <button
        onClick={playChirp}
        disabled={playing}
        className="mb-6 px-5 py-2 rounded-lg font-semibold text-sm transition-all bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-2"
      >
        {playing ? '🔊 Playing chirp...' : '🔊 Play Chirp Sound'}
      </button>

      {/* Event details */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[selected.type] }} />
            <span className="font-bold text-white">{selected.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: TYPE_COLORS[selected.type] + '40' }}>
              {TYPE_LABELS[selected.type]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Mass 1', value: `${selected.m1} M☉` },
              { label: 'Mass 2', value: `${selected.m2} M☉` },
              { label: 'Total Mass', value: `${totalMass.toFixed(1)} M☉` },
              { label: 'Chirp Mass', value: `${mc.toFixed(1)} M☉` },
              { label: 'Remnant', value: `~${finalMass.toFixed(0)} M☉` },
              { label: 'Distance', value: `${selected.distance} Mpc` },
              { label: 'SNR', value: selected.snr.toString() },
              { label: 'Detectors', value: selected.detectors.join(', ') },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-gray-400">{label}</div>
                <div className="text-sm font-mono text-purple-200">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col gap-3">
          <div>
            <div className="text-xs text-purple-300 font-semibold uppercase tracking-wide mb-1">Significance</div>
            <p className="text-sm text-yellow-300">{selected.significance}</p>
          </div>
          <div>
            <div className="text-xs text-purple-300 font-semibold uppercase tracking-wide mb-1">What happened</div>
            <p className="text-sm text-gray-300 leading-relaxed">{selected.description}</p>
          </div>
          <div className="mt-auto">
            <div className="text-xs text-gray-400 mb-1">Energy radiated as gravitational waves</div>
            <div className="text-lg font-bold text-white">
              ~{(totalMass * 0.05).toFixed(2)} M☉c²
            </div>
            <div className="text-xs text-gray-400">≈ {(totalMass * 0.05 * 1.8e47).toExponential(1)} J</div>
          </div>
        </div>
      </div>

      {/* Mass comparison visual */}
      <div className="mt-4 bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="text-xs text-purple-300 font-semibold uppercase tracking-wide mb-3">Mass Comparison</div>
        <div className="flex items-end gap-4 justify-center">
          {[
            { label: 'Object 1', mass: selected.m1, color: '#a78bfa' },
            { label: '+', mass: 0, color: 'transparent' },
            { label: 'Object 2', mass: selected.m2, color: '#818cf8' },
            { label: '→', mass: 0, color: 'transparent' },
            { label: 'Remnant', mass: finalMass, color: '#f59e0b' },
          ].map((item, i) => {
            if (item.mass === 0) {
              return (
                <div key={i} className="text-2xl text-white/40 pb-4">{item.label}</div>
              )
            }
            const maxMass = Math.max(selected.m1, selected.m2, finalMass)
            const h = Math.max(20, (item.mass / maxMass) * 100)
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="text-xs font-mono text-gray-300">{item.mass.toFixed(1)} M☉</div>
                <div
                  className="rounded-t-full"
                  style={{
                    width: Math.max(20, Math.sqrt(item.mass / maxMass) * 60) + 'px',
                    height: h + 'px',
                    backgroundColor: item.color,
                    opacity: 0.8,
                  }}
                />
                <div className="text-xs text-gray-400">{item.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Fun facts */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { icon: '🌊', title: 'Strain magnitude', value: '~10⁻²¹', sub: 'Change in arm length ÷ arm length' },
          { icon: '💡', title: 'Peak luminosity', value: '~10⁴⁹ W', sub: '10,000× all stars in observable universe' },
          { icon: '⏱️', title: 'Detection delay', value: `${(selected.distance * 3.26).toFixed(0)} yr`, sub: 'Light travel time from source' },
        ].map(f => (
          <div key={f.title} className="bg-white/5 rounded-lg p-3 border border-white/10">
            <div className="text-xl mb-1">{f.icon}</div>
            <div className="text-xs text-gray-400">{f.title}</div>
            <div className="text-lg font-bold text-white font-mono">{f.value}</div>
            <div className="text-xs text-gray-500">{f.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
