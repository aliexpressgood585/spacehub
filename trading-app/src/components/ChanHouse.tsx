import { useEffect, useMemo, useState } from 'react'
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
  RG_MR: 'היפוך לממוצע',
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

export default function ChanHouse({ onBack }: { onBack?: () => void }) {
  const [state, setState] = useState<J | null>(null)
  const [open, setOpen] = useState<J[]>([])
  const [manifest, setManifest] = useState<J | null>(null)
  const [errors, setErrors] = useState<J[]>([])
  const [decisions, setDecisions] = useState<J[]>([])
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
        const [st, op, man, er, dec] = await Promise.all([
          q<J[]>('bot_state?select=balance,bot_params,paper_mode,updated_at&limit=1'),
          q<J[]>('bot_trades?select=id,sym,side,status,strategy,lev,entry_price,size,fee,opened_at,scalp_meta&status=eq.OPEN&strategy=eq.CHAN&order=opened_at.desc'),
          q<J[]>('deployment_manifest?select=sha,enabled_sleeves&order=first_seen.desc&limit=1').catch(() => []),
          q<J[]>(`bot_errors?select=ts,scope,message&ts=gte.${new Date(Date.now()-3_600_000).toISOString()}&order=ts.desc&limit=20`).catch(() => []),
          q<J[]>('trade_decisions?select=ts,sym,side,decision,reason,notional,observed,inferred&inferred->>sleeve=eq.CHAN&order=ts.desc&limit=40').catch(() => []),
        ])
        if (!alive) return
        setState(st[0] ?? null)
        setOpen(op ?? [])
        setManifest(man[0] ?? null)
        setErrors(er ?? [])
        setDecisions(dec ?? [])
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
  const cyc = p.chan_cycle ?? {}
  const cycT = cyc?.ts ? Date.parse(cyc.ts) : null
  const fresh = cycT != null && now - cycT < 90_000
  const activeErrors = errors.filter((e) => !cycT || Date.parse(e.ts) > cycT).length
  const wallets = p.chan_split?.wallets ?? {}
  const latest = decisions[0] ?? null
  const latestAccepted = decisions.find((d) => d.decision === 'accepted') ?? null
  const counts = cyc?.regime_counts ?? {}
  const scanning = fresh && cyc?.complete !== true

  const robots = useMemo(() => [
    {
      id:'scanner', icon:'⌁', title:'רובוט סריקה', active:fresh,
      status: fresh ? (cyc?.complete ? 'סריקה הושלמה' : 'סורק עכשיו') : 'ממתין למחזור',
      detail: `${Number(cyc?.scanned ?? 0)} / ${Number(cyc?.universe ?? 0)} חוזים`,
      foot: cycT ? `מחזור ${ago(cycT, now)}` : 'אין מחזור',
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
      detail: latestAccepted ? `סיכון ${pct(Number(latestAccepted.inferred?.kelly_f))} · ${latestAccepted.inferred?.leverage ? latestAccepted.inferred.leverage+'×' : '50× בפוזיציות החדשות'}` : 'אין אישור חדש',
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
      detail: `הון ${fmt$(Number(state?.balance))} · פתוחות ${open.length}`,
      foot: manifest ? `build ${String(manifest.sha ?? '').slice(0,7)}` : '—',
    },
  ], [fresh, cyc, cycT, now, latest, latestAccepted, open, state, activeErrors, manifest])

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

    <section className="factory">
      <div className="factoryHead">
        <div>
          <h2>בית הבקרה החי · מה הבוט עושה מאחורי הקלעים</h2>
          <p>כל חדר מחובר לנתון אמיתי של CHAN. אין כאן אנימציה שממציאה פעולה — רובוט זז רק כשיש נתון טרי.</p>
        </div>
        <span className={`liveBadge ${fresh ? 'on' : ''}`}><i />{fresh ? 'LIVE' : 'STALE'}</span>
      </div>

      <div className="pipeline">
        {robots.map((r,i) => <RobotRoom key={r.id} {...r} last={i===robots.length-1} />)}
      </div>

      <div className="controlGrid">
        <div className="approval">
          <div className="subHead"><b>שרשרת אישורים בזמן אמת</b><span>{decisions.length} החלטות אחרונות</span></div>
          <div className="decisionList">
            {decisions.length === 0 && <div className="empty">עדיין אין החלטות CHAN חדשות.</div>}
            {decisions.slice(0,14).map((d,idx) => {
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
          <div className="subHead"><b>לוח עבודה עכשיו</b><span>{scanning ? 'סריקה פעילה' : 'מחזור אחרון'}</span></div>
          <DeskRow k="נר נבדק" v={cyc?.bar ? clock(cyc.bar) : '—'} />
          <DeskRow k="חוזים שנסרקו" v={`${Number(cyc?.scanned ?? 0)} / ${Number(cyc?.universe ?? 0)}`} />
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
  </div>
}

function Row({k,v,cls=''}:{k:string;v:string;cls?:string}) {
  return <div className="row"><span>{k}</span><bdi dir="ltr" className={cls}>{v}</bdi></div>
}

function DeskRow({k,v,bad=false}:{k:string;v:string;bad?:boolean}) {
  return <div className="deskRow"><span>{k}</span><b className={bad?'badText':''}>{v}</b></div>
}

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
h1{font-size:24px;margin:0 8px 0 0}
.back{background:none;border:1px solid #223150;color:#94a3b8;border-radius:999px;padding:7px 14px}
.chip{border:1px solid #223150;border-radius:999px;padding:6px 12px;color:#94a3b8}
.chip.ok{color:#34d399;border-color:#166534}.chip.bad{color:#f87171;border-color:#991b1b}
.warn{background:#2a1a05;border:1px solid #92400e;color:#fbbf24;border-radius:16px;padding:15px 18px;margin-bottom:18px;font-size:16px;line-height:1.55}
.readerr{color:#f87171;margin-bottom:10px}
.panel,.factory{background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:18px}
.panel{margin-bottom:18px}
.panel h2,.factory h2{font-size:23px;text-align:center;margin:0 0 8px}
.muted{color:#64748b;text-align:center;line-height:1.45;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.card{background:#0b1220;border:2px solid;border-radius:18px;padding:16px 22px}
.card.c1{border-color:#22d3ee}.card.c2{border-color:#fbbf24}
.card h3{font-size:22px;margin:0 0 12px}.card.c1 h3{color:#22d3ee}.card.c2 h3{color:#fbbf24}
.row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px dashed #243047;font-size:17px}
.row span{color:#94a3b8}.row bdi{font-variant-numeric:tabular-nums}.pos{color:#34d399}.neg{color:#f87171}

.factory{background:linear-gradient(180deg,#08111f,#0b1220 42%,#08111f)}
.factoryHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}
.factoryHead h2{text-align:right;margin:0 0 5px}.factoryHead p{margin:0;color:#64748b;line-height:1.5}
.liveBadge{display:flex;align-items:center;gap:7px;border:1px solid #334155;border-radius:999px;padding:7px 12px;color:#64748b;font-weight:800}
.liveBadge i{width:8px;height:8px;border-radius:50%;background:#475569}.liveBadge.on{color:#34d399;border-color:#166534}.liveBadge.on i{background:#34d399;box-shadow:0 0 14px #34d399;animation:pulse 1.2s infinite}

.pipeline{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:12px;align-items:stretch;margin-bottom:18px;overflow-x:auto;padding-bottom:6px}
.robotWrap{display:flex;align-items:center;min-width:150px}
.robotRoom{width:100%;min-height:186px;border:1px solid #23314a;border-radius:16px;background:#09111d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.015);padding:12px;transition:.25s}
.robotRoom.active{border-color:#155e75;box-shadow:0 0 22px rgba(34,211,238,.08),inset 0 0 25px rgba(34,211,238,.03)}
.roomTitle{display:flex;gap:7px;align-items:center;font-weight:800;color:#cbd5e1;font-size:13px}
.roomLed{width:7px;height:7px;border-radius:50%;background:#334155}.roomLed.on{background:#22d3ee;box-shadow:0 0 10px #22d3ee}
.robotBody{display:flex;gap:11px;align-items:center;margin-top:20px}
.robot{width:54px;min-width:54px;position:relative;filter:grayscale(.45);opacity:.65}.robot.working{filter:none;opacity:1;animation:bob 1.8s ease-in-out infinite}
.antenna{height:11px;width:2px;background:#64748b;margin:auto;position:relative}.antenna i{position:absolute;width:6px;height:6px;border-radius:50%;background:#64748b;top:-4px;left:-2px}.working .antenna i{background:#34d399;box-shadow:0 0 9px #34d399}
.robotHead{height:39px;border:2px solid #475569;border-radius:10px;background:#111c2d;position:relative;display:flex;justify-content:center;align-items:center;color:#22d3ee}.robotHead>span{position:absolute;top:2px;font-size:10px;color:#64748b}.robotHead i{width:8px;height:8px;border-radius:50%;background:#64748b;margin:9px 4px 0}.working .robotHead i{background:#22d3ee;box-shadow:0 0 7px #22d3ee}
.robotTorso{width:42px;height:28px;border:2px solid #475569;border-top:0;border-radius:0 0 8px 8px;background:#0f172a;margin:auto;display:flex;align-items:center;justify-content:center}.robotTorso b{font-size:9px;color:#64748b}.working .robotTorso b{color:#34d399}
.robotText{min-width:0;display:flex;flex-direction:column;gap:5px}.robotText strong{font-size:13px;color:#e2e8f0}.robotText span{font-size:12px;color:#94a3b8;line-height:1.35}.robotText small{font-size:11px;color:#475569}
.pipe{width:12px;min-width:12px;height:3px;background:#1e293b;margin:0 -1px;display:flex;justify-content:space-around}.pipe i{width:3px;height:3px;border-radius:50%;background:#334155}.pipe.flow i{background:#22d3ee;animation:flow 1.1s infinite}.pipe.flow i:nth-child(2){animation-delay:.2s}.pipe.flow i:nth-child(3){animation-delay:.4s}

.controlGrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:16px}
.approval,.liveDesk{border:1px solid #1e293b;border-radius:16px;background:#07101b;overflow:hidden}
.subHead{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:13px 15px;border-bottom:1px solid #1e293b}.subHead b{font-size:16px}.subHead span{font-size:12px;color:#64748b}
.decisionList{max-height:540px;overflow:auto}.empty{padding:24px;color:#64748b;text-align:center}
.decision{padding:13px 15px;border-bottom:1px solid #111d2e}.decision:last-child{border-bottom:0}.decision.yes{background:linear-gradient(90deg,rgba(16,185,129,.05),transparent 45%)}.decision.no{background:linear-gradient(90deg,rgba(239,68,68,.035),transparent 45%)}
.decisionTop{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.decisionTop time{margin-right:auto;color:#64748b;font-size:12px;font-variant-numeric:tabular-nums}.decisionTop>span{font-size:12px;color:#94a3b8}.decisionTop .comp{color:#cbd5e1}
.decisionDot{width:8px;height:8px;border-radius:50%}.decisionDot.yes{background:#34d399;box-shadow:0 0 8px #34d399}.decisionDot.no{background:#f87171}
.approvedText{color:#34d399;margin:8px 16px 6px 0;font-size:13px}.rejectedText{color:#fca5a5;margin:8px 16px 4px 0;font-size:13px}
.chain{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-right:16px}.chain span{display:flex;align-items:center;gap:4px;font-size:11px;color:#94a3b8;background:#0d1726;border:1px solid #1f3349;border-radius:999px;padding:3px 7px}.chain span i{color:#34d399;font-style:normal}.chain span b{color:#334155}
.tiny{font-size:11px;color:#526074;margin:6px 16px 0 0}
.liveDesk{padding-bottom:5px}.deskRow{display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-bottom:1px dashed #1c293a}.deskRow span{color:#64748b}.deskRow b{font-size:13px;color:#dbeafe;text-align:left}.badText{color:#f87171!important}

@keyframes pulse{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes flow{0%{opacity:.15;transform:translateX(0)}50%{opacity:1}100%{opacity:.15;transform:translateX(-4px)}}

@media(max-width:900px){.pipeline{grid-template-columns:repeat(6,190px)}.controlGrid{grid-template-columns:1fr}.factoryHead{align-items:center}}
@media(max-width:640px){.ch{font-size:13px}.panel,.factory{padding:12px}.grid{grid-template-columns:1fr}.row{font-size:15px}.card h3{font-size:19px}.panel h2,.factory h2{font-size:20px}h1{font-size:22px}.factoryHead p{font-size:12px}.pipeline{grid-template-columns:repeat(6,175px);margin-left:-4px;margin-right:-4px}.decisionTop time{width:100%;margin:0}.chain{margin-right:0}.approvedText,.rejectedText,.tiny{margin-right:0}}
`
