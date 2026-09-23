// Operational review cadence (v71.0: every minute, matching SCALP.meetingMs) and existing bounded cap policy. No trade signals.
export const TEAM_INTERVAL_MS = 60_000
export function meetingDue(last: number, now: number): boolean {
  return Number.isFinite(now) && (!Number.isFinite(last) || last <= 0 || now - last >= TEAM_INTERVAL_MS)
}
export function capDecision(cap: number | null, derisk: number, riskOk: boolean, auditOk: boolean, since: number, now: number): 'HOLD' | 'DERISK' | 'RESTORE' {
  if (cap === null && derisk >= 2) return 'DERISK'
  if (cap !== null && derisk === 0 && riskOk && auditOk && since > 0 && now - since >= 24 * 3600_000) return 'RESTORE'
  return 'HOLD'
}
