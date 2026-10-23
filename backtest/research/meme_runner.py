# meme desk v2 design check (owner: "97% wins, catch the coins that jump 100-1000%, profits always beat losses").
# Same recorded paths, costs and fill model as meme_paths.py (fill = price 2 s after the decision, 1.25%/side fee,
# 0.001 SOL tx/side on 0.14 SOL, curve impact; a stop fills at the first recorded point at/below it = real gaps).
# A. Base rates: after an entry signal, how often does the coin reach +100/200/300/1000% within the recorded 65 min?
# B. Win rate vs expectancy: fixed target T / stop S grid -> is a 97% win rate possible, and what does it pay?
# C. "Runner" exits: sell half at +100% (the stake is back), the rest rides with a trailing stop; stop -X before that.
# IS = first 60% of coins by creation time, OOS = rest.  Usage: python3 meme_runner.py paths.jsonl [cutoff_ms]
import json, sys, bisect, math, statistics as st

FEE, TX, STAKE, K, DELAY = 0.0125, 0.001, 0.14, 3.219e25, 2
raw = [json.loads(l) for l in open(sys.argv[1])]
cut = int(sys.argv[2]) if len(sys.argv) > 2 else None
P = sorted([p for p in raw if (cut is None or p['c'] <= cut) and len(p['p']) >= 2 and all(q[1] for q in p['p'])], key=lambda p: p['c'])
split = P[int(len(P) * 0.6)]['c']

def vs(mc): return math.sqrt(K * max(mc, 1e-9) / 1e6) / 1e9
def mult(mc_in, mc_out):                       # value multiple of the position after both fills and fees (before tx)
    if not mc_out or mc_out <= 0: return 0.0
    return mc_out / mc_in * (1 - FEE) ** 2 * (1 - STAKE / vs(mc_in)) * (1 - STAKE / vs(mc_out))
TXR = 2 * TX / STAKE

class X:
    def __init__(s, p):
        s.t = [q[0] for q in p['p']]; s.mc = [q[1] for q in p['p']]; s.rs = [q[2] for q in p['p']]; s.g = [q[3] for q in p['p']]; s.c = p['c']
    def at(s, t):
        i = bisect.bisect_right(s.t, t) - 1
        return s.mc[i] if i >= 0 else None
C = [X(p) for p in P]

def entry(x, kind):
    for i, t in enumerate(x.t):
        age = t / 60; prog = x.rs[i] / 85
        if x.g[i] or age > 60: continue
        if kind == 'mom':
            if age < 0.5 or not (0.05 <= prog <= 0.8) or t < 60: continue
            past = x.at(t - 60)
            if not past or x.mc[i] / past - 1 < 0.05: continue
        elif kind == 'cross30':
            if prog < 0.3: continue
        elif kind == 'early':
            if age < 0.5 or prog < 0.05: continue
        f = x.at(t + DELAY)
        return (i, t, f) if f and f > 0 else None
    return None

def s(v):
    if len(v) < 2: return f"n{len(v)}"
    m = st.mean(v); sd = st.pstdev(v); t = m / (sd / math.sqrt(len(v))) if sd else 0
    return f"n{len(v):>4} WR{sum(r > 0 for r in v)/len(v)*100:3.0f}% mean{m*100:+6.1f}% t{t:+5.1f}"

print(f"coins {len(C)}; IS before {split} (60/40 by creation time)\n")
print("A. after the entry signal, share of coins whose price later reaches (within the recorded 65 min):")
for kind in ('mom', 'cross30', 'early'):
    E = [(x, entry(x, kind)) for x in C]; E = [(x, e) for x, e in E if e]
    row = []
    for m in (1, 2, 3, 4, 11):
        hit = sum(1 for x, (i, t, f) in E if max(x.mc[i:]) >= f * m)
        row.append(f"x{m} {hit/len(E)*100:5.1f}%")
    print(f"  {kind:<8} n{len(E):>5}  " + "  ".join(row) + "   (x2 = +100%, x11 = +1000%)")

def fixed(x, e, T, S):
    i, t0, f = e
    for k in range(i + 1, len(x.t)):
        g = x.mc[k] / f - 1
        if x.g[k]: return mult(f, x.mc[k]) - 1 - TXR
        if g >= T: return mult(f, x.at(x.t[k] + DELAY)) - 1 - TXR
        if g <= S: return mult(f, x.at(x.t[k] + DELAY)) - 1 - TXR
    return mult(f, x.mc[-1]) - 1 - TXR
print("\nB. target / stop grid on the 'early' entry (all coins, both halves): can the win rate reach 97%?")
E = [(x, entry(x, 'early')) for x in C]; E = [(x, e) for x, e in E if e]
for T, S in [(0.03, -0.9), (0.05, -0.9), (0.05, -0.5), (0.1, -0.5), (0.2, -0.3), (0.5, -0.3), (1.0, -0.3), (2.0, -0.3), (10, -0.3)]:
    print(f"  target +{T*100:>5.0f}% stop {S*100:+.0f}%: {s([fixed(x, e, T, S) for x, e in E])}")

def runner(x, e, S, trail, take=1.0, half=0.5):
    i, t0, f = e; peak = f; banked = 0.0; part = 1.0
    for k in range(i + 1, len(x.t)):
        p = x.mc[k]
        if x.g[k]: return banked + part * mult(f, p) - 1 - TXR * (2 if part < 1 else 1)
        peak = max(peak, p)
        if part == 1.0 and p >= f * (1 + take):
            banked += half * mult(f, x.at(x.t[k] + DELAY)); part = 1 - half; continue
        if part == 1.0 and p <= f * (1 + S):
            return mult(f, x.at(x.t[k] + DELAY)) - 1 - TXR
        if part < 1.0 and p <= peak * (1 - trail):
            return banked + part * mult(f, x.at(x.t[k] + DELAY)) - 1 - TXR * 1.5
    return banked + part * mult(f, x.mc[-1]) - 1 - TXR * (1.5 if part < 1 else 1)
print("\nC. RUNNER: half off at +100% (stake back), rest trails from its peak; stop before that. IS | OOS")
for kind in ('mom', 'cross30', 'early'):
    E = [(x, entry(x, kind)) for x in C]; E = [(x, e) for x, e in E if e]
    for S in (-0.3, -0.5):
        for trail in (0.3, 0.5):
            rr = [(x.c < split, runner(x, e, S, trail)) for x, e in E]
            print(f"  {kind:<8} stop {S*100:+.0f}% trail {trail*100:.0f}%:  IS {s([r for a, r in rr if a])} | OOS {s([r for a, r in rr if not a])}")
