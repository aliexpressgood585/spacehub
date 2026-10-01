// v99.6 — per-sleeve entry brake (owner 2026-10-01: an autonomous supervisor may change strategies without asking).
// bot_state.bot_params.sleeves_off = { "<SLEEVE>": { at, by, why } }. A listed sleeve opens NOTHING new; its open
// positions keep being managed and exited by the same runner. Safe direction only: this key can switch entries OFF,
// never on, never bigger — the sleeves that may run at all are still set by the deploy-time shim (__ENABLED_SLEEVES).
export const SLEEVES = ['LIST', 'FUND', 'FAST', 'EVT'] as const
export function sleeveOff(params: any, sleeve: string): boolean {
  const m = params?.sleeves_off
  return !!(m && typeof m === 'object' && m[sleeve])
}
