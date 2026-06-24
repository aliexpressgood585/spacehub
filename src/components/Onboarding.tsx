import { useState, useEffect } from 'react'

const STEPS = [
  {
    icon: '🛸',
    title: 'Track the ISS Live',
    desc: 'See exactly where the International Space Station is right now — updated every 10 seconds.',
  },
  {
    icon: '🔔',
    title: 'Get Pass Alerts',
    desc: 'Enable alerts and we\'ll notify you when the ISS is flying over your city.',
  },
  {
    icon: '🌍',
    title: 'Explore Space Data',
    desc: 'Moon phases, launches, space weather, star map — all free, all real-time.',
  },
]

export default function Onboarding() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try { if (!localStorage.getItem('spacehub_onboarded')) setVisible(true) } catch {}
  }, [])

  const dismiss = () => {
    try { localStorage.setItem('spacehub_onboarded', '1') } catch {}
    setVisible(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      dismiss()
    }
  }

  if (!visible) return null

  const current = STEPS[step]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,5,16,0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 24,
          padding: '40px 32px',
          maxWidth: 380,
          width: '90%',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* Skip link */}
        <button
          onClick={dismiss}
          style={{
            position: 'absolute',
            top: 16,
            right: 20,
            background: 'none',
            border: 'none',
            color: 'rgba(156,163,175,0.7)',
            fontSize: 13,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          Skip
        </button>

        {/* Icon */}
        <div style={{ fontSize: 56, marginBottom: 16 }}>{current.icon}</div>

        {/* Title */}
        <h2
          style={{
            color: '#fff',
            fontWeight: 900,
            fontSize: 22,
            margin: '0 0 12px',
            lineHeight: 1.2,
          }}
        >
          {current.title}
        </h2>

        {/* Description */}
        <p
          style={{
            color: '#9ca3af',
            fontSize: 15,
            lineHeight: 1.6,
            margin: '0 0 32px',
          }}
        >
          {current.desc}
        </p>

        {/* Next / Get Started button */}
        <button
          onClick={next}
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            color: '#fff',
            border: 'none',
            padding: '13px 36px',
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            width: '100%',
            marginBottom: 24,
          }}
        >
          {step < STEPS.length - 1 ? 'Next →' : 'Get Started 🚀'}
        </button>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 8,
                height: 8,
                borderRadius: 4,
                background: i === step ? '#6366f1' : 'rgba(99,102,241,0.25)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
