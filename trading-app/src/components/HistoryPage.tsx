// v101.2 — position history with every cost (owner: "show fees, on a separate page, position history like before, all
// the data"). Read-only: every number comes from bot_trades with the public anon key; nothing is computed that the
// ledger does not book. The ledgers since v99 share one formula, so the costs below are exact for those rows:
//   pnl = gross − entry fee (t.fee) − leg fees (BLADE/DONCH4H ladder: px × qty × 5 bps per leg) − exit fee
//         (scalp_meta.exit_fee) − funding (scalp_meta.funding_paid; negative = received)
// so gross = pnl + all fees + funding. Slippage is inside the fill prices (never better than touch + slip).
// Open rows show the fees already paid and a live mark from the same feed as the house (useExitMarks).
import { useEffect, useMemo, useState } from 'react'
import { SUPA_KEY, SUPA_URL } from '../supa'
import { useExitMarks } from '../livePrices'
import { tradeMetrics } from '../tradeMetrics'

type J = Record<string, any>
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
const TAKER = 0.0005
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const fmt$ = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '—' :
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPx = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v) || v === 0) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (Math.abs(v) >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 5 })
  return v.toLocaleString('en-US', { maximumFractionDigits: 8 })
}
const when = (t: string | null | undefined) => {
  if (!t) return '—'
  const d = new Date(t)
  return Number.isNaN(+d) ? '—' : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const dur = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} דק׳` : m < 1440 ? `${Math.floor(m / 60)} ש׳ ${m % 60} דק׳` : `${Math.floor(m / 1440)} ימים ${Math.floor((m % 1440) / 60)} ש׳`
}
const REASON: Record<string, string> = { STOP: 'סטופ', TRAIL: 'סטופ נגרר', TARGET: 'יעד', TIMEOUT: 'תום זמן', TIME: 'עצירת זמן', MAXHOLD: 'זמן מקסימלי',
  SCALE: 'חצי ב-3%', LIQ: 'חיסול', OWNER_CLOSE: 'נסגר ידנית', SETTLED: 'אחרי funding', HOLD_END: 'תום החזקה', BE: 'נקודת איזון', TP: 'יעד', SL: 'סטופ' }
const STRAT: Record<string, string> = { DONCH4H: 'DONCH4H · פריצת 4 שעות', BLADE: 'BLADE · הודעות Binance', PRO: 'PRO', V100_PRO: 'PRO (עידן קודם)',
  V99_FAST: 'FAST (עידן v99)', V99_FUND: 'FUND (עידן v99)', V99_LIST: 'LIST (עידן v99)' }

export interface Costs { entryFee: number; legFee: number; exitFee: number; funding: number; fees: number; gross: number | null; net: number | null; notional0: number }
export function tradeCosts(t: J): Costs {
  const m = t.scalp_meta ?? {}, entryFee = n(t.fee)
  const legs: J[] = Array.isArray(m.legs) ? m.legs : []
  const legFee = legs.reduce((s, l) => s + (Number.isFinite(Number(l.fee)) ? n(l.fee) : n(l.px) * n(l.qty) * TAKER), 0)
  const exitFee = n(m.exit_fee), funding = n(m.funding_paid ?? m.funding)
  const fees = entryFee + legFee + exitFee
  const closed = t.status !== 'OPEN' && t.closed_at && t.pnl != null
  const legQty = legs.reduce((s, l) => s + n(l.qty), 0)
  const notional0 = n(m.notional0) || n(t.entry_price) * (n(t.size) + (closed ? 0 : legQty))
  return { entryFee, legFee, exitFee, funding, fees, gross: closed ? n(t.pnl) + fees + funding : null, net: closed ? n(t.pnl) : null, notional0 }
}

async function fetchAll(): Promise<J[]> {
  const out: J[] = []
  for (let off = 0; off < 10000; off += 1000) {
    const r = await fetch(`${SUPA_URL}/rest/v1/bot_trades?select=id,sym,side,status,strategy,lev,entry_price,exit_price,size,pnl,fee,risk_usd,trail_sl,opened_at,closed_at,legs_banked,exit_stage,scalp_meta&order=opened_at.desc&limit=1000&offset=${off}`,
      { headers: H, cache: 'no-store' })
    if (!r.ok) throw new Error(`bot_trades ${r.status}`)
    const rows: J[] = await r.json(); out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export default function HistoryPage() {
  const [rows, setRows] = useState<J[]>([])
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [strat, setStrat] = useState('ALL')
  const [status, setStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL')
  const [coin, setCoin] = useState('')
  const [shown, setShown] = useState(100)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [])
  useEffect(() => {
    let alive = true
    const load = async () => { try { const r = await fetchAll(); if (alive) { setRows(r); setErr(''); setLoaded(true) } } catch (e: any) { if (alive) setErr(String(e?.message ?? e)) } }
    void load(); const iv = setInterval(load, 15000)
    return () => { alive = false; clearInterval(iv) }
  }, [])
  const strategies = useMemo(() => [...new Set(rows.map(r => String(r.strategy)))].sort(), [rows])
  const list = rows.filter(r => (strat === 'ALL' || r.strategy === strat)
    && (status === 'ALL' || (status === 'OPEN' ? r.status === 'OPEN' : r.status !== 'OPEN' && r.closed_at))
    && (!coin || String(r.sym).toUpperCase().includes(coin.toUpperCase())))
  const open = list.filter(r => r.status === 'OPEN')
  const { marks } = useExitMarks(open.map(t => ({ sym: String(t.sym), side: String(t.side) })))
  const closed = list.filter(r => r.status !== 'OPEN' && r.closed_at && r.pnl != null)
  const sum = closed.reduce((a, t) => { const c = tradeCosts(t); a.net += c.net ?? 0; a.gross += c.gross ?? 0; a.fees += c.fees; a.funding += c.funding
    a.entry += c.entryFee; a.legs += c.legFee; a.exit += c.exitFee; a.vol += c.notional0; if ((c.net ?? 0) > 0) { a.w++; a.won += c.net ?? 0 } else a.lost -= c.net ?? 0; return a },
    { net: 0, gross: 0, fees: 0, funding: 0, entry: 0, legs: 0, exit: 0, vol: 0, w: 0, won: 0, lost: 0 })
  const openFees = open.reduce((s, t) => s + tradeCosts(t).fees, 0)
  const pf = sum.lost > 0 ? sum.won / sum.lost : null

  return <div dir="rtl" style={{ color: '#e5e7eb', fontFamily: 'system-ui, sans-serif' }}>
    <style>{CSS}</style>
    <div className="hTop">
      <a className="hBack" href="./house.html">→ לבית הבוט</a>
      <h1>היסטוריית פוזיציות ועמלות</h1>
      <span className="hChip">דמו · נייר בלבד</span>
      <span className="hChip">{loaded ? `${rows.length} שורות` : 'טוען…'}</span>
    </div>
    {err && <div className="hErr">שגיאת קריאה: {err}</div>}

    <div className="hStats">
      <S k="עסקאות סגורות" v={`${closed.length}`} sub={closed.length ? `${sum.w} רווח · ${closed.length - sum.w} הפסד · ${(sum.w / closed.length * 100).toFixed(0)}%` : ''} />
      <S k="נטו (אחרי כל העלויות)" v={fmt$(sum.net)} cls={sum.net >= 0 ? 'pos' : 'neg'} />
      <S k="ברוטו (לפני עלויות)" v={fmt$(sum.gross)} cls={sum.gross >= 0 ? 'pos' : 'neg'} />
      <S k="סה״כ עמלות" v={fmt$(sum.fees)} cls="neg" sub={`כניסה ${fmt$(sum.entry)} · חלקי ${fmt$(sum.legs)} · יציאה ${fmt$(sum.exit)}`} />
      <S k="Funding" v={fmt$(-sum.funding)} cls={sum.funding <= 0 ? 'pos' : 'neg'} sub="שלילי = שולם, חיובי = התקבל" />
      <S k="עמלות מתוך מחזור" v={sum.vol > 0 ? `${(sum.fees / sum.vol * 1e4).toFixed(1)} bps` : '—'} sub={`מחזור ${fmt$(sum.vol)}`} />
      <S k="עמלות מתוך הברוטו" v={sum.gross > 0 ? `${(sum.fees / sum.gross * 100).toFixed(0)}%` : sum.fees > 0 ? 'הברוטו לא חיובי' : '—'} />
      <S k="Profit factor" v={pf != null ? pf.toFixed(2) : '—'} />
      <S k="פתוחות · עמלות ששולמו" v={`${open.length} · ${fmt$(openFees)}`} />
    </div>
    <div className="hNote">העמלות הן כפי שנרשמו בספר: taker 0.05% בכל צד (כניסה, כל יציאה חלקית ויציאה סופית). ההחלקה כבר כלולה במחירי הכניסה והיציאה. ברוטו = נטו + עמלות + funding.</div>

    <div className="hFilters">
      <select value={strat} onChange={e => { setStrat(e.target.value); setShown(100) }}>
        <option value="ALL">כל האסטרטגיות</option>
        {strategies.map(s => <option key={s} value={s}>{STRAT[s] ?? s}</option>)}
      </select>
      <select value={status} onChange={e => { setStatus(e.target.value as any); setShown(100) }}>
        <option value="ALL">פתוחות + סגורות</option><option value="OPEN">פתוחות</option><option value="CLOSED">סגורות</option>
      </select>
      <input placeholder="חיפוש מטבע" value={coin} onChange={e => { setCoin(e.target.value); setShown(100) }} />
    </div>

    {loaded && list.length === 0 && <div className="hEmpty">אין שורות שמתאימות לסינון.</div>}
    <div className="hGrid">
      {list.slice(0, shown).map(t => {
        const c = tradeCosts(t), isOpen = t.status === 'OPEN', dir = t.side === 'LONG' ? 1 : -1, m = t.scalp_meta ?? {}
        const mk = isOpen ? marks[`${t.sym}:${t.side}`]?.mark ?? null : null, tm = isOpen && mk != null ? tradeMetrics(t, mk, now) : null
        const net = isOpen ? tm?.net ?? null : c.net, R = n(t.risk_usd) > 0 && net != null ? net / n(t.risk_usd) : null
        const legs: J[] = Array.isArray(m.legs) ? m.legs : []
        const hold = (t.closed_at ? Date.parse(t.closed_at) : now) - Date.parse(t.opened_at)
        const reason = m.exit_reason ?? (isOpen ? null : t.status)
        return <div key={t.id} className={`hCard ${isOpen ? 'open' : net != null && net >= 0 ? 'win' : 'loss'}`}>
          <div className="hHead">
            <b>{t.sym} <span style={{ color: dir > 0 ? '#4ade80' : '#f87171' }}>{t.side === 'LONG' ? 'לונג' : 'שורט'}</span></b>
            <span className="hTag">{isOpen ? 'פתוחה' : REASON[String(reason)] ?? reason ?? 'סגורה'}</span>
          </div>
          <div className="hSub">#{t.id} · {STRAT[t.strategy] ?? t.strategy} · {n(t.lev) || 1}x</div>
          <div className={`hNet ${net == null ? '' : net >= 0 ? 'pos' : 'neg'}`}>
            <bdi dir="ltr">{fmt$(net)}</bdi>{R != null ? <small> · <bdi dir="ltr">{R.toFixed(2)}R</bdi></small> : null}
            {isOpen && <small className="hMuted"> (לא ממומש, הערכה)</small>}
          </div>
          <div className="hRows">
            <span>נפתח</span><span>{when(t.opened_at)}</span>
            <span>{isOpen ? 'מוחזק' : 'נסגר'}</span><span>{isOpen ? dur(hold) : `${when(t.closed_at)} · ${dur(hold)}`}</span>
            <span>כניסה</span><bdi dir="ltr">{fmtPx(n(t.entry_price))}</bdi>
            <span>{isOpen ? 'מחיר עכשיו' : 'יציאה'}</span><bdi dir="ltr">{isOpen ? (mk != null ? fmtPx(mk) : 'טוען…') : fmtPx(n(t.exit_price))}</bdi>
            <span>גודל פוזיציה</span><span>{fmt$(c.notional0)}</span>
            {n(t.risk_usd) > 0 && <><span>סיכון בכניסה</span><span>{fmt$(n(t.risk_usd))}</span></>}
            {isOpen && <><span>סטופ</span><bdi dir="ltr">{fmtPx(n(t.trail_sl))}</bdi></>}
            {!isOpen && <><span>ברוטו</span><span className={c.gross != null && c.gross >= 0 ? 'pos' : 'neg'}>{fmt$(c.gross)}</span></>}
            <span>עמלת כניסה</span><span className="neg">{fmt$(-c.entryFee)}</span>
            {c.legFee > 0 && <><span>עמלות יציאה חלקית ({legs.length})</span><span className="neg">{fmt$(-c.legFee)}</span></>}
            {!isOpen && <><span>עמלת יציאה</span><span className="neg">{fmt$(-c.exitFee)}</span></>}
            {!isOpen && <><span>Funding</span><span className={c.funding <= 0 ? 'pos' : 'neg'}>{fmt$(-c.funding)}{m.funding_missing ? ' (חסר)' : ''}</span></>}
            <span>סה״כ עמלות</span><b className="neg">{fmt$(-c.fees)}</b>
          </div>
          {legs.length > 0 && <div className="hLegs">{legs.map((l, i) => <div key={i}>יציאה חלקית {i + 1}: {fmtPx(n(l.px))} · {REASON[String(l.reason)] ?? l.reason ?? ''} · {fmt$(n(l.ret))}</div>)}</div>}
          <a className="hLink" href={`./trade.html?id=${t.id}`}>גרף ופרטי הכניסה ←</a>
        </div>
      })}
    </div>
    {list.length > shown && <button className="hMore" onClick={() => setShown(s => s + 100)}>עוד {Math.min(100, list.length - shown)} (מתוך {list.length - shown} נוספות)</button>}
  </div>
}

function S({ k, v, sub, cls }: { k: string; v: string; sub?: string; cls?: string }) {
  return <div className="hStat"><div className="hK">{k}</div><div className={`hV ${cls ?? ''}`}>{v}</div>{sub ? <div className="hSubS">{sub}</div> : null}</div>
}

const CSS = `
.hTop{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
.hTop h1{font-size:20px;margin-inline-end:auto}
.hBack{color:#93c5fd;text-decoration:none;font-size:14px;border:1px solid #1f2a44;border-radius:8px;padding:4px 10px}
.hChip{font-size:12px;border:1px solid #1f2a44;border-radius:999px;padding:3px 10px;color:#cbd5e1}
.hErr{background:#3b0d0d;color:#fecaca;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13px}
.hStats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:8px}
.hStat{background:#0b1220;border:1px solid #1f2a44;border-radius:10px;padding:8px 10px}
.hK{font-size:11px;color:#94a3b8}.hV{font-size:18px;font-weight:700;margin-top:2px}.hSubS{font-size:11px;color:#94a3b8;margin-top:2px}
.hNote{font-size:12px;color:#94a3b8;margin:6px 0 12px}
.hFilters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.hFilters select,.hFilters input{background:#0b1220;color:#e5e7eb;border:1px solid #1f2a44;border-radius:8px;padding:6px 10px;font-size:14px;min-width:0;flex:1 1 140px}
.hGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.hCard{background:#0b1220;border:1px solid #1f2a44;border-inline-start:4px solid #334155;border-radius:10px;padding:10px 12px;font-size:13px}
.hCard.win{border-inline-start-color:#22c55e}.hCard.loss{border-inline-start-color:#ef4444}.hCard.open{border-inline-start-color:#60a5fa}
.hHead{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.hHead b{font-size:16px}
.hTag{font-size:11px;border:1px solid #1f2a44;border-radius:999px;padding:2px 8px;color:#cbd5e1}
.hSub{font-size:11px;color:#94a3b8;margin-top:2px}
.hNet{font-size:20px;font-weight:700;margin:6px 0}.hNet small{font-size:12px}.hMuted{color:#94a3b8;font-weight:400}
.hRows{display:grid;grid-template-columns:auto 1fr;gap:3px 12px}.hRows>*:nth-child(even){text-align:left}
.hLegs{margin-top:6px;font-size:11px;color:#94a3b8}
.hLink{display:inline-block;margin-top:8px;color:#93c5fd;text-decoration:none;font-size:12px}
.hEmpty{color:#94a3b8;text-align:center;padding:24px;border:1px dashed #1f2a44;border-radius:10px}
.hMore{display:block;margin:14px auto;background:#0b1220;color:#e5e7eb;border:1px solid #1f2a44;border-radius:8px;padding:8px 16px;font-size:14px}
.pos{color:#4ade80}.neg{color:#f87171}
`
