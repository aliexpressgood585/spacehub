// "פולי חדשות" (Poly News) — PAPER desk that trades Polymarket markets right after a matching news post (owner 2026-10-15:
// "a separate dashboard and account, Telegram + general channels, highest level"). Pure rules shared by scripts/pmn-desk.ts,
// the research (backtest/research/pmn_study.py) and tests/pmn.test.ts. Nothing here talks to the network.
//
// The rule, in one line: a fresh post (Telegram public channel or RSS) that names a live Polymarket market is a reason to
// LOOK, never a reason to buy by itself. The desk buys only once the market has started to move in some direction since the
// post (the price is the vote on what the news means), the move is not already exhausted, the book is tight, and it exits on
// a clock / target / stop. Every matched post is measured whether or not it trades (st.study).

export interface PmnMarket { id: string; q: string; slug: string; eslug: string; toks: string[]; outs: string[]; fee: number; end: string | null; vol: number }
export interface PmnPost { src: string; id: string; ts: number; text: string; url?: string }

export const PMN = {
  // Telegram public channels (read via the open web preview t.me/s/<name>, no account, no key). Checked live 2026-10-15:
  // all post in English within the last hours. Macro / markets, world news & conflicts, crypto, Polymarket.
  // status/pmn-study.txt (45 days of history): FabrizioRomano matched 126 posts to live markets and moved none of them
  // (transfer news vs Ballon d'Or markets = word noise) -> dropped; Polymarket_Whales (large trades on a named market) moved
  // 21 of its 53 -> added. Channels that matched nothing yet stay: they are cheap and the study is only 45 days.
  channels: ['WalterBloomberg', 'financialjuice', 'insiderpaper', 'disclosetv', 'worldnews', 'clashreport', 'geopolitics_prime',
    'warmonitors', 'OSINTdefender', 'nexta_live', 'IntelSlava', 'WatcherGuru', 'cointelegraph', 'WuBlockchainEnglish',
    'PolymarketIntel', 'Polymarket_Whales'],
  feeds: ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://feeds.bbci.co.uk/news/rss.xml', 'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://www.espn.com/espn/rss/news', 'https://cointelegraph.com/rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 'https://www.theguardian.com/world/rss', 'https://rss.politico.com/politics-news.xml',
    'https://feeds.skynews.com/feeds/rss/world.xml', 'https://www.aljazeera.com/xml/rss/all.xml', 'https://www.cbsnews.com/latest/rss/main',
    'https://feeds.a.dj.com/rss/RSSWorldNews.xml', 'https://www.france24.com/en/rss', 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    'https://thehill.com/homenews/feed/', 'https://decrypt.co/feed', 'https://www.theblock.co/rss.xml', 'https://www.skysports.com/rss/12040',
    // 2026-10-15 (owner: "connect every reliable source"): Google News top stories (aggregates Reuters / AP / NBC / CNN …),
    // official sources (Federal Reserve press releases, White House), and the big desks' politics / world / business / sport.
    'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', 'https://www.federalreserve.gov/feeds/press_all.xml',
    'https://www.whitehouse.gov/news/feed/', 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://www.theguardian.com/politics/rss', 'https://rss.dw.com/rdf/rss-en-all', 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
    'https://www.espn.com/espn/rss/nfl/news', 'https://www.espn.com/espn/rss/nba/news'],
  maxPostAgeS: 600,      // a post older than this when first seen is recorded but never traded
  minScore: 2,           // shared RARE words (in <= rareDf market questions) incl. at least one Capitalised name
  rareDf: 3,
  headChars: 220,        // match on the start of a post (the headline), not on a long body
  watchS: 900,           // after the post, the desk watches the market this long for a move
  moveMin: 0.03,         // enter only once |mid - price before the post| >= this
  moveMax: 0.20,         // ... and not after the move is already this large (late, the edge is gone)
  pxLo: 0.05, pxHi: 0.92, // the side we buy must be priced inside this band (room to run, not a lottery ticket)
  maxSpread: 0.03,       // best ask - best bid of the side, else the book is too thin to trust
  holdS: 3600,           // time exit
  takeProfit: 0.10,      // exit early once the side's bid is this far above our entry
  stopLoss: 0.07,        // ... or this far below it
  stakeFrac: 0.03,       // 3% of equity per trade
  maxOpen: 10,
  maxPerEvent: 1,
  minQty: 5,
  // WHALES (Polymarket data-api: every taker trade >= minUsd with wallet / side / outcome / price) — SHOWN and MEASURED, not
  // traded. backtest/research/pmw_study.py -> status/pmw-study.txt (10,500 trades >= $10k, ~18 days, 482 whale buys at 5-92c):
  // buying the same outcome when we see it lost -2.5..-5.8%/$ out of sample at every exit (30 m / 1 h / 4 h), $25-100k and
  // today's top-500 PnL wallets (look-ahead) ~-1..+1.6%/$ on n 25-33. No edge after costs, so whales never open a trade here.
  whale: { minUsd: 10000, trade: false, smartTop: 500 },
} as const

export interface PmnWhale { id: string; ts: number; wallet: string; name: string; smart: boolean; side: 'BUY' | 'SELL'; outcome: string; outcomeIndex: number;
  price: number; usd: number; title: string; slug: string; eslug: string; asset: string; conditionId: string }
// data-api /trades row -> whale record (null if under the size floor or malformed)
export function parseWhale(t: any, smart: Set<string>): PmnWhale | null {
  const usd = +t?.size * +t?.price
  if (!(usd >= PMN.whale.minUsd) || !t?.asset || !t?.timestamp) return null
  return { id: `${t.transactionHash ?? ''}:${t.asset}`, ts: +t.timestamp, wallet: t.proxyWallet, name: t.name || t.pseudonym || '', smart: smart.has(t.proxyWallet),
    side: t.side === 'SELL' ? 'SELL' : 'BUY', outcome: t.outcome, outcomeIndex: +t.outcomeIndex, price: +t.price, usd, title: t.title, slug: t.slug,
    eslug: t.eventSlug ?? t.slug, asset: t.asset, conditionId: t.conditionId }
}

const STOP = new Set(('will the a an of in on to for by and or with at from as is be this that who what when which after before over under than more ' +
  'less into about against vs win wins game match first next new says said report reports year years day today week market price ' +
  'bitcoin crypto breaking just also have has had been were they their there would could should other some most many much very ' +
  'only like make made back still even here where while then them these those such being does doing done must').split(' '))

export const words = (s: string) => new Set((s.match(/[A-Za-z][A-Za-z0-9'.-]{3,}/g) ?? []).map((w) => w.replace(/^['.-]+|['.-]+$/g, '').toLowerCase()).filter((w) => w.length >= 4 && !STOP.has(w)))
export const caps = (s: string) => new Set((s.match(/\b[A-Z][A-Za-z0-9'.-]{3,}/g) ?? []).map((w) => w.replace(/^['.-]+|['.-]+$/g, '').toLowerCase()))

// document frequency of each word over the market questions (a word in many questions says nothing about WHICH market)
export function docFreq(markets: { q: string }[]) {
  const df = new Map<string, number>()
  for (const m of markets) for (const w of words(m.q)) df.set(w, (df.get(w) ?? 0) + 1)
  return df
}

// best market for a post: most shared rare words, >= minScore, at least one of them Capitalised in the post (a name)
export function matchPost<T extends { q: string }>(text: string, markets: T[], df: Map<string, number>): { m: T; score: number; shared: string[] } | null {
  const head = text.slice(0, PMN.headChars), ws = words(head), cp = caps(head)
  let best: { m: T; score: number; shared: string[] } | null = null
  for (const m of markets) {
    const mw = words(m.q), shared: string[] = []
    for (const w of ws) if (mw.has(w) && (df.get(w) ?? 0) <= PMN.rareDf) shared.push(w)
    if (shared.length < PMN.minScore || !shared.some((w) => cp.has(w))) continue
    if (!best || shared.length > best.score) best = { m, score: shared.length, shared }
  }
  return best
}

// entry decision on a watched post: which side (0 = first outcome / YES token, 1 = second) to buy, or why not
export function pmnDecide(pre: number, mid: number, sideAsk: [number, number], sideBid: [number, number], ageS: number):
  { side: 0 | 1 } | { skip: string } {
  if (ageS > PMN.watchS) return { skip: 'expired' }
  const mv = mid - pre
  if (Math.abs(mv) < PMN.moveMin) return { skip: 'no_move' }
  if (Math.abs(mv) > PMN.moveMax) return { skip: 'move_exhausted' }
  const side: 0 | 1 = mv > 0 ? 0 : 1
  const a = sideAsk[side], b = sideBid[side]
  if (!(a > 0)) return { skip: 'no_ask' }
  if (a < PMN.pxLo || a > PMN.pxHi) return { skip: 'out_of_band' }
  if (!(b > 0) || a - b > PMN.maxSpread) return { skip: 'wide_spread' }
  return { side }
}

// exit decision for an open position (bid = best bid of the side we hold)
export function pmnExit(entry: number, bid: number, heldS: number): string | null {
  if (bid >= entry + PMN.takeProfit) return 'TAKE_PROFIT'
  if (bid > 0 && bid <= entry - PMN.stopLoss) return 'STOP'
  if (heldS >= PMN.holdS) return 'TIME'
  return null
}

export const pmnStake = (equity: number) => Math.max(0, equity * PMN.stakeFrac)

// Telegram web preview page -> posts (t.me/s/<channel>; 20 latest)
export function parseTelegram(html: string, ch: string): PmnPost[] {
  const out: PmnPost[] = []
  for (const part of html.split('<div class="tgme_widget_message_wrap').slice(1)) {
    const id = part.match(/data-post="[^"/]+\/(\d+)"/)?.[1], t = part.match(/<time datetime="([^"]+)"/)?.[1]
    const x = part.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1]
    if (!id || !t || !x) continue
    const text = decode(x.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (text) out.push({ src: `tg:${ch}`, id: `${ch}/${id}`, ts: Math.floor(Date.parse(t) / 1000), text, url: `https://t.me/${ch}/${id}` })
  }
  return out
}

// RSS 2.0 / Atom-ish feed -> posts
export function parseRss(xml: string, host: string): PmnPost[] {
  const out: PmnPost[] = []
  for (const it of xml.split(/<item[ >]/).slice(1)) {
    const title = decode((it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? '').trim())
    const pub = Date.parse(it.match(/<pubDate>([^<]+)/)?.[1] ?? it.match(/<dc:date>([^<]+)/)?.[1] ?? '')
    const link = (it.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1] ?? '').trim()
    if (title && pub) out.push({ src: `rss:${host}`, id: `${host}|${title}`, ts: Math.floor(pub / 1000), text: title, url: link || undefined })
  }
  return out
}

function decode(s: string) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}
