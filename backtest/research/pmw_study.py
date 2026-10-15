"""Whale-follow study for the Poly News desk (owner 2026-10-15: "connect every option to reliable news and whales").
Data: Polymarket data-api /trades (takerOnly, filterType=CASH, filterAmount=MIN) = every TAKER trade of >= $MIN, with wallet,
side, outcome and price, paged back DAYS days. Price path: CLOB 1-minute history of the traded outcome's token, trade -10 min ..
+4 h. Rules fixed before reading:
  FOLLOW: a whale BUY of outcome k at price p (5-92c, not a crypto Up/Down / not resolving within 1 h). We see it D seconds later
  (D = 60 / 180: polling + API lag). Buy k at the history price at t+D + 1c (cap: skip if it already ran > 5c past p), fee
  rate x q(1-q); exit at +30 m / +60 m / +4 h at the price - 1c minus fee. IS = first 70% of trades by time, OOS = rest.
  Clusters: one entry per (market, hour) — a whale splitting an order is one signal.
  FADE: same, buying the other outcome (control: if fade also loses, it is costs, not direction).
  Size buckets $10-25k / $25-100k / $100k+. SMART = wallet in today's all-time PnL top 500 (LOOK-AHEAD: today's leaderboard
  contains the test period's profits; read it as an upper bound, never as evidence).
Run: python3 -I backtest/research/pmw_study.py <cache dir> <days> <min usd>
"""
import json, sys, os, time, math, statistics as st, urllib.request, collections, concurrent.futures as cf

CD, DAYS, MIN = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]); os.makedirs(CD, exist_ok=True)
DA, C, G = 'https://data-api.polymarket.com', 'https://clob.polymarket.com', 'https://gamma-api.polymarket.com'

def get(u, tries=5):
    for k in range(tries):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40))
        except Exception: time.sleep(1 + 2 * k)
    return None

fp = os.path.join(CD, f'trades_{DAYS}_{int(MIN)}.json')
if os.path.exists(fp): TR = json.load(open(fp))
else:
    TR, off, since = [], 0, time.time() - DAYS * 86400
    while True:
        d = get(f'{DA}/trades?limit=500&offset={off}&takerOnly=true&filterType=CASH&filterAmount={int(MIN)}')
        if not d: break
        TR += d; off += 500
        if d[-1]['timestamp'] < since or len(d) < 500: break
        print('trades', len(TR), round((time.time() - d[-1]['timestamp']) / 86400, 1), 'd', file=sys.stderr, flush=True)
    json.dump(TR, open(fp, 'w'))
TR = [t for t in TR if t['timestamp'] >= time.time() - DAYS * 86400]
lfp = os.path.join(CD, 'leaders.json')
if os.path.exists(lfp): LEAD = set(json.load(open(lfp)))
else:
    LEAD = set()
    for off in range(0, 500, 50):
        for x in get(f'{DA}/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=50&offset={off}') or []: LEAD.add(x['proxyWallet'])
    json.dump(sorted(LEAD), open(lfp, 'w'))

# candidates: whale BUYS of an outcome priced 5-92c, not the short crypto series; one per (market, hour, outcome)
seen, cand = set(), []
for t in sorted(TR, key=lambda t: t['timestamp']):
    if t['side'] != 'BUY' or not .05 <= t['price'] <= .92 or 'updown' in t['slug'] or '-up-or-down-' in t['slug']: continue
    key = (t['conditionId'], t['outcomeIndex'], t['timestamp'] // 3600)
    if key in seen: continue
    seen.add(key); cand.append(t)

# market meta (fee, end, the other outcome's token) via Gamma by condition id
mfp = os.path.join(CD, 'markets.json')
META = json.load(open(mfp)) if os.path.exists(mfp) else {}
need = sorted({t['conditionId'] for t in cand} - set(META))
def meta(batch):
    out = {}
    for m in get(f'{G}/markets?limit=50&' + '&'.join(f'condition_ids={c}' for c in batch)) or []:
        out[m['conditionId']] = {'toks': json.loads(m.get('clobTokenIds') or '[]'), 'end': m.get('endDate'), 'q': m.get('question'),
            'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0, 'sport': m.get('sportsMarketType')}
    return out
with cf.ThreadPoolExecutor(8) as ex:
    for o in ex.map(meta, [need[i:i + 40] for i in range(0, len(need), 40)]): META.update(o)
json.dump(META, open(mfp, 'w'))

def hist(t):
    f = os.path.join(CD, f"h_{t['asset'][-16:]}_{t['timestamp']}.json")
    if os.path.exists(f): return json.load(open(f))
    h = get(f"{C}/prices-history?market={t['asset']}&startTs={t['timestamp'] - 600}&endTs={t['timestamp'] + 4 * 3600 + 300}&fidelity=1")
    h = [(int(x['t']), float(x['p'])) for x in (h or {}).get('history', [])]
    json.dump(h, open(f, 'w')); return h
cand = [t for t in cand if t['conditionId'] in META and len(META[t['conditionId']]['toks']) == 2]
with cf.ThreadPoolExecutor(16) as ex:
    for t, h in zip(cand, ex.map(hist, cand)): t['h'] = h

def at(h, ts):
    v = None
    for a, x in h:
        if a <= ts: v = x
        else: break
    return v
def ret(qin, qout, fee):
    b = min(.99, qin + .01); s = max(0., qout - .01)
    c = b + fee * b * (1 - b); return (s - fee * s * (1 - s) - c) / c

rows = []
for t in cand:
    h = t['h']
    if not h or h[-1][0] < t['timestamp'] + 3600: continue
    rows.append(t)
cut = sorted(t['timestamp'] for t in rows)[int(len(rows) * .7)] if rows else 0
def stat(v):
    if len(v) < 10: return f'n{len(v):5}'
    m = sum(v) / len(v); sd = st.pstdev(v) or 1e-9
    return f'n{len(v):5} WR {100 * sum(x > 0 for x in v) / len(v):5.1f}% {100 * m:+6.2f}%/$ t{m / sd * math.sqrt(len(v)):+5.2f}'

print(f'Whale-follow study: {len(TR):,} taker trades >= ${int(MIN):,} in {DAYS} days; {len(cand):,} whale BUYS at 5-92c (one per market x '
      f'outcome x hour, crypto Up/Down excluded); {len(rows):,} with a 1-minute price path.')
print('Follow = buy the same outcome when we see the trade; exits at the 1-minute history price - 1c; fee = market rate.')
for name, sel in (('ALL', lambda t: True), ('$10-25k', lambda t: t['size'] * t['price'] < 25000), ('$25-100k', lambda t: 25000 <= t['size'] * t['price'] < 100000),
                  ('$100k+', lambda t: t['size'] * t['price'] >= 100000), ('sports', lambda t: META[t['conditionId']]['sport']),
                  ('non-sports', lambda t: not META[t['conditionId']]['sport']), ('SMART wallet (look-ahead!)', lambda t: t['proxyWallet'] in LEAD)):
    print(f'\n=== {name}')
    for D in (60, 180):
        for X in (1800, 3600, 14400):
            I, O, F = [], [], []
            for t in rows:
                if not sel(t): continue
                pD, pX = at(t['h'], t['timestamp'] + D), at(t['h'], t['timestamp'] + X)
                if pD is None or pX is None or pD - t['price'] > .05 or pD > .95: continue
                r = ret(pD, pX, META[t['conditionId']]['fee'])
                (I if t['timestamp'] < cut else O).append(r)
                F.append(ret(1 - pD, 1 - pX, META[t['conditionId']]['fee']))
            print(f'  see +{D:3}s exit +{X // 60:4}m  FOLLOW IS {stat(I)} | OOS {stat(O)} || FADE all {stat(F)}')
