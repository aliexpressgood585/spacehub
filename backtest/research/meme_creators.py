# meme desk: does the CREATOR's history separate pump.fun coins? (recorded paths, meme/paths-*.jsonl on pm-desk-data)
# For each coin: how many coins the same wallet had ALREADY launched in the recording before this one (known at entry
# time, no look-ahead). Outcomes per bucket: graduation rate, peak market cap vs the first point, and the desk-cost return
# of two entry rules (the live momentum rule and "curve crosses 30%"). A filter counts only if it helps in BOTH halves
# (IS = first 60% of coins by creation time, OOS = rest). Same costs and fill model as meme_paths.py.
# Usage: python3 meme_creators.py paths.jsonl [cutoff_utc_ms]
import json, sys, bisect, math, statistics as st, collections

FEE, TX, STAKE, K, DELAY = 0.0125, 0.001, 0.14, 3.219e25, 2
raw = [json.loads(l) for l in open(sys.argv[1])]
cut = int(sys.argv[2]) if len(sys.argv) > 2 else None
raw.sort(key=lambda p: p['c'])
# prior launches per creator, counted over ALL recorded coins (also 1-point ones: a launch is a launch)
seen = collections.Counter(); prior = {}
for p in raw:
    prior[p['m']] = seen[p.get('cr')]; seen[p.get('cr')] += 1
paths = [p for p in raw if (cut is None or p['c'] <= cut) and len(p['p']) >= 2 and all(q[1] is not None for q in p['p'])]
nIS = int(len(paths) * 0.6); split_ms = paths[nIS]['c']

def vs(mc): return math.sqrt(K * max(mc, 1e-9) / 1e6) / 1e9
def cost_ret(mc_in, mc_out):
    if not mc_out or mc_out <= 0: return -1.0
    return mc_out / mc_in * (1 - FEE) ** 2 * (1 - STAKE / vs(mc_in)) * (1 - STAKE / vs(mc_out)) - 1 - 2 * TX / STAKE

class Path:
    def __init__(s, p):
        s.t = [q[0] for q in p['p']]; s.mc = [q[1] for q in p['p']]; s.rs = [q[2] for q in p['p']]; s.g = [q[3] for q in p['p']]
        s.c = p['c']; s.prior = prior[p['m']]; s.so = p.get('so')
    def at(s, t):
        i = bisect.bisect_right(s.t, t) - 1
        return s.mc[i] if i >= 0 else None

P = [Path(p) for p in paths]

def entry(x, kind):
    for i, t in enumerate(x.t):
        age = t / 60; prog = x.rs[i] / 85
        if x.g[i] or age > 120: continue
        if kind == 'mom':
            if age < 0.5 or not (0.05 <= prog <= 0.8) or t < 60: continue
            past = x.at(t - 60)
            if not past or x.mc[i] / past - 1 < 0.05: continue
        elif kind == 'cross':
            if prog < 0.3: continue
        f = x.at(t + DELAY)
        return (t, f) if f and f > 0 else None
    return None

def trade(x, kind, tp=0.5, sl=-0.3, T=30):
    e = entry(x, kind)
    if not e: return None
    t0, f = e; tf = t0 + DELAY
    for k in range(bisect.bisect_right(x.t, tf), len(x.t)):
        tk = x.t[k]
        if tk > tf + T * 60: break
        if x.g[k]: return cost_ret(f, x.mc[k])
        g = x.mc[k] / f - 1
        if g >= tp or g <= sl: return cost_ret(f, x.at(tk + DELAY))
    return cost_ret(f, x.at(min(tf + T * 60, x.t[-1]) + DELAY))

def s(v):
    if len(v) < 2: return f"n{len(v):>5}"
    m = st.mean(v); sd = st.pstdev(v); t = m / (sd / math.sqrt(len(v))) if sd else 0
    return f"n{len(v):>5} {m*100:+6.1f}% WR{sum(r > 0 for r in v)/len(v)*100:3.0f}% t{t:+5.1f}"

B = [('first launch (0 prior)', 0, 0), ('1-4 prior', 1, 4), ('5-49 prior', 5, 49), ('50+ prior (factories)', 50, 10**9)]
print(f"coins {len(P)} usable (of {len(raw)} recorded); IS before coin #{nIS}, OOS {len(P)-nIS}")
print(f"creators {len(seen)}; wallets with >=50 launches: {sum(v >= 50 for v in seen.values())} launching {sum(v for v in seen.values() if v >= 50)} coins\n")
for nm, lo, hi in B:
    g = [x for x in P if lo <= x.prior <= hi]
    if not g: continue
    grad = sum(any(x.g) for x in g) / len(g)
    peak = st.median(max(x.mc) / x.mc[0] for x in g)
    print(f"{nm:<24} coins {len(g):>5}  graduated {grad*100:4.1f}%  median peak/first {peak:.2f}x  social {sum(bool(x.so) for x in g)/len(g)*100:3.0f}%")
    for kind in ('mom', 'cross'):
        for half, sel in (('IS ', True), ('OOS', False)):
            v = [r for x in g if (x.c < split_ms) == sel and (r := trade(x, kind)) is not None]
            print(f"     {kind:<5} {half} {s(v)}")
print("\nFILTERS on the live momentum rule (tp .5 sl -.3 T30):")
for nm, f in [('all', lambda x: True), ('skip 50+ prior', lambda x: x.prior < 50), ('skip 5+ prior', lambda x: x.prior < 5),
              ('first launch only', lambda x: x.prior == 0), ('serial only (5+)', lambda x: x.prior >= 5)]:
    out = []
    for half, sel in (('IS', True), ('OOS', False)):
        v = [r for x in P if (x.c < split_ms) == sel and f(x) and (r := trade(x, 'mom')) is not None]
        out.append(f"{half} {s(v)}")
    print(f"  {nm:<20} " + " | ".join(out))
