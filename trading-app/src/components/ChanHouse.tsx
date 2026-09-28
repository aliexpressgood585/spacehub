import { useEffect, useState } from 'react'
import { SUPA_KEY, SUPA_URL } from '../supa'

type J = any
const REST = `${SUPA_URL}/rest/v1/`
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }

async function q<T = J>(path: string): Promise<T> {
  const r = await fetch(REST + path, { headers: H, cache: 'no-store' })
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`)
  return r.json()
}

const fmt$ = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' :
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ago(t: number | null, now: number) {
  if (!t || !Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `לפני ${s} שנ׳`
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`
  return `לפני ${Math.floor(s / 3600)} ש׳`
}

export default function ChanHouse({ onBack }: { onBack?: () => void }) {
  const [state, setState] = useState<J | null>(null)
  const [open, setOpen] = useState<J[]>([])
  const [manifest, setManifest] = useState<J | null>(null)
  const [errors, setErrors] = useState<J[]>([])
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
        const [st, op, man, er] = await Promise.all([
          q<J[]>('bot_state?select=balance,bot_params,paper_mode,updated_at&limit=1'),
          q<J[]>('bot_trades?select=id,sym,status,strategy,lev,scalp_meta&status=eq.OPEN&strategy=eq.CHAN&order=opened_at.desc'),
          q<J[]>('deployment_manifest?select=sha,enabled_sleeves&order=first_seen.desc&limit=1').catch(() => []),
          q<J[]>(`bot_errors?select=ts,scope,message&ts=gte.${new Date(Date.now()-3_600_000).toISOString()}&order=ts.desc&limit=20`).catch(() => []),
        ])
        if (!alive) return
        setState(st[0] ?? null)
        setOpen(op ?? [])
        setManifest(man[0] ?? null)
        setErrors(er ?? [])
        setErr('')
      } catch (e: any) {
        if (alive) setErr(String(e?.message ?? e))
      }
    }
    void load()
    const iv = setInterval(load, 5000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  const p = state?.bot_params ?? {}
  const cycT = p.chan_cycle?.ts ? Date.parse(p.chan_cycle.ts) : null
  const fresh = cycT != null && now - cycT < 90_000
  const activeErrors = errors.filter((e) => !cycT || Date.parse(e.ts) > cycT).length
  const wallets = p.chan_split?.wallets ?? {}

  return <div className="ch" dir="rtl">
    <style>{CSS}</style>

    <div className="top">
      {onBack && <button className="back" onClick={onBack}>→ חזרה</button>}
      <h1>בית הבוט · CHAN</h1>
      <span className={`chip ${fresh ? 'ok' : 'bad'}`}>{fresh ? `● חי · מחזור ${ago(cycT, now)}` : `○ אין מחזור ${ago(cycT, now)}`}</span>
      <span className="chip">{state?.paper_mode === false ? 'לא נייר!' : 'נייר בלבד'}</span>
      <span className="chip">{manifest ? `${manifest.enabled_sleeves ?? 'CHAN'} · ${String(manifest.sha ?? '').slice(0,7)}` : 'CHAN'}</span>
      <span className={`chip ${activeErrors ? 'bad' : 'ok'}`}>{activeErrors ? `${activeErrors} שגיאות פעילות` : '0 שגיאות פעילות'}</span>
    </div>

    <div className="warn">מנוע ניסיוני: בבדיקה ההיסטורית (Phase 1) כל האסטרטגיות קיבלו NO-GO. הוא רץ על נייר כבדיקת תשתית בלבד — מה שקורה כאן איננו ראיה לרווחיות.</div>
    {err && <div className="readerr">שגיאת קריאה: {err}</div>}

    <section className="panel">
      <h2>ניסוי 50/50 · שני תקציבים עצמאיים</h2>
      <p className="muted">מסלול 1: האסטרטגיות הקיימות · מסלול 2: פריצה ותיקון. חצי מההון בתחילת הניסוי לכל מסלול; הרווחים וההפסדים נשארים במסלול שלהם.</p>
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

function Row({k,v,cls=''}:{k:string;v:string;cls?:string}) {
  return <div className="row"><span>{k}</span><bdi dir="ltr" className={cls}>{v}</bdi></div>
}

const CSS = `
.ch{color:#e2e8f0;font-family:system-ui,sans-serif;font-size:15px;padding:4px}
.top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
h1{font-size:24px;margin:0 8px 0 0}
.back{background:none;border:1px solid #223150;color:#94a3b8;border-radius:999px;padding:7px 14px}
.chip{border:1px solid #223150;border-radius:999px;padding:6px 12px;color:#94a3b8}
.chip.ok{color:#34d399;border-color:#166534}.chip.bad{color:#f87171;border-color:#991b1b}
.warn{background:#2a1a05;border:1px solid #92400e;color:#fbbf24;border-radius:16px;padding:15px 18px;margin-bottom:18px;font-size:16px;line-height:1.55}
.readerr{color:#f87171;margin-bottom:10px}
.panel{background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:18px}
.panel h2{font-size:23px;text-align:center;margin:0 0 8px}
.muted{color:#64748b;text-align:center;line-height:1.45;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.card{background:#0b1220;border:2px solid;border-radius:18px;padding:16px 22px}
.card.c1{border-color:#22d3ee}.card.c2{border-color:#fbbf24}
.card h3{font-size:22px;margin:0 0 12px}.card.c1 h3{color:#22d3ee}.card.c2 h3{color:#fbbf24}
.row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px dashed #243047;font-size:17px}
.row span{color:#94a3b8}.row bdi{font-variant-numeric:tabular-nums}.pos{color:#34d399}.neg{color:#f87171}
@media(max-width:640px){.ch{font-size:13px}.panel{padding:12px}.grid{grid-template-columns:1fr}.row{font-size:15px}.card h3{font-size:19px}.panel h2{font-size:20px}h1{font-size:22px}}
`
