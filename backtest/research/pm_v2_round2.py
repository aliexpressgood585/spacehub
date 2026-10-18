# Inputs: hist.jsonl from pm_v2_fetch_hist.py. Run: python3 backtest/research/pm_v2_round2.py hist.jsonl <out.txt>
# Round 2 (2026-10-18): entry-timing, esports-per-game band, momentum / stability filters on the same data as round 1
# (pm_v2_hypotheses.py): resolved non-crypto Polymarket markets >= $20k, endDate 2026-06-01..10-17, 5-min CLOB history
# over [endDate-4h05m, endDate]. Entry = the FIRST 5-min point inside the live window (endDate-4h .. endDate, and at least
# 5 min before closedTime as a proxy for 'still accepting orders') where the favourite is in band AND the variant's
# condition holds, using ONLY points at or before that time (no lookahead). +SLIP on price, market fee rate x p x (1-p).
# IS/OOS = the round-1 baseline's 70/30 entry-time cut (fixed, so all variants share one split).
import json, re, sys, math
from collections import defaultdict, Counter
from datetime import datetime, timezone
SLIP = 0.01
ts = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00').replace(' ', 'T').replace('+00', '+00:00') if x.endswith('+00') else x.replace('Z', '+00:00').replace(' ', 'T')).timestamp()
ESP = {'cs2', 'lol', 'dota2', 'val', 'lec', 'lck', 'lpl', 'r6', 'cod', 'rl', 'ow'}
US = {'nfl', 'nba', 'mlb', 'nhl', 'cfb', 'cbb', 'wnba', 'ncaab', 'kbo', 'npb'}
def cat(m):
    e = (m.get('event_slug') or m['slug']); p = e.split('-')[0]
    if p in ESP: return 'esports'
    if p in US: return 'us-sports'
    if p in ('atp', 'wta', 'itf'): return 'tennis'
    if p in ('ufc', 'boxing'): return 'combat'
    if m.get('gameStartTime') or m.get('sportsMarketType'): return 'soccer/other-sport'
    return 'other'
game = lambda m: (m.get('event_slug') or m['slug']).split('-')[0]
rows = []
for l in open(sys.argv[1]):
    m = json.loads(l)
    if not m.get('h') or (m.get('volumeNum') or 0) < 20000: continue
    m['h'].sort(); m['E'] = ts(m['endDate']); m['C'] = ts(m['closedTime']) if m.get('closedTime') else m['E']
    gs = m.get('gameStartTime') or m.get('eventStartTime'); m['G'] = ts(gs) if gs else None
    m['cat'] = cat(m); m['game'] = game(m); rows.append(m)
def mk(m, i, k, q):
    t = m['h'][i][0]; px = min(0.999, q + SLIP); fs = m.get('feeSchedule') if m.get('feesEnabled') else None
    rate = float((fs or {}).get('rate') or 0); fee = rate * px * (1 - px); won = (m['win0'] == 1) == (k == 0)
    return dict(t=t, q=q, px=px, fee=fee, won=won, r=((1 if won else 0) - px - fee) / (px + fee), cat=m['cat'], game=m['game'], id=m['id'])
def past(m, i, k, mins):  # favourite price `mins` ago (nearest point at or before), None if not in the fetched history
    t0 = m['h'][i][0] - mins * 60; best = None
    for t, p in m['h'][:i + 1]:
        if t <= t0 + 60: best = p if k == 0 else 1 - p
    return best
def run(cond=lambda m, i, k, q: True, lo=0.85, hi=0.92, H=4.0, ref='E', filt=lambda m: True):
    out = []
    for m in rows:
        if not filt(m): continue
        R = m['E'] if ref == 'E' else m['C']
        for i, (t, p) in enumerate(m['h']):
            if t < R - H * 3600 or t > R or t > m['C'] - 300: continue
            hit = None
            for k, q in ((0, p), (1, 1 - p)):
                if lo <= q <= hi and cond(m, i, k, q): hit = mk(m, i, k, q); break
            if hit: out.append(hit); break
    return out
base = run(); base.sort(key=lambda e: e['t']); CUT = base[int(len(base) * 0.7)]['t']
def S(g):
    n = len(g)
    if n < 2: return dict(n=n, mr=float('nan'), t=float('nan'), wr=float('nan'))
    r = [e['r'] for e in g]; mu = sum(r) / n; sd = math.sqrt(sum((x - mu) ** 2 for x in r) / (n - 1)) or 1e-9
    return dict(n=n, mr=mu, t=mu / sd * math.sqrt(n), wr=sum(e['won'] for e in g) / n)
sp = lambda g: ([e for e in g if e['t'] < CUT], [e for e in g if e['t'] >= CUT])
BA, BB = map(S, sp(base))
out = []; NV = [16]; NIS = [0]; TABLE = []
def P(x): out.append(x)
fmt = lambda X: f"n {X['n']:>5} WR {100*X['wr']:5.1f}% {100*X['mr']:+6.2f}%/$ t {X['t']:+5.2f}"
def V(name, g, counted=True):
    A, B = map(S, sp(g))
    if counted:
        NV[0] += 1
        ok = A['mr'] > 0 and B['mr'] > 0 and B['n'] >= 100 and A['mr'] > BA['mr'] and B['mr'] > BB['mr']
        verdict = 'PASS' if ok else 'FAIL'
        if not ok:
            why = []
            if not A['mr'] > 0: why.append('IS<=0')
            if not B['mr'] > 0: why.append('OOS<=0')
            if B['n'] < 100: why.append('OOS n<100')
            if not (A['mr'] > BA['mr'] and B['mr'] > BB['mr']): why.append('not > baseline both')
            verdict += ' (' + ', '.join(why) + ')'
        TABLE.append((f"V{NV[0]:02d}", name, A, B, verdict)); P(f"V{NV[0]:02d} {name:<58} IS {fmt(A)} | OOS {fmt(B)}  {verdict}")
    else: P(f"    {name:<58} IS {fmt(A)} | OOS {fmt(B)}")
    return A, B
def pickIS(name, cands):  # cands: [(label, entries)]; choose best IS mean (n>=30); counts IS looks; returns chosen
    best = None
    for lab, g in cands:
        NIS[0] += 1; A = S(sp(g)[0]); P(f"      IS-only look {name} {lab:<20} {fmt(A)}")
        if A['n'] >= 30 and (best is None or A['mr'] > best[0]): best = (A['mr'], lab, g)
    return best
P(f"markets {len(rows)}; baseline (live rule) entries {len(base)}; cut {datetime.fromtimestamp(CUT, timezone.utc).isoformat()}; slip {SLIP}")
P(f"BASELINE live rule                                              IS {fmt(BA)} | OOS {fmt(BB)}")
P("\n-- DIAGNOSTIC (lookahead, NOT tradable, not counted): keyed on the actual closedTime like the original pm_favourites research")
for H in (3.0, 4.0): V(f"closedTime-keyed {H:.0f}h 85-92 (uses the future close time)", run(H=H, ref='C'), counted=False)
P("\n-- A1 ENTRY TIMING without lookahead: in play (now >= gameStartTime, known in advance) and >= X min since start")
ip = lambda X: (lambda m, i, k, q: m['G'] is not None and m['h'][i][0] >= m['G'] + X * 60)
b = pickIS('A1 minutes-in', [(f"X={X}", run(ip(X))) for X in (0, 30, 60, 90, 120, 150)])
V(f"A1 in play and >= {b[1]} min since start (IS-chosen)", b[2])
b = pickIS('A1b esports minutes-in', [(f"X={X}", run(ip(X), filt=lambda m: m['cat'] == 'esports')) for X in (0, 30, 60, 90, 120)])
V(f"A1b esports, in play {b[1]} min (IS-chosen)", b[2])
P("\n-- A2 esports in play, band per game chosen IS")
bands = [(0.85, 0.88), (0.88, 0.90), (0.90, 0.92), (0.85, 0.90), (0.88, 0.92), (0.85, 0.92)]
picks = []
for gm in ('cs2', 'lol', 'dota2', 'val'):
    b = pickIS(f'A2 {gm}', [(f"{lo}-{hi}", run(ip(0), lo, hi, filt=lambda m, gm=gm: m['game'] == gm)) for lo, hi in bands])
    if b and b[0] > 0: picks.append((gm, b[1], b[2]))
P(f"      A2 picks (IS best > 0 only): {[(g, l) for g, l, _ in picks]}")
V("A2 esports in play, IS-chosen band per game", [e for _, _, g in picks for e in g])
P("\n-- A3 momentum / stability (favourite price path over the last 30-60 min, points at or before entry)")
def mom(mins, mode):
    def c(m, i, k, q):
        p0 = past(m, i, k, mins)
        if p0 is None: return False
        d = q - p0
        return d >= 0.02 if mode == 'rise' else abs(d) <= 0.02 if mode == 'stable' else d >= -0.02
    return c
for mins in (30, 60):
    for mode in ('rise', 'stable', 'notfall'):
        V(f"A3 {mode} over {mins} min (rise >=+2c / |d|<=2c / not fallen >2c)", run(mom(mins, mode)))
def calm(m, i, k, q):
    w = [(p if k == 0 else 1 - p) for t, p in m['h'][:i + 1] if t >= m['h'][i][0] - 1800]
    return len(w) >= 5 and max(w) - min(w) <= 0.03
V("A5 calm: favourite range over last 30 min <= 3c", run(calm))
P("\n-- A4 spread / depth: NOT TESTABLE - CLOB prices-history has no order book (no bid/ask/size history); skipped")
P("\n-- A5 combos of the least-bad pieces (esports, in play, not falling)")
V("A5 esports + in play + not fallen >2c over 30 min", run(lambda m, i, k, q: ip(0)(m, i, k, q) and mom(30, 'notfall')(m, i, k, q), filt=lambda m: m['cat'] == 'esports'))
V("A5 esports + in play + rise >=2c over 30 min", run(lambda m, i, k, q: ip(0)(m, i, k, q) and mom(30, 'rise')(m, i, k, q), filt=lambda m: m['cat'] == 'esports'))
P(f"\ncumulative variants read OOS: {NV[0]} (16 in round 1 + {NV[0]-16} now); extra IS-only looks for parameter choice: {NIS[0]}")
open(sys.argv[2], 'w').write('\n'.join(out)); print('\n'.join(out))
json.dump([(a, b, A, B, v) for a, b, A, B, v in TABLE], open(sys.argv[2] + '.json', 'w'))
