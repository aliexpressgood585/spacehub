"""Market universe for the "Poly News" study: every Polymarket binary market with volume >= VMIN that was live at some point
in the last DAYS days (closed ones via /markets/keyset closed=true end_date_min, open ones via closed=false), minus the
crypto Up/Down series. Per market: question, event, slug, start, end/close, YES token, outcomes, fee, sports type, result.
Run: python3 -I backtest/research/pmn_markets.py <out.jsonl> <days> <volume min>
"""
import json, sys, time, datetime as dt, urllib.request, urllib.parse

OUT, DAYS, VMIN = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
G = 'https://gamma-api.polymarket.com'

def get(u):
    for k in range(6):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60))
        except Exception: time.sleep(1 + 2 * k)
    return None

def ts(s):
    if not s: return None
    s = s.replace(' ', 'T'); s = s[:-3] + '+00:00' if s.endswith('+00') else s.replace('Z', '+00:00')
    try: return int(dt.datetime.fromisoformat(s).timestamp())
    except Exception: return None

emin = (dt.datetime.utcnow() - dt.timedelta(days=DAYS)).strftime('%Y-%m-%dT00:00:00Z')
seen, n = set(), 0
with open(OUT, 'w') as f:
    for closed in ('true', 'false'):
        cur = None
        while True:
            q = {'closed': closed, 'limit': 500, 'volume_num_min': VMIN}
            if closed == 'true': q['end_date_min'] = emin
            if cur: q['after_cursor'] = cur
            r = get(f'{G}/markets/keyset?' + urllib.parse.urlencode(q))
            if not r or not r.get('markets'): break
            for m in r['markets']:
                if m['id'] in seen or 'updown' in (m.get('slug') or '') or not m.get('clobTokenIds'): continue
                seen.add(m['id'])
                try: toks = json.loads(m['clobTokenIds']); oc = json.loads(m['outcomes']); op = [float(x) for x in json.loads(m.get('outcomePrices') or '[]')]
                except Exception: continue
                if len(toks) != 2: continue
                ev = (m.get('events') or [{}])[0]
                f.write(json.dumps({'id': m['id'], 'q': m['question'], 'event': ev.get('title', ''), 'slug': m.get('slug'), 'eslug': ev.get('slug', ''),
                    'start': ts(m.get('startDate')) or ts(m.get('createdAt')), 'end': ts(m.get('endDate')), 'close': ts(m.get('closedTime')) if closed == 'true' else None,
                    'tok': toks, 'out': oc, 'res': op if closed == 'true' and sorted(op) == [0.0, 1.0] else None, 'vol': float(m.get('volumeNum') or 0),
                    'fee': (m.get('feeSchedule') or {}).get('rate', 0) if m.get('feesEnabled') else 0, 'sport': m.get('sportsMarketType')}) + '\n'); n += 1
            cur = r.get('next_cursor')
            if not cur: break
        print(closed, n, file=sys.stderr, flush=True)
