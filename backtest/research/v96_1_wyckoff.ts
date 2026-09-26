// v96.1 intraday Wyckoff spring/upthrust test (owner request). Run: node --experimental-strip-types backtest/research/v96_1_wyckoff.ts 5m|15m
import * as fs from 'node:fs'
import { slipFor } from '/home/user/spacehub/shared/lab.ts'
type B = { t: number; o: number; h: number; l: number; c: number; v: number }
const load = (s: string, tf: string): B[] => { const p = `/home/user/spacehub/backtest/data/${s}-${tf}.csv`; if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter(l => l && l[0] >= '0' && l[0] <= '9').map(l => { const f = l.split(','); return { t: +f[0], o: +f[1], h: +f[2], l: +f[3], c: +f[4], v: +f[5] } }) }
const tf = process.argv[2] ?? '5m'
const coins = tf === '15m' ? fs.readdirSync('/home/user/spacehub/backtest/data').filter(f => f.endsWith('-15m.csv')).map(f => f.replace('-15m.csv', '')) : ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT']
type R = { t: number; net: number }
const res: Record<string, R[]> = {}
let t0 = Infinity, t1 = 0
for (const c of coins) {
  const b = load(c, tf); if (b.length < 1000) continue
  t0 = Math.min(t0, b[0].t); t1 = Math.max(t1, b[b.length - 1].t)
  const slip = slipFor(c.replace('1000', '')), n = b.length
  const atr: number[] = new Array(n).fill(NaN); let a = 0
  for (let i = 1; i < n; i++) { const tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); a = i < 15 ? (a * (i - 1) + tr) / i : a + (tr - a) / 14; atr[i] = a }
  const busy: Record<string, number> = {}
  for (const N of [48, 96]) for (let i = N + 20; i < n - 100; i++) {
    let hi = -Infinity, lo = Infinity, vs = 0
    for (let k = i - N; k < i; k++) { hi = Math.max(hi, b[k].h); lo = Math.min(lo, b[k].l); vs += b[k].v }
    const A = atr[i - 1], av = vs / N; if (!(A > 0)) continue
    const height = (hi - lo) / A; if (height > 12) continue   // a trading range, not a trend
    const x = b[i], vr = x.v / av
    for (const side of [1, -1] as const) {
      const spring = side > 0 ? x.l < lo && x.c > lo : x.h > hi && x.c < hi
      if (!spring) continue
      const ext = side > 0 ? x.l : x.h
      const vols: [string, boolean][] = [['anyVol', true], ['lowVol<1x', vr < 1], ['climax>=2x', vr >= 2]]
      for (const [vk, ok] of vols) if (ok) for (const tg of ['1.5R', 'range']) {
        const key = `N${N} ${vk} tgt ${tg}`
        if (i + 1 < (busy[key + c] ?? 0)) continue
        const j = i + 1, e = b[j].o * (1 + side * slip), stop = ext - side * 0.1 * A, r = side * (e - stop)
        if (!(r > e * 0.001)) continue
        const tgt = tg === '1.5R' ? e + side * 1.5 * r : side > 0 ? hi : lo
        if (side * (tgt - e) <= 0) continue
        let pnl = NaN, k = j
        for (; k < n && k < j + 96; k++) {
          const y = b[k]
          if (side * ((side > 0 ? y.l : y.h) - stop) <= 0) { const px = side * (y.o - stop) <= 0 ? y.o : stop; pnl = side * (px * (1 - side * slip) / e - 1) - 0.0005; break }
          if (side * ((side > 0 ? y.h : y.l) - tgt) > 0) { pnl = side * (tgt / e - 1) - 0.0002; break }
        }
        if (Number.isNaN(pnl)) { k = Math.min(n - 1, j + 95); pnl = side * (b[k].c * (1 - side * slip) / e - 1) - 0.0005 }
        const net = (pnl - 0.0005) * 100
        ;(res[key] ??= []).push({ t: b[j].t, net }); ;(res[key + (side > 0 ? ' LONG' : ' SHORT')] ??= []).push({ t: b[j].t, net }); busy[key + c] = k + 1
      }
    }
  }
}
const cut = t0 + (t1 - t0) * 0.7
const st = (a: R[]) => { const m = a.reduce((s, x) => s + x.net, 0) / (a.length || 1); const sd = Math.sqrt(a.reduce((s, x) => s + (x.net - m) ** 2, 0) / Math.max(1, a.length - 1)); return `${m.toFixed(3).padStart(7)}% n${String(a.length).padEnd(6)} WR ${(100 * a.filter(x => x.net > 0).length / (a.length || 1)).toFixed(0)}% t ${(m / (sd / Math.sqrt(a.length || 1))).toFixed(1)}` }
console.log(`Wyckoff spring/upthrust ${tf}, ${coins.length} coins, IS 70% | OOS 30%, taker 5bps/side + slip, target limit`)
for (const [k, a] of Object.entries(res).sort()) console.log(k.padEnd(34), 'IS', st(a.filter(x => x.t < cut)), ' | OOS', st(a.filter(x => x.t >= cut)))
