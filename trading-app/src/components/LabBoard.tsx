// v94.0 — the LAB board: live P&L of the paper book broken down the way the owner asked, next to the research
// grid's verdict. Everything is READ: bot_trades / bot_equity / bot_state / trade_decision_reasons with the anon key
// and status/lab-latest.json from the repo. Nothing here computes a signal. A number that is modelled rather than
// observed says so (slippage: modelled 3/5 bps per side; funding: the ledger's baseline model).
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { SUPA_URL, SUPA_KEY } from '../supa'

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
const get = async (path: string) => { const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`); return r.json() }
const LAB_URL = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/main/status/lab-latest.json'
type Tr = { id: number; sym: string; side: string; strategy: string; status: string; entry_price: number; exit_price: number | null; size: number; pnl: number | null; fee: number | null; opened_at: string; closed_at: string | null; scalp_meta: any }
const C = { bg: '#04070E', card: '#0B1220', line: '#1E2A44', dim: '#8A97B2', text: '#E8EEF9', pos: '#34D399', neg: '#F87171', acc: '#5AA9FF', warn: '#FBBF24' }
const usd = (x: number) => `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
const pct = (x: number, d = 2) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`
const col = (x: number) => (x > 0 ? C.pos : x < 0 ? C.neg : C.dim)
const slipModel = (sym: string) => (sym === 'BTC' || sym === 'ETH' ? 0.0003 : 0.0005)
const bucket = (t: Tr) => (t.strategy === 'LAB' ? `LAB ${t.scalp_meta?.lab?.spec ?? '?'}` : t.strategy)
const tfOf = (t: Tr) => (t.strategy === 'LAB' ? t.scalp_meta?.lab?.tf ?? '?' : t.strategy === 'SCALP' ? '5m–4h intraday' : t.strategy === 'ROTA' ? '4h rotation' : t.strategy === 'BRKV' ? '4h breakout' : t.strategy)

function stats(rows: Tr[]) {
  const n = rows.length, net = rows.reduce((a, t) => a + Number(t.pnl ?? 0), 0)
  const fees = rows.reduce((a, t) => a + Number(t.fee ?? 0) + Number(t.scalp_meta?.exit_fee ?? 0), 0)
  const funding = rows.reduce((a, t) => a + Number(t.scalp_meta?.funding_model ?? 0), 0)
  const slip = rows.reduce((a, t) => a + Number(t.entry_price) * Number(t.size) * slipModel(t.sym) * 2, 0)
  const wins = rows.filter((t) => Number(t.pnl) > 0), gw = wins.reduce((a, t) => a + Number(t.pnl), 0), gl = -rows.filter((t) => Number(t.pnl) <= 0).reduce((a, t) => a + Number(t.pnl), 0)
  return { n, net, fees, funding, slip, gross: net + fees + funding + slip, wr: n ? wins.length / n : 0, pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0, exp: n ? net / n : 0 }
}
function group(rows: Tr[], key: (t: Tr) => string) {
  const m = new Map<string, Tr[]>(); for (const t of rows) { const k = key(t); (m.get(k) ?? m.set(k, []).get(k)!).push(t) }
  return [...m.entries()].map(([k, v]) => ({ k, ...stats(v) })).sort((a, b) => b.net - a.net)
}

export default function LabBoard() {
  const [span, setSpan] = useState(72)
  const [trades, setTrades] = useState<Tr[]>([]), [open, setOpen] = useState<Tr[]>([]), [eq, setEq] = useState<{ ts: string; equity: number }[]>([])
  const [reasons, setReasons] = useState<{ reason: string; h1: number; h6: number; h24: number }[]>([]), [lab, setLab] = useState<any>(null), [state, setState] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null), [at, setAt] = useState<string>('')
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const since = new Date(Date.now() - span * 3600e3).toISOString()
        const [tr, op, e, rs, st] = await Promise.all([
          get(`bot_trades?select=id,sym,side,strategy,status,entry_price,exit_price,size,pnl,fee,opened_at,closed_at,scalp_meta&status=neq.OPEN&closed_at=gte.${since}&order=closed_at.asc&limit=5000`),
          get('bot_trades?select=id,sym,side,strategy,status,entry_price,exit_price,size,pnl,fee,opened_at,closed_at,scalp_meta&status=eq.OPEN&order=opened_at.asc'),
          get(`bot_equity?select=ts,equity&ts=gte.${since}&order=ts.asc&limit=5000`),
          get('trade_decision_reasons?select=reason,h1,h6,h24&order=h24.desc&limit=12'),
          get('bot_state?select=balance,bot_params&id=eq.1'),
        ])
        if (!live) return
        setTrades(tr); setOpen(op); setEq(e); setReasons(rs); setState(st?.[0] ?? null); setErr(null); setAt(new Date().toISOString().slice(11, 19))
      } catch (x: any) { if (live) setErr(String(x?.message ?? x)) }
      try { const r = await fetch(LAB_URL, { cache: 'no-store' }); if (r.ok && live) setLab(await r.json()) } catch { /* research panel shows — */ }
    }
    load(); const id = setInterval(load, 30_000); return () => { live = false; clearInterval(id) }
  }, [span])

  const s = useMemo(() => stats(trades), [trades])
  const daily = useMemo(() => {
    const m = new Map<string, { o: number; c: number }>()
    for (const x of eq) { const d = x.ts.slice(0, 10), v = Number(x.equity); const cur = m.get(d); if (!cur) m.set(d, { o: v, c: v }); else cur.c = v }
    return [...m.entries()].map(([d, v]) => ({ d, ret: v.o > 0 ? (v.c / v.o - 1) * 100 : 0 }))
  }, [eq])
  const maxDD = useMemo(() => { let pk = 0, dd = 0; for (const x of eq) { const v = Number(x.equity); pk = Math.max(pk, v); if (pk > 0) dd = Math.max(dd, (pk - v) / pk) } return dd * 100 }, [eq])
  const spanRet = eq.length > 1 ? (Number(eq[eq.length - 1].equity) / Number(eq[0].equity) - 1) * 100 : 0
  const avgDaily = daily.length ? daily.reduce((a, x) => a + x.ret, 0) / daily.length : 0
  const byStrat = group(trades, bucket), bySide = group(trades, (t) => t.side), byTf = group(trades, tfOf)
  const labRows = trades.filter((t) => t.strategy === 'LAB'), tiers = group(labRows, (t) => t.scalp_meta?.lab?.tier ?? '?')
  const cyc = state?.bot_params?.lab_cycle, lst = state?.bot_params?.lab_state
  const card = (label: string, value: string, color = C.text, sub?: string) => (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ color: C.dim, fontSize: 12 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>)
  const table = (title: string, rows: ReturnType<typeof group>, note?: string) => (
    <section style={sec}>
      <h3 style={h3}>{title}</h3>{note && <div style={{ color: C.dim, fontSize: 12, marginBottom: 6 }}>{note}</div>}
      {rows.length === 0 ? <div style={{ color: C.dim }}>אין עסקאות סגורות בטווח</div> : (
        <div style={{ overflowX: 'auto' }}><table style={tbl}><thead><tr>{['', 'עסקאות', 'נטו', 'WR', 'PF', 'תוחלת'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 10).map((r) => <tr key={r.k}><td style={{ ...td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', direction: 'ltr', textAlign: 'left' }}>{r.k}</td><td style={td}>{r.n}</td><td style={{ ...td, color: col(r.net) }}>{usd(r.net)}</td><td style={td}>{(r.wr * 100).toFixed(0)}%</td><td style={td}>{Number.isFinite(r.pf) ? r.pf.toFixed(2) : '∞'}</td><td style={{ ...td, color: col(r.exp) }}>{usd(r.exp)}</td></tr>)}</tbody></table></div>)}
    </section>)
  const st = lab?.stress, tot = lab?.totals
  return (
    <div dir="rtl" style={{ color: C.text, fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20 }}>מעבדת המסחר — DEMO / PAPER בלבד</h1>
        <div style={{ display: 'flex', gap: 6 }}>{[24, 72, 168, 720].map((h) => <button key={h} onClick={() => setSpan(h)} style={{ ...btn, background: span === h ? C.acc : 'transparent', color: span === h ? '#04070E' : C.acc }}>{h < 168 ? `${h} ש׳` : `${h / 24} ימים`}</button>)}</div>
      </header>
      {err && <div style={{ color: C.neg }}>שגיאת קריאה: {err}</div>}
      <div style={{ color: C.dim, fontSize: 12 }}>עודכן {at || '—'} UTC · רענון כל 30 שניות · סליפג׳ = מודל 3/5 bps לצד (INFERRED) · מימון = מודל הלדג׳ר</div>
      <div style={grid}>
        {card('תשואה יומית נטו (ממוצע)', pct(avgDaily), col(avgDaily), `כל הטווח ${pct(spanRet)}`)}
        {card('PnL ברוטו', usd(s.gross), col(s.gross))}
        {card('PnL נטו', usd(s.net), col(s.net))}
        {card('עמלות', usd(s.fees), C.warn)}
        {card('סליפג׳ (מודל)', usd(s.slip), C.warn)}
        {card('מימון', usd(s.funding), col(-s.funding))}
        {card('עסקאות', String(s.n))}
        {card('Win Rate', `${(s.wr * 100).toFixed(1)}%`)}
        {card('Profit Factor', Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞', s.pf >= 1 ? C.pos : C.neg)}
        {card('תוחלת לעסקה', usd(s.exp), col(s.exp))}
        {card('Max Drawdown', pct(maxDD), maxDD > 10 ? C.neg : C.text)}
        {card('Elite / Explore פתוחות', `${open.filter((t) => t.scalp_meta?.lab?.tier === 'elite').length} / ${open.filter((t) => t.scalp_meta?.lab?.tier === 'explore').length}`)}
      </div>
      <section style={sec}><h3 style={h3}>תשואה לפי יום (UTC, מעקומת ההון)</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{daily.map((x) => <span key={x.d} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.line}`, color: col(x.ret), fontVariantNumeric: 'tabular-nums' }}>{x.d.slice(5)} {pct(x.ret)}</span>)}</div></section>
      {table('הטובה / הגרועה — לפי אסטרטגיה', byStrat, byStrat.length ? `הטובה: ${byStrat[0].k} (${usd(byStrat[0].net)}) · הגרועה: ${byStrat[byStrat.length - 1].k} (${usd(byStrat[byStrat.length - 1].net)})` : undefined)}
      {table('LONG מול SHORT', bySide)}
      {table('לפי טווח זמן', byTf)}
      {table('LAB — Elite מול Explore', tiers, cyc ? `מחזור אחרון ${String(cyc.ts ?? '').slice(11, 19)} · ${cyc.pool ?? ''} · פעילות ${cyc.active ?? 0} (elite ${cyc.elite ?? 0}) · מועמדים ${cyc.candidates ?? 0}` : 'LAB עוד לא רץ מחזור')}
      <section style={sec}><h3 style={h3}>סיבות דחייה מובילות</h3>
        <div style={{ overflowX: 'auto' }}><table style={tbl}><thead><tr>{['סיבה', 'שעה', '6 ש׳', '24 ש׳'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{reasons.map((r) => <tr key={r.reason}><td style={{ ...td, direction: 'ltr', textAlign: 'left' }}>{r.reason}</td><td style={td}>{r.h1}</td><td style={td}>{r.h6}</td><td style={td}>{r.h24}</td></tr>)}</tbody></table></div></section>
      <section style={sec}><h3 style={h3}>פוזיציות פתוחות ({open.length})</h3>
        <div style={{ overflowX: 'auto' }}><table style={tbl}><thead><tr>{['מטבע', 'צד', 'אסטרטגיה', 'כניסה', 'שווי', 'סטופ', 'יעד', 'נפתח'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{open.map((t) => { const m = t.scalp_meta?.lab; return <tr key={t.id}><td style={td}>{t.sym}</td><td style={{ ...td, color: t.side === 'LONG' ? C.pos : C.neg }}>{t.side}</td><td style={{ ...td, direction: 'ltr' }}>{t.strategy === 'LAB' ? `LAB ${m?.tier} ${m?.tf}` : t.strategy}</td><td style={td}>{Number(t.entry_price).toPrecision(5)}</td><td style={td}>{usd(Number(t.entry_price) * Number(t.size))}</td><td style={td}>{m ? Number(m.stop).toPrecision(5) : t.strategy === 'ROTA' ? 'סבב הבא' : '—'}</td><td style={td}>{m ? Number(m.target).toPrecision(5) : '—'}</td><td style={td}>{t.opened_at.slice(5, 16).replace('T', ' ')}</td></tr> })}</tbody></table></div></section>
      <section style={sec}><h3 style={h3}>המחקר (רשת {tot ? tot.specs.toLocaleString() : '—'} וריאציות, walk-forward + OOS)</h3>
        {!lab ? <div style={{ color: C.dim }}>—</div> : <>
          <div style={{ color: C.dim, fontSize: 13, marginBottom: 6 }}>הורץ {String(lab.ran_at).slice(0, 16).replace('T', ' ')} UTC · הגיעו ל־OOS: {tot.reachedOos} · ELITE: <b style={{ color: tot.elite ? C.pos : C.neg }}>{tot.elite}</b> · מזל לבדו היה מעביר ≈ {tot.luckExpected} · Explore: {tot.explore}</div>
          <div style={{ overflowX: 'auto' }}><table style={tbl}><thead><tr>{['וריאציה', 'IS', 'VAL', 'OOS נטו/עסקה', 't', 'PF', 'n'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{(lab.top ?? []).slice(0, 8).map((r: any) => <tr key={r.spec.id}><td style={{ ...td, direction: 'ltr', textAlign: 'left' }}>{r.elite ? '★ ' : ''}{r.spec.id}</td><td style={td}>{pct(r.is.mean, 3)}</td><td style={td}>{pct(r.val.mean, 3)}</td><td style={{ ...td, color: col(r.oos.mean) }}>{pct(r.oos.mean, 3)}</td><td style={td}>{r.oos.t}</td><td style={td}>{r.oos.pf}</td><td style={td}>{r.oos.n}</td></tr>)}</tbody></table></div>
          {st?.target25 && <div style={{ marginTop: 8, color: C.text, fontSize: 13, lineHeight: 1.6 }}>
            <b>מבחן 25% ביום:</b> דורש סיכון של ≈{Number.isFinite(st.target25.riskNeeded) ? (st.target25.riskNeeded * 100).toFixed(0) : '∞'}% לעסקה
            {st.target25.at25?.oos && <> → OOS: {st.target25.at25.oos.ruin ? <b style={{ color: C.neg }}>פשיטת רגל</b> : pct(st.target25.at25.oos.geoDaily * 100)} ({st.target25.at25.oos.liquidations} חיסולים, מינוף פוזיציה {st.target25.at25.oos.maxPosLev.toFixed(0)}x)</>}.
            {st.halfKellyOos && <> המקסימום הנתמך (חצי-קלי, נבחר ב־IS): {pct(st.halfKellyOos.geoDaily * 100, 3)} ליום עם ירידה של {pct(st.halfKellyOos.maxDD * 100, 0)} — ולא מובהק סטטיסטית.</>}
          </div>}
          {lst && (Object.keys(lst.demoted ?? {}).length > 0 || Object.keys(lst.promoted ?? {}).length > 0) && <div style={{ marginTop: 6, fontSize: 12, color: C.dim }}>למידה מבוקרת: הוחזרו לאחור {Object.keys(lst.demoted ?? {}).length} · קודמו {Object.keys(lst.promoted ?? {}).length}</div>}
        </>}
      </section>
    </div>)
}
const sec: CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }
const h3: CSSProperties = { fontSize: 15, marginBottom: 8 }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }
const tbl: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }
const th: CSSProperties = { textAlign: 'right', color: C.dim, fontWeight: 500, padding: '4px 6px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '4px 6px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const btn: CSSProperties = { border: `1px solid ${C.acc}`, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }
