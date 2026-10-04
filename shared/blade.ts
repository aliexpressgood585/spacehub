// BLADE — paper event attack engine (quant/PREREGISTRATION_BLADE.md, rules frozen 2026-10-03 before any result).
// Silent almost all the time; acts only on Binance listing / delisting announcements, the one fast move in this repo
// that is larger than costs (v114bt-D). Pure functions only: no network, no database. The live runner is
// supabase/functions/trading-bot/blade-runner.ts; the historical check is backtest/research/v122_blade_events.ts.
import { parseAnnouncementV2, announcementAge, median, type EventKind } from './events.ts'
import type { AggTrade } from './fast.ts'

export type BladeLevel = 'SHADOW' | 'PROBE' | 'ATTACK' | 'HALT'
export type BladeId = 'BL1' | 'BD1'
export const BLADE = {
  maxAgeMs: 30_000,               // announcement older than this at decision time -> skip, never chase
  quoteMaxAgeMs: 5_000,
  maxSpreadBps: 8,
  expectedMove: { LIST: 0.065, DELIST: 0.126 } as Record<EventKind, number>,   // v114bt-D first-minute medians
  impactOfMove: 0.25,             // walked impact must stay <= 25% of the expected first-minute move
  lev: 5, maint: 0.005,           // isolated, paper; liquidation checked before the stop
  fee: 0.0005, slip: 0.0005,      // taker per side; adverse slip on market exits (stops, timeouts)
  list: { stop: 0.04, scaleAt: 0.03, scaleFrac: 0.5, trailAtr: 1.5, maxMs: 15 * 60_000 },
  delist: { stop: 0.04, target: 0.07, maxMs: 240 * 60_000 },
  margin: { SHADOW: { BL1: 0, BD1: 0 }, PROBE: { BL1: 0.02, BD1: 0.02 }, ATTACK: { BL1: 0.08, BD1: 0.05 }, HALT: { BL1: 0, BD1: 0 } } as Record<BladeLevel, Record<BladeId, number>>,
  maxOpen: { SHADOW: 0, PROBE: 1, ATTACK: 3, HALT: 0 } as Record<BladeLevel, number>,
  probe: { minShadow: 10 },
  attack: { minPaper: 30, minPf: 1.2, maxDd: 0.15 },
  halt: { dayLoss: 0.06, streak: 5 },
  lagCapMs: 15_000, lagWindow: 10,
} as const
const RANK: Record<BladeLevel, number> = { HALT: -1, SHADOW: 0, PROBE: 1, ATTACK: 2 }

// one candidate per (announcement, coin with a perp)
export interface BladeCand { id: BladeId; kind: EventKind; side: 1 | -1; coin: string; perp: string; releaseDate: number; title: string }
export function bladeCandidates(title: string, releaseDate: number, perpOf: (coin: string) => string | null, liquid: (perp: string) => boolean): BladeCand[] {
  const ev = parseAnnouncementV2(title)
  if (!ev) return []
  const out: BladeCand[] = []
  for (const coin of ev.syms) {
    const perp = perpOf(coin)
    if (!perp) continue
    if (ev.kind === 'DELIST' && !liquid(perp)) continue   // delist shorts only on perps in our liquid universe
    out.push({ id: ev.kind === 'LIST' ? 'BL1' : 'BD1', kind: ev.kind, side: ev.kind === 'LIST' ? 1 : -1, coin, perp, releaseDate: Number(releaseDate), title })
  }
  return out
}

// entry gates in the pre-registered order; null = pass
export interface GateIn { kind: EventKind; releaseDate: number; now: number; quoteTs: number; bid: number; ask: number; walkImpact: number; walkBeyond: boolean }
export function bladeGate(x: GateIn): string | null {
  const age = announcementAge(x.releaseDate, x.now)
  if (!Number.isFinite(age)) return 'bad_release_time'
  if (age > BLADE.maxAgeMs) return 'too_old'
  if (!(x.bid > 0) || !(x.ask > x.bid * 0.5) || !(x.now - x.quoteTs <= BLADE.quoteMaxAgeMs)) return 'stale_quote'
  const spreadBps = (x.ask / x.bid - 1) * 1e4
  if (!(spreadBps <= BLADE.maxSpreadBps)) return 'wide_spread'
  if (x.walkBeyond) return 'beyond_book'
  if (!(x.walkImpact <= BLADE.expectedMove[x.kind] * BLADE.impactOfMove)) return 'impact_too_high'
  return null
}

// size: margin fraction of equity at the level in use; notional = margin x lev, bounded by cash for the margin + fee
export function bladeSize(level: BladeLevel, id: BladeId, equity: number, cash: number): { margin: number; notional: number } {
  const f = BLADE.margin[level][id]
  if (!(f > 0) || !(equity > 0)) return { margin: 0, notional: 0 }
  let margin = equity * f
  const maxByCash = Math.max(0, cash) / (1 + BLADE.lev * BLADE.fee)
  margin = Math.min(margin, maxByCash)
  return { margin, notional: margin * BLADE.lev }
}
export const bladeLiq = (side: 1 | -1, entry: number, lev: number = BLADE.lev) => (lev > 1 ? entry * (1 - side * (1 / lev - BLADE.maint)) : side > 0 ? 0 : Infinity)

// position state carried on the row; `trail` = absolute trailing distance (1.5 x ATR1m) for BL1, 0 for BD1
export interface BladePos { id: BladeId; side: 1 | -1; entry: number; stop: number; target: number | null; scaleAt: number | null; scaled: boolean;
  trail: number; best: number; liq: number; openedAt: number; maxMs: number }
export function bladeOpen(id: BladeId, side: 1 | -1, entry: number, atr1m: number, openedAt: number, lev: number = BLADE.lev): BladePos {
  if (id === 'BL1') {
    const L = BLADE.list
    return { id, side, entry, stop: entry * (1 - side * L.stop), target: null, scaleAt: entry * (1 + side * L.scaleAt), scaled: false,
      trail: Math.max(0, L.trailAtr * (atr1m > 0 ? atr1m : 0)), best: entry, liq: bladeLiq(side, entry, lev), openedAt, maxMs: L.maxMs }
  }
  const D = BLADE.delist
  return { id, side, entry, stop: entry * (1 - side * D.stop), target: entry * (1 + side * D.target), scaleAt: null, scaled: false,
    trail: 0, best: entry, liq: bladeLiq(side, entry, lev), openedAt, maxMs: D.maxMs }
}

// Resolve the tape since the last check in time order (no look-ahead: each print sees the stop set by the prints before
// it). Returns the fills to book and the updated state. frac = share of the ORIGINAL size.
//  liquidation first, then the stop (fills at the print that crossed it, gap included), then the target / scale level
//  (fills AT the level, only on a print strictly beyond it), then the trailing ratchet, then the time limit.
export interface BladeFill { why: 'LIQUIDATION' | 'STOP' | 'TRAIL' | 'SCALE' | 'TARGET' | 'TIMEOUT'; px: number; T: number; frac: number }
export function bladeStep(p0: BladePos, trades: AggTrade[], now: number, mark: number | null): { pos: BladePos; fills: BladeFill[]; done: boolean } {
  const p: BladePos = { ...p0 }, fills: BladeFill[] = [], d = p.side
  let left = p.scaled ? 1 - BLADE.list.scaleFrac : 1
  for (const t of trades) {
    const px = t.p
    if (!(px > 0) || t.T < p.openedAt) continue
    if (t.T - p.openedAt > p.maxMs) break
    if (d * (px - p.liq) <= 0) { fills.push({ why: 'LIQUIDATION', px: p.liq, T: t.T, frac: left }); return { pos: p, fills, done: true } }
    if (d * (px - p.stop) <= 0) { fills.push({ why: p.scaled ? 'TRAIL' : 'STOP', px, T: t.T, frac: left }); return { pos: p, fills, done: true } }
    if (p.target !== null && d * (px - p.target) > 0) { fills.push({ why: 'TARGET', px: p.target, T: t.T, frac: left }); return { pos: p, fills, done: true } }
    if (!p.scaled && p.scaleAt !== null && d * (px - p.scaleAt) > 0) {
      fills.push({ why: 'SCALE', px: p.scaleAt, T: t.T, frac: BLADE.list.scaleFrac }); p.scaled = true; left = 1 - BLADE.list.scaleFrac
    }
    if (d * (px - p.best) > 0) p.best = px
    if (p.scaled && p.trail > 0) { const ns = p.best - d * p.trail; if (d * (ns - p.stop) > 0) p.stop = ns }   // from the NEXT print on
  }
  if (now - p.openedAt >= p.maxMs) {
    const px = mark !== null && mark > 0 ? mark : NaN
    if (Number.isFinite(px)) { fills.push({ why: 'TIMEOUT', px, T: now, frac: left }); return { pos: p, fills, done: true } }
  }
  return { pos: p, fills, done: false }
}
// net return of a fill on notional fraction `frac`: side move, taker fee both sides, slip on market exits
export function fillNet(side: 1 | -1, entry: number, f: BladeFill): number {
  const marketExit = f.why === 'STOP' || f.why === 'TRAIL' || f.why === 'TIMEOUT' || f.why === 'LIQUIDATION'
  const exit = marketExit ? f.px * (1 - side * BLADE.slip) : f.px
  return f.frac * (side * (exit / entry - 1) - 2 * BLADE.fee)
}

// ── levels ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface BladeEvt { net: number; closedAt: number; paper: boolean }   // one row per EVENT (coins of an announcement summed)
export function pf(xs: number[]): number { const w = xs.filter(x => x > 0).reduce((s, x) => s + x, 0), l = -xs.filter(x => x < 0).reduce((s, x) => s + x, 0); return l > 0 ? w / l : w > 0 ? Infinity : 0 }
export function maxDd(xs: number[]): number { let eq = 1, pk = 1, dd = 0; for (const x of xs) { eq *= 1 + x; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk) } return dd }
// level the record has earned (before the deploy cap and the halt)
export function earnedLevel(evts: BladeEvt[]): BladeLevel {
  const sh = evts.filter(e => !e.paper), pa = evts.filter(e => e.paper)
  const pnl = pa.map(e => e.net)
  if (pa.length >= BLADE.attack.minPaper && pf(pnl) >= BLADE.attack.minPf && pnl.reduce((s, x) => s + x, 0) > 0 && maxDd(pnl) < BLADE.attack.maxDd) return 'ATTACK'
  if (pa.length >= BLADE.attack.minPaper) return 'SHADOW'   // a failed paper sample goes back to shadow
  if (sh.length >= BLADE.probe.minShadow && sh.reduce((s, e) => s + e.net, 0) > 0) return 'PROBE'
  return 'SHADOW'
}
export function haltReason(paperToday: number, equity: number, streak: number): string | null {
  if (equity > 0 && paperToday <= -BLADE.halt.dayLoss * equity) return 'day_loss'
  if (streak >= BLADE.halt.streak) return 'loss_streak'
  return null
}
export function lossStreak(nets: number[]): number { let s = 0; for (let i = nets.length - 1; i >= 0 && nets[i] < 0; i--) s++; return s }
// level actually used: min(earned, deploy cap), capped at PROBE while detection is slow, HALT overrides
export function effectiveLevel(earned: BladeLevel, shimMax: string | undefined, listLagsMs: number[], halt: string | null): { level: BladeLevel; why: string } {
  if (halt) return { level: 'HALT', why: halt }
  const cap: BladeLevel = shimMax === 'ATTACK' || shimMax === 'PROBE' ? shimMax : 'SHADOW'
  let lvl: BladeLevel = RANK[earned] <= RANK[cap] ? earned : cap
  const why = [`earned ${earned}`, `cap ${cap}`]
  const lag = median(listLagsMs.slice(-BLADE.lagWindow))
  if (lvl === 'ATTACK' && !(lag <= BLADE.lagCapMs)) { lvl = 'PROBE'; why.push(`lag ${Number.isFinite(lag) ? Math.round(lag / 1000) + 's' : 'unmeasured'} > 15s`) }
  return { level: lvl, why: why.join(', ') }
}

// ── Weapon 2 (record only): clean liquidation clusters on the tape ───────────────────────────────────────────────
export interface LiqRow { symbol: string; side: string; usd: number; ts: number }
export function liqClusters(rows: LiqRow[], coins: Set<string>, minUsd = 250_000, minShare = 0.7, bucketMs = 10_000) {
  const m = new Map<string, { symbol: string; t: number; long: number; short: number }>()
  for (const r of rows) {
    if (!coins.has(r.symbol) || !(r.usd > 0)) continue
    const t = Math.floor(r.ts / bucketMs) * bucketMs, k = `${r.symbol}:${t}`
    const c = m.get(k) ?? { symbol: r.symbol, t, long: 0, short: 0 }
    if (r.side === 'long') c.long += r.usd; else c.short += r.usd
    m.set(k, c)
  }
  return [...m.values()].map(c => ({ ...c, usd: c.long + c.short, share: Math.max(c.long, c.short) / (c.long + c.short) }))
    .filter(c => c.usd >= minUsd && c.share >= minShare).sort((a, b) => a.t - b.t)
}

// ── Weapon 3 (measurement only): would a post-only limit at the touch have filled within 90 s? ──────────────────────
export function makerFilled(side: 1 | -1, limit: number, trades: AggTrade[], t0: number, windowMs = 90_000): { filled: boolean; T: number | null } {
  for (const t of trades) {
    if (t.T < t0) continue
    if (t.T - t0 > windowMs) break
    if (side * (t.p - limit) < 0) return { filled: true, T: t.T }   // a buy limit fills when a trade prints strictly below it
  }
  return { filled: false, T: null }
}
