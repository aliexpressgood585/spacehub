import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHAN, fundingCharge, adfPvalue, atrLast, canOpen, chanSize, chanView, halfLife, hurst, kellyRisk, mackinnonP, momentumT, normCdf, riskStep, DAY_MS, MEAN_REVERT, TREND, type Bar, type RiskState } from '../shared/chan.ts'
// v97.0 CHAN — the live TS port must reproduce the Python quant/ code it was validated with
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`)
near(normCdf(1.96), 0.9750021, 1e-6, 'normCdf')
near(mackinnonP(-2.86), 0.0501, 0.002, 'MacKinnon 5% critical value for "c"')
const fx = JSON.parse(readFileSync('tests/fixtures/chan_parity.json', 'utf8'))
for (const f of fx) {
  const lp = f.c.map((x: number) => Math.log(x)), win = lp.slice(-2016)
  near(adfPvalue(win), f.adf, 1e-6, `${f.name} ADF p`)
  near(hurst(win), f.hurst, 1e-9, `${f.name} Hurst`)
  if (f.hl !== null) near(halfLife(win), f.hl, 1e-9, `${f.name} half-life`); else assert.equal(halfLife(win), Infinity)
  near(momentumT(lp, 144, 12, 4032), f.t, 1e-9, `${f.name} momentum t`)
  near(atrLast(f.h, f.l, f.c, 14), f.atr, 1e-9, `${f.name} ATR`)
  const bars: Bar[] = f.c.map((c: number, i: number) => ({ t: i * 300000, o: c, h: f.h[i], l: f.l[i], c }))
  const v = chanView(bars)!
  if (f.z !== null) { near(v.mr.z, f.z, 1e-7, `${f.name} z`); near(v.mr.mean, f.mu, 1e-12, `${f.name} mean`); near(v.mr.std, f.sd, 1e-9, `${f.name} std`) }
  near(v.vol, f.vol, 1e-12, `${f.name} vol`)
}
const [ou, rw, tr] = fx.map((f: any) => chanView(f.c.map((c: number, i: number) => ({ t: i * 300000, o: c, h: f.h[i], l: f.l[i], c }))))
assert.equal(ou!.regime, MEAN_REVERT, 'OU series -> mean-reverting regime')
assert.equal(tr!.regime, TREND, 'persistent series -> trend regime')
assert.ok(rw!.regime !== MEAN_REVERT && rw!.regime !== TREND || Math.abs(rw!.hurst - 0.5) < 0.06, 'random walk sits in the middle')
assert.equal(chanView(fx[0].c.slice(0, 3000).map((c: number, i: number) => ({ t: i, o: c, h: c, l: c, c }))), null, 'too little history -> no view')
// risk: Kelly, sizing, limits (quant/risk/manager.py)
assert.deepEqual(kellyRisk(Array(29).fill(1)).f, 0.0025, 'default risk until 30 trades')
assert.equal(kellyRisk([...Array(15).fill(0.2), ...Array(15).fill(-0.1)]).f, 0.01, 'big edge -> capped at 1%')
assert.equal(kellyRisk([...Array(15).fill(-1), ...Array(15).fill(0.5)]).f, 0, 'negative record -> no size')
assert.equal(chanSize(0.01, 10000, 100, 99, 0).notional, 10000 * 0.01 / 0.01, '1% risk at a 1% stop = 1x equity')
assert.equal(chanSize(0.01, 10000, 100, 99.6, 10000).notional, 20000, 'capped by the leverage room: 3x equity minus open notional')
assert.equal(chanSize(0.01, 10000, 100, 99.8, 0).notional, 0, 'stop under 3x the round-trip cost is refused')
assert.equal(chanSize(0.01, 10000, 100, 99, 30000).notional, 0, 'no leverage room left')
const T0 = 20000 * DAY_MS
const s0: RiskState = { peak: 10000, day: 20000, dayOpen: 10000, pausedUntilDay: -1, streakFrom: 0, halted: false, haltReason: '' }
let r = riskStep(s0, T0 + 1000, 9899, [])
assert.equal(r.ev, null)
r = riskStep(s0, T0 + 1000, 9000, [])
assert.equal(r.ev, 'KILL'); assert.equal(canOpen(r.st, 0).ok, false)
r = riskStep(s0, T0 + 5000, 9690, [{ pnl: -310, closedAt: T0 + 4000 }])
assert.equal(r.ev, 'DAILY_STOP'); assert.equal(canOpen(r.st, 0).ok, false)
const next = riskStep(r.st, T0 + DAY_MS + 10, 9690, [{ pnl: -310, closedAt: T0 + 4000 }])
assert.equal(canOpen(next.st, 0).ok, true, 'the pause lifts at 00:00 UTC')
const losses = Array.from({ length: 50 }, (_, k) => ({ pnl: -1, closedAt: T0 + k + 1 }))
for (const n of [5, 49]) assert.equal(riskStep(s0, T0 + 100, 10000 - n, losses.slice(0, n)).ev, null)
r = riskStep(s0, T0 + 100, 9950, losses)
assert.equal(r.ev, 'CONSEC_STOP')
const lifted = riskStep(r.st, T0 + DAY_MS + 1, 9950, losses)
assert.equal(canOpen(lifted.st, 0).ok, true); assert.equal(riskStep(lifted.st, T0 + DAY_MS + 2, 9950, losses).ev, null, 'the streak restarts after the pause')
assert.equal(canOpen(s0, CHAN.risk.maxOpen).ok, false, 'max 5 open')
// ledger re-checks the limits
const sql = readFileSync('supabase/migrations/20260927000000_chan_all_coins.sql', 'utf8')
for (const k of ["least(3,", "3 * eq - open_notional", "0.0101 * eq", "cnt >= 5", "hard_halt_at", "chan stop on the wrong side", "'USDC','FDUSD'", "'PAXG','XAUT'", "'TSLA','AAPL'", "chan_scan"])
  assert.ok(sql.includes(k), `ledger enforces: ${k}`)
// the config numbers match quant/config.yaml
const yml = readFileSync('quant/config.yaml', 'utf8')
for (const [k, v] of [['risk_per_trade_cap', CHAN.risk.cap], ['max_leverage', CHAN.risk.maxLeverage], ['daily_loss_limit', CHAN.risk.dailyLoss], ['max_drawdown_kill', CHAN.risk.maxDD],
  ['max_consecutive_losses', CHAN.risk.maxConsec], ['kelly_fraction', CHAN.risk.kellyFraction], ['kelly_min_trades', CHAN.risk.kellyMinTrades], ['default_risk', CHAN.risk.defaultRisk]] as const)
  assert.equal(Number(new RegExp(`\\n\\s+${k}:\\s*([0-9.]+)`).exec(yml)![1]), v, `config ${k}`)
const rep = JSON.parse(readFileSync('quant/reports/backtest-5m.json', 'utf8')).strategies.regime_router.chosen_final
assert.equal(rep.RG_MR.entry_z, CHAN.params.RG_MR.entryZ); assert.equal(rep.RG_MR.stop_z, CHAN.params.RG_MR.stopZ); assert.equal(rep.RG_MR.exit_z, CHAN.params.RG_MR.exitZ)
assert.equal(rep.RG_MOM.kind, CHAN.params.RG_MOM.kind); assert.equal(rep.RG_MOM.lookback, CHAN.params.RG_MOM.lookback); assert.equal(rep.RG_MOM.hold, CHAN.params.RG_MOM.hold)
// daily vol anchors: one per bar that closes at 00:00 UTC with a full window behind it
{
  const { dayVols } = await import('../shared/chan.ts')
  const bars: Bar[] = Array.from({ length: 2016 + 288 * 3 }, (_, i) => ({ t: 1790000000000 - (1790000000000 % 86400000) + (i - 2016) * 300000, o: 100, h: 100, l: 100, c: 100 * Math.exp(0.001 * Math.sin(i)) }))
  const dv = dayVols(bars)
  assert.ok(dv.length >= 3 && dv.every(x => Number.isInteger(x.d) && x.v > 0), 'daily anchors at UTC midnight')
}
console.log('chan: parity with quant/ + risk + ledger ok')
// v97.2: the per-bar view from only the last 320 candles + the daily stats equals the full-history view
{
  const { dailyStats, barView, RECENT_BARS } = await import('../shared/chan.ts')
  for (const f of fx) {
    const bars: Bar[] = f.c.map((c: number, i: number) => ({ t: i * 300000, o: c, h: f.h[i], l: f.l[i], c }))
    const full = chanView(bars)!, d = dailyStats(bars)!, part = barView(bars.slice(-RECENT_BARS), d)!
    for (const k of ['z', 'mean', 'std', 'stopLong', 'stopShort'] as const) if (Number.isFinite(full.mr[k])) near(part.mr[k], full.mr[k], 1e-9, `${f.name} recent-bars mr.${k}`)
    near(part.mom.atr, full.mom.atr, 1e-6, `${f.name} recent-bars ATR (Wilder warm-up)`)
    assert.equal(part.mom.hh, full.mom.hh); assert.equal(part.mom.ll, full.mom.ll); assert.equal(part.mr.side, full.mr.side); assert.equal(part.mom.side, full.mom.side)
  }
  console.log('chan: 320-bar view == full-history view')
}

// v97.6 funding from the exchange's actual settlements
{
  const H = 3_600_000, open = 10 * H, close = 30 * H
  const rows = [{ fundingTime: 8 * H, fundingRate: '0.001', markPrice: '100' },     // before the open: not held
    { fundingTime: 16 * H, fundingRate: '0.0001', markPrice: '110' },              // held
    { fundingTime: 16 * H, fundingRate: '0.0001', markPrice: '110' },              // duplicate row: charged once
    { fundingTime: 24 * H, fundingRate: '-0.0002', markPrice: '120' },             // held, negative rate
    { fundingTime: 32 * H, fundingRate: '0.005', markPrice: '130' }]               // after the close: not held
  const L = fundingCharge('LONG', 2, 1, 100, open, close, rows)
  near(L.amount, 2 * 0.0001 * 110 + 2 * -0.0002 * 120, 1e-12, 'long pays positive rates, receives negative')
  assert.equal(L.events.length, 2, 'only settlements held, each once')
  assert.ok(L.complete)
  const S = fundingCharge('SHORT', 2, 1, 100, open, close, rows)
  near(S.amount, -L.amount, 1e-12, 'short is the mirror image')
  const P = fundingCharge('LONG', 1000, 1000, 0.00001, open, close, [{ fundingTime: 16 * H, fundingRate: '0.0001', markPrice: '0.01' }])
  near(P.amount, 1000 * 0.0001 * 0.00001, 1e-15, '1000PEPE mark is per 1000 coins')
  const M = fundingCharge('LONG', 1, 1, 100, open, close, [{ fundingTime: 16 * H, fundingRate: '0.0001' }])
  assert.ok(!M.complete && M.missingMark === 1, 'a row without a mark price is flagged')
  const N = fundingCharge('LONG', 1, 1, 100, open, close, null)
  assert.ok(!N.complete && N.amount === 0, 'no history -> flagged, not guessed')
  assert.equal(fundingCharge('LONG', 1, 1, 100, 16 * H, close, rows).events.length, 1, 'a settlement at the open instant is not charged')
  const mig = readFileSync('supabase/migrations/20260927120000_chan_real_funding.sql', 'utf8')
  assert.ok(mig.includes("funding := (x->'funding'->>'amount')::numeric") && mig.includes("'funding_missing'"), 'ledger books the runner amount and flags a fallback')
}
console.log('chan funding: ok')
