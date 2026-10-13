"""Polymarket short crypto Up/Down: which (timeframe, minutes-before-end, favourite price band) pays after real costs?
Input: pmc_fetch.py jsonl. Entry = the last 1-minute price point at or before (end - L seconds); buy whichever side sits in
[lo, hi) at that moment, at price + slip, paying the market's taker fee rate * p * (1 - p) per share; hold to the official
result ($1 or $0). Time split 70/30 (first 70% of markets by end time = IS, rest = OOS). t on per-trade returns.
Run: python3 backtest/research/pmc_research.py <pmc.jsonl> > status/pmc-research.txt
"""
import json, sys, math, statistics as st
from collections import Counter

rows = []
for l in open(sys.argv[1]):
    try: rows.append(json.loads(l))
    except Exception: pass   # a truncated last line while the fetch is still writing
rows.sort(key=lambda r: r['end'])
cut = rows[int(len(rows) * .7)]['end']
LS = {'5m': [30, 60, 90, 120, 180, 240], '15m': [60, 120, 180, 300, 420, 600, 840], '4h': [300, 600, 1200, 1800, 3600, 7200, 10800]}
BANDS = [(.55, .7), (.6, .8), (.7, .8), (.75, .85), (.8, .9), (.85, .92), (.9, .95), (.92, .97), (.95, .98), (.97, .99)]

def px_at(r, t):
    p = None
    for ts, v in r['h']:
        if ts <= t: p = v
        else: break
    return p

def run(tf, coin, L, lo, hi, slip):
    out = []
    for r in rows:
        if r['tf'] != tf or (coin != 'all' and r['coin'] != coin): continue
        p = px_at(r, r['end'] - L)
        if p is None or px_at(r, r['start'] - 30) is None and p == 0.5: continue
        for q, won in ((p, r['up_won']), (1 - p, not r['up_won'])):
            if lo <= q < hi:
                buy = min(.999, q + slip); fee = r['fee'] * buy * (1 - buy)
                out.append((((1 if won else 0) - buy - fee) / (buy + fee), won, r['end'] >= cut)); break
    return out

def s(x):
    if len(x) < 40: return None
    v = [a for a, _, _ in x]; n = len(v); mu = sum(v) / n; sd = st.pstdev(v) or 1e-9
    return n, 100 * sum(w for _, w, _ in x) / n, 100 * mu, mu / sd * math.sqrt(n)

print('markets', Counter((r['tf'], r['coin']) for r in rows))
print('fee rates', Counter(r['fee'] for r in rows), '| split at', cut)
print('tf   coin  L(s)  band        slip | IS n    WR    ret%   t    | OOS n   WR    ret%   t')
res = []
for tf in LS:
    for coin in ['all', 'btc', 'eth', 'sol', 'xrp']:
        for L in LS[tf]:
            for lo, hi in BANDS:
                r = run(tf, coin, L, lo, hi, .01)
                a = s([x for x in r if not x[2]]); b = s([x for x in r if x[2]])
                if a and b: res.append((tf, coin, L, lo, hi, a, b))
res.sort(key=lambda z: -min(z[5][3], z[6][3]))
for tf, coin, L, lo, hi, a, b in res[:40]:
    print(f'{tf:4} {coin:4} {L:5} {lo:.2f}-{hi:.2f} .010 | {a[0]:5} {a[1]:5.1f} {a[2]:+6.2f} {a[3]:+5.2f} | {b[0]:5} {b[1]:5.1f} {b[2]:+6.2f} {b[3]:+5.2f}')
print('rows', len(res), '| positive in both halves:', sum(1 for z in res if z[5][2] > 0 and z[6][2] > 0),
      '| both t>=2:', sum(1 for z in res if z[5][3] >= 2 and z[6][3] >= 2))
print('--- per timeframe: best by min(IS t, OOS t)')
for tf in LS:
    z = [x for x in res if x[0] == tf][:5]
    for tf_, coin, L, lo, hi, a, b in z:
        print(f'{tf:4} {coin:4} {L:5} {lo:.2f}-{hi:.2f} | IS {a[0]} WR {a[1]:.1f} {a[2]:+.2f}% t{a[3]:+.2f} | OOS {b[0]} WR {b[1]:.1f} {b[2]:+.2f}% t{b[3]:+.2f}')
