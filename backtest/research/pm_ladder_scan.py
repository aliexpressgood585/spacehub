"""Logical-consistency ("ladder") scan of live Polymarket markets, REAL order books.
Inside one event, markets whose question differs only by a date or a number are nested:
  "X by <date>"            earlier ⊂ later            "X continues through <date>"  later ⊂ earlier
  "reach / above / ↑ $N"   higher ⊂ lower             "dip to / below / ↓ $N"        lower ⊂ higher
If A ⊂ B then YES(A) => YES(B). Buying YES B + NO A pays >= $1 in every world (2 if B happens and A does not).
Locked profit per pair = 1 - askYES(B) - askNO(A) - taker fees (fee rate * p(1-p) per share, both legs), size = min depth.
Usage: python3 pm_ladder_scan.py <out dir>  -> ladder.json + summary printed. Read only, never trades."""
import json, re, sys, time, urllib.request, collections, datetime as dt
OUT = sys.argv[1]
G = 'https://gamma-api.polymarket.com'; C = 'https://clob.polymarket.com'
def get(u):
    for i in range(3):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30))
        except Exception as e: err = e; time.sleep(1 + i)
    raise err
def post(u, body):
    r = urllib.request.Request(u, data=json.dumps(body).encode(), headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=30))
MON = 'January|February|March|April|May|June|July|August|September|October|November|December'
DATE = re.compile(rf'\b({MON})\s+(\d{{1,2}})(?:,?\s*(\d{{4}}))?', re.I)
NUM = re.compile(r'\$?\s?(\d[\d,]*(?:\.\d+)?)\s?([kKmMbB])?')
def kind(q):
    s = q.lower()
    if re.search(r'\bbetween\b|\brange\b|\bexactly\b|\d\s*[-–]\s*\d', s): return None
    if DATE.search(q) and re.search(r'\b(by|before)\b', s): return 'by'
    if DATE.search(q) and re.search(r'continues? through|remain[s]? .* through|still .* on', s): return 'through'
    if re.search(r'or lower|or less|\bbelow\b|\bdip\b|hit \(low\)|↓|less than|lower than|fall to', s): return 'down'
    if re.search(r'\b(reach|above|hit \(high\)|↑|greater than|or more|at least|higher than|exceed)', s): return 'up'
    if re.search(r'\b(dip|below|hit \(low\)|↓|less than|or less|lower than|fall to)', s): return 'down'
    return None
def val(q, k, end=None):
    if k in ('by', 'through'):
        m = DATE.search(q); mi = [x.lower() for x in MON.split('|')].index(m.group(1).lower()) + 1
        y = int(m.group(3)) if m.group(3) else None
        if y is None:                       # no year in the question: the market's own end date decides it
            if not end: return None
            ey = int(end[:4]); y = ey if (mi, int(m.group(2))) <= (int(end[5:7]), int(end[8:10])) or int(end[5:7]) == 1 and mi == 12 else ey
            if (y, mi, int(m.group(2))) > (ey, int(end[5:7]), int(end[8:10])) and (mi - int(end[5:7])) > 1: y = ey - 1
        return (y, mi, int(m.group(2)))
    nums = [(float(a.replace(',', '')) * {'k': 1e3, 'm': 1e6, 'b': 1e9}.get((b or '').lower(), 1)) for a, b in NUM.findall(q) if a.replace(',', '').replace('.', '').isdigit()]
    nums = [n for n in nums if not (1900 < n < 2100)]
    return nums[0] if len(nums) == 1 else None
def template(q, k):
    s = DATE.sub('<D>', q) if k in ('by', 'through') else NUM.sub('<N>', q)
    return re.sub(r'\s+', ' ', s).strip().lower()
# all active events (keyset paging)
ev, cur = [], None
for _ in range(400):
    u = f'{G}/events/keyset?active=true&closed=false&limit=500' + (f'&after_cursor={cur}' if cur else '')
    try: d = get(u)
    except Exception as e: print('page fail', e); break
    ev += d.get('events', d if isinstance(d, list) else [])
    cur = d.get('next_cursor') if isinstance(d, dict) else None
    if not cur: break
print('events', len(ev))
groups = []
for e in ev:
    g = collections.defaultdict(list)
    for m in e.get('markets') or []:
        if m.get('closed') or not m.get('enableOrderBook'): continue
        try: outs = json.loads(m['outcomes']); toks = json.loads(m['clobTokenIds'])
        except Exception: continue
        if outs != ['Yes', 'No'] or len(toks) != 2: continue
        k = kind(m['question'])
        if not k: continue
        v = val(m['question'], k, m.get('endDate'))
        if v is None: continue
        fee = float((m.get('feeSchedule') or {}).get('rate') or 0) if m.get('feesEnabled') else 0.0
        g[(k, template(m['question'], k))].append(dict(id=m['id'], q=m['question'], v=v, yes=toks[0], no=toks[1], fee=fee, vol=float(m.get('volumeNum') or 0)))
    for (k, t), ms in g.items():
        if len(ms) >= 2 and len({str(x['v']) for x in ms}) == len(ms):
            groups.append(dict(event=e.get('slug'), kind=k, tpl=t, ms=ms))
print('ladder groups', len(groups), 'markets', sum(len(x['ms']) for x in groups))
toks = sorted({t for gr in groups for m in gr['ms'] for t in (m['yes'], m['no'])})
book = {}
for i in range(0, len(toks), 100):
    for tr in range(3):
        try:
            for b in post(f'{C}/books', [{'token_id': t} for t in toks[i:i + 100]]):
                book[b['asset_id']] = sorted([(float(a['price']), float(a['size'])) for a in b.get('asks') or []])
            break
        except Exception as e: err = e; time.sleep(1 + tr)
    else: print('books fail', i, err)
print('books', len(book))
def walk(asks, q):
    got, cost = 0, 0
    for p, s in asks:
        if got >= q: break
        t = min(s, q - got); got += t; cost += t * p
    return cost / got if got else None
res = []
for gr in groups:
    ms = gr['ms']
    # sub ⊂ sup pairs
    for a in ms:
        for b in ms:
            if a is b: continue
            k = gr['kind']
            sub = (k == 'by' and a['v'] < b['v']) or (k == 'through' and a['v'] > b['v']) or (k == 'up' and a['v'] > b['v']) or (k == 'down' and a['v'] < b['v'])
            if not sub: continue
            ya, nb_ = book.get(b['yes']), book.get(a['no'])     # buy YES of the superset b, NO of the subset a
            if not ya or not nb_: continue
            p1, p2 = ya[0][0], nb_[0][0]
            gross = 1 - p1 - p2
            if gross <= 0: continue
            fees = b['fee'] * p1 * (1 - p1) + a['fee'] * p2 * (1 - p2)
            # depth at which it stays positive
            best = (0, 0)
            for q in (10, 25, 50, 100, 250, 500, 1000, 2500, 5000):
                c1, c2 = walk(ya, q), walk(nb_, q)
                if c1 is None or c2 is None or sum(s for _, s in ya) < q or sum(s for _, s in nb_) < q: break
                net = q * (1 - c1 - c2 - b['fee'] * c1 * (1 - c1) - a['fee'] * c2 * (1 - c2))
                if net > best[0]: best = (net, q)
            res.append(dict(event=gr['event'], kind=gr['kind'], sub=a['q'], sup=b['q'], askYES_sup=p1, askNO_sub=p2, gross_c=round(100 * gross, 2),
                            net_c=round(100 * (gross - fees), 2), best_usd=round(best[0], 2), at_shares=best[1], vol=min(a['vol'], b['vol'])))
res.sort(key=lambda r: -r['best_usd'])
json.dump(dict(at=dt.datetime.utcnow().isoformat(), groups=len(groups), pairs=res), open(f'{OUT}/ladder.json', 'w'))
pos = [r for r in res if r['net_c'] > 0]
print('pairs with gross>0 at top of book', len(res), '| net>0 after fees', len(pos), '| total locked $ at best size', round(sum(r['best_usd'] for r in pos), 2))
for r in res[:25]:
    print(f"{r['net_c']:6.2f}c ${r['best_usd']:8.2f} @{r['at_shares']:5} vol ${r['vol']:>10,.0f} {r['kind']:7} | {r['sub'][:60]}  ⊂  {r['sup'][:60]}")
