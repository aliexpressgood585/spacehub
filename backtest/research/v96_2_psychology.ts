// v96.2 trading psychology on top of the Wyckoff spring/upthrust (5m, 10 coins, 36m). Two kinds, both codeable:
//  MARKET psychology (the crowd): trapped traders (spring bar dominated by aggressive sellers that failed), crowd funding
//  (longs paying = crowded long -> fade), capitulation volume.  TRADER psychology (discipline): no revenge trade on a coin
//  after a loss, pause after a losing streak, stop for the day after N losses, smaller size after losses.
import * as fs from 'node:fs'
import { slipFor } from '/home/user/spacehub/shared/lab.ts'
type B = { t: number; o: number; h: number; l: number; c: number; v: number; tb: number }
const D = '/home/user/spacehub/backtest/data/'
const load = (s: string): B[] => fs.readFileSync(`${D}${s}-5m.csv`, 'utf8').split('\n').filter(l => l && l[0] >= '0' && l[0] <= '9').map(l => { const f = l.split(','); return { t: +f[0], o: +f[1], h: +f[2], l: +f[3], c: +f[4], v: +f[5], tb: +f[9] } })
const fund = (s: string): [number, number][] => { const p = `${D}${s}-funding.csv`; if (!fs.existsSync(p)) return []; return fs.readFileSync(p, 'utf8').split('\n').filter(l => l && l[0] >= '0' && l[0] <= '9').map(l => { const f = l.split(','); return [+f[0], +f[2]] as [number, number] }) }
const coins = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT']
type T = { t: number; te: number; c: string; net: number; trapped: number; fr: number; vr: number }
const all: T[] = []
let t0 = Infinity, t1 = 0
for (const c of coins) {
  const b = load(c), F = fund(c), slip = slipFor(c), n = b.length; t0 = Math.min(t0, b[0].t); t1 = Math.max(t1, b[n - 1].t)
  const atr: number[] = new Array(n).fill(NaN); let a = 0
  for (let i = 1; i < n; i++) { const tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); a = i < 15 ? (a * (i - 1) + tr) / i : a + (tr - a) / 14; atr[i] = a }
  let fi = 0, busy = 0
  for (let i = 70; i < n - 100; i++) {
    while (fi + 1 < F.length && F[fi + 1][0] <= b[i].t) fi++
    const fr = F.length && F[fi][0] <= b[i].t ? F[fi][1] : NaN
    if (i < busy) continue
    let hi = -Infinity, lo = Infinity, vs = 0
    for (let k = i - 48; k < i; k++) { hi = Math.max(hi, b[k].h); lo = Math.min(lo, b[k].l); vs += b[k].v }
    const A = atr[i - 1]; if (!(A > 0) || (hi - lo) / A > 12) continue
    const x = b[i], vr = x.v / (vs / 48); if (!(vr < 1)) continue
    const side = x.l < lo && x.c > lo ? 1 : x.h > hi && x.c < hi ? -1 : 0; if (!side) continue
    const ext = side > 0 ? x.l : x.h, j = i + 1, e = b[j].o * (1 + side * slip), stop = ext - side * 0.1 * A
    let r = side * (e - stop); r = Math.max(r, e * 0.003); const st = e - side * r, tgt = e + side * 1.5 * r
    let pnl = NaN, k = j
    for (; k < n && k < j + 96; k++) { const y = b[k]
      if (side * ((side > 0 ? y.l : y.h) - st) <= 0) { const px = side * (y.o - st) <= 0 ? y.o : st; pnl = side * (px * (1 - side * slip) / e - 1) - 0.0005; break }
      if (side * ((side > 0 ? y.h : y.l) - tgt) > 0) { pnl = side * (tgt / e - 1) - 0.0002; break } }
    if (Number.isNaN(pnl)) { k = Math.min(n - 1, j + 95); pnl = side * (b[k].c * (1 - side * slip) / e - 1) - 0.0005 }
    // trapped: share of the spring bar's volume that was aggressive IN THE BREAKOUT direction (sellers on a spring)
    const sellShare = 1 - x.tb / x.v, trapped = side > 0 ? sellShare : 1 - sellShare
    all.push({ t: b[j].t, te: b[k].t, c, net: (pnl - 0.0005) * 100, trapped, fr: side * fr, vr }); busy = k + 1
  }
}
all.sort((a, b) => a.t - b.t)
const cut = t0 + (t1 - t0) * 0.7
// discipline: applied in time order across the whole book, using only trades already CLOSED before the new entry
function discipline(src: T[], o: { coinCoolMin?: number; streak?: number; pauseMin?: number; dayLosses?: number; halfAfter?: number }) {
  const out: (T & { w: number })[] = [], lastLoss: Record<string, number> = {}
  let pauseUntil = 0
  for (const x of src) {
    const done = out.filter(y => y.te <= x.t)
    const day = Math.floor(x.t / 86400e3)
    if (o.coinCoolMin && lastLoss[x.c] && x.t - lastLoss[x.c] < o.coinCoolMin * 60e3) continue
    if (x.t < pauseUntil) continue
    let streak = 0; for (let q = done.length - 1; q >= 0 && done[q].net < 0; q--) streak++
    if (o.streak && streak >= o.streak) { const lastEnd = done[done.length - 1].te; if (x.t < lastEnd + (o.pauseMin ?? 120) * 60e3) { pauseUntil = lastEnd + (o.pauseMin ?? 120) * 60e3; continue } }
    if (o.dayLosses && done.filter(y => Math.floor(y.te / 86400e3) === day && y.net < 0).length >= o.dayLosses) continue
    const w = o.halfAfter && streak >= o.halfAfter ? 0.5 : 1
    out.push({ ...x, w }); if (x.net < 0) lastLoss[x.c] = x.te
  }
  return out
}
const st = (a: { net: number; w?: number }[]) => { const v = a.map(x => x.net * (x.w ?? 1)), m = v.reduce((s, x) => s + x, 0) / (v.length || 1), sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1))
  return `${m.toFixed(3).padStart(7)}%/tr  n ${String(v.length).padEnd(6)} sum ${v.reduce((s, x) => s + x, 0).toFixed(0).padStart(6)}%  t ${(m / (sd / Math.sqrt(v.length || 1))).toFixed(1)}` }
const row = (k: string, a: any[]) => console.log(k.padEnd(46), 'IS', st(a.filter(x => x.t < cut)), ' | OOS', st(a.filter(x => x.t >= cut)))
console.log('Wyckoff spring/upthrust 5m (48-bar range, vol<1x, 1.5R) + psychology. 10 coins, 36m, IS 70% / OOS 30%, full costs. sum = sum of %/trade at 1x')
row('A Wyckoff alone (live rule)', all)
console.log('-- market psychology (the crowd) --')
row('B trapped: >=60% aggressive in the failed dir', all.filter(x => x.trapped >= 0.6))
row('C trapped: >=55%', all.filter(x => x.trapped >= 0.55))
row('D crowd on the other side: funding pays us >0', all.filter(x => x.fr < 0))
row('E crowded against us (funding with us)', all.filter(x => x.fr > 0))
row('F trapped>=55% + funding pays us', all.filter(x => x.trapped >= 0.55 && x.fr < 0))
row('G very quiet spring vol<0.5x', all.filter(x => x.vr < 0.5))
console.log('-- trader psychology (discipline), in time order --')
row('H no revenge: 60 min per coin after a loss', discipline(all, { coinCoolMin: 60 }))
row('I 3 losses in a row -> 2h pause', discipline(all, { streak: 3, pauseMin: 120 }))
row('J stop for the day after 3 losses', discipline(all, { dayLosses: 3 }))
row('K half size after 2 losses in a row', discipline(all, { halfAfter: 2 }))
row('L H+I+J+K all', discipline(all, { coinCoolMin: 60, streak: 3, pauseMin: 120, dayLosses: 3, halfAfter: 2 }))
row('M best crowd filter (C) + all discipline', discipline(all.filter(x => x.trapped >= 0.55), { coinCoolMin: 60, streak: 3, pauseMin: 120, dayLosses: 3, halfAfter: 2 }))
