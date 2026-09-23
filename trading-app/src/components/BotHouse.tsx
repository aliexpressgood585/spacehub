// ─── בית הבוט ────────────────────────────────────────────────────────────────
// A pixel-art house where every room is one real part of the server bot, and every
// resident shows ONLY what the bot actually did, read from its own tables:
//   bot_state (heartbeat, feed health, shields, halt, rotation clock), market_regime,
//   bot_trades, bot_skips, bot_equity, bot_trades_log, bot_errors, deployment_manifest.
// A resident works only when its table shows a fresh action; otherwise it sits and
// the room says what it is waiting for. Walking happens only on a real hand-off seen
// while the page is open (a rotation → the trader, a closed trade → the treasurer).
// Nothing here computes a signal of its own (see CLAUDE.md: the dashboard is a viewer).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPA_URL, SUPA_KEY } from '../supa'
import { TEAM_INTERVAL_MS } from '../../../shared/team-meeting'
import { SCALP } from '../../../shared/scalp'
import { AGENTS, NEW_AGENTS } from '../../../shared/agents'
import { SWARM, TEAMS, LEARN, learnedWeight, tStat, meanBps, decayStat, type Stat, type Team } from '../../../shared/swarm'
const CYCLE_LABEL = `${String(Math.floor(TEAM_INTERVAL_MS / 60_000)).padStart(2, '0')}:${String((TEAM_INTERVAL_MS / 1000) % 60).padStart(2, '0')}`

type Id = 'scout' | 'regime' | 'rota' | 'donch' | 'risk' | 'trader' | 'treasurer' | 'reporter' | 'auditor' | 'pm' | 'quant' | 'compliance' | 'execution' | 'rsi' | 'vwap' | 'breakout' | 'volume' | 'macd' | 'bollinger' | 'htf' | 'btclead' | 'candle' | 'funding' | 'trendDesk' | 'momDesk' | 'revDesk' | 'brkDesk' | 'flowDesk'
interface Minute { who: Id; says: string; vote: string; checked_at?: string; round?: number; to?: string; data?: Row }
interface Row { [k: string]: unknown }
interface Snap {
  at: number
  meetings: Row[]
  state: Row | null
  regime: Row | null
  equity: Row[]
  open: Row[]
  closed: Row[]
  skips: Row[]
  errors: Row[]
  daily: Row | null
  manifest: Row | null
  rotaBatches: number[]
  closedAll: Row[]
  curve: Row[]
  agentStats: Record<string, Stat>
}
interface Status { working: boolean; asleep?: boolean; alarm?: boolean; line: string; action?: string; at?: number; reviewed?: boolean }

const SHORT: Record<string, string> = { rota: 'אסטרטגיה', donch: 'אימות', reporter: 'יומן', auditor: 'מבקר', pm: 'מנהל תיק', quant: 'כמותי', compliance: 'ציות', execution: 'ביצוע' , ...Object.fromEntries(NEW_AGENTS.map((k) => [k, AGENTS[k].role]))}
const ROSTER: Record<Id, { name: string; role: string; color: string }> = {
  scout: { name: 'איתן', role: 'סורק נתונים', color: '#35e0ff' },
  regime: { name: 'נועה', role: 'חזאית השוק', color: '#c38bff' },
  rota: { name: 'דניאל', role: 'מנהל אסטרטגיה', color: '#00d492' },
  donch: { name: 'עומר', role: 'אימות כניסה', color: '#ffb454' },
  risk: { name: 'מיכל', role: 'שומרת הסיכונים', color: '#ff4d6a' },
  trader: { name: 'רוני', role: 'סוחר ביצוע', color: '#7fd0ff' },
  treasurer: { name: 'שירה', role: 'גזברית', color: '#ffd76a' },
  reporter: { name: 'יונתן', role: 'רושם היומן', color: '#9fd3ff' },
  auditor: { name: 'אבי', role: 'מבקר ביצועים', color: '#b8f28a' },
  pm: { name: 'תמר', role: 'מנהלת התיק', color: '#ffffff' },
  quant: { name: 'גיל', role: 'אנליסט כמותי', color: '#a0a8ff' },
  compliance: { name: 'הדס', role: 'קצינת ציות', color: '#ff9fce' },
  execution: { name: 'אלון', role: 'דסק ביצוע', color: '#5ff0b0' },
  rsi: { name: AGENTS.rsi.name, role: 'סוכן ' + AGENTS.rsi.role, color: '#ffd166' },
  vwap: { name: AGENTS.vwap.name, role: 'סוכן ' + AGENTS.vwap.role, color: '#06d6a0' },
  breakout: { name: AGENTS.breakout.name, role: 'סוכן ' + AGENTS.breakout.role, color: '#ef476f' },
  volume: { name: AGENTS.volume.name, role: 'סוכן ' + AGENTS.volume.role, color: '#118ab2' },
  macd: { name: AGENTS.macd.name, role: 'סוכן ' + AGENTS.macd.role, color: '#f78c6b' },
  bollinger: { name: AGENTS.bollinger.name, role: 'סוכן ' + AGENTS.bollinger.role, color: '#c77dff' },
  htf: { name: AGENTS.htf.name, role: 'סוכן ' + AGENTS.htf.role, color: '#80ed99' },
  btclead: { name: AGENTS.btclead.name, role: 'סוכן ' + AGENTS.btclead.role, color: '#f4a261' },
  candle: { name: AGENTS.candle.name, role: 'סוכן ' + AGENTS.candle.role, color: '#e9c46a' },
  trendDesk: { name: TEAMS.trend.name, role: 'ראש ' + TEAMS.trend.label + ' (10 סוכנים)', color: '#9ad0ff' },
  momDesk: { name: TEAMS.mom.name, role: 'ראש ' + TEAMS.mom.label + ' (10 סוכנים)', color: '#ffb3c7' },
  revDesk: { name: TEAMS.rev.name, role: 'ראש ' + TEAMS.rev.label + ' (10 סוכנים)', color: '#c3f584' },
  brkDesk: { name: TEAMS.brk.name, role: 'ראש ' + TEAMS.brk.label + ' (10 סוכנים)', color: '#ffd29a' },
  flowDesk: { name: TEAMS.flow.name, role: 'ראש ' + TEAMS.flow.label + ' (10 סוכנים)', color: '#b9a7ff' },
  funding: { name: AGENTS.funding.name, role: 'סוכן ' + AGENTS.funding.role, color: '#4cc9f0' },
}
const W = 480, H = 980, R = 2
// rooms: attic (reporter, donch) · upper floor (rota, regime, scout) · ground floor (treasurer, trader, risk)
const ROOM: Record<Id, { x0: number; y0: number; w: number; h: number; floor: number }> = {
  reporter: { x0: 100, y0: 48, w: 93, h: 62, floor: 108 },
  auditor: { x0: 194, y0: 48, w: 93, h: 62, floor: 108 },
  donch: { x0: 288, y0: 48, w: 93, h: 62, floor: 108 },
  rota: { x0: 8, y0: 116, w: 154, h: 138, floor: 250 },
  regime: { x0: 163, y0: 116, w: 154, h: 138, floor: 250 },
  scout: { x0: 318, y0: 116, w: 154, h: 138, floor: 250 },
  treasurer: { x0: 8, y0: 262, w: 154, h: 138, floor: 396 },
  trader: { x0: 163, y0: 262, w: 154, h: 138, floor: 396 },
  risk: { x0: 318, y0: 262, w: 154, h: 138, floor: 396 },
  // v72.0 basement trading floor: the desk that debates and rules
  execution: { x0: 8, y0: 414, w: 115, h: 136, floor: 544 },
  compliance: { x0: 124, y0: 414, w: 115, h: 136, floor: 544 },
  quant: { x0: 240, y0: 414, w: 115, h: 136, floor: 544 },
  pm: { x0: 356, y0: 414, w: 116, h: 136, floor: 544 },
  // v75.0 the swarm floor: five team leads, ten agents each
  trendDesk: { x0: 8, y0: 836, w: 92, h: 136, floor: 966 },
  momDesk: { x0: 101, y0: 836, w: 92, h: 136, floor: 966 },
  revDesk: { x0: 194, y0: 836, w: 92, h: 136, floor: 966 },
  brkDesk: { x0: 287, y0: 836, w: 92, h: 136, floor: 966 },
  flowDesk: { x0: 380, y0: 836, w: 92, h: 136, floor: 966 },
  // v73.0 two more basement floors: the signal analysts
  rsi: { x0: 8, y0: 556, w: 92, h: 134, floor: 686 },
  vwap: { x0: 101, y0: 556, w: 92, h: 134, floor: 686 },
  breakout: { x0: 194, y0: 556, w: 92, h: 134, floor: 686 },
  volume: { x0: 287, y0: 556, w: 92, h: 134, floor: 686 },
  macd: { x0: 380, y0: 556, w: 92, h: 134, floor: 686 },
  bollinger: { x0: 8, y0: 696, w: 92, h: 134, floor: 826 },
  htf: { x0: 101, y0: 696, w: 92, h: 134, floor: 826 },
  btclead: { x0: 194, y0: 696, w: 92, h: 134, floor: 826 },
  candle: { x0: 287, y0: 696, w: 92, h: 134, floor: 826 },
  funding: { x0: 380, y0: 696, w: 92, h: 134, floor: 826 },
}
const IDS = Object.keys(ROSTER) as Id[]
const LOOK: Record<Id, { skin: string; hair: string; shirt: string; pants: string; style: number; glasses: boolean }> = {
  trendDesk: { skin: '#f3c9a2', hair: '#161616', shirt: '#9ad0ff', pants: '#1d2433', style: 2, glasses: false },
  momDesk: { skin: '#b07448', hair: '#e0ad4a', shirt: '#ffb3c7', pants: '#1d2433', style: 3, glasses: true },
  revDesk: { skin: '#dca577', hair: '#6b3b1d', shirt: '#c3f584', pants: '#1d2433', style: 4, glasses: false },
  brkDesk: { skin: '#7d4b2c', hair: '#2b1d12', shirt: '#ffd29a', pants: '#1d2433', style: 0, glasses: true },
  flowDesk: { skin: '#c98d5e', hair: '#b8472c', shirt: '#b9a7ff', pants: '#1d2433', style: 1, glasses: false },
  scout: { skin: '#dca577', hair: '#2b1d12', shirt: '#3a7bd5', pants: '#2c3550', style: 0, glasses: true },
  regime: { skin: '#f3c9a2', hair: '#b8472c', shirt: '#8e5bd0', pants: '#23304a', style: 1, glasses: false },
  rota: { skin: '#b07448', hair: '#161616', shirt: '#48a868', pants: '#3d2c22', style: 2, glasses: false },
  donch: { skin: '#f7dcc2', hair: '#6b3b1d', shirt: '#f0b44c', pants: '#1f2a2a', style: 4, glasses: false },
  risk: { skin: '#c98d5e', hair: '#2b1d12', shirt: '#d64f4f', pants: '#4a4f5c', style: 1, glasses: true },
  trader: { skin: '#f3c9a2', hair: '#ece6d6', shirt: '#2fb3b3', pants: '#2c3550', style: 3, glasses: false },
  treasurer: { skin: '#7d4b2c', hair: '#161616', shirt: '#d64f8c', pants: '#23304a', style: 1, glasses: false },
  reporter: { skin: '#dca577', hair: '#e0ad4a', shirt: '#5ac8fa', pants: '#3d2c22', style: 0, glasses: true },
  auditor: { skin: '#b07448', hair: '#ece6d6', shirt: '#6aa36a', pants: '#2c3550', style: 4, glasses: true },
  pm: { skin: '#f3c9a2', hair: '#161616', shirt: '#1d2433', pants: '#1d2433', style: 1, glasses: false },
  quant: { skin: '#dca577', hair: '#6b3b1d', shirt: '#5a64d8', pants: '#2c3550', style: 0, glasses: true },
  compliance: { skin: '#c98d5e', hair: '#b8472c', shirt: '#d65fa0', pants: '#23304a', style: 1, glasses: true },
  execution: { skin: '#7d4b2c', hair: '#161616', shirt: '#2fb37a', pants: '#2c3550', style: 3, glasses: false },
  rsi: { skin: '#f3c9a2', hair: '#161616', shirt: '#ffd166', pants: '#23304a', style: 0, glasses: true },
  vwap: { skin: '#dca577', hair: '#e0ad4a', shirt: '#06d6a0', pants: '#23304a', style: 1, glasses: false },
  breakout: { skin: '#b07448', hair: '#6b3b1d', shirt: '#ef476f', pants: '#23304a', style: 2, glasses: false },
  volume: { skin: '#7d4b2c', hair: '#2b1d12', shirt: '#118ab2', pants: '#23304a', style: 3, glasses: true },
  macd: { skin: '#c98d5e', hair: '#b8472c', shirt: '#f78c6b', pants: '#23304a', style: 4, glasses: false },
  bollinger: { skin: '#f3c9a2', hair: '#161616', shirt: '#c77dff', pants: '#23304a', style: 0, glasses: false },
  htf: { skin: '#dca577', hair: '#e0ad4a', shirt: '#80ed99', pants: '#23304a', style: 1, glasses: true },
  btclead: { skin: '#b07448', hair: '#6b3b1d', shirt: '#f4a261', pants: '#23304a', style: 2, glasses: false },
  candle: { skin: '#7d4b2c', hair: '#2b1d12', shirt: '#e9c46a', pants: '#23304a', style: 3, glasses: false },
  funding: { skin: '#c98d5e', hair: '#b8472c', shirt: '#4cc9f0', pants: '#23304a', style: 4, glasses: true },
}

const num = (v: unknown) => (v == null ? NaN : Number(v))
const ts = (v: unknown) => (v ? new Date(String(v)).getTime() : 0)
const usd = (v: number) => (Number.isFinite(v) ? `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}` : '—')
const ago = (t: number, now: number) => {
  if (!t) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `לפני ${s} שנ׳`
  const m = Math.round(s / 60)
  if (m < 60) return `לפני ${m} דק׳`
  const h = Math.floor(m / 60)
  return h < 48 ? `לפני ${h} ש׳ ${m % 60 ? `ו-${m % 60} דק׳` : ''}`.trim() : `לפני ${Math.round(h / 24)} ימים`
}
const inMin = (t: number, now: number) => { const m = Math.max(0, Math.round((t - now) / 60000)); return m < 60 ? `${m} דק׳` : `${Math.floor(m / 60)} ש׳ ${m % 60} דק׳` }
const REGIME_HE: Record<string, string> = { TREND_UP: 'מגמה עולה', TREND_DOWN: 'מגמה יורדת', RANGING: 'ריינג׳ (דשדוש)', VOLATILE: 'תנודתי' }
const SKIP_HE: Record<string, string> = {
  heat_limit: 'מגבלת החשיפה הכוללת', per_coin_cap: 'תקרה למטבע', pyramid_gate: 'שער הפירמידה', adx_gate: 'שער ה-ADX',
  bar_lag_diagnostic: 'נר באיחור (בדיקה)', bad_tick: 'מחיר חשוד', min_notional: 'גודל מינימלי',
}
const SHIELD_HE: Record<string, string> = { rota_paused: 'ROTA מושהה', depeg_paused: 'דה-פג', donch_paused: 'DONCH4H מושהה', day_loss_paused: 'הפסד יומי' }

/** Everything each resident says is derived here, from the bot's own rows — nothing invented. */
function derive(s: Snap | null, now: number): Record<Id, Status> {
  const out = {} as Record<Id, Status>
  if (!s || !s.state) { for (const id of IDS) out[id] = { working: false, line: 'טוען נתונים מהבוט…' }; return out }
  const st = s.state
  const beat = ts(st.updated_at)
  const alive = now - beat < 3 * 60_000
  const feed = (st.feed_health ?? {}) as Record<string, { ok?: number; fail?: number } | string>
  const src = String(feed.source ?? '—')
  const srcs = ['binance', 'okx', 'bybit'].map((k) => { const f = feed[k] as { ok?: number; fail?: number } | undefined; return f && (f.ok || f.fail) ? `${k} ${f.ok ?? 0}✓${f.fail ? ` ${f.fail}✗` : ''}` : '' }).filter(Boolean).join(' · ')
  out.scout = alive
    ? { working: now - beat < 25_000, line: `הסבב האחרון ${ago(beat, now)} · מקור ${src}${srcs ? ` · ${srcs}` : ''}`, action: `משך מחירים ונרות ל-${s.manifest?.universe_size ?? 40} מטבעות (${srcs || src})`, at: beat }
    : { working: false, asleep: true, alarm: true, line: `אין דופק מהבוט ${ago(beat, now)} — הוא לא רץ כרגע` }

  const rg = s.regime
  if (rg) {
    const t = ts(rg.created_at)
    const line = `${REGIME_HE[String(rg.regime)] ?? rg.regime} · ADX ${num(rg.btc_adx).toFixed(1)} · ATR ${(num(rg.btc_atr_pct) * 100).toFixed(2)}% · ${ago(t, now)}`
    out.regime = { working: now - t < 90_000, line, action: `מדדה את BTC: ${line}`, at: t }
  } else out.regime = { working: false, line: 'אין מדידת משטר שוק' }

  const sleeves = String(s.manifest?.enabled_sleeves ?? '')
  const rotaOn = !sleeves || sleeves.includes('ROTA')
  const donchOn = !sleeves || sleeves.includes('DONCH')
  const rotaOpen = s.open.filter((t) => t.strategy === 'ROTA')
  const reb = ts(st.rebalanced_at)
  const batches = s.rotaBatches
  const period = batches.length >= 2 ? batches[0] - batches[1] : 0
  const next = reb && period > 3600_000 ? reb + period : 0
  const book = rotaOpen.map((t) => `${t.sym} ${t.side === 'LONG' ? '▲' : '▼'}`).join(' · ')
  out.rota = !rotaOn
    ? { working: false, asleep: true, line: 'כבוי בגרסה הזו' }
    : { working: now - reb < 10 * 60_000, line: `${rotaOpen.length} פוזיציות: ${book || '—'} · רוטציה אחרונה ${ago(reb, now)}${next ? ` · הבאה בעוד ~${inMin(next, now)}` : ''}`, action: `ביצע רוטציה: דירג את 40 המטבעות לפי מומנטום ובחר ${book}`, at: reb }
  const donchOpen = s.open.filter((t) => t.strategy === 'DONCH4H')
  out.donch = donchOn
    ? { working: false, line: `${donchOpen.length} פוזיציות פתוחות · סורק ב-15 הדקות הראשונות אחרי כל סגירת נר 4 שעות` }
    : { working: false, asleep: true, line: `ישן — האסטרטגיה כבויה בגרסה ${s.manifest?.bot_version ?? ''} (פועלת רק ${sleeves})` }

  const shields = (st.shields ?? {}) as Record<string, boolean>
  const on = Object.entries(shields).filter(([, v]) => v).map(([k]) => SHIELD_HE[k] ?? k)
  const eq = num(s.equity[0]?.equity), peak = num(st.peak_balance)
  const dd = Number.isFinite(eq) && peak > 0 ? Math.max(0, (peak - eq) / peak) : NaN
  const lastSkip = s.skips[0]
  const skipT = ts(lastSkip?.ts)
  const halt = st.hard_halt_at ? `עצירת חירום: ${st.hard_halt_reason ?? ''}` : ''
  out.risk = {
    working: now - skipT < 10 * 60_000,
    alarm: !!halt || on.length > 0,
    line: halt || `${on.length ? `מגנים פעילים: ${on.join(', ')}` : 'כל 4 המגנים כבויים'} · ירידה מהשיא ${Number.isFinite(dd) ? (dd * 100).toFixed(1) : '—'}% (עצירה ב-25%)${lastSkip ? ` · חסמה לאחרונה ${lastSkip.sym} (${SKIP_HE[String(lastSkip.reason)] ?? lastSkip.reason}) ${ago(skipT, now)}` : ''}`,
    action: lastSkip ? `חסמה ${lastSkip.sym} ${lastSkip.strategy ?? ''}: ${SKIP_HE[String(lastSkip.reason)] ?? lastSkip.reason}` : undefined,
    at: skipT,
  }

  // everything the trader did in the latest burst (a rotation closes and opens several legs within a minute)
  const events = [
    ...s.open.map((t) => ({ t: ts(t.opened_at), kind: 'open' as const, r: t })),
    ...s.closed.map((t) => ({ t: ts(t.closed_at), kind: 'close' as const, r: t })),
  ].sort((a, b) => b.t - a.t)
  const recent = events[0]?.t ?? 0
  const burst = events.filter((e) => recent - e.t < 2 * 60_000)
  const opened = burst.filter((e) => e.kind === 'open'), closed = burst.filter((e) => e.kind === 'close')
  const side = (r: Row) => (r.side === 'LONG' ? '▲' : '▼')
  const act = [
    closed.length ? `סגר ${closed.length}: ${closed.map((e) => `${e.r.sym}${side(e.r)} ${usd(num(e.r.pnl))}`).join(', ')}` : '',
    opened.length ? `פתח ${opened.length}: ${opened.map((e) => `${e.r.sym}${side(e.r)}`).join(', ')}` : '',
  ].filter(Boolean).join(' · ')
  out.trader = { working: now - recent < 10 * 60_000, line: act ? `${act} · ${ago(recent, now)}` : 'עוד לא ביצע עסקאות', action: act, at: recent }

  const e0 = s.equity[0]
  const tEq = ts(e0?.ts)
  out.treasurer = e0
    ? { working: now - tEq < 90_000, line: `הון ${usd(num(e0.equity))} · מזומן ${usd(num(e0.balance))} · חשיפה ${usd(num(e0.exposure))} · עודכן ${ago(tEq, now)}`, action: `עדכנה שווי תיק: ${usd(num(e0.equity))}`, at: tEq }
    : { working: false, line: 'אין עדיין רישום הון' }

  const d = s.daily
  const tD = ts(d?.created_at)
  const err = s.errors[0]
  out.reporter = err && now - ts(err.ts) < 15 * 60_000
    ? { working: true, alarm: true, line: `שגיאה בבוט (${err.scope ?? ''}) ${ago(ts(err.ts), now)}: ${String(err.message ?? '').slice(0, 80)}`, action: 'רשם שגיאה ביומן', at: ts(err.ts) }
    : d
      ? { working: now - tD < 10 * 60_000, line: `יומן ${d.date}: ${d.total_trades} עסקאות, ${d.wins} רווח / ${d.losses} הפסד, ${usd(num(d.profit))} · אין שגיאות`, action: `כתב את יומן היום: ${usd(num(d.profit))}`, at: tD }
      : { working: false, line: 'היומן היומי נכתב בחצות UTC' }
  // auditor: live results since the account reset (the tables hold only this account's history) vs the 50-trade checkpoint
  const ca = s.closedAll
  const wins = ca.filter((t) => num(t.pnl) > 0).length
  const net = ca.reduce((a, t) => a + (num(t.pnl) || 0), 0)
  let pk = 0, mdd = 0
  for (const c of [...s.curve].reverse()) { const e = num(c.equity); if (!Number.isFinite(e)) continue; pk = Math.max(pk, e); mdd = Math.max(mdd, pk > 0 ? (pk - e) / pk : 0) }
  const e0a = s.equity[0], expPct = e0a ? num(e0a.exposure) / num(e0a.equity) : NaN
  const lastC = ts(ca[0]?.closed_at)
  out.auditor = {
    working: now - lastC < 10 * 60_000,
    line: `${ca.length}/50 עסקאות עד נקודת הבדיקה · ${wins} ברווח (${ca.length ? Math.round((wins / ca.length) * 100) : 0}%) · נטו ${usd(net)} · ירידה מקסימלית ${(mdd * 100).toFixed(1)}% מתוך 25% · חשיפה ${Number.isFinite(expPct) ? Math.round(expPct * 100) : '—'}% מההון${ca.length < 50 ? ' · מדגם קטן מדי להסקת מסקנות' : ''}`,
    action: `עדכן את הביקורת: ${ca.length}/50 עסקאות, נטו ${usd(net)}`,
    at: lastC,
  }
  if (sleeves.includes('SCALP')) {
    out.rota = { working:false, line:'מומנטום 3 דקות על 8 חוזים; מצביע לונג/שורט בכל ישיבה.' }
    out.donch = { working:false, line:'מסמן אזורי liquidity sweep משוערים (שיא/שפל 20 דקות) ומצביע כשיש סחיפה וחזרה.' }
    const bp = (st.bot_params ?? {}) as Row
    out.risk = { working:false, alarm:!!bp.scalp_paused, line:`${bp.scalp_paused ? 'כניסות מושהות' : 'פיקוח פעיל'} · הפסד יומי 5% / ירידה 15% · חדשות וליקווידציות רק עם מקור, זמן ואימות מחיר · דמו 1x` }
    out.auditor = {working:false,line:'האסטרטגיה החדשה ניסיונית; נתוני ROTA קודמים אינם הוכחה לביצועיה.'}
  }
  const scalpOn = sleeves.includes('SCALP')
  out.pm = { working: false, asleep: !scalpOn, line: scalpOn ? 'מכריעה בסוף כל ישיבה לפי כלל הרוב; לא מוסיפה אות משלה.' : 'פעילה רק במסחר הסקאלפ' }
  out.quant = { working: false, asleep: !scalpOn, line: 'מודד מי מהסוכנים צדק בעסקאות שנסגרו.' }
  out.compliance = { working: false, asleep: !scalpOn, line: `בודקת כל תוכנית: דמו 1x, עד ${SCALP.maxPositions} פוזיציות, עד 25% למטבע.` }
  out.execution = { working: false, asleep: !scalpOn, line: 'מודד מרווחים, זמני החזקה וסיבות יציאה.' }
  for (const t of Object.keys(TEAMS) as Team[]) out[TEAMS[t].lead as Id] = { working: false, asleep: !scalpOn, line: `${TEAMS[t].label}: 10 סוכנים מצביעים כל דקה; כל אחד נבחן מול 5 הדקות הבאות ומשקלו מתעדכן לבד.` }
  for (const k of NEW_AGENTS as Id[]) out[k] = { working: false, asleep: !scalpOn, line: `סוכן ${AGENTS[k].role}: מצביע לונג/שורט על כל מטבע בכל ישיבה. המשקל שלו נקבע לפי הרקורד.` }
  const meeting = s.meetings[0]
  const meetingAt = ts(meeting?.ts)
  const minutes = (Array.isArray(meeting?.minutes) ? meeting.minutes : []) as Minute[]
  if (alive && meetingAt && now - meetingAt < TEAM_INTERVAL_MS + 90_000) {
    for (const m of minutes) {
      if (!out[m.who] || !m.checked_at) continue
      out[m.who] = { ...out[m.who], asleep: false, reviewed: true, alarm: out[m.who].alarm || m.vote === 'derisk', working: now - meetingAt < 30_000, line: `${m.says} · נבדק ${ago(meetingAt, now)}`, action: m.says, at: meetingAt }
    }
  }
  if (!alive) for (const id of IDS) if (id !== 'scout') out[id] = { ...out[id], working: false }
  return out
}

/* ─────────────────────────────── drawing ─────────────────────────────── */
interface Person { id: Id; x: number; y: number; face: 1 | -1; path: { x: number; y: number; hold?: number }[]; until: number; carry: string | null }
const home = (id: Id) => ({ x: ROOM[id].x0 + ROOM[id].w / 2 - 20, y: ROOM[id].floor })

export default function BotHouse({ onBack }: { onBack?: () => void }) {
  const [snap, setSnap] = useState<Snap | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [sel, setSel] = useState<Id | null>(null)
  const [replay, setReplay] = useState<{ id: unknown; start: number } | null>(null)
  const [fast, setFast] = useState(Date.now())
  const [ticks, setTicks] = useState<Record<string, Tick>>({})
  const mins = ((snap?.meetings?.[0]?.minutes ?? []) as Minute[])
  const shown = replay ? Math.max(0, Math.min(mins.length, Math.floor((fast - replay.start) / STEP_MS) + 1)) : mins.length
  const replaying = !!replay && fast - replay.start < mins.length * STEP_MS + 2500
  const speaker = replaying && shown > 0 ? mins[shown - 1] : null
  const speakRef = useRef<Id | null>(null); speakRef.current = speaker?.who ?? null
  useEffect(() => { if (!replaying) return; const iv = setInterval(() => setFast(Date.now()), 250); return () => clearInterval(iv) }, [replaying, replay])
  useEffect(() => { if (replay) setFast(Date.now()) }, [replay])
  // live marks for the scalp universe from OKX public swap tickers (display only)
  useEffect(() => {
    let alive = true
    const pull = async () => {
      try {
        const r = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP')
        const j = await r.json()
        if (!alive || j.code !== '0') return
        setTicks((old) => {
          const nx: Record<string, Tick> = {}
          for (const x of j.data as { instId: string; last: string; sodUtc0: string; ts: string }[]) {
            const m = /^([A-Z]+)-USDT-SWAP$/.exec(x.instId); if (!m || !UNIVERSE.includes(m[1])) continue
            const px = Number(x.last), o = Number(x.sodUtc0)
            nx[m[1]] = { px, chg: o > 0 ? px / o - 1 : NaN, dir: old[m[1]] ? Math.sign(px - old[m[1]].px) || old[m[1]].dir : 0, t: Number(x.ts) }
          }
          return nx
        })
      } catch { /* shown as missing, never invented */ }
    }
    void pull(); const iv = setInterval(pull, 4000)
    return () => { alive = false; clearInterval(iv) }
  }, [])
  const cvRef = useRef<HTMLCanvasElement>(null)
  const status = useMemo(() => derive(snap, now), [snap, now])
  const statusRef = useRef(status); statusRef.current = status
  const snapRef = useRef(snap); snapRef.current = snap
  const selRef = useRef(sel); selRef.current = sel
  const people = useRef<Record<Id, Person>>(Object.fromEntries(IDS.map((id) => [id, { id, ...home(id), face: 1, path: [], until: 0, carry: null }])) as Record<Id, Person>)
  const prev = useRef<{ reb: number; closeId: unknown; skipId: unknown; meeting: unknown } | null>(null)

  // poll the bot's tables
  useEffect(() => {
    const supa = createClient(SUPA_URL, SUPA_KEY)
    let alive = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const [st, rg, eq, op, cl, sk, er, dl, mf, rb, ca, cv, mt, ag] = await Promise.all([
          supa.from('bot_state').select('*').eq('id', 1).maybeSingle(),
          supa.from('market_regime').select('*').order('created_at', { ascending: false }).limit(1),
          supa.from('bot_equity').select('*').order('ts', { ascending: false }).limit(2),
          supa.from('bot_trades').select('*').eq('status', 'OPEN'),
          supa.from('bot_trades').select('*').neq('status', 'OPEN').order('closed_at', { ascending: false }).limit(8),
          supa.from('bot_skips').select('*').order('ts', { ascending: false }).limit(5),
          supa.from('bot_errors').select('*').order('ts', { ascending: false }).limit(5),
          supa.from('bot_trades_log').select('*').order('created_at', { ascending: false }).limit(1),
          supa.from('deployment_manifest').select('*').order('first_seen', { ascending: false }).limit(1),
          supa.from('bot_trades').select('opened_at').eq('strategy', 'ROTA').order('opened_at', { ascending: false }).limit(60),
          supa.from('bot_trades').select('pnl,closed_at,strategy').neq('status', 'OPEN').order('closed_at', { ascending: false }).limit(500),
          supa.from('bot_equity').select('equity,ts').order('ts', { ascending: false }).limit(2000),
          supa.from('team_meetings').select('*').order('ts', { ascending: false }).limit(12),
          supa.from('agent_stats').select('*'),
        ])
        const firstErr = [st, rg, eq, op, cl, sk, er, dl, mf, rb, ca, cv, mt].find((r) => r.error)?.error
        if (firstErr) throw new Error(firstErr.message)
        // distinct rotation batches (all legs of one rotation open within a minute)
        const batches: number[] = []
        for (const r of (rb.data ?? []) as Row[]) { const t = ts(r.opened_at); if (!batches.length || batches[batches.length - 1] - t > 10 * 60_000) batches.push(t) }
        if (!alive) return
        setSnap({ at: Date.now(), meetings: (mt.data ?? []) as Row[], state: (st.data as Row) ?? null, regime: (rg.data?.[0] as Row) ?? null, equity: (eq.data ?? []) as Row[], open: (op.data ?? []) as Row[], closed: (cl.data ?? []) as Row[], skips: (sk.data ?? []) as Row[], errors: (er.data ?? []) as Row[], daily: (dl.data?.[0] as Row) ?? null, manifest: (mf.data?.[0] as Row) ?? null, rotaBatches: batches, closedAll: (ca.data ?? []) as Row[], curve: (cv.data ?? []) as Row[], agentStats: Object.fromEntries(((ag.data ?? []) as Row[]).map((r) => [String(r.agent), decayStat({ agent: String(r.agent), n: num(r.n), s: num(r.s), s2: num(r.s2), updated_at: String(r.updated_at) }, String(r.agent), Date.now())])) })
        setErr(null)
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : String(e)) } finally { loading = false }
    }
    void load()
    const ch = supa.channel('house-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_meetings' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_trades' }, () => void load())
      .subscribe()
    const iv = setInterval(load, 15_000)
    const tick = setInterval(() => setNow(Date.now()), 5_000)
    return () => { alive = false; clearInterval(iv); clearInterval(tick); void supa.removeChannel(ch) }
  }, [])

  // hand-offs: only when a new real event appears while the page is open
  useEffect(() => {
    if (!snap?.state) return
    const reb = ts(snap.state.rebalanced_at), closeId = snap.closed[0]?.id, skipId = snap.skips[0]?.id
    const p = prev.current
    const meeting = snap.meetings[0]?.id ?? snap.meetings[0]?.ts
    prev.current = { reb, closeId, skipId, meeting }
    if (!p) { if (meeting) setReplay({ id: meeting, start: Date.now() }); return }
    const walk = (from: Id, to: Id, carry: string) => {
      const P = people.current[from], A = ROOM[from], B = ROOM[to]
      if (P.path.length) return
      const pts: Person['path'] = []
      // two staircases: attic/upper↔ground at x=160, ground↔basement at x=124
      const FLOORS = [108, 250, 396, 544, 686, 826, 966]
      const route = (f0: number, f1: number) => {
        const out: Person['path'] = []
        let i = FLOORS.indexOf(f0); const j = FLOORS.indexOf(f1)
        if (i < 0 || j < 0) return out
        while (i !== j) {
          const ni = i + Math.sign(j - i), a = FLOORS[i], b = FLOORS[ni], lo = Math.max(a, b)
          const sx = lo <= 250 ? 160 : lo <= 396 ? 160 : lo <= 544 ? 124 : 100
          out.push({ x: sx, y: a }, { x: sx, y: b }); i = ni
        }
        return out
      }
      pts.push(...route(A.floor, B.floor))
      pts.push({ x: B.x0 + B.w / 2 + (B.x0 < A.x0 ? 26 : -46), y: B.floor, hold: 2400 })
      pts.push(...route(B.floor, A.floor))
      pts.push(home(from))
      P.carry = carry; P.path = pts
    }
    if (meeting && meeting !== p.meeting) {
      setReplay({ id: meeting, start: Date.now() })
      // round-2 speakers (dissenters + quant) walk to the PM's desk with their case
      const mins = (snap.meetings[0]?.minutes ?? []) as Minute[]
      for (const w of new Set(mins.filter((m) => m.round === 2 && m.who !== 'pm').map((m) => m.who))) if (ROOM[w]) walk(w, 'pm', 'orders')
      // A short desk-to-board review only after a persisted server review arrives.
      for (const id of IDS) {
        const P = people.current[id], r = ROOM[id]
        if (P.path.length) continue
        P.carry = 'orders'
        P.path = [{ x: r.x0 + 18, y: r.floor, hold: 1800 }, home(id)]
      }
    }
    if (reb && reb !== p.reb) walk('rota', 'trader', 'orders')
    if (closeId && closeId !== p.closeId) walk('trader', 'treasurer', Number(snap.closed[0]?.pnl) >= 0 ? 'good' : 'bad')
  }, [snap])

  // canvas loop
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    cv.width = W * R; cv.height = H * R
    const ctx = cv.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }
    let raf = 0, last = performance.now(), T = 0
    const drawHouse = (t: number) => {
      const s = snapRef.current, st = statusRef.current
      const dead = st.scout?.alarm && st.scout?.asleep
      const hour = new Date().getUTCHours() + 3 // Israel (approx.) for the sky only
      const night = (hour % 24) < 6 || (hour % 24) >= 19
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, night ? '#060a1d' : '#6fb7ff'); g.addColorStop(1, night ? '#1a2346' : '#c4e6ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      if (night) for (let i = 0; i < 40; i++) px((i * 97) % W, (i * 53) % 90, 1, 1, '#c9d3ff')
      px(0, 404, W, H - 404, '#2b1f16'); for (let i = 0; i < 60; i++) px((i * 71) % W, 410 + ((i * 37) % 146), 2, 2, '#3a2a1d')
      px(0, 400, W, 8, night ? '#1b3620' : '#3f8f3e'); px(0, 400, W, 3, night ? '#264d2c' : '#5bb452')
      // roof + chimney smoke = the bot's heartbeat
      ctx.fillStyle = night ? '#431f1f' : '#8e3b2e'; ctx.beginPath(); ctx.moveTo(0, 118); ctx.lineTo(240, 20); ctx.lineTo(480, 118); ctx.closePath(); ctx.fill()
      px(372, 40, 16, 40, '#6c6c74'); px(369, 37, 22, 5, '#55555c')
      if (!dead && !reduced) for (let i = 0; i < 4; i++) { const k = (t * 0.25 + i / 4) % 1; px(376 + k * 16, 32 - k * 26, 7, 5, `rgba(225,225,235,${0.55 - k * 0.55})`) }
      // antenna on the roof blinks on each real scan
      px(420, 58, 2, 30, '#8a8f98'); px(414, 56, 14, 2, '#8a8f98')
      if (st.scout?.working && !reduced && Math.floor(t * 4) % 2) px(419, 52, 4, 4, '#35e0ff')
      px(0, 112, W, 292, '#2a2118'); px(0, 410, W, H - 414, '#1a130d')
      for (const id of IDS) {
        const r = ROOM[id], a = st[id]
        const lit = !dead && !a?.asleep
        const wall = ({ auditor: '#24382a', reporter: '#3a3222', donch: '#2f2a44', rota: '#1f3a2c', regime: '#2f2a44', scout: '#26324a', treasurer: '#3a2630', trader: '#1f3440', risk: '#3a2222', pm: '#20242f', quant: '#232648', compliance: '#3a2436', execution: '#163a30', trendDesk: '#16304a', momDesk: '#3a1f33', revDesk: '#23361f', brkDesk: '#3a2d18', flowDesk: '#26204a' } as Record<string, string>)[id] ?? '#1c2538'
        px(r.x0, r.y0, r.w, r.h, lit ? wall : '#141821')
        px(r.x0, r.floor, r.w, 6, '#5a3d27'); for (let x = r.x0; x < r.x0 + r.w; x += 14) px(x, r.floor, 1, 6, 'rgba(0,0,0,0.3)')
        // desk + chair
        const dx = r.x0 + r.w / 2 - 6
        if (id !== 'donch') { px(dx - 4, r.floor - 26, 52, 4, '#9b7650'); px(dx - 2, r.floor - 22, 3, 22, '#6d4a2d'); px(dx + 43, r.floor - 22, 3, 22, '#6d4a2d'); px(dx - 34, r.floor - 14, 14, 4, '#34507a'); px(dx - 32, r.floor - 34, 3, 22, '#2a3b58') }
        const k = Math.floor(t * 4)
        if (id === 'scout') {
          const f = (s?.state?.feed_health ?? {}) as Record<string, { ok?: number; fail?: number }>
          ;['binance', 'okx', 'bybit'].forEach((src, i) => {
            const mx = dx + 2 + i * 15; px(mx, r.floor - 44, 13, 14, '#0e1320')
            const ok = f[src]?.ok ?? 0, bad = f[src]?.fail ?? 0
            const hgt = Math.min(10, Math.round(Math.log2(1 + ok) * 1.5))
            if (hgt) px(mx + 2, r.floor - 32 - hgt, 4, hgt, a?.working && !reduced && (k + i) % 2 ? '#35e0ff' : '#1f8fa8')
            if (bad) px(mx + 7, r.floor - 36, 4, 4, '#ff4d6a')
          })
        }
        if (id === 'regime') {
          px(r.x0 + 10, r.y0 + 14, 70, 44, '#eef1f5'); px(r.x0 + 8, r.y0 + 12, 74, 3, '#8a8f98')
          const reg = String(s?.regime?.regime ?? '')
          const col = reg === 'TREND_UP' ? '#148a50' : reg === 'TREND_DOWN' ? '#c23a3a' : reg === 'VOLATILE' ? '#a86400' : '#1f6fcc'
          const adx = Math.min(1, num(s?.regime?.btc_adx) / 50)
          px(r.x0 + 14, r.y0 + 20, 60, 6, '#d9dee6'); px(r.x0 + 14, r.y0 + 20, Math.max(2, Math.round(60 * (Number.isFinite(adx) ? adx : 0))), 6, col)
          for (let i = 0; i < 12; i++) px(r.x0 + 16 + i * 5, r.y0 + 44 - (reg === 'TREND_UP' ? i * 1.2 : reg === 'TREND_DOWN' ? -i * 1.2 + 10 : (i % 3) * 2), 3, 2, col)
        }
        if (id === 'rota') {
          px(r.x0 + 10, r.y0 + 12, 64, 50, '#f6f6f2'); px(r.x0 + 8, r.y0 + 10, 68, 3, '#8a8f98')
          const legs = (s?.open ?? []).filter((x) => x.strategy === 'ROTA').slice(0, 8)
          legs.forEach((l, i) => { const y = r.y0 + 17 + i * 5.5; const long = l.side === 'LONG'; px(r.x0 + 14, y, 4, 4, long ? '#148a50' : '#c23a3a'); px(r.x0 + 21, y + 1, Math.min(48, 10 + Math.abs(num(l.size) * num(l.entry_price)) / 60), 2, long ? '#7fd3a8' : '#f0a0a0') })
        }
        if (id === 'donch') { px(r.x0 + 20, r.floor - 12, 44, 10, '#7a5534'); px(r.x0 + 22, r.floor - 18, 40, 7, '#e9e4d6'); px(r.x0 + 22, r.floor - 18, 10, 7, '#ffffff') }
        if (id === 'auditor') {
          px(r.x0 + 10, r.y0 + 10, 26, 30, '#a67b4b'); px(r.x0 + 12, r.y0 + 13, 22, 25, '#fffaf0')
          const n = (s?.closedAll ?? []).length
          px(r.x0 + 14, r.y0 + 32, 18, 3, '#d9dee6'); px(r.x0 + 14, r.y0 + 32, Math.max(1, Math.round(18 * Math.min(1, n / 50))), 3, '#148a50')
          for (let i = 0; i < 3; i++) px(r.x0 + 14, r.y0 + 17 + i * 4, 14 - i * 3, 2, '#8a8f98')
        }
        if (id === 'reporter') { px(r.x0 + 12, r.y0 + 10, 30, 22, '#fffaf0'); px(r.x0 + 12, r.y0 + 10, 30, 4, '#c23a3a'); const d = s?.daily; if (d) { for (let i = 0; i < Math.min(6, num(d.wins)); i++) px(r.x0 + 15 + i * 4, r.y0 + 18, 3, 3, '#148a50'); for (let i = 0; i < Math.min(6, num(d.losses)); i++) px(r.x0 + 15 + i * 4, r.y0 + 24, 3, 3, '#c23a3a') } }
        if (id === 'risk') {
          const sh = (s?.state?.shields ?? {}) as Record<string, boolean>
          Object.keys(SHIELD_HE).forEach((key, i) => { px(r.x0 + 12 + i * 14, r.y0 + 14, 10, 10, '#1b2230'); px(r.x0 + 14 + i * 14, r.y0 + 16, 6, 6, sh[key] ? (Math.floor(t * 3) % 2 || reduced ? '#ff4d6a' : '#7a1a28') : '#00d492') })
          const eq = num(s?.equity?.[0]?.equity), peak = num(s?.state?.peak_balance)
          const dd = Number.isFinite(eq) && peak > 0 ? Math.max(0, (peak - eq) / peak) : 0
          px(r.x0 + 12, r.y0 + 32, 60, 5, '#1b2230'); px(r.x0 + 12, r.y0 + 32, Math.round(60 * Math.min(1, dd / 0.25)), 5, dd > 0.15 ? '#ff4d6a' : '#ffb454'); px(r.x0 + 71, r.y0 + 30, 1, 9, '#ff4d6a')
          if (s?.state?.hard_halt_at && !reduced && Math.floor(t * 2) % 2) { ctx.fillStyle = 'rgba(255,40,60,0.18)'; ctx.fillRect(r.x0, r.y0, r.w, r.h) }
        }
        if (id === 'trader') { px(dx + 4, r.floor - 44, 30, 16, '#0e1320'); px(dx + 6, r.floor - 42, 26, 12, a?.working && !reduced && k % 2 ? '#0f3a26' : '#101a2a'); const n = (s?.open ?? []).length; for (let i = 0; i < Math.min(10, n); i++) px(r.x0 + 12 + (i % 5) * 9, r.y0 + 14 + Math.floor(i / 5) * 9, 6, 6, '#00d492') }
        if (id === 'treasurer') {
          px(r.x0 + 12, r.floor - 44, 32, 44, '#4a4f5c'); px(r.x0 + 14, r.floor - 42, 28, 40, '#6c7280'); px(r.x0 + 26, r.floor - 26, 5, 5, '#c9d1de')
          const e0 = s?.equity?.[0]; const eq = num(e0?.equity), exp = num(e0?.exposure)
          const coins = Number.isFinite(eq) ? Math.max(1, Math.min(10, Math.round(eq / 1000))) : 0
          for (let i = 0; i < coins; i++) px(dx + 28, r.floor - 28 - i * 2, 10, 2, i % 2 ? '#f0b44c' : '#d4a03a')
          if (Number.isFinite(exp) && eq > 0) { px(r.x0 + 60, r.y0 + 14, 60, 5, '#1b2230'); px(r.x0 + 60, r.y0 + 14, Math.round(60 * Math.min(1, exp / eq)), 5, '#35e0ff') }
        }
        const mins = ((s?.meetings?.[0]?.minutes ?? []) as Minute[])
        if (id === 'pm') {
          // three monitors: equity curve from bot_equity
          for (let i = 0; i < 3; i++) { px(r.x0 + 8 + i * 34, r.y0 + 14, 32, 22, '#0b0f18'); px(r.x0 + 9 + i * 34, r.y0 + 15, 30, 20, '#0f1a2a') }
          const cv = (s?.curve ?? []).slice(0, 200).map((c) => num(c.equity)).filter(Number.isFinite).reverse()
          if (cv.length > 2) { const lo = Math.min(...cv), hi = Math.max(...cv), rg = Math.max(hi - lo, 1e-9); const up = cv[cv.length - 1] >= cv[0]; for (let i = 0; i < 96; i++) { const v = cv[Math.floor((i / 96) * (cv.length - 1))]; px(r.x0 + 10 + i, r.y0 + 33 - ((v - lo) / rg) * 16, 1, 1, up ? '#00d492' : '#ff4d6a') } }
          const dec = mins.find((m) => m.who === 'pm')
          px(r.x0 + 40, r.y0 + 44, 36, 8, dec?.vote === 'long' ? '#0f5a3a' : dec?.vote === 'short' ? '#6a3a0a' : dec?.vote === 'veto' ? '#6a1020' : '#2a3040')
        }
        if (id === 'quant') {
          px(r.x0 + 8, r.y0 + 12, 70, 44, '#eef1f5'); px(r.x0 + 6, r.y0 + 10, 74, 3, '#8a8f98')
          const hit = ((mins.find((m) => m.who === 'quant')?.data as Row | undefined)?.hit ?? {}) as Record<string, number | null>
          ;['regime', 'rota', 'donch', 'trader', 'risk', ...NEW_AGENTS].forEach((k, i) => { const v = hit[k]; const h = v == null ? 2 : Math.max(2, Math.round((v / 100) * 34)); px(r.x0 + 11 + i * 4.3, r.y0 + 52 - h, 3, h, v == null ? '#c9d1de' : v >= 50 ? '#148a50' : '#c23a3a') })
          px(r.x0 + 12, r.y0 + 35, 62, 1, '#8a8f98')
        }
        if (id === 'compliance') {
          px(r.x0 + 10, r.y0 + 12, 36, 44, '#fffaf0'); px(r.x0 + 10, r.y0 + 12, 36, 4, '#d65fa0')
          const c = mins.find((m) => m.who === 'compliance'); const bad = c?.vote === 'veto'
          for (let i = 0; i < 5; i++) { px(r.x0 + 14, r.y0 + 20 + i * 7, 4, 4, bad && i === 0 ? '#c23a3a' : '#148a50'); px(r.x0 + 21, r.y0 + 21 + i * 7, 20 - (i % 2) * 6, 2, '#8a8f98') }
        }
        if (id === 'execution') {
          for (let i = 0; i < 2; i++) { px(r.x0 + 10 + i * 42, r.y0 + 14, 38, 26, '#0b0f18'); px(r.x0 + 11 + i * 42, r.y0 + 15, 36, 24, '#0c1f18') }
          const recent = [...(s?.open ?? []), ...(s?.closed ?? [])].slice(0, 12)
          recent.forEach((tr, i) => { const good = tr.status === 'OPEN' ? tr.side === 'LONG' : num(tr.pnl) > 0; px(r.x0 + 13 + (i % 6) * 13, r.y0 + 18 + Math.floor(i / 6) * 10, 9, 3, good ? '#00d492' : '#ff4d6a') })
          if (a?.working && !reduced && k % 2) px(r.x0 + 10, r.y0 + 42, 80, 2, '#5ff0b0')
        }
        const teamKey = (Object.keys(TEAMS) as Team[]).find((t) => TEAMS[t].lead === id)
        if (teamKey) {
          px(r.x0 + 8, r.y0 + 12, 76, 40, '#0b0f18')
          SWARM.filter((a) => a.team === teamKey).forEach((a, i) => {
            const st = s?.agentStats?.[a.id], w = learnedWeight(st), learning = !st || st.n < LEARN.minN
            px(r.x0 + 12 + (i % 5) * 14, r.y0 + 16 + Math.floor(i / 5) * 16, 10, 10, learning ? '#56607a' : w === 0 ? '#5a1a24' : w > 1.2 ? '#00d492' : '#2a6f5a')
            if (!learning && w > 0) px(r.x0 + 12 + (i % 5) * 14, r.y0 + 26 + Math.floor(i / 5) * 16 - Math.round(8 * Math.min(1, w / 2.5)), 10, 1, '#f0b44c')
          })
        }
        if ((NEW_AGENTS as string[]).includes(id)) {
          const mv = mins.find((m) => m.who === id)
          const col = mv?.vote === 'long' ? '#00d492' : mv?.vote === 'short' ? '#ff4d6a' : '#56607a'
          px(r.x0 + 10, r.y0 + 14, 44, 30, '#0b0f18'); px(r.x0 + 11, r.y0 + 15, 42, 28, '#0f1a2a')
          const cx = r.x0 + 32, cy = r.y0 + 29
          if (mv?.vote === 'long') for (let i = 0; i < 6; i++) px(cx - i, cy - 6 + i, 1 + i * 2, 1, col)
          else if (mv?.vote === 'short') for (let i = 0; i < 6; i++) px(cx - i, cy + 6 - i, 1 + i * 2, 1, col)
          else px(cx - 6, cy, 12, 2, col)
          const wt = num(((mins.find((m) => m.who === 'quant')?.data as Row | undefined)?.weights as Row | undefined)?.[id])
          px(r.x0 + 58, r.y0 + 14, 5, 30, '#1b2230'); const wh = Math.round(30 * Math.min(1, (Number.isFinite(wt) ? wt : 1) / 2)); px(r.x0 + 58, r.y0 + 44 - wh, 5, wh, '#f0b44c')
        }
        // room lamp: green = acted just now, grey = waiting, red = alarm
        px(r.x0 + r.w - 10, r.y0 + 4, 5, 5, a?.alarm ? '#ff4d6a' : a?.working ? '#00d492' : '#56607a')
      }
      // stairs between the floors (drawn inside the upper-left wall)
      for (let i = 0; i < 9; i++) px(150 + i * 1.5, 256 + i * 15.5, 12, 3, '#6b4a2c')
      for (let i = 0; i < 9; i++) px(118 + i * 1.5, 404 + i * 15.5, 10, 3, '#6b4a2c')
      for (let f = 0; f < 3; f++) for (let i = 0; i < 9; i++) px(96 + i * 1.2, 548 + f * 140 + i * 15, 8, 3, '#6b4a2c')
      if (dead) { ctx.fillStyle = 'rgba(4,7,14,0.35)'; ctx.fillRect(0, 112, W, H - 112) }
    }
    const drawPerson = (p: Person, t: number) => {
      const L = LOOK[p.id], st = statusRef.current[p.id]
      const x = Math.round(p.x), y = Math.round(p.y), f = p.face, PS = 1.7
      ctx.setTransform(R * PS, 0, 0, R * PS, -x * R * (PS - 1), -y * R * (PS - 1))
      const P = (dx: number, dy: number, w: number, h: number, c: string) => px(f > 0 ? x + dx : x - dx - w, y + dy, w, h, c)
      const walking = p.path.length > 0 && p.until < Date.now()
      const tick = reduced ? 0 : t
      if (st?.asleep && !walking) {
        px(x - 8, y - 16, 8, 6, L.skin); px(x - 8, y - 17, 8, 2, L.hair); px(x, y - 15, 16, 6, L.shirt); px(x, y - 15, 16, 2, '#f4f0e4')
        if (!reduced) { const z = Math.floor(t) % 3; for (let i = 0; i <= z; i++) px(x + 2 + i * 5, y - 22 - i * 5, 3, 1, '#fff') }
      } else {
        const sit = !walking && !p.path.length
        const wf = walking ? Math.floor(tick * 8) % 4 : 0
        px(x - 6, y - 1, 12, 2, 'rgba(0,0,0,0.3)')
        if (sit) { P(-3, -8, 9, 3, L.pants); P(4, -8, 3, 8, L.pants) } else { const a = wf === 1 ? 2 : wf === 3 ? -2 : 0; P(-3 + a, -6, 3, 6, L.pants); P(1 - a, -6, 3, 6, L.pants) }
        const top = sit ? -22 : -21 + (wf % 2 ? -1 : 0)
        const lean = sit && !st?.working ? -1 : 0
        P(-4 + lean, top + 8, 9, 8, L.shirt); P(-4 + lean, top, 8, 8, L.skin)
        if (L.style === 0) { P(-4 + lean, top - 1, 8, 3, L.hair); P(-4 + lean, top + 2, 2, 3, L.hair) }
        else if (L.style === 1) { P(-5 + lean, top - 1, 10, 3, L.hair); P(-5 + lean, top + 2, 3, 8, L.hair) }
        else if (L.style === 2) { P(-4 + lean, top - 1, 8, 3, L.hair); P(-2 + lean, top - 4, 4, 3, L.hair) }
        else if (L.style === 3) { P(-4 + lean, top - 2, 8, 3, '#34507a') }
        else P(-4 + lean, top, 8, 2, L.hair)
        P(2 + lean, top + 3, 1, 1, '#111'); if (L.glasses) P(0 + lean, top + 3, 4, 1, '#111')
        const k = Math.floor(tick * 10) % 2
        if (st?.working && sit) { P(4, top + 10, 5, 2, L.shirt); P(9, top + 10 + k, 2, 2, L.skin) } else if (sit) { P(-5, top + 2, 2, 8, L.shirt) } else { P(4, top + 9, 2, 7, L.shirt) }
        if (p.carry) { P(5, top + 8, 7, 8, '#fffaf0'); P(6, top + 10, 5, 1, p.carry === 'bad' ? '#c23a3a' : p.carry === 'good' ? '#148a50' : '#8a8f98') }
        if (st?.alarm && !reduced && Math.floor(t * 2) % 2) { px(x - 3, y + top - 12, 7, 8, '#ff4d6a'); px(x, y + top - 11, 1, 4, '#fff'); px(x, y + top - 6, 1, 1, '#fff') }
      }
      if (selRef.current === p.id) px(x - 2, y - 44, 5, 3, '#f0b44c')
      if (speakRef.current === p.id && !reduced) { const b = Math.floor(t * 3) % 3; px(x + 6, y - 44, 12, 8, '#fffaf0'); for (let i = 0; i <= b; i++) px(x + 8 + i * 3, y - 41, 2, 2, '#1d1608') }
      ctx.setTransform(R, 0, 0, R, 0, 0)
    }
    const step = (dt: number) => {
      const nowMs = Date.now()
      for (const p of Object.values(people.current)) {
        if (!p.path.length || p.until > nowMs) continue
        const g = p.path[0], sp = 60 * dt
        const dx = g.x - p.x, dy = g.y - p.y
        if (Math.abs(dx) <= sp && Math.abs(dy) <= sp) { p.x = g.x; p.y = g.y; p.path.shift(); if (g.hold) { p.until = nowMs + g.hold; p.carry = null } }
        else { if (Math.abs(dy) > sp) { p.y += Math.sign(dy) * sp; p.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * 0.3) } else p.x += Math.sign(dx) * sp; if (Math.abs(dx) > 0.5) p.face = dx > 0 ? 1 : -1 }
        if (!p.path.length) p.face = 1
      }
    }
    const frame = (n: number) => {
      const dt = Math.min(0.1, (n - last) / 1000); last = n; T += dt
      if (!reduced) step(dt); else for (const p of Object.values(people.current)) { if (p.path.length) { const h = home(p.id); p.x = h.x; p.y = h.y; p.path = []; p.carry = null } }
      ctx.setTransform(R, 0, 0, R, 0, 0)
      drawHouse(T)
      for (const p of Object.values(people.current).sort((a, b) => a.y - b.y)) drawPerson(p, T)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const live = snap?.state && now - ts(snap.state.updated_at) < 3 * 60_000
  const version = snap?.manifest ? `${snap.manifest.bot_version} · ${String(snap.manifest.sha ?? '').slice(0, 7)}` : '…'
  const pick = (id: Id) => setSel((s) => (s === id ? null : id))
  const onCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const mx = ((e.clientX - r.left) / r.width) * W, my = ((e.clientY - r.top) / r.height) * H
    const id = IDS.find((k) => mx >= ROOM[k].x0 && mx < ROOM[k].x0 + ROOM[k].w && my >= ROOM[k].y0 && my < ROOM[k].y0 + ROOM[k].h)
    if (id) pick(id)
  }

  return (
    <div dir="rtl" className="bh">
      <style>{CSS}</style>
      <div className="bh-head">
        <div>
          <span className="bh-eyebrow">NEXUS / AUTONOMOUS OPERATIONS</span>
          <h1>בית הבוט <small>חדר הבקרה</small></h1>
          <p>73 סוכנים כמו בקרן גידור: 65 מצביעים לונג/שורט (15 אנליסטים + 50 בחמישה צוותים), כל אחד נבחן כל דקה מול 5 הדקות הבאות ומשקלו מתעדכן לבד — מי שטועה בעקביות יורד לספסל. דסק של 4 מתווכח ומכריע. ישיבה וכניסות כל דקה, בדיקת יציאות כל 10 שניות — הכל מתוך מנוע הבוט, גם כשהעמוד סגור.</p>
        </div>
        <div className="bh-chips">
          <span className={`bh-chip ${live ? 'ok' : 'bad'}`}><i />{live ? `הבוט רץ · דופק ${ago(ts(snap?.state?.updated_at), now)}` : snap ? 'אין דופק מהבוט' : 'מתחבר…'}</span>
          <span className="bh-chip">{version}</span>
          <span className="bh-chip">{!snap?.state ? 'מצב מסחר לא ידוע' : snap.state.paper_mode ? 'מסחר דמו' : 'מסחר אמיתי'}</span>
          {onBack && <button className="bh-btn" onClick={onBack}>חזרה לדשבורד</button>}
        </div>
      </div>
      {err && <div className="bh-err" role="alert">לא הצלחתי לקרוא את נתוני הבוט: {err}. מנסה שוב כל 15 שניות.</div>}

      <div className="bh-metrics">
        <div><span>שווי תיק</span><strong dir="ltr">{usd(num(snap?.equity[0]?.equity))}</strong><small>לפי מדידת ההון האחרונה</small></div>
        <div><span>מזומן זמין</span><strong dir="ltr">{usd(num(snap?.equity[0]?.balance))}</strong><small>{snap ? `${snap.open.length} פוזיציות פתוחות` : 'טוען…'}</small></div>
        <div><span>חשיפה</span><strong dir="ltr">{usd(num(snap?.equity[0]?.exposure))}</strong><small>{snap?.state?.team_vol_cap ? `תקרת צוות: ${snap.state.team_vol_cap}` : 'לפי הגדרות המנוע'}</small></div>
      </div>
      <Cycle snap={snap} now={now} />
      <Tape ticks={ticks} snap={snap} />
      <Floor snap={snap} ticks={ticks} now={fast > now ? fast : now} />
      <div className="bh-scene">
        <canvas ref={cvRef} onClick={onCanvas} role="img" aria-label="בית הבוט. הרשימה שמתחת לבית מתארת כל חדר ומה הבוט עשה בו באמת." />
        <div className="bh-ov">
          {IDS.map((id) => {
            const r = ROOM[id], a = status[id]
            return (
              <div key={id}>
                <button className={`bh-tag${sel === id ? ' sel' : ''}`} style={{ right: `${100 - ((r.x0 + r.w / 2) / W) * 100}%`, top: `${((r.y0 + 2) / H) * 100}%`, ['--c' as string]: ROSTER[id].color }} onClick={() => pick(id)}>
                  {ROSTER[id].name} <span>· {SHORT[id] ?? ROSTER[id].role}</span>
                </button>
                {speaker?.who === id && <div className="bh-say live" style={{ right: `${100 - ((r.x0 + r.w / 2) / W) * 100}%`, top: `${((r.floor - 44) / H) * 100}%` }}>{speaker.to ? <b>→ {ROSTER[speaker.to as Id]?.name ?? speaker.to}: </b> : null}{speaker.says.slice(0, 140)}</div>}
                {!speaker && sel === id && a.action && <div className="bh-say" style={{ right: `${100 - ((r.x0 + r.w / 2) / W) * 100}%`, top: `${((r.floor - 44) / H) * 100}%` }}>{a.action}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {String(snap?.manifest?.enabled_sleeves ?? '').includes('SCALP') && <section className="bh-meet">
        <h2>מסחר דמו אוטונומי · {(snap?.open ?? []).filter(t=>t.strategy==='SCALP').length}/{SCALP.maxPositions} פוזיציות · כל דקה · החזקה גמישה 1–15 דקות</h2>
        <p className="bh-mnote">הסכמה אלגוריתמית → בדיקת עלויות וסיכון → ביצוע. בדיקת יציאות כל 10 שניות. זמן ההחזקה נקבע בכניסה לפי התנאים (1–15 דק׳): מגמה חזקה = יותר זמן, שוק מהיר = פחות. בכל ישיבה הצוות יכול לסגור מוקדם אם הוא מתהפך, או להאריך עסקה מרוויחה עד 15 דק׳; עסקה מפסידה נסגרת בזמן המתוכנן. השהיות או נתונים חסרים עלולים לעכב אותה. סטופ נגרר אינו מבטיח רווח. עמלות 0.05% לכל צד, החלקה 0.03% ומימון מדומה יחסי. אותות: EMA8/21, מומנטום, חוסר איזון בספר, liquidity sweep משוער, חדשות ציבוריות (Cointelegraph/CoinDesk) וליקווידציות OKX — נספרים רק אם טריים ומאומתים מול המחיר.</p>
        <Intel snap={snap} now={now} />
        <p className="bh-mnote">הפוזיציות עצמן מוצגות חיות ברצפת המסחר למעלה.</p>
      </section>}
      <Meeting snap={snap} now={now} shown={shown} replaying={replaying} />
      <League snap={snap} />

      {snap && snap.meetings.length > 1 && <details className="bh-history"><summary>היסטוריית החלטות · {snap.meetings.length} סבבים אחרונים</summary>{snap.meetings.slice(1).map((m, i) => <div key={String(m.id ?? i)}><time>{ago(ts(m.ts), now)}</time><b>{DECISION[String(m.decision)] ?? String(m.decision)}</b><p>{String(m.action ?? '')}</p></div>)}</details>}
      <div className="bh-list">
        {IDS.map((id) => {
          const a = status[id]
          return (
            <button key={id} className={`bh-row${sel === id ? ' sel' : ''}`} onClick={() => pick(id)}>
              <span className="bh-av" style={{ background: ROSTER[id].color }}>{ROSTER[id].name[0]}</span>
              <span className="bh-mid">
                <b>{ROSTER[id].name}</b> <em>· {ROSTER[id].role}</em>
                <span className="bh-line">{a?.line}</span>
              </span>
              <span className={`bh-st ${a?.alarm ? 'alarm' : a?.asleep ? 'sleep' : a?.working ? 'work' : 'wait'}`}>{a?.alarm ? 'התראה' : a?.asleep ? 'כבוי' : a?.working ? 'פעילות אחרונה' : a?.reviewed ? 'נבדק בסבב' : 'ממתין לאירוע'}</span>
            </button>
          )
        })}
      </div>
      <p className="bh-note">
        מה אמיתי כאן: הדופק, מקורות הנתונים, משטר השוק, הפוזיציות, הרוטציות, החסימות של מנהלת הסיכונים, ההון, החשיפה והיומן. כולם נקראים כל 15 שניות מהטבלאות של הבוט ב-Supabase.
        הדמויות לא ממציאות פעולות: הן זזות רק כשמופיעה רשומה חדשה. תזמון המנוע נקבע בשרת; סגירה בפועל תלויה בזמינות המחירים ובזמן תגובת השרת.
      </p>
    </div>
  )
}

// v71.1: the team meeting the BOT itself holds every minute (team_meetings).
// The house only shows the minutes; every vote was computed server-side from
// the bot's own tables, and the only action the team can take is a de-risk cap.
interface Tick { px: number; chg: number; dir: number; t: number }
const UNIVERSE = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'LINK', 'AVAX']
const STEP_MS = 700
const EXIT_HE: Record<string, string> = { STOP: 'סטופ', TIMEOUT: 'תקרת 15 דק׳', PLANNED: 'זמן מתוכנן', FLIP: 'הצוות התהפך', MODE_SWITCH: 'מעבר מצב', LEDGER_TEST: 'בדיקה' }
const ROUND: Record<number, string> = { 1: 'סבב 1 · כל סוכן מצביע מהתחום שלו', 2: 'סבב 2 · התנגדויות ורקורד מול מנהלת התיק', 3: 'סבב 3 · החלטה' }
const fmtPx = (v: number) => (!Number.isFinite(v) ? '—' : v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v >= 1 ? v.toFixed(3) : v.toFixed(5))
const pct = (v: number, d = 2) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%` : '—')

// v72.0: live price tape. OKX public swap tickers, display only — the bot trades on its own feed.
function Tape({ ticks, snap }: { ticks: Record<string, Tick>; snap: Snap | null }) {
  const held = new Map((snap?.open ?? []).map((t) => [String(t.sym), String(t.side)]))
  const items = UNIVERSE.map((c) => {
    const k = ticks[c]
    return <span key={c} className={`bh-tk ${k?.dir > 0 ? 'up' : k?.dir < 0 ? 'dn' : ''}`}>
      {held.has(c) && <i className={held.get(c) === 'LONG' ? 'l' : 's'} title="פוזיציה פתוחה" />}<b>{c}</b> <span dir="ltr">{k ? fmtPx(k.px) : '—'}</span> <em dir="ltr" className={k && k.chg >= 0 ? 'g' : 'r'}>{k ? pct(k.chg) : ''}</em>
    </span>
  })
  return <div className="bh-tape" aria-label="מחירים חיים"><div className="bh-tape-in">{items}{items}</div><small>מחירי OKX חיים · מתעדכן כל 4 שניות{Object.keys(ticks).length ? '' : ' · אין הזנה כרגע'}</small></div>
}

// v72.0: the trading floor — open book marked live, trade tape, equity line. All from bot rows + public marks.
function Floor({ snap, ticks, now }: { snap: Snap | null; ticks: Record<string, Tick>; now: number }) {
  const open = snap?.open ?? []
  const closed = snap?.closed ?? []
  const day = new Date(); day.setUTCHours(0, 0, 0, 0)
  const today = (snap?.closedAll ?? []).filter((t) => ts(t.closed_at) >= day.getTime())
  const dayPnl = today.reduce((a, t) => a + num(t.pnl), 0)
  const dayWins = today.filter((t) => num(t.pnl) > 0).length
  let upnl = 0, marked = 0
  const rows = open.map((t) => {
    const dir = t.side === 'LONG' ? 1 : -1, e = num(t.entry_price), sz = num(t.size), k = ticks[String(t.sym)]
    const mark = k?.px ?? NaN, u = Number.isFinite(mark) ? dir * (mark - e) * sz - num(t.fee || 0) : NaN
    if (Number.isFinite(u)) { upnl += u; marked++ }
    const held = now - ts(t.opened_at), stop = num(t.trail_sl)
    const toStop = Number.isFinite(mark) && stop > 0 ? (dir * (mark - stop)) / mark : NaN
    return { t, dir, e, mark, u, up: Number.isFinite(u) ? u / (e * sz) : NaN, held, stop, toStop }
  })
  const cv = (snap?.curve ?? []).slice(0, 360).map((c) => num(c.equity)).filter(Number.isFinite).reverse()
  let path = '', up = true
  if (cv.length > 2) { const lo = Math.min(...cv), hi = Math.max(...cv), rg = Math.max(hi - lo, 1e-9); up = cv[cv.length - 1] >= cv[0]; path = cv.map((v, i) => `${i ? 'L' : 'M'}${((i / (cv.length - 1)) * 300).toFixed(1)},${(46 - ((v - lo) / rg) * 42).toFixed(1)}`).join(' ') }
  return <section className="bh-floor">
    <div className="bh-fhead">
      <div><span className="bh-eyebrow">TRADING FLOOR · LIVE</span><h2>ספר פוזיציות · {open.length}/{SCALP.maxPositions}</h2></div>
      <div className="bh-kpis">
        <div><span>רווח/הפסד פתוח</span><strong dir="ltr" className={upnl >= 0 ? 'g' : 'r'}>{marked ? usd(upnl) : '—'}</strong></div>
        <div><span>ממומש היום (UTC)</span><strong dir="ltr" className={dayPnl >= 0 ? 'g' : 'r'}>{usd(dayPnl)}</strong></div>
        <div><span>עסקאות היום</span><strong>{today.length} <small>({dayWins} ברווח)</small></strong></div>
      </div>
    </div>
    {path && <svg className="bh-spark" viewBox="0 0 300 48" preserveAspectRatio="none" aria-label="עקומת הון"><path d={path} fill="none" stroke={up ? '#00d492' : '#ff4d6a'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>}
    <div className="bh-blot">
      {rows.length ? rows.map(({ t, dir, e, mark, u, up: upc, held, stop, toStop }) => (
        <div key={String(t.id)} className={`bh-pos ${Number.isFinite(u) ? (u >= 0 ? 'win' : 'lose') : ''}`}>
          <div className="bh-pos-top"><b>{String(t.sym)}</b><span className={dir > 0 ? 'bh-l' : 'bh-s'}>{dir > 0 ? 'LONG' : 'SHORT'}</span><em>{String(t.strategy)}</em><strong dir="ltr">{Number.isFinite(u) ? `${usd(u)} (${pct(upc)})` : 'אין מחיר חי'}</strong></div>
          <div className="bh-pos-mid" dir="ltr"><span>entry {fmtPx(e)}</span><span>mark {fmtPx(mark)}</span><span>stop {fmtPx(stop)}{Number.isFinite(toStop) ? ` (${pct(toStop)})` : ''}</span></div>
          {t.strategy === 'SCALP' && (() => { const plan = Math.max(1, Math.min(15, num((t.scalp_meta as Row | null)?.hold_min) || 15)) * 60_000; const over = held > plan; return <div className={`bh-bar${over ? ' ext' : ''}`}><i style={{ width: `${Math.min(100, (held / plan) * 100)}%` }} /><span>{over ? 'הוארך · ' : ''}<b dir="ltr">{Math.floor(held / 60_000)}:{String(Math.floor((held % 60_000) / 1000)).padStart(2, '0')} / {plan / 60_000}:00</b>{over ? ' (עד 15:00)' : ' מתוכנן'}</span></div> })()}
        </div>)) : <p className="bh-mnote">אין פוזיציות פתוחות כרגע. הסיבה מופיעה בהחלטת מנהלת התיק בישיבה.</p>}
    </div>
    <div className="bh-tape2">
      <span className="bh-eyebrow">TRADE TAPE · עסקאות אחרונות</span>
      {closed.slice(0, 8).map((t) => { const hold = (ts(t.closed_at) - ts(t.opened_at)) / 60_000; const why0 = String((t.scalp_meta as Row | null)?.exit_reason ?? t.status ?? ''); const why = EXIT_HE[why0] ?? why0; const pl = num((t.scalp_meta as Row | null)?.hold_min); return (
        <div key={String(t.id)} className="bh-fill"><time>{new Date(ts(t.closed_at)).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><b>{String(t.sym)}</b><span className={t.side === 'LONG' ? 'bh-l' : 'bh-s'}>{t.side === 'LONG' ? '▲' : '▼'}</span><em>{why}{Number.isFinite(hold) ? ` · ${hold.toFixed(1)} דק׳` : ''}{Number.isFinite(pl) ? ` (תוכנן ${pl})` : ''}</em><strong dir="ltr" className={num(t.pnl) >= 0 ? 'g' : 'r'}>{usd(num(t.pnl))}</strong></div>) })}
      {!closed.length && <p className="bh-mnote">עוד אין עסקאות סגורות.</p>}
    </div>
    <p className="bh-mnote">מחיר חי: OKX (תצוגה בלבד). הבוט מסמן ונסגר לפי ההזנה שלו בשרת, כך שייתכנו הבדלים קטנים. מסחר דמו 1x, ללא הבטחת רווח.</p>
  </section>
}

const VOTE: Record<string, { t: string; c: string }> = {
  derisk: { t: 'להקטין', c: '#ff4d6a' }, ok: { t: 'תקין', c: '#00d492' },
  long: {t:'לונג',c:'#00d492'}, short: {t:'שורט',c:'#ffb454'}, veto: {t:'חסימה',c:'#ff4d6a'},
  hold: { t: 'להמשיך', c: '#8fa3bf' }, sleep: { t: 'כבוי', c: '#5b6b82' },
}
const DECISION: Record<string, string> = { SCALP_OPEN:'נפתחו עסקאות דמו', SCALP_HOLD:'אין כניסה מתאימה', SCALP_PAUSED:'כניסות מושהות', HOLD: 'ממשיכים כרגיל', DERISK: 'הקטנת חשיפה', RESTORE: 'חזרה לגודל רגיל' }
function Meeting({ snap, now, shown, replaying }: { snap: Snap | null; now: number; shown: number; replaying: boolean }) {
  const m = snap?.meetings?.[0]
  if (!m) return <div className="bh-meet"><h2>ישיבת צוות</h2><p className="bh-mnote">עוד לא התקיימה ישיבה. הצוות נפגש כל דקה.</p></div>
  const all = (Array.isArray(m.minutes) ? m.minutes : []) as Minute[]
  const mins = all.slice(0, shown)
  const cap = snap?.state?.team_vol_cap
  return (
    <div className="bh-meet">
      <div className="bh-mtop">
        <h2>ישיבת צוות · {ago(ts(m.ts), now)}</h2>
        <span className={`bh-dec d-${String(m.decision).toLowerCase()}`}>{DECISION[String(m.decision)] ?? String(m.decision)}</span>
      </div>
      <p className="bh-maction">{String(m.action ?? '')}</p>
      <div className="bh-mins">
        {mins.map((x, i) => (
          <div key={i}>
            {(i === 0 || (mins[i - 1].round ?? 1) !== (x.round ?? 1)) && <div className="bh-round">{ROUND[x.round ?? 1]}</div>}
            <div className={`bh-min bh-in${x.round === 3 ? ' pm' : x.round === 2 ? ' r2' : ''}`}>
              <span className="bh-av sm" style={{ background: ROSTER[x.who]?.color ?? '#888' }}>{ROSTER[x.who]?.name?.[0] ?? '?'}</span>
              <span><b>{ROSTER[x.who]?.name ?? x.who}</b>{x.to ? <em className="bh-to"> ← ל{ROSTER[x.to as Id]?.name ?? x.to}</em> : null} {x.says}</span>
              <span className="bh-vote" style={{ color: VOTE[x.vote]?.c, borderColor: VOTE[x.vote]?.c }}>{VOTE[x.vote]?.t ?? x.vote}</span>
            </div>
          </div>
        ))}
        {replaying && shown < all.length && <div className="bh-typing"><span className="bh-av sm" style={{ background: ROSTER[all[shown].who]?.color }}>{ROSTER[all[shown].who]?.name?.[0]}</span> {ROSTER[all[shown].who]?.name} מקליד/ה<i>.</i><i>.</i><i>.</i></div>}
      </div>
      <p className="bh-mnote">
        {String(snap?.manifest?.enabled_sleeves ?? '').includes('SCALP') ? `בכל ישיבה (כל דקה) המנוע בוחן פתיחות דמו לפי ההצבעות, היתרה ומגבלות התיק. עד ${SCALP.maxPositions} פוזיציות ללא מינוף (1x) ועד 99% הקצאה. רק פעולות שנשמרו מופיעות כבוצעו.` : <>הצוות נפגש בתוך הבוט כל דקה. כל אחד בודק רק את התחום שלו בנתונים האמיתיים ומצביע. הצוות יכול לקבל לבד החלטה אחת בלבד: להקטין את הפוזיציות כששניים או יותר מצביעים "להקטין", ולחזור לגודל הרגיל לאחר 24 שעות מההקטנה ובדיקה תקינה ללא הצבעות להקטנה. התקרה חלה על גודל הרוטציה הבאה; היא לא סוגרת עסקאות קיימות. אין הגדלה מעבר להגדרות הפריסה.
        {cap ? ` כרגע: פוזיציות מוקטנות (יעד ${cap}).` : ' כרגע: גודל רגיל.'}</>}
      </p>
    </div>
  )
}

function Cycle({ snap, now }: { snap: Snap | null; now: number }) {
  const last = ts(snap?.meetings[0]?.ts)
  const next = last + TEAM_INTERVAL_MS
  const seconds = Math.max(0, Math.ceil((next - now) / 1000))
  const late = last > 0 && now - next > 90_000
  const progress = last ? Math.min(100, Math.max(0, (now - last) / TEAM_INTERVAL_MS * 100)) : 0
  return <section className={`bh-cycle${late ? ' late' : ''}`} aria-label="מחזור הבדיקה">
    <div><span className="bh-eyebrow">מחזור צוות / {CYCLE_LABEL}</span><h2>{!last ? 'ממתינים לבדיקה ראשונה' : late ? 'סבב הבדיקה מתעכב' : seconds ? 'הבדיקה הבאה בעוד' : 'ממתינים לתוצאת הסבב מהשרת'}</h2><p>{last ? `הבדיקה האחרונה ${ago(last, now)} · העמוד מתעדכן כל 15 שניות` : 'הנתונים יופיעו לאחר שהמנוע ישמור את תוצאות הבדיקה'}</p></div>
    <strong dir="ltr">{last && seconds ? `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}` : '—'}</strong>
    <div className="bh-progress"><i style={{ width: `${progress}%` }} /></div>
  </section>
}

const CSS = `
.bh { max-width:1200px; margin:auto; padding:8px; }
.bh-eyebrow { display:block; color:#54d4ce; font-size:10px; letter-spacing:1.5px; margin-bottom:8px; }
.bh-head h1 small { font-size:13px; font-weight:500; color:#8fa3bf; margin-inline-start:8px; }
.bh-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.bh-metrics > div { padding:18px; border:1px solid #213148; border-radius:14px; background:linear-gradient(130deg,#111d30,#0a121f); display:grid; gap:7px; }
.bh-metrics span { font-size:12px; color:#9cb1c9; }
.bh-metrics strong { font-size:clamp(16px,3vw,27px); color:#effaff; text-align:right; font-variant-numeric:tabular-nums; }
.bh-metrics small { font-size:10px; color:#7e93af; }
.bh-cycle { position:relative; padding:20px; background:linear-gradient(120deg,#102c35,#101a2c); border:1px solid #28515e; border-radius:14px; display:flex; justify-content:space-between; align-items:center; gap:10px; overflow:hidden; }
.bh-cycle h2 { margin:0; font-size:17px; color:#effaff; }
.bh-cycle p { margin:7px 0 0; color:#a4bbcf; font-size:11px; }
.bh-cycle > strong { font-size:36px; color:#65e1cc; font-variant-numeric:tabular-nums; }
.bh-cycle.late { border-color:#ffb454; }
.bh-progress { position:absolute; height:3px; bottom:0; left:0; right:0; background:#172c3a; }
.bh-progress i { display:block; height:100%; background:#65e1cc; transition:width 1s linear; }
.bh-history { border:1px solid #213148; padding:16px; border-radius:14px; background:#0b1320; font-size:12px; }
.bh-history summary { cursor:pointer; color:#b5ccd9; }
.bh-history > div { border-top:1px solid #213148; margin-top:12px; padding-top:12px; }
.bh-history time { margin-inline-end:12px; color:#89a1ba; }
.bh-history p { margin:6px 0 0; line-height:1.6; }
@media(max-width:520px) { .bh-metrics { gap:6px; } .bh-metrics > div { padding:11px 8px; } .bh-cycle { padding:15px; } .bh-cycle > strong { font-size:28px; } }

.bh-meet { background:rgba(10,17,29,0.96); border:1px solid rgba(240,180,76,0.3); border-radius:14px; padding:20px; display:grid; gap:8px; }
.bh-meet h2 { margin:0; font-size:15px; color:#f0b44c; font-weight:900; }
.bh-mtop { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
.bh-dec { font-size:12px; font-weight:900; border-radius:20px; padding:3px 10px; background:rgba(140,170,210,0.1); color:#c7d5e8; }
.bh-dec.d-derisk { background:rgba(255,77,106,0.15); color:#ff4d6a; } .bh-dec.d-restore { background:rgba(0,212,146,0.15); color:#00d492; }
.bh-maction { margin:0; font-size:13px; color:#eef4fc; line-height:1.5; }
.bh-mins { display:grid; gap:6px; }
.bh-min { display:grid; grid-template-columns:24px 1fr auto; gap:8px; align-items:start; font-size:12.5px; line-height:1.5; }
.bh-min b { color:#eef4fc; }
.bh-av.sm { width:24px; height:24px; border-radius:6px; font-size:12px; }
.bh-vote { font-size:11px; font-weight:800; border:1px solid; border-radius:20px; padding:1px 8px; white-space:nowrap; }
.bh-mnote { font-size:11.5px; color:#8fa3bf; line-height:1.6; margin:0; }

.bh { color:#c7d5e8; font-family: system-ui, 'Segoe UI', sans-serif; display:grid; gap:10px; }
.bh-head { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; align-items:flex-end; background:rgba(10,17,29,0.96); border:1px solid rgba(140,170,210,0.14); border-radius:14px; padding:20px; }
.bh-head h1 { margin:0; font-size:20px; font-weight:900; color:#eef4fc; }
.bh-head p { margin:4px 0 0; font-size:12.5px; color:#8fa3bf; max-width:560px; line-height:1.5; }
.bh-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.bh-chip { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; padding:3px 10px; border-radius:20px; border:1px solid rgba(140,170,210,0.2); color:#c7d5e8; white-space:nowrap; }
.bh-chip i { width:7px; height:7px; border-radius:50%; background:#8fa3bf; }
.bh-chip.ok i { background:#00d492; box-shadow:0 0 0 3px rgba(0,212,146,0.2); } .bh-chip.bad { color:#ff4d6a; border-color:rgba(255,77,106,0.4); } .bh-chip.bad i { background:#ff4d6a; }
.bh-btn { font-family:inherit; font-size:12px; font-weight:700; padding:5px 12px; border-radius:20px; border:1px solid rgba(53,224,255,0.4); background:rgba(53,224,255,0.1); color:#35e0ff; cursor:pointer; }
.bh-err { background:rgba(255,77,106,0.12); border:1px solid rgba(255,77,106,0.4); border-radius:6px; padding:8px 12px; font-size:12.5px; }
.bh-scene { position:relative; border-radius:18px; overflow:hidden; border:1px solid rgba(140,170,210,0.14); background:#05070c; container-type:inline-size; }
.bh-scene canvas { display:block; width:100%; height:auto; aspect-ratio:${W} / ${H}; image-rendering:pixelated; cursor:pointer; }
.bh-ov { position:absolute; inset:0; pointer-events:none; }
.bh-tag { position:absolute; transform:translate(50%,0); pointer-events:auto; cursor:pointer; border:0; border-radius:5px; font-family:inherit; white-space:nowrap; font-size:clamp(8.5px,2.1cqw,12.5px); font-weight:800; color:#f4efe2; background:rgba(8,11,18,0.86); padding:0.15em 0.55em; border-bottom:0.2em solid var(--c); }
.bh-tag span { font-weight:400; opacity:0.8; } .bh-tag.sel { background:#f0b44c; color:#2a1d08; }
.bh-tag:focus-visible, .bh-row:focus-visible, .bh-btn:focus-visible { outline:2px solid #f0b44c; outline-offset:2px; }
.bh-say { position:absolute; transform:translate(50%,-100%); width:max-content; max-width:min(250px,34cqw); font-size:clamp(8.5px,1.9cqw,12px); line-height:1.4; color:#1d1608; background:#fffaf0; padding:0.35em 0.55em; border-radius:5px; box-shadow:0 0 0 2px #1d1608, 3px 3px 0 rgba(0,0,0,0.35); }
.bh-list { background:rgba(10,17,29,0.96); border:1px solid rgba(140,170,210,0.14); border-radius:6px; overflow:hidden; }
.bh-row { display:grid; grid-template-columns:32px 1fr auto; gap:10px; align-items:start; width:100%; text-align:right; background:none; border:0; border-bottom:1px solid rgba(140,170,210,0.1); color:inherit; font-family:inherit; padding:9px 12px; cursor:pointer; }
.bh-row:hover, .bh-row.sel { background:rgba(140,170,210,0.07); }
.bh-av { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; font-weight:900; color:#111; }
.bh-mid b { color:#eef4fc; font-size:13.5px; } .bh-mid em { font-style:normal; color:#8fa3bf; font-size:12px; }
.bh-line { display:block; font-size:12.5px; margin-top:2px; line-height:1.5; }
.bh-st { font-size:11px; font-weight:800; border-radius:20px; padding:2px 8px; white-space:nowrap; }
.bh-st.work { color:#00d492; background:rgba(0,212,146,0.12); } .bh-st.wait { color:#8fa3bf; background:rgba(140,170,210,0.08); }
.bh-st.sleep { color:#8fa3bf; background:rgba(140,170,210,0.05); } .bh-st.alarm { color:#ff4d6a; background:rgba(255,77,106,0.12); }
.bh-note { font-size:11.5px; color:#8fa3bf; line-height:1.6; margin:0; }
.bh-tape { position:relative; overflow:hidden; border:1px solid #213148; border-radius:12px; background:#070d17; padding:9px 0 20px; }
.bh-tape-in { display:flex; gap:26px; width:max-content; animation:bhscroll 38s linear infinite; padding-inline:12px; }
.bh-tape:hover .bh-tape-in { animation-play-state:paused; }
@keyframes bhscroll { from { transform:translateX(0) } to { transform:translateX(50%) } }
.bh-tape small { position:absolute; bottom:3px; right:12px; font-size:9.5px; color:#6b819c; }
.bh-tk { font-size:13px; white-space:nowrap; font-variant-numeric:tabular-nums; color:#dbe7f5; transition:color .4s; display:inline-flex; gap:5px; align-items:center; }
.bh-tk b { color:#fff; } .bh-tk.up span { color:#00d492; } .bh-tk.dn span { color:#ff4d6a; }
.bh-tk em { font-style:normal; font-size:11px; } .g { color:#00d492 !important; } .r { color:#ff4d6a !important; }
.bh-tk i { width:7px; height:7px; border-radius:50%; } .bh-tk i.l { background:#00d492; } .bh-tk i.s { background:#ffb454; }
.bh-floor { border:1px solid #1f3a4a; border-radius:14px; padding:18px; background:radial-gradient(120% 80% at 100% 0%,#0f2233,#070c15); display:grid; gap:12px; }
.bh-fhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-end; }
.bh-fhead h2 { margin:0; font-size:17px; color:#effaff; }
.bh-kpis { display:flex; gap:16px; flex-wrap:wrap; } .bh-kpis div { display:grid; gap:2px; } .bh-kpis span { font-size:10.5px; color:#8fa3bf; }
.bh-kpis strong { font-size:17px; color:#effaff; font-variant-numeric:tabular-nums; } .bh-kpis small { font-size:11px; color:#8fa3bf; font-weight:400; }
.bh-spark { width:100%; height:52px; background:linear-gradient(#0b1726,#070c15); border-radius:8px; }
.bh-blot { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:8px; }
.bh-pos { border:1px solid #213148; border-radius:10px; padding:10px 12px; background:#0a1321; display:grid; gap:6px; transition:border-color .5s, box-shadow .5s; }
.bh-pos.win { border-color:rgba(0,212,146,.45); box-shadow:inset 3px 0 0 #00d492; } .bh-pos.lose { border-color:rgba(255,77,106,.45); box-shadow:inset 3px 0 0 #ff4d6a; }
.bh-pos-top { display:flex; gap:8px; align-items:center; font-size:13px; } .bh-pos-top b { color:#fff; font-size:14px; } .bh-pos-top em { font-style:normal; font-size:10px; color:#8fa3bf; }
.bh-pos-top strong { margin-inline-start:auto; font-variant-numeric:tabular-nums; }
.bh-pos.win .bh-pos-top strong { color:#00d492; } .bh-pos.lose .bh-pos-top strong { color:#ff4d6a; }
.bh-l { color:#00d492; font-weight:800; font-size:11px; } .bh-s { color:#ffb454; font-weight:800; font-size:11px; }
.bh-pos-mid { display:flex; gap:10px; flex-wrap:wrap; font-size:11px; color:#9cb1c9; font-variant-numeric:tabular-nums; }
.bh-bar { position:relative; height:14px; background:#13223a; border-radius:7px; overflow:hidden; }
.bh-bar.ext i { background:linear-gradient(90deg,#f0b44c,#00d492); }
.bh-bar i { position:absolute; inset:0 auto 0 0; background:linear-gradient(90deg,#1f6fcc,#f0b44c); transition:width 1s linear; }
.bh-bar span { position:relative; display:block; text-align:center; font-size:10px; line-height:14px; color:#effaff; font-variant-numeric:tabular-nums; }
.bh-tape2 { display:grid; gap:4px; }
.bh-fill { display:grid; grid-template-columns:auto auto auto 1fr auto; gap:8px; align-items:center; font-size:12px; padding:5px 8px; border-radius:6px; background:#0a1321; animation:bhin .5s ease; }
.bh-fill time { color:#6b819c; font-variant-numeric:tabular-nums; } .bh-fill b { color:#fff; } .bh-fill em { font-style:normal; color:#8fa3bf; } .bh-fill strong { font-variant-numeric:tabular-nums; }
.bh-round { font-size:10.5px; letter-spacing:.5px; color:#54d4ce; margin:10px 0 4px; border-top:1px dashed #213148; padding-top:8px; }
.bh-in { animation:bhin .45s ease; } @keyframes bhin { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
.bh-min.r2 { background:rgba(255,180,84,.06); border-radius:8px; padding:4px; } .bh-min.pm { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.2); border-radius:8px; padding:6px; }
.bh-to { font-style:normal; color:#f0b44c; font-size:11px; }
.bh-typing { font-size:12px; color:#8fa3bf; display:flex; gap:6px; align-items:center; } .bh-typing i { font-style:normal; animation:bhdot 1.2s infinite; } .bh-typing i:nth-child(3) { animation-delay:.2s } .bh-typing i:nth-child(4) { animation-delay:.4s }
@keyframes bhdot { 0%,100% { opacity:.2 } 50% { opacity:1 } }
.bh-say.live { background:#f0fff8; box-shadow:0 0 0 2px #00a070, 3px 3px 0 rgba(0,0,0,.35); animation:bhin .3s ease; z-index:2; }
@media(max-width:520px) { .bh-kpis strong { font-size:14px; } .bh-floor { padding:12px; } .bh-fill { grid-template-columns:auto auto auto 1fr; } .bh-fill em { display:none; } }
.bh-mx-wrap { overflow-x:auto; }
.bh-mx { width:100%; border-collapse:separate; border-spacing:3px; font-size:12px; text-align:center; }
.bh-mx th { color:#8fa3bf; font-weight:600; font-size:10.5px; padding:3px; white-space:nowrap; } .bh-mx tbody th { color:#fff; font-size:12.5px; text-align:right; }
.bh-mx td { background:#0f1929; border-radius:5px; padding:5px 3px; color:#56607a; } .bh-mx td.up { background:rgba(0,212,146,.16); color:#00d492; } .bh-mx td.dn { background:rgba(255,77,106,.16); color:#ff4d6a; }
.bh-mx td.n { color:#9cb1c9; font-size:10.5px; }
.bh-lg td { padding:4px 6px; } @media(max-width:520px){ .bh-mx.bh-lg td.n { display:table-cell !important } } .bh-lg tbody th { font-weight:600; font-size:12px; white-space:nowrap; } .bh-mx td.sc { color:#f0b44c; font-weight:800; }
.bh-mx thead th:first-child, .bh-mx tbody th { position:sticky; right:0; background:#0a111d; z-index:1; }
@media(max-width:520px){ .bh-mx .nh, .bh-mx td.n:not(.sc) { display:none } .bh-mx { border-spacing:2px; font-size:11px } .bh-mx th { font-size:9.5px } }
.bh-chipd { font-size:10.5px; font-weight:800; border-radius:12px; padding:2px 7px; border:1px solid #56607a; color:#8fa3bf; white-space:nowrap; } .bh-chipd.l { color:#00d492; border-color:#00d492; } .bh-chipd.s { color:#ffb454; border-color:#ffb454; }
@media (prefers-reduced-motion: reduce) { .bh-tape-in, .bh-in, .bh-fill, .bh-say.live { animation:none; } }
`

// v71.1: the evidence behind the last meeting, as the bot saved it (bot_params.scalp_candidates).
function Intel({ snap, now }: { snap: Snap | null; now: number }) {
  const c = ((snap?.state?.bot_params as Row | undefined)?.scalp_candidates ?? []) as { sym: string; side: number; score: number; signals?: Row | null }[]
  if (!Array.isArray(c) || !c.length) return <p className="bh-mnote">אין עדיין נתוני אותות מהישיבה האחרונה.</p>
  const cols: [string, string][] = [['trend', 'EMA'], ['momentum', 'מומנטום'], ['flow', 'ספר'], ['sweep', 'sweep'], ['news', 'חדשות'], ['liq', 'ליקווד׳'], ...NEW_AGENTS.map((k) => [k, AGENTS[k].role] as [string, string]), ...(Object.keys(TEAMS) as Team[]).map((t) => ['team_' + t, TEAMS[t].label] as [string, string])]
  const cell = (x: unknown) => { const v = Number(x); return <td className={v > 0 ? 'up' : v < 0 ? 'dn' : ''}>{v > 0 ? '▲' : v < 0 ? '▼' : '·'}</td> }
  const news = c.filter((x) => x.signals?.news_title)
  return <>
    <div className="bh-mx-wrap"><table className="bh-mx">
      <thead><tr><th>מטבע</th>{cols.map(([, h]) => <th key={h}>{h}</th>)}<th>ציון</th><th className="nh">מרווח</th><th>החלטה</th></tr></thead>
      <tbody>{c.map((x) => { const g = x.signals ?? {}; return <tr key={x.sym}><th>{x.sym}</th>{cols.map(([k]) => <Fragment key={k}>{cell(g[k])}</Fragment>)}<td className="n sc" dir="ltr">{Number.isFinite(num(g.weighted)) ? `${(num(g.weighted) * 100).toFixed(0)}%` : '—'}</td><td className="n" dir="ltr">{Number.isFinite(num(g.spread_bps)) ? `${num(g.spread_bps).toFixed(1)}bp` : '—'}</td><td><span className={`bh-chipd ${x.side > 0 ? 'l' : x.side < 0 ? 's' : ''}`}>{x.side > 0 ? 'לונג' : x.side < 0 ? 'שורט' : 'אין כניסה'}</span></td></tr> })}</tbody>
    </table></div>
    <p className="bh-mnote">ליקווידציות OKX שנבדקו: {c.map((x) => `${x.sym} ${String(x.signals?.liq_valid ?? 0)} תקפות/${String(x.signals?.liq_rejected ?? 0)} נפסלו`).join(' · ')}</p>
    {news.map((x) => <p key={x.sym} className="bh-mnote">📰 {x.sym}: “{String(x.signals?.news_title).slice(0, 90)}” · {String(x.signals?.news_source)} · {ago(Number(x.signals?.news_ts), now)} · {x.signals?.news_verified ? 'מאומת במחיר' : 'לא מאומת — לא נספר'}</p>)}
  </>
}

// v75.0: every voting agent ranked by its shadow record (agent_stats), as the bot scores it.
const LABEL: Record<string, string> = { regime: 'נועה · EMA', rota: 'דניאל · מומנטום', donch: 'עומר · sweep', trader: 'רוני · ספר פקודות', risk: 'מיכל · חדשות/ליקווידציות', ...Object.fromEntries(NEW_AGENTS.map((k) => [k, `${AGENTS[k].name} · ${AGENTS[k].role}`])), ...Object.fromEntries(SWARM.map((a) => [a.id, `${a.label} · ${TEAMS[a.team].label}`])) }
function League({ snap }: { snap: Snap | null }) {
  const [all, setAll] = useState(false)
  const st = snap?.agentStats ?? {}
  const ids = Object.keys(LABEL)
  const rows = ids.map((id) => ({ id, st: st[id], w: learnedWeight(st[id]), t: tStat(st[id]), m: meanBps(st[id]) }))
    .sort((a, b) => (b.st && b.st.n >= LEARN.minN ? b.t : -99) - (a.st && a.st.n >= LEARN.minN ? a.t : -99) || (b.st?.n ?? 0) - (a.st?.n ?? 0))
  const ready = rows.filter((r) => r.st && r.st.n >= LEARN.minN), bench = ready.filter((r) => r.w === 0).length
  return <section className="bh-meet">
    <div className="bh-mtop"><h2>ליגת הסוכנים · {ids.length} מצביעים</h2><span className="bh-dec">{ready.length} מדורגים · {bench} בספסל · {ids.length - ready.length} לומדים</span></div>
    <p className="bh-mnote">כל דקה כל סוכן מצביע על 8 המטבעות, ואחרי 5 דקות בודקים אם צדק. הציון דועך בחצי כל 12 שעות, כך שהוא עוקב אחרי השוק הנוכחי. משקל = 1 + t/2 בטווח 0–2.5, רק אחרי {LEARN.minN} הצבעות; t≤−2 = ספסל (עדיין נבחן וחוזר כשמשתפר). ציון גולמי לפני עמלות — עסקה אמיתית צריכה לעבור ~16 נק׳ בסיס עלות.</p>
    <div className="bh-mx-wrap"><table className="bh-mx bh-lg">
      <thead><tr><th>#</th><th>סוכן</th><th>משקל</th><th>t</th><th>נק׳ בסיס/5ד׳</th><th>הצבעות</th><th>מצב</th></tr></thead>
      <tbody>{rows.slice(0, all ? rows.length : 15).map((r, i) => { const learning = !r.st || r.st.n < LEARN.minN; return <tr key={r.id}>
        <td className="n">{i + 1}</td><th>{LABEL[r.id]}</th>
        <td className={learning ? 'n' : r.w === 0 ? 'dn' : r.w > 1 ? 'up' : 'n'} dir="ltr">{learning ? '1.00' : r.w.toFixed(2)}</td>
        <td className="n" dir="ltr">{r.st ? r.t.toFixed(1) : '—'}</td>
        <td className={r.m > 0 ? 'up' : r.m < 0 ? 'dn' : 'n'} dir="ltr">{r.st ? r.m.toFixed(1) : '—'}</td>
        <td className="n" dir="ltr">{r.st ? r.st.n.toFixed(0) : 0}</td>
        <td><span className={`bh-chipd ${learning ? '' : r.w === 0 ? 's' : 'l'}`}>{learning ? 'לומד' : r.w === 0 ? 'ספסל' : r.w > 1 ? 'מוגבר' : 'פעיל'}</span></td>
      </tr> })}</tbody>
    </table></div>
    <button className="bh-btn" onClick={() => setAll((x) => !x)}>{all ? 'הצג 15 מובילים' : `הצג את כל ${rows.length}`}</button>
  </section>
}
