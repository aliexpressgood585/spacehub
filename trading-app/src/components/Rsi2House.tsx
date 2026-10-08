import { useEffect, useState } from 'react'
import { SUPA_URL, SUPA_KEY } from '../supa'
import { tradeMetrics, closeValue } from '../tradeMetrics'

type Row = Record<string, any>
const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
const money = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '—' : `$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const pct = (n: number | null | undefined) => n == null ? '—' : `${n.toFixed(2)}%`
const px = (n: unknown) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US',{maximumFractionDigits:8}) : '—'
const time = (n: string) => new Date(n).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})
const qualify = (s: string) => s==='QUALIFIED' ? 'עבר את הספים' : s==='NOT_QUALIFIED' ? 'לא כשיר · תצפית בלבד' : 'לא מספק נתונים'
async function read(path: string, signal: AbortSignal) {
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{headers,signal,cache:'no-store'})
  if(!r.ok) throw new Error(`שגיאת קריאה ${r.status}`)
  return r.json()
}
export default function Rsi2House({onBack}:{onBack?:()=>void}) {
  const [snapshot,setSnapshot]=useState<{account:Row;runs:Row[];trades:Row[]}|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    const controller=new AbortController();let busy=false
    const load=async()=>{
      if(busy) return;busy=true
      try {
        const [st,runs,trades]=await Promise.all([
          read('bot_state?select=balance,paper_mode,active,updated_at,bot_params&limit=1',controller.signal),
          read('rsi2_forward_runs?select=symbol,active,started_at,report,updated_at&order=symbol',controller.signal),
          read('bot_trades?select=*&strategy=eq.RSI2_FORWARD_PAPER&order=opened_at.desc&limit=500',controller.signal),
        ])
        if(!controller.signal.aborted){setSnapshot({account:st[0],runs,trades});setError('')}
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}finally{busy=false}
    }
    void load();const timer=setInterval(load,15000)
    return()=>{controller.abort();clearInterval(timer)}
  },[])
  if(!snapshot)return <section dir="rtl" style={{color:'#cbd5e1',padding:24}} role="status">{error||'טוען את חשבון הדמו…'}</section>
  const {account,runs,trades}=snapshot
  const open=trades.filter(t=>t.status==='OPEN'),closed=trades.filter(t=>t.status!=='OPEN')
  const rows=open.map(t=>{const run=runs.find(r=>r.symbol===t.scalp_meta?.exact_contract);const mark=Number(run?.report?.lastClosePrice ?? t.entry_price);return {t,mark,m:tradeMetrics(t,mark),value:closeValue(t,mark)}})
  const cash=Number(account.balance),equity=cash+rows.reduce((s,r)=>s+r.value,0)
  const fresh=Date.now()-Date.parse(account.updated_at)<150000
  const healthy=runs.every(r=>r.report?.dataStatus==='OK')
  return <main dir="rtl" className="rsi-house">
    <style>{CSS}</style>
    <header><div><small>SPACEHUB · PAPER TRADING</small><h1>בית הבוט · RSI2</h1><p>חשבון הדמו הקיים · שני מועמדים · כללים קפואים</p></div>{onBack&&<button onClick={onBack}>חזרה</button>}</header>
    <div className="rsi-badges"><span className={account.active&&fresh&&healthy?'good':'warn'}>{account.active&&fresh ? healthy?'● הבוט פעיל':'● הבוט פעיל · נתונים חסרים':'מושהה / אין עדכון טרי'}</span><span>מינוף מדומה 20×</span><span>סימולציה בלבד</span><span>עדכון: {time(account.updated_at)}</span></div>
    {error&&<p role="alert" className="warn">{error}</p>}
    <section className="rsi-grid" aria-label="מצב החשבון"><div><small>הון מדומה משוער</small><strong dir="ltr">{money(equity)}</strong></div><div><small>מזומן פנוי</small><strong dir="ltr">{money(cash)}</strong></div><div><small>פוזיציות מדומות פתוחות</small><strong>{open.length} / 2</strong></div><div><small>מינוף לכל פוזיציה</small><strong>20×</strong></div></section>
    <p className="rsi-note">בדיקת נרות סגורים של 5 דקות, פילטר מגמה ב־15 דקות. יעד 1×ATR, סטופ 2×ATR, עד 160 דקות. עלות בסיס 0.12%, לחץ 0.16%. הקצאה קבועה: $250 מרווח מדומה לכל פוזיציה.</p>
    <section className="rsi-candidates" aria-label="מועמדי הבדיקה">{runs.map(run=>{const r=run.report??{},b=r.base??{},s=r.stress??{};return <article key={run.symbol}>
      <h2 dir="ltr">{run.symbol}</h2><p className="good">{r.dataStatus==='OK'?'נתוני החוזה מאומתים':'נתונים חסרים — כניסות חסומות'}</p><p className="warn">{qualify(r.qualification)}</p>
      <p>{run.symbol==='TRADOORUSDT'?'פילטר נוסף: ADX(14) קטן מ־25':'פילטר נוסף: נפח לפחות כממוצע 20 נרות'}</p>
      <dl><dt>עסקאות מבחן סגורות</dt><dd>{b.trades??0} / 100</dd><dt>Win rate נטו</dt><dd>{pct(b.netWinRate==null?null:b.netWinRate*100)}</dd><dt>תוחלת נטו לעסקה</dt><dd>{pct(b.netExpectancyPct)}</dd><dt>Profit Factor</dt><dd>{b.profitFactorInfinite?'∞':b.profitFactor?.toFixed(2)??'—'}</dd><dt>Drawdown לפי סגירות</dt><dd>{pct(b.drawdownPct)}</dd><dt>עלות שנוכתה במבחן</dt><dd>{money(b.deductedCostsUsd)}</dd><dt>לחץ: Win rate / תוחלת</dt><dd>{pct(s.netWinRate==null?null:s.netWinRate*100)} / {pct(s.netExpectancyPct)}</dd><dt>Funding</dt><dd>{r.fundingIncludedThisRun?'נכלל לפי אירועי מימון':'לא נכלל / הנתונים חסרים'}</dd></dl>
      <p className="rsi-note">נדרש אימון מאומת ו־100 עסקאות קדימה; שיעור נטו ≥61%, תוחלת חיובית ו־PF&gt;1, גם בעלות לחץ. {r.training==='MISSING_EXACT_TRAINING_EVIDENCE'?'נתוני האימון המדויקים עדיין חסרים.':''}</p>
    </article>})}</section>
    <section><h2>פוזיציות מדומות בחשבון הקיים</h2>{rows.length?rows.map(({t,mark,m})=><article className="rsi-position" key={t.id}><h3>{t.scalp_meta?.exact_contract} · {t.side} · 20×</h3><p>עסקה מדומה בלבד · בדיקה ניסויית</p><dl><dt>כניסה מדומה</dt><dd>{px(t.entry_price)}</dd><dt>מחיר נר סגור אחרון</dt><dd>{px(mark)}</dd><dt>יעד / סטופ</dt><dd>{px(t.scalp_meta?.target_px)} / {px(t.trail_sl)}</dd><dt>רווח/הפסד משוער נטו</dt><dd>{money(m.net)}</dd><dt>מועד כניסה מדומה</dt><dd>{time(t.opened_at)}</dd></dl></article>):<p className="rsi-note">אין כרגע פוזיציות מדומות פתוחות. הבוט ממתין להשלמת כל תנאי הכניסה.</p>}</section>
    <section><h2>יומן עסקאות מדומות</h2>{closed.length?<div className="rsi-table"><table><thead><tr><th>חוזה</th><th>כיוון</th><th>כניסה</th><th>יציאה</th><th>נטו</th><th>נטו בלחץ</th><th>סיבה</th></tr></thead><tbody>{closed.map(t=><tr key={t.id}><td>{t.scalp_meta?.exact_contract}</td><td>{t.side}</td><td>{px(t.entry_price)}</td><td>{px(t.exit_price)}</td><td>{money(Number(t.pnl))}</td><td>{money(Number(t.scalp_meta?.stress_pnl))}</td><td>{t.scalp_meta?.exit_reason}</td></tr>)}</tbody></table></div>:<p className="rsi-note">עדיין אין עסקאות מדומות סגורות בחשבון.</p>}</section>
    <p className="rsi-note">הספירה הסטטיסטית מתחילה ב־{time(runs[0]?.started_at)}. מינוף מחושב בסימולציה; אין מודל ליקווידציה של הבורסה.</p>
  </main>
}
const CSS=`.rsi-house{font-family:Arial,sans-serif;color:#e2e8f0;width:100%;padding:12px;box-sizing:border-box}.rsi-house header{display:flex;justify-content:space-between;align-items:center}.rsi-house h1{font-size:28px;margin:8px 0}.rsi-house h2{font-size:20px}.rsi-house small,.rsi-note{color:#94a3b8}.rsi-house p{line-height:1.7}.rsi-badges{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.rsi-badges span{padding:8px 12px;background:#111c30;border:1px solid #27344b;border-radius:20px}.rsi-house .good{color:#5ee6aa}.rsi-house .warn{color:#facc78}.rsi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.rsi-grid>div,.rsi-candidates article,.rsi-position{background:#0d1627;border:1px solid #263249;border-radius:14px;padding:18px}.rsi-grid strong{display:block;font-size:24px;margin-top:12px}.rsi-candidates{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0}.rsi-house dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rsi-house dd{margin:0;text-align:left;direction:ltr}.rsi-house dt{color:#aab8cc}.rsi-table{overflow:auto}.rsi-house table{border-collapse:collapse;white-space:nowrap;width:100%}.rsi-house th,.rsi-house td{padding:12px;border-bottom:1px solid #263249;text-align:right}.rsi-house button{background:#13233a;border:1px solid #344963;color:white;padding:10px 20px;border-radius:10px;cursor:pointer}.rsi-position{margin:12px 0}.rsi-note{font-size:14px}@media(max-width:640px){.rsi-grid{grid-template-columns:1fr 1fr}.rsi-candidates{grid-template-columns:1fr}.rsi-house{padding:4px}.rsi-grid strong{font-size:21px}}`
