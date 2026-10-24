// "ערכת הדיי טריידר" scanner (shared/dtk.ts): one cycle = market board + (once per closed 5m bar) a scan of every USDT perpetual
// Binance Futures trades that has an OKX swap (shared/binperps.ts; Binance fapi is 451 from the runners, prices come from OKX),
// the time machine for the strongest setups, funding / open interest / liquidations and crypto news. Writes dtk/state.json.
// READ-ONLY toward any exchange: it never places an order. Usage: node --experimental-strip-types scripts/dtk-scan.ts dtk/state.json
import fs from 'node:fs'
import { DTK, KIND_HE, setupsAt, replay, monteCarlo, atr, coinsIn, parseRss, type Bar } from '../shared/dtk.ts'
import { refreshUniverse, universeDue, liquid, limiter, pool } from '../shared/binperps.ts'

const FILE = process.argv[2] ?? 'dtk/state.json', OKX = 'https://www.okx.com/api/v5'
const lim = limiter(15), iso = (ms = Date.now()) => new Date(ms).toISOString(), now = Date.now()
const j = (u: string) => lim(async () => { const r = await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0' } }); if (!r.ok) throw new Error(`${r.status}`); const x: any = await r.json(); if (x.code !== '0') throw new Error(`okx ${x.code} ${x.msg}`); return x.data })
const toBars = (rows: string[][]): Bar[] => rows.filter((r) => r[8] === '1').map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[7] })).sort((a, b) => a.t - b.t)
async function history(sym: string, pages: number): Promise<Bar[]> {
  const out = new Map<number, Bar>(); let after = ''
  for (let p = 0; p < pages; p++) {
    const rows: string[][] = await j(`${OKX}/market/history-candles?instId=${sym}-USDT-SWAP&bar=5m&limit=100${after ? `&after=${after}` : ''}`)
    if (!rows.length) break
    for (const b of toBars(rows)) out.set(b.t, b)
    after = rows[rows.length - 1][0]
  }
  return [...out.values()].sort((a, b) => a.t - b.t)
}

const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { version: 'dtk-v1', setups: [], news: [], oi_hist: {}, last_bar: 0 }
st.rules = DTK; st.feed = 'OKX USDT swaps (Binance fapi 451 from the runner); universe = Binance USDT perps with an OKX swap'
const errs: string[] = []
if (universeDue(st.universe, now)) {
  const r = await refreshUniverse(st.universe, now); st.universe = r.u; if (r.error) errs.push(`universe: ${r.error}`)
  try { st.ctval = Object.fromEntries((await j(`${OKX}/public/instruments?instType=SWAP`)).filter((x: any) => /-USDT-SWAP$/.test(x.instId)).map((x: any) => [x.instId.slice(0, -10), +x.ctVal])) } catch (e) { errs.push(`instruments: ${e}`) }
}
const COINS: string[] = st.universe?.coins?.map((c: any) => c.sym) ?? []
const set = new Set(COINS)

// 1. market board every cycle: one tickers call + one open-interest call for every swap
const board: Record<string, any> = {}
try {
  for (const t of await j(`${OKX}/market/tickers?instType=SWAP`)) {
    const m = /^([A-Z0-9]+)-USDT-SWAP$/.exec(t.instId); if (!m || !set.has(m[1])) continue
    const last = +t.last, bid = +t.bidPx, ask = +t.askPx
    const pb = st.board?.[m[1]] ?? {}
    board[m[1]] = { funding: pb.funding ?? null, funding_at: pb.funding_at ?? null, atr: pb.atr ?? null, last, bid, ask, chg: +t.open24h > 0 ? last / +t.open24h - 1 : null, vol: +t.volCcy24h * last, spread: bid > 0 ? (ask - bid) / ((ask + bid) / 2) * 1e4 : null }
  }
} catch (e) { errs.push(`tickers: ${e}`) }
try {
  const hourKey = Math.floor(now / 3600_000)
  for (const o of await j(`${OKX}/public/open-interest?instType=SWAP`)) {
    const m = /^([A-Z0-9]+)-USDT-SWAP$/.exec(o.instId); if (!m || !board[m[1]]) continue
    const oi = +o.oiUsd; board[m[1]].oi = oi
    const h = (st.oi_hist[m[1]] ??= [])
    if (!h.length || h[h.length - 1][0] !== hourKey) h.push([hourKey, oi]); else h[h.length - 1][1] = oi
    while (h.length > 25) h.shift()
    const ago = h.find((x: number[]) => x[0] === hourKey - 4), day = h.find((x: number[]) => x[0] === hourKey - 24)
    board[m[1]].oi4h = ago ? oi / ago[1] - 1 : null; board[m[1]].oi24h = day ? oi / day[1] - 1 : null
  }
} catch (e) { errs.push(`open interest: ${e}`) }
for (const s of Object.keys(st.oi_hist)) if (!board[s]) delete st.oi_hist[s]

// 2. scan once per closed 5m bar (first cycle after the close)
const barT = Math.floor(now / DTK.bar) * DTK.bar
if (barT > st.last_bar && Object.keys(board).length) {
  const t0 = Date.now(), found: any[] = []
  await pool(COINS.filter((c) => board[c]), 8, async (sym) => {
    try {
      const b = toBars(await j(`${OKX}/market/candles?instId=${sym}-USDT-SWAP&bar=5m&limit=300`)); if (b.length < 60) return
      const last = b.length - 1, a = atr(b)
      board[sym].atr = a; board[sym].bar = b[last].t; board[sym].scanned = true
      for (const s of setupsAt(b, last)) found.push({ sym, ...s, liquid: liquid(board[sym]), atr_pct: a / b[last].c })
    } catch (e) { if (errs.length < 20) errs.push(`${sym}: ${e}`) }
  })
  // time machine for the strongest liquid setups: 5 days of 5m history (replay of the same rule + Monte Carlo of the session)
  found.sort((x, y) => Number(y.liquid) - Number(x.liquid) || y.strength - x.strength)
  for (const s of found.slice(0, 12)) {
    try {
      const h = await history(s.sym, 15)
      s.replay = replay(h, s.kind, s.side); s.mc = monteCarlo(h, s, 2000, s.t % 100000); s.hist_days = +(h.length * 5 / 1440).toFixed(1)
    } catch (e) { errs.push(`history ${s.sym}: ${e}`) }
  }
  // funding (OKX's rate, labelled as such) for the setups and the 20 largest coins
  const fsyms = [...new Set([...found.slice(0, 30).map((s) => s.sym), ...Object.entries(board).sort((a: any, b: any) => b[1].vol - a[1].vol).slice(0, 20).map(([s]) => s)])]
  await pool(fsyms, 4, async (sym) => { try { const f = (await j(`${OKX}/public/funding-rate?instId=${sym}-USDT-SWAP`))[0]; board[sym].funding = +f.fundingRate; board[sym].funding_at = +f.fundingTime } catch (e) { if (!errs.some((x) => x.startsWith('funding'))) errs.push(`funding ${sym}: ${e}`) } })
  for (const s of found) { s.funding = board[s.sym]?.funding ?? null; s.spread = board[s.sym]?.spread ?? null; s.vol = board[s.sym]?.vol ?? null; s.kind_he = KIND_HE[s.kind as keyof typeof KIND_HE] }
  st.setups = found.slice(0, 80); st.last_bar = barT; st.scan = { at: iso(), bar: iso(barT), coins: COINS.length, scanned: Object.values(board).filter((x: any) => x.scanned).length, found: found.length, ms: Date.now() - t0 }
  // liquidations on the 15 largest coins (OKX liquidation orders, last hour; contracts x ctVal x bankruptcy price)
  const liq: any[] = []
  for (const [sym] of Object.entries(board).sort((a: any, b: any) => b[1].vol - a[1].vol).slice(0, 15)) {
    try {
      const d = (await j(`${OKX}/public/liquidation-orders?instType=SWAP&state=filled&uly=${sym}-USDT`))[0]?.details ?? []
      const cv = st.ctval?.[sym] ?? NaN, recent = d.filter((x: any) => now - +x.ts < 3600_000)
      const usd = (side: string) => recent.filter((x: any) => x.posSide === side).reduce((a: number, x: any) => a + +x.sz * cv * +x.bkPx, 0)
      liq.push({ sym, long_usd: usd('long'), short_usd: usd('short'), n: recent.length, biggest: recent.reduce((m: number, x: any) => Math.max(m, +x.sz * cv * +x.bkPx), 0) })
    } catch { /* skip */ }
  }
  st.liquidations = { at: iso(), rows: liq.filter((r) => Number.isFinite(r.long_usd)) }
}

// 3. crypto news every ~5 minutes, tagged with the coins it names and the price move since it was published
if (!st.news_at || now - Date.parse(st.news_at) > 5 * 60_000) {
  const seen = new Map<string, any>((st.news ?? []).map((n: any) => [n.link, n]))
  for (const [src, u] of [['Cointelegraph', 'https://cointelegraph.com/rss'], ['Decrypt', 'https://decrypt.co/feed'], ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/']]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' }); if (!r.ok) throw new Error(`${r.status}`)
      for (const it of parseRss(await r.text())) {
        if (now - it.at > 24 * 3600_000 || seen.has(it.link)) continue
        const coins = coinsIn(it.title, COINS).slice(0, 4)
        seen.set(it.link, { src, title: it.title, link: it.link, at: iso(it.at), coins, px0: Object.fromEntries(coins.map((c) => [c, board[c]?.last ?? null])) })
      }
    } catch (e) { errs.push(`news ${src}: ${e}`) }
  }
  st.news = [...seen.values()].filter((n) => now - Date.parse(n.at) < 24 * 3600_000).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 80)
  st.news_at = iso()
}
for (const n of st.news ?? []) n.move = Object.fromEntries(n.coins.map((c: string) => [c, n.px0?.[c] && board[c] ? board[c].last / n.px0[c] - 1 : null]))

st.board = board; st.last_cycle = iso(); st.errors = errs.slice(0, 20)
fs.mkdirSync(FILE.replace(/[^/]+$/, '') || '.', { recursive: true })
fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(st)); fs.renameSync(`${FILE}.tmp`, FILE)
console.log(`board ${Object.keys(board).length} setups ${st.setups.length} news ${st.news.length} errors ${errs.length}`)
