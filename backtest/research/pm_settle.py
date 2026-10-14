"""Polymarket "decided, not settled" — history check (owner 2026-10-14, research only).
Question: in the last hours before a market is officially closed (UMA liveness ~2h after a result is proposed), does buying
the side priced >= X still pay, and how often does that side LOSE?
Data: resolved markets from Gamma (closed, last D days, volume >= V), CLOB /prices-history of outcome 0 at 1-minute fidelity
over the 8 hours before closedTime. For each lead L (minutes before closedTime): last price point at or before closed - L;
the favourite side, entry = price + slip (capped 0.999) + taker fee from the market's feeSchedule; win = official outcome.
NB prices-history is a last/mid series, not the ask (the live scan pm_arb_scan.py reads real asks).
Run: python3 -I backtest/research/pm_settle.py <cache.jsonl> [days] [min volume]
"""
import json, sys, time, os, urllib.request, datetime as dt, math
from concurrent.futures import ThreadPoolExecutor

G, C = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'
CACHE = sys.argv[1]
DAYS = float(sys.argv[2]) if len(sys.argv) > 2 else 7
VMIN = float(sys.argv[3]) if len(sys.argv) > 3 else 1000

def get(url):
    for i in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'user-agent': 'Mozilla/5.0'}), timeout=30))
        except Exception as e: err = e; time.sleep(1 + 2 * i)
    raise err

def ts(s): return int(dt.datetime.fromisoformat(s.replace(' ', 'T').replace('Z', '+00:00').replace('+00', '+00:00') if s.endswith('+00') else s.replace(' ', 'T').replace('Z', '+00:00')).timestamp())

def fetch():
    since = time.time() - DAYS * 86400
    ms, cur = [], ''
    while True:
        p = get(f'{G}/markets/keyset?closed=true&limit=500&order=closedTime&ascending=false' + (f'&after_cursor={cur}' if cur else ''))
        batch = p.get('markets', []); cur = p.get('next_cursor')
        for m in batch:
            if not m.get('closedTime'): continue
            ct = ts(m['closedTime'])
            if ct < since: return ms
            try: op = [float(x) for x in json.loads(m.get('outcomePrices') or '[]')]
            except Exception: continue
            if len(op) != 2 or sorted(op) != [0.0, 1.0] or float(m.get('volumeNum') or 0) < VMIN or not m.get('clobTokenIds'): continue
            ms.append({'id': m['id'], 'q': m.get('question', ''), 'slug': m.get('slug', ''), 'ct': ct, 'win0': op[0] == 1.0,
                       'tok': json.loads(m['clobTokenIds'])[0], 'fee': m.get('feeSchedule') if m.get('feesEnabled') else None,
                       'v': float(m.get('volumeNum') or 0)})
        if not cur or not batch: return ms

def hist(m):
    h = get(f"{C}/prices-history?market={m['tok']}&startTs={m['ct'] - 8 * 3600}&endTs={m['ct']}&fidelity=1").get('history', [])
    m['h'] = [(x['t'], x['p']) for x in h]
    return m

if not os.path.exists(CACHE):
    ms = fetch(); print(f'fetched {len(ms)} resolved markets', file=sys.stderr)
    with ThreadPoolExecutor(16) as ex, open(CACHE, 'w') as f:
        for m in ex.map(lambda m: (lambda: hist(m))() if True else None, ms):
            f.write(json.dumps(m) + '\n')
rows = [json.loads(l) for l in open(CACHE)]
rows = [r for r in rows if len(r.get('h') or []) >= 3]

def fee(m, p):
    s = m.get('fee')
    if not s: return 0.0
    return float(s.get('rate', 0)) * (p * (1 - p)) ** float(s.get('exponent', 1))

def cat(r):
    q = (r['slug'] + ' ' + r['q']).lower()
    if 'up-or-down' in q or 'bitcoin' in q or 'ethereum' in q or 'solana' in q or 'xrp' in q: return 'crypto'
    if any(k in q for k in ('vs', 'o/u', 'goal', 'spread', 'nba', 'nfl', 'mlb', 'nhl', 'cs2', 'lol-', 'dota', 'valorant', 'atp', 'wta', 'map ', 'assist', 'shots', 'points', 'rebounds')): return 'sports'
    return 'other'

print(f'Polymarket "decided, not settled": {len(rows)} resolved binary markets, last {DAYS:.0f} days, volume >= ${VMIN:,.0f}')
print('Entry = last price point at or before (closedTime - L) on the side priced >= X, +slip (cap 0.999), taker fee per market.')
print('ret = per $ held to the official result; LOSS = the favourite at that moment lost; ~h = capital locked (L).\n')
for slip in (0.005, 0.01):
    print(f'slip {slip * 100:.1f}c')
    for X in (0.90, 0.95, 0.98):
        for L in (180, 120, 90, 60, 30, 15):
            res = {}
            for r in rows:
                pt = None
                for t, p in r['h']:
                    if t <= r['ct'] - L * 60: pt = p
                    else: break
                if pt is None: continue
                side0 = pt >= .5; q = pt if side0 else 1 - pt
                if q < X: continue
                won = r['win0'] == side0
                b = min(.999, q + slip); c = b + fee(r, b)
                res.setdefault(cat(r), []).append(((1 if won else 0) - c) / c)
                res.setdefault('ALL', []).append(((1 if won else 0) - c) / c)
            line = []
            for k in ('ALL', 'sports', 'crypto', 'other'):
                v = res.get(k, [])
                if not v: line.append(f'{k} n0'); continue
                mu = sum(v) / len(v); lo = sum(1 for x in v if x < -0.5)
                line.append(f'{k} n{len(v)} LOSS {lo} ({100 * lo / len(v):.2f}%) {100 * mu:+.2f}%/$')
            print(f'  >= {X:.2f}  L{L:>3}m  ' + ' | '.join(line))
    print()
