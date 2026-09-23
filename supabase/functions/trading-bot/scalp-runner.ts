import {SCALP,assess,allocation,exitPlan,validQuote,type Quote,type Bar,type Vote} from '../../../shared/scalp.ts'
const UNIVERSE=['BTC','ETH','SOL','XRP','DOGE','ADA','LINK','AVAX']
async function json(url:string) {const r=await fetch(url,{signal:AbortSignal.timeout(3500)});if(!r.ok)throw new Error(`market HTTP ${r.status}`);return r.json()}
async function market(sym:string, candles:boolean):Promise<{q:Quote,b:Bar[]}> {
  // Perpetual-contract sources only; never silently substitute spot prices.
  try {
    const [d,k]=await Promise.all([json(`https://fapi.binance.com/fapi/v1/depth?symbol=${sym}USDT&limit=5`),candles?json(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}USDT&interval=1m&limit=65`):Promise.resolve([])])
    const bid=Number(d.bids[0][0]),ask=Number(d.asks[0][0]),bs=d.bids.reduce((s:number,x:any)=>s+Number(x[1]),0),as=d.asks.reduce((s:number,x:any)=>s+Number(x[1]),0)
    const q={bid,ask,ts:Number(d.E),imbalance:(bs-as)/(bs+as),source:'binance-futures'}
    if(!validQuote(q,Date.now()))throw new Error('stale Binance quote')
    return {q,b:k.filter((x:any)=>Number(x[6])<Date.now()).map((x:any)=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}))}
  } catch {
    const inst=`${sym}-USDT-SWAP`
    const [d,k]=await Promise.all([json(`https://www.okx.com/api/v5/market/books?instId=${inst}&sz=5`),candles?json(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=1m&limit=65`):Promise.resolve({data:[]})])
    if(d.code!=='0'||!d.data?.[0]||(candles&&k.code!=='0'))throw new Error(`OKX market unavailable ${sym}`)
    const v=d.data[0],bs=v.bids.reduce((s:number,x:any)=>s+Number(x[1]),0),as=v.asks.reduce((s:number,x:any)=>s+Number(x[1]),0)
    return {q:{bid:+v.bids[0][0],ask:+v.asks[0][0],ts:+v.ts,imbalance:(bs-as)/(bs+as),source:'okx-swap'},b:k.data.filter((x:any)=>x[8]==='1').reverse().map((x:any)=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}))}
  }
}
export async function runScalp(db:any,state:any,lease:string,paper:boolean) {
  if(!paper)throw new Error('SCALP is paper-only; refusing live execution')
  const {data:open}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
  if(open.some((t:any)=>t.paper_mode!==true||Number(t.lev)!==1))throw new Error('SCALP transition requires a paper-only 1x book')
  const {data:meetings}=await db.from('team_meetings').select('ts').order('ts',{ascending:false}).limit(1).throwOnError()
  const params=state.bot_params||{}
  const due=!params.scalp_started||!meetings?.length||Date.now()-Date.parse(meetings[0].ts)>=SCALP.meetingMs
  const symbols=[...new Set<string>([...open.map((t:any)=>String(t.sym)),...(due?UNIVERSE:[])])]
  const data=new Map<string,{q:Quote,b:Bar[]}>(); const failures:string[]=[]
  await Promise.all(symbols.map(async sym=>{try{const m=await market(sym,due&&UNIVERSE.includes(sym));if(!validQuote(m.q,Date.now()))throw new Error('stale quote');data.set(sym,m)}catch{failures.push(sym)}}))
  const now=Date.now(),closes:any[]=[],updates:any[]=[],entries:any[]=[],marks:Record<string,number>={}
  let cash=Number(state.balance),exposure=0,equity=cash
  const retained:any[]=[]
  for(const t of open) {
    const m=data.get(t.sym),dir=t.side==='LONG'?1:-1,notional=Number(t.entry_price)*Number(t.size)
    if(!m) {retained.push(t);exposure+=notional;equity+=notional;continue}
    const px=dir===1?m.q.bid:m.q.ask;marks[t.sym]=px
    const plan=exitPlan(t,m.q,now)
    if(t.strategy!=='SCALP'||plan.close) {
      closes.push({id:t.id,price:plan.price,reason:t.strategy!=='SCALP'?'MODE_SWITCH':plan.reason,quote_ts:m.q.ts})
      cash+=notional+(plan.price-Number(t.entry_price))*Number(t.size)*dir-plan.price*Number(t.size)*SCALP.fee
    } else {retained.push(t);exposure+=notional;updates.push({id:t.id,stop:plan.stop})}
  }
  equity=cash+retained.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size)+(marks[t.sym]?((t.side==='LONG'?1:-1)*(marks[t.sym]-Number(t.entry_price))*Number(t.size)):0),0)
  const evaluated=due?UNIVERSE.filter(sym=>data.has(sym)).map(sym=>assess(sym,data.get(sym)!.b,data.get(sym)!.q,now)):[]
  const closedSyms=new Set(open.filter((t:any)=>closes.some(c=>c.id===t.id)).map((t:any)=>t.sym))
  const picks=evaluated.filter(x=>x.side&&!retained.some(t=>t.sym===x.sym)&&!closedSyms.has(x.sym)).sort((a,b)=>b.score-a.score)
  // Migration must finish before this account starts scalping. Never estimate missing marks into entries.
  const eligible=!failures.length&&!retained.some(t=>t.strategy!=='SCALP')&&!state.hard_halt_at&&!params.scalp_paused
  if(due&&eligible)for(const p of picks.slice(0,SCALP.maxPositions-retained.length)){
    const n=allocation(cash,equity,exposure,SCALP.maxPositions-retained.length-entries.length)
    if(n<20)continue
    const q=data.get(p.sym)!.q,price=(p.side===1?q.ask:q.bid)*(1+p.side*SCALP.slip)
    entries.push({sym:p.sym,side:p.side===1?'LONG':'SHORT',price,notional:n,stop_pct:p.stopPct,quote_ts:q.ts,source:q.source,votes:p.votes})
    cash-=n*(1+SCALP.fee);exposure+=n
  }
  const minutes:Vote[]=[];const say=(who:string,says:string,vote='hold')=>minutes.push({who,says,vote,checked_at:new Date(now).toISOString()})
  if(due){
    say('scout',`בדקתי ${data.size} חוזים; ${failures.length} מקורות חסרים. ${[...new Set([...data.values()].map(m=>m.q.source))].join(', ')}`,failures.length?'veto':'ok')
    const best=evaluated.find(x=>x.sym===entries[0]?.sym)||evaluated[0]
    for(const who of ['regime','rota','donch','auditor'])say(who,best?.votes.find(v=>v.who===who)?.says||'אין מספיק נתונים להחלטה',best?.votes.find(v=>v.who===who)?.vote||'hold')
    say('risk',`דמו 1x; עד 4 פוזיציות, עד 25% למטבע ועד 99% הקצאה אחרי עמלות. עצירת כניסות בהפסד יומי 5% או ירידה 15%.`,eligible?'ok':'veto')
    say('trader',`מועמדות לביצוע: ${entries.map(e=>`${e.sym} ${e.side}`).join(', ')||'אין הסכמה מתאימה'}. סטופ נגרר וסגירת זמן ב-15 דקות.`)
    say('treasurer',`מזומן צפוי אחרי הפעולות $${cash.toFixed(2)}. הביצוע ייבדק שוב באותה עסקת מסד נתונים.`)
    say('reporter','הצבעות אלגוריתמיות מנתוני שוק; אסטרטגיית דמו ניסיונית ללא אימות היסטורי. סריקת יציאות כל 10 שניות; השהיות או נתונים חסרים עלולים לעכב סגירה.')
  }
  const {data:result}=await db.rpc('scalp_commit_cycle',{p_lease:lease,p_closes:closes,p_updates:updates,p_entries:entries,p_minutes:due?minutes:null,p_marks:marks,p_feed:{source:'perpetuals',ok:data.size,fail:failures.length,failures},p_candidates:due?evaluated:null}).throwOnError()
  return result
}
