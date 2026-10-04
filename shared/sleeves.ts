// v99.6 — per-sleeve entry brake (owner 2026-10-01: an autonomous supervisor may change strategies without asking).
// Two sources, either one switches a sleeve's ENTRIES off; its open positions keep being managed and exited:
//  - deploy-time shim `__SLEEVES_OFF='FAST,EVT'` (both CI workflows): the hourly guardian routine has no database
//    access, so it brakes by editing the shim and pushing main (CI redeploys);
//  - bot_state.bot_params.sleeves_off = {"<SLEEVE>": {at, by, why}}: set by SQL from an interactive session.
// Safe direction only: neither can start a sleeve or raise size — the runnable set stays __ENABLED_SLEEVES.
export const SLEEVES = ['Q15', 'LIST', 'FUND', 'FAST', 'EVT', 'BRKV', 'PRO', 'BLADE', 'DONCH4H'] as const
export function shimOff(): string[] {
  return String((globalThis as any).__SLEEVES_OFF ?? '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
}
export function sleeveOff(params: any, sleeve: string): boolean {
  const m = params?.sleeves_off
  return !!(m && typeof m === 'object' && m[sleeve]) || shimOff().includes(sleeve)
}
// P-AGG2 (owner override 2026-10-04): Level 2 runs exactly these sleeves (index.ts AGG2 branch); every other is off
export const AGG2_SLEEVES = ['FAST', 'EVT', 'DONCH4H'] as const
export const isAgg2 = (enabled: string) => { const e = enabled.toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
  return e.includes('FAST') && e.includes('EVT') && !e.some(x => ['LIST', 'FUND', 'PRO'].includes(x)) }

export const Q15_SLEEVES = ['Q15', 'EVT', 'DONCH4H'] as const
