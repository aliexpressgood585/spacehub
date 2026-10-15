"""Status-quo NO on long-horizon Polymarket markets (owner 2026-10-15, prompt item E). Rules fixed before reading.
Input: pm_statusquo_fetch.py output (binary markets, resolved 0/1, lived >= 30 days, volume >= $50k, NO price history at 12 h).
Entry: D days before the market's SCHEDULED end date (what a trader knows; D = 60 / 30 / 14 / 7), using the last NO price at or
before that moment (<= 2 days old); enter only if NO is 80-90c. Buy at p + 1c, fee rate x p(1-p), hold to the official result.
Also: FIRST entry = the first 12 h point at which NO trades in 80-90c with >= 14 days left to the scheduled end.
A market whose event resolves early (e.g. "X by <date>" happens) closes then; lock-up = close - entry.
Categories by keywords in the question + event title. IS = entries before the 70% date cut, OOS after.
Portfolio: $1 per entry in time order, P&L booked at each close; max drawdown of the cumulative P&L, and worst calendar month.
Run: python3 -I backtest/research/pm_statusquo.py <sq.jsonl>
"""
import json, sys, math, re, statistics as st, datetime as dt, collections

R = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
CAT = (('sports', r'\b(nba|nfl|mlb|nhl|uefa|premier league|champions league|la liga|serie a|bundesliga|world cup|super bowl|finals?|'
                  r'champion(ship)?|stanley cup|world series|mvp|grand slam|wimbledon|open|f1|grand prix|ufc|fight|win the \d{4}|playoffs?|'
                  r'heisman|ballon|tour de)\b'),
       ('crypto', r'\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|doge|crypto|token|fdv|airdrop|coin|stablecoin|microstrategy|etf)\b'),
       ('geopolitics', r'\b(war|ceasefire|invade|invasion|russia|ukraine|putin|zelensky|israel|gaza|hamas|iran|china|taiwan|nato|'
                       r'missile|strike|nuclear|north korea|military|troops|peace|sanction|houthi|syria|venezuela|maduro)\b'),
       ('politics', r'\b(election|elected|president|presidential|senate|house|congress|governor|mayor|prime minister|parliament|'
                    r'trump|biden|vance|harris|democrat|republican|party|vote|poll|cabinet|impeach|resign|nominee|nomination|'
                    r'supreme court|executive order|tariff|fed|rate cut|shutdown|bill|law|government|minister|pope|elon|musk)\b'))
def cat(r):
    s = (r['q'] + ' ' + r['event']).lower()
    for name, rx in CAT:
        if re.search(rx, s): return name
    return 'other'

def at(h, t, maxage=2 * 86400):
    p = None
    for ts, v in h:
        if ts <= t: p = (ts, v)
        else: break
    return p[1] if p and t - p[0] <= maxage else None

def ret(q, won, fee, slip=.01):
    b = min(.999, q + slip); c = b + fee * b * (1 - b)
    return ((1 if won else 0) - c) / c

def trades(mode):
    out = []
    for r in R:
        end = r['end'] or r['close']
        if mode == 'first':
            t = next((ts for ts, v in r['h'] if .80 <= v <= .90 and end - ts >= 14 * 86400 and ts < r['close']), None)
            if t is None: continue
            p = at(r['h'], t)
        else:
            t = end - mode * 86400
            if t <= r['start'] or t >= r['close']: continue
            p = at(r['h'], t)
            if p is None or not (.80 <= p <= .90): continue
        won = not r['yes_won']
        out.append({'r': r, 't': t, 'close': r['close'], 'ret': ret(p, won, r['fee']), 'won': won, 'p': p, 'cat': cat(r),
                    'days': (r['close'] - t) / 86400, 'ev': r['eslug']})
    return out

def line(v):
    if len(v) < 10: return f'n{len(v):5}'
    rr = [x['ret'] for x in v]; m = sum(rr) / len(rr); sd = st.pstdev(rr) or 1e-9
    d = st.median(x['days'] for x in v)
    # t on event clusters: entries in the same event are one bet
    ce = collections.defaultdict(float)
    for x in v: ce[x['ev']] += x['ret']
    cv = list(ce.values()); cm = sum(cv) / len(cv); cs = st.pstdev(cv) or 1e-9
    return (f'n{len(v):5} ({len(ce):4} events) WR {100 * sum(x["won"] for x in v) / len(v):5.1f}% {100 * m:+6.2f}%/$ '
            f't(event) {cm / cs * math.sqrt(len(cv)):+5.2f}  median lock {d:5.0f} d  ~{100 * m * 365 / max(d, 1):+6.1f}%/yr on the $ locked')

def book(v):
    ev = sorted(((x['close'], x['ret']) for x in v))
    cum = peak = dd = 0.0; month = collections.defaultdict(float)
    for t, r in ev:
        cum += r; peak = max(peak, cum); dd = max(dd, peak - cum)
        month[dt.datetime.utcfromtimestamp(t).strftime('%Y-%m')] += r
    wm = min(month.items(), key=lambda kv: kv[1])
    return cum, dd, wm

allc = sorted(r['close'] for r in R)
print(f'Status-quo NO, Polymarket long-horizon markets: {len(R):,} binary markets resolved 0/1, lived >= 30 days, volume >= $50k, '
      f'closed {dt.datetime.utcfromtimestamp(allc[0]):%Y-%m-%d} .. {dt.datetime.utcfromtimestamp(allc[-1]):%Y-%m-%d}.')
print(f'Base rate: NO won {100 * sum(not r["yes_won"] for r in R) / len(R):.1f}% of these markets. By category: ' +
      ', '.join(f'{c} {n}' for c, n in collections.Counter(cat(r) for r in R).most_common()))
print('Buy NO at 80-90c (+1c, fee), hold to the official result. $1 per entry.\n')
for mode in (60, 30, 14, 7, 'first'):
    v = trades(mode)
    if not v: continue
    cut = sorted(x['t'] for x in v)[int(len(v) * .7)]
    lab = f'{mode} days before the scheduled end' if mode != 'first' else 'FIRST time NO is 80-90c with >= 14 days left'
    print(f'=== {lab}')
    print(f'  ALL        {line(v)}')
    print(f'  IS 70%     {line([x for x in v if x["t"] < cut])}')
    print(f'  OOS 30%    {line([x for x in v if x["t"] >= cut])}')
    for c in ('politics', 'geopolitics', 'sports', 'crypto', 'other'):
        w = [x for x in v if x['cat'] == c]
        if w: print(f'  {c:11}{line(w)}')
    for lo, hi in ((.80, .85), (.85, .901)):
        print(f'  NO {int(lo * 100)}-{int(min(hi, .9) * 100)}c   {line([x for x in v if lo <= x["p"] < hi])}')
    cum, dd, wm = book(v)
    print(f'  book at $1/entry: total {cum:+.1f} $ on {len(v)} $ staked, max drawdown {dd:.1f} $, worst month {wm[0]} {wm[1]:+.1f} $')
    losers = sorted([x for x in v if not x['won']], key=lambda x: x['r']['vol'], reverse=True)[:6]
    for x in losers: print(f'    lost: {x["r"]["q"][:90]} (NO {x["p"]:.2f}, {x["days"]:.0f} d)')
    print()

print('=== Category x split (the subsets that look good above, read against their own halves)')
for mode in (30, 'first'):
    v = trades(mode); cut = sorted(x['t'] for x in v)[int(len(v) * .7)]
    for c in ('politics', 'geopolitics', 'crypto', 'sports', 'other'):
        w = [x for x in v if x['cat'] == c]
        print(f'  {str(mode):6} {c:11} IS  {line([x for x in w if x["t"] < cut])}')
        print(f'  {"":6} {"":11} OOS {line([x for x in w if x["t"] >= cut])}')

print('\n=== geopolitics, FIRST entry: P&L by close month ($1 per entry) — are the losses clustered?')
v = [x for x in trades('first') if x['cat'] == 'geopolitics']
by = collections.defaultdict(list)
for x in v: by[dt.datetime.utcfromtimestamp(x['close']).strftime('%Y-%m')].append(x)
for m in sorted(by):
    w = by[m]; lo = [x for x in w if not x['won']]
    print(f'  {m}  n{len(w):4}  losses {len(lo):3}  P&L {sum(x["ret"] for x in w):+7.2f} $' +
          (f'   e.g. {lo[0]["r"]["q"][:70]}' if lo else ''))
cum, dd, wm = book(v)
print(f'  book: total {cum:+.1f} $ on {len(v)} $ staked, max drawdown {dd:.1f} $, worst month {wm[0]} {wm[1]:+.1f} $')
