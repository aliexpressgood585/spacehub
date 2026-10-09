"""Polymarket PAPER desk research (owner 2026-10-09: "find the best strategy yourself").

Input: a jsonl of RESOLVED binary Polymarket markets (Gamma API) with the hourly price history of the first
outcome over the 7 days before resolution (CLOB /prices-history). Downloaded into the scratchpad, not committed.

Rule family tested (the only one the data can judge honestly without an order book history):
  H hours before resolution, if an outcome trades inside [lo, hi), BUY it and hold to resolution (pays 1 or 0).
  Both outcomes of a market are candidates (outcome 2 = 1 - p). One entry per market (the first hour that qualifies).
Costs: half-spread + slippage SLIP added to the hourly price (it is a mid / last price, not an ask), and the taker
fee 0.03 x p x (1-p) per share on markets with feesEnabled (sports schedule; others 0).
Split by resolution time: first 70% = in-sample (choose), last 30% = out-of-sample (read once).
Also: calibration (how often an outcome priced at p actually wins) — the favourite-longshot question.
Run: python3 backtest/research/pm_research.py <hist.jsonl> > status/pm-research.txt
"""
import json, sys, math, statistics as st

SLIP = 0.01
rows = []
for line in open(sys.argv[1]):
    try:
        m = json.loads(line)
    except Exception:
        continue
    if len(m.get('h') or []) < 5:
        continue
    rows.append(m)
rows.sort(key=lambda m: m['ct'])
cut = rows[int(len(rows) * 0.7)]['ct'] if rows else 0
print(f"markets with history: {len(rows)}; in-sample < {cut}, out-of-sample after (30%)")
print(f"cost model: +{SLIP:.2f} on entry price, taker fee 0.03*p*(1-p)/share on fee-enabled markets")
print()


def entries(H, lo, hi):
    out = []
    for m in rows:
        t0 = m['ct'] - H * 3600
        hs = [x for x in m['h'] if t0 - 3600 <= x[0] <= m['ct'] - 600]
        if not hs:
            continue
        for t, p in hs:
            if t < t0:
                continue
            for k, q in ((0, p), (1, 1 - p)):
                if lo <= q < hi:
                    won = (m['win'] == 1) if k == 0 else (m['win'] == 0)
                    px = min(0.999, q + SLIP)
                    fee = 0.03 * px * (1 - px) if m.get('fees') else 0.0
                    ret = ((1.0 if won else 0.0) - px - fee) / (px + fee)
                    out.append((m['ct'], ret, won, m['ct'] >= cut, m['tag']))
                    break
            else:
                continue
            break
    return out


def summ(rs):
    if not rs:
        return "n 0"
    r = [x[1] for x in rs]
    n = len(r); mu = sum(r) / n; sd = st.pstdev(r) if n > 1 else 0
    w = sum(1 for x in rs if x[2]) / n
    t = mu / sd * math.sqrt(n) if sd > 0 else 0
    return f"n {n:5d}  WR {w*100:5.1f}%  ret/$ {mu*100:+6.2f}%  t {t:+5.2f}"


print("CALIBRATION (6h before resolution, any outcome): price bucket -> how often it won")
for lo in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
    hi = {0.05: 0.1, 0.1: 0.2, 0.95: 1.0}.get(lo, round(lo + 0.1, 2))
    es = entries(6, lo, hi)
    if es:
        w = sum(1 for x in es if x[2]) / len(es)
        print(f"  [{lo:.2f},{hi:.2f})  n {len(es):5d}  won {w*100:5.1f}%  (price mid {(lo+hi)/2*100:.0f}%)")
print()
print("GRID (choose on in-sample)   H = hours before resolution")
grid = []
for H in [1, 6, 24, 72]:
    for lo, hi in [(0.5, 0.7), (0.7, 0.8), (0.8, 0.9), (0.85, 0.95), (0.9, 0.95), (0.9, 0.97), (0.93, 0.98), (0.95, 0.99), (0.05, 0.15), (0.15, 0.3)]:
        es = entries(H, lo, hi)
        ins = [x for x in es if not x[3]]; oos = [x for x in es if x[3]]
        mu = sum(x[1] for x in ins) / len(ins) if ins else -1
        grid.append((mu, H, lo, hi, ins, oos))
        print(f"  H{H:3d} [{lo:.2f},{hi:.2f})  IS {summ(ins)}  |  OOS {summ(oos)}")
grid = [g for g in grid if len(g[4]) >= 200]
grid.sort(key=lambda g: -g[0])
b = grid[0]
print()
print(f"CHOSEN on in-sample: H{b[1]} [{b[2]:.2f},{b[3]:.2f})")
print(f"  in-sample      {summ(b[4])}")
print(f"  OUT-OF-SAMPLE  {summ(b[5])}")
