"""Polymarket crypto Up/Down 5m: can the live desk take MORE trades without losing its edge? (owner 2026-10-14: "more quick
trades for Poly Coins"). Simulates the desk window by window, as it trades: ONE position per 5m window, coins in rule order
(btc, eth, sol, xrp), the first coin that qualifies is taken. Each candidate rule is the live rule PLUS one addition, and the
ADDED trades are reported on their own (they are what the change would add to the account):
  LIVE        L180 (price point at or before end-180 s), favourite in 90-98c, z >= 1 on its side
  +BAND85     the same moment, band widened to 85-98c (z >= k)
  +L120 k     windows LIVE did not enter: a second look at end-120 s, 90-98c, z >= k
  +L60 k      the same at end-60 s
Prices / z / fee / slip / IS-OOS split exactly as pmc_distance.py (same-second spot rule, fee 0.07 p(1-p), +1c, 70/30 by time).
Run: python3 -I backtest/research/pmc_more.py <pmc.jsonl> <dir of {COIN}-YYYY-MM-DD.zip Binance 1s klines>
"""
import json, sys, math, os, io, zipfile, statistics as st, datetime as dt
import numpy as np

rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
rows = [r for r in rows if r.get('tf') == '5m' and r.get('h')]
KD = sys.argv[2]
T0 = int(dt.datetime(2026, 9, 25, tzinfo=dt.timezone.utc).timestamp())
spot = {}
for c in ('BTC', 'ETH', 'SOL', 'XRP'):
    arr = np.full(24 * 86400, np.nan)
    for f in sorted(os.listdir(KD)):
        if not f.startswith(c + '-'): continue
        try: z = zipfile.ZipFile(os.path.join(KD, f))
        except Exception: continue
        data = np.loadtxt(io.TextIOWrapper(z.open(z.namelist()[0])), delimiter=',', usecols=(0, 4))
        t = data[:, 0]; t = np.where(t > 1e14, t // 1e6, t // 1e3).astype(np.int64)
        i = t - T0; ok = (i >= 0) & (i < arr.size)
        arr[i[ok]] = data[ok, 1]
    m = np.isnan(arr); idx = np.where(~m, np.arange(arr.size), 0); np.maximum.accumulate(idx, out=idx); arr = arr[idx]; arr[:np.argmax(~m)] = np.nan
    spot[c.lower()] = arr

def S(coin, t):
    i = t - T0
    if i < 3600 or i >= spot[coin].size: return None
    v = spot[coin][i]
    return None if not np.isfinite(v) else float(v)

def sig(coin, t):
    i = t - T0; w = spot[coin][i - 3600:i + 1]
    if not np.all(np.isfinite(w)): return None
    s = float(np.diff(np.log(w)).std())
    return s if s > 0 else None

def look(r, L):
    """(favourite price, z on its side, favourite won) at the last price point <= end - L, spot read at that point's second."""
    pt = None
    for ts, v in r['h']:
        if ts <= r['end'] - L: pt = (ts, v)
        else: break
    if pt is None or pt[0] < r['start']: return None
    t, p = pt
    s0, s1, sg = S(r['coin'], r['start']), S(r['coin'], t), sig(r['coin'], t)
    if s0 is None or s1 is None or sg is None: return None
    z = math.log(s1 / s0) / (sg * math.sqrt(r['end'] - t))
    return (p, z, r['up_won']) if p >= .5 else (1 - p, -z, not r['up_won'])

def ret(q, won, fee, slip=.01):
    b = min(.999, q + slip); c = b + fee * b * (1 - b)
    return ((1 if won else 0) - c) / c

wins = {}
for r in rows: wins.setdefault(r['end'], {})[r['coin']] = r
ends = sorted(wins); cut = ends[int(len(ends) * .7)]
days = (ends[-1] - ends[0]) / 86400
ORDER = ('btc', 'eth', 'sol', 'xrp')
cache = {}
def L_(r, L):
    k = (r['slug'], L)
    if k not in cache: cache[k] = look(r, L)
    return cache[k]

def first(w, L, lo, hi, k):
    for c in ORDER:
        r = w.get(c)
        if not r: continue
        x = L_(r, L)
        if x and lo <= x[0] < hi and x[1] >= k: return r, x
    return None

def run(extra):
    """extra(w) -> (r, x) or None, tried only in windows where LIVE took nothing. Returns (live trades, added trades)."""
    live, add = [], []
    for e in ends:
        w = wins[e]; oos = e >= cut
        h = first(w, 180, .90, .98, 1.0)
        if h: live.append((ret(h[1][0], h[1][2], h[0]['fee']), h[1][2], oos)); continue
        h = extra(w) if extra else None
        if h: add.append((ret(h[1][0], h[1][2], h[0]['fee']), h[1][2], oos))
    return live, add

def stat(v):
    if len(v) < 20: return f'n{len(v):4}{"":31}'
    r = [a for a, _, _ in v]; mu = sum(r) / len(r); sd = st.pstdev(r) or 1e-9
    return f'n{len(v):4} WR {100 * sum(w for _, w, _ in v) / len(v):5.1f}% {100 * mu:+6.2f}%/$ t{mu / sd * math.sqrt(len(v)):+6.2f}'
def both(v): return f'{stat([y for y in v if not y[2]])} | {stat([y for y in v if y[2]])}'

print(f'Polymarket crypto Up/Down 5m — more trades for the live desk? {len(rows)} markets, {len(ends)} windows, {days:.1f} days,')
print(f'{sum(1 for e in ends if len(wins[e]) == 4)} windows with all 4 coins. One position per window, coins in order btc/eth/sol/xrp.')
print('IS = first 70% of windows by time, OOS = last 30%. Fee 0.07 p(1-p), +1c slip, hold to the official result.\n')
live, _ = run(None)
print(f'LIVE (L180, 90-98c, z>=1)       {both(live)}   ~{len(live) / days:.0f} trades/day\n')
print('ADDED trades only (windows LIVE skipped):        IS                                  | OOS')
cands = []
for k in (1, 1.5, 2):
    cands.append((f'+BAND 85-90c z>={k}', (lambda k: lambda w: first(w, 180, .85, .90, k))(k)))
for L in (120, 60):
    for k in (1, 1.5, 2, 2.5):
        cands.append((f'+L{L} 90-98c z>={k}', (lambda L, k: lambda w: first(w, L, .90, .98, k))(L, k)))
for name, f in cands:
    _, add = run(f)
    print(f'  {name:22} {both(add)}   +{len(add) / days:.0f}/day')
print('\nCOMBINED (LIVE + additions, every trade):')
for name, f in (('LIVE + L120 z>=1.5', lambda w: first(w, 120, .90, .98, 1.5)),
                ('LIVE + L120 z>=1.5 + L60 z>=1.5', lambda w: first(w, 120, .90, .98, 1.5) or first(w, 60, .90, .98, 1.5)),
                ('LIVE + L120 z>=2 + L60 z>=2', lambda w: first(w, 120, .90, .98, 2) or first(w, 60, .90, .98, 2)),
                ('LIVE + L120 z>=2.5 + L60 z>=2.5', lambda w: first(w, 120, .90, .98, 2.5) or first(w, 60, .90, .98, 2.5)),
                ('LIVE + band85 z>=1.5 + L120 + L60 z>=1.5', lambda w: first(w, 180, .85, .90, 1.5) or first(w, 120, .90, .98, 1.5) or first(w, 60, .90, .98, 1.5))):
    l, a = run(f)
    print(f'  {name:42} {both(l + a)}   ~{len(l + a) / days:.0f}/day')
