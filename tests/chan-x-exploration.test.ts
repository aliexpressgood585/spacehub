import assert from 'node:assert/strict'
import { defenseExplorationFloor } from '../shared/chan-x.ts'

const base={
  portfolioMode:'DEFENSE',strategyMode:'PROBE',strategyN:2,
  quality:58,requiredQuality:66,microScore:50,softReasons:[] as string[],openExploration:0
}
let x=defenseExplorationFloor(base)
assert.equal(x.eligible,true,'young PROBE engine may use the tiny DEFENSE exploration floor')
assert.equal(x.risk_usd_cap,5)
assert.equal(x.max_open,2)

x=defenseExplorationFloor({...base,strategyN:8})
assert.equal(x.eligible,false,'enough evidence: no forced discovery bypass')

x=defenseExplorationFloor({...base,softReasons:['news_risk']})
assert.equal(x.eligible,false,'severe risk context cannot be bypassed')

x=defenseExplorationFloor({...base,quality:53})
assert.equal(x.eligible,false,'quality floor remains hard')

x=defenseExplorationFloor({...base,openExploration:2})
assert.equal(x.eligible,false,'only two funded exploration probes may coexist')

console.log('CHAN-X P003 exploration floor passed')
