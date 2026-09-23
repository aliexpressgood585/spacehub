import {SCALP,assess,allocation,exitPlan,validQuote,type Quote,type Bar,type Vote,type Intel,type NewsItem,type LiqEvent} from '../../../shared/scalp.ts'
import {attribution,execStats,compliance,debate,hitPct,type Minute} from '../../../shared/desk.ts'
import {AGENTS,NEW_AGENTS,weights} from '../../../shared/agents.ts'
const UNIVERSE=['BTC','ETH','SOL','XRP','DOGE','ADA','LINK','AVAX']
async function json(url:string) {const r=await fetch(url,{signal:AbortSignal.timeout(3500)});if(!r.ok)throw new Error(`market HTTP ${r.status}`);return r.json()}
const NEWS_FEEDS=[['cointelegraph','https://cointelegraph.com/rss'],['coindesk','https://www.coindesk.com/arc/outboundfeeds/rss/']]
const tag=(x:string,n:string)=>{const m=x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`));return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim():''}
export function parseRss(xml:string,source:string):NewsItem[] {
  return xml.split('<item>').slice(1).map(x=>({title:tag(x,'title'),url:tag(x,'link'),ts:Date.parse(tag(x,'pubDate')),source})).filter(n=>n.title&&Number.isFinite(n.ts))
}
async function text(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(3500),redirect:'follow'});if(!r.ok)throw new Error(`news HTTP ${r.status}`);return r.text()}
// Public context. Failures here never block trading; they are reported by the scout.
async function intel(syms:string[]):Promise<{intel:Record<string,Intel>,news:NewsItem[],sources:string[],failed:string[]}> {
  const failed:string[]=[],sources:string[]=[];let news:NewsItem[]=[]
  await Promise.all(NEWS_FEEDS.map(async([src,url])=>{try{const n=parseRss(await text(url),src);news=news.concat(n);sources.push(`${src} (${n.length})`)}catch{failed.push(src)}}))
  const out:Record<string,Intel>={}
  await Promise.all(syms.map(async sym=>{
    const liqs:LiqEvent[]=[]
    try{
      const d=await json(`https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=${sym}-USDT&state=filled&limit=100`)
      if(d.code!=='0')throw new Error('okx liq')
      for(const g of d.data??[])if(g.instId===`${sym}-USDT-SWAP`)for(const e of g.details??[])liqs.push({side:e.posSide==='long'||(!e.posSide&&e.side==='sell')?'long':'short',px:+e.bkPx,sz:+e.sz,ts:+e.ts,source:'okx-liquidations'})
    }catch{failed.push(`liq:${sym}`)}
    let funding:number|null=null
    try{const f=await json(`https://www.okx.com/api/v5/public/funding-rate?instId=${sym}-USDT-SWAP`);const v=Number(f?.data?.[0]?.fundingRate);if(f.code==='0'&&Number.isFinite(v))funding=v}catch{failed.push(`funding:${sym}`)}
    out[sym]={news,liqs,funding}
  }))
  if(!failed.some(f=>f.startsWith('liq:')))sources.push('okx-liquidations')
  if(!failed.some(f=>f.startsWith('funding:')))sources.push('okx-funding')
  return {intel:out,news,sources,failed}
}
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
  const intelP=due?intel(UNIVERSE).catch(()=>({intel:{} as Record<string,Intel>,news:[] as NewsItem[],sources:[] as string[],failed:['intel']})):Promise.resolve(null)
  await Promise.all(symbols.map(async sym=>{try{const m=await market(sym,due&&UNIVERSE.includes(sym));if(!validQuote(m.q,Date.now()))throw new Error('stale quote');data.set(sym,m)}catch{failures.push(sym)}}))
  const ctx=await intelP
  const closedHist:any[]=due?((await db.from('bot_trades').select('sym,side,pnl,fee,opened_at,closed_at,scalp_meta').eq('strategy','SCALP').neq('status','OPEN').order('closed_at',{ascending:false}).limit(200).throwOnError()).data??[]):[]
  const att0=attribution(closedHist),W=weights(att0)
  const now=Date.now(),closes:any[]=[],updates:any[]=[],entries:any[]=[],marks:Record<string,number>={}
  let cash=Number(state.balance),exposure=0,equity=cash
  const retained:any[]=[]
  const evaluated=due?UNIVERSE.filter(sym=>data.has(sym)).map(sym=>assess(sym,data.get(sym)!.b,data.get(sym)!.q,now,{...(ctx?.intel[sym]??{news:[],liqs:[]}),btc:sym==='BTC'?undefined:data.get('BTC')?.b,weights:W})):[]
  const views=new Map(evaluated.map(x=>[x.sym,{side:x.side,weighted:x.weighted}]))
  for(const t of open) {
    const m=data.get(t.sym),dir=t.side==='LONG'?1:-1,notional=Number(t.entry_price)*Number(t.size)
    if(!m) {retained.push(t);exposure+=notional;equity+=notional;continue}
    const px=dir===1?m.q.bid:m.q.ask;marks[t.sym]=px
    const plan=exitPlan(t,m.q,now,due?views.get(t.sym):undefined)
    if(t.strategy!=='SCALP'||plan.close) {
      closes.push({id:t.id,price:plan.price,reason:t.strategy!=='SCALP'?'MODE_SWITCH':plan.reason,quote_ts:m.q.ts})
      cash+=notional+(plan.price-Number(t.entry_price))*Number(t.size)*dir-plan.price*Number(t.size)*SCALP.fee
    } else {retained.push(t);exposure+=notional;updates.push({id:t.id,stop:plan.stop})}
  }
  equity=cash+retained.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size)+(marks[t.sym]?((t.side==='LONG'?1:-1)*(marks[t.sym]-Number(t.entry_price))*Number(t.size)):0),0)
  const closedSyms=new Set(open.filter((t:any)=>closes.some(c=>c.id===t.id)).map((t:any)=>t.sym))
  const picks=evaluated.filter(x=>x.side&&!retained.some(t=>t.sym===x.sym)&&!closedSyms.has(x.sym)).sort((a,b)=>b.score-a.score)
  // Migration must finish before this account starts scalping. Never estimate missing marks into entries.
  const eligible=!failures.length&&!retained.some(t=>t.strategy!=='SCALP')&&!state.hard_halt_at&&!params.scalp_paused
  if(due&&eligible)for(const p of picks.slice(0,SCALP.maxPositions-retained.length)){
    const n=allocation(cash,equity,exposure,SCALP.maxPositions-retained.length-entries.length)
    if(n<20)continue
    const q=data.get(p.sym)!.q,price=(p.side===1?q.ask:q.bid)*(1+p.side*SCALP.slip)
    entries.push({sym:p.sym,side:p.side===1?'LONG':'SHORT',price,notional:n,stop_pct:p.stopPct,hold_min:p.holdMin,quote_ts:q.ts,source:q.source,votes:p.votes})
    cash-=n*(1+SCALP.fee);exposure+=n
  }
  const blocked=due?compliance(retained,entries,equity,exposure):[]
  if(blocked.length){for(const e of entries){cash+=e.notional*(1+SCALP.fee);exposure-=e.notional}entries.length=0}
  const minutes:Minute[]=[];const say=(who:string,says:string,vote='hold')=>minutes.push({who,says,vote,checked_at:new Date(now).toISOString(),round:1})
  if(due){
    const long=evaluated.filter(x=>x.side>0).length,short=evaluated.filter(x=>x.side<0).length
    const count=(who:string,v:string)=>evaluated.filter(x=>x.votes.find(y=>y.who===who)?.vote===v).length
    const tally=(who:string)=>`לונג ${count(who,'long')} · שורט ${count(who,'short')} · ניטרלי ${count(who,'hold')}${count(who,'veto')?` · חסימה ${count(who,'veto')}`:''}`
    const lead=(who:string,d:string)=>{const l=count(who,'long'),sh=count(who,'short');return l>sh?'long':sh>l?'short':d}
    const best=evaluated.find(x=>x.sym===entries[0]?.sym)||[...evaluated].sort((a,c)=>c.score-a.score)[0]
    const line=(who:string)=>best?.votes.find(v=>v.who===who)?.says||'אין מספיק נתונים'
    say('scout',`בדקתי ${data.size}/${UNIVERSE.length} חוזים (${[...new Set([...data.values()].map(m=>m.q.source))].join(', ')||'אין'}); חדשות וליקווידציות: ${ctx?.sources.join(', ')||'לא זמין'}${ctx?.failed.length?` · נכשלו: ${ctx.failed.join(', ')}`:''}`,failures.length?'veto':'ok')
    say('regime',`EMA8/21 על ${evaluated.length} מטבעות: ${tally('regime')}. ${line('regime')}`,lead('regime','hold'))
    say('rota',`מומנטום 3 דקות: ${tally('rota')}. ${line('rota')}`,lead('rota','hold'))
    say('donch',`אזורי liquidity sweep משוערים: ${tally('donch')}. ${line('donch')}`,lead('donch','hold'))
    for(const k of NEW_AGENTS)say(k,`${AGENTS[k].role} (משקל ${(W[k]??1).toFixed(2)}): ${tally(k)}. ${line(k)}`,lead(k,'hold'))
    say('risk',`דמו 1x; עד ${SCALP.maxPositions} פוזיציות, עד ${SCALP.perCoin*100}% למטבע ועד ${SCALP.allocation*100}% הקצאה אחרי עמלות. עצירת כניסות בהפסד יומי 5% או ירידה 15%. ${line('risk')}`,eligible?'ok':'veto')
    say('trader',`ספר פקודות: ${tally('trader')}. מועמדות לביצוע: ${entries.map(e=>`${e.sym} ${e.side}`).join(', ')||'אין הסכמה מתאימה'}. זמן החזקה מתוכנן לפי התנאים: ${entries.map(e=>`${e.sym} ${e.hold_min} דק׳`).join(', ')||'—'} (1–15). בכל ישיבה: סגירה מוקדמת אם הצוות מתהפך, הארכה לעסקה מרוויחה שהצוות עדיין תומך בה.`,entries.length?'ok':'hold')
    say('treasurer',`מזומן צפוי אחרי הפעולות $${cash.toFixed(2)}; ${retained.length+entries.length}/${SCALP.maxPositions} פוזיציות. הביצוע נבדק שוב באותה עסקת מסד נתונים.`)
    say('auditor',`עלות מול תנודתיות: ${count('auditor','ok')} עוברים, ${count('auditor','veto')} נחסמים. אסטרטגיה ניסיונית ללא אימות היסטורי; מחקרי העבר מצאו שסקאלפ מתחת לשעה לא עבר עלויות.`,count('auditor','ok')?'ok':'veto')
    say('reporter',`סיכום: ${long} מועמדי לונג, ${short} מועמדי שורט, ${entries.length} כניסות נשלחו לביצוע. בדיקת צוות כל דקה, בדיקת יציאות כל 10 שניות.`)
  }
  if(due){
    const att=attribution(closedHist),ex=execStats(closedHist)
    const spreads=evaluated.map(x=>Number(x.signals?.spread_bps)).filter(Number.isFinite)
    const reasons=Object.entries(ex.reasons).map(([k,v])=>`${k} ${v}`).join(', ')
    say('execution',`מרווח ממוצע ${spreads.length?(spreads.reduce((a,b)=>a+b,0)/spreads.length).toFixed(1):'—'} נק׳ בסיס; ביצוע דמו במחיר ה-ask/bid עם החלקה ${(SCALP.slip*1e4).toFixed(0)} נק׳. ${ex.n?`${ex.n} עסקאות אחרונות: החזקה ממוצעת ${ex.avgHoldMin?.toFixed(1)} דק׳, סיבות יציאה: ${reasons}, עמלות $${ex.fees.toFixed(2)}, נטו $${ex.net.toFixed(2)}.`:'אין עדיין עסקאות סגורות.'}`,spreads.some(x=>x>SCALP.maxSpread*1e4)?'veto':'ok')
    minutes[minutes.length-1].data={spread_bps:spreads,...ex}
    say('compliance',blocked.length?`חסימה: ${blocked.join(', ')}.`:`בדקתי את התוכנית: דמו 1x, עד ${SCALP.maxPositions} פוזיציות, ללא מטבע כפול, עד ${SCALP.perCoin*100}% למטבע, חשיפה עד ${SCALP.allocation*100}%. תקין.`,blocked.length?'veto':'ok')
    const top=[...evaluated].sort((a,c)=>c.score-a.score)[0]
    const best=evaluated.find(x=>x.sym===entries[0]?.sym)||picks[0]||top
    minutes.push(...debate(best,att,entries.length>0,blocked,now,!!best&&retained.some((t:any)=>t.sym===best.sym),W))
    const q=minutes.find(m=>m.who==='quant');if(q)q.data={...att,hit:Object.fromEntries(Object.entries(att).map(([k,v])=>[k,hitPct(v)])),weights:W}
  }
  const {data:result}=await db.rpc('scalp_commit_cycle',{p_lease:lease,p_closes:closes,p_updates:updates,p_entries:entries,p_minutes:due?minutes:null,p_marks:marks,p_feed:{source:'perpetuals',ok:data.size,fail:failures.length,failures},p_candidates:due?evaluated:null}).throwOnError()
  return result
}
