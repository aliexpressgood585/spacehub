// pmn-desk — "פולי חדשות" (Poly News): Polymarket PAPER desk that trades only markets a fresh news post points at.
// Runs on GitHub Actions (.github/workflows/pmn-desk.yml) every ~15 s; state = pmn/state.json on the `pm-desk-data` branch,
// read by trading-app polynews.html. Separate $1,000 account; never touches pm/ or pmc/. PAPER ONLY: unsigned public GETs
// (t.me web preview, RSS, Polymarket Gamma / CLOB), never an order. Rules: shared/pmn.ts.
// Cycle: 1) settle / exit open trades; 2) read sources (Telegram channels in rotation, RSS every ~60 s); 3) match fresh posts
// to live markets and start watching them (price before the post from CLOB history); 4) watched markets: buy the side the
// market moved to once the move is real and not exhausted; 5) bookkeeping + study.
// SINCE 2026-10-15: money is traded only by the geopolitics status-quo rule (step 6, PMN.sq: NO at 81-91c, >= 14 days left,
// hold to the official result); the news rule of steps 3-4 runs in SHADOW (PMN.newsTrade false) and is still measured.
// Run: node --experimental-strip-types scripts/pmn-desk.ts <state.json> [cache dir]
import fs from 'node:fs'
import { takerFee, walkAsks, heOutcome, type FeeSchedule } from '../shared/pm.ts'
import { clvMark, clvStudy } from '../shared/clv.ts'
import { PMN, docFreq, matchPost, pmnDecide, pmnExit, pmnStake, parseTelegram, parseRss, parseWhale, sqTheme, sqDecide, type PmnMarket, type PmnPost } from '../shared/pmn.ts'

const FILE = process.argv[2] ?? 'pmn/state.json'
const CACHE = process.argv[3] ?? '/tmp/pmn-cache'
const GAMMA = 'https://gamma-api.polymarket.com', CLOB = 'https://clob.polymarket.com', DATA = 'https://data-api.polymarket.com'
const UA = { 'User-Agent': 'Mozilla/5.0 (spacehub-paper research)' }
const get = async (u: string, ms = 10000) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 80)}`); return r.text() }
const j = async (u: string, ms = 10000) => JSON.parse(await get(u, ms))
const arr = (x: unknown): any[] => { try { return Array.isArray(x) ? x : JSON.parse(String(x)) } catch { return [] } }
const iso = (ms = Date.now()) => new Date(ms).toISOString()
type Lvl = { price: number; size: number }
async function book(token: string): Promise<{ bids: Lvl[]; asks: Lvl[] } | null> {
  try {
    const b = await j(`${CLOB}/book?token_id=${token}`)
    const m = (l: any[]) => (l ?? []).map((x) => ({ price: +x.price, size: +x.size })).filter((x) => x.price > 0 && x.size > 0)
    return { bids: m(b.bids).sort((a, c) => c.price - a.price), asks: m(b.asks).sort((a, c) => a.price - c.price) }
  } catch { return null }
}

fs.mkdirSync(CACHE, { recursive: true })
const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
  : { start_cash: 1000, cash: 1000, strategy: PMN, trades: [], equity: [], decisions: [], events: [], feed: [], seen: [], src: {}, next_id: 1, cycle: 0 }
st.cycle = (st.cycle ?? 0) + 1
const now = Date.now(), nowS = Math.floor(now / 1000)
const note: any = { at: iso() }
const decisions: any[] = []
let openValue = 0, entered = 0, exited = 0

// ---- market universe (cache file on the runner, refreshed every 10 min; never committed: ~1,500 markets) ----
async function universe(): Promise<PmnMarket[]> {
  const fp = `${CACHE}/universe.json`
  if (fs.existsSync(fp)) { const u = JSON.parse(fs.readFileSync(fp, 'utf8')); if (now - u.at < 600_000) return u.ms }
  const ms: PmnMarket[] = []
  for (let off = 0; off < 1500; off += 100) {
    let pg: any[] = []
    try { pg = await j(`${GAMMA}/markets?closed=false&active=true&limit=100&offset=${off}&order=volume24hr&ascending=false`, 20000) } catch { break }
    for (const m of pg) {
      const toks = arr(m.clobTokenIds), outs = arr(m.outcomes)
      if (!m.enableOrderBook || toks.length !== 2 || +m.volumeNum < 20000 || /updown/.test(m.slug ?? '')) continue
      ms.push({ id: m.id, q: m.question, slug: m.slug, eslug: m.events?.[0]?.slug ?? m.slug, toks, outs, vol: +m.volumeNum || 0, end: m.endDate ?? null,
        fee: m.feesEnabled && m.feeSchedule ? +m.feeSchedule.rate || 0 : 0 })
    }
    if (pg.length < 100) break
  }
  if (ms.length) fs.writeFileSync(fp, JSON.stringify({ at: now, ms }))
  else if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8')).ms
  return ms
}

const fsOf = (fee: number): FeeSchedule | null => (fee > 0 ? { rate: fee, exponent: 1 } : null)

try {
  // ---- 1. open trades: official result -> settle; else mark at the real best bid and apply the exit rule ----
  const open0 = st.trades.filter((t: any) => t.status === 'OPEN')
  const res: Record<string, any> = {}
  if (open0.length) for (const m of await j(`${GAMMA}/markets?closed=true&limit=50&${[...new Set(open0.map((t: any) => t.market_id))].map((id) => `id=${id}`).join('&')}`)) res[m.id] = m
  for (const t of open0) {
    const m = res[t.market_id]
    if (m) {
      const toks = arr(m.clobTokenIds), px = arr(m.outcomePrices).map(Number), k = toks.indexOf(t.token_id)
      if (k >= 0 && (px[k] === 1 || px[k] === 0)) {
        Object.assign(t, { status: 'CLOSED', exit_px: px[k], exit_fee: 0, proceeds: t.qty * px[k], pnl: t.qty * px[k] - t.cost, reason: px[k] === 1 ? 'RESOLVED_WIN' : 'RESOLVED_LOSS', closed_at: iso(), mark_px: px[k], mark_at: iso() })
        st.cash += t.qty * px[k]; exited++; continue
      }
    }
    if (t.rule === 'SQ') {                               // status quo: held to the official result, only marked
      if (st.cycle % 8 === 0 || t.mark_px == null) { const b = await book(t.token_id), bid = b?.bids[0]?.price ?? 0; if (bid > 0) { t.mark_px = bid; t.mark_at = iso() }; clvMark(t, bid, b?.asks[0]?.price, Date.now()) }
      openValue += t.qty * (t.mark_px ?? t.entry_px); continue
    }
    const b = await book(t.token_id), bid = b?.bids[0]?.price ?? 0
    if (bid > 0) { t.mark_px = bid; t.mark_at = iso() }
    clvMark(t, bid, b?.asks[0]?.price, Date.now())
    const why = pmnExit(t.entry_px, bid, nowS - Math.floor(Date.parse(t.opened_at) / 1000))
    if (why && b?.bids.length) {
      let left = t.qty, got = 0
      for (const l of b.bids) { if (left <= 1e-9) break; const q = Math.min(l.size, left); got += q * l.price; left -= q }
      const sold = t.qty - left, vw = sold > 0 ? got / sold : 0, fee = takerFee(sold, vw, t.meta?.fee_schedule ?? null)
      if (sold >= PMN.minQty || left < PMN.minQty) {
        const part = sold / t.qty, costPart = t.cost * part
        st.cash += got - fee
        if (left > 1e-6 && left >= PMN.minQty) {          // the book could not take it all: keep the remainder open
          st.trades.push({ ...t, id: st.next_id++, qty: sold, cost: costPart, entry_fee: t.entry_fee * part, status: 'CLOSED', exit_px: vw, exit_fee: fee, proceeds: got, pnl: got - fee - costPart, reason: why, closed_at: iso() })
          Object.assign(t, { qty: left, cost: t.cost - costPart, entry_fee: t.entry_fee * (1 - part) })
        } else Object.assign(t, { status: 'CLOSED', exit_px: vw, exit_fee: fee, proceeds: got, pnl: got - fee - t.cost, reason: why, closed_at: iso() })
        exited++
        decisions.push({ ts: iso(), market_id: t.market_id, question: t.question, outcome: t.outcome, outcome_he: t.outcome_he, price: vw, decision: 'SELL',
          reason: why === 'TAKE_PROFIT' ? `יעד רווח: הקנייה עלתה ל־${(bid * 100).toFixed(1)}¢` : why === 'STOP' ? `סטופ: הקנייה ירדה ל־${(bid * 100).toFixed(1)}¢` : `יציאה בזמן (${Math.round(PMN.holdS / 60)} דק׳)` })
        if (t.status === 'CLOSED') continue
      }
    }
    openValue += t.qty * (t.mark_px ?? t.entry_px)
  }

  // ---- 2. sources: Telegram channels in rotation (8 per cycle), RSS every 4th cycle ----
  const MK = await universe()
  note.universe = MK.length
  const df = docFreq(MK)
  const chs = PMN.channels.filter((_, i) => i % 2 === st.cycle % 2)
  const posts: PmnPost[] = []
  st.src ??= {}
  const srcOk = (k: string, ok: boolean, n = 0) => { const s = (st.src[k] ??= { ok: 0, fail: 0, posts: 0, last: null }); if (ok) { s.ok++; s.last = iso(); s.posts += n } else s.fail++ }
  await Promise.all(chs.map(async (ch) => {
    try { const p = parseTelegram(await get(`https://t.me/s/${ch}`), ch); posts.push(...p); srcOk(`tg:${ch}`, true) } catch { srcOk(`tg:${ch}`, false) }
  }))
  if (st.cycle % 4 === 1) await Promise.all(PMN.feeds.map(async (f) => {
    const host = new URL(f).hostname
    try { const p = parseRss(await get(f), host); posts.push(...p); srcOk(`rss:${host}`, true) } catch { srcOk(`rss:${host}`, false) }
  }))

  // ---- 3. fresh posts -> match -> watch ----
  const seen = new Set<string>(st.seen)
  let fresh = 0, matched = 0
  for (const p of posts.sort((a, b) => a.ts - b.ts)) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const age = nowS - p.ts
    if (age > 6 * 3600 || p.ts > nowS + 120) continue        // first sight of an old post (cold start) -> ignore silently
    fresh++
    st.src[p.src] && (st.src[p.src].posts++)
    const mt = matchPost(p.text, MK, df)
    const row: any = { src: p.src, id: p.id, url: p.url, ts: iso(p.ts * 1000), seen: iso(), lag_s: age, text: p.text.slice(0, 280) }
    if (mt) {
      matched++
      Object.assign(row, { market_id: mt.m.id, question: mt.m.q, slug: mt.m.eslug, score: mt.score, shared: mt.shared })
      if (age <= PMN.maxPostAgeS && !st.events.some((e: any) => e.market_id === mt.m.id && nowS - e.post_ts < PMN.watchS)) {
        // price of the first outcome 1 minute before the post (CLOB 1-minute history); none -> the mid right now
        let pre: number | null = null, preSrc = 'history'
        try {
          const h = (await j(`${CLOB}/prices-history?market=${mt.m.toks[0]}&startTs=${p.ts - 900}&endTs=${p.ts - 60}&fidelity=1`)).history ?? []
          if (h.length) pre = +h[h.length - 1].p
        } catch { /* fall back */ }
        if (pre == null) {
          const b = await book(mt.m.toks[0]); const bb = b?.bids[0]?.price, aa = b?.asks[0]?.price
          if (bb && aa) { pre = (bb + aa) / 2; preSrc = 'mid_at_seen' }
        }
        if (pre != null && pre > 0.02 && pre < 0.98) {
          st.events.push({ id: p.id, src: p.src, url: p.url, text: p.text.slice(0, 280), post_ts: p.ts, seen_ts: nowS, lag_s: age, market_id: mt.m.id, question: mt.m.q,
            slug: mt.m.slug, eslug: mt.m.eslug, toks: mt.m.toks, outs: mt.m.outs, fee: mt.m.fee, end: mt.m.end, score: mt.score, shared: mt.shared,
            pre, pre_src: preSrc, path: [], status: 'WATCH' })
          row.status = 'WATCH'
        } else row.status = 'DECIDED_MARKET'
      } else row.status = age > PMN.maxPostAgeS ? 'LATE' : 'ALREADY_WATCHED'
    }
    st.feed.unshift(row)
  }
  st.seen = [...seen].slice(-2500)
  st.feed = st.feed.slice(0, 120)
  Object.assign(note, { posts: posts.length, fresh, matched })

  // ---- 4. watched markets: move? -> buy the side it moved to ----
  const equity0 = st.cash + openValue
  for (const e of st.events.filter((e: any) => e.status === 'WATCH')) {
    const ageS = nowS - e.post_ts
    const [b0, b1] = await Promise.all([book(e.toks[0]), book(e.toks[1])])
    const bid0 = b0?.bids[0]?.price ?? 0, ask0 = b0?.asks[0]?.price ?? 0, bid1 = b1?.bids[0]?.price ?? 0, ask1 = b1?.asks[0]?.price ?? 0
    const mid = bid0 > 0 && ask0 > 0 ? (bid0 + ask0) / 2 : bid1 > 0 && ask1 > 0 ? 1 - (bid1 + ask1) / 2 : null
    if (mid == null) { if (ageS > PMN.watchS) e.status = 'NO_BOOK'; continue }
    e.path.push([ageS, +mid.toFixed(4)]); if (e.path.length > 80) e.path = e.path.filter((_: any, i: number) => i % 2 === 0)
    e.max_move = Math.max(e.max_move ?? 0, Math.abs(mid - e.pre))
    const d = pmnDecide(e.pre, mid, [ask0, ask1], [bid0, bid1], ageS)
    const D = (decision: string, reason: string, k = 0, price = 0) => decisions.push({ ts: iso(), market_id: e.market_id, question: e.question, outcome: e.outs[k], outcome_he: heOutcome(e.outs[k]), price, decision, reason, src: e.src, post: e.text.slice(0, 140) })
    if ('skip' in d) {
      if (d.skip === 'expired') { e.status = e.max_move >= PMN.moveMin ? 'MISSED' : 'NO_MOVE'; e.closed_ts = nowS }
      else if (d.skip !== 'no_move') { e.status = d.skip.toUpperCase(); e.closed_ts = nowS; D('skip', { move_exhausted: 'התנועה כבר גדולה מדי — מאוחר', out_of_band: 'המחיר מחוץ לטווח 5–92¢', wide_spread: 'פער קנייה־מכירה רחב מדי', no_ask: 'אין מוכרים בספר' }[d.skip] ?? d.skip, 0, mid) }
      continue
    }
    const k = d.side, bk = k === 0 ? b0! : b1!, ask = k === 0 ? ask0 : ask1
    const why = `${e.src.replace(/^tg:/, 'טלגרם ').replace(/^rss:/, '')} לפני ${Math.round(ageS / 60)} דק׳: "${e.text.slice(0, 80)}" · השוק זז ${((mid - e.pre) * 100).toFixed(1)}¢ מאז הפרסום`
    e.status = 'DONE'; e.closed_ts = nowS; e.decision = { side: k, ask, mid }
    if (!PMN.newsTrade) { e.shadow = true; D('SHADOW', `${why} → צל בלבד: הכלל הזה הפסיד בבדיקת שנה, נמדד בלי כסף`, k, ask); continue }
    if (st.trades.some((t: any) => t.market_id === e.market_id)) { D('skip', 'כבר נסחר השוק הזה', k, ask); continue }
    if (st.trades.filter((t: any) => t.status === 'OPEN').length >= PMN.maxOpen) { D('skip', 'מקסימום פוזיציות פתוחות', k, ask); continue }
    if (st.trades.filter((t: any) => t.status === 'OPEN' && t.event_slug === e.eslug).length >= PMN.maxPerEvent) { D('skip', 'כבר יש פוזיציה על האירוע הזה', k, ask); continue }
    const stake = Math.min(pmnStake(equity0), st.cash - 1)
    if (stake < PMN.minQty * ask) { D('skip', 'אין מספיק מזומן', k, ask); continue }
    const fs_ = fsOf(e.fee)
    const fill = walkAsks(bk.asks, stake / (1 + (fs_ ? fs_.rate * (1 - ask) : 0)), Math.min(PMN.pxHi, ask + 0.02))
    if (fill.qty < PMN.minQty) { D('skip', 'ספר הזמנות דל מדי', k, ask); continue }
    const fee = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + fee
    st.trades.push({ id: st.next_id++, market_id: e.market_id, slug: e.slug, event_slug: e.eslug, question: e.question, outcome: e.outs[k], outcome_he: heOutcome(e.outs[k]),
      token_id: e.toks[k], end_time: e.end, qty: fill.qty, entry_px: fill.vwap, entry_fee: fee, cost, best_ask: ask, opened_at: iso(), status: 'OPEN', mark_px: bk.bids[0]?.price ?? fill.vwap, mark_at: iso(),
      meta: { fee_schedule: fs_, src: e.src, url: e.url, post: e.text, post_ts: e.post_ts, lag_s: e.lag_s, pre: e.pre, mid, move: mid - e.pre, age_s: ageS, shared: e.shared, wanted: stake } })
    st.cash -= cost; openValue += fill.qty * (bk.bids[0]?.price ?? fill.vwap); entered++
    D('BUY', `${why} → קנינו ${fill.qty.toFixed(1)} מניות ב־${(fill.vwap * 100).toFixed(1)}¢ ($${cost.toFixed(0)}), עמלה $${fee.toFixed(2)}`, k, fill.vwap)
  }
  // ---- 4b. whales (observation only, PMN.whale.trade = false): every taker trade >= $10k, flagged when the wallet is in the
  // all-time PnL top 500; a whale on a market the news desk is watching is attached to that watch. Whale BUYS at 5-92c are
  // measured 30 / 60 min later (did the price keep going the whale's way?) into st.study.whales.
  try {
    const lf = `${CACHE}/leaders.json`
    let smart = new Set<string>()
    if (fs.existsSync(lf) && now - JSON.parse(fs.readFileSync(lf, 'utf8')).at < 3600_000) smart = new Set(JSON.parse(fs.readFileSync(lf, 'utf8')).w)
    else {
      const w: string[] = []
      for (let off = 0; off < PMN.whale.smartTop; off += 50) { try { for (const x of await j(`${DATA}/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=50&offset=${off}`)) w.push(x.proxyWallet) } catch { break } }
      if (w.length) { fs.writeFileSync(lf, JSON.stringify({ at: now, w })); smart = new Set(w) }
    }
    st.whales ??= []
    const have = new Set(st.whales.map((x: any) => x.id))
    const rows: any[] = await j(`${DATA}/trades?limit=100&takerOnly=true&filterType=CASH&filterAmount=${PMN.whale.minUsd}`)
    let nw = 0
    for (const t of rows.reverse()) {
      const w = parseWhale(t, smart)
      if (!w || have.has(w.id) || nowS - w.ts > 3600 || /updown|-up-or-down-/.test(w.slug ?? '')) continue
      have.add(w.id); nw++
      const ev = st.events.find((e: any) => e.status === 'WATCH' && e.toks?.includes(w.asset))
      if (ev) (ev.whales ??= []).push({ side: w.side, outcome: w.outcome, usd: Math.round(w.usd), price: w.price, smart: w.smart })
      st.whales.unshift({ ...w, watched: !!ev })
    }
    st.whales = st.whales.slice(0, 300)
    note.whales = nw
    for (const w of st.whales.filter((w: any) => w.side === 'BUY' && w.price >= 0.05 && w.price <= 0.92 && (w.m30 == null || w.m60 == null) && nowS - w.ts >= 1800 && nowS - w.ts < 7200)) {
      const b = await book(w.asset); const bb = b?.bids[0]?.price, aa = b?.asks[0]?.price
      if (!(bb && aa)) continue
      const mid = +((bb + aa) / 2).toFixed(4)
      if (w.m30 == null) w.m30 = mid
      if (nowS - w.ts >= 3600 && w.m60 == null) w.m60 = mid
    }
  } catch (err) { note.whale_error = String(err).slice(0, 120) }

  // measurement for every watched event, traded or not: where was the first outcome 15 / 60 min after the post?
  for (const e of st.events.filter((e: any) => e.status !== 'WATCH' && (e.m15 == null || e.m60 == null) && nowS - e.post_ts >= 900)) {
    for (const [key, dt] of [['m15', 900], ['m60', 3600]] as const) {
      if (e[key] != null || nowS - e.post_ts < dt) continue
      const b = await book(e.toks[0]); const bb = b?.bids[0]?.price, aa = b?.asks[0]?.price
      if (bb && aa) e[key] = +((bb + aa) / 2).toFixed(4)
    }
  }

  // ---- 6. THE TRADED RULE: geopolitics status quo (PMN.sq). Every scanS: Gamma markets with >= 14 days left and >= $50k
  // volume, geopolitics by the research's keyword classes; buy NO when its real best ask is 81-91c; hold to the result.
  // One entry per market ever, 1 per event, <= perTheme open per theme (Iran / Russia-Ukraine / ...), <= maxOpen.
  try {
    if (!st.sq_scan_at || now - Date.parse(st.sq_scan_at) >= PMN.sq.scanS * 1000) {
      st.sq_scan_at = iso()
      const endMin = iso(now + PMN.sq.minDays * 86400_000)
      let seenGeo = 0, inBand = 0, sqIn = 0
      const open = () => st.trades.filter((t: any) => t.status === 'OPEN')
      const eq = st.cash + openValue
      for (let off = 0; off < 3000; off += 100) {
        let pg: any[] = []
        try { pg = await j(`${GAMMA}/markets?closed=false&active=true&limit=100&offset=${off}&volume_num_min=${PMN.sq.minVol}&end_date_min=${endMin}&order=volumeNum&ascending=false`, 20000) } catch { break }
        for (const m of pg) {
          const toks = arr(m.clobTokenIds), outs = arr(m.outcomes), px = arr(m.outcomePrices).map(Number)
          if (!m.enableOrderBook || toks.length !== 2 || outs[0] !== 'Yes' || outs[1] !== 'No') continue
          const evt = m.events?.[0] ?? {}, theme = sqTheme(m.question, evt.title ?? '')
          if (!theme) continue
          seenGeo++
          if (!(px[1] >= PMN.sq.lo - 0.03 && px[1] <= PMN.sq.hi + 0.02)) continue          // pre-filter on Gamma's price before reading a book
          const end = Date.parse(m.endDate), start = Date.parse(m.startDate ?? m.createdAt ?? m.endDate)
          const daysLeft = (end - now) / 86400_000, lifeDays = (end - start) / 86400_000
          const eslug = evt.slug ?? m.slug
          const D = (decision: string, reason: string, price = 0) => decisions.push({ ts: iso(), market_id: m.id, question: m.question, outcome: 'No', outcome_he: heOutcome('No'), price, decision, reason, rule: 'SQ' })
          if (st.trades.some((t: any) => t.market_id === m.id)) continue
          const b = await book(toks[1]); const ask = b?.asks[0]?.price ?? 0
          const why = sqDecide(ask, daysLeft, lifeDays, +m.volumeNum || 0)
          if (why) continue
          inBand++
          if (open().filter((t: any) => t.rule === 'SQ').length >= PMN.sq.maxOpen) { D('skip', 'מקסימום פוזיציות סטטוס־קוו פתוחות', ask); continue }
          if (open().some((t: any) => t.event_slug === eslug)) { D('skip', 'כבר יש פוזיציה על האירוע הזה', ask); continue }
          if (open().filter((t: any) => t.rule === 'SQ' && t.meta?.theme === theme).length >= PMN.sq.perTheme) { D('skip', `כבר ${PMN.sq.perTheme} פוזיציות על הנושא (${theme}) — הפסדים מתקבצים`, ask); continue }
          const stake = Math.min(eq * PMN.sq.stakeFrac, st.cash - 1)
          if (stake < PMN.minQty * ask) { D('skip', 'אין מספיק מזומן', ask); continue }
          const fee = m.feesEnabled && m.feeSchedule ? +m.feeSchedule.rate || 0 : 0, fs_ = fsOf(fee)
          const fill = walkAsks(b!.asks, stake / (1 + (fs_ ? fs_.rate * (1 - ask) : 0)), PMN.sq.hi)
          if (fill.qty < PMN.minQty) { D('skip', 'ספר הזמנות דל מדי', ask); continue }
          const tf = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + tf
          st.trades.push({ id: st.next_id++, rule: 'SQ', market_id: m.id, slug: m.slug, event_slug: eslug, question: m.question, outcome: 'No', outcome_he: heOutcome('No'),
            token_id: toks[1], end_time: m.endDate, qty: fill.qty, entry_px: fill.vwap, entry_fee: tf, cost, best_ask: ask, opened_at: iso(), status: 'OPEN',
            mark_px: b!.bids[0]?.price ?? fill.vwap, mark_at: iso(),
            meta: { fee_schedule: fs_, theme, days_left: +daysLeft.toFixed(1), life_days: +lifeDays.toFixed(0), volume: Math.round(+m.volumeNum || 0), event_title: evt.title ?? null, wanted: stake } })
          st.cash -= cost; openValue += fill.qty * (b!.bids[0]?.price ?? fill.vwap); entered++; sqIn++
          D('BUY', `סטטוס־קוו גיאופוליטי (${theme}): "לא" ב־${(fill.vwap * 100).toFixed(1)}¢, עוד ${Math.round(daysLeft)} ימים לסיום — מחזיקים עד ההכרעה הרשמית ($${cost.toFixed(0)})`, fill.vwap)
        }
        if (pg.length < 100) break
      }
      note.sq = { geo: seenGeo, in_band: inBand, entered: sqIn }
    }
  } catch (err) { note.sq_error = String(err).slice(0, 160) }
} catch (err) { note.error = String(err).slice(0, 200) }

// ---- 5. bookkeeping ----
const openCount = st.trades.filter((t: any) => t.status === 'OPEN').length
st.strategy = PMN; st.last_scan = iso(); st.last_note = { ...note, entered, exited }
const last = st.equity[st.equity.length - 1]
if (!last || now - Date.parse(last.ts) > 55_000 || entered || exited) st.equity.push({ ts: iso(), equity: st.cash + openValue, cash: st.cash, open_value: openValue, open_count: openCount })
if (st.equity.length > 5000) st.equity = st.equity.slice(-5000)
st.decisions = [...decisions, ...st.decisions].slice(0, 200)
st.events = st.events.slice(-400)
{
  const ev = st.events.filter((e: any) => e.status !== 'WATCH'), mv = ev.filter((e: any) => (e.max_move ?? 0) >= PMN.moveMin)
  const tk = st.trades.filter((t: any) => t.status === 'CLOSED' && t.rule !== 'SQ')
  const fol = ev.filter((e: any) => e.m60 != null && e.decision)
  const bySrc: Record<string, any> = {}
  for (const e of ev) { const s = (bySrc[e.src] ??= { events: 0, moved: 0, traded: 0 }); s.events++; if ((e.max_move ?? 0) >= PMN.moveMin) s.moved++; if (e.decision) s.traded++ }
  const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  st.study = {
    watched: ev.length, moved: mv.length, traded: ev.filter((e: any) => e.decision).length,
    median_lag_s: med(ev.map((e: any) => e.lag_s)),
    // the market's own move from the decision price to 60 min after the post, in the direction we bought (before costs)
    follow_60m_c: fol.length ? 100 * fol.reduce((a: number, e: any) => a + (e.decision.side === 0 ? e.m60 - e.decision.mid : e.decision.mid - e.m60), 0) / fol.length : null,
    closed: tk.length, wins: tk.filter((t: any) => t.pnl > 0).length, pnl: tk.reduce((a: number, t: any) => a + t.pnl, 0),
    ret: tk.length ? tk.reduce((a: number, t: any) => a + t.pnl / t.cost, 0) / tk.length : null,
    by_src: bySrc,
    news_rule: PMN.newsTrade ? 'traded' : 'shadow',
    sq: (() => {
      const all = st.trades.filter((t: any) => t.rule === 'SQ'), c = all.filter((t: any) => t.status === 'CLOSED'), o = all.filter((t: any) => t.status === 'OPEN')
      const th: Record<string, number> = {}; for (const t of o) th[t.meta?.theme ?? '?'] = (th[t.meta?.theme ?? '?'] ?? 0) + 1
      return { open: o.length, closed: c.length, wins: c.filter((t: any) => t.pnl > 0).length, pnl: c.reduce((a: number, t: any) => a + t.pnl, 0),
        locked: o.reduce((a: number, t: any) => a + t.cost, 0), unreal: o.reduce((a: number, t: any) => a + t.qty * (t.mark_px ?? t.entry_px) - t.cost, 0), by_theme: th }
    })(),
    whales: (() => {
      const w = (st.whales ?? []).filter((x: any) => x.m60 != null)
      const mv = (x: any) => 100 * (x.m60 - x.price)
      return { seen: (st.whales ?? []).length, smart: (st.whales ?? []).filter((x: any) => x.smart).length, measured: w.length,
        follow_60m_c: w.length ? w.reduce((a: number, x: any) => a + mv(x), 0) / w.length : null,
        smart_follow_60m_c: w.filter((x: any) => x.smart).length ? w.filter((x: any) => x.smart).reduce((a: number, x: any) => a + mv(x), 0) / w.filter((x: any) => x.smart).length : null }
    })(),
  }
}
fs.mkdirSync(FILE.replace(/\/[^/]*$/, '') || '.', { recursive: true })
// CLV / Brier (docs/POLY_PLAYBOOK.md): status-quo positions resolve in weeks, so open_clv_c (running) is the early read
st.clv = { sq: clvStudy(st.trades.filter((t: any) => t.rule === 'SQ')), news: clvStudy(st.trades.filter((t: any) => t.rule !== 'SQ')) }
fs.writeFileSync(FILE, JSON.stringify(st))
console.log(JSON.stringify({ cash: +st.cash.toFixed(2), equity: +(st.cash + openValue).toFixed(2), open: openCount, entered, exited, note }))
