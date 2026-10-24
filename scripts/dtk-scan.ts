// "ערכת הדיי טריידר" scanner (shared/dtk.ts): one cycle = market board + (once per closed 5m bar) a scan of every USDT perpetual
// Binance Futures trades that has an OKX swap (shared/binperps.ts; Binance fapi is 451 from the runners, prices come from OKX),
// the time machine for the strongest setups, funding / open interest / liquidations and crypto news, and the $1,000 DEMO account
// that opens and closes positions by itself on live OKX books (taker fees, book-walk slippage, real funding). Writes dtk/state.json.
// READ-ONLY toward any exchange: it never places a real order. Usage: node --experimental-strip-types scripts/dtk-scan.ts dtk/state.json
import fs from 'node:fs'
import { DTK, PAPER, KIND_HE, tmGate, setupsAt, replay, monteCarlo, atr, coinsIn, parseRss, budget, riskChecks, walkBook, exitTrigger, type Bar } from '../shared/dtk.ts'
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

// History cache on the runner's disk (not pushed): a coin is fetched in full once per runner job, then only the new bars.
const HDIR = '/tmp/dtk-hist'
async function histCached(sym: string, days: number): Promise<Bar[]> {
  const f = `${HDIR}/${sym}.json`, want = days * 288
  let h: Bar[] = []
  try { h = JSON.parse(fs.readFileSync(f, 'utf8')) } catch { /* cold */ }
  const lastT = h.length ? h[h.length - 1].t : 0
  const pages = h.length >= want * 0.95 && now - lastT < 3 * 86400_000 ? Math.ceil((now - lastT) / DTK.bar / 100) + 1 : Math.ceil(want / 100)
  const m = new Map<number, Bar>(h.map((b) => [b.t, b]))
  for (const b of await history(sym, pages)) m.set(b.t, b)
  h = [...m.values()].sort((a, b) => a.t - b.t).filter((b) => b.t + DTK.bar <= now).slice(-want)
  try { fs.mkdirSync(HDIR, { recursive: true }); fs.writeFileSync(f, JSON.stringify(h)) } catch { /* cache is optional */ }
  return h
}

const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { version: 'dtk-v1', setups: [], news: [], oi_hist: {}, last_bar: 0 }
st.rules = DTK; st.feed = 'OKX USDT swaps (Binance fapi 451 from the runner); universe = Binance USDT perps with an OKX swap'
const errs: string[] = []
if (!st.ctval && st.universe) try { st.ctval = Object.fromEntries((await j(`${OKX}/public/instruments?instType=SWAP`)).filter((x: any) => /-USDT-SWAP$/.test(x.instId)).map((x: any) => [x.instId.slice(0, -10), +x.ctVal])) } catch (e) { errs.push(`instruments: ${e}`) }
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
let found: any[] = [], scanned = false
if (barT > st.last_bar && Object.keys(board).length) {
  const t0 = Date.now(); scanned = true
  await pool(COINS.filter((c) => board[c]), 8, async (sym) => {
    try {
      const b = toBars(await j(`${OKX}/market/candles?instId=${sym}-USDT-SWAP&bar=5m&limit=300`)); if (b.length < 60) return
      const last = b.length - 1, a = atr(b)
      board[sym].atr = a; board[sym].bar = b[last].t; board[sym].scanned = true
      for (const s of setupsAt(b, last)) found.push({ sym, ...s, liquid: liquid(board[sym]), atr_pct: a / b[last].c })
    } catch (e) { if (errs.length < 20) errs.push(`${sym}: ${e}`) }
  })
  // time machine for EVERY liquid setup (it gates the demo account) and the strongest others: last PAPER.tmDays days of 5m history,
  // replay of the same rule + Monte Carlo of the session. Bounded by time; a setup left without a replay cannot be entered.
  found.sort((x, y) => Number(y.liquid) - Number(x.liquid) || y.strength - x.strength)
  const tmList = [...found.filter((s) => s.liquid), ...found.filter((s) => !s.liquid).slice(0, 4)], hcache = new Map<string, Bar[]>()
  for (const s of tmList) {
    if (Date.now() - t0 > 80_000) { errs.push(`time machine: time budget, ${tmList.length - tmList.indexOf(s)} setups left`); break }
    try {
      const h = hcache.get(s.sym) ?? await histCached(s.sym, PAPER.tmDays); hcache.set(s.sym, h)
      s.replay = replay(h, s.kind, s.side); s.mc = monteCarlo(h, s, 2000, s.t % 100000); s.hist_days = +(h.length * 5 / 1440).toFixed(1)
      s.tm = tmGate(s.replay)
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

// 4. the $1,000 DEMO account: exits every cycle, entries right after a scan. Prices, books and funding are OKX's live ones.
const sg = (x: string) => (x === 'LONG' ? 1 : -1)
const P = (st.paper ??= { start: PAPER.start, cash: PAPER.start, next_id: 1, trades: [], equity: [], decisions: [], day: -1, dayStart: PAPER.start, dayEntries: 0, fees: 0, funding: 0, rules: PAPER })
const pdec = (d: any) => P.decisions.unshift({ at: iso(), ...d })
const book = async (sym: string) => {
  const cv = st.ctval?.[sym]; if (!(cv > 0)) throw new Error('no contract size')
  const d = (await j(`${OKX}/market/books?instId=${sym}-USDT-SWAP&sz=50`))[0], m = (l: string[][]) => l.map((x) => [+x[0], +x[1] * cv] as [number, number])
  return { asks: m(d.asks), bids: m(d.bids) }
}
const openP = () => P.trades.filter((t: any) => t.status === 'OPEN')
const equityP = () => P.cash + openP().reduce((a: number, t: any) => a + t.margin + sg(t.side) * ((board[t.sym]?.last ?? t.mark) - t.entry) * t.qty, 0)
for (const t of openP()) {
  try {
    // funding: at each real settlement the published rate x notional moves cash (positive rate: longs pay)
    if (t.fund_next && now >= t.fund_next) { const cost = sg(t.side) * t.fund_rate * t.qty * (board[t.sym]?.last ?? t.mark); P.cash -= cost; t.funding += cost; P.funding += cost; t.fund_next = null }
    if (!t.fund_next) { const f = (await j(`${OKX}/public/funding-rate?instId=${t.sym}-USDT-SWAP`))[0]; t.fund_rate = +f.fundingRate; t.fund_next = +f.fundingTime }
    // every minute since the last check (up to 5 h back), so a pause of the loop never skips a stop, a target or the time exit
    const lim1 = Math.min(300, Math.ceil((now - t.checked) / 60_000) + 3)
    const m1 = toBars(await j(`${OKX}/market/candles?instId=${t.sym}-USDT-SWAP&bar=1m&limit=${lim1}`), true)
    const trig = exitTrigger(m1.filter((b) => b.t < t.flat_at), t.side, t.stop, t.target, t.checked)
    const why = trig?.why ?? (now >= t.flat_at ? 'TIME' : null)
    const timeBar = !trig && why === 'TIME' ? m1.filter((b) => b.t + 60_000 <= t.flat_at).pop() : null   // close of the minute the 4 h ended
    t.checked = now; t.mark = board[t.sym]?.last ?? t.mark
    if (!why) continue
    const bk = await book(t.sym), lv = t.side === 'LONG' ? bk.bids : bk.asks, w = walkBook(lv, t.qty)
    const impact = lv.length ? Math.max(DTK.slip, Math.abs(w.vwap / lv[0][0] - 1)) * (w.filled < t.qty ? 2 : 1) : 0.01
    const px = trig ? trig.px * (1 - sg(t.side) * impact) : timeBar && now - t.flat_at > 120_000 ? timeBar.c * (1 - sg(t.side) * impact) : w.vwap * (1 - sg(t.side) * DTK.slip)
    const fee = px * t.qty * DTK.taker, gross = sg(t.side) * (px - t.entry) * t.qty
    P.cash += t.margin + gross - fee; P.fees += fee
    const pnl = gross - t.fee_in - fee - t.funding
    Object.assign(t, { status: 'CLOSED', exit: px, exit_fee: fee, trigger_px: trig?.px ?? null, impact_bps: +(impact * 1e4).toFixed(1), gross, pnl, R: pnl / t.risk_usd, reason: why, closed_at: iso() })
    pdec({ act: 'EXIT', sym: t.sym, side: t.side, why, pnl: +pnl.toFixed(2), R: +t.R.toFixed(2) })
  } catch (e) { errs.push(`paper ${t.sym}: ${e}`) }
}
const dayN = Math.floor(now / 86400_000)
if (P.day !== dayN) Object.assign(P, { day: dayN, dayStart: equityP(), dayEntries: 0 })
if (scanned) {
  const eq = equityP(), maxLoss = eq * PAPER.riskPct
  for (const s of found) {
    if (openP().length >= PAPER.maxOpen) { pdec({ act: 'SKIP', sym: s.sym, side: s.side, why: `כבר ${PAPER.maxOpen} פוזיציות פתוחות` }); break }
    if (!s.liquid) continue
    const tg = tmGate(s.replay)
    if (!tg.ok) { pdec({ act: 'SKIP', sym: s.sym, side: s.side, why: tg.why }); continue }
    const b = board[s.sym], side = s.side as 'LONG' | 'SHORT', g = sg(side)
    if (openP().some((t: any) => t.sym === s.sym)) { pdec({ act: 'SKIP', sym: s.sym, side, why: 'כבר פתוחה פוזיציה במטבע' }); continue }
    const live = side === 'LONG' ? b.ask : b.bid, r = Math.abs(s.entry - s.stop), drift = g * (live - s.entry) / r
    if (!(live > 0) || g * (live - s.stop) <= 0 || g * (live - s.target) >= 0 || drift > PAPER.chaseR) { pdec({ act: 'SKIP', sym: s.sym, side, why: `המחיר ברח מהכניסה (${drift.toFixed(2)}R)` }); continue }
    const plan = { side, entry: live, stop: s.stop, target: s.target }, bu = budget(plan, maxLoss, eq, PAPER.lev)
    const rc = riskChecks(plan, bu, { spreadBps: b.spread ?? undefined, volUsd: b.vol, funding: b.funding ?? null, dayPnl: eq - P.dayStart, tradesToday: P.dayEntries },
      { ...DTK.limits, maxLossUsd: maxLoss * 1.0001, dayLossUsd: P.dayStart * PAPER.dayLossPct, tradesPerDay: PAPER.perDay })
    if (!rc.pass) { pdec({ act: 'SKIP', sym: s.sym, side, why: 'מנהל הסיכונים: ' + rc.checks.filter((c) => c.ok !== true).map((c) => c.k).join(' · ') }); continue }
    try {
      const bk = await book(s.sym), w = walkBook(side === 'LONG' ? bk.asks : bk.bids, bu.qty)
      if (w.filled < bu.qty * 0.999) { pdec({ act: 'SKIP', sym: s.sym, side, why: 'הספר דליל מדי לגודל הזה' }); continue }
      const fill = w.vwap * (1 + g * DTK.slip)
      if (g * (fill - s.stop) <= 0) continue
      const qty = bu.qty, notional = fill * qty, margin = notional / PAPER.lev, fee = notional * DTK.taker
      if (margin + fee > P.cash) { pdec({ act: 'SKIP', sym: s.sym, side, why: 'אין מספיק מזומן פנוי לביטחון' }); continue }
      P.cash -= margin + fee; P.fees += fee
      const t = { id: P.next_id++, sym: s.sym, side, kind: s.kind, kind_he: s.kind_he, why: s.why, signal_px: s.entry, touch: live, entry: fill, stop: s.stop, target: s.target, qty, notional, margin, lev: PAPER.lev,
        fee_in: fee, risk_usd: maxLoss, opened_at: iso(), flat_at: now + DTK.holdBars * DTK.bar, checked: now, funding: 0, mark: fill, status: 'OPEN',
        replay: s.replay ? { n: s.replay.n, avgR: s.replay.avgR } : null, mc: s.mc ? { target: s.mc.target, stop: s.mc.stop, evR: s.mc.evR } : null }
      P.trades.unshift(t); P.dayEntries++
      pdec({ act: 'OPEN', sym: s.sym, side, why: `${s.kind_he} · ${tg.why} · ${qty.toPrecision(4)} @ ${fill.toPrecision(6)} · סיכון $${maxLoss.toFixed(2)}` })
    } catch (e) { errs.push(`paper open ${s.sym}: ${e}`) }
  }
}
const eqNow = equityP(), lastPt = P.equity[P.equity.length - 1]
if (!lastPt || now - Date.parse(lastPt.t) >= 5 * 60_000) P.equity.push({ t: iso(), eq: +eqNow.toFixed(2) })
if (P.equity.length > 4000) P.equity = P.equity.filter((_: any, i: number) => i % 2 === 0)
P.equity_now = +eqNow.toFixed(2); P.decisions = P.decisions.slice(0, 200); P.trades = P.trades.slice(0, 500)

st.board = board; st.last_cycle = iso(); st.errors = errs.slice(0, 20)
fs.mkdirSync(FILE.replace(/[^/]+$/, '') || '.', { recursive: true })
fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(st)); fs.renameSync(`${FILE}.tmp`, FILE)
console.log(`board ${Object.keys(board).length} setups ${st.setups.length} news ${st.news.length} errors ${errs.length}`)
