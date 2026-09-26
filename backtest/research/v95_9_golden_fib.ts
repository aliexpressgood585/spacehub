// "Golden" combo test (owner, 2026-09-26): Fibonacci golden-pocket pullback (0.618-0.65) after an impulse, inside a golden-cross
// trend (EMA50 > EMA200 for longs, death cross for shorts), + RSI and volume dry-up confirmations. 15m and 1h, pinned 40 coins.
// Signal on a CLOSED bar, entry at the next bar's open (no look-ahead). Stop just beyond the 0.786 level, target = back to the
// swing extreme (or the 1.272 extension). Stop-first intrabar, gaps fill at the open, taker 5 bps + slipFor per market fill,
// target is a limit (fee only), funding 0.01%/8h. IS first 70% / OOS last 30%, read once.
import * as fs from 'node:fs'
import { CRYPTO_40 } from '/home/user/spacehub/shared/strategy.ts'
import { slipFor } from '/home/user/spacehub/shared/lab.ts'
type B = { t: number; o: number; h: number; l: number; c: number; v: number }
const D = '/home/user/spacehub/backtest/data/'
const load = (s: string, tf: string): B[] | null => { const f = `${D}${s === 'PEPE' ? '1000PEPE' : s}-${tf}.csv`; if (!fs.existsSync(f)) return null
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const x = l.split(','); return { t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] } }) }
const ema = (a: number[], n: number) => { const k = 2 / (n + 1), o: number[] = []; let e = a[0]; for (const x of a) { e = x * k + e * (1 - k); o.push(e) } return o }
const rsi = (c: number[], n = 14) => { const o = Array(c.length).fill(50); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; const up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n } o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l) } return o }
const atrA = (b: B[], n = 14) => { const o: number[] = []; let a = b[0].h - b[0].l; for (let i = 0; i < b.length; i++) { const tr = i ? Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)) : b[i].h - b[i].l; a = i ? (a * (n - 1) + tr) / n : tr; o.push(a) } return o }
type Tr = { t: number; net: number }
function run(tf: string, barMs: number, maxHold: number) {
  const res: Record<string, Tr[]> = {}; let t0 = Infinity, t1 = 0
  for (const s of CRYPTO_40) {
    const b = load(s, tf); if (!b || b.length < 400) continue
    t0 = Math.min(t0, b[0].t); t1 = Math.max(t1, b[b.length - 1].t)
    const c = b.map((x) => x.c), e50 = ema(c, 50), e200 = ema(c, 200), R = rsi(c), A = atrA(b), slip = slipFor(s)
    const busy: Record<string, number> = {}
    const trade = (key: string, j: number, d: 1 | -1, stop: number, tgt: number) => {
      if (j >= b.length || j < (busy[key] ?? 0)) return
      const e = b[j].o * (1 + d * slip); if (d * (tgt - e) <= 0 || d * (e - stop) <= 0) return
      let px = NaN, mkt = true, k = j
      for (; k < b.length && k < j + maxHold; k++) {
        const x = b[k], adv = d > 0 ? x.l : x.h, fav = d > 0 ? x.h : x.l
        if (d * (adv - stop) <= 0) { px = d * (x.o - stop) <= 0 ? x.o : stop; break }
        if (d * (fav - tgt) > 0) { px = tgt; mkt = false; break }
      }
      if (!Number.isFinite(px)) { k = Math.min(b.length - 1, j + maxHold - 1); px = b[k].c }
      const exitPx = mkt ? px * (1 - d * slip) : px, hours = (k - j + 1) * barMs / 3.6e6
      const net = (d * (exitPx / e - 1) - 0.001 - 0.0001 * hours / 8 * d) * 100
      ;(res[key] ??= []).push({ t: b[j].t, net }); busy[key] = k + 1
    }
    for (let i = 230; i < b.length - 2; i++) {
      const a = A[i]; if (!(a > 0)) continue
      for (const d of [1, -1] as const) {
        // impulse inside the last 30 bars: lo then hi (long) / hi then lo (short), size >= 4 ATR
        let hi = -Infinity, lo = Infinity, ih = -1, il = -1
        for (let k = i - 30; k < i; k++) { if (b[k].h > hi) { hi = b[k].h; ih = k } if (b[k].l < lo) { lo = b[k].l; il = k } }
        const span = hi - lo; if (!(span >= 4 * a)) continue
        if (d > 0 ? !(il < ih) : !(ih < il)) continue
        const ext = d > 0 ? hi : lo, org = d > 0 ? lo : hi
        const f618 = ext - d * 0.618 * span, f65 = ext - d * 0.65 * span, f786 = ext - d * 0.786 * span
        const x = b[i], touch = d > 0 ? x.l <= f618 : x.h >= f618, held = d > 0 ? x.l > f786 : x.h < f786, reject = d * (x.c - f618) > 0
        if (!(touch && held && reject)) continue
        const stop = f786 - d * 0.2 * a, gc = d > 0 ? e50[i] > e200[i] : e50[i] < e200[i]
        const rsiOk = d > 0 ? R[i] < 50 : R[i] > 50
        const vPull = (b[i].v + b[i - 1].v + b[i - 2].v) / 3, pk = d > 0 ? ih : il, vImp = (b[pk].v + b[pk - 1].v + b[Math.max(0, pk - 2)].v) / 3, dry = vPull < vImp
        const tgtExt = ext + d * 0.272 * span
        trade('0 fib pocket only (control)', i + 1, d, stop, ext)
        if (gc) trade('1 fib + golden cross', i + 1, d, stop, ext)
        if (gc && rsiOk) trade('2 fib + cross + RSI', i + 1, d, stop, ext)
        if (gc && rsiOk && dry) trade('3 fib + cross + RSI + volume dry-up', i + 1, d, stop, ext)
        if (gc && rsiOk && dry) trade('4 = 3, target 1.272 extension', i + 1, d, stop, tgtExt)
        void f65; void org
      }
    }
  }
  const cut = t0 + (t1 - t0) * 0.7
  const daily = (a: Tr[]) => { const m = new Map<number, number>(); for (const x of a) { const k = Math.floor(x.t / 864e5); m.set(k, (m.get(k) ?? 0) + x.net) } const v = [...m.values()], n = v.length; if (n < 3) return 0; const mu = v.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1)); return mu / sd * Math.sqrt(n) }
  const st = (a: Tr[]) => { if (a.length < 5) return `n ${a.length}`; const n = a.length, s = a.reduce((x, y) => x + y.net, 0), w = a.filter((x) => x.net > 0), gw = w.reduce((x, y) => x + y.net, 0), gl = -a.filter((x) => x.net <= 0).reduce((x, y) => x + y.net, 0)
    return `n ${String(n).padStart(5)} WR ${(w.length / n * 100).toFixed(1).padStart(4)}% net ${(s / n).toFixed(3).padStart(7)}% PF ${(gw / gl).toFixed(2)} t(daily) ${daily(a).toFixed(2)}` }
  console.log(`\n[${tf}] ${new Date(t0).toISOString().slice(0, 10)}..${new Date(t1).toISOString().slice(0, 10)} · OOS from ${new Date(cut).toISOString().slice(0, 10)}`)
  for (const k of Object.keys(res).sort()) console.log(`  IS  ${k.padEnd(38)} ${st(res[k].filter((x) => x.t < cut))}`)
  for (const k of Object.keys(res).sort()) console.log(`  OOS ${k.padEnd(38)} ${st(res[k].filter((x) => x.t >= cut))}`)
}
run('15m', 9e5, 96)
run('1h', 3.6e6, 72)
