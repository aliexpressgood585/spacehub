"""Kalshi vs Polymarket cross-venue arbitrage on the same games (owner 2026-10-15, prompt item F). Rules fixed before reading.
Input: kalshi_pm_fetch.py output (games matched by teams + date, both venues agree on the winner).
At every Kalshi hourly candle close t between 7 days and 0 h before the game start:
  Kalshi quote = that candle's yes_bid / yes_ask close for each team (REAL quotes);
  Polymarket price = the last CLOB history point at or before t for that team's token (<= 60 min old; it is a traded /
  mid price, NOT the ask, so PM cost is taken as price + 1c, an optimistic stand-in for the ask).
GAP = |Kalshi mid - Polymarket price| on the same team, in percentage points.
ARB (locked, both legs to resolution): buy team X YES on Kalshi at its ask + team Y on Polymarket at p + 1c, for both
(X, Y) pairings. Cost per pair = askK + 0.07 askK (1 - askK) [Kalshi taker fee, before its round-up to the cent per order]
+ qP + rate qP (1 - qP) [Polymarket fee]. Profit = 1 - cost per $1 payout. Both legs settle on the same game winner.
Run: python3 -I backtest/research/kalshi_pm_research.py <kx.jsonl>
"""
import json, sys, statistics as st, datetime as dt, collections

G = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
G = [g for g in G if g.get('start')]

def last(h, t, maxage=3600):
    p = None
    for ts, v in h:
        if ts <= t: p = (ts, v)
        else: break
    return p[1] if p and t - p[0] <= maxage else None

obs = []   # per (game, t)
for g in G:
    a, b = g['away'], g['home']
    ka = {c[0]: c for c in g['k'][a]['c']}; kb = {c[0]: c for c in g['k'][b]['c']}
    for t in sorted(set(ka) & set(kb)):
        if not (g['start'] - 7 * 86400 <= t <= g['start']): continue
        A, B = ka[t], kb[t]
        if None in (A[1], A[2], B[1], B[2]) or A[2] <= 0 or B[2] <= 0 or A[2] >= 1 or B[2] >= 1: continue
        pa, pb = last(g['p'][a], t), last(g['p'][b], t)
        if pa is None or pb is None: continue
        best = None
        for (askK, qP, xK) in ((A[2], pb + .01, a), (B[2], pa + .01, b)):
            if qP >= 1: continue
            cost = askK + .07 * askK * (1 - askK) + qP + g['pm_fee'] * qP * (1 - qP)
            if best is None or 1 - cost > best[0]: best = (1 - cost, xK, askK, qP)
        obs.append({'g': g, 't': t, 'h': (g['start'] - t) / 3600, 'gap': 100 * abs((A[1] + A[2]) / 2 - pa),
                    'spreadK': 100 * (A[2] - A[1]), 'sumPM': pa + pb, 'arb': best, 'kvol': (A[3] or 0) + (B[3] or 0)})

lg = collections.Counter(g['series'] for g in G)
d0 = dt.datetime.utcfromtimestamp(min(g['start'] for g in G)); d1 = dt.datetime.utcfromtimestamp(max(g['start'] for g in G))
print(f'Kalshi vs Polymarket, same games: {len(G)} matched games ({", ".join(f"{k[2:-4]} {v}" for k, v in lg.items())}), '
      f'{d0:%Y-%m-%d} .. {d1:%Y-%m-%d}; {len(obs):,} hourly paired observations in the 7 days before the start.')
print(f'Median volume per game: Kalshi {st.median(g["k"][g["away"]]["vol"] or 0 for g in G):,.0f} contracts | '
      f'Polymarket ${st.median(g["pm_vol"] or 0 for g in G):,.0f}. Median Kalshi spread {st.median(o["spreadK"] for o in obs):.1f}c; '
      f'median PM yes+yes sum {st.median(o["sumPM"] for o in obs):.3f}.')

def q(v, p): v = sorted(v); return v[min(len(v) - 1, int(p * len(v)))]
print('\nGAP |Kalshi mid - Polymarket price|, same team (pp):')
for lab, lo, hi in (('all', -1, 999), ('<= 1 h before start', -1, 1), ('1-6 h', 1, 6), ('6-24 h', 6, 24), ('1-7 days', 24, 999)):
    v = [o['gap'] for o in obs if lo < o['h'] <= hi]
    if v: print(f'  {lab:20} n{len(v):6}  median {st.median(v):4.1f}  p90 {q(v, .9):4.1f}  p99 {q(v, .99):5.1f}  '
                f'>= 3pp {100 * sum(x >= 3 for x in v) / len(v):5.1f}%  >= 6pp {100 * sum(x >= 6 for x in v) / len(v):5.2f}%')
print('\nBy league:')
for s in lg:
    v = [o['gap'] for o in obs if o['g']['series'] == s]
    if v: print(f'  {s[2:-4]:5} n{len(v):6}  median {st.median(v):4.1f}pp  >= 6pp {100 * sum(x >= 6 for x in v) / len(v):5.2f}%')

print('\nLOCKED ARB after fees (Kalshi ask + Polymarket price + 1c, both fees), best pairing per observation:')
for thr in (0.0, 0.01, 0.02, 0.03, 0.05):
    v = [o for o in obs if o['arb'] and o['arb'][0] > thr]
    games = {o['g']['event'] for o in v}
    print(f'  profit > {100 * thr:3.0f}c per $1: {len(v):5} observations ({100 * len(v) / max(1, len(obs)):5.2f}%) in {len(games):4} games of {len(G)}')
v = sorted([o for o in obs if o['arb'] and o['arb'][0] > 0.01], key=lambda o: -o['arb'][0])
print('\nLargest locked-arb observations (check them by hand: these are where mirages live):')
for o in v[:15]:
    g = o['g']; pr, x, askK, qP = o['arb']
    print(f'  {g["event"]:34} {o["h"]:6.1f} h before  K ask {x} {askK:.2f} + PM other {qP:.3f} -> {100 * pr:+5.1f}c  '
          f'K spread {o["spreadK"]:.0f}c, K vol that hour {o["kvol"]:,.0f}')
first = {}
for o in sorted(v, key=lambda o: o['t']): first.setdefault(o['g']['event'], o)
if first:
    pr = [o['arb'][0] for o in first.values()]
    print(f'\nFirst >1c opportunity per game: {len(first)} games, median {100 * st.median(pr):.1f}c, '
          f'median {st.median(o["h"] for o in first.values()):.1f} h before start.')

print('\nWhere the >1c locked observations sit (hours before start) and how much traded on Kalshi in that hour:')
for lab, lo, hi in (('<= 24 h', -1, 24), ('24-48 h', 24, 48), ('48-66 h', 48, 66), ('> 66 h (first hours of listing)', 66, 999)):
    w = [o for o in v if lo < o['h'] <= hi]
    if w: print(f'  {lab:32} n{len(w):4} in {len({o["g"]["event"] for o in w}):3} games, median profit {100 * st.median(o["arb"][0] for o in w):4.1f}c, '
                f'median Kalshi contracts traded that hour {st.median(o["kvol"] for o in w):,.0f}, '
                f'median Kalshi spread {st.median(o["spreadK"] for o in w):.0f}c')
    else: print(f'  {lab:32} n   0')
cap = sum(min(o['kvol'], 1e9) * o['arb'][2] for o in first.values()) if first else 0
print(f'Upper bound on capacity: if we had taken ALL Kalshi volume traded in the first >1c hour of each game, the Kalshi '
      f'leg would total ${cap:,.0f} over {len(first)} games ({(max(g["start"] for g in G) - min(g["start"] for g in G)) / 86400:.0f} days).')
