"""Kalshi vs Polymarket on the SAME sports games (owner 2026-10-15, prompt item F: cross-venue arbitrage).
Kalshi: every settled game-winner market in SERIES over the last DAYS days (two markets per game, one per team), with
hourly candlesticks (yes_bid / yes_ask closes = the real Kalshi quote each hour) from creation to the game.
Polymarket: the same game's moneyline market, slug {league}-{away}-{home}-{date} built from the Kalshi tickers
(KXMLBGAME-26OCT132000CLETB-TB -> mlb-cle-tb-2026-10-13), official result, fee rate, and 10-minute CLOB price history (last 7 days before the game; a 30-day window returns nothing) of
both outcome tokens. A match is kept only if both venues list the same two teams and agree on the winner.
Run: python3 -I backtest/research/kalshi_pm_fetch.py <out.jsonl> <days> <SERIES,SERIES>
"""
import json, sys, time, re, datetime as dt, urllib.request, urllib.parse, concurrent.futures as cf

OUT, DAYS, SERIES = sys.argv[1], int(sys.argv[2]), sys.argv[3].split(',')
K, G, C = 'https://api.elections.kalshi.com/trade-api/v2', 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'
LEAGUE = {'KXMLBGAME': 'mlb', 'KXNFLGAME': 'nfl', 'KXNBAGAME': 'nba', 'KXNHLGAME': 'nhl', 'KXWNBAGAME': 'wnba'}
MON = {m: i + 1 for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'])}

def get(u, tries=6):
    for k in range(tries):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60))
        except Exception: time.sleep(1 + 2 * k)
    return None

def f(x):
    try: return float(x)
    except Exception: return None

now = int(time.time())
games = {}
for s in SERIES:
    cur = None
    while True:
        q = {'series_ticker': s, 'status': 'settled', 'limit': 1000, 'min_close_ts': now - DAYS * 86400}
        if cur: q['cursor'] = cur
        r = get(f'{K}/markets?' + urllib.parse.urlencode(q))
        if not r: break
        for m in r.get('markets', []):
            games.setdefault((s, m['event_ticker']), []).append(m)
        cur = r.get('cursor')
        if not cur or not r.get('markets'): break
    print(s, 'events', sum(1 for g in games if g[0] == s), file=sys.stderr, flush=True)

def candles(s, m):
    a = int(dt.datetime.fromisoformat(m['open_time'].replace('Z', '+00:00')).timestamp())
    b = int(dt.datetime.fromisoformat(m['close_time'].replace('Z', '+00:00')).timestamp())
    out, t = [], a
    while t < b:
        e = min(b, t + 4000 * 3600)
        r = get(f'{K}/series/{s}/markets/{m["ticker"]}/candlesticks?start_ts={t}&end_ts={e}&period_interval=60')
        for c in (r or {}).get('candlesticks', []):
            out.append((c['end_period_ts'], f(c['yes_bid']['close_dollars']), f(c['yes_ask']['close_dollars']), f(c.get('volume_fp'))))
        t = e
    return out

def one(key):
    s, et = key; ms = games[key]
    if len(ms) != 2 or s not in LEAGUE: return None
    mt = re.match(r'.*-(\d\d)([A-Z]{3})(\d\d)(\d{4})?', et)
    if not mt: return None
    d = dt.date(2000 + int(mt.group(1)), MON[mt.group(2)], int(mt.group(3)))
    tail = et.split('-')[1][len(mt.group(0).split('-')[1]):]          # 'CLETB'
    ab = [m['ticker'].rsplit('-', 1)[1] for m in ms]
    away = next((x for x in ab if tail.startswith(x)), None); home = next((x for x in ab if x != away), None)
    if not away or not home or tail != away + home: return None
    ev = get(f'{G}/events?slug={LEAGUE[s]}-{away.lower()}-{home.lower()}-{d.isoformat()}')
    if not ev: return None
    ml = [m for m in ev[0]['markets'] if m.get('sportsMarketType') == 'moneyline']
    if len(ml) != 1: return None
    pm = ml[0]
    try: op = [float(x) for x in json.loads(pm['outcomePrices'])]; toks = json.loads(pm['clobTokenIds']); oc = json.loads(pm['outcomes'])
    except Exception: return None
    if sorted(op) != [0.0, 1.0]: return None
    kw = {m['ticker'].rsplit('-', 1)[1]: m for m in ms}
    kwin = [a for a, m in kw.items() if m.get('result') == 'yes']
    if len(kwin) != 1: return None
    gst = pm.get('gameStartTime') or ''
    start = int(dt.datetime.fromisoformat(gst.replace(' ', 'T').replace('+00', '+00:00')).timestamp()) if gst else None
    # Polymarket outcome order = away, home (slug order); verified below against the winner
    pmwin = away if op[0] == 1.0 else home
    if pmwin != kwin[0]: return {'skip': 'winner_mismatch', 'event': et}
    k = {a: {'ticker': kw[a]['ticker'], 'name': kw[a].get('yes_sub_title'), 'c': candles(s, kw[a]), 'vol': f(kw[a].get('volume_fp'))} for a in (away, home)}
    p = {}
    for a, tok in zip((away, home), toks):
        h = get(f'{C}/prices-history?market={tok}&startTs={(start or now) - 7 * 86400}&endTs={(start or now) + 6 * 3600}&fidelity=10')
        p[a] = [(int(x['t']), float(x['p'])) for x in (h or {}).get('history', [])]
    return {'series': s, 'event': et, 'pm_slug': ev[0]['slug'], 'pm_title': pm['question'], 'pm_outcomes': oc, 'away': away, 'home': home,
            'start': start, 'winner': kwin[0], 'pm_fee': (pm.get('feeSchedule') or {}).get('rate', 0) if pm.get('feesEnabled') else 0,
            'pm_vol': f(pm.get('volumeNum')), 'k': k, 'p': p,
            'k_rules': kw[away].get('rules_primary', '')[:300], 'pm_desc': (pm.get('description') or '')[:300]}

n = skip = 0
with open(OUT, 'w') as fo, cf.ThreadPoolExecutor(6) as ex:
    for i, r in enumerate(ex.map(one, list(games))):
        if r and 'skip' not in r: fo.write(json.dumps(r) + '\n'); n += 1
        elif r: skip += 1
        if i % 100 == 0: print(i, n, skip, file=sys.stderr, flush=True)
print('matched games', n, 'winner mismatches', skip, 'of', len(games), file=sys.stderr)
