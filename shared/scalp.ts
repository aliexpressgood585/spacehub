// Experimental paper strategy. Role votes are rules, not LLM opinions or evidence of alpha.
// v71.0: up to 8 concurrent positions (matches the DB guard in scalp_commit_cycle),
// team check + entries every minute, 1-15 min holds, trailing stop, EMA/momentum/
// order-book imbalance/estimated liquidity-sweep zones, plus public news and
// liquidation context that only counts when its source, time and price check out.
export const SCALP = { maxHoldMs: 15*60_000, minHoldMs: 60_000, meetingMs: 60_000, fee: 0.0005, slip: 0.0003, maxSpread: 0.001, maxPositions: 8, allocation: 0.99, perCoin: 0.25, newsMaxAgeMs: 60*60_000, liqMaxAgeMs: 10*60_000, liqMaxPxDev: 0.03 } as const
export interface Bar { t:number; o:number; h:number; l:number; c:number; v:number }
export interface Quote { bid:number; ask:number; ts:number; imbalance:number; source:string }
export interface Vote { who:string; says:string; vote:string; checked_at:string }
// Public context, each item carrying where it came from and when.
export interface NewsItem { title:string; source:string; url:string; ts:number }
export interface LiqEvent { side:'long'|'short'; px:number; sz:number; ts:number; source:string }
export interface Intel { news:NewsItem[]; liqs:LiqEvent[] }
export function validQuote(q: Quote, now:number): boolean {
  return [q.bid,q.ask,q.ts,q.imbalance].every(Number.isFinite) && q.bid>0 && q.ask>=q.bid && now-q.ts>=-5000 && now-q.ts<20_000
}
function ema(a:number[], n:number) { let v=a[0]; for (const x of a.slice(1)) v += 2/(n+1)*(x-v); return v }

const NAMES:Record<string,string[]>={BTC:['bitcoin','btc'],ETH:['ethereum','ether','eth'],SOL:['solana','sol'],XRP:['xrp','ripple'],DOGE:['dogecoin','doge'],ADA:['cardano','ada'],LINK:['chainlink','link'],AVAX:['avalanche','avax']}
// Estimated liquidity-sweep: the last closed bar wicked beyond the prior 20-bar
// extreme (where resting stops/liquidations are assumed to sit) and closed back
// inside. +1 = swept lows and reclaimed, -1 = swept highs and rejected.
export function liquiditySweep(b:Bar[]):{dir:number,zoneLo:number,zoneHi:number} {
  if(b.length<22)return {dir:0,zoneLo:NaN,zoneHi:NaN}
  const prior=b.slice(-21,-1), last=b[b.length-1]
  const lo=Math.min(...prior.map(x=>x.l)), hi=Math.max(...prior.map(x=>x.h))
  const dir=last.l<lo&&last.c>lo?1:last.h>hi&&last.c<hi?-1:0
  return {dir,zoneLo:lo,zoneHi:hi}
}
// News counts only if it is fresh (time), names the coin, and the price since
// publication moved >=0.3% (price verification). The confirmed move's sign is
// the vote; unconfirmed headlines are reported, never traded.
export function newsCheck(sym:string,b:Bar[],news:NewsItem[],now:number):{dir:number,item:NewsItem|null,move:number,verified:boolean} {
  const keys=NAMES[sym]??[sym.toLowerCase()]
  const hit=news.filter(n=>Number.isFinite(n.ts)&&n.ts<=now+60_000&&now-n.ts<=SCALP.newsMaxAgeMs&&n.source&&keys.some(k=>new RegExp(`\\b${k}\\b`,'i').test(n.title))).sort((a,c)=>c.ts-a.ts)[0]
  if(!hit||!b.length)return {dir:0,item:hit??null,move:0,verified:false}
  const ref=b.find(x=>x.t+60_000>hit.ts)??null
  if(!ref)return {dir:0,item:hit,move:0,verified:false}
  const move=b[b.length-1].c/ref.o-1
  const verified=Math.abs(move)>=0.003
  return {dir:verified?Math.sign(move):0,item:hit,move,verified}
}
// Public liquidations are valid only if recent and their bankruptcy price is
// within 3% of the live mid. If one side was flushed and price has reclaimed
// the flush level, the vote is AGAINST the liquidated side (sweep done).
export function liqCheck(liqs:LiqEvent[],mid:number,now:number):{dir:number,valid:number,rejected:number,longSz:number,shortSz:number} {
  let longSz=0,shortSz=0,valid=0,rejected=0,lpx=0,spx=0
  for(const e of liqs){
    const ok=Number.isFinite(e.px)&&e.px>0&&Number.isFinite(e.sz)&&e.sz>0&&now-e.ts<=SCALP.liqMaxAgeMs&&e.ts<=now+60_000&&Math.abs(e.px/mid-1)<=SCALP.liqMaxPxDev&&!!e.source
    if(!ok){rejected++;continue}
    valid++
    if(e.side==='long'){longSz+=e.sz;lpx+=e.px*e.sz}else{shortSz+=e.sz;spx+=e.px*e.sz}
  }
  const tot=longSz+shortSz; let dir=0
  if(tot>0&&valid>=2){
    if(longSz/tot>=0.7&&mid>lpx/longSz)dir=1
    else if(shortSz/tot>=0.7&&mid<spx/shortSz)dir=-1
  }
  return {dir,valid,rejected,longSz,shortSz}
}
export function assess(sym:string,b:Bar[],q:Quote,now:number,intel:Intel={news:[],liqs:[]}) {
  const votes:Vote[]=[]; const say=(who:string,says:string,vote:string)=>votes.push({who,says,vote,checked_at:new Date(now).toISOString()})
  const good=validQuote(q,now)&&b.length>=30&&now-b[b.length-1].t<150_000&&b.every((x,i)=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.l>0&&x.h>=Math.max(x.o,x.c)&&x.l<=Math.min(x.o,x.c)&&x.t+60_000<=now&&(!i||x.t-b[i-1].t===60_000))
  say('scout',`${sym}: ${good?'ספר פקודות ונרות דקה סגורים תקינים':'נתונים חסרים או ישנים'} (${q.source})`,good?'ok':'veto')
  if(!good)return {sym,side:0,stopPct:0,votes,score:0,signals:null}
  const c=b.map(x=>x.c), last=c[c.length-1], atr=b.slice(-14).reduce((a,x)=>a+x.h-x.l,0)/14/last
  const mid=(q.bid+q.ask)/2
  const trend=Math.sign(ema(c,8)-ema(c,21)); const momentum=Math.sign(last/c[c.length-4]-1)
  const flow=Math.abs(q.imbalance)>=0.1?Math.sign(q.imbalance):0
  const sweep=liquiditySweep(b)
  const nw=newsCheck(sym,b,intel.news,now)
  const lq=liqCheck(intel.liqs,mid,now)
  const direction=trend+momentum+flow+sweep.dir+nw.dir+lq.dir
  // Needs a net 2-vote majority and must not fight the EMA trend.
  const raw=Math.abs(direction)>=2?Math.sign(direction):0
  const side=raw&&trend!==-raw?raw:0
  const spread=(q.ask-q.bid)/mid, cost=2*(SCALP.fee+SCALP.slip)+spread
  const liquid=spread<=SCALP.maxSpread; const rangeOk=atr*2.5>cost*1.3
  const vs=(d:number)=>d>0?'long':d<0?'short':'hold'
  say('regime',`${sym}: EMA8/21 ${trend>0?'עולה':'יורד'}`,vs(trend))
  say('rota',`${sym}: מומנטום 3 דקות ${momentum>0?'חיובי':'שלילי'}`,vs(momentum))
  say('donch',`${sym}: אזור נזילות משוער ${sweep.zoneLo.toPrecision(6)}–${sweep.zoneHi.toPrecision(6)}; ${sweep.dir>0?'סחיפת תחתית וחזרה':sweep.dir<0?'סחיפת שיא ודחייה':'אין סחיפה'}`,vs(sweep.dir))
  say('trader',`${sym}: חוסר איזון בספר ${(q.imbalance*100).toFixed(0)}%, מרווח ${(spread*100).toFixed(3)}%`,liquid?vs(flow):'veto')
  say('risk',`${sym}: ${nw.item?`חדשות: "${nw.item.title.slice(0,70)}" (${nw.item.source}, ${new Date(nw.item.ts).toISOString().slice(11,16)}Z) · תנועת מחיר מאז ${(nw.move*100).toFixed(2)}% ${nw.verified?'מאומת':'לא מאומת — לא נספר'}`:'אין חדשות טריות'} · ליקווידציות תקפות ${lq.valid} (נפסלו ${lq.rejected})`,vs(nw.dir+lq.dir))
  say('auditor',`${sym}: טווח תנודתיות ${(atr*250).toFixed(2)}%, אומדן עלות הלוך־חזור ${(cost*100).toFixed(2)}%; זה אינו אומדן רווח`,rangeOk?'ok':'veto')
  return {sym,side:liquid&&rangeOk?side:0,stopPct:Math.min(0.01,Math.max(0.003,atr*1.5)),votes,score:Math.abs(direction),
    signals:{trend,momentum,flow,sweep:sweep.dir,news:nw.dir,liq:lq.dir,news_title:nw.item?.title??null,news_source:nw.item?.source??null,news_ts:nw.item?.ts??null,news_verified:nw.verified,spread_bps:spread*1e4,liq_valid:lq.valid,liq_rejected:lq.rejected}}
}
export function exitPlan(t:any,q:Quote,now:number) {
  const dir=t.side==='LONG'?1:-1, entry=Number(t.entry_price), stop=Number(t.trail_sl)
  const px=dir===1?q.bid:q.ask, meta=t.scalp_meta||{}, stopPct=Number(meta.stop_pct)||0.004
  const held=now-Date.parse(t.opened_at)
  const timeout=held>=SCALP.maxHoldMs
  // The protective stop always fires; nothing else can close inside the first minute.
  const stopped=dir===1?px<=stop:px>=stop
  // Stop decisions precede ratcheting; no retroactive intrabar fills.
  const move=(px-entry)/entry*dir
  const active=held>=SCALP.minHoldMs&&move>=2*(SCALP.fee+SCALP.slip)+0.001
  const candidate=px*(1-dir*stopPct*0.6)
  const newStop=active?(dir===1?Math.max(stop,candidate):Math.min(stop,candidate)):stop
  return {close:timeout||stopped,reason:timeout?'TIMEOUT':stopped?'STOP':'TRAIL',price:px*(1-dir*SCALP.slip),stop:newStop}
}
export function allocation(cash:number,equity:number,exposure:number,slots:number):number {
  if(![cash,equity,exposure,slots].every(Number.isFinite)||slots<=0||cash<=0||equity<=0)return 0
  return Math.max(0,Math.min(equity*SCALP.perCoin,(equity*SCALP.allocation-exposure)/slots,cash/(1+SCALP.fee)/slots))
}
