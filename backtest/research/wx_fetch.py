"""Polymarket daily "Highest temperature in <city> on <date>?" events (owner 2026-10-15: test weather markets).
Each event is a neg-risk set of ~11 temperature buckets resolved from one airport station (NOAA / Weather Underground).
For every city x day: the buckets, the official winner, fee schedule, volume, the station text, and the CLOB price history
(10-minute fidelity) of every bucket's YES token from 3 days before the date to the end of the date.
Run: python3 -I backtest/research/wx_fetch.py <out.jsonl> <days back> <city,city,...>
"""
import json, sys, time, re, datetime as dt, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT, DAYS, CITIES = sys.argv[1], int(sys.argv[2]), sys.argv[3].split(',')
G, C = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'
MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

def get(u):
    for k in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40))
        except Exception: time.sleep(1 + 2 * k)
    return None

def bucket(title):
    """(lo, hi) in the market's unit; open ends are None. '76-77°F' -> (76, 77); '67°F or below' -> (None, 67)."""
    n = [int(x) for x in re.findall(r'(?<!\d)-?\d+', title)]   # '76-77' -> 76, 77 (the dash is a range, not a sign)
    if 'below' in title or 'lower' in title: return (None, n[0])
    if 'higher' in title or 'above' in title: return (n[0], None)
    return (n[0], n[-1])

def one(job):
    city, d = job
    ev = None
    for slug in (f'highest-temperature-in-{city}-on-{MON[d.month - 1]}-{d.day}-{d.year}', f'highest-temperature-in-{city}-on-{MON[d.month - 1]}-{d.day}'):
        r = get(f'{G}/events?slug={slug}')
        if r: ev = r[0]; break
    if not ev or not ev.get('closed'): return None
    t0 = int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp())
    bs = []
    for m in ev['markets']:
        try: op = [float(x) for x in json.loads(m['outcomePrices'])]; tok = json.loads(m['clobTokenIds'])[0]
        except Exception: return None
        title = m.get('groupItemTitle') or m['question']
        h = (get(f'{C}/prices-history?market={tok}&startTs={t0 - 3 * 86400}&endTs={t0 + 2 * 86400}&fidelity=10') or {}).get('history', [])
        bs.append({'title': title, 'range': bucket(title), 'won': op[0] == 1.0, 'v': float(m.get('volumeNum') or 0),
                   'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0,
                   'h': [(x['t'], x['p']) for x in h]})
    if sum(b['won'] for b in bs) != 1: return None
    unit = 'C' if '°C' in ''.join(b['title'] for b in bs) else 'F'
    return {'city': city, 'date': d.isoformat(), 'unit': unit, 'desc': ev.get('description', '')[:400], 'buckets': bs}

today = dt.date.today()
jobs = [(c, today - dt.timedelta(days=k)) for c in CITIES for k in range(1, DAYS + 1)]
n = 0
with open(OUT, 'w') as f, ThreadPoolExecutor(8) as ex:
    for r in ex.map(one, jobs):
        if r: f.write(json.dumps(r) + '\n'); n += 1
print('events', n, 'of', len(jobs), file=sys.stderr)
