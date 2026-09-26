// v94.0 — THE LAB (research grid). Every spec in shared/lab.ts over real Binance USDT-M archives:
//   5m  (10 coins, 36 months) · 15m (pinned 40, 36m) · 1h / 2h / 4h (pinned 40, 72m; 2h/4h aggregated from 1h)
//   23 rules x LONG/SHORT x 36 exits x 5 regime gates = 8,280 specs per timeframe, 41,400 in all.
// Walk-forward per timeframe: IS = first 60% in 4 windows, VAL = 60-80%, OOS = last 20%, read once.
// SELECTION NEVER SEES OOS: a spec reaches OOS only if >= 3 of 4 IS windows are net-positive, the pooled IS
// daily-clustered t >= 1.5 and VAL is net-positive. ELITE = OOS net > 0, OOS daily t >= 2, PF >= 1.15, n >= 50.
// The number of specs that REACHED OOS is printed next to the luck count (P(t>=2 | no edge) ~ 2.3%), so an
// elite pool of the size luck alone would produce is read as noise, not as edge.
// Costs per trade: taker 5 bps x 2, slippage 3 bps (BTC/ETH) / 5 bps (others) x 2, REAL funding from the
// Binance fundingRate archive for the exact funding times held (0.01%/8h only when a coin has no archive,
// counted as INFERRED). Entries at the next bar's open; stop before target; one position per coin per spec.
// Then: an OOS portfolio of the elite pool (8 slots, one per coin) and the 25%/DAY STRESS TEST — the risk and
// leverage that target would need, the drawdown / liquidations / ruin it causes, and whether a risk level
// chosen on IS+VAL holds OOS. Output: status/lab-latest.json (read by the live LAB sleeve) + .txt.
import { RULES, EXITS, GATES, LAB_VERSION, LAB_COST, TF_MIN, labInd, labSignal, labGate, labOpen, labBar, specId, specText, slipFor, type Tf, type LBar, type Rule, type Exit, type Gate, type Spec } from '../shared/lab.ts'
import { CRYPTO_40 } from '../shared/strategy.ts'

const DAY = 864e5, HR = 36e5
const PINNED = CRYPTO_40.map((c) => (c === 'PEPE' ? '1000PEPE' : c))
const FAST10 = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']
const SETS: { tf: Tf; src: '5m' | '15m' | '1h'; coins: string[]; agg: number }[] = [
  { tf: '5m', src: '5m', coins: FAST10, agg: 1 }, { tf: '15m', src: '15m', coins: PINNED, agg: 1 },
  { tf: '1h', src: '1h', coins: PINNED, agg: 1 }, { tf: '2h', src: '1h', coins: PINNED, agg: 2 }, { tf: '4h', src: '1h', coins: PINNED, agg: 4 },
]
export const LAB_BAR = { isWin: 4, isShare: 0.6, valShare: 0.2, minIsWinPos: 3, minIsN: 120, isT: 1.5, minValN: 30, eliteT: 2, elitePf: 1.15, eliteN: 50, maxSurvivors: 600, slots: 8 }

function loadK(sym: string, iv: string): LBar[] {
  let txt = ''; try { txt = Deno.readTextFileSync(`backtest/data/${sym}-${iv}.csv`) } catch { return [] }
  const out: LBar[] = []
  for (const line of txt.split('\n')) {
    if (!line || line[0] < '0' || line[0] > '9') continue
    const f = line.split(','); let t = Number(f[0]); if (t > 1e14) t = Math.floor(t / 1000)
    const b: LBar = { t, open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5], tb: f.length > 9 ? +f[9] : NaN }
    if (b.close > 0 && Number.isFinite(b.high)) out.push(b)
  }
  out.sort((a, b) => a.t - b.t)
  const d: LBar[] = []; let last = -1; for (const b of out) if (b.t !== last) { d.push(b); last = b.t }
  return d
}
function agg(b: LBar[], k: number, barMs: number): LBar[] {
  if (k === 1) return b
  const out: LBar[] = []; let cur: LBar | null = null, key = -1, cnt = 0
  const flush = () => { if (cur && cnt === k) out.push(cur) }
  for (const x of b) {
    const q = Math.floor(x.t / (barMs * k))
    if (q !== key) { flush(); key = q; cnt = 0; cur = { t: q * barMs * k, open: x.open, high: x.high, low: x.low, close: x.close, vol: 0, tb: 0 } }
    const c = cur as LBar; c.high = Math.max(c.high, x.high); c.low = Math.min(c.low, x.low); c.close = x.close; c.vol += x.vol; c.tb = (c.tb as number) + (x.tb as number); cnt++
  }
  flush(); return out
}
// funding archive: calc_time, interval_h, rate  -> sorted [t, rate]
function loadFunding(sym: string): Float64Array[] | null {
  let txt = ''; try { txt = Deno.readTextFileSync(`backtest/data/${sym}-funding.csv`) } catch { return null }
  const rows: [number, number][] = []
  for (const line of txt.split('\n')) { if (!line || line[0] < '0' || line[0] > '9') continue; const f = line.split(','); const t = Number(f[0]), r = Number(f[2]); if (Number.isFinite(t) && Number.isFinite(r)) rows.push([t, r]) }
  if (rows.length < 50) return null
  rows.sort((a, b) => a[0] - b[0])
  return [Float64Array.from(rows.map((r) => r[0])), Float64Array.from(rows.map((r) => r[1]))]
}
// cumulative funding (fraction) paid by a LONG between t0 (exclusive) and t1 (inclusive)
function fundingBetween(F: Float64Array[] | null, t0: number, t1: number): number {
  if (!F) return LAB_COST.fundingDefault8h * (t1 - t0) / (8 * HR)
  const [ts, rs] = F; let lo = 0, hi = ts.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] <= t0) lo = m + 1; else hi = m }
  let s = 0; for (let i = lo; i < ts.length && ts[i] <= t1; i++) s += rs[i]
  return s
}

interface Tr { t: number; end: number; coin: string; net: number; gross: number; fee: number; slip: number; fund: number; R: number; hrs: number; mae: number; stopPct: number; inferred: boolean }
// simulate one entry; returns null if the data runs out
function simulate(coin: string, b: LBar[], atr: number, i: number, side: 1 | -1, e: Exit, F: Float64Array[] | null, barMs: number): Tr | null {
  if (i + 1 >= b.length) return null
  const raw = b[i + 1].open, slip = slipFor(coin.replace('1000', '')), fee = LAB_COST.fee
  const entry = raw * (1 + side * slip)
  const p = labOpen(side, entry, atr, e)
  let mae = 0
  for (let j = i + 1; j < b.length; j++) {
    const bar = b[j]
    const adverse = Math.max(0, side > 0 ? (entry - bar.low) / entry : (bar.high - entry) / entry)
    const r = labBar(p, bar)
    if (r) {
      mae = Math.max(mae, r.why === 'STOP' ? Math.max(0, side * (entry - r.px) / entry) : adverse)
      const xp = r.px * (1 - side * slip), t0 = b[i + 1].t, t1 = bar.t + barMs
      const gross = side * (r.px / raw - 1) * 100
      const net0 = side * (xp / entry - 1) * 100
      const fund = side * fundingBetween(F, t0, t1) * 100
      const feePct = 2 * fee * 100
      const net = net0 - feePct - fund
      const stopPct = e.sl * atr / entry * 100
      return { t: t0, end: t1, coin, net, gross, fee: feePct, slip: gross - net0, fund, R: net / stopPct, hrs: (t1 - t0) / HR, mae: mae * 100, stopPct, inferred: F === null }
    }
    mae = Math.max(mae, adverse)
  }
  return null
}

const NSEG = LAB_BAR.isWin + 2, VAL = LAB_BAR.isWin, OOS = LAB_BAR.isWin + 1
function segOf(t: number, t0: number, t1: number): number {
  const x = (t - t0) / (t1 - t0)
  if (x >= LAB_BAR.isShare + LAB_BAR.valShare) return OOS
  if (x >= LAB_BAR.isShare) return VAL
  return Math.min(LAB_BAR.isWin - 1, Math.floor(x / (LAB_BAR.isShare / LAB_BAR.isWin)))
}
const dailyT = (tr: Tr[]) => {
  const d = new Map<number, number>(); for (const x of tr) { const k = Math.floor(x.t / DAY); d.set(k, (d.get(k) ?? 0) + x.net) }
  const v = [...d.values()]; if (v.length < 3) return 0
  const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1))
  return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0
}
export function summarize(tr: Tr[]) {
  const n = tr.length, sum = tr.reduce((a, x) => a + x.net, 0), w = tr.filter((x) => x.net > 0)
  const gw = w.reduce((a, x) => a + x.net, 0), gl = -tr.filter((x) => x.net <= 0).reduce((a, x) => a + x.net, 0)
  const hrs = tr.reduce((a, x) => a + x.hrs, 0)
  let eq = 0, pk = 0, dd = 0; for (const x of tr.slice().sort((a, b) => a.end - b.end)) { eq += x.net; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq) }
  return { n, mean: n ? sum / n : 0, sum, t: dailyT(tr), pf: gl > 0 ? gw / gl : gw > 0 ? 99 : 0, wr: n ? w.length / n : 0, retHr: hrs > 0 ? sum / hrs : 0, ddPctSum: dd,
    gross: n ? tr.reduce((a, x) => a + x.gross, 0) / n : 0, fee: n ? tr.reduce((a, x) => a + x.fee, 0) / n : 0, slip: n ? tr.reduce((a, x) => a + x.slip, 0) / n : 0,
    fund: n ? tr.reduce((a, x) => a + x.fund, 0) / n : 0, inferred: tr.filter((x) => x.inferred).length }
}

type Cfg = { tf: Tf; side: 1 | -1; ri: number; ei: number; g: Gate }
function runSet(set: typeof SETS[number], log: (s: string) => void) {
  const barMs = TF_MIN[set.tf] * 60_000
  const coins: { c: string; b: LBar[] }[] = []
  for (const c of set.coins) { const b = agg(loadK(c, set.src), set.agg, barMs / set.agg); if (b.length >= 2000) coins.push({ c, b }) }
  const btc = coins.find((x) => x.c === 'BTC')
  if (!btc || coins.length < 5) { log(`[${set.tf}] SKIPPED: ${coins.length} coins with data`); return null }
  const t0 = btc.b[0].t, t1 = btc.b[btc.b.length - 1].t + barMs
  const bI = labInd(btc.b), btcUp = new Map<number, boolean>()
  btc.b.forEach((x, i) => { if (bI.ema50[i] > 0) btcUp.set(x.t, x.close > bI.ema50[i]) })
  const NR = RULES.length, NE = EXITS.length, NG = GATES.length
  const idx = (side: number, ri: number, ei: number, gi: number) => (((side > 0 ? 0 : 1) * NR + ri) * NE + ei) * NG + gi
  const NC = 2 * NR * NE * NG, F = 6
  const st = new Float64Array(NC * NSEG * F)   // n, sum, sumsq, win, loss, hours
  let trades = 0
  const funding = new Map<string, Float64Array[] | null>()
  // pass 1 — aggregate stats per spec x segment
  for (const { c, b } of coins) {
    const I = labInd(b), F_ = loadFunding(c); funding.set(c, F_)
    for (const side of [1, -1] as const) for (let ri = 0; ri < NR; ri++) {
      const busy = new Int32Array(NE)
      for (let i = 120; i < b.length - 1; i++) {
        if (!labSignal(RULES[ri], side, b, I, i)) continue
        const up = btcUp.get(b[i].t) ?? null
        const gates: number[] = []; for (let gi = 0; gi < NG; gi++) if (labGate(GATES[gi], I, i, up)) gates.push(gi)
        for (let ei = 0; ei < NE; ei++) {
          if (i < busy[ei]) continue
          const tr = simulate(c, b, I.atr[i], i, side, EXITS[ei], F_, barMs); if (!tr) continue
          busy[ei] = i + 1 + Math.round((tr.end - tr.t) / barMs)
          const s = segOf(tr.t, t0, t1); trades++
          for (const gi of gates) { const o = (idx(side, ri, ei, gi) * NSEG + s) * F
            st[o] += 1; st[o + 1] += tr.net; st[o + 2] += tr.net * tr.net; if (tr.net > 0) st[o + 3] += tr.net; else st[o + 4] -= tr.net; st[o + 5] += tr.hrs }
        }
      }
    }
  }
  // screen on IS + VAL only
  const surv: { cfg: Cfg; isT: number }[] = []
  for (const side of [1, -1] as const) for (let ri = 0; ri < NR; ri++) for (let ei = 0; ei < NE; ei++) for (let gi = 0; gi < NG; gi++) {
    const base = idx(side, ri, ei, gi) * NSEG * F
    let pos = 0, n = 0, s = 0, s2 = 0, okWin = true
    for (let w = 0; w < LAB_BAR.isWin; w++) { const o = base + w * F; if (st[o] < 10) okWin = false; if (st[o + 1] > 0) pos++; n += st[o]; s += st[o + 1]; s2 += st[o + 2] }
    const vo = base + VAL * F
    if (!okWin || pos < LAB_BAR.minIsWinPos || n < LAB_BAR.minIsN || s <= 0 || st[vo] < LAB_BAR.minValN || st[vo + 1] <= 0) continue
    const m = s / n, sd = Math.sqrt(Math.max(1e-12, s2 / n - m * m)), tt = m / (sd / Math.sqrt(n))
    surv.push({ cfg: { tf: set.tf, side, ri, ei, g: GATES[gi] }, isT: tt })
  }
  surv.sort((a, b) => b.isT - a.isT)
  const cut = surv.slice(0, LAB_BAR.maxSurvivors)
  // pass 2 — trade lists for survivors: daily-clustered t per segment, OOS read once
  const bySet = new Map<string, Cfg[]>()
  for (const s of cut) { const k = `${s.cfg.side}:${s.cfg.ri}`; (bySet.get(k) ?? bySet.set(k, []).get(k)!).push(s.cfg) }
  const lists = new Map<Cfg, Tr[][]>()
  for (const { c, b } of coins) {
    const I = labInd(b), F_ = funding.get(c) ?? null
    for (const [k, cfgs] of bySet) {
      const [sd, ri] = k.split(':').map(Number) as [1 | -1, number]
      const busy = new Map<Cfg, number>()
      for (let i = 120; i < b.length - 1; i++) {
        if (!labSignal(RULES[ri], sd, b, I, i)) continue
        const up = btcUp.get(b[i].t) ?? null
        // busy is tracked on the UNGATED sequence, exactly as in pass 1
        const done = new Map<number, Tr | null>()
        for (const cfg of cfgs) {
          if (i < (busy.get(cfg) ?? 0)) continue
          let tr = done.get(cfg.ei)
          if (tr === undefined) { tr = simulate(c, b, I.atr[i], i, sd, EXITS[cfg.ei], F_, barMs); done.set(cfg.ei, tr) }
          if (!tr) continue
          busy.set(cfg, i + 1 + Math.round((tr.end - tr.t) / barMs))
          if (!labGate(cfg.g, I, i, up)) continue
          const L = lists.get(cfg) ?? lists.set(cfg, Array.from({ length: NSEG }, () => [])).get(cfg)!
          L[segOf(tr.t, t0, t1)].push(tr)
        }
      }
    }
  }
  const rows: any[] = []
  let reachedOos = 0
  for (const s of cut) {
    const L = lists.get(s.cfg); if (!L) continue
    const is = L.slice(0, LAB_BAR.isWin).flat(), isS = summarize(is)
    if (isS.t < LAB_BAR.isT) continue
    reachedOos++
    const val = summarize(L[VAL]), oos = summarize(L[OOS])
    const spec: Spec = { id: specId(set.tf, s.cfg.side, RULES[s.cfg.ri], EXITS[s.cfg.ei], s.cfg.g), version: LAB_VERSION, tf: set.tf, side: s.cfg.side, rule: RULES[s.cfg.ri], exit: EXITS[s.cfg.ei], gate: s.cfg.g }
    const elite = oos.mean > 0 && oos.t >= LAB_BAR.eliteT && oos.pf >= LAB_BAR.elitePf && oos.n >= LAB_BAR.eliteN
    rows.push({ spec, text: specText(spec), elite, isWinPos: L.slice(0, LAB_BAR.isWin).filter((w) => w.reduce((a, x) => a + x.net, 0) > 0).length,
      is: pick(isS), val: pick(val), oos: pick(oos),
      // trade lists are kept only where they can matter (portfolio / stress); the rest would only cost memory
      oosTrades: oos.mean > 0 ? L[OOS] : [], isTrades: oos.mean > 0 ? is.concat(L[VAL]) : [] })
    lists.delete(s.cfg)
  }
  log(`[${set.tf}] ${coins.length} coins, ${new Date(t0).toISOString().slice(0, 10)} → ${new Date(t1).toISOString().slice(0, 10)}, ${trades.toLocaleString()} simulated trades | specs ${NC} | passed IS+VAL screen ${surv.length} | IS daily t>=${LAB_BAR.isT} -> reached OOS ${reachedOos} | ELITE ${rows.filter((r) => r.elite).length} (luck alone ≈ ${(reachedOos * 0.023).toFixed(1)})`)
  return { tf: set.tf, coins: coins.map((x) => x.c), from: new Date(t0).toISOString(), to: new Date(t1).toISOString(), trades, specs: NC, screened: surv.length, reachedOos, rows }
}
const pick = (s: ReturnType<typeof summarize>) => ({ n: s.n, mean: +s.mean.toFixed(4), t: +s.t.toFixed(2), pf: +s.pf.toFixed(3), wr: +s.wr.toFixed(3), retHr: +s.retHr.toFixed(5),
  ddSumPct: +s.ddPctSum.toFixed(2), gross: +s.gross.toFixed(4), fee: +s.fee.toFixed(4), slip: +s.slip.toFixed(4), fund: +s.fund.toFixed(4), inferred: s.inferred })

// composite rank over the seven metrics the owner named (OOS where it exists)
function rankRows(rows: any[]) {
  const keys: [string, (r: any) => number, number][] = [
    ['mean', (r) => r.oos.mean, 1], ['pf', (r) => r.oos.pf, 1], ['retHr', (r) => r.oos.retHr, 1], ['dd', (r) => r.oos.ddSumPct, -1],
    ['stab', (r) => r.isWinPos + (r.val.mean > 0 ? 1 : 0), 1], ['n', (r) => r.oos.n, 1], ['oosT', (r) => r.oos.t, 1]]
  for (const r of rows) r.rankScore = 0
  for (const [, f, dir] of keys) { const s = rows.slice().sort((a, b) => dir * (f(b) - f(a))); s.forEach((r, i) => (r.rankScore += i)) }
  rows.sort((a, b) => a.rankScore - b.rankScore)
}

// OOS portfolio: specs' OOS trades in time order, <= slots open, one position per coin
function portfolio(specRows: any[], which: 'oosTrades' | 'isTrades') {
  const all: (Tr & { spec: string })[] = []
  for (const r of specRows) for (const x of r[which] as Tr[]) all.push({ ...x, spec: r.spec.id })
  all.sort((a, b) => a.t - b.t)
  const open: { end: number; coin: string }[] = [], taken: (Tr & { spec: string })[] = []
  for (const x of all) {
    for (let k = open.length - 1; k >= 0; k--) if (open[k].end <= x.t) open.splice(k, 1)
    if (open.length >= LAB_BAR.slots || open.some((o) => o.coin === x.coin)) continue
    open.push({ end: x.end, coin: x.coin }); taken.push(x)
  }
  return taken
}
// compounding at risk r per trade (fraction of equity at the stop); isolated margin per slot = equity/slots,
// per-position leverage = notional / margin; a trade whose adverse excursion reaches the liquidation distance
// (1/lev - 0.5% maintenance) loses the whole slot margin instead of its R result.
export function stress(tr: Tr[], r: number, slots = LAB_BAR.slots) {
  const days = new Map<number, Tr[]>(); for (const x of tr) { const k = Math.floor(x.end / DAY); (days.get(k) ?? days.set(k, []).get(k)!).push(x) }
  const keys = [...days.keys()].sort((a, b) => a - b)
  if (!keys.length) return null
  let eq = 1, pk = 1, dd = 0, liq = 0, ruin = false, maxLev = 0
  const daily: number[] = []
  for (let d = keys[0]; d <= keys[keys.length - 1]; d++) {
    const xs = days.get(d) ?? []
    let ret = 0
    for (const x of xs) {
      const notionalFrac = r / (x.stopPct / 100), lev = notionalFrac * slots; maxLev = Math.max(maxLev, lev)
      const liqDist = lev > 1 ? (1 / lev - 0.005) * 100 : Infinity
      if (x.mae >= liqDist) { ret -= 1 / slots; liq++ } else ret += r * x.R
    }
    ret = Math.max(ret, -1)
    eq *= 1 + ret; daily.push(ret)
    if (eq <= 0.01) { ruin = true; eq = 0; pk = Math.max(pk, 1); dd = 1; break }
    pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk)
  }
  const nd = daily.length, mean = daily.reduce((a, b) => a + b, 0) / Math.max(1, nd)
  const med = daily.slice().sort((a, b) => a - b)[Math.floor(nd / 2)] ?? 0
  const geo = eq > 0 ? Math.pow(eq, 1 / Math.max(1, nd)) - 1 : -1
  return { r, days: nd, meanDaily: mean, medianDaily: med, geoDaily: geo, final: eq, maxDD: dd, liquidations: liq, ruin, maxPosLev: maxLev }
}
const meanDailyR = (tr: Tr[]) => { const d = new Map<number, number>(); for (const x of tr) { const k = Math.floor(x.end / DAY); d.set(k, (d.get(k) ?? 0) + x.R) }
  if (!tr.length) return 0; const span = (Math.max(...tr.map((x) => x.end)) - Math.min(...tr.map((x) => x.t))) / DAY; return [...d.values()].reduce((a, b) => a + b, 0) / Math.max(1, span) }

export function labMain() {
  const lines: string[] = [], log = (s: string) => { console.log(s); lines.push(s) }
  log(`LAB ${new Date().toISOString()} — ${RULES.length} rules x 2 sides x ${EXITS.length} exits x ${GATES.length} gates per timeframe; IS 60% (4 windows) | VAL 20% | OOS 20% read once`)
  log(`costs/trade: taker ${Math.round(LAB_COST.fee * 1e4)}bps x2 + slippage ${Math.round(LAB_COST.slipMajor * 1e4)}/${Math.round(LAB_COST.slipAlt * 1e4)}bps x2 + REAL funding (archive; 0.01%/8h INFERRED only without an archive)`)
  const sets: any[] = []
  for (const s of SETS) { const r = runSet(s, log); if (r) sets.push(r) }
  const rows = sets.flatMap((s) => s.rows)
  const reached = sets.reduce((a, s) => a + s.reachedOos, 0), specs = sets.reduce((a, s) => a + s.specs, 0)
  const elite = rows.filter((r) => r.elite); rankRows(elite)
  const explore = rows.filter((r) => !r.elite && r.oos.mean > 0 && r.oos.n >= 20 && r.oos.pf > 1); rankRows(explore)
  const top = rows.slice().sort((a, b) => b.oos.t - a.oos.t).slice(0, 40)
  log(`\nTOTAL: ${specs.toLocaleString()} specs · ${reached} reached OOS · ELITE ${elite.length} · luck alone would pass ≈ ${(reached * 0.023).toFixed(1)} · explore-eligible (OOS>0, not significant) ${explore.length}`)
  log(`\nTOP 15 BY OOS t (net % per trade after all costs; t = daily-clustered):`)
  for (const r of top.slice(0, 15)) log(`  ${r.elite ? 'ELITE' : '     '} ${r.spec.id.padEnd(40)} IS ${r.is.mean.toFixed(3)}% t${r.is.t} (${r.isWinPos}/4) | VAL ${r.val.mean.toFixed(3)}% n${r.val.n} | OOS ${r.oos.mean.toFixed(3)}% t${r.oos.t} PF ${r.oos.pf} n${r.oos.n} WR ${(r.oos.wr * 100).toFixed(0)}%  [gross ${r.oos.gross.toFixed(3)} fee ${r.oos.fee.toFixed(3)} slip ${r.oos.slip.toFixed(3)} fund ${r.oos.fund.toFixed(3)}]`)
  // by side / family / timeframe (OOS, among specs that reached it)
  const grp = (f: (r: any) => string) => { const m = new Map<string, any[]>(); for (const r of rows) (m.get(f(r)) ?? m.set(f(r), []).get(f(r))!).push(r)
    return [...m.entries()].map(([k, v]) => ({ k, n: v.length, posOos: v.filter((r) => r.oos.mean > 0).length, bestOosT: Math.max(...v.map((r) => r.oos.t)), meanOos: v.reduce((a, r) => a + r.oos.mean, 0) / v.length })).sort((a, b) => b.meanOos - a.meanOos) }
  const bySide = grp((r) => (r.spec.side > 0 ? 'LONG' : 'SHORT')), byFam = grp((r) => r.spec.rule.fam), byTf = grp((r) => r.spec.tf)
  for (const [name, g] of [['side', bySide], ['family', byFam], ['timeframe', byTf]] as const) {
    log(`\nBY ${name.toUpperCase()} (specs that reached OOS):`)
    for (const x of g) log(`  ${x.k.padEnd(8)} reached ${String(x.n).padStart(4)} · OOS>0 ${String(x.posOos).padStart(4)} · mean OOS ${x.meanOos.toFixed(3)}%/trade · best OOS t ${x.bestOosT.toFixed(2)}`)
  }
  // portfolio + 25%/day stress on the ELITE pool (or, if empty, on the top explore specs, labelled NOT SUPPORTED)
  const basis = elite.length ? elite.slice(0, 12) : explore.slice(0, 12)
  const basisName = elite.length ? 'ELITE' : 'EXPLORE (not OOS-significant — NOT a supported edge)'
  let stressOut: any = { basis: basisName, specs: basis.map((r: any) => r.spec.id) }
  if (basis.length) {
    const pOos = portfolio(basis, 'oosTrades'), pIs = portfolio(basis, 'isTrades')
    const sO = summarize(pOos), sI = summarize(pIs)
    const mdrO = meanDailyR(pOos), mdrI = meanDailyR(pIs)
    log(`\nPORTFOLIO (${basisName}, ${basis.length} specs, <= ${LAB_BAR.slots} open, 1 per coin): IS+VAL n ${sI.n} mean ${sI.mean.toFixed(3)}% | OOS n ${sO.n} mean ${sO.mean.toFixed(3)}% t ${sO.t.toFixed(2)} PF ${sO.pf.toFixed(2)} · mean daily sum of R: IS ${mdrI.toFixed(3)} / OOS ${mdrO.toFixed(3)}`)
    const grid = [0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2].map((r) => ({ is: stress(pIs, r), oos: stress(pOos, r) }))
    log(`  risk/trade | OOS mean daily | median | geometric | maxDD | liquidations | ruin | peak position leverage`)
    for (const g of grid) if (g.oos) log(`  ${(g.oos.r * 100).toFixed(2).padStart(6)}%   | ${(g.oos.meanDaily * 100).toFixed(3).padStart(8)}% | ${(g.oos.medianDaily * 100).toFixed(3).padStart(7)}% | ${(g.oos.geoDaily * 100).toFixed(3).padStart(7)}% | ${(g.oos.maxDD * 100).toFixed(1).padStart(5)}% | ${String(g.oos.liquidations).padStart(4)} | ${g.oos.ruin ? 'RUIN' : 'no'} | ${g.oos.maxPosLev.toFixed(1)}x`)
    // the 25%/day question: risk needed, chosen on IS+VAL, then read OOS
    const needIs = mdrI > 0 ? 0.25 / mdrI : Infinity
    const at25 = Number.isFinite(needIs) ? { is: stress(pIs, Math.min(needIs, 1)), oos: stress(pOos, Math.min(needIs, 1)) } : null
    let best: any = null
    for (let r = 0.001; r <= 0.5; r *= 1.25) { const s = stress(pIs, r); if (s && !s.ruin && (!best || s.geoDaily > best.geoDaily)) best = s }
    const kellyOos = best ? stress(pOos, best.r) : null, halfOos = best ? stress(pOos, best.r / 2) : null
    // paper replay of the most recent 30 days of the OOS portfolio at the sizes the live sleeve uses
    const lastT = Math.max(...pOos.map((x) => x.end)), recent = pOos.filter((x) => x.end > lastT - 30 * DAY)
    const rExplore = stress(recent, 0.001), rElite = stress(recent, 0.005)
    log(`  paper replay, last 30 days of OOS (${recent.length} trades): explore size 0.1%/trade -> ${rExplore ? (rExplore.geoDaily * 100).toFixed(4) : '—'}%/day, maxDD ${rExplore ? (rExplore.maxDD * 100).toFixed(2) : '—'}% | elite size 0.5%/trade -> ${rElite ? (rElite.geoDaily * 100).toFixed(4) : '—'}%/day, maxDD ${rElite ? (rElite.maxDD * 100).toFixed(2) : '—'}%`)
    stressOut = { ...stressOut, replay30: { trades: recent.length, explore: rExplore, elite: rElite }, portfolio: { is: pick(sI), oos: pick(sO), meanDailyR_is: mdrI, meanDailyR_oos: mdrO }, grid, target25: { riskNeeded: needIs, at25 }, kellyIs: best, kellyOos, halfKellyOos: halfOos }
    log(`\n25%/DAY STRESS: mean daily sum of R on IS+VAL = ${mdrI.toFixed(3)} -> risk per trade needed for +25%/day ≈ ${Number.isFinite(needIs) ? (needIs * 100).toFixed(1) + '%' : '∞ (no positive edge)'}`)
    if (at25?.oos) log(`  at that risk OOS: mean daily ${(at25.oos.meanDaily * 100).toFixed(2)}%, geometric ${(at25.oos.geoDaily * 100).toFixed(2)}%/day, maxDD ${(at25.oos.maxDD * 100).toFixed(1)}%, liquidations ${at25.oos.liquidations}, ${at25.oos.ruin ? 'RUIN' : 'survived'}, peak position leverage ${at25.oos.maxPosLev.toFixed(0)}x`)
    if (best) log(`  growth-optimal risk chosen on IS+VAL: ${(best.r * 100).toFixed(2)}%/trade (IS geo ${(best.geoDaily * 100).toFixed(3)}%/day) -> OOS geo ${kellyOos ? (kellyOos.geoDaily * 100).toFixed(3) : '—'}%/day, maxDD ${kellyOos ? (kellyOos.maxDD * 100).toFixed(1) : '—'}%; half of it OOS geo ${halfOos ? (halfOos.geoDaily * 100).toFixed(3) : '—'}%/day, maxDD ${halfOos ? (halfOos.maxDD * 100).toFixed(1) : '—'}%`)
    else log('  growth-optimal risk on IS+VAL: none positive — no leverage level grows this portfolio')
  }
  const strip = (r: any) => ({ spec: r.spec, text: r.text, elite: r.elite, isWinPos: r.isWinPos, is: r.is, val: r.val, oos: r.oos, rankScore: r.rankScore ?? null })
  const out = { ran_at: new Date().toISOString(), version: LAB_VERSION, bar: LAB_BAR, costs: LAB_COST,
    sets: sets.map((s) => ({ tf: s.tf, coins: s.coins.length, from: s.from, to: s.to, trades: s.trades, specs: s.specs, screened: s.screened, reachedOos: s.reachedOos, elite: s.rows.filter((r: any) => r.elite).length })),
    totals: { specs, reachedOos: reached, elite: elite.length, luckExpected: +(reached * 0.023).toFixed(1), explore: explore.length },
    elite: elite.slice(0, 20).map(strip), explore: explore.slice(0, 12).map(strip), top: top.map(strip), bySide, byFamily: byFam, byTimeframe: byTf, stress: stressOut }
  Deno.writeTextFileSync('status/lab-latest.json', JSON.stringify(out))
  Deno.writeTextFileSync('status/lab-latest.txt', lines.join('\n') + '\n')
}
