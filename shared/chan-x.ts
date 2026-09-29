export type XHistory = {
  comp?:string; regime?:string; side?:string; r:number; pnl:number;
  volPct?:number; mtfSide?:number; microScore?:number; breadthShare?:number;
  quality?:number; mfeR?:number; maeR?:number
}
export type XGovernor = {comp:string;n:number;avgR:number;recentAvgR:number;win:number;sizeMult:number;banditWeight:number;mode:string}

const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x))
const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0

export function marketBurstMode(breadth:any,intel:any){
  const n=Number(breadth?.n??0), up=Number(breadth?.up_share??.5), down=Number(breadth?.down_share??.5)
  const br=Number(breadth?.btc_ret5), er=Number(breadth?.eth_ret5)
  const side:1|-1|0=n>=50&&up>=.80&&br>0&&er>0?1:n>=50&&down>=.80&&br<0&&er<0?-1:0
  const top=Array.isArray(intel?.top_pressure)?intel.top_pressure:[]
  const alignedPressure=side?Math.max(0,...top.filter((x:any)=>(side>0?x.side==='LONG':x.side==='SHORT')).map((x:any)=>Number(x.score)||0)):0
  const share=side>0?up:side<0?down:.5
  const strength=side?clamp((share-.80)*250 + Math.max(0,alignedPressure-55)*.35,0,25):0
  return {
    active:!!side,side,share,aligned_pressure:alignedPressure,strength,
    risk_mult:side?clamp(1.08+strength/180,1.08,1.22):1,
    entry_cap:side?(strength>=14?8:6):5,
    breadth_cap:side?5:3,
    quality_relief:side&&alignedPressure>=68?4:side?2:0
  }
}

export function strategyAuction(governor:Record<string,XGovernor>){
  const raw=Object.values(governor).map(g=>{
    const sample=Math.min(1,Number(g.n||0)/25)
    const edge=.65*Math.tanh(Number(g.avgR||0))+.35*Math.tanh(Number(g.recentAvgR||0))
    const confidence=.45+.55*sample
    const score=clamp(1+edge*confidence,.55,1.35)
    return [g.comp,score] as const
  })
  const avg=raw.length?mean(raw.map(x=>x[1])):1
  return Object.fromEntries(raw.map(([k,v])=>[k,clamp(v/Math.max(.5,avg),.60,1.30)]))
}

function volBucket(v:number){return !Number.isFinite(v)?'u':v<.35?'l':v<.75?'m':'h'}
function microBucket(v:number){return !Number.isFinite(v)?'u':v<42?'w':v>58?'s':'n'}

export function patternMemory(rows:XHistory[],x:{comp:string;regime:string;side:string;volPct:number;mtfSide:number;microScore:number}){
  const vb=volBucket(x.volPct), mb=microBucket(x.microScore)
  const xs=rows.filter(r=>r.comp===x.comp&&r.regime===x.regime&&r.side===x.side&&volBucket(Number(r.volPct))===vb)
  const close=xs.filter(r=>microBucket(Number(r.microScore))===mb && (!Number.isFinite(Number(r.mtfSide))||Number(r.mtfSide)===x.mtfSide))
  const sample=(close.length>=5?close:xs).slice(0,60)
  if(sample.length<5) return {n:sample.length,avgR:0,penalty:0,size_mult:1,state:'LEARNING'}
  const avgR=mean(sample.map(r=>Number(r.r)||0))
  const win=sample.filter(r=>r.pnl>0).length/sample.length
  const penalty=avgR<-.55?-14:avgR<-.25?-9:avgR<-.08?-4:avgR>.35?7:avgR>.15?4:0
  const size_mult=avgR<-.55?.45:avgR<-.25?.65:avgR<-.08?.82:avgR>.35?1.12:avgR>.15?1.06:1
  return {n:sample.length,avgR,win,penalty,size_mult,state:avgR<-.25?'AVOID':avgR>.15?'FAVORED':'NEUTRAL',fingerprint:`${x.comp}|${x.regime}|${x.side}|${vb}|${mb}|${x.mtfSide}`}
}

export function eliteBreadthCandidates<T extends {breadthScore?:number;strength?:number;sym?:string}>(xs:T[],cap:number){
  return [...xs].sort((a,b)=>(Number(b.breadthScore)||0)-(Number(a.breadthScore)||0)||(Number(b.strength)||0)-(Number(a.strength)||0)).slice(0,Math.max(1,cap))
}

export function portfolioBrainRank(c:any,ctx:{learned:number;intel:number;auction:number;pattern:number;burst:any}){
  let s=(Number(c.strength)||0)*12 + (Number(c.breadthScore)||0)*.45 + (Number(c.breakoutScore)||0)*12
  s*=Math.max(.5,ctx.learned)*Math.max(.5,ctx.intel)*Math.max(.5,ctx.auction)
  s+=ctx.pattern
  if(ctx.burst?.active&&Number(c.side)===Number(ctx.burst.side)) s+=8+Number(ctx.burst.strength||0)*.3
  return s
}

type Variant={name:string;be:number;partialAt:number;partialFraction:number;trail:number;gap:number}
const VARIANTS:Variant[]=[
  {name:'fast-lock',be:.65,partialAt:.75,partialFraction:.40,trail:.90,gap:.48},
  {name:'balanced-a',be:.75,partialAt:.85,partialFraction:.35,trail:1.00,gap:.55},
  {name:'balanced-b',be:.85,partialAt:.95,partialFraction:.30,trail:1.15,gap:.62},
  {name:'runner',be:.95,partialAt:1.10,partialFraction:.25,trail:1.35,gap:.72},
  {name:'wide-runner',be:1.05,partialAt:1.20,partialFraction:.20,trail:1.55,gap:.82},
]

function shadowR(r:XHistory,v:Variant){
  const actual=Number(r.r)||0,mfe=Number(r.mfeR),mae=Number(r.maeR)
  if(!Number.isFinite(mfe)) return actual
  let realised=0,rem=1
  if(mfe>=v.partialAt){realised+=v.partialFraction*v.partialAt;rem-=v.partialFraction}
  let runner=actual
  if(mfe>=v.trail) runner=Math.max(runner,mfe-v.gap)
  if(mfe>=v.be) runner=Math.max(runner,.03)
  if(Number.isFinite(mae)&&mae>=1&&mfe<v.be) runner=Math.min(runner,-1)
  return realised+rem*runner
}

export function shadowSwarm(rows:XHistory[],comp:string){
  const xs=rows.filter(r=>r.comp===comp&&Number.isFinite(Number(r.r))).slice(0,80).reverse()
  if(xs.length<12) return {comp,n:xs.length,status:'LEARNING',best:null,promoted:null,variants:[]}
  const cut=Math.max(8,Math.floor(xs.length*.7)),train=xs.slice(0,cut),test=xs.slice(cut)
  const scored=VARIANTS.map(v=>{
    const tr=mean(train.map(x=>shadowR(x,v))),te=mean(test.map(x=>shadowR(x,v)))
    return {...v,trainR:tr,testR:te,score:.4*tr+.6*te}
  }).sort((a,b)=>b.score-a.score)
  const actualTrain=mean(train.map(x=>Number(x.r)||0)),actualTest=mean(test.map(x=>Number(x.r)||0))
  const best=scored[0]
  const promoted=xs.length>=20&&test.length>=6&&best.trainR>actualTrain+.08&&best.testR>actualTest+.10&&best.testR>-.05?best:null
  return {comp,n:xs.length,status:promoted?'PROMOTED':'SHADOW',actual:{trainR:actualTrain,testR:actualTest},best,promoted,variants:scored.slice(0,3)}
}

export function promotedExitPolicy(base:any,lab:any){
  const p=lab?.promoted
  if(!p) return base
  return {...base,be:p.be,trail:p.trail,gap:p.gap,partialAt:p.partialAt,partialFraction:p.partialFraction,source:`shadow-promoted:${p.name} n=${lab.n}`}
}

export function profitCaptureDirective(x:{mfeR:number;currentR:number;partialDone:boolean}){
  const giveback=Math.max(0,x.mfeR-x.currentR)
  if(x.mfeR>=1.25&&giveback>=.45) return {tightenR:Math.max(.35,x.currentR-.08),partialNow:!x.partialDone,reason:'large_giveback'}
  if(x.mfeR>=.80&&giveback>=.32) return {tightenR:Math.max(.12,x.currentR-.06),partialNow:!x.partialDone,reason:'giveback'}
  return {tightenR:null,partialNow:false,reason:null}
}


export function portfolioProfitabilityGovernor(rows:XHistory[]){
  const xs=rows.filter(x=>Number.isFinite(Number(x.r))).slice(0,60)
  const recent20=xs.slice(0,20), recent40=xs.slice(0,40)
  const stats=(a:XHistory[])=>{
    const rs=a.map(x=>Number(x.r)||0)
    const pos=a.filter(x=>Number(x.pnl)>0).reduce((s,x)=>s+Number(x.pnl||0),0)
    const neg=Math.abs(a.filter(x=>Number(x.pnl)<0).reduce((s,x)=>s+Number(x.pnl||0),0))
    return {n:a.length,avgR:mean(rs),win:a.length?a.filter(x=>Number(x.pnl)>0).length/a.length:.5,pf:neg>0?pos/neg:(pos>0?9:1)}
  }
  const a=stats(recent20), b=stats(recent40)
  let mode:'DEFENSE'|'RECOVERY'|'NORMAL'|'ATTACK'='NORMAL'
  let minQuality=56, entryCap=4, riskMult=.85, allowBurst=false
  if(a.n>=10 && (a.avgR<-.15 || a.pf<.85)){
    mode='DEFENSE';minQuality=66;entryCap=2;riskMult=.45;allowBurst=false
  } else if(a.n>=10 && a.avgR<.05){
    mode='RECOVERY';minQuality=61;entryCap=3;riskMult=.65;allowBurst=false
  } else if(a.n>=15 && a.avgR>=.18 && a.pf>=1.25 && b.avgR>=0){
    mode='ATTACK';minQuality=54;entryCap=6;riskMult=1.05;allowBurst=true
  } else {
    mode='NORMAL';minQuality=57;entryCap=4;riskMult=.85;allowBurst=a.avgR>.08&&a.pf>=1.05
  }
  return {mode,recent20:a,recent40:b,min_quality:minQuality,entry_cap:entryCap,risk_mult:riskMult,allow_burst:allowBurst}
}

export function strategyProfitabilityGate(rows:XHistory[],comp:string,now:number){
  const xs=rows.filter(x=>x.comp===comp&&Number.isFinite(Number(x.r))).slice(0,50)
  const recent=xs.slice(0,12)
  const avgR=mean(xs.map(x=>Number(x.r)||0)), recentAvgR=mean(recent.map(x=>Number(x.r)||0))
  const win=xs.length?xs.filter(x=>Number(x.pnl)>0).length/xs.length:.5
  const lastClosed=Math.max(0,...xs.map((x:any)=>Number((x as any).closedAt)||0))
  let mode:'LIVE'|'PROBE'|'SHADOW'='LIVE',size_mult=1,min_quality=56,reason='edge_ok'
  if(xs.length<8){
    mode='PROBE';size_mult=.30;min_quality=68;reason='discovery_probe'
  } else if((avgR<=-.25&&recentAvgR<=-.12)||(xs.length>=15&&avgR<=-.18&&win<.42)){
    const probeDue=lastClosed>0&&now-lastClosed>=60*60_000
    mode=probeDue?'PROBE':'SHADOW'
    size_mult=probeDue?.12:0
    min_quality=probeDue?74:100
    reason=probeDue?'hourly_recovery_probe':'negative_expectancy_quarantine'
  } else if(avgR<-.08||recentAvgR<-.10){
    mode='PROBE';size_mult=.35;min_quality=68;reason='weak_expectancy_probe'
  } else if(avgR>=.12&&recentAvgR>=.08&&xs.length>=12){
    mode='LIVE';size_mult=1.05;min_quality=55;reason='positive_expectancy'
  }
  return {comp,n:xs.length,avgR,recentAvgR,win,lastClosed,mode,size_mult,min_quality,reason}
}
