"""v121 quant lab — report from experiments.jsonl -> status/quantlab-v121.txt"""
import json, collections, numpy as np
from lib import DB
rows, _seen = [], set()
for l in open(DB):
    r = json.loads(l); k = (r['family'], r['name'], r.get('H'), r.get('dir'), r.get('mode'))
    if k in _seen and r['family'] != 'stage2': continue
    _seen.add(k); rows.append(r)
out = []; P = out.append
COST = 18.0
P('v121 QUANT LAB — search for a real edge after costs. 94 Binance USDT-M perps, 5-minute panel, 2025-09-01..2026-08-31.')
P('Data: klines (OHLCV + taker buy volume) + futures metrics archive (5-min open interest, top-trader and global long/short ratio,')
P('taker buy/sell ratio) + settled funding. NOT available historically: liquidation prints, order book (only 70 days, tested in v103bt).')
P('Splits fixed in advance: TRAIN first 50% (Sep-Feb), VALIDATION next 20% (Mar-May), OUT-OF-SAMPLE last 30% (May-Aug), read once.')
P('Costs per round trip: majors 14 bps (taker 5 + slip 2 per side), others 20 bps (taker 5 + slip 5); funding by side; entry next bar open.')
P('Screen PASS = TRAIN net>0 & VALIDATION net>0 & OOS net>0 & OOS t>=2 (daily sums) & PF>1. Direction (follow/fade) chosen on TRAIN only.')
P('ACCEPT (stage 2) = OOS n>=100, net>0, PF>1, net after removing best 1% >0, >=5 coins, top coin <40% of profit, >=50% coins positive,')
P('         both OOS halves positive, Monte Carlo P(loss)<10%, >=60% of neighbouring exit parameters positive OOS.')
P('')
tested = [r for r in rows if 'oos' in r and r['family'] != 'stage2']
P(f'experiments run: {len(tested)} (+ {sum(1 for r in rows if r["family"] == "stage2")} stage-2 candidates); luck alone at a 2.3% false-positive rate: ~{len(tested) * 0.023:.0f} single-test passes')
vc = collections.Counter(r['verdict'] for r in tested)
P('verdicts: ' + ', '.join(f'{k} {v}' for k, v in vc.most_common()))
P('')
WHY = {'no_gross_edge': 'no movement to capture (|gross| < 30% of cost)', 'gross_below_cost': 'real but too small: gross < cost',
       'sign_flip': 'TRAIN edge reverses out-of-sample (selection noise)', 'decay_oos': 'positive OOS gross but below cost',
       'fails_validation': 'dies already in validation', 'not_significant': 'positive but t<2', 'too_few': 'too few trades', 'PASS_SCREEN': 'PASS'}
NEXT = {
 'trend': 'trend at 5m-24h holds is gross 5-35 bps; only multi-day horizons (v120 4h/1D) clear costs in gross -> next: daily trend with vol targeting on the 72-month set.',
 'meanrev': 'fades of VWAP/BB/ATR extremes capture 3-15 bps; maker-only entry would halve cost but v100bt showed adverse fills -> next: only with real queue data.',
 'momentum': 'time-series momentum/acceleration at 15m-24h: gross 2-17 bps, sign unstable -> no further variants of the same price-only feature.',
 'volatility': 'squeezes/expansions predict SIZE of the next move, not direction -> next: use as a sizing/regime input only, not as a signal.',
 'volume': 'volume features add no direction beyond the price move they accompany (same as v54bt/v68bt).',
 'micro': 'OI / long-short / taker ratio / funding: the strongest TRAIN gross (positioning fades 40-170 bps at 4-24h) but it did not survive validation/OOS -> next: forward-record and re-test on a second year.',
 'xsection': 'cross-sectional ranking (long strongest / short weakest): turnover cost dominates at 1-4h; daily is ROTA\'s family -> next: daily-only, 72-month.',
 'liquidation': 'OI-drop + big candle cascades: few events, both continuation and reclaim-reversal near zero after costs -> next: needs real liquidation prints (forward collector).',
 'sweep': 'sweeps of prior highs/lows with reclaim: gross ~0 (stop-hunts are not exploitable on 5m closes).',
 'time': 'hour/session/weekday effects: small and unstable between periods.',
 'lag': 'BTC/ETH lead -> alts: the lagged correlation is ~0 after one 5m bar; no exploitable delay at bar resolution.',
 'regime': 'conditioning on regimes chosen in TRAIN does not carry to OOS.',
 'score': 'composite scores inherit the components\' weakness; top-N selection reduces trades, not cost share.',
 'ml': 'logistic / LightGBM triple-barrier: see AUC; ~0.5 = no predictive power after features above.'}
for fam in ['trend', 'meanrev', 'momentum', 'volatility', 'volume', 'micro', 'xsection', 'liquidation', 'sweep', 'time', 'lag', 'regime', 'score', 'ml', 'stat']:
    fr = [r for r in tested if r['family'] == fam]
    if not fr: continue
    v = collections.Counter(r['verdict'] for r in fr)
    tg = np.median([r['train']['g'] for r in fr]); og = np.median([r['oos']['g'] for r in fr])
    P(f'== {fam.upper()}  ({len(fr)} experiments)  verdicts: ' + ', '.join(f'{k} {n}' for k, n in v.most_common()))
    P(f'   median gross per trade: TRAIN {tg:.1f} bps, OOS {og:.1f} bps (round-trip cost ~14-20 bps)')
    top = sorted(fr, key=lambda r: -(r['oos']['net'] if r['oos']['n'] >= 30 else -999))[:6]
    P('   best 6 by OOS net:  name | H | dir | TRAIN n/gross/net/t | VAL net/t | OOS n/gross/net/t/PF | verdict')
    for r in top:
        t, va, o = r['train'], r['val'], r['oos']
        P(f"     {r['name'][:46]:46} H{r.get('H', '-')!s:4} {r.get('dir', '')[:14]:14} {t['n']:6}/{t['g']:6.1f}/{t['net']:6.1f}/{t['t']:5.2f} | {va['net']:6.1f}/{va['t']:5.2f} | {o['n']:6}/{o['g']:6.1f}/{o['net']:6.1f}/{o['t']:5.2f}/{o.get('pf', 0):4.2f} | {r['verdict']}")
    dom = v.most_common(1)[0][0]
    P(f'   WHY IT FAILED: {WHY.get(dom, dom)}.  LEARNED / NEXT: {NEXT.get(fam, "-")}')
    P('')
for r in rows:
    if r['family'] in ('lag', 'regime', 'ml') and r.get('verdict') == 'info':
        P(f"info: {r['name']}: " + json.dumps({k: r[k] for k in ('corr', 'shares', 'imp') if k in r}))
ml = [r for r in tested if r['family'] == 'ml']
if ml: P('ML AUC (walk-forward, out-of-model months): ' + ', '.join(f"{r['name'].split()[0]} {r['auc']}" for r in ml[::2]))
P('')
s2 = [r for r in rows if r['family'] == 'stage2']
P(f'== STAGE 2 — the {len(s2)} strongest candidates (by TRAIN+VALIDATION t): exits / dynamic TP-SL / filters chosen on TRAIN+VALIDATION, then OOS once')
P('   name | src | exit (mode,H,a,b) | TRAIN+VAL n/net/t | OOS n/gross/net/t/PF/WR/rm1% | coins +/traded, top share | OOS halves | MC | neigh+ | dyn OOS | filter OOS | verdict')
for r in s2:
    tv, rb = r['trainval'], r['robust']; o = rb['oos']; e = r['exit']
    halves = f"{rb.get('oos_h1', {}).get('net', 0):.0f}/{rb.get('oos_h2', {}).get('net', 0):.0f}"
    fil = f"{r['filter']['name']} {r['filter']['oos']['net']:.1f}" if r.get('filter') else '-'
    P(f"   {r['name'][:34]:34} {r['src'][:8]:8} ({e['mode']},{e['H']},{e['a']},{e['b']}) {tv['n']}/{tv['net']:.1f}/{tv['t']:.2f} | {o['n']}/{o['g']:.1f}/{o['net']:.1f}/{o['t']:.2f}/{o.get('pf', 0):.2f}/{o.get('wr', 0) * 100:.0f}%/{o.get('rm1', 0):.1f} | "
      f"{rb.get('coins_pos', 0)}/{rb.get('coins_traded', 0)} {rb.get('top_coin_share', 1):.2f} | {halves} | {rb.get('mc_ploss', 1):.2f} | {r['neighbours_pos']:.2f} | {r['dynamic']['oos']['net']:.1f} | {fil} | {r['verdict']}")
acc = [r for r in s2 if r['verdict'] == 'ACCEPTED']
P('')
P(f'== ACCEPTED STRATEGIES: {len(acc)}')
for r in acc[:10]:
    o = r['robust']['oos']; e = r['exit']
    P(f"   {r['name']} ({r['src']}, {r['dir']}): exit mode {e['mode']} H={e['H']} bars TP={e['a']}ATR SL={e['b']}ATR | OOS n {o['n']} WR {o['wr'] * 100:.0f}% PF {o['pf']:.2f} exp {o['net']:.1f} bps maxDD {o['dd']:.1f}% Sharpe {o['sh']:.2f} net {o['tot']:.1f}%")
if not acc:
    P('   NONE. No strategy met the acceptance rules; nothing is presented as a winner.')
txt = '\n'.join(out); print(txt)
open('/home/user/spacehub/status/quantlab-v121.txt', 'w').write(txt + '\n')
