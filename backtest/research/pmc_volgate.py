"""Polymarket crypto Up/Down 5m: a volatility gate on top of the distance filter (Grok's proposal, owner 2026-10-15).
Pre-registered before reading: the live entry (z >= 1.5 at the first look, z >= 2.5 at the second look) is kept, and an entry is
taken ONLY when the coin's short-term volatility before the entry is ABOVE the median of the same measure over the IS period.
Entry price, fee, slippage and exit are untouched (buy the favourite at p + 1c, fee 0.07 p(1-p), hold to the result).
Two volatility measures (both from Binance 1 s spot, read at the price point's own second, no look-ahead):
  v5   = stdev of 1 s log returns over the 300 s before the entry point
  pw   = high-low range of the PREVIOUS 5 m window / its open (the "ATR of the previous window")
Reported against the plain z >= 1.5 rule (the desk as it trades: one position per window, coins in order btc/eth/sol/xrp,
first look at end-180 s, second look at end-120 s and end-60 s). The inverse gate (BELOW the median) is shown as a
diagnostic only. IS = first 70% of windows by time, OOS = last 30%. Sharpe = mean / sd of DAILY P&L x sqrt(365) at a fixed
$30 stake per trade; t = mean / sd x sqrt(days).
Run: python3 -I backtest/research/pmc_volgate.py <pmc5.jsonl> <dir of {COIN}-YYYY-MM-DD.zip Binance 1s klines>
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

def sd(coin, t, n):
    i = t - T0; w = spot[coin][i - n:i + 1]
    if len(w) < n or not np.all(np.isfinite(w)): return None
    s = float(np.diff(np.log(w)).std())
    return s if s > 0 else None

def prevRange(coin, start):
    i = start - T0; w = spot[coin][i - 300:i + 1]
    if len(w) < 300 or not np.all(np.isfinite(w)): return None
    return float((w.max() - w.min()) / w[0])

def look(r, L):
    pt = None
    for ts, v in r['h']:
        if ts <= r['end'] - L: pt = (ts, v)
        else: break
    if pt is None or pt[0] < r['start']: return None
    t, p = pt
    s0, s1, sg = S(r['coin'], r['start']), S(r['coin'], t), sd(r['coin'], t, 3600)
    v5, pw = sd(r['coin'], t, 300), prevRange(r['coin'], r['start'])
    if s0 is None or s1 is None or sg is None or v5 is None or pw is None: return None
    z = math.log(s1 / s0) / (sg * math.sqrt(r['end'] - t))
    q, zf, won = (p, z, r['up_won']) if p >= .5 else (1 - p, -z, not r['up_won'])
    return {'q': q, 'z': zf, 'won': won, 'v5': v5, 'pw': pw}

def ret(q, won, fee, slip=.01):
    b = min(.999, q + slip); c = b + fee * b * (1 - b)
    return ((1 if won else 0) - c) / c

wins = {}
for r in rows: wins.setdefault(r['end'], {})[r['coin']] = r
ends = sorted(wins); cut = ends[int(len(ends) * .7)]
ORDER = ('btc', 'eth', 'sol', 'xrp')
LOOKS = ((180, 1.5), (120, 2.5), (60, 2.5))       # the live desk: first look z >= 1.5, second look z >= 2.5
cache = {}
def L_(r, L):
    k = (r['slug'], L)
    if k not in cache: cache[k] = look(r, L)
    return cache[k]

# IS medians of each measure, over every in-band candidate the plain rule would see in IS windows
iso = [x for e in ends if e < cut for r in wins[e].values() for L, _ in LOOKS if (x := L_(r, L)) and .90 <= x['q'] < .98]
MED = {k: float(np.median([x[k] for x in iso])) for k in ('v5', 'pw')}

def run(gate):
    out = []
    for e in ends:
        w = wins[e]; hit = None
        for L, k in LOOKS:
            for c in ORDER:
                r = w.get(c)
                if not r: continue
                x = L_(r, L)
                if x and .90 <= x['q'] < .98 and x['z'] >= k and gate(x):
                    hit = (r, x); break
            if hit: break
        if hit:
            r, x = hit
            out.append((e, ret(x['q'], x['won'], r['fee']), x['won']))
    return out

STAKE = 30
def stat(v, base_n):
    if len(v) < 10: return f'n{len(v):4}'
    rr = [a for _, a, _ in v]; mu = sum(rr) / len(rr)
    day = {}
    for e, a, _ in v: day[e // 86400] = day.get(e // 86400, 0) + a * STAKE
    d = list(day.values()); dm = sum(d) / len(d); dsd = st.pstdev(d) or 1e-9
    cutp = f'{100 * (1 - len(v) / base_n):4.0f}%' if base_n else '   -'
    return (f'n{len(v):4} cut {cutp} WR {100 * sum(w for *_, w in v) / len(v):5.1f}% losses {sum(1 for *_, w in v if not w):2} '
            f'{100 * mu:+6.2f}%/$ ${sum(rr) * STAKE:+8.2f} Sharpe {dm / dsd * math.sqrt(365):+6.1f} t {dm / dsd * math.sqrt(len(d)):+5.2f}')

def both(v, b):
    i = [x for x in v if x[0] < cut]; o = [x for x in v if x[0] >= cut]
    bi = len([x for x in b if x[0] < cut]); bo = len([x for x in b if x[0] >= cut])
    return stat(i, bi), stat(o, bo)

days = (ends[-1] - ends[0]) / 86400
print(f'Polymarket 5m Up/Down: volatility gate on top of z (Grok, pre-registered). {len(rows)} markets, {len(ends)} windows, '
      f'{days:.1f} days ({dt.datetime.utcfromtimestamp(ends[0]):%Y-%m-%d} .. {dt.datetime.utcfromtimestamp(ends[-1]):%Y-%m-%d}).')
print(f'The live desk: one position per window, first look z >= 1.5 (end-180 s), then z >= 2.5 (end-120 s, end-60 s).')
print(f'IS medians: v5 (1 s stdev, 300 s before entry) = {MED["v5"]:.2e}; pw (previous 5 m range / open) = {100 * MED["pw"]:.3f}%.')
print(f'P&L at a fixed ${STAKE} stake; Sharpe on daily P&L x sqrt(365). IS = first 70% of windows, OOS = last 30%.\n')
base = run(lambda x: True)
rules = [('BASE  z only (live v4 at 1.5)', lambda x: True),
         ('GATE  v5 > IS median  [pre-registered]', lambda x: x['v5'] > MED['v5']),
         ('GATE  pw > IS median  [pre-registered]', lambda x: x['pw'] > MED['pw']),
         ('diag  v5 < IS median (inverse)', lambda x: x['v5'] <= MED['v5']),
         ('diag  pw < IS median (inverse)', lambda x: x['pw'] <= MED['pw'])]
for name, g in rules:
    a, b = both(run(g), base)
    print(f'{name:40} IS  {a}')
    print(f'{"":40} OOS {b}')
