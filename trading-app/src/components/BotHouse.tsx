// ─── בית הבוט ────────────────────────────────────────────────────────────────
// A pixel-art house where every room is one real part of the server bot, and every
// resident shows ONLY what the bot actually did, read from its own tables:
//   bot_state (heartbeat, feed health, shields, halt, rotation clock), market_regime,
//   bot_trades, bot_skips, bot_equity, bot_trades_log, bot_errors, deployment_manifest.
// A resident works only when its table shows a fresh action; otherwise it sits and
// the room says what it is waiting for. Walking happens only on a real hand-off seen
// while the page is open (a rotation → the trader, a closed trade → the treasurer).
// Nothing here computes a signal of its own (see CLAUDE.md: the dashboard is a viewer).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPA_URL, SUPA_KEY } from '../supa'

type Id = 'scout' | 'regime' | 'rota' | 'donch' | 'risk' | 'trader' | 'treasurer' | 'reporter'
interface Row { [k: string]: unknown }
interface Snap {
  at: number
  state: Row | null
  regime: Row | null
  equity: Row[]
  open: Row[]
  closed: Row[]
  skips: Row[]
  errors: Row[]
  daily: Row | null
  manifest: Row | null
  rotaBatches: number[]
}
interface Status { working: boolean; asleep?: boolean; alarm?: boolean; line: string; action?: string; at?: number }

const SHORT: Record<string, string> = { rota: 'רוטציה', donch: 'פריצות', reporter: 'יומן' }
const ROSTER: Record<Id, { name: string; role: string; color: string }> = {
  scout: { name: 'איתן', role: 'סורק נתונים', color: '#35e0ff' },
  regime: { name: 'נועה', role: 'חזאית השוק', color: '#c38bff' },
  rota: { name: 'דניאל', role: 'מנהל הרוטציה (ROTA)', color: '#00d492' },
  donch: { name: 'עומר', role: 'צייד פריצות (DONCH4H)', color: '#ffb454' },
  risk: { name: 'מיכל', role: 'שומרת הסיכונים', color: '#ff4d6a' },
  trader: { name: 'רוני', role: 'סוחר ביצוע', color: '#7fd0ff' },
  treasurer: { name: 'שירה', role: 'גזברית', color: '#ffd76a' },
  reporter: { name: 'יונתן', role: 'רושם היומן', color: '#9fd3ff' },
}
const W = 480, H = 430, R = 2
// rooms: attic (reporter, donch) · upper floor (rota, regime, scout) · ground floor (treasurer, trader, risk)
const ROOM: Record<Id, { x0: number; y0: number; w: number; h: number; floor: number }> = {
  reporter: { x0: 120, y0: 48, w: 120, h: 62, floor: 108 },
  donch: { x0: 240, y0: 48, w: 120, h: 62, floor: 108 },
  rota: { x0: 8, y0: 116, w: 154, h: 138, floor: 250 },
  regime: { x0: 163, y0: 116, w: 154, h: 138, floor: 250 },
  scout: { x0: 318, y0: 116, w: 154, h: 138, floor: 250 },
  treasurer: { x0: 8, y0: 262, w: 154, h: 138, floor: 396 },
  trader: { x0: 163, y0: 262, w: 154, h: 138, floor: 396 },
  risk: { x0: 318, y0: 262, w: 154, h: 138, floor: 396 },
}
const IDS = Object.keys(ROSTER) as Id[]
const LOOK: Record<Id, { skin: string; hair: string; shirt: string; pants: string; style: number; glasses: boolean }> = {
  scout: { skin: '#dca577', hair: '#2b1d12', shirt: '#3a7bd5', pants: '#2c3550', style: 0, glasses: true },
  regime: { skin: '#f3c9a2', hair: '#b8472c', shirt: '#8e5bd0', pants: '#23304a', style: 1, glasses: false },
  rota: { skin: '#b07448', hair: '#161616', shirt: '#48a868', pants: '#3d2c22', style: 2, glasses: false },
  donch: { skin: '#f7dcc2', hair: '#6b3b1d', shirt: '#f0b44c', pants: '#1f2a2a', style: 4, glasses: false },
  risk: { skin: '#c98d5e', hair: '#2b1d12', shirt: '#d64f4f', pants: '#4a4f5c', style: 1, glasses: true },
  trader: { skin: '#f3c9a2', hair: '#ece6d6', shirt: '#2fb3b3', pants: '#2c3550', style: 3, glasses: false },
  treasurer: { skin: '#7d4b2c', hair: '#161616', shirt: '#d64f8c', pants: '#23304a', style: 1, glasses: false },
  reporter: { skin: '#dca577', hair: '#e0ad4a', shirt: '#5ac8fa', pants: '#3d2c22', style: 0, glasses: true },
}

const num = (v: unknown) => (v == null ? NaN : Number(v))
const ts = (v: unknown) => (v ? new Date(String(v)).getTime() : 0)
const usd = (v: number) => (Number.isFinite(v) ? `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}` : '—')
const ago = (t: number, now: number) => {
  if (!t) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `לפני ${s} שנ׳`
  const m = Math.round(s / 60)
  if (m < 60) return `לפני ${m} דק׳`
  const h = Math.floor(m / 60)
  return h < 48 ? `לפני ${h} ש׳ ${m % 60 ? `ו-${m % 60} דק׳` : ''}`.trim() : `לפני ${Math.round(h / 24)} ימים`
}
const inMin = (t: number, now: number) => { const m = Math.max(0, Math.round((t - now) / 60000)); return m < 60 ? `${m} דק׳` : `${Math.floor(m / 60)} ש׳ ${m % 60} דק׳` }
const REGIME_HE: Record<string, string> = { TREND_UP: 'מגמה עולה', TREND_DOWN: 'מגמה יורדת', RANGING: 'ריינג׳ (דשדוש)', VOLATILE: 'תנודתי' }
const SKIP_HE: Record<string, string> = {
  heat_limit: 'מגבלת החשיפה הכוללת', per_coin_cap: 'תקרה למטבע', pyramid_gate: 'שער הפירמידה', adx_gate: 'שער ה-ADX',
  bar_lag_diagnostic: 'נר באיחור (בדיקה)', bad_tick: 'מחיר חשוד', min_notional: 'גודל מינימלי',
}
const SHIELD_HE: Record<string, string> = { rota_paused: 'ROTA מושהה', depeg_paused: 'דה-פג', donch_paused: 'DONCH4H מושהה', day_loss_paused: 'הפסד יומי' }

/** Everything each resident says is derived here, from the bot's own rows — nothing invented. */
function derive(s: Snap | null, now: number): Record<Id, Status> {
  const out = {} as Record<Id, Status>
  if (!s || !s.state) { for (const id of IDS) out[id] = { working: false, line: 'טוען נתונים מהבוט…' }; return out }
  const st = s.state
  const beat = ts(st.updated_at)
  const alive = now - beat < 3 * 60_000
  const feed = (st.feed_health ?? {}) as Record<string, { ok?: number; fail?: number } | string>
  const src = String(feed.source ?? '—')
  const srcs = ['binance', 'okx', 'bybit'].map((k) => { const f = feed[k] as { ok?: number; fail?: number } | undefined; return f && (f.ok || f.fail) ? `${k} ${f.ok ?? 0}✓${f.fail ? ` ${f.fail}✗` : ''}` : '' }).filter(Boolean).join(' · ')
  out.scout = alive
    ? { working: now - beat < 25_000, line: `הסבב האחרון ${ago(beat, now)} · מקור ${src}${srcs ? ` · ${srcs}` : ''}`, action: `משך מחירים ונרות ל-${s.manifest?.universe_size ?? 40} מטבעות (${srcs || src})`, at: beat }
    : { working: false, asleep: true, alarm: true, line: `אין דופק מהבוט ${ago(beat, now)} — הוא לא רץ כרגע` }

  const rg = s.regime
  if (rg) {
    const t = ts(rg.created_at)
    const line = `${REGIME_HE[String(rg.regime)] ?? rg.regime} · ADX ${num(rg.btc_adx).toFixed(1)} · ATR ${(num(rg.btc_atr_pct) * 100).toFixed(2)}% · ${ago(t, now)}`
    out.regime = { working: now - t < 90_000, line, action: `מדדה את BTC: ${line}`, at: t }
  } else out.regime = { working: false, line: 'אין מדידת משטר שוק' }

  const sleeves = String(s.manifest?.enabled_sleeves ?? '')
  const rotaOn = !sleeves || sleeves.includes('ROTA')
  const donchOn = !sleeves || sleeves.includes('DONCH')
  const rotaOpen = s.open.filter((t) => t.strategy === 'ROTA')
  const reb = ts(st.rebalanced_at)
  const batches = s.rotaBatches
  const period = batches.length >= 2 ? batches[0] - batches[1] : 0
  const next = reb && period > 3600_000 ? reb + period : 0
  const book = rotaOpen.map((t) => `${t.sym} ${t.side === 'LONG' ? '▲' : '▼'}`).join(' · ')
  out.rota = !rotaOn
    ? { working: false, asleep: true, line: 'כבוי בגרסה הזו' }
    : { working: now - reb < 10 * 60_000, line: `${rotaOpen.length} פוזיציות: ${book || '—'} · רוטציה אחרונה ${ago(reb, now)}${next ? ` · הבאה בעוד ~${inMin(next, now)}` : ''}`, action: `ביצע רוטציה: דירג את 40 המטבעות לפי מומנטום ובחר ${book}`, at: reb }
  const donchOpen = s.open.filter((t) => t.strategy === 'DONCH4H')
  out.donch = donchOn
    ? { working: false, line: `${donchOpen.length} פוזיציות פתוחות · סורק ב-15 הדקות הראשונות אחרי כל סגירת נר 4 שעות` }
    : { working: false, asleep: true, line: `ישן — האסטרטגיה כבויה בגרסה ${s.manifest?.bot_version ?? ''} (פועלת רק ${sleeves})` }

  const shields = (st.shields ?? {}) as Record<string, boolean>
  const on = Object.entries(shields).filter(([, v]) => v).map(([k]) => SHIELD_HE[k] ?? k)
  const eq = num(s.equity[0]?.equity), peak = num(st.peak_balance)
  const dd = Number.isFinite(eq) && peak > 0 ? Math.max(0, (peak - eq) / peak) : NaN
  const lastSkip = s.skips[0]
  const skipT = ts(lastSkip?.ts)
  const halt = st.hard_halt_at ? `עצירת חירום: ${st.hard_halt_reason ?? ''}` : ''
  out.risk = {
    working: now - skipT < 10 * 60_000,
    alarm: !!halt || on.length > 0,
    line: halt || `${on.length ? `מגנים פעילים: ${on.join(', ')}` : 'כל 4 המגנים כבויים'} · ירידה מהשיא ${Number.isFinite(dd) ? (dd * 100).toFixed(1) : '—'}% (עצירה ב-25%)${lastSkip ? ` · חסמה לאחרונה ${lastSkip.sym} (${SKIP_HE[String(lastSkip.reason)] ?? lastSkip.reason}) ${ago(skipT, now)}` : ''}`,
    action: lastSkip ? `חסמה ${lastSkip.sym} ${lastSkip.strategy ?? ''}: ${SKIP_HE[String(lastSkip.reason)] ?? lastSkip.reason}` : undefined,
    at: skipT,
  }

  // everything the trader did in the latest burst (a rotation closes and opens several legs within a minute)
  const events = [
    ...s.open.map((t) => ({ t: ts(t.opened_at), kind: 'open' as const, r: t })),
    ...s.closed.map((t) => ({ t: ts(t.closed_at), kind: 'close' as const, r: t })),
  ].sort((a, b) => b.t - a.t)
  const recent = events[0]?.t ?? 0
  const burst = events.filter((e) => recent - e.t < 2 * 60_000)
  const opened = burst.filter((e) => e.kind === 'open'), closed = burst.filter((e) => e.kind === 'close')
  const side = (r: Row) => (r.side === 'LONG' ? '▲' : '▼')
  const act = [
    closed.length ? `סגר ${closed.length}: ${closed.map((e) => `${e.r.sym}${side(e.r)} ${usd(num(e.r.pnl))}`).join(', ')}` : '',
    opened.length ? `פתח ${opened.length}: ${opened.map((e) => `${e.r.sym}${side(e.r)}`).join(', ')}` : '',
  ].filter(Boolean).join(' · ')
  out.trader = { working: now - recent < 10 * 60_000, line: act ? `${act} · ${ago(recent, now)}` : 'עוד לא ביצע עסקאות', action: act, at: recent }

  const e0 = s.equity[0]
  const tEq = ts(e0?.ts)
  out.treasurer = e0
    ? { working: now - tEq < 90_000, line: `הון ${usd(num(e0.equity))} · מזומן ${usd(num(e0.balance))} · חשיפה ${usd(num(e0.exposure))} · עודכן ${ago(tEq, now)}`, action: `עדכנה שווי תיק: ${usd(num(e0.equity))}`, at: tEq }
    : { working: false, line: 'אין עדיין רישום הון' }

  const d = s.daily
  const tD = ts(d?.created_at)
  const err = s.errors[0]
  out.reporter = err && now - ts(err.ts) < 15 * 60_000
    ? { working: true, alarm: true, line: `שגיאה בבוט (${err.scope ?? ''}) ${ago(ts(err.ts), now)}: ${String(err.message ?? '').slice(0, 80)}`, action: 'רשם שגיאה ביומן', at: ts(err.ts) }
    : d
      ? { working: now - tD < 10 * 60_000, line: `יומן ${d.date}: ${d.total_trades} עסקאות, ${d.wins} רווח / ${d.losses} הפסד, ${usd(num(d.profit))} · אין שגיאות`, action: `כתב את יומן היום: ${usd(num(d.profit))}`, at: tD }
      : { working: false, line: 'היומן היומי נכתב בחצות UTC' }
  if (!alive) for (const id of IDS) if (id !== 'scout') out[id] = { ...out[id], working: false }
  return out
}

/* ─────────────────────────────── drawing ─────────────────────────────── */
interface Person { id: Id; x: number; y: number; face: 1 | -1; path: { x: number; y: number; hold?: number }[]; until: number; carry: string | null }
const home = (id: Id) => ({ x: ROOM[id].x0 + ROOM[id].w / 2 - 20, y: ROOM[id].floor })

export default function BotHouse({ onBack }: { onBack: () => void }) {
  const [snap, setSnap] = useState<Snap | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [sel, setSel] = useState<Id | null>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const status = useMemo(() => derive(snap, now), [snap, now])
  const statusRef = useRef(status); statusRef.current = status
  const snapRef = useRef(snap); snapRef.current = snap
  const selRef = useRef(sel); selRef.current = sel
  const people = useRef<Record<Id, Person>>(Object.fromEntries(IDS.map((id) => [id, { id, ...home(id), face: 1, path: [], until: 0, carry: null }])) as Record<Id, Person>)
  const prev = useRef<{ reb: number; closeId: unknown; skipId: unknown } | null>(null)

  // poll the bot's tables
  useEffect(() => {
    const supa = createClient(SUPA_URL, SUPA_KEY)
    let alive = true
    const load = async () => {
      try {
        const [st, rg, eq, op, cl, sk, er, dl, mf, rb] = await Promise.all([
          supa.from('bot_state').select('*').eq('id', 1).maybeSingle(),
          supa.from('market_regime').select('*').order('created_at', { ascending: false }).limit(1),
          supa.from('bot_equity').select('*').order('ts', { ascending: false }).limit(2),
          supa.from('bot_trades').select('*').eq('status', 'OPEN'),
          supa.from('bot_trades').select('*').neq('status', 'OPEN').order('closed_at', { ascending: false }).limit(8),
          supa.from('bot_skips').select('*').order('ts', { ascending: false }).limit(5),
          supa.from('bot_errors').select('*').order('ts', { ascending: false }).limit(5),
          supa.from('bot_trades_log').select('*').order('created_at', { ascending: false }).limit(1),
          supa.from('deployment_manifest').select('*').order('first_seen', { ascending: false }).limit(1),
          supa.from('bot_trades').select('opened_at').eq('strategy', 'ROTA').order('opened_at', { ascending: false }).limit(60),
        ])
        const firstErr = [st, rg, eq, op, cl, sk, dl, mf, rb].find((r) => r.error)?.error
        if (firstErr) throw new Error(firstErr.message)
        // distinct rotation batches (all legs of one rotation open within a minute)
        const batches: number[] = []
        for (const r of (rb.data ?? []) as Row[]) { const t = ts(r.opened_at); if (!batches.length || batches[batches.length - 1] - t > 10 * 60_000) batches.push(t) }
        if (!alive) return
        setSnap({ at: Date.now(), state: (st.data as Row) ?? null, regime: (rg.data?.[0] as Row) ?? null, equity: (eq.data ?? []) as Row[], open: (op.data ?? []) as Row[], closed: (cl.data ?? []) as Row[], skips: (sk.data ?? []) as Row[], errors: (er.data ?? []) as Row[], daily: (dl.data?.[0] as Row) ?? null, manifest: (mf.data?.[0] as Row) ?? null, rotaBatches: batches })
        setErr(null)
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : String(e)) }
    }
    void load()
    const iv = setInterval(load, 15_000)
    const tick = setInterval(() => setNow(Date.now()), 5_000)
    return () => { alive = false; clearInterval(iv); clearInterval(tick) }
  }, [])

  // hand-offs: only when a new real event appears while the page is open
  useEffect(() => {
    if (!snap?.state) return
    const reb = ts(snap.state.rebalanced_at), closeId = snap.closed[0]?.id, skipId = snap.skips[0]?.id
    const p = prev.current
    prev.current = { reb, closeId, skipId }
    if (!p) return
    const walk = (from: Id, to: Id, carry: string) => {
      const P = people.current[from], A = ROOM[from], B = ROOM[to]
      if (P.path.length) return
      const pts: Person['path'] = []
      const stairX = 160
      if (A.floor !== B.floor) { pts.push({ x: stairX, y: A.floor }, { x: stairX, y: B.floor }) }
      pts.push({ x: B.x0 + B.w / 2 + (B.x0 < A.x0 ? 26 : -46), y: B.floor, hold: 1800 })
      if (A.floor !== B.floor) pts.push({ x: stairX, y: B.floor }, { x: stairX, y: A.floor })
      pts.push(home(from))
      P.carry = carry; P.path = pts
    }
    if (reb && reb !== p.reb) walk('rota', 'trader', 'orders')
    if (closeId && closeId !== p.closeId) walk('trader', 'treasurer', Number(snap.closed[0]?.pnl) >= 0 ? 'good' : 'bad')
  }, [snap])

  // canvas loop
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    cv.width = W * R; cv.height = H * R
    const ctx = cv.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }
    let raf = 0, last = performance.now(), T = 0
    const drawHouse = (t: number) => {
      const s = snapRef.current, st = statusRef.current
      const dead = st.scout?.alarm && st.scout?.asleep
      const hour = new Date().getUTCHours() + 3 // Israel (approx.) for the sky only
      const night = (hour % 24) < 6 || (hour % 24) >= 19
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, night ? '#060a1d' : '#6fb7ff'); g.addColorStop(1, night ? '#1a2346' : '#c4e6ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      if (night) for (let i = 0; i < 40; i++) px((i * 97) % W, (i * 53) % 90, 1, 1, '#c9d3ff')
      px(0, 404, W, 26, night ? '#1b3620' : '#3f8f3e'); px(0, 404, W, 3, night ? '#264d2c' : '#5bb452')
      // roof + chimney smoke = the bot's heartbeat
      ctx.fillStyle = night ? '#431f1f' : '#8e3b2e'; ctx.beginPath(); ctx.moveTo(0, 118); ctx.lineTo(240, 20); ctx.lineTo(480, 118); ctx.closePath(); ctx.fill()
      px(372, 40, 16, 40, '#6c6c74'); px(369, 37, 22, 5, '#55555c')
      if (!dead && !reduced) for (let i = 0; i < 4; i++) { const k = (t * 0.25 + i / 4) % 1; px(376 + k * 16, 32 - k * 26, 7, 5, `rgba(225,225,235,${0.55 - k * 0.55})`) }
      // antenna on the roof blinks on each real scan
      px(420, 58, 2, 30, '#8a8f98'); px(414, 56, 14, 2, '#8a8f98')
      if (st.scout?.working && !reduced && Math.floor(t * 4) % 2) px(419, 52, 4, 4, '#35e0ff')
      px(0, 112, W, 292, '#2a2118')
      for (const id of IDS) {
        const r = ROOM[id], a = st[id]
        const lit = !dead && !a?.asleep
        const wall = { reporter: '#3a3222', donch: '#2f2a44', rota: '#1f3a2c', regime: '#2f2a44', scout: '#26324a', treasurer: '#3a2630', trader: '#1f3440', risk: '#3a2222' }[id]
        px(r.x0, r.y0, r.w, r.h, lit ? wall : '#141821')
        px(r.x0, r.floor, r.w, 6, '#5a3d27'); for (let x = r.x0; x < r.x0 + r.w; x += 14) px(x, r.floor, 1, 6, 'rgba(0,0,0,0.3)')
        // desk + chair
        const dx = r.x0 + r.w / 2 - 6
        if (id !== 'donch') { px(dx - 4, r.floor - 26, 52, 4, '#9b7650'); px(dx - 2, r.floor - 22, 3, 22, '#6d4a2d'); px(dx + 43, r.floor - 22, 3, 22, '#6d4a2d'); px(dx - 34, r.floor - 14, 14, 4, '#34507a'); px(dx - 32, r.floor - 34, 3, 22, '#2a3b58') }
        const k = Math.floor(t * 4)
        if (id === 'scout') {
          const f = (s?.state?.feed_health ?? {}) as Record<string, { ok?: number; fail?: number }>
          ;['binance', 'okx', 'bybit'].forEach((src, i) => {
            const mx = dx + 2 + i * 15; px(mx, r.floor - 44, 13, 14, '#0e1320')
            const ok = f[src]?.ok ?? 0, bad = f[src]?.fail ?? 0
            const hgt = Math.min(10, Math.round(Math.log2(1 + ok) * 1.5))
            if (hgt) px(mx + 2, r.floor - 32 - hgt, 4, hgt, a?.working && !reduced && (k + i) % 2 ? '#35e0ff' : '#1f8fa8')
            if (bad) px(mx + 7, r.floor - 36, 4, 4, '#ff4d6a')
          })
        }
        if (id === 'regime') {
          px(r.x0 + 10, r.y0 + 14, 70, 44, '#eef1f5'); px(r.x0 + 8, r.y0 + 12, 74, 3, '#8a8f98')
          const reg = String(s?.regime?.regime ?? '')
          const col = reg === 'TREND_UP' ? '#148a50' : reg === 'TREND_DOWN' ? '#c23a3a' : reg === 'VOLATILE' ? '#a86400' : '#1f6fcc'
          const adx = Math.min(1, num(s?.regime?.btc_adx) / 50)
          px(r.x0 + 14, r.y0 + 20, 60, 6, '#d9dee6'); px(r.x0 + 14, r.y0 + 20, Math.max(2, Math.round(60 * (Number.isFinite(adx) ? adx : 0))), 6, col)
          for (let i = 0; i < 12; i++) px(r.x0 + 16 + i * 5, r.y0 + 44 - (reg === 'TREND_UP' ? i * 1.2 : reg === 'TREND_DOWN' ? -i * 1.2 + 10 : (i % 3) * 2), 3, 2, col)
        }
        if (id === 'rota') {
          px(r.x0 + 10, r.y0 + 12, 64, 50, '#f6f6f2'); px(r.x0 + 8, r.y0 + 10, 68, 3, '#8a8f98')
          const legs = (s?.open ?? []).filter((x) => x.strategy === 'ROTA').slice(0, 8)
          legs.forEach((l, i) => { const y = r.y0 + 17 + i * 5.5; const long = l.side === 'LONG'; px(r.x0 + 14, y, 4, 4, long ? '#148a50' : '#c23a3a'); px(r.x0 + 21, y + 1, Math.min(48, 10 + Math.abs(num(l.size) * num(l.entry_price)) / 60), 2, long ? '#7fd3a8' : '#f0a0a0') })
        }
        if (id === 'donch') { px(r.x0 + 20, r.floor - 12, 44, 10, '#7a5534'); px(r.x0 + 22, r.floor - 18, 40, 7, '#e9e4d6'); px(r.x0 + 22, r.floor - 18, 10, 7, '#ffffff') }
        if (id === 'reporter') { px(r.x0 + 12, r.y0 + 10, 30, 22, '#fffaf0'); px(r.x0 + 12, r.y0 + 10, 30, 4, '#c23a3a'); const d = s?.daily; if (d) { for (let i = 0; i < Math.min(6, num(d.wins)); i++) px(r.x0 + 15 + i * 4, r.y0 + 18, 3, 3, '#148a50'); for (let i = 0; i < Math.min(6, num(d.losses)); i++) px(r.x0 + 15 + i * 4, r.y0 + 24, 3, 3, '#c23a3a') } }
        if (id === 'risk') {
          const sh = (s?.state?.shields ?? {}) as Record<string, boolean>
          Object.keys(SHIELD_HE).forEach((key, i) => { px(r.x0 + 12 + i * 14, r.y0 + 14, 10, 10, '#1b2230'); px(r.x0 + 14 + i * 14, r.y0 + 16, 6, 6, sh[key] ? (Math.floor(t * 3) % 2 || reduced ? '#ff4d6a' : '#7a1a28') : '#00d492') })
          const eq = num(s?.equity?.[0]?.equity), peak = num(s?.state?.peak_balance)
          const dd = Number.isFinite(eq) && peak > 0 ? Math.max(0, (peak - eq) / peak) : 0
          px(r.x0 + 12, r.y0 + 32, 60, 5, '#1b2230'); px(r.x0 + 12, r.y0 + 32, Math.round(60 * Math.min(1, dd / 0.25)), 5, dd > 0.15 ? '#ff4d6a' : '#ffb454'); px(r.x0 + 71, r.y0 + 30, 1, 9, '#ff4d6a')
          if (s?.state?.hard_halt_at && !reduced && Math.floor(t * 2) % 2) { ctx.fillStyle = 'rgba(255,40,60,0.18)'; ctx.fillRect(r.x0, r.y0, r.w, r.h) }
        }
        if (id === 'trader') { px(dx + 4, r.floor - 44, 30, 16, '#0e1320'); px(dx + 6, r.floor - 42, 26, 12, a?.working && !reduced && k % 2 ? '#0f3a26' : '#101a2a'); const n = (s?.open ?? []).length; for (let i = 0; i < Math.min(10, n); i++) px(r.x0 + 12 + (i % 5) * 9, r.y0 + 14 + Math.floor(i / 5) * 9, 6, 6, '#00d492') }
        if (id === 'treasurer') {
          px(r.x0 + 12, r.floor - 44, 32, 44, '#4a4f5c'); px(r.x0 + 14, r.floor - 42, 28, 40, '#6c7280'); px(r.x0 + 26, r.floor - 26, 5, 5, '#c9d1de')
          const e0 = s?.equity?.[0]; const eq = num(e0?.equity), exp = num(e0?.exposure)
          const coins = Number.isFinite(eq) ? Math.max(1, Math.min(10, Math.round(eq / 1000))) : 0
          for (let i = 0; i < coins; i++) px(dx + 28, r.floor - 28 - i * 2, 10, 2, i % 2 ? '#f0b44c' : '#d4a03a')
          if (Number.isFinite(exp) && eq > 0) { px(r.x0 + 60, r.y0 + 14, 60, 5, '#1b2230'); px(r.x0 + 60, r.y0 + 14, Math.round(60 * Math.min(1, exp / eq)), 5, '#35e0ff') }
        }
        // room lamp: green = acted just now, grey = waiting, red = alarm
        px(r.x0 + r.w - 10, r.y0 + 4, 5, 5, a?.alarm ? '#ff4d6a' : a?.working ? '#00d492' : '#56607a')
      }
      // stairs between the floors (drawn inside the upper-left wall)
      for (let i = 0; i < 9; i++) px(150 + i * 1.5, 256 + i * 15.5, 12, 3, '#6b4a2c')
      if (dead) { ctx.fillStyle = 'rgba(4,7,14,0.35)'; ctx.fillRect(0, 112, W, 292) }
    }
    const drawPerson = (p: Person, t: number) => {
      const L = LOOK[p.id], st = statusRef.current[p.id]
      const x = Math.round(p.x), y = Math.round(p.y), f = p.face, PS = 1.7
      ctx.setTransform(R * PS, 0, 0, R * PS, -x * R * (PS - 1), -y * R * (PS - 1))
      const P = (dx: number, dy: number, w: number, h: number, c: string) => px(f > 0 ? x + dx : x - dx - w, y + dy, w, h, c)
      const walking = p.path.length > 0 && p.until < Date.now()
      const tick = reduced ? 0 : t
      if (st?.asleep && !walking) {
        px(x - 8, y - 16, 8, 6, L.skin); px(x - 8, y - 17, 8, 2, L.hair); px(x, y - 15, 16, 6, L.shirt); px(x, y - 15, 16, 2, '#f4f0e4')
        if (!reduced) { const z = Math.floor(t) % 3; for (let i = 0; i <= z; i++) px(x + 2 + i * 5, y - 22 - i * 5, 3, 1, '#fff') }
      } else {
        const sit = !walking && !p.path.length
        const wf = walking ? Math.floor(tick * 8) % 4 : 0
        px(x - 6, y - 1, 12, 2, 'rgba(0,0,0,0.3)')
        if (sit) { P(-3, -8, 9, 3, L.pants); P(4, -8, 3, 8, L.pants) } else { const a = wf === 1 ? 2 : wf === 3 ? -2 : 0; P(-3 + a, -6, 3, 6, L.pants); P(1 - a, -6, 3, 6, L.pants) }
        const top = sit ? -22 : -21 + (wf % 2 ? -1 : 0)
        const lean = sit && !st?.working ? -1 : 0
        P(-4 + lean, top + 8, 9, 8, L.shirt); P(-4 + lean, top, 8, 8, L.skin)
        if (L.style === 0) { P(-4 + lean, top - 1, 8, 3, L.hair); P(-4 + lean, top + 2, 2, 3, L.hair) }
        else if (L.style === 1) { P(-5 + lean, top - 1, 10, 3, L.hair); P(-5 + lean, top + 2, 3, 8, L.hair) }
        else if (L.style === 2) { P(-4 + lean, top - 1, 8, 3, L.hair); P(-2 + lean, top - 4, 4, 3, L.hair) }
        else if (L.style === 3) { P(-4 + lean, top - 2, 8, 3, '#34507a') }
        else P(-4 + lean, top, 8, 2, L.hair)
        P(2 + lean, top + 3, 1, 1, '#111'); if (L.glasses) P(0 + lean, top + 3, 4, 1, '#111')
        const k = Math.floor(tick * 10) % 2
        if (st?.working && sit) { P(4, top + 10, 5, 2, L.shirt); P(9, top + 10 + k, 2, 2, L.skin) } else if (sit) { P(-5, top + 2, 2, 8, L.shirt) } else { P(4, top + 9, 2, 7, L.shirt) }
        if (p.carry) { P(5, top + 8, 7, 8, '#fffaf0'); P(6, top + 10, 5, 1, p.carry === 'bad' ? '#c23a3a' : p.carry === 'good' ? '#148a50' : '#8a8f98') }
        if (st?.alarm && !reduced && Math.floor(t * 2) % 2) { px(x - 3, y + top - 12, 7, 8, '#ff4d6a'); px(x, y + top - 11, 1, 4, '#fff'); px(x, y + top - 6, 1, 1, '#fff') }
      }
      if (selRef.current === p.id) px(x - 2, y - 44, 5, 3, '#f0b44c')
      ctx.setTransform(R, 0, 0, R, 0, 0)
    }
    const step = (dt: number) => {
      const nowMs = Date.now()
      for (const p of Object.values(people.current)) {
        if (!p.path.length || p.until > nowMs) continue
        const g = p.path[0], sp = 60 * dt
        const dx = g.x - p.x, dy = g.y - p.y
        if (Math.abs(dx) <= sp && Math.abs(dy) <= sp) { p.x = g.x; p.y = g.y; p.path.shift(); if (g.hold) { p.until = nowMs + g.hold; p.carry = null } }
        else { if (Math.abs(dy) > sp) { p.y += Math.sign(dy) * sp; p.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * 0.3) } else p.x += Math.sign(dx) * sp; if (Math.abs(dx) > 0.5) p.face = dx > 0 ? 1 : -1 }
        if (!p.path.length) p.face = 1
      }
    }
    const frame = (n: number) => {
      const dt = Math.min(0.1, (n - last) / 1000); last = n; T += dt
      if (!reduced) step(dt); else for (const p of Object.values(people.current)) { if (p.path.length) { const h = home(p.id); p.x = h.x; p.y = h.y; p.path = []; p.carry = null } }
      ctx.setTransform(R, 0, 0, R, 0, 0)
      drawHouse(T)
      for (const p of Object.values(people.current).sort((a, b) => a.y - b.y)) drawPerson(p, T)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const live = snap?.state && now - ts(snap.state.updated_at) < 3 * 60_000
  const version = snap?.manifest ? `${snap.manifest.bot_version} · ${String(snap.manifest.sha ?? '').slice(0, 7)}` : '…'
  const pick = (id: Id) => setSel((s) => (s === id ? null : id))
  const onCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const mx = ((e.clientX - r.left) / r.width) * W, my = ((e.clientY - r.top) / r.height) * H
    const id = IDS.find((k) => mx >= ROOM[k].x0 && mx < ROOM[k].x0 + ROOM[k].w && my >= ROOM[k].y0 && my < ROOM[k].y0 + ROOM[k].h)
    if (id) pick(id)
  }

  return (
    <div dir="rtl" className="bh">
      <style>{CSS}</style>
      <div className="bh-head">
        <div>
          <h1>בית הבוט</h1>
          <p>כל חדר הוא חלק אמיתי מהבוט. כל מספר נקרא ישירות מהטבלאות שלו, ודמות זזה רק כשהבוט באמת עשה משהו.</p>
        </div>
        <div className="bh-chips">
          <span className={`bh-chip ${live ? 'ok' : 'bad'}`}><i />{live ? `הבוט רץ · דופק ${ago(ts(snap?.state?.updated_at), now)}` : snap ? 'אין דופק מהבוט' : 'מתחבר…'}</span>
          <span className="bh-chip">{version}</span>
          <span className="bh-chip">{snap?.state?.paper_mode ? 'מסחר נייר' : 'מסחר אמיתי'}</span>
          <button className="bh-btn" onClick={onBack}>חזרה לדשבורד</button>
        </div>
      </div>
      {err && <div className="bh-err" role="alert">לא הצלחתי לקרוא את נתוני הבוט: {err}. מנסה שוב כל 15 שניות.</div>}

      <div className="bh-scene">
        <canvas ref={cvRef} onClick={onCanvas} role="img" aria-label="בית הבוט. הרשימה שמתחת לבית מתארת כל חדר ומה הבוט עשה בו באמת." />
        <div className="bh-ov">
          {IDS.map((id) => {
            const r = ROOM[id], a = status[id]
            return (
              <div key={id}>
                <button className={`bh-tag${sel === id ? ' sel' : ''}`} style={{ right: `${100 - ((r.x0 + r.w / 2) / W) * 100}%`, top: `${((r.y0 + 2) / H) * 100}%`, ['--c' as string]: ROSTER[id].color }} onClick={() => pick(id)}>
                  {ROSTER[id].name} <span>· {SHORT[id] ?? ROSTER[id].role}</span>
                </button>
                {a?.working && a.action && <div className="bh-say" style={{ right: `${100 - ((r.x0 + r.w / 2) / W) * 100}%`, top: `${((r.floor - 44) / H) * 100}%` }}>{a.action}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bh-list">
        {IDS.map((id) => {
          const a = status[id]
          return (
            <button key={id} className={`bh-row${sel === id ? ' sel' : ''}`} onClick={() => pick(id)}>
              <span className="bh-av" style={{ background: ROSTER[id].color }}>{ROSTER[id].name[0]}</span>
              <span className="bh-mid">
                <b>{ROSTER[id].name}</b> <em>· {ROSTER[id].role}</em>
                <span className="bh-line">{a?.line}</span>
              </span>
              <span className={`bh-st ${a?.alarm ? 'alarm' : a?.asleep ? 'sleep' : a?.working ? 'work' : 'wait'}`}>{a?.alarm ? 'התראה' : a?.asleep ? 'כבוי' : a?.working ? 'עובד עכשיו' : 'ממתין'}</span>
            </button>
          )
        })}
      </div>
      <p className="bh-note">
        מה אמיתי כאן: הדופק, מקורות הנתונים, משטר השוק, הפוזיציות, הרוטציות, החסימות של מנהלת הסיכונים, ההון, החשיפה והיומן. כולם נקראים כל 15 שניות מהטבלאות של הבוט ב-Supabase.
        הדמויות לא ממציאות פעולות: הן זזות רק כשמופיעה רשומה חדשה. הבוט רץ פעם בדקה, והרוטציה מתבצעת לפי השעון שלה.
      </p>
    </div>
  )
}

const CSS = `
.bh { color:#c7d5e8; font-family: system-ui, 'Segoe UI', sans-serif; display:grid; gap:10px; }
.bh-head { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; align-items:flex-end; background:rgba(10,17,29,0.96); border:1px solid rgba(140,170,210,0.14); border-radius:6px; padding:12px 14px; }
.bh-head h1 { margin:0; font-size:20px; font-weight:900; color:#eef4fc; }
.bh-head p { margin:4px 0 0; font-size:12.5px; color:#8fa3bf; max-width:560px; line-height:1.5; }
.bh-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.bh-chip { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; padding:3px 10px; border-radius:20px; border:1px solid rgba(140,170,210,0.2); color:#c7d5e8; white-space:nowrap; }
.bh-chip i { width:7px; height:7px; border-radius:50%; background:#8fa3bf; }
.bh-chip.ok i { background:#00d492; box-shadow:0 0 0 3px rgba(0,212,146,0.2); } .bh-chip.bad { color:#ff4d6a; border-color:rgba(255,77,106,0.4); } .bh-chip.bad i { background:#ff4d6a; }
.bh-btn { font-family:inherit; font-size:12px; font-weight:700; padding:5px 12px; border-radius:20px; border:1px solid rgba(53,224,255,0.4); background:rgba(53,224,255,0.1); color:#35e0ff; cursor:pointer; }
.bh-err { background:rgba(255,77,106,0.12); border:1px solid rgba(255,77,106,0.4); border-radius:6px; padding:8px 12px; font-size:12.5px; }
.bh-scene { position:relative; border-radius:8px; overflow:hidden; border:1px solid rgba(140,170,210,0.14); background:#05070c; container-type:inline-size; }
.bh-scene canvas { display:block; width:100%; height:auto; aspect-ratio:${W} / ${H}; image-rendering:pixelated; cursor:pointer; }
.bh-ov { position:absolute; inset:0; pointer-events:none; }
.bh-tag { position:absolute; transform:translate(50%,0); pointer-events:auto; cursor:pointer; border:0; border-radius:5px; font-family:inherit; white-space:nowrap; font-size:clamp(8.5px,2.1cqw,12.5px); font-weight:800; color:#f4efe2; background:rgba(8,11,18,0.86); padding:0.15em 0.55em; border-bottom:0.2em solid var(--c); }
.bh-tag span { font-weight:400; opacity:0.8; } .bh-tag.sel { background:#f0b44c; color:#2a1d08; }
.bh-tag:focus-visible, .bh-row:focus-visible, .bh-btn:focus-visible { outline:2px solid #f0b44c; outline-offset:2px; }
.bh-say { position:absolute; transform:translate(50%,-100%); width:max-content; max-width:min(250px,34cqw); font-size:clamp(8.5px,1.9cqw,12px); line-height:1.4; color:#1d1608; background:#fffaf0; padding:0.35em 0.55em; border-radius:5px; box-shadow:0 0 0 2px #1d1608, 3px 3px 0 rgba(0,0,0,0.35); }
.bh-list { background:rgba(10,17,29,0.96); border:1px solid rgba(140,170,210,0.14); border-radius:6px; overflow:hidden; }
.bh-row { display:grid; grid-template-columns:32px 1fr auto; gap:10px; align-items:start; width:100%; text-align:right; background:none; border:0; border-bottom:1px solid rgba(140,170,210,0.1); color:inherit; font-family:inherit; padding:9px 12px; cursor:pointer; }
.bh-row:hover, .bh-row.sel { background:rgba(140,170,210,0.07); }
.bh-av { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; font-weight:900; color:#111; }
.bh-mid b { color:#eef4fc; font-size:13.5px; } .bh-mid em { font-style:normal; color:#8fa3bf; font-size:12px; }
.bh-line { display:block; font-size:12.5px; margin-top:2px; line-height:1.5; }
.bh-st { font-size:11px; font-weight:800; border-radius:20px; padding:2px 8px; white-space:nowrap; }
.bh-st.work { color:#00d492; background:rgba(0,212,146,0.12); } .bh-st.wait { color:#8fa3bf; background:rgba(140,170,210,0.08); }
.bh-st.sleep { color:#8fa3bf; background:rgba(140,170,210,0.05); } .bh-st.alarm { color:#ff4d6a; background:rgba(255,77,106,0.12); }
.bh-note { font-size:11.5px; color:#8fa3bf; line-height:1.6; margin:0; }
`
