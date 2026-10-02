// v99.6 — per-sleeve entry brake (owner 2026-10-01: an autonomous supervisor may change strategies without asking).
// Two sources, either one switches a sleeve's ENTRIES off; its open positions keep being managed and exited:
//  - deploy-time shim `__SLEEVES_OFF='FAST,EVT'` (both CI workflows): the hourly guardian routine has no database
//    access, so it brakes by editing the shim and pushing main (CI redeploys);
//  - bot_state.bot_params.sleeves_off = {"<SLEEVE>": {at, by, why}}: set by SQL from an interactive session.
// Safe direction only: neither can start a sleeve or raise size — the runnable set stays __ENABLED_SLEEVES.
export const SLEEVES = ['LIST', 'FUND', 'FAST', 'EVT', 'PRO'] as const
export function shimOff(): string[] {
  return String((globalThis as any).__SLEEVES_OFF ?? '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
}
export function sleeveOff(params: any, sleeve: string): boolean {
  const m = params?.sleeves_off
  return !!(m && typeof m === 'object' && m[sleeve]) || shimOff().includes(sleeve)
}
