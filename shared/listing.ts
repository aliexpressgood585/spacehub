// v99.0 — LIST sleeve: SHORT freshly listed Binance USDT-M perpetuals (owner 2026-10-01: "reset and open trades with
// something we have not thought of"). The owner chose to run it NOW, without a backtest and without GPT review
// (explicit Council override for this one change). It is NOT validated; every row is labelled experimental.
// Hypothesis (literature / market lore, not measured here): new perp listings drift DOWN over their first weeks
// (unlock / airdrop supply meets a launch-day bid). Rules frozen below; a change is a new version.
// Pure functions only: the live runner and the tests import this file.
export const LIST = {
  minAgeDays: 3,               // skip the first 3 days (launch-day squeezes, thin books)
  maxAgeDays: 30,              // only coins listed within the last 30 days
  minQuoteVol: 20_000_000,     // $20M traded in 24h
  maxSpreadBps: 10,
  stop: 0.20,                  // +20% against the short -> out
  target: 0.30,                // -30% in our favour -> out
  timeoutMs: 21 * 86_400_000,  // 21 days, then out at market
  maxOpen: 10,                 // concurrent LIST positions
  share: 1.0,                  // whole account over maxOpen slots (~10% each, 1x paper)
  scanMs: 60 * 60_000,         // entry scan once per hour
} as const

export interface Fresh { sym: string; s: string; k: number; ageDays: number; qv: number; spreadBps: number }

// candidates = universe pairs (already liquid, crypto-only, >= 3 days old) whose onboardDate is within maxAgeDays,
// excluding coins this sleeve has already traded (one short per listing), youngest first
export function freshListings(pairs: { sym: string; s: string; k: number; qv: number; spreadBps: number }[], exchangeInfo: any,
  now: number, traded: Set<string>): Fresh[] {
  const onboard = new Map<string, number>((exchangeInfo?.symbols ?? []).map((x: any) => [String(x.symbol), Number(x.onboardDate)]))
  const out: Fresh[] = []
  for (const p of pairs) {
    const ob = onboard.get(p.s)
    if (!(ob! > 0)) continue
    const ageDays = (now - ob!) / 86_400_000
    if (ageDays < LIST.minAgeDays || ageDays > LIST.maxAgeDays) continue
    if (traded.has(p.sym)) continue
    out.push({ ...p, ageDays: +ageDays.toFixed(2) })
  }
  return out.sort((a, b) => a.ageDays - b.ageDays)
}

// exit for an open SHORT given the executable mark (the ask)
export function listExit(entry: number, ask: number, openedAt: number, now: number): 'STOP' | 'TARGET' | 'TIMEOUT' | null {
  if (!(entry > 0) || !(ask > 0)) return null
  const r = -(ask / entry - 1)
  if (r <= -LIST.stop) return 'STOP'
  if (r >= LIST.target) return 'TARGET'
  if (now - openedAt >= LIST.timeoutMs) return 'TIMEOUT'
  return null
}
