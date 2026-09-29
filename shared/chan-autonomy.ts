export type AutoRow = {
  comp?:string; regime?:string; sym?:string; side?:string; pnl:number; r:number;
  closedAt:number; exitReason?:string|null; mfeR?:number; maeR?:number;
  entryImpactBps?:number; exitImpactBps?:number; quality?:number
}

export type GovernorCell = {
  comp:string; n:number; wins:number; win:number; avgR:number; pnl:number;
  recentAvgR:number; capture:number|null; mode:'DISCOVERY'|'ACTIVE'|'REDUCED'|'DEFENSIVE';
  sizeMult:number; banditWeight:number
}

const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x))

export function strategyGovernor(rows:AutoRow[], comps:string[]):Record<string,GovernorCell>{
  return Object.fromEntries(comps.map(comp=>{
    const xs=rows.filter(x=>x.comp===comp&&Number.isFinite(x.r)).slice(0,80)
    const recent=xs.slice(0,20)
    const wins=xs.filter(x=>x.pnl>0).length, avgR=mean(xs.map(x=>x.r)), recentAvgR=mean(recent.map(x=>x.r))
    const pnl=xs.reduce((s,x)=>s+(Number.isFinite(x.pnl)?x.pnl:0),0)
    const capRows=xs.filter(x=>Number.isFinite(Number(x.mfeR))&&Number(x.mfeR)>0)
    const capture=capRows.length?mean(capRows.map(x=>clamp(x.r/Math.max(.05,Number(x.mfeR)), -1, 1.5))):null
    let mode:GovernorCell['mode']='ACTIVE', sizeMult=1
    if(xs.length<8){
      if(xs.length>=5 && avgR<=-.70){mode='DEFENSIVE';sizeMult=.35}
      else if(xs.length>=4 && avgR>=.40){mode='ACTIVE';sizeMult=1}
      else {mode='DISCOVERY';sizeMult=.75}
    }
    else if(avgR<-.55 || (xs.length>=12&&wins/xs.length<.22)){mode='DEFENSIVE';sizeMult=.25}
    else if(avgR<-.12 || recentAvgR<-.25){mode='REDUCED';sizeMult=.5}
    else if(avgR>.25&&recentAvgR>0){sizeMult=1.12}
    const shrink=xs.length/(xs.length+12)
    const edge=shrink*(.7*Math.tanh(avgR)+.3*(2*(xs.length?wins/xs.length:.5)-1))
    const banditWeight=clamp(1+edge*.45,.72,1.22)
    return [comp,{comp,n:xs.length,wins,win:xs.length?wins/xs.length:.5,avgR,pnl,recentAvgR,capture,mode,sizeMult,banditWeight}]
  }))
}

export type AdaptiveExitPolicy = {
  be:number; trail:number; gap:number; lock1:number; lock2:number;
  partialAt:number; partialFraction:number; source:string
}

export function exitPolicyFromHistory(rows:AutoRow[],comp:string):AdaptiveExitPolicy{
  const xs=rows.filter(x=>x.comp===comp&&Number.isFinite(Number(x.mfeR))).slice(0,50)
  const captureRows=xs.filter(x=>Number(x.mfeR)>.2)
  const capture=captureRows.length?mean(captureRows.map(x=>clamp(x.r/Math.max(.1,Number(x.mfeR)),-1,1.5))):.45
  const avgMfe=mean(captureRows.map(x=>Number(x.mfeR)))
  const avgMae=mean(xs.filter(x=>Number.isFinite(Number(x.maeR))).map(x=>Number(x.maeR)))
  let be=.9,trail=1.25,gap=.7,lock1=.25,lock2=.55,partialAt=1.0,partialFraction=.30
  if(comp==='RG_MR'){be=1.1;trail=99;gap=99;partialAt=1.25;partialFraction=.20}
  if(comp==='RG_LIQ_SQUEEZE'){be=.8;trail=1.1;gap=.62;partialAt=.9;partialFraction=.30}
  if(comp==='RG_VOL_BREAKOUT'){be=.75;trail=1.05;gap=.58;partialAt=.85;partialFraction=.35}
  if(comp==='RG_BREADTH_MOMENTUM'){be=.8;trail=1.1;gap=.62;partialAt=.9;partialFraction=.35}
  if(captureRows.length>=8 && capture<.25){be=Math.max(.65,be-.15);trail=Math.max(.9,trail-.15);gap=Math.max(.45,gap-.12);partialAt=Math.max(.75,partialAt-.1);partialFraction=Math.min(.45,partialFraction+.05)}
  if(captureRows.length>=8 && capture>.65 && avgMfe>1.4){trail+=.15;gap+=.08;partialAt+=.1;partialFraction=Math.max(.2,partialFraction-.05)}
  if(avgMae>.8){be=Math.max(.65,be-.08)}
  return {be,trail,gap,lock1,lock2,partialAt,partialFraction,source:`adaptive n=${xs.length} capture=${capture.toFixed(2)}`}
}

export function executionMultiplier(costR:number, impactBps:number):{mult:number;state:string}{
  if(!Number.isFinite(costR)) return {mult:.5,state:'unknown_cost'}
  if(costR>=.65||impactBps>=35) return {mult:.25,state:'very_expensive'}
  if(costR>=.45||impactBps>=25) return {mult:.5,state:'expensive'}
  if(costR>=.30||impactBps>=16) return {mult:.75,state:'moderate'}
  return {mult:1,state:'normal'}
}

export function clusterMultiplier(args:{
  side:1|-1; candidate:{ret5?:number;ret15?:number;ret60?:number};
  peers:Array<{side:1|-1;ret5?:number;ret15?:number;ret60?:number;notional:number}>
}):{mult:number;similar:number;share:number}{
  const v=[args.candidate.ret5,args.candidate.ret15,args.candidate.ret60].map(Number)
  const norm=(a:number[])=>Math.sqrt(a.reduce((s,x)=>s+(Number.isFinite(x)?x*x:0),0))
  const vn=norm(v)
  let similar=0,similarNotional=0,total=0
  for(const p of args.peers){
    total+=p.notional
    if(p.side!==args.side) continue
    const w=[p.ret5,p.ret15,p.ret60].map(Number), wn=norm(w)
    const cos=vn>0&&wn>0?v.reduce((s,x,i)=>s+(Number.isFinite(x)&&Number.isFinite(w[i])?x*w[i]:0),0)/(vn*wn):0
    if(cos>=.90){similar++;similarNotional+=p.notional}
  }
  const share=total>0?similarNotional/total:0
  const mult=similar>=6&&share>=.70?.45:similar>=4&&share>=.55?.65:similar>=3?.80:1
  return {mult,similar,share}
}

export function forensicSummary(rows:AutoRow[]){
  const out:Record<string,{n:number;pnl:number}>={}
  const add=(k:string,x:AutoRow)=>{const v=out[k]??{n:0,pnl:0};v.n++;v.pnl+=x.pnl;out[k]=v}
  for(const x of rows.slice(0,120)){
    if(x.exitReason==='LIQUIDATION') add('liquidation',x)
    else if(x.exitReason==='STOP'&&Number(x.mfeR)>=1) add('gave_back_1R_plus',x)
    else if(x.exitReason==='STOP'&&Number(x.mfeR)>=.5) add('gave_back_half_R',x)
    else if(x.exitReason==='STOP'&&Number(x.maeR)>=.9&&Number(x.mfeR)<.2) add('bad_entry_fast_adverse',x)
    else if(x.exitReason==='STOP') add('ordinary_stop',x)
    else if(x.exitReason==='TIMEOUT'||x.exitReason==='STALLED') add('no_follow_through',x)
    else if(x.pnl>0) add('profitable_exit',x)
    const ib=Number(x.entryImpactBps??0)+Number(x.exitImpactBps??0)
    if(ib>=25) add('high_execution_cost',x)
  }
  return Object.entries(out).map(([reason,v])=>({reason,...v})).sort((a,b)=>b.n-a.n)
}

export function challengerLab(rows:AutoRow[], governor:Record<string,GovernorCell>){
  return Object.values(governor).map(g=>{
    const pol=exitPolicyFromHistory(rows,g.comp)
    const proposal = g.mode==='DEFENSIVE'
      ? '25% size + faster profit capture'
      : g.capture!=null&&g.capture<.3 ? 'earlier partial + tighter profit lock'
      : g.avgR>0 ? 'preserve runner / wider trail challenger' : 'reduced size + adaptive exit'
    return {comp:g.comp,champion:'StopV2',challenger:proposal,mode:g.mode,size_mult:g.sizeMult,bandit:g.banditWeight,exit_policy:pol}
  })
}
