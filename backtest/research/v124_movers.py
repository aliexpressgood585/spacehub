#!/usr/bin/env python3
"""v124 — what happens AFTER a Binance USDT-M perp moves >= X% in 24h (owner: "the coins that rose / fell").

Event study, pre-registered before reading the results:
- Universe: EVERY USDT perpetual in the Binance archive (data.binance.vision), INCLUDING delisted ones,
  1h klines + real funding, 2023-10 .. 2026-09 (36 months). No survivorship filter.
- Event: at an hourly close t, r24 = close_t / close_{t-24} - 1 >= +X (PUMP) or <= -X (DUMP), X in 20/30/50%.
  The first 72h of a contract's life are skipped (listing moves). After an event the coin is quiet for 24h
  (one event per move, not 24 overlapping ones).
- Trade: entry at the NEXT hour's open, exit at the close H hours later (H = 4, 24, 72). Both directions:
  FOLLOW (long a pump / short a dump) and FADE (the opposite). Taker 5 bps/side + slippage 10 bps/side
  (stress 25), funding = the real settled rates inside the hold, signed by side.
- Liquid subset: 24h quote volume before the event >= $20M (the bot's own universe floor).
- Split: first 70% of the span IS / last 30% OOS by event time; t-stat on DAILY means (events cluster).
Usage: python3 v124_movers.py <dir of {SYM}.k.YYYY-MM.zip / {SYM}.f.YYYY-MM.zip> > status/movers-v124.txt
"""
import sys, os, zipfile, io, glob, collections, math
import numpy as np

D = sys.argv[1]
H_LIST = (4, 24, 72)
X_LIST = (0.2, 0.3, 0.5)
FEE = 0.0005
SLIPS = (0.0010, 0.0025)
LIQ = 20e6

def read_zip_rows(p):
    try:
        with zipfile.ZipFile(p) as z:
            txt = z.read(z.namelist()[0]).decode()
    except Exception:
        return []
    return [l.split(',') for l in txt.splitlines() if l and l[0].isdigit()]

files = collections.defaultdict(list)
for p in glob.glob(os.path.join(D, '*.zip')):
    b = os.path.basename(p)
    sym, kind, _ = b.split('.', 2)
    files[(sym, kind)].append(p)
syms = sorted({s for s, k in files if k == 'k'})

events = []  # (t_ms, sym, sign, x_bucket_max, liquid, {H: (gross_follow, funding_long)})
span = [None, None]
for sym in syms:
    rows = []
    for p in sorted(files[(sym, 'k')]):
        rows += read_zip_rows(p)
    if len(rows) < 200:
        continue
    a = np.array([[float(r[0]), float(r[1]), float(r[4]), float(r[7])] for r in rows])
    a = a[np.argsort(a[:, 0])]
    _, idx = np.unique(a[:, 0], return_index=True); a = a[idx]
    t, o, c, qv = a[:, 0], a[:, 1], a[:, 2], a[:, 3]
    span[0] = t[0] if span[0] is None else min(span[0], t[0])
    span[1] = t[-1] if span[1] is None else max(span[1], t[-1])
    fr = []
    for p in files.get((sym, 'f'), []):
        for r in read_zip_rows(p):
            try: fr.append((float(r[0]), float(r[2])))
            except Exception: pass
    fr.sort(); ft = np.array([x[0] for x in fr]); fv = np.array([x[1] for x in fr])
    # contiguous hourly index check: require t[i]-t[i-24] == 24h
    n = len(t); last_ev = -10**18
    for i in range(72 + 24, n - 1):
        if t[i] - t[i - 24] != 24 * 3600e3 or c[i - 24] <= 0:
            continue
        r24 = c[i] / c[i - 24] - 1
        if abs(r24) < min(X_LIST):
            continue
        if t[i] - last_ev < 24 * 3600e3:
            continue
        last_ev = t[i]
        sign = 1 if r24 > 0 else -1
        liquid = qv[i - 23:i + 1].sum() >= LIQ
        entry = o[i + 1]; t_in = t[i + 1]
        res = {}
        for H in H_LIST:
            j = i + H
            if j >= n or t[j] - t[i + 1] != (H - 1) * 3600e3:
                continue
            t_out = t[j] + 3600e3
            g = c[j] / entry - 1                      # long gross return
            if len(ft):
                m = (ft > t_in) & (ft <= t_out); fund_long = -fv[m].sum()  # long pays positive funding
            else:
                fund_long = -0.0001 * H / 8
            res[H] = (g, fund_long)
        events.append((t[i], sym, sign, abs(r24), liquid, res))

events.sort()
cut = span[0] + 0.7 * (span[1] - span[0])

def stats(rs):
    if not rs: return None
    by = collections.defaultdict(list)
    for tt, r in rs: by[int(tt // 86400e3)].append(r)
    dm = np.array([np.mean(v) for v in by.values()])
    arr = np.array([r for _, r in rs])
    tstat = dm.mean() / (dm.std(ddof=1) / math.sqrt(len(dm))) if len(dm) > 2 and dm.std() > 0 else 0
    return len(arr), arr.mean() * 100, (arr > 0).mean() * 100, tstat, np.median(arr) * 100, arr.min() * 100

def row(sel, H, mode, slip):
    out = {'ALL': [], 'IS': [], 'OOS': []}
    for e in sel:
        if H not in e[5]: continue
        g, fl = e[5][H]
        side = e[2] if mode == 'FOLLOW' else -e[2]
        net = side * g + (fl if side > 0 else -fl) - 2 * (FEE + slip)
        out['ALL'].append((e[0], net)); out['IS' if e[0] < cut else 'OOS'].append((e[0], net))
    return {k: stats(v) for k, v in out.items()}

def fmt(s):
    if not s: return '   n=0'
    n, m, wr, ts, med, mn = s
    return f'n={n:5d} {m:+7.2f}% WR {wr:4.1f}% t {ts:+5.2f} med {med:+6.2f}% worst {mn:+7.1f}%'

print(f'v124 movers event study — {len(syms)} USDT perps (incl. delisted), 1h, '
      f'{np.datetime64(int(span[0]), "ms")} .. {np.datetime64(int(span[1]), "ms")}; IS/OOS cut {np.datetime64(int(cut), "ms")}')
print(f'events total {len(events)} (>=20% |24h move|, deduped 24h, first 72h of listing skipped)')
print('net per trade after taker 5 bps x2 + slippage x2 + real funding; t on daily means\n')
for liqname, liqf in (('ALL COINS', lambda e: True), ('LIQUID (>= $20M 24h vol)', lambda e: e[4])):
    for kind, sg in (('PUMP', 1), ('DUMP', -1)):
        for X in X_LIST:
            sel = [e for e in events if e[2] == sg and e[3] >= X and liqf(e)]
            print(f'== {liqname} | {kind} >= {int(X*100)}% in 24h | events {len(sel)}')
            for H in H_LIST:
                for mode in ('FOLLOW', 'FADE'):
                    for slip in SLIPS:
                        r = row(sel, H, mode, slip)
                        lab = ('long' if (mode == 'FOLLOW') == (sg > 0) else 'short')
                        print(f'  {H:2d}h {mode:6s}({lab:5s}) slip{int(slip*1e4):2d}  ALL {fmt(r["ALL"])} | IS {fmt(r["IS"])[:38]} | OOS {fmt(r["OOS"])[:38]}')
            print()
# gross drift without costs, liquid, by year (direction diagnostic)
print('== GROSS mean return of a LONG after the event (no costs, no funding), liquid, >=30%, by year')
for kind, sg in (('PUMP', 1), ('DUMP', -1)):
    for H in H_LIST:
        by = collections.defaultdict(list)
        for e in events:
            if e[2] == sg and e[3] >= 0.3 and e[4] and H in e[5]:
                by[str(np.datetime64(int(e[0]), 'ms'))[:4]].append(e[5][H][0] * 100)
        print(f'  {kind} {H:2d}h ' + '  '.join(f'{y}: {np.mean(v):+6.2f}% (n{len(v)})' for y, v in sorted(by.items())))
