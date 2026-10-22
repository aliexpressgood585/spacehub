# meme desk rule search on the recorded pump.fun paths (meme/paths-*.jsonl on pm-desk-data).
# Each path = a coin's first 65 min: points [age_s, mc_SOL, real_SOL, graduated] recorded on change.
# Price at time t = mc of the last point at or before t (no point = no trade = unchanged price).
# Realism as the desk: fill = price 2 s after the decision, pump fee 1.25%/side, 0.001 SOL tx fee per side,
# own size moves the constant-product curve (stake 0.14 SOL ~ 2% of $700). One trade per coin (first signal).
# Split by creation time: IS = first 60% of usable coins, OOS = rest, read once for the IS-selected rules.
# Usage: python3 meme_paths.py paths.jsonl [cutoff_utc_ms]
import json, sys, bisect, math, itertools, statistics as st, datetime as dt

FEE, TX, STAKE, K, DELAY = 0.0125, 0.001, 0.14, 3.219e25, 2
paths = [json.loads(l) for l in open(sys.argv[1])]
cut = int(sys.argv[2]) if len(sys.argv) > 2 else None          # coins created after this were cut by a feed outage
paths = [p for p in paths if (cut is None or p['c'] <= cut) and len(p['p']) >= 2]
paths.sort(key=lambda p: p['c'])
nIS = int(len(paths) * 0.6); split_ms = paths[nIS]['c']

def vs(mc): return math.sqrt(K * max(mc, 1e-9) / 1e6) / 1e9     # virtual SOL in the curve at this market cap
def cost_ret(mc_in, mc_out):
    if not mc_out or mc_out <= 0: return -1.0
    gross = mc_out / mc_in
    imp_in, imp_out = STAKE / vs(mc_in), STAKE / vs(mc_out)
    return gross * (1 - FEE) ** 2 * (1 - imp_in) * (1 - imp_out) - 1 - 2 * TX / STAKE

class Path:
    def __init__(s, p):
        s.t = [q[0] for q in p['p']]; s.mc = [q[1] for q in p['p']]; s.rs = [q[2] for q in p['p']]; s.g = [q[3] for q in p['p']]
        s.c = p['c']; s.cr = p.get('cr'); s.so = p.get('so')
    def at(s, t):
        i = bisect.bisect_right(s.t, t) - 1
        return s.mc[i] if i >= 0 else None

P = [Path(p) for p in paths]

def entries(kind, a):
    out = []
    for x in P:
        for i, t in enumerate(x.t):
            age = t / 60; prog = x.rs[i] / 85
            if x.g[i] or age < a['amin'] or age > a['amax'] or not (a['pmin'] <= prog <= a['pmax']): continue
            if kind == 'cross':
                ok = True
            else:
                past = x.at(t - a['L'])
                if not past or t < a['L']: continue
                rise = x.mc[i] / past - 1
                ok = rise >= a['r'] if kind == 'mom' else rise <= -a['r']
            if ok:
                f = x.at(t + DELAY)
                if f and f > 0: out.append((x, t, f))
                break
    return out

def run(trades, tp, sl, T):
    rs = []
    for x, t0, f in trades:
        tf = t0 + DELAY; r = None
        j = bisect.bisect_right(x.t, tf)
        for k in range(j, len(x.t)):
            tk = x.t[k]
            if tk > tf + T * 60: break
            if x.g[k]: r = cost_ret(f, x.mc[k]); break
            g = x.mc[k] / f - 1
            if g >= tp or g <= sl: r = cost_ret(f, x.at(tk + DELAY)); break
        if r is None:
            te = min(tf + T * 60, x.t[-1]); r = cost_ret(f, x.at(te + DELAY))
        rs.append((x.c < split_ms, r))
    return rs

def stats(v):
    if len(v) < 2: return (len(v), float('nan'), float('nan'), float('nan'))
    m = st.mean(v); sd = st.pstdev(v)
    return (len(v), m, sum(1 for r in v if r > 0) / len(v), m / (sd / math.sqrt(len(v))) if sd else 0)

AGES = [dict(amin=0.5, amax=10), dict(amin=0.5, amax=60)]
PROGS = [(0, 0.15), (0.05, 0.3), (0.15, 0.5), (0.3, 0.8), (0.5, 0.95)]
ent = []
for a, (p0, p1) in itertools.product(AGES, PROGS):
    for L, r in itertools.product([30, 60, 120, 300], [0.05, 0.1, 0.2, 0.4]): ent.append(('mom', dict(a, pmin=p0, pmax=p1, L=L, r=r)))
    for L, r in itertools.product([30, 60, 120, 300], [0.1, 0.2, 0.35]): ent.append(('dip', dict(a, pmin=p0, pmax=p1, L=L, r=r)))
for a, pc in itertools.product(AGES, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]): ent.append(('cross', dict(a, pmin=pc, pmax=0.99)))
EX = list(itertools.product([0.3, 0.6, 1.0, 9], [-0.2, -0.35, -0.6, -1.01], [5, 15, 30, 60]))

def label(kind, a, ex):
    s = f"{kind} age {a['amin']}-{a['amax']}m prog {a['pmin']:.2f}-{a['pmax']:.2f}"
    if kind != 'cross': s += f" L{a['L']}s r{a['r']}"
    return s + f" | tp {ex[0]} sl {ex[1]} T{ex[2]}m"

print(f"paths usable {len(P)} (>=2 points{', created <= cutoff' if cut else ''}); IS {nIS} coins before {dt.datetime.utcfromtimestamp(split_ms/1000):%H:%M} UTC, OOS {len(P)-nIS}")
print(f"costs: fee {FEE*100}%/side, tx {TX} SOL/side on {STAKE} SOL stake = {2*TX/STAKE*100:.1f}% round trip, 2 s fill delay, curve impact")
live = run(entries('mom', dict(amin=0.5, amax=120, pmin=0.05, pmax=0.8, L=60, r=0.05)), 0.5, -0.3, 30)
for nm, sel in [('IS', True), ('OOS', False)]:
    n, m, wr, t = stats([r for i, r in live if i == sel]); print(f"LIVE-like rule (rise>=5%/60s, prog 5-80%, tp .5 sl -.3 T30) {nm}: n {n} mean {m*100:+.1f}% WR {wr*100:.0f}% t {t:.1f}")
rows = []
for kind, a in ent:
    tr = entries(kind, a)
    if len(tr) < 60: continue
    for ex in EX:
        rr = run(tr, *ex)
        isv = [r for i, r in rr if i]; oov = [r for i, r in rr if not i]
        rows.append((label(kind, a, ex), stats(isv), stats(oov)))
looks = len(rows)
ok_is = [r for r in rows if r[1][0] >= 100 and r[1][1] > 0]
both = [r for r in ok_is if r[2][0] >= 50 and r[2][1] > 0]
print(f"\nconfigs evaluated {looks}; IS mean>0 with n>=100: {len(ok_is)}; also OOS mean>0 (n>=50): {len(both)}")
print(f"median IS mean over all configs: {st.median([r[1][1] for r in rows if r[1][0]>=30])*100:+.1f}%/trade")
print("\nTOP 15 by IS t (n>=100) -> OOS read once:")
for r in sorted([r for r in rows if r[1][0] >= 100], key=lambda r: -r[1][3])[:15]:
    (n, m, wr, t), (n2, m2, wr2, t2) = r[1], r[2]
    print(f"  {r[0]}\n     IS n{n} {m*100:+.1f}% WR{wr*100:.0f}% t{t:.1f} | OOS n{n2} {m2*100:+.1f}% WR{wr2*100:.0f}% t{t2:.1f}")
passed = [r for r in both if r[1][3] >= 2 and r[2][3] >= 2 and r[2][0] >= 100]
print(f"\nPASS (IS t>=2 and OOS t>=2, OOS n>=100): {len(passed)}")
for r in passed[:10]: print('  ', r[0], r[1], r[2])
