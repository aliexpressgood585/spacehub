"""The LIVE Poly Coins rule over a long span (owner 2026-10-15: "did you test the existing bot over a long range? -> run it").
Rule exactly as shared/pmc.ts v4 trades it: 5m Up/Down on BTC/ETH/SOL/XRP, one position per window, coins in order btc/eth/
sol/xrp; first look at end-180 s with the favourite at 90-98c and z >= 1.5; then end-120 s and end-60 s with z >= 2.5.
z = ln(spot / spot at the window open) / (stdev of 1 s log returns over the last hour x sqrt(seconds left)), Binance 1 s spot
read at the CLOB price point's own second (no look-ahead). Buy at p + 1c (cap 0.999), taker fee rate x p(1-p) per share,
hold to the official result. Fee: the market's own schedule, and a second pass charging today's 0.07 on every market.
Account: the live sizing (stake = min(3% equity, (equity - floor) / 3), floor = 90% of $1,000 + half of every profit peak).
Data: pmc_long_fetch.py (every STEP-th window sampled) + Binance 1 s monthly/daily archives as {COIN}.npy from 2026-04-01.
Run: python3 -I backtest/research/pmc_long.py <markets.jsonl> <dir with BTC.npy ETH.npy SOL.npy XRP.npy>
"""
import json, sys, math, os, statistics as st, datetime as dt
import numpy as np

rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
rows = [r for r in rows if r.get('h')]
T0 = int(dt.datetime(2026, 4, 1, tzinfo=dt.timezone.utc).timestamp())
spot = {}
for c in ('btc', 'eth', 'sol', 'xrp'):
    a = np.load(os.path.join(sys.argv[2], c.upper() + '.npy'))
    m = np.isnan(a); idx = np.where(~m, np.arange(a.size), 0); np.maximum.accumulate(idx, out=idx); a = a[idx]
    a[:np.argmax(~m)] = np.nan
    spot[c] = a
    gaps = m[:np.where(~m)[0][-1]].sum() if (~m).any() else -1
    print(f'{c.upper()} 1s spot: {(~m).sum():,} seconds, {gaps:,} missing seconds before the last one (forward-filled)', file=sys.stderr)

def S(c, t):
    i = t - T0
    if i < 3600 or i >= spot[c].size: return None
    v = spot[c][i]
    return float(v) if np.isfinite(v) else None

def sig(c, t):
    i = t - T0; w = spot[c][i - 3600:i + 1]
    if len(w) < 3601 or not np.all(np.isfinite(w)): return None
    s = float(np.diff(np.log(w)).std())
    return s or None

def look(r, L):
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
ends = sorted(wins)
ORDER = ('btc', 'eth', 'sol', 'xrp')
LOOKS = tuple(tuple(float(x) for x in l.split(':')) for l in os.environ.get('LOOKS', '180:1.5,120:2.5,60:2.5').split(','))   # env LOOKS='L:zmin,...' for variants

def run(feeFloor):
    out = []
    for e in ends:
        w = wins[e]; hit = None
        for L, k in LOOKS:
            for c in ORDER:
                r = w.get(c)
                if not r: continue
                x = look(r, L)
                if x and .90 <= x[0] < .98 and x[1] >= k: hit = (r, x, L); break
            if hit: break
        if hit:
            r, (q, z, won), L = hit
            out.append({'e': e, 'r': ret(q, won, max(r['fee'], feeFloor)), 'won': won, 'coin': r['coin'], 'L': L, 'z': z, 'q': q,
                        'fee': r['fee'], 'vol': r['vol']})
    return out

STAKE = 30
def line(v):
    if not v: return 'n   0'
    rr = [x['r'] for x in v]; mu = sum(rr) / len(rr); sd = st.pstdev(rr) or 1e-9
    return (f'n{len(v):5} WR {100 * sum(x["won"] for x in v) / len(v):5.1f}% losses {sum(1 for x in v if not x["won"]):3} '
            f'{100 * mu:+6.2f}%/$ t{mu / sd * math.sqrt(len(v)):+5.2f}  ${sum(rr) * STAKE:+8.2f} at ${STAKE}/trade')

def account(v):
    eq = peak = start = 1000.0; low = eq; worst = 0.0; streak = mx = 0
    for x in v:
        floor = start * .9 + .5 * max(0, peak - start)
        stake = max(0, min(eq * .03, (eq - floor) / 3))
        eq += stake * x['r']; peak = max(peak, eq); low = min(low, eq); worst = max(worst, 1 - eq / peak)
        streak = 0 if x['won'] else streak + 1; mx = max(mx, streak)
    return eq, low, worst, mx

days = (ends[-1] - ends[0]) / 86400
print(f'LIVE Poly Coins rule (v4, z>=1.5 / 2.5) over a long span. {len(rows):,} markets in {len(ends):,} sampled windows '
      f'(every 3rd 5m window), {days:.0f} days: {dt.datetime.utcfromtimestamp(ends[0]):%Y-%m-%d} .. {dt.datetime.utcfromtimestamp(ends[-1]):%Y-%m-%d}.')
print(f'Median market volume ${st.median(r["vol"] for r in rows):,.0f}; markets with fees enabled {100 * sum(1 for r in rows if r["fee"]) / len(rows):.0f}%.')
print('Buy at the last CLOB price at or before the look + 1c, fee rate x p(1-p), held to the official result.\n')
for lab, ff in (("market's own fee", 0.0), ('fee 0.07 charged on every market (today\'s schedule)', 0.07)):
    v = run(ff)
    print(f'=== {lab}')
    print(f'  ALL      {line(v)}')
    cut = ends[int(len(ends) * .7)]
    print(f'  IS 70%   {line([x for x in v if x["e"] < cut])}')
    print(f'  OOS 30%  {line([x for x in v if x["e"] >= cut])}')
    for L in (180, 120, 60):
        print(f'  look L{L:<4}{line([x for x in v if x["L"] == L])}')
    for c in ORDER:
        print(f'  {c.upper():8} {line([x for x in v if x["coin"] == c])}')
    for a, b in ((1.5, 2.0), (2.0, 2.5), (2.5, 99)):
        print(f'  z {a}-{b if b < 99 else "+":<4}{line([x for x in v if x["L"] == 180 and a <= x["z"] < b])}')
    print('  by month:')
    by = {}
    for x in v: by.setdefault(dt.datetime.utcfromtimestamp(x['e']).strftime('%Y-%m'), []).append(x)
    for mth in sorted(by): print(f'    {mth}  {line(by[mth])}')
    eq, low, dd, mx = account(v)
    print(f'  account with the live sizing from $1,000 (on the SAMPLED windows, ~1/3 of the real trade count): '
          f'end ${eq:,.2f}, lowest ${low:,.2f}, max drawdown {100 * dd:.1f}%, longest losing streak {mx}\n')
