import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Trade {
  id: number
  symbol: string
  side: 'LONG' | 'SHORT'
  entryPrice: number
  exitPrice?: number
  size: number
  pnl?: number
  pnlPct?: number
  timestamp: number
  status: 'OPEN' | 'TP' | 'SL' | 'CLOSED'
}

interface Coin {
  id: string
  symbol: string
  name: string
  price: number
  change24h: number
  history: number[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COIN_LIST: Omit<Coin, 'price' | 'change24h' | 'history'>[] = [
  { id: 'bitcoin',       symbol: 'BTC',  name: 'Bitcoin'   },
  { id: 'ethereum',      symbol: 'ETH',  name: 'Ethereum'  },
  { id: 'solana',        symbol: 'SOL',  name: 'Solana'    },
  { id: 'binancecoin',   symbol: 'BNB',  name: 'BNB'       },
  { id: 'cardano',       symbol: 'ADA',  name: 'Cardano'   },
  { id: 'dogecoin',      symbol: 'DOGE', name: 'Dogecoin'  },
  { id: 'ripple',        symbol: 'XRP',  name: 'XRP'       },
  { id: 'avalanche-2',   symbol: 'AVAX', name: 'Avalanche' },
  { id: 'chainlink',     symbol: 'LINK', name: 'Chainlink' },
  { id: 'polkadot',      symbol: 'DOT',  name: 'Polkadot'  },
]

const RISK_PROFILES = {
  low:    { positionPct: 0.05, sl: 0.015, tp: 0.030 },
  medium: { positionPct: 0.10, sl: 0.025, tp: 0.050 },
  high:   { positionPct: 0.20, sl: 0.035, tp: 0.070 },
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out = [prices[0]]
  for (let i = 1; i < prices.length; i++) {
    out.push(prices[i] * k + out[i - 1] * (1 - k))
  }
  return out
}

function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1]
    d > 0 ? (gains += d) : (losses -= d)
  }
  const ag = gains / period
  const al = losses / period
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al)
}

function getSignal(history: number[]): 'BUY' | 'SELL' | 'HOLD' {
  if (history.length < 25) return 'HOLD'
  const e9  = calcEMA(history, 9)
  const e21 = calcEMA(history, 21)
  const r   = calcRSI(history)
  const n   = history.length - 1
  // EMA crossover
  if (e9[n - 1] <= e21[n - 1] && e9[n] > e21[n] && r < 68) return 'BUY'
  if (e9[n - 1] >= e21[n - 1] && e9[n] < e21[n] && r > 32) return 'SELL'
  // RSI extremes
  if (r < 25) return 'BUY'
  if (r > 75) return 'SELL'
  return 'HOLD'
}

function fmt(p: number): string {
  if (!p) return '—'
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1)    return '$' + p.toFixed(2)
  return '$' + p.toFixed(4)
}

function fmtPnl(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CryptoTradingDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef(0)

  // Price state
  const [coins, setCoins] = useState<Coin[]>(
    COIN_LIST.map(c => ({ ...c, price: 0, change24h: 0, history: [] }))
  )

  // Bot state (refs for use inside effects without stale closures)
  const activeRef     = useRef(false)
  const selectedRef   = useRef('bitcoin')
  const riskRef       = useRef<keyof typeof RISK_PROFILES>('medium')
  const openRef       = useRef<Trade | null>(null)
  const balanceRef    = useRef(10000)

  // React state for rendering
  const [active,     setActive]     = useState(false)
  const [selectedId, setSelectedId] = useState('bitcoin')
  const [riskLevel,  setRiskLevel]  = useState<keyof typeof RISK_PROFILES>('medium')
  const [balance,    setBalance]    = useState(10000)
  const [open,       setOpen]       = useState<Trade | null>(null)
  const [trades,     setTrades]     = useState<Trade[]>([])
  const [loading,    setLoading]    = useState(true)

  // Keep refs in sync with React state
  useEffect(() => { activeRef.current   = active },     [active])
  useEffect(() => { selectedRef.current = selectedId }, [selectedId])
  useEffect(() => { riskRef.current     = riskLevel },  [riskLevel])
  useEffect(() => { openRef.current     = open },       [open])
  useEffect(() => { balanceRef.current  = balance },    [balance])

  // ── Fetch prices from CoinGecko ─────────────────────────────────────────────
  const fetchPrices = useCallback(async () => {
    try {
      const ids = COIN_LIST.map(c => c.id).join(',')
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { signal: AbortSignal.timeout(9000) }
      )
      if (!res.ok) return
      const data = await res.json()
      setCoins(prev => prev.map(c => {
        const d = data[c.id]
        if (!d) return c
        const price = d.usd as number
        return { ...c, price, change24h: d.usd_24h_change ?? 0, history: [...c.history.slice(-99), price] }
      }))
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrices()
    const iv = setInterval(fetchPrices, 15000)
    return () => clearInterval(iv)
  }, [fetchPrices])

  // ── Bot logic (runs on each price update) ────────────────────────────────────
  useEffect(() => {
    if (!activeRef.current) return
    const coin = coins.find(c => c.id === selectedRef.current)
    if (!coin || coin.price === 0 || coin.history.length < 25) return

    const profile = RISK_PROFILES[riskRef.current]
    const sig     = getSignal(coin.history)
    const current = openRef.current
    const bal     = balanceRef.current

    // Check open trade for SL / TP / signal-close
    if (current) {
      const rawPct = (coin.price - current.entryPrice) / current.entryPrice
      const pnlPct = current.side === 'LONG' ? rawPct : -rawPct
      const hitTP  = pnlPct >= profile.tp
      const hitSL  = pnlPct <= -profile.sl
      const sigClose = (current.side === 'LONG' && sig === 'SELL') ||
                       (current.side === 'SHORT' && sig === 'BUY')

      if (hitTP || hitSL || sigClose) {
        const pnl = current.size * pnlPct
        const closed: Trade = {
          ...current,
          exitPrice: coin.price,
          pnl,
          pnlPct: pnlPct * 100,
          status: hitTP ? 'TP' : hitSL ? 'SL' : 'CLOSED',
        }
        const newBal = bal + pnl
        balanceRef.current = newBal
        openRef.current    = null
        setBalance(newBal)
        setOpen(null)
        setTrades(prev => [closed, ...prev].slice(0, 60))
      }
    }

    // Open new trade on signal (only if no open trade)
    if (!openRef.current && (sig === 'BUY' || sig === 'SELL')) {
      const size = balanceRef.current * profile.positionPct
      const newTrade: Trade = {
        id:          Date.now(),
        symbol:      coin.symbol,
        side:        sig === 'BUY' ? 'LONG' : 'SHORT',
        entryPrice:  coin.price,
        size,
        timestamp:   Date.now(),
        status:      'OPEN',
      }
      openRef.current = newTrade
      setOpen(newTrade)
    }
  }, [coins])

  // ── Neural Mesh Canvas ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // alias so TypeScript treats it as non-null inside nested function bodies
    const el: HTMLCanvasElement = canvas
    const ctx = el.getContext('2d')!

    type MNode   = { x: number; y: number; active: boolean; phase: number }
    type MSignal = { from: number; to: number; t: number; speed: number }

    const S = { nodes: [] as MNode[], signals: [] as MSignal[], W: 0, H: 0 }

    function spawnSignal() {
      const n = S.nodes.length
      if (!n) return
      const from = Math.floor(Math.random() * n)
      let to = from
      while (to === from) to = Math.floor(Math.random() * n)
      S.signals.push({ from, to, t: 0, speed: 0.003 + Math.random() * 0.007 })
    }

    function init() {
      S.W = el.parentElement?.clientWidth ?? 600
      S.H = 240
      el.width  = S.W * devicePixelRatio
      el.height = S.H * devicePixelRatio
      el.style.width  = S.W + 'px'
      el.style.height = S.H + 'px'
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

      const cols = 9, rows = 5
      S.nodes = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          S.nodes.push({
            x:      (c / (cols - 1)) * S.W * 0.88 + S.W * 0.06,
            y:      (r / (rows - 1)) * S.H * 0.76 + S.H * 0.12,
            active: Math.random() > 0.6,
            phase:  Math.random() * Math.PI * 2,
          })
        }
      }
      S.signals = []
      for (let i = 0; i < 6; i++) spawnSignal()
    }

    function draw() {
      const { W, H, nodes, signals } = S
      if (!W) { rafRef.current = requestAnimationFrame(draw); return }

      ctx.clearRect(0, 0, W, H)

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, 'rgba(12,0,4,0.97)')
      bg.addColorStop(1, 'rgba(4,0,12,0.97)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Layer labels
      ctx.font      = '9px monospace'
      ctx.fillStyle = 'rgba(239,68,68,0.35)'
      ;['L2 · CLUSTER MODEL', 'L3 · CONVERGENCE', 'L4 · EXECUTION'].forEach((l, i) => {
        ctx.fillText(l, W * 0.06 + i * W * 0.305, 12)
      })

      // Connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < W * 0.22) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(180,20,20,${(1 - d / (W * 0.22)) * 0.13})`
            ctx.lineWidth   = 0.5
            ctx.stroke()
          }
        }
      }

      // Signals
      signals.forEach((s, i) => {
        s.t += s.speed
        if (s.t > 1) {
          signals[i] = { from: s.to, to: Math.floor(Math.random() * nodes.length), t: 0, speed: s.speed }
          return
        }
        const a = nodes[s.from], b = nodes[s.to]
        const x = a.x + (b.x - a.x) * s.t
        const y = a.y + (b.y - a.y) * s.t
        const t0 = Math.max(0, s.t - 0.18)

        ctx.beginPath()
        ctx.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0)
        ctx.lineTo(x, y)
        ctx.strokeStyle = 'rgba(239,68,68,0.75)'
        ctx.lineWidth   = 1.5
        ctx.stroke()

        const g = ctx.createRadialGradient(x, y, 0, x, y, 11)
        g.addColorStop(0, 'rgba(255,90,90,0.9)')
        g.addColorStop(1, 'rgba(239,68,68,0)')
        ctx.beginPath()
        ctx.arc(x, y, 11, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
      })

      // Nodes
      nodes.forEach(n => {
        n.phase += 0.025
        const pulse = Math.sin(n.phase) * 0.5 + 0.5
        const r     = n.active ? 3 + pulse * 2 : 1.5
        const alpha = n.active ? 0.6 + pulse * 0.4 : 0.2

        if (n.active) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 13)
          g.addColorStop(0, `rgba(239,68,68,${alpha * 0.5})`)
          g.addColorStop(1, 'rgba(239,68,68,0)')
          ctx.beginPath()
          ctx.arc(n.x, n.y, 13, 0, Math.PI * 2)
          ctx.fillStyle = g
          ctx.fill()
          // Random flicker
          if (Math.random() < 0.002) n.active = false
        } else {
          if (Math.random() < 0.001) n.active = true
        }

        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = n.active ? `rgba(239,68,68,${alpha})` : 'rgba(80,10,10,0.35)'
        ctx.fill()
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    init()
    draw()

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current)
      init()
      draw()
    })
    if (el.parentElement) ro.observe(el.parentElement)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  // ── Computed stats ────────────────────────────────────────────────────────────
  const closed   = trades.filter(t => t.status !== 'OPEN')
  const wins     = closed.filter(t => (t.pnl ?? 0) > 0)
  const winRate  = closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : '—'
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const pnlPct   = (((balance - 10000) / 10000) * 100).toFixed(2)
  const selCoin  = coins.find(c => c.id === selectedId)

  const openPnl = open && selCoin && selCoin.price > 0
    ? (() => {
        const raw    = (selCoin.price - open.entryPrice) / open.entryPrice
        const pnlPct = open.side === 'LONG' ? raw : -raw
        return { usd: open.size * pnlPct, pct: pnlPct * 100 }
      })()
    : null

  const reset = () => {
    setActive(false)
    activeRef.current = false
    setTrades([])
    setOpen(null)
    openRef.current = null
    setBalance(10000)
    balanceRef.current = 10000
  }

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const mono: React.CSSProperties = { fontFamily: 'monospace' }
  const RED  = '#ef4444'
  const RED2 = 'rgba(239,68,68,0.5)'
  const RED3 = 'rgba(239,68,68,0.15)'

  return (
    <div
      className="space-card overflow-hidden"
      style={{ background: 'rgba(8,0,3,0.98)', border: `1px solid ${RED3}`, borderRadius: 16 }}
    >
      <style>{`
        .ct-main { display: flex; flex-direction: column; }
        .ct-log   { max-height: 200px; overflow-y: auto; border-top: 1px solid rgba(239,68,68,0.1); }
        @media (min-width: 640px) {
          .ct-main  { flex-direction: row; }
          .ct-log   { width: 210px; max-height: 240px; border-top: none; border-left: 1px solid rgba(239,68,68,0.1); flex-shrink: 0; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(239,68,68,0.07), rgba(12,0,8,0.5))',
        borderBottom: `1px solid ${RED3}`,
        padding: '11px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: active ? '#22c55e' : RED,
            boxShadow: active ? '0 0 8px #22c55e' : `0 0 8px ${RED}`,
          }} />
          <span style={{ ...mono, fontWeight: 700, fontSize: 12, color: '#f87171', letterSpacing: 2 }}>
            CRYPTO TERMINAL
          </span>
          <span style={{
            ...mono, fontSize: 9, letterSpacing: 1,
            background: 'rgba(239,68,68,0.12)', border: `1px solid rgba(239,68,68,0.3)`,
            color: '#fca5a5', padding: '2px 7px', borderRadius: 4,
          }}>
            PAPER MODE
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...mono, fontSize: 9, color: RED2 }}>BALANCE</div>
            <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: '#fff' }}>
              ${balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...mono, fontSize: 9, color: RED2 }}>TOTAL P&L</div>
            <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: totalPnl >= 0 ? '#4ade80' : '#f87171' }}>
              {fmtPnl(totalPnl)} ({totalPnl >= 0 ? '+' : ''}{pnlPct}%)
            </div>
          </div>
        </div>
      </div>

      {/* ── Price Bar ── */}
      <div style={{
        background: 'rgba(10,0,5,0.8)', borderBottom: `1px solid ${RED3}`,
        padding: '7px 16px', display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'center',
      }}>
        {loading ? (
          <span style={{ ...mono, fontSize: 10, color: RED2 }}>Loading prices...</span>
        ) : (
          coins.slice(0, 7).map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                background: selectedId === c.id ? 'rgba(239,68,68,0.12)' : 'transparent',
                border: `1px solid ${selectedId === c.id ? 'rgba(239,68,68,0.35)' : 'transparent'}`,
                borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <span style={{ ...mono, fontSize: 9, color: '#fca5a5', fontWeight: 700 }}>{c.symbol}</span>
              <span style={{ ...mono, fontSize: 11, color: '#fff' }}>{fmt(c.price)}</span>
              {c.change24h !== 0 && (
                <span style={{ ...mono, fontSize: 8, color: c.change24h >= 0 ? '#4ade80' : '#f87171' }}>
                  {c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(2)}%
                </span>
              )}
            </button>
          ))
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, flexShrink: 0 }}>
          <div>
            <div style={{ ...mono, fontSize: 8, color: RED2 }}>WIN RATE</div>
            <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: '#f87171' }}>{winRate}%</div>
          </div>
          <div>
            <div style={{ ...mono, fontSize: 8, color: RED2 }}>TRADES</div>
            <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: '#f87171' }}>{closed.length}</div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="ct-main">
        {/* Canvas – Neural Mesh */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
          <div style={{ position: 'absolute', bottom: 8, left: 12, ...mono, fontSize: 9, color: 'rgba(239,68,68,0.35)' }}>
            NEURAL MESH · LIVE FLOW
          </div>
          {/* Open position overlay */}
          {open && selCoin && (
            <div style={{
              position: 'absolute', top: 18, right: 12,
              background: 'rgba(4,0,12,0.9)', border: `1px solid rgba(239,68,68,0.35)`,
              borderRadius: 8, padding: '8px 12px', ...mono,
            }}>
              <div style={{ fontSize: 9, color: RED2, marginBottom: 3 }}>OPEN POSITION</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: open.side === 'LONG' ? '#4ade80' : '#f87171' }}>
                {open.side} {open.symbol}
              </div>
              <div style={{ fontSize: 9, color: '#ccc' }}>Entry {fmt(open.entryPrice)}</div>
              <div style={{ fontSize: 9, color: '#999' }}>Now   {fmt(selCoin.price)}</div>
              {openPnl && (
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: openPnl.usd >= 0 ? '#4ade80' : '#f87171' }}>
                  {fmtPnl(openPnl.usd)} ({openPnl.pct >= 0 ? '+' : ''}{openPnl.pct.toFixed(2)}%)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trade Log */}
        <div className="ct-log">
          <div style={{ padding: '8px 12px 4px', ...mono, fontSize: 9, color: RED2, letterSpacing: 1 }}>
            TRADE LOG · LIVE STREAM
          </div>
          {trades.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'rgba(239,68,68,0.3)', fontSize: 10, ...mono }}>
              No trades yet.<br/>Start the bot below.
            </div>
          ) : trades.map(t => (
            <div key={t.id} style={{
              padding: '5px 12px',
              borderBottom: `1px solid rgba(239,68,68,0.06)`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4,
            }}>
              <div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span style={{ ...mono, fontSize: 8, color: t.side === 'LONG' ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.side}</span>
                  <span style={{ ...mono, fontSize: 8, color: '#aaa' }}>{t.symbol}</span>
                  <span style={{
                    ...mono, fontSize: 7,
                    color: t.status === 'TP' ? '#4ade80' : t.status === 'SL' ? '#f87171' : '#666',
                  }}>{t.status}</span>
                </div>
                <div style={{ ...mono, fontSize: 7, color: 'rgba(200,140,140,0.45)' }}>
                  {fmt(t.entryPrice)} → {t.exitPrice ? fmt(t.exitPrice) : '...'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: (t.pnl ?? 0) >= 0 ? '#4ade80' : '#f87171' }}>
                  {fmtPnl(t.pnl ?? 0)}
                </div>
                <div style={{ ...mono, fontSize: 7, color: RED2 }}>
                  {(t.pnlPct ?? 0) >= 0 ? '+' : ''}{(t.pnlPct ?? 0).toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{
        borderTop: `1px solid ${RED3}`, padding: '12px 16px',
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        background: 'rgba(10,0,5,0.7)',
      }}>
        {/* Start / Stop */}
        <button
          onClick={() => setActive(v => !v)}
          style={{
            padding: '8px 18px', borderRadius: 8, ...mono, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', letterSpacing: 1, transition: 'all 0.2s',
            background: active ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)',
            color:      active ? '#f87171'               : '#4ade80',
            boxShadow:  active ? '0 0 12px rgba(239,68,68,0.25)' : '0 0 12px rgba(34,197,94,0.25)',
            border: `1px solid ${active ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
          }}
        >
          {active ? '■ STOP BOT' : '▶ START BOT'}
        </button>

        {/* Coin selector */}
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{
            background: 'rgba(15,0,8,0.95)', color: '#fca5a5',
            border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 6,
            ...mono, fontSize: 11, padding: '7px 10px', cursor: 'pointer',
          }}
        >
          {COIN_LIST.map(c => (
            <option key={c.id} value={c.id}>{c.symbol} – {c.name}</option>
          ))}
        </select>

        {/* Risk level */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['low', 'medium', 'high'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRiskLevel(r)}
              style={{
                padding: '6px 11px', borderRadius: 6,
                ...mono, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                textTransform: 'uppercase', transition: 'all 0.15s',
                background: riskLevel === r ? 'rgba(239,68,68,0.18)' : 'transparent',
                color:      riskLevel === r ? '#f87171'               : 'rgba(239,68,68,0.38)',
                border: `1px solid ${riskLevel === r ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.1)'}`,
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Reset */}
        <button
          onClick={reset}
          style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 6,
            ...mono, fontSize: 9, cursor: 'pointer', transition: 'all 0.15s',
            background: 'transparent', color: 'rgba(239,68,68,0.38)',
            border: `1px solid rgba(239,68,68,0.15)`,
          }}
        >
          RESET
        </button>
      </div>

      {/* ── Disclaimer ── */}
      <div style={{
        padding: '8px 16px',
        ...mono, fontSize: 9, color: 'rgba(239,68,68,0.28)', textAlign: 'center',
        borderTop: `1px solid rgba(239,68,68,0.06)`,
      }}>
        Paper Trading only · No real money · EMA9/21 + RSI strategy · Updates every 15s via CoinGecko
      </div>
    </div>
  )
}
