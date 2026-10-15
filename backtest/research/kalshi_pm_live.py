"""Kalshi vs Polymarket, LIVE executable check on the same open games (owner 2026-10-15, prompt item F).
For every open Kalshi game-winner pair in SERIES that maps to a Polymarket moneyline (same slug rule as kalshi_pm_fetch.py),
read both REAL order books: Kalshi /markets/{t}/orderbook (YES ask = 1 - best NO bid, size = that NO bid's size) and
Polymarket CLOB /book. For each pairing (team X YES on Kalshi + team Y on Polymarket) walk both ask books share by share and
report the best locked profit per $1 after fees (Kalshi 0.07 p(1-p), Polymarket rate p(1-p)) and the size it holds for.
Run: python3 -I backtest/research/kalshi_pm_live.py <SERIES,SERIES> [rounds] [seconds between rounds]
"""
import json, sys, time, re, datetime as dt, urllib.request, urllib.parse

SERIES = sys.argv[1].split(','); ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 1; GAP = int(sys.argv[3]) if len(sys.argv) > 3 else 600
K, G, C = 'https://api.elections.kalshi.com/trade-api/v2', 'https://gamma-api.polymarket.com', 'https://clob.polymarket.com'
LEAGUE = {'KXMLBGAME': 'mlb', 'KXNFLGAME': 'nfl', 'KXNBAGAME': 'nba', 'KXNHLGAME': 'nhl', 'KXWNBAGAME': 'wnba'}
MON = {m: i + 1 for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'])}

def get(u):
    for k in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40))
        except Exception: time.sleep(1 + 2 * k)
    return None

def kasks(t):
    ob = (get(f'{K}/markets/{t}/orderbook') or {}).get('orderbook_fp') or {}
    return sorted((round(1 - float(p), 4), float(s)) for p, s in (ob.get('no_dollars') or []))

def pasks(tok):
    b = get(f'{C}/book?token_id={tok}') or {}
    return sorted((float(x['price']), float(x['size'])) for x in b.get('asks', []))

def walk(ka, pa, fee):
    """Best (profit per $1, shares, cost) buying equal shares from both ask books, both fees charged per share."""
    ka = [list(x) for x in ka]; pa = [list(x) for x in pa]; i = j = 0; n = cost = 0.0; best = (None, 0, 0)
    while i < len(ka) and j < len(pa):
        k, p = ka[i][0], pa[j][0]
        unit = k + .07 * k * (1 - k) + p + fee * p * (1 - p)
        if unit >= 1: break
        d = min(ka[i][1], pa[j][1]); n += d; cost += d * unit
        best = ((n - cost) / cost, n, cost)
        ka[i][1] -= d; pa[j][1] -= d
        if ka[i][1] <= 1e-9: i += 1
        if pa[j][1] <= 1e-9: j += 1
    top = None
    if ka and pa:
        k, p = ka[0][0], pa[0][0]; top = 1 - (k + .07 * k * (1 - k) + p + fee * p * (1 - p))
    return best, top

for rnd in range(ROUNDS):
    rows = []
    for s in SERIES:
        ev = {}
        r = get(f'{K}/markets?' + urllib.parse.urlencode({'series_ticker': s, 'status': 'open', 'limit': 1000}))
        for m in (r or {}).get('markets', []): ev.setdefault(m['event_ticker'], []).append(m)
        for et, ms in ev.items():
            mt = re.match(r'.*-(\d\d)([A-Z]{3})(\d\d)(\d{4})?', et)
            if len(ms) != 2 or not mt: continue
            d = dt.date(2000 + int(mt.group(1)), MON[mt.group(2)], int(mt.group(3)))
            tail = et.split('-')[1][len(mt.group(0).split('-')[1]):]
            ab = [m['ticker'].rsplit('-', 1)[1] for m in ms]
            away = next((x for x in ab if tail.startswith(x)), None); home = next((x for x in ab if x != away), None)
            if not away or not home or tail != away + home: continue
            pe = get(f'{G}/events?slug={LEAGUE[s]}-{away.lower()}-{home.lower()}-{d.isoformat()}')
            ml = [m for m in (pe[0]['markets'] if pe else []) if m.get('sportsMarketType') == 'moneyline' and not m.get('closed')]
            if len(ml) != 1: continue
            pm = ml[0]; toks = json.loads(pm['clobTokenIds']); fee = (pm.get('feeSchedule') or {}).get('rate', 0) if pm.get('feesEnabled') else 0
            kt = {m['ticker'].rsplit('-', 1)[1]: m['ticker'] for m in ms}
            KA = {a: kasks(kt[a]) for a in (away, home)}; PA = {away: pasks(toks[0]), home: pasks(toks[1])}
            for x, y in ((away, home), (home, away)):
                (pr, n, cost), top = walk(KA[x], PA[y], fee)
                rows.append((et, x, y, pr, n, cost, top, KA[x][:1], PA[y][:1]))
    now = dt.datetime.utcnow()
    tops = [r[6] for r in rows if r[6] is not None]
    print(f'--- round {rnd + 1} {now:%Y-%m-%d %H:%M} UTC: {len(rows) // 2} games on both venues, {len(rows)} pairings; '
          f'top-of-book locked profit: best {100 * max(tops):+.2f}c, median {100 * sorted(tops)[len(tops) // 2]:+.2f}c' if tops else
          f'--- round {rnd + 1}: no paired games')
    for r in sorted(rows, key=lambda r: -(r[6] if r[6] is not None else -9))[:8]:
        et, x, y, pr, n, cost, top, k0, p0 = r
        print(f'  {et:34} K {x} ask {k0} + PM {y} ask {p0}: top {100 * top:+5.2f}c' +
              (f' | executable {100 * pr:+.2f}% on {n:,.0f} shares (${cost:,.0f})' if pr is not None else ' | no size at a profit'), flush=True)
    if rnd + 1 < ROUNDS: time.sleep(GAP)
