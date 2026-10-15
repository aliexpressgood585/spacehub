"""Status-quo NO study (owner 2026-10-15, prompt item E): resolved long-horizon Polymarket binary markets.
Lists every closed binary market (Gamma /markets/keyset) with volume >= VMIN that lived >= 30 days and resolved 0/1, then
pulls the NO token's CLOB price history at 12-hour fidelity over the market's whole life (interval=max: an explicit
startTs/endTs range longer than ~2 weeks is refused or comes back empty).
Run: python3 -I backtest/research/pm_statusquo_fetch.py <out.jsonl> <end_date_min YYYY-MM-DD> <volume min>
"""
import json, sys, time, datetime as dt, urllib.request, urllib.parse, concurrent.futures as cf

OUT, EMIN, VMIN = sys.argv[1], sys.argv[2], float(sys.argv[3])
G, C = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'

def get(u):
    for k in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60))
        except Exception: time.sleep(1 + 2 * k)
    return None

def ts(s):
    if not s: return None
    s = s.replace(' ', 'T').replace('+00', '+00:00') if s.endswith('+00') else s.replace('Z', '+00:00')
    try: return int(dt.datetime.fromisoformat(s).timestamp())
    except Exception: return None

ms, cur = [], None
while True:
    q = {'closed': 'true', 'limit': 500, 'volume_num_min': VMIN, 'end_date_min': EMIN + 'T00:00:00Z'}
    if cur: q['after_cursor'] = cur
    r = get(f'{G}/markets/keyset?' + urllib.parse.urlencode(q))
    if not r or not r.get('markets'): break
    ms += r['markets']; cur = r.get('next_cursor')
    print('listed', len(ms), file=sys.stderr, flush=True)
    if not cur: break

keep = []
for m in ms:
    try:
        op = [float(x) for x in json.loads(m['outcomePrices'])]; tok = json.loads(m['clobTokenIds']); oc = json.loads(m['outcomes'])
    except Exception: continue
    if len(tok) != 2 or sorted(op) != [0.0, 1.0] or [o.lower() for o in oc] != ['yes', 'no']: continue
    a, b = ts(m.get('startDate')), ts(m.get('closedTime')) or ts(m.get('endDate'))
    if not a or not b or b - a < 30 * 86400: continue
    ev = (m.get('events') or [{}])[0]
    keep.append({'id': m['id'], 'q': m['question'], 'event': ev.get('title', ''), 'eslug': ev.get('slug', ''), 'start': a, 'close': b,
                 'end': ts(m.get('endDate')), 'yes_won': op[0] == 1.0, 'vol': float(m.get('volumeNum') or 0), 'negRisk': bool(m.get('negRisk')),
                 'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0, 'tok_no': tok[1]})
print('binary, resolved, lived >= 30 days:', len(keep), file=sys.stderr, flush=True)

def hist(k):
    h = get(f'{C}/prices-history?market={k["tok_no"]}&interval=max&fidelity=720')
    k['h'] = [(int(p['t']), float(p['p'])) for p in (h or {}).get('history', [])]
    return k

n = 0
with open(OUT, 'w') as f, cf.ThreadPoolExecutor(16) as ex:
    for k in ex.map(hist, keep):
        if k['h']: f.write(json.dumps(k) + '\n'); n += 1
print('with history', n, file=sys.stderr)
