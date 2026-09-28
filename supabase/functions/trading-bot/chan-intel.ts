// Public-market intelligence for the CHAN PAPER bot.
// Uses only public exchange/news data. It never consumes private/inside information.
// The output is a confirmation/risk layer plus a paper-only liquidation-squeeze signal.

export type Pair = { sym:string; s:string; k:number }

export type NewsItem = {
  title:string
  url:string
  ts:number
  source:string
  risk:number
}

export type SymbolIntel = {
  sym:string
  ts:number
  funding:number|null
  premium:number|null
  oi_delta:number|null
  oi_value_delta:number|null
  top_ratio:number|null
  global_ratio:number|null
  taker_ratio:number|null
  ret5:number|null
  long_liq_count:number
  short_liq_count:number
  long_squeeze:number
  short_squeeze:number
  flow_bias:number
  confidence:number
  sources:string[]
}

export type ChanIntel = {
  ts:number
  news:NewsItem[]
  news_risk:number
  by_sym:Record<string,SymbolIntel>
  top_pressure:Array<{sym:string;side:'LONG'|'SHORT';score:number;funding:number|null;oi_delta:number|null;taker_ratio:number|null}>
  sources:string[]
  failed:string[]
}

const NEWS_TTL = 120_000
const INTEL_TTL = 120_000
const NEWS_FEEDS:[string,string][] = [
  ['cointelegraph','https://cointelegraph.com/rss'],
  ['coindesk','https://www.coindesk.com/arc/outboundfeeds/rss/'],
]
const RISK_WORDS = [
  'hack','hacked','exploit','breach','attack','outage','halted','insolven','bankrupt','lawsuit',
  'charges','delist','seizure','ban ','liquidation','crash','emergency','fraud','stolen'
]
const POS_WORDS = ['approved','approval','etf','listing','listed','partnership','integration','launch','adoption']

const clamp = (x:number,a=0,b=1)=>Math.max(a,Math.min(b,x))
const n = (x:any):number|null => { const v=Number(x); return Number.isFinite(v)?v:null }

async function j(url:string) {
  const r = await fetch(url,{signal:AbortSignal.timeout(4500),redirect:'follow'})
  if(!r.ok) throw new Error('HTTP '+r.status)
  return r.json()
}
async function txt(url:string) {
  const r = await fetch(url,{signal:AbortSignal.timeout(4500),redirect:'follow'})
  if(!r.ok) throw new Error('HTTP '+r.status)
  return r.text()
}
async function pool<T>(xs:T[], workers:number, fn:(x:T)=>Promise<void>) {
  let i=0
  await Promise.all(Array.from({length:Math.min(workers,xs.length)},async()=>{
    while(i<xs.length) await fn(xs[i++])
  }))
}
const tag=(x:string,name:string)=>{
  const m=x.match(new RegExp('<'+name+'[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))
  return m?m[1].replace(/<!\\[CDATA\\[|\\]\\]>/g,'').replace(/<[^>]+>/g,'').trim():''
}
function headlineRisk(title:string) {
  const s=title.toLowerCase()
  let risk=0
  for(const w of RISK_WORDS) if(s.includes(w)) risk+=18
  for(const w of POS_WORDS) if(s.includes(w)) risk+=4
  return Math.min(100,risk)
}
function parseRss(xml:string,source:string):NewsItem[] {
  return xml.split(/<item[ >]/i).slice(1).map(x=>{
    const title=tag(x,'title'), url=tag(x,'link'), ts=Date.parse(tag(x,'pubDate'))
    return {title,url,ts,source,risk:headlineRisk(title)}
  }).filter(x=>x.title&&Number.isFinite(x.ts))
}
const symbolMention=(title:string,sym:string)=>{
  const u=title.toUpperCase()
  if(u.includes('$'+sym)||u.includes(sym+'USDT')||u.includes('('+sym+')')) return true
  if(sym.length<4) return false
  return new RegExp('(^|[^A-Z0-9])'+sym.replace(/[^A-Z0-9]/g,'')+'([^A-Z0-9]|$)').test(u)
}

async function loadNews(db:any,now:number):Promise<{news:NewsItem[],sources:string[],failed:string[]}> {
  const {data:rows}=await db.from('market_cache').select('data,ts').eq('key','chan_news').throwOnError()
  const old=rows?.[0]
  if(old&&now-Date.parse(old.ts)<NEWS_TTL) return {news:old.data?.news??[],sources:old.data?.sources??[],failed:old.data?.failed??[]}

  let news:NewsItem[]=[]
  const sources:string[]=[],failed:string[]=[]
  await Promise.all(NEWS_FEEDS.map(async([source,url])=>{
    try{
      const rows=parseRss(await txt(url),source).filter(x=>now-x.ts<6*3600_000)
      news.push(...rows)
      sources.push(source)
    }catch{failed.push(source)}
  }))
  news=news.sort((a,b)=>b.ts-a.ts).slice(0,60)
  const data={news,sources,failed}
  try{await db.from('market_cache').upsert({key:'chan_news',data,ts:new Date(now).toISOString()}).throwOnError()}catch{}
  return data
}

function squeezeScores(x:{
  funding:number|null; oiDelta:number|null; topRatio:number|null; globalRatio:number|null;
  takerRatio:number|null; ret5:number|null; longLiq:number; shortLiq:number
}) {
  const funding=x.funding??0, oi=x.oiDelta??0, top=x.topRatio??1, global=x.globalRatio??1, taker=x.takerRatio??1, ret=x.ret5??0
  const oiBuild=clamp(Math.max(0,oi)/0.02)
  const positiveFunding=clamp(funding/0.00035)
  const negativeFunding=clamp(-funding/0.00035)
  const topLong=clamp((top-1)/0.7), topShort=clamp((1-top)/0.5)
  const crowdLong=clamp((global-1)/0.7), crowdShort=clamp((1-global)/0.5)
  const sellAgg=clamp((1-taker)/0.45), buyAgg=clamp((taker-1)/0.45)
  const down=clamp(-ret/0.008), up=clamp(ret/0.008)
  const liqTot=x.longLiq+x.shortLiq
  const longLiqBias=liqTot?x.longLiq/liqTot:0
  const shortLiqBias=liqTot?x.shortLiq/liqTot:0

  // Long-squeeze score = crowded leveraged longs + fresh OI + downside aggression/cascade.
  const longSqueeze=100*(0.19*positiveFunding+0.20*oiBuild+0.14*topLong+0.09*crowdLong+0.20*sellAgg+0.12*down+0.06*longLiqBias)
  // Short-squeeze score = crowded leveraged shorts + fresh OI + upside aggression/cascade.
  const shortSqueeze=100*(0.19*negativeFunding+0.20*oiBuild+0.14*topShort+0.09*crowdShort+0.20*buyAgg+0.12*up+0.06*shortLiqBias)
  const known=[x.funding,x.oiDelta,x.topRatio,x.globalRatio,x.takerRatio,x.ret5].filter(v=>v!=null).length
  const confidence=clamp(known/6)*100
  return {
    longSqueeze:+longSqueeze.toFixed(1),
    shortSqueeze:+shortSqueeze.toFixed(1),
    flowBias:+clamp((shortSqueeze-longSqueeze)/100,-1,1).toFixed(3),
    confidence:+confidence.toFixed(0)
  }
}

export async function loadChanIntel(
  db:any,
  now:number,
  pairs:Pair[],
  requested:string[],
  ret5:Record<string,number|null>
):Promise<ChanIntel> {
  const newsPart=await loadNews(db,now)
  const sources=[...newsPart.sources], failed=[...newsPart.failed]
  const {data:cacheRows}=await db.from('market_cache').select('data,ts').eq('key','chan_intel').throwOnError()
  const old=cacheRows?.[0]?.data ?? {}
  const oldBy:Record<string,SymbolIntel>=old.by_sym??{}

  let premiumRows:any[]=[]
  try{
    premiumRows=await j('https://fapi.binance.com/fapi/v1/premiumIndex')
    sources.push('binance-funding')
  }catch{failed.push('binance-funding')}
  const premiumMap=new Map<string,any>((Array.isArray(premiumRows)?premiumRows:[]).map((x:any)=>[String(x.symbol),x]))
  const pairMap=new Map(pairs.map(p=>[p.sym,p]))

  // Add the most crowded funding contracts to the technical candidates so leverage pressure
  // can create a paper squeeze candidate even before a classic CHAN signal appears.
  const extreme = pairs.map(p=>{
    const x=premiumMap.get(p.s), f=Math.abs(Number(x?.lastFundingRate))
    return {sym:p.sym,f:Number.isFinite(f)?f:0}
  }).sort((a,b)=>b.f-a.f).slice(0,10).map(x=>x.sym)

  const watch=[...new Set([...requested,...extreme])].filter(s=>pairMap.has(s)).slice(0,24)
  const by:Record<string,SymbolIntel>={...oldBy}

  await pool(watch,5,async sym=>{
    const p=pairMap.get(sym)!
    const prev=oldBy[sym]
    if(prev&&now-prev.ts<INTEL_TTL) {
      by[sym]={...prev,ret5:ret5[sym]??prev.ret5}
      return
    }
    const src:string[]=[]
    const pr=premiumMap.get(p.s)
    const funding=n(pr?.lastFundingRate)
    const mark=n(pr?.markPrice), index=n(pr?.indexPrice)
    const premium=mark!=null&&index!=null&&index>0?mark/index-1:null
    if(funding!=null) src.push('funding')

    let oiDelta:number|null=null, oiValueDelta:number|null=null
    let topRatio:number|null=null, globalRatio:number|null=null, takerRatio:number|null=null
    let longLiq=0,shortLiq=0

    try{
      const x=await j('https://fapi.binance.com/futures/data/openInterestHist?symbol='+encodeURIComponent(p.s)+'&period=5m&limit=3')
      if(Array.isArray(x)&&x.length>=2){
        const a=x[x.length-2],b=x[x.length-1]
        const ao=Number(a.sumOpenInterest),bo=Number(b.sumOpenInterest),av=Number(a.sumOpenInterestValue),bv=Number(b.sumOpenInterestValue)
        if(ao>0&&bo>0) oiDelta=bo/ao-1
        if(av>0&&bv>0) oiValueDelta=bv/av-1
      }
      src.push('oi')
    }catch{failed.push('oi:'+sym)}

    try{
      const [top,glob,taker]=await Promise.all([
        j('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol='+encodeURIComponent(p.s)+'&period=5m&limit=1'),
        j('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol='+encodeURIComponent(p.s)+'&period=5m&limit=1'),
        j('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol='+encodeURIComponent(p.s)+'&period=5m&limit=1')
      ])
      topRatio=n(top?.[0]?.longShortRatio)
      globalRatio=n(glob?.[0]?.longShortRatio)
      takerRatio=n(taker?.[0]?.buySellRatio)
      src.push('positioning','taker-flow')
    }catch{failed.push('ratios:'+sym)}

    // Public OKX filled-liquidation feed is used only as confirmation. Counts are used,
    // not raw contract sizes, because ctVal differs by instrument.
    try{
      const x=await j('https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily='+encodeURIComponent(sym+'-USDT')+'&state=filled&limit=100')
      if(x?.code==='0'){
        const cutoff=now-15*60_000
        for(const g of x.data??[]) for(const e of g.details??[]){
          if(Number(e.ts)<cutoff) continue
          const long=e.posSide==='long'||(!e.posSide&&e.side==='sell')
          if(long) longLiq++; else shortLiq++
        }
        src.push('okx-liquidations')
      }
    }catch{}

    const rv=ret5[sym]??null
    const sq=squeezeScores({funding,oiDelta,topRatio,globalRatio,takerRatio,ret5:rv,longLiq,shortLiq})
    by[sym]={
      sym,ts:now,funding,premium,oi_delta:oiDelta,oi_value_delta:oiValueDelta,
      top_ratio:topRatio,global_ratio:globalRatio,taker_ratio:takerRatio,ret5:rv,
      long_liq_count:longLiq,short_liq_count:shortLiq,
      long_squeeze:sq.longSqueeze,short_squeeze:sq.shortSqueeze,flow_bias:sq.flowBias,
      confidence:sq.confidence,sources:src
    }
  })

  const recentNews=newsPart.news.filter(x=>now-x.ts<30*60_000)
  const newsRisk=recentNews.reduce((m,x)=>Math.max(m,x.risk),0)
  // Symbol headlines only affect event-risk presentation; they are never treated as non-public "inside" information.
  for(const sym of watch){
    const symbolRisk=recentNews.filter(x=>symbolMention(x.title,sym)).reduce((m,x)=>Math.max(m,x.risk),0)
    if(symbolRisk>0&&by[sym]) (by[sym] as any).news_risk=symbolRisk
  }

  const topPressure=Object.values(by).filter(x=>now-x.ts<10*60_000&&x.confidence>=50).flatMap(x=>[
    {sym:x.sym,side:'SHORT' as const,score:x.long_squeeze,funding:x.funding,oi_delta:x.oi_delta,taker_ratio:x.taker_ratio},
    {sym:x.sym,side:'LONG' as const,score:x.short_squeeze,funding:x.funding,oi_delta:x.oi_delta,taker_ratio:x.taker_ratio},
  ]).sort((a,b)=>b.score-a.score).slice(0,12)

  const out:ChanIntel={
    ts:now,
    news:newsPart.news.slice(0,12),
    news_risk:newsRisk,
    by_sym:by,
    top_pressure:topPressure,
    sources:[...new Set(sources.concat(['binance-oi','binance-positioning','binance-taker-flow']))],
    failed:[...new Set(failed)].slice(0,40)
  }
  try{await db.from('market_cache').upsert({key:'chan_intel',data:out,ts:new Date(now).toISOString()}).throwOnError()}catch{}
  return out
}
