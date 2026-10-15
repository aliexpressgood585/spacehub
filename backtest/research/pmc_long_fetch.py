"""Long-span history for the live Poly Coins rule (owner 2026-10-15: "test the existing bot over a long span").
Markets: {coin}-updown-5m-{start}, BTC/ETH/SOL/XRP. To keep the request count sane, every STEP-th 5m window is sampled
(all four coins of a sampled window are kept, so the desk's one-position-per-window rule can be simulated exactly).
Per market: official result (outcomePrices), fee schedule, volume, and the CLOB 1-minute price history of the Up token for
the last 5 minutes of the window.
Run: python3 -I backtest/research/pmc_long_fetch.py <out.jsonl> <days> <step>
"""
import json, sys, time, urllib.request, concurrent.futures as cf

OUT, DAYS, STEP = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
COINS = ('btc', 'eth', 'sol', 'xrp')
G, C = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'

def get(u, tries=5):
    for k in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'spacehub-research'}), timeout=30))
        except Exception:
            time.sleep(1 + 2 * k)
    return None

now = int(time.time())
end = (now - 3600) // 300 * 300
starts = list(range(end - DAYS * 86400, end, 300))[::STEP]
slugs = [(f'{c}-updown-5m-{ts}', c, ts) for ts in starts for c in COINS]

meta = {}
with cf.ThreadPoolExecutor(12) as ex:
    batches = [slugs[i:i + 40] for i in range(0, len(slugs), 40)]
    for res in ex.map(lambda b: get(f'{G}/markets?closed=true&limit={len(b)}&' + '&'.join(f'slug={s[0]}' for s in b)) or [], batches):
        for m in res: meta[m['slug']] = m
print('markets found', len(meta), 'of', len(slugs), file=sys.stderr, flush=True)

def hist(s):
    slug, coin, ts = s
    m = meta.get(slug)
    if not m: return None
    try:
        px = [float(x) for x in json.loads(m['outcomePrices'])]; tok = json.loads(m['clobTokenIds'])
    except Exception: return None
    if sorted(px) != [0.0, 1.0]: return None
    h = get(f'{C}/prices-history?market={tok[0]}&startTs={ts - 60}&endTs={ts + 360}&fidelity=1')
    pts = [(int(p['t']), float(p['p'])) for p in (h or {}).get('history', [])]
    return {'slug': slug, 'tf': '5m', 'coin': coin, 'start': ts, 'end': ts + 300, 'up_won': px[0] == 1.0,
            'vol': float(m.get('volumeNum') or 0),
            'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0, 'h': pts}

n = 0
with open(OUT, 'w') as f, cf.ThreadPoolExecutor(24) as ex:
    for i, r in enumerate(ex.map(hist, slugs)):
        if r and r['h']: f.write(json.dumps(r) + '\n'); n += 1
        if i % 5000 == 0: print(i, n, file=sys.stderr, flush=True)
print('rows with history', n, file=sys.stderr)
