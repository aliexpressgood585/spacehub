"""Poly coins: does a stop-loss improve the favourite rule? (owner 2026-10-13: "one losing position should not cost 20 winners")
Same data and entry as pmc_research.py (last 1-minute price at or before end-L, +1c slip, fee 0.07*p*(1-p)). After entry, at
every later 1-minute point before the end: if our side's price <= stop, SELL there at price - exit slip, paying the taker fee.
Otherwise hold to the official result. 1-minute points only = the real exit could be worse (the price can gap through the stop
between points), so exits pay 2c slip. 70/30 time split; per-trade return on $ staked.
Run: python3 backtest/research/pmc_stoploss.py <pmc.jsonl> > status/pmc-stoploss.txt
"""
import json, sys, math, statistics as st

rows = []
for l in open(sys.argv[1]):
    try: rows.append(json.loads(l))
    except Exception: pass
rows.sort(key=lambda r: r['end'])
cut = rows[int(len(rows) * .7)]['end']
FEE = lambda r, p: r['fee'] * p * (1 - p)

def trades(tf, L, lo, hi, stop, xslip=.02, coins=None):
    out = []
    for r in rows:
        if r['tf'] != tf or (coins and r['coin'] not in coins): continue
        t0 = r['end'] - L; p = None; k0 = 0
        for i, (ts, v) in enumerate(r['h']):
            if ts <= t0: p, k0 = v, i
            else: break
        if p is None: continue
        for side, q in ((1, p), (-1, 1 - p)):
            if not (lo <= q < hi): continue
            buy = min(.999, q + .01); cost = buy + FEE(r, buy)
            won = r['up_won'] if side == 1 else not r['up_won']
            val, how = (1.0 if won else 0.0), 'res'
            if stop is not None:
                for ts, v in r['h'][k0 + 1:]:
                    if ts >= r['end']: break
                    mine = v if side == 1 else 1 - v
                    if mine <= stop:
                        sell = max(.001, mine - xslip); val, how = sell - FEE(r, sell), 'stop'; break
            out.append(((val - cost) / cost, val > cost, how, won, r['end'] >= cut))
            break
    return out

def s(x):
    if not x: return '   n 0'
    v = [a for a, *_ in x]; n = len(v); mu = sum(v) / n; sd = st.pstdev(v) or 1e-9
    stops = [y for y in x if y[2] == 'stop']
    saved = sum(1 for y in stops if not y[3]); killed = sum(1 for y in stops if y[3])
    return (f'n{n:5} WR {100*sum(1 for y in x if y[1])/n:5.1f}% ret {100*mu:+6.2f}%/$ t{mu/sd*math.sqrt(n):+5.2f} '
            f'worst {100*min(v):+6.1f}% | stops {len(stops):4} (saved {saved:3} real losers, cut {killed:3} would-be winners)')

print('Entry = favourite, 5m and 15m, all 4 coins (no coin picking). stop None = hold to the result (the live rule).')
for tf, L, lo, hi in (('5m', 180, .90, .98), ('5m', 120, .90, .98), ('5m', 120, .85, .95), ('15m', 300, .90, .98), ('15m', 180, .85, .95), ('5m', 180, .75, .90)):
    print(f'\n== {tf} L={L}s band {lo:.2f}-{hi:.2f}')
    for stop in (None, .85, .80, .75, .70, .60, .50, .40):
        x = trades(tf, L, lo, hi, stop)
        if stop is not None and stop >= lo: continue
        a = [y for y in x if not y[4]]; b = [y for y in x if y[4]]
        print(f'stop {str(stop):5} | IS  {s(a)}\n           | OOS {s(b)}')
