# Fetch post-graduation price history for pump.fun coins that reached the end of the curve (recorded paths with the
# graduated flag). GeckoTerminal public API (no key; throttles hard — one call per 6 s avoids 429): the coin's PumpSwap pool, then 1-minute OHLCV in USD
# for the coin (empty minutes are omitted by the API = no trade). Output: one JSON line per coin.
# Usage: python3 meme_grad_fetch.py paths.jsonl out.jsonl
import json, sys, time, urllib.request, os

GT = 'https://api.geckoterminal.com/api/v2/networks/solana'
def get(u, tries=4):
    for a in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'accept': 'application/json', 'User-Agent': 'spacehub-paper/1.0'}), timeout=20))
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(20); continue
            if e.code == 404: return None
            time.sleep(5)
        except Exception: time.sleep(5)
    return None

paths = [json.loads(l) for l in open(sys.argv[1])]
grad = [p for p in paths if any(q[3] for q in p['p']) and all(q[1] is not None for q in p['p'])]
done = set()
if os.path.exists(sys.argv[2]): done = {json.loads(l)['m'] for l in open(sys.argv[2])}
out = open(sys.argv[2], 'a')
for i, p in enumerate(grad):
    if p['m'] in done: continue
    d = get(f"{GT}/tokens/{p['m']}/pools"); time.sleep(6)
    pools = [x for x in (d or {}).get('data', []) if x['relationships']['dex']['data']['id'] == 'pumpswap']
    rec = {'m': p['m'], 's': p['s'], 'c': p['c'], 'grad_age_s': next(q[0] for q in p['p'] if q[3]), 'bars': []}
    if pools:
        a = pools[0]['attributes']; rec['pool'] = a['address']; rec['pool_created'] = a['pool_created_at']
        bars = []; before = None
        for _ in range(3):                                        # up to 3000 traded minutes
            u = f"{GT}/pools/{a['address']}/ohlcv/minute?aggregate=1&limit=1000&currency=usd&token={p['m']}" + (f"&before_timestamp={before}" if before else '')
            o = get(u); time.sleep(6)
            l = (o or {}).get('data', {}).get('attributes', {}).get('ohlcv_list', [])
            if not l: break
            bars += l; before = min(b[0] for b in l)
            if len(l) < 1000: break
        rec['bars'] = sorted({b[0]: b for b in bars}.values())   # [ts, o, h, l, c, vol_usd] ascending
    out.write(json.dumps(rec) + '\n'); out.flush()
    print(i, p['s'], len(rec['bars']), flush=True)
