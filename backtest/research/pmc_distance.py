"""Polymarket crypto Up/Down: does the coin's distance from the window's opening price, in units of its own recent
volatility, pick the winners better than the market price does? (owner 2026-10-14: "a filter for a higher win rate")
For every resolved market (pmc_fetch.py jsonl) and entry L seconds before the end:
  market price p  = last CLOB price point at or before end - L (as in pmc_research.py)
  spot            = Binance spot 1s close AT THE SAME SECOND as that price point (Chainlink, which resolves the market, tracks it closely)
  z               = ln(S[end-L] / S[start]) / (sigma_1s * sqrt(L)), sigma_1s = stdev of 1s log returns over the previous hour
  model P(up)     = N(z)
Rules (buy the favourite at p + slip, fee 0.07 p(1-p), hold to the official result), each read IS (first 70% by end time) and
OOS (last 30%):
  BASE      favourite in band [lo, hi)                                    (the live rule at lo=0.90 hi=0.98)
  ZMIN k    BASE and |z| >= k, z on the favourite's side
  EDGE e    BASE and model P(fav) - p >= e
Run: python3 -I backtest/research/pmc_distance.py <pmc.jsonl> <dir of {COIN}-YYYY-MM-DD.zip Binance 1s klines>
"""
import json, sys, math, os, io, zipfile, statistics as st, datetime as dt
import numpy as np

rows = []
for l in open(sys.argv[1]):
    try: rows.append(json.loads(l))
    except Exception: pass
KD = sys.argv[2]

T0 = int(dt.datetime(2026, 9, 21, tzinfo=dt.timezone.utc).timestamp())
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
    # forward-fill single missing seconds
    m = np.isnan(arr); idx = np.where(~m, np.arange(arr.size), 0); np.maximum.accumulate(idx, out=idx); arr = arr[idx]; arr[:np.argmax(~m)] = np.nan
    spot[c.lower()] = arr
print('spot seconds', {k: int(np.isfinite(v).sum()) for k, v in spot.items()}, file=sys.stderr)

def S(coin, t):
    i = t - T0
    if i < 3600 or i >= spot[coin].size: return None
    v = spot[coin][i]
    return None if not np.isfinite(v) else float(v)

def sig(coin, t):
    i = t - T0; w = spot[coin][i - 3600:i + 1]
    if not np.all(np.isfinite(w)): return None
    r = np.diff(np.log(w)); s = float(r.std())
    return s if s > 0 else None

def px_at(r, t):
    p = None
    for ts, v in r['h']:
        if ts <= t: p = (ts, v)
        else: break
    return p

N = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
rows.sort(key=lambda r: r['end'])
feat = {}   # (slug, L) -> (p_up, z, up_won, is_oos, fee)
def build(tf, L):
    sel = [r for r in rows if r['tf'] == tf]
    cut = sel[int(len(sel) * .7)]['end'] if sel else 0
    out = []
    for r in sel:
        pt = px_at(r, r['end'] - L)
        if pt is None: continue
        # SAME-SECOND RULE: the CLOB history has one point a minute (median 41 s older than end - L). Spot is read at the
        # point's own timestamp, so z never sees a move the price had not seen yet (the first run did: 100% WR = look-ahead).
        t, p = pt[0], pt[1]
        if t < r['start']: continue
        s0, s1, sg = S(r['coin'], r['start']), S(r['coin'], t), sig(r['coin'], t)
        if s0 is None or s1 is None or sg is None: continue
        z = math.log(s1 / s0) / (sg * math.sqrt(r['end'] - t))
        out.append((p, z, r['up_won'], r['end'] >= cut, r['fee'], r['coin']))
    return out

def trade(x, lo, hi, slip, cond):
    p, z, won_up, oos, fee, coin = x
    for q, side, won in ((p, 1, won_up), (1 - p, -1, not won_up)):
        if lo <= q < hi:
            if not cond(q, side * z): return None
            b = min(.999, q + slip); c = b + fee * b * (1 - b)
            return ((1 if won else 0) - c) / c, won, oos
    return None

def stat(v):
    if len(v) < 30: return f'n{len(v):5}{"":27}'
    r = [a for a, _, _ in v]; mu = sum(r) / len(r); sd = st.pstdev(r) or 1e-9
    return f'n{len(v):5} WR {100 * sum(w for _, w, _ in v) / len(v):5.1f}% {100 * mu:+6.2f}%/$ t{mu / sd * math.sqrt(len(v)):+5.2f}'

print('Polymarket crypto Up/Down: distance-from-open filter (z = move since the window opened / expected move in the time left)')
print('entry = favourite at the CLOB price + slip, fee 0.07*p*(1-p), hold to the result; IS = first 70% by end time, OOS = last 30%\n')
for tf, Ls in (('5m', (180, 120, 60)), ('15m', (300, 180, 120))):
    for L in Ls:
        xs = build(tf, L)
        if not xs: continue
        # calibration: how often the favourite wins, by z bucket vs by market price
        print(f'== {tf}  entry {L}s before the end  ({len(xs)} markets with spot data)')
        print('   calibration of the favourite (all prices): |z| bucket -> n, market says, model N(|z|) says, actually won')
        for a, b in ((0, .5), (.5, 1), (1, 1.5), (1.5, 2), (2, 2.5), (2.5, 3), (3, 99)):
            g = [(max(x[0], 1 - x[0]), (x[1] >= 0) == x[2] if x[0] >= .5 else (x[1] < 0) == (not x[2]), x) for x in xs]
            sub = [x for x in xs if a <= abs(x[1]) < b]
            if len(sub) < 20: continue
            mk = sum(max(x[0], 1 - x[0]) for x in sub) / len(sub)
            mo = sum(N(abs(x[1])) for x in sub) / len(sub)
            act = sum((x[2] if x[1] >= 0 else not x[2]) for x in sub) / len(sub)
            print(f'     |z| {a:3}-{b:<3} n{len(sub):5}  market {100 * mk:5.1f}%  model {100 * mo:5.1f}%  z-side won {100 * act:5.1f}%')
        for lo, hi in ((.90, .98), (.85, .98), (.80, .98), (.93, .99)):
            for slip in (.01, .015):
                print(f'   band {int(lo * 100)}-{int(hi * 100)}c slip {slip * 100:.1f}c   {"IS":^34} | {"OOS":^34}')
                rules = [('BASE', lambda q, zs: True)] + \
                        [(f'ZMIN {k}', (lambda k: lambda q, zs: zs >= k)(k)) for k in (1, 1.5, 2, 2.5, 3)] + \
                        [(f'EDGE {e}', (lambda e: lambda q, zs: N(zs) - q >= e)(e)) for e in (0, .02, .04)]
                for name, cond in rules:
                    v = [y for y in (trade(x, lo, hi, slip, cond) for x in xs) if y]
                    print(f'     {name:9} {stat([y for y in v if not y[2]])} | {stat([y for y in v if y[2]])}')
        print()
