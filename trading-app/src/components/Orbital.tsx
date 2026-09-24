// v84.0 — "אורביטל": the bot's house in 3D. Display only, same rule as the 2D house: every
// number on screen is read from the bot's own tables with the public anon key, nothing is
// computed here that the bot does not compute, and a missing value is shown as missing.
//
// The picture: a decision core (the PM's ruling) in deep space; concentric rings of agent
// nodes — house team, desk, analysts, the six swarm teams, the new-information agents — each
// node sized by its learned weight, coloured by its live state (learning / active / boosted /
// benched), ringed when it voted this minute and wired to the core when it argued with the
// PM in the last meeting; open positions as pillars on the inner platform (height = share of
// equity, colour = side, gold = the rotation sleeve); and the agent factory as a nebula of
// candidates (dim = trial, amber = out-of-sample, green = live).
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { createClient } from '@supabase/supabase-js'
import { SUPA_URL, SUPA_KEY } from '../supa'
import { AGENTS, NEW_AGENTS } from '../../../shared/agents'
import { SWARM, TEAMS, LEARN, learnedWeight, bestHorizon, decayStat, meanBps, type Stat, type Team } from '../../../shared/swarm'
import { INFO_AGENTS } from '../../../shared/info'
import { FACTORY } from '../../../shared/factory'
import { CRYPTO_40 } from '../../../shared/strategy'
import { SCALP } from '../../../shared/scalp'

type Row = Record<string, any>
const supa = createClient(SUPA_URL, SUPA_KEY)
const COINS: string[] = [...CRYPTO_40]

// ── live data (read-only) ─────────────────────────────────────────────────────
interface Live { at: number; state: Row | null; manifest: Row | null; meeting: Row | null; open: Row[]; closed: Row[]; equity: Row[]; stats: Record<string, Stat>; factory: Row[]; err: string | null }
function useLive(): Live {
  const [live, setLive] = useState<Live>({ at: 0, state: null, manifest: null, meeting: null, open: [], closed: [], equity: [], stats: {}, factory: [], err: null })
  useEffect(() => {
    let alive = true, busy = false
    const load = async () => {
      if (busy) return; busy = true
      try {
        const [st, mf, mt, op, cl, eq, ag, fa] = await Promise.all([
          supa.from('bot_state').select('*').eq('id', 1).maybeSingle(),
          supa.from('deployment_manifest').select('*').order('first_seen', { ascending: false }).limit(1),
          supa.from('team_meetings').select('*').order('ts', { ascending: false }).limit(1),
          supa.from('bot_trades').select('*').eq('status', 'OPEN'),
          supa.from('bot_trades').select('sym,side,strategy,pnl,closed_at,scalp_meta').neq('status', 'OPEN').order('closed_at', { ascending: false }).limit(10),
          supa.from('bot_equity').select('equity,ts').order('ts', { ascending: false }).limit(240),
          supa.from('agent_stats').select('*'),
          supa.from('factory_agents').select('id,stage,born,stage_at,h,note').limit(500),
        ])
        const bad = [st, mf, mt, op, cl, eq, ag, fa].find((r) => r.error)?.error
        if (bad) throw new Error(bad.message)
        const now = Date.now()
        const stats: Record<string, Stat> = Object.fromEntries(((ag.data ?? []) as Row[]).map((r) => [r.agent, decayStat({ ...r, n: +r.n, s: +r.s, s2: +r.s2, ev: +(r.ev ?? 0) } as Stat, r.agent, now)]))
        if (!alive) return
        setLive({ at: now, state: (st.data as Row) ?? null, manifest: (mf.data?.[0] as Row) ?? null, meeting: (mt.data?.[0] as Row) ?? null, open: (op.data ?? []) as Row[], closed: (cl.data ?? []) as Row[], equity: ((eq.data ?? []) as Row[]).reverse(), stats, factory: (fa.data ?? []) as Row[], err: null })
      } catch (e) { if (alive) setLive((l) => ({ ...l, err: e instanceof Error ? e.message : String(e) })) } finally { busy = false }
    }
    void load()
    const ch = supa.channel('orbital-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_meetings' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_trades' }, () => void load())
      .subscribe()
    const iv = setInterval(load, 15_000)
    return () => { alive = false; clearInterval(iv); void supa.removeChannel(ch) }
  }, [])
  return live
}

// ── who is who ────────────────────────────────────────────────────────────────
interface Who { id: string; name: string; role: string; color: string; voter: boolean; team?: Team }
const HOUSE: Who[] = [
  { id: 'scout', name: 'סייר', role: 'תקינות הנתונים', color: '#5aa9ff', voter: false },
  { id: 'regime', name: 'נועה', role: 'EMA 8/21', color: '#8d7bff', voter: true },
  { id: 'rota', name: 'דניאל', role: 'מומנטום 3 דק׳ · סבב הרוטציה', color: '#38d39f', voter: true },
  { id: 'donch', name: 'עומר', role: 'liquidity sweep', color: '#c77dff', voter: true },
  { id: 'risk', name: 'מיכל', role: 'חדשות · ליקווידציות', color: '#ff6b6b', voter: true },
  { id: 'trader', name: 'רוני', role: 'ספר פקודות', color: '#4cc9f0', voter: true },
  { id: 'treasurer', name: 'גזבר', role: 'מזומן וחשיפה', color: '#f4a261', voter: false },
  { id: 'reporter', name: 'כתב', role: 'סיכום הישיבה', color: '#e9c46a', voter: false },
  { id: 'auditor', name: 'אבי', role: 'עלות מול תנודתיות', color: '#94d2bd', voter: false },
  { id: 'info', name: 'מידע חדש', role: 'מומנטום ימים · OI · פרמיה', color: '#7bd389', voter: false },
  { id: 'factory', name: 'מפעל הסוכנים', role: 'ניסוי → בדיקה → פעיל', color: '#e0b04c', voter: false },
]
const DESK: Who[] = [
  { id: 'quant', name: 'גיל', role: 'כמותי · למידת הצל', color: '#b8c0ff', voter: false },
  { id: 'compliance', name: 'הדס', role: 'ציות', color: '#ffafcc', voter: false },
  { id: 'execution', name: 'אלון', role: 'ביצוע ועמלות', color: '#a0e7a0', voter: false },
]
const ANALYSTS: Who[] = NEW_AGENTS.map((k, i) => ({ id: k, name: AGENTS[k].name, role: AGENTS[k].role, color: ['#4cc9f0', '#80ffdb', '#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5', '#f15bb5', '#00bbf9'][i % 10], voter: true }))
const TEAM_COLOR: Record<Team, string> = { trend: '#3fa7ff', mom: '#ff5fa2', rev: '#7bd389', brk: '#ffb347', flow: '#9d7bff', combo: '#ff9f6b' }
const SWARM_WHO: Who[] = SWARM.map((a) => ({ id: a.id, name: a.label, role: TEAMS[a.team].label, color: TEAM_COLOR[a.team], voter: true, team: a.team }))
const INFO_WHO: Who[] = INFO_AGENTS.map((a) => ({ id: a.id, name: a.label, role: 'מידע שאף סוכן דקה לא רואה', color: '#7bd389', voter: true }))
const ALL: Record<string, Who> = Object.fromEntries([...HOUSE, ...DESK, ...ANALYSTS, ...SWARM_WHO, ...INFO_WHO].map((w) => [w.id, w]))

// ── derived, per render ───────────────────────────────────────────────────────
interface Derived {
  mins: Row[]; byWho: Record<string, Row>; dissent: Set<string>; weights: Record<string, number>; mode: string; active: number
  dirs: Map<string, Record<string, number>>; equity: number; cash: number; decision: string; lastMeetingAt: number; hbAge: number
}
function derive(l: Live): Derived {
  const mins = ((l.meeting?.minutes ?? []) as Row[])
  const byWho: Record<string, Row> = {}
  for (const m of mins) if ((m.round ?? 1) === 1 && !byWho[m.who]) byWho[m.who] = m
  const dissent = new Set(mins.filter((m) => m.round === 2 && m.to === 'pm').map((m) => String(m.who)))
  const q = mins.find((m) => m.who === 'quant')?.data ?? {}
  const cands = ((l.state?.bot_params as Row | undefined)?.scalp_candidates ?? []) as Row[]
  const dirs = new Map<string, Record<string, number>>((Array.isArray(cands) ? cands : []).map((c) => [String(c.sym), (c.dirs ?? {}) as Record<string, number>]))
  const eqRow = l.equity[l.equity.length - 1]
  return {
    mins, byWho, dissent, weights: (q.weights ?? {}) as Record<string, number>, mode: String(q.mode ?? '—'), active: Number(q.active ?? 0), dirs,
    equity: Number(eqRow?.equity ?? NaN), cash: Number(l.state?.balance ?? NaN), decision: String(l.meeting?.decision ?? ''),
    lastMeetingAt: l.meeting ? Date.parse(l.meeting.ts) : 0, hbAge: l.state ? l.at - Date.parse(l.state.updated_at) : NaN,
  }
}
const votesOf = (d: Derived, id: string) => { let l = 0, s = 0; for (const c of COINS) { const v = d.dirs.get(c)?.[id] ?? 0; if (v > 0) l++; else if (v < 0) s++ } return { l, s } }
function nodeState(st: Record<string, Stat>, id: string, w: Record<string, number>) {
  const b = bestHorizon(st, id), s0 = b.st ?? st[id], learning = !s0 || s0.n < LEARN.minN, weight = w[id] ?? learnedWeight(s0)
  return { learning, weight, t: Number.isFinite(b.t) ? b.t : 0, h: b.h, n: s0?.n ?? 0, bps: meanBps(s0), benched: !learning && weight === 0, boosted: !learning && weight > 1 }
}

// ── 3D pieces ─────────────────────────────────────────────────────────────────
function Ring({ radius, speed, tilt = 0, children }: { radius: number; speed: number; tilt?: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null!)
  useFrame((_, dt) => { g.current.rotation.y += speed * dt })
  return <group ref={g} rotation={[tilt, 0, 0]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[radius, 0.012, 8, 160]} /><meshBasicMaterial color="#1e2b45" transparent opacity={0.9} /></mesh>
    {children}
  </group>
}
function Node({ who, pos, d, stats, selected, onSelect, showLabel }: { who: Who; pos: [number, number, number]; d: Derived; stats: Record<string, Stat>; selected: boolean; onSelect: (id: string) => void; showLabel: boolean }) {
  const m = useRef<THREE.Mesh>(null!)
  const ns = who.voter ? nodeState(stats, who.id, d.weights) : null
  const v = who.voter ? votesOf(d, who.id) : { l: 0, s: 0 }
  const spoke = !!d.byWho[who.id]
  const color = ns ? (ns.learning ? '#6b7a90' : ns.benched ? '#7a1f2b' : who.color) : who.color
  const glow = ns ? (ns.boosted ? 1.6 : ns.benched ? 0.15 : ns.learning ? 0.25 : 0.7) : (spoke ? 0.9 : 0.3)
  const r = 0.16 + (ns ? Math.min(2.5, ns.weight) * 0.09 : 0.1)
  const voted = v.l + v.s > 0
  useFrame(({ clock }) => { if (!m.current) return; const p = 1 + (voted ? 0.08 * Math.sin(clock.elapsedTime * 3 + pos[0]) : 0); m.current.scale.setScalar(selected ? p * 1.35 : p) })
  return <group position={pos}>
    <mesh ref={m} onClick={(e) => { e.stopPropagation(); onSelect(who.id) }} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = 'auto' }}>
      <sphereGeometry args={[r, 24, 24]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={0.35} metalness={0.2} />
    </mesh>
    {voted && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r + 0.12, 0.014, 8, 48]} /><meshBasicMaterial color={v.l >= v.s ? '#38d39f' : '#ff6b6b'} transparent opacity={0.85} /></mesh>}
    {d.dissent.has(who.id) && <Line points={[[0, 0, 0], [-pos[0], -pos[1], -pos[2]]]} color="#ffd166" transparent opacity={0.35} lineWidth={1} />}
    {(showLabel || selected) && <Html center distanceFactor={14} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }} position={[0, r + 0.32, 0]}>
      <div className={`ob-lbl${selected ? ' sel' : ''}`} dir="rtl"><b style={{ color }}>{who.name}</b>{ns && !ns.learning ? <span> {ns.weight.toFixed(2)}</span> : null}</div>
    </Html>}
  </group>
}
function Core({ d }: { d: Derived }) {
  const m = useRef<THREE.Mesh>(null!), halo = useRef<THREE.Mesh>(null!)
  const color = d.decision === 'SCALP_OPEN' ? '#38d39f' : d.decision === 'SCALP_PAUSED' ? '#ff6b6b' : '#5aa9ff'
  useFrame(({ clock }) => {
    const fresh = Math.max(0, 1 - (Date.now() - d.lastMeetingAt) / 60_000)   // fades over the minute until the next meeting
    const p = 1 + 0.06 * Math.sin(clock.elapsedTime * 2) + 0.25 * fresh
    m.current.scale.setScalar(p); m.current.rotation.y += 0.004; m.current.rotation.x += 0.002
    halo.current.scale.setScalar(1.6 + 0.4 * fresh + 0.1 * Math.sin(clock.elapsedTime * 1.3))
  })
  return <group>
    <mesh ref={m}><icosahedronGeometry args={[0.9, 1]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} wireframe={false} roughness={0.2} metalness={0.6} /></mesh>
    <mesh ref={halo}><icosahedronGeometry args={[0.9, 0]} /><meshBasicMaterial color={color} wireframe transparent opacity={0.25} /></mesh>
    <pointLight color={color} intensity={40} distance={30} decay={2} />
    <Html center distanceFactor={14} position={[0, -1.7, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}><div className="ob-lbl core" dir="rtl"><b>תמר · מנהלת התיק</b><span> {d.decision === 'SCALP_OPEN' ? 'פתחה' : d.decision === 'SCALP_PAUSED' ? 'מושהה' : d.decision ? 'מחזיקה' : '—'}</span></div></Html>
  </group>
}
function Pillars({ open, equity }: { open: Row[]; equity: number }) {
  const g = useRef<THREE.Group>(null!)
  useFrame((_, dt) => { g.current.rotation.y -= 0.05 * dt })
  const R = 2.6
  return <group ref={g}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}><ringGeometry args={[R - 0.5, R + 0.5, 96]} /><meshStandardMaterial color="#0b1424" emissive="#0b1424" side={THREE.DoubleSide} transparent opacity={0.9} /></mesh>
    {open.map((t, i) => {
      const a = (i / Math.max(1, open.length)) * Math.PI * 2, notional = Number(t.entry_price) * Number(t.size)
      const h = Math.max(0.25, Number.isFinite(equity) && equity > 0 ? (notional / equity) * 7 : 0.5)
      const rota = t.strategy === 'ROTA', long = t.side === 'LONG', color = rota ? '#e0b04c' : long ? '#38d39f' : '#ff6b6b'
      return <group key={t.id} position={[R * Math.cos(a), -1.2 + h / 2, R * Math.sin(a)]}>
        <mesh>{rota ? <octahedronGeometry args={[0.22 + h * 0.1, 0]} /> : <boxGeometry args={[0.28, h, 0.28]} />}<meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.3} /></mesh>
        <Html center distanceFactor={12} position={[0, h / 2 + 0.3, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div className="ob-lbl" dir="rtl"><b style={{ color }}>{t.sym}</b> <span>{long ? 'לונג' : 'שורט'} · ${Math.round(notional)}{rota ? ' · רוטציה' : t.scalp_meta?.hold_min ? ` · ${t.scalp_meta.hold_min}ד׳` : ''}</span></div>
        </Html>
      </group>
    })}
  </group>
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967295 }
function Nebula({ rows }: { rows: Row[] }) {
  const g = useRef<THREE.Group>(null!)
  useFrame((_, dt) => { g.current.rotation.y += 0.02 * dt })
  const groups = useMemo(() => {
    const mk = (stage: string) => { const rs = rows.filter((r) => r.stage === stage); const p = new Float32Array(rs.length * 3); rs.forEach((r, i) => { const a = hash(r.id) * Math.PI * 2, rad = 16 + hash(r.id + 'r') * 4.5, y = stage === 'live' ? 4.5 + hash(r.id + 'y') : stage === 'oos' ? 2.2 + hash(r.id + 'y') * 1.5 : stage === 'retired' ? -5 - hash(r.id + 'y') * 3 : (hash(r.id + 'y') - 0.5) * 3; p[i * 3] = rad * Math.cos(a); p[i * 3 + 1] = y; p[i * 3 + 2] = rad * Math.sin(a) }); return p }
    return { trial: mk('trial'), oos: mk('oos'), live: mk('live'), retired: mk('retired') }
  }, [rows])
  const cloud = (pos: Float32Array, color: string, size: number, opacity: number) => pos.length ? <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry><pointsMaterial color={color} size={size} sizeAttenuation transparent opacity={opacity} depthWrite={false} /></points> : null
  return <group ref={g}>
    {cloud(groups.retired, '#3a2230', 0.12, 0.35)}
    {cloud(groups.trial, '#5f7ba6', 0.2, 0.8)}
    {cloud(groups.oos, '#e0b04c', 0.42, 1)}
    {cloud(groups.live, '#7bd389', 0.6, 1)}
  </group>
}
const onRing = (i: number, n: number, r: number, y = 0): [number, number, number] => { const a = (i / n) * Math.PI * 2; return [r * Math.cos(a), y, r * Math.sin(a)] }

function Scene({ live, d, selected, onSelect }: { live: Live; d: Derived; selected: string | null; onSelect: (id: string | null) => void }) {
  const sel = (id: string) => onSelect(selected === id ? null : id)
  const teams = Object.keys(TEAMS) as Team[]
  return <>
    <color attach="background" args={['#04070e']} />
    <fog attach="fog" args={['#04070e', 26, 60]} />
    <ambientLight intensity={0.35} />
    <directionalLight position={[10, 14, 6]} intensity={0.8} />
    <Stars radius={90} depth={40} count={4000} factor={3} saturation={0.2} fade speed={0.4} />
    <group onClick={() => onSelect(null)}>
      <Core d={d} />
      <Pillars open={live.open} equity={d.equity} />
      <Ring radius={4.6} speed={0.06} tilt={0.06}>{HOUSE.map((w, i) => <Node key={w.id} who={w} pos={onRing(i, HOUSE.length, 4.6)} d={d} stats={live.stats} selected={selected === w.id} onSelect={sel} showLabel />)}</Ring>
      <Ring radius={6.4} speed={-0.045} tilt={-0.05}>{DESK.map((w, i) => <Node key={w.id} who={w} pos={onRing(i, DESK.length, 6.4)} d={d} stats={live.stats} selected={selected === w.id} onSelect={sel} showLabel />)}</Ring>
      <Ring radius={8.4} speed={0.035} tilt={0.09}>{ANALYSTS.map((w, i) => <Node key={w.id} who={w} pos={onRing(i, ANALYSTS.length, 8.4)} d={d} stats={live.stats} selected={selected === w.id} onSelect={sel} showLabel />)}</Ring>
      <Ring radius={11.2} speed={-0.025} tilt={-0.08}>{teams.flatMap((t, ti) => SWARM_WHO.filter((w) => w.team === t).map((w, i) => <Node key={w.id} who={w} pos={onRing(ti * 10 + i, 60, 11.2, Math.sin((ti / 6) * Math.PI * 2) * 0.35)} d={d} stats={live.stats} selected={selected === w.id} onSelect={sel} showLabel={false} />))}</Ring>
      <Ring radius={13.8} speed={0.018} tilt={0.12}>{INFO_WHO.map((w, i) => <Node key={w.id} who={w} pos={onRing(i, INFO_WHO.length, 13.8)} d={d} stats={live.stats} selected={selected === w.id} onSelect={sel} showLabel />)}</Ring>
      <Nebula rows={live.factory} />
    </group>
    <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.35} minDistance={6} maxDistance={48} maxPolarAngle={Math.PI * 0.62} />
  </>
}

// ── HUD (DOM) ─────────────────────────────────────────────────────────────────
const fmt$ = (v: number) => (Number.isFinite(v) ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—')
const ago = (ms: number) => (!Number.isFinite(ms) ? '—' : ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))} שנ׳` : `${Math.round(ms / 60_000)} דק׳`)
const VOTE_HE: Record<string, string> = { long: 'לונג', short: 'שורט', hold: 'ניטרלי', ok: 'תקין', veto: 'חסימה' }
function Panel({ id, live, d, onClose }: { id: string; live: Live; d: Derived; onClose: () => void }) {
  const w = ALL[id]; if (!w) return null
  const m = d.byWho[id], ns = w.voter ? nodeState(live.stats, id, d.weights) : null, v = votesOf(d, id)
  const said2 = d.mins.filter((x) => x.who === id && x.round === 2)
  return <aside className="ob-panel" dir="rtl">
    <button className="ob-x" onClick={onClose} aria-label="סגור">×</button>
    <div className="ob-ph"><span className="ob-dot" style={{ background: w.color }} /><div><b>{w.name}</b><small>{w.role}</small></div></div>
    {ns && <div className="ob-kv">
      <span>מצב</span><b>{ns.learning ? 'לומד (עוד אין 100 הצבעות)' : ns.benched ? 'ספסל — ציון שלילי, לא מצביע' : ns.boosted ? 'מוגבר' : 'פעיל'}</b>
      <span>משקל בהצבעה</span><b dir="ltr">{ns.learning ? '1.00' : ns.weight.toFixed(2)}</b>
      <span>t (מתוקן חפיפה ומתאם)</span><b dir="ltr">{ns.n ? ns.t.toFixed(2) : '—'}</b>
      <span>האופק הטוב שלו</span><b dir="ltr">{ns.n ? `${ns.h} דק׳` : '—'}</b>
      <span>נק׳ בסיס נטו להצבעה</span><b dir="ltr">{ns.n ? ns.bps.toFixed(1) : '—'}</b>
      <span>הצבעות שנמדדו</span><b dir="ltr">{ns.n.toFixed(0)}</b>
      <span>הדקה האחרונה</span><b>{v.l + v.s ? `▲ ${v.l} לונג · ▼ ${v.s} שורט · ${COINS.length - v.l - v.s} ניטרלי` : 'לא הצביע'}</b>
    </div>}
    {w.voter && <div className="ob-grid" title="40 המטבעות — ירוק לונג, אדום שורט, כהה ניטרלי">{COINS.map((c) => { const x = d.dirs.get(c)?.[id] ?? 0; return <i key={c} className={x > 0 ? 'l' : x < 0 ? 's' : ''} title={`${c}: ${x > 0 ? 'לונג' : x < 0 ? 'שורט' : 'ניטרלי'}`} /> })}</div>}
    <div className="ob-say"><small>בישיבה האחרונה{m?.checked_at ? ` · ${ago(live.at - Date.parse(m.checked_at))}` : ''}</small><p>{m ? m.says : 'לא דיבר/ה בישיבה האחרונה'}</p>{m && <span className="ob-vote">{VOTE_HE[m.vote] ?? m.vote}</span>}</div>
    {said2.map((x, i) => <div key={i} className="ob-say r2"><small>התנגד/ה למנהלת התיק</small><p>{x.says}</p></div>)}
    {id === 'factory' && <div className="ob-kv"><span>בניסוי</span><b>{live.factory.filter((r) => r.stage === 'trial').length}</b><span>בבדיקה על נתונים חדשים</span><b>{live.factory.filter((r) => r.stage === 'oos').length}</b><span>פעילים</span><b>{live.factory.filter((r) => r.stage === 'live').length}</b><span>נפסלו</span><b>{live.factory.filter((r) => r.stage === 'retired').length}</b><span>סף לפעיל</span><b dir="ltr">t ≥ {FACTORY.liveT}</b></div>}
  </aside>
}
function Spark({ rows }: { rows: Row[] }) {
  if (rows.length < 2) return null
  const v = rows.map((r) => Number(r.equity)), lo = Math.min(...v), hi = Math.max(...v), W = 160, H = 36
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * W},${H - ((y - lo) / Math.max(1e-9, hi - lo)) * (H - 4) - 2}`).join(' ')
  const up = v[v.length - 1] >= v[0]
  return <svg width={W} height={H} className="ob-spark"><polyline points={pts} fill="none" stroke={up ? '#38d39f' : '#ff6b6b'} strokeWidth="1.5" /></svg>
}

export default function Orbital() {
  const live = useLive()
  const d = useMemo(() => derive(live), [live])
  const [selected, setSelected] = useState<string | null>(null)
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(t) }, [])
  const mf = live.manifest, paper = mf ? mf.paper_mode === true && mf.live_trading !== true : null
  const scalpN = live.open.filter((t) => t.strategy === 'SCALP').length, rotaN = live.open.filter((t) => t.strategy === 'ROTA').length
  const start = Number(live.equity[0]?.equity ?? NaN)
  return <div className="ob-root">
    <style>{CSS}</style>
    <Canvas camera={{ position: [0, 9, 24], fov: 50 }} dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Suspense fallback={null}><Scene live={live} d={d} selected={selected} onSelect={setSelected} /></Suspense>
    </Canvas>
    <header className="ob-hud" dir="rtl">
      <div className="ob-title"><b>בית הבוט · אורביטל</b><small>תלת-ממד · נתונים אמיתיים בלבד · מתעדכן כל 15 שנ׳</small></div>
      <div className="ob-chips">
        <span className="ob-chip">{mf ? `${mf.bot_version} · ${mf.enabled_sleeves ?? ''}` : '—'}</span>
        <span className={`ob-chip ${paper === true ? 'ok' : paper === false ? 'bad' : ''}`}>{paper === true ? 'Paper בלבד' : paper === false ? 'LIVE' : '—'}</span>
        <span className={`ob-chip ${Number.isFinite(d.hbAge) && d.hbAge < 120_000 ? 'ok' : 'bad'}`}>דופק {ago(d.hbAge)}</span>
        <span className="ob-chip">{d.mode === 'proven' ? `מוכחים בלבד · ${d.active}` : d.mode === 'relative' ? 'מצב יחסי · אין סוכן מוכח' : '—'}</span>
      </div>
      <div className="ob-stats">
        <div><small>שווי</small><b>{fmt$(d.equity)}</b><i className={Number.isFinite(start) && d.equity >= start ? 'up' : 'dn'}>{Number.isFinite(start) && Number.isFinite(d.equity) ? `${d.equity >= start ? '+' : ''}${((d.equity / start - 1) * 100).toFixed(2)}% (${live.equity.length} דגימות)` : ''}</i></div>
        <Spark rows={live.equity} />
        <div><small>מזומן</small><b>{fmt$(d.cash)}</b></div>
        <div><small>פוזיציות</small><b>{scalpN}/{SCALP.maxPositions} סקאלפ{rotaN ? ` · ${rotaN} רוטציה` : ''}</b></div>
      </div>
      {live.err && <div className="ob-err">שגיאת קריאה: {live.err}</div>}
    </header>
    {selected && <Panel id={selected} live={live} d={d} onClose={() => setSelected(null)} />}
    <footer className="ob-foot" dir="rtl">
      <div className="ob-action">{live.meeting ? <><small>ישיבה אחרונה · {ago(live.at - d.lastMeetingAt)}</small><p>{String(live.meeting.action ?? '')}</p></> : <p>טוען…</p>}</div>
      <div className="ob-legend"><i style={{ background: '#6b7a90' }} />לומד <i style={{ background: '#3fa7ff' }} />פעיל <i style={{ background: '#3fa7ff', boxShadow: '0 0 8px #3fa7ff' }} />מוגבר <i style={{ background: '#7a1f2b' }} />ספסל <i className="ring" />הצביע בדקה האחרונה <i style={{ background: '#ffd166', height: 2, width: 14, borderRadius: 0 }} />התנגד למנהלת התיק <i style={{ background: '#5f7ba6' }} />מפעל: ניסוי <i style={{ background: '#e0b04c' }} />בדיקה <i style={{ background: '#7bd389' }} />פעיל</div>
      <div className="ob-links"><a href="house.html">הבית הדו-ממדי</a><span>לחיצה על סוכן פותחת את הרשומה האמיתית שלו · גרירה מסובבת · גלגלת מתקרבת</span></div>
    </footer>
  </div>
}

const CSS = `
.ob-root{position:fixed;inset:0;background:#04070e;color:#e6edf7;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
.ob-root canvas{position:absolute;inset:0}
.ob-hud{position:absolute;top:0;right:0;left:0;padding:10px 14px;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;background:linear-gradient(#04070ee6,#04070e00);pointer-events:none}
.ob-hud>*{pointer-events:auto}
.ob-title b{font-size:17px;display:block}.ob-title small{color:#8aa0bf;font-size:11px}
.ob-chips{display:flex;gap:6px;flex-wrap:wrap}
.ob-chip{border:1px solid #223150;background:#0b1424cc;border-radius:999px;padding:3px 10px;font-size:12px;color:#c9d6ea}
.ob-chip.ok{border-color:#1f6b4a;color:#7bd389}.ob-chip.bad{border-color:#7a1f2b;color:#ff6b6b}
.ob-stats{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-inline-start:auto}
.ob-stats small{display:block;color:#8aa0bf;font-size:11px}.ob-stats b{font-size:16px;font-variant-numeric:tabular-nums}.ob-stats i{display:block;font-size:11px;font-style:normal}.ob-stats i.up{color:#38d39f}.ob-stats i.dn{color:#ff6b6b}
.ob-spark{opacity:.9}
.ob-err{width:100%;color:#ff6b6b;font-size:12px}
.ob-lbl{font-size:11px;background:#04070ecc;border:1px solid #1e2b45;border-radius:6px;padding:2px 6px;color:#c9d6ea;transform:translateY(-4px)}
.ob-lbl.sel{border-color:#ffd166}.ob-lbl.core{font-size:12px}.ob-lbl span{color:#8aa0bf}
.ob-panel{position:absolute;top:96px;right:12px;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 200px);overflow:auto;background:#070d19f2;border:1px solid #223150;border-radius:14px;padding:14px;box-shadow:0 12px 40px #000a}
.ob-x{position:absolute;top:8px;left:10px;background:none;border:0;color:#8aa0bf;font-size:20px;cursor:pointer}
.ob-ph{display:flex;gap:10px;align-items:center;margin-bottom:10px}.ob-ph b{display:block;font-size:16px}.ob-ph small{color:#8aa0bf}
.ob-dot{width:14px;height:14px;border-radius:50%;flex:none;box-shadow:0 0 12px currentColor}
.ob-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin:8px 0}.ob-kv span{color:#8aa0bf}.ob-kv b{font-weight:600}
.ob-grid{display:grid;grid-template-columns:repeat(20,1fr);gap:2px;margin:8px 0}.ob-grid i{aspect-ratio:1;background:#16203a;border-radius:2px}.ob-grid i.l{background:#38d39f}.ob-grid i.s{background:#ff6b6b}
.ob-say{background:#0b1424;border-radius:10px;padding:8px 10px;margin-top:8px;font-size:12.5px;line-height:1.45}.ob-say small{color:#8aa0bf;display:block;margin-bottom:2px}.ob-say p{margin:0}.ob-say.r2{border-inline-start:3px solid #ffd166}
.ob-vote{display:inline-block;margin-top:6px;font-size:11px;border:1px solid #223150;border-radius:999px;padding:1px 8px;color:#c9d6ea}
.ob-foot{position:absolute;bottom:0;right:0;left:0;padding:10px 14px;background:linear-gradient(#04070e00,#04070ef0);display:flex;flex-direction:column;gap:6px;pointer-events:none}
.ob-foot>*{pointer-events:auto}
.ob-action small{color:#8aa0bf;font-size:11px}.ob-action p{margin:0;font-size:13px}
.ob-legend{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11px;color:#8aa0bf;align-items:center}.ob-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:4px;vertical-align:middle}.ob-legend i.ring{background:none;border:2px solid #38d39f}
.ob-links{display:flex;gap:12px;font-size:11px;color:#8aa0bf;flex-wrap:wrap}.ob-links a{color:#5aa9ff}
@media (max-width:640px){.ob-title small{display:none}.ob-stats{gap:10px}.ob-stats b{font-size:14px}.ob-spark{display:none}.ob-panel{top:auto;bottom:110px;max-height:55vh}.ob-legend{display:none}}
`
