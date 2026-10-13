// "פולי מטבעות" — Polymarket PAPER desk for the SHORT crypto Up/Down markets only (owner 2026-10-13). Pure rules shared by
// scripts/pmc-desk.ts and tests/pmc.test.ts; no network, no database.
// Markets: {coin}-updown-{5m|15m|4h}-{eventStart epoch}, resolved by Polymarket from the Chainlink stream at the window end.
// Taker fee on these markets: feeSchedule {rate 0.07, exponent 1} -> 0.07 x p x (1-p) per share (pm.ts takerFee).
// Rule (research: backtest/research/pmc_research.py -> status/pmc-research.txt): see PMC below.

export type Tf = '5m' | '15m' | '4h'
export const TF_SEC: Record<Tf, number> = { '5m': 300, '15m': 900, '4h': 14400 }
export const COIN_HE: Record<string, string> = { btc: 'ביטקוין', eth: 'את׳ריום', sol: 'סולנה', xrp: 'XRP', bnb: 'BNB', doge: 'דוג׳קוין', hype: 'HYPE', zec: 'זיקאש' }
export const TF_HE: Record<Tf, string> = { '5m': '5 דקות', '15m': '15 דקות', '4h': '4 שעות' }

export interface Rule { tf: Tf; coins: string[]; enterFrom: number; enterTo: number; lo: number; hi: number }
export const PMC = {
  rules: [] as Rule[],        // filled from the research verdict
  stakeFrac: 0.04,            // fraction of equity per position
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
