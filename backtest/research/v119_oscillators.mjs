// v119bt (2026-10-02) — owner: "test simple oscillators together, or one oscillator from all the existing ones".
// PRE-REGISTERED before reading results. Every coin with 1m data in backtest/data/m1 (~94 liquid perps), 2025-09..2026-08,
// aggregated to 5m / 15m / 1h / 4h. 14 classic indicators, each read as an EVENT (it just fired) and a STATE (it is in zone):
//   RSI14 70/30 · Stoch%K(14,3) 80/20 · Williams%R14 -20/-80 · CCI20 +-100 · MFI14 80/20 · UltimateOsc(7,14,28) 70/30 ·
//   Bollinger(20,2) close outside the band · Keltner(EMA20 +- 2 ATR) close outside · Donchian20 close beyond the range ·
//   MACD(12,26,9) histogram sign flip · EMA9/21 cross · close crosses EMA50 · DI+/DI- cross with ADX14 > 20 ·
//   OBV crosses its EMA20.
// Every reading has a bullish sign s (+1 = overbought / up-break / bullish cross). FOLLOW trades s, FADE trades -s.
// Singles: each indicator's event, FOLLOW and FADE, hold 6 or 24 bars. Pairs: indicator A fires AND indicator B is already
// in the same-direction state, every unordered pair, FOLLOW and FADE, hold 12 bars.
// Entry at the next bar's open, exit at the close of bar i+H. Costs taker 5 + slip 3 bps per side (16 round trip).
// One trade per rule x coin at a time. IS = first 70% / OOS = last 30%; t on daily sums.
// PASS = IS net > 0 AND OOS net > 0 AND OOS t >= 2. The number of rows and the luck-alone count are printed.
import fs from 'node:fs'
const DIR = '/home/user/spacehub/backtest/data/m1'
const coins = fs.readdirSync(DIR).filter(f => f.endsWith('-1m.csv')).map(f => f.replace('-1m.csv', '')).filter(c => fs.statSync(`${DIR}/${c}-1m.csv`).size > 0)
const RT = 0.0016, T0 = Date.UTC(2025, 8, 1), T1 = Date.UTC(2026, 8, 1), CUT = T0 + 0.7 * (T1 - T0)
const TFS = [5, 15, 60, 240]
const NAMES = ['RSI', 'STOCH', 'WILLR', 'CCI', 'MFI', 'ULT', 'BB', 'KELT', 'DON', 'MACD', 'EMAX', 'EMA50', 'DMI', 'OBV']
const agg = {}
const add = (key, t, gross) => { const m = (agg[key] ??= new Map()), d = Math.floor(t / 86400000), a = m.get(d) ?? [0, 0, 0]; a[0]++; a[1] += gross; a[2] += gross - RT; m.set(d, a) }

function load1m(c) {
  const L = fs.readFileSync(`${DIR}/${c}-1m.csv`, 'utf8').split('\n'), n = L.length
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), cl = new Float64Array(n), v = new Float64Array(n)
  let k = 0
  for (const s of L) { if (!s) continue; const f = s.split(','); t[k] = +f[0]; o[k] = +f[1]; h[k] = +f[2]; l[k] = +f[3]; cl[k] = +f[4]; v[k] = +f[5]; k++ }
  return { n: k, t, o, h, l, c: cl, v }
}
function aggregate(m, mins) {
  const ms = mins * 60000, T = [], O = [], H = [], L = [], C = [], V = []
  let cur = -1
  for (let i = 0; i < m.n; i++) {
    const b = m.t[i] - (m.t[i] % ms)
    if (b !== cur) { cur = b; T.push(b); O.push(m.o[i]); H.push(m.h[i]); L.push(m.l[i]); C.push(m.c[i]); V.push(m.v[i]) }
    else { const j = T.length - 1; if (m.h[i] > H[j]) H[j] = m.h[i]; if (m.l[i] < L[j]) L[j] = m.l[i]; C[j] = m.c[i]; V[j] += m.v[i] }
  }
  return { n: T.length, t: T, o: O, h: H, l: L, c: C, v: V }
}
const emaArr = (x, p) => { const k = 2 / (p + 1), e = new Float64Array(x.length); e[0] = x[0]; for (let i = 1; i < x.length; i++) e[i] = x[i] * k + e[i - 1] * (1 - k); return e }
const smaWin = (x, i, p) => { let s = 0; for (let k = i - p + 1; k <= i; k++) s += x[k]; return s / p }

// returns { ev: Int8Array[14], st: Int8Array[14] }  (ev = fired on this bar, st = in zone / sign now)
function indicators(B) {
  const { n, h, l, c, v } = B
  const ev = NAMES.map(() => new Int8Array(n)), st = NAMES.map(() => new Int8Array(n))
  // zone helper: value series x, hi/lo thresholds -> state +1 above hi, -1 below lo; event on entering
  const zone = (idx, x, hi, lo, from) => { for (let i = from; i < n; i++) { const s = x[i] > hi ? 1 : x[i] < lo ? -1 : 0; st[idx][i] = s; const p = x[i - 1] > hi ? 1 : x[i - 1] < lo ? -1 : 0; if (s !== 0 && s !== p) ev[idx][i] = s } }
  const cross = (idx, a, b, from, gate) => { for (let i = from; i < n; i++) { const s = a[i] > b[i] ? 1 : -1; st[idx][i] = gate && !gate(i) ? 0 : s; const p = a[i - 1] > b[i - 1] ? 1 : -1; if (s !== p && (!gate || gate(i))) ev[idx][i] = s } }
  // RSI14 (Wilder)
  const rsi = new Float64Array(n); { let ag = 0, al = 0; for (let i = 1; i < n; i++) { const ch = c[i] - c[i - 1]; ag = (ag * 13 + Math.max(ch, 0)) / 14; al = (al * 13 + Math.max(-ch, 0)) / 14; rsi[i] = al > 0 ? 100 - 100 / (1 + ag / al) : 100 } }
  zone(0, rsi, 70, 30, 30)
  // Stochastic %K(14) smoothed 3, Williams %R14 (raw)
  const kraw = new Float64Array(n), wr = new Float64Array(n)
  for (let i = 13; i < n; i++) { let hh = -Infinity, ll = Infinity; for (let k = i - 13; k <= i; k++) { if (h[k] > hh) hh = h[k]; if (l[k] < ll) ll = l[k] } kraw[i] = hh > ll ? 100 * (c[i] - ll) / (hh - ll) : 50; wr[i] = kraw[i] - 100 }
  const kst = new Float64Array(n); for (let i = 15; i < n; i++) kst[i] = (kraw[i] + kraw[i - 1] + kraw[i - 2]) / 3
  zone(1, kst, 80, 20, 30); zone(2, wr, -20, -80, 30)
  // CCI20
  const tp = new Float64Array(n); for (let i = 0; i < n; i++) tp[i] = (h[i] + l[i] + c[i]) / 3
  const cci = new Float64Array(n); for (let i = 19; i < n; i++) { const m = smaWin(tp, i, 20); let md = 0; for (let k = i - 19; k <= i; k++) md += Math.abs(tp[k] - m); md /= 20; cci[i] = md > 0 ? (tp[i] - m) / (0.015 * md) : 0 }
  zone(3, cci, 100, -100, 30)
  // MFI14
  const mfi = new Float64Array(n); for (let i = 15; i < n; i++) { let pos = 0, neg = 0; for (let k = i - 13; k <= i; k++) { const f = tp[k] * v[k]; if (tp[k] > tp[k - 1]) pos += f; else if (tp[k] < tp[k - 1]) neg += f } mfi[i] = neg > 0 ? 100 - 100 / (1 + pos / neg) : 100 }
  zone(4, mfi, 80, 20, 30)
  // Ultimate oscillator (7,14,28)
  const bp = new Float64Array(n), trr = new Float64Array(n); for (let i = 1; i < n; i++) { const lo = Math.min(l[i], c[i - 1]), hi = Math.max(h[i], c[i - 1]); bp[i] = c[i] - lo; trr[i] = hi - lo }
  const ult = new Float64Array(n); for (let i = 29; i < n; i++) { const a = p => { let sb = 0, st2 = 0; for (let k = i - p + 1; k <= i; k++) { sb += bp[k]; st2 += trr[k] } return st2 > 0 ? sb / st2 : 0.5 }; ult[i] = 100 * (4 * a(7) + 2 * a(14) + a(28)) / 7 }
  zone(5, ult, 70, 30, 30)
  // Bollinger(20,2), Keltner(EMA20 +- 2 ATR14), Donchian20
  const e20 = emaArr(c, 20), atr = new Float64Array(n); for (let i = 1; i < n; i++) { const tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])); atr[i] = i < 15 ? tr : (atr[i - 1] * 13 + tr) / 14 }
  const bbz = new Float64Array(n), kz = new Float64Array(n), dz = new Float64Array(n)
  for (let i = 20; i < n; i++) {
    const m = smaWin(c, i, 20); let s2 = 0; for (let k = i - 19; k <= i; k++) s2 += (c[k] - m) ** 2; const sd = Math.sqrt(s2 / 20)
    bbz[i] = sd > 0 ? (c[i] - m) / (2 * sd) : 0; kz[i] = atr[i] > 0 ? (c[i] - e20[i]) / (2 * atr[i]) : 0
    let hh = -Infinity, ll = Infinity; for (let k = i - 20; k < i; k++) { if (h[k] > hh) hh = h[k]; if (l[k] < ll) ll = l[k] } dz[i] = c[i] > hh ? 2 : c[i] < ll ? -2 : 0
  }
  zone(6, bbz, 1, -1, 30); zone(7, kz, 1, -1, 30); zone(8, dz, 1, -1, 30)
  // MACD histogram sign, EMA9/21, close vs EMA50
  const e12 = emaArr(c, 12), e26 = emaArr(c, 26), macd = e12.map((x, i) => x - e26[i]), sig = emaArr(macd, 9), zero = new Float64Array(n)
  cross(9, macd, sig, 30); cross(10, emaArr(c, 9), emaArr(c, 21), 30); cross(11, c, emaArr(c, 50), 60)
  // DMI: DI+ vs DI- with ADX14 > 20
  const pdm = new Float64Array(n), ndm = new Float64Array(n), adx = new Float64Array(n); let sp = 0, sn = 0, str = 0, ad = 0
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i], tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))
    sp = sp - sp / 14 + (up > dn && up > 0 ? up : 0); sn = sn - sn / 14 + (dn > up && dn > 0 ? dn : 0); str = str - str / 14 + tr
    pdm[i] = str > 0 ? 100 * sp / str : 0; ndm[i] = str > 0 ? 100 * sn / str : 0
    const dx = pdm[i] + ndm[i] > 0 ? 100 * Math.abs(pdm[i] - ndm[i]) / (pdm[i] + ndm[i]) : 0; ad = (ad * 13 + dx) / 14; adx[i] = ad
  }
  cross(12, pdm, ndm, 40, i => adx[i] > 20)
  // OBV vs its EMA20
  const obv = new Float64Array(n); for (let i = 1; i < n; i++) obv[i] = obv[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0)
  cross(13, obv, emaArr(obv, 20), 30)
  void zero
  return { ev, st }
}

const busy = new Map()
function trade(key, coin, B, i, side, H) {
  const bk = key + '|' + coin; if (i < (busy.get(bk) ?? 0)) return
  const j = i + 1, k = i + H; if (k >= B.n || B.t[j] < T0) return
  add(key, B.t[j], side * (B.c[k] / B.o[j] - 1)); busy.set(bk, k + 1)
}
let done = 0
for (const coin of coins) {
  const m = load1m(coin); if (m.n < 50000) continue
  for (const tf of TFS) {
    const B = aggregate(m, tf); if (B.n < 300) continue
    const { ev, st } = indicators(B)
    for (let i = 60; i < B.n - 25; i++) {
      for (let a = 0; a < NAMES.length; a++) {
        const s = ev[a][i]; if (!s) continue
        for (const H of [6, 24]) { trade(`S ${NAMES[a]} follow ${tf}m h${H}`, coin, B, i, s, H); trade(`S ${NAMES[a]} fade ${tf}m h${H}`, coin, B, i, -s, H) }
        for (let b = 0; b < NAMES.length; b++) {
          if (b === a || st[b][i] !== s) continue
          const p = a < b ? `${NAMES[a]}+${NAMES[b]}` : `${NAMES[b]}+${NAMES[a]}`
          trade(`P ${p} follow ${tf}m h12`, coin, B, i, s, 12); trade(`P ${p} fade ${tf}m h12`, coin, B, i, -s, 12)
        }
      }
    }
  }
  done++; if (done % 10 === 0) console.error('coins done', done)
}
const sm = days => {
  if (!days.length) return { n: 0, g: 0, net: 0, t: 0 }
  const v = days.map(x => x[2]), n = days.reduce((s, x) => s + x[0], 0), mu = v.reduce((s, x) => s + x, 0) / v.length
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, v.length - 1))
  return { n, g: days.reduce((s, x) => s + x[1], 0) / n * 1e4, net: days.reduce((s, x) => s + x[2], 0) / n * 1e4, t: sd > 0 ? mu / sd * Math.sqrt(v.length) : 0 }
}
const rows = []
for (const k of Object.keys(agg)) {
  const e = [...agg[k].entries()], is = sm(e.filter(([d]) => d * 86400000 < CUT).map(([, x]) => x)), oo = sm(e.filter(([d]) => d * 86400000 >= CUT).map(([, x]) => x))
  if (is.n < 100 || oo.n < 50) continue
  rows.push({ k, is, oo, ok: is.net > 0 && oo.net > 0 && oo.t >= 2 })
}
const fmt = r => r.k.padEnd(34) + `${String(r.is.n).padStart(7)} ${r.is.g.toFixed(1).padStart(6)} ${r.is.net.toFixed(1).padStart(6)} ${r.is.t.toFixed(1).padStart(5)} | ${String(r.oo.n).padStart(6)} ${r.oo.g.toFixed(1).padStart(6)} ${r.oo.net.toFixed(1).padStart(6)} ${r.oo.t.toFixed(1).padStart(5)}  ${r.ok ? 'PASS' : '-'}`
const hdr = 'rule'.padEnd(34) + '   IS n  gross    net     t |  OOS n  gross    net     t'
const out = [`v119bt — 14 oscillators alone and in pairs, ${done} coins, 5m/15m/1h/4h, 2025-09..2026-08, 16 bps round trip, IS 70 / OOS 30`]
const S = rows.filter(r => r.k[0] === 'S'), P = rows.filter(r => r.k[0] === 'P'), pass = rows.filter(r => r.ok)
const q = (a, f) => { const v = a.map(f).sort((x, y) => x - y); return v.length ? `${v[0].toFixed(1)} / ${v[Math.floor(v.length / 2)].toFixed(1)} / ${v[v.length - 1].toFixed(1)}` : '-' }
out.push(`rows: singles ${S.length}, pairs ${P.length}, total ${rows.length}; luck alone would pass ~${(rows.length * 0.023).toFixed(1)}`)
out.push(`singles OOS gross bps min/median/max: ${q(S, r => r.oo.g)};  pairs: ${q(P, r => r.oo.g)}`)
out.push(`positive net in BOTH halves: singles ${S.filter(r => r.is.net > 0 && r.oo.net > 0).length}, pairs ${P.filter(r => r.is.net > 0 && r.oo.net > 0).length}`)
out.push('', `PASS: ${pass.length} of ${rows.length}`, hdr, ...pass.map(fmt))
out.push('', 'top 20 singles by OOS net', hdr, ...[...S].sort((a, b) => b.oo.net - a.oo.net).slice(0, 20).map(fmt))
out.push('', 'top 20 pairs by OOS net', hdr, ...[...P].sort((a, b) => b.oo.net - a.oo.net).slice(0, 20).map(fmt))
out.push('', 'all singles', hdr, ...[...S].sort((a, b) => a.k < b.k ? -1 : 1).map(fmt))
const txt = out.join('\n'); console.log(out.slice(0, 60).join('\n')); fs.writeFileSync('/home/user/spacehub/status/oscillators-v119.txt', txt + '\n')
