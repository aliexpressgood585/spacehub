// Standalone page: "פולי מטבעות" — the short crypto Up/Down paper desk (polycoins.html), same views as poly.html. Read-only. One live feed (polyLive.ts) drives two views:
// the 3D arena (default) and the classic tables. The choice is remembered per browser.
import { StrictMode, useState } from 'react'
import type { J } from './polyLive'
import { createRoot } from 'react-dom/client'
import PolyDesk from './components/PolyDesk'
import PolyVerse from './components/PolyVerse'
import PolyOrbit from './components/PolyOrbit'
import { usePolyLive, COINS_STATE_URL } from './polyLive'

const EMPTY = 'אין פוזיציה פתוחה כרגע. הבוט בודק כל 10 שניות את שווקי "עולה או יורד" של 5 דקות (ביטקוין, את׳ריום, סולנה, XRP) ונכנס רק 3 דקות לפני הסיום, כשהצד המוביל במחיר 90–98¢ והמחיר רחוק מספיק מקו הפתיחה.'
const ABOUT = 'האסטרטגיה (גרסה 3): בשווקי "עולה או יורד" של 5 דקות, 3 דקות לפני הסיום, קונה את הצד המוביל במחיר 90–98¢ ומחזיק עד ההכרעה ($1 או $0 למניה). שלוש הגנות: (1) עסקה אחת בכל חלון של 5 דקות, כי המטבעות זזים יחד; (2) עד 3% מהחשבון לעסקה; (3) רצפה מוגנת שמתחילה ב־$900 ועולה בחצי מכל שיא רווח, כך ששלושה הפסדים ברצף לא יכולים לשבור אותה. ועוד שני מסננים: לא משלמים יותר מסנט אחד מעל העסקה האחרונה בשוק, ונכנסים רק כשביטקוין רחוק מקו הפתיחה ביחס לתזוזה הרגילה בזמן שנשאר (מרחק ≥ 1.5). אם לא נכנס, יש הסתכלות שנייה 2:20 עד 0:45 לפני הסיום, רק במרחק גדול (≥ 2.5) — זה מכפיל בערך את מספר העסקאות. במחקר על ~11,500 שווקים: כ־97% הצלחה ורווח כ־2.7–2.9% לעסקה, אבל זה עוד לא מוכח במחירים חיים.'

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
      <LateExit x={s?.late_exit} lab={lab} />
    </div>
  )
}

// (3) SHADOW LATE EXIT (owner 2026-10-14): what would selling at 30 / 15 s before the end have done, per rule. Observation only.
const usd = (v: any) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`)
const RULE_HE: Record<string, string> = { always: 'תמיד', 'bid<0.90': 'אם המחיר < 90¢', 'bid<0.80': 'אם < 80¢', 'bid<0.70': 'אם < 70¢', 'bid<0.50': 'אם < 50¢', 'z<0': 'אם ביטקוין עבר לצד הלא נכון', 'z<0.5': 'אם ביטקוין קרוב לקו' }
function LateExit({ x, lab }: { x?: J; lab: any }) {
  return (
    <div><div style={lab}>3 · ניסוי "מכירה בשניות האחרונות" (מדידה בלבד, לא נוגע בכסף)</div>
      לכל עסקה הבוט רושם כמה היה מקבל אילו מכר את כל הפוזיציה 30 ו־15 שניות לפני הסיום, לפי ספר הקונים האמיתי ופחות עמלה, ומשווה לתוצאה בפועל. חיובי = המכירה הייתה עדיפה.
      {(['x30', 'x15'] as const).map((k) => { const v = x?.[k]; return (
        <div key={k} style={{ marginTop: 4 }}><b>{k === 'x30' ? '30 שניות' : '15 שניות'}</b> ({v?.n ?? 0} עסקאות):{' '}
          {(v?.rules ?? []).filter((r: J) => r.sold > 0).map((r: J) => (
            <span key={r.rule} style={{ marginInlineEnd: 10 }}>{RULE_HE[r.rule] ?? r.rule}: נמכרו {r.sold} ({r.wins_cut} מנצחות, {r.losses_cut} מפסידות) → <b style={{ color: r.gain_usd > 0 ? '#3ddc97' : '#ff6b6b' }}>{usd(r.gain_usd)}</b></span>))}
          {!(v?.n) && <span style={{ color: '#8fa3b8' }}>עוד אין נתונים</span>}
        </div>) })}
    </div>
  )
}

function PolyApp() {
  const d = usePolyLive(COINS_STATE_URL)
  // default = the orbit (owner 2026-10-14: "something special, 2030"); the arena and the tables stay one tap away
  const [view, setView] = useState<'orbit' | '3d' | 'classic'>(() => { try { const q = new URLSearchParams(location.search).get('view'); if (q === 'orbit' || q === '3d' || q === 'classic') return q; const v = localStorage.getItem('polycoins-view2'); return v === 'classic' || v === '3d' ? v : 'orbit' } catch { return 'orbit' } })
  const go = (v: 'orbit' | '3d' | 'classic') => { setView(v); try { localStorage.setItem('polycoins-view2', v) } catch { /* private mode */ } ; window.scrollTo(0, 0) }
  if (view === 'orbit') return <PolyOrbit d={d} onClassic={() => go('classic')} onArena={() => go('3d')} />
  if (view === '3d') return <PolyVerse d={d} onClassic={() => go('classic')} title="פולי מטבעות" sub="Polymarket · מטבעות בטווח קצר · חשבון דמו" empty={EMPTY} extra={<Study s={d.st?.study} compact />} other={{ href: 'polycoins.html?view=orbit', label: '◎ למסלול' }} />
  return (
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ width: '100%', maxWidth: 1100, display: 'grid', gap: 10 }}>
        <button onClick={() => go('orbit')} style={{ justifySelf: 'start', background: 'rgba(61,220,151,.12)', border: '1px solid rgba(61,220,151,.4)', color: '#d6ffe9', borderRadius: 10, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>◎ למסלול</button>
        <button onClick={() => go('3d')} style={{ justifySelf: 'start', background: 'rgba(76,201,240,.12)', border: '1px solid rgba(76,201,240,.4)', color: '#cfe8ff', borderRadius: 10, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>✦ לזירת התלת־ממד</button>
        <a href="poly.html" style={{ justifySelf: 'start', color: '#9fb3c8', fontSize: 12 }}>← לשולחן Polymarket הראשי</a>
        <PolyDesk d={d} title="פולי מטבעות · דמו" about={ABOUT} extra={<Study s={d.st?.study} />} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><PolyApp /></StrictMode>)
