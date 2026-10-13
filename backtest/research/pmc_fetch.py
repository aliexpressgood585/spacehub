"""Polymarket short crypto Up/Down markets: history collector (owner 2026-10-13: "a separate Poly coins desk, short ranges only").
Markets have deterministic slugs: {coin}-updown-{5m|15m|4h}-{eventStart epoch}. For each closed market we keep the official
result (outcomePrices 1/0), the fee schedule, volume, and the 1-minute price history of the "Up" token (CLOB prices-history).
Run: python3 backtest/research/pmc_fetch.py <out.jsonl> [days5m] [days15m] [days4h]
"""
import json, sys, time, urllib.request, concurrent.futures as cf

OUT = sys.argv[1]
D5, D15, D4H = (int(x) for x in (sys.argv[2:5] + ['5', '14', '60'])[:3])
import os
COINS = os.environ.get('PMC_COINS', 'btc,eth,sol,xrp').split(',')
G, C = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'

def get(u, tries=4):
    for k in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'spacehub-research'}), timeout=20))
        except Exception:
            time.sleep(1 + 2 * k)
    return None

now = int(time.time())
slugs = []
for tf, sec, days in (('5m', 300, D5), ('15m', 900, D15), ('4h', 14400, D4H)):
    end = (now - 3600) // sec * sec
    for ts in range(end - days * 86400, end, sec):
        for c in COINS: slugs.append((f'{c}-updown-{tf}-{ts}', tf, c, ts, sec))

def market(batch):
    q = '&'.join(f'slug={s[0]}' for s in batch)
    return get(f'{G}/markets?closed=true&limit={len(batch)}&{q}') or []

meta = {}
with cf.ThreadPoolExecutor(12) as ex:
    for res in ex.map(market, [slugs[i:i + 40] for i in range(0, len(slugs), 40)]):
        for m in res: meta[m['slug']] = m
print('markets found', len(meta), 'of', len(slugs), file=sys.stderr)

def hist(s):
    slug, tf, coin, ts, sec = s
    m = meta.get(slug)
    if not m: return None
    try:
        px = [float(x) for x in json.loads(m['outcomePrices'])]; tok = json.loads(m['clobTokenIds'])
    except Exception: return None
    if sorted(px) != [0.0, 1.0]: return None
    h = get(f'{C}/prices-history?market={tok[0]}&startTs={ts - 60}&endTs={ts + sec + 60}&fidelity=1')
    pts = [(int(p['t']), float(p['p'])) for p in (h or {}).get('history', [])]
    return {'slug': slug, 'tf': tf, 'coin': coin, 'start': ts, 'end': ts + sec, 'up_won': px[0] == 1.0, 'vol': float(m.get('volumeNum') or 0),
            'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0, 'h': pts}

n = 0
with open(OUT, 'w') as f, cf.ThreadPoolExecutor(16) as ex:
    for r in ex.map(hist, slugs):
        if r and r['h']: f.write(json.dumps(r) + '\n'); n += 1
print('rows with history', n, file=sys.stderr)
