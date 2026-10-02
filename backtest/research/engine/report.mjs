// v120 engine — merges the shard files and writes status/engine-v120.txt.
// PRE-REGISTERED verdicts (fixed before reading results):
//  STABLE EDGE (single series x family x filter): walk-forward OOS net>0 AND t>=2, >=3 of 4 folds positive, holdout net>0
//    AND t>=1, mean net after removing the single best OOS trade >0, Monte Carlo P(total<=0) < 10%, >= 60 OOS trades.
//  POOLED EDGE (timeframe x family x filter, across coins, each coin with its own walk-forward choice): pooled WFO t>=2,
//    pooled holdout net>0 AND t>=1.5, holdout positive on >= 60% of coins.
import fs from 'node:fs'
import { FAMILIES } from './strategies.mjs'
import { REGIMES } from './indicators.mjs'
const S = process.env.OUT ?? '/tmp/claude-0/-home-user-spacehub/dcfebcff-34af-51f5-a98b-4d0c121612cf/scratchpad'
const rows = [0, 1, 2, 3].flatMap(k => JSON.parse(fs.readFileSync(`${S}/v120-shard-${k}.json`, 'utf8')))
const out = [], P = (...a) => out.push(a.join(''))
const f1 = x => (x ?? 0).toFixed(1).padStart(7), f2 = x => (x ?? 0).toFixed(2).padStart(6), pad = (s, w) => String(s).padEnd(w)
const pool = list => { const m = new Map(); for (const days of list) for (const [d, n, g, net] of days) { const a = m.get(d) ?? [d, 0, 0, 0]; a[1] += n; a[2] += g; a[3] += net; m.set(d, a) } return [...m.values()].sort((a, b) => a[0] - b[0]) }
const tOf = days => { if (days.length < 2) return 0; const v = days.map(x => x[3]), mu = v.reduce((s, x) => s + x, 0) / v.length, sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / (v.length - 1)); return sd > 0 ? mu / sd * Math.sqrt(v.length) : 0 }
const sumD = days => { const n = days.reduce((s, x) => s + x[1], 0); return { n, g: n ? days.reduce((s, x) => s + x[2], 0) / n * 1e4 : 0, net: n ? days.reduce((s, x) => s + x[3], 0) / n * 1e4 : 0, t: tOf(days) } }
const fams = Object.keys(FAMILIES), filters = ['base', 'htf', 'cvd']
const tfName = tf => tf >= 1440 ? '1D' : tf >= 60 ? `${tf / 60}h` : `${tf}m`

// BTC 30-day return per day (bull > +10%, bear < -10%, else sideways) from the 72-month 1h archive
const btc = new Map(); { const closes = []; for (const s of fs.readFileSync('/home/user/spacehub/backtest/data/h1/BTC-1h.csv', 'utf8').split('\n')) { if (!s) continue; const f = s.split(','); if (+f[0] % 864e5 === 82800000) closes.push([Math.floor(+f[0] / 864e5), +f[4]]) }
  for (let i = 31; i < closes.length; i++) btc.set(closes[i][0] + 1, closes[i - 1][1] / closes[i - 31][1] - 1) }   // known at the day's open
const mkt = d => { const r = btc.get(d); return r === undefined ? 'n/a' : r > 0.1 ? 'bull' : r < -0.1 ? 'bear' : 'side' }

let tested = 0, stable = []
for (const r of rows) for (const fam of fams) for (const fk of filters) {
  const e = r.fams[fam]?.[fk]; if (!e) continue; tested++
  const ok = e.wfo.net > 0 && e.wfo.t >= 2 && e.foldsPos >= 3 && e.hold.net > 0 && e.hold.t >= 1 && e.oos.rb > 0 && e.mc < 0.1 && e.oos.n >= 60
  if (ok) stable.push({ r, fam, fk, e })
}
P('v120 — crypto strategy engine: 18 indicator families x 8-12 parameter points x 3 filters, walk-forward + holdout, regime selector')
P(`series: ${rows.length} (majors ${rows.filter(r => r.major).length}: 1m 3m 5m 15m 30m on 12 months, 1h 4h 1D on 72 months; other liquid perps ${rows.filter(r => !r.major).length} at 15m/1h on 12 months)`)
P('costs: taker 5 bps/side, maker 2 bps on mean-reversion targets, slippage 2 bps majors / 5 bps others per side, funding 0.01%/8h; entry at next bar open')
P('not testable here (no minute history): open interest, liquidations, long/short ratio, order book. Taker flow (CVD proxy) tested as the cvd filter.')
P(`combinations judged (series x family x filter): ${tested}; at a 2.3% false-pass rate luck alone would mark ~${(tested * 0.023).toFixed(0)} as passing ONE t>=2 test`)
P('')
P(`== STABLE EDGE on a single series (all 6 conditions): ${stable.length} of ${tested}`)
P(pad('coin', 9) + pad('tf', 5) + pad('family', 7) + pad('filter', 7) + ' WFO n    net      t folds | HOLD n    net      t | rmBest  MC   PF   maxDD%')
for (const { r, fam, fk, e } of stable.sort((a, b) => b.e.hold.t - a.e.hold.t))
  P(pad(r.coin, 9) + pad(tfName(r.tf), 5) + pad(fam, 7) + pad(fk, 7) + `${String(e.wfo.n).padStart(6)}${f1(e.wfo.net)}${f2(e.wfo.t)}   ${e.foldsPos}/4 |${String(e.hold.n).padStart(6)}${f1(e.hold.net)}${f2(e.hold.t)} |${f1(e.oos.rb)} ${e.mc.toFixed(2)} ${e.oos.pf.toFixed(2)} ${e.oos.dd.toFixed(1).padStart(6)}`)
P('')

// pooled per timeframe x family x filter
const groups = [['majors', r => r.major], ['others', r => !r.major]], pooledAll = []
for (const [gname, gsel] of groups) {
  const tfs = [...new Set(rows.filter(gsel).map(r => r.tf))].sort((a, b) => a - b)
  for (const tf of tfs) {
    const rs = rows.filter(r => gsel(r) && r.tf === tf), list = []
    for (const fam of fams) for (const fk of filters) {
      const es = rs.map(r => r.fams[fam]?.[fk]).filter(Boolean); if (!es.length) continue
      const w = sumD(pool(es.map(e => e.wfoDays))), h = sumD(pool(es.map(e => e.holdDays))), pos = es.filter(e => e.hold.n > 0 && e.hold.net > 0).length, withH = es.filter(e => e.hold.n > 0).length
      const ok = w.t >= 2 && h.net > 0 && h.t >= 1.5 && withH > 0 && pos / withH >= 0.6
      const row = { gname, tf, fam, fk, w, h, pos, withH, ok, es }
      list.push(row); pooledAll.push(row)
    }
    list.sort((a, b) => b.w.t - a.w.t)
    P(`== ${gname} ${tfName(tf)} (${rs.length} coins) — top 8 of ${list.length} by pooled walk-forward t   [pooled PASS: ${list.filter(x => x.ok).length}]`)
    P(pad('family', 7) + pad('filter', 7) + '  WFO n  gross    net      t |  HOLD n  gross    net      t | coins hold>0')
    for (const x of list.slice(0, 8)) P(pad(x.fam, 7) + pad(x.fk, 7) + `${String(x.w.n).padStart(7)}${f1(x.w.g)}${f1(x.w.net)}${f2(x.w.t)} |${String(x.h.n).padStart(8)}${f1(x.h.g)}${f1(x.h.net)}${f2(x.h.t)} | ${x.pos}/${x.withH}${x.ok ? '  PASS' : ''}`)
    const gs = list.map(x => x.w.g).sort((a, b) => a - b)
    P(`   gross per trade across all ${list.length} rows (WFO): min ${gs[0].toFixed(1)} / median ${gs[Math.floor(gs.length / 2)].toFixed(1)} / max ${gs[gs.length - 1].toFixed(1)} bps; round-trip cost ~${gname === 'majors' ? 14 : 20} bps + funding`)
    P('')
  }
}
const pooledPass = pooledAll.filter(x => x.ok)
P(`== POOLED PASS (timeframe x family x filter across coins): ${pooledPass.length} of ${pooledAll.length} (luck ~${(pooledAll.length * 0.023).toFixed(1)})`)
for (const x of pooledPass) P(`   ${x.gname} ${tfName(x.tf)} ${x.fam} ${x.fk}: WFO t ${x.w.t.toFixed(2)} net ${x.w.net.toFixed(1)} | hold t ${x.h.t.toFixed(2)} net ${x.h.net.toFixed(1)} | ${x.pos}/${x.withH} coins`)
P('')

// per coin (majors): best family by holdout among those positive in walk-forward
P('== per coin (majors) — best row by walk-forward t among rows positive in BOTH walk-forward and holdout')
P(pad('coin', 6) + pad('tf', 5) + pad('family', 7) + pad('filter', 7) + 'params    WFO n    net      t | HOLD n    net      t |  PF   WR   avgW   avgL  Sharpe Sortino maxDD% Calmar rmBest  MC')
for (const coin of [...new Set(rows.filter(r => r.major).map(r => r.coin))]) {
  let best = null
  for (const r of rows.filter(x => x.coin === coin)) for (const fam of fams) for (const fk of filters) { const e = r.fams[fam]?.[fk]; if (!e || e.wfo.net <= 0 || e.hold.net <= 0 || e.wfo.n < 30) continue; if (!best || e.wfo.t > best.e.wfo.t) best = { r, fam, fk, e } }
  if (!best) { P(pad(coin, 6) + '  none positive in both'); continue }
  const { r, fam, fk, e } = best, F = FAMILIES[fam], pk = e.final, pt = pk ? `p=${F.p[+pk[0]]} S=${[1.5, 2.5][+pk[1]]} ${F.kind === 'mr' ? 'H' : 'T'}=${F.kind === 'mr' ? [12, 24][+pk[2]] : [2, 3.5][+pk[2]]}` : '-', o = e.oos
  P(pad(coin, 6) + pad(tfName(r.tf), 5) + pad(fam, 7) + pad(fk, 7) + pad(pt, 9) + `${String(e.wfo.n).padStart(6)}${f1(e.wfo.net)}${f2(e.wfo.t)} |${String(e.hold.n).padStart(6)}${f1(e.hold.net)}${f2(e.hold.t)} | ${o.pf.toFixed(2)} ${(o.wr * 100).toFixed(0).padStart(3)}%${f1(o.aw)}${f1(o.al)}${f2(o.sh)}${f2(o.so)}${o.dd.toFixed(1).padStart(7)}${f2(o.cal)}${f1(o.rb)} ${e.mc.toFixed(2)}`)
}
P('   (picked as the best of ~' + (fams.length * 3 * 8) + ' rows per coin — read every one of these against the luck line above)')
P('')

// per regime: pooled over every series, regime-specific walk-forward choice; and the regime meta-selector
P('== per regime — each family traded ONLY in that regime (signal-bar label), pooled over all series, holdout')
P(pad('regime', 12) + fams.map(f => pad(f, 7)).join('') + '   <- holdout net bps per trade (t)')
for (let rg = 0; rg < 5; rg++) {
  const cells = fams.map(fam => { const d = sumD(pool(rows.map(r => r.fams[fam]?.base?.regimes?.[rg]?.holdDays ?? []))); return d.n ? `${d.net.toFixed(0)}(${d.t.toFixed(1)})` : '-' })
  P(pad(REGIMES[rg], 12) + cells.map(c => pad(c, 7)).join(''))
}
{ const metaDays = [], chosen = {}
  for (const r of rows) for (let rg = 0; rg < 5; rg++) {
    let best = null; for (const fam of fams) { const x = r.fams[fam]?.base?.regimes?.[rg]; if (x && x.final && x.plateau > (best?.pl ?? -Infinity)) best = { fam, pl: x.plateau, days: x.holdDays } }
    if (best) { metaDays.push(best.days); chosen[`${REGIMES[rg]}:${best.fam}`] = (chosen[`${REGIMES[rg]}:${best.fam}`] ?? 0) + 1 }
  }
  const m = sumD(pool(metaDays))
  P(`regime META-SELECTOR (per series and regime, the family with the best train plateau; holdout only): n ${m.n}, gross ${m.g.toFixed(1)}, net ${m.net.toFixed(1)} bps, t ${m.t.toFixed(2)}`)
  P('   most-chosen: ' + Object.entries(chosen).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', '))
}
P('')

// robustness on the top pooled candidates
const top = [...pooledAll].sort((a, b) => (b.w.t + b.h.t) - (a.w.t + a.h.t)).slice(0, 6)
P('== robustness of the 6 best pooled rows (by WFO t + holdout t)')
for (const x of top) {
  const all = pool(x.es.flatMap(e => [e.wfoDays, e.holdDays])), by = { bull: [], bear: [], side: [] }
  for (const d of all) { const k = mkt(d[0]); if (by[k]) by[k].push(d) }
  const sens = x.es.flatMap(e => Object.values(e.sens ?? {}).filter(v => v !== null)), sp = sens.filter(v => v > 0).length
  const rb = x.es.map(e => e.oos.rb), rbPos = rb.filter(v => v > 0).length, mcs = x.es.map(e => e.mc).sort((a, b) => a - b)
  P(`${x.gname} ${tfName(x.tf)} ${x.fam} ${x.fk}: WFO t ${x.w.t.toFixed(2)} net ${x.w.net.toFixed(1)} | hold t ${x.h.t.toFixed(2)} net ${x.h.net.toFixed(1)} | coins hold>0 ${x.pos}/${x.withH}`)
  P(`   market: ` + ['bull', 'bear', 'side'].map(k => { const s = sumD(by[k]); return `${k} n ${s.n} net ${s.net.toFixed(1)} t ${s.t.toFixed(2)}` }).join(' | '))
  P(`   parameter sensitivity: ${sp}/${sens.length} grid points positive on holdout | remove-best-trade positive on ${rbPos}/${rb.length} coins | median MC P(loss) ${mcs[Math.floor(mcs.length / 2)].toFixed(2)}`)
}
P('')
P(`VERDICT: single-series STABLE EDGE ${stable.length} of ${tested}; pooled PASS ${pooledPass.length} of ${pooledAll.length}. A handful of isolated single-series passes among ${tested} looks is what selection alone produces; an edge is only credible if it repeats across coins (pooled) and timeframes.`)
const txt = out.join('\n'); console.log(txt); fs.writeFileSync('/home/user/spacehub/status/engine-v120.txt', txt + '\n')
