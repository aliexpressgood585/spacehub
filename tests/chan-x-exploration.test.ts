import assert from 'node:assert/strict'
import { capNotionalToStopRisk, defenseExplorationFloor } from '../shared/chan-x.ts'

const base={
  portfolioMode:'DEFENSE',strategyMode:'PROBE',strategyN:2,
  quality:58,requiredQuality:66,microScore:50,softReasons:[] as string[],openExploration:0
}

let x=defenseExplorationFloor(base)
assert.equal(x.eligible,true,'young DEFENSE/PROBE engine may use the tiny exploration floor')
assert.equal(x.risk_usd_cap,5)
assert.equal(x.max_open,2)
assert.equal(x.micro_ok,true)

x=defenseExplorationFloor({...base,portfolioMode:'NORMAL'})
assert.equal(x.eligible,false,'exploration floor is DEFENSE-only')

x=defenseExplorationFloor({...base,strategyMode:'LIVE'})
assert.equal(x.eligible,false,'exploration floor is PROBE-only')

x=defenseExplorationFloor({...base,strategyN:8})
assert.equal(x.eligible,false,'enough evidence: no discovery bypass')

for(const reason of ['news_risk','leverage_against','regime_mismatch']){
  x=defenseExplorationFloor({...base,softReasons:[reason]})
  assert.equal(x.eligible,false,`severe reason ${reason} cannot be bypassed`)
}

x=defenseExplorationFloor({...base,quality:53})
assert.equal(x.eligible,false,'absolute quality floor remains hard')

x=defenseExplorationFloor({...base,openExploration:2})
assert.equal(x.eligible,false,'only two funded exploration probes may coexist')

x=defenseExplorationFloor({...base,microScore:null})
assert.equal(x.eligible,false,'missing micro data cannot silently pass as score 50')
assert.equal(x.micro_ok,false)

x=defenseExplorationFloor({...base,microScore:41.99})
assert.equal(x.eligible,false,'micro below 42 remains hard')

// Final-fill cap arithmetic: cap is based on actual modeled px, not touch.
const px=101, stop=100, rawNotional=1000
const capped=capNotionalToStopRisk(rawNotional,px,stop,5)
const finalRisk=capped*Math.abs(px-stop)/px
assert.ok(finalRisk<=5+1e-9,'actual stop risk is hard-capped at $5')
assert.ok(capped<rawNotional,'cap reduces oversized exploration notional')

// Invalid stop geometry never creates an uncapped trade.
assert.equal(capNotionalToStopRisk(1000,100,100,5),0)

console.log('CHAN-X P003 exploration floor + hard risk cap passed')
