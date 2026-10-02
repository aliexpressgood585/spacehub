// v118bt (2026-10-02) — owner: "test several oscillators together, like Fibonacci, EMA, RSI and volume, for short ranges".
// PRE-REGISTERED before reading results. Every coin with 1m data in backtest/data/m1 (the v116 set, ~94 liquid perps),
// 2025-09 .. 2026-08, aggregated to 5m and 15m bars. Signal on the closed bar i, entry at bar i+1 open.
// LONG conditions (SHORT = mirror):
//   EMA  ema20 > ema50 and close > ema50                              (trend up)
//   FIB  last 48 bars made an up-swing (low before high) of >= 3 ATR, and close sits in the 50%-61.8% retracement zone
//   RSI  RSI14 between 35 and 55 and rising (momentum turning back up out of the pullback)
//   VOL  bar volume >= 1.5 x its 20-bar average AND the bar closed green (buyers returning)
// Combos: ALL4, and each 3-of-4 (dropping one), and EMA+RSI only -> 6. Exits: time 6 / 12 / 24 bars, or bracket
// stop 1.5 ATR / target 2.5 ATR within 48 bars (stop first). One open trade per combo x tf x exit x coin.
// Costs: taker 5 + slip 3 bps per side (16 round trip). IS first 70% / OOS last 30%; t on daily sums.
// PASS = IS net>0 & OOS net>0 & OOS t>=2. 6 x 2 x 4 = 48 rows -> luck ~1.1.
import fs from 'node:fs'
const DIR = '/home/user/spacehub/backtest/data/m1'
const coins = fs.readdirSync(DIR).filter(f => f.endsWith('-1m.csv')).map(f => f.replace('-1m.csv', '')).filter(c => fs.statSync(`${DIR}/${c}-1m.csv`).size > 0)
const RT = 0.0016, T0 = Date.UTC(2025, 8, 1), T1 = Date.UTC(2026, 8, 1), CUT = T0 + 0.7 * (T1 - T0)
const COMBOS = { ALL4: ['EMA', 'FIB', 'RSI', 'VOL'], 'no FIB': ['EMA', 'RSI', 'VOL'], 'no VOL': ['EMA', 'FIB', 'RSI'], 'no RSI': ['EMA', 'FIB', 'VOL'], 'no EMA': ['FIB', 'RSI', 'VOL'], 'EMA+RSI': ['EMA', 'RSI'] }
const EXITS = ['time6', 'time12', 'time24', 'bracket']
const agg = {}  // key -> Map(day -> [n, gross, net])
const add = (key, t, gross) => { const m = (agg[key] ??= new Map()), d = Math.floor(t / 86400000), a = m.get(d) ?? [0, 0, 0]; a[0]++; a[1] += gross; a[2] += gross - RT; m.set(d, a) }
function bars(c, mins) {
  const out = []; let cur = null
  for (const s of fs.readFileSync(`${DIR}/${c}-1m.csv`, 'utf8').split('\n')) {
    if (!s) continue; const f = s.split(','), t = +f[0], b = t - (t % (mins * 60000))
    if (!cur || cur.t !== b) { if (cur) out.push(cur); cur = { t: b, o: +f[1], h: +f[2], l: +f[3], c: +f[4], v: +f[5] } }
    else { cur.h = Math.max(cur.h, +f[2]); cur.l = Math.min(cur.l, +f[3]); cur.c = +f[4]; cur.v += +f[5] }
  }
  if (cur) out.push(cur); return out
}
for (const c of coins) for (const tf of [5, 15]) {
  const B = bars(c, tf), n = B.length; if (n < 2000) continue
  const ema = (p) => { const k = 2 / (p + 1), e = new Float64Array(n); e[0] = B[0].c; for (let i = 1; i < n; i++) e[i] = B[i].c * k + e[i - 1] * (1 - k); return e }
  const e20 = ema(20), e50 = ema(50), atr = new Float64Array(n), rsi = new Float64Array(n), av = new Float64Array(n)
  let ag = 0, al = 0, vs = 0
  for (let i = 1; i < n; i++) {
    const tr = Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); atr[i] = i < 15 ? tr : (atr[i - 1] * 13 + tr) / 14
    const ch = B[i].c - B[i - 1].c; ag = (ag * 13 + Math.max(ch, 0)) / 14; al = (al * 13 + Math.max(-ch, 0)) / 14; rsi[i] = al > 0 ? 100 - 100 / (1 + ag / al) : 100
    vs += B[i].v; if (i > 20) vs -= B[i - 20].v; av[i] = vs / Math.min(i, 20)
  }
  const busy = {}
  for (let i = 60; i < n - 50; i++) {
    const b = B[i], a = atr[i]; if (!(a > 0)) continue
    for (const side of [1, -1]) {
      const cond = {}
      cond.EMA = side > 0 ? e20[i] > e50[i] && b.c > e50[i] : e20[i] < e50[i] && b.c < e50[i]
      let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0
      for (let k = i - 48; k <= i; k++) { if (B[k].h > hi) { hi = B[k].h; hiI = k } if (B[k].l < lo) { lo = B[k].l; loI = k } }
      const h = hi - lo
      cond.FIB = h >= 3 * a && (side > 0 ? loI < hiI && b.c <= hi - 0.5 * h && b.c >= hi - 0.618 * h : hiI < loI && b.c >= lo + 0.5 * h && b.c <= lo + 0.618 * h)
      cond.RSI = side > 0 ? rsi[i] >= 35 && rsi[i] <= 55 && rsi[i] > rsi[i - 1] : rsi[i] >= 45 && rsi[i] <= 65 && rsi[i] < rsi[i - 1]
      cond.VOL = b.v >= 1.5 * av[i] && (side > 0 ? b.c > b.o : b.c < b.o)
      for (const [name, need] of Object.entries(COMBOS)) {
        if (!need.every(x => cond[x])) continue
        for (const ex of EXITS) {
          const key = `${name.padEnd(8)} | ${tf}m | ${ex}`, bk = `${key}|${c}`
          if (i < (busy[bk] ?? 0)) continue
          const j = i + 1, e = B[j].o; let px, k
          if (ex === 'bracket') {
            const stop = e - side * 1.5 * a, tgt = e + side * 2.5 * a; px = null
            for (k = j; k < j + 48 && k < n; k++) {
              const adv = side > 0 ? B[k].l : B[k].h, fav = side > 0 ? B[k].h : B[k].l
              if (side * (adv - stop) <= 0) { px = side * (B[k].o - stop) <= 0 ? B[k].o : stop; break }
              if (side * (fav - tgt) >= 0) { px = tgt; break }
            }
            if (px === null) { k = Math.min(n - 1, j + 47); px = B[k].c }
          } else { k = Math.min(n - 1, i + +ex.slice(4)); px = B[k].c }
          if (B[j].t < T0) continue
          add(key, B[j].t, side * (px / e - 1)); busy[bk] = k + 1
        }
      }
    }
  }
}
const sm = days => {
  if (!days.length) return { n: 0, g: 0, net: 0, t: 0 }
  const v = days.map(x => x[2]), n = days.reduce((s, x) => s + x[0], 0), mu = v.reduce((s, x) => s + x, 0) / v.length
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, v.length - 1))
  return { n, g: days.reduce((s, x) => s + x[1], 0) / n * 1e4, net: days.reduce((s, x) => s + x[2], 0) / n * 1e4, t: sd > 0 ? mu / sd * Math.sqrt(v.length) : 0 }
}
const out = [`v118bt — Fibonacci + EMA + RSI + volume combined, ${coins.length} coins, 5m/15m, 2025-09..2026-08, 16 bps round trip, IS 70 / OOS 30`, '',
  'combo    | tf | exit'.padEnd(28) + '  IS n   gross    net     t |  OOS n   gross    net     t  verdict']
let pass = 0
for (const k of Object.keys(agg).sort()) {
  const e = [...agg[k].entries()], is = sm(e.filter(([d]) => d * 86400000 < CUT).map(([, x]) => x)), oo = sm(e.filter(([d]) => d * 86400000 >= CUT).map(([, x]) => x))
  const ok = is.net > 0 && oo.net > 0 && oo.t >= 2; if (ok) pass++
  out.push(k.padEnd(28) + `${String(is.n).padStart(6)} ${is.g.toFixed(1).padStart(7)} ${is.net.toFixed(1).padStart(6)} ${is.t.toFixed(1).padStart(5)} | ${String(oo.n).padStart(6)} ${oo.g.toFixed(1).padStart(7)} ${oo.net.toFixed(1).padStart(6)} ${oo.t.toFixed(1).padStart(5)}  ${ok ? 'PASS' : '-'}`)
}
out.push('', `PASS: ${pass} of ${Object.keys(agg).length} (luck alone ~${(Object.keys(agg).length * 0.023).toFixed(1)})`)
const txt = out.join('\n'); console.log(txt); fs.writeFileSync('/home/user/spacehub/status/osc-combo-v118.txt', txt + '\n')
