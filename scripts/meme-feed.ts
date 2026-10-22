// meme-feed — free live feed for the "ממים חיים" PAPER desk when pump.fun's own API refuses the host (it answers 403 to
// GitHub runners since 2026-10-22 ~19:43 UTC). Long-running process; writes a snapshot file every second that
// scripts/meme-core.ts reads instead of the pump.fun listing.
//   new coins  : PumpPortal public websocket (subscribeNewToken + subscribeMigration; free, no key)
//   prices     : the pump.fun bonding-curve accounts themselves, read from public Solana RPC (getMultipleAccounts, 100
//                per call) — exact reserves, so a "trade" is any change in the curve between two reads
//   socials    : the coin's metadata JSON (uri from the create event)
//   SOL / USD  : data-api.binance.vision, Coinbase fallback
// Run: node --experimental-strip-types scripts/meme-feed.ts <out.json> [state.json to seed recent coins from]
import fs from 'node:fs'
import { bondingCurveOf, getCurves } from '../shared/solana.ts'

const OUT = process.argv[2] ?? '/tmp/meme-feed.json'
const SEED = process.argv[3]
const TRACK_MIN = 125, HOT_MS = 5 * 60_000, COLD_POLL_MS = 60_000, POLL_MS = 2000
const now = () => Date.now()

type C = { mint: string; symbol: string; name: string; uri?: string; image?: string; curve: string; created: number; creator?: string
  pool: string; vS: number; vT: number; rT: number; rS: number; complete: boolean; lastTrade: number; lastPoll: number
  social?: boolean; meta?: 'ok' | 'fail'; metaTries: number; metaAt?: number }
const coins = new Map<string, C>()
const stat = { ws_open: false, ws_msgs: 0, creates: 0, rpc_ok: 0, rpc_err: 0, last_rpc_error: '', sol_usd: 0, sol_at: 0, started: now() }

// seed: coins the recorder was following when the previous runner stopped (age <= 65 min), so a restart keeps context
try {
  const st = SEED && fs.existsSync(SEED) ? JSON.parse(fs.readFileSync(SEED, 'utf8')) : null
  for (const r of Object.values<any>(st?.paths ?? {})) {
    if (!r?.m || now() - r.c > TRACK_MIN * 60_000) continue
    coins.set(r.m, { mint: r.m, symbol: r.s, name: r.s, curve: bondingCurveOf(r.m), created: r.c, creator: r.cr, pool: 'pump',
      vS: 0, vT: 0, rT: 0, rS: 0, complete: false, lastTrade: 0, lastPoll: 0, social: !!r.so, meta: 'ok', metaTries: 0 })
  }
  console.log(`seeded ${coins.size} coins`)
} catch (e) { console.log('seed failed', String(e)) }

function connect() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data')
  ws.onopen = () => { stat.ws_open = true; ws.send(JSON.stringify({ method: 'subscribeNewToken' })); ws.send(JSON.stringify({ method: 'subscribeMigration' })) }
  ws.onmessage = (m) => {
    stat.ws_msgs++
    let d: any; try { d = JSON.parse(String(m.data)) } catch { return }
    if (d.txType === 'create' && d.mint) {
      stat.creates++
      const T = now()
      coins.set(d.mint, { mint: d.mint, symbol: d.symbol, name: d.name, uri: d.uri, curve: d.bondingCurveKey || bondingCurveOf(d.mint),
        created: T, creator: d.traderPublicKey, pool: d.pool ?? 'pump',
        vS: (+d.vSolInBondingCurve || 0) * 1e9, vT: (+d.vTokensInBondingCurve || 0) * 1e6, rT: 0, rS: 0, complete: false,
        lastTrade: T, lastPoll: 0, metaTries: 0 })
    } else if (d.mint && (d.txType === 'migrate' || d.txType === 'migration')) {
      const c = coins.get(d.mint); if (c) c.complete = true
    }
  }
  const retry = () => { stat.ws_open = false; setTimeout(connect, 3000) }
  ws.onclose = retry
  ws.onerror = () => { try { ws.close() } catch {} }
}
connect()

async function poll() {
  const T = now()
  for (const [k, c] of coins) if (T - c.created > TRACK_MIN * 60_000) coins.delete(k)
  const due = [...coins.values()].filter((c) => !c.complete && (T - c.created < HOT_MS || T - c.lastTrade < HOT_MS || T - c.lastPoll > COLD_POLL_MS))
  try {
    const res = await getCurves(due.map((c) => c.curve))
    due.forEach((c, i) => {
      const a = res[i]; c.lastPoll = T; if (!a) return
      if (a.complete) { c.complete = true; c.lastTrade = T; return }
      if (a.vS !== c.vS || a.vT !== c.vT) { if (c.rT || c.rS) c.lastTrade = T }   // reserves moved = someone traded
      Object.assign(c, { vS: a.vS, vT: a.vT, rT: a.rT, rS: a.rS })
    })
    stat.rpc_ok++
  } catch (e) { stat.rpc_err++; stat.last_rpc_error = String(e).slice(0, 120) }
}

let metaBusy = 0
function metadata() {
  const T = now()
  for (const c of coins.values()) {
    if (metaBusy >= 4) break
    if (c.meta === 'ok' || !c.uri || c.metaTries >= 3 || (c.metaAt && T - c.metaAt < 60_000)) continue
    if (c.rS / 1e9 < 2 && T - c.created > 60_000) continue          // only coins with some SOL in the curve
    metaBusy++; c.metaTries++; c.metaAt = T
    fetch(c.uri, { signal: AbortSignal.timeout(6000) }).then((r) => r.json()).then((j: any) => {
      c.social = !!(j?.twitter || j?.telegram || j?.website); c.image = j?.image; c.meta = 'ok'
    }).catch(() => { c.meta = 'fail' }).finally(() => { metaBusy-- })
  }
}

async function solPrice() {
  for (const [u, f] of [['https://data-api.binance.vision/api/v3/ticker/price?symbol=SOLUSDT', (j: any) => +j.price],
    ['https://api.exchange.coinbase.com/products/SOL-USD/ticker', (j: any) => +j.price]] as const) {
    try { const j = await (await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0' }, signal: AbortSignal.timeout(6000) })).json(); const p = f(j); if (p > 0) { stat.sol_usd = p; stat.sol_at = now(); return } } catch {}
  }
}

function write() {
  const T = now(), list: any[] = []
  for (const c of coins.values()) if (c.vT > 0 || c.complete) list.push({ mint: c.mint, symbol: c.symbol, name: c.name, image: c.image,
    created: c.created, creator: c.creator, pool: c.pool, vS: c.vS, vT: c.vT, rT: c.rT, rS: c.rS, complete: c.complete,
    lastTrade: c.lastTrade, social: c.social ?? false, meta: c.meta ?? null })
  const body = JSON.stringify({ at: T, sol_usd: stat.sol_usd, sol_at: stat.sol_at, stat: { ...stat, tracked: coins.size }, coins: list })
  fs.writeFileSync(OUT + '.tmp', body); fs.renameSync(OUT + '.tmp', OUT)
}

await solPrice(); setInterval(solPrice, 30_000)
let busy = false
setInterval(async () => { if (busy) return; busy = true; try { await poll(); metadata() } finally { busy = false } }, POLL_MS)
setInterval(write, 1000)
setInterval(() => console.log(JSON.stringify({ t: new Date().toISOString(), tracked: coins.size, ...stat })), 60_000)
