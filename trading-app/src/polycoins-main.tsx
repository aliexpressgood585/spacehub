// Standalone page: "פולי מטבעות" — the short crypto Up/Down paper desk (polycoins.html), same views as poly.html. Read-only. One live feed (polyLive.ts) drives two views:
// the 3D arena (default) and the classic tables. The choice is remembered per browser.
import { StrictMode, useState } from 'react'
import type { J } from './polyLive'
import { createRoot } from 'react-dom/client'
import PolyDesk from './components/PolyDesk'
import PolyVerse from './components/PolyVerse'
import { usePolyLive, COINS_STATE_URL } from './polyLive'

const EMPTY = 'אין פוזיציה פתוחה כרגע. הבוט בודק כל 10 שניות את שווקי "עולה או יורד" הקצרים של ביטקוין, את׳ריום, סולנה ו־XRP, ונכנס רק 3 דקות לפני הסיום של שוק 5 דקות, כשהצד המוביל במחיר 90–98¢.'
const ABOUT = 'האסטרטגיה: בשווקי "עולה או יורד" של 5 דקות (ביטקוין, את׳ריום, סולנה, XRP), 3 דקות לפני הסיום, קונה את הצד המוביל אם מחיר המכירה האמיתי בין 90¢ ל־98¢, ומחזיק עד ההכרעה הרשמית ($1 או $0 למניה). כל המזומן הפנוי מתחלק שווה בין הכניסות של אותו רגע, עד 25% מהחשבון לעסקה (4 מטבעות = כל החשבון), עמלת Polymarket אמיתית (0.07·p·(1−p)). המחקר על 21,739 שווקים: אחוז הצלחה ~95%, רווח קטן מאוד לעסקה (+0.5%), לא מוכח — הפסד אחד = רבע מהחשבון ומוחק ~20 ניצחונות.'

// Live study (owner 2026-10-13): (1) what the desk really pays vs the research assumption (last trade + 1c);
// (2) a SHADOW maker: a virtual bid at the real best bid placed with every entry, no fee, never touches cash.
const pc = (v: any, d = 1) => (v == null ? '—' : `${(100 * v).toFixed(d)}%`)
const cc = (v: any) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}¢`)
function Study({ s, compact }: { s?: J; compact?: boolean }) {
  const [openS, setOpenS] = useState(false)
  const f = s?.fills ?? {}, m = s?.maker ?? {}, t = s?.taker ?? {}
  const box = { background: 'rgba(10,16,28,.72)', border: '1px solid rgba(120,160,220,.25)', borderRadius: 12, padding: '8px 12px', color: '#e6edf5', fontSize: 12.5, backdropFilter: 'blur(6px)' } as const
  const lab = { color: '#8fa3b8', fontSize: 11.5 }
  const head = <><b>מעבדה חיה</b> · כניסה מול המחקר <b style={{ color: (f.avg_vs_research_c ?? 0) > 0 ? '#ff6b6b' : '#3ddc97' }}>{cc(f.avg_vs_research_c)}</b> · קונה ממתין: {m.filled ?? 0}/{m.resolved ?? 0} מולאו, תשואה {pc(m.ret, 2)} מול מיידי {pc(t.ret, 2)}</>
  if (compact && !openS) return <div style={{ ...box, cursor: 'pointer' }} onClick={() => setOpenS(true)}>{head} ▾</div>
  return (
    <div style={{ ...box, display: 'grid', gap: 6, cursor: compact ? 'pointer' : 'default' }} onClick={() => compact && setOpenS(false)}>
      <div>{head}</div>
      <div><div style={lab}>1 · מחיר הכניסה בפועל ({f.n ?? 0} עסקאות)</div>
        ממוצע מעל העסקה האחרונה בשוק: <b>{cc(f.avg_vs_ref_c)}</b> · מעל הנחת המחקר (אחרונה + 1¢): <b style={{ color: (f.avg_vs_research_c ?? 0) > 0 ? '#ff6b6b' : '#3ddc97' }}>{cc(f.avg_vs_research_c)}</b> · עמלה למניה: <b>{cc(f.avg_fee_c)}</b>. חיובי = משלמים יותר ממה שהמחקר הניח, וזה אוכל את היתרון (~0.5¢ לעסקה).</div>
      <div><div style={lab}>2 · ניסוי "קונה ממתין" (מדידה בלבד, לא נוגע בכסף)</div>
        עם כל כניסה הבוט מניח הצעה וירטואלית במחיר הקנייה הטוב בספר (בלי עמלה). היא נחשבת מולאה רק אם מחיר המכירה ירד אליה לפני הסיום.
        הונחו <b>{m.placed ?? 0}</b> · הוכרעו <b>{m.resolved ?? 0}</b> · מולאו <b>{m.filled ?? 0}</b> ({pc(m.fill_rate, 0)}) · הצלחה כשמולאו <b>{pc(m.wr, 0)}</b> · תשואה ממוצעת <b>{pc(m.ret, 2)}</b> לעומת הקנייה המיידית <b>{pc(t.ret, 2)}</b> ({pc(t.wr, 0)} הצלחה, {t.n ?? 0} עסקאות). פספסה {m.missed_wins ?? 0} ניצחונות ו־{m.missed_losses ?? 0} הפסדים.</div>
    </div>
  )
}

function PolyApp() {
  const d = usePolyLive(COINS_STATE_URL)
  const [view, setView] = useState<'3d' | 'classic'>(() => { try { return localStorage.getItem('polycoins-view') === 'classic' ? 'classic' : '3d' } catch { return '3d' } })
  const go = (v: '3d' | 'classic') => { setView(v); try { localStorage.setItem('polycoins-view', v) } catch { /* private mode */ } ; window.scrollTo(0, 0) }
  if (view === '3d') return <PolyVerse d={d} onClassic={() => go('classic')} title="פולי מטבעות" sub="Polymarket · מטבעות בטווח קצר · חשבון דמו" empty={EMPTY} extra={<Study s={d.st?.study} compact />} other={{ href: 'poly.html', label: 'Polymarket ראשי' }} />
  return (
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ width: '100%', maxWidth: 1100, display: 'grid', gap: 10 }}>
        <button onClick={() => go('3d')} style={{ justifySelf: 'start', background: 'rgba(76,201,240,.12)', border: '1px solid rgba(76,201,240,.4)', color: '#cfe8ff', borderRadius: 10, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>✦ לזירת התלת־ממד</button>
        <a href="poly.html" style={{ justifySelf: 'start', color: '#9fb3c8', fontSize: 12 }}>← לשולחן Polymarket הראשי</a>
        <PolyDesk d={d} title="פולי מטבעות · דמו" about={ABOUT} extra={<Study s={d.st?.study} />} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><PolyApp /></StrictMode>)
