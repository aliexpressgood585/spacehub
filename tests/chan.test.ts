import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHAN, adfPvalue, atrLast, canOpen, chanSize, chanView, halfLife, hurst, kellyRisk, mackinnonP, momentumT, normCdf, riskStep, DAY_MS, MEAN_REVERT, TREND, type Bar, type RiskState } from '../shared/chan.ts'
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
const five = [1, 2, 3, 4, 5].map(k => ({ pnl: -10, closedAt: T0 + k }))
r = riskStep(s0, T0 + 100, 9950, five)
assert.equal(r.ev, 'CONSEC_STOP')
const lifted = riskStep(r.st, T0 + DAY_MS + 1, 9950, five)
assert.equal(canOpen(lifted.st, 0).ok, true); assert.equal(riskStep(lifted.st, T0 + DAY_MS + 2, 9950, five).ev, null, 'the streak restarts after the pause')
assert.equal(canOpen(s0, CHAN.risk.maxOpen).ok, false, 'max 5 open')
// ledger re-checks the limits
const sql = readFileSync('supabase/migrations/20260926240000_chan_sleeve.sql', 'utf8')
for (const k of ["least(3,", "3 * eq - open_notional", "0.0101 * eq", "cnt >= 5", "hard_halt_at", "chan stop on the wrong side", "'BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT'"])
  assert.ok(sql.includes(k), `ledger enforces: ${k}`)
// the config numbers match quant/config.yaml
const yml = readFileSync('quant/config.yaml', 'utf8')
for (const [k, v] of [['risk_per_trade_cap', CHAN.risk.cap], ['max_leverage', CHAN.risk.maxLeverage], ['daily_loss_limit', CHAN.risk.dailyLoss], ['max_drawdown_kill', CHAN.risk.maxDD],
  ['max_consecutive_losses', CHAN.risk.maxConsec], ['kelly_fraction', CHAN.risk.kellyFraction], ['kelly_min_trades', CHAN.risk.kellyMinTrades], ['default_risk', CHAN.risk.defaultRisk]] as const)
  assert.equal(Number(new RegExp(`\\n\\s+${k}:\\s*([0-9.]+)`).exec(yml)![1]), v, `config ${k}`)
const rep = JSON.parse(readFileSync('quant/reports/backtest-5m.json', 'utf8')).strategies.regime_router.chosen_final
assert.equal(rep.RG_MR.entry_z, CHAN.params.RG_MR.entryZ); assert.equal(rep.RG_MR.stop_z, CHAN.params.RG_MR.stopZ); assert.equal(rep.RG_MR.exit_z, CHAN.params.RG_MR.exitZ)
assert.equal(rep.RG_MOM.kind, CHAN.params.RG_MOM.kind); assert.equal(rep.RG_MOM.lookback, CHAN.params.RG_MOM.lookback); assert.equal(rep.RG_MOM.hold, CHAN.params.RG_MOM.hold)
console.log('chan: parity with quant/ + risk + ledger ok')
