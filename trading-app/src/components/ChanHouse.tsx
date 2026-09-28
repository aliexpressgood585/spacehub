import { useEffect, useMemo, useState } from 'react'
import { SUPA_KEY, SUPA_URL } from '../supa'

type J = any
const REST = `${SUPA_URL}/rest/v1/`
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
const DEFAULT_TAKER = 0.0005

async function q<T = J>(path: string): Promise<T> {
  const r = await fetch(REST + path, { headers: H, cache: 'no-store' })
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`)
  return r.json()
}

const fmt$ = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' :
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtPx = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (Math.abs(v) >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 5 })
  return v.toLocaleString('en-US', { maximumFractionDigits: 8 })
}

const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(2)}%`

function ago(t: number | null, now: number) {
  if (!t || !Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `לפני ${s} שנ׳`
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`
  return `לפני ${Math.floor(s / 3600)} ש׳`
}

function clock(t: string | number | null | undefined) {
  if (t == null) return '—'
  const d = new Date(t)
  return Number.isNaN(+d) ? '—' : d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const COMP: Record<string,string> = {
  RG_MR: 'חזרה לממוצע',
  RG_MOM: 'מומנטום',
  RG_TREND_PULLBACK: 'פריצה ותיקון',
}

function reasonHe(r: string) {
  if (r === 'taken') return 'עבר את כל השערים'
  if (r === 'coin_held') return 'כבר קיימת פוזיציה במסלול על המטבע'
  if (r === 'no_book') return 'ספר הפקודות לא היה זמין'
  if (r === 'stop_on_wrong_side_of_market') return 'המחיר כבר עבר את הסטופ'
  if (r === 'max leverage reached') return 'אין יותר קיבולת חשיפה'
  if (r === 'too_small_or_book_too_thin') return 'ספר דק מדי / גודל לא מספיק'
  if (r === 'fill_beyond_stop') return 'המילוי הצפוי היה מעבר לסטופ'
  if (r?.startsWith('stop closer than')) return 'הסטופ קרוב מדי ביחס לעלות'
  if (r?.startsWith('paused')) return 'נעצר בשער הסיכון'
  if (r?.startsWith('halted')) return 'נעצר בשער הסיכון'
  return r || '—'
}

function stopper(r: string) {
  if (r === 'coin_held') return 'מנהל הפורטפוליו'
  if (r === 'no_book' || r === 'too_small_or_book_too_thin' || r === 'fill_beyond_stop' || r === 'stop_on_wrong_side_of_market') return 'רובוט ביצוע'
  if (r === 'max leverage reached' || r?.startsWith('stop closer') || r?.startsWith('paused') || r?.startsWith('halted') || r?.startsWith('half-Kelly')) return 'רובוט סיכון'
  return 'רובוט האסטרטגיה'
}

function fallbackChain(d: J) {
  return [
    COMP[d?.inferred?.comp] ?? d?.inferred?.comp ?? 'אסטרטגיה',
    'Regime Router',
    'Risk Engine',
    'Binance Book Check',
    'CHAN SQL Ledger',
  ]
}

function economics(t: J, cyc: J, quote?: J) {
  const backend = cyc?.open_live?.[String(t.id)] ?? null
  const m = t.scalp_meta?.chan ?? {}
  const entry = Number(backend?.entry ?? t.entry_price)
  const size = Number(backend?.size ?? t.size)
  const lev = Math.max(1, Number(backend?.leverage ?? t.lev) || 1)
  const dir = t.side === 'LONG' ? 1 : -1
  const notional = entry * size
  const fallbackMark = Number(backend?.mark ?? cyc?.marks?.[t.sym] ?? entry)
  const liveTop = quote && Number(quote.bid) > 0 && Number(quote.ask) > 0
    ? (dir > 0 ? Number(quote.bid) : Number(quote.ask))
    : fallbackMark
  const impactBps = Math.max(0, Number(backend?.exit_impact_bps ?? 0))
  const impact = impactBps / 1e4
  const estExit = liveTop * (1 - dir * impact)
  const entryFee = Number(backend?.entry_fee ?? t.scalp_meta?.entry_fee ?? t.fee ?? notional * DEFAULT_TAKER)
  const taker = Number(backend?.fee_rate_taker ?? cyc?.cost_model?.taker ?? DEFAULT_TAKER)
  const exitFee = estExit * size * taker
  const grossMark = dir * (liveTop - entry) * size
  const grossExec = dir * (estExit - entry) * size
  const margin = notional / lev
  const net = grossExec - entryFee - exitFee
  const exitSlip = Math.abs(liveTop - estExit) * size
  return {
    ...(backend ?? {}),
    id:t.id, sym:t.sym, side:t.side, comp:backend?.comp ?? m.comp, opened_at:t.opened_at,
    leverage:lev, size, notional, margin,
    entry, bid:Number(quote?.bid ?? liveTop), ask:Number(quote?.ask ?? liveTop), mark:liveTop, est_exit:estExit,
    stop:Number(backend?.stop ?? m.stop),
    target:(backend?.target ?? m.target) == null ? null : Number(backend?.target ?? m.target),
    liq:Number(backend?.liq ?? entry * (1 - dir * (1/lev - 0.005))),
    regime:backend?.regime ?? m.regime, z:backend?.z ?? m.z, t_sig:backend?.t_sig ?? m.t_sig,
    gross_mark_pnl:grossMark, gross_exec_pnl:grossExec, net_pnl_to_close:net,
    roe_net:margin > 0 ? net / margin : null,
    entry_fee:entryFee, exit_fee_est:exitFee,
    entry_slippage_usd:Number(backend?.entry_slippage_usd ?? 0),
    exit_slippage_usd:exitSlip,
    entry_impact_bps:Number(backend?.entry_impact_bps ?? m.entry_fill?.impact_bps ?? 0),
    exit_impact_bps:impactBps,
    fee_rate_taker:taker,
    quote_ts:quote?.ts ?? backend?.quote_ts ?? cyc?.marks_ts,
    quote_source:quote ? 'BINANCE_WS' : (backend ? 'BOT_BOOK' : 'FALLBACK'),
    kelly_f:backend?.kelly_f ?? m.kelly_f, risk_usd:backend?.risk_usd ?? m.risk_usd,
    kelly_why:backend?.kelly_why ?? m.kelly_why,
  }
}

export default function ChanHouse({ onBack }: { onBack?: () => void }) {
  const [state, setState] = useState<J | null>(null)
  const [open, setOpen] = useState<J[]>([])
  const [manifest, setManifest] = useState<J | null>(null)
  const [errors, setErrors] = useState<J[]>([])
  const [decisions, setDecisions] = useState<J[]>([])
  const [recentClosed, setRecentClosed] = useState<J[]>([])
  const [liveQuotes, setLiveQuotes] = useState<Record<string,J>>({})
  const [wsLive, setWsLive] = useState(false)
  const [err, setErr] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [st, op, man, er, dec, cl] = await Promise.all([
          q<J[]>('bot_state?select=balance,bot_params,paper_mode,updated_at&limit=1'),
          q<J[]>('bot_trades?select=id,sym,side,status,strategy,lev,entry_price,size,fee,opened_at,scalp_meta&status=eq.OPEN&strategy=eq.CHAN&order=opened_at.desc'),
          q<J[]>('deployment_manifest?select=sha,enabled_sleeves&order=first_seen.desc&limit=1').catch(() => []),
          q<J[]>(`bot_errors?select=ts,scope,message&ts=gte.${new Date(Date.now()-3_600_000).toISOString()}&order=ts.desc&limit=20`).catch(() => []),
          q<J[]>('trade_decisions?select=ts,sym,side,decision,reason,notional,observed,inferred&inferred->>sleeve=eq.CHAN&order=ts.desc&limit=80').catch(() => []),
          q<J[]>('bot_trades?select=id,sym,side,status,lev,entry_price,exit_price,size,pnl,pnl_pct,fee,opened_at,closed_at,scalp_meta&strategy=eq.CHAN&status=neq.OPEN&closed_at=not.is.null&order=closed_at.desc&limit=1000').catch(() => []),
        ])
        if (!alive) return
        setState(st[0] ?? null)
        setOpen(op ?? [])
        setManifest(man[0] ?? null)
        setErrors(er ?? [])
        setDecisions(dec ?? [])
        setRecentClosed(cl ?? [])
        setErr('')
      } catch (e: any) {
        if (alive) setErr(String(e?.message ?? e))
      }
    }
    void load()
    const iv = setInterval(load, 2500)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  useEffect(() => {
    if (!open.length) { setWsLive(false); setLiveQuotes({}); return }
    let dead = false
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    // Binance lists PEPE as 1000PEPEUSDT while the bot stores PEPE per single coin.
    // Keep the display/portfolio quote in the SAME unit as entry_price/stop/target.
    const binanceMeta = (sym:string) => sym === 'PEPE'
      ? { stream: '1000PEPEUSDT', divisor: 1000 }
      : { stream: `${sym}USDT`, divisor: 1 }
    const reverse = new Map(open.map(t => [binanceMeta(String(t.sym)).stream.toUpperCase(), String(t.sym)]))
    const streams = [...reverse.keys()].map(s => `${s.toLowerCase()}@bookTicker`).join('/')

    const connect = () => {
      if (dead || !streams) return
      ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`)
      ws.onopen = () => { if (!dead) setWsLive(true) }
      ws.onmessage = (ev) => {
        if (dead) return
        try {
          const msg = JSON.parse(ev.data)
          const d = msg?.data ?? msg
          const streamSym = String(d?.s ?? '').toUpperCase()
          const sym = reverse.get(streamSym)
          if (!sym) return
          const meta = binanceMeta(sym)
          const bid = Number(d?.b) / meta.divisor
          const ask = Number(d?.a) / meta.divisor
          if (!(bid > 0) || !(ask > 0)) return
          setLiveQuotes(prev => ({ ...prev, [sym]: { bid, ask, ts: Number(d?.E ?? Date.now()), source: streamSym } }))
        } catch {}
      }
      ws.onerror = () => { if (!dead) setWsLive(false) }
      ws.onclose = () => {
        if (dead) return
        setWsLive(false)
        retry = setTimeout(connect, 1000)
      }
    }
    connect()
    return () => {
      dead = true
      if (retry) clearTimeout(retry)
      try { ws?.close() } catch {}
    }
  }, [open.map(t => `${t.sym}:${t.id}`).join('|')])

  const p = state?.bot_params ?? {}
  const cyc = p.chan_cycle ?? {}
  const cycT = cyc?.ts ? Date.parse(cyc.ts) : null
  const fresh = cycT != null && now - cycT < 90_000
  const activeErrors = errors.filter((e) => !cycT || Date.parse(e.ts) > cycT).length
  const wallets = p.chan_split?.wallets ?? {}
  const latest = decisions[0] ?? null
  const latestAccepted = decisions.find((d) => d.decision === 'accepted') ?? null
  const counts = cyc?.regime_counts ?? {}
  const liveScan = cyc?.live_scan ?? {}
  const scanning = fresh && liveScan?.status === 'continuous'

  const econ = useMemo(() => open.map(t => ({ trade:t, live:economics(t,cyc,liveQuotes[t.sym]) })), [open,cyc,liveQuotes])
  const closedTrades = useMemo(() => recentClosed.filter(t => t.status !== 'RESET' && Number.isFinite(Number(t.pnl))), [recentClosed])
  const closedWins = closedTrades.filter(t => Number(t.pnl) > 0).length
  const closedLosses = closedTrades.filter(t => Number(t.pnl) < 0).length
  const closedFlat = closedTrades.length - closedWins - closedLosses
  const winRate = closedTrades.length ? closedWins / closedTrades.length : null

  const startCapital = ['1','2'].reduce((s,id)=>s+Number(wallets?.[id]?.initial ?? 0),0) || 5000
  const realised = ['1','2'].reduce((s,id)=>s+Number(wallets?.[id]?.realised ?? 0),0)
  const feesPaid = ['1','2'].reduce((s,id)=>s+Number(wallets?.[id]?.fees ?? 0),0)
  const fundingPaid = ['1','2'].reduce((s,id)=>s+Number(wallets?.[id]?.funding ?? 0),0)
  const marginUsed = econ.reduce((s,x)=>s+Number(x.live.margin ?? 0),0)
  const exposure = econ.reduce((s,x)=>s+Number(x.live.notional ?? 0),0)
  const openNet = econ.reduce((s,x)=>s+Number(x.live.net_pnl_to_close ?? 0),0)
  const exitFees = econ.reduce((s,x)=>s+Number(x.live.exit_fee_est ?? 0),0)
  const exitSlip = econ.reduce((s,x)=>s+Number(x.live.exit_slippage_usd ?? 0),0)
  const modeledEquity = startCapital + realised + openNet
  const freeCollateral = Number(state?.balance ?? 0)

  const activities = useMemo(() => {
    const items:J[] = []
    if (cycT) items.push({
      ts: cyc.ts, kind:'cycle', robot:'CHAN Engine', icon:'◉',
      title:'מחזור מנוע נחתם',
      detail:`נפתחו ${Number(cyc.opened ?? 0)} · נסגרו ${Number(cyc.closed ?? 0)} · הון מחזור ${fmt$(Number(cyc.equity))}`
    })
    if (liveScan?.ts && Array.isArray(liveScan.checked)) {
      for (const x of liveScan.checked) items.push({
        ts: liveScan.ts, kind:'scan', robot:'רובוט סריקה', icon:'⌁',
        title:`${x.sym} נבדק מול Binance Futures`,
        detail:`Bid ${fmtPx(Number(x.bid))} · Ask ${fmtPx(Number(x.ask))} · Spread ${x.spread_bps == null ? '—' : Number(x.spread_bps).toFixed(2)+'bp'}`
      })
    }
    for (const d of decisions) items.push({
      ts:d.ts, kind:d.decision === 'accepted' ? 'approved' : 'rejected',
      robot:d.decision === 'accepted' ? 'שרשרת אישורים' : stopper(d.reason),
      icon:d.decision === 'accepted' ? '✓' : '×',
      title:`${d.sym} ${d.side} · ${d.decision === 'accepted' ? 'אושר' : 'נדחה'}`,
      detail:d.decision === 'accepted'
        ? `${COMP[d.inferred?.comp] ?? d.inferred?.comp ?? 'CHAN'} · חשיפה ${d.notional ? fmt$(Number(d.notional)) : '—'} · ${d.inferred?.leverage ? Number(d.inferred.leverage)+'×' : '50×'}`
        : reasonHe(d.reason)
    })
    for (const t of open) {
      const l=economics(t,cyc,liveQuotes[t.sym])
      items.push({
        ts:l.quote_ts ?? cyc.ts ?? t.opened_at, kind:'mark', robot:'רובוט ביצוע', icon:'↯',
        title:`${t.sym} · פוזיציה פתוחה עודכנה`,
        detail:`מחיר ${fmtPx(Number(l.mark))} · נטו אם סוגרים עכשיו ${fmt$(Number(l.net_pnl_to_close))} · ${Number(t.lev)}×`
      })
      items.push({
        ts:t.opened_at, kind:'opened', robot:'CHAN SQL Ledger', icon:'+',
        title:`${t.sym} ${t.side} נפתחה`,
        detail:`כמות ${Number(t.size).toLocaleString('en-US',{maximumFractionDigits:8})} · שווי ${fmt$(Number(t.entry_price)*Number(t.size))} · בטוחה ${fmt$(Number(t.entry_price)*Number(t.size)/Math.max(1,Number(t.lev)))}`
      })
    }
    for (const t of recentClosed) items.push({
      ts:t.closed_at, kind:Number(t.pnl)>=0?'closedWin':'closedLoss', robot:'רובוט יציאה', icon:'■',
      title:`${t.sym} · פוזיציה נסגרה · ${t.status}`,
      detail:`P&L נטו ${fmt$(Number(t.pnl))} · סיבה ${t.scalp_meta?.exit_reason ?? '—'} · מחיר יציאה ${fmtPx(Number(t.exit_price))}`
    })
    for (const e of errors) items.push({
      ts:e.ts, kind:'error', robot:e.scope || 'מערכת', icon:'!',
      title:'שגיאת מערכת', detail:String(e.message ?? '').slice(0,180)
    })
    return items
      .filter(x => x.ts)
      .sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts))
      .slice(0,80)
  }, [cyc,cycT,liveScan,decisions,open,recentClosed,errors,liveQuotes])

  const robots = useMemo(() => [
    {
      id:'scanner', icon:'⌁', title:'רובוט סריקה', active:scanning,
      status: scanning ? 'סורק ברצף ללא עצירה' : 'ממתין לנתון',
      detail: liveScan?.checked?.length ? liveScan.checked.map((x:J)=>x.sym).slice(0,6).join(' · ') : `${Number(cyc?.scanned ?? 0)} / ${Number(cyc?.universe ?? 0)} חוזים`,
      foot: liveScan?.ts ? `סבב #${Number(liveScan.loop ?? 0)+1} · ${ago(Date.parse(liveScan.ts),now)}` : (cycT ? `מחזור ${ago(cycT,now)}` : 'אין מחזור'),
    },
    {
      id:'regime', icon:'◫', title:'רובוט משטר שוק', active:fresh,
      status: fresh ? 'מסווג את השוק' : 'ממתין לנתונים',
      detail: `חזרה ${counts.MEAN_REVERT ?? 0} · מגמה ${counts.TREND ?? 0} · תנודתי ${counts.HIGH_VOL ?? 0}`,
      foot: `ניטרלי ${counts.NEUTRAL ?? 0}`,
    },
    {
      id:'signal', icon:'⌁', title:'רובוט איתות', active:!!latest,
      status: latest ? `${latest.sym} · ${COMP[latest.inferred?.comp] ?? latest.inferred?.comp ?? 'בדיקה'}` : 'ממתין למועמד',
      detail: latest ? `${latest.side === 'LONG' ? 'לונג' : 'שורט'} · ${latest.decision === 'accepted' ? 'אושר' : 'נדחה'}` : 'אין החלטה חדשה',
      foot: latest ? clock(latest.ts) : '—',
    },
    {
      id:'risk', icon:'◆', title:'רובוט סיכון', active:!!latestAccepted,
      status: latestAccepted ? 'אישור גודל וחשיפה' : 'ממתין לאות',
      detail: latestAccepted ? `סיכון ${pct(Number(latestAccepted.inferred?.kelly_f))} · ${latestAccepted.inferred?.leverage ? latestAccepted.inferred.leverage+'×' : '50×'}` : 'אין אישור חדש',
      foot: state?.paper_mode === false ? 'LIVE — לא צפוי' : 'PAPER · סטופ חובה',
    },
    {
      id:'exec', icon:'↯', title:'רובוט ביצוע', active:open.length > 0 || latest?.decision === 'accepted',
      status: open.length ? `${open.length} פוזיציות פתוחות` : 'ממתין לביצוע',
      detail: open.length ? open.slice(0,3).map(t => `${t.sym} ${t.side} ${Number(t.lev)}×`).join(' · ') : 'בדיקת ספר פקודות ומילוי',
      foot: latestAccepted ? `אישור אחרון ${clock(latestAccepted.ts)}` : '—',
    },
    {
      id:'ledger', icon:'▤', title:'רובוט ספר חשבונות', active:fresh && !activeErrors,
      status: activeErrors ? `${activeErrors} שגיאות פעילות` : 'המחזור נרשם',
      detail: `הון נטו ${fmt$(modeledEquity)} · פתוחות ${open.length}`,
      foot: manifest ? `build ${String(manifest.sha ?? '').slice(0,7)}` : '—',
    },
  ], [scanning,liveScan,cyc,cycT,now,counts,fresh,latest,latestAccepted,open,state,activeErrors,manifest,modeledEquity])

  return <div className="ch" dir="rtl">
    <style>{CSS}</style>

    <div className="top">
      {onBack && <button className="back" onClick={onBack}>→ חזרה</button>}
      <h1>בית הבוט · CHAN</h1>
      <span className={`chip ${fresh ? 'ok' : 'bad'}`}>{fresh ? `● חי · מחזור ${ago(cycT, now)}` : `○ אין מחזור ${ago(cycT, now)}`}</span>
      <span className="chip">{state?.paper_mode === false ? 'לא נייר!' : 'נייר בלבד'}</span>
      <span className="chip">{manifest ? `${manifest.enabled_sleeves ?? 'CHAN'} · ${String(manifest.sha ?? '').slice(0,7)}` : 'CHAN'}</span>
      <span className={`chip ${activeErrors ? 'bad' : 'ok'}`}>{activeErrors ? `${activeErrors} שגיאות פעילות` : '0 שגיאות פעילות'}</span>
      <span className={`chip ${open.length ? (wsLive ? 'ok' : 'bad') : ''}`}>{open.length ? (wsLive ? '● Binance WS חי' : '○ Binance WS מתחבר') : 'Binance WS בהמתנה'}</span>
    </div>

    {err && <div className="readerr">שגיאת קריאה: {err}</div>}

    <section className="accountStrip">
      <Stat k="הון פתיחה" v={fmt$(startCapital)} />
      <Stat k="הון נטו אם סוגרים עכשיו" v={fmt$(modeledEquity)} cls={modeledEquity>=startCapital?'pos':'neg'} />
      <Stat k="בטחונות בשימוש" v={fmt$(marginUsed)} />
      <Stat k="בטחונות פנויים" v={fmt$(freeCollateral)} />
      <Stat k="חשיפה נומינלית" v={fmt$(exposure)} />
      <Stat k="ממומש" v={fmt$(realised)} cls={realised>=0?'pos':'neg'} />
      <Stat k="פתוח נטו" v={fmt$(openNet)} cls={openNet>=0?'pos':'neg'} />
      <Stat k="עמלות ששולמו" v={fmt$(feesPaid)} />
      <Stat k="עמלת סגירה משוערת" v={fmt$(exitFees)} />
      <Stat k="החלקה לסגירה משוערת" v={fmt$(exitSlip)} />
      <Stat k="Funding" v={fmt$(fundingPaid)} />
      <Stat k="Win Rate" v={winRate == null ? '—' : `${(winRate*100).toFixed(1)}%`} cls={winRate != null && winRate >= .5 ? 'pos' : ''} />
      <Stat k="עסקאות סגורות" v={`${closedTrades.length} · W ${closedWins} / L ${closedLosses}${closedFlat ? ' / F '+closedFlat : ''}`} />
    </section>

    <section className="positions">
      <div className="sectionHead">
        <div><h2>פוזיציות פתוחות · P&L חי</h2><p>הרווח/הפסד נטו כולל עמלת פתיחה, עמלת סגירה משוערת והחלקת יציאה לפי ספר הפקודות.</p></div>
        <span className="countBadge">{open.length} פתוחות</span>
      </div>
      {econ.length === 0 ? <div className="emptyPos">אין כרגע פוזיציות פתוחות.</div> :
        <div className="positionGrid">
          {econ.map(({trade,live}) => <PositionCard key={trade.id} t={trade} live={live} onChart={()=>window.open(`trade.html?id=${encodeURIComponent(String(trade.id))}`,'_blank','noopener,noreferrer')} />)}
        </div>
      }
    </section>

    <section className="closedTrades">
      <div className="sectionHead">
        <div><h2>עסקאות שנסגרו</h2><p>כל עסקאות CHAN מאז האיפוס, ללא עסקת RESET טכנית. ה־P&L הוא הערך שנרשם בפועל בסימולציה.</p></div>
        <span className="countBadge">{closedTrades.length} סגורות · {winRate == null ? 'Win Rate —' : `Win Rate ${(winRate*100).toFixed(1)}%`}</span>
      </div>
      {closedTrades.length === 0 ? <div className="emptyPos">עדיין אין עסקאות סגורות.</div> :
      <div className="closedTableWrap">
        <table className="closedTable">
          <thead><tr>
            <th>זמן סגירה</th><th>מטבע</th><th>צד</th><th>תוצאה</th><th>P&L נטו</th><th>גודל</th><th>שווי פוזיציה</th><th>כניסה</th><th>יציאה</th><th>מינוף</th><th>עמלות</th><th>סיבה</th>
          </tr></thead>
          <tbody>
            {closedTrades.map(t => {
              const pnl=Number(t.pnl), qty=Number(t.size), entry=Number(t.entry_price), exit=Number(t.exit_price), lev=Math.max(1,Number(t.lev)||1)
              return <tr key={t.id} className={pnl>=0?'winRow':'lossRow'}>
                <td><bdi dir="ltr">{clock(t.closed_at)}</bdi></td>
                <td><b>{t.sym}</b></td>
                <td>{t.side}</td>
                <td>{t.status}</td>
                <td className={pnl>=0?'pos':'neg'}>{fmt$(pnl)}</td>
                <td><bdi dir="ltr">{qty.toLocaleString('en-US',{maximumFractionDigits:8})}</bdi></td>
                <td>{fmt$(entry*qty)}</td>
                <td><bdi dir="ltr">{fmtPx(entry)}</bdi></td>
                <td><bdi dir="ltr">{fmtPx(exit)}</bdi></td>
                <td>{lev}×</td>
                <td>{fmt$(Number(t.fee))}</td>
                <td>{t.scalp_meta?.exit_reason ?? t.status}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>}
    </section>

    <section className="factory">
      <div className="factoryHead">
        <div>
          <h2>בית הבקרה החי · מה הבוט עושה מאחורי הקלעים</h2>
          <p>סריקת השוק הקלה רצה ברצף בכל מחזור; החלטת כניסה עדיין מבוססת על נר 5 דקות סגור כדי לא לסחור על נר חלקי.</p>
        </div>
        <span className={`liveBadge ${fresh ? 'on' : ''}`}><i />{fresh ? 'LIVE' : 'STALE'}</span>
      </div>

      <div className="scanTicker">
        <b>סריקה רציפה</b>
        <span>סבב #{Number(liveScan?.loop ?? 0)+1}</span>
        <span>{Number(liveScan?.batch_size ?? 0)} נבדקו במחזור</span>
        <span>{Number(liveScan?.total ?? cyc?.universe ?? 0)} ביקום</span>
        <div className="symbols">{(liveScan?.checked ?? []).map((x:J)=><em key={x.sym}>{x.sym}<small>{x.spread_bps==null?'':' '+x.spread_bps+'bp'}</small></em>)}</div>
      </div>

      <div className="pipeline">
        {robots.map((r,i) => <RobotRoom key={r.id} {...r} last={i===robots.length-1} />)}
      </div>

      <div className="opsWall">
        <div className="opsHead">
          <div><b>LIVE OPERATIONS · כל מה שקורה בפועל</b><span>מחירי פוזיציות משתנים בכל Tick של Binance · נתוני מערכת מתרעננים כל 2.5 שניות</span></div>
          <div className="heartbeat"><i className={fresh?'on':''}/><span>Heartbeat {cycT ? ago(cycT,now) : '—'}</span></div>
        </div>
        <div className="opsGrid">
          <div className="opsFeed">
            {activities.length === 0 && <div className="empty">אין עדיין אירועים מתועדים.</div>}
            {activities.slice(0,35).map((a,idx)=><div className={`op ${a.kind}`} key={`${a.ts}-${a.title}-${idx}`}>
              <div className="opTime"><bdi dir="ltr">{clock(a.ts)}</bdi><small>{ago(Date.parse(a.ts),now)}</small></div>
              <div className="opRail"><i>{a.icon}</i><span/></div>
              <div className="opBody"><div><b>{a.title}</b><em>{a.robot}</em></div><p>{a.detail}</p></div>
            </div>)}
          </div>
          <div className="machineState">
            <div className="machineTitle"><b>מצב מכונה עכשיו</b><span>{fresh?'מחובר':'לא טרי'}</span></div>
            <DeskRow k="מחזור אחרון" v={cycT?clock(cycT):'—'} />
            <DeskRow k="סריקה רציפה" v={liveScan?.ts?clock(liveScan.ts):'—'} />
            <DeskRow k="סבב סריקה" v={'#'+String(Number(liveScan?.loop ?? 0)+1)} />
            <DeskRow k="Cursor" v={`${Number(liveScan?.cursor ?? 0)} / ${Number(liveScan?.total ?? cyc?.universe ?? 0)}`} />
            <DeskRow k="Batch אחרון" v={String(Number(liveScan?.batch_size ?? 0))} />
            <DeskRow k="פוזיציות פתוחות" v={String(open.length)} />
            <DeskRow k="P&L פתוח נטו" v={fmt$(openNet)} bad={openNet<0} />
            <DeskRow k="בטחונות בשימוש" v={fmt$(marginUsed)} />
            <DeskRow k="חשיפה" v={fmt$(exposure)} />
            <DeskRow k="החלטות בזיכרון" v={String(decisions.length)} />
            <DeskRow k="שגיאות פעילות" v={String(activeErrors)} bad={activeErrors>0} />
          </div>
        </div>
      </div>

      <div className="controlGrid">
        <div className="approval">
          <div className="subHead"><b>שרשרת אישורים בזמן אמת</b><span>{decisions.length} החלטות אחרונות</span></div>
          <div className="decisionList">
            {decisions.length === 0 && <div className="empty">עדיין אין החלטות CHAN חדשות.</div>}
            {decisions.slice(0,18).map((d,idx) => {
              const ok = d.decision === 'accepted'
              const chain: any[] = Array.isArray(d.inferred?.approval_chain) && d.inferred.approval_chain.length
                ? d.inferred.approval_chain.map((x:J) => x.by)
                : fallbackChain(d)
              return <div className={`decision ${ok ? 'yes' : 'no'}`} key={`${d.ts}-${d.sym}-${idx}`}>
                <div className="decisionTop">
                  <span className={`decisionDot ${ok ? 'yes' : 'no'}`} />
                  <b>{d.sym}</b>
                  <span>{d.side === 'LONG' ? 'LONG' : 'SHORT'}</span>
                  <span className="comp">{COMP[d.inferred?.comp] ?? d.inferred?.comp ?? '—'}</span>
                  <time>{clock(d.ts)}</time>
                </div>
                {ok ? <>
                  <div className="approvedText">אושר בפועל · {d.notional ? `חשיפה ${fmt$(Number(d.notional))}` : 'עבר לביצוע'}</div>
                  <div className="chain">
                    {chain.map((x:string,k:number) => <span key={k}><i>✓</i>{x}{k < chain.length-1 && <b>←</b>}</span>)}
                  </div>
                  <div className="tiny">
                    {d.inferred?.kelly_f != null && <>סיכון: {pct(Number(d.inferred.kelly_f))} · </>}
                    {d.inferred?.leverage != null && <>מינוף: {Number(d.inferred.leverage)}× · </>}
                    {d.observed?.regime && <>משטר: {d.observed.regime}</>}
                  </div>
                </> : <>
                  <div className="rejectedText">נדחה אצל <b>{stopper(d.reason)}</b> · {reasonHe(d.reason)}</div>
                  <div className="tiny">לא נפתחה עסקה ולא בוצעה התחייבות הון.</div>
                </>}
              </div>
            })}
          </div>
        </div>

        <div className="liveDesk">
          <div className="subHead"><b>לוח עבודה עכשיו</b><span>{scanning ? 'סריקה רציפה פעילה' : 'מחזור אחרון'}</span></div>
          <DeskRow k="נר החלטה" v={cyc?.bar ? clock(cyc.bar) : '—'} />
          <DeskRow k="חוזים שנסרקו בנר" v={`${Number(cyc?.scanned ?? 0)} / ${Number(cyc?.universe ?? 0)}`} />
          <DeskRow k="סריקת שוק רציפה" v={liveScan?.ts ? ago(Date.parse(liveScan.ts),now) : '—'} />
          <DeskRow k="החלטה אחרונה" v={latest ? `${latest.sym} · ${latest.decision === 'accepted' ? 'אושר' : 'נדחה'}` : '—'} />
          <DeskRow k="פתוחות כרגע" v={String(open.length)} />
          <DeskRow k="מינוף בפוזיציות" v={open.length ? open.map(t=>`${t.sym} ${Number(t.lev)}×`).join(' · ') : '—'} />
          <DeskRow k="נפתחו במחזור" v={String(Number(cyc?.opened ?? 0))} />
          <DeskRow k="נסגרו במחזור" v={String(Number(cyc?.closed ?? 0))} />
          <DeskRow k="שגיאות פעילות" v={String(activeErrors)} bad={activeErrors>0} />
          <DeskRow k="חתימת מחזור" v={cycT ? clock(cycT) : '—'} />
        </div>
      </div>
    </section>

    <section className="panel">
      <h2>ניסוי 50/50 · שני תקציבים עצמאיים</h2>
      <p className="muted">מסלול 1: חזרה לממוצע ומומנטום · מסלול 2: פריצה ותיקון. החישוב למטה נשאר נפרד לכל מסלול.</p>
      <div className="grid">
        {(['1','2'] as const).map((id) => {
          const w = wallets[id]
          if (!w) return <div key={id} className={`card c${id}`}>טוען…</div>
          const eq = Number(w.equity), initial = Number(w.initial), closed = Number(w.closed), wins = Number(w.wins)
          const nOpen = open.filter((t) => (t.scalp_meta?.chan?.sleeve ?? (t.scalp_meta?.chan?.comp === 'RG_TREND_PULLBACK' ? '2' : '1')) === id).length
          return <div key={id} className={`card c${id}`}>
            <h3>מסלול {id} · {id === '1' ? 'קיים — חזרה לממוצע ומומנטום' : 'חדש — פריצה ותיקון'}</h3>
            <Row k="הון בתחילת הניסוי" v={fmt$(initial)} />
            <Row k="הון לפי מחזור הבוט" v={fmt$(eq)} />
            <Row k="רווח / הפסד כולל פתוחות" v={fmt$(eq-initial)} cls={eq >= initial ? 'pos' : 'neg'} />
            <Row k="מזומן פנוי" v={fmt$(Number(w.cash))} />
            <Row k="עסקאות סגורות / הצלחה" v={closed > 0 ? `${closed} / ${(100*wins/closed).toFixed(1)}%` : '0 / —'} />
            <Row k="עמלות ששולמו" v={fmt$(Number(w.fees))} />
            <Row k="ירידה מרבית שנמדדה" v={`${(100*Number(w.max_dd ?? 0)).toFixed(2)}%`} />
            <Row k="פוזיציות פתוחות" v={String(nOpen)} />
          </div>
        })}
      </div>
    </section>

  </div>
}

function PositionCard({t,live,onChart}:{t:J;live:J;onChart:()=>void}) {
  const m=t.scalp_meta?.chan ?? {}
  const net=Number(live.net_pnl_to_close ?? 0), good=net>=0
  const dir=t.side==='LONG'?1:-1
  const stop=Number(live.stop), target=live.target==null?null:Number(live.target)
  const stopNet=Number.isFinite(stop) ? dir*(stop-Number(live.entry))*Number(live.size)-Number(live.entry_fee)-stop*Number(live.size)*Number(live.fee_rate_taker ?? DEFAULT_TAKER) : null
  const targetNet=target!=null&&Number.isFinite(target) ? dir*(target-Number(live.entry))*Number(live.size)-Number(live.entry_fee)-target*Number(live.size)*Number(live.fee_rate_taker ?? DEFAULT_TAKER) : null
  return <article className={`posCard ${good?'profit':'loss'}`}>
    <div className="posTop">
      <div><b>{t.sym}</b><span className={t.side==='LONG'?'long':'short'}>{t.side}</span><span>{Number(t.lev)}×</span></div>
      <div className={`bigPnl ${good?'pos':'neg'}`}>{fmt$(net)}<small>{pct(Number(live.roe_net))} על הבטוחה</small></div>
    </div>
    <div className="posMetrics">
      <Mini k="כניסה" v={fmtPx(Number(live.entry))}/>
      <Mini k="Bid חי" v={fmtPx(Number(live.bid))}/>
      <Mini k="Ask חי" v={fmtPx(Number(live.ask))}/>
      <Mini k="מחיר חי" v={fmtPx(Number(live.mark))}/>
      <Mini k="יציאה אם סוגרים עכשיו" v={fmtPx(Number(live.est_exit))}/>
      <Mini k="בטוחה" v={fmt$(Number(live.margin))}/>
      <Mini k="גודל פוזיציה" v={`${Number(live.size).toLocaleString('en-US',{maximumFractionDigits:8})} ${t.sym}`}/>
      <Mini k="שווי פוזיציה" v={fmt$(Number(live.notional))}/>
      <Mini k="P&L ברוטו" v={fmt$(Number(live.gross_mark_pnl))} cls={Number(live.gross_mark_pnl)>=0?'pos':'neg'}/>
      <Mini k="עמלת פתיחה" v={fmt$(Number(live.entry_fee))}/>
      <Mini k="עמלת סגירה משוערת" v={fmt$(Number(live.exit_fee_est))}/>
      <Mini k="החלקת פתיחה" v={fmt$(Number(live.entry_slippage_usd))}/>
      <Mini k="החלקת סגירה משוערת" v={fmt$(Number(live.exit_slippage_usd))}/>
      <Mini k="סטופ" v={fmtPx(stop)}/>
      <Mini k="מחיר מימוש / ליקווידציה" v={fmtPx(Number(live.liq))}/>
      <Mini k="הפסד נטו אם סטופ" v={fmt$(stopNet)} cls="neg"/>
      {target!=null&&<Mini k="יעד" v={fmtPx(target)}/>}
      {targetNet!=null&&<Mini k="רווח נטו אם יעד" v={fmt$(targetNet)} cls="pos"/>}
    </div>
    <div className="why">
      <b>למה נפתחה?</b>
      <span>{COMP[m.comp] ?? m.comp ?? 'CHAN'} · משטר {m.regime ?? '—'}{Number.isFinite(Number(m.z))?` · Z ${Number(m.z).toFixed(2)}`:''}</span>
      <small>{m.kelly_why ?? 'האות עבר אסטרטגיה, סיכון, ספר פקודות ולדג׳ר.'}</small>
      <small>עדכון מחיר אחרון: {clock(live.quote_ts)} · {live.quote_source === 'BINANCE_WS' ? 'Binance WebSocket חי' : 'מחזור הבוט'} · החלקת יציאה {Number(live.exit_impact_bps ?? 0).toFixed(2)}bp</small>
    </div>
    <button className="chartBtn" onClick={onChart}>פתח גרף מסך מלא</button>
  </article>
}

const TF = [
  ['1m','1 דק׳'],['3m','3 דק׳'],['5m','5 דק׳'],['15m','15 דק׳'],['30m','30 דק׳'],
  ['1h','1 ש׳'],['2h','2 ש׳'],['4h','4 ש׳'],['6h','6 ש׳'],['8h','8 ש׳'],['12h','12 ש׳'],
  ['1d','יום'],['3d','3 ימים'],['1w','שבוע'],['1M','חודש']
] as const

function FullScreenTradeChart({t,live,onClose}:{t:J;live:J;onClose:()=>void}) {
  const [tf,setTf]=useState<string>('5m')
  const [bars,setBars]=useState<J[]>([])
  const [e,setE]=useState('')
  const [kLive,setKLive]=useState(false)
  const symbol=t.sym==='PEPE'?'1000PEPEUSDT':`${t.sym}USDT`

  useEffect(()=>{
    let dead=false
    let ws:WebSocket|null=null
    setE(''); setBars([]); setKLive(false)
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(tf)}&limit=300`,{cache:'no-store'})
      .then(r=>{if(!r.ok)throw new Error('Binance '+r.status);return r.json()})
      .then(x=>{
        if(dead)return
        const initial=(Array.isArray(x)?x:[]).map((a:J)=>({t:+a[0],o:+a[1],h:+a[2],l:+a[3],c:+a[4],v:+a[5]}))
        setBars(initial)
        ws=new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${tf}`)
        ws.onopen=()=>{if(!dead)setKLive(true)}
        ws.onmessage=(ev)=>{
          if(dead)return
          try{
            const d=JSON.parse(ev.data)?.k
            if(!d)return
            const b={t:+d.t,o:+d.o,h:+d.h,l:+d.l,c:+d.c,v:+d.v}
            setBars(prev=>{
              const p=prev.slice(-299)
              const i=p.findIndex(x=>x.t===b.t)
              if(i>=0){const n=[...p];n[i]=b;return n}
              return [...p,b].slice(-300)
            })
          }catch{}
        }
        ws.onclose=()=>{if(!dead)setKLive(false)}
        ws.onerror=()=>{if(!dead)setKLive(false)}
      })
      .catch(x=>{if(!dead)setE(String(x?.message??x))})
    return()=>{dead=true;try{ws?.close()}catch{}}
  },[t.id,t.sym,tf])

  const rows=bars.filter(x=>Number.isFinite(x.c))
  const levels=[
    {name:'כניסה',v:Number(live.entry),cls:'entry'},
    {name:'Bid',v:Number(live.bid),cls:'cyan'},
    {name:'Ask',v:Number(live.ask),cls:'orange'},
    {name:'מחיר חי',v:Number(live.mark),cls:Number(live.net_pnl_to_close)>=0?'green':'red'},
    {name:'סגירה עכשיו',v:Number(live.est_exit),cls:'cyan'},
    {name:'סטופ',v:Number(live.stop),cls:'red'},
    {name:'יעד',v:live.target==null?NaN:Number(live.target),cls:'green'},
    {name:'מימוש/ליקווידציה',v:Number(live.liq),cls:'liq'},
  ].filter(x=>Number.isFinite(x.v))
  const all=[...rows.flatMap(x=>[x.h,x.l]),...levels.map(x=>x.v)]
  let min=all.length?Math.min(...all):0,max=all.length?Math.max(...all):1
  const pad=(max-min||Math.abs(max)||1)*.07;min-=pad;max+=pad
  const W=1500,Ht=720,left=12,right=185,top=18,bottom=34
  const plotW=W-left-right,plotH=Ht-top-bottom
  const y=(v:number)=>top+(max-v)/(max-min)*plotH
  const cw=Math.max(1.5,plotW/Math.max(1,rows.length)*.58)
  const x=(i:number)=>left+(i+.5)*plotW/Math.max(1,rows.length)
  const entryY=y(Number(live.entry)),curY=y(Number(live.est_exit))
  const bandY=Math.min(entryY,curY),bandH=Math.abs(entryY-curY)

  return <div className="chartModal" dir="rtl">
    <div className="chartModalTop">
      <div className="chartIdentity">
        <button onClick={onClose}>✕</button>
        <b>{t.sym}USDT</b><span className={t.side==='LONG'?'longText':'shortText'}>{t.side}</span><span>{Number(t.lev)}×</span>
        <i className={kLive?'on':''}/><small>{kLive?'KLINE LIVE':'מתחבר'}</small>
      </div>
      <div className="chartLivePrices">
        <span>Bid <b>{fmtPx(Number(live.bid))}</b></span>
        <span>Ask <b>{fmtPx(Number(live.ask))}</b></span>
        <span>מחיר חי <b>{fmtPx(Number(live.mark))}</b></span>
        <span>כניסה <b>{fmtPx(Number(live.entry))}</b></span>
        <span>סטופ <b>{fmtPx(Number(live.stop))}</b></span>
        <span>מימוש <b>{fmtPx(Number(live.liq))}</b></span>
      </div>
    </div>

    <div className="tfBar">{TF.map(([id,label])=><button key={id} className={tf===id?'active':''} onClick={()=>setTf(id)}>{label}</button>)}</div>

    <div className="fullChartArea">
      {e ? <div className="chartError">הגרף לא נטען: {e}</div> : !rows.length ? <div className="chartLoading">טוען נתוני Binance Futures…</div> :
      <svg viewBox={`0 0 ${W} ${Ht}`} preserveAspectRatio="none">
        <rect x={left} y={top} width={plotW} height={plotH} className="chartBg"/>
        <rect x={left} y={bandY} width={plotW} height={Math.max(1,bandH)} className={Number(live.net_pnl_to_close)>=0?'profitBand':'lossBand'}/>
        {[0,.2,.4,.6,.8,1].map((k,i)=><line key={i} x1={left} x2={left+plotW} y1={top+k*plotH} y2={top+k*plotH} className="gridLine"/>)}
        {rows.map((b,i)=>{
          const up=b.c>=b.o
          return <g key={b.t}><line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} className={up?'wickUp':'wickDown'}/><rect x={x(i)-cw/2} y={Math.min(y(b.o),y(b.c))} width={cw} height={Math.max(1,Math.abs(y(b.o)-y(b.c)))} className={up?'candleUp':'candleDown'}/></g>
        })}
        {levels.map(l=><g key={l.name}><line x1={left} x2={left+plotW} y1={y(l.v)} y2={y(l.v)} className={`lvl ${l.cls}`}/><rect x={left+plotW+4} y={y(l.v)-11} width="176" height="22" rx="5" className={`priceTagBg ${l.cls}`}/><text x={left+plotW+10} y={y(l.v)+4} className={`lvlText ${l.cls}`}>{l.name} {fmtPx(l.v)}</text></g>)}
        <text x={left} y={Ht-8} className="axisText">{clock(rows[0]?.t)}</text>
        <text x={left+plotW-60} y={Ht-8} className="axisText">{clock(rows[rows.length-1]?.t)}</text>
      </svg>}
    </div>

    <div className="chartMoneyBar">
      <Stat k="גודל" v={`${Number(live.size).toLocaleString('en-US',{maximumFractionDigits:8})} ${t.sym}`} />
      <Stat k="שווי פוזיציה" v={fmt$(Number(live.notional))} />
      <Stat k="בטוחה" v={fmt$(Number(live.margin))} />
      <Stat k="P&L ברוטו" v={fmt$(Number(live.gross_mark_pnl))} cls={Number(live.gross_mark_pnl)>=0?'pos':'neg'} />
      <Stat k="עמלת פתיחה" v={fmt$(Number(live.entry_fee))} />
      <Stat k="עמלת סגירה משוערת" v={fmt$(Number(live.exit_fee_est))} />
      <Stat k="החלקה משוערת" v={fmt$(Number(live.entry_slippage_usd)+Number(live.exit_slippage_usd))} />
      <Stat k="P&L נטו אם סוגרים עכשיו" v={fmt$(Number(live.net_pnl_to_close))} cls={Number(live.net_pnl_to_close)>=0?'pos':'neg'} />
      <Stat k="ROE נטו" v={pct(Number(live.roe_net))} cls={Number(live.roe_net)>=0?'pos':'neg'} />
    </div>
  </div>
}

function Row({k,v,cls=''}:{k:string;v:string;cls?:string}) { return <div className="row"><span>{k}</span><bdi dir="ltr" className={cls}>{v}</bdi></div> }
function Mini({k,v,cls=''}:{k:string;v:string;cls?:string}) { return <div className="mini"><span>{k}</span><bdi dir="ltr" className={cls}>{v}</bdi></div> }
function Stat({k,v,cls=''}:{k:string;v:string;cls?:string}) { return <div className="stat"><span>{k}</span><bdi dir="ltr" className={cls}>{v}</bdi></div> }
function DeskRow({k,v,bad=false}:{k:string;v:string;bad?:boolean}) { return <div className="deskRow"><span>{k}</span><b className={bad?'badText':''}>{v}</b></div> }

function RobotRoom({icon,title,active,status,detail,foot,last}:{icon:string;title:string;active:boolean;status:string;detail:string;foot:string;last:boolean}) {
  return <div className="robotWrap">
    <div className={`robotRoom ${active ? 'active' : ''}`}>
      <div className="roomTitle"><span className={`roomLed ${active ? 'on' : ''}`} />{title}</div>
      <div className="robotBody">
        <div className={`robot ${active ? 'working' : ''}`}>
          <div className="antenna"><i /></div>
          <div className="robotHead"><span>{icon}</span><i /><i /></div>
          <div className="robotTorso"><b>{active ? 'RUN' : 'WAIT'}</b></div>
        </div>
        <div className="robotText"><strong>{status}</strong><span>{detail}</span><small>{foot}</small></div>
      </div>
    </div>
    {!last && <div className={`pipe ${active ? 'flow' : ''}`}><i /><i /><i /></div>}
  </div>
}

const CSS = `
.ch{color:#e2e8f0;font-family:system-ui,sans-serif;font-size:15px;padding:4px}
.top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
h1{font-size:24px;margin:0 8px 0 0}.back{background:none;border:1px solid #223150;color:#94a3b8;border-radius:999px;padding:7px 14px}
.chip{border:1px solid #223150;border-radius:999px;padding:6px 12px;color:#94a3b8}.chip.ok{color:#34d399;border-color:#166534}.chip.bad{color:#f87171;border-color:#991b1b}
.warn{background:#2a1a05;border:1px solid #92400e;color:#fbbf24;border-radius:16px;padding:15px 18px;margin-bottom:18px;font-size:15px;line-height:1.55}
.readerr{color:#f87171;margin-bottom:10px}.pos{color:#34d399!important}.neg{color:#f87171!important}
.accountStrip{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin-bottom:18px}.stat{background:#09121f;border:1px solid #1e293b;border-radius:13px;padding:11px 12px;display:flex;flex-direction:column;gap:5px}.stat span{font-size:11px;color:#64748b}.stat bdi{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;transition:color .12s ease,transform .12s ease}
.panel,.factory,.positions{background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:18px}.panel,.positions{margin-bottom:18px}
.panel h2,.factory h2,.positions h2{font-size:23px;text-align:center;margin:0 0 8px}.muted{color:#64748b;text-align:center;line-height:1.45;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.card{background:#0b1220;border:2px solid;border-radius:18px;padding:16px 22px}.card.c1{border-color:#22d3ee}.card.c2{border-color:#fbbf24}.card h3{font-size:22px;margin:0 0 12px}.card.c1 h3{color:#22d3ee}.card.c2 h3{color:#fbbf24}
.row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px dashed #243047;font-size:17px}.row span{color:#94a3b8}.row bdi{font-variant-numeric:tabular-nums}

.sectionHead{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:14px}.sectionHead h2{text-align:right;margin:0}.sectionHead p{margin:4px 0 0;color:#64748b;font-size:13px}.countBadge{border:1px solid #334155;border-radius:999px;padding:6px 11px;color:#cbd5e1;white-space:nowrap}
.emptyPos{padding:28px;text-align:center;color:#64748b;border:1px dashed #243047;border-radius:14px}.positionGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}
.posCard{background:#07101b;border:1px solid #243047;border-right:4px solid #475569;border-radius:16px;padding:14px;min-width:0}.posCard.profit{border-right-color:#10b981}.posCard.loss{border-right-color:#ef4444}
.posTop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.posTop>div:first-child{display:flex;gap:7px;align-items:center}.posTop b{font-size:22px}.posTop span{font-size:11px;border:1px solid #334155;border-radius:999px;padding:3px 7px}.posTop .long{color:#34d399;border-color:#166534}.posTop .short{color:#f87171;border-color:#991b1b}
.bigPnl{font-size:24px;font-weight:900;text-align:left;font-variant-numeric:tabular-nums;transition:color .1s ease}.bigPnl small{display:block;font-size:11px;color:#64748b;font-weight:500;margin-top:2px}
.posMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:13px}.mini{background:#0b1624;border:1px solid #16253a;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:3px;min-width:0}.mini span{color:#64748b;font-size:10px}.mini bdi{font-size:13px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.why{margin-top:11px;background:#0a1421;border:1px solid #1e2d41;border-radius:11px;padding:10px;display:flex;flex-direction:column;gap:4px}.why b{color:#cbd5e1}.why span{font-size:12px;color:#94a3b8}.why small{font-size:11px;color:#5f7088;line-height:1.4}
.chartBtn{margin-top:10px;width:100%;background:#0e7490;border:0;color:white;border-radius:10px;padding:10px;font-weight:800}.chartBtn:active{transform:scale(.99)}
.chartBox{margin-top:10px;border:1px solid #203149;border-radius:13px;background:#050b13;padding:8px;overflow:hidden}.chartTitle{display:flex;justify-content:space-between;gap:8px;padding:5px 3px 8px}.chartTitle span{color:#64748b;font-size:11px}.chartBox svg{width:100%;height:auto;display:block}.chartBg{fill:#07101a}.gridLine{stroke:#142338;stroke-width:1}.profitBand{fill:rgba(16,185,129,.08)}.lossBand{fill:rgba(239,68,68,.08)}.wickUp{stroke:#34d399;stroke-width:1}.wickDown{stroke:#f87171;stroke-width:1}.candleUp{fill:#34d399}.candleDown{fill:#f87171}.lvl{stroke-width:1.5;stroke-dasharray:5 4}.lvl.entry{stroke:#60a5fa}.lvl.green{stroke:#34d399}.lvl.red{stroke:#f87171}.lvl.liq{stroke:#c084fc}.lvlText{font-size:10px;font-weight:700}.lvlText.entry{fill:#60a5fa}.lvlText.green{fill:#34d399}.lvlText.red{fill:#f87171}.lvlText.liq{fill:#c084fc}.axisText{fill:#475569;font-size:9px}.chartLegend{display:flex;gap:10px;flex-wrap:wrap;padding:5px}.chartLegend span{font-size:11px;color:#64748b}.chartLegend b{color:#cbd5e1}.chartLoading,.chartError{padding:18px;color:#64748b;text-align:center}.chartError{color:#fca5a5}

.closedTrades{background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:18px;margin-bottom:18px}.closedTrades h2{font-size:23px;text-align:right;margin:0}.closedTableWrap{overflow:auto;max-height:520px;border:1px solid #18273a;border-radius:12px}.closedTable{width:100%;border-collapse:collapse;min-width:1120px;font-size:12px}.closedTable th{position:sticky;top:0;background:#0a1421;color:#64748b;padding:9px;text-align:right;z-index:1}.closedTable td{padding:9px;border-top:1px solid #142236;white-space:nowrap}.closedTable .winRow{background:rgba(16,185,129,.025)}.closedTable .lossRow{background:rgba(239,68,68,.025)}

.chartModal{position:fixed;inset:0;z-index:9999;background:#030811;color:#e2e8f0;display:flex;flex-direction:column;padding:10px;overflow:auto}.chartModalTop{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 4px 9px;border-bottom:1px solid #15243a}.chartIdentity{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.chartIdentity button{border:1px solid #334155;background:#0b1220;color:#e2e8f0;border-radius:9px;width:34px;height:34px;font-size:18px}.chartIdentity>b{font-size:21px}.chartIdentity>span{font-size:12px;border:1px solid #334155;border-radius:999px;padding:4px 8px}.longText{color:#34d399}.shortText{color:#f87171}.chartIdentity i{width:7px;height:7px;border-radius:50%;background:#475569}.chartIdentity i.on{background:#34d399;box-shadow:0 0 9px #34d399}.chartIdentity small{color:#64748b}.chartLivePrices{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.chartLivePrices span{font-size:10px;color:#64748b}.chartLivePrices b{display:block;color:#e2e8f0;font-size:13px;font-variant-numeric:tabular-nums}.tfBar{display:flex;gap:5px;overflow-x:auto;padding:8px 2px}.tfBar button{border:1px solid #26384f;background:#08111d;color:#94a3b8;border-radius:7px;padding:6px 10px;white-space:nowrap}.tfBar button.active{background:#0e7490;color:white;border-color:#0891b2}.fullChartArea{flex:1;min-height:430px;border:1px solid #16263a;border-radius:10px;overflow:hidden;background:#050b13}.fullChartArea svg{width:100%;height:100%;min-height:430px;display:block}.priceTagBg{fill:#0b1220;stroke-width:1}.priceTagBg.entry{stroke:#60a5fa}.priceTagBg.green{stroke:#34d399}.priceTagBg.red{stroke:#f87171}.priceTagBg.liq{stroke:#c084fc}.priceTagBg.cyan{stroke:#22d3ee}.priceTagBg.orange{stroke:#f59e0b}.lvl.cyan{stroke:#22d3ee}.lvl.orange{stroke:#f59e0b}.lvlText.cyan{fill:#22d3ee}.lvlText.orange{fill:#f59e0b}.chartMoneyBar{display:grid;grid-template-columns:repeat(9,minmax(120px,1fr));gap:7px;padding-top:8px}
.factory{background:linear-gradient(180deg,#08111f,#0b1220 42%,#08111f)}.factoryHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.factoryHead h2{text-align:right;margin:0 0 5px}.factoryHead p{margin:0;color:#64748b;line-height:1.5}
.liveBadge{display:flex;align-items:center;gap:7px;border:1px solid #334155;border-radius:999px;padding:7px 12px;color:#64748b;font-weight:800}.liveBadge i{width:8px;height:8px;border-radius:50%;background:#475569}.liveBadge.on{color:#34d399;border-color:#166534}.liveBadge.on i{background:#34d399;box-shadow:0 0 14px #34d399;animation:pulse 1.2s infinite}
.scanTicker{border:1px solid #1e3348;background:#07111d;border-radius:13px;padding:10px 12px;margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.scanTicker>b{color:#22d3ee}.scanTicker>span{font-size:11px;color:#64748b}.symbols{display:flex;gap:5px;flex-wrap:wrap;width:100%}.symbols em{font-style:normal;font-size:10px;background:#0c1b2a;border:1px solid #17334a;border-radius:999px;padding:3px 7px;color:#cbd5e1}.symbols small{color:#64748b}
.pipeline{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:12px;align-items:stretch;margin-bottom:18px;overflow-x:auto;padding-bottom:6px}.robotWrap{display:flex;align-items:center;min-width:150px}.robotRoom{width:100%;min-height:186px;border:1px solid #23314a;border-radius:16px;background:#09111d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.015);padding:12px;transition:.25s}.robotRoom.active{border-color:#155e75;box-shadow:0 0 22px rgba(34,211,238,.08),inset 0 0 25px rgba(34,211,238,.03)}
.roomTitle{display:flex;gap:7px;align-items:center;font-weight:800;color:#cbd5e1;font-size:13px}.roomLed{width:7px;height:7px;border-radius:50%;background:#334155}.roomLed.on{background:#22d3ee;box-shadow:0 0 10px #22d3ee}.robotBody{display:flex;gap:11px;align-items:center;margin-top:20px}.robot{width:54px;min-width:54px;position:relative;filter:grayscale(.45);opacity:.65}.robot.working{filter:none;opacity:1;animation:bob 1.8s ease-in-out infinite}
.antenna{height:11px;width:2px;background:#64748b;margin:auto;position:relative}.antenna i{position:absolute;width:6px;height:6px;border-radius:50%;background:#64748b;top:-4px;left:-2px}.working .antenna i{background:#34d399;box-shadow:0 0 9px #34d399}.robotHead{height:39px;border:2px solid #475569;border-radius:10px;background:#111c2d;position:relative;display:flex;justify-content:center;align-items:center;color:#22d3ee}.robotHead>span{position:absolute;top:2px;font-size:10px;color:#64748b}.robotHead i{width:8px;height:8px;border-radius:50%;background:#64748b;margin:9px 4px 0}.working .robotHead i{background:#22d3ee;box-shadow:0 0 7px #22d3ee}.robotTorso{width:42px;height:28px;border:2px solid #475569;border-top:0;border-radius:0 0 8px 8px;background:#0f172a;margin:auto;display:flex;align-items:center;justify-content:center}.robotTorso b{font-size:9px;color:#64748b}.working .robotTorso b{color:#34d399}
.robotText{min-width:0;display:flex;flex-direction:column;gap:5px}.robotText strong{font-size:13px;color:#e2e8f0}.robotText span{font-size:12px;color:#94a3b8;line-height:1.35}.robotText small{font-size:11px;color:#475569}.pipe{width:12px;min-width:12px;height:3px;background:#1e293b;margin:0 -1px;display:flex;justify-content:space-around}.pipe i{width:3px;height:3px;border-radius:50%;background:#334155}.pipe.flow i{background:#22d3ee;animation:flow 1.1s infinite}.pipe.flow i:nth-child(2){animation-delay:.2s}.pipe.flow i:nth-child(3){animation-delay:.4s}
.opsWall{margin:4px 0 18px;border:1px solid #18324a;border-radius:16px;background:#050d17;overflow:hidden}.opsHead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 15px;border-bottom:1px solid #16283b;background:linear-gradient(90deg,rgba(34,211,238,.05),transparent)}.opsHead>div:first-child{display:flex;flex-direction:column;gap:3px}.opsHead b{font-size:15px;color:#dbeafe}.opsHead span{font-size:11px;color:#64748b}.heartbeat{display:flex;align-items:center;gap:7px}.heartbeat i{width:8px;height:8px;border-radius:50%;background:#475569}.heartbeat i.on{background:#22c55e;box-shadow:0 0 12px #22c55e;animation:pulse 1s infinite}.opsGrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(250px,1fr)}.opsFeed{max-height:620px;overflow:auto;border-left:1px solid #14263a}.op{display:grid;grid-template-columns:72px 28px 1fr;gap:8px;padding:10px 12px;border-bottom:1px solid #101e2e;min-height:58px}.opTime{display:flex;flex-direction:column;gap:2px;text-align:left}.opTime bdi{font-size:11px;color:#94a3b8;font-variant-numeric:tabular-nums}.opTime small{font-size:9px;color:#475569}.opRail{display:flex;flex-direction:column;align-items:center}.opRail i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#102033;border:1px solid #28435d;color:#94a3b8;font-style:normal;font-size:11px;font-weight:900;z-index:1}.opRail span{width:1px;flex:1;background:#1e344a}.op.approved .opRail i,.op.opened .opRail i,.op.closedWin .opRail i{color:#34d399;border-color:#166534;background:#082019}.op.rejected .opRail i,.op.closedLoss .opRail i,.op.error .opRail i{color:#f87171;border-color:#7f1d1d;background:#250b0b}.op.scan .opRail i,.op.mark .opRail i,.op.cycle .opRail i{color:#22d3ee;border-color:#155e75;background:#071d25}.opBody{min-width:0}.opBody>div{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.opBody b{font-size:12px;color:#e2e8f0}.opBody em{font-size:9px;font-style:normal;color:#64748b;border:1px solid #25364b;border-radius:999px;padding:2px 6px}.opBody p{font-size:11px;color:#718096;margin:5px 0 0;line-height:1.45;word-break:break-word}.machineState{background:#07111c}.machineTitle{display:flex;justify-content:space-between;padding:13px 15px;border-bottom:1px solid #14263a}.machineTitle b{font-size:14px}.machineTitle span{font-size:10px;color:#34d399}.panel{margin-top:18px}
.controlGrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:16px}.approval,.liveDesk{border:1px solid #1e293b;border-radius:16px;background:#07101b;overflow:hidden}.subHead{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:13px 15px;border-bottom:1px solid #1e293b}.subHead b{font-size:16px}.subHead span{font-size:12px;color:#64748b}.decisionList{max-height:540px;overflow:auto}.empty{padding:24px;color:#64748b;text-align:center}.decision{padding:13px 15px;border-bottom:1px solid #111d2e}.decision:last-child{border-bottom:0}.decision.yes{background:linear-gradient(90deg,rgba(16,185,129,.05),transparent 45%)}.decision.no{background:linear-gradient(90deg,rgba(239,68,68,.035),transparent 45%)}
.decisionTop{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.decisionTop time{margin-right:auto;color:#64748b;font-size:12px;font-variant-numeric:tabular-nums}.decisionTop>span{font-size:12px;color:#94a3b8}.decisionTop .comp{color:#cbd5e1}.decisionDot{width:8px;height:8px;border-radius:50%}.decisionDot.yes{background:#34d399;box-shadow:0 0 8px #34d399}.decisionDot.no{background:#f87171}.approvedText{color:#34d399;margin:8px 16px 6px 0;font-size:13px}.rejectedText{color:#fca5a5;margin:8px 16px 4px 0;font-size:13px}.chain{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-right:16px}.chain span{display:flex;align-items:center;gap:4px;font-size:11px;color:#94a3b8;background:#0d1726;border:1px solid #1f3349;border-radius:999px;padding:3px 7px}.chain span i{color:#34d399;font-style:normal}.chain span b{color:#334155}.tiny{font-size:11px;color:#526074;margin:6px 16px 0 0}
.liveDesk{padding-bottom:5px}.deskRow{display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-bottom:1px dashed #1c293a}.deskRow span{color:#64748b}.deskRow b{font-size:13px;color:#dbeafe;text-align:left}.badText{color:#f87171!important}
@keyframes pulse{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@keyframes flow{0%{opacity:.15;transform:translateX(0)}50%{opacity:1}100%{opacity:.15;transform:translateX(-4px)}}
@media(max-width:1000px){.accountStrip{grid-template-columns:repeat(3,1fr)}.pipeline{grid-template-columns:repeat(6,190px)}.controlGrid{grid-template-columns:1fr}.opsGrid{grid-template-columns:1fr}.opsFeed{border-left:0;border-bottom:1px solid #14263a}.factoryHead{align-items:center}}
@media(max-width:640px){.chartModal{padding:4px}.chartModalTop{align-items:flex-start;flex-direction:column}.chartLivePrices{justify-content:flex-start}.fullChartArea{min-height:58vh}.fullChartArea svg{min-height:58vh}.chartMoneyBar{grid-template-columns:repeat(2,minmax(0,1fr))}.op{grid-template-columns:58px 24px 1fr;padding:8px 7px}.opTime bdi{font-size:10px}.opsHead{align-items:flex-start}.heartbeat{flex-direction:column;align-items:flex-end}.ch{font-size:13px}.panel,.factory,.positions{padding:12px}.grid{grid-template-columns:1fr}.row{font-size:15px}.card h3{font-size:19px}.panel h2,.factory h2,.positions h2{font-size:20px}h1{font-size:22px}.factoryHead p{font-size:12px}.pipeline{grid-template-columns:repeat(6,175px);margin-left:-4px;margin-right:-4px}.decisionTop time{width:100%;margin:0}.chain{margin-right:0}.approvedText,.rejectedText,.tiny{margin-right:0}.accountStrip{grid-template-columns:repeat(2,1fr)}.positionGrid{grid-template-columns:1fr}.posMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.sectionHead{align-items:flex-start}.chartTitle{flex-direction:column}.stat bdi{font-size:15px}}
`
