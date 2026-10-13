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

export interface Rule { tf: Tf; coins: string[]; enterFrom: number; enterTo: number; lo: number; hi: number }
export const PMC = {
  rules: [{ tf: '5m', coins: ['btc', 'eth', 'sol', 'xrp'], enterFrom: 180, enterTo: 140, lo: 0.90, hi: 0.98 }] as Rule[],
  maxPosFrac: 0.25,           // ALL CASH (owner 2026-10-13): free cash split equally between this cycle's entries, each <= 25% of equity
  maxOpen: 12,
  minQty: 5,                  // Polymarket minimum order size (shares)
  slipCap: 0.01,              // never pay more than hi + this when walking the book
}

// The market window that contains `nowSec` for a timeframe, and its slug.
export function windowOf(tf: Tf, nowSec: number) {
  const sec = TF_SEC[tf], start = Math.floor(nowSec / sec) * sec
  return { start, end: start + sec, left: start + sec - nowSec }
}
export const slugOf = (coin: string, tf: Tf, start: number) => `${coin}-updown-${tf}-${start}`

// Inside a rule's entry window? (seconds left before the end, inclusive bounds)
export const inWindow = (r: Rule, left: number) => left <= r.enterFrom && left >= r.enterTo
export const inBandR = (r: Rule, p: number) => p >= r.lo && p < r.hi

// Deterministic Hebrew title: "ביטקוין · עולה או יורד · 15 דקות · 14:15–14:30 UTC"
export function questionHe(coin: string, tf: Tf, start: number) {
  const hm = (s: number) => new Date(s * 1000).toISOString().slice(11, 16)
  return `${COIN_HE[coin] ?? coin.toUpperCase()} · עולה או יורד · ${TF_HE[tf]} · ${hm(start)}–${hm(start + TF_SEC[tf])} UTC`
}
