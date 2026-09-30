import assert from 'node:assert/strict'
import { strategyProfitabilityGate, type XHistory } from '../shared/chan-x.ts'

const H=3_600_000, NOW=Date.UTC(2026,8,30,7,0,0)
const rows=(rs:number[],side='LONG'):XHistory[]=>rs.map((r,i)=>({
  comp:'RG_BREADTH_MOMENTUM',
  side:i%2?side:(side==='LONG'?'SHORT':'LONG'),
  r,
  pnl:r*10,
  openedAt:NOW-i*H,
  closedAt:NOW-i*H+30*60_000
}))

{
  const xs=rows([...Array(12).fill(-.60),...Array(24).fill(.20)])
  const g=strategyProfitabilityGate(xs,'RG_BREADTH_MOMENTUM',NOW)
  assert.ok(g.cluster_n>=12,'openedAt produces measurable side/hour clusters')
  assert.equal(g.mode,'PROBE')
  assert.equal(g.size_mult,.10)
  assert.equal(g.reason,'breadth_degraded_probe')
}

{
  // Six+ recent non-negative clusters recover only to the intermediate x0.35 step.
  const xs=rows([...Array(12).fill(.05),...Array(24).fill(-.01)])
  const g=strategyProfitabilityGate(xs,'RG_BREADTH_MOMENTUM',NOW)
  assert.equal(g.mode,'PROBE')
  assert.equal(g.size_mult,.35)
  assert.equal(g.reason,'breadth_recovery_probe')
}

{
  // Full promotion needs a stronger 12-cluster confirmation; no x1.20 Breadth boost exists.
  const xs=rows(Array(36).fill(.20))
  const g=strategyProfitabilityGate(xs,'RG_BREADTH_MOMENTUM',NOW)
  assert.equal(g.mode,'LIVE')
  assert.equal(g.size_mult,1.05)
  assert.equal(g.reason,'positive_expectancy')
}

console.log('CHAN-X: Breadth cluster trigger + recovery hysteresis passed')
