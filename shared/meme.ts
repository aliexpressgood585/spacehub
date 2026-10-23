// "ממים חיים" — PAPER desk for new Solana meme coins on pump.fun, priced from the LIVE bonding curve (and, after a coin
// graduates, from its DEX pool via DexScreener). Pure rules + fill maths; the runner is scripts/meme-desk.ts.
// REALISM: a buy/sell is filled against the curve reserves read AFTER the decision (the runner waits and re-reads), with the
// pump.fun fee and a network fee per transaction; our own size moves the price (constant product). What it cannot model:
// bots that see our order first, and tokens that cannot be sold — the latter is reduced by trading only pump.fun program
// coins (fixed supply, no freeze authority). NOT a proven strategy: the entry rule is a momentum demo, measured live.

export const MEME = {
  era: 2,                    // v2 reset 2026-10-23 (owner): $1,000 again, runner exits; v1 archived as meme/state-v1.json
  startCash: 1000,
  stakeFrac: 0.01,           // 1% of equity per entry (v1: 2%) — a lottery-ticket stake: most entries lose
  maxOpen: 10,
  maxEntriesPerCycle: 2,
  curveFee: 0.0125,          // pump.fun bonding-curve fee per side (protocol + creator), conservative
  dexFee: 0.003,             // pool fee after graduation
  txFeeSol: 0.001,           // network + priority fee per transaction
  gradSol: 85,               // real SOL in the curve at graduation (progress = real_sol / gradSol)
  // entry (momentum on the curve)
  minAgeMin: 0.5, maxAgeMin: 120,
  minProgress: 0.05, maxProgress: 0.80,
  minRise: 0.05,             // market cap +5% vs a snapshot 30-180 s old
  snapMinS: 30, snapMaxS: 180,
  maxIdleS: 60,              // last trade at most 60 s ago
  needSocial: true,          // twitter / telegram / website present
  // exits — RUNNER (v2): sell half at +100% so the stake is back, let the other half ride with a trailing stop
  halfAt: 1.0,               // +100% on the position -> sell half
  sl: -0.3,                  // stop before the half is sold (fills where the price lands: gaps measured at ~-46% in v1)
  trail: 0.3,                // the riding half exits 30% below its best value
  maxHoldMin: 30,            // no +100% within 30 min -> out
  runnerMaxHoldMin: 1440,    // the riding half is closed after 24 h at the latest
} as const

export type Curve = { vS: number; vT: number; rT: number }      // virtual SOL / token reserves (raw units), real tokens left
const LAMPORTS = 1e9

// SOL in -> tokens out (raw units), fee taken from the SOL side
export function buyTokens(c: Curve, sol: number, fee = MEME.curveFee): number {
  const s = sol * (1 - fee) * LAMPORTS, out = c.vT - (c.vS * c.vT) / (c.vS + s)
  return Math.max(0, Math.min(out, c.rT))
}
// tokens in -> SOL out (net of fee)
export function sellSol(c: Curve, tok: number, fee = MEME.curveFee): number {
  const out = c.vS - (c.vS * c.vT) / (c.vT + tok)
  return Math.max(0, out / LAMPORTS * (1 - fee))
}
// pool sale after graduation: price in SOL per raw token, quote-side liquidity in SOL (constant-product impact)
export function dexSellSol(priceNative: number, quoteSol: number, tok: number): number {
  const gross = priceNative * tok
  if (!(gross > 0) || !(quoteSol > 0)) return 0
  return (gross * quoteSol / (quoteSol + gross)) * (1 - MEME.dexFee)
}

export const progressOf = (realSol: number) => realSol / MEME.gradSol

export type Coin = { mint: string; symbol: string; created: number; lastTrade: number; mc: number; realSol: number; social: boolean; ok: boolean }
export function entryCheck(c: Coin, past: number | undefined, now: number) {
  const age = (now - c.created) / 60_000, prog = progressOf(c.realSol), idle = (now - c.lastTrade) / 1000
  const rise = past && past > 0 ? c.mc / past - 1 : NaN
  const checks = [
    { k: 'מטבע pump.fun תקין', ok: c.ok },
    { k: `גיל ${MEME.minAgeMin}-${MEME.maxAgeMin} דק׳`, ok: age >= MEME.minAgeMin && age <= MEME.maxAgeMin, v: age.toFixed(1) },
    { k: `התקדמות בעקומה ${MEME.minProgress * 100}-${MEME.maxProgress * 100}%`, ok: prog >= MEME.minProgress && prog <= MEME.maxProgress, v: (prog * 100).toFixed(0) + '%' },
    { k: `עלייה ≥ ${MEME.minRise * 100}% בדקות האחרונות`, ok: rise >= MEME.minRise, v: Number.isFinite(rise) ? (rise * 100).toFixed(0) + '%' : '—' },
    { k: `מסחר ב-${MEME.maxIdleS} שנ׳ האחרונות`, ok: idle <= MEME.maxIdleS, v: idle.toFixed(0) + 's' },
    { k: 'יש רשת חברתית', ok: !MEME.needSocial || c.social },
  ]
  return { ok: checks.every((x) => x.ok), checks, rise, prog }
}
// v2 runner. rem = return of the tokens still held vs their share of the cost; peak = best rem seen; half = half already sold.
// Returns 'HALF' (sell half), 'SL' / 'TIME' (close all before the half), 'TRAIL' / 'TIME' (close the riding half) or null.
export function runnerExit(rem: number, peak: number, heldMin: number, half: boolean): 'HALF' | 'SL' | 'TRAIL' | 'TIME' | null {
  if (!half) {
    if (rem >= MEME.halfAt) return 'HALF'
    if (rem <= MEME.sl) return 'SL'
    return heldMin >= MEME.maxHoldMin ? 'TIME' : null
  }
  if (1 + rem <= (1 + peak) * (1 - MEME.trail)) return 'TRAIL'
  return heldMin >= MEME.runnerMaxHoldMin ? 'TIME' : null
}
