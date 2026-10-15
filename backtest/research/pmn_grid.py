"""Poly News — the full rule search (owner 2026-10-15: "do the long test and reach the best, most profitable formula with many
trades a day"). Rules and splits fixed BEFORE reading results:
  data   Telegram posts (pmn_tg_fetch.py) x Polymarket markets alive at the post (pmn_markets.py), ~365 days;
         CLOB 1-minute history of the market's first outcome from post -15 min to post +4 h (cached per pair).
  match  first 220 chars of the post; words of >= 4 letters minus stopwords; a word is RARE if it appears in <= 3 questions of
         the markets ALIVE at the post time; M2 = >= 2 shared rare words incl. a Capitalised one (the live desk), M1 = >= 1
         shared rare Capitalised word that appears in <= 1 alive question (looser, more trades). One trade per market per hour.
  rule   at post + D (s): move = price(D) - price(post - 60 s); if |move| >= k (and < 20c): FOLLOW buys the side that went up,
         FADE buys the other side; the side's price must be 5-92c. Entry = price + SLIP, exit = price - SLIP at the first of:
         take-profit / stop on the 1-minute path, the time exit X, or the official result (X = res, closed markets only).
         Fee = the market's taker rate x q(1-q) on both legs (none at resolution).
  grid   match {M2, M1} x D {30, 60, 120, 300, 600} x k {1, 2, 3, 5, 8c} x side {follow, fade} x exit {5, 15, 30, 60, 240 min, res}
         x TP/SL {none, 5/5, 10/7, 15/10} x volume {>= $50k, >= $250k, >= $1M} = 21,600 rules.
  split  by post time: SELECT = first 60%, VALIDATE = next 20%, HOLDOUT = last 20% (read once, at the end).
  pass   SELECT: n >= 40, mean > 0, t >= 2 -> VALIDATE: mean > 0, t >= 1 -> HOLDOUT: mean > 0, t >= 1. Ranked by SELECT t only.
         Luck check: with 21,600 rules, ~2.3% pass SELECT t>=2 by chance alone if nothing works; the summary prints both.
Run: python3 -I backtest/research/pmn_grid.py <tg.jsonl> <mk.jsonl> <cache dir> [slip=0.01]
"""
import json, sys, os, re, time, math, statistics as st, collections, itertools, urllib.request, concurrent.futures as cf
import numpy as np

TGF, MKF, CD = sys.argv[1], sys.argv[2], sys.argv[3]; SLIP = float(sys.argv[4]) if len(sys.argv) > 4 else 0.01
os.makedirs(CD, exist_ok=True)
TG = [json.loads(l) for l in open(TGF) if l.strip()]
MK = [json.loads(l) for l in open(MKF) if l.strip()]
NOW = time.time()
for m in MK: m['life'] = (m['start'] or 0, m['close'] or m['end'] or NOW + 1e9)

STOP = set(('will the a an of in on to for by and or with at from as is be this that who what when which after before over under than more '
            'less into about against vs win wins game match first next new says said report reports year years day today week market price '
            'bitcoin crypto breaking just also have has had been were they their there would could should other some most many much very '
            'only like make made back still even here where while then them these those such being does doing done must').split())
def words(s): return {w.strip("'.-").lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9'.-]{3,}", s)} - STOP
def caps(s): return {w.strip("'.-").lower() for w in re.findall(r"\b[A-Z][A-Za-z0-9'.-]{3,}", s)}

# word -> markets (only words in <= 400 questions overall; commoner words can never be rare among the alive set)
gdf = collections.Counter(w for m in MK for w in words(m['q']))
idx = collections.defaultdict(list)
for i, m in enumerate(MK):
    for w in words(m['q']):
        if gdf[w] <= 400: idx[w].append(i)

pairs = {'M2': [], 'M1': []}
for p in TG:
    head = p['text'][:220]; ws = words(head); cp = caps(head); t = p['ts']
    alive_df, cand = {}, collections.Counter()
    for w in ws:
        lst = [i for i in idx.get(w, ()) if MK[i]['life'][0] <= t <= MK[i]['life'][1]]
        if not lst: continue
        alive_df[w] = len(lst)
        if len(lst) <= 3:
            for i in lst: cand[i] += 1
    best2 = None
    for i, sc in cand.most_common(5):
        sh = [w for w in ws if alive_df.get(w, 99) <= 3 and w in words(MK[i]['q'])]
        if sc >= 2 and any(w in cp for w in sh): best2 = i; break
    if best2 is not None: pairs['M2'].append((p, best2))
    best1 = None
    for w in ws:
        if w in cp and alive_df.get(w) == 1:
            best1 = next(i for i in idx[w] if MK[i]['life'][0] <= t <= MK[i]['life'][1]); break
    if best1 is not None: pairs['M1'].append((p, best1))

def hist(pm):
    p, i = pm; m = MK[i]
    f = os.path.join(CD, f"{p['ch']}_{p['id']}_{m['id']}.json")
    if os.path.exists(f): return json.load(open(f))
    u = f"https://clob.polymarket.com/prices-history?market={m['tok'][0]}&startTs={p['ts'] - 900}&endTs={p['ts'] + 4 * 3600 + 120}&fidelity=1"
    h = None
    for k in range(5):
        try: h = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40)); break
        except Exception: time.sleep(1 + 2 * k)
    h = [(int(x['t']), float(x['p'])) for x in (h or {}).get('history', [])]
    json.dump(h, open(f, 'w')); return h

allp = {(p['ch'], p['id'], i): (p, i) for k in pairs for p, i in pairs[k]}
todo = list(allp.values())
print(f'fetching {len(todo)} price paths', file=sys.stderr, flush=True)
H = {}
with cf.ThreadPoolExecutor(16) as ex:
    for n, (pm, h) in enumerate(zip(todo, ex.map(hist, todo))):
        H[(pm[0]['ch'], pm[0]['id'], pm[1])] = h
        if n % 2000 == 0: print(n, file=sys.stderr, flush=True)

# events: one per (match type, market, hour); arrays of the first outcome's price on a 1-minute grid from post -1 min to +240 min
EV = {}
for mt in pairs:
    seen, out = set(), []
    for p, i in sorted(pairs[mt], key=lambda x: x[0]['ts']):
        key = (MK[i]['id'], p['ts'] // 3600)
        if key in seen: continue
        h = H[(p['ch'], p['id'], i)]
        if not h or h[-1][0] < p['ts'] + 300: continue
        ts = np.array([a for a, _ in h]); px = np.array([b for _, b in h])
        grid = p['ts'] + np.arange(-60, 240 * 60 + 1, 30)          # 30-second steps
        j = np.searchsorted(ts, grid, side='right') - 1
        path = np.where(j >= 0, px[np.clip(j, 0, None)], np.nan)
        path[grid > ts[-1] + 120] = np.nan                         # no extrapolation past the last point
        pre = path[0]
        if not (.03 <= pre <= .97): continue
        seen.add(key)
        m = MK[i]
        out.append({'ts': p['ts'], 'ch': p['ch'], 'pre': pre, 'path': path, 'fee': m['fee'] or 0, 'vol': m['vol'],
                    'res': (m['res'][0] if m.get('res') else None), 'q': m['q'], 'text': p['text'][:100]})
    EV[mt] = out

def ffill(A):
    """forward-fill NaN along axis 1 (a path that ended keeps its last price)"""
    A = A.copy()
    for j in range(1, A.shape[1]):
        m = np.isnan(A[:, j]); A[m, j] = A[m, j - 1]
    return A

def returns(E, D, k, side, X, tpsl):
    """vectorised per-$ return of every event in E under one rule; NaN = no trade"""
    P, pre, fee, res = E['P'], E['pre'], E['fee'], E['res']
    iD = (D + 60) // 30
    pD = P[:, iD]; mv = pD - pre
    up = mv > 0
    buy0 = up if side == 'follow' else ~up
    q0 = np.where(buy0, pD, 1 - pD)
    ok = np.isfinite(pD) & (np.abs(mv) >= k) & (np.abs(mv) < .20) & (q0 >= .05) & (q0 <= .92)
    Q = np.where(buy0[:, None], E['F'], 1 - E['F'])
    b = np.minimum(.99, q0 + SLIP); cost = b + fee * b * (1 - b)
    last = P.shape[1] - 1
    end = last if X == 'res' else min(last, iD + X * 2)
    tp, sl = tpsl
    if X == 'res':
        pay = np.where(buy0, res, 1 - res)
        r = (pay - cost) / cost
        exitq = None
    else:
        exitq = Q[:, end]
    if tp:
        W = Q[:, iD + 1:end + 1]
        hit = (W >= (q0 + tp)[:, None]) | (W <= (q0 - sl)[:, None])
        any_hit = hit.any(axis=1); first = hit.argmax(axis=1)
        hq = W[np.arange(len(W)), first]
        exitq = np.where(any_hit, hq, exitq)
    if exitq is not None:
        s_ = np.maximum(0., exitq - SLIP)
        r = (s_ - fee * s_ * (1 - s_) - cost) / cost
    return np.where(ok & np.isfinite(r), r, np.nan)

def stats(v):
    if len(v) < 2: return len(v), 0., 0.
    m = sum(v) / len(v); sd = st.pstdev(v) or 1e-9
    return len(v), m, m / sd * math.sqrt(len(v))

grid = list(itertools.product(['M2', 'M1'], [30, 60, 120, 300, 600], [.01, .02, .03, .05, .08], ['follow', 'fade'],
                              [5, 15, 30, 60, 240, 'res'], [(0, 0), (.05, .05), (.10, .07), (.15, .10)], [5e4, 2.5e5, 1e6]))
ARR, span = {}, {}
for mt, ev in EV.items():
    if not ev: continue
    P = np.array([e['path'] for e in ev])
    ARR[mt] = {'P': P, 'F': ffill(P), 'pre': np.array([e['pre'] for e in ev]), 'fee': np.array([e['fee'] for e in ev], float),
               'res': np.array([np.nan if e['res'] is None else e['res'] for e in ev]), 'vol': np.array([e['vol'] for e in ev]),
               'ts': np.array([e['ts'] for e in ev])}
    tss = np.sort(ARR[mt]['ts'])
    span[mt] = (tss[int(len(tss) * .6)], tss[int(len(tss) * .8)], tss[0], tss[-1])
def st3(v):
    v = v[np.isfinite(v)]
    if len(v) < 2: return (len(v), 0., 0.)
    m = float(v.mean()); sd = float(v.std()) or 1e-9
    return (len(v), m, m / sd * math.sqrt(len(v)))
res = []
cache = {}
for mt, D, k, side, X, tpsl, vmin in grid:
    if X == 'res' and tpsl != (0, 0) or mt not in ARR: continue
    key = (mt, D, k, side, X, tpsl)
    if key not in cache: cache = {key: returns(ARR[mt], D, k, side, X, tpsl)}
    r = cache[key]; A = ARR[mt]; c1, c2, t0, t1 = span[mt]
    m = A['vol'] >= vmin
    S, V, O = r[m & (A['ts'] < c1)], r[m & (A['ts'] >= c1) & (A['ts'] < c2)], r[m & (A['ts'] >= c2)]
    s3, v3, o3 = st3(S), st3(V), st3(O)
    res.append({'rule': (mt, D, k, side, X, tpsl, vmin), 'S': s3, 'V': v3, 'O': o3, 'per_day': (s3[0] + v3[0] + o3[0]) / max(1, (t1 - t0) / 86400)})

def fmt(s): return f'n{s[0]:5} {100 * s[1]:+7.2f}%/$ t{s[2]:+5.2f}'
def rname(r):
    mt, D, k, side, X, tpsl, vmin = r
    return (f"{mt} +{D:3}s move>={int(k * 100)}c {side:6} exit {X if X == 'res' else str(X) + 'm':>4} "
            f"{'tp/sl ' + str(int(tpsl[0] * 100)) + '/' + str(int(tpsl[1] * 100)) if tpsl[0] else 'no tp/sl':>12} vol>=${int(vmin / 1000)}k")

chs = collections.Counter(p['ch'] for p in TG)
d0 = min(p['ts'] for p in TG); d1 = max(p['ts'] for p in TG)
print(f'Poly News rule search: {len(TG):,} Telegram posts from {len(chs)} channels over {(d1 - d0) / 86400:.0f} days, {len(MK):,} markets (>= $50k).')
print(f'Matched (one per market per hour, usable 1-minute path): M2 {len(EV["M2"]):,} events ({len(EV["M2"]) / max(1, (d1 - d0) / 86400):.1f}/day), '
      f'M1 {len(EV["M1"]):,} ({len(EV["M1"]) / max(1, (d1 - d0) / 86400):.1f}/day). Slip {int(SLIP * 100)}c each side + market fee.')
for mt in EV:
    ev = EV[mt]
    mv = [np.nanmax(np.abs(e['path'][:62] - e['pre'])) for e in ev]
    print(f'  {mt}: moved >= 2c within 30 min {100 * np.mean([x >= .02 for x in mv]):.1f}%, >= 5c {100 * np.mean([x >= .05 for x in mv]):.1f}%')
nS = sum(1 for r in res if r['S'][0] >= 40 and r['S'][1] > 0 and r['S'][2] >= 2)
nS40 = sum(1 for r in res if r['S'][0] >= 40)
print(f'\nRules evaluated: {len(res):,}; with n >= 40 in SELECT: {nS40:,}; SELECT pass (mean > 0, t >= 2): {nS} '
      f'(luck alone ~{0.023 * nS40:.0f}).')
sel = sorted([r for r in res if r['S'][0] >= 40 and r['S'][1] > 0 and r['S'][2] >= 2], key=lambda r: -r['S'][2])
val = [r for r in sel if r['V'][1] > 0 and r['V'][2] >= 1]
print(f'VALIDATE pass (of SELECT passers): {len(val)}')
print('\nTop 25 by SELECT t, with VALIDATE (HOLDOUT shown only for VALIDATE passers):')
for r in sel[:25]:
    ok = r['V'][1] > 0 and r['V'][2] >= 1
    print(f"  {rname(r['rule'])}  SEL {fmt(r['S'])} | VAL {fmt(r['V'])} | " + (f"HOLD {fmt(r['O'])}" if ok else 'HOLD (not read)') + f" | {r['per_day']:.1f}/day")
fin = [r for r in val if r['O'][1] > 0 and r['O'][2] >= 1]
print(f'\nHOLDOUT pass (SELECT -> VALIDATE -> HOLDOUT): {len(fin)}')
for r in sorted(fin, key=lambda r: -r['S'][2])[:15]:
    print(f"  {rname(r['rule'])}  SEL {fmt(r['S'])} | VAL {fmt(r['V'])} | HOLD {fmt(r['O'])} | {r['per_day']:.1f}/day")
print('\nThe live desk rule (M2, +60..900 s, move >= 3c, follow, exit 60 m, tp/sl 10/7, vol >= $50k) — nearest grid rows:')
for r in res:
    mt, D, k, side, X, tpsl, vmin = r['rule']
    if mt == 'M2' and D in (60, 300) and k == .03 and side == 'follow' and X == 60 and tpsl == (.10, .07) and vmin == 5e4:
        print(f"  {rname(r['rule'])}  SEL {fmt(r['S'])} | VAL {fmt(r['V'])} | HOLD {fmt(r['O'])} | {r['per_day']:.1f}/day")
print('\nBy channel (M2, follow, +120 s, move >= 2c, exit 60 m, no tp/sl), all periods:')
for c, _ in chs.most_common():
    r = returns(ARR['M2'], 120, .02, 'follow', 60, (0, 0))
    v = r[np.array([e['ch'] == c for e in EV['M2']])]
    s3 = st3(v)
    if s3[0]: print(f'  {c:20} {fmt(s3)}')
json.dump([{**r, 'rule': list(r['rule'])} for r in res], open(os.path.join(CD, 'grid.json'), 'w'))
