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
  maxPosFrac: 0.10,           // top-ups never take one position above 10% of equity (a loss is -100% of it)
  maxPerEvent: 2,
  minQty: 5,                  // Polymarket minimum order size (shares)
} as const

export function inBand(p: number, lo: number = PM.lo, hi: number = PM.hi): boolean {
  return p >= lo && p <= hi
}
