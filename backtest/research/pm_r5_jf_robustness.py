# Robustness checks of C-fade (round 5 #29): slippage, delayed entry (+1h), one-per-event, volume, what the markets are.
import json, sys, math, re
from collections import Counter, defaultdict
sys.argv = ['bt5.py', 'hist_long.jsonl', '/dev/null', '--is-only']
src = open(__file__.replace('pm_r5_jf_robustness.py', 'pm_r5_new_strategies.py')).read().split("P_(f\"markets {len(rows)}")[0]
exec(src)
def run(slip=0.01, delay=0, one_per_event=False, minvol=0):
    global SLIP; SLIP = slip; g = []; seen = set()
    for m in rows:
        if m['sport'] or m['weather'] or (m.get('volumeNum') or 0) < minvol: continue
        h = m['h']
        for i in range(1, len(h)):
            (t0, p0), (t1, p1) = h[i - 1], h[i]
            if t1 - t0 > 5400 or t1 > m['E'] - 86400 or t1 >= m['C'] - 600: continue
            d = p1 - p0
            if abs(d) >= 0.15 and 0.15 <= p1 <= 0.85:
                k = 1 if d > 0 else 0
                j = i + delay
                if j >= len(h): break
                te, pe = h[j]
                if te >= m['C'] - 600 or te > m['E'] - 86400 + 3600 * delay: break
                q = pe if k == 0 else 1 - pe
                if not (0.05 <= q <= 0.95): break
                e = trade(m, te, k, q, 'C'); e['ev'] = m.get('event_slug') or m['slug']; e['q'] = m['question']; e['vol'] = m.get('volumeNum'); e['neg'] = m.get('negRisk')
                e['rev1'] = (h[i + 1][1] - p1) * (-1 if d > 0 else 1) if i + 1 < len(h) else None
                g.append(e); break
    if one_per_event:
        g.sort(key=lambda e: e['t']); out = []
        for e in g:
            if e['ev'] in seen: continue
            seen.add(e['ev']); out.append(e)
        g = out
    return g
def row(name, g):
    a, b = split(g); A, B = S(a), S(b); print(f"{name:<44} IS {f(A)} | OOS {f(B)}")
base = run(); row('C fade as registered (slip 1c)', base)
for s in (0.02, 0.03, 0.05): row(f'  slip {s}', run(slip=s))
row('  delayed entry: next hourly point (+1h)', run(delay=1))
row('  delayed entry +1h, slip 2c', run(slip=0.02, delay=1))
row('  one per event (first jump)', run(one_per_event=True))
row('  volume >= $100k', run(minvol=100000))
row('  negRisk markets only', [e for e in base if e['neg']]); row('  non-negRisk only', [e for e in base if not e['neg']])
ev = Counter(e['ev'] for e in base); print('events', len(ev), 'markets', len(base), 'top events', ev.most_common(8))
r1 = [e['rev1'] for e in base if e['rev1'] is not None]; print('mean reversion of the jump in the next hour (c, + = reverts):', round(100 * sum(r1) / len(r1), 2), 'share reverting >=5c', round(sum(x >= 0.05 for x in r1) / len(r1), 2))
pf = Counter(re.sub(r'-\d.*', '', e['ev'])[:30] for e in base); print('event slug stems', pf.most_common(15))
# P&L concentration: top 10 trades share of total
tot = sum(e['r'] for e in base); top = sorted((e['r'] for e in base), reverse=True)[:20]; print('sum r', round(tot, 1), 'top-20 trades sum r', round(sum(top), 1))
print('entry price dist', Counter(round(e['px'], 1) for e in base))
