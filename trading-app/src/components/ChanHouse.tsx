// v97.3 — the bot's house, rebuilt around the engine that ACTUALLY runs (owner, 2026-09-27: "nothing here should be
// scenery — show the bot's real activity as it works now and later").
//
// Every room is one step of the live CHAN cycle (supabase/functions/trading-bot/chan-runner.ts) and every number in it
// is read, with the public anon key, from what the bot itself wrote:
//   bot_state.bot_params.chan_cycle / chan_scan / chan_bar / chan_risk   the cycle note, scan progress, risk state
//   market_cache 'chan_daily' / 'universe'                               per-coin regime statistics, the scanned list
//   trade_decisions (inferred.sleeve = CHAN)                              every candidate and why it was taken/refused
//   bot_trades (strategy CHAN)                                            positions and closes, with the stored reasons
//   bot_equity, bot_errors, deployment_manifest                          equity curve, faults, the deployed build
//   mkt_liq_15m / mkt_options / mkt_news                                  the research collector (never trades)
//   quant/reports/forward-status.json                                     pre-registered forward tests, COUNTS only
// A resident moves only when its own data is fresh; a missing value is shown as "—", never invented. Live marks for
// open positions come from Binance USDT-M (OKX fallback) in the browser and are labelled as display-only.
import { useEffect, useMemo, useState } from 'react'
import { SUPA_KEY, SUPA_URL } from '../supa'
import { CHAN } from '../../../shared/chan'

type J = any
const REST = `${SUPA_URL}/rest/v1/`
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
async function q<T = J>(path: string): Promise<T> {
  const r = await fetch(REST + path, { headers: H, cache: 'no-store' })
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`)
  return r.json()
}
const FWD_URL = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/main/quant/reports/forward-status.json'
const to = () => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(3500) : undefined)

const REGIMES = ['NEUTRAL', 'MEAN_REVERT', 'TREND', 'HIGH_VOL'] as const
const REG: Record<string, { he: string; c: string; what: string }> = {
  MEAN_REVERT: { he: 'חוזר לממוצע', c: '#22d3ee', what: 'Hurst < 0.45 — אסטרטגיית ההיפוך רשאית לפעול' },
  TREND: { he: 'מגמה', c: '#a78bfa', what: 'Hurst > 0.55 — אסטרטגיית המומנטום רשאית לפעול' },
  HIGH_VOL: { he: 'תנודתי מדי', c: '#f87171', what: 'תנודתיות מעל אחוזון 90 — לא נסחר' },
  NEUTRAL: { he: 'ניטרלי', c: '#64748b', what: 'אין משטר ברור — לא נסחר' },
}
const COMP: Record<string, string> = { RG_MR: 'היפוך לממוצע', RG_MOM: 'מומנטום' }
const EXIT: Record<string, string> = { STOP: 'סטופ', TIMEOUT: 'תום זמן החזקה', SIGNAL: 'חזרה לממוצע (z≈0)', KILL: 'מפסק ‎-10%', TARGET: 'יעד' }
function reasonHe(r: string): string {
  if (!r) return '—'
  if (r === 'taken') return 'נכנס'
  if (r === 'coin_held') return 'כבר מחזיק את המטבע'
  if (r === 'max open positions') return 'כבר 5 פוזיציות פתוחות'
  if (r.startsWith('paused')) return 'מושהה עד חצות UTC (‎-3% יומי / 50 הפסדים)'
  if (r.startsWith('halted')) return 'עצירה קשיחה (‎-10% מהשיא)'
  if (r.startsWith('half-Kelly <= 0')) return 'קלי 0 — הרקורד של הרכיב שלילי'
  if (r === 'no_book') return 'אין ספר פקודות'
  if (r === 'stop_on_wrong_side_of_market') return 'המחיר כבר עבר את הסטופ'
  if (r.startsWith('stop closer than')) return 'הסטופ קרוב מדי (פחות מפי 3 מעלות הסבב)'
  if (r === 'max leverage reached') return 'תקרת מינוף 3x'
  if (r === 'too_small_or_book_too_thin') return 'קטן מדי / ספר דק מדי'
  if (r === 'fill_beyond_stop') return 'המילוי היה עובר את הסטופ'
  return r
}
const fmt$ = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`)
const fmtPx = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v >= 1 ? v.toFixed(v >= 1000 ? 1 : v >= 100 ? 2 : 4) : Number(v.toPrecision(4)).toString())
const pct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`)
const hm = (t: number | string | null | undefined) => { if (t == null) return '—'; const d = new Date(t); return Number.isNaN(+d) ? '—' : d.toISOString().slice(11, 16) }
function ago(t: number | null | undefined, now: number): string {
  if (!t || !Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `לפני ${s} שנ׳`
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} ש׳`
  return `לפני ${Math.floor(s / 86400)} ימים`
}

interface Snap {
  state: J; manifest: J | null; open: J[]; closed: J[]; decisions: J[]; errors: J[]; equity: J[]
  daily: Record<string, J> | null; dailyTs: number | null; universe: J | null
  collector: { liq: number | null; options: number | null; news: number | null; newsTitle: string | null }
  loadedAt: number
}

// ---------------- pixel resident ----------------------------------------------------------------------------------
type Mood = 'work' | 'wait' | 'sleep' | 'alarm'
const N = ({ children, className }: { children: React.ReactNode; className?: string }) => <bdi dir="ltr" className={className}>{children}</bdi>
function Resident({ shirt, hair, mood }: { shirt: string; hair: string; mood: Mood }) {
  // 12x16 pixel person at a desk; only the CSS class changes with the real state of its room
  const px: [number, number, number, number, string][] = [
    [4, 0, 4, 2, hair], [3, 2, 6, 4, '#f1c7a0'], [4, 3, 1, 1, '#111'], [7, 3, 1, 1, '#111'],
    [2, 6, 8, 5, shirt], [1, 7, 1, 3, shirt], [10, 7, 1, 3, shirt], [3, 11, 2, 4, '#334155'], [7, 11, 2, 4, '#334155'],
  ]
  return (
    <div className={`ch-res ch-${mood}`} aria-hidden>
      <svg viewBox="0 0 12 16" width="36" height="48" shapeRendering="crispEdges">
        {px.map(([x, y, w, h, c], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={c} />)}
      </svg>
      <div className="ch-desk"><div className="ch-screen" /></div>
      {mood === 'sleep' && <span className="ch-z">z</span>}
      {mood === 'alarm' && <span className="ch-bang">!</span>}
    </div>
  )
}
function Room({ title, who, shirt, hair, mood, status, children }: { title: string; who: string; shirt: string; hair: string; mood: Mood; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`ch-room ch-room-${mood}`}>
      <header><b>{title}</b><span className="ch-who">{who}</span><span className={`ch-dot ch-dot-${mood}`} title={status} /></header>
      <div className="ch-body">
        <Resident shirt={shirt} hair={hair} mood={mood} />
        <div className="ch-info"><div className="ch-status">{status}</div>{children}</div>
      </div>
    </section>
  )
}
function Meter({ label, v, limit, fmt }: { label: string; v: number | null; limit: number; fmt: (x: number) => string }) {
  const f = v == null || !Number.isFinite(v) ? 0 : Math.max(0, Math.min(1, v / limit))
  return (
    <div className="ch-meter">
      <div className="ch-meter-l"><span>{label}</span><N>{v == null || !Number.isFinite(v) ? '—' : fmt(v)} / {fmt(limit)}</N></div>
      <div className="ch-bar"><i style={{ width: `${f * 100}%`, background: f >= 1 ? '#ef4444' : f > 0.66 ? '#f59e0b' : '#22c55e' }} /></div>
    </div>
  )
}
function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return <div className="ch-muted">עדיין אין מספיק נקודות הון</div>
  const lo = Math.min(...pts), hi = Math.max(...pts), w = 300, h = 44
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${hi === lo ? h / 2 : h - ((p - lo) / (hi - lo)) * h}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} className="ch-spark" preserveAspectRatio="none"><polyline points={d} fill="none" stroke={pts[pts.length - 1] >= pts[0] ? '#22c55e' : '#ef4444'} strokeWidth="2" /></svg>
}

export default function ChanHouse({ onBack }: { onBack?: () => void }) {
  const [snap, setSnap] = useState<Snap | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [marks, setMarks] = useState<Record<string, { px: number; src: string; t: number }>>({})
  const [fwd, setFwd] = useState<J | null | 'missing'>(null)
  const [log, setLog] = useState<{ t: number; text: string; kind: string }[]>([])
  const [coinSel, setCoinSel] = useState<string | null>(null)

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [])

  // fast poll: the bot's state, its book and its decisions (the bot cycles every ~5 s)
  useEffect(() => {
    let alive = true, slowAt = 0, slow: Pick<Snap, 'daily' | 'dailyTs' | 'universe' | 'collector' | 'equity' | 'manifest'> | null = null
    const load = async () => {
      try {
        const [st, open, closed, decisions, errors] = await Promise.all([
          q('bot_state?select=balance,peak_balance,bot_params,hard_halt_at,hard_halt_reason,paper_mode,updated_at&limit=1'),
          q("bot_trades?select=*&status=eq.OPEN&order=opened_at.desc"),
          q("bot_trades?select=id,sym,side,status,entry_price,exit_price,size,lev,pnl,opened_at,closed_at,risk_usd,strategy,scalp_meta&strategy=eq.CHAN&status=neq.OPEN&order=closed_at.desc&limit=30"),
          q("trade_decisions?select=ts,sym,side,decision,reason,observed,inferred,notional&inferred->>sleeve=eq.CHAN&order=ts.desc&limit=40"),
          q(`bot_errors?select=ts,scope,message&ts=gte.${new Date(Date.now() - 3_600_000).toISOString()}&order=ts.desc&limit=10`),
        ])
        if (!slow || Date.now() - slowAt > 60_000) {
          slowAt = Date.now()
          const since = new Date(Date.now() - 36 * 3_600_000).toISOString()
          const [mc, man, eq, liq, opt, news] = await Promise.all([
            q('market_cache?select=key,ts,data&key=in.(chan_daily,universe)').catch(() => []),
            q('deployment_manifest?select=*&order=first_seen.desc&limit=1').catch(() => []),
            q(`bot_equity?select=ts,equity&ts=gte.${since}&order=ts.asc&limit=1000`).catch(() => []),
            q('mkt_liq_15m?select=bucket&order=bucket.desc&limit=1').catch(() => []),
            q('mkt_options?select=ts&order=ts.desc&limit=1').catch(() => []),
            q('mkt_news?select=seen_at,title&order=seen_at.desc&limit=1').catch(() => []),
          ])
          const d = (mc as J[]).find((x) => x.key === 'chan_daily'), u = (mc as J[]).find((x) => x.key === 'universe')
          slow = {
            daily: d?.data ?? null, dailyTs: d ? Date.parse(d.ts) : null, universe: u?.data ?? null, manifest: (man as J[])[0] ?? null, equity: eq as J[],
            collector: { liq: (liq as J[])[0] ? Date.parse((liq as J[])[0].bucket) + 900_000 : null, options: (opt as J[])[0] ? Date.parse((opt as J[])[0].ts) : null,
              news: (news as J[])[0] ? Date.parse((news as J[])[0].seen_at) : null, newsTitle: (news as J[])[0]?.title ?? null },
          }
        }
        if (!alive) return
        setSnap({ state: (st as J[])[0] ?? null, open: (open as J[]).filter((t) => t.strategy === 'CHAN'), closed: closed as J[], decisions: decisions as J[], errors: errors as J[], ...slow!, loadedAt: Date.now() })
        setErr(null)
      } catch (e: any) { if (alive) setErr(String(e?.message ?? e)) }
    }
    void load(); const iv = setInterval(load, 5000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  // pre-registered forward tests: counts only (never P&L before 200 trades)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try { const r = await fetch(FWD_URL, { cache: 'no-store' }); if (r.status === 404) { if (alive) setFwd('missing'); return } if (r.ok && alive) setFwd(await r.json()) } catch { /* keep */ }
    }
    void load(); const iv = setInterval(load, 600_000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  // live marks for the OPEN positions only (display; the bot books on its own Binance book walk)
  const heldKey = (snap?.open ?? []).map((t) => t.sym).sort().join(',')
  useEffect(() => {
    if (!heldKey) return
    let alive = true
    const syms = heldKey.split(',')
    const pull = async () => {
      const got: Record<string, { px: number; src: string; t: number }> = {}
      const [bn, ok] = await Promise.allSettled([
        fetch('https://fapi.binance.com/fapi/v1/ticker/price', { signal: to() }).then((r) => (r.ok ? r.json() : null)),
        fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP', { signal: to() }).then((r) => (r.ok ? r.json() : null)),
      ])
      if (ok.status === 'fulfilled' && ok.value?.code === '0') for (const x of ok.value.data as J[]) {
        const m = /^(.+)-USDT-SWAP$/.exec(x.instId); if (m && syms.includes(m[1])) got[m[1]] = { px: Number(x.last), src: 'OKX', t: Number(x.ts) }
      }
      if (bn.status === 'fulfilled' && Array.isArray(bn.value)) for (const x of bn.value as J[]) {
        const s = String(x.symbol); if (!s.endsWith('USDT')) continue
        const c = s === '1000PEPEUSDT' ? 'PEPE' : s.slice(0, -4), k = s === '1000PEPEUSDT' ? 1000 : 1
        if (syms.includes(c)) got[c] = { px: Number(x.price) / k, src: 'Binance', t: Number(x.time) || Date.now() }
      }
      if (alive && Object.keys(got).length) setMarks((m) => ({ ...m, ...got }))
    }
    void pull(); const iv = setInterval(pull, 4000)
    return () => { alive = false; clearInterval(iv) }
  }, [heldKey])

  const p = snap?.state?.bot_params ?? {}
  const cyc = p.chan_cycle ?? null, scan = p.chan_scan ?? null, risk = p.chan_risk ?? null
  const cycT = cyc?.ts ? Date.parse(cyc.ts) : null
  const lastBar = Number(p.chan_bar) || null
  const universeN = Number(cyc?.universe) || snap?.universe?.pairs?.length || null
  const curBar = Math.floor(now / CHAN.barMs) * CHAN.barMs
  const nextBar = curBar + CHAN.barMs
  const scanDone = scan?.bar === curBar ? (scan.done?.length ?? 0) : lastBar === curBar ? universeN : 0
  const scanning = !!cyc?.in_window && now - curBar <= CHAN.scan.windowMs
  const halted = !!risk?.halted || !!snap?.state?.hard_halt_at
  const paused = risk?.pausedUntilDay != null && risk.pausedUntilDay !== -1
  const fresh = cycT != null && now - cycT < 90_000

  // the real log of this page's session: bar scans finished, decisions, opens, closes, errors — only as they appear
  const [seen] = useState(() => ({ bar: 0, dec: '', trades: new Set<string>(), err: '' }))
  useEffect(() => {
    if (!snap) return
    const add: { t: number; text: string; kind: string }[] = []
    const first = seen.bar === 0 && seen.dec === ''
    if (lastBar && lastBar !== seen.bar) { if (!first) add.push({ t: Date.now(), text: `הסריקה של נר ${hm(lastBar)} הסתיימה — ${universeN ?? '—'} מטבעות`, kind: 'scan' }); seen.bar = lastBar }
    const topDec = snap.decisions[0] ? `${snap.decisions[0].ts}${snap.decisions[0].sym}` : ''
    if (topDec && topDec !== seen.dec) {
      if (!first) for (const d of snap.decisions) { if (`${d.ts}${d.sym}` === seen.dec) break; add.push({ t: Date.parse(d.ts), text: `${d.sym} ${d.side === 'LONG' ? 'לונג' : 'שורט'} (${COMP[d.inferred?.comp] ?? d.inferred?.comp}) — ${d.decision === 'accepted' ? 'אושר' : 'נדחה'}: ${reasonHe(d.reason)}`, kind: d.decision === 'accepted' ? 'open' : 'reject' }) }
      seen.dec = topDec
    }
    for (const t of [...snap.open, ...snap.closed]) {
      const k = `${t.id}:${t.status}`
      if (seen.trades.has(k)) continue
      if (!first) add.push({ t: Date.now(), text: t.status === 'OPEN' ? `נפתחה ${t.sym} ${t.side === 'LONG' ? 'לונג' : 'שורט'} ב־${fmtPx(Number(t.entry_price))}` : `נסגרה ${t.sym}: ${EXIT[t.scalp_meta?.exit_reason] ?? t.scalp_meta?.exit_reason ?? t.status} · ${fmt$(Number(t.pnl))}`, kind: t.status === 'OPEN' ? 'open' : Number(t.pnl) >= 0 ? 'win' : 'loss' })
      seen.trades.add(k)
    }
    const e0 = snap.errors[0] ? `${snap.errors[0].ts}` : ''
    if (e0 && e0 !== seen.err) { if (!first) add.push({ t: Date.parse(snap.errors[0].ts), text: `שגיאה: ${String(snap.errors[0].message).slice(0, 80)}`, kind: 'err' }); seen.err = e0 }
    if (add.length) setLog((l) => [...add.reverse(), ...l].slice(0, 40))
  }, [snap])  // eslint-disable-line react-hooks/exhaustive-deps

  // per-coin regimes from the bot's daily statistics
  const coins = useMemo(() => {
    const d = snap?.daily ?? {}, uni: string[] = (snap?.universe?.pairs ?? []).map((x: J) => String(x.sym))
    const names = [...new Set([...uni, ...Object.keys(d)])].sort()
    return names.map((s) => ({ sym: s, d: d[s] ?? null, reg: d[s] ? REGIMES[Number(d[s].regime)] ?? 'NEUTRAL' : null, inUni: uni.includes(s) }))
  }, [snap?.daily, snap?.universe])
  const regCount = coins.reduce((a: Record<string, number>, c) => (c.reg ? { ...a, [c.reg]: (a[c.reg] ?? 0) + 1 } : a), {})
  const held = new Set((snap?.open ?? []).map((t) => t.sym))
  const lastDecBy = useMemo(() => { const m: Record<string, J> = {}; for (const d of snap?.decisions ?? []) if (!m[d.sym]) m[d.sym] = d; return m }, [snap?.decisions])

  // risk numbers, the same definitions as shared/chan.ts riskStep
  const equity = Number(cyc?.equity) || null
  const peak = Number(risk?.peak) || null
  const dd = equity && peak ? Math.max(0, 1 - equity / peak) : null
  const dayOpen = Number(risk?.dayOpen) || null
  const dayMs = Math.floor(now / 86_400_000) * 86_400_000
  const realisedToday = (snap?.closed ?? []).filter((t) => Date.parse(t.closed_at) >= dayMs).reduce((s, t) => s + Number(t.pnl), 0)
  const dayLoss = dayOpen ? Math.max(0, -realisedToday / dayOpen) : null
  const streakFrom = Number(risk?.streakFrom) || 0
  let streak = 0
  for (const t of snap?.closed ?? []) { if (Date.parse(t.closed_at) < streakFrom) break; if (Number(t.pnl) < 0) streak++; else break }
  const nComp = (c: string) => (snap?.closed ?? []).filter((t) => t.scalp_meta?.chan?.comp === c).length
  const kellyOf = (c: string) => { const t = (snap?.open ?? []).concat(snap?.closed ?? []).find((x) => x.scalp_meta?.chan?.comp === c); return t?.scalp_meta?.chan }
  const openN = snap?.open.length ?? 0
  const cash = Number(snap?.state?.balance)
  const eqPts = (snap?.equity ?? []).map((x) => Number(x.equity)).filter(Number.isFinite)

  const moodScan: Mood = !fresh ? 'sleep' : halted ? 'sleep' : scanning ? 'work' : 'wait'
  const moodReg: Mood = !snap?.dailyTs ? 'sleep' : now - snap.dailyTs < 26 * 3_600_000 ? (now - snap.dailyTs < 10 * 60_000 ? 'work' : 'wait') : 'alarm'
  const recentDec = (c: string) => (snap?.decisions ?? []).some((d) => d.inferred?.comp === c && now - Date.parse(d.ts) < 10 * 60_000)
  const moodMR: Mood = halted ? 'sleep' : recentDec('RG_MR') ? 'work' : 'wait'
  const moodMOM: Mood = halted ? 'sleep' : recentDec('RG_MOM') ? 'work' : 'wait'
  const moodRisk: Mood = halted ? 'alarm' : paused ? 'sleep' : fresh ? 'work' : 'sleep'
  const moodExec: Mood = !fresh ? 'sleep' : openN > 0 ? 'work' : 'wait'
  const lastClose = snap?.closed[0] ? Date.parse(snap.closed[0].closed_at) : null
  const moodLog: Mood = lastClose && now - lastClose < 15 * 60_000 ? 'work' : 'wait'
  const collFresh = (t: number | null, maxMs: number) => t != null && now - t < maxMs
  const moodColl: Mood = collFresh(snap?.collector.options ?? null, 30 * 60_000) ? 'work' : 'alarm'
  const errs = snap?.errors.length ?? 0

  return (
    <div className="ch" dir="rtl">
      <style>{CSS}</style>
      <div className="ch-top">
        {onBack && <button className="ch-back" onClick={onBack}>→ חזרה</button>}
        <h1>בית הבוט · CHAN</h1>
        <span className={`ch-chip ${fresh ? 'ok' : 'bad'}`}>{fresh ? `● חי · מחזור ${ago(cycT, now)}` : `○ אין מחזור ${ago(cycT, now)}`}</span>
        <span className="ch-chip">{snap?.state?.paper_mode === false ? 'לא נייר!' : 'נייר בלבד'}</span>
        <span className="ch-chip">{snap?.manifest ? `${snap.manifest.enabled_sleeves ?? '—'} · ${String(snap.manifest.sha ?? '').slice(0, 7)}` : '—'}</span>
        <span className={`ch-chip ${errs ? 'bad' : 'ok'}`}>{errs ? `${errs} שגיאות בשעה` : '0 שגיאות בשעה'}</span>
      </div>
      <div className="ch-warn">מנוע ניסיוני: בבדיקה ההיסטורית (Phase 1) כל האסטרטגיות קיבלו NO-GO. הוא רץ על נייר כבדיקת תשתית בלבד — מה שקורה כאן איננו ראיה לרווחיות.</div>
      {err && <div className="ch-err">שגיאת קריאה: {err}</div>}

      <div className="ch-house">
        <div className="ch-roof">
          <div className="ch-roof-in">
            <div><span className="ch-k">הון</span><b><N>{fmt$(equity)}</N></b></div>
            <div><span className="ch-k">מזומן</span><b><N>{fmt$(Number.isFinite(cash) ? cash : null)}</N></b></div>
            <div><span className="ch-k">שיא</span><b><N>{fmt$(peak)}</N></b></div>
            <div><span className="ch-k">מהשיא</span><b className={dd && dd > 0.05 ? 'neg' : ''}><N>{dd == null ? '—' : `-${(dd * 100).toFixed(2)}%`}</N></b></div>
            <div><span className="ch-k">פתוחות</span><b><N>{openN} / {CHAN.risk.maxOpen}</N></b></div>
            <div><span className="ch-k">הנר הבא</span><b><N>{hm(nextBar)}</N> · עוד <N>{Math.floor(Math.max(0, nextBar - now) / 60000)}:{String(Math.floor((Math.max(0, nextBar - now) % 60000) / 1000)).padStart(2, '0')}</N></b></div>
          </div>
          <Spark pts={eqPts} />
        </div>

        <div className="ch-floor">
          <Room title="1 · סורק" who="מוריד נרות 5 דק׳ מבינאנס" shirt="#38bdf8" hair="#1e293b" mood={moodScan}
            status={halted ? 'עצור — לא סורק' : scanning ? (scanDone && universeN && scanDone >= universeN ? `נר ${hm(curBar)} נסרק במלואו (${universeN} מטבעות) — מחפש מועמדים` : `סורק את נר ${hm(curBar)}: ${scanDone ?? 0} מתוך ${universeN ?? '—'}`) : lastBar === curBar ? `נר ${hm(curBar)} נסרק במלואו — מחכה לנר ${hm(nextBar)}` : `מחכה לסגירת נר ${hm(nextBar)}`}>
            <div className="ch-bar big"><i style={{ width: `${universeN ? Math.min(100, ((scanDone ?? 0) / universeN) * 100) : 0}%` }} /></div>
            <div className="ch-kv"><span>יקום</span><b>{universeN ?? '—'} חוזים (מתוך {snap?.universe?.listed ?? '—'} ברשימה)</b></div>
            <div className="ch-kv"><span>נכשלו בנר האחרון</span><b>{cyc?.failed ?? '—'}</b></div>
            <div className="ch-kv"><span>משקל בינאנס/דקה</span><b><N>{cyc?.weight_1m ?? '—'} / {CHAN.scan.weightBudget}</N></b></div>
            <div className="ch-kv"><span>הנר האחרון שהושלם</span><b>{hm(lastBar)}</b></div>
          </Room>
          <Room title="2 · מזהה משטר" who="Hurst · תנודתיות · פעם ביום" shirt="#a78bfa" hair="#7c2d12" mood={moodReg}
            status={snap?.dailyTs ? `הסטטיסטיקה היומית עודכנה ${ago(snap.dailyTs, now)}` : 'אין עדיין נתונים'}>
            {REGIMES.map((r) => (
              <div key={r} className="ch-kv"><span><i className="ch-sq" style={{ background: REG[r].c }} />{REG[r].he}</span><b>{regCount[r] ?? 0}</b></div>
            ))}
            <div className="ch-muted">סף: Hurst &lt; {CHAN.regime.hurstMr} היפוך · &gt; {CHAN.regime.hurstTrend} מגמה · אחוזון תנודתיות &gt; {CHAN.regime.volPctHigh * 100}% לא נסחר</div>
          </Room>
        </div>

        <div className="ch-floor">
          <Room title="3 · היפוך לממוצע" who={`כניסה |z| ≥ ${CHAN.params.RG_MR.entryZ} · יציאה z=0 · סטופ ${CHAN.params.RG_MR.stopZ}`} shirt="#22d3ee" hair="#422006" mood={moodMR}
            status={`${regCount.MEAN_REVERT ?? 0} מטבעות במשטר שלו · ${nComp('RG_MR')} עסקאות נסגרו`}>
            <DecList ds={(snap?.decisions ?? []).filter((d) => d.inferred?.comp === 'RG_MR').slice(0, 5)} now={now} metric={(d) => `z ${Number(d.observed?.z).toFixed(2)}`} />
          </Room>
          <Room title="4 · מומנטום" who={`פריצת ${CHAN.params.RG_MOM.lookback} נרות · החזקה ${CHAN.params.RG_MOM.hold} נרות · t ≥ ${CHAN.mom.tMin}`} shirt="#8b5cf6" hair="#111827" mood={moodMOM}
            status={`${regCount.TREND ?? 0} מטבעות במשטר שלו · ${nComp('RG_MOM')} עסקאות נסגרו`}>
            <DecList ds={(snap?.decisions ?? []).filter((d) => d.inferred?.comp === 'RG_MOM').slice(0, 5)} now={now} metric={(d) => `t ${Number(d.observed?.t_sig).toFixed(2)}`} />
          </Room>
        </div>

        <div className="ch-floor">
          <Room title="5 · מנהל סיכונים" who="חצי־קלי · מפסקים" shirt="#ef4444" hair="#78350f" mood={moodRisk}
            status={halted ? `עצירה קשיחה: ${risk?.haltReason || snap?.state?.hard_halt_reason || ''}` : paused ? 'מושהה עד חצות UTC' : 'מאשר כניסות'}>
            <Meter label="ירידה מהשיא (עצירה ב־10%)" v={dd} limit={CHAN.risk.maxDD} fmt={(x) => `${(x * 100).toFixed(1)}%`} />
            <Meter label="הפסד ממומש היום (השהיה ב־3%)" v={dayLoss} limit={CHAN.risk.dailyLoss} fmt={(x) => `${(x * 100).toFixed(1)}%`} />
            <Meter label="הפסדים ברצף (השהיה ב־50)" v={streak} limit={CHAN.risk.maxConsec} fmt={(x) => String(Math.round(x))} />
            <Meter label="פוזיציות פתוחות" v={openN} limit={CHAN.risk.maxOpen} fmt={(x) => String(Math.round(x))} />
            {(['RG_MR', 'RG_MOM'] as const).map((c) => { const k = kellyOf(c); return (
              <div key={c} className="ch-kv"><span>סיכון לעסקה · {COMP[c]}</span><b>{k ? `${(Number(k.kelly_f) * 100).toFixed(2)}% (${nComp(c)}/${CHAN.risk.kellyMinTrades} עסקאות לקלי)` : `${CHAN.risk.defaultRisk * 100}% ברירת מחדל`}</b></div>
            ) })}
          </Room>
          <Room title="6 · ביצוע" who="מילוי לפי ספר הפקודות · סטופ על הטייפ" shirt="#22c55e" hair="#0f172a" mood={moodExec}
            status={openN ? `${openN} פוזיציות פתוחות` : 'אין פוזיציות פתוחות'}>
            {(snap?.open ?? []).map((t) => <Position key={t.id} t={t} mark={marks[t.sym]} now={now} />)}
            {!openN && <div className="ch-muted">כשייפתח משהו הוא יופיע כאן עם מחיר חי, סטופ, R וזמן החזקה.</div>}
          </Room>
        </div>

        <div className="ch-floor">
          <Room title="7 · יומן" who="עסקאות שנסגרו" shirt="#f59e0b" hair="#3f3f46" mood={moodLog}
            status={snap?.closed.length ? <>{snap.closed.length} אחרונות · נטו <N>{fmt$(snap.closed.reduce((s, t) => s + Number(t.pnl), 0))}</N></> : 'עוד לא נסגרה עסקה'}>
            {(snap?.closed ?? []).slice(0, 6).map((t) => (
              <div key={t.id} className="ch-row">
                <N className={Number(t.pnl) >= 0 ? 'pos' : 'neg'}>{fmt$(Number(t.pnl))}</N>
                <span>{t.sym} {t.side === 'LONG' ? '▲' : '▼'}</span>
                <span>{EXIT[t.scalp_meta?.exit_reason] ?? t.scalp_meta?.exit_reason ?? t.status}</span>
                <span className="ch-muted">{Number.isFinite(Number(t.scalp_meta?.r_multiple)) ? `${Number(t.scalp_meta.r_multiple).toFixed(2)}R` : ''} · {hm(t.closed_at)}</span>
              </div>
            ))}
          </Room>
          <Room title="8 · אוסף נתונים למחקר" who="לא סוחר — רק אוסף" shirt="#64748b" hair="#a16207" mood={moodColl}
            status="נתונים להשערות שנרשמו מראש">
            <div className="ch-kv"><span>ליקווידציות (OKX, רבע שעה)</span><b className={collFresh(snap?.collector.liq ?? null, 3_600_000) ? '' : 'neg'}>{ago(snap?.collector.liq, now)}</b></div>
            <div className="ch-kv"><span>אופציות (Deribit)</span><b className={collFresh(snap?.collector.options ?? null, 30 * 60_000) ? '' : 'neg'}>{ago(snap?.collector.options, now)}</b></div>
            <div className="ch-kv"><span>חדשות</span><b>{ago(snap?.collector.news, now)}</b></div>
            <div className="ch-sub">מבחני המשך (ספירה בלבד עד 200 עסקאות)</div>
            {fwd && fwd !== 'missing' ? (
              <>
                {[['H1_funding', 'מימון קיצוני'], ['H2_liquidation_fade', 'נגד גל ליקווידציות'], ['H3_options_skew', 'סקיו אופציות'], ['H4_news_momentum', 'מומנטום חדשות']].map(([k, he]) => (
                  <Meter key={k} label={he} v={Number(fwd[k]?.events ?? 0)} limit={Number(fwd.ready_at) || 200} fmt={(x) => String(Math.round(x))} />
                ))}
                <div className="ch-muted">מתחיל {hm(fwd.T0)} {String(fwd.T0 ?? '').slice(0, 10)} · נבדק {ago(Date.parse(fwd.checked_utc), now)}</div>
              </>
            ) : <div className="ch-muted">{fwd === 'missing' ? 'אין עדיין קובץ סטטוס' : 'טוען…'}</div>}
          </Room>
        </div>
      </div>

      <section className="ch-panel">
        <h2>כל המטבעות שהבוט סורק — המשטר של היום</h2>
        <div className="ch-legend">{REGIMES.map((r) => <span key={r}><i className="ch-sq" style={{ background: REG[r].c }} />{REG[r].he} · {REG[r].what}</span>)}<span><i className="ch-sq held" />מוחזק כרגע</span></div>
        <div className="ch-grid">
          {coins.map((c) => {
            const d = lastDecBy[c.sym]
            return (
              <button key={c.sym} className={`ch-coin ${held.has(c.sym) ? 'held' : ''} ${coinSel === c.sym ? 'sel' : ''}`} style={{ borderColor: c.reg ? REG[c.reg].c : '#1e293b', opacity: c.inUni ? 1 : 0.45 }} onClick={() => setCoinSel(coinSel === c.sym ? null : c.sym)}>
                <span style={{ color: c.reg ? REG[c.reg].c : '#475569' }}>{c.sym}</span>
                {d && now - Date.parse(d.ts) < 3_600_000 && <i className={d.decision === 'accepted' ? 'ch-pip ok' : 'ch-pip'} />}
              </button>
            )
          })}
          {!coins.length && <div className="ch-muted">טוען…</div>}
        </div>
        {coinSel && (() => {
          const c = coins.find((x) => x.sym === coinSel), d = lastDecBy[coinSel]
          return (
            <div className="ch-detail">
              <b>{coinSel}</b> · {c?.reg ? REG[c.reg].he : 'אין סטטיסטיקה עדיין'}{!c?.inUni && ' · מחוץ ליקום כרגע'}
              <div className="ch-kv"><span>Hurst</span><b>{c?.d ? Number(c.d.hurst).toFixed(3) : '—'}</b></div>
              <div className="ch-kv"><span>זמן מחצית (נרות)</span><b>{c?.d?.hl != null ? Number(c.d.hl).toFixed(0) : '—'}</b></div>
              <div className="ch-kv"><span>אחוזון תנודתיות</span><b>{c?.d?.volPct != null ? `${(Number(c.d.volPct) * 100).toFixed(0)}%` : '—'}</b></div>
              <div className="ch-kv"><span>t מומנטום</span><b>{c?.d ? Number(c.d.t).toFixed(2) : '—'}</b></div>
              <div className="ch-kv"><span>החלטה אחרונה</span><b>{d ? `${hm(d.ts)} · ${d.side === 'LONG' ? 'לונג' : 'שורט'} · ${d.decision === 'accepted' ? 'אושר' : 'נדחה'}: ${reasonHe(d.reason)}` : 'אין'}</b></div>
            </div>
          )
        })()}
      </section>

      <section className="ch-panel">
        <h2>מה קרה מאז שפתחת את הדף</h2>
        {log.length ? log.map((e, i) => <div key={i} className={`ch-log ${e.kind}`}><span>{hm(e.t)}</span>{e.text}</div>)
          : <div className="ch-muted">עוד לא קרה כלום מאז שנפתח הדף. כל אירוע אמיתי — סריקה שהסתיימה, מועמד שנבדק, עסקה שנפתחה או נסגרה — יופיע כאן כשהוא קורה.</div>}
      </section>
      <div className="ch-foot">כל מספר בדף נקרא מהטבלאות שהבוט עצמו כותב, ומתעדכן כל 5 שניות. מחירים חיים של פוזיציות: {Object.values(marks)[0]?.src ?? '—'} (תצוגה בלבד).</div>
    </div>
  )
}

function DecList({ ds, now, metric }: { ds: J[]; now: number; metric: (d: J) => string }) {
  if (!ds.length) return <div className="ch-muted">אין מועמדים שנרשמו עדיין — אות נרשם רק כשהתנאים מתקיימים.</div>
  return <>{ds.map((d, i) => (
    <div key={i} className="ch-row">
      <span className={d.decision === 'accepted' ? 'pos' : 'ch-muted'}>{d.decision === 'accepted' ? '✓' : '✗'}</span>
      <span>{d.sym} {d.side === 'LONG' ? '▲' : '▼'}</span>
      <span>{metric(d)}</span>
      <span className="ch-muted">{reasonHe(d.reason)} · {ago(Date.parse(d.ts), now)}</span>
    </div>
  ))}</>
}

function Position({ t, mark, now }: { t: J; mark?: { px: number; src: string; t: number }; now: number }) {
  const m = t.scalp_meta?.chan ?? {}, dir = t.side === 'LONG' ? 1 : -1, entry = Number(t.entry_price), size = Number(t.size)
  const px = mark && now - mark.t < 60_000 ? mark.px : null
  const pnl = px != null ? dir * (px - entry) * size : null
  const r = px != null && Number(m.r) > 0 ? (dir * (px - entry)) / Number(m.r) : null
  const heldMin = (now - Date.parse(t.opened_at)) / 60_000, maxMin = Number(m.max_hold_bars) * 5
  const toStop = px != null ? Math.abs(px - Number(m.stop)) / px : null
  return (
    <div className="ch-pos">
      <div className="ch-row"><b>{t.sym} {t.side === 'LONG' ? '▲ לונג' : '▼ שורט'}</b><span>{COMP[m.comp] ?? m.comp}</span><span className={pnl == null ? 'ch-muted' : pnl >= 0 ? 'pos' : 'neg'}>{pnl == null ? 'אין מחיר חי' : <N>{`${fmt$(pnl)} · ${r!.toFixed(2)}R`}</N>}</span></div>
      <div className="ch-row ch-muted"><span>כניסה {fmtPx(entry)}</span><span>עכשיו {fmtPx(px)}</span><span>סטופ {fmtPx(Number(m.stop))} ({toStop == null ? '—' : `${(toStop * 100).toFixed(2)}%`})</span></div>
      <div className="ch-bar"><i style={{ width: `${Math.min(100, (heldMin / maxMin) * 100)}%`, background: '#38bdf8' }} /></div>
      <div className="ch-row ch-muted"><span>מוחזק {Math.round(heldMin)} דק׳ מתוך {Math.round(maxMin)}</span><span>נכנס על z {Number(m.z).toFixed(2)} · {m.regime}</span><span><a href={`trade.html?id=${t.id}`}>גרף ←</a></span></div>
    </div>
  )
}

const CSS = `
.ch{color:#e2e8f0;font-family:system-ui,sans-serif;font-size:13px}
.ch h1{font-size:18px;margin:0 6px 0 0}
.ch-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.ch-back{background:none;border:1px solid #223150;color:#5aa9ff;border-radius:999px;padding:4px 10px}
.ch-chip{border:1px solid #223150;border-radius:999px;padding:3px 9px;font-size:12px;color:#94a3b8}
.ch-chip.ok{color:#34d399;border-color:#14532d}.ch-chip.bad{color:#f87171;border-color:#7f1d1d}
.ch-warn{background:#2a1a05;border:1px solid #78350f;color:#fbbf24;border-radius:10px;padding:8px 10px;margin-bottom:10px;font-size:12px}
.ch-err{color:#f87171;margin-bottom:8px}
.ch-house{background:#0b1220;border:2px solid #1e293b;border-radius:14px;overflow:hidden;image-rendering:pixelated}
.ch-roof{background:linear-gradient(#7f1d1d,#5b1414);padding:12px 12px 8px;clip-path:polygon(0 18px,50% 0,100% 18px,100% 100%,0 100%);padding-top:24px}
.ch-roof-in{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px;margin-bottom:6px}
.ch-roof-in>div{background:#00000044;border-radius:6px;padding:4px 8px;display:flex;flex-direction:column}
.ch-k{font-size:11px;color:#fecaca}
.ch-spark{width:100%;height:44px;display:block}
.ch-floor{display:grid;grid-template-columns:1fr 1fr;border-top:6px solid #3f2a14}
@media (max-width:640px){.ch-floor{grid-template-columns:1fr}}
.ch-room{border-inline-start:4px solid #3f2a14;padding:8px;background:#111a2e;min-width:0}
.ch-room-alarm{background:#2a1111}.ch-room-sleep{background:#0d1422}
.ch-room header{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.ch-room header b{font-size:14px}.ch-who{color:#94a3b8;font-size:11px;flex:1}
.ch-dot{width:9px;height:9px;border-radius:2px;background:#475569}
.ch-dot-work{background:#22c55e;box-shadow:0 0 6px #22c55e}.ch-dot-wait{background:#eab308}.ch-dot-alarm{background:#ef4444;animation:chb 1s steps(2) infinite}
.ch-body{display:flex;gap:10px}
.ch-info{flex:1;min-width:0}
.ch-status{font-weight:600;margin-bottom:6px;color:#f8fafc}
.ch-res{position:relative;width:64px;flex:none;display:flex;flex-direction:column;align-items:center}
.ch-desk{width:60px;height:10px;background:#7c4a1e;margin-top:-6px;position:relative}
.ch-screen{position:absolute;right:6px;top:-18px;width:20px;height:14px;background:#0f172a;border:2px solid #334155}
.ch-work svg{animation:chw .5s steps(2) infinite}.ch-work .ch-screen{background:#22c55e;animation:chs 1.2s steps(3) infinite}
.ch-wait .ch-screen{background:#1e3a5f}
.ch-sleep svg{transform:rotate(-8deg) translateY(4px);opacity:.7}
.ch-alarm .ch-screen{background:#ef4444;animation:chb 1s steps(2) infinite}
.ch-z{position:absolute;top:-4px;left:6px;color:#94a3b8;font:700 12px monospace;animation:chz 2s linear infinite}
.ch-bang{position:absolute;top:-6px;left:8px;color:#ef4444;font:900 16px monospace;animation:chb 1s steps(2) infinite}
@keyframes chw{0%{transform:translateY(0)}100%{transform:translateY(-2px)}}
@keyframes chs{0%{background:#22c55e}50%{background:#16a34a}100%{background:#4ade80}}
@keyframes chb{0%{opacity:1}100%{opacity:.3}}
@keyframes chz{0%{transform:translate(0,0);opacity:1}100%{transform:translate(-6px,-10px);opacity:0}}
@media (prefers-reduced-motion:reduce){.ch-res *,.ch-dot{animation:none!important}}
.ch-kv{display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px dashed #1e293b}
.ch-kv span{color:#94a3b8}
.ch-sq{display:inline-block;width:9px;height:9px;margin-inline-end:5px;border-radius:2px;vertical-align:middle}
.ch-sq.held{background:#fbbf24}
.ch-muted{color:#64748b;font-size:12px}
.ch-sub{margin-top:8px;font-weight:600;color:#cbd5e1}
.ch-bar{height:6px;background:#1e293b;border-radius:3px;overflow:hidden;margin:3px 0}.ch-bar i{display:block;height:100%;background:#38bdf8}
.ch-bar.big{height:10px}
.ch-meter{margin:4px 0}.ch-meter-l{display:flex;justify-content:space-between;font-size:12px;color:#94a3b8}
.ch-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;padding:2px 0;font-size:12px}
.ch-pos{border:1px solid #1e3a5f;border-radius:8px;padding:6px;margin-bottom:6px}
.ch-pos a{color:#5aa9ff}
.pos{color:#34d399}.neg{color:#f87171}
.ch-panel{margin-top:12px;background:#0b1220;border:1px solid #1e293b;border-radius:12px;padding:10px}
.ch-panel h2{font-size:15px;margin:0 0 8px}
.ch-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:#94a3b8;margin-bottom:8px}
.ch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:4px}
.ch-coin{position:relative;background:#0f172a;border:2px solid;border-radius:6px;padding:4px 2px;font:600 11px monospace;cursor:pointer}
.ch-coin.held{background:#3b2a05}.ch-coin.sel{outline:2px solid #fff}
.ch-pip{position:absolute;top:2px;left:2px;width:6px;height:6px;border-radius:50%;background:#94a3b8}.ch-pip.ok{background:#22c55e}
.ch-detail{margin-top:8px;background:#111a2e;border-radius:8px;padding:8px}
.ch-log{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #111a2e;font-size:12px}
.ch-log span{color:#64748b;font-family:monospace}
.ch-log.win{color:#34d399}.ch-log.loss,.ch-log.err{color:#f87171}.ch-log.open{color:#fbbf24}.ch-log.reject{color:#94a3b8}
.ch-foot{margin:10px 0;color:#475569;font-size:11px}
`
