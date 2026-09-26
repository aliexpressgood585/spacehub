// v96.0 data-collector — records public market data that has no historical archive, so it can be backtested later.
// It NEVER trades and never reads or writes any trading table. Cron: every minute. Each run:
//   1. listens to Binance `!forceOrder@arr` for ~45 s (all USDT-M liquidations, largest per symbol per second)
//   2. OKX liquidation-orders for the pinned 40 (every run; duplicates are ignored by the unique key)
//   3. every 5 min: Binance OI + funding + premium for the pinned 40, Deribit options summary + DVOL (BTC, ETH)
//   4. every 5 min: news RSS (published timestamp + coins named)
//   5. once an hour: retention (90 days)
// Every source fails independently; the response lists what worked.
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as S from '../../../shared/strategy.ts'
import * as C from '../../../shared/collect.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const WS_MS = 45_000
const FEEDS: [string, string][] = [['cointelegraph', 'https://cointelegraph.com/rss'], ['coindesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'], ['decrypt', 'https://decrypt.co/feed']]
const bsym = (c: string) => (c === 'PEPE' ? '1000PEPEUSDT' : `${c}USDT`)
async function json(url: string, ms = 8000) { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]) })) }
const iso = (t: number) => new Date(t).toISOString()
const num = (x: number) => (Number.isFinite(x) ? x : null)

async function saveLiqs(rows: C.Liq[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(l => ({ source: l.source, symbol: l.symbol, side: l.side, px: l.px, qty: l.qty, usd: l.usd, ts: iso(l.ts) }))
    const { error } = await db.from('mkt_liquidations').upsert(chunk, { onConflict: 'source,symbol,ts,side,px,qty', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

function binanceWs(ms: number): Promise<{ liqs: C.Liq[]; note: string }> {
  return new Promise(resolve => {
    const liqs: C.Liq[] = []
    let note = 'ok', done = false, opened = false, frames = 0
    const finish = () => { if (done) return; done = true; try { ws.close() } catch { /* already closed */ } resolve({ liqs, note: `${note}, opened ${opened}, frames ${frames}` }) }
    let ws: WebSocket
    try { ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr') } catch (e) { resolve({ liqs, note: `open failed: ${e}` }); return }
    ws.onopen = () => { opened = true }
    ws.onmessage = ev => { frames++; try { const l = C.parseForceOrder(JSON.parse(String(ev.data))); if (l) liqs.push(l) } catch { /* bad frame */ } }
    ws.onerror = () => { note = 'error'; finish() }
    ws.onclose = () => { if (!done) note = liqs.length ? 'closed early' : 'closed'; finish() }
    setTimeout(finish, ms)
  })
}

async function okxLiqs(): Promise<{ n: number; failed: number }> {
  const inst = await json('https://www.okx.com/api/v5/public/instruments?instType=SWAP')
  const ctVal: Record<string, number> = {}
  for (const x of inst?.data ?? []) if (x.settleCcy === 'USDT' && x.ctValCcy) ctVal[x.ctValCcy] = Number(x.ctVal)
  const rows: C.Liq[] = []
  let failed = 0
  await pool([...S.CRYPTO_40], 3, async coin => {
    try {
      const url = `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=${coin}-USDT&state=filled&limit=100`
      let d = await json(url, 5000).catch(() => null)
      if (!d || d.code !== '0') { await new Promise(r => setTimeout(r, 700)); d = await json(url, 5000) }
      rows.push(...C.parseOkxLiqs(d, coin, ctVal[coin]))
    } catch { failed++ }
  })
  await saveLiqs(rows)
  return { n: rows.length, failed }
}

async function derivs(now: number): Promise<number> {
  const ts = iso(C.bucket5m(now))
  const prem: Record<string, any> = {}
  for (const x of await json('https://fapi.binance.com/fapi/v1/premiumIndex')) prem[x.symbol] = x
  const rows: any[] = []
  await pool([...S.CRYPTO_40], 8, async coin => {
    const s = bsym(coin), k = coin === 'PEPE' ? 1000 : 1, p = prem[s]
    let oi = NaN
    try { oi = Number((await json(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${s}`, 5000)).openInterest) } catch { /* abstain */ }
    const mark = Number(p?.markPrice), index = Number(p?.indexPrice)
    if (!p && !Number.isFinite(oi)) return
    rows.push({ ts, symbol: coin, mark: num(mark / k), oi_coins: num(oi * k), oi_usd: num(oi * mark), funding: num(Number(p?.lastFundingRate)),
      premium: num(mark > 0 && index > 0 ? mark / index - 1 : NaN) })
  })
  const { error } = await db.from('mkt_derivs').upsert(rows, { onConflict: 'symbol,ts' })
  if (error) throw new Error(error.message)
  return rows.length
}

async function options(now: number): Promise<number> {
  let n = 0
  for (const cur of ['BTC', 'ETH']) {
    const book = await json(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${cur}&kind=option`, 10_000)
    const sum = C.summarizeOptions(cur, book?.result ?? [], now)
    if (!sum) continue
    let dvol = NaN
    try { dvol = C.lastDvol(await json(`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=${cur}&resolution=60&start_timestamp=${now - 600_000}&end_timestamp=${now}`)) } catch { /* abstain */ }
    const { error } = await db.from('mkt_options').upsert({
      ts: iso(C.bucket5m(now)), currency: cur, dvol: num(dvol), underlying: num(sum.underlying), expiry: sum.expiry || null, days: num(sum.days),
      atm_iv: num(sum.atm_iv), iv_put10: num(sum.iv_put10), iv_call10: num(sum.iv_call10), skew10: num(sum.skew10),
      put_oi: sum.put_oi, call_oi: sum.call_oi, pc_oi: num(sum.pc_oi), put_vol: sum.put_vol, call_vol: sum.call_vol, instruments: sum.instruments,
    }, { onConflict: 'currency,ts' })
    if (error) throw new Error(error.message)
    n++
  }
  return n
}

async function news(now: number): Promise<string[]> {
  const out: string[] = []
  for (const [src, url] of FEEDS) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'follow' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const items = C.parseRssItems(await r.text(), src)
      const rows = items.map(n => ({ url: n.url, source: n.source, title: n.title, published_at: iso(n.published_at), seen_at: iso(now), coins: n.coins }))
      const { error } = await db.from('mkt_news').upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
      out.push(`${src}:${items.length}`)
    } catch (e) { out.push(`${src}:fail(${String(e).slice(0, 40)})`) }
  }
  return out
}

Deno.serve(async () => {
  const now = Date.now(), minute = Math.floor(now / 60_000)
  const report: Record<string, unknown> = { at: iso(now) }
  const step = async (k: string, f: () => Promise<unknown>) => { try { report[k] = await f() } catch (e) { report[k] = `fail: ${String(e).slice(0, 120)}` } }
  const ws = binanceWs(WS_MS) // runs while the REST sources below are fetched
  await step('okx_liqs', okxLiqs)
  if (minute % 5 === 0) {
    await step('derivs', () => derivs(now))
    await step('options', () => options(now))
    await step('news', () => news(now))
  }
  if (minute % 60 === 7) await step('retention', async () => { const { error } = await db.rpc('mkt_retention', { days: 90 }); if (error) throw new Error(error.message); return 'ok' })
  const w = await ws
  await step('binance_liqs', async () => { await saveLiqs(w.liqs); return `${w.liqs.length} (${w.note})` })
  return new Response(JSON.stringify(report), { headers: { 'Content-Type': 'application/json' } })
})
