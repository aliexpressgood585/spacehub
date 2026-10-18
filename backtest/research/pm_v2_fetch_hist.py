# CLOB prices-history (public) for outcome 0 of each kept market, 5-min fidelity, [endDate-4h05m, endDate]. Paper research only.
import json, re, sys, time, urllib.request
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
def is_crypto(slug, q=''):
    txt = slug.replace('-', ' ') + ' ' + (q or '')
    return bool(re.search(r'\b(bitcoin|ethereum|solana|xrp|dogecoin|btc|eth|sol|bnb|hype)\b|(^|-)(btc|eth|sol|xrp)-updown', txt, re.I)) and bool(re.search(r'price|above|below|between|up or down|updown|hit|dip|reach', txt, re.I))
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
    for l in open('hist.jsonl'): done.add(json.loads(l)['id'])
except FileNotFoundError: pass
todo = [m for m in ms if m['id'] not in done]
print('todo', len(todo), 'done', len(done), flush=True)
def go(m):
    e = int(datetime.fromisoformat(m['endDate'].replace('Z', '+00:00')).timestamp())
    u = f"https://clob.polymarket.com/prices-history?market={m['tok0']}&startTs={e - 4*3600 - 300}&endTs={e}&fidelity=5"
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'spacehub-paper-research/1.0'}), timeout=30) as r:
                h = json.load(r).get('history') or []
            m['h'] = [(x['t'], x['p']) for x in h]; return m
        except Exception: time.sleep(1 + 2 * i)
    m['h'] = None; return m
with open('hist.jsonl', 'a') as f, ThreadPoolExecutor(16) as ex:
    for i, m in enumerate(ex.map(go, todo)):
        if m['h'] is not None: f.write(json.dumps(m) + '\n')
        if i % 5000 == 0: print(i, flush=True); f.flush()
print('FIN', flush=True)
