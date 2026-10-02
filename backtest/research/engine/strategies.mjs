// v120 engine — the 16 indicator families (+ Ichimoku alone, VWAP chase vs retest = 18).
// cond(I, B, i, p, s) -> true when the setup holds for side s (+1 long / -1 short) on the CLOSED bar i.
// Entry = the bar where cond turns true (rising edge), filled at bar i+1's open. Shorts are exact mirrors.
// p = the family's primary parameter, two grid values each (master score: three thresholds).
const G = (s, a, b) => s > 0 ? a > b : a < b            // a beyond b in direction s
const Z = (s, x, mid = 50) => s * (x - mid)              // > 0 = on side s of mid
const don = (I, s, i) => s > 0 ? I.donHi[i] : I.donLo[i]
const HZ = [1, 4, 16, 64, 256]

export const FAMILIES = {
  DON:   { kind: 'trend', p: [20, 25],  name: 'Donchian20 + EMA50/200 + ADX + volume',
           cond: (I, B, i, p, s) => G(s, B.c[i], don(I, s, i)) && G(s, I.e50[i], I.e200[i]) && I.adx[i] > p && I.rvol[i] >= 1.5 },
  EMAM:  { kind: 'trend', p: [20, 25],  name: 'EMA 9>21>50, price>200, RSI>50, MACD hist>0, ADX',
           cond: (I, B, i, p, s) => G(s, I.e9[i], I.e21[i]) && G(s, I.e21[i], I.e50[i]) && G(s, B.c[i], I.e200[i]) && Z(s, I.rsi[i]) > 0 && s * I.hist[i] > 0 && I.adx[i] > p },
  MHM:   { kind: 'trend', p: [3, 4],    name: 'multi-horizon momentum (1/4/16/64/256 bars, ATR-normalised, >=p agree)',
           cond: (I, B, i, p, s) => { if (i < 256 || !(I.atr[i] > 0)) return false; let k = 0; for (const h of HZ) if (s * (B.c[i] - B.c[i - h]) / (I.atr[i] * Math.sqrt(h)) > 0.5) k++; return k >= p } },
  ICHM:  { kind: 'trend', p: [0, 20],   name: 'Ichimoku (above cloud, TK, future cloud) + MACD hist, ADX>p',
           cond: (I, B, i, p, s) => G(s, B.c[i], s > 0 ? I.cloudTop[i] : I.cloudBot[i]) && G(s, I.ten[i], I.kij[i]) && G(s, I.saNow[i], I.sbNow[i]) && s * I.hist[i] > 0 && I.adx[i] > p },
  ICH:   { kind: 'trend', p: [0, 20],   name: 'Ichimoku alone, ADX>p',
           cond: (I, B, i, p, s) => G(s, B.c[i], s > 0 ? I.cloudTop[i] : I.cloudBot[i]) && G(s, I.ten[i], I.kij[i]) && G(s, I.saNow[i], I.sbNow[i]) && I.adx[i] > p },
  SUPT:  { kind: 'trend', p: [20, 25],  name: 'Supertrend(10,3) + EMA50/200 + RSI + ADX',
           cond: (I, B, i, p, s) => I.st[i] === s && G(s, I.e50[i], I.e200[i]) && Z(s, I.rsi[i]) > 0 && I.adx[i] > p },
  BBMR:  { kind: 'mr',    p: [30, 25],  name: 'Bollinger 20/2 fade + RSI<p + Stoch<20 + beyond VWAP, ADX<20 only',
           cond: (I, B, i, p, s) => I.adx[i] < 20 && G(-s, B.c[i], s > 0 ? I.bbLo[i] : I.bbUp[i]) && -Z(s, I.rsi[i]) > 50 - p && -Z(s, I.stK[i]) > 30 && G(-s, B.c[i], I.vwap[i]) },
  SQZ:   { kind: 'trend', p: [1.5, 2],  name: 'BB-inside-Keltner squeeze release + band break + volume + ADX rising + EMA trend',
           cond: (I, B, i, p, s) => { let was = 0; for (let k = i - 5; k < i; k++) was |= I.sqz[k]; return was && !I.sqz[i] && G(s, B.c[i], s > 0 ? I.bbUp[i] : I.bbLo[i]) && I.rvol[i] >= p && I.adx[i] > I.adx[i - 3] && G(s, I.e50[i], I.e200[i]) } },
  VWC:   { kind: 'trend', p: [1.5, 2],  name: 'VWAP chase: cross through VWAP on volume, EMA trend',
           cond: (I, B, i, p, s) => G(s, B.c[i], I.vwap[i]) && !G(s, B.c[i - 1], I.vwap[i - 1]) && I.rvol[i] >= p && G(s, I.e50[i], I.e200[i]) },
  VWR:   { kind: 'trend', p: [20, 25],  name: 'VWAP retest: trend, wick touches VWAP, closes back on side, ADX',
           cond: (I, B, i, p, s) => G(s, I.e50[i], I.e200[i]) && I.adx[i] > p && G(s, B.c[i - 1], I.vwap[i - 1]) && (s > 0 ? B.l[i] <= I.vwap[i] : B.h[i] >= I.vwap[i]) && G(s, B.c[i], I.vwap[i]) },
  ROCR:  { kind: 'trend', p: [55, 60],  name: 'ROC12 + RSI beyond p',
           cond: (I, B, i, p, s) => s * I.roc[i] > 0 && Z(s, I.rsi[i]) > p - 50 },
  MACDX: { kind: 'trend', p: [20, 25],  name: 'MACD hist + DI + ADX + EMA50',
           cond: (I, B, i, p, s) => s * I.hist[i] > 0 && G(s, I.pdi[i], I.ndi[i]) && I.adx[i] > p && G(s, B.c[i], I.e50[i]) },
  SRSI:  { kind: 'trend', p: [20, 30],  name: 'Stoch-RSI pullback cross in trend (never against EMA200)',
           cond: (I, B, i, p, s) => G(s, B.c[i], I.e200[i]) && G(s, I.e50[i], I.e200[i]) && G(s, I.srK[i], I.srD[i]) && !G(s, I.srK[i - 1], I.srD[i - 1]) && -Z(s, I.srK[i - 1]) > 50 - p },
  CCIT:  { kind: 'trend', p: [100, 150], name: 'CCI20 crosses beyond p, with EMA200 trend',
           cond: (I, B, i, p, s) => G(s, B.c[i], I.e200[i]) && s * I.cci[i] > p && s * I.cci[i - 1] <= p },
  MFIO:  { kind: 'trend', p: [50, 55],  name: 'MFI beyond p + OBV>EMA + RSI>50 + EMA50',
           cond: (I, B, i, p, s) => Z(s, I.mfi[i]) > p - 50 && G(s, I.obv[i], I.obvE[i]) && Z(s, I.rsi[i]) > 0 && G(s, B.c[i], I.e50[i]) },
  OBVB:  { kind: 'trend', p: [0.05, 0.1], name: 'Donchian break confirmed by OBV>EMA and CMF beyond p',
           cond: (I, B, i, p, s) => G(s, B.c[i], don(I, s, i)) && G(s, I.obv[i], I.obvE[i]) && s * I.cmf[i] > p },
  STRC:  { kind: 'trend', p: [20, 25],  name: 'market structure HH/HL + BOS through last swing + EMA50 + ADX + volume',
           cond: (I, B, i, p, s) => I.struct[i] === s && G(s, B.c[i], s > 0 ? I.swH[i] : I.swL[i]) && G(s, B.c[i], I.e50[i]) && I.adx[i] > p && I.rvol[i] >= 1.2 },
  MSTR:  { kind: 'trend', p: [6, 7, 8], name: 'breakout master score (Donchian 2, EMA 2, ADX 1, vol 1, MACD 1, RSI 1) >= p',
           cond: (I, B, i, p, s) => (G(s, B.c[i], don(I, s, i)) ? 2 : 0) + (G(s, I.e50[i], I.e200[i]) && G(s, B.c[i], I.e50[i]) ? 2 : 0) + (I.adx[i] > 25 ? 1 : 0) + (I.rvol[i] >= 1.5 ? 1 : 0) + (s * I.hist[i] > 0 ? 1 : 0) + (Z(s, I.rsi[i]) > 0 ? 1 : 0) >= p },
}
// exits: trend = S x ATR initial stop, chandelier trail T x ATR, max 96 bars; mr = S x ATR stop, target BB mid (maker), max T bars
export const STOPS = [1.5, 2.5], TRAILS = [2, 3.5], MR_HOLD = [12, 24]
export function grid(fam) {
  const F = FAMILIES[fam], out = []
  for (let a = 0; a < F.p.length; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) out.push({ key: `${a}${b}${c}`, a, b, c, p: F.p[a], S: STOPS[b], T: F.kind === 'mr' ? MR_HOLD[c] : TRAILS[c] })
  return out
}
// grid neighbours = points differing by one step in exactly one dimension (for the plateau score)
export function neighbours(g, pt) { return g.filter(q => Math.abs(q.a - pt.a) + Math.abs(q.b - pt.b) + Math.abs(q.c - pt.c) === 1) }
