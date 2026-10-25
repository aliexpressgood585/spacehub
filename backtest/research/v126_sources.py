#!/usr/bin/env python3
"""v126 — three new data sources vs crypto returns, exactly as pre-registered in quant/PREREGISTRATION_V126.md.
Usage: python3 v126_sources.py <dir with dvol_BTC.raw, dvol_ETH.raw, stable.json, tvl.json> <dir of {SYM}.YYYY-MM.zip 1d klines>
"""
import sys, os, json, glob, zipfile, math
import numpy as np

SRC, KL = sys.argv[1], sys.argv[2]
DAY = 86400
COST, FUND = 0.0008, 0.0003

def dvol(c):
    out = {}
    for line in open(os.path.join(SRC, f'dvol_{c}.raw')):
        line = line.strip()
        if not line: continue
        for r in json.loads(line)['result']['data']:
            out[int(r[0] // 1000 // DAY)] = r[4]          # close of the UTC day
    return out

def stable():
    out = {}
    for r in json.load(open(os.path.join(SRC, 'stable.json'))):
        v = r.get('totalCirculatingUSD', {}).get('peggedUSD')
        if v: out[int(r['date']) // DAY] = float(v)
    return out

def tvl():
    return {int(r['date']) // DAY: float(r['tvl']) for r in json.load(open(os.path.join(SRC, 'tvl.json'))) if r['tvl']}

def closes(sym):
    out = {}
    for p in glob.glob(os.path.join(KL, f'{sym}.*.zip')):
        try:
            with zipfile.ZipFile(p) as z:
                for l in z.read(z.namelist()[0]).decode().splitlines():
                    if l and l[0].isdigit():
                        f = l.split(','); out[int(f[0]) // 1000 // DAY] = float(f[4])
        except Exception: pass
    return out

C40 = "BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET".split()
px = {s: closes(s) for s in C40}
dv = {'BTC': dvol('BTC'), 'ETH': dvol('ETH')}
st, tv = stable(), tvl()
d0 = max(min(dv['BTC']), min(px['BTC']) + 31); d1 = min(max(dv['BTC']), max(px['BTC'])) - 1
days = list(range(d0, d1 + 1))
cut = days[int(len(days) * 0.7)]

def ret(sym, d):  # close d -> close d+1
    p = px[sym]; return p[d + 1] / p[d] - 1 if d in p and d + 1 in p else None

def basket_ret(d):
    r = [x for x in (ret(s, d) for s in C40) if x is not None]
    return float(np.mean(r)) if len(r) >= 10 else None

def rv30(sym, d):
    p = px[sym]; r = [math.log(p[k] / p[k - 1]) for k in range(d - 29, d + 1) if k in p and k - 1 in p]
    return float(np.std(r)) * math.sqrt(365) * 100 if len(r) >= 25 else None

def growth(series, d, n):
    return series[d] / series[d - n] - 1 if d in series and d - n in series and series[d - n] else None

# signal value known at the close of day d (data of day d-1 for the daily-published sources = one-day lag)
SIG = {
    'S1 VRP BTC':  lambda d: (dv['BTC'][d] - rv30('BTC', d)) if d in dv['BTC'] and rv30('BTC', d) is not None else None,
    'S1 VRP ETH':  lambda d: (dv['ETH'][d] - rv30('ETH', d)) if d in dv['ETH'] and rv30('ETH', d) is not None else None,
    'S2 DVOL7 BTC': lambda d: dv['BTC'][d] - dv['BTC'][d - 7] if d in dv['BTC'] and d - 7 in dv['BTC'] else None,
    'S2 DVOL7 ETH': lambda d: dv['ETH'][d] - dv['ETH'][d - 7] if d in dv['ETH'] and d - 7 in dv['ETH'] else None,
    'S3 stable7':  lambda d: growth(st, d - 1, 7),
    'S4 stable30': lambda d: growth(st, d - 1, 30),
    'S5 tvl7':     lambda d: growth(tv, d - 1, 7),
}
ASSETS = {'S1 VRP BTC': ['BTC', 'BASKET'], 'S1 VRP ETH': ['ETH', 'BASKET'], 'S2 DVOL7 BTC': ['BTC', 'BASKET'],
          'S2 DVOL7 ETH': ['ETH', 'BASKET'], 'S3 stable7': ['BTC', 'ETH', 'BASKET'], 'S4 stable30': ['BTC', 'ETH', 'BASKET'],
          'S5 tvl7': ['BTC', 'ETH', 'BASKET']}

def run(sig, asset, H, direction, lo, hi):
    """staggered book: each day's signal gets 1/H of the book for H days; returns list of (day, pnl)."""
    pos_hist, out, prev = [], [], 0.0
    for d in days:
        v = SIG[sig](d)
        s = 0 if v is None else (1 if v >= hi else -1 if v <= lo else 0)
        pos_hist.append(direction * s)
        book = sum(pos_hist[-H:]) / H
        r = basket_ret(d) if asset == 'BASKET' else ret(asset, d)
        if r is None: prev = book; continue
        pnl = book * r - abs(book - prev) * COST - book * FUND
        out.append((d, pnl)); prev = book
    return out

def stat(xs):
    a = np.array(xs)
    if len(a) < 30 or a.std() == 0: return 0.0, 0.0
    return a.mean() * 1e4, a.mean() / (a.std(ddof=1) / math.sqrt(len(a)))

print(f'v126 — {len(days)} days {np.datetime64(d0, "D")} .. {np.datetime64(d1, "D")}, IS to {np.datetime64(cut, "D")}, OOS after')
print('net bps/day of the book after 8 bps/side turnover + 0.03%/day funding on longs; t on daily P&L\n')
print(f'  {"signal":13s} {"asset":7s} {"H":>2s} {"dir":6s}  {"IS bps/d":>8s} {"IS t":>6s}  {"OOS bps/d":>9s} {"OOS t":>6s}')
passes, rows = [], 0
for sig, assets in ASSETS.items():
    vals = sorted(v for v in (SIG[sig](d) for d in days if d < cut) if v is not None)
    lo, hi = vals[len(vals) // 3], vals[2 * len(vals) // 3]
    for asset in assets:
        res = {}
        for H in (1, 3, 7):
            best = None
            for direction, name in ((1, 'follow'), (-1, 'fade')):
                pl = run(sig, asset, H, direction, lo, hi)
                im, it = stat([p for d, p in pl if d < cut]); om, ot = stat([p for d, p in pl if d >= cut])
                if best is None or im > best[1]: best = (name, im, it, om, ot)
            rows += 1; res[H] = best
            name, im, it, om, ot = best
            print(f'  {sig:13s} {asset:7s} {H:2d} {name:6s}  {im:+8.2f} {it:+6.2f}  {om:+9.2f} {ot:+6.2f}')
        ok = all(res[H][1] > 0 and res[H][2] >= 1 and res[H][3] > 0 for H in res) and max(res[H][4] for H in res) >= 2 \
            and len({res[H][0] for H in res}) == 1
        if ok: passes.append(f'{sig} on {asset} ({res[1][0]})')
print(f'\nrows {rows} (direction chosen on IS per row); luck alone passes ~{rows * 0.023 / 3:.1f} signal x asset combos at t>=2')
print('PASS: ' + (', '.join(passes) if passes else 'none'))
