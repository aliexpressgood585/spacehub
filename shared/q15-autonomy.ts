// Q15 MAX LOTTERY AUTONOMY — strong layer (paper only).
// Hard floor NEVER decreases aggressiveness. Policies only reallocate HOW aggression is spent.
// Bandit + shadow scores; promote = reweight, not de-risk.

export const HARD_FLOOR = {
  lev: 15,
  perTrade: 0.15,
  maxOpen: 8,
  share: 0.90,
  maxPerDay: 200,
  barMs: 60_000,
} as const

export type PolicyId = 'burst' | 'volume' | 'imb_follow' | 'spray'

export type PolicySpec = {
  id: PolicyId
  label: string
  /** signal knobs — all stay in aggressive open range */
  zMin: number
  volMult: number
  imbMin: number
  /** any = both sides; long_bias / short_bias tilt strength ranking */
  dirMode: 'any' | 'long_bias' | 'short_bias' | 'with_imb'
}

/** Four aggressive policies — none is "conservative". */
export const POLICIES: Record<PolicyId, PolicySpec> = {
  burst: {
    id: 'burst',
    label: 'burst_momentum',
    zMin: 0.15,
    volMult: 0.45,
    imbMin: -1,
    dirMode: 'any',
  },
  volume: {
    id: 'volume',
    label: 'volume_spike',
    zMin: 0.12,
    volMult: 0.75,
    imbMin: -1,
    dirMode: 'any',
  },
  imb_follow: {
    id: 'imb_follow',
    label: 'taker_imbalance',
    zMin: 0.10,
    volMult: 0.40,
    imbMin: 0.02,
    dirMode: 'with_imb',
  },
  spray: {
    id: 'spray',
    label: 'max_spray',
    zMin: 0.08,
    volMult: 0.30,
    imbMin: -1,
    dirMode: 'any',
  },
}

export type PolicyScore = {
  n: number
  wins: number
  pnl: number
  shadow_n: number
  shadow_pnl: number
  /** exponential weight for allocation */
  w: number
}

export type AutonomyState = {
  version: 2
  learned_at: string | null
  learned_ids: string[]
  updated_at: string
  /** never written below HARD_FLOOR */
  floor: typeof HARD_FLOOR
  scores: Record<PolicyId, PolicyScore>
  /** last promoted weights (sum ~ 1) */
  weights: Record<PolicyId, number>
  /** policy chosen for this bar (sticky within bar) */
  active: PolicyId
  /** promote only after this many closed samples per policy (shadow path) */
  min_promote_n: number
  history: { ts: string; active: PolicyId; reason: string }[]
}

const IDS: PolicyId[] = ['burst', 'volume', 'imb_follow', 'spray']

function emptyScore(): PolicyScore {
  return { n: 0, wins: 0, pnl: 0, shadow_n: 0, shadow_pnl: 0, w: 1 }
}

export function defaultAutonomy(now = new Date().toISOString()): AutonomyState {
  const scores = Object.fromEntries(IDS.map(id => [id, emptyScore()])) as Record<PolicyId, PolicyScore>
  const weights = Object.fromEntries(IDS.map(id => [id, 0.25])) as Record<PolicyId, number>
  return {
    version: 2,
    learned_at: null,
    learned_ids: [],
    updated_at: now,
    floor: { ...HARD_FLOOR },
    scores,
    weights,
    active: 'spray', // start max open
    min_promote_n: 5,
    history: [{ ts: now, active: 'spray', reason: 'init_max_lottery' }],
  }
}

export function loadAutonomy(params: Record<string, unknown> | null | undefined): AutonomyState {
  const raw = (params as any)?.q15_autonomy
  // v1 may contain repeatedly counted closes. Rebuild v2 from actual outcomes.
  if (!raw || raw.version !== 2) return defaultAutonomy()
  // re-assert floor every load — AI/tuner cannot weaken
  return {
    ...raw,
    floor: { ...HARD_FLOOR },
    scores: { ...defaultAutonomy().scores, ...raw.scores },
    weights: normalizeWeights(raw.weights ?? defaultAutonomy().weights),
  }
}

function normalizeWeights(w: Record<string, number>): Record<PolicyId, number> {
  const out = {} as Record<PolicyId, number>
  let s = 0
  for (const id of IDS) {
    const v = Math.max(0.05, Number(w[id]) || 0.25) // floor 5% each — always explore
    out[id] = v
    s += v
  }
  for (const id of IDS) out[id] = out[id] / s
  return out
}

/** Softmax-ish from PnL + shadow; never zeros a policy. */
export function reweight(scores: Record<PolicyId, PolicyScore>): Record<PolicyId, number> {
  const raw: Record<PolicyId, number> = {} as any
  for (const id of IDS) {
    const sc = scores[id] ?? emptyScore()
    const n = sc.n + sc.shadow_n * 0.5
    const pnl = sc.pnl + sc.shadow_pnl * 0.5
    const avg = n > 0 ? pnl / n : 0
    // map avg pnl to positive weight; losing policies keep mass via 0.05 floor later
    raw[id] = Math.exp(Math.max(-2, Math.min(2, avg / 50))) // scale ~dollars
  }
  return normalizeWeights(raw)
}

/** Pick policy for this cycle: weighted sample (exploration stays aggressive). */
export function pickPolicy(state: AutonomyState, rng = Math.random): PolicyId {
  const w = state.weights
  let r = rng()
  for (const id of IDS) {
    r -= w[id]
    if (r <= 0) return id
  }
  return 'spray'
}

/** Slot budget per policy from maxOpen floor. */
export function slotBudget(weights: Record<PolicyId, number>, maxOpen = HARD_FLOOR.maxOpen): Record<PolicyId, number> {
  const out = {} as Record<PolicyId, number>
  let used = 0
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i]
    if (i === IDS.length - 1) out[id] = Math.max(1, maxOpen - used)
    else {
      out[id] = Math.max(1, Math.round(weights[id] * maxOpen))
      used += out[id]
    }
  }
  return out
}

export function recordTrade(
  state: AutonomyState,
  policy: PolicyId,
  pnl: number,
  kind: 'live' | 'shadow',
): AutonomyState {
  const scores = { ...state.scores, [policy]: { ...state.scores[policy] } }
  const sc = scores[policy]
  if (kind === 'live') {
    sc.n += 1
    sc.pnl += pnl
    if (pnl > 0) sc.wins += 1
  } else {
    sc.shadow_n += 1
    sc.shadow_pnl += pnl
  }
  const weights = reweight(scores)
  const active = pickPolicy({ ...state, scores, weights })
  const history = [
    ...state.history.slice(-40),
    {
      ts: new Date().toISOString(),
      active,
      reason: `reweight_after_${kind}_pnl=${pnl.toFixed(2)}`,
    },
  ]
  return {
    ...state,
    updated_at: new Date().toISOString(),
    floor: { ...HARD_FLOOR },
    scores,
    weights,
    active,
    history,
  }
}

/** Enforce floor on any config object — call before every entry. */
export function enforceFloor<T extends Record<string, number>>(cfg: T): T & typeof HARD_FLOOR {
  return {
    ...cfg,
    ...HARD_FLOOR,
  }
}

export function policyKnobs(id: PolicyId): PolicySpec {
  return POLICIES[id] ?? POLICIES.spray
}

/** Incremental close learning; IDs sharing the last millisecond are kept across cycles.
 * Trade IDs are not a close-time cursor: an older position can close later.
 */
export function learnClosedTrades(state: AutonomyState, rows: {
  id: number | string; closed_at: string; pnl: number | string; scalp_meta?: any
}[]): AutonomyState {
  let out = state
  let at = state.learned_at ? Date.parse(state.learned_at) : -Infinity
  let ids = new Set(state.learned_ids ?? [])
  for (const row of [...rows].sort((a, b) => Date.parse(a.closed_at) - Date.parse(b.closed_at))) {
    const ts = Date.parse(row.closed_at), id = String(row.id)
    if (!Number.isFinite(ts) || ts < at || (ts === at && ids.has(id))) continue
    if (ts > at) { at = ts; ids = new Set() }
    ids.add(id)
    const policy = row.scalp_meta?.autonomy_policy ?? row.scalp_meta?.q15?.policy
    if (IDS.includes(policy) && row.pnl !== null && Number.isFinite(Number(row.pnl)))
      out = recordTrade(out, policy, Number(row.pnl), 'live')
  }
  return { ...out, learned_at: Number.isFinite(at) ? new Date(at).toISOString() : null, learned_ids: [...ids] }
}
