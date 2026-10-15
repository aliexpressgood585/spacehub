"""Polymarket daily max-temperature markets vs archived weather forecasts (owner 2026-10-15, research only).
Rules fixed before reading results.
Data: wx_fetch.py output (buckets, official winner, 10-minute CLOB YES price history) + Open-Meteo previous-runs API
(the forecast that existed BEFORE the entry: temperature_2m_previous_day1 = run issued ~24 h before each hour,
previous_day2 = ~48 h before), hourly at the resolution station, max over the local calendar day.
Entries (one look per event):
  E0 = local 00:00 of the target day, forecast = max of previous_day1 over that day
  E1 = local 12:00 the day before,    forecast = max of previous_day2 over the target day
Model: observed max ~ Normal(forecast + bias_city, sd_city), bias/sd fitted on the IS dates only (first 70% of dates),
observed max taken from the winning bucket (centre; open tails at their edge). P(bucket) from the normal CDF with
+-0.5 degree continuity. Price = last YES point at or before the entry; buy YES at p + slip, buy NO at (1 - p) + slip,
fee = market rate x q(1 - q) per share, hold to the official result. IS = first 70% of dates, OOS = last 30%.
Rules: VALUE (YES where model P - cost >= edge), NOVALUE (NO where (1 - P) - cost >= edge), CLUSTER (YES on the
two buckets with the highest model P, ungated / gated), TAILNO (NO on buckets with model P < 2%), and the market's own
favourite bucket as a control.
Run: python3 -I backtest/research/wx_research.py <wx.jsonl> <forecast cache dir>
"""
import json, sys, os, re, math, time, statistics as st, datetime as dt, urllib.request
from zoneinfo import ZoneInfo

ROWS = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
def bucket(title):
    n = [int(x) for x in re.findall(r'(?<!\d)-?\d+', title)]   # '76-77' -> 76, 77 (dash = range); '-2°C' -> -2
    if 'below' in title or 'lower' in title: return (None, n[0])
    if 'higher' in title or 'above' in title: return (n[0], None)
    return (n[0], n[-1])
for e in ROWS:
    for b in e['buckets']: b['range'] = bucket(b['title'])
CD = sys.argv[2]; os.makedirs(CD, exist_ok=True)
# resolution stations (from the event descriptions)
ST = {'nyc': (40.7769, -73.8740, 'America/New_York'), 'london': (51.5053, 0.0553, 'Europe/London'),
      'dallas': (32.8471, -96.8518, 'America/Chicago'), 'toronto': (43.6777, -79.6248, 'America/Toronto'),
      'atlanta': (33.6407, -84.4277, 'America/New_York'), 'seoul': (37.4602, 126.4407, 'Asia/Seoul'),
      'buenos-aires': (-34.8222, -58.5358, 'America/Argentina/Buenos_Aires'), 'seattle': (47.4502, -122.3088, 'America/Los_Angeles'),
      'chicago': (41.9742, -87.9073, 'America/Chicago'), 'miami': (25.7959, -80.2870, 'America/New_York'),
      'ankara': (40.1281, 32.9951, 'Europe/Istanbul'), 'wellington': (-41.3272, 174.8053, 'Pacific/Auckland'),
      'paris': (49.0097, 2.5479, 'Europe/Paris'), 'sao-paulo': (-23.4356, -46.4731, 'America/Sao_Paulo'),
      'tokyo': (35.5494, 139.7798, 'Asia/Tokyo'), 'munich': (48.3537, 11.7750, 'Europe/Berlin'),
      'tel-aviv': (32.0114, 34.8867, 'Asia/Jerusalem'), 'los-angeles': (33.9416, -118.4085, 'America/Los_Angeles')}

def get(u):
    for k in range(6):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=90))
        except Exception: time.sleep(2 + 3 * k)
    return None

def forecasts(city, unit, d0, d1):
    fp = os.path.join(CD, f'{city}_{unit}.json')
    if os.path.exists(fp): return json.load(open(fp))
    lat, lon, tz = ST[city]
    out = {}
    a = dt.date.fromisoformat(d0) - dt.timedelta(days=2)
    while a <= dt.date.fromisoformat(d1):
        b = min(a + dt.timedelta(days=60), dt.date.fromisoformat(d1))
        r = get(f'https://previous-runs-api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}'
                f'&hourly=temperature_2m_previous_day1,temperature_2m_previous_day2&start_date={a}&end_date={b}'
                f'&timezone={tz}' + ('&temperature_unit=fahrenheit' if unit == 'F' else ''))
        if r:
            h = r['hourly']
            for i, t in enumerate(h['time']):
                day = t[:10]
                for k in ('temperature_2m_previous_day1', 'temperature_2m_previous_day2'):
                    v = h[k][i]
                    if v is not None:
                        o = out.setdefault(day, {}).setdefault(k[-4:], [])
                        o.append(v)
        a = b + dt.timedelta(days=1)
    out = {d: {k: (max(v) if len(v) >= 20 else None) for k, v in x.items()} for d, x in out.items()}
    json.dump(out, open(fp, 'w'))
    return out

def obs(e):
    b = next(b for b in e['buckets'] if b['won'])
    lo, hi = b['range']
    return lo if hi is None else hi if lo is None else (lo + hi) / 2

def ncdf(x): return 0.5 * (1 + math.erf(x / math.sqrt(2)))
def pbucket(rng, mu, sd):
    lo, hi = rng
    a = 0 if lo is None else ncdf((lo - 0.5 - mu) / sd)
    b = 1 if hi is None else ncdf((hi + 0.5 - mu) / sd)
    return max(0.0, b - a)

def priceAt(h, ts):
    p = None
    for t, v in h:
        if t <= ts: p = v
        else: break
    return p

def ret(q, won, fee, slip):
    b = min(.999, q + slip); c = b + fee * b * (1 - b)
    return ((1 if won else 0) - c) / c

# forecast per event
byCity = {}
for e in ROWS:
    if e['city'] in ST: byCity.setdefault((e['city'], e['unit']), []).append(e)
for (c, u), es in byCity.items():
    fc = forecasts(c, u, min(x['date'] for x in es), max(x['date'] for x in es))
    for e in es: e['fc'] = fc.get(e['date'], {})
ev = sorted([e for e in ROWS if e['city'] in ST], key=lambda e: e['date'])
dates = sorted({e['date'] for e in ev}); cut = dates[int(len(dates) * .7)]

# calibration on IS only, per city and per look
CAL = {}
for look, key in (('E0', 'day1'), ('E1', 'day2')):
    for c in {e['city'] for e in ev}:
        r = [obs(e) - e['fc'][key] for e in ev if e['city'] == c and e['date'] < cut and e['fc'].get(key) is not None]
        unit = next(e['unit'] for e in ev if e['city'] == c)
        if len(r) >= 20:
            CAL[(look, c)] = (st.mean(r), max(st.pstdev(r), 0.8 if unit == 'C' else 1.5), len(r))

def entryTs(e, look):
    tz = ZoneInfo(ST[e['city']][2]); d = dt.date.fromisoformat(e['date'])
    if look == 'E0': return int(dt.datetime(d.year, d.month, d.day, 0, tzinfo=tz).timestamp())
    p = d - dt.timedelta(days=1); return int(dt.datetime(p.year, p.month, p.day, 12, tzinfo=tz).timestamp())

def stat(v):
    if len(v) < 20: return f'n{len(v):5}{"":32}'
    rr = [a for a, _ in v]; m = sum(rr) / len(rr); sd = st.pstdev(rr) or 1e-9
    return f'n{len(v):5} WR {100 * sum(w for _, w in v) / len(v):5.1f}% {100 * m:+7.2f}%/$ t{m / sd * math.sqrt(len(v)):+5.1f}'

print(f'Polymarket daily max-temperature markets: {len(ev)} events, {len({e["city"] for e in ev})} cities, '
      f'{dates[0]} .. {dates[-1]}; IS < {cut} <= OOS. Median event volume ${st.median(sum(b["v"] for b in e["buckets"]) for e in ev):,.0f}.')
print('Forecast = Open-Meteo archived run issued >= 24 h (E0) / 48 h (E1) before each hour; calibration on IS only.')
for (look, c), (m, s, n) in sorted(CAL.items()):
    if look == 'E0': print(f'  {c:13} bias {m:+5.2f} sd {s:4.2f} (n{n})', end='\n')

for look in ('E0', 'E1'):
    key = 'day1' if look == 'E0' else 'day2'
    cand = []   # (event, bucket, q_yes, P)
    bm = bk = nb = 0
    for e in ev:
        if (look, e['city']) not in CAL or e['fc'].get(key) is None: continue
        bias, sd, _ = CAL[(look, e['city'])]; mu = e['fc'][key] + bias
        ts = entryTs(e, look)
        rows = []
        for b in e['buckets']:
            p = priceAt(b['h'], ts)
            if p is None: continue
            P = pbucket(b['range'], mu, sd)
            rows.append((b, p, P))
            if e['date'] >= cut:
                y = 1.0 if b['won'] else 0.0; bm += (p - y) ** 2; bk += (P - y) ** 2; nb += 1
        if rows: cand.append((e, rows))
    print(f'\n=== {look}: {"local 00:00 of the day, forecast issued >= 24 h earlier" if look == "E0" else "local 12:00 the day before, forecast >= 48 h earlier"}; '
          f'{len(cand)} events priced. OOS Brier per bucket: market {bm / max(nb, 1):.4f} | model {bk / max(nb, 1):.4f}')
    for slip in (.01, .02):
        print(f'  -- slip {int(slip * 100)}c')
        rules = []
        for edge in (.05, .10, .15):
            rules.append((f'VALUE yes  P - cost >= {edge:.2f}', lambda b, p, P, edge=edge: ('Y', p) if P - (p + slip) >= edge and p >= .02 else None))
            rules.append((f'VALUE no   (1-P) - cost >= {edge:.2f}', lambda b, p, P, edge=edge: ('N', 1 - p) if (1 - P) - (1 - p + slip) >= edge and 1 - p >= .02 else None))
        rules.append(('TAILNO  P < 2%, NO price <= 97c', lambda b, p, P: ('N', 1 - p) if P < .02 and 1 - p <= .97 else None))
        for name, rule in rules:
            I, O = [], []
            for e, rows in cand:
                for b, p, P in rows:
                    x = rule(b, p, P)
                    if not x: continue
                    side, q = x; won = b['won'] if side == 'Y' else not b['won']
                    (I if e['date'] < cut else O).append((ret(q, won, b['fee'], slip), won))
            print(f'  {name:36} IS {stat(I)} | OOS {stat(O)}')
        for name, pick in (('CLUSTER top-2 model buckets', 'm2'), ('CLUSTER top-2, sum P - cost >= 0.10', 'm2g'),
                           ('CONTROL market favourite bucket', 'fav')):
            I, O = [], []
            for e, rows in cand:
                if pick == 'fav': sel = [max(rows, key=lambda r: r[1])]
                else:
                    sel = sorted(rows, key=lambda r: -r[2])[:2]
                    if pick == 'm2g' and sum(r[2] for r in sel) - sum(r[1] + slip for r in sel) < .10: continue
                for b, p, P in sel:
                    (I if e['date'] < cut else O).append((ret(p, b['won'], b['fee'], slip), b['won']))
            print(f'  {name:36} IS {stat(I)} | OOS {stat(O)}')
