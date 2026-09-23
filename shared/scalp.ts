// Experimental paper strategy. Role votes are rules, not LLM opinions or evidence of alpha.
export const SCALP = { maxHoldMs: 15*60_000, meetingMs: 5*60_000, fee: 0.0005, slip: 0.0003, maxSpread: 0.001, maxPositions: 4, allocation: 0.99 } as const
export interface Bar { t:number; o:number; h:number; l:number; c:number; v:number }
export interface Quote { bid:number; ask:number; ts:number; imbalance:number; source:string }
export interface Vote { who:string; says:string; vote:string; checked_at:string }
export function validQuote(q: Quote, now:number): boolean {
  return [q.bid,q.ask,q.ts,q.imbalance].every(Number.isFinite) && q.bid>0 && q.ask>=q.bid && now-q.ts>=-5000 && now-q.ts<20_000
}
function ema(a:number[], n:number) { let v=a[0]; for (const x of a.slice(1)) v += 2/(n+1)*(x-v); return v }
export function assess(sym:string,b:Bar[],q:Quote,now:number) {
  const votes:Vote[]=[]; const say=(who:string,says:string,vote:string)=>votes.push({who,says,vote,checked_at:new Date(now).toISOString()})
  const good=validQuote(q,now)&&b.length>=30&&now-b[b.length-1].t<150_000&&b.every((x,i)=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.l>0&&x.h>=Math.max(x.o,x.c)&&x.l<=Math.min(x.o,x.c)&&x.t+60_000<=now&&(!i||x.t-b[i-1].t===60_000))
  say('scout',`${sym}: ${good?'ספר פקודות ונרות דקה סגורים תקינים':'נתונים חסרים או ישנים'}`,good?'ok':'veto')
  if(!good)return {sym,side:0,stopPct:0,votes,score:0}
  const c=b.map(x=>x.c), last=c[c.length-1], atr=b.slice(-14).reduce((a,x)=>a+x.h-x.l,0)/14/last
  const trend=Math.sign(ema(c,8)-ema(c,21)); const momentum=Math.sign(last/c[c.length-4]-1)
  const flow=Math.abs(q.imbalance)>=0.1?Math.sign(q.imbalance):0
  const direction=trend+momentum+flow; const side=Math.abs(direction)>=2?Math.sign(direction):0
  const spread=(q.ask-q.bid)/((q.ask+q.bid)/2), cost=2*(SCALP.fee+SCALP.slip)+spread
  const liquid=spread<=SCALP.maxSpread; const rangeOk=atr*2.5>cost*1.3
  say('regime',`${sym}: EMA8/21 ${trend>0?'עולה':'יורד'}`,trend>0?'long':'short')
  say('rota',`${sym}: מומנטום 3 דקות ${momentum>0?'חיובי':'שלילי'}`,momentum>0?'long':'short')
  say('donch',`${sym}: חוסר איזון בספר ${(q.imbalance*100).toFixed(0)}%`,flow>0?'long':flow<0?'short':'hold')
  say('auditor',`${sym}: טווח תנודתיות ${(atr*250).toFixed(2)}%, אומדן עלות הלוך־חזור ${(cost*100).toFixed(2)}%; זה אינו אומדן רווח`,rangeOk?'ok':'veto')
  say('trader',`${sym}: מרווח ${(spread*100).toFixed(3)}%`,liquid?'ok':'veto')
  return {sym,side:liquid&&rangeOk?side:0,stopPct:Math.min(0.01,Math.max(0.003,atr*1.5)),votes,score:Math.abs(direction)}
}
export function exitPlan(t:any,q:Quote,now:number) {
  const dir=t.side==='LONG'?1:-1, entry=Number(t.entry_price), stop=Number(t.trail_sl)
  const px=dir===1?q.bid:q.ask, meta=t.scalp_meta||{}, stopPct=Number(meta.stop_pct)||0.004
  const held=now-Date.parse(t.opened_at)
  const timeout=held>=SCALP.maxHoldMs
  const stopped=dir===1?px<=stop:px>=stop
  // Stop decisions precede ratcheting; no retroactive intrabar fills.
  const move=(px-entry)/entry*dir
  const active=move>=2*(SCALP.fee+SCALP.slip)+0.001
  const candidate=px*(1-dir*stopPct*0.6)
  const newStop=active?(dir===1?Math.max(stop,candidate):Math.min(stop,candidate)):stop
  return {close:timeout||stopped,reason:timeout?'TIMEOUT':stopped?'STOP':'TRAIL',price:px*(1-dir*SCALP.slip),stop:newStop}
}
export function allocation(cash:number,equity:number,exposure:number,slots:number):number {
  if(![cash,equity,exposure,slots].every(Number.isFinite)||slots<=0||cash<=0||equity<=0)return 0
  return Math.max(0,Math.min(equity*0.25,(equity*SCALP.allocation-exposure)/slots,cash/(1+SCALP.fee)/slots))
}
