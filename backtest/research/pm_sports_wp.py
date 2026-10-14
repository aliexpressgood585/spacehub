"""Polymarket sports moneylines vs a LIVE score model (owner 2026-10-14, research only): the 5m crypto desk's edge comes from
reading the live state (distance from the open in units of volatility) better than the market price. The sports analogue is
the live score: ESPN publishes a play-by-play win probability (winprobability[] keyed by playId; every play has a wallclock).
Question: when ESPN's live probability and the Polymarket price disagree, who is right, and does buying the side ESPN says is
cheap pay after fee + slippage?
Data: ESPN scoreboard/summary (NFL, MLB, NHL), Polymarket event slug {league}-{away}-{home}-{ET date} (ESPN abbreviations),
the moneyline market, CLOB prices-history at 1-minute fidelity from kick-off to the close.
Live replay, one minute at a time from kick-off: price p = last point at or before minute m; model = ESPN home win probability
at the last play whose wallclock is at or before m - 60 s (a minute of feed delay). One entry per game per rule: the first
minute the rule fires. Buy at p + 1c (cap 0.999), taker fee rate x p(1-p) per share from the market's feeSchedule, hold to
the official result. IS = first 70% of games by start time, OOS = last 30%.
Run: python3 -I backtest/research/pm_sports_wp.py <cache dir> <first date YYYYMMDD> <last date YYYYMMDD>
"""
import json, sys, os, time, math, statistics as st, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

D, A, Z = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(D, exist_ok=True)
ET = ZoneInfo('America/New_York')
E = 'https://site.api.espn.com/apis/site/v2/sports'
G, C = 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'
LEAGUES = {'nfl': 'football/nfl', 'mlb': 'baseball/mlb', 'nhl': 'hockey/nhl'}

def get(u):
    for k in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30))
        except Exception: time.sleep(1 + 2 * k)
    return None

def ts(s): return int(dt.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp())

def days():
    d = dt.date(int(A[:4]), int(A[4:6]), int(A[6:])); z = dt.date(int(Z[:4]), int(Z[4:6]), int(Z[6:]))
    while d <= z: yield d; d += dt.timedelta(days=1)

def game(lg, ev):
    comp = ev['competitions'][0]
    if comp['status']['type']['name'] != 'STATUS_FINAL': return None
    t = {c['homeAway']: c for c in comp['competitors']}
    away, home = t['away']['team'], t['home']['team']
    start = ts(ev['date']); d = dt.datetime.fromtimestamp(start, ET).date()
    pm = None
    for dd in (d, d - dt.timedelta(days=1), d + dt.timedelta(days=1)):
        r = get(f'{G}/events?slug={lg}-{away["abbreviation"].lower()}-{home["abbreviation"].lower()}-{dd.isoformat()}')
        if r: pm = r[0]; break
    if not pm: return None
    ml = [m for m in pm['markets'] if m.get('sportsMarketType') == 'moneyline' and m.get('closed')]
    if not ml: return None
    m = ml[0]
    outs = json.loads(m['outcomes']); op = [float(x) for x in json.loads(m['outcomePrices'])]
    names = lambda tm: {tm.get('shortDisplayName', '').lower(), tm.get('name', '').lower(), tm.get('displayName', '').lower(),
                        tm.get('abbreviation', '').lower(), tm.get('location', '').lower()}
    hi = next((i for i, o in enumerate(outs) if o.lower() in names(home)), None)
    if hi is None or sorted(op) != [0.0, 1.0]: return None
    home_won = op[hi] == 1.0
    tok = json.loads(m['clobTokenIds'])[hi]
    h = (get(f'{C}/prices-history?market={tok}&startTs={start - 1800}&endTs={start + 6 * 3600}&fidelity=1') or {}).get('history', [])
    s = get(f'{E}/{LEAGUES[lg]}/summary?event={ev["id"]}') or {}
    plays = s.get('plays') or [p for dr in (s.get('drives') or {}).get('previous', []) for p in dr.get('plays', [])]
    wall = {str(p.get('id')): ts(p['wallclock']) for p in plays if p.get('wallclock')}
    wp = sorted((wall[str(w['playId'])], w['homeWinPercentage']) for w in s.get('winprobability', []) if str(w.get('playId')) in wall)
    if not h or len(wp) < 10: return None
    fs = m.get('feeSchedule') if m.get('feesEnabled') else None
    return {'lg': lg, 'id': ev['id'], 'name': ev['name'], 'start': start, 'home_won': home_won,
            'fee': float(fs['rate']) if fs else 0.0, 'v': float(m.get('volumeNum') or 0),
            'h': [(x['t'], x['p']) for x in h], 'wp': wp}

CACHE = os.path.join(D, f'games_{A}_{Z}.jsonl')
if not os.path.exists(CACHE):
    evs = []
    for lg, path in LEAGUES.items():
        for d in days():
            sb = get(f'{E}/{path}/scoreboard?dates={d:%Y%m%d}') or {}
            evs += [(lg, e) for e in sb.get('events', [])]
    seen = set(); evs = [x for x in evs if not (x[1]['id'] in seen or seen.add(x[1]['id']))]
    print(f'ESPN games: {len(evs)}', file=sys.stderr)
    with ThreadPoolExecutor(12) as ex, open(CACHE, 'w') as f:
        n = 0
        for g in ex.map(lambda x: game(*x), evs):
            if g: f.write(json.dumps(g) + '\n'); n += 1
    print(f'matched with Polymarket + ESPN win probability: {n}', file=sys.stderr)

games = sorted((json.loads(l) for l in open(CACHE)), key=lambda g: g['start'])
cut = games[int(len(games) * .7)]['start'] if games else 0

def series(g):
    """minute grid from kick-off: (minute ts, market P(home), model P(home)) while the game is live."""
    h, wp = g['h'], g['wp']
    out, i, j = [], 0, 0
    t, end = g['start'], wp[-1][0]
    while t <= end:
        while i + 1 < len(h) and h[i + 1][0] <= t: i += 1
        while j + 1 < len(wp) and wp[j + 1][0] <= t - 60: j += 1
        if h[i][0] <= t and wp[j][0] <= t - 60 and t - h[i][0] <= 600: out.append((t, h[i][1], wp[j][1]))
        t += 60
    return out

def ret(q, won, fee, slip=.01):
    b = min(.999, q + slip); c = b + fee * b * (1 - b)
    return ((1 if won else 0) - c) / c

def stat(v):
    if len(v) < 15: return f'n{len(v):4}{"":31}'
    mu = sum(x for x, _ in v) / len(v); sd = st.pstdev([x for x, _ in v]) or 1e-9
    return f'n{len(v):4} WR {100 * sum(w for _, w in v) / len(v):5.1f}% {100 * mu:+6.2f}%/$ t{mu / sd * math.sqrt(len(v)):+5.2f}'

S = {g['id']: series(g) for g in games}
print(f'Polymarket moneylines vs ESPN live win probability: {len(games)} games '
      '(' + ', '.join(f'{lg} {sum(1 for g in games if g["lg"] == lg)}' for lg in LEAGUES) + '), '
      f'{dt.datetime.utcfromtimestamp(games[0]["start"]):%Y-%m-%d} .. {dt.datetime.utcfromtimestamp(games[-1]["start"]):%Y-%m-%d}')
print('Entry = first live minute the rule fires (one per game), +1c slip, taker fee from the market, held to the result.')
print('IS = first 70% of games by start, OOS = last 30%.\n')

# who is better calibrated, minute by minute (Brier against the final result)
for lab, sel in (('ALL', None),) + tuple((lg, lg) for lg in LEAGUES):
    bm = bw = n = 0
    for g in games:
        if sel and g['lg'] != sel: continue
        y = 1.0 if g['home_won'] else 0.0
        for _, p, w in S[g['id']]: bm += (p - y) ** 2; bw += (w - y) ** 2; n += 1
    if n: print(f'Brier per live minute {lab:4}: market {bm / n:.4f} | ESPN model {bw / n:.4f}  ({n} minutes)')
print()

def run(rule):
    isv, oos = [], []
    for g in games:
        for t, p, w in S[g['id']]:
            x = rule(p, w)
            if x is None: continue
            side_home, q = x
            won = g['home_won'] == side_home
            (isv if g['start'] < cut else oos).append((ret(q, won, g['fee']), won))
            break
    return isv, oos

print(f'{"rule":44}{"IS":46}| OOS')
def show(lab, rule):
    a, b = run(rule); print(f'  {lab:42}{stat(a):46}| {stat(b)}')

for lo, hi in ((.90, .98), (.85, .92), (.75, .90)):
    show(f'FAV {int(lo*100)}-{int(hi*100)}c (market only)',
         lambda p, w, lo=lo, hi=hi: (True, p) if lo <= p < hi else (False, 1 - p) if lo <= 1 - p < hi else None)
    for e in (0.02, 0.05, 0.08):
        show(f'FAV {int(lo*100)}-{int(hi*100)}c and model >= price + {e:.2f}',
             lambda p, w, lo=lo, hi=hi, e=e: (True, p) if lo <= p < hi and w - p >= e else
             (False, 1 - p) if lo <= 1 - p < hi and (1 - w) - (1 - p) >= e else None)
for e in (0.05, 0.10, 0.15, 0.20):
    for lo, hi in ((.20, .80), (.05, .95)):
        show(f'ANY side {int(lo*100)}-{int(hi*100)}c, model >= price + {e:.2f}',
             lambda p, w, lo=lo, hi=hi, e=e: (True, p) if lo <= p < hi and w - p >= e else
             (False, 1 - p) if lo <= 1 - p < hi and (1 - w) - (1 - p) >= e else None)
for lg in LEAGUES:
    sub = [g for g in games if g['lg'] == lg]
    if len(sub) < 30: continue
    keep = games; games = sub
    show(f'[{lg}] ANY side 20-80c, model >= price + 0.10',
         lambda p, w: (True, p) if .2 <= p < .8 and w - p >= .1 else (False, 1 - p) if .2 <= 1 - p < .8 and (1 - w) - (1 - p) >= .1 else None)
    show(f'[{lg}] FAV 90-98c and model >= price + 0.02',
         lambda p, w: (True, p) if .9 <= p < .98 and w - p >= .02 else (False, 1 - p) if .9 <= 1 - p < .98 and (1 - w) - (1 - p) >= .02 else None)
    games = keep
