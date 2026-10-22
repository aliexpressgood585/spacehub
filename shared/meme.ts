// "ממים חיים" — PAPER desk for new Solana meme coins on pump.fun, priced from the LIVE bonding curve (and, after a coin
// graduates, from its DEX pool via DexScreener). Pure rules + fill maths; the runner is scripts/meme-desk.ts.
// REALISM: a buy/sell is filled against the curve reserves read AFTER the decision (the runner waits and re-reads), with the
// pump.fun fee and a network fee per transaction; our own size moves the price (constant product). What it cannot model:
// bots that see our order first, and tokens that cannot be sold — the latter is reduced by trading only pump.fun program
// coins (fixed supply, no freeze authority). NOT a proven strategy: the entry rule is a momentum demo, measured live.

export const MEME = {
  startCash: 1000,
  stakeFrac: 0.02,           // 2% of equity per entry
  maxOpen: 10,
  maxEntriesPerCycle: 2,
  curveFee: 0.0125,          // pump.fun bonding-curve fee per side (protocol + creator), conservative
  dexFee: 0.003,             // pool fee after graduation
  txFeeSol: 0.001,           // network + priority fee per transaction
  gradSol: 85,               // real SOL in the curve at graduation (progress = real_sol / gradSol)
  // entry (momentum on the curve)
  minAgeMin: 1, maxAgeMin: 120,
  minProgress: 0.15, maxProgress: 0.80,
  minRise: 0.12,             // market cap +12% vs a snapshot 30-180 s old
  snapMinS: 30, snapMaxS: 180,
  maxIdleS: 60,              // last trade at most 60 s ago
  needSocial: true,          // twitter / telegram / website present
  // exits
  tp: 0.5, sl: -0.3, maxHoldMin: 30,
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
export function exitReason(pnlPct: number, heldMin: number): string | null {
  if (pnlPct >= MEME.tp) return 'TP'
  if (pnlPct <= MEME.sl) return 'SL'
  if (heldMin >= MEME.maxHoldMin) return 'TIME'
  return null
}
