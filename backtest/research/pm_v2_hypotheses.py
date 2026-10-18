# Inputs: hist.jsonl from pm_v2_fetch_hist.py (run in its directory after pm_v2_fetch_markets.py markets.jsonl)
# Step 3 backtest: the live Poly rule (favourite 85-92c, market endDate within 4h, hold to the official result) and
# hypothesis variants, on resolved Polymarket markets Jun 1 - Oct 17 2026 (Gamma + CLOB prices-history, 5-min points).
# Cost model: entry = history price + SLIP (default 1c), taker fee = market feeSchedule rate x px x (1-px) per share
# (feesEnabled markets; rate from Gamma: 0.03-0.07), r = (won - px - fee) / (px + fee).
# Time split by entry time: first 70% IS, last 30% OOS. Paper research only.
import json, re, sys, math, warnings
from collections import defaultdict, Counter
from datetime import datetime
SLIP = float(sys.argv[2]) if len(sys.argv) > 2 else 0.01
ts = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00').replace(' ', 'T').replace('+00', '+00:00') if x.endswith('+00') else x.replace('Z', '+00:00').replace(' ', 'T')).timestamp()
ESP = {'cs2', 'lol', 'dota2', 'val', 'lec', 'lck', 'lpl', 'r6', 'cod', 'rl', 'ow'}
US = {'nfl', 'nba', 'mlb', 'nhl', 'cfb', 'cbb', 'wnba', 'ncaab', 'kbo', 'npb'}
TEN = {'atp', 'wta', 'itf', 'chall'}
def cat(m):
    e = (m.get('event_slug') or m['slug']); p = e.split('-')[0]
    if p in ESP: return 'esports'
    if p in US: return 'us-sports'
    if p in TEN: return 'tennis'
    if p in ('ufc', 'boxing', 'mma', 'pfl'): return 'combat'
    if m.get('gameStartTime') or m.get('sportsMarketType'): return 'soccer/other-sport'
    if 'elon' in e or 'tweet' in e: return 'tweets'
    if 'temperature' in e: return 'weather'
    return 'other'
def match_key(m):
    e = m.get('event_slug') or m['slug']; g = re.match(r'^(.*?\d{4}-\d{2}-\d{2})', e); return g.group(1) if g else e
def entry(m, lo=0.85, hi=0.92, H=4.0, guard=300):
    E = ts(m['endDate']); C = ts(m['closedTime']) if m.get('closedTime') else E
    for t, p in m['h']:
        if t < E - H * 3600 or t > E or t > C - guard: continue
        for k, q in ((0, p), (1, 1 - p)):
            if lo <= q <= hi:
                px = min(0.999, q + SLIP); fs = m.get('feeSchedule') if m.get('feesEnabled') else None
                rate = float((fs or {}).get('rate') or 0); fee = rate * px * (1 - px)
                won = (m['win0'] == 1) == (k == 0)
                gs = m.get('gameStartTime') or m.get('eventStartTime')
                return dict(t=t, q=q, px=px, fee=fee, rate=rate, won=won, r=((1 if won else 0) - px - fee) / (px + fee),
                            hrs=(E - t) / 3600, cat=cat(m), typ=m.get('sportsMarketType') or 'none', match=match_key(m),
                            inplay=(t >= ts(gs)) if gs else None, disputed='disputed' in str(m.get('umaResolutionStatuses') or ''), id=m['id'], slug=m['slug'])
    return None
rows = []
for l in open(sys.argv[1]):
    m = json.loads(l)
    if not m.get('h') or (m.get('volumeNum') or 0) < 20000: continue
    m['h'].sort()
    rows.append(m)
base = [e for e in (entry(m) for m in rows) if e]
base.sort(key=lambda e: e['t'])
CUT = base[int(len(base) * 0.7)]['t'] if base else 0
def S(g):
    n = len(g)
    if n < 2: return dict(n=n, wr=float('nan'), mr=float('nan'), t=float('nan'), pnl=float('nan'))
    r = [e['r'] for e in g]; m = sum(r) / n; sd = math.sqrt(sum((x - m) ** 2 for x in r) / (n - 1)) or 1e-9
    return dict(n=n, wr=sum(e['won'] for e in g) / n, mr=m, t=m / sd * math.sqrt(n), px=sum(e['px'] for e in g) / n)
def split(g): return [e for e in g if e['t'] < CUT], [e for e in g if e['t'] >= CUT]
out = []
def P(*a): out.append(' '.join(str(x) for x in a))
def line(name, g, ref=None):
    a, b = split(g); A, B = S(a), S(b)
    flag = ''
    if ref is not None:
        RA, RB = S(split(ref)[0]), S(split(ref)[1])
        ship = A['mr'] > 0 and B['mr'] > 0 and B['n'] >= 100 and A['mr'] > RA['mr'] and B['mr'] > RB['mr']
        flag = 'PASS' if ship else ('pos both, n<100' if A['mr'] > 0 and B['mr'] > 0 else '')
    f = lambda X: f"n {X['n']:>5} WR {100*X['wr']:5.1f}% px {100*X.get('px', float('nan')):5.1f} {100*X['mr']:+6.2f}%/$ t {X['t']:+5.2f}"
    P(f"{name:<44} IS {f(A)} | OOS {f(B)}  {flag}")
    return A, B
NV = [0]
def V(name, g, ref):  # a counted variant
    NV[0] += 1; return line(f"V{NV[0]:02d} {name}", g, ref)
P(f"markets with history: {len(rows)}; baseline entries {len(base)}; slip {SLIP}; IS/OOS cut {datetime.fromtimestamp(CUT).isoformat() if CUT else None}")
P(f"categories: {Counter(e['cat'] for e in base)}")
P(f"fee rates: {Counter(e['rate'] for e in base)}")
P('\n== BASELINE (live rule, every market independent, no portfolio caps)')
line('baseline 85-92 / 4h', base)
for c in sorted({e['cat'] for e in base}): line(f'  cat {c}', [e for e in base if e['cat'] == c])
for lo, hi in ((0.85, 0.88), (0.88, 0.90), (0.90, 0.92)): line(f'  bucket {lo}-{hi}', [e for e in base if lo <= e['q'] < hi + (1e-9 if hi == 0.92 else 0)])
for a, b in ((0, 0.5), (0.5, 1), (1, 2), (2, 4.01)): line(f'  hours {a}-{b}', [e for e in base if a <= e['hrs'] < b])
for ip in (True, False, None): line(f'  in-play={ip}', [e for e in base if e['inplay'] is ip])
for ty, n in Counter(e['typ'] for e in base).most_common(8): line(f'  type {ty}', [e for e in base if e['typ'] == ty])
line('  disputed at some point (descriptive, not point-in-time)', [e for e in base if e['disputed']])
P('\n== HYPOTHESES (each counted; PASS = positive IS and OOS, OOS n>=100, and better than baseline in BOTH halves)')
# H1 category filters
V('H1 esports only', [e for e in base if e['cat'] == 'esports'], base)
V('H1 exclude esports', [e for e in base if e['cat'] != 'esports'], base)
V('H1 exclude tennis', [e for e in base if e['cat'] != 'tennis'], base)
V('H1 exclude us-sports', [e for e in base if e['cat'] != 'us-sports'], base)
# H2 band per category chosen on IS, read OOS once
bands = [(0.85, 0.88), (0.88, 0.90), (0.90, 0.92), (0.85, 0.90), (0.88, 0.92), (0.86, 0.92), (0.85, 0.92)]
pick = []
for c in sorted({e['cat'] for e in base}):
    best = None
    for lo, hi in bands:
        g = [e for e in base if e['cat'] == c and lo <= e['q'] <= hi]; A = S(split(g)[0])
        if A['n'] >= 30 and (best is None or A['mr'] > best[0]): best = (A['mr'], lo, hi)
    if best and best[0] > 0: pick.append((c, best[1], best[2]))
P(f"   H2 IS-chosen bands per category (dropped if IS best <= 0): {pick}")
V('H2 band per category (IS-chosen)', [e for e in base if any(e['cat'] == c and lo <= e['q'] <= hi for c, lo, hi in pick)], base)
# H3 fee-aware edge skip: IS calibration per (category, 1c bucket); enter only if IS WR - (px + fee) > 0 with IS n >= 30
cal = defaultdict(list)
for e in split(base)[0]: cal[(e['cat'], round(e['q'], 2))].append(e)
def edge_ok(e):
    g = cal.get((e['cat'], round(e['q'], 2)))
    return bool(g) and len(g) >= 30 and sum(x['won'] for x in g) / len(g) - (e['px'] + e['fee']) > 0
V('H3 fee-aware: IS WR(cat,1c) > px+fee (n>=30)', [e for e in base if edge_ok(e)], base)
V('H3b skip fee rate >= 0.05', [e for e in base if e['rate'] < 0.05], base)
# H4 correlation: lifetime first entry per match only
seen = set(); first = []
for e in base:
    if e['match'] in seen: continue
    seen.add(e['match']); first.append(e)
V('H4 first entry per match only (lifetime)', first, base)
seen = Counter(); two = []
for e in base:
    if seen[e['match']] >= 2: continue
    seen[e['match']] += 1; two.append(e)
V('H4b at most 2 entries per match (lifetime)', two, base)
# H5 in-play / pre-start
V('H5 in-play only (entry after gameStartTime)', [e for e in base if e['inplay'] is True], base)
V('H5 pre-start only', [e for e in base if e['inplay'] is False], base)
# H6 market type
V('H6 moneyline + child_moneyline only', [e for e in base if e['typ'] in ('moneyline', 'child_moneyline')], base)
V('H6 exclude spreads/totals/handicaps', [e for e in base if not re.search(r'spread|total|handicap', e['typ'])], base)
# H7 resolution risk: market has a known game start (sports/esports) - rules-wording markets excluded
V('H7 require gameStartTime (no rules-wording markets)', [e for e in base if e['inplay'] is not None], base)
# H8 window
for H in (2.0, 3.0):
    g = [e for e in (entry(m, H=H) for m in rows) if e]; V(f'H8 window {H:.0f}h', g, base)
# daily clustering of losses in baseline
day = defaultdict(list)
for e in base: day[datetime.fromtimestamp(e['t']).date()].append(e)
dl = sorted(((sum(not x['won'] for x in g), len(g), d) for d, g in day.items()), reverse=True)[:5]
P(f"\nworst days by losses (baseline): {[(str(d), l, n) for l, n, d in dl]}")
P(f"variants counted: {NV[0]}  (at 5% per look, ~{NV[0]*0.05:.1f} false 'both positive' would not be surprising if baseline ~0)")
open(sys.argv[3] if len(sys.argv) > 3 else '/dev/null', 'w').write('\n'.join(out)); print('\n'.join(out))
json.dump(base, open(sys.argv[1] + '.entries.json', 'w'))
