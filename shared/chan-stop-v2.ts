import type { AggTrade } from './fast.ts'

export type StopV2Exit = 'LIQUIDATION'|'STOP'|'TARGET'

export interface StopV2Policy {
  be:number; trail:number; gap:number; lock1:number; lock2:number
}
export interface StopV2State {
  comp:string
  dir:1|-1
  entry:number
  r:number
  stop:number
  target:number|null
  liq:number
  best:number
  worst:number
  mfeR:number
  maeR:number
  costFrac:number
  policy?:StopV2Policy|null
}

export interface StopV2Result {
  why:StopV2Exit|null
  px?:number
  T?:number
  lastT:number|null
  stop:number
  best:number
  worst:number
  mfeR:number
  maeR:number
  beArmed:boolean
  trailActive:boolean
  phase:string
}

const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x))

export function initialStopV2(x:{
  comp:string; side:1|-1; close:number; atr:number; proposed:number;
  swingLow?:number|null; swingHigh?:number|null
}):number {
  const {comp,side,close,atr,proposed}=x
  if(!(close>0)||!(atr>0)||!(proposed>0)) return proposed
  if(comp==='RG_MR') return proposed
  const swing=side>0?Number(x.swingLow):Number(x.swingHigh)
  if(!(swing>0)) return proposed
  const bufferAtr =
    comp==='RG_LIQ_SQUEEZE' ? 0.05 :
    comp==='RG_BREADTH_MOMENTUM' ? 0.08 :
    comp==='RG_VOL_BREAKOUT' ? 0.12 :
    0.10
  const structure=side>0?swing-bufferAtr*atr:swing+bufferAtr*atr
  if(!(side*(close-structure)>0)) return proposed
  // Never tighten inside the already proposed invalidation point. Structure may widen it;
  // the liquidation guard later decides whether that wider stop is safe at 50x.
  return side>0?Math.min(proposed,structure):Math.max(proposed,structure)
}

export function targetRV2(x:{comp:string;quality:number;mtfAligned:boolean;intelAligned:boolean}):number {
  if(x.comp==='RG_MR') return NaN
  let r =
    x.comp==='RG_LIQ_SQUEEZE' ? 1.8 :
    x.comp==='RG_VOL_BREAKOUT' ? 2.0 :
    x.comp==='RG_BREADTH_MOMENTUM' ? 2.0 :
    x.comp==='RG_MOM' ? 2.0 : 1.8
  if(x.quality>=72) r+=0.35
  if(x.quality>=84) r+=0.35
  if(x.mtfAligned) r+=0.20
  if(x.intelAligned) r+=0.15
  return clamp(r,1.6,3.0)
}

export function liquidationStopLimitV2(volPct:number,quality:number):number {
  if(Number.isFinite(volPct)&&volPct>=0.80) return quality>=85?0.68:0.62
  if(quality>=82) return 0.75
  if(quality>=68) return 0.72
  return 0.68
}

export function strategySizeMultV2(comp:string,stats:{n:number;avgR:number;win:number}):number {
  if(comp!=='RG_TREND_PULLBACK') return 1
  if(stats.n>=20 && stats.avgR<0 && stats.win<0.35) return 0.50
  if(stats.n>=12 && stats.avgR<0) return 0.65
  if(stats.n>=12 && stats.avgR>=0 && stats.win>=0.40) return 1
  return 0.80
}

const tighten=(dir:1|-1,oldStop:number,newStop:number)=>{
  if(!(newStop>0)) return oldStop
  return dir>0?Math.max(oldStop,newStop):Math.min(oldStop,newStop)
}

function profile(comp:string){
  if(comp==='RG_LIQ_SQUEEZE') return {be:0.80,trail:1.15,gap:0.65,lock1:0.25,lock2:0.60}
  if(comp==='RG_VOL_BREAKOUT') return {be:0.80,trail:1.20,gap:0.70,lock1:0.25,lock2:0.55}
  if(comp==='RG_BREADTH_MOMENTUM') return {be:0.85,trail:1.20,gap:0.70,lock1:0.25,lock2:0.55}
  if(comp==='RG_MR') return {be:1.10,trail:99,gap:99,lock1:0.15,lock2:0.35}
  return {be:0.90,trail:1.30,gap:0.75,lock1:0.20,lock2:0.50}
}

export function manageStopV2(s:StopV2State,trades:AggTrade[]):StopV2Result {
  let stop=s.stop,best=s.best,worst=s.worst,mfeR=Math.max(0,s.mfeR||0),maeR=Math.max(0,s.maeR||0)
  let lastT:number|null=null,beArmed=false,trailActive=false,phase='initial'
  const d=s.dir,p=s.policy?{...profile(s.comp),...s.policy}:profile(s.comp)
  for(const t of trades){
    const px=Number(t.p)
    if(!(px>0)) continue
    lastT=t.T
    if(d*(px-s.liq)<=0) return {why:'LIQUIDATION',px:s.liq,T:t.T,lastT,stop,best,worst,mfeR,maeR,beArmed,trailActive,phase}
    if(d*(px-stop)<=0) return {why:'STOP',px,T:t.T,lastT,stop,best,worst,mfeR,maeR,beArmed,trailActive,phase}
    if(s.target!==null&&d*(px-s.target)>=0) return {why:'TARGET',px:s.target,T:t.T,lastT,stop,best,worst,mfeR,maeR,beArmed,trailActive,phase}

    if(d*(px-best)>0) best=px
    if(d*(px-worst)<0) worst=px
    mfeR=Math.max(mfeR,d*(best-s.entry)/s.r)
    maeR=Math.max(maeR,-d*(worst-s.entry)/s.r)

    if(mfeR>=p.be){
      beArmed=true
      const costBE=s.entry*(1+d*Math.max(0,s.costFrac)*1.05)
      stop=tighten(d,stop,costBE)
      phase='break_even'
    }
    if(mfeR>=1.20){
      stop=tighten(d,stop,s.entry+d*p.lock1*s.r)
      phase='profit_lock_1'
    }
    if(mfeR>=1.50){
      stop=tighten(d,stop,s.entry+d*p.lock2*s.r)
      phase='profit_lock_2'
    }
    if(mfeR>=p.trail){
      trailActive=true
      stop=tighten(d,stop,best-d*p.gap*s.r)
      phase='atr_r_trail'
    }
  }
  return {why:null,lastT,stop,best,worst,mfeR,maeR,beArmed,trailActive,phase}
}

export function stalledExitV2(x:{comp:string;ageBars:number;mfeR:number;currentR:number}):boolean {
  const a=x.ageBars,m=x.mfeR,r=x.currentR
  if(x.comp==='RG_VOL_BREAKOUT') return a>=4&&m<0.50&&r<0.15
  if(x.comp==='RG_BREADTH_MOMENTUM') return a>=6&&m<0.45&&r<0.12
  if(x.comp==='RG_LIQ_SQUEEZE') return a>=6&&m<0.45&&r<0.10
  if(x.comp==='RG_TREND_PULLBACK') return a>=12&&m<0.35&&r<0.10
  if(x.comp==='RG_MOM') return a>=10&&m<0.40&&r<0.10
  return false
}
