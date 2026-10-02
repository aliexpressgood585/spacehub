// v120 engine — indicators. Every value at bar i uses bars <= i only (no look-ahead, no repaint):
// swing pivots are confirmed K bars later, the Ichimoku cloud at bar i is the one computed 26 bars ago,
// Donchian / relative volume compare the current bar with the PREVIOUS N bars.
export function ema(x, p) { const n = x.length, k = 2 / (p + 1), e = new Float64Array(n); e[0] = x[0]; for (let i = 1; i < n; i++) e[i] = x[i] * k + e[i - 1] * (1 - k); return e }
function sma(x, p) { const n = x.length, o = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { s += x[i]; if (i >= p) s -= x[i - p]; o[i] = s / Math.min(i + 1, p) } return o }
function rollMax(x, p, excl) { const n = x.length, o = new Float64Array(n).fill(NaN); for (let i = p - 1 + excl; i < n; i++) { let m = -Infinity; for (let k = i - p + 1 - excl; k <= i - excl; k++) if (x[k] > m) m = x[k]; o[i] = m } return o }
function rollMin(x, p, excl) { const n = x.length, o = new Float64Array(n).fill(NaN); for (let i = p - 1 + excl; i < n; i++) { let m = Infinity; for (let k = i - p + 1 - excl; k <= i - excl; k++) if (x[k] < m) m = x[k]; o[i] = m } return o }
function wilderRsi(c, p) { const n = c.length, r = new Float64Array(n).fill(50); let ag = 0, al = 0; for (let i = 1; i < n; i++) { const ch = c[i] - c[i - 1]; ag = (ag * (p - 1) + Math.max(ch, 0)) / p; al = (al * (p - 1) + Math.max(-ch, 0)) / p; r[i] = al > 0 ? 100 - 100 / (1 + ag / al) : 100 } return r }

export function compute(B, tfMin) {
  const { n, t, o, h, l, c, v, tb } = B
  const I = { n, tfMin }
  for (const p of [5, 9, 12, 20, 21, 26, 50, 100, 200]) I['e' + p] = ema(c, p)
  // ATR14 / ADX14 / DI (Wilder)
  const atr = new Float64Array(n), pdi = new Float64Array(n), ndi = new Float64Array(n), adx = new Float64Array(n)
  { let sp = 0, sn = 0, st = 0, ad = 0
    for (let i = 1; i < n; i++) {
      const tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])), up = h[i] - h[i - 1], dn = l[i - 1] - l[i]
      atr[i] = i < 15 ? (atr[i - 1] * (i - 1) + tr) / i : (atr[i - 1] * 13 + tr) / 14
      sp = sp - sp / 14 + (up > dn && up > 0 ? up : 0); sn = sn - sn / 14 + (dn > up && dn > 0 ? dn : 0); st = st - st / 14 + tr
      pdi[i] = st > 0 ? 100 * sp / st : 0; ndi[i] = st > 0 ? 100 * sn / st : 0
      const dx = pdi[i] + ndi[i] > 0 ? 100 * Math.abs(pdi[i] - ndi[i]) / (pdi[i] + ndi[i]) : 0; ad = (ad * 13 + dx) / 14; adx[i] = ad
    } }
  Object.assign(I, { atr, pdi, ndi, adx })
  I.rsi = wilderRsi(c, 14)
  const macd = I.e12.map((x, i) => x - I.e26[i]), sig = ema(macd, 9); I.hist = macd.map((x, i) => x - sig[i]); I.macd = macd; I.msig = sig
  I.donHi = rollMax(h, 20, 1); I.donLo = rollMin(l, 20, 1)
  const vPrev = new Float64Array(n); { let s = 0; for (let i = 0; i < n; i++) { vPrev[i] = i >= 20 ? s / 20 : NaN; s += v[i]; if (i >= 20) s -= v[i - 20] } }
  I.rvol = v.map((x, i) => vPrev[i] > 0 ? x / vPrev[i] : NaN)
  // Bollinger 20/2, Keltner EMA20 +- 1.5 ATR (squeeze), BB width
  const mid = sma(c, 20), bu = new Float64Array(n), bl = new Float64Array(n), bw = new Float64Array(n)
  for (let i = 19; i < n; i++) { let s2 = 0; for (let k = i - 19; k <= i; k++) s2 += (c[k] - mid[i]) ** 2; const sd = Math.sqrt(s2 / 20); bu[i] = mid[i] + 2 * sd; bl[i] = mid[i] - 2 * sd; bw[i] = mid[i] > 0 ? 4 * sd / mid[i] : 0 }
  I.bbMid = mid; I.bbUp = bu; I.bbLo = bl; I.bbW = bw
  I.sqz = new Uint8Array(n); for (let i = 20; i < n; i++) I.sqz[i] = bu[i] < I.e20[i] + 1.5 * atr[i] && bl[i] > I.e20[i] - 1.5 * atr[i] ? 1 : 0
  // Supertrend 10/3
  { const a10 = new Float64Array(n); for (let i = 1; i < n; i++) { const tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])); a10[i] = i < 11 ? (a10[i - 1] * (i - 1) + tr) / i : (a10[i - 1] * 9 + tr) / 10 }
    const dir = new Int8Array(n); let fu = 0, fl = 0, d = 1
    for (let i = 1; i < n; i++) {
      const m = (h[i] + l[i]) / 2, bu2 = m + 3 * a10[i], bl2 = m - 3 * a10[i]
      fu = (bu2 < fu || c[i - 1] > fu) ? bu2 : fu; fl = (bl2 > fl || c[i - 1] < fl) ? bl2 : fl
      if (d === 1 && c[i] < fl) d = -1; else if (d === -1 && c[i] > fu) d = 1
      dir[i] = d
    }
    I.st = dir }
  // Ichimoku 9/26/52; cloud at i = spans computed at i-26 (displacement), "future" cloud = spans computed at i
  { const hh = (p, i) => { let m = -Infinity; for (let k = i - p + 1; k <= i; k++) if (h[k] > m) m = h[k]; return m }, ll = (p, i) => { let m = Infinity; for (let k = i - p + 1; k <= i; k++) if (l[k] < m) m = l[k]; return m }
    const ten = new Float64Array(n).fill(NaN), kij = new Float64Array(n).fill(NaN), sa = new Float64Array(n).fill(NaN), sb = new Float64Array(n).fill(NaN)
    for (let i = 51; i < n; i++) { ten[i] = (hh(9, i) + ll(9, i)) / 2; kij[i] = (hh(26, i) + ll(26, i)) / 2; sa[i] = (ten[i] + kij[i]) / 2; sb[i] = (hh(52, i) + ll(52, i)) / 2 }
    I.ten = ten; I.kij = kij; I.saNow = sa; I.sbNow = sb
    I.cloudTop = new Float64Array(n).fill(NaN); I.cloudBot = new Float64Array(n).fill(NaN)
    for (let i = 77; i < n; i++) { I.cloudTop[i] = Math.max(sa[i - 26], sb[i - 26]); I.cloudBot[i] = Math.min(sa[i - 26], sb[i - 26]) } }
  // Stochastic 14/3/3 and Stochastic RSI 14/14/3/3
  { const raw = new Float64Array(n).fill(50); for (let i = 13; i < n; i++) { let a = -Infinity, b = Infinity; for (let k = i - 13; k <= i; k++) { if (h[k] > a) a = h[k]; if (l[k] < b) b = l[k] } raw[i] = a > b ? 100 * (c[i] - b) / (a - b) : 50 }
    I.stK = sma(raw, 3); I.stD = sma(I.stK, 3)
    const sr = new Float64Array(n).fill(50); for (let i = 13; i < n; i++) { let a = -Infinity, b = Infinity; for (let k = i - 13; k <= i; k++) { if (I.rsi[k] > a) a = I.rsi[k]; if (I.rsi[k] < b) b = I.rsi[k] } sr[i] = a > b ? 100 * (I.rsi[i] - b) / (a - b) : 50 }
    I.srK = sma(sr, 3); I.srD = sma(I.srK, 3) }
  // CCI20, MFI14, OBV + EMA20, CMF20, ROC12
  const tp = new Float64Array(n); for (let i = 0; i < n; i++) tp[i] = (h[i] + l[i] + c[i]) / 3
  { const m = sma(tp, 20), cci = new Float64Array(n); for (let i = 19; i < n; i++) { let md = 0; for (let k = i - 19; k <= i; k++) md += Math.abs(tp[k] - m[i]); md /= 20; cci[i] = md > 0 ? (tp[i] - m[i]) / (0.015 * md) : 0 } I.cci = cci }
  { const mfi = new Float64Array(n).fill(50); for (let i = 15; i < n; i++) { let pos = 0, neg = 0; for (let k = i - 13; k <= i; k++) { const f = tp[k] * v[k]; if (tp[k] > tp[k - 1]) pos += f; else if (tp[k] < tp[k - 1]) neg += f } mfi[i] = neg > 0 ? 100 - 100 / (1 + pos / neg) : 100 } I.mfi = mfi }
  { const obv = new Float64Array(n); for (let i = 1; i < n; i++) obv[i] = obv[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0); I.obv = obv; I.obvE = ema(obv, 20) }
  { const cmf = new Float64Array(n); let smf = 0, sv = 0; const mf = new Float64Array(n)
    for (let i = 0; i < n; i++) { mf[i] = h[i] > l[i] ? ((c[i] - l[i]) - (h[i] - c[i])) / (h[i] - l[i]) * v[i] : 0; smf += mf[i]; sv += v[i]; if (i >= 20) { smf -= mf[i - 20]; sv -= v[i - 20] } cmf[i] = sv > 0 ? smf / sv : 0 } I.cmf = cmf }
  I.roc = c.map((x, i) => i >= 12 ? x / c[i - 12] - 1 : 0)
  // VWAP: session (UTC day) up to 1h bars, rolling 20-bar VWAP for slower bars
  { const vw = new Float64Array(n); if (tfMin <= 60) { let pv = 0, vv = 0, day = -1; for (let i = 0; i < n; i++) { const d = Math.floor(t[i] / 86400000); if (d !== day) { day = d; pv = 0; vv = 0 } pv += tp[i] * v[i]; vv += v[i]; vw[i] = vv > 0 ? pv / vv : c[i] } }
    else { let pv = 0, vv = 0; for (let i = 0; i < n; i++) { pv += tp[i] * v[i]; vv += v[i]; if (i >= 20) { pv -= tp[i - 20] * v[i - 20]; vv -= v[i - 20] } vw[i] = vv > 0 ? pv / vv : c[i] } }
    I.vwap = vw }
  // taker-flow (CVD proxy from the kline taker-buy column), 20-bar sum, sign only
  { const cv = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { const d = tb ? 2 * tb[i] - v[i] : 0; s += d; if (i >= 20) s -= tb ? 2 * tb[i - 20] - v[i - 20] : 0; cv[i] = s } I.cvd = cv }
  // market structure: pivots K=3 confirmed 3 bars later; struct +1 = HH & HL, -1 = LH & LL; BOS = close through the last swing
  { const K = 3, sH = new Float64Array(n).fill(NaN), sL = new Float64Array(n).fill(NaN), struct = new Int8Array(n)
    let h1 = NaN, h2 = NaN, l1 = NaN, l2 = NaN
    for (let i = 2 * K; i < n; i++) {
      const j = i - K; let isH = true, isL = true
      for (let k = j - K; k <= j + K; k++) { if (k === j) continue; if (h[k] >= h[j]) isH = false; if (l[k] <= l[j]) isL = false }
      if (isH) { h2 = h1; h1 = h[j] } if (isL) { l2 = l1; l1 = l[j] }
      sH[i] = h1; sL[i] = l1
      struct[i] = h1 > h2 && l1 > l2 ? 1 : h1 < h2 && l1 < l2 ? -1 : 0
    }
    I.swH = sH; I.swL = sL; I.struct = struct }
  // regime inputs: ATR% percentile vs the previous 200 bars, EMA50 slope over 10 bars in ATR units
  { const ap = new Float64Array(n); for (let i = 0; i < n; i++) ap[i] = c[i] > 0 ? atr[i] / c[i] : 0
    const rk = new Float64Array(n).fill(0.5); for (let i = 200; i < n; i++) { let cnt = 0; for (let k = i - 200; k < i; k += 2) if (ap[k] < ap[i]) cnt++; rk[i] = cnt / 100 }
    I.atrRank = rk; I.slope = I.e50.map((x, i) => i >= 10 && atr[i] > 0 ? (x - I.e50[i - 10]) / atr[i] : 0) }
  // REGIME per bar: 0 TREND, 1 RANGE, 2 HIGHVOL, 3 COMPRESSION, 4 NEUTRAL
  I.regime = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    I.regime[i] = I.sqz[i] ? 3 : I.atrRank[i] > 0.85 ? 2 : (adx[i] > 25 && Math.abs(I.slope[i]) > 0.3) ? 0 : adx[i] < 20 ? 1 : 4
  }
  return I
}
export const REGIMES = ['TREND', 'RANGE', 'HIGHVOL', 'COMPRESSION', 'NEUTRAL']
