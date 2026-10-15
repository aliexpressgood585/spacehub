"""Poly News study (owner 2026-10-15: "a separate news desk, Telegram + general channels, highest level"). Rules fixed before reading.
Does a Telegram post move a Polymarket market, and is there time left to ride it?
Input: pmn_tg_fetch.py posts + pmn_markets.py universe. Matching (same idea as scripts/pm-news.ts, tightened for long posts):
  first 220 characters of the post; words of >= 4 letters minus stopwords; a shared word counts only if it is RARE (in <= 3
  market questions of the whole universe) and the market was live at the post time; score = shared rare words; keep the best
  market per post if score >= 2 and at least one shared word is Capitalised in the post (a name, not a common word).
Prices: CLOB 1-minute history of the YES token from post - 15 min to post + 4 h (cached per pair).
  p_pre = price at post - 60 s; p(D) = last point at or before post + D.
  MOVE = any |p - p_pre| >= 2c within 30 min after the post (does the news move the market at all?).
  FOLLOW(D, k): at post + D, if |p(D) - p_pre| >= k, buy the side that went up at its price + 1c (cap 0.97), exit at
    +30 m / +60 m / +4 h at that side's price - 1c; fee = rate x p(1-p) on both legs. IS = first 70% of posts, OOS = rest.
Run: python3 -I backtest/research/pmn_study.py <tg.jsonl> <mk.jsonl> <cache dir>
"""
import json, sys, os, re, time, math, statistics as st, collections, urllib.request, concurrent.futures as cf

TG = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
MK = [json.loads(l) for l in open(sys.argv[2]) if l.strip()]
CD = sys.argv[3]; os.makedirs(CD, exist_ok=True)
STOP = set('will the a an of in on to for by and or with at from as is be this that who what when which after before over under than more '
           'less into about against vs win wins game match first next new says said report reports year years day today week market price '
           'bitcoin crypto breaking just also have has had been were they their there would could should other some most many much very '
           'only like make made back still even here where while than then them these those such been being does doing done must'.split())
def words(s): return {w.strip("'.-").lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9'.-]{3,}", s)} - STOP
def caps(s): return {w.strip("'.-").lower() for w in re.findall(r"\b[A-Z][A-Za-z0-9'.-]{3,}", s)}
df = collections.Counter(w for m in MK for w in words(m['q']))
idx = collections.defaultdict(list)
for i, m in enumerate(MK):
    for w in words(m['q']):
        if df[w] <= 3: idx[w].append(i)
now = time.time()
pairs = []
for p in TG:
    head = p['text'][:220]; ws = words(head); cp = caps(head)
    cand = collections.Counter()
    for w in ws:
        for i in idx.get(w, ()): cand[i] += 1
    best = None
    for i, sc in cand.most_common(5):
        m = MK[i]
        if sc < 2 or not (m['start'] or 0) <= p['ts'] <= (m['close'] or m['end'] or now + 1e9): continue
        if not (words(m['q']) & ws & cp): continue
        best = (i, sc); break
    if best: pairs.append({'post': p, 'm': MK[best[0]], 'score': best[1]})

def hist(pr):
    p, m = pr['post'], pr['m']
    fp = os.path.join(CD, f"{p['ch']}_{p['id']}_{m['id']}.json")
    if os.path.exists(fp): return json.load(open(fp))
    u = f"https://clob.polymarket.com/prices-history?market={m['tok'][0]}&startTs={p['ts'] - 900}&endTs={p['ts'] + 4 * 3600}&fidelity=1"
    h = None
    for k in range(5):
        try: h = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40)); break
        except Exception: time.sleep(1 + 2 * k)
    h = [(int(x['t']), float(x['p'])) for x in (h or {}).get('history', [])]
    json.dump(h, open(fp, 'w')); return h

with cf.ThreadPoolExecutor(12) as ex:
    for pr, h in zip(pairs, ex.map(hist, pairs)): pr['h'] = h

def at(h, t):
    v = None
    for ts, x in h:
        if ts <= t: v = x
        else: break
    return v

rows = []
for pr in pairs:
    h, t0 = pr['h'], pr['post']['ts']
    pre = at(h, t0 - 60)
    if pre is None or not .03 <= pre <= .97 or not h or h[-1][0] < t0 + 1800: continue
    win = [x for ts, x in h if t0 - 60 < ts <= t0 + 1800]
    pr['pre'] = pre; pr['maxmove'] = max((abs(x - pre) for x in win), default=0)
    pr['at'] = {D: at(h, t0 + D) for D in (30, 60, 120, 300, 600, 1800, 3600, 14400)}
    rows.append(pr)

def ret(side_px_in, side_px_out, fee):
    b = min(.97, side_px_in + .01); s = max(.0, side_px_out - .01)
    c = b + fee * b * (1 - b); return (s - fee * s * (1 - s) - c) / c

chs = collections.Counter(p['ch'] for p in TG)
print(f'Poly News study: {len(TG):,} Telegram posts from {len(chs)} public channels over the last ~45 days; {len(MK):,} Polymarket markets (volume >= $50k).')
print('Posts per channel: ' + ', '.join(f'{c} {n}' for c, n in chs.most_common()))
print(f'Matched post -> live market (score >= 2 rare words incl. a name): {len(pairs):,} ({100 * len(pairs) / max(1, len(TG)):.1f}% of posts); '
      f'with usable 1-minute prices (3-97c, 30 min after): {len(rows):,}.')
mv = [r for r in rows if r['maxmove'] >= .02]
print(f'Market moved >= 2c within 30 min of the post: {len(mv)} of {len(rows)} ({100 * len(mv) / max(1, len(rows)):.1f}%); >= 5c: '
      f'{sum(r["maxmove"] >= .05 for r in rows)}.')
for D in (30, 60, 120, 300):
    sh = [abs(r['at'][D] - r['pre']) / r['maxmove'] for r in mv if r['at'][D] is not None and r['maxmove'] > 0]
    if sh: print(f'  share of the 30-min max move already done at post + {D:4} s: median {100 * st.median(sh):5.1f}%')
print('\nBy channel (matched, usable, moved >= 2c):')
for c, _ in chs.most_common():
    a = [r for r in rows if r['post']['ch'] == c]
    if a: print(f'  {c:20} {len(a):5}  moved {sum(r["maxmove"] >= .02 for r in a):4}')

cut = sorted(r['post']['ts'] for r in rows)[int(len(rows) * .7)] if rows else 0
print('\nFOLLOW the move (buy the side that went up, +1c, fees; exit at the side price - 1c):')
for D, k in ((60, .02), (120, .02), (120, .03), (300, .03), (300, .05)):
    for X in (1800, 3600, 14400):
        I, O = [], []
        for r in rows:
            pD, pX = r['at'][D], r['at'][X]
            if pD is None or pX is None: continue
            mvD = pD - r['pre']
            if abs(mvD) < k: continue
            sideIn, sideOut = (pD, pX) if mvD > 0 else (1 - pD, 1 - pX)
            if sideIn > .95: continue
            (I if r['post']['ts'] < cut else O).append(ret(sideIn, sideOut, r['m']['fee']))
        def s(v):
            if len(v) < 5: return f'n{len(v):4}'
            m = sum(v) / len(v); sd = st.pstdev(v) or 1e-9
            return f'n{len(v):4} WR {100 * sum(x > 0 for x in v) / len(v):5.1f}% {100 * m:+6.2f}%/$ t{m / sd * math.sqrt(len(v)):+5.2f}'
        print(f'  decide at +{D:3}s, move >= {int(k * 100)}c, exit +{X // 60:4} m:  IS {s(I)} | OOS {s(O)}')
print('\nBiggest moves after a post (check the matching by eye):')
for r in sorted(mv, key=lambda r: -r['maxmove'])[:15]:
    print(f"  [{r['post']['ch']}] {r['post']['text'][:80]!r}\n      -> {r['m']['q'][:80]}  pre {r['pre']:.3f} +60s {r['at'][60]} +5m {r['at'][300]} +30m {r['at'][1800]}")
