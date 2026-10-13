// pm-news — OBSERVATION ONLY (owner 2026-10-13: "news arbitrage on Polymarket?"). Measures whether a bot that reads FREE
// news feeds every ~15 s could still trade on a headline, or whether Polymarket prices have already moved by the time we see it.
// Never trades, never touches pm/state.json. State: pm/news.json on the pm-desk-data branch.
// Per event: a headline from a free RSS feed that shares >= 2 significant words with an active Polymarket market question.
//   pub   = the feed's publish time, seen = when this runner first saw it (lag = seen - pub),
//   after 20 minutes: the market's 1-minute price history around it (CLOB prices-history) ->
//   p0 = price 1 min before pub, pSeen = price when we saw it, p5/p15 = 5 / 15 minutes after we saw it.
//   moved_before_seen = |pSeen - p0|; moved_after = |p15 - pSeen|; follow = virtual trade in the direction already moved
//   (if >= 2c) from pSeen to p15, minus 1c slip. Summary in news.study.
// Run: node --experimental-strip-types scripts/pm-news.ts <news.json>
import fs from 'node:fs'

const FILE = process.argv[2] ?? 'pm/news.json'
const GAMMA = 'https://gamma-api.polymarket.com', CLOB = 'https://clob.polymarket.com'
const FEEDS = ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://feeds.bbci.co.uk/news/rss.xml', 'https://feeds.bbci.co.uk/sport/rss.xml',
  'https://www.espn.com/espn/rss/news', 'https://cointelegraph.com/rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 'https://www.theguardian.com/world/rss', 'https://rss.politico.com/politics-news.xml', 'https://feeds.skynews.com/feeds/rss/world.xml']
const UA = { 'User-Agent': 'Mozilla/5.0 (spacehub-paper research)' }
const STOP = new Set('will the a an of in on to for by and or with at from as is be this that who what when which after before over under than more less into about against vs win wins game match first next new says said report reports year years day today week market price bitcoin crypto'.split(' '))
export const words = (s: string) => new Set((s.toLowerCase().match(/[a-z][a-z0-9'.-]{3,}/g) ?? []).map((w) => w.replace(/['.]+$/, '')).filter((w) => !STOP.has(w)))
// shared RARE words only: a word that appears in more than 3 of the active market questions ("league", "prime", "city")
// says nothing about WHICH market a headline is about
export function matchScore(headline: string, question: string, df?: Map<string, number>) { const a = words(headline), b = words(question); let n = 0; for (const w of a) if (b.has(w) && (!df || (df.get(w) ?? 0) <= 3)) n++; return n }

if (process.argv[1]?.endsWith('pm-news.ts')) await main()

async function main() {
const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { events: [], seen: [], markets: null, markets_at: 0 }
const now = Date.now()
const txt = async (u: string) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error(String(r.status)); return r.text() }
const j = async (u: string) => JSON.parse(await txt(u))
const note: any = { at: new Date().toISOString() }
try {
  // active markets, refreshed every 10 min (top 500 by volume)
  if (!st.markets || now - st.markets_at > 600_000) {
    const ms: any[] = []
    for (let off = 0; off < 500; off += 100) { const pg = await j(`${GAMMA}/markets?closed=false&active=true&limit=100&offset=${off}&order=volume24hr&ascending=false`); ms.push(...pg); if (pg.length < 100) break }
    st.markets = ms.filter((m) => m.enableOrderBook && m.clobTokenIds).map((m) => ({ id: m.id, q: m.question, slug: m.events?.[0]?.slug ?? m.slug, tok: JSON.parse(m.clobTokenIds)[0], out: JSON.parse(m.outcomes ?? '[]')[0] }))
    st.markets_at = now
  }
  // new headlines
  const df = new Map<string, number>()
  for (const m of st.markets) for (const w of words(m.q)) df.set(w, (df.get(w) ?? 0) + 1)
  const seen = new Set<string>(st.seen)
  let fresh = 0
  for (const f of FEEDS) {
    let x = ''; try { x = await txt(f) } catch { continue }
    for (const it of x.split(/<item[ >]/).slice(1)) {
      const title = (it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? '').trim()
      const pub = Date.parse(it.match(/<pubDate>([^<]+)/)?.[1] ?? '')
      if (!title || !pub) continue
      const key = `${f}|${title}`
      if (seen.has(key)) continue
      seen.add(key)
      if (now - pub > 30 * 60_000 || pub > now + 60_000) continue        // only headlines we see within 30 min of publication
      let best: any = null, score = 0
      for (const m of st.markets) { const s = matchScore(title, m.q, df); if (s > score) { score = s; best = m } }
      if (!best || score < 2) continue
      st.events.push({ title, feed: new URL(f).hostname, pub: new Date(pub).toISOString(), seen: new Date(now).toISOString(), lag_s: Math.round((now - pub) / 1000), market_id: best.id, question: best.q, slug: best.slug, token: best.tok, outcome: best.out, score, status: 'WAIT' })
      fresh++
    }
  }
  st.seen = [...seen].slice(-4000)
  note.fresh = fresh
  // measure events 20+ minutes after we saw them
  let measured = 0
  for (const e of st.events.filter((e: any) => e.status === 'WAIT' && now - Date.parse(e.seen) > 20 * 60_000)) {
    const pub = Date.parse(e.pub) / 1000, seenT = Date.parse(e.seen) / 1000
    try {
      const h = (await j(`${CLOB}/prices-history?market=${e.token}&startTs=${Math.floor(pub - 600)}&endTs=${Math.floor(seenT + 1200)}&fidelity=1`)).history ?? []
      const at = (t: number) => { let p: number | null = null; for (const x of h) { if (x.t <= t) p = +x.p; else break } return p }
      const p0 = at(pub - 60), pS = at(seenT), p5 = at(seenT + 300), p15 = at(seenT + 900)
      if (p0 == null || pS == null || p15 == null) { e.status = 'NODATA'; continue }
      const before = pS - p0, after = p15 - pS
      Object.assign(e, { status: 'DONE', p0, pSeen: pS, p5, p15, moved_before: +before.toFixed(4), moved_after: +after.toFixed(4),
        follow: Math.abs(before) >= 0.02 ? +((Math.sign(before) * after) - 0.01).toFixed(4) : null })
      measured++
    } catch { /* retry next cycle */ }
  }
  note.measured = measured
} catch (e) { note.error = String(e).slice(0, 160) }
st.events = st.events.slice(-600)
const done = st.events.filter((e: any) => e.status === 'DONE'), moved = done.filter((e: any) => Math.abs(e.moved_before) + Math.abs(e.moved_after) >= 0.02)
const fol = done.filter((e: any) => e.follow != null)
const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
st.study = { events: st.events.length, measured: done.length, median_lag_s: med(done.map((e: any) => e.lag_s)),
  moved: moved.length,
  share_before_seen: moved.length ? moved.reduce((a: number, e: any) => a + Math.abs(e.moved_before), 0) / moved.reduce((a: number, e: any) => a + Math.abs(e.moved_before) + Math.abs(e.moved_after), 0) : null,
  follow_n: fol.length, follow_avg_c: fol.length ? 100 * fol.reduce((a: number, e: any) => a + e.follow, 0) / fol.length : null,
  follow_wins: fol.filter((e: any) => e.follow > 0).length }
st.last_note = note; delete st.markets_cache
fs.mkdirSync(FILE.replace(/\/[^/]*$/, '') || '.', { recursive: true })
fs.writeFileSync(FILE, JSON.stringify(st))
console.log(JSON.stringify({ note, study: st.study }))
}
