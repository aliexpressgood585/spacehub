# meme desk: is there a rule that pays AFTER a pump.fun coin graduates to its PumpSwap pool? Pool fees are ~0.3% per side
# instead of the curve's 1.25%, so the cost that sank every curve rule (status/meme-paths.txt) is far smaller here.
# Data: meme_grad_fetch.py (GeckoTerminal 1-minute OHLCV in USD from the first pool trade; a missing minute = no trade).
# Model: decision on a bar's close, fill at the NEXT traded bar's open; stop/target checked on bar high/low, stop first when
# both touch; a stop gapped through fills at the bar's open. Costs: fee 0.3%/side, 0.5%/side impact+spread, 0.001 SOL tx
# per side on a 0.14 SOL stake (1.4% round trip). One trade per coin. IS = first 60% of coins by graduation time, OOS = rest.
# Usage: python3 meme_grad.py grad.jsonl
import json, sys, bisect, math, itertools, statistics as st

FEE, IMP, TXRT = 0.003, 0.005, 2 * 0.001 / 0.14
C = [json.loads(l) for l in open(sys.argv[1])]
C = [c for c in C if len(c['bars']) >= 10]
for c in C:
    c['tg'] = c['bars'][0][0]; c['ts'] = [b[0] for b in c['bars']]
C.sort(key=lambda c: c['tg'])
nIS = int(len(C) * 0.6); split = C[nIS]['tg'] if nIS < len(C) else 1e18

def net(entry, exit_):
    return exit_ / entry * (1 - FEE - IMP) ** 2 - 1 - TXRT if entry > 0 else 0.0

def fill_after(c, t):                          # first traded bar strictly after t -> (index, open)
    i = bisect.bisect_right(c['ts'], t)
    return (i, c['bars'][i][1]) if i < len(c['bars']) else (None, None)

def exit_from(c, i0, px, tp, sl, H):
    tend = c['bars'][i0][0] + H * 60
    for k in range(i0, len(c['bars'])):
        ts, o, h, l, cl, v = c['bars'][k]
        if ts > tend: break
        if sl is not None and l <= px * (1 + sl): return min(o, px * (1 + sl)) if k > i0 else px * (1 + sl)
        if tp is not None and h >= px * (1 + tp): return max(o, px * (1 + tp)) if k > i0 else px * (1 + tp)
    j = bisect.bisect_right(c['ts'], tend) - 1
    return c['bars'][max(j, i0)][4]

def close_at(c, t):
    i = bisect.bisect_right(c['ts'], t) - 1
    return c['bars'][i][4] if i >= 0 else None

def signal(c, kind, a):                         # decision time (bar ts) or None
    tg = c['tg']
    if kind == 'delay': return tg + a['k'] * 60
    for b in c['bars']:
        t = b[0]; m = (t - tg) / 60
        if m < a.get('kmin', 1) or m > 180: continue
        if kind == 'mom':
            past = close_at(c, t - a['L'] * 60)
            if past and b[4] / past - 1 >= a['r']: return t
        elif kind == 'dip':
            hi = max(x[2] for x in c['bars'] if tg <= x[0] <= t)
            if b[4] <= hi * (1 - a['d']): return t
    return None

def run(kind, a, tp, sl, H):
    out = []
    for c in C:
        t = signal(c, kind, a)
        if t is None: continue
        i, px = fill_after(c, t)
        if i is None or not px: continue
        out.append((c['tg'] < split, net(px, exit_from(c, i, px, tp, sl, H))))
    return out

def s(v):
    if len(v) < 2: return (len(v), float('nan'), float('nan'), float('nan'))
    m = st.mean(v); sd = st.pstdev(v)
    return (len(v), m, sum(r > 0 for r in v) / len(v), m / (sd / math.sqrt(len(v))) if sd else 0)
fmt = lambda x: f"n{x[0]:>4} {x[1]*100:+6.1f}% WR{x[2]*100:3.0f}% t{x[3]:+5.1f}"

print(f"graduated coins with >=10 traded minutes: {len(C)}; IS {nIS} / OOS {len(C)-nIS}")
print(f"costs: fee {FEE*100}% + impact {IMP*100}% per side, tx {TXRT*100:.1f}% round trip\n")
print("BUY-AND-HOLD from graduation (+1 min fill), gross price change, median / mean, coins with data that far:")
for H in (15, 60, 180, 360, 720):
    v = []
    for c in C:
        i, px = fill_after(c, c['tg'] + 60)
        if i is None or c['ts'][-1] < c['tg'] + H * 60: continue
        v.append(close_at(c, c['tg'] + 60 + H * 60) / px - 1)
    if v: print(f"  {H:>4} min: n{len(v)} median {st.median(v)*100:+.1f}% mean {st.mean(v)*100:+.1f}% share up {sum(x > 0 for x in v)/len(v)*100:.0f}%")

ENT = [('delay', dict(k=k)) for k in (1, 5, 15, 30, 60)]
ENT += [('mom', dict(L=L, r=r, kmin=km)) for L, r, km in itertools.product((5, 15), (0.1, 0.25, 0.5), (1, 10))]
ENT += [('dip', dict(d=d, kmin=km)) for d, km in itertools.product((0.3, 0.5, 0.7), (1, 10))]
EX = list(itertools.product((0.3, 1.0, None), (-0.2, -0.4, None), (15, 60, 180, 360)))
rows = []
for kind, a in ENT:
    for tp, sl, H in EX:
        rr = run(kind, a, tp, sl, H)
        rows.append((f"{kind} {a} | tp {tp} sl {sl} H{H}m", s([r for i, r in rr if i]), s([r for i, r in rr if not i])))
print(f"\nconfigs {len(rows)}; IS mean>0 (n>=40): {sum(r[1][0] >= 40 and r[1][1] > 0 for r in rows)}; "
      f"also OOS mean>0 (n>=25): {sum(r[1][0] >= 40 and r[1][1] > 0 and r[2][0] >= 25 and r[2][1] > 0 for r in rows)}")
med = [r[1][1] for r in rows if r[1][0] >= 20]
if med: print(f"median IS mean: {st.median(med)*100:+.1f}%/trade")
print("\nTOP 12 by IS t (n>=40) -> OOS read once:")
for r in sorted([r for r in rows if r[1][0] >= 40], key=lambda r: -r[1][3])[:12]:
    print(f"  {r[0]}\n     IS {fmt(r[1])} | OOS {fmt(r[2])}")
P = [r for r in rows if r[1][0] >= 40 and r[1][3] >= 2 and r[2][0] >= 25 and r[2][3] >= 2]
print(f"\nPASS (IS t>=2 and OOS t>=2): {len(P)}")
for r in P[:10]: print('  ', r[0], fmt(r[1]), fmt(r[2]))
