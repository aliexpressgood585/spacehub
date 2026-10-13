// "זירת ההסתברות" — the Polymarket paper desk as a live 3D arena (owner 2026-10-13: "turn the whole display into 3D, all
// live, be creative, surprise me"). DISPLAY ONLY: every number comes from ../polyLive.ts (the bot's booked state + the
// public Polymarket feeds), nothing here decides or books anything.
//
// The picture:
//  - every open position is a glass tube standing on the arena floor. Height = probability: the floor is 0¢, the gold
//    ring on top is $1 (the win). A glowing orb floats at the live best bid and the tube fills like a thermometer up to it;
//    the white ring is the entry price, the faint blue band the 85-92¢ buy zone. Green above entry, red below.
//  - every live price change from the Polymarket socket fires a spark from that orb into the core.
//  - the ring at a tube's base is its clock: the share of the entry window left until the market's end time; it turns
//    violet and pulses once the time is up and the market waits for its official result.
//  - official result (Gamma, within ~3 s): a win shoots the orb through the gold ring and showers coins into the core,
//    a loss drops it and cracks the floor. A new entry descends as a beam of light.
//  - the core in the middle is the account: size follows equity vs the $1,000 start, colour follows the P&L.
//  - closed trades stand as crystals on the outer ring (gold = win, red = loss); the outermost halo is the equity history.
//  - the radar sweep on the floor completes one turn per bot cycle (~15 s) and restarts when the bot publishes a new scan.
import { Component, createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { type PolyLive, type J, n, usd, cents, left, ago, col, when, useNow } from '../polyLive'

const H = 6                      // tube height: 0¢ at the floor, $1 at the top
const GREEN = '#3ddc97', RED = '#ff6b6b', GOLD = '#ffd166', CYAN = '#4cc9f0', VIOLET = '#b388ff', INK = '#04070E'
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type Fx = { id: number; kind: 'win' | 'loss' | 'enter' | 'sell'; pos: [number, number, number]; t0: number }
type Toast = { id: number; kind: Fx['kind']; text: string; at: number }
type Pos = Record<string, [number, number]>
const NowCtx = createContext(Date.now())
const short = (s?: string, k = 26) => (!s ? '—' : s.length > k ? s.slice(0, k - 1) + '…' : s)

// ── layout: one ring up to 10 tubes, two rings beyond ─────────────────────────────────────────────────────────────────
function layout(open: J[]): Pos {
  const ids = open.map((t) => String(t.id)).sort((a, b) => +a - +b), N = ids.length, out: Pos = {}
  const inner = N > 10 ? Math.ceil(N / 2) : N
  ids.forEach((id, i) => {
    const ring = i < inner ? 0 : 1, k = ring ? N - inner : inner, j = ring ? i - inner : i
    const r = ring ? 6.9 : N > 10 ? 4.4 : 5.2, a = (j / Math.max(1, k)) * Math.PI * 2 + (ring ? Math.PI / k : 0)
    out[id] = [Math.sin(a) * r, Math.cos(a) * r]
  })
  return out
}

// ── the core: the account ──────────────────────────────────────────────────────────────────────────────────────────────
function Core({ equity, start, flash }: { equity: number; start: number; flash: React.MutableRefObject<{ t: number; c: string }> }) {
  const g = useRef<THREE.Group>(null), inner = useRef<THREE.Mesh>(null), shell = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null)
  const up = equity >= start, base = new THREE.Color(up ? GREEN : RED)
  const target = 0.75 + Math.max(-0.35, Math.min(0.6, (equity / start - 1) * 4))
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    if (g.current) { const k = THREE.MathUtils.lerp(g.current.scale.x, target, 1 - Math.exp(-dt * 2)); g.current.scale.setScalar(k) }
    if (shell.current) { shell.current.rotation.y += dt * 0.25; shell.current.rotation.x += dt * 0.1 }
    if (ring.current) ring.current.rotation.z += dt * 0.6
    const f = Math.max(0, 1 - (performance.now() - flash.current.t) / 1600)
    if (inner.current) {
      const m = inner.current.material as THREE.MeshStandardMaterial
      m.emissive.copy(base).lerp(new THREE.Color(flash.current.c), f)
      m.emissiveIntensity = 1.1 + Math.sin(t * 2) * 0.15 + f * 2.5
    }
  })
  return (
    <group ref={g} position={[0, 2.4, 0]}>
      <mesh ref={inner}><sphereGeometry args={[0.85, 48, 48]} /><meshStandardMaterial color={INK} emissive={base} emissiveIntensity={1.2} roughness={0.3} /></mesh>
      <mesh scale={1.35}><sphereGeometry args={[0.85, 32, 32]} /><meshBasicMaterial color={base} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <mesh ref={shell}><icosahedronGeometry args={[1.35, 1]} /><meshBasicMaterial color={base} wireframe transparent opacity={0.35} /></mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[1.85, 0.02, 8, 96]} /><meshBasicMaterial color={GOLD} transparent opacity={0.6} /></mesh>
    </group>
  )
}

// ── one position = one glass tube ──────────────────────────────────────────────────────────────────────────────────────
function Tube({ t, px, pos, resolved, selected, onSelect, ticks, windowH, big }: {
  big: boolean; t: J; px: number; pos: [number, number]; resolved?: number; selected: boolean; onSelect: () => void
  ticks: React.MutableRefObject<Record<string, number>>; windowH: number
}) {
  const now = useContext(NowCtx)
  const g = useRef<THREE.Group>(null), orb = useRef<THREE.Mesh>(null), halo = useRef<THREE.Mesh>(null), fill = useRef<THREE.Mesh>(null), clock = useRef<THREE.Mesh>(null)
  const born = useRef(performance.now()), y = useRef(n(t.entry_px) * H)
  const entry = n(t.entry_px), pnl = n(t.qty) * px - n(t.cost)
  const color = resolved === 1 ? GOLD : resolved === 0 ? RED : px >= entry ? GREEN : RED
  const remain = (Date.parse(t.end_time) - now) / 1000, late = remain <= 0
  const frac = late ? 1 : Math.max(0.02, Math.min(1, remain / (Math.max(1, windowH) * 3600)))
  const clockGeo = useMemo(() => new THREE.RingGeometry(0.5, 0.62, 64, 1, Math.PI / 2, Math.PI * 2 * Math.round(frac * 120) / 120), [Math.round(frac * 120)])
  useEffect(() => () => clockGeo.dispose(), [clockGeo])
  useFrame((s, dt) => {
    const k = 1 - Math.exp(-dt * 3), age = (performance.now() - born.current) / 1000
    if (g.current) {
      g.current.position.x = THREE.MathUtils.lerp(g.current.position.x, pos[0], k)
      g.current.position.z = THREE.MathUtils.lerp(g.current.position.z, pos[1], k)
      g.current.scale.y = reduced ? 1 : Math.min(1, age / 1.2)
    }
    const want = (resolved === 1 ? 1.08 : resolved === 0 ? 0.02 : px) * H
    y.current = THREE.MathUtils.lerp(y.current, want, 1 - Math.exp(-dt * 2.5))
    const pulse = Math.exp(-(performance.now() - (ticks.current[t.token_id] ?? 0)) / 350)
    if (orb.current) {
      orb.current.position.y = y.current
      const m = orb.current.material as THREE.MeshStandardMaterial
      m.emissive.set(color); m.emissiveIntensity = 1.4 + pulse * 3 + (selected ? 0.6 : 0)
      orb.current.scale.setScalar(1 + pulse * 0.35)
    }
    if (halo.current) { halo.current.position.y = y.current; halo.current.scale.setScalar(1 + pulse * 0.8 + Math.sin(s.clock.elapsedTime * 3) * 0.05) }
    if (fill.current) { fill.current.scale.y = Math.max(0.001, y.current); fill.current.position.y = y.current / 2 }
    if (clock.current) { const m = clock.current.material as THREE.MeshBasicMaterial; m.opacity = late ? 0.45 + Math.sin(s.clock.elapsedTime * 4) * 0.35 : 0.85 }
  })
  const clockCol = late ? VIOLET : remain < 1800 ? '#f0b84a' : CYAN
  return (
    <group ref={g} position={[pos[0], 0, pos[1]]} onClick={(e) => { e.stopPropagation(); onSelect() }}>
      <mesh position={[0, H / 2, 0]}><cylinderGeometry args={[0.34, 0.34, H, 32, 1, true]} /><meshStandardMaterial color="#9fd8ff" transparent opacity={selected ? 0.2 : 0.1} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <mesh position={[0, ((0.85 + 0.92) / 2) * H, 0]}><cylinderGeometry args={[0.36, 0.36, 0.07 * H, 32, 1, true]} /><meshBasicMaterial color={CYAN} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <mesh ref={fill}><cylinderGeometry args={[0.24, 0.24, 1, 24]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.32} depthWrite={false} /></mesh>
      <mesh position={[0, entry * H, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.4, 0.018, 8, 48]} /><meshBasicMaterial color="#ffffff" /></mesh>
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.44, 0.035, 10, 64]} /><meshBasicMaterial color={GOLD} /></mesh>
      <mesh ref={orb}><sphereGeometry args={[0.26, 32, 32]} /><meshStandardMaterial color={INK} emissive={color} emissiveIntensity={1.5} /></mesh>
      <mesh ref={halo}><sphereGeometry args={[0.5, 24, 24]} /><meshBasicMaterial color={color} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <mesh ref={clock} geometry={clockGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><meshBasicMaterial color={clockCol} transparent opacity={0.85} side={THREE.DoubleSide} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[0.5, 0.62, 64]} /><meshBasicMaterial color="#1c2738" transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>
      {/* drei Html is its own React root: stopPropagation keeps the click from reaching R3F, which would read it as a miss */}
      <Html position={[0, H + 0.95, 0]} center distanceFactor={big ? 16 : 10} zIndexRange={[20, 0]}>
        <div dir="rtl" onClick={(e) => { e.stopPropagation(); onSelect() }} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center', padding: '4px 8px', borderRadius: 8, background: 'rgba(8,14,26,.78)', border: `1px solid ${selected ? color : 'rgba(255,255,255,.12)'}`, color: '#e6edf5', fontFamily: 'system-ui,sans-serif', fontSize: 12, lineHeight: 1.35, boxShadow: selected ? `0 0 18px ${color}66` : 'none' }}>
          <div style={{ fontWeight: 700 }}>{short(t.outcome_he ?? t.outcome, 16)}</div>
          <div style={{ color: col(pnl), fontWeight: 700, direction: 'ltr' }}>{usd(pnl)} · {cents(px)}</div>
          <div style={{ color: resolved != null ? color : late ? VIOLET : '#8a97a8', fontSize: 11, direction: resolved != null || late ? 'rtl' : 'ltr' }}>
            {resolved === 1 ? 'הוכרע: ניצחון ✓' : resolved === 0 ? 'הוכרע: הפסד ✗' : late ? 'ממתין להכרעה' : left(t.end_time, now)}
          </div>
        </div>
      </Html>
    </group>
  )
}

// ── closed trades: crystals on the outer ring ──────────────────────────────────────────────────────────────────────────
function Trophies({ closed, onSelect, sel }: { closed: J[]; onSelect: (id: string) => void; sel: string | null }) {
  const g = useRef<THREE.Group>(null)
  const list = useMemo(() => [...closed].sort((a, b) => +a.id - +b.id), [closed])
  useFrame((s, dt) => { if (g.current && !reduced) { g.current.rotation.y -= dt * 0.03; g.current.children.forEach((c, i) => { c.rotation.y += dt * 1.2; c.position.y = 0.45 + Math.sin(s.clock.elapsedTime * 1.5 + i) * 0.08 }) } })
  return (
    <group ref={g}>
      {list.map((t, i) => {
        const a = (i / Math.max(12, list.length)) * Math.PI * 2, win = n(t.pnl) > 0, c = win ? GOLD : RED, on = sel === String(t.id)
        return (
          <mesh key={t.id} position={[Math.sin(a) * 8.6, 0.45, Math.cos(a) * 8.6]} scale={on ? 1.6 : 1} onClick={(e) => { e.stopPropagation(); onSelect(String(t.id)) }}>
            <octahedronGeometry args={[0.2, 0]} /><meshStandardMaterial color={INK} emissive={c} emissiveIntensity={on ? 3 : 1.6} />
          </mesh>
        )
      })}
    </group>
  )
}

// ── equity history as a halo around the arena ─────────────────────────────────────────────────────────────────────────
function EquityHalo({ hist, start, equity }: { hist: J[]; start: number; equity: number }) {
  const dot = useRef<THREE.Mesh>(null)
  const data = useMemo(() => {
    const raw = hist.map((x) => n(x.equity)).filter((v) => v > 0)
    if (raw.length < 2) return null
    const step = Math.max(1, Math.ceil(raw.length / 240)), v = raw.filter((_, i) => i % step === 0)
    if (v[v.length - 1] !== raw[raw.length - 1]) v.push(raw[raw.length - 1])
    v[v.length - 1] = equity
    const lo = Math.min(...v, start), hi = Math.max(...v, start), R = 10.5, span = Math.PI * 1.9
    const yOf = (x: number) => 0.6 + ((x - lo) / (hi - lo || 1)) * 3.2
    const pts = v.map((x, i) => { const a = -span / 2 + (i / (v.length - 1)) * span; return new THREE.Vector3(Math.sin(a + Math.PI) * R, yOf(x), Math.cos(a + Math.PI) * R) })
    const colors = v.map((x) => new THREE.Color(x >= start ? GREEN : RED))
    const base = Array.from({ length: 121 }, (_, i) => { const a = -span / 2 + (i / 120) * span; return new THREE.Vector3(Math.sin(a + Math.PI) * R, yOf(start), Math.cos(a + Math.PI) * R) })
    return { pts, colors, base, last: pts[pts.length - 1] }
  }, [hist, start, equity])
  useFrame((s) => { if (dot.current) dot.current.scale.setScalar(1 + Math.sin(s.clock.elapsedTime * 4) * 0.25) })
  if (!data) return null
  return (
    <group>
      <Line points={data.base} color="#3a4658" lineWidth={1} dashed dashSize={0.25} gapSize={0.2} />
      <Line points={data.pts} vertexColors={data.colors} lineWidth={2.4} />
      <mesh ref={dot} position={data.last}><sphereGeometry args={[0.13, 16, 16]} /><meshBasicMaterial color={equity >= start ? GREEN : RED} /></mesh>
    </group>
  )
}

// ── floor, radar sweep (one turn per bot cycle) and energy channels ───────────────────────────────────────────────────
function Floor({ lastScan, pos, colors }: { lastScan?: string; pos: Pos; colors: Record<string, string> }) {
  const sweep = useRef<THREE.Mesh>(null)
  const grid = useMemo(() => { const p = new THREE.PolarGridHelper(9.4, 24, 8, 96, '#16304a', '#0f2236'); (p.material as THREE.Material).transparent = true; (p.material as THREE.Material).opacity = 0.7; return p }, [])
  useFrame(() => {
    if (!sweep.current) return
    const ms = lastScan ? Date.now() - Date.parse(lastScan) : 0
    sweep.current.rotation.z = -((ms % 15000) / 15000) * Math.PI * 2
  })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}><circleGeometry args={[9.6, 96]} /><meshStandardMaterial color="#060c18" roughness={0.9} /></mesh>
      <primitive object={grid} position={[0, 0.005, 0]} />
      <mesh ref={sweep} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}><circleGeometry args={[9.4, 48, 0, 0.55]} /><meshBasicMaterial color={CYAN} transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      {Object.entries(pos).map(([id, p]) => (
        <Line key={id} points={[[p[0], 0.03, p[1]], [p[0] * 0.5, 0.03, p[1] * 0.5], [0, 0.03, 0]]} color={colors[id] ?? CYAN} lineWidth={1.2} transparent opacity={0.45} />
      ))}
    </group>
  )
}

// ── sparks: every live price change flies from its orb into the core ─────────────────────────────────────────────────
const SPARKS = 96
function Sparks({ queue }: { queue: React.MutableRefObject<{ from: THREE.Vector3; c: THREE.Color; t0: number }[]> }) {
  const mesh = useRef<THREE.InstancedMesh>(null), live = useRef<{ from: THREE.Vector3; c: THREE.Color; t0: number }[]>([])
  const m = useMemo(() => new THREE.Matrix4(), []), p = useMemo(() => new THREE.Vector3(), []), core = useMemo(() => new THREE.Vector3(0, 2.4, 0), [])
  useFrame(() => {
    if (!mesh.current) return
    const now = performance.now()
    while (queue.current.length) { live.current.push(queue.current.shift()!); if (live.current.length > SPARKS) live.current.shift() }
    live.current = live.current.filter((s) => now - s.t0 < 900)
    for (let i = 0; i < SPARKS; i++) {
      const s = live.current[i]
      if (!s) { m.makeScale(0, 0, 0); mesh.current.setMatrixAt(i, m); continue }
      const u = (now - s.t0) / 900, ctrl = s.from.clone().lerp(core, 0.5).setY(Math.max(s.from.y, core.y) + 1.6)
      p.copy(s.from).multiplyScalar((1 - u) * (1 - u)).addScaledVector(ctrl, 2 * u * (1 - u)).addScaledVector(core, u * u)
      const k = 1 - u * 0.6
      m.makeScale(k, k, k).setPosition(p); mesh.current.setMatrixAt(i, m); mesh.current.setColorAt(i, s.c)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[undefined, undefined, SPARKS]}><sphereGeometry args={[0.07, 8, 8]} /><meshBasicMaterial toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} /></instancedMesh>
}

// ── one-off effects: win shower, loss crack, entry beam, early sell ───────────────────────────────────────────────────
function Burst({ fx, onDone }: { fx: Fx; onDone: () => void }) {
  const N = fx.kind === 'win' ? 80 : fx.kind === 'loss' ? 50 : fx.kind === 'sell' ? 30 : 0
  const parts = useRef<THREE.InstancedMesh>(null), wave = useRef<THREE.Mesh>(null), beam = useRef<THREE.Mesh>(null)
  const seeds = useMemo(() => Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, v: 1.2 + Math.random() * 2.4, up: 1.5 + Math.random() * 3.5, s: 0.7 + Math.random() * 0.7, d: Math.random() * 0.25 })), [N])
  const m = useMemo(() => new THREE.Matrix4(), []), q = useMemo(() => new THREE.Quaternion(), []), e = useMemo(() => new THREE.Euler(), [])
  const v = useMemo(() => new THREE.Vector3(), []), sc = useMemo(() => new THREE.Vector3(), []), core = useMemo(() => new THREE.Vector3(0, 2.4, 0), [])
  const dur = reduced ? 1000 : fx.kind === 'enter' ? 2000 : 3200
  const c = fx.kind === 'win' ? GOLD : fx.kind === 'loss' ? RED : fx.kind === 'sell' ? '#f0b84a' : CYAN
  useFrame(() => {
    const u = (performance.now() - fx.t0) / dur
    if (u >= 1) { onDone(); return }
    const [x, y, z] = fx.pos
    if (parts.current) {
      seeds.forEach((s, i) => {
        const t = Math.max(0, u - s.d) / (1 - s.d), tt = t * dur / 1000
        // first 40%: burst out of the orb; then (wins and sales) every coin homes into the core
        const bx = x + Math.cos(s.a) * s.v * Math.min(tt, 1.2), bz = z + Math.sin(s.a) * s.v * Math.min(tt, 1.2)
        const by = fx.kind === 'loss' ? Math.max(0.06, y + s.up * 0.3 * tt - 4.9 * tt * tt) : y + s.up * Math.min(tt, 1.2) - 2.2 * Math.min(tt, 1.2) ** 2
        v.set(bx, by, bz)
        if (fx.kind !== 'loss' && t > 0.4) { const h = (t - 0.4) / 0.6; v.lerp(core, h * h) }
        e.set(tt * 7 * s.s, tt * 5, 0); q.setFromEuler(e)
        const k = fx.kind === 'loss' ? (1 - t) * s.s : s.s * (t > 0.92 ? (1 - t) / 0.08 : 1)
        sc.set(k, k, k); m.compose(v, q, sc); parts.current!.setMatrixAt(i, m)
      })
      parts.current.instanceMatrix.needsUpdate = true
    }
    if (wave.current) { wave.current.scale.setScalar(0.3 + u * 7); (wave.current.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.9 }
    if (beam.current) { (beam.current.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(1, u * 1.4) * Math.PI) * 0.7; beam.current.scale.x = beam.current.scale.z = 1 + u }
  })
  const [x, , z] = fx.pos
  return (
    <group>
      {N > 0 && <instancedMesh ref={parts} args={[undefined, undefined, N]}>{fx.kind === 'loss' ? <tetrahedronGeometry args={[0.17, 0]} /> : <cylinderGeometry args={[0.15, 0.15, 0.04, 16]} />}<meshBasicMaterial color={c} toneMapped={false} /></instancedMesh>}
      <mesh ref={wave} position={[x, fx.kind === 'win' ? H : 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.68, 64]} /><meshBasicMaterial color={c} transparent opacity={0.9} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      {fx.kind !== 'loss' && <mesh ref={beam} position={[x, 8, z]}><cylinderGeometry args={[0.4, 0.4, 16, 24, 1, true]} /><meshBasicMaterial color={c} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} /></mesh>}
    </group>
  )
}

class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  render() { return this.state.bad ? this.props.fallback : this.props.children }
}

// ── page ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const glass: React.CSSProperties = { background: 'rgba(8,14,26,.72)', border: '1px solid rgba(120,170,230,.18)', borderRadius: 14, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#e6edf5' }
const lab: React.CSSProperties = { fontSize: 11, color: '#8a97a8' }

export default function PolyVerse({ d, onClassic }: { d: PolyLive; onClassic: () => void }) {
  const now = useNow()
  const { st, open, closed, res, wsOn, tickAt, mark, cash, start, equity, realized, unreal, fees, wins } = d
  const [sel, setSel] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const [spin, setSpin] = useState(!reduced)
  const [fx, setFx] = useState<Fx[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast = (kind: Fx['kind'], text: string) => { const id = fxId.current++; setToasts((x) => [...x.slice(-2), { id, kind, text, at: Date.now() }]); setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 6000) }
  const fxId = useRef(1)
  const pos = useMemo(() => layout(open), [open.map((t) => t.id).join(',')])
  const lastPos = useRef<Record<string, [number, number, number]>>({})
  const ticks = useRef<Record<string, number>>({})
  const sparkQ = useRef<{ from: THREE.Vector3; c: THREE.Color; t0: number }[]>([])
  const coreFlash = useRef({ t: 0, c: GOLD })
  const prevBid = useRef<Record<string, number>>({})
  const tokenPos = useRef<Record<string, [number, number]>>({})
  const strat = st?.strategy ?? {}

  // remember where every tube stands, so a closing trade can burst where it was
  useEffect(() => {
    for (const t of open) {
      const p = pos[String(t.id)]; if (!p) continue
      const y = mark(t) * H
      lastPos.current[String(t.id)] = [p[0], y, p[1]]; tokenPos.current[t.token_id] = p
    }
  })

  // live ticks -> orb pulse + spark into the core
  useEffect(() => d.onTick((token, bid) => {
    const now = performance.now(), last = ticks.current[token] ?? 0
    ticks.current[token] = now
    const p = tokenPos.current[token]; if (!p || reduced || now - last < 150) { prevBid.current[token] = bid; return }
    const prev = prevBid.current[token]; prevBid.current[token] = bid
    const c = new THREE.Color(prev == null || bid === prev ? '#cfe8ff' : bid > prev ? GREEN : RED)
    sparkQ.current.push({ from: new THREE.Vector3(p[0], bid * H, p[1]), c, t0: now })
  }), [])

  // events: entries, official results, bot closes
  const seenOpen = useRef<Set<string> | null>(null), seenClosed = useRef<Set<string> | null>(null), done = useRef(new Set<string>())
  useEffect(() => {
    if (!st) return
    const add = (kind: Fx['kind'], p?: [number, number, number]) => { if (!p) return; setFx((f) => [...f.slice(-12), { id: fxId.current++, kind, pos: p, t0: performance.now() }]); if (kind !== 'enter') coreFlash.current = { t: performance.now(), c: kind === 'win' ? GOLD : kind === 'loss' ? RED : '#f0b84a' } }
    const oIds = new Set(open.map((t) => String(t.id))), cIds = new Set(closed.map((t) => String(t.id)))
    if (seenOpen.current && seenClosed.current) {
      for (const t of open) if (!seenOpen.current.has(String(t.id)) && !seenClosed.current.has(String(t.id))) { const p = pos[String(t.id)]; if (p) add('enter', [p[0], 0, p[1]]); toast('enter', `כניסה חדשה: ${short(t.outcome_he ?? t.outcome, 18)} ב־${cents(n(t.entry_px))} · ${short(t.question_he ?? t.question, 40)}`) }
      for (const t of closed) if (!seenClosed.current.has(String(t.id)) && !done.current.has(t.token_id)) {
        done.current.add(t.token_id)
        const k: Fx['kind'] = t.reason === 'EARLY_EXIT' ? 'sell' : n(t.pnl) > 0 ? 'win' : 'loss'
        add(k, lastPos.current[String(t.id)])
        toast(k, `${k === 'sell' ? 'מימוש מוקדם' : k === 'win' ? 'ניצחון!' : 'הפסד'} ${usd(n(t.pnl))} · ${short(t.question_he ?? t.question, 40)}`)
      }
    } else for (const t of closed) done.current.add(t.token_id)
    seenOpen.current = oIds; seenClosed.current = cIds
  }, [st])
  useEffect(() => {
    for (const t of open) {
      const r = res[t.token_id]; if (r == null || done.current.has(t.token_id)) continue
      done.current.add(t.token_id)
      const p = pos[String(t.id)]; if (!p) continue
      setFx((f) => [...f.slice(-12), { id: fxId.current++, kind: r === 1 ? 'win' : 'loss', pos: [p[0], r === 1 ? H : 0.3, p[1]], t0: performance.now() }])
      coreFlash.current = { t: performance.now(), c: r === 1 ? GOLD : RED }
      toast(r === 1 ? 'win' : 'loss', `${r === 1 ? 'הוכרע: ניצחון!' : 'הוכרע: הפסד'} ${usd(n(t.qty) * r - n(t.cost))} · ${short(t.question_he ?? t.question, 40)}`)
    }
  }, [res])

  // ?fxtest=1 plays a win, a loss, an entry and an early sale over the first tubes (visual check only: no number changes)
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('fxtest') || !open.length) return
    const ps = open.slice(0, 4).map((t) => pos[String(t.id)]).filter(Boolean)
    const kinds: Fx['kind'][] = ['win', 'loss', 'enter', 'sell']
    const ids = ps.map((p, i) => setTimeout(() => { setFx((f) => [...f, { id: fxId.current++, kind: kinds[i], pos: [p[0], kinds[i] === 'win' ? H : 0.3, p[1]], t0: performance.now() }]); coreFlash.current = { t: performance.now(), c: kinds[i] === 'loss' ? RED : GOLD }; toast(kinds[i], `בדיקת אפקט: ${kinds[i]}`) }, 1500 + i * 700))
    return () => ids.forEach(clearTimeout)
  }, [open.length > 0])

  const selT = sel ? d.trades.find((t) => String(t.id) === sel) : null
  const tubeColors = Object.fromEntries(open.map((t) => [String(t.id), mark(t) >= n(t.entry_px) ? GREEN : RED]))
  const narrow = typeof window !== 'undefined' && window.innerWidth < window.innerHeight
  const pnlAll = equity - start
  const prevEq = useRef(equity), [eqFlash, setEqFlash] = useState<string | null>(null)
  useEffect(() => { if (Math.abs(equity - prevEq.current) >= 0.01) { setEqFlash(equity > prevEq.current ? GREEN : RED); prevEq.current = equity; const id = setTimeout(() => setEqFlash(null), 600); return () => clearTimeout(id) } }, [equity])

  return (
    <div dir="rtl" style={{ position: 'relative', width: '100%', height: '100dvh', minHeight: 560, overflow: 'hidden', background: `radial-gradient(ellipse at 50% 40%, #0b1a33 0%, ${INK} 70%)`, fontFamily: 'system-ui,sans-serif' }}>
      <GlBoundary fallback={<div style={{ ...glass, position: 'absolute', inset: '40% 16px auto', padding: 16, textAlign: 'center' }}>הדפדפן לא תומך בתלת־ממד. <button onClick={onClassic} style={btn}>לתצוגה הקלאסית</button></div>}>
        <Canvas dpr={[1, 1.75]} camera={{ position: narrow ? [0, 14, 27] : [0, 8.5, 16], fov: narrow ? 56 : 50 }} onPointerMissed={() => setSel(null)} gl={{ antialias: true }}>
          <NowCtx.Provider value={now}>
            <color attach="background" args={[INK]} />
            <fog attach="fog" args={[INK, 18, 42]} />
            <ambientLight intensity={0.35} />
            <pointLight position={[0, 9, 0]} intensity={40} color="#9fd8ff" />
            <Stars radius={80} depth={40} count={2500} factor={3} fade speed={0.6} />
            <Floor lastScan={st?.last_scan} pos={pos} colors={tubeColors} />
            <Core equity={equity} start={start} flash={coreFlash} />
            {open.map((t) => { const p = pos[String(t.id)]; return p ? <Tube key={t.id} big={narrow} t={t} px={mark(t)} pos={p} resolved={res[t.token_id]} selected={sel === String(t.id)} onSelect={() => setSel(String(t.id))} ticks={ticks} windowH={n(strat.windowH) || 4} /> : null })}
            <Trophies closed={closed} onSelect={setSel} sel={sel} />
            <EquityHalo hist={d.equityHist} start={start} equity={equity} />
            <Sparks queue={sparkQ} />
            {fx.map((f) => <Burst key={f.id} fx={f} onDone={() => setFx((x) => x.filter((y) => y.id !== f.id))} />)}
            <OrbitControls enablePan={false} target={[0, 2.6, 0]} minDistance={6} maxDistance={30} maxPolarAngle={Math.PI * 0.49} autoRotate={spin && !sel} autoRotateSpeed={0.45} enableDamping />
          </NowCtx.Provider>
        </Canvas>
      </GlBoundary>

      {/* top HUD */}
      <div style={{ position: 'absolute', top: 10, insetInline: 10, display: 'grid', gap: 8, pointerEvents: 'none' }}>
        <div style={{ ...glass, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, pointerEvents: 'auto' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.3 }}>זירת ההסתברות</div>
            <div style={lab}>Polymarket · חשבון דמו · <b style={{ color: wsOn ? GREEN : '#f0b84a' }}>{wsOn ? '● חי' : '● REST'}</b> · בוט {st?.last_scan ? ago(now - Date.parse(st.last_scan)) : '—'}{tickAt ? ` · מחיר ${ago(now - tickAt)}` : ''}</div>
          </div>
          <div style={{ textAlign: 'left', direction: 'ltr' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: eqFlash ?? '#fff', transition: 'color .6s', textShadow: eqFlash ? `0 0 16px ${eqFlash}` : 'none' }}>{st ? usd(equity) : 'טוען…'}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: col(pnlAll) }}>{usd(pnlAll)} ({((pnlAll / start) * 100).toFixed(2)}%)</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
          {[['מזומן', usd(cash), 0], ['ממומש', usd(realized), realized], ['פתוח', usd(unreal), unreal], ['ניצחונות', `${wins}/${closed.length}`, 0], ['עמלות', usd(fees), 0], ['פתוחות', String(open.length), 0]].map(([k, v, s]) => (
            <div key={String(k)} style={{ ...glass, padding: '5px 10px', borderRadius: 10 }}><span style={lab}>{k} </span><b style={{ fontSize: 13, color: col(Number(s)), direction: 'ltr', display: 'inline-block' }}>{v}</b></div>
          ))}
        </div>
        {st && open.length === 0 && <div style={{ ...glass, padding: '8px 12px', fontSize: 13, justifySelf: 'center' }}>אין פוזיציות פתוחות כרגע. הבוט סורק כל 15 שניות שווקים שנגמרים תוך {n(strat.windowH) || 4} שעות במחיר {cents(n(strat.lo))}–{cents(n(strat.hi))}.</div>}
      </div>

      {/* live events */}
      <div style={{ position: 'absolute', top: narrow ? 178 : 140, insetInline: 10, display: 'grid', justifyItems: 'center', gap: 6, pointerEvents: 'none' }}>
        {toasts.map((x) => { const c = x.kind === 'win' ? GOLD : x.kind === 'loss' ? RED : x.kind === 'sell' ? '#f0b84a' : CYAN; return (
          <div key={x.id} style={{ ...glass, padding: '8px 14px', fontSize: 14, fontWeight: 700, border: `1px solid ${c}`, boxShadow: `0 0 24px ${c}55`, color: c, animation: reduced ? 'none' : 'pv-pop .5s ease-out' }}>
            {x.kind === 'win' ? '🏆 ' : x.kind === 'loss' ? '💥 ' : x.kind === 'sell' ? '💰 ' : '✨ '}{x.text}
          </div>) })}
      </div>

      {/* selected position / closed trade */}
      {selT && (
        <div style={{ ...glass, position: 'absolute', insetInline: 10, bottom: 64, padding: 14, maxHeight: '46%', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }} title={selT.question}>{selT.question_he ?? selT.question}</div>
            <button onClick={() => setSel(null)} style={{ ...btn, padding: '2px 10px' }}>✕</button>
          </div>
          {(() => {
            const t = selT, isOpen = t.status === 'OPEN', px = isOpen ? mark(t) : n(t.exit_px), pnl = isOpen ? n(t.qty) * px - n(t.cost) : n(t.pnl), r = res[t.token_id]
            const rows: [string, string, number?][] = [
              ['קנינו', `${t.outcome_he ?? t.outcome}`], ['מניות', n(t.qty).toFixed(1)], ['מחיר כניסה', cents(n(t.entry_px))],
              [isOpen ? 'עכשיו (הצעת קנייה)' : 'יציאה', cents(px)], ...(isOpen && n(d.ask[t.token_id]) > 0 ? [['הצעת מכירה', cents(n(d.ask[t.token_id]))] as [string, string]] : []),
              ['עלות כולל עמלה', usd(n(t.cost))], ['עמלות', usd(n(t.entry_fee) + n(t.exit_fee))], ...(isOpen ? [['אם מנצח', usd(n(t.qty))] as [string, string]] : [['קיבלנו', usd(n(t.proceeds) - n(t.exit_fee))] as [string, string]]),
              [isOpen ? 'רווח/הפסד עכשיו' : 'רווח/הפסד', usd(pnl), pnl],
              [isOpen ? 'מצב' : 'נסגר', isOpen ? (r === 1 ? 'הוכרע: ניצחון ✓ — הבוט ירשום במחזור הבא' : r === 0 ? 'הוכרע: הפסד ✗ — הבוט ירשום במחזור הבא' : Date.parse(t.end_time) <= now ? 'ממתין להכרעה רשמית' : `נגמר בעוד ${left(t.end_time, now)}`) : `${when(t.closed_at)} · ${t.reason === 'EARLY_EXIT' ? 'מימוש מוקדם' : t.reason === 'RESOLVED_WIN' ? 'ניצחון ✓' : 'הפסד ✗'}`],
              ['נפתח', when(t.opened_at)],
            ]
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '6px 12px', marginTop: 10 }}>
                  {rows.map(([k, v, s]) => <div key={k}><div style={lab}>{k}</div><div style={{ fontWeight: 700, fontSize: 14, color: s != null ? col(s) : '#e6edf5' }}>{v}</div></div>)}
                </div>
                <a href={`https://polymarket.com/event/${t.event_slug ?? t.slug}`} target="_blank" rel="noreferrer" style={{ ...btn, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>פתח ב־Polymarket ↗</a>
              </>
            )
          })()}
        </div>
      )}

      {help && (
        <div style={{ ...glass, position: 'absolute', insetInline: 10, bottom: 64, padding: 14, fontSize: 13, lineHeight: 1.7, maxHeight: '55%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>איך לקרוא את הזירה</b><button onClick={() => setHelp(false)} style={{ ...btn, padding: '2px 10px' }}>✕</button></div>
          <div>🧪 <b>כל צינור = פוזיציה פתוחה.</b> הרצפה = 0¢, הטבעת הזהובה למעלה = $1 (ניצחון).</div>
          <div>🔵 <b>הכדור</b> צף בגובה הצעת הקנייה החיה; הצינור "מתמלא" עד אליו. ירוק מעל מחיר הכניסה, אדום מתחתיו.</div>
          <div>⚪ <b>הטבעת הלבנה</b> = מחיר הכניסה. <b>הפס הכחול</b> = טווח הקנייה {cents(n(strat.lo))}–{cents(n(strat.hi))}.</div>
          <div>⏱ <b>הטבעת בבסיס</b> = הזמן שנשאר עד הסיום (כתום = פחות מחצי שעה, סגול מהבהב = ממתין להכרעה).</div>
          <div>✨ <b>ניצוצות</b> = כל שינוי מחיר שמגיע מ־Polymarket בזמן אמת, עפים אל הליבה (ירוק = עלה, אדום = ירד).</div>
          <div>🏆 <b>הכרעה רשמית:</b> ניצחון יורה את הכדור דרך טבעת הזהב ומטבעות לליבה; הפסד מפיל אותו וסודק את הרצפה. כניסה חדשה יורדת כקרן אור.</div>
          <div>💠 <b>הליבה במרכז</b> = שווי החשבון (גדל/קטן לפי ההון, ירוק/אדום לפי רווח). <b>הגבישים בהיקף</b> = עסקאות שנסגרו (זהב = ניצחון). <b>ההילה החיצונית</b> = היסטוריית ההון, הקו המקווקו = $1,000.</div>
          <div>📡 <b>הסורק על הרצפה</b> משלים סיבוב בכל מחזור של הבוט (~15 שנ׳).</div>
          <div style={lab}>הכול תצוגה בלבד: המספרים מהבוט ומ־Polymarket. אין כסף אמיתי.</div>
        </div>
      )}

      {/* bottom: decisions ticker + controls */}
      <div style={{ position: 'absolute', insetInline: 10, bottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => { setHelp((h) => !h); setSel(null) }} style={btn}>?</button>
        <button onClick={() => setSpin((s) => !s)} style={btn}>{spin ? '⏸' : '⟳'}</button>
        <button onClick={onClassic} style={btn}>תצוגה מפורטת</button>
        <div dir="ltr" style={{ ...glass, flex: 1, overflow: 'hidden', borderRadius: 10, padding: '6px 0', whiteSpace: 'nowrap', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
          <div style={{ display: 'inline-block', paddingLeft: '100%', animation: reduced ? 'none' : 'pv-marquee 70s linear infinite', fontSize: 12 }}>
            {d.decisions.slice(0, 14).map((x: J) => (
              <span key={x.id} dir="rtl" style={{ marginInline: 12, display: 'inline-block' }}>
                <b style={{ color: x.decision === 'BUY' || x.decision === 'ADD' ? GREEN : x.decision === 'SELL' ? '#f0b84a' : '#8a97a8' }}>{x.decision === 'BUY' ? 'קנייה' : x.decision === 'ADD' ? 'הגדלה' : x.decision === 'SELL' ? 'מכירה' : 'דילוג'}</b> {short(x.question_he ?? x.question, 34)} · {cents(n(x.price))}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style>{'@keyframes pv-marquee { from { transform: translateX(0) } to { transform: translateX(-100%) } } @keyframes pv-pop { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }'}</style>
    </div>
  )
}

const btn: React.CSSProperties = { background: 'rgba(76,201,240,.12)', border: '1px solid rgba(76,201,240,.4)', color: '#cfe8ff', borderRadius: 10, padding: '7px 11px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
