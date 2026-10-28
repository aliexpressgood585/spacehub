// "פולי מטבעות" — Polymarket PAPER desk for the SHORT crypto Up/Down markets only (owner 2026-10-13). Pure rules shared by
// scripts/pmc-desk.ts and tests/pmc.test.ts; no network, no database.
// Markets: {coin}-updown-{5m|15m|4h}-{eventStart epoch}, resolved by Polymarket from the Chainlink stream at the window end.
// Taker fee on these markets: feeSchedule {rate 0.07, exponent 1} -> 0.07 x p x (1-p) per share (pm.ts takerFee).
// Research (backtest/research/pmc_fetch.py + pmc_research.py + pmc_pooled.py -> status/pmc-research.txt), 21,739 resolved
// markets (5m 10 days, 15m 21 days, 4h 90 days; BTC/ETH/SOL/XRP), entry at the last price before end-L + 1c slip + the 0.07
// fee, 70/30 time split. VERDICT: these markets are priced almost exactly right. 520 grid rows, 38 positive in both halves
// (about what luck gives); the 100%-win rows (XRP / BTC 5m at 95-99c) are coin-picked subsets of ~100 trades. Pooled over all
// four coins nothing is significant. Chosen as the best HIGH-WIN-RATE rule that is positive in BOTH halves without coin
// picking: 5m, all four coins, buy the favourite at 90-98c three minutes before the end, hold to the result —
// IS n376 WR 94.9% +0.65%/$ (t 0.5), OOS n306 WR 94.8% +0.47%/$ (t 0.4). NOT PROVEN: ~break-even; one loss = -100% of a stake.

export type Tf = '5m' | '15m' | '4h'
export const TF_SEC: Record<Tf, number> = { '5m': 300, '15m': 900, '4h': 14400 }
export const COIN_HE: Record<string, string> = { btc: 'ביטקוין', eth: 'את׳ריום', sol: 'סולנה', xrp: 'XRP', bnb: 'BNB', doge: 'דוג׳קוין', hype: 'HYPE', zec: 'זיקאש' }
export const TF_HE: Record<Tf, string> = { '5m': '5 דקות', '15m': '15 דקות', '4h': '4 שעות' }

export interface Rule { tf: Tf; coins: string[]; enterFrom: number; enterTo: number; lo: number; hi: number; zMin?: number }   // zMin overrides PMC.zMin
export const PMC = {
  rules: [{ tf: '5m', coins: ['btc', 'eth', 'sol', 'xrp'], enterFrom: 180, enterTo: 140, lo: 0.90, hi: 0.98 },
          // v4 SECOND LOOK (owner 2026-10-14: "more quick trades"). Windows the first look did not enter get a second chance
          // 139-45 s before the end with a STRICTER distance (z >= 2.5). backtest/research/pmc_more.py -> status/pmc-more.txt,
          // 16,121 5m markets / 4,032 windows / 14 days, one position per window, coins in order:
          //   first look only            IS n277 WR 96.4% +2.10%/$ | OOS n115 97.4% +3.51%/$   ~28/day
          //   + second look z>=2.5       IS n561 WR 97.5% +1.96%/$ | OOS n222 98.6% +3.53%/$   ~56/day (t 2.8 / 4.3)
          //   added trades alone L120    IS n117 98.3% +2.05%/$ | OOS n44 100% +4.15%/$; L60 IS n201 99.0% +1.73%/$ | OOS n74 100% +3.17%/$
          // Rejected in the same run: band 85-90c (z>=1 flips to -3.3%/$ OOS), second look at z>=1 (IS -0.35%/$ at L120).
          // CAVEAT: the CLOB history has one price a minute; near the end the live ask may already sit above 98c (then no entry).
          { tf: '5m', coins: ['btc', 'eth', 'sol', 'xrp'], enterFrom: 139, enterTo: 45, lo: 0.90, hi: 0.98, zMin: 2.5 }] as Rule[],
  // v2 PROTECTION (owner 2026-10-14, after v1 went $1,000 -> $202 in clustered losses: "one, two or three losses must not
  // wipe the profits"). The four coins move together, so 4 x 25% was one 100% bet. Now:
  maxPosFrac: 0.03,           // a stake is at most 3% of equity
  maxPerWindow: 1,            // ONE position per 5m window (coins are correlated): the first in-band coin in rule order, BTC first (deepest book)
  floorFrac: 0.9,             // base floor = 90% of the starting cash
  lockFrac: 0.5,              // 50% of every new profit peak is locked into the floor (owner 2026-10-28: back from 0.7, which left $13 of room = below the min order, desk frozen since 10-24)
  lossesToFloor: 3,           // a stake is also <= (equity - floor) / 3, so three straight losses cannot cross the floor
  maxOpen: 2,
  minQty: 5,                  // Polymarket minimum order size (shares)
  slipCap: 0.01,              // never pay more than hi + this when walking the book
  // v3 DISTANCE FILTER (owner 2026-10-14: "a filter for a higher win rate"). z = ln(spot now / spot at the window's open) /
  // (sigma of 1 s log returns over the last hour x sqrt(seconds left)); buy the favourite only when z sits on its side and
  // |z| >= zMin. backtest/research/pmc_distance.py -> status/pmc-distance.txt, 11,511 5m markets, Binance 1s spot read at the
  // SAME second as the CLOB price point (the first run read spot 41 s after the price = look-ahead, 100% WR; fixed):
  //   90-98c, 180 s, +1c:  ALL IS n439 WR 95.2% +0.91%/$ | OOS n243 94.2% -0.04%/$
  //                        z>=1.5 IS n171 WR 98.2% +3.25%/$ | OOS n111 100% +5.23%/$   (same sign at 120 s / 60 s, every band)
  // NOT PROVEN live: the CLOB history is one point a minute; the live ask may already price the move. The live desk is the test.
  //   z>=1.0 IS n315 WR 97.1% +2.68%/$ t2.68 | OOS n187 97.3% +2.86%/$ t2.28 (~2x the trades of 1.5)
  // 2026-10-14 owner chose 1.0 (recommended): about the same expected profit per day at twice the trades, so the live check
  // of the edge (the history price may lag the real book) reaches ~100 trades in ~2 days instead of ~4. Every entry stores
  // meta.z; after ~100 closes compare the 1.0-1.5 bucket with >= 1.5 and go back to 1.5 if the lower bucket loses live.
  // 2026-10-14 ~23:30 UTC BACK TO 1.5 (owner approved). Live, 92 closes: z 1.0-1.5 n47, 4 losses, -$39.16;
  // z >= 1.5 n45, 1 loss, +$40.19 (1.5-2.5 n37 +$28.39, 2.5+ n8 +$11.80). The lower bucket took the account back to $1,001.
  // 2026-10-15 ~19:00 UTC 1.5 -> 2.0 (owner: "do what you think, bring profitability"). The 1.5-2.0 bucket is the weak one in
  // BOTH data sets: 180-day sample (status/pmc-long.txt) z 1.5-2.0 n330 WR 94.2% +0.44%/$ t0.3; first look 2.0 instead of 1.5
  // (status/pmc-long-zmin.txt): IS +1.72 vs +1.74%/$, OOS +2.13 vs +1.79%/$, losses 57 -> 42, maxDD 11.1% -> 9.0%. Live since
  // the 1.5 revert: z 1.5-2.0 n50, 4 losses, -$27.44 (-3.3%/$) = 50 of the 69 live trades. Fewer trades, the weakest cut.
  zMin: 2.0,
  maxOverRef: 0.01,           // never pay more than the LAST TRADED price + 1c (the research's cost assumption). v1 live
                              // (158 fills): BTC paid +0.29c over the last trade -> +1.13%/$; ETH +1.63c -> +0.51%; SOL +2.75c ->
                              // -3.40%; XRP +6.92c -> -4.66%. Thin books, not the rule, were the loss.
}

// Highest price we will pay: the band's cap, and (when the last trade is known) last trade + maxOverRef.
export const pmcPxCap = (hi: number, ref: number | null) => Math.min(hi + PMC.slipCap, ref != null && ref > 0 ? ref + PMC.maxOverRef : Infinity)

// Protected floor: 90% of the start, raised by 50% of every profit peak (the high-water mark). Never falls.
export const pmcFloor = (start: number, peak: number) => start * PMC.floorFrac + PMC.lockFrac * Math.max(0, peak - start)
// Stake for the next entry: min(3% of equity, room above the floor / 3). 0 when the account sits on its floor.
export function pmcStake(equity: number, peak: number, start: number) {
  const floor = pmcFloor(start, peak)
  return { floor, stake: Math.max(0, Math.min(equity * PMC.maxPosFrac, (equity - floor) / PMC.lossesToFloor)) }
}

// The market window that contains `nowSec` for a timeframe, and its slug.
export function windowOf(tf: Tf, nowSec: number) {
  const sec = TF_SEC[tf], start = Math.floor(nowSec / sec) * sec
  return { start, end: start + sec, left: start + sec - nowSec }
}
export const slugOf = (coin: string, tf: Tf, start: number) => `${coin}-updown-${tf}-${start}`

// Inside a rule's entry window? (seconds left before the end, inclusive bounds)
export const zMinOf = (r: Rule) => r.zMin ?? PMC.zMin
export const inWindow = (r: Rule, left: number) => left <= r.enterFrom && left >= r.enterTo
export const inBandR = (r: Rule, p: number) => p >= r.lo && p < r.hi

// Deterministic Hebrew title: "ביטקוין · עולה או יורד · 15 דקות · 14:15–14:30 UTC"
export function questionHe(coin: string, tf: Tf, start: number) {
  const hm = (s: number) => new Date(s * 1000).toISOString().slice(11, 16)
  return `${COIN_HE[coin] ?? coin.toUpperCase()} · עולה או יורד · ${TF_HE[tf]} · ${hm(start)}–${hm(start + TF_SEC[tf])} UTC`
}

// Distance from the window's opening price in units of the expected move for the time left (see PMC.zMin). sigma1s = stdev of
// 1-second log returns. Positive = above the open (Up is favoured).
export function pmcZ(open: number, now: number, sigma1s: number, leftS: number) {
  if (!(open > 0 && now > 0 && sigma1s > 0 && leftS > 0)) return NaN
  return Math.log(now / open) / (sigma1s * Math.sqrt(leftS))
}
export function sigmaOf(closes: number[]) {
  const r: number[] = []
  for (let i = 1; i < closes.length; i++) if (closes[i] > 0 && closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]))
  if (r.length < 600) return NaN
  const m = r.reduce((a, b) => a + b, 0) / r.length
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length)
}
