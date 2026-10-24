// "ערכת הדיי טריידר" — a crypto day-trading TOOLKIT for every USDT perpetual Binance Futures trades (owner 2026-10-24, inspired by
// an 11-skill stock pack). Pure rules, no I/O; used by the scanner (scripts/dtk-scan.ts) AND the page (trading-app daytrader.html).
// It is a decision aid with a human in the loop: it finds setups, plans the exit, replays the setup's own history and a Monte
// Carlo of the session, sizes the trade and checks it against limits. It never places a real order (paper journal only).
// HONEST PRIOR (CLAUDE.md v76-v123): every sub-hour crypto rule measured here lost after a ~16 bps round trip. The time machine is
// there to show exactly that before anyone trades: it charges the same costs.

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
export type Side = 'LONG' | 'SHORT'
export type SetupKind = 'ORB' | 'FLAG' | 'BOUNCE' | 'BURST'
export type Setup = { kind: SetupKind; side: Side; t: number; entry: number; stop: number; target: number; why: string; strength: number }

export const DTK = {
  bar: 5 * 60_000,
  orBars: 3,                 // opening range = first 15 minutes of the UTC day (crypto trades 24/7; 00:00 UTC is the daily open)
  holdBars: 48,              // a day trade is flat after 4 hours at the latest
  taker: 0.0005, slip: 0.0003, // per side, as everywhere in this repo (16 bps round trip)
  rr: { ORB: 1, FLAG: 1.5, BOUNCE: 1.5, BURST: 1.5 } as Record<SetupKind, number>,
  mcPaths: 10_000,
  limits: { maxLossUsd: 50, dayLossUsd: 150, tradesPerDay: 4, minRR: 1, maxSpreadBps: 10, minVolUsd: 10e6, maxCostOfR: 0.25, crowdedFunding: 0.0005, liqVsStop: 2 },
  account: 5000, leverage: 5,
}
export const KIND_HE: Record<SetupKind, string> = { ORB: 'פריצת טווח פתיחה', FLAG: 'דגל', BOUNCE: 'היפוך מקיצון', BURST: 'פרץ נפח' }
const sgn = (s: Side) => (s === 'LONG' ? 1 : -1)

export function atr(b: Bar[], n = 14): number {
  if (b.length < n + 1) return NaN
  let s = 0
  for (let i = b.length - n; i < b.length; i++) s += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c))
  return s / n
}
export function rsi(c: number[], n = 14): number {
  if (c.length < n + 1) return NaN
  let g = 0, l = 0
  for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; d > 0 ? (g += d) : (l -= d) }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l)
}
const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length)

// Setups on CLOSED 5m bars; b[i] is the bar that just closed. Each setup carries its own stop and target (the exit plan).
export function setupsAt(b: Bar[], i: number): Setup[] {
  const out: Setup[] = [], x = b[i]
  if (i < 30) return out
  const w = b.slice(Math.max(0, i - 300), i + 1), I = w.length - 1, a = atr(w), mk = (kind: SetupKind, side: Side, stop: number, why: string, strength: number) => {
    const r = Math.abs(x.c - stop); if (!(r > 0)) return
    out.push({ kind, side, t: x.t, entry: x.c, stop, target: x.c + sgn(side) * r * DTK.rr[kind], why, strength })
  }
  // ORB: the first 5m close beyond the UTC-day opening range; stop at the range midpoint
  const d0 = Math.floor(x.t / 86400_000) * 86400_000, k0 = w.findIndex((y) => y.t >= d0)
  if (k0 >= 0 && w[k0].t - d0 < DTK.bar && I >= k0 + DTK.orBars) {
    const or = w.slice(k0, k0 + DTK.orBars), hi = Math.max(...or.map((y) => y.h)), lo = Math.min(...or.map((y) => y.l)), mid = (hi + lo) / 2
    const before = w.slice(k0 + DTK.orBars, I)
    if (x.c > hi && !before.some((y) => y.c > hi)) mk('ORB', 'LONG', mid, `נר 5 דקות נסגר מעל טווח הפתיחה ${hi.toPrecision(6)}`, (x.c - hi) / (hi - lo || 1))
    if (x.c < lo && !before.some((y) => y.c < lo)) mk('ORB', 'SHORT', mid, `נר 5 דקות נסגר מתחת לטווח הפתיחה ${lo.toPrecision(6)}`, (lo - x.c) / (hi - lo || 1))
  }
  // FLAG: a pole of >= 3 ATR in 6 bars, then 3-8 bars that hold more than half of it, then a close beyond the flag
  if (a > 0) for (let f = 3; f <= 8; f++) {
    const fl = w.slice(I - f, I), pole = w.slice(I - f - 6, I - f + 1)
    if (pole.length < 7) break
    const up = pole[pole.length - 1].c - pole[0].o, fh = Math.max(...fl.map((y) => y.h)), flo = Math.min(...fl.map((y) => y.l))
    if (up >= 3 * a && flo > pole[pole.length - 1].c - up / 2 && x.c > fh) { mk('FLAG', 'LONG', flo, `מוט של ${(up / a).toFixed(1)} ATR ודגל של ${f} נרות נפרץ למעלה`, up / a); break }
    if (-up >= 3 * a && fh < pole[pole.length - 1].c - up / 2 && x.c < flo) { mk('FLAG', 'SHORT', fh, `מוט של ${(-up / a).toFixed(1)} ATR ודגל של ${f} נרות נשבר למטה`, -up / a); break }
  }
  // BOUNCE: RSI14 was below 30 (above 70) on the previous bar and this bar closes beyond the previous bar's high (low)
  const r1 = rsi(w.slice(0, -1).map((y) => y.c)), p = w[I - 1], lows = w.slice(I - 5, I + 1)
  if (r1 < 30 && x.c > p.h) mk('BOUNCE', 'LONG', Math.min(...lows.map((y) => y.l)), `RSI ${r1.toFixed(0)} (מכירת יתר) והנר נסגר מעל הגבוה הקודם`, (30 - r1) / 10)
  if (r1 > 70 && x.c < p.l) mk('BOUNCE', 'SHORT', Math.max(...lows.map((y) => y.h)), `RSI ${r1.toFixed(0)} (קניית יתר) והנר נסגר מתחת לנמוך הקודם`, (r1 - 70) / 10)
  // BURST: volume >= 3x the 20-bar average with a body > 1 ATR; stop one ATR back
  const va = avg(w.slice(I - 20, I).map((y) => y.v)), body = x.c - x.o
  if (a > 0 && va > 0 && x.v >= 3 * va && Math.abs(body) > a) mk('BURST', body > 0 ? 'LONG' : 'SHORT', x.c - Math.sign(body) * a, `נפח פי ${(x.v / va).toFixed(1)} מהממוצע וגוף של ${(Math.abs(body) / a).toFixed(1)} ATR`, x.v / va / 3)
  return out
}

// Walk a trade forward bar by bar from the bar AFTER the signal: stop first when both levels are inside one bar (pessimistic),
// flat after holdBars at the close. Returns the outcome and the net R after both sides' fee + slippage.
export type Outcome = { res: 'TARGET' | 'STOP' | 'TIME'; R: number; bars: number }
export function walk(b: Bar[], i: number, s: Pick<Setup, 'side' | 'entry' | 'stop' | 'target'>, hold = DTK.holdBars): Outcome | null {
  const sg = sgn(s.side), risk = Math.abs(s.entry - s.stop); if (!(risk > 0)) return null
  const cost = (DTK.taker + DTK.slip) * 2 * s.entry / risk
  for (let k = i + 1; k < Math.min(b.length, i + 1 + hold); k++) {
    const y = b[k], adv = sg > 0 ? y.l <= s.stop : y.h >= s.stop, fav = sg > 0 ? y.h >= s.target : y.l <= s.target
    if (adv) return { res: 'STOP', R: -1 - cost, bars: k - i }
    if (fav) return { res: 'TARGET', R: Math.abs(s.target - s.entry) / risk - cost, bars: k - i }
  }
  const end = i + hold
  if (end >= b.length) return null                     // not finished yet: unknown, never counted
  return { res: 'TIME', R: sg * (b[end].c - s.entry) / risk - cost, bars: hold }
}

// Time machine, part 1: every past bar on which the SAME rule fired on this coin, walked forward with the same exit plan.
export type Replay = { n: number; target: number; stop: number; time: number; avgR: number; wr: number; t: number; sumR: number }
export function replay(b: Bar[], kind: SetupKind, side: Side, from = 30): Replay {
  const R: number[] = [], c = { TARGET: 0, STOP: 0, TIME: 0 }
  let busyUntil = -1
  for (let i = from; i < b.length; i++) {
    if (i <= busyUntil) continue                         // one trade at a time, like a person would take it
    const s = setupsAt(b, i).find((x) => x.kind === kind && x.side === side); if (!s) continue
    const o = walk(b, i, s); if (!o) continue
    R.push(o.R); c[o.res]++; busyUntil = i + o.bars
  }
  const n = R.length, m = avg(R), sd = n > 1 ? Math.sqrt(R.reduce((a, r) => a + (r - m) ** 2, 0) / (n - 1)) : 0
  return { n, target: c.TARGET, stop: c.STOP, time: c.TIME, avgR: n ? m : 0, wr: n ? R.filter((r) => r > 0).length / n : 0, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, sumR: R.reduce((a, r) => a + r, 0) }
}

// Time machine, part 2: Monte Carlo of the rest of the trade. Each step draws one real 5m bar of this coin from the same hour of
// the UTC day (its open->high / open->low / open->close moves) and applies it to the path. Seeded, so a run can be repeated.
// Each hour's moves are DE-MEANED: ~5 days give ~60 bars per hour, whose average close-to-open is mostly noise, and 48 steps of
// that noise would pass for a 1% drift (a bias, not an edge). The Monte Carlo therefore measures volatility vs the bracket only.
export function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
export type MC = { paths: number; target: number; stop: number; time: number; evR: number; poolBars: number }
export function monteCarlo(b: Bar[], s: Pick<Setup, 'side' | 'entry' | 'stop' | 'target' | 't'>, paths = DTK.mcPaths, seed = 19, hold = DTK.holdBars): MC {
  const pool: Array<Array<[number, number, number]>> = Array.from({ length: 24 }, () => [])
  for (const y of b) if (y.o > 0) pool[new Date(y.t).getUTCHours()].push([y.h / y.o - 1, y.l / y.o - 1, y.c / y.o - 1])
  for (const pl of pool) { const m = avg(pl.map((x) => x[2])); for (const x of pl) { x[0] -= m; x[1] -= m; x[2] -= m } }
  const all = pool.flat(), rnd = mulberry32(seed), sg = sgn(s.side), risk = Math.abs(s.entry - s.stop)
  const cost = (DTK.taker + DTK.slip) * 2 * s.entry / risk, tR = Math.abs(s.target - s.entry) / risk
  let tg = 0, sp = 0, tm = 0, sumR = 0
  if (!all.length || !(risk > 0)) return { paths: 0, target: 0, stop: 0, time: 0, evR: 0, poolBars: 0 }
  for (let p = 0; p < paths; p++) {
    let px = s.entry, done = false
    for (let k = 1; k <= hold; k++) {
      const hr = new Date(s.t + k * DTK.bar).getUTCHours(), pl = pool[hr].length >= 20 ? pool[hr] : all, [h, l, c] = pl[Math.floor(rnd() * pl.length)]
      const hi = px * (1 + h), lo = px * (1 + l)
      if (sg > 0 ? lo <= s.stop : hi >= s.stop) { sp++; sumR += -1 - cost; done = true; break }
      if (sg > 0 ? hi >= s.target : lo <= s.target) { tg++; sumR += tR - cost; done = true; break }
      px *= 1 + c
    }
    if (!done) { tm++; sumR += sg * (px - s.entry) / risk - cost }
  }
  return { paths, target: tg / paths, stop: sp / paths, time: tm / paths, evR: sumR / paths, poolBars: all.length }
}

// Budget: quantity so a stop-out loses at most maxLoss (fees included); margin at the chosen isolated leverage; liquidation price.
export type Budget = { qty: number; notional: number; margin: number; lossAtStop: number; profitAtTarget: number; liq: number; costUsd: number }
export function budget(s: Pick<Setup, 'side' | 'entry' | 'stop' | 'target'>, maxLoss: number, account: number, lev: number): Budget {
  const perUnit = Math.abs(s.entry - s.stop) + (DTK.taker + DTK.slip) * 2 * s.entry
  let qty = perUnit > 0 ? maxLoss / perUnit : 0
  qty = Math.min(qty, (account * lev) / s.entry)         // never more notional than the account allows at that leverage
  const notional = qty * s.entry, cost = (DTK.taker + DTK.slip) * 2 * notional, sg = sgn(s.side)
  return { qty, notional, margin: notional / lev, lossAtStop: qty * Math.abs(s.entry - s.stop) + cost, profitAtTarget: qty * Math.abs(s.target - s.entry) - cost,
    liq: s.entry * (1 - sg * (1 / lev - 0.005)), costUsd: cost }
}

// Budget for a given margin (whole-account sizing): qty = margin x lev / entry, same fields as budget().
export function budgetMargin(s: Pick<Setup, 'side' | 'entry' | 'stop' | 'target'>, margin: number, lev: number): Budget {
  const qty = margin > 0 && s.entry > 0 ? (margin * lev) / s.entry : 0, notional = qty * s.entry, cost = (DTK.taker + DTK.slip) * 2 * notional, sg = sgn(s.side)
  return { qty, notional, margin: notional / lev, lossAtStop: qty * Math.abs(s.entry - s.stop) + cost, profitAtTarget: qty * Math.abs(s.target - s.entry) - cost,
    liq: s.entry * (1 - sg * (1 / lev - 0.005)), costUsd: cost }
}

// Risk manager: every check that applies, PASS only if all pass. Inputs the scanner/page actually have; missing = shown, not passed.
export type Check = { k: string; ok: boolean | null; v: string }
export function riskChecks(s: Pick<Setup, 'side' | 'entry' | 'stop' | 'target'>, bu: Budget, ctx: { spreadBps?: number; volUsd?: number; funding?: number | null; dayPnl: number; tradesToday: number }, L = DTK.limits): { pass: boolean; checks: Check[] } {
  const risk = Math.abs(s.entry - s.stop), rr = Math.abs(s.target - s.entry) / risk, costR = (DTK.taker + DTK.slip) * 2 * s.entry / risk
  const liqDist = Math.abs(s.entry - bu.liq), sg = sgn(s.side), f = ctx.funding
  const checks: Check[] = [
    { k: `הפסד בסטופ ≤ $${L.maxLossUsd}`, ok: bu.lossAtStop <= L.maxLossUsd + 1e-6, v: `$${bu.lossAtStop.toFixed(2)}` },
    { k: `הפסד היום לא חצה $${L.dayLossUsd}`, ok: -ctx.dayPnl + bu.lossAtStop <= L.dayLossUsd, v: `היום ${ctx.dayPnl >= 0 ? '+' : '−'}$${Math.abs(ctx.dayPnl).toFixed(2)}` },
    { k: `עד ${L.tradesPerDay} עסקאות ביום`, ok: ctx.tradesToday < L.tradesPerDay, v: `${ctx.tradesToday} היום` },
    { k: `סיכוי:סיכון ≥ ${L.minRR}`, ok: rr >= L.minRR, v: rr.toFixed(2) },
    { k: `עלויות ≤ ${L.maxCostOfR * 100}% מהסיכון`, ok: costR <= L.maxCostOfR, v: `${(costR * 100).toFixed(0)}% מ-R` },
    { k: `מרווח ≤ ${L.maxSpreadBps}bps`, ok: ctx.spreadBps == null ? null : ctx.spreadBps <= L.maxSpreadBps, v: ctx.spreadBps == null ? 'לא ידוע' : `${ctx.spreadBps.toFixed(1)}bps` },
    { k: `מחזור 24ש ≥ $${L.minVolUsd / 1e6}M`, ok: ctx.volUsd == null ? null : ctx.volUsd >= L.minVolUsd, v: ctx.volUsd == null ? 'לא ידוע' : `$${(ctx.volUsd / 1e6).toFixed(1)}M` },
    { k: 'מימון לא צפוף נגדנו', ok: f == null ? null : sg * f < L.crowdedFunding, v: f == null ? 'לא ידוע' : `${(f * 100).toFixed(4)}%/8ש` },
    { k: `חיסול רחוק פי ${L.liqVsStop} מהסטופ`, ok: liqDist >= L.liqVsStop * risk, v: `חיסול ${bu.liq.toPrecision(6)}` },
  ]
  return { pass: checks.every((c) => c.ok === true), checks }
}

// News: which coins a headline names (a $TICKER or the base as a whole upper-case word, >= 3 letters; or a known name).
const NAMES: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum|ether', SOL: 'solana', XRP: 'ripple|xrp', DOGE: 'dogecoin', ADA: 'cardano', BNB: 'binance coin|bnb', AVAX: 'avalanche', LINK: 'chainlink', DOT: 'polkadot', LTC: 'litecoin', TON: 'toncoin', SUI: 'sui network', TRX: 'tron', SHIB: 'shiba inu', PEPE: 'pepe', HYPE: 'hyperliquid', NEAR: 'near protocol', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', UNI: 'uniswap', AAVE: 'aave' }
export function coinsIn(text: string, bases: string[]): string[] {
  const out = new Set<string>()
  for (const b of bases) {
    if (new RegExp(`\\$${b}\\b`).test(text) || (b.length >= 3 && new RegExp(`\\b${b}\\b`).test(text))) out.add(b)
    const n = NAMES[b]; if (n && new RegExp(`\\b(${n})\\b`, 'i').test(text)) out.add(b)
  }
  return [...out]
}
export function parseRss(xml: string): { title: string; link: string; at: number }[] {
  const items = xml.split(/<item[\s>]/).slice(1)
  const tag = (s: string, t: string) => (new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(s)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim()
  return items.map((s) => ({ title: tag(s, 'title'), link: tag(s, 'link'), at: Date.parse(tag(s, 'pubDate')) })).filter((x) => x.title && Number.isFinite(x.at))
}

// ---- the $1,000 demo account (owner 2026-10-24: "like real money, only demo") ----
// The scanner opens and closes positions by itself from the toolkit's setups, on live OKX books, with taker fees, slippage from
// walking the real order book, exits triggered exchange-side style (1-minute bars since the last check, stop first, gaps fill at the
// open) and funding charged at each real settlement. Sizing: 1% of equity lost at the stop (fees included), isolated 5x.
// Sizing (owner, 2026-10-24: "use the whole account", 5x, no daily stop): free cash is split as MARGIN between the entries the
// time machine approved in this scan (<= maxOpen open), notional = margin x lev. No per-trade loss cap and no daily loss stop;
// what still bounds a trade: the stop, isolated liquidation >= 2x the stop distance away, costs <= 25% of R, cash.
export const PAPER = { start: 1000, sizing: 'all' as const, lev: 5, maxOpen: 4, perDay: 20, chaseR: 0.3, tmMinN: 30, tmMinR: 0, tmDays: 20 }
// Time-machine gate: the demo account enters only a setup whose SAME rule on the SAME coin and side, replayed over the last
// PAPER.tmDays days with full costs, fired >= tmMinN times and averaged > tmMinR R. No replay = no entry (unknown is not a pass).
// NB a positive replay is a filter on past luck as much as on edge; the demo account is the out-of-sample check.
export function tmGate(r: Pick<Replay, 'n' | 'avgR'> | null | undefined): { ok: boolean; why: string } {
  if (!r) return { ok: false, why: 'אין נתוני מכונת זמן' }
  if (r.n < PAPER.tmMinN) return { ok: false, why: `מכונת הזמן: רק ${r.n} פעמים בעבר (צריך ${PAPER.tmMinN})` }
  if (!(r.avgR > PAPER.tmMinR)) return { ok: false, why: `מכונת הזמן שלילית: ${r.n} פעמים, ממוצע ${r.avgR.toFixed(2)}R` }
  return { ok: true, why: `מכונת הזמן: ${r.n} פעמים, ממוצע +${r.avgR.toFixed(2)}R` }
}
// Market order of `qty` coins into one side of the book ([price, coins] best first): VWAP of what the visible book absorbs.
export function walkBook(levels: [number, number][], qty: number): { vwap: number; filled: number } {
  let left = qty, cost = 0
  for (const [p, q] of levels) { if (left <= 0) break; const x = Math.min(left, q); cost += x * p; left -= x }
  const filled = qty - left
  return { vwap: filled > 0 ? cost / filled : NaN, filled }
}
// Which exit an exchange-side stop / take-profit would have hit since the last check. bars = 1m bars (the forming one included),
// since = time of the last check. Stop first when one minute touches both; a minute that OPENS beyond a level fills at that open.
export function exitTrigger(bars: Bar[], side: Side, stop: number, target: number, since: number): { why: 'STOP' | 'TARGET'; px: number; t: number } | null {
  const sg = sgn(side)
  for (const b of bars) {
    if (b.t + 60_000 <= since) continue
    if (sg * (b.o - stop) <= 0) return { why: 'STOP', px: b.o, t: b.t }
    if (sg * (b.o - target) >= 0) return { why: 'TARGET', px: b.o, t: b.t }
    if (sg > 0 ? b.l <= stop : b.h >= stop) return { why: 'STOP', px: stop, t: b.t }
    if (sg > 0 ? b.h >= target : b.l <= target) return { why: 'TARGET', px: target, t: b.t }
  }
  return null
}
