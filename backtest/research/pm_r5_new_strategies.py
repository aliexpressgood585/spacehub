# Round 5: NEW strategy families on resolved Polymarket markets (pre-registered in PREREGISTRATION.md). Paper research only.
# Usage: python3 backtest/research/pm_r5_new_strategies.py hist_long.jsonl status/pm-r5-new-strategies.txt [--is-only]
# Pre-registration: status/pm-r5-new-strategies.txt (section 1, written before any result).
# Data: hist_long.jsonl = hourly CLOB prices-history [endDate-14d, close] of resolved Polymarket markets >= $20k
# (endDate 2026-06-01..10-17), built by pm_v2_fetch_markets.py + pm_r5_fetch_hist_long.py (public endpoints, no keys).
import json, re, sys, math
from collections import defaultdict, Counter
from datetime import datetime, timezone
SLIP = 0.01; ISONLY = '--is-only' in sys.argv
P = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00').replace(' ', 'T').replace('+00', '+00:00') if x.endswith('+00') else x.replace('Z', '+00:00').replace(' ', 'T')).timestamp()
SPORT_PFX = {'cs2','lol','dota2','val','lec','nfl','nba','mlb','nhl','cfb','cbb','wnba','kbo','npb','atp','wta','itf','ufc','boxing','epl','ucl','uel','lal','bun','sea','fl1','mls','fifwc','fif','unl','arg','bra','bra2','mex','col','col1','sud','chi','elc','clf','swe','spl','nor','ere','por','kor','jap','ja2','es2','bl2','tur','efl','crint','acle','uecl','crict20blast'}
rows = []
for l in open(sys.argv[1]):
    m = json.loads(l)
    if not m.get('h') or (m.get('volumeNum') or 0) < 20000: continue
    m['h'].sort(); m['E'] = P(m['endDate']); m['C'] = P(m['closedTime']) if m.get('closedTime') else m['E']
    gs = m.get('gameStartTime') or m.get('eventStartTime'); m['G'] = P(gs) if gs and (m.get('gameStartTime') or m.get('sportsMarketType')) else None
    e = m.get('event_slug') or m['slug']; pf = e.split('-')[0]
    m['sport'] = bool(m.get('gameStartTime') or m.get('sportsMarketType') or pf in SPORT_PFX); m['pfx'] = pf
    m['weather'] = 'temperature' in e or 'weather' in e or 'rain' in e
    try: outs = json.loads(m.get('outcomes') or '[]')
    except Exception: outs = []
    m['yes_idx'] = 0 if outs[:1] == ['Yes'] else (1 if outs[1:2] == ['Yes'] else None)
    rows.append(m)
def trade(m, t, k, q, tag):
    px = min(0.999, q + SLIP); fs = m.get('feeSchedule') if m.get('feesEnabled') else None
    rate = float((fs or {}).get('rate') or 0); fee = rate * px * (1 - px); won = (m['win0'] == 1) == (k == 0)
    return dict(t=t, px=px, fee=fee, won=won, r=((1 if won else 0) - px - fee) / (px + fee), days=max(1 / 24, (m['C'] - t) / 86400), id=m['id'], tag=tag, pfx=m['pfx'])
def at(m, t0):  # first hourly point at/after t0 (and within 2h of it), market still open
    for t, p in m['h']:
        if t >= t0:
            return (t, p) if t <= t0 + 7200 and t < m['C'] - 600 else None
    return None
def S(g):
    n = len(g)
    if n < 2: return dict(n=n, mr=float('nan'), t=float('nan'), wr=float('nan'), d=float('nan'), pd=float('nan'))
    r = [e['r'] for e in g]; mu = sum(r) / n; sd = math.sqrt(sum((x - mu) ** 2 for x in r) / (n - 1)) or 1e-9
    D = sum(e['days'] for e in g)
    return dict(n=n, mr=mu, t=mu / sd * math.sqrt(n), wr=sum(e['won'] for e in g) / n, d=D / n, pd=sum(r) / D)
def split(g):
    g = sorted(g, key=lambda e: e['t']); c = int(len(g) * 0.7); return g[:c], g[c:]
out = []; NOOS = [28]; NIS = [0]; TAB = []
def P_(x): out.append(x); print(x, flush=True)
f = lambda X: f"n {X['n']:>5} WR {100*X['wr']:5.1f}% {100*X['mr']:+6.2f}%/$ t {X['t']:+5.2f} days {X['d']:5.2f} {100*X['pd']:+.3f}%/$-day (ann {100*365*X['pd']:+.0f}%)"
def look(name, g, oos=True):
    a, b = split(g); A = S(a); NIS[0] += 1
    if ISONLY or not oos:
        P_(f"IS-only  {name:<52} IS {f(A)}"); return A, None
    B = S(b); NOOS[0] += 1
    ok = A['mr'] > 0 and B['mr'] > 0 and B['n'] >= 100
    v = 'PASS' if ok else 'FAIL'
    TAB.append((NOOS[0], name, A, B, v)); P_(f"OOS#{NOOS[0]:02d}  {name:<52} IS {f(A)} | OOS {f(B)}  {v}"); return A, B
# ---- A longshot NO
def ruleA(T):
    g = []
    for m in rows:
        if m['sport'] or m['weather'] or m['yes_idx'] is None: continue
        x = at(m, m['E'] - T * 86400)
        if not x: continue
        t, p0 = x; yes = p0 if m['yes_idx'] == 0 else 1 - p0
        if 0.03 <= yes <= 0.15:
            k = 1 - m['yes_idx']; g.append(trade(m, t, k, 1 - yes, f'A{T}'))
    return g
# ---- B long-horizon favourite
def ruleB(T):
    g = []
    for m in rows:
        if m['weather']: continue
        x = at(m, m['E'] - T * 86400)
        if not x: continue
        t, p0 = x
        for k, q in ((0, p0), (1, 1 - p0)):
            if 0.93 <= q <= 0.98: g.append(trade(m, t, k, q, f'B{T}')); break
    return g
# ---- C jump fade / follow
def ruleC(mode):
    g = []
    for m in rows:
        if m['sport'] or m['weather']: continue
        h = m['h']
        for i in range(1, len(h)):
            (t0, p0), (t1, p1) = h[i - 1], h[i]
            if t1 - t0 > 5400 or t1 > m['E'] - 86400 or t1 >= m['C'] - 600: continue
            d = p1 - p0
            if abs(d) >= 0.15 and 0.15 <= p1 <= 0.85:
                up0 = d > 0  # outcome 0 rose
                k = (1 if up0 else 0) if mode == 'fade' else (0 if up0 else 1)
                q = p1 if k == 0 else 1 - p1
                g.append(trade(m, t1, k, q, f'C{mode}')); break
    return g
# ---- D mention / count NO
RX = re.compile(r'\b(say|says|said|mention|mentions|tweet|tweets|post|posts)\b', re.I)
def ruleD():
    g = []
    for m in rows:
        if m['sport'] or m['yes_idx'] is None or not RX.search(m.get('question') or ''): continue
        x = at(m, m['E'] - 86400)
        if not x: continue
        t, p0 = x; yes = p0 if m['yes_idx'] == 0 else 1 - p0
        if 0.05 <= yes <= 0.40: g.append(trade(m, t, 1 - m['yes_idx'], 1 - yes, 'D'))
    return g
# ---- E pre-game favourite
def ruleE():
    g = []
    for m in rows:
        if not m['G'] or m.get('sportsMarketType') not in ('moneyline', 'child_moneyline'): continue
        x = at(m, m['G'] - 3 * 3600)
        if not x or x[0] >= m['G']: continue
        t, p0 = x
        for k, q in ((0, p0), (1, 1 - p0)):
            if 0.60 <= q <= 0.85: g.append(trade(m, t, k, q, 'E')); break
    return g
P_(f"markets {len(rows)} (sports {sum(m['sport'] for m in rows)}); slip {SLIP}; mode {'IS-only' if ISONLY else 'IS+OOS'}")
P_('\n== A longshot NO (non-sports Yes/No, YES 3-15c at T before end)')
GA = {T: ruleA(T) for T in (7, 3, 1)}
if all(S(split(GA[T])[0])['mr'] <= 0 for T in GA): [look(f'A T={T}d', GA[T], oos=False) for T in GA]; P_('   A stopped: IS <= 0 for every variant')
else: [look(f'A T={T}d', GA[T]) for T in GA]
P_('\n== B long-horizon favourite 93-98c')
GB = {T: ruleB(T) for T in (7, 3)}
if all(S(split(GB[T])[0])['mr'] <= 0 for T in GB): [look(f'B T={T}d', GB[T], oos=False) for T in GB]; P_('   B stopped: IS <= 0 for every variant')
else: [look(f'B T={T}d', GB[T]) for T in GB]
P_('\n== C jump >= 15c in <= 1.5h (non-sports), fade vs follow chosen IS')
GC = {md: ruleC(md) for md in ('fade', 'follow')}
ISC = {md: S(split(GC[md])[0]) for md in GC}
for md in GC: NIS[0] += 1; P_(f"IS-only  C {md:<50} IS {f(ISC[md])}")
best = max(GC, key=lambda md: ISC[md]['mr'])
if ISC[best]['mr'] <= 0: P_('   C stopped: IS <= 0 both directions')
else: look(f'C {best} (IS-chosen)', GC[best])
P_('\n== D mention/count NO at T=1d, YES 5-40c')
gd = ruleD()
if S(split(gd)[0])['mr'] <= 0: look('D', gd, oos=False); P_('   D stopped: IS <= 0')
else: look('D', gd)
P_('\n== E pre-game favourite 60-85c at start-3h, leagues chosen IS')
ge = ruleE(); a, _ = split(ge); cut = a[-1]['t'] if a else 0
lg = defaultdict(list)
for e in a: lg[e['pfx']].append(e)
keep = []
for k, g in sorted(lg.items(), key=lambda kv: -len(kv[1])):
    s = S(g)
    if s['n'] >= 50: NIS[0] += 1; P_(f"IS-only  E league {k:<43} IS {f(s)}"); keep += [k] if s['mr'] > 0 else []
P_(f"   E kept leagues: {keep}")
if not keep: P_('   E stopped: no league IS > 0 with n >= 50')
else:
    g = [e for e in ge if e['pfx'] in keep]
    A = S([e for e in g if e['t'] <= cut]); B = S([e for e in g if e['t'] > cut]); NOOS[0] += 1
    v = 'PASS' if A['mr'] > 0 and B['mr'] > 0 and B['n'] >= 100 else 'FAIL'
    TAB.append((NOOS[0], 'E pooled kept leagues', A, B, v)); P_(f"OOS#{NOOS[0]:02d}  {'E pooled kept leagues (IS cut of all E)':<52} IS {f(A)} | OOS {f(B)}  {v}")
P_(f"\ncumulative OOS looks: {NOOS[0]} (28 before this round); IS looks this round: {NIS[0]}")
open(sys.argv[2], 'w').write('\n'.join(out))
json.dump([(a, b, A, B, v) for a, b, A, B, v in TAB], open(sys.argv[2] + '.json', 'w'))
