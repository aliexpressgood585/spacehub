// v100d — better ENTRIES for the live 4h PRO rule (owner 2026-10-03: "low profit, find correct entry points and increase").
// Exits FIXED at the live params (PRO_LIVE: N20, stop 3 ATR, target 3R, time stop 15 bars, BE/trail 1.5R, max 60 bars);
// only the entry changes. Same data, costs and book as v100c (CRYPTO_40, 1h archive -> 4h/1d, 2020-09..2026-08, taker 5
// bps + slip 3/5 bps per side, real funding, <= 3 open, one per coin). Pre-registered before reading:
//   E0 base          next 4h open after the signal bar (what runs live)
//   E1 retest        limit at the broken N-bar level for the next 3 bars, maker 2 bps, no slip; unfilled = no trade
//   E2 dip 0.5 ATR   limit 0.5 ATR better than the next open, next 3 bars, maker; unfilled = no trade
//   E3 confirm       the next bar must also close beyond the broken level; enter at the open after it
//   E4 btc aligned   BTC daily close on the trade's side of its daily EMA50 (last completed day)
//   E5 strong close  the signal bar closes in the outer 30% of its own range
//   E6 volume 2.5x   bar volume >= 2.5x the 20-bar average (rule: 1.5x)
//   E7 not extended  close no more than 1 ATR beyond the broken level (no chasing)
// Choose on the first 80% by mean net R per trade (n >= 150) and ONLY if it beats E0 on development; read the last 20%
// ONCE for the chosen variant and for E0. 8 looks: a single winner at t~1 is what luck produces.
// Run: node --max-old-space-size=8192 --experimental-strip-types backtest/research/v100d_pro_entries.ts > status/pro-entries-v100d.txt
import fs from 'node:fs'
import { PRO, PRO_LIVE, TF, aggregate, features, proCheck, openPos, stepBar, proSize, proSlip, ema, type Bar } from '../../shared/pro.ts'
import { CRYPTO_40 } from '../../shared/strategy.ts'
const DATA = new URL('../data/', import.meta.url).pathname, tf = TF['4h'], P = { ...PRO_LIVE }, RISK = 0.005, MAKER = 0.0002, MS4 = 240 * 60_000
const file = (c: string) => (c === 'PEPE' ? '1000PEPE' : c)
const load = (s: string): Bar[] => fs.readFileSync(`${DATA}${file(s)}-1h.csv`, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5] } })
const loadF = (s: string) => { const p = `${DATA}${file(s)}-funding.csv`; return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], r: +f[2] } }).sort((a, b) => a.t - b.t) : [] }
const fsum = (F: { t: number; r: number }[], a: number, b: number) => { let s = 0; for (const x of F) { if (x.t > b) break; if (x.t > a) s += x.r } return s }
// BTC daily trend at a moment T: side of the last COMPLETED day's close vs its EMA50
const btcD = aggregate(load('BTC'), 1440, 60), btcE = ema(btcD.map((x) => x.close), 50)
const btcSide = (T: number) => { let lo = 0, hi = btcD.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (btcD[m].t + 864e5 <= T) { k = m; lo = m + 1 } else hi = m - 1 }
  return k >= 0 && btcE[k] > 0 ? (btcD[k].close > btcE[k] ? 1 : -1) : 0 }
const V = ['E0 base', 'E1 retest', 'E2 dip 0.5 ATR', 'E3 confirm', 'E4 btc aligned', 'E5 strong close', 'E6 volume 2.5x', 'E7 not extended']
interface Tr { coin: string; t0: number; t1: number; gross: number; net: number; rFrac: number; why: string }
const trades = V.map(() => [] as Tr[])
let span0 = Infinity, span1 = 0, sigN = 0
// run the live exit machine from bar j (the fill bar) with entry px; sameBarStop: the fill happened inside bar j
function run(b4: Bar[], j: number, dir: 1 | -1, fill: number, atr: number, sameBar: boolean) {
  const s = openPos(dir, fill, atr, P)
  if (sameBar) { const x = b4[j]; if ((dir > 0 ? x.low : x.high) * dir <= s.stop * dir) return { s, ex: { px: s.stop, why: 'STOP' }, j: j + 1 } }
  let ex = null, k = sameBar ? j + 1 : j
  for (; k < b4.length && !ex; k++) ex = stepBar(s, b4[k], P)
  return { s, ex, j: k }
}
for (const coin of CRYPTO_40) {
  const h1 = load(coin), b4 = aggregate(h1, 240, 60), d1 = aggregate(h1, 1440, 60), F = features(b4, d1, d1, tf), fund = loadF(coin), slip = proSlip(coin), N = P.breakoutN
  span0 = Math.min(span0, b4[0].t); span1 = Math.max(span1, b4[b4.length - 1].t)
  for (let i = 60; i < b4.length - 5; i++) {
    const sg = proCheck(b4, F, i, N, tf); if (!sg.dir) continue
    sigN++
    const dir = sg.dir, x = b4[i], atr = F.atr1[i], lvl = sg.checks.find((c) => c.k === 'breakout')!.v
    const push = (v: number, j: number, fill: number, feeIn: number, slipIn: number, sameBar: boolean) => {
      const entry = fill * (1 + dir * slipIn), { s, ex, j: k } = run(b4, j, dir, entry, atr, sameBar); if (!ex) return
      const t1 = b4[k - 1].t + MS4, xp = ex.px * (1 - dir * slip)
      trades[v].push({ coin, t0: b4[j].t, t1, gross: dir * (ex.px / fill - 1), net: dir * (xp / entry - 1) - feeIn - PRO.fee - dir * fsum(fund, b4[j].t, t1), rFrac: s.r / entry, why: ex.why })
    }
    const e0 = b4[i + 1].open
    push(0, i + 1, e0, PRO.fee, slip, false)
    // limit orders resting for 3 bars from the next open: a bar that opens through the limit fills at its open
    const limit = (v: number, L: number) => { for (let j = i + 1; j <= i + 3; j++) { const b = b4[j]
      if (dir * (b.open - L) <= 0) return push(v, j, b.open, MAKER, 0, true)
      if ((dir > 0 ? b.low : b.high) * dir <= L * dir) return push(v, j, L, MAKER, 0, true) } }
    limit(1, lvl); limit(2, e0 - dir * 0.5 * atr)
    if (dir * (b4[i + 1].close - lvl) > 0) push(3, i + 2, b4[i + 2].open, PRO.fee, slip, false)
    if (btcSide(x.t + MS4) === dir) push(4, i + 1, e0, PRO.fee, slip, false)
    const pos = x.high > x.low ? (x.close - x.low) / (x.high - x.low) : 0.5
    if ((dir > 0 ? pos : 1 - pos) >= 0.7) push(5, i + 1, e0, PRO.fee, slip, false)
    if (x.vol >= 2.5 * F.vAvg[i]) push(6, i + 1, e0, PRO.fee, slip, false)
    if (dir * (x.close - lvl) <= atr) push(7, i + 1, e0, PRO.fee, slip, false)
  }
  console.error(coin, b4.length)
}
for (const a of trades) a.sort((x, y) => x.t0 - y.t0)
function book(ts: Tr[], a: number, b: number) {
  let eq = 5000, peak = 5000, dd = 0, n = 0, w = 0, sR = 0, sG = 0; const open: { coin: string; t1: number; usd: number }[] = [], days = new Map<number, number>()
  const settle = (u: number) => { open.sort((x, y) => x.t1 - y.t1); while (open.length && open[0].t1 <= u) { const o = open.shift()!; eq += o.usd; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); const d = Math.floor(o.t1 / 864e5); days.set(d, (days.get(d) ?? 0) + o.usd) } }
  for (const t of ts) { if (t.t0 < a || t.t0 >= b) continue; settle(t.t0)
    if (open.length >= PRO.maxOpen || open.some((o) => o.coin === t.coin)) continue
    const risk = eq * RISK, notional = proSize(eq, eq, 1, t.rFrac, RISK), usd = t.net * notional
    open.push({ coin: t.coin, t1: t.t1, usd }); n++; if (usd > 0) w++; sR += usd / risk; sG += t.gross * notional / risk }
  settle(Infinity)
  const dv = [...days.values()], m = dv.reduce((s, x) => s + x, 0) / Math.max(1, dv.length), sd = Math.sqrt(dv.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, dv.length))
  return { n, wr: n ? w / n : 0, R: n ? sR / n : 0, G: n ? sG / n : 0, ret: eq / 5000 - 1, dd, t: sd > 0 ? m / sd * Math.sqrt(dv.length) : 0 }
}
const hold = span0 + 0.8 * (span1 - span0), f = (x: number, d = 3) => x.toFixed(d), out: string[] = []
const pr = (l: string, d: ReturnType<typeof book>) => out.push(`${l.padEnd(22)} ${String(d.n).padStart(6)} ${(f(d.wr * 100, 1) + '%').padStart(6)} ${f(d.G).padStart(7)} ${f(d.R).padStart(7)} ${(f(d.ret * 100, 1) + '%').padStart(8)} ${(f(d.dd * 100, 1) + '%').padStart(6)} ${f(d.t, 2).padStart(6)}`)
const H = `${'variant'.padEnd(22)} ${'n'.padStart(6)} ${'WR'.padStart(6)} ${'grossR'.padStart(7)} ${'netR'.padStart(7)} ${'return'.padStart(8)} ${'maxDD'.padStart(6)} ${'t'.padStart(6)}`
out.push(`v100d — entry variants for the live 4h PRO rule (exits fixed: N20 k3 T3 ts15 BE/trail 1.5R), CRYPTO_40, ${new Date(span0).toISOString().slice(0, 10)} .. ${new Date(span1).toISOString().slice(0, 10)}, holdout from ${new Date(hold).toISOString().slice(0, 10)}`)
out.push(`signals: ${sigN}; taker 5 bps + slip 3/5 bps per side, limit entries maker 2 bps no slip, real funding; ${RISK * 100}% risk (results in R do not depend on it), <= 3 open, one per coin`)
out.push(''); out.push('DEVELOPMENT (first 80%)'); out.push(H)
const dev = V.map((v, k) => ({ v, k, d: book(trades[k], span0, hold) }))
for (const x of dev) pr(x.v, x.d)
const ok = dev.filter((x) => x.k > 0 && x.d.n >= 150 && x.d.R > dev[0].d.R).sort((a, b) => b.d.R - a.d.R)
out.push('')
if (!ok.length) out.push('CHOSEN: none beats E0 on development -> keep the live entry')
else out.push(`CHOSEN on development: ${ok[0].v}`)
out.push(''); out.push('HOLDOUT (read once)'); out.push(H)
pr('E0 base', book(trades[0], hold, span1 + 1)); if (ok.length) pr(ok[0].v, book(trades[ok[0].k], hold, span1 + 1))
out.push(''); out.push('ALL variants on the holdout (INFO ONLY, not used to choose — reading them is 8 looks)'); out.push(H)
for (let k = 0; k < V.length; k++) pr(V[k], book(trades[k], hold, span1 + 1))
console.log(out.join('\n'))
