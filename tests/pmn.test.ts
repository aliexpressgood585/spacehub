// Poly News desk (shared/pmn.ts): matching, entry decision, exits, feed parsers, and the runner's wiring (paper only).
import fs from 'node:fs'
import { PMN, words, docFreq, matchPost, pmnDecide, pmnExit, pmnStake, parseTelegram, parseRss, parseWhale } from '../shared/pmn.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.error('FAIL', m) } }

// matching: rare shared words incl. a Capitalised name
const MK = [{ q: 'Will Benjamin Netanyahu be the next Prime Minister of Israel?' }, { q: 'Will Israel strike Iran by October 31?' },
  { q: 'Will Israel and Hamas agree a ceasefire by December 31?' }, { q: 'Will Israel win Eurovision 2027?' },
  { q: 'Will Lamine Yamal win the 2026 Ballon d\'Or?' }, { q: 'US imports Russian diesel by October 31?' }]
const df = docFreq(MK)
ok(matchPost('Netanyahu meets Benjamin Gantz in Jerusalem', MK, df)?.m === MK[0], 'two rare words incl. a name -> match')
ok(matchPost('ISRAEL says talks continue', MK, df) === null, 'one common word (israel in 4 questions) -> no match')
ok(matchPost('KREMLIN: RUSSIAN DIESEL HAS STARTED TO REACH GLOBAL MARKETS', MK, df)?.m === MK[5], 'all-caps headline still matches')
ok(matchPost('lamine yamal scores twice', MK, df) === null, 'no Capitalised name in the post -> no match')
ok(!words('Will the market win this week').size, 'stopwords dropped')
ok(matchPost('x '.repeat(200) + 'Netanyahu Benjamin', MK, df) === null, 'only the headline part is matched')

// entry decision
const A: [number, number] = [0.47, 0.55], B: [number, number] = [0.45, 0.53]
ok('skip' in pmnDecide(0.45, 0.46, A, B, 60) && (pmnDecide(0.45, 0.46, A, B, 60) as any).skip === 'no_move', 'small move -> wait')
ok((pmnDecide(0.40, 0.46, A, B, 60) as any).side === 0, 'first outcome rose >= 3c -> buy it')
ok((pmnDecide(0.52, 0.46, A, B, 60) as any).side === 1, 'first outcome fell -> buy the second')
ok((pmnDecide(0.20, 0.46, A, B, 60) as any).skip === 'move_exhausted', 'move > 20c -> too late')
ok((pmnDecide(0.40, 0.46, A, B, PMN.watchS + 1) as any).skip === 'expired', 'watch window over')
ok((pmnDecide(0.80, 0.86, [0.95, 0.15], [0.93, 0.13], 60) as any).skip === 'out_of_band', 'side above 92c -> out of band')
ok((pmnDecide(0.40, 0.46, [0.50, 0.55], [0.44, 0.45], 60) as any).skip === 'wide_spread', 'spread > 3c -> skip')

// exits
ok(pmnExit(0.50, 0.61, 100) === 'TAKE_PROFIT', 'take profit at +10c')
ok(pmnExit(0.50, 0.42, 100) === 'STOP', 'stop at -7c')
ok(pmnExit(0.50, 0.52, PMN.holdS) === 'TIME', 'time exit')
ok(pmnExit(0.50, 0.52, 100) === null, 'hold')
ok(pmnExit(0.50, 0, 100) === null, 'no bid -> no stop on an empty book')
ok(Math.abs(pmnStake(1000) - 30) < 1e-9, '3% stake')

// parsers
const tg = '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div data-post="WalterBloomberg/36959"><div class="tgme_widget_message_text js-message_text">RUSSIA&#39;S OIL<br/>REVENUE <b>UP</b> &amp; MORE</div><time datetime="2026-10-15T11:21:07+00:00"></time></div></div>'
const p = parseTelegram(tg, 'WalterBloomberg')
ok(p.length === 1 && p[0].text === "RUSSIA'S OIL REVENUE UP & MORE" && p[0].id === 'WalterBloomberg/36959' && p[0].ts === Date.parse('2026-10-15T11:21:07Z') / 1000, 'telegram parse')
const rss = '<rss><channel><item><title><![CDATA[Ceasefire talks resume]]></title><link>https://x.y/1</link><pubDate>Wed, 15 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'
const r = parseRss(rss, 'x.y')
ok(r.length === 1 && r[0].text === 'Ceasefire talks resume' && r[0].url === 'https://x.y/1', 'rss parse')

// whales: size floor, smart flag, never traded
const wt = { proxyWallet: '0xabc', side: 'BUY', asset: 'tok1', conditionId: '0xc', size: 30000, price: 0.4, timestamp: 1792065364, title: 'Will X?', slug: 'will-x', eventSlug: 'x', outcome: 'Yes', outcomeIndex: 0, transactionHash: '0xh', name: 'w' }
const pw = parseWhale(wt, new Set(['0xabc']))
ok(!!pw && Math.abs(pw.usd - 12000) < 1e-6 && pw.smart && pw.side === 'BUY' && pw.id === '0xh:tok1', 'whale parsed, usd = size x price, smart flag')
ok(parseWhale({ ...wt, size: 1000 }, new Set()) === null, 'under $10k -> not a whale')
ok(PMN.whale.trade === false, 'whales are observation only (pmw-study: following loses)')
const rdf = '<rdf:RDF><item rdf:about="x"><title>Fed holds rates</title><link>https://x.y/2</link><dc:date>2026-10-15T10:00:00Z</dc:date></item></rdf:RDF>'
ok(parseRss(rdf, 'dw').length === 1, 'RDF feed with dc:date parses')
ok(PMN.feeds.length >= 30 && PMN.feeds.some((f) => f.includes('news.google.com')) && PMN.feeds.some((f) => f.includes('federalreserve')), 'reliable feeds wired')

// runner wiring: separate account file, paper only (GETs, never an order endpoint), workflow publishes pmn/ only
const src = fs.readFileSync('scripts/pmn-desk.ts', 'utf8'), wf = fs.readFileSync('.github/workflows/pmn-desk.yml', 'utf8')
ok(!/method:\s*'POST'|\/order\b|privateKey|API_KEY|signOrder/i.test(src), 'runner never places or signs an order')
ok(src.includes("'pmn/state.json'") && !/pmc\/state|pm\/state\.json/.test(src), 'runner uses its own state file only')
ok(wf.includes('git add pmn/state.json') && !/git add pm\/|git add pmc\//.test(wf) && wf.includes('group: pmn-desk'), 'workflow publishes pmn/ only, own concurrency group')
console.log(`poly news desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)
