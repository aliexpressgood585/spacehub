// Polymarket PAPER desk — pure rules shared by the pm-bot edge function, the research script and the tests.
// Nothing here talks to the network or the database.

// Taker fee as Polymarket publishes it per market (feeSchedule {rate, exponent, takerOnly}):
// fee in USDC = shares x rate x (p x (1 - p))^exponent. Markets with feesEnabled=false pay 0.
export interface FeeSchedule { rate: number; exponent: number }
export function takerFee(shares: number, p: number, fs: FeeSchedule | null): number {
  if (!fs || !(fs.rate > 0) || !(shares > 0)) return 0
  const x = Math.max(0, p * (1 - p))
  return shares * fs.rate * Math.pow(x, fs.exponent > 0 ? fs.exponent : 1)
}

// Walk the real ask book (price ascending) to spend at most `usd` on shares, never above `maxPx`.
// Returns shares bought and the volume-weighted price; 0 shares if the book has nothing in range.
export function walkAsks(asks: { price: number; size: number }[], usd: number, maxPx: number): { qty: number; vwap: number; spent: number } {
  let qty = 0, spent = 0
  for (const a of [...asks].sort((x, y) => x.price - y.price)) {
    if (!(a.price > 0) || a.price > maxPx || spent >= usd - 1e-9) break
    const take = Math.min(a.size, (usd - spent) / a.price)
    qty += take; spent += take * a.price
  }
  return { qty, vwap: qty > 0 ? spent / qty : 0, spent }
}

// v2 (2026-10-13, owner: "reset and build a strategy with >= 75% win rate"). v1 (buy 15-30c underdogs <=144h) went
// live 2026-10-09..13: 76 closes, WR 26%, -$337 on $1,000 — archived in pm/state-v1.json on pm-desk-data.
// backtest/research/pm_favourites.py -> status/pm-favourites.txt (7,486 resolved markets, 70/30 time split, +0.5-1c slip,
// real fee flag): buy the FAVOURITE priced 85-92c in the last 4h before resolution — IS n197 WR 91.4% +2.5%/$ (t 1.1),
// OOS n117 WR 92.3% +3.3%/$ (t 1.2); 3h: IS +4.1 / OOS +5.8%; 6h already negative. NOT proven (t < 2): the win rate is
// real, the profit per $ is thin and one loss (-100%) costs ~10 wins.
export const PM = {
  lo: 0.85, hi: 0.92,         // buy the outcome whose ask sits in this band (a favourite)
  windowH: 4,                 // ... only when the market is due to end within this many hours
  minVolume: 20000,           // market volume floor (USDC); the research history covers >= $20k only
  stakeFrac: 0.03,            // 3% of equity per position at entry
  maxOpen: 30,
  maxPosFrac: 0.05,           // top-ups never take one position above 5% of equity (a loss is -100% of it). Was 10% until
                              // 2026-10-14: one loss (~-$131) cost ~10 wins (owner: "now", after the desk analysis).
  maxPerEvent: 2,             // positions per MATCH (pmMatch: all of a game's market groups count as one)
  maxMatchFrac: 0.10,         // all positions on one match together <= 10% of equity (2026-10-14: three Man City v PSG
                              // markets — spread, O/U, exact score — sat in three Polymarket events and were one bet)
  minQty: 5,                  // Polymarket minimum order size (shares)
  exitPx: 0.99,               // early exit (2026-10-13): a position whose bid is >= this may be SOLD before resolution,
                              // ONLY to fund a new in-band entry that cash cannot cover (otherwise hold for $1)
} as const

// One key per real-world match: Polymarket splits a game into several events (e.g. 'ucl-mnc-psg-2026-10-14',
// '...-more-markets', '...-exact-score'); everything up to the date is the match.
// Crypto price markets (Bitcoin/Ethereum/Solana/XRP above / between / up-or-down / hit ...) are NOT traded by this desk
// since 2026-10-15: live 37 closes WR 84% -4.4%/$ (4 of them lost together within 4 minutes on 10-15) while the rest of the
// book earned +1.4%/$ on 112; and the 21,739-market crypto study (status/pmc-research.txt) found favourites there ~0 or
// negative without a distance filter. Those markets belong to Poly Coins, which has the filter.
export const isCryptoPrice = (slug: string, question = '') =>
  /\b(bitcoin|ethereum|solana|xrp|dogecoin|btc|eth|sol|bnb|hype)\b|(^|-)(btc|eth|sol|xrp)-updown/i.test(`${slug.replace(/-/g, ' ')} ${question}`) &&
  /price|above|below|between|up or down|updown|hit|dip|reach/i.test(`${slug.replace(/-/g, ' ')} ${question}`)

export const pmMatch = (eventSlug: string) => eventSlug.match(/^(.*?\d{4}-\d{2}-\d{2})/)?.[1] ?? eventSlug

export function inBand(p: number, lo: number = PM.lo, hi: number = PM.hi): boolean {
  return p >= lo && p <= hi
}

// Sell `qty` into the real bid book (price descending), never below `minPx`. All-or-nothing: if the book above minPx
// cannot absorb the whole position, returns null (a partial early exit would leave a stub and is not worth it).
export function walkBids(bids: { price: number; size: number }[], qty: number, minPx: number): { qty: number; vwap: number; got: number } | null {
  let left = qty, got = 0
  for (const b of [...bids].sort((x, y) => y.price - x.price)) {
    if (left <= 1e-9 || !(b.price >= minPx)) break
    const take = Math.min(b.size, left)
    got += take * b.price; left -= take
  }
  return left > 1e-9 || !(qty > 0) ? null : { qty, vwap: got / qty, got }
}

// Hebrew display of an outcome (owner 2026-10-13: "fix the translation of the team names"). Machine translation turned
// proper names into words ("Liquid" -> "נוזל", "BBL" -> "חבית", "100 Thieves" -> "100 גנבים"). Only generic answers are
// translated, from this fixed list; any other outcome is a team / player / option NAME and is shown exactly as listed.
const OUTCOME_HE: Record<string, string> = {
  yes: 'כן', no: 'לא', up: 'עולה', down: 'יורד', over: 'מעל', under: 'מתחת', draw: 'תיקו', tie: 'תיקו',
  higher: 'גבוה יותר', lower: 'נמוך יותר', above: 'מעל', below: 'מתחת', even: 'זוגי', odd: 'אי־זוגי', other: 'אחר', none: 'אף אחד',
}
export function heOutcome(outcome: string): string {
  return OUTCOME_HE[String(outcome ?? '').trim().toLowerCase()] ?? outcome
}
export const isGenericOutcome = (o: string) => String(o ?? '').trim().toLowerCase() in OUTCOME_HE

// A translated question is kept only if every NAME it mentions survived. `names` = the market's non-generic outcomes;
// if one of them appears in the English question but not in the Hebrew one, the translator renamed it, so the English
// question is shown instead (a correct English title beats a wrong Hebrew one).
export function namesKept(question: string, translated: string | undefined, names: string[]): boolean {
  if (!translated) return false
  const low = (x: string) => x.toLowerCase().replace(/\s+/g, ' ')
  const q = low(question), t = low(translated)
  return names.filter((x) => x && !isGenericOutcome(x) && q.includes(low(x))).every((x) => t.includes(low(x)))
}

// Supervisor gates as a READ-OUT only (2026-10-18). docs/POLY_SUPERVISOR.md defines step-down (n >= 100, mean r < 0,
// t <= -1.5) and stop (n >= 200, mean r < 0, t <= -2.5) on judged closes, r = pnl / cost. The supervisor session that
// acted on them was switched off by the owner on 2026-10-17 and the desk must not be paused automatically, so the runner
// only PUBLISHES where the gates stand (st.gates); nothing in the desk reads it. Missing values stay null.
export function gateStudy(trades: any[], since: string) {
  const r = trades.filter((t) => t.status === 'CLOSED' && (t.opened_at ?? '') >= since && t.cost > 0 && Number.isFinite(t.pnl)).map((t) => t.pnl / t.cost)
  const n = r.length, m = n ? r.reduce((a, x) => a + x, 0) / n : null
  const sd = n > 1 && m != null ? Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : null
  const t = m != null && sd ? (m / sd) * Math.sqrt(n) : null
  return { since, n, mean_r: m, t, step_down_hit: n >= 100 && m != null && m < 0 && t != null && t <= -1.5,
    stop_hit: n >= 200 && m != null && m < 0 && t != null && t <= -2.5, action: 'none (read-out only; supervisor off since 2026-10-17)' }
}

// ── FADE "jump fade" — a second PAPER sub-strategy, trades tagged strategy = 'fade' (the favourites rule = 'fav'), run
// ALONGSIDE the favourites rule on the same cash/equity (2026-10-18). It never replaces or changes the 'fav' rule.
// Research: backtest/research/pm_r5_new_strategies.py -> status/pm-r5-new-strategies.txt (pre-registered, OOS read once).
// Rule as backtested: non-sports, non-crypto, non-weather binary markets with volume >= $20k ending >= 24h later; when the
// price of outcome 0 moves >= 15c between two hourly points (<= 90 min apart) and lands in 15-85c, buy the side that just
// FELL and hold to the official result (no exit rule). First jump per market only.
// IS n934 WR 50.3% +10.2%/$ t 2.4 | OOS n401 WR 50.6% +8.0%/$ t 1.3 (mid + 1c, real fee), ~7.7 days held. One entry per
// event: IS n543 +14.3%/$ | OOS n233 +13.8%/$. WEAK, POSSIBLY LUCKY (30th OOS look): +2c slip OOS +5.4% (t 0.9), +3c +2.8%,
// +5c negative; entering an hour later +2.4%, and with 2c slip ~0; the top 20 trades carry ~68% of the summed return.
// Live: entry at the real ask, only if the walked fill stays <= observed price + 2c (the backtest is still positive at 2c).
// Limits = the desk's current ones, never more: 3% of equity per entry (= the whole position: no top-ups, so <= 5%), match
// cost incl. 'fav' positions <= 10% of equity, ONE fade entry per event ever, all open fade cost <= 20% of equity.
// Pre-committed kill: after >= 60 closed fade trades, mean r per $ <= 0 or t <= -2 -> NO NEW fade entries (open ones run to
// their result; the 'fav' rule is untouched). Defined in fadeKill() below.
export const FADE = {
  move: 0.15,              // |p_now - p_then| on outcome 0
  lo: 0.15, hi: 0.85,      // p_now (outcome 0) must sit here
  thenMinMin: 45, thenMaxMin: 90,   // p_then = a snapshot 45-90 min old, closest to 60 (research: hourly points <= 90 min apart)
  snapEveryMin: 20,        // a market's snapshot ring takes a point at most every 20 min; the signal is checked only then
  minEndH: 24,             // market ends >= 24h after the signal
  minVolume: 20000,
  stakeFrac: 0.03,         // = PM.stakeFrac, never more
  maxPremium: 0.02,        // buy only if the walked fill stays <= observed price of the bought side + 2c
  maxTotalFrac: 0.20,      // all open fade cost <= 20% of equity
  maxPerCycle: 3,
  pages: 5,                // Gamma pages of 100 markets (by volume) watched
  killMinN: 60, killT: -2, // kill: n closed >= 60 and (mean r <= 0 or t <= -2)
} as const
const SPORT_PFX = new Set(['cs2', 'lol', 'dota2', 'val', 'lec', 'lck', 'nfl', 'nba', 'mlb', 'nhl', 'cfb', 'cbb', 'wnba', 'kbo', 'npb', 'atp', 'wta', 'itf',
  'ufc', 'boxing', 'epl', 'ucl', 'uel', 'uecl', 'lal', 'bun', 'sea', 'fl1', 'mls', 'fifwc', 'fif', 'unl', 'arg', 'bra', 'bra2', 'mex', 'col', 'col1', 'sud', 'chi',
  'elc', 'clf', 'swe', 'spl', 'nor', 'ere', 'por', 'kor', 'jap', 'ja2', 'es2', 'bl2', 'tur', 'efl', 'crint', 'acle', 'crict20blast'])
// Fade universe: not sports / esports (no game start, no sports market type, no league prefix), not weather, not crypto.
export function fadeEligible(m: any, eventSlug: string): boolean {
  const pf = String(eventSlug ?? '').split('-')[0]
  if (m?.gameStartTime || m?.sportsMarketType || SPORT_PFX.has(pf)) return false
  if (/temperature|weather|rain/i.test(eventSlug ?? '')) return false
  return !isCryptoPrice(eventSlug ?? '', m?.question ?? '')
}
// Bounded snapshot ring per market: [ts, p0][] newest last, a point at most every snapEveryMin, nothing older than 2h
// (so <= 7 points per market). Only prices the runner itself saw: no lookahead.
export function fadeSnap(ring: [number, number][] | undefined, nowMs: number, p0: number): [number, number][] {
  const r = (ring ?? []).filter(([t]) => nowMs - t <= 2 * 3600_000 && t <= nowMs)
  if (!(p0 >= 0 && p0 <= 1)) return r
  if (!r.length || nowMs - r[r.length - 1][0] >= FADE.snapEveryMin * 60_000) r.push([nowMs, p0])
  return r
}
export const fadeDue = (ring: [number, number][] | undefined, nowMs: number) => !ring?.length || nowMs - ring[ring.length - 1][0] >= FADE.snapEveryMin * 60_000
// Signal (pure): current outcome-0 price vs the snapshot closest to 60 min old inside 45-90 min (points from the future,
// t > now, are ignored). Returns the outcome index to BUY (the side that fell) and its observed price, or null.
export function fadeSignal(ring: [number, number][] | undefined, nowMs: number, p0: number): { k: 0 | 1; px: number; then: number; thenAt: number } | null {
  if (!(p0 >= FADE.lo && p0 <= FADE.hi)) return null
  const old = (ring ?? []).filter(([t]) => t <= nowMs && nowMs - t >= FADE.thenMinMin * 60_000 && nowMs - t <= FADE.thenMaxMin * 60_000)
  if (!old.length) return null
  const [thenAt, then] = old.reduce((a, b) => (Math.abs(nowMs - b[0] - 3600_000) < Math.abs(nowMs - a[0] - 3600_000) ? b : a))
  const d = p0 - then
  if (Math.abs(d) < FADE.move) return null
  return d > 0 ? { k: 1, px: 1 - p0, then, thenAt } : { k: 0, px: p0, then, thenAt }
}
export const isFade = (t: { strategy?: string }) => t?.strategy === 'fade'
export const strategyOf = (t: { strategy?: string }) => (isFade(t) ? 'fade' : 'fav')   // untagged history = 'fav'
// Per-strategy read-out (display): closed n, WR, P&L, %/$ (mean pnl/cost per trade, as the backtest's r), t, open n/cost.
// Missing values are null, never 0.
export function stratStats(trades: any[]) {
  const c = trades.filter((t) => t.status === 'CLOSED' && t.cost > 0 && Number.isFinite(t.pnl)), o = trades.filter((t) => t.status === 'OPEN')
  const r = c.map((t) => t.pnl / t.cost), n = r.length, m = n ? r.reduce((a, x) => a + x, 0) / n : null
  const sd = n > 1 && m != null ? Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : null
  const pnl = n ? c.reduce((a, t) => a + t.pnl, 0) : null, cost = c.reduce((a, t) => a + t.cost, 0)
  return { n, wins: c.filter((t) => t.pnl > 0).length, wr: n ? c.filter((t) => t.pnl > 0).length / n : null, pnl,
    pct_per_usd: m, pnl_per_usd: n && cost ? (pnl as number) / cost : null, t: m != null && sd ? (m / sd) * Math.sqrt(n) : null,
    open: o.length, open_cost: o.reduce((a, t) => a + t.cost, 0) }
}
// Pre-committed kill criterion (stops NEW fade entries only).
export function fadeKill(trades: any[]) {
  const s = stratStats(trades.filter(isFade))
  const killed = s.n >= FADE.killMinN && ((s.pct_per_usd as number) <= 0 || (s.t != null && s.t <= FADE.killT))
  return { n: s.n, mean_r: s.pct_per_usd, t: s.t, killed, rule: `n >= ${FADE.killMinN} closed and (mean r <= 0 or t <= ${FADE.killT}) -> no new fade entries` }
}
