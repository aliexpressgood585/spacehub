# CLOB prices-history (public), HOURLY points (fidelity 60) for outcome 0, window [endDate-14d, min(endDate, closedTime)+1h].
# Same market universe as pm_v2_fetch_hist.py (resolved binary non-crypto, volume >= $20k, endDate 2026-06-01..10-17).
import json, re, sys, time, urllib.request
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
def is_crypto(slug, q=''):
    txt = slug.replace('-', ' ') + ' ' + (q or '')
    return bool(re.search(r'\b(bitcoin|ethereum|solana|xrp|dogecoin|btc|eth|sol|bnb|hype)\b|(^|-)(btc|eth|sol|xrp)-updown', txt, re.I)) and bool(re.search(r'price|above|below|between|up or down|updown|hit|dip|reach', txt, re.I))
P = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00').replace(' ', 'T').replace('+00', '+00:00') if x.endswith('+00') else x.replace('Z', '+00:00').replace(' ', 'T')).timestamp()
ms = []
for l in open('markets.jsonl'):
    m = json.loads(l)
    try: toks = json.loads(m['clobTokenIds'] or '[]'); px = [float(x) for x in json.loads(m['outcomePrices'] or '[]')]
    except Exception: continue
    if len(toks) != 2 or sorted(px) != [0.0, 1.0] or not m.get('endDate'): continue
    if is_crypto(m['event_slug'] or m['slug'], m['question']): continue
    m['tok0'] = toks[0]; m['win0'] = int(px[0] == 1.0); ms.append(m)
done = set()
try:
    for l in open('hist_long.jsonl'): done.add(json.loads(l)['id'])
except FileNotFoundError: pass
todo = [m for m in ms if m['id'] not in done]
print('todo', len(todo), flush=True)
def go(m):
    e = int(P(m['endDate'])); c = int(P(m['closedTime'])) if m.get('closedTime') else e
    end = min(e, c) + 3600; start = e - 14 * 86400
    u = f"https://clob.polymarket.com/prices-history?market={m['tok0']}&startTs={start}&endTs={end}&fidelity=60"
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'spacehub-paper-research/1.0'}), timeout=30) as r:
                h = json.load(r).get('history') or []
            m['h'] = [(x['t'], x['p']) for x in h]; return m
        except Exception: time.sleep(1 + 2 * i)
    m['h'] = None; return m
with open('hist_long.jsonl', 'a') as f, ThreadPoolExecutor(16) as ex:
    for i, m in enumerate(ex.map(go, todo)):
        if m['h'] is not None: f.write(json.dumps(m) + '\n')
        if i % 5000 == 0: print(i, flush=True); f.flush()
print('FIN', flush=True)
