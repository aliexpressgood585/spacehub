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
