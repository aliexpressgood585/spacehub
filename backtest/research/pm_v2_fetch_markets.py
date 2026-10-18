# Resolved Polymarket binary markets (Gamma, public GET), volume >= $20k, endDate in [START, END). Paper research only.
import json, sys, urllib.request, time
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
START = datetime(2026, 6, 1, tzinfo=timezone.utc); END = datetime(2026, 10, 18, tzinfo=timezone.utc)
KEEP = ['id','slug','question','endDate','closedTime','outcomes','outcomePrices','clobTokenIds','feesEnabled','feeSchedule','volumeNum','umaResolutionStatuses','gameStartTime','eventStartTime','sportsMarketType','negRisk','automaticallyResolved']
def get(u):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'spacehub-paper-research/1.0'}), timeout=30) as r: return json.load(r)
        except Exception as e: time.sleep(1 + i * 2)
    return None
def window(a):
    b = a + timedelta(hours=6); out = []; off = 0
    while True:
        pg = get(f"https://gamma-api.polymarket.com/markets?closed=true&limit=100&offset={off}&volume_num_min=20000&end_date_min={a.strftime('%Y-%m-%dT%H:%M:%SZ')}&end_date_max={b.strftime('%Y-%m-%dT%H:%M:%SZ')}")
        if pg is None: print('FAIL', a, off, file=sys.stderr); break
        for m in pg:
            d = {k: m.get(k) for k in KEEP}; d['event_slug'] = (m.get('events') or [{}])[0].get('slug', m.get('slug')); out.append(d)
        if len(pg) < 100: break
        off += 100
    return out
ws = []; a = START
while a < END: ws.append(a); a += timedelta(hours=6)
seen = set(); n = 0
with open(sys.argv[1], 'w') as f, ThreadPoolExecutor(8) as ex:
    for res in ex.map(window, ws):
        for d in res:
            if d['id'] in seen: continue
            seen.add(d['id']); f.write(json.dumps(d) + '\n'); n += 1
print('markets', n)
