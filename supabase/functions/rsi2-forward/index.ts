import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import * as F from '../../../shared/rsi2-forward.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const PUBLIC_PATHS = new Set(['/fapi/v1/time', '/fapi/v1/exchangeInfo', '/fapi/v1/klines', '/fapi/v1/fundingRate'])
async function market(path: string, params: Record<string, string | number> = {}) {
  if (!PUBLIC_PATHS.has(path)) throw new Error('read-only market endpoint rejected')
  const url = new URL(path, 'https://fapi.binance.com')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const r = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`Binance public data HTTP ${r.status}`)
  return r.json()
}
async function bars(symbol: string, interval: string, start: number, now: number): Promise<F.Bar[]> {
  const ms = interval === '5m' ? F.SPEC.intervalMs : F.SPEC.trendMs
  // Pagination is bounded per run, but the cursor persists: a backlog resumes next run without skipping bars.
  const raw = await market('/fapi/v1/klines', { symbol, interval, startTime: start, endTime: now, limit: 1500 })
  if (!Array.isArray(raw) || !raw.length) throw new Error(`${symbol} ${interval}: missing candles`)
  const out: F.Bar[] = raw.map((x: any) => ({ t: Number(x[0]), end: Number(x[6]) + 1, o: Number(x[1]), h: Number(x[2]), l: Number(x[3]), c: Number(x[4]), v: Number(x[5]) }))
  for (let i = 0; i < out.length; i++) {
    const b = out[i]
    if (![b.t, b.end, b.o, b.h, b.l, b.c, b.v].every(Number.isFinite) || !(b.o > 0 && b.l > 0 && b.c > 0 && b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c) && b.v >= 0) ||
      b.end - b.t !== ms || (i && b.t !== out[i - 1].t + ms)) throw new Error(`${symbol} ${interval}: invalid/gapped candles`)
  }
  if (out[0].t !== start) throw new Error(`${symbol} ${interval}: missing expected first candle`)
  return out
}
async function funding(symbol: string, start: number, now: number): Promise<F.Funding[] | null> {
  try {
    const rows = await market('/fapi/v1/fundingRate', { symbol, startTime: start, endTime: now, limit: 1000 })
    if (!Array.isArray(rows) || rows.length === 1000) return null
    const out: F.Funding[] = rows.map(x => ({ t: Number(x.fundingTime), rate: Number(x.fundingRate), mark: Number(x.markPrice) }))
    if (!rows.every((x: any) => x.symbol === symbol) || !out.every(x => Number.isFinite(x.t) && Number.isFinite(x.rate) && x.mark > 0)) return null
    return out
  } catch { return null }
}
async function record(row: any, state: F.SimState | null, report: any, journal: any[] = []) {
  const { data, error } = await db.rpc('rsi2_forward_checkpoint', { p_symbol: row.symbol, p_revision: row.revision,
    p_state: state, p_report: report, p_journal: journal })
  if (error) throw new Error(error.message)
  return data
}
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' }
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('', { headers: cors })
  // Custom scheduler authentication: only a hash is read; the raw token lives exclusively in Vault.
  if (req.method === 'POST') {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const hash = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('')
    const { data: auth, error: authError } = await db.from('rsi2_forward_scheduler').select('token_hash').eq('id', 1).single()
    if (authError || !token || hash !== auth?.token_hash) return new Response(JSON.stringify({ error: 'authorized scheduler required' }), { status: 403, headers: cors })
  }
  if (!['GET', 'POST'].includes(req.method)) return new Response('', { status: 405, headers: cors })
  const { data: runs, error } = await db.from('rsi2_forward_runs').select('*').order('symbol')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors })
  if (req.method === 'GET') return new Response(JSON.stringify({ mode: 'PAPER_RESEARCH_SIMULATION_ONLY', spec: F.SPEC, runs: runs?.map(({ state, ...r }) => r) }), { headers: cors })
  let info: any, now: number
  try {
    const [time, exchange] = await Promise.all([market('/fapi/v1/time'), market('/fapi/v1/exchangeInfo')])
    now = Number(time.serverTime); info = exchange
    if (!Number.isFinite(now)) throw new Error('invalid exchange time')
  } catch (e) {
    for (const row of runs ?? []) await record(row, row.state, { ...row.report, active: true, dataStatus: 'READ_ONLY_DATA_UNAVAILABLE',
      qualification: 'INSUFFICIENT_DATA', error: String(e), qualifiedBotSignals: false, checkedAt: new Date().toISOString() })
    return new Response(JSON.stringify({ ok: false, mode: 'OBSERVATION_ONLY', error: String(e) }), { status: 503, headers: cors })
  }
  const reports = []
  for (const row of runs ?? []) {
    try {
      if (!row.active) continue
      const canonical = (x: any) => JSON.stringify(Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])))
      if (canonical(row.spec) !== canonical(F.SPEC)) throw new Error('frozen specification mismatch')
      if (!F.verified(info, row.symbol)) {
        const report = { active: true, dataStatus: 'EXACT_CONTRACT_NOT_VERIFIED', qualification: 'INSUFFICIENT_DATA',
          symbol: row.symbol, qualifiedBotSignals: false, checkedAt: new Date(now).toISOString(), base: F.metrics(row.state?.base ?? F.stats()), stress: F.metrics(row.state?.stress ?? F.stats()) }
        await record(row, row.state, report); reports.push(report); continue
      }
      const s: F.SimState = row.state ? structuredClone(row.state) : F.initial(), t0 = Date.parse(row.started_at)
      const start5 = s.five.last ? s.five.last.end : t0 - F.SPEC.warmupBars * F.SPEC.intervalMs
      const start15 = s.fifteen.last ? s.fifteen.last.end : Math.floor(t0 / F.SPEC.trendMs) * F.SPEC.trendMs - F.SPEC.warmupBars * F.SPEC.trendMs
      const [five, fifteen, fund] = await Promise.all([bars(row.symbol, '5m', start5, now), bars(row.symbol, '15m', start15, now),
        funding(row.symbol, s.position?.entryTs ?? Math.max(t0, start5), now)])
      // Missing data leaves the checkpoint untouched; recovery replays all bars from the last good cursor.
      if (fund === null) throw new Error('FUNDING_NOT_INCLUDED: funding data unavailable; no new simulated candidates')
      const journal = F.advance(row.symbol, s, five, fifteen, now, t0, fund)
      const qual = F.qualification(row.training, s.base, s.stress)
      const contract = info.symbols.find((x: any) => x.symbol === row.symbol)
      const report = { symbol: row.symbol, active: true, mode: 'PAPER_RESEARCH_SIMULATION_ONLY', leverage: 20,
        dataStatus: fund === null ? 'FUNDING_UNAVAILABLE_NO_NEW_CANDIDATES' : 'OK', qualification: qual,
        threshold61Status: qual, qualifiedBotSignals: false, training: row.training ?? 'MISSING_EXACT_TRAINING_EVIDENCE',
        forwardStartedAt: row.started_at, checkedAt: new Date(now).toISOString(), contract: { symbol: contract.symbol, status: contract.status, quoteAsset: contract.quoteAsset, marginAsset: contract.marginAsset, contractType: contract.contractType },
        base: F.metrics(s.base), stress: F.metrics(s.stress), roundTripCostPct: .12, stressCostPct: .16,
        fundingIncludedThisRun: fund !== null, fundingNote: fund === null ? 'FUNDING_NOT_INCLUDED' : 'settled funding at reported mark; exit-candle timestamp is simulated bar end',
        observedCandidates: s.observedCandidates, openSimulatedPosition: s.position, pendingSimulatedEntry: s.pending,
        openFundingCostUsd: s.position ? fund.filter(f => f.t >= s.position!.entryTs && f.t <= now)
          .reduce((sum,f) => sum+s.position!.side*f.rate*f.mark/s.position!.entry*5000,0) : 0,
        lastClosed5m: s.five.last?.end, lastClosed15m: s.fifteen.last?.end,
        lastClosePrice: s.five.last?.c,
        drawdownModel: 'closed-trade equity;fixed $250 margin x20=$5000 notional;independent $5000 research account per symbol;no exchange liquidation model',
        note: 'SIMULATED only. Existing paper account integration records experimental observations; failed qualification blocks new account entries. Rules never auto-tune.' }
      await record(row, s, report, journal); reports.push(report)
    } catch (e) {
      const report = { ...row.report, active: true, symbol: row.symbol, dataStatus: 'MISSING_OR_INVALID_DATA', error: String(e),
        qualification: 'INSUFFICIENT_DATA', qualifiedBotSignals: false, checkedAt: new Date(now).toISOString() }
      await record(row, row.state, report); reports.push(report)
    }
  }
  return new Response(JSON.stringify({ ok: reports.every(x => x.dataStatus === 'OK'), mode: 'PAPER_RESEARCH_SIMULATION_ONLY', reports }), { headers: cors })
})
