// meme-live — the always-on server for the "ממים חיים" PAPER desk (Fly.io, server/meme-live/fly.toml). Runs the same cycle as
// the GitHub-Actions runner (scripts/meme-core.ts) back to back, about once a second, keeps the state on a volume and streams
// it to memes.html over Server-Sent Events. PAPER ONLY: public GETs to pump.fun / DexScreener, never a transaction.
// Run: node --experimental-strip-types server/meme-live/server.ts
import fs from 'node:fs'
import http from 'node:http'
import { cycle, freshState, sleep } from '../../scripts/meme-core.ts'

const DIR = process.env.STATE_DIR ?? '/data'
const FILE = `${DIR}/state.json`
const PORT = +(process.env.PORT ?? 8080)
const MIN_CYCLE_MS = +(process.env.MIN_CYCLE_MS ?? 1000)
const SEED = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/meme/state.json'

fs.mkdirSync(DIR, { recursive: true })
async function load(): Promise<any> {
  if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  try { const r = await fetch(SEED); if (r.ok) { console.log('seeded from the GitHub desk state'); return await r.json() } } catch {}
  return freshState()
}
const st: any = await load()
st.host = 'fly'

// what the page needs: no snapshot ring, no research paths (large)
const slim = () => ({ start_cash: st.start_cash, cash: st.cash, rules: st.rules, sol_usd: st.sol_usd, cycle: st.cycle,
  cycle_ms: st.cycle_ms, last_error: st.last_error, last_note: st.last_note, host: 'fly',
  trades: [...st.trades.filter((t: any) => t.status === 'OPEN'), ...st.trades.filter((t: any) => t.status !== 'OPEN').slice(-150)],
  decisions: st.decisions.slice(0, 60), equity: st.equity.slice(-500) })

const clients = new Set<http.ServerResponse>()
let lastJson = JSON.stringify(slim())
function broadcast() { lastJson = JSON.stringify(slim()); for (const c of clients) c.write(`data: ${lastJson}\n\n`) }

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  const url = (req.url ?? '/').split('?')[0]
  if (url === '/events') {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
    res.write(`data: ${lastJson}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return
  }
  if (url === '/state') { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(lastJson); return }
  if (url === '/health') { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, cycle: st.cycle, cycle_ms: st.cycle_ms, clients: clients.size })); return }
  const m = url.match(/^\/paths\/(\d{4}-\d{2}-\d{2})$/)
  if (m && fs.existsSync(`${DIR}/paths-${m[1]}.jsonl`)) { res.writeHead(200, { ...cors, 'Content-Type': 'application/x-ndjson' }); fs.createReadStream(`${DIR}/paths-${m[1]}.jsonl`).pipe(res); return }
  res.writeHead(404, cors); res.end()
}).listen(PORT, () => console.log(`meme-live on :${PORT}`))
setInterval(() => { for (const c of clients) c.write(': ping\n\n') }, 15_000)

for (;;) {
  const t0 = Date.now()
  const note = await cycle(st, (day, lines) => fs.appendFileSync(`${DIR}/paths-${day}.jsonl`, lines.join('\n') + '\n'))
  st.cycle_ms = Date.now() - t0
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(st)); fs.renameSync(FILE + '.tmp', FILE)
  broadcast()
  if (note.entries || note.exits || st.last_error) console.log(JSON.stringify({ ...note, ms: st.cycle_ms, cash: st.cash.toFixed(2), err: st.last_error }))
  // back off when pump.fun rate-limits us, otherwise run again as soon as the minimum interval allows
  const wait = /\b429\b/.test(st.last_error ?? '') ? 10_000 : MIN_CYCLE_MS - (Date.now() - t0)
  if (wait > 0) await sleep(wait)
}
