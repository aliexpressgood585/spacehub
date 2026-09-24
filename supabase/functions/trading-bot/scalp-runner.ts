import {SCALP,assess,allocation,balancePicks,exitPlan,validQuote,type Quote,type Bar,type Vote,type Intel,type NewsItem,type LiqEvent} from '../../../shared/scalp.ts'
import {attribution,execStats,compliance,debate,hitPct,type Minute} from '../../../shared/desk.ts'
import {AGENTS,NEW_AGENTS} from '../../../shared/agents.ts'
import {refineWeights,type AgentStatus} from '../../../shared/swarm.ts'
import {COST,profitGate,expectedGross,bookFrom,riskScale,corrScale,slipPerSide,type Book,type GateResult} from '../../../shared/costs.ts'
import {SWARM,TEAMS,decayStat,scoreSnapshot,learnedWeight,meanBps,tStat,hT,LEARN,teamWeights,bestHorizon,hKey,type Stat,type Team} from '../../../shared/swarm.ts'
import {DIRECTIONAL} from '../../../shared/desk.ts'
import {CRYPTO_40} from '../../../shared/strategy.ts'
import {INFO_IDS,infoVotes,xsScore,retOver,oiMove,type InfoData} from '../../../shared/info.ts'
import {FACTORY,TF_MIN,features,vote,spawn,step,statKeys,OOS,gymPicks,type FactoryRow,type GymPass,type Tf} from '../../../shared/factory.ts'
// v85.0 gym: genomes that passed the offline 36m walk-forward (status/gym-latest.json, committed by the
// backtest workflow) are seeded into live TRIAL ahead of random spawns. Cached hourly in market_cache;
// any failure = no gym picks this meeting, never an error that blocks trading.
const OKX_BAR:Record<string,string>={'15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','8h':'8H','12h':'12H','1d':'1Dutc','3d':'3Dutc','1w':'1Wutc'}
const GYM_URL='https://raw.githubusercontent.com/aliexpressgood585/spacehub/main/status/gym-latest.json'
async function gymPassed(db:any,now:number):Promise<{passed:GymPass[],ran_at:string|null}>{
  const {data:rows}=await db.from('market_cache').select('key,data,ts').eq('key','gym').throwOnError()
  const c=rows?.[0];if(c&&now-Date.parse(c.ts)<3600_000)return c.data
  const r=await fetch(GYM_URL,{signal:AbortSignal.timeout(6000)});if(r.status===404)return {passed:[],ran_at:null};if(!r.ok)throw new Error(`gym ${r.status}`)
  const j=await r.json();const passed:GymPass[]=(j.genomes??[]).filter((g:any)=>g.pass).map((g:any)=>({id:g.id,genome:g.genome,h:g.h,oos_t:g.oos_t,is:g.is}))
  const data={passed,ran_at:j.ran_at??null};await db.from('market_cache').upsert({key:'gym',data,ts:new Date(now).toISOString()}).throwOnError();return data
}
// v85.1: completed 4h / 1d bars for the gym's slow genomes (tf '4h' | '1d'), refreshed hourly and cached
// in market_cache (`bars_4h` / `bars_1d`). Binance USDT-M first (PEPE via 1000PEPE, per-coin units), OKX swap fallback.
async function slowBars(db:any,now:number,tfs:Tf[]):Promise<Partial<Record<Tf,Record<string,Bar[]>>>>{
  const out:Partial<Record<Tf,Record<string,Bar[]>>>={}
  if(!tfs.length)return out
  const {data:rows}=await db.from('market_cache').select('key,data,ts').in('key',tfs.map(t=>`bars_${t}`)).throwOnError()
  for(const tf of tfs){
    const c=(rows??[]).find((r:any)=>r.key===`bars_${tf}`)
    if(c&&now-Date.parse(c.ts)<Math.min(60,TF_MIN[tf]??60)*60_000){out[tf]=c.data;continue}   // refresh at the bar's own pace, at most hourly
    const fresh:Record<string,Bar[]>={}
    await pool([...UNIVERSE],8,async sym=>{
      const {s,k}=bsym(sym)
      try{const r=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${tf}&limit=100`);const b:Bar[]=r.filter((x:any)=>Number(x[6])<now).map((x:any)=>({t:+x[0],o:+x[1]/k,h:+x[2]/k,l:+x[3]/k,c:+x[4]/k,v:+x[5]*k,q:+x[9]*k,n:+x[8]}));if(b.length<85)throw new Error('short');fresh[sym]=b}
      catch{try{const r=await json(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=${OKX_BAR[tf]??tf}&limit=100`);if(r.code!=='0')throw new Error('okx');const b:Bar[]=r.data.filter((x:any)=>x[8]==='1').reverse().map((x:any)=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));if(b.length>=85)fresh[sym]=b}catch{}}
    })
    if(Object.keys(fresh).length>=20){out[tf]=fresh;await db.from('market_cache').upsert({key:`bars_${tf}`,data:fresh,ts:new Date(now).toISOString()}).throwOnError()}
    else out[tf]=c?.data??{}
  }
  return out
}
// v77.0: the validated 40-coin universe (standing rule 2), priced from Binance USDT-M futures first.
export const UNIVERSE:string[]=[...CRYPTO_40]
// Binance lists some coins in 1000-unit contracts; prices are divided and sizes multiplied
// back so every price the agents see is per ONE coin, the same unit as the OKX fallback.
export const BINANCE_SYM:Record<string,{s:string,k:number}>={PEPE:{s:'1000PEPEUSDT',k:1000}}
const bsym=(sym:string)=>BINANCE_SYM[sym]??{s:`${sym}USDT`,k:1}
// small worker pool so 40 coins never fire 80+ requests in one burst
async function pool<T>(items:T[],n:number,fn:(x:T)=>Promise<void>){let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length)await fn(items[i++])}))}
async function json(url:string) {const r=await fetch(url,{signal:AbortSignal.timeout(3500)});if(!r.ok)throw new Error(`market HTTP ${r.status}`);return r.json()}
const NEWS_FEEDS=[['cointelegraph','https://cointelegraph.com/rss'],['coindesk','https://www.coindesk.com/arc/outboundfeeds/rss/']]
const tag=(x:string,n:string)=>{const m=x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`));return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim():''}
export function parseRss(xml:string,source:string):NewsItem[] {
  return xml.split('<item>').slice(1).map(x=>({title:tag(x,'title'),url:tag(x,'link'),ts:Date.parse(tag(x,'pubDate')),source})).filter(n=>n.title&&Number.isFinite(n.ts))
}
async function text(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(3500),redirect:'follow'});if(!r.ok)throw new Error(`news HTTP ${r.status}`);return r.text()}
// Public context. Failures here never block trading; they are reported by the scout.
async function intel(syms:string[]):Promise<{intel:Record<string,Intel>,news:NewsItem[],sources:string[],failed:string[],premium:Record<string,number>}> {
  const failed:string[]=[],sources:string[]=[];let news:NewsItem[]=[]
  await Promise.all(NEWS_FEEDS.map(async([src,url])=>{try{const n=parseRss(await text(url),src);news=news.concat(n);sources.push(`${src} (${n.length})`)}catch{failed.push(src)}}))
  const out:Record<string,Intel>={}
  const bnFunding:Record<string,number>={},bnPremium:Record<string,number>={}
  try{const all=await json('https://fapi.binance.com/fapi/v1/premiumIndex');for(const x of all??[]){const v=Number(x.lastFundingRate);if(Number.isFinite(v))bnFunding[x.symbol]=v;const mk=Number(x.markPrice),ix=Number(x.indexPrice);if(mk>0&&ix>0)bnPremium[x.symbol]=mk/ix-1};sources.push('binance-funding')}catch{failed.push('binance-funding')}
  // OKX public liquidation endpoint rate-limits bursts: 4 at a time, one retry after a short pause
  await pool(syms,4,async sym=>{
    const liqs:LiqEvent[]=[]
    try{
      const url=`https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=${sym}-USDT&state=filled&limit=100`
      let d=await json(url).catch(()=>null)
      if(!d||d.code!=='0'){await new Promise(r=>setTimeout(r,400));d=await json(url)}
      if(d.code!=='0')throw new Error('okx liq')
      for(const g of d.data??[])if(g.instId===`${sym}-USDT-SWAP`)for(const e of g.details??[])liqs.push({side:e.posSide==='long'||(!e.posSide&&e.side==='sell')?'long':'short',px:+e.bkPx,sz:+e.sz,ts:+e.ts,source:'okx-liquidations'})
    }catch{failed.push(`liq:${sym}`)}
    let funding:number|null=bnFunding[bsym(sym).s]??null
    if(funding===null)try{const f=await json(`https://www.okx.com/api/v5/public/funding-rate?instId=${sym}-USDT-SWAP`);const v=Number(f?.data?.[0]?.fundingRate);if(f.code==='0'&&Number.isFinite(v))funding=v}catch{failed.push(`funding:${sym}`)}
    out[sym]={news,liqs,funding}
  })
  if(!failed.some(f=>f.startsWith('liq:')))sources.push('okx-liquidations')
  const premium=Object.fromEntries(syms.filter(s=>Number.isFinite(bnPremium[bsym(s).s])).map(s=>[s,bnPremium[bsym(s).s]]))
  return {intel:out,news,sources,failed,premium}
}
// v82.0 slow public data for the info agents + factory: daily closes (hourly refresh) and
// hourly open interest (15-min refresh), cached in market_cache. Failures = those agents abstain.
const CACHE={dailyMs:3600_000,oiMs:15*60_000}
async function slowData(db:any,now:number):Promise<{daily:InfoData['daily'],oi:InfoData['oi'],notes:string[],ratios:InfoData['ratios']}> {
  const notes:string[]=[]
  const {data:rows}=await db.from('market_cache').select('key,data,ts').throwOnError()
  const get=(k:string)=>(rows??[]).find((r:any)=>r.key===k)
  const age=(k:string)=>get(k)?now-Date.parse(get(k).ts):Infinity
  let daily:InfoData['daily']=get('daily')?.data??{},oi:InfoData['oi']=get('oi')?.data??{}
  if(age('daily')>=CACHE.dailyMs){
    const fresh:InfoData['daily']={}
    await pool(UNIVERSE,8,async sym=>{
      try{const k=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${bsym(sym).s}&interval=1d&limit=100`);const c=k.filter((x:any)=>Number(x[6])<now).map((x:any)=>+x[4]).filter((x:number)=>x>0);if(c.length<15)throw new Error('short');fresh[sym]=c}
      catch{try{const k=await json(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=1Dutc&limit=100`);if(k.code!=='0')throw new Error('okx');const c=k.data.filter((x:any)=>x[8]==='1').reverse().map((x:any)=>+x[4]).filter((x:number)=>x>0);if(c.length>=15)fresh[sym]=c}catch{}}
    })
    notes.push(`ימים ${Object.keys(fresh).length}/${UNIVERSE.length}`)
    if(Object.keys(fresh).length>=32){daily=fresh;await db.from('market_cache').upsert({key:'daily',data:fresh,ts:new Date(now).toISOString()}).throwOnError()}
  }
  if(age('oi')>=CACHE.oiMs){
    const fresh:InfoData['oi']={}
    await pool(UNIVERSE,8,async sym=>{
      try{const k=await json(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${bsym(sym).s}&period=1h&limit=30`);const r=(k??[]).map((x:any)=>({oi:+x.sumOpenInterest,v:+x.sumOpenInterestValue})).filter((x:any)=>x.oi>0&&x.v>0);if(r.length>=5)fresh[sym]={oi:r.map((x:any)=>x.oi),px:r.map((x:any)=>x.v/x.oi)}}catch{}
    })
    notes.push(`OI ${Object.keys(fresh).length}/${UNIVERSE.length}`)
    if(Object.keys(fresh).length>=20){oi=fresh;await db.from('market_cache').upsert({key:'oi',data:fresh,ts:new Date(now).toISOString()}).throwOnError()}
  }
  // v85.5: top-trader long/short (positions) and taker buy/sell volume ratios, hourly — feed the tls / tlr genes
  let ratios:InfoData['ratios']=get('ratios')?.data??{}
  if(age('ratios')>=CACHE.dailyMs){
    const fresh:NonNullable<InfoData['ratios']>={}
    await pool(UNIVERSE,8,async sym=>{
      try{const [a,b]=await Promise.all([json(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${bsym(sym).s}&period=1h&limit=1`),json(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${bsym(sym).s}&period=1h&limit=1`)])
        const tls=Number(a?.[0]?.longShortRatio),tlr=Number(b?.[0]?.buySellRatio);if(Number.isFinite(tls)&&Number.isFinite(tlr))fresh[sym]={tls:tls-1,tlr:tlr-1}}catch{}
    })
    notes.push(`יחסים ${Object.keys(fresh).length}/${UNIVERSE.length}`)
    if(Object.keys(fresh).length>=20){ratios=fresh;await db.from('market_cache').upsert({key:'ratios',data:fresh,ts:new Date(now).toISOString()}).throwOnError()}
  }
  return {daily,oi,notes,ratios}
}
async function market(sym:string, candles:boolean):Promise<{q:Quote,b:Bar[],book:Book}> {   // v86.0: + a 20-level book for the cost model
  // Perpetual-contract sources only; never silently substitute spot prices.
  try {
    const {s:bs0,k:K}=bsym(sym)
    const [d,k]=await Promise.all([json(`https://fapi.binance.com/fapi/v1/depth?symbol=${bs0}&limit=20`),candles?json(`https://fapi.binance.com/fapi/v1/klines?symbol=${bs0}&interval=1m&limit=65`):Promise.resolve([])])
    const bid=Number(d.bids[0][0])/K,ask=Number(d.asks[0][0])/K,bs=d.bids.reduce((s:number,x:any)=>s+Number(x[1]),0),as=d.asks.reduce((s:number,x:any)=>s+Number(x[1]),0)
    const q={bid,ask,ts:Number(d.E),imbalance:(bs-as)/(bs+as),source:'binance-futures'}
    if(!validQuote(q,Date.now()))throw new Error('stale Binance quote')
    return {q,book:bookFrom(d.bids,d.asks,Number(d.E),'binance-futures',K),b:k.filter((x:any)=>Number(x[6])<Date.now()).map((x:any)=>({t:+x[0],o:+x[1]/K,h:+x[2]/K,l:+x[3]/K,c:+x[4]/K,v:+x[5]*K,q:+x[9]*K,n:+x[8]}))}   // v85.5: taker-buy volume + trades feed ti5/ti30/nt
  } catch {
    const inst=`${sym}-USDT-SWAP`
    const [d,k]=await Promise.all([json(`https://www.okx.com/api/v5/market/books?instId=${inst}&sz=5`),candles?json(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=1m&limit=65`):Promise.resolve({data:[]})])
    if(d.code!=='0'||!d.data?.[0]||(candles&&k.code!=='0'))throw new Error(`OKX market unavailable ${sym}`)
    const v=d.data[0],bs=v.bids.reduce((s:number,x:any)=>s+Number(x[1]),0),as=v.asks.reduce((s:number,x:any)=>s+Number(x[1]),0)
    // OKX sizes are CONTRACTS (ctVal differs per instrument): depth in coins is not observed here -> NaN, the cost model marks impact inferred
    return {q:{bid:+v.bids[0][0],ask:+v.asks[0][0],ts:+v.ts,imbalance:(bs-as)/(bs+as),source:'okx-swap'},book:{bid:+v.bids[0][0],ask:+v.asks[0][0],ts:+v.ts,source:'okx-swap',bidDepth10:NaN,askDepth10:NaN},b:k.data.filter((x:any)=>x[8]==='1').reverse().map((x:any)=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}))}
  }
}
export async function runScalp(db:any,state:any,lease:string,paper:boolean,rotaShare:number=0) {  // v83.0: rotaShare>0 = the ROTA sleeve shares this book
  if(!paper)throw new Error('SCALP is paper-only; refusing live execution')
  const {data:open}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
  if(open.some((t:any)=>t.paper_mode!==true||Number(t.lev)!==1))throw new Error('SCALP transition requires a paper-only 1x book')
  const {data:meetings}=await db.from('team_meetings').select('ts').order('ts',{ascending:false}).limit(1).throwOnError()
  const params=state.bot_params||{}
  const due=!params.scalp_started||!meetings?.length||Date.now()-Date.parse(meetings[0].ts)>=SCALP.meetingMs
  const symbols=[...new Set<string>([...open.map((t:any)=>String(t.sym)),...(due?UNIVERSE:[])])]
  const data=new Map<string,{q:Quote,b:Bar[],book:Book}>(); const failures:string[]=[]
  const intelP=due?intel(UNIVERSE).catch(()=>({intel:{} as Record<string,Intel>,news:[] as NewsItem[],sources:[] as string[],failed:['intel'],premium:{} as Record<string,number>})):Promise.resolve(null)
  await pool(symbols,10,async sym=>{try{const m=await market(sym,due&&UNIVERSE.includes(sym));if(!validQuote(m.q,Date.now()))throw new Error('stale quote');data.set(sym,m)}catch{failures.push(sym)}})
  const ctx=await intelP
  const closedHist:any[]=due?((await db.from('bot_trades').select('sym,side,pnl,fee,opened_at,closed_at,scalp_meta').eq('strategy','SCALP').neq('status','OPEN').order('closed_at',{ascending:false}).limit(200).throwOnError()).data??[]):[]
  // v75.0 shadow learning: every agent's weight comes from how its votes did over the next 5 minutes.
  let learnErr=''
  const statRows:Stat[]=due?await Promise.resolve(db.from('agent_stats').select('agent,n,s,s2,ev,updated_at').throwOnError()).then((r:any)=>r.data??[],(e:any)=>{learnErr=String(e?.message??e);return []}):[]
  // v83.2: `ev` MUST be read back — without it every cycle restarted the event count at 0, wrote 1, and k=n/ev deflated every t to ~0
  const stats:Record<string,Stat>=Object.fromEntries(statRows.map(r=>[r.agent,decayStat({...r,n:+r.n,s:+r.s,s2:+r.s2,ev:+(r.ev??0)},r.agent,Date.now())]))
  // v79.0: each agent is weighted on its best horizon (5/15/60/240 min, net of costs); weights never all hit zero.
  // v82.0 info agents (days-long momentum, open interest, basis) — data no 1-minute agent sees
  let info:InfoData={daily:{},oi:{},premium:ctx?.premium??{}},infoNote=''
  if(due)try{const sd=await slowData(db,Date.now());info={...info,daily:sd.daily,oi:sd.oi,ratios:sd.ratios};infoNote=sd.notes.join(', ')}catch(e:any){infoNote=`מטמון: ${String(e?.message??e).slice(0,60)}`}
  const infoV=due?infoVotes(UNIVERSE,info):{}
  const xs=(d:number)=>xsScore(Object.fromEntries(UNIVERSE.map(s=>[s,retOver(info.daily[s],d)])))
  const xm7=xs(7),xm14=xs(14),xm28=xs(28),xm60=xs(60),xm90=xs(90)
  // v82.0 agent factory: trial / oos candidates vote in SHADOW only; live ones (their post-selection alias) join the team
  let frows:FactoryRow[]=[],retiredIds:string[]=[],factErr=''
  if(due)try{const {data:fr}=await db.from('factory_agents').select('id,genome,stage,born,stage_at,h,note').throwOnError();for(const r of fr??[]){if(r.stage==='retired')retiredIds.push(r.id);else frows.push(r)}}catch(e:any){factErr=String(e?.message??e)}
  const liveF=frows.filter(r=>r.stage==='live')
  const factVotes:Record<string,Record<string,number>>={}
  // v85.1: slow (4h / 1d) genomes read their own bars; a missing slow feed = those genomes abstain, nothing else changes
  const slowTfs=[...new Set(frows.map(r=>r.genome.tf).filter((t):t is Tf=>!!t))]
  let slow:Partial<Record<Tf,Record<string,Bar[]>>>={},slowNote=''
  if(due&&slowTfs.length)try{slow=await slowBars(db,Date.now(),slowTfs)}catch(e:any){slowNote=String(e?.message??e).slice(0,60)}
  if(due&&frows.length)for(const sym of UNIVERSE){
    const m=data.get(sym);if(!m)continue
    const {doi,dpx}=oiMove(info.oi[sym]),doi1d=oiMove(info.oi[sym],24).doi,rt=info.ratios?.[sym]
    const more={xm60:xm60[sym],xm90:xm90[sym],doi1d,tls:rt?.tls,tlr:rt?.tlr}
    const f=features(m.b,{imbalance:m.q.imbalance,funding:ctx?.intel[sym]?.funding,premium:info.premium[sym],xm7:xm7[sym],xm14:xm14[sym],xm28:xm28[sym],doi,dpx,...more,btc:sym==='BTC'?undefined:data.get('BTC')?.b})
    const fs:Partial<Record<Tf,Record<string,number>>>={}
    for(const tf of slowTfs){const b=slow[tf]?.[sym];if(b&&b.length>=65)fs[tf]=features(b,{xm7:xm7[sym],xm14:xm14[sym],xm28:xm28[sym],funding:ctx?.intel[sym]?.funding,premium:info.premium[sym],doi,dpx,...more,btc:sym==='BTC'?undefined:slow[tf]?.BTC})}
    const v:Record<string,number>={}
    for(const r of frows){let d=0;try{const ff=r.genome.tf?fs[r.genome.tf]:f;d=ff?vote(r.genome,ff,Date.now()):0}catch{d=0}if(d){v[r.id]=d;if(r.stage!=='trial')v[OOS(r.id)]=d}}   // v85.4: `now` applies a genome's hour/day gate
    factVotes[sym]=v
  }
  const VOTERS=[...DIRECTIONAL,...SWARM.map(x=>x.id),...INFO_IDS,...liveF.map(r=>OOS(r.id))]
  // v86.0 promotion = net edge (teamWeights) + stability + unique contribution (refineWeights, on the latest stored votes)
  const tw0=teamWeights(stats,VOTERS)
  let lastVotes:Record<string,Record<string,number>>={}
  if(due)try{const {data:ls}=await db.from('agent_snapshots').select('votes').order('ts',{ascending:false}).limit(1).throwOnError();lastVotes=ls?.[0]?.votes??{}}catch{}
  const ref=refineWeights(stats,tw0,lastVotes)
  const team={...tw0,W:ref.W},W=team.W,H=team.H
  // promotions / demotions / duplicates as events (diffed against the previous meeting's statuses)
  let agentEv=0
  if(due)try{
    const {data:pr}=await db.from('market_cache').select('data').eq('key','agent_status').throwOnError()
    const prev:Record<string,AgentStatus>=pr?.[0]?.data??{},evs:any[]=[]
    const tOf=(a:string)=>{const h=H[a]??5,st=stats[hKey(a,h)];return st?+hT(st,h).toFixed(2):null}
    if(Object.keys(prev).length)for(const [a,s1] of Object.entries(ref.status)){const s0=prev[a];if(s0&&s0!==s1)evs.push({agent:a,from_status:s0,to_status:s1,t:tOf(a),horizon_min:H[a]??null,detail:s1==='duplicate'?`duplicate of ${ref.dupOf[a]}`:s1==='unstable'?'best horizon not confirmed by its neighbour':null})}
    if(evs.length)await db.from('agent_events').insert(evs.slice(0,200)).throwOnError()
    agentEv=evs.length
    await db.from('market_cache').upsert({key:'agent_status',data:ref.status,ts:new Date().toISOString()}).throwOnError()
  }catch{}
  const now=Date.now(),closes:any[]=[],updates:any[]=[],entries:any[]=[],marks:Record<string,number>={}
  let cash=Number(state.balance),exposure=0,equity=cash
  const retained:any[]=[]
  const evaluated=due?UNIVERSE.filter(sym=>data.has(sym)).map(sym=>assess(sym,data.get(sym)!.b,data.get(sym)!.q,now,{...(ctx?.intel[sym]??{news:[],liqs:[]}),btc:sym==='BTC'?undefined:data.get('BTC')?.b,weights:W,mode:team.mode,extra:{...(infoV[sym]??{}),...Object.fromEntries(liveF.map(r=>[OOS(r.id),factVotes[sym]?.[OOS(r.id)]??0]))}})):[]
  const views=new Map(evaluated.map(x=>[x.sym,{side:x.side,weighted:x.weighted}]))
  let learned:{scored:number,updated:number}={scored:0,updated:0}
  if(due&&evaluated.length&&!learnErr){
    try{
      const votes=Object.fromEntries(evaluated.filter(x=>Number.isFinite(x.mid)).map(x=>[x.sym,{...Object.fromEntries(Object.entries(x.dirs).filter(([,d])=>d)),...(factVotes[x.sym]??{})}]))
      const px=Object.fromEntries(evaluated.filter(x=>Number.isFinite(x.mid)).map(x=>[x.sym,x.mid]))
      const lo=new Date(now-LEARN.horizonMs-120_000).toISOString(),hi=new Date(now-LEARN.horizonMs+30_000).toISOString()
      const {data:old}=await db.from('agent_snapshots').select('id,ts,votes,px').eq('scored',false).gte('ts',lo).lte('ts',hi).order('ts',{ascending:true}).limit(1).throwOnError()
      if(old?.length){
        const upd=scoreSnapshot(stats,old[0].votes,old[0].px,px,now)
        const rows=Object.values(upd)
        if(rows.length)await db.from('agent_stats').upsert(rows).throwOnError()
        await db.from('agent_snapshots').update({scored:true}).eq('id',old[0].id).throwOnError()
        for(const r of rows){stats[r.agent]=r}
        learned={scored:1,updated:rows.length}
      }
      // longer horizons: the snapshot taken ~h minutes ago (meetings are ~60s apart, so each is scored ~once per horizon)
      for(const h of LEARN.horizonsMin.slice(1)){
        const {data:hs}=await db.from('agent_snapshots').select('ts,votes,px').gt('ts',new Date(now-h*60_000-60_000).toISOString()).lte('ts',new Date(now-h*60_000).toISOString()).order('ts',{ascending:false}).limit(1).throwOnError()
        if(!hs?.length)continue
        const upd=scoreSnapshot(stats,hs[0].votes,hs[0].px,px,now,LEARN.costBps,`@${h}`),rows=Object.values(upd)
        if(rows.length)await db.from('agent_stats').upsert(rows).throwOnError()
        for(const r of rows){stats[r.agent]=r}
        learned.scored++;learned.updated+=rows.length
      }
      await db.from('agent_snapshots').insert({votes,px}).throwOnError()
      await db.from('agent_snapshots').delete().lt('ts',new Date(now-26*3600_000).toISOString()).throwOnError()  // v83.0: keep 26h so the 1440-min horizon can be scored
    }catch(e:any){learnErr=String(e?.message??e)}
  }
  // v82.0 factory lifecycle: judge, retire (and forget their stats), refill the population
  let fc={trial:0,oos:0,live:0,retired:retiredIds.length,moved:[] as string[],gym:0,gymSeeded:0,gymNote:''}
  if(due&&!factErr)try{
    const changed=frows.map(r=>step(r,stats,now)).filter((x):x is FactoryRow=>!!x)
    const byId=new Map(changed.map(r=>[r.id,r]))
    const after=frows.map(r=>byId.get(r.id)??r).filter(r=>r.stage!=='retired')
    const retiring=changed.filter(r=>r.stage==='retired')
    const taken=new Set([...retiredIds,...frows.map(r=>r.id)])
    const at=new Date(now).toISOString()
    const parents=after.filter(r=>r.stage!=='trial').map(r=>r.genome)
    const nonLive=after.filter(r=>r.stage!=='live').length
    let gym:{passed:GymPass[],ran_at:string|null}={passed:[],ran_at:null};try{gym=await gymPassed(db,now)}catch(e:any){fc.gymNote=String(e?.message??e).slice(0,60)}
    // v85.9: a gym passer never waits for a random genome to retire — it may take the population up to pop+20
    const fromGym=gymPicks(gym.passed,taken,Math.max(0,Math.min(FACTORY.spawnPerMeeting,FACTORY.pop+FACTORY.spawnPerMeeting-nonLive))).map(g=>({id:g.id,genome:g.genome,stage:'trial' as const,born:at,stage_at:at,h:null,note:g.note}))
    for(const g of fromGym)taken.add(g.id)
    fc.gym=gym.passed.length;fc.gymSeeded=fromGym.length
    const slots=Math.max(0,Math.min(FACTORY.spawnPerMeeting,FACTORY.pop-nonLive-fromGym.length))
    const born=[...fromGym,...spawn(slots,Math.floor(now/60000),taken,parents).map(g=>({id:g.id,genome:g.genome,stage:'trial' as const,born:at,stage_at:at,h:null,note:g.parent?`child of ${g.parent}`:null}))]
    if(changed.length||born.length)await db.from('factory_agents').upsert([...changed,...born]).throwOnError()
    if(retiring.length)await db.from('agent_stats').delete().in('agent',retiring.flatMap(r=>statKeys(r.id))).throwOnError()
    for(const r of [...after,...born])fc[r.stage as 'trial'|'oos'|'live']++
    fc.retired+=retiring.length
    fc.moved=changed.filter(r=>r.stage!=='retired').map(r=>`${r.id}→${r.stage}`)
  }catch(e:any){factErr=String(e?.message??e)}
  for(const t of open) {
    const m=data.get(t.sym),dir=t.side==='LONG'?1:-1,notional=Number(t.entry_price)*Number(t.size)
    if(!m) {retained.push(t);exposure+=notional;equity+=notional;continue}
    const px=dir===1?m.q.bid:m.q.ask;marks[t.sym]=px
    // v83.0: a ROTA slot is a foreign position — marked, counted in equity, never touched here
    if(t.strategy==='ROTA'){retained.push(t);exposure+=notional;continue}
    const plan=exitPlan(t,m.q,now,due?views.get(t.sym):undefined)
    if(t.strategy!=='SCALP'||plan.close) {
      // v86.0 one cost model: the exit pays the depth-based slippage measured NOW, beyond the fixed floor exitPlan already applied
      const extra=Math.max(0,slipPerSide(m.book,notional,dir===1?-1:1).slip-SCALP.slip),xp=plan.price*(1-dir*extra)
      closes.push({id:t.id,price:xp,reason:t.strategy!=='SCALP'?'MODE_SWITCH':plan.reason,quote_ts:m.q.ts,funding_rate:ctx?.intel[t.sym]?.funding??null})
      cash+=notional+(xp-Number(t.entry_price))*Number(t.size)*dir-xp*Number(t.size)*SCALP.fee
    } else {retained.push(t);exposure+=notional;updates.push({id:t.id,stop:plan.stop})}
  }
  equity=cash+retained.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size)+(marks[t.sym]?((t.side==='LONG'?1:-1)*(marks[t.sym]-Number(t.entry_price))*Number(t.size)):0),0)
  const closedSyms=new Set(open.filter((t:any)=>closes.some(c=>c.id===t.id)).map((t:any)=>t.sym))
  const picks=evaluated.filter(x=>x.side&&!retained.some(t=>t.sym===x.sym)&&!closedSyms.has(x.sym)).sort((a,b)=>b.score-a.score)
  // Migration must finish before this account starts scalping. Never estimate missing marks into entries.
  const scalpRows=retained.filter(t=>t.strategy==='SCALP'),rotaRows=retained.filter(t=>t.strategy==='ROTA')
  const scalpExpo=scalpRows.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size),0)
  const scalpShare=Math.max(0,SCALP.allocation-rotaShare)
  const eligible=failures.length<=Math.floor(UNIVERSE.length*0.2)&&open.every((t:any)=>data.has(String(t.sym)))&&!retained.some(t=>!['SCALP','ROTA'].includes(t.strategy))&&!state.hard_halt_at&&!params.scalp_paused
  // v76.0 whole portfolio: free capital is split among the entries of THIS meeting
  // (not among all 8 slots), capped per coin, so 2 signals use the whole account.
  // v79.0: planned hold = weighted median best-horizon of the agents voting WITH the trade; the stop widens with sqrt(hold)
  for(const p of picks){
    const backers=Object.entries(p.dirs).filter(([a,d])=>d===p.side&&(W[a]??1)>0).map(([a])=>({h:H[a]??5,w:W[a]??1})).sort((a,b)=>a.h-b.h)
    const tot=backers.reduce((x,b)=>x+b.w,0);let acc=0,hold=p.holdMin
    for(const b of backers){acc+=b.w;if(acc>=tot/2){hold=b.h;break}}
    p.holdMin=Math.max(SCALP.minHoldMin,Math.min(SCALP.maxHoldMs/60_000,hold))   // v86.0: 5 min - 4 h
    p.stopPct=Math.min(0.04,p.stopPct*Math.sqrt(Math.max(1,p.holdMin/5)))
  }
  // v80.0: concentrate — only the strongest 1-2 signals of this meeting get capital
  // v81.0: ...and never more than SCALP.maxSameSide of the book on one side
  // v86.0 PROFIT GATE + continuous opportunity ranking. Every candidate with a side is priced with ONE cost model
  // (taker fees, quoted spread, depth-based impact, funding over the planned hold) against the expected GROSS edge
  // of its backers (their measured net edge + the learning round trip). Only net-positive (beyond a margin) survive;
  // survivors are ranked by expected net and sized by RISK (0.5% at the stop) × graded risk scale × correlation scale.
  const today=new Date(now).toISOString().slice(0,10)
  const peak=Math.max(Number(params.scalp_peak)||equity,equity),dayStart=params.scalp_day===today?(Number(params.scalp_day_equity)||equity):equity
  const risk=riskScale(equity,peak,dayStart)
  const rets=(sym:string)=>{const b=data.get(sym)?.b??[];return b.slice(1).map((x,i)=>x.c/b[i].c-1)}
  const decisions:any[]=[]
  const gated=picks.map(p=>{
    const m=data.get(p.sym)!,side=p.side as 1|-1
    const backers=Object.entries(p.dirs).filter(([a,d])=>d===side&&(W[a]??0)>0).map(([a])=>{const h=H[a]??5,st=stats[hKey(a,h)];return {w:W[a]??0,netBps:st?meanBps(st):NaN,n:st?.n??0,t:st?hT(st,h):0}})
    const eg=expectedGross(backers)
    const n0=Math.min(equity*SCALP.perCoin,equity*SCALP.riskPerTrade*risk.mult/Math.max(0.003,p.stopPct))
    const g=profitGate({grossEdgeBps:eg.bps,edgeN:eg.n,book:m.book,notional:n0,side,holdMin:p.holdMin,funding:ctx?.intel[p.sym]?.funding??null})
    return {p,g,eg,n0}
  }).sort((a,b)=>(Number.isFinite(b.g.net_bps)?b.g.net_bps:-1e9)-(Number.isFinite(a.g.net_bps)?a.g.net_bps:-1e9))
  const passed=gated.filter(x=>x.g.pass)
  const take=balancePicks(passed.map(x=>x.p),scalpRows.map((t:any)=>t.side==='LONG'?1:-1),Math.min(SCALP.maxEntries,SCALP.maxPositions-scalpRows.length))
  const bookRet=scalpRows.map((t:any)=>({ret:rets(t.sym),side:t.side==='LONG'?1:-1,weight:equity>0?Number(t.entry_price)*Number(t.size)/equity:0}))
  const takenWhy=new Map<string,string>()
  if(due&&eligible)for(const p of take){
    const G=passed.find(x=>x.p===p)!,cs=corrScale(rets(p.sym),p.side,bookRet)
    const n=Math.min(allocation(cash,equity,scalpExpo+entries.reduce((s:number,e:any)=>s+e.notional,0),take.length-entries.length,scalpShare),G.n0*cs.mult)
    if(n<20){takenWhy.set(p.sym,'no_capital');continue}
    const m=data.get(p.sym)!,q=m.q,sl=slipPerSide(m.book,n,p.side as 1|-1).slip,price=(p.side===1?q.ask:q.bid)*(1+p.side*sl)
    entries.push({sym:p.sym,side:p.side===1?'LONG':'SHORT',price,notional:n,stop_pct:p.stopPct,hold_min:p.holdMin,quote_ts:q.ts,source:q.source,votes:p.votes,
      costs:G.g.cost,gross_bps:G.g.gross_bps,net_bps:G.g.net_bps,risk_mult:risk.mult,corr_mult:cs.mult})
    bookRet.push({ret:rets(p.sym),side:p.side,weight:equity>0?n/equity:0})
    takenWhy.set(p.sym,'taken');cash-=n*(1+SCALP.fee);exposure+=n
  }
  for(const [i,x] of gated.entries()){
    const why=!x.g.pass?x.g.reason:!eligible?'engine_not_eligible':takenWhy.get(x.p.sym)??(take.includes(x.p)?'no_capital':'ranked_below_cut')
    const m=data.get(x.p.sym)!,b=m.book,mid=(b.bid+b.ask)/2
    decisions.push({sym:x.p.sym,side:x.p.side===1?'LONG':'SHORT',decision:why==='taken'?'accepted':'rejected',reason:why,rank:i+1,
      gross_bps:Number.isFinite(x.g.gross_bps)?x.g.gross_bps:null,cost_bps:x.g.cost?.total_bps??null,net_bps:Number.isFinite(x.g.net_bps)?x.g.net_bps:null,
      hold_min:x.p.holdMin,notional:+x.n0.toFixed(2),backers:x.eg.n?Object.entries(x.p.dirs).filter(([a,d])=>d===x.p.side&&(W[a]??0)>0).length:0,risk_mult:risk.mult,
      observed:{source:b.source,bid:b.bid,ask:b.ask,spread_bps:mid>0?+((b.ask-b.bid)/mid*1e4).toFixed(2):null,bid_depth10_usd:Number.isFinite(b.bidDepth10)?Math.round(b.bidDepth10):null,ask_depth10_usd:Number.isFinite(b.askDepth10)?Math.round(b.askDepth10):null,
        imbalance:+m.q.imbalance.toFixed(3),funding:ctx?.intel[x.p.sym]?.funding??null,premium:info.premium[x.p.sym]??null,oi_4h:(()=>{const o=oiMove(info.oi[x.p.sym]);return Number.isFinite(o.doi)?+o.doi.toFixed(4):null})()},
      inferred:{expected_gross_bps:Number.isFinite(x.eg.bps)?x.eg.bps:null,cost:x.g.cost,labels:x.g.cost?.inferred??['no book']}})
  }
  if(due&&decisions.length)try{await db.from('trade_decisions').insert(decisions).throwOnError();await db.from('trade_decisions').delete().lt('ts',new Date(now-48*3600_000).toISOString()).throwOnError()}catch{}
  const blocked=due?compliance(scalpRows,entries,equity,exposure,rotaRows):[]
  if(blocked.length){for(const e of entries){cash+=e.notional*(1+SCALP.fee);exposure-=e.notional}entries.length=0}
  const minutes:Minute[]=[];const say=(who:string,says:string,vote='hold')=>minutes.push({who,says,vote,checked_at:new Date(now).toISOString(),round:1})
  if(due){
    const long=evaluated.filter(x=>x.side>0).length,short=evaluated.filter(x=>x.side<0).length
    const count=(who:string,v:string)=>evaluated.filter(x=>x.votes.find(y=>y.who===who)?.vote===v).length
    const tally=(who:string)=>`לונג ${count(who,'long')} · שורט ${count(who,'short')} · ניטרלי ${count(who,'hold')}${count(who,'veto')?` · חסימה ${count(who,'veto')}`:''}`
    const lead=(who:string,d:string)=>{const l=count(who,'long'),sh=count(who,'short');return l>sh?'long':sh>l?'short':d}
    const best=evaluated.find(x=>x.sym===entries[0]?.sym)||[...evaluated].sort((a,c)=>c.score-a.score)[0]
    const line=(who:string)=>best?.votes.find(v=>v.who===who)?.says||'אין מספיק נתונים'
    say('scout',`בדקתי ${data.size}/${UNIVERSE.length} חוזים (${[...new Set([...data.values()].map(m=>m.q.source))].join(', ')||'אין'}); חדשות וליקווידציות: ${ctx?.sources.join(', ')||'לא זמין'}${ctx?.failed.length?` · נכשלו: ${ctx.failed.join(', ')}`:''}`,failures.length>Math.floor(UNIVERSE.length*0.2)?'veto':'ok')
    say('regime',`EMA8/21 על ${evaluated.length} מטבעות: ${tally('regime')}. ${line('regime')}`,lead('regime','hold'))
    const rc=params.rota_cycle
    say('rota',`מומנטום 3 דקות: ${tally('rota')}. ${line('rota')}${rotaShare>0?` · סבב רוטציה (${Math.round(rotaShare*100)}% מהתיק, K=${rc?.k??'—'} לכל צד, כל ${rc?.hours??'—'} שעות): ${rc?`לונג ${(rc.longs??[]).join(' ')} · שורט ${(rc.shorts??[]).join(' ')} · ${rotaRows.length} פתוחות · עודכן ${new Date(rc.ts).toISOString().slice(11,16)}Z`:'עדיין לא רץ'}`:''}`,lead('rota','hold'))
    say('donch',`אזורי liquidity sweep משוערים: ${tally('donch')}. ${line('donch')}`,lead('donch','hold'))
    for(const k of NEW_AGENTS)say(k,`${AGENTS[k].role} (משקל ${(W[k]??1).toFixed(2)}): ${tally(k)}. ${line(k)}`,lead(k,'hold'))
    for(const t of Object.keys(TEAMS) as Team[]){
      const mem=SWARM.filter(x=>x.team===t), ranked=[...mem].sort((a,c)=>meanBps(stats[c.id])-meanBps(stats[a.id]))
      const benched=mem.filter(m=>(stats[m.id]?.n??0)>=LEARN.minN&&learnedWeight(stats[m.id])===0).length
      const learning=mem.filter(m=>(stats[m.id]?.n??0)<LEARN.minN).length
      const best=ranked[0],bs=stats[best.id],bh=bestHorizon(stats,best.id)
      say(TEAMS[t].lead,`${TEAMS[t].label} (${mem.length} סוכנים): ${tally(TEAMS[t].lead)}. הכי טוב כרגע: ${best.label} ${bs?`${meanBps(bs).toFixed(1)} נק׳ בסיס נטו ל-5 דק׳${bh.st&&bh.h!==5?`, באופק ${bh.h} דק׳: ${meanBps(bh.st).toFixed(1)} נטו`:''}`:'עדיין לומד'}. ${benched} בספסל, ${learning} עדיין לומדים.`,lead(TEAMS[t].lead,'hold'))
    }
    const cnt=(id:string,d:number)=>evaluated.filter(x=>x.dirs[id]===d).length
    say('info',`מידע חדש שהסוכנים האחרים לא רואים — מומנטום ימים (${Object.keys(info.daily).length}/40), Open Interest (${Object.keys(info.oi).length}/40), פרמיית חוזה (${Object.keys(info.premium).length}/40). ${INFO_IDS.map(id=>`${id}: ${cnt(id,1)}↑ ${cnt(id,-1)}↓`).join(' · ')}${infoNote?` · רענון: ${infoNote}`:''}`,'hold')
    say('factory',factErr?`מפעל הסוכנים לא זמין: ${factErr.slice(0,80)}`:`מפעל סוכנים: ${fc.trial} בניסוי (הצבעת צל בלבד), ${fc.oos} בבדיקה על נתונים שלא ראו, ${fc.live} פעילים ומצביעים. נבדקו עד היום ${fc.trial+fc.oos+fc.live+fc.retired}, נפסלו ${fc.retired}. סוכן מצביע רק אחרי t≥${FACTORY.liveT} על נתונים חדשים; סוכן שנפסל לא נבדק שוב.${fc.moved.length?` עכשיו: ${fc.moved.slice(0,4).join(', ')}.`:''} חדר הכושר (עד 72 חודשים אופליין, 11 גדלי נרות, 289 מטבעות): ${fc.gymNote?`לא זמין (${fc.gymNote})`:`${fc.gym} עברו${fc.gymSeeded?`, ${fc.gymSeeded} נכנסו עכשיו לניסיון`:''}`}${slowTfs.length?`; ${slowTfs.length} סוגי נרות איטיים בלייב${slowNote?` (${slowNote})`:''}`:''}.`,fc.live?'ok':'hold')
    say('risk',`דמו 1x; עד ${SCALP.maxPositions} פוזיציות, עד ${SCALP.perCoin*100}% למטבע ועד ${SCALP.allocation*100}% הקצאה אחרי עמלות. הפחתת סיכון מדורגת (בלי עצירה גורפת): מכפיל ${risk.mult} (${risk.tier}; ירידה מהשיא ${(risk.dd*100).toFixed(1)}%, הפסד היום ${(risk.day*100).toFixed(1)}%). שער רווח: ${passed.length}/${gated.length} מועמדים עם יתרון נטו אחרי עמלות, מרווח, השפעה ומימון. אירועי קידום/הורדה: ${agentEv}. ${line('risk')}`,eligible?'ok':'veto')
    say('trader',`ספר פקודות: ${tally('trader')}. מועמדות לביצוע: ${entries.map(e=>`${e.sym} ${e.side}`).join(', ')||'אין הסכמה מתאימה'}. זמן החזקה מתוכנן לפי התנאים: ${entries.map(e=>`${e.sym} ${e.hold_min} דק׳`).join(', ')||'—'} (5–240 דק׳, לפי האופק שבו הסוכנים התומכים הוכיחו רווח נטו; כל כניסה עברה את שער הרווח). בכל ישיבה: סגירה מוקדמת אם הצוות מתהפך, הארכה לעסקה מרוויחה שהצוות עדיין תומך בה.`,entries.length?'ok':'hold')
    say('treasurer',`מזומן צפוי אחרי הפעולות $${cash.toFixed(2)}; ${scalpRows.length+entries.length}/${SCALP.maxPositions} פוזיציות סקאלפ${rotaRows.length?` + ${rotaRows.length} רוטציה`:''}. הביצוע נבדק שוב באותה עסקת מסד נתונים.`)
    say('auditor',`עלות מול תנודתיות: ${count('auditor','ok')} עוברים, ${count('auditor','veto')} נחסמים. אסטרטגיה ניסיונית ללא אימות היסטורי; מחקרי העבר מצאו שסקאלפ מתחת לשעה לא עבר עלויות.`,count('auditor','ok')?'ok':'veto')
    say('reporter',`סיכום: ${long} מועמדי לונג, ${short} מועמדי שורט, ${entries.length} כניסות נשלחו לביצוע. בדיקת צוות כל דקה, בדיקת יציאות כל 10 שניות.`)
  }
  if(due){
    const att=attribution(closedHist),ex=execStats(closedHist)
    const spreads=evaluated.map(x=>Number(x.signals?.spread_bps)).filter(Number.isFinite)
    const reasons=Object.entries(ex.reasons).map(([k,v])=>`${k} ${v}`).join(', ')
    say('execution',`מרווח ממוצע ${spreads.length?(spreads.reduce((a,b)=>a+b,0)/spreads.length).toFixed(1):'—'} נק׳ בסיס; ביצוע דמו במחיר ה-ask/bid עם החלקה ${(SCALP.slip*1e4).toFixed(0)} נק׳. ${ex.n?`${ex.n} עסקאות אחרונות: החזקה ממוצעת ${ex.avgHoldMin?.toFixed(1)} דק׳, סיבות יציאה: ${reasons}, עמלות $${ex.fees.toFixed(2)}, נטו $${ex.net.toFixed(2)}.`:'אין עדיין עסקאות סגורות.'}`,spreads.some(x=>x>SCALP.maxSpread*1e4)?'veto':'ok')
    minutes[minutes.length-1].data={spread_bps:spreads,...ex}
    say('compliance',blocked.length?`חסימה: ${blocked.join(', ')}.`:`בדקתי את התוכנית: דמו 1x, עד ${SCALP.maxPositions} פוזיציות, ללא מטבע כפול, עד ${SCALP.perCoin*100}% למטבע, עד ${SCALP.maxSameSide} באותו כיוון, חשיפה עד ${SCALP.allocation*100}%. תקין.`,blocked.length?'veto':'ok')
    const top=[...evaluated].sort((a,c)=>c.score-a.score)[0]
    const best=evaluated.find(x=>x.sym===entries[0]?.sym)||picks[0]||top
    minutes.push(...debate(best,att,entries.length>0,blocked,now,!!best&&retained.some((t:any)=>t.sym===best.sym),W))
    const q=minutes.find(m=>m.who==='quant')
    if(q){
      const all=Object.values(stats).filter(x=>x.n>=LEARN.minN), benchN=all.filter(x=>learnedWeight(x)===0).length
      const hOf=(k:string)=>Number(k.split('@')[1]??LEARN.horizonsMin[0]),tc=(x:Stat)=>hT(x,hOf(x.agent))
      const topL=[...all].sort((a,c)=>tc(c)-tc(a)).slice(0,3).map(x=>`${x.agent} t=${tc(x).toFixed(1)}`)
      q.says+=` למידת צל נטו אחרי עמלות, אופקים 5/15/60/240 דק׳: ${team.active} סוכנים מרוויחים נטו באופק הטוב שלהם — מצב ${team.mode==='proven'?`מוכחים בלבד (רק ${team.active} הסוכנים שעברו את העמלות מצביעים; מקסימום ${SCALP.maxEntries} כניסות לישיבה)`:'יחסי (פחות מ-3 מוכחים — הולכים אחרי הטובים ביותר כדי לא לעצור)'}; ${all.length} מדדים עם מספיק נתונים, ${benchN} בספסל${topL.length?`, מובילים: ${topL.join(', ')}`:''}.${learnErr?` שגיאת למידה: ${learnErr.slice(0,80)}`:learned.scored?` עודכנו ${learned.updated} סוכנים.`:''}`
      q.data={...att,hit:Object.fromEntries(Object.entries(att).map(([k,v])=>[k,hitPct(v)])),weights:W,horizons:H,mode:team.mode,active:team.active}
    }
  }
  const {data:result}=await db.rpc('scalp_commit_cycle',{p_lease:lease,p_closes:closes,p_updates:updates,p_entries:entries,p_minutes:due?minutes:null,p_marks:marks,p_feed:{source:'perpetuals',ok:data.size,fail:failures.length,failures},p_candidates:due?evaluated.map(x=>({sym:x.sym,mid:x.mid,ts:now,side:x.side,score:x.score,weighted:x.weighted,signals:x.signals,dirs:Object.fromEntries(Object.entries(x.dirs).filter(([,d])=>d))})):null}).throwOnError()
  return result
}
