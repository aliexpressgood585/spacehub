import { useEffect, useState } from 'react'
import { SUPA_URL, SUPA_KEY } from '../supa'
import { tradeMetrics, closeValue, fmtPctSigned, fmtR } from '../tradeMetrics'

// Display-only trading floor for the EXISTING RSI2 paper account.
// All prices are public read-only market data; trading rules, schedules and ledger are untouched.
type Row = Record<string, any>
type PriceTick = { price: number; at: number }
const headers = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
const money = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (n: number) => Number.isFinite(n) ? (n > 0 ? '+' : '') + money(n) : '—'
const pct = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '—' : n.toFixed(2) + '%'
const px = (n: unknown) => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 8 })
const time = (n: unknown) => n && Number.isFinite(Date.parse(String(n))) ? new Date(String(n)).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—'
const num = (n: unknown) => Number(n ?? 0)
const qualify = (s: string) => s === 'QUALIFIED' ? 'עבר את ספי המחקר' : s === 'NOT_QUALIFIED' ? 'לא כשיר · מעקב בלבד' : 'חסרות תצפיות לאימות סטטיסטי'
const reason = (s: string) => ({ TARGET_SIMULATED: 'יעד רווח', STOP_SIMULATED: 'עצירת הפסד', TIMEOUT_SIMULATED: 'סיום זמן החזקה' } as Record<string, string>)[s] || s || '—'
const shortDate = (s: unknown) => new Date(String(s)).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })

async function read(path: string, signal: AbortSignal): Promise<Row[]> {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, { headers, signal, cache: 'no-store' })
  if (!r.ok) throw new Error('שגיאת קריאת נתונים ' + r.status)
  return r.json()
}

export default function Rsi2House({ onBack }: { onBack?: () => void }) {
  const [snapshot, setSnapshot] = useState<{ account: Row; runs: Row[]; trades: Row[] } | null>(null)
  const [error, setError] = useState('')
  const [prices, setPrices] = useState<Record<string, PriceTick>>({})
  const [moreTrades, setMoreTrades] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    const load = async () => {
      if (busy) return
      busy = true
      try {
        const [st, runs, trades] = await Promise.all([
          read('bot_state?select=balance,paper_mode,active,updated_at,bot_params&limit=1', controller.signal),
          read('rsi2_forward_runs?select=symbol,active,started_at,report,updated_at&order=symbol', controller.signal),
          read('bot_trades?select=*&strategy=eq.RSI2_FORWARD_PAPER&order=opened_at.desc&limit=500', controller.signal),
        ])
        if (!st.length) throw new Error('לא נמצא חשבון בוט')
        if (!controller.signal.aborted) { setSnapshot({ account: st[0], runs, trades }); setError('') }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      } finally { busy = false }
    }
    void load()
    const timer = setInterval(load, 15000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [])

  // Only public, unsigned Binance Futures GET requests; if blocked, fall back to
  // the last *closed* 5m bar from the bot, clearly labelled as such.
  useEffect(() => {
    const controller = new AbortController()
    const refresh = async () => {
      const symbols = ['TRADOORUSDT', 'MYXUSDT']
      const result = await Promise.allSettled(symbols.map(async symbol => {
        const url = 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=' + encodeURIComponent(symbol)
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('price unavailable')
        const data = await response.json()
        const price = Number(data.price)
        if (data.symbol !== symbol || !(price > 0)) throw new Error('invalid price')
        return { symbol, price, at: Date.now() }
      }))
      if (controller.signal.aborted) return
      setPrices(old => {
        const next = { ...old }
        for (const r of result) if (r.status === 'fulfilled') next[r.value.symbol] = { price: r.value.price, at: r.value.at }
        return next
      })
    }
    void refresh()
    const timer = setInterval(refresh, 10000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [])

  if (!snapshot) return <section dir="rtl" style={{ color: '#cbd5e1', padding: 24 }} role="status">{error || 'טוען את חשבון הדמו…'}</section>

  const { account, runs, trades } = snapshot
  const open = trades.filter(t => t.status === 'OPEN')
  const closed = trades.filter(t => t.status !== 'OPEN' && t.closed_at)
  const rows = open.map(t => {
    const symbol = String(t.scalp_meta?.exact_contract || t.sym + 'USDT')
    const run = runs.find(r => r.symbol === symbol)
    const tick = prices[symbol]
    const live = !!tick && Date.now() - tick.at < 30000
    const mark = live ? tick.price : Number(run?.report?.lastClosePrice ?? t.entry_price)
    const metrics = tradeMetrics(t, mark)
    return { t, symbol, mark, live, metrics, value: closeValue(t, mark) }
  })
  const cash = num(account.balance)
  const equity = cash + rows.reduce((sum, r) => sum + r.value, 0)
  const totalOpenPnl = rows.reduce((sum, r) => sum + r.metrics.net, 0)
  const totalClosedPnl = closed.reduce((sum, t) => sum + num(t.pnl), 0)
  const wins = closed.filter(t => num(t.pnl) > 0).length
  const winRate = closed.length ? wins * 100 / closed.length : null
  const startEquity = num(account.bot_params?.rsi2_balance_at_activation) || 5000
  const netChange = equity - startEquity
  const todayKey = shortDate(new Date().toISOString())
  const today = closed.filter(t => shortDate(t.closed_at) === todayKey)
  const todayPnl = today.reduce((sum, t) => sum + num(t.pnl), 0)
  const fresh = Number.isFinite(Date.parse(account.updated_at)) && Date.now() - Date.parse(account.updated_at) < 150000
  const healthy = runs.length === 2 && runs.every(r => r.active && r.report?.dataStatus === 'OK')
  const working = account.active && account.paper_mode && fresh
  const ordered = [...closed].reverse()
  let running = startEquity
  const curve = [startEquity, ...ordered.map(t => running += num(t.pnl))]
  const bottom = Math.min(...curve), spread = Math.max(1, Math.max(...curve) - bottom)
  const chartPoints = curve.map((v, i) => (10 + i * 700 / Math.max(1, curve.length - 1)).toFixed(1) + ',' + (92 - (v - bottom) / spread * 74).toFixed(1)).join(' ')
  const visibleClosed = moreTrades ? closed : closed.slice(0, 15)

  return <main dir="rtl" className="rsi-house">
    <style>{CSS}</style>
    <header className="rsi-head">
      <div>
        <small>SPACEHUB · PAPER TRADING · TRADING FLOOR</small>
        <h1>בית הבוט · RSI2</h1>
        <p>חשבון הדמו המקורי · TRADOOR / MYX · אסטרטגיה קיימת ללא שינוי</p>
      </div>
      {onBack && <button onClick={onBack} type="button">חזרה</button>}
    </header>

    <div className="rsi-badges" aria-label="סטטוס המנוע">
      <span className={working ? 'goodBadge' : 'warningBadge'}>{working ? '● מנוע PAPER פועל' : '● המנוע אינו מעודכן כרגע'}</span>
      <span className={healthy ? 'goodBadge' : 'warningBadge'}>{healthy ? '● נתוני אסטרטגיה תקינים' : '● נתוני אחד החוזים חסרים'}</span>
      <span>מינוף מדומה ×20</span><span>ללא עסקאות בבורסה</span>
      <span>עדכון שרת: {time(account.updated_at)}</span>
    </div>
    {error && <p role="alert" className="rsi-error">חיבור נתונים: {error} · מוצג העדכון האחרון שנקלט</p>}

    <nav className="rsi-nav" aria-label="ניווט לבית הבוט">
      <a href="#rsi-positions">פוזיציות פתוחות ({open.length})</a>
      <a href="#rsi-journal">היסטוריית עסקאות</a>
      <a href="#rsi-research">תנאי האסטרטגיה</a>
    </nav>

    <section className="rsi-grid" aria-label="מצב החשבון">
      <div><small>הון דמו משוער</small><strong dir="ltr">{money(equity)}</strong><em className={netChange >= 0 ? 'gain' : 'loss'} dir="ltr">{signed(netChange)} מתחילת הניסוי</em></div>
      <div><small>מזומן פנוי</small><strong dir="ltr">{money(cash)}</strong><em>יתרה ללא מרווחי פוזיציות פתוחות</em></div>
      <div><small>רווח/הפסד פתוח נטו (משוער)</small><strong className={totalOpenPnl >= 0 ? 'gain' : 'loss'} dir="ltr">{open.length ? signed(totalOpenPnl) : money(0)}</strong><em>כולל עלויות מסחר לפי מודל הבוט</em></div>
      <div><small>ממומש היום (ישראל)</small><strong className={todayPnl >= 0 ? 'gain' : 'loss'} dir="ltr">{signed(todayPnl)}</strong><em>{today.length} עסקאות שנסגרו היום</em></div>
      <div><small>פוזיציות מדומות פתוחות</small><strong dir="ltr">{open.length} / 2</strong><em>מרווח קבוע $250 לפוזיציה</em></div>
      <div><small>הצלחות מתוך עסקאות סגורות</small><strong dir="ltr">{winRate == null ? '—' : pct(winRate)}</strong><em>{wins} רווחיות מתוך {closed.length} סגורות</em></div>
    </section>

    <section className="rsi-floor" id="rsi-positions" aria-label="רצפת מסחר ופוזיציות פתוחות">
      <div className="rsi-section-head"><div><small>TRADING FLOOR · POSITIONS</small><h2>ספר הפוזיציות · {open.length}/2</h2></div><span className="rsi-tag">מתעדכן כל 15 שניות · מחיר שוק אם זמין</span></div>
      {rows.length ? <div className="rsi-position-list">
        {rows.map(({ t, symbol, mark, live, metrics: m }) => {
          const held = Math.max(0, Math.floor((Date.now() - Date.parse(t.opened_at)) / 60000))
          const progress = Math.max(0, Math.min(100, held / 160 * 100))
          return <a key={String(t.id)} href={'trade.html?id=' + encodeURIComponent(String(t.id))} className={'rsi-position ' + (m.net >= 0 ? 'winning' : 'losing')} title="לחץ לפתיחת גרף העסקה">
            <div className="rsi-position-top"><div><strong dir="ltr">{symbol}</strong><span className={m.dir > 0 ? 'rsi-long' : 'rsi-short'}>{t.side === 'LONG' ? '▲ LONG' : '▼ SHORT'}</span><span className="rsi-leverage">×{t.lev || 20}</span></div><div className={'rsi-pnl ' + (m.net >= 0 ? 'gain' : 'loss')} dir="ltr">{signed(m.net)}<small>{fmtPctSigned(m.marginPct)} על מרווח</small></div></div>
            <div className="rsi-trade-grid">
              <div><small>מחיר כניסה</small><b dir="ltr">{px(t.entry_price)}</b></div>
              <div><small>{live ? 'מחיר Binance לקריאה בלבד' : 'מחיר נר 5 דק׳ סגור'}</small><b dir="ltr">{px(mark)}</b></div>
              <div><small>יעד (TP)</small><b className="gain" dir="ltr">{px(m.target)}</b></div>
              <div><small>עצירת הפסד (SL)</small><b className="loss" dir="ltr">{px(m.stop)}</b></div>
              <div><small>שינוי מחיר בכיוון העסקה</small><b dir="ltr">{fmtPctSigned(m.movePct)}</b></div>
              <div><small>יחס לסיכון הראשוני</small><b dir="ltr">{fmtR(m.netR)}</b></div>
              <div><small>שווי חשיפה מדומה</small><b dir="ltr">{money(m.notional)}</b></div>
              <div><small>מרווח מדומה</small><b dir="ltr">{money(m.margin)}</b></div>
              <div><small>עמלות + החלקה + מימון (מודל)</small><b dir="ltr">{money(m.costs)}</b></div>
              <div><small>שעת פתיחה</small><b>{time(t.opened_at)}</b></div>
            </div>
            <div className="rsi-hold"><div><span>זמן החזקה: <b>{held} דקות</b> · מגבלה 160 דקות</span><span dir="ltr">{Math.round(progress)}%</span></div><div className="rsi-bar"><i style={{ width: progress + '%' }} /></div></div>
            <div className="rsi-open-chart">פתח את גרף העסקה והפרטים <b>←</b></div>
          </a>
        })}
      </div> : <div className="rsi-empty">אין כרגע פוזיציות פתוחות. המנוע ממשיך לסרוק נרות סגורים וממתין לאות העומד בכל מסנני RSI2.</div>}
      <p className="rsi-note">רווח/הפסד פתוח הוא אומדן לסגירה במחיר המוצג, כולל עלויות המודל. הוא אינו ביצוע אמיתי, והמחיר עשוי להגיע מנר 5 דקות סגור כשהטיקר אינו זמין.</p>
    </section>

    <section className="rsi-floor" id="rsi-journal" aria-label="עסקאות סגורות וסטטיסטיקה">
      <div className="rsi-section-head"><div><small>TRADE TAPE · HISTORY</small><h2>יומן עסקאות דמו</h2></div><strong className={totalClosedPnl >= 0 ? 'gain' : 'loss'} dir="ltr">{signed(totalClosedPnl)} ממומש</strong></div>
      <div className="rsi-mini-kpis"><div><small>עסקאות סגורות</small><b>{closed.length}</b></div><div><small>רווחיות</small><b>{wins}</b></div><div><small>הפסדיות / ללא רווח</small><b>{closed.length - wins}</b></div><div><small>שיעור הצלחה נטו</small><b>{winRate == null ? '—' : pct(winRate)}</b></div></div>
      {closed.length >= 2 && <div className="rsi-chart"><small>עקומת רווח/הפסד ממומש — על סמך העסקאות הרשומות בלבד, לא כולל פוזיציות פתוחות</small><svg viewBox="0 0 720 108" preserveAspectRatio="none" aria-label="עקומת ההון הממומש של החשבון"><polyline points={chartPoints} fill="none" stroke={totalClosedPnl >= 0 ? '#35df9a' : '#ff8098'} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" /></svg></div>}
      {visibleClosed.length ? <div className="rsi-table"><table><thead><tr><th>נסגר</th><th>חוזה / כיוון</th><th>כניסה</th><th>יציאה</th><th>רווח/הפסד נטו</th><th>סיבה</th><th>גרף</th></tr></thead><tbody>
        {visibleClosed.map(t => <tr key={String(t.id)}><td>{time(t.closed_at)}</td><td><b dir="ltr">{t.scalp_meta?.exact_contract || t.sym}</b><small>{t.side}</small></td><td dir="ltr">{px(t.entry_price)}</td><td dir="ltr">{px(t.exit_price)}</td><td className={num(t.pnl) >= 0 ? 'gain' : 'loss'} dir="ltr">{signed(num(t.pnl))}</td><td>{reason(String(t.scalp_meta?.exit_reason || ''))}</td><td><a href={'trade.html?id=' + encodeURIComponent(String(t.id))}>פתח ↗</a></td></tr>)}
      </tbody></table></div> : <div className="rsi-empty">עדיין אין עסקאות סגורות. עסקאות שנפתחו יופיעו כאן לאחר הסגירה.</div>}
      {closed.length > 15 && <button className="rsi-more" onClick={() => setMoreTrades(v => !v)} type="button">{moreTrades ? 'הצג 15 אחרונות' : 'הצג את כל ' + closed.length + ' העסקאות שנקלטו'}</button>}
      <p className="rsi-note">היומן מציג עד 500 עסקאות אחרונות מאסטרטגיית RSI2 בלבד. רווחים והפסדים כוללים את עלויות הסימולציה שנרשמו בספר הבוט; אין כאן נתוני פקודות בורסה.</p>
    </section>

    <section className="rsi-research" id="rsi-research">
      <details>
        <summary><span>פילטרים, נתוני מועמדים ומחקר סטטיסטי</span><b>הצג פרטים ▾</b></summary>
        <p className="rsi-note">נרות סגורים של 5 דקות, מסנן מגמה ב־15 דקות, יעד ATR×1, סטופ ATR×2, עד 160 דקות. עלות בסיס 0.12% ולחץ 0.16% מהחשיפה, לפי המודל הקפוא. לא שונו תנאי הכניסה או היציאה.</p>
        <div className="rsi-candidates">{runs.map(run => {
          const r = run.report ?? {}, b = r.base ?? {}, s = r.stress ?? {}
          return <article key={run.symbol}><h3 dir="ltr">{run.symbol}</h3>
            <p className={r.dataStatus === 'OK' ? 'gain' : 'loss'}>{r.dataStatus === 'OK' ? 'נתוני חוזה מאומתים' : 'נתוני שוק חסרים · אין כניסות חדשות'}</p>
            <p className="rsi-muted">{qualify(r.qualification)}</p>
            <p>{run.symbol === 'TRADOORUSDT' ? 'פילטר נוסף: ADX(14) קטן מ־25' : 'פילטר נוסף: נפח גדול או שווה לממוצע 20 נרות'}</p>
            <dl><dt>עסקאות מבחן סגורות</dt><dd>{b.trades ?? 0} / 100</dd><dt>Win rate נטו</dt><dd>{pct(b.netWinRate == null ? null : b.netWinRate * 100)}</dd><dt>תוחלת נטו לעסקה</dt><dd>{pct(b.netExpectancyPct)}</dd><dt>Profit Factor</dt><dd>{b.profitFactorInfinite ? '∞' : b.profitFactor?.toFixed(2) ?? '—'}</dd><dt>Drawdown לפי סגירות</dt><dd>{pct(b.drawdownPct)}</dd><dt>עלות שנוכתה במבחן</dt><dd>{money(b.deductedCostsUsd)}</dd><dt>לחץ: Win rate / תוחלת</dt><dd>{pct(s.netWinRate == null ? null : s.netWinRate * 100)} / {pct(s.netExpectancyPct)}</dd><dt>מימון (Funding)</dt><dd>{r.fundingIncludedThisRun ? 'נכלל במודל' : 'נתוני מימון חסרים'}</dd><dt>סריקה אחרונה</dt><dd>{time(r.checkedAt)}</dd></dl>
            <p className="rsi-note">נדרש מדגם אימון מאומת ו־100 עסקאות קדימה, 61% הצלחה נטו, תוחלת חיובית ו־PF מעל 1, גם בעלות לחץ. חוסר בנתוני האימון אינו בהכרח תקלה בהזנת מחירים.</p>
          </article>
        })}</div>
        <p className="rsi-note">תחילת המדידה: {time(runs[0]?.started_at)}. החוזים ממונפים בסימולציה בלבד וללא מודל ליקווידציה של הבורסה.</p>
      </details>
    </section>
  </main>
}

const CSS = "\n.rsi-house{font-family:system-ui,-apple-system,Arial,sans-serif;color:#e2e8f0;width:100%;padding:clamp(6px,2vw,18px);box-sizing:border-box;line-height:1.5}\n.rsi-house *{box-sizing:border-box}.rsi-house a{color:inherit}.rsi-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:4px 0 12px}\n.rsi-head small,.rsi-section-head small{letter-spacing:.09em;color:#9cb6d5;font-size:11px;font-weight:800}.rsi-house h1{font-size:clamp(25px,5vw,38px);line-height:1.2;margin:7px 0}.rsi-head p{color:#aabacf;margin:4px 0}\n.rsi-badges{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.rsi-badges span{padding:8px 13px;background:#101b30;border:1px solid #2b3d58;border-radius:99px;font-size:12px}.rsi-badges .goodBadge{color:#65e9b4;border-color:#27664c}.rsi-badges .warningBadge{color:#ffc675;border-color:#75572a}\n.rsi-error{color:#ffc675;padding:12px;background:#362715;border:1px solid #7c4a1c;border-radius:10px}.rsi-nav{display:flex;gap:9px;flex-wrap:wrap;margin:18px 0}.rsi-nav a{background:#10213a;color:#b7d7fd;text-decoration:none;padding:10px 14px;border-radius:10px;border:1px solid #2e4969;font-weight:700;font-size:13px}\n.rsi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rsi-grid>div,.rsi-floor,.rsi-research{background:#0d1627;border:1px solid #283951;border-radius:17px;min-width:0}\n.rsi-grid>div{padding:18px;min-height:120px}.rsi-grid small,.rsi-mini-kpis small,.rsi-trade-grid small{display:block;color:#98a9c3;font-size:12px}.rsi-grid strong{display:block;font-size:clamp(21px,3vw,29px);white-space:nowrap;margin:11px 0 4px;font-variant-numeric:tabular-nums}.rsi-grid em{font-style:normal;display:block;color:#879db9;font-size:11px}\n.rsi-house .gain{color:#51e5a7!important}.rsi-house .loss{color:#ff8399!important}.rsi-house .rsi-muted,.rsi-note{color:#98aac5}\n.rsi-floor{padding:18px;margin-top:18px;scroll-margin-top:16px}.rsi-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.rsi-section-head h2{font-size:22px;margin:2px 0}.rsi-tag{font-size:11px;padding:6px 10px;color:#9aafd0;background:#121f32;border-radius:25px}\n.rsi-position-list{display:grid;grid-template-columns:1fr;gap:14px}.rsi-position{display:block;background:#0c2030;border:1px solid #2d5066;border-radius:15px;padding:18px;color:inherit;text-decoration:none;transition:border-color .2s,background .2s}.rsi-position:hover{border-color:#4ba0ce;background:#11283c}.rsi-position.losing{border-color:#603a50}\n.rsi-position-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:13px;border-bottom:1px solid #2c4155}.rsi-position-top>div:first-child{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.rsi-position-top strong{font-size:22px;font-variant-numeric:tabular-nums}.rsi-long,.rsi-short,.rsi-leverage{border-radius:8px;padding:5px 9px;font-size:12px;font-weight:800}.rsi-long{color:#5deabc;background:#114b40}.rsi-short{color:#ff8ca0;background:#522d40}.rsi-leverage{background:#152b4e;color:#bdceef}\n.rsi-pnl{text-align:left;font-size:25px;font-weight:850;font-variant-numeric:tabular-nums}.rsi-pnl small{display:block;color:#9bb6c7;font-size:12px;font-weight:500}.rsi-trade-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px 12px;padding:18px 0}.rsi-trade-grid b{font-size:14px;font-weight:700;word-break:break-word;font-variant-numeric:tabular-nums}.rsi-trade-grid small{margin-bottom:5px}.rsi-hold{font-size:12px;color:#c4d7e6}.rsi-hold>div:first-child{display:flex;justify-content:space-between;gap:12px}.rsi-bar{height:7px;border-radius:9px;background:#213d53;margin:8px 0 12px;overflow:hidden}.rsi-bar i{display:block;height:100%;border-radius:8px;background:#54cba5}.rsi-open-chart{border-top:1px solid #2c4155;padding-top:10px;color:#95c9ff;font-size:12px;font-weight:700}\n.rsi-empty{padding:28px 15px;background:#0c1b2c;border:1px dashed #30506a;border-radius:12px;color:#b9cadc;text-align:center}.rsi-note{font-size:12px;line-height:1.8;margin:12px 0 0}\n.rsi-mini-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:14px}.rsi-mini-kpis>div{padding:13px;background:#132039;border-radius:12px}.rsi-mini-kpis b{font-size:19px}.rsi-chart{padding:13px;background:#0a1928;border-radius:12px;margin:12px 0}.rsi-chart small{color:#9baec9}.rsi-chart svg{display:block;width:100%;height:96px;margin-top:10px}\n.rsi-table{width:100%;overflow:auto}.rsi-table table{border-collapse:collapse;width:100%;min-width:670px;font-size:12px}.rsi-table th,.rsi-table td{padding:12px 9px;text-align:right;border-bottom:1px solid #233751;white-space:nowrap}.rsi-table th{background:#132239;color:#bdcfe9;position:sticky;top:0}.rsi-table td small{display:block;color:#849cb9}.rsi-table a{color:#99d0ff}.rsi-more,.rsi-head button{background:#193757;color:#cae2ff;border:1px solid #416282;padding:10px 18px;border-radius:10px;cursor:pointer}.rsi-more{margin-top:12px}\n.rsi-research{padding:0;margin-top:18px;scroll-margin-top:16px}.rsi-research>details>summary{padding:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;font-weight:800}.rsi-research>details>summary b{font-size:12px;color:#9bcfff}.rsi-research details[open]{padding-bottom:16px}.rsi-research details>.rsi-note{padding:0 18px}\n.rsi-candidates{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px 18px}.rsi-candidates article{background:#0e2032;border:1px solid #2f435f;padding:18px;border-radius:13px;min-width:0}.rsi-candidates h3{font-size:20px;margin:0}.rsi-candidates p{font-size:12px}.rsi-candidates dl{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px}.rsi-candidates dt{color:#9fb4cd}.rsi-candidates dd{margin:0;text-align:left;direction:ltr;font-variant-numeric:tabular-nums}\n@media(max-width:760px){.rsi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rsi-trade-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rsi-candidates{grid-template-columns:1fr}.rsi-mini-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(max-width:460px){.rsi-house{padding:4px}.rsi-floor{padding:12px}.rsi-grid>div{padding:13px;min-height:106px}.rsi-grid strong{font-size:21px}.rsi-position{padding:12px}.rsi-position-top strong{font-size:19px}.rsi-pnl{font-size:21px}.rsi-trade-grid{gap:14px 8px}.rsi-trade-grid b{font-size:12px}.rsi-badges span{padding:7px 9px;font-size:11px}}\n"
