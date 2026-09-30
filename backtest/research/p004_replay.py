"""P004 — read-only historical replay: current CHAN-X engine vs a regime + microstructure
+ OI/funding candidate (AI Council task P004, Issue #79). NOTHING here touches the bot.

Input: every closed CHAN row in bot_trades (exported to JSON by SQL), each carrying the
values the engine RECORDED AT ENTRY (scalp_meta.chan: regime, comp, quality_gates.micro_execution,
mtf, public_intel funding/OI/premium/flow, direction_crowding) plus a point-in-time join to
mkt_derivs (latest row <= opened_at and within 15 min; OI 1h earlier within 15 min).
No field observed after the entry is used by any filter -> no look-ahead.

P&L = bot_trades.pnl, which the ledger books NET of entry fee, exit fee (book-walk fills incl.
slippage/impact) and real Binance funding settlements. R = pnl / risk_usd at entry.

Candidate rules were written BEFORE any split was read (thresholds are round numbers, not
fitted). Each rule ABSTAINS (lets the trade through) when its input is missing; a separate
complete-case table reports only trades where every input exists.
  REGIME : comp is consistent with the recorded regime (MR-type in MEAN_REVERT; momentum /
           breakout / pullback in TREND or NEUTRAL; nothing but RG_MR/LIQ_SQUEEZE in HIGH_VOL)
  MICRO  : micro_execution.score >= 60 AND taker3m (buy/sell ratio) on the trade side (>1 long, <1 short)
  MTF    : quality_gates.mtf.side == trade side
  OIFUND : funding not paying against us beyond 1bp/8h (long: f <= 0.0001, short: f >= -0.0001)
           AND OI rising over the last hour (public_intel.oi_delta > 0, else mkt_derivs 1h change)
  CLUSTER: at most 2 same-side entries per 5m bar (the v98.2 cap, replayed in time order)
Split: chronological 70/30 by entry time (IS / OOS), plus 4 equal walk-forward folds.
Limitation (stated in the output): a filter replay only REMOVES realised trades; it cannot add
the trades that the freed capital / slots would have opened, nor re-price the kept ones.
"""
import json, sys, math, datetime as dt
from collections import defaultdict

J = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/p004.json'))
J.sort(key=lambda x: x['o'])
SIDE = lambda x: 1 if x['d'] == 'LONG' else -1
MR_COMPS = {'RG_MR', 'RG_LIQ_SQUEEZE'}

def f_regime(x):
    c, g = x.get('comp'), x.get('rg')
    if c is None or g is None: return True
    if g == 'HIGH_VOL': return c in MR_COMPS
    if g == 'MEAN_REVERT': return c in MR_COMPS
    return c not in MR_COMPS            # TREND / NEUTRAL -> momentum-type engines

def f_micro(x):
    if x.get('me') is None or x.get('tk3') is None: return True
    return x['me'] >= 60 and (x['tk3'] - 1) * SIDE(x) > 0

def f_mtf(x):
    if x.get('mtf') is None: return True
    return x['mtf'] == SIDE(x)

def oid(x):
    if x.get('pi_oid') is not None: return x['pi_oid']
    d0, d1 = x.get('d0'), x.get('d1')
    if d0 and d1 and d0.get('oi_usd') and d1.get('oi_usd'): return d0['oi_usd'] / d1['oi_usd'] - 1
    return None

def fund(x):
    if x.get('pi_f') is not None: return x['pi_f']
    return (x.get('d0') or {}).get('funding')

def f_oifund(x):
    f, o = fund(x), oid(x)
    ok = True
    if f is not None: ok &= (f <= 0.0001) if SIDE(x) > 0 else (f >= -0.0001)
    if o is not None: ok &= o > 0
    return ok

def cluster(rows):
    seen = defaultdict(int); keep = set()
    for x in rows:
        k = (int(x['o'] // 300), x['d'])
        if seen[k] < 2: keep.add(x['id'])
        seen[k] += 1
    return keep

RULES = {'REGIME': f_regime, 'MICRO': f_micro, 'MTF': f_mtf, 'OIFUND': f_oifund}
HAS = {'REGIME': lambda x: x.get('comp') is not None and x.get('rg') is not None,
       'MICRO': lambda x: x.get('me') is not None and x.get('tk3') is not None,
       'MTF': lambda x: x.get('mtf') is not None,
       'OIFUND': lambda x: fund(x) is not None and oid(x) is not None}

def apply(rows, names):
    out = [x for x in rows if all(RULES[n](x) for n in names if n != 'CLUSTER')]
    if 'CLUSTER' in names:
        k = cluster(out); out = [x for x in out if x['id'] in k]
    return out

def stats(rows):
    n = len(rows)
    if n == 0: return dict(n=0, net=0, pf=0, avgR=0, wr=0, dd=0)
    p = [x['p'] for x in rows]
    gw = sum(v for v in p if v > 0); gl = -sum(v for v in p if v < 0)
    rs = [x['p'] / x['rk'] for x in rows if x.get('rk')]
    eq = pk = 0.0; dd = 0.0
    for x in sorted(rows, key=lambda z: z['x']):
        eq += x['p']; pk = max(pk, eq); dd = max(dd, pk - eq)
    return dict(n=n, net=sum(p), pf=gw / gl if gl else float('inf'), avgR=sum(rs) / len(rs) if rs else 0,
                wr=100 * sum(v > 0 for v in p) / n, dd=dd)

def line(name, s):
    return f"{name:34s} n={s['n']:4d}  net=${s['net']:+9.2f}  PF={s['pf']:5.2f}  avgR={s['avgR']:+.3f}  WR={s['wr']:5.1f}%  maxDD=${s['dd']:8.2f}"

t0, t1 = J[0]['o'], J[-1]['o']
cut = t0 + 0.7 * (t1 - t0)
IS = [x for x in J if x['o'] < cut]; OOS = [x for x in J if x['o'] >= cut]
ts = lambda e: dt.datetime.utcfromtimestamp(e).strftime('%Y-%m-%d %H:%M')
print(f'P004 replay — {len(J)} closed CHAN trades, {ts(t0)} .. {ts(t1)} UTC; IS < {ts(cut)} ({len(IS)}), OOS ({len(OOS)})')
print('P&L = ledger net (fees + book-walk slippage + real funding). Rules abstain on missing input.\n')

print('== field coverage (trades with the entry-time input present)')
for k, h in HAS.items(): print(f'  {k:8s} {sum(h(x) for x in J):4d}/{len(J)}')
print(f"  mkt_derivs point-in-time row (collector, pinned 40 only): {sum(1 for x in J if x.get('d0'))}/{len(J)}")
print(f"  liquidation / order-book history per trade: NOT AVAILABLE (not recorded at entry; not reconstructed)\n")

variants = [('BASELINE (actual engine)', [])] + [(n, [n]) for n in list(RULES) + ['CLUSTER']] + \
           [('REGIME+MICRO', ['REGIME', 'MICRO']), ('MICRO+OIFUND', ['MICRO', 'OIFUND']),
            ('CANDIDATE (all five)', ['REGIME', 'MICRO', 'MTF', 'OIFUND', 'CLUSTER'])]
for lab, rows in [('ALL', J), ('IN-SAMPLE 70%', IS), ('OUT-OF-SAMPLE 30%', OOS)]:
    print(f'== {lab}')
    for name, rs in variants: print('  ' + line(name, stats(apply(rows, rs))))
    print()

print('== walk-forward: 4 equal time folds, BASELINE vs CANDIDATE (all five)')
w = (t1 - t0) / 4 + 1e-6
for i in range(4):
    f = [x for x in J if t0 + i * w <= x['o'] < t0 + (i + 1) * w]
    b, c = stats(f), stats(apply(f, variants[-1][1]))
    print(f"  fold{i+1} {ts(t0+i*w)}  base n={b['n']:3d} ${b['net']:+8.2f}  cand n={c['n']:3d} ${c['net']:+8.2f}  "
          f"avgR {b['avgR']:+.3f} -> {c['avgR']:+.3f}")

print('\n== complete-case (only trades where ALL four inputs exist)')
cc = [x for x in J if all(h(x) for h in HAS.values())]
ccI = [x for x in cc if x['o'] < cut]; ccO = [x for x in cc if x['o'] >= cut]
for lab, rows in [('ALL', cc), ('IS', ccI), ('OOS', ccO)]:
    print('  ' + line(f'{lab} baseline', stats(rows)))
    print('  ' + line(f'{lab} candidate', stats(apply(rows, variants[-1][1]))))

print('\n== what the candidate removed (ALL): the rejected trades themselves')
kept = {x['id'] for x in apply(J, variants[-1][1])}
print('  ' + line('rejected by candidate', stats([x for x in J if x['id'] not in kept])))
