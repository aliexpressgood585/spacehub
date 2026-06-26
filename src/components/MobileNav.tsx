interface Props {
  active: string
  onSwitch: (tab: string) => void
}

const MOBILE_TABS = [
  { id: 'dashboard', icon: '🛸', label: 'ISS Live' },
  { id: 'tracker',   icon: '🛰️', label: 'Satellites' },
  { id: 'weather',   icon: '⛈️', label: 'Weather' },
  { id: 'news',      icon: '📰', label: 'News' },
  { id: 'explore',   icon: '🔬', label: 'Explore' },
]

export default function MobileNav({ active, onSwitch }: Props) {
  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 55,
        background: 'rgba(2,5,16,0.96)',
        borderTop: '1px solid rgba(99,102,241,0.18)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5), 0 -1px 0 rgba(99,102,241,0.1)',
      }}
      className="md:hidden"
    >
      {/* Aurora top line */}
      <div style={{
        position: 'absolute', top: -1, left: '5%', right: '5%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(139,92,246,0.7), transparent)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'stretch', height: 60 }}>
        {MOBILE_TABS.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onSwitch(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '6px 4px',
                position: 'relative',
                transition: 'opacity 0.15s',
                minHeight: 44,
              }}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span style={{
                  position: 'absolute',
                  top: 6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  background: 'rgba(99,102,241,0.18)',
                  border: '1px solid rgba(99,102,241,0.35)',
                }} />
              )}
              <span style={{ fontSize: 18, position: 'relative', zIndex: 1, lineHeight: 1 }}>
                {tab.icon}
              </span>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.04em',
                position: 'relative',
                zIndex: 1,
                color: isActive ? '#c4b5fd' : '#4b5563',
                transition: 'color 0.15s',
              }}>
                {tab.label.toUpperCase()}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
