// v95.1 — one trade, live, TradingView-style (owner: "click an open trade, see it on a live chart with the stop, the
// target and every indicator that made the bot enter, in Hebrew"). READ-ONLY: the trade row comes from bot_trades with
// the anon key; the entry reasons are the values the bot STORED at entry (scalp_meta), never recomputed here. Candles
// and the live price come from Binance Futures (OKX as fallback) in the browser. The EMA20 line and the 20-bar volume
// average are drawn for reading only — the FAST rule itself uses the stored values shown in the panel.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time } from 'lightweight-charts'
import { SUPA_URL, SUPA_KEY } from '../supa'
import { tradeMetrics, fmtR, fmtPctSigned } from '../tradeMetrics'
import { useLivePrices, tickDir } from '../livePrices'

type Row = Record<string, any>
type K = { t: number; o: number; h: number; l: number; c: number; v: number; tb: number }
const C = { bg: '#04070E', card: '#0B1220', line: '#1E2A44', dim: '#8A97B2', text: '#E8EEF9', pos: '#00d492', neg: '#ff4d6a', acc: '#5aa9ff', warn: '#ffb454' }
const TF_MS: Record<string, number> = { '1m':60e3,'3m':180e3,'5m':300e3,'15m':900e3,'30m':1800e3,'1h':3600e3,'2h':7200e3,'4h':14400e3,'6h':21600e3,'8h':28800e3,'12h':43200e3,'1d':86400e3,'3d':259200e3,'1w':604800e3,'1M':2592000e3 }
const OKX_BAR: Record<string, string> = { '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6H','12h':'12H','1d':'1D','3d':'3D','1w':'1W' }
const TF_CHOICES = [['1m','1ד'],['3m','3ד'],['5m','5ד'],['15m','15ד'],['30m','30ד'],['1h','1ש'],['2h','2ש'],['4h','4ש'],['6h','6ש'],['8h','8ש'],['12h','12ש'],['1d','1י'],['3d','3י'],['1w','1שב'],['1M','1ח']] as const
const bsym = (sym: string) => (sym === 'PEPE' ? { s: '1000PEPEUSDT', k: 1000 } : { s: `${sym}USDT`, k: 1 })
const tfOf = (t: Row) => t.strategy === 'PRO' ? '1m' : t.strategy === 'FAST' ? (t.scalp_meta?.fast?.mode === 'rt' ? '1m' : '5m') : t.strategy === 'LAB' ? String(t.scalp_meta?.lab?.tf ?? '1h') : t.strategy === 'SCALP' ? '1m' : t.strategy === 'BRKV' ? '4h' : t.strategy === 'LIST' ? '1h' : t.strategy === 'FUND' || t.strategy === 'EVT' ? '5m' : t.strategy === 'ROTA' ? '1h' : '5m'
const fmt = (x: number) => (!Number.isFinite(x) ? '—' : Math.abs(x) >= 1000 ? x.toFixed(2) : Number(x.toPrecision(5)).toString())
const usd = (x: number) => `${x < 0 ? '−' : '+'}$${Math.abs(x).toFixed(2)}`
const pct = (x: number, d = 2) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(d)}%`
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const candleCloseAt = (tf: string, now: number) => {
  if (tf === '1M') { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) }
  if (tf === '1w') {
    const d = new Date(now), day = d.getUTCDay(), days = day === 0 ? 1 : 8 - day
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)
  }
  const ms = TF_MS[tf] ?? 60_000
  return Math.floor(now / ms) * ms + ms
}
const candleLeft = (tf: string, now: number) => {
  let s = Math.max(0, Math.ceil((candleCloseAt(tf, now) - now) / 1000))
  const d = Math.floor(s / 86400); s %= 86400
  const h = Math.floor(s / 3600); s %= 3600
  const m = Math.floor(s / 60), sec = s % 60
  return d ? `${d}י ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

async function klines(sym: string, tf: string, limit: number): Promise<{ k: K[]; src: string }> {
  try {
    const { s, k } = bsym(sym)
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${tf}&limit=${limit}`, { signal: AbortSignal.timeout(4000) })
    if (r.ok) { const d = await r.json(); return { src: 'Binance Futures', k: d.map((x: any[]) => ({ t: +x[0], o: +x[1] / k, h: +x[2] / k, l: +x[3] / k, c: +x[4] / k, v: +x[5] * k, tb: +x[9] * k })) } }
  } catch { /* fallback */ }
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=${OKX_BAR[tf] ?? '5m'}&limit=${Math.min(300, limit)}`, { signal: AbortSignal.timeout(4000) })
    const d = await r.json(); if (d.code === '0' && d.data?.length) return { src: 'OKX (ללא נתוני קונים/מוכרים)', k: d.data.map((x: string[]) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], tb: NaN })).reverse() }
  } catch { /* fallback */ }
  // v97.4: Bybit linear perpetuals — covers coins OKX does not list (e.g. XMR)
  const { s, k } = bsym(sym), iv = ({ '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '1d': 'D' } as Record<string, string>)[tf] ?? '5'
  const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${s}&interval=${iv}&limit=${Math.min(1000, limit)}`, { signal: AbortSignal.timeout(4000) })
  const d = await r.json(); if (d.retCode !== 0 || !d.result?.list?.length) throw new Error('no candles')
  return { src: 'Bybit (ללא נתוני קונים/מוכרים)', k: d.result.list.map((x: string[]) => ({ t: +x[0], o: +x[1] / k, h: +x[2] / k, l: +x[3] / k, c: +x[4] / k, v: +x[5] * k, tb: NaN })).reverse() }
}
const ema = (xs: number[], p: number) => { const k = 2 / (p + 1); let e = xs[0]; return xs.map((x, i) => (e = i ? x * k + e * (1 - k) : x)) }

function Reasons({ t }: { t: Row }) {
  const m = t.scalp_meta ?? {}, side = t.side === 'LONG' ? 1 : -1, sideHe = side > 0 ? 'עלייה' : 'ירידה'
  const row = (ok: boolean, title: string, value: string, rule: string, explain: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, padding: '10px 0', borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 20, color: ok ? C.pos : C.neg }}>{ok ? '✓' : '✗'}</div>
      <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{title}</b><span dir="ltr" style={{ color: C.acc, fontVariantNumeric: 'tabular-nums' }}>{value}</span></div>
        <div style={{ color: C.dim, fontSize: 13, marginTop: 2 }}>{rule}</div><div style={{ fontSize: 13, marginTop: 4 }}>{explain}</div></div>
    </div>)
  if (t.strategy === 'CHAN' && m.chan) {
    const c = m.chan, mr = c.comp === 'RG_MR', f2 = (x: unknown, d = 2) => (Number.isFinite(Number(x)) ? Number(x).toFixed(d) : '—')
    const regimeHe: Record<string, string> = { MEAN_REVERT: 'חוזר לממוצע', TREND: 'מגמה', HIGH_VOL: 'תנודתיות קיצונית', NEUTRAL: 'ניטרלי' }
    return <>
      {row(true, '1. מצב השוק (מסנן מצב שוק)', `${regimeHe[c.regime] ?? c.regime} · Hurst ${f2(c.hurst, 3)}`, 'Hurst מתחת ל־0.45 = חוזר לממוצע, מעל 0.55 = מגמה; תנודתיות מעל אחוזון 90 = לא סוחרים',
        mr ? 'השוק התנהג כמו שוק שחוזר לממוצע — לכן הופעלה אסטרטגיית החזרה לממוצע.' : 'השוק התנהג כמו שוק במגמה — לכן הופעלה אסטרטגיית המומנטום.')}
      {mr ? <>
        {row(true, '2. מהירות החזרה לממוצע (half-life)', `${f2(c.halflife, 1)} נרות`, 'תנאי: בין 5 ל־300 נרות; קובע את אורך הממוצע', `המחיר נוטה לחזור חצי מהדרך לממוצע תוך כ־${f2(c.halflife, 0)} נרות של 5 דקות.`)}
        {row(true, '3. סטייה מהממוצע (z)', `z = ${f2(c.z)}`, `תנאי: |z| לפחות 2.5`, `המחיר רחוק ${f2(Math.abs(Number(c.z)))} סטיות תקן מהממוצע — נכנסים בכיוון החזרה, יוצאים כשחוזר לממוצע.`)}
      </> : <>
        {row(true, '2. מובהקות המומנטום', `t = ${f2(c.t_sig)}`, 'תנאי: t לפחות 2 — התשואה של 144 הנרות הקודמים ניבאה את 12 הבאים בנתונים האחרונים', 'רק כשהמומנטום מובהק סטטיסטית — לא לפי תחושה.')}
        {row(true, '3. פריצה', t.side === 'LONG' ? `מעל ${f2(c.hh, 4)}` : `מתחת ${f2(c.ll, 4)}`, 'תנאי: סגירה מעבר לשיא/שפל 144 הנרות הקודמים', 'יציאה אחרי 12 נרות (שעה) או בסטופ.')}
      </>}
      {row(true, '4. גודל לפי חצי־Kelly', `${(Number(c.risk_frac) * 100).toFixed(2)}% מההון בסיכון`, 'חצי־Kelly על הרקורד החי של האסטרטגיה, תקרה 1%; לפני 30 עסקאות: 0.25%', `${c.kelly_why ?? ''} · מינוף ×${Number(t.lev) || 1} · סטופ חובה ${f2(c.stop, 4)}`)}
      <div style={{ color: C.warn, fontSize: 12, marginTop: 8 }}>מערכת צ׳אן (quant/) · במבחן ההיסטורי קיבלה NO-GO — רצה בדמו לבקשתך, לא עברה אימות · נר {String(c.bar ?? '').slice(11, 19)} UTC</div>
    </>
  }
  if (t.strategy === 'FAST' && m.fast?.mode === 'wyckoff') {
    const f = m.fast, w = f.wyckoff ?? {}, ck = Object.fromEntries((f.checks ?? []).map((c: any) => [c.k, c]))
    const ok = (k: string) => ck[k]?.ok === true, px = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x).toPrecision(6) : '—')
    return <>
      {row(ok('range'), '1. טווח מסחר (דשדוש)', `${Number(w.height).toFixed(1)} ATR`, 'תנאי: 48 הנרות האחרונים (4 שעות) בטווח של עד 12 ATR — שוק בצבירה/פיזור, לא במגמה',
        `הטווח: ${px(w.lo)} עד ${px(w.hi)}.`)}
      {row(ok('spring'), side > 0 ? '2. ספרינג — ניעור מתחת לתחתית' : '2. אפ־ת׳ראסט — פריצת שווא מעל התקרה', `${Number(f.z).toFixed(2)} ATR`, side > 0 ? 'תנאי: הנר ירד מתחת לתחתית הטווח' : 'תנאי: הנר עלה מעל תקרת הטווח',
        `הקצה של הנר: ${px(w.ext)}. לפי וויקוף — ניעור של סטופים לפני תנועה ${side > 0 ? 'למעלה' : 'למטה'}.`)}
      {row(ok('reclaim'), '3. חזרה לתוך הטווח', side > 0 ? `סגירה מעל ${px(w.lo)}` : `סגירה מתחת ${px(w.hi)}`, 'תנאי: הנר נסגר בחזרה בתוך הטווח', 'הפריצה נכשלה — הצד השני לא הצליח להחזיק את המחיר מחוץ לטווח.')}
      {row(ok('volume'), '4. נפח נמוך בניעור', `×${Number(f.vol_ratio).toFixed(2)}`, 'תנאי: נפח הנר מתחת לממוצע הטווח', side > 0 ? 'אין היצע אמיתי — מעט מוכרים דחפו מתחת לתחתית.' : 'אין ביקוש אמיתי — מעט קונים דחפו מעל התקרה.')}
      {f.psych && <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}><b>פסיכולוגיית מסחר:</b> הפסדים ברצף לפני הכניסה {f.psych.streak} · הפסדים היום {f.psych.day_losses} · גודל {Number(f.psych.size_mult) < 1 ? 'חצי (אחרי 2 הפסדים ברצף)' : 'מלא'}
        {Number.isFinite(Number(w.trapped)) && <> · {(Number(w.trapped) * 100).toFixed(0)}% מהנפח בנר הניעור היו {side > 0 ? 'מוכרים' : 'קונים'} אגרסיביים שנלכדו (מידע בלבד)</>}</div>}
      <div style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>ערכים שנשמרו ברגע הכניסה (נר {String(f.bar ?? '').slice(11, 19)} UTC) · סטופ מעבר לקצה הניעור ({px(w.stop_px)}), יעד 1.5R, עד 8 שעות · בבדיקה היסטורית (36 חודשים) הכלל הפסיד כ־0.16% לעסקה אחרי עלויות — ניסוי דמו</div>
    </>
  }
  if (t.strategy === 'FAST' && m.fast) {
    const f = m.fast, z = Number(f.z), vr = Number(f.vol_ratio), imb = Number(f.imb), rtm = f.mode === 'rt', zMin = rtm ? 2 : 1.5
    // v95.6: the verdict is the ENGINE's (stored at entry with the raw values). Older rows stored values rounded to 2-3
    // decimals, so re-checking them here could show ✗ on a condition the engine passed (RAYSOL: z 2.0309 stored as 2.00
    // vs "> 2"). A row exists only because the engine passed all four, so a legacy row shows ✓ and says it is rounded.
    const ck = Array.isArray(f.checks) ? Object.fromEntries(f.checks.map((c: any) => [c.k, c])) : null
    const okOf = (k: string) => (ck ? ck[k]?.ok === true : true)
    const legacy = ck ? '' : ' (ערך מעוגל)'
    const zs = ck ? z.toFixed(4) : z.toFixed(2)
    return <>
      {row(okOf('burst'), '1. קפיצת מחיר חדה', `z = ${zs}${legacy}`, rtm ? `תנאי: המחיר ברגע הכניסה מול לפני 3 דקות — יותר מפי ${zMin} מהתנודה הרגילה (בזמן אמת)` : `תנאי: תנועה ב־3 הנרות האחרונים (15 דק׳) גדולה מפי ${zMin} מהתנודה הרגילה`,
        `המחיר זז ב${sideHe} בעוצמה של פי ${Math.abs(z).toFixed(2)} מהרגיל${Math.abs(z) - zMin < 0.1 ? ` — בקושי מעל הסף (${zMin}); אות גבולי` : ' — מומנטום חזק לכיוון העסקה'}.`)}
      {row(okOf('volume'), '2. נפח מסחר חריג', `×${ck ? vr.toFixed(3) : vr.toFixed(2)}${legacy}`, rtm ? 'תנאי: נפח 3 הדקות האחרונות לפחות פי 2 מהרגיל' : 'תנאי: נפח הנר האחרון לפחות פי 2 מהממוצע של 20 הנרות',
        `נסחר פי ${vr.toFixed(1)} מהרגיל — הרבה כסף נכנס לתנועה הזאת, לא תזוזה "ריקה".`)}
      {row(okOf('flow'), side > 0 ? '3. קונים אגרסיביים שולטים' : '3. מוכרים אגרסיביים שולטים', `${(imb * 100).toFixed(ck ? 2 : 1)}%${legacy}`, rtm ? 'תנאי: פער בין קונים למוכרים בשוק (Taker) מעל 10% ב־3 הדקות האחרונות' : 'תנאי: פער בין קונים למוכרים בשוק (Taker) מעל 10% ב־3 הנרות',
        `${side > 0 ? 'הקונים האגרסיביים' : 'המוכרים האגרסיביים'} (שקנו/מכרו במחיר השוק) היו ${((1 + side * imb) / 2 * 100).toFixed(0)}% מהנפח — נתון אמיתי מ־Binance. לחץ קנייה/מכירה לא מבטיח שהמחיר ימשיך לזוז.`)}
      {row(ck ? okOf('btc') : true, '4. ביטקוין באותו כיוון', f.btc_up === true ? 'BTC מעל EMA20' : f.btc_up === false ? 'BTC מתחת EMA20' : '—',
        `תנאי: ביטקוין (${rtm ? 'דקה' : '5 דק׳'}) מעל הממוצע שלו לעסקת קנייה / מתחת לעסקת מכירה`, 'כל השוק זז לאותו צד — פחות סיכוי שהתנועה תתהפך מיד.')}
      {!ck && <div style={{ color: C.warn, fontSize: 12, marginTop: 6 }}>עסקה ישנה: הערכים נשמרו מעוגלים; ה־✓ הוא החלטת המנוע (כל ארבעת התנאים עברו על הערכים המקוריים — אחרת העסקה לא הייתה נפתחת).</div>}
      <div style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>ערכים שנשמרו ברגע הכניסה ({rtm ? 'זמן אמת, ' : 'נר '}{String(f.bar ?? '').slice(11, 19)} UTC) · מרווח קנייה/מכירה בכניסה {Number(f.spread_bps).toFixed(1)} bps · הכלל לא עבר בדיקה היסטורית (ניסוי דמו)</div>
    </>
  }
  if (t.strategy === 'LAB' && m.lab) return <div style={{ fontSize: 14, lineHeight: 1.7 }}>אסטרטגיית מעבדה <b dir="ltr">{m.lab.spec}</b> ({m.lab.tier === 'elite' ? 'מובחרת' : 'חקירה'}) · OOS: {m.lab.oos?.mean}% לעסקה, t={m.lab.oos?.t}, PF {m.lab.oos?.pf} · רווח נטו צפוי {m.lab.exp_net_bps} bps</div>
  if (t.strategy === 'SCALP') return <div style={{ fontSize: 14, lineHeight: 1.7 }}>סוכנים שתמכו: {(m.evidence?.agents ?? []).join(', ') || '—'} · רווח צפוי {m.net_bps ?? '—'} bps אחרי עלויות {m.costs?.total_bps ?? '—'} bps</div>
  if (t.strategy === 'FUND') return <div style={{ fontSize: 14, lineHeight: 1.7 }}>תפיסת funding (H6a): שעה לפני הסליקה ב-<b>{m.settle_at ? new Date(m.settle_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—'}</b> ה-funding החזוי היה <b>{m.pred_rate != null ? (Number(m.pred_rate) * 100).toFixed(3) + '%' : '—'}</b>, אז הבוט נכנס לצד שמקבל אותו. יציאה 15 דקות אחרי הסליקה, בלי סטופ; ה-funding שנרשם הוא הסליקה האמיתית של בינאנס{m.settled_rate != null ? ` (${(Number(m.settled_rate) * 100).toFixed(3)}%)` : ''}. <span style={{ color: C.warn }}>ניסוי שלא הוכח (במבחן לאחור: חיובי קטן, לא מובהק).</span></div>
  if (t.strategy === 'PRO') { const pm = m.pro ?? {}, ck: any[] = Array.isArray(pm.checks) ? pm.checks : []
    return <div style={{ fontSize: 14, lineHeight: 1.7 }}>סקאלפינג דקה לפי הפרומט: נכנס בסגירת נר {pm.bar ? new Date(pm.bar).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—'} כשכל 9 התנאים התקיימו. סטופ {pm.params?.stopAtr ?? 1.2}×ATR(14), יעד {pm.params?.targetR ?? 3}R, ב-1R סטופ לכניסה ואז נגרר 1R, יציאה אם אין 1R תוך {pm.params?.timeStopBars ?? 15} דקות.
      <ul style={{ margin: '6px 0', paddingInlineStart: 18 }}>{ck.map((c: any, i: number) => <li key={i} style={{ color: c.ok ? '#4ade80' : '#f87171' }}>{c.ok ? '✓' : '✗'} {c.k} = {Number.isFinite(Number(c.v)) ? Number(c.v).toPrecision(5) : String(c.v)}</li>)}</ul>
      <span style={{ color: C.warn }}>נדחה בבדיקה לאחור (v100bt: 1.39R- לעסקה אחרי עלויות). רץ בדמו לפי בקשת הבעלים.</span></div> }
  if (t.strategy === 'EVT') return <div style={{ fontSize: 14, lineHeight: 1.7 }}>הודעת בינאנס {t.side === 'LONG' ? 'על ליסטינג (מסחר ספוט חדש) → לונג על החוזה' : 'על דיליסטינג (הסרה מספוט) → שורט על החוזה'}. ההודעה פורסמה ב-<b>{m.announced_at ? new Date(m.announced_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</b>, הבוט נכנס עד 10 דקות אחריה ויוצא אחרי 4 שעות במחיר השוק, בלי סטופ; ה-funding שנרשם הוא הסליקות האמיתיות של בינאנס במהלך ההחזקה. <div style={{ color: C.dim, fontSize: 12 }}>{String(m.note ?? '')}</div><span style={{ color: C.warn }}>ניסוי שלא הוכח (בהיסטוריה: כ-54% הצלחה, זנבות עבים לשני הכיוונים).</span></div>
  if (t.strategy === 'LIST') return <div style={{ fontSize: 14, lineHeight: 1.7 }}>שורט על מטבע חדש בבינאנס פיוצ'רס: נכנס לרשימה לפני <b>{m.age_days != null ? Number(m.age_days).toFixed(1) : '—'}</b> ימים, מחזור 24ש׳ ${m.quote_vol_24h ? (Number(m.quote_vol_24h) / 1e6).toFixed(1) + 'M' : '—'}. יציאה: ‎+20% סטופ, ‎-30% יעד, או אחרי 21 יום. <span style={{ color: C.warn }}>ניסוי שלא נבדק לאחור.</span></div>
  return <div style={{ color: C.dim }}>{t.strategy === 'ROTA' ? 'רוטציית מומנטום: המטבע דורג בין החזקים/החלשים ביותר ב־7/14/28 ימים. אין סטופ — יוצא בסבב הבא.' : 'אין פירוט שמור לעסקה הזאת.'}</div>
}

export default function TradeView({ id }: { id: string }) {
  const [t, setT] = useState<Row | null>(null), [err, setErr] = useState<string | null>(null)
  const [last, setLast] = useState<number>(NaN), [src, setSrc] = useState(''), [now, setNow] = useState(Date.now())
  const [tf, setTf] = useState('5m')
  const [probe, setProbe] = useState<{ price:number; net:number; marginPct:number; time?:unknown } | null>(null)
  const box = useRef<HTMLDivElement>(null), chart = useRef<IChartApi | null>(null)
  const barSpacing = useRef(7)
  const lastBar = useRef<K | null>(null), liveRef = useRef(false)
  const cs = useRef<ISeriesApi<'Candlestick'> | null>(null), vs = useRef<ISeriesApi<'Histogram'> | null>(null), es = useRef<ISeriesApi<'Line'> | null>(null)
  // the trade row, refreshed (stop ratchets / close)
  useEffect(() => {
    let live = true
    const load = async () => {
      try { const r = await fetch(`${SUPA_URL}/rest/v1/bot_trades?id=eq.${encodeURIComponent(id)}&select=*`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })
        const d = await r.json(); if (live) { if (d?.[0]) { setT(d[0]); setErr(null) } else setErr('העסקה לא נמצאה') } } catch (e: any) { if (live) setErr(String(e?.message ?? e)) }
    }
    load(); const i = setInterval(load, 10_000); const c = setInterval(() => setNow(Date.now()), 1000)
    return () => { live = false; clearInterval(i); clearInterval(c) }
  }, [id])
  useEffect(() => { if (t?.id) setTf(tfOf(t)) }, [t?.id])
  const sym = t ? String(t.sym) : ''
  // v97.4: the live exchange feed moves the price, the P&L and the forming candle with every trade (display only)
  const ticks = useLivePrices(t && t.status === 'OPEN' ? [sym] : [])
  const tk = ticks[sym]
  useEffect(() => {
    if (!tk) return
    liveRef.current = true
    setLast(tk.px)                       // the cards move even while the chart has no candles
    if (!cs.current || !lastBar.current) return
    const bar = TF_MS[tf], b0 = Math.floor(tk.t / bar) * bar, lb = lastBar.current
    if (b0 < lb.t) return
    const nb: K = b0 === lb.t ? { ...lb, c: tk.px, h: Math.max(lb.h, tk.px), l: Math.min(lb.l, tk.px) } : { t: b0, o: lb.c, h: Math.max(lb.c, tk.px), l: Math.min(lb.c, tk.px), c: tk.px, v: 0, tb: NaN }
    lastBar.current = nb
    try { cs.current.update({ time: Math.floor(nb.t / 1000) as UTCTimestamp, open: nb.o, high: nb.h, low: nb.l, close: nb.c }) } catch { /* chart rebuilding */ }
  }, [tk?.px, tk?.t, tf])
  const lv = useMemo(() => {
    if (!t) return null
    const m = t.scalp_meta ?? {}, f = m.fast ?? m.lab ?? m.chan ?? {}
    const stop = Number(f.stop ?? (t.strategy === 'ROTA' ? NaN : t.trail_sl))
    const fixedTarget = Number(f.target ?? m.target_px ?? NaN)
    const mrTarget = t.strategy === 'CHAN' && f.comp === 'RG_MR' && Number.isFinite(Number(f.mr_mean)) ? Math.exp(Number(f.mr_mean)) : NaN
    const target = Number.isFinite(fixedTarget) ? fixedTarget : mrTarget
    const targetDynamic = !Number.isFinite(fixedTarget) && Number.isFinite(mrTarget)
    const entry = Number(t.entry_price), dir = t.side === 'LONG' ? 1 : -1, lev = Math.max(1, Number(t.lev) || 1)
    const liqStored = Number(f.liq ?? m.liq ?? NaN)
    const liq = Number.isFinite(liqStored) ? liqStored : (lev > 1 ? entry * (1 - dir * (1 / lev - 0.005)) : NaN)
    return { entry, stop: stop > 0 && stop < entry * 50 ? stop : NaN, target: target > 0 && !f.trail ? target : NaN, targetDynamic, liq, trail: !!f.trail, holdMs: Number(f.hold_min ?? m.hold_min ?? NaN) * 60e3 || (f.hold ? Number(f.hold) * TF_MS[tf] : NaN) }
  }, [t, tf])
  // chart
  useEffect(() => {
    if (!box.current || !t || !lv) return
    const ch = createChart(box.current, {
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.dim, fontFamily: 'system-ui' },
      grid: { vertLines: { color: '#0f1830' }, horzLines: { color: '#0f1830' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.line, autoScale: true },
      timeScale: { borderColor: C.line, timeVisible: true, secondsVisible: tf === '1m' || tf === '3m', rightOffset: 8, barSpacing: barSpacing.current, minBarSpacing: 0.8 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      kineticScroll: { touch: true, mouse: true },
      autoSize: true
    })
    chart.current = ch
    const c = ch.addCandlestickSeries({ upColor: C.pos, downColor: C.neg, wickUpColor: C.pos, wickDownColor: C.neg, borderVisible: false, priceFormat: { type: 'price', precision: 6, minMove: 0.000001 } })
    const v = ch.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    const e = ch.addLineSeries({ color: '#9b8cff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    cs.current = c; vs.current = v; es.current = e
    const pl = (price: number, color: string, title: string, style = LineStyle.Solid) => { if (Number.isFinite(price)) c.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title }) }
    const netAt = (price:number) => Number.isFinite(price) ? tradeMetrics(t, price, Date.now()).net : NaN
    pl(lv.entry, C.acc, 'כניסה')
    pl(lv.stop, C.neg, `${lv.trail ? 'סטופ נגרר' : 'סטופ'} ${Number.isFinite(netAt(lv.stop)) ? usd(netAt(lv.stop)) : ''}`, LineStyle.Dashed)
    pl(lv.target, C.pos, `${lv.targetDynamic ? 'יעד דינמי' : 'יעד'} ${Number.isFinite(netAt(lv.target)) ? usd(netAt(lv.target)) : ''}`, LineStyle.Dashed)
    pl(lv.liq, '#c084fc', 'מימוש / ליקווידציה', LineStyle.Dashed)
    if (t.exit_price) pl(Number(t.exit_price), C.warn, 'יציאה', LineStyle.Dotted)

    const crosshair = (param:any) => {
      if (!param?.point) { setProbe(null); return }
      const price = Number(c.coordinateToPrice(param.point.y))
      if (!Number.isFinite(price) || price <= 0) { setProbe(null); return }
      const pm = tradeMetrics(t, price, Date.now())
      setProbe({ price, net: pm.net, marginPct: pm.marginPct, time: param.time })
    }
    ch.subscribeCrosshairMove(crosshair)
    let alive = true
    const paint = (k: K[]) => {
      const T = (x: number) => Math.floor(x / 1000) as UTCTimestamp
      c.setData(k.map((b) => ({ time: T(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
      v.setData(k.map((b) => { const buy = Number.isFinite(b.tb) && b.v > 0 ? b.tb / b.v : 0.5; return { time: T(b.t), value: b.v, color: buy >= 0.5 ? `rgba(0,212,146,${0.25 + Math.min(0.6, (buy - 0.5) * 3)})` : `rgba(255,77,106,${0.25 + Math.min(0.6, (0.5 - buy) * 3)})` } }))
      const em = ema(k.map((b) => b.c), 20); e.setData(k.map((b, i) => ({ time: T(b.t), value: em[i] })).slice(20))
      const bar = TF_MS[tf], open = Date.parse(t.opened_at), dir = t.side === 'LONG' ? 1 : -1
      const mk: SeriesMarker<Time>[] = [{ time: T(Math.floor(open / bar) * bar), position: dir > 0 ? 'belowBar' : 'aboveBar', color: C.acc, shape: dir > 0 ? 'arrowUp' : 'arrowDown', text: 'כניסה' }]
      if (t.strategy === 'FAST') mk.unshift({ time: T(Math.floor(open / bar) * bar - bar), position: dir > 0 ? 'aboveBar' : 'belowBar', color: C.warn, shape: 'circle', text: 'אות' })
      if (t.closed_at) { const xp = Number(t.exit_price), up = xp >= Number(t.entry_price)   // the exit sits on the side the price went
        mk.push({ time: T(Math.floor(Date.parse(t.closed_at) / bar) * bar), position: up ? 'aboveBar' : 'belowBar', color: C.warn, shape: up ? 'arrowDown' : 'arrowUp', text: ({ STOP: 'סטופ', TARGET: 'יעד', TIMEOUT: 'זמן' } as Record<string, string>)[t.scalp_meta?.exit_reason] ?? 'יציאה' }) }
      c.setMarkers(mk.sort((a, b) => Number(a.time) - Number(b.time)))
      lastBar.current = k[k.length - 1]
      setLast((prev) => (liveRef.current ? prev : k[k.length - 1].c))
    }
    ;(async () => { try { const r = await klines(sym, tf, 300); if (!alive) return; setSrc(r.src); paint(r.k); { const bar = TF_MS[tf], e0 = Math.floor(Date.parse(t.opened_at) / bar) * bar, ie = Math.max(0, r.k.findIndex((b) => b.t >= e0)), ix = t.closed_at ? r.k.findIndex((b) => b.t >= Math.floor(Date.parse(t.closed_at) / bar) * bar) : -1
      ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, ie - 30), to: (ix >= 0 ? Math.max(ix + 12, ie + 20) : Math.max(r.k.length, ie + 20)) + 3 }) } } catch { setErr('אין נרות מ־Binance או OKX') } })()
    const tick = setInterval(async () => { try { const r = await klines(sym, tf, 300); if (alive) { setSrc(r.src); paint(r.k) } } catch { /* keep last */ } }, 5000)
    return () => { alive = false; clearInterval(tick); try { ch.unsubscribeCrosshairMove(crosshair) } catch {} ; ch.remove(); chart.current = null; cs.current = null; lastBar.current = null; setProbe(null) }
  }, [t?.id, t?.closed_at, lv?.stop, lv?.target, lv?.liq, tf, sym])
  if (err && !t) return <div style={{ color: C.neg, padding: 16 }}>{err}</div>
  if (!t || !lv) return <div style={{ color: C.dim, padding: 16 }}>טוען עסקה…</div>
  const isOpen = t.status === 'OPEN', mark = isOpen ? last : Number(t.exit_price)
  const M = tradeMetrics(t, mark, now), { dir, notional, lev } = M
  const targetM = Number.isFinite(lv.target) ? tradeMetrics(t, lv.target, now) : null
  const targetPct = Number.isFinite(lv.target) && M.entry > 0 ? dir * (lv.target - M.entry) / M.entry : NaN
  const held = (isOpen ? now : Date.parse(t.closed_at)) - Date.parse(t.opened_at)
  const changeBarWidth = (mul:number) => {
    const next = Math.max(0.8, Math.min(40, barSpacing.current * mul))
    barSpacing.current = next
    try { chart.current?.timeScale().applyOptions({ barSpacing: next }) } catch {}
  }
  const fl = isOpen ? tickDir(tk) : ''
  const stat = (label: string, value: string, color = C.text, live = false) => <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px' }}><div style={{ color: C.dim, fontSize: 12 }}>{label}</div><div key={live ? value : undefined} className={live ? `tv-flash ${fl}` : undefined} dir="ltr" style={{ color, fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</div></div>
  return (
    <div dir="rtl" style={{ color: C.text, fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 10 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24 }}>{sym}</h1>
        <span style={{ color: dir > 0 ? C.pos : C.warn, fontWeight: 700 }}>{dir > 0 ? 'LONG · קנייה' : 'SHORT · מכירה'}</span>
        <span style={{ color: C.dim }}>{t.strategy} · נרות {tf} · {isOpen ? <b style={{ color: C.pos }}>● פתוחה בלייב</b> : `נסגרה (${t.scalp_meta?.exit_reason ?? t.status})`}</span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        {stat(isOpen ? 'רווח/הפסד נטו (משוער)' : 'רווח/הפסד נטו', Number.isFinite(M.net) ? usd(M.net) : '—', M.net >= 0 ? C.pos : C.neg, true)}
        {stat('תנועה מהכניסה', fmtPctSigned(M.movePct, 3), M.movePct >= 0 ? C.pos : C.neg, true)}
        {stat('R ברוטו · נטו', `${fmtR(M.grossR)} · ${fmtR(M.netR)}`, M.netR >= 0 ? C.pos : C.neg)}
        {stat(isOpen ? 'מחיר עכשיו' : 'מחיר יציאה', fmt(mark), C.text, true)}
        {stat('כניסה', fmt(M.entry), C.acc)}
        {stat(lv.trail ? 'סטופ נגרר (מהכניסה)' : 'סטופ (מהכניסה)', Number.isFinite(M.stop) ? `${fmt(M.stop)} (${fmtPctSigned(M.stopPct, 3)})` : 'אין', C.neg)}
        {stat(lv.targetDynamic ? 'יעד דינמי · ממוצע Z=0' : 'יעד (מהכניסה)', lv.trail ? 'ללא יעד — סטופ נגרר' : Number.isFinite(lv.target) ? `${fmt(lv.target)} (${fmtPctSigned(targetPct, 3)})` : 'אין', C.pos)}
        {targetM && stat(lv.targetDynamic ? 'רווח נטו משוער בממוצע' : 'רווח נטו אם יעד', usd(targetM.net), targetM.net >= 0 ? C.pos : C.neg)}
        {lev > 1 && stat('מחיר מימוש / ליקווידציה', Number.isFinite(lv.liq) ? fmt(lv.liq) : '—', '#c084fc')}
        {lev > 1 && stat('על הביטחון (ממונף)', fmtPctSigned(M.marginPct, 1), M.marginPct >= 0 ? C.pos : C.neg)}
        {stat(lev > 1 ? `גודל · ביטחון · מינוף` : 'גודל', lev > 1 ? `$${notional.toFixed(0)} · $${M.margin.toFixed(0)} · ×${lev}` : `$${notional.toFixed(0)}`)}
        {stat(isOpen ? 'זמן בעסקה / מקסימום' : 'משך', Number.isFinite(lv.holdMs) ? `${mmss(held)} / ${mmss(lv.holdMs)}` : mmss(held))}
      </div>
      <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', background:C.card, border:`1px solid ${C.line}`, borderRadius:10, padding:8 }}>
        <b style={{ fontSize:12, marginLeft:4 }}>טווח:</b>
        {TF_CHOICES.map(([id,label]) => <button key={id} onClick={()=>setTf(id)} style={{ display:'grid', gap:1, minWidth:48, border:`1px solid ${tf===id?C.acc:C.line}`, background:tf===id?'#102442':'#07101b', color:tf===id?'#fff':C.dim, borderRadius:7, padding:'4px 7px', fontWeight:tf===id?800:500 }}>
          <span>{label}</span><small style={{fontSize:9,color:tf===id?'#8fd3ff':'#53627a',fontVariantNumeric:'tabular-nums'}}>{candleLeft(id,now)}</small>
        </button>)}
        <span style={{ flex:1 }} />
        <button onClick={()=>changeBarWidth(0.75)} style={{ border:`1px solid ${C.line}`, background:'#07101b', color:C.text, borderRadius:7, padding:'5px 9px' }}>− רוחב נרות</button>
        <button onClick={()=>changeBarWidth(1.35)} style={{ border:`1px solid ${C.line}`, background:'#07101b', color:C.text, borderRadius:7, padding:'5px 9px' }}>+ רוחב נרות</button>
        <button onClick={()=>chart.current?.timeScale().fitContent()} style={{ border:`1px solid ${C.line}`, background:'#07101b', color:C.text, borderRadius:7, padding:'5px 9px' }}>התאם הכל</button>
        <button onClick={()=>chart.current?.timeScale().scrollToRealTime()} style={{ border:`1px solid ${C.line}`, background:'#07101b', color:C.text, borderRadius:7, padding:'5px 9px' }}>חזור ללייב</button>
      </div>
      <div style={{ display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',color:C.dim,fontSize:11 }}>
        <span>אפשר לגרור, לצבוט/לגלול ולהרחיב או לצמצם את רוחב הנרות.</span>
        <b style={{color:C.acc,fontVariantNumeric:'tabular-nums'}}>נר {tf} נסגר בעוד {candleLeft(tf,now)}</b>
      </div>
      <div style={{ position:'relative' }}>
        <div ref={box} style={{ height: 'calc(100vh - 390px)', minHeight: 480, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.line}`, touchAction:'none' }} />
        <div style={{ position:'absolute',top:8,left:8,zIndex:3,minWidth:190,background:'rgba(4,7,14,.90)',border:`1px solid ${probe ? (probe.net>=0?C.pos:C.neg) : C.line}`,borderRadius:9,padding:'7px 9px',pointerEvents:'none',boxShadow:'0 6px 20px rgba(0,0,0,.25)' }}>
          {probe ? <>
            <div style={{fontSize:10,color:C.dim}}>נקודת הסמן</div>
            <div dir="ltr" style={{fontWeight:800,fontVariantNumeric:'tabular-nums'}}>מחיר {fmt(probe.price)}</div>
            <div dir="ltr" style={{fontWeight:900,fontSize:17,color:probe.net>=0?C.pos:C.neg}}>P&L נטו {usd(probe.net)}</div>
            <div dir="ltr" style={{fontSize:11,color:probe.marginPct>=0?C.pos:C.neg}}>על הבטוחה {fmtPctSigned(probe.marginPct,1)}</div>
          </> : <div style={{fontSize:11,color:C.dim}}>הזז את הסמן/האצבע לכל מחיר כדי לראות רווח או הפסד נטו באותה נקודה.</div>}
        </div>
      </div>
      <div style={{ color: C.dim, fontSize: 12 }}><style>{'.tv-flash.up{animation:tvu .9s ease-out}.tv-flash.down{animation:tvd .9s ease-out}@keyframes tvu{0%{background:#16a34a;color:#fff}100%{background:transparent}}@keyframes tvd{0%{background:#dc2626;color:#fff}100%{background:transparent}}'}</style>נרות: {src || '—'} · מחיר חי: {isOpen ? (tk ? (tk.src === 'הבוט' ? 'מחיר הבוט מהשרת (כל ~5 שנ׳ — הבורסות חסומות בדפדפן הזה)' : `${tk.src}, זז עם כל שינוי בבורסה`) : 'מתחבר…') : 'העסקה סגורה'} · קו סגול = ממוצע נע 20 (לתצוגה) · עמודות נפח: ירוק = קונים אגרסיביים שלטו בנר, אדום = מוכרים · הבוט סוגר לפי המחיר שלו בשרת, ייתכנו הבדלים קטנים</div>
      <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>למה הבוט נכנס לעסקה</h2>
        <Reasons t={t} />
      </section>
      <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 14, lineHeight: 1.7 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>איך הוא ייצא</h2>
        {t.strategy === 'FAST' ? <>{lv.trail ? <>סטופ נגרר: {fmt(lv.stop)} · אין יעד קבוע — אחרי רווח של פי 1 מהסיכון הסטופ עולה אחרי המחיר (במרחק פי 1 מהסיכון מהשיא) ולא יורד לעולם ·</> : <>סטופ: {fmt(lv.stop)} · יעד: {fmt(lv.target)} (פי 1.5 מהסיכון) ·</>} אם אף אחד לא נפגע — יוצא אחרי {t.scalp_meta?.fast?.hold_min ?? 60} דקות בכל מחיר.{Number(t.lev) > 1 ? ` מינוף ×${t.lev}: חיסול ב־${fmt(Number(t.scalp_meta?.fast?.liq))} — מפסיד את כל הביטחון ($${Number(t.scalp_meta?.fast?.margin ?? 0).toFixed(0)}).` : ''} עמלות: 0.05% בכל צד על כל הגודל + מרווח.</> : t.strategy === 'CHAN' ? <>סטופ: {fmt(lv.stop)} · {Number.isFinite(lv.target) ? <>{lv.targetDynamic ? 'יעד דינמי Z=0 (ממוצע נוכחי)' : 'יעד'}: {fmt(lv.target)}{targetM ? <> · נטו משוער ביעד {usd(targetM.net)}</> : null}</> : 'אין יעד מחיר קבוע'} · מימוש/ליקווידציה: {fmt(lv.liq)}. באסטרטגיית חזרה לממוצע היעד הדינמי הוא קו Z=0, והוא יכול להתעדכן בנר הסגור הבא.</> : 'לפי כללי האסטרטגיה (ראו הרמות על הגרף).'}
        {!isOpen && t.strategy === 'FAST' && (() => { const fl = t.scalp_meta?.fill, why = t.scalp_meta?.exit_reason, xp = Number(t.exit_price)
          if (fl) return <div style={{ marginTop: 6 }}>ביצוע היציאה: {fl.trigger_ts ? <>המחיר נגע ברמה ב־{new Date(fl.trigger_ts).toISOString().slice(11, 23)} UTC ({fmt(Number(fl.trigger_px))}), זוהה אחרי {(Number(fl.lag_ms) / 1000).toFixed(1)} שנ׳ · </> : null}{fl.impact_bps !== undefined ? <>החלקה לפי עומק הספר {Number(fl.impact_bps).toFixed(1)} bps{fl.beyond_book ? ' (הפוזיציה גדולה מהספר הנראה — הערכה, INFERRED)' : ''} · </> : null}מקור: {fl.model}</div>
          // legacy rows (before v95.6): say plainly when the booked fill was worse than a resting stop / better than a limit target
          const off = why === 'STOP' && Number.isFinite(M.stop) ? dir * (xp - M.stop) / M.entry : why === 'TARGET' && Number.isFinite(M.target) ? dir * (xp - M.target) / M.entry : NaN
          return Number.isFinite(off) && Math.abs(off) > 0.0005 ? <div style={{ marginTop: 6, color: C.warn }}>הערה: עסקה מלפני תיקון המילוי (v95.6). היציאה נרשמה {fmtPctSigned(off, 3)} {why === 'STOP' ? 'מעבר לסטופ — הבדיקה רצה באיחור של כמה שניות ומילאה במחיר של אז' : 'מעבר ליעד — פקודת יעד אמיתית הייתה מתמלאת בדיוק ביעד'}. מאז, יציאות נקבעות לפי העסקאות האמיתיות בבורסה.</div> : null })()}
      </section>
    </div>)
}
