// "מסלול" — the פולי מטבעות desk as a live 3D orbit (owner 2026-10-14: "something special that feels like 2030, fun to
// watch"). DISPLAY ONLY: the bot decides and books in scripts/pmc-desk.ts; this page only shows the same inputs it uses.
//
// The picture (one disc per coin, four discs):
//  - one full turn of a disc = one 5-minute Polymarket window; the white hand sweeps with the clock;
//  - the coin is a comet. Its distance from the centre is z, the bot's own distance-from-open measure
//    (shared/pmc.ts pmcZ: ln(spot now / spot at the window's open) / (sigma of 1 s returns x sqrt(seconds left))).
//    The gold ring is the opening price (z = 0); outside = above the open (Up favoured), inside = below (Down favoured);
//    the two green rings are |z| = PMC.zMin, where the bot is allowed to buy;
//  - the cyan arc is the entry gate (PMC.rules[0].enterFrom .. enterTo seconds before the end);
//  - the bot's real entry (from its state file) fires a beam and a chime; the official result showers gold (win) or a red
//    shock ring (loss).
// A second view, "כור", shows the account: the core is equity, the ring of cells is the room above the protected floor
// (pmcFloor), the orbs around it are the last closed trades.
// Spot comes from Binance's public market-data host (data-api.binance.vision, 1 s klines, same source the bot uses);
// Polymarket prices from Gamma + the CLOB books endpoint. Every feed that fails shows as missing, never as a number.
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { type PolyLive, type J, n, usd, col, ago } from '../polyLive'
import { PMC, pmcZ, sigmaOf, pmcFloor, COIN_HE } from '../../../shared/pmc'

const COINS = ['btc', 'eth', 'sol', 'xrp'] as const
type Coin = typeof COINS[number]
const SYM: Record<Coin, string> = { btc: '₿', eth: 'Ξ', sol: '◎', xrp: '✕' }
const HUE: Record<Coin, string> = { btc: '#f7b44a', eth: '#9aa8ff', sol: '#5ff0c8', xrp: '#7cc8ff' }
const GREEN = '#3ddc97', RED = '#ff6b6b', GOLD = '#ffd166', CYAN = '#4cc9f0', INK = '#03060d'
const W = 300                                     // 5-minute window, seconds
const RULE = PMC.rules[0]
const GATE: [number, number] = [W - RULE.enterFrom, W - RULE.enterTo]   // elapsed seconds when the bot may buy
const R0 = 1, K = 0.22, ZMAX = 3                   // disc radius at z = 0, radius per unit of z, clamp
const rOf = (z: number) => Math.max(0.12, R0 + Math.max(-ZMAX, Math.min(ZMAX, z)) * K)
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('orbitdemo')
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// angle of a moment in the window: top of the disc at 0 s, clockwise seen from above
const ang = (el: number) => Math.PI / 2 - (2 * Math.PI * el) / W
const xz = (r: number, el: number): [number, number, number] => [r * Math.cos(ang(el)), 0, -r * Math.sin(ang(el))]
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`
const zCol = (z: number | null) => (z == null ? '#6f8bb0' : Math.abs(z) >= PMC.zMin ? GREEN : Math.abs(z) >= 1 ? GOLD : '#9fb3c8')

// ── live feeds ─────────────────────────────────────────────────────────────────────────────────────────────────────────
type Feed = { open: number | null; px: number | null; sigma: number | null; trail: [number, number][] }
type Mkt = { id?: string; up?: string; down?: string; upAsk?: number; upBid?: number; downAsk?: number; downBid?: number }
const BIN = 'https://data-api.binance.vision/api/v3'
const getJ = async (u: string, init?: RequestInit) => { const r = await fetch(u, init); if (!r.ok) throw new Error(String(r.status)); return r.json() }

function useWindowFeeds() {
  const [now, setNow] = useState(Date.now())
  const start = Math.floor(now / 1000 / W) * W
  const feeds = useRef<Record<string, Feed>>({})
  const mk = useRef<Record<string, Mkt>>({})
  const [, bump] = useState(0)
  const [spotOk, setSpotOk] = useState<boolean | null>(null)
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  // ?orbitdemo=1: synthetic comets and prices for a visual check only (no real number is shown or changed)
  useEffect(() => {
    if (!DEMO) return
    feeds.current = Object.fromEntries(COINS.map((c) => [c, { open: 1, px: 1, sigma: 1, trail: [] }]))
    mk.current = Object.fromEntries(COINS.map((c, i) => [c, { upAsk: [0.94, 0.55, 0.92, 0.08][i], downAsk: [0.07, 0.46, 0.09, 0.93][i] }]))
    const drift = [1.9, 0.2, 1.1, -2.2]
    const id = setInterval(() => {
      const el = Date.now() / 1000 - start
      COINS.forEach((c, i) => { const tr = feeds.current[c].trail; const z = drift[i] * Math.min(1, el / 200) + Math.sin(el / 9 + i) * 0.35; tr.push([el, z]); if (tr.length > 400) tr.shift() })
      setSpotOk(true); bump((x) => x + 1)
    }, 1000)
    COINS.forEach((c, i) => { for (let t = 0; t < Math.floor(Date.now() / 1000 - start); t += 2) feeds.current[c].trail.push([t, drift[i] * Math.min(1, t / 200) + Math.sin(t / 9 + i) * 0.35]) })
    return () => clearInterval(id)
  }, [start])

  // per window: opening price, sigma (last hour of 1 s returns, as the bot), and the Polymarket token ids
  useEffect(() => {
    if (DEMO) return
    let alive = true
    feeds.current = Object.fromEntries(COINS.map((c) => [c, { open: null, px: null, sigma: null, trail: [] }]))
    mk.current = {}
    for (const c of COINS) {
      const sym = c.toUpperCase() + 'USDT'
      getJ(`${BIN}/klines?symbol=${sym}&interval=1s&startTime=${start * 1000}&limit=1`).then((k) => { if (alive && k?.[0]) feeds.current[c].open = +k[0][1] }).catch(() => {})
      const end = Date.now()
      Promise.all([3, 2, 1, 0].map((p) => getJ(`${BIN}/klines?symbol=${sym}&interval=1s&endTime=${end - p * 1000_000}&limit=1000`).catch(() => [])))
        .then((pages) => {
          if (!alive) return
          const m = new Map<number, number>()
          for (const pg of pages) for (const k of pg as any[]) m.set(Math.floor(k[0] / 1000), +k[4])
          const s = sigmaOf([...m.keys()].sort((a, b) => a - b).map((t) => m.get(t)!))
          if (Number.isFinite(s)) feeds.current[c].sigma = s
        })
    }
    getJ(`https://gamma-api.polymarket.com/markets?limit=10&${COINS.map((c) => `slug=${c}-updown-5m-${start}`).join('&')}`).then((ms: J[]) => {
      if (!alive) return
      for (const m of ms) {
        const c = String(m.slug).split('-')[0] as Coin, toks = JSON.parse(m.clobTokenIds ?? '[]'), outs = JSON.parse(m.outcomes ?? '[]')
        mk.current[c] = { id: m.id, up: toks[outs.indexOf('Up')] ?? toks[0], down: toks[outs.indexOf('Down')] ?? toks[1] }
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [start])

  // every second: spot for all four coins (one request) -> z, appended to the comet's trail
  useEffect(() => {
    if (DEMO) return
    const id = setInterval(async () => {
      try {
        const ps: J[] = await getJ(`${BIN}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(COINS.map((c) => c.toUpperCase() + 'USDT')))}`)
        const t = Date.now() / 1000, el = t - start
        for (const p of ps) {
          const c = String(p.symbol).replace('USDT', '').toLowerCase(), f = feeds.current[c]; if (!f) continue
          f.px = +p.price
          const z = f.open && f.sigma ? pmcZ(f.open, f.px, f.sigma, Math.max(1, start + W - t)) : NaN
          if (Number.isFinite(z) && el >= 0 && el <= W) { f.trail.push([el, z]); if (f.trail.length > 400) f.trail.shift() }
        }
        setSpotOk(true); bump((x) => x + 1)
      } catch { setSpotOk(false) }
    }, 1000)
    return () => clearInterval(id)
  }, [start])

  // every 2 s: the real Polymarket books of the four windows (Up and Down)
  useEffect(() => {
    if (DEMO) return
    const id = setInterval(async () => {
      const toks = COINS.flatMap((c) => [mk.current[c]?.up, mk.current[c]?.down]).filter(Boolean) as string[]
      if (!toks.length) return
      try {
        const bs: J[] = await getJ('https://clob.polymarket.com/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(toks.map((token_id) => ({ token_id }))) })
        for (const b of bs) {
          const ask = Math.min(...(b.asks ?? []).map((x: J) => +x.price), 9), bid = Math.max(0, ...(b.bids ?? []).map((x: J) => +x.price))
          for (const c of COINS) {
            const m = mk.current[c]; if (!m) continue
            if (b.asset_id === m.up) { m.upAsk = ask < 9 ? ask : undefined; m.upBid = bid || undefined }
            if (b.asset_id === m.down) { m.downAsk = ask < 9 ? ask : undefined; m.downBid = bid || undefined }
          }
        }
      } catch { /* keep last */ }
    }, 2000)
    return () => clearInterval(id)
  }, [start])

  return { now, start, feeds: feeds.current, mk: mk.current, spotOk }
}

// ── sound (opt-in, WebAudio, no files) ────────────────────────────────────────────────────────────────────────────────
let actx: AudioContext | null = null
function chime(kind: 'enter' | 'win' | 'loss') {
  try {
    actx ??= new AudioContext()
    const notes = kind === 'enter' ? [523, 784] : kind === 'win' ? [659, 880, 1319] : [196, 147]
    notes.forEach((f, i) => {
      const o = actx!.createOscillator(), g = actx!.createGain(), t = actx!.currentTime + i * 0.11
      o.type = kind === 'loss' ? 'sawtooth' : 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'loss' ? 0.05 : 0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      o.connect(g).connect(actx!.destination); o.start(t); o.stop(t + 0.55)
    })
  } catch { /* no audio */ }
}

// ── 3D pieces ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function circlePts(r: number, seg = 96, a0 = 0, a1 = 2 * Math.PI) {
  const p: [number, number, number][] = []
  for (let i = 0; i <= seg; i++) { const a = a0 + ((a1 - a0) * i) / seg; p.push([r * Math.cos(a), 0, -r * Math.sin(a)]) }
  return p
}
const arcPts = (r: number, el0: number, el1: number) => circlePts(r, 40, ang(el0), ang(el1))

type Fx = { id: number; coin: Coin; kind: 'enter' | 'win' | 'loss'; t0: number }

function Disc({ coin, at, feed, entered, fx, focus, onPick }: { coin: Coin; at: [number, number, number]; feed: Feed; entered: J | null; fx: Fx[]; focus: boolean; onPick: () => void }) {
  const hand = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null), halo = useRef<THREE.Mesh>(null)
  const last = feed.trail[feed.trail.length - 1]
  const z = last ? last[1] : null
  const c = zCol(z)
  const trail = useMemo(() => feed.trail.slice(-240).map(([el, zz]) => xz(rOf(zz), el)), [feed.trail.length, last?.[0]])
  const target = useRef(new THREE.Vector3())
  useFrame((s, dt) => {
    const el = (Date.now() / 1000) % W
    if (hand.current) hand.current.rotation.y = -(2 * Math.PI * el) / W
    if (head.current && last) {
      target.current.set(...xz(rOf(last[1]), Math.min(el, last[0] + 1.2)))
      head.current.position.lerp(target.current, 1 - Math.exp(-dt * 6))
    }
    if (halo.current) { const k = 1 + Math.sin(s.clock.elapsedTime * 3) * (reduced ? 0 : 0.18); halo.current.scale.setScalar(k) }
  })
  const zin = rOf(-PMC.zMin), zout = rOf(PMC.zMin)
  return (
    <group position={at} onClick={(e) => { e.stopPropagation(); onPick() }}>
      {/* glass disc + the two halves: inside = below the open (red tint), outside band = above */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}><circleGeometry args={[R0, 64]} /><meshBasicMaterial color="#ff4d6d" transparent opacity={0.06} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}><ringGeometry args={[R0, rOf(ZMAX), 64]} /><meshBasicMaterial color={GREEN} transparent opacity={0.05} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03}><circleGeometry args={[rOf(ZMAX) + 0.18, 64]} /><meshBasicMaterial color="#0a1630" transparent opacity={0.55} /></mesh>
      <Line points={circlePts(R0)} color={GOLD} lineWidth={1.6} dashed dashSize={0.08} gapSize={0.06} />
      <Line points={circlePts(zout)} color={GREEN} lineWidth={1.1} transparent opacity={0.8} dashed dashSize={0.03} gapSize={0.07} />
      <Line points={circlePts(zin)} color={GREEN} lineWidth={1.1} transparent opacity={0.8} dashed dashSize={0.03} gapSize={0.07} />
      {/* clock ticks: one per minute */}
      {[0, 60, 120, 180, 240].map((el) => <Line key={el} points={[xz(rOf(ZMAX) + 0.02, el), xz(rOf(ZMAX) + 0.16, el)]} color="#6f8bb0" lineWidth={1.4} />)}
      {/* the entry gate */}
      <Line points={arcPts(rOf(ZMAX) + 0.09, GATE[0], GATE[1])} color={CYAN} lineWidth={7} transparent opacity={0.35} />
      <Line points={arcPts(rOf(ZMAX) + 0.09, GATE[0], GATE[1])} color="#bff2ff" lineWidth={2} />
      {/* the clock hand */}
      <group ref={hand}><Line points={[[0, 0.01, 0], [0, 0.01, -(rOf(ZMAX) + 0.12)]]} color="#ffffff" lineWidth={1} transparent opacity={0.35} /></group>
      {/* the comet: trail + head */}
      {trail.length > 1 && <Line points={trail} color={c} lineWidth={focus ? 3.2 : 2.4} transparent opacity={0.85} />}
      {last && (
        <group ref={head} position={xz(rOf(last[1]), last[0])}>
          <mesh ref={halo}><sphereGeometry args={[0.13, 20, 20]} /><meshBasicMaterial color={c} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
          <mesh><sphereGeometry args={[0.055, 16, 16]} /><meshBasicMaterial color="#f4fffb" /></mesh>
          <pointLight color={c} intensity={2} distance={1.6} />
        </group>
      )}
      {/* centre: the coin */}
      <mesh position-y={0.02}><sphereGeometry args={[0.16, 24, 24]} /><meshStandardMaterial color={HUE[coin]} emissive={HUE[coin]} emissiveIntensity={entered ? 1.4 : 0.6} /></mesh>
      {entered && <Line points={circlePts(0.26)} color={GREEN} lineWidth={2.5} />}
      {fx.map((f) => <Burst key={f.id} f={f} />)}
      <Html position={[0, 0, -(rOf(ZMAX) + 0.4)]} center zIndexRange={[10, 0]}>
        <div dir="rtl" onClick={(e) => { e.stopPropagation(); onPick() }} style={{ cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'system-ui,sans-serif', fontSize: focus ? 14 : 12, fontWeight: 700, color: '#e6f1ff', padding: '2px 9px', borderRadius: 999, background: 'rgba(6,12,24,.7)', border: `1px solid ${entered ? GREEN : 'rgba(140,190,255,.25)'}`, boxShadow: entered ? `0 0 14px ${GREEN}88` : 'none' }}>
          {SYM[coin]} {COIN_HE[coin]} <span style={{ color: c }}>{z == null ? '—' : z.toFixed(2)}</span>
        </div>
      </Html>
    </group>
  )
}

function Burst({ f }: { f: Fx }) {
  const g = useRef<THREE.Group>(null)
  const parts = useMemo(() => Array.from({ length: f.kind === 'win' ? 26 : 1 }, () => [Math.random() * Math.PI * 2, 0.6 + Math.random() * 0.9, 1 + Math.random() * 1.5]), [f.id])
  useFrame(() => {
    const t = (performance.now() - f.t0) / 1000
    if (!g.current) return
    g.current.visible = t < 2.4
    g.current.children.forEach((m, i) => {
      if (f.kind === 'win') { const [a, sp, up] = parts[i]; m.position.set(Math.cos(a) * sp * t, up * t - 0.9 * t * t, Math.sin(a) * sp * t); m.rotation.y = t * 6 }
      else { m.scale.setScalar(0.2 + t * (f.kind === 'enter' ? 1.2 : 1.8)); ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 0.45) }
    })
  })
  return (
    <group ref={g}>
      {f.kind === 'win'
        ? parts.map((_, i) => <mesh key={i}><cylinderGeometry args={[0.05, 0.05, 0.012, 14]} /><meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={1.2} metalness={0.8} roughness={0.2} /></mesh>)
        : <mesh rotation-x={-Math.PI / 2}><ringGeometry args={[0.9, 1, 64]} /><meshBasicMaterial color={f.kind === 'enter' ? CYAN : RED} transparent opacity={0.9} side={THREE.DoubleSide} /></mesh>}
    </group>
  )
}

function CameraRig({ focus, spots }: { focus: Coin | null; spots: Record<Coin, [number, number, number]> }) {
  const { camera, size } = useThree()
  const narrow = size.width < size.height
  const look = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const p = focus ? spots[focus] : [0, 0, 0]
    const dist = focus ? (narrow ? 5.6 : 4.2) : narrow ? 14.5 : 8.5
    const want = new THREE.Vector3(p[0], p[1] + dist * 0.9, p[2] + dist * 0.62)
    const k = 1 - Math.exp(-dt * 2.5)
    camera.position.lerp(want, k)
    look.current.lerp(new THREE.Vector3(p[0], p[1], p[2] - (focus ? 0.15 : 0.4)), k)
    camera.lookAt(look.current)
  })
  return null
}

// ── reactor: the account ──────────────────────────────────────────────────────────────────────────────────────────────
function Reactor({ equity, start, floor, closed, pulse }: { equity: number; start: number; floor: number; closed: J[]; pulse: { t: number; c: string } }) {
  const core = useRef<THREE.Mesh>(null), shell = useRef<THREE.Group>(null)
  const room = Math.max(0, Math.min(1, (equity - floor) / Math.max(1, 0.1 * equity)))
  const lit = Math.round(room * 36)
  useFrame((s, dt) => {
    if (shell.current) shell.current.rotation.y += dt * 0.15
    if (core.current) {
      const f = Math.max(0, 1 - (performance.now() - pulse.t) / 1500)
      const m = core.current.material as THREE.MeshStandardMaterial
      m.emissive.set(equity >= start ? GREEN : RED).lerp(new THREE.Color(pulse.c), f)
      m.emissiveIntensity = 1.2 + Math.sin(s.clock.elapsedTime * 2) * 0.2 + f * 2
      core.current.scale.setScalar(0.9 + Math.max(-0.3, Math.min(0.5, (equity / start - 1) * 5)) + f * 0.15)
    }
  })
  const last = closed.slice(0, 14)
  return (
    <group>
      <mesh ref={core}><icosahedronGeometry args={[0.9, 3]} /><meshStandardMaterial color="#0b2a22" emissive={GREEN} roughness={0.25} metalness={0.4} /></mesh>
      <group ref={shell}>
        {Array.from({ length: 36 }, (_, k) => { const a = (k / 36) * Math.PI * 2; const on = k < lit; return (
          <mesh key={k} position={[Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1]} rotation-y={-a}>
            <boxGeometry args={[0.14, on ? 0.5 : 0.28, 0.32]} />
            <meshStandardMaterial color={on ? GREEN : '#1b2740'} emissive={on ? GREEN : '#000'} emissiveIntensity={on ? 1.1 : 0} transparent opacity={on ? 0.95 : 0.5} />
          </mesh>) })}
      </group>
      <Line points={circlePts(1.6, 96)} color={CYAN} lineWidth={1} dashed dashSize={0.1} gapSize={0.12} transparent opacity={0.6} />
      {last.map((t, i) => { const a = (i / Math.max(1, last.length)) * Math.PI * 2 - Math.PI / 2, win = n(t.pnl) > 0; return (
        <group key={t.id} position={[Math.cos(a) * 3, 0.15, Math.sin(a) * 3]}>
          <mesh><sphereGeometry args={[0.16, 18, 18]} /><meshStandardMaterial color={win ? GOLD : RED} emissive={win ? GOLD : RED} emissiveIntensity={0.9} /></mesh>
          <Html position={[0, 0.34, 0]} center zIndexRange={[5, 0]}><div style={{ fontSize: 10.5, fontWeight: 700, color: win ? '#ffe7a6' : '#ffb3b3', fontFamily: 'system-ui', whiteSpace: 'nowrap', direction: 'ltr' }}>{usd(n(t.pnl))}</div></Html>
        </group>) })}
    </group>
  )
}

class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  render() { return this.state.bad ? this.props.fallback : this.props.children }
}

// ── the page ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function PolyOrbit({ d, onClassic, onArena, extra }: { d: PolyLive; onClassic: () => void; onArena: () => void; extra?: ReactNode }) {
  const { now, start, feeds, mk, spotOk } = useWindowFeeds()
  const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
  const [view, setView] = useState<'orbit' | 'reactor'>(qs.get('orbit') === 'reactor' ? 'reactor' : 'orbit')
  const [focus, setFocus] = useState<Coin | null>(qs.get('focus') === 'all' ? null : ((COINS as readonly string[]).includes(qs.get('focus') ?? '') ? qs.get('focus') as Coin : 'btc'))
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('orbit-sound') === '1' } catch { return false } })
  const [fx, setFx] = useState<Fx[]>([])
  const [toast, setToast] = useState<{ text: string; c: string; at: number } | null>(null)
  const pulse = useRef({ t: 0, c: GOLD })
  const fxId = useRef(1)
  const st = d.st
  const el = now / 1000 - start, leftS = W - el
  const spots = { btc: [-1.95, 0, -1.95], eth: [1.95, 0, -1.95], sol: [-1.95, 0, 1.95], xrp: [1.95, 0, 1.95] } as Record<Coin, [number, number, number]>

  // the bot's own entries for THIS window, and fresh entries / results -> effects
  const winTrades = useMemo(() => Object.fromEntries(COINS.map((c) => [c, d.trades.find((t) => t.slug === `${c}-updown-5m-${start}`) ?? null])) as Record<Coin, J | null>, [d.trades, start])
  const seen = useRef<{ init: boolean; open: Set<string>; closed: Set<string> }>({ init: false, open: new Set(), closed: new Set() })
  useEffect(() => {
    if (!st) return
    const s = seen.current
    const fire = (coin: Coin, kind: Fx['kind'], text: string, c: string) => {
      setFx((x) => [...x.slice(-12), { id: fxId.current++, coin, kind, t0: performance.now() }])
      setToast({ text, c, at: Date.now() }); pulse.current = { t: performance.now(), c }
      if (sound) { chime(kind); navigator.vibrate?.(kind === 'loss' ? [60, 40, 60] : 35) }
    }
    for (const t of d.trades) {
      const id = String(t.id), coin = (t.meta?.coin ?? String(t.slug).split('-')[0]) as Coin
      if (!COINS.includes(coin)) continue
      if (!s.open.has(id)) { s.open.add(id); if (s.init && t.status === 'OPEN') fire(coin, 'enter', `🚀 נכנסנו: ${COIN_HE[coin]} "${t.outcome_he ?? t.outcome}" ב־${Math.round(n(t.entry_px) * 100)}¢ · $${n(t.cost).toFixed(0)}`, CYAN) }
      if (t.status === 'CLOSED' && !s.closed.has(id)) { s.closed.add(id); if (s.init) { const win = n(t.pnl) > 0; fire(coin, win ? 'win' : 'loss', win ? `🏆 ${COIN_HE[coin]}: ניצחון ${usd(n(t.pnl))}` : `💥 ${COIN_HE[coin]}: הפסד ${usd(n(t.pnl))}`, win ? GOLD : RED) } }
    }
    s.init = true
  }, [d.trades, st])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5000); return () => clearTimeout(id) }, [toast?.at])

  const zNow = (c: Coin) => { const tr = feeds[c]?.trail; return tr?.length ? tr[tr.length - 1][1] : null }
  const fav = (c: Coin) => { const m = mk[c]; if (!m?.upAsk && !m?.downAsk) return null; const up = n(m.upAsk), dn = n(m.downAsk); return up >= dn ? { side: 'עולה', ask: up, zSign: 1 } : { side: 'יורד', ask: dn, zSign: -1 } }
  const story = (c: Coin) => {
    const t = winTrades[c], f = fav(c), z = zNow(c)
    if (t) return t.status === 'OPEN'
      ? { c: GREEN, text: `🚀 הבוט בפנים: ${n(t.qty).toFixed(0)} מניות "${t.outcome_he ?? t.outcome}" ב־${Math.round(n(t.entry_px) * 100)}¢. אם ${t.outcome === 'Up' ? 'יסיים מעל' : 'יסיים מתחת'} לקו הפתיחה: +${usd(n(t.qty) - n(t.cost))}` }
      : { c: n(t.pnl) > 0 ? GOLD : RED, text: n(t.pnl) > 0 ? `🏆 העסקה בחלון הזה הסתיימה ברווח ${usd(n(t.pnl))}` : `💥 העסקה בחלון הזה הפסידה ${usd(n(t.pnl))} — הרצפה המוגנת שומרת על החשבון` }
    if (el < GATE[0]) return { c: '#9fb3c8', text: `השער נפתח בעוד ${mmss(GATE[0] - el)}. הבוט ייכנס רק אם המחיר יהיה בין ${Math.round(RULE.lo * 100)} ל־${Math.round(RULE.hi * 100)} סנט והשביט יחצה את הטבעת הירוקה.` }
    if (el <= GATE[1]) {
      if (!f) return { c: '#9fb3c8', text: 'השער פתוח · ממתין למחירי Polymarket' }
      if (f.ask < RULE.lo || f.ask >= RULE.hi) return { c: '#9fb3c8', text: `השער פתוח · "${f.side}" ב־${Math.round(f.ask * 100)}¢ — מחוץ לטווח ${Math.round(RULE.lo * 100)}–${Math.round(RULE.hi * 100)}¢` }
      const zs = z == null ? null : f.zSign * z
      if (zs == null || zs < PMC.zMin) return { c: GOLD, text: `⏳ השער פתוח והמחיר בטווח (${Math.round(f.ask * 100)}¢), אבל השביט קרוב מדי לקו: ${zs == null ? '—' : zs.toFixed(2)} מתוך ${PMC.zMin}` }
      return { c: GREEN, text: `✨ השביט מעבר לטבעת הירוקה בתוך השער (${zs.toFixed(2)}) והמחיר בטווח — אם החלון עוד לא תפוס, הבוט נכנס עכשיו` }
    }
    return { c: '#9fb3c8', text: 'השער נסגר. מחכים לחלון הבא.' }
  }

  // account (?orbitdemo=1 without a loaded state: fixed sample numbers so the reactor can be checked visually)
  const demoAcct = DEMO && !st
  const equity = demoAcct ? 1013.48 : d.equity, start$ = demoAcct ? 1000 : d.start, peak = Math.max(n(st?.peak), equity, start$)
  const floor = n(st?.floor) || pmcFloor(start$, peak)
  const room = Math.max(0, equity - floor), stake = Math.min(equity * PMC.maxPosFrac, room / PMC.lossesToFloor)
  const closed = demoAcct ? [1.78, 1.12, 2.05, 0.41, 1.66, 3.02, 0.89, -30.1, 1.2].map((p, i) => ({ id: i, pnl: p, meta: { coin: 'btc' } }))
    : d.closed.filter((t) => COINS.includes((t.meta?.coin ?? '') as Coin))
  let streak = 0; for (const t of closed) { if (n(t.pnl) > 0) streak++; else break }

  const glass = { background: 'rgba(10,18,36,.62)', border: '1px solid rgba(140,190,255,.2)', borderRadius: 16, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#e6f1ff' } as const
  const lab = { color: '#8fb0d8', fontSize: 11.5 } as const
  const btn = { background: 'rgba(76,201,240,.12)', border: '1px solid rgba(76,201,240,.4)', color: '#cfe8ff', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, cursor: 'pointer' } as const
  const focusStory = story(focus ?? 'btc')
  const toggleSound = () => { const v = !sound; setSound(v); try { localStorage.setItem('orbit-sound', v ? '1' : '0') } catch { /* private */ } ; if (v) chime('enter') }

  return (
    <div dir="rtl" style={{ position: 'relative', width: '100%', height: '100dvh', minHeight: 600, overflow: 'hidden', background: `radial-gradient(ellipse at 50% 40%, #0d1b3a 0%, ${INK} 70%)`, fontFamily: 'system-ui,sans-serif' }}>
      <GlBoundary fallback={<div style={{ ...glass, position: 'absolute', inset: '40% 16px auto', padding: 16, textAlign: 'center' }}>הדפדפן לא תומך בתלת־ממד. <button style={btn} onClick={onClassic}>לתצוגה הקלאסית</button></div>}>
        <Canvas dpr={[1, 1.75]} camera={{ position: [0, 9, 6], fov: 50 }} gl={{ antialias: true }} onPointerMissed={() => view === 'orbit' && setFocus(null)}>
          <color attach="background" args={[INK]} />
          <fog attach="fog" args={[INK, 12, 30]} />
          <ambientLight intensity={0.5} />
          <pointLight position={[0, 6, 0]} intensity={30} color="#9fd8ff" />
          <Stars radius={60} depth={30} count={2200} factor={3} fade speed={reduced ? 0 : 0.5} />
          {view === 'orbit' ? (
            <>
              {COINS.map((c) => <Disc key={c + start} coin={c} at={spots[c]} feed={feeds[c] ?? { open: null, px: null, sigma: null, trail: [] }} entered={winTrades[c]?.status === 'OPEN' ? winTrades[c] : null} fx={fx.filter((f) => f.coin === c)} focus={focus === c} onPick={() => setFocus(focus === c ? null : c)} />)}
              <CameraRig focus={focus} spots={spots} />
            </>
          ) : (
            <>
              <Reactor equity={equity} start={start$} floor={floor} closed={closed} pulse={pulse.current} />
              <CameraRig focus={null} spots={spots} />
            </>
          )}
        </Canvas>
      </GlBoundary>

      {/* top HUD */}
      <div style={{ position: 'absolute', top: 10, insetInline: 10, display: 'grid', gap: 8, pointerEvents: 'none' }}>
        <div style={{ ...glass, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, textShadow: `0 0 14px ${CYAN}88` }}>{view === 'orbit' ? '◎ מסלול' : '⬢ כור החשבון'} · פולי מטבעות</div>
            <div style={lab}>חלון {new Date(start * 1000).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} · בוט {st?.last_scan ? ago(now - Date.parse(st.last_scan)) : '—'} · {spotOk === false ? <b style={{ color: RED }}>אין מחיר מבינאנס</b> : 'מחיר כל שנייה'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, direction: 'ltr', textShadow: `0 0 16px ${el >= GATE[0] && el <= GATE[1] ? CYAN : '#000'}`, color: el >= GATE[0] && el <= GATE[1] ? '#bff2ff' : '#fff' }}>{mmss(leftS)}</div>
            <div style={lab}>{el >= GATE[0] && el <= GATE[1] ? 'השער פתוח' : 'לסיום החלון'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
          <button style={{ ...btn, background: view === 'orbit' ? 'rgba(76,201,240,.3)' : btn.background }} onClick={() => setView('orbit')}>◎ מסלול</button>
          <button style={{ ...btn, background: view === 'reactor' ? 'rgba(61,220,151,.3)' : btn.background, borderColor: 'rgba(61,220,151,.5)' }} onClick={() => setView('reactor')}>⬢ כור</button>
          <button style={btn} onClick={toggleSound}>{sound ? '🔊 צליל' : '🔈 צליל כבוי'}</button>
          <button style={btn} onClick={onArena}>✦ זירה</button>
          <button style={btn} onClick={onClassic}>☰ טבלאות</button>
        </div>
        {view === 'orbit' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, pointerEvents: 'auto' }}>
            {COINS.map((c) => { const z = zNow(c), f = fav(c), t = winTrades[c]; return (
              <button key={c} onClick={() => setFocus(focus === c ? null : c)} style={{ ...glass, borderRadius: 12, padding: '6px 4px', cursor: 'pointer', textAlign: 'center', borderColor: focus === c ? CYAN : t ? GREEN : 'rgba(140,190,255,.2)' }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{SYM[c]} {COIN_HE[c]}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: zCol(z), direction: 'ltr' }}>{z == null ? '—' : z.toFixed(2)}</div>
                <div style={{ ...lab, fontSize: 10.5 }}>{t ? (t.status === 'OPEN' ? '🚀 בפנים' : n(t.pnl) > 0 ? '🏆' : '💥') : f ? `${f.side} ${Math.round(f.ask * 100)}¢` : '—'}</div>
              </button>) })}
          </div>
        )}
      </div>

      {/* toast */}
      {toast && <div style={{ ...glass, position: 'absolute', top: '42%', insetInline: 24, padding: '12px 16px', textAlign: 'center', fontSize: 16, fontWeight: 800, color: toast.c, border: `1px solid ${toast.c}`, boxShadow: `0 0 40px ${toast.c}66`, animation: reduced ? 'none' : 'orb-pop .45s ease-out', pointerEvents: 'none' }}>{toast.text}</div>}

      {/* bottom */}
      <div style={{ position: 'absolute', bottom: 10, insetInline: 10, display: 'grid', gap: 8 }}>
        {view === 'orbit' ? (
          <div style={{ ...glass, padding: '11px 14px', border: `1px solid ${focusStory.c}66`, boxShadow: `0 0 26px ${focusStory.c}22` }}>
            <div style={{ ...lab, marginBottom: 3 }}>{focus ? `${SYM[focus]} ${COIN_HE[focus]}` : 'כל המטבעות · לחיצה על דיסק מתקרבת אליו'}</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: '#e6f1ff' }}>{focusStory.text}</div>
            <div style={{ ...lab, marginTop: 6 }}>● שביט = המחיר · טבעת זהב = מחיר הפתיחה · טבעות ירוקות = מרחק {PMC.zMin} · קשת תכלת = שער הכניסה · סיבוב = 5 דקות</div>
          </div>
        ) : (
          <div style={{ ...glass, padding: '11px 14px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, textAlign: 'center' }}>
            <div><div style={lab}>שווי</div><div style={{ fontSize: 17, fontWeight: 800, color: col(equity - start$), direction: 'ltr' }}>{st || demoAcct ? usd(equity) : 'טוען…'}</div></div>
            <div><div style={lab}>מעל הרצפה</div><div style={{ fontSize: 17, fontWeight: 800, color: GREEN, direction: 'ltr' }}>{usd(room)}</div><div style={{ ...lab, fontSize: 10 }}>רצפה {usd(floor)}</div></div>
            <div><div style={lab}>העסקה הבאה</div><div style={{ fontSize: 17, fontWeight: 800, direction: 'ltr' }}>{usd(stake)}</div></div>
            <div><div style={lab}>רצף</div><div style={{ fontSize: 17, fontWeight: 800, color: GOLD }}>{streak} 🔥</div><div style={{ ...lab, fontSize: 10 }}>{closed.filter((t) => n(t.pnl) > 0).length}/{closed.length} ניצחונות</div></div>
          </div>
        )}
        {extra}
      </div>
      <style>{'@keyframes orb-pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}'}</style>
    </div>
  )
}
