"""Polymarket "Bitcoin above $K on <date>?" vs the probability implied by Deribit options (owner 2026-10-13).
Each daily event has ~11 strikes and resolves on the Binance BTC/USDT 1m candle closing at 12:00 ET. For every strike and
entry horizon H before the end: market price p (CLOB prices-history, Yes token), BTC spot S (Binance spot 1m archive),
implied vol sigma = Deribit DVOL (30-day ATM implied vol, hourly) -> model P(S_T > K) = N((ln(S/K) - sigma^2 T/2)/(sigma sqrt T)).
Trade when |P - p| >= edge: buy the cheap side at p + 1c, fee 0.07 x p(1-p) per share, hold to the official result.
70/30 split by date. Also Brier score of market vs model (who forecasts better). Caveats: DVOL is 30-day ATM vol (no term
structure, no skew); prices-history is a mid/last series, not the ask.
Run: python3 backtest/research/pmb_options.py <cache dir> [days]  -> prints the report
"""
import json, sys, os, math, time, io, zipfile, urllib.request, datetime as dt, concurrent.futures as cf
CACHE = sys.argv[1]; DAYS = int(sys.argv[2]) if len(sys.argv) > 2 else 170
os.makedirs(CACHE, exist_ok=True)
G, C = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'
def get(u, raw=False, tries=4):
    for k in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'spacehub-research'}), timeout=30).read()
            return r if raw else json.loads(r)
        except Exception:
            time.sleep(1 + 2 * k)
    return None
def cached(name, fn):
    p = os.path.join(CACHE, name)
    if os.path.exists(p): return json.load(open(p))
    v = fn(); json.dump(v, open(p, 'w')); return v

today = dt.date.today()
days = [today - dt.timedelta(days=k) for k in range(2, DAYS + 2)]
def event(d):
    slug = f"bitcoin-above-on-{d.strftime('%B').lower()}-{d.day}-{d.year}"
    e = get(f'{G}/events?slug={slug}')
    if not e: return None
    out = []
    for m in e[0].get('markets', []):
        try:
            px = [float(x) for x in json.loads(m['outcomePrices'])]; tok = json.loads(m['clobTokenIds'])[0]
            k = float(m['question'].split('$')[1].split(' ')[0].replace(',', '').replace('k', '000'))
        except Exception: continue
        if sorted(px) != [0.0, 1.0]: continue
        out.append({'K': k, 'yes_won': px[0] == 1.0, 'end': int(dt.datetime.fromisoformat(m['endDate'].replace('Z', '+00:00')).timestamp()), 'tok': tok,
                    'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0, 'vol': float(m.get('volumeNum') or 0)})
    return out
def hist(m):
    h = get(f"{C}/prices-history?market={m['tok']}&startTs={m['end'] - 26 * 3600}&endTs={m['end']}&fidelity=5")
    return [(int(x['t']), float(x['p'])) for x in (h or {}).get('history', [])]

mk = cached('markets.json', lambda: [dict(m, day=str(d)) for d in days for m in (event(d) or [])])
print('strike-markets', len(mk), 'days', len({m['day'] for m in mk}), file=sys.stderr)
def withh(m):
    p = os.path.join(CACHE, f"h_{m['tok'][:20]}.json")
    if os.path.exists(p): return json.load(open(p))
    h = hist(m); json.dump(h, open(p, 'w')); return h
with cf.ThreadPoolExecutor(16) as ex: H = list(ex.map(withh, mk))

# DVOL hourly
def dvol():
    out, end = [], int(time.time() * 1000); start = end - (DAYS + 5) * 86400_000
    while True:
        r = get(f'https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&start_timestamp={start}&end_timestamp={end}&resolution=3600')['result']
        out += [(int(x[0] / 1000), x[4]) for x in r['data']]
        if not r.get('continuation') or r['continuation'] <= start: break
        end = r['continuation']
    return sorted(set(map(tuple, out)))
DV = dict((t, v) for t, v in cached('dvol.json', dvol))
# BTC spot 1m closes from the Binance archive (daily zips)
spot = {}
for d in sorted({m['day'] for m in mk}) + []:
    for dd in (dt.date.fromisoformat(d) - dt.timedelta(days=1), dt.date.fromisoformat(d)):
        p = os.path.join(CACHE, f'btc_{dd}.json')
        if not os.path.exists(p):
            z = get(f'https://data.binance.vision/data/spot/daily/klines/BTCUSDT/1m/BTCUSDT-1m-{dd}.zip', raw=True)
            rows = {}
            if z:
                for line in zipfile.ZipFile(io.BytesIO(z)).read(zipfile.ZipFile(io.BytesIO(z)).namelist()[0]).decode().splitlines():
                    f = line.split(','); t = int(f[0]); t = t // 1000 if t > 1e14 else t  # micro- or milli-seconds
                    rows[str(t // 1000 // 60 * 60)] = float(f[4])
            json.dump(rows, open(p, 'w'))
        spot.update({int(k): v for k, v in json.load(open(p)).items()})
print('spot minutes', len(spot), 'dvol hours', len(DV), file=sys.stderr)

N = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
def at(h, t):
    p = None
    for ts, v in h:
        if ts <= t: p = v
        else: break
    return p
rows = []
for m, h in zip(mk, H):
    for Hs in (86400, 21600, 7200, 3600, 1800):
        t = m['end'] - Hs; p = at(h, t); S = spot.get(t // 60 * 60 - 60); sig = DV.get(t // 3600 * 3600)
        if p is None or S is None or sig is None or not (0.02 <= p <= 0.98): continue
        T = Hs / (365 * 86400); s = sig / 100 * math.sqrt(T)
        P = N((math.log(S / m['K']) - s * s / 2) / s)
        rows.append((m['day'], Hs, p, P, m['yes_won'], m['fee']))
rows.sort(key=lambda r: r[0]); cut = rows[int(len(rows) * .7)][0] if rows else ''
print(f'rows {len(rows)} | split at {cut}')
for Hs in (86400, 21600, 7200, 3600, 1800):
    r = [x for x in rows if x[1] == Hs]
    if not r: continue
    bm = sum((x[2] - x[4]) ** 2 for x in r) / len(r); bo = sum((x[3] - x[4]) ** 2 for x in r) / len(r)
    print(f'H={Hs // 60:5}m n={len(r):5}  Brier market {bm:.4f}  options-model {bo:.4f}  ({"market better" if bm < bo else "model better"})')
print('\nedge  H(min) | IS n  WR   ret%/$  t   | OOS n  WR   ret%/$  t')
def trade(x, e):
    _, Hs, p, P, won, fee = x
    if P - p >= e: q, w = p, won
    elif p - P >= e: q, w = 1 - p, not won
    else: return None
    b = min(.999, q + .01); c = b + fee * b * (1 - b)
    return ((1 if w else 0) - c) / c, w
for e in (0.03, 0.05, 0.08, 0.12):
    for Hs in (None, 86400, 21600, 7200, 3600, 1800):
        out = []
        for half in (False, True):
            v = [trade(x, e) for x in rows if (x[0] >= cut) == half and (Hs is None or x[1] == Hs)]
            v = [z for z in v if z]
            if len(v) < 20: out.append(f'n{len(v):4}'); continue
            r = [a for a, _ in v]; mu = sum(r) / len(r); sd = (sum((a - mu) ** 2 for a in r) / len(r)) ** .5 or 1e-9
            out.append(f'n{len(v):4} {100 * sum(w for _, w in v) / len(v):4.0f}% {100 * mu:+6.2f} {mu / sd * math.sqrt(len(v)):+5.2f}')
        print(f'{e:.2f}  {"all" if Hs is None else Hs // 60:>6} | ' + ' | '.join(out))
