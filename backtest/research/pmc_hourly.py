"""Polymarket crypto Up/Down on LONGER windows: hourly ({coin}-up-or-down-{month}-{day}-2026-{h}{am|pm}-et, Binance 1h candle
open vs close) and daily ({coin}-up-or-down-on-{month}-{day}-2026, Binance 1m close at 12:00 ET the day before vs 12:00 ET).
Owner 2026-10-14, research only: does the distance filter that works on the 5m desk carry to 1h / 1d windows?
For every resolved market and entry L minutes before the end:
  p      = last CLOB price point (Up token, 1-minute fidelity) at or before end - L
  S      = Binance spot 1m close of the bar that ended at or before that point (no look-ahead)
  z      = ln(S / S_open) / (sigma_1m * sqrt(minutes left)), sigma_1m = stdev of 1m log returns over the previous 24 h
Rules: buy the favourite at p + 1c (cap 0.999), fee 0.07 p(1-p) per share, hold to the official result; IS = first 70% of
markets by end time, OOS = last 30%. BASE = favourite in [lo, hi); ZMIN k = BASE and z >= k on the favourite's side.
Run: python3 -I backtest/research/pmc_hourly.py <cache dir> [hourly days] [daily days]
"""
import json, sys, os, time, math, statistics as st, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo
import numpy as np

D = sys.argv[1]; os.makedirs(D, exist_ok=True)
HD = int(sys.argv[2]) if len(sys.argv) > 2 else 60
DD = int(sys.argv[3]) if len(sys.argv) > 3 else 180
G, C, B = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com', 'https://data-api.binance.vision'
ET = ZoneInfo('America/New_York')
COINS = {'btc': ('bitcoin', 'BTCUSDT'), 'eth': ('ethereum', 'ETHUSDT'), 'sol': ('solana', 'SOLUSDT'), 'xrp': ('xrp', 'XRPUSDT')}
MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

def get(u):
    for k in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30))
        except Exception: time.sleep(1 + 2 * k)
    return None

now = int(time.time())
def slugs():
    out = []
    end = now // 3600 * 3600 - 3600
    for t in range(end - HD * 86400, end, 3600):        # t = hourly window start (UTC)
        e = dt.datetime.fromtimestamp(t, ET)
        if e.year != 2026: continue
        h = e.hour % 12 or 12
        for c, (name, _) in COINS.items():
            out.append((f'{name}-up-or-down-{MON[e.month - 1]}-{e.day}-2026-{h}{"am" if e.hour < 12 else "pm"}-et', 'h', c, t, t + 3600))
    d0 = dt.datetime.fromtimestamp(now, ET).date()
    for k in range(1, DD + 1):
        d = d0 - dt.timedelta(days=k)
        if d.year != 2026: continue
        endt = int(dt.datetime(d.year, d.month, d.day, 12, tzinfo=ET).timestamp())
        for c, (name, _) in COINS.items():
            out.append((f'{name}-up-or-down-on-{MON[d.month - 1]}-{d.day}-2026', 'd', c, endt - 86400, endt))
    return out

MK = os.path.join(D, 'markets.jsonl')
if not os.path.exists(MK):
    S = slugs()
    def one(s):
        slug, tf, c, t0, t1 = s
        ev = get(f'{G}/events?slug={slug}')
        if not ev: return None
        m = ev[0]['markets'][0]
        try: op = [float(x) for x in json.loads(m.get('outcomePrices') or '[]')]
        except Exception: return None
        if sorted(op) != [0.0, 1.0] or not m.get('closed'): return None
        tok = json.loads(m['clobTokenIds'])[0]
        # resolution at t1 for hourly; the daily closes on the 12:00 ET candle, i.e. one minute after t1
        h = get(f'{C}/prices-history?market={tok}&startTs={t1 - (3600 if tf == "h" else 86400)}&endTs={t1}&fidelity=1') or {}
        return {'slug': slug, 'tf': tf, 'coin': c, 'start': t0, 'end': t1, 'up_won': op[0] == 1.0,
                'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0,
                'v': float(m.get('volumeNum') or 0), 'h': [(x['t'], x['p']) for x in h.get('history', [])]}
    with ThreadPoolExecutor(16) as ex, open(MK, 'w') as f:
        n = 0
        for r in ex.map(one, S):
            if r: f.write(json.dumps(r) + '\n'); n += 1
    print(f'markets: {n} of {len(S)} slugs', file=sys.stderr)
rows = [json.loads(l) for l in open(MK)]

spot = {}
for c, (_, sym) in COINS.items():
    fp = os.path.join(D, f'{sym}.npy')
    if not os.path.exists(fp):
        t0 = (min(r['start'] for r in rows if r['coin'] == c) - 2 * 86400) * 1000
        out = []
        while t0 < now * 1000:
            k = get(f'{B}/api/v3/klines?symbol={sym}&interval=1m&limit=1000&startTime={t0}')
            if not k: break
            out += [(x[0] // 1000, float(x[1]), float(x[4])) for x in k]
            t0 = k[-1][0] + 60000
            if len(k) < 1000: break
        np.save(fp, np.array(out))
    a = np.load(fp)
    spot[c] = {int(t): (o, cl) for t, o, cl in a}
    spot[c + '_t'] = a[:, 0].astype(np.int64); spot[c + '_c'] = a[:, 2]

def closeAt(c, t):
    """close of the last 1m bar that ENDED at or before t (bar open <= t - 60)."""
    ts = spot[c + '_t']; i = np.searchsorted(ts, t - 60, side='right') - 1
    return None if i < 0 or ts[i] < t - 600 else (float(spot[c + '_c'][i]), i)

def sig(c, i):
    w = spot[c + '_c'][max(0, i - 1440):i + 1]
    if len(w) < 600: return None
    s = float(np.diff(np.log(w)).std())
    return s or None

def openOf(r):
    if r['tf'] == 'h':
        b = spot[r['coin']].get(r['start']); return b[0] if b else None
    b = spot[r['coin']].get(r['start']); return b[1] if b else None   # daily: close of the 12:00 ET 1m candle

def look(r, L):
    pt = None
    for t, p in r['h']:
        if t <= r['end'] - L * 60: pt = (t, p)
        else: break
    if pt is None or pt[0] < r['start']: return None
    t, p = pt
    x = closeAt(r['coin'], t); s0 = openOf(r)
    if not x or not s0: return None
    s1, i = x; sg = sig(r['coin'], i)
    if not sg: return None
    left = (r['end'] - t) / 60
    z = math.log(s1 / s0) / (sg * math.sqrt(max(left, 1)))
    return (p, z, r['up_won']) if p >= .5 else (1 - p, -z, not r['up_won'])

def ret(q, won, fee, slip=.01):
    b = min(.999, q + slip); c = b + fee * b * (1 - b)
    return ((1 if won else 0) - c) / c

def stat(v):
    if len(v) < 15: return f'n{len(v):4}{"":30}'
    mu = sum(x for x, _ in v) / len(v); sd = st.pstdev([x for x, _ in v]) or 1e-9
    return f'n{len(v):4} WR {100 * sum(w for _, w in v) / len(v):5.1f}% {100 * mu:+6.2f}%/$ t{mu / sd * math.sqrt(len(v)):+5.2f}'

for tf, Ls, name in (('h', (30, 20, 15, 10, 5, 3), 'HOURLY'), ('d', (360, 240, 120, 60, 30, 10), 'DAILY')):
    rs = sorted([r for r in rows if r['tf'] == tf and len(r['h']) >= 3], key=lambda r: r['end'])
    if not rs: continue
    cut = rs[int(len(rs) * .7)]['end']
    print(f'\n{name}: {len(rs)} resolved markets, {dt.datetime.utcfromtimestamp(rs[0]["end"]):%Y-%m-%d} .. '
          f'{dt.datetime.utcfromtimestamp(rs[-1]["end"]):%Y-%m-%d}, median volume ${st.median(r["v"] for r in rs):,.0f}')
    print(f'{"rule":30}{"IS":45}| OOS')
    for L in Ls:
        xs = [(r, look(r, L)) for r in rs]
        xs = [(r, x) for r, x in xs if x]
        for lo, hi in ((.90, .98), (.80, .90), (.70, .80)):
            for k in (None, 1.0, 1.5, 2.0, 2.5):
                sel = [(r, x) for r, x in xs if lo <= x[0] < hi and (k is None or x[1] >= k)]
                isv = [(ret(x[0], x[2], r['fee']), x[2]) for r, x in sel if r['end'] < cut]
                oos = [(ret(x[0], x[2], r['fee']), x[2]) for r, x in sel if r['end'] >= cut]
                lab = f'L{L}m {int(lo * 100)}-{int(hi * 100)}c ' + ('base' if k is None else f'z>={k}')
                print(f'  {lab:28}{stat(isv):45}| {stat(oos)}')
