// Pure helpers for the Binance USDT-M paper desk. Symbols are never hardcoded:
// universe (when the bot publishes one) else the prices map, plus anything still open.

export type Pulse = 'live' | 'late' | 'stalled' | 'unknown'

export const DESK_SLOTS_MIN = [3, 18, 33, 48]
export const LATE_MS = 18 * 60_000
export const STALL_MS = 30 * 60_000

const PARAM_HE: Record<string, string> = {
  timeframe: 'טווח נר',
  trend_timeframe: 'נר מגמה',
  ema_fast: 'ממוצע מהיר',
  ema_slow: 'ממוצע איטי',
  trend_ema: 'ממוצע מגמה',
  rsi_period: 'RSI',
  rsi_long_max: 'RSI מקסימום ללונג',
  rsi_short_min: 'RSI מינימום לשורט',
  atr_period: 'ATR',
  sl_atr_mult: 'סטופ × ATR',
  tp_atr_mult: 'יעד × ATR',
  leverage: 'מינוף',
  exit_on_opposite_cross: 'יציאה בחצייה הפוכה',
  bb_period: 'בולינגר',
  bb_std: 'סטיית תקן',
  rsi_oversold: 'RSI מכירת יתר',
  rsi_overbought: 'RSI קניית יתר',
}

export const WHY: Record<string, string> = {
  STOP_LOSS: 'סטופ',
  TAKE_PROFIT: 'יעד',
  LIQUIDATION: 'חיסול',
  SIGNAL_CLOSE: 'אות יציאה',
  OPEN: 'פתיחה',
  SIGNAL: 'אות',
  SIGNAL_FILTERED: 'אות סונן',
  RISK_REJECT: 'סיכון דחה',
  FUNDING: 'מימון',
  ORDER_REJECTED: 'פקודה נדחתה',
  CATCH_UP: 'השלמה',
  START: 'התחלה',
  CLOSE: 'סגירה',
  INFO: 'מידע',
}

export function contractSymbol(raw: unknown): string {
  if (raw && typeof raw === 'object') {
    const o = raw as { symbol?: unknown; sym?: unknown; instId?: unknown }
    return contractSymbol(o.symbol ?? o.sym ?? o.instId ?? '')
  }
  const x = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!x) return ''
  return x.endsWith('USDT') ? x : `${x}USDT`
}

export function baseCoin(symbol: string): string {
  return symbol.replace(/USDT$/, '')
}

/** Live tape + chart list. `universe` wins over `prices` when it is a non-empty array. */
export function liveSymbols(st: any): string[] {
  const normList = (xs: unknown): string[] => (Array.isArray(xs) ? xs.map(contractSymbol).filter(Boolean) : [])
  const universe = normList(st?.universe)
  const fromPrices = Object.keys(st?.prices ?? {}).map(contractSymbol).filter(Boolean)
  const base = universe.length ? universe : fromPrices
  const open = normList((st?.positions ?? []).map((p: any) => p?.symbol))
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of [...base, ...open]) {
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export function nextDeskRun(now: number): number {
  const d = new Date(now)
  const hour = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
  const cur = (d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 1000 + d.getUTCMilliseconds()
  for (const slot of DESK_SLOTS_MIN) {
    const at = slot * 60_000
    if (cur <= at) return hour + at
  }
  return hour + 3_600_000 + DESK_SLOTS_MIN[0] * 60_000
}

export function deskPulse(lastTs: number | null, now: number): Pulse {
  if (lastTs == null || !Number.isFinite(lastTs)) return 'unknown'
  const age = now - lastTs
  if (age > STALL_MS) return 'stalled'
  if (age > LATE_MS) return 'late'
  return 'live'
}

export function lastCycleMs(st: any): number | null {
  const ts = Number(st?.last_ts)
  if (Number.isFinite(ts) && ts > 1e11) return ts
  const iso = Date.parse(String(st?.last_cycle ?? ''))
  return Number.isFinite(iso) ? iso : null
}

export type Act = {
  id: string
  ts: number
  type: string
  symbol: string
  msg: string
  pnl?: number
}

const CLOSE_TYPES = new Set(['STOP_LOSS', 'TAKE_PROFIT', 'LIQUIDATION', 'SIGNAL_CLOSE', 'CLOSE', 'SIGNAL'])

export function buildActivity(st: any): Act[] {
  const events = Array.isArray(st?.events) ? st.events : []
  const trades = Array.isArray(st?.trades) ? st.trades : []
  const items: Act[] = []
  for (const e of events) {
    const ts = Number(e?.ts)
    if (!Number.isFinite(ts)) continue
    const type = String(e?.type || 'EVENT')
    const symbol = contractSymbol(e?.symbol)
    const msg = String(e?.msg ?? '')
    const amount = Number(e?.amount)
    items.push({
      id: `e:${ts}:${type}:${symbol}:${msg}`,
      ts, type, symbol, msg,
      pnl: Number.isFinite(amount) ? amount : undefined,
    })
  }
  for (const t of trades) {
    const ts = Number(t?.close_ts)
    const symbol = contractSymbol(t?.symbol)
    const reason = String(t?.reason || 'CLOSE')
    const pnl = Number(t?.net_pnl)
    if (!Number.isFinite(ts) || !symbol) continue
    const near = items.filter((i) => i.symbol === symbol && Math.abs(i.ts - ts) < 120_000)
    const host = near.find((i) => i.type === reason) ?? near.find((i) => CLOSE_TYPES.has(i.type))
    if (host && host.pnl == null && Number.isFinite(pnl)) host.pnl = pnl
    const covered = near.some((i) => i.type === reason || i.type === 'LIQUIDATION' || i.type === 'STOP_LOSS' || i.type === 'TAKE_PROFIT' || i.type === 'SIGNAL_CLOSE')
    if (!covered) {
      items.push({
        id: `t:${symbol}:${t?.open_ts}:${ts}:${reason}`,
        ts, type: reason, symbol,
        msg: `${t?.side === 'SHORT' ? 'שורט' : 'לונג'} נסגר`,
        pnl: Number.isFinite(pnl) ? pnl : undefined,
      })
    }
  }
  items.sort((a, b) => b.ts - a.ts)
  return items
}

export function strategyRows(st: any): { name: string; timeframe: string; rows: { k: string; label: string; v: string }[] } {
  const s = st?.strategy ?? {}
  const name = String(s.name || '—')
  const timeframe = String(s.timeframe || s.params?.timeframe || '—')
  const params = s.params && typeof s.params === 'object' ? s.params : {}
  const rows = Object.keys(params).map((k) => ({
    k,
    label: PARAM_HE[k] || k,
    v: fmtParam(params[k]),
  }))
  return { name, timeframe, rows }
}

function fmtParam(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'כן' : 'לא'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000)
  if (typeof v === 'string') return v
  if (v == null) return '—'
  try { return JSON.stringify(v) } catch { return String(v) }
}

export function whyLabel(type: string): string {
  return WHY[type] || type
}
