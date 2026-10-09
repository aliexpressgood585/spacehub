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

// The strategy chosen by the research (backtest/research/pm_research.py -> status/pm-research.txt).
export const PM = {
  // status/pm-research.txt (7,486 resolved markets, 2025-09..2026-10, 70/30 time split): favourites 0.70-0.99 LOSE
  // 2-7% per $ after costs at every horizon; the 15-30c band is positive at EVERY horizon in BOTH halves
  // (H6 +2.5/+10.6, H24 +9.1/+11.4, H72 +11.0/+7.7 %/$, best t 2.3). Chosen for robustness across the grid, not
  // the single best in-sample cell (that was 5-15c, which halved out of sample). Not proven: t < 2.5, ~6 months.
  lo: 0.15, hi: 0.30,         // buy the outcome whose ask sits in this band (an underdog)
  windowH: 72,                // ... only when the market is due to end within this many hours
  minVolume: 20000,           // market volume floor (USDC)
  stakeFrac: 0.03,            // 3% of current equity per position (wins ~27% of the time: small, many)
  maxOpen: 30,
  maxPerEvent: 1,
  minQty: 5,                  // Polymarket minimum order size (shares)
} as const

export function inBand(p: number, lo: number = PM.lo, hi: number = PM.hi): boolean {
  return p >= lo && p <= hi
}
