"""S1 shadow evaluator (quant/PREREGISTRATION_S1.md). READ-ONLY: anon REST + public klines.

Usage:  python3 backtest/research/s1_evaluate.py            # counts only until S1 has >= 100 taken trades
        python3 backtest/research/s1_evaluate.py --full     # refused below 100 (pre-registered)

live rows    -> outcome = the real bot_trades row (pnl / risk_usd), matched on sym, side and entry bar
virtual rows -> APPROXIMATE replay on 1m candles: entry ref_px, exit at stop or after max_hold_bars x 5m,
                cost taker 5bps + slip 3bps per side in R. The same replay is run on the live S1 rows and
                the mean (replay - real) gap is subtracted from the virtual R.
"""
import json, math, re, sys, urllib.request, datetime as dt

MIN_N = 100
SRC = open('trading-app/src/supa.ts').read()
URL = re.search(r"'(https://[a-z]+\.supabase\.co)'", SRC).group(1)
KEY = re.search(r"'(eyJ[\w.-]+)'", SRC).group(1)
COST_SIDE = 0.0005 + 0.0003
BAR = 300


def rest(path):
    req = urllib.request.Request(f'{URL}/rest/v1/{path}', headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
    return json.load(urllib.request.urlopen(req, timeout=30))


def ts(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()


def klines(sym, t0, t1):
    """1m candles [t, high, low, close]; Binance USDT-M first, OKX swap fallback."""
    bs = ('1000PEPE' if sym == 'PEPE' else sym) + 'USDT'
    k = 1000 if sym == 'PEPE' else 1
    try:
        u = f'https://fapi.binance.com/fapi/v1/klines?symbol={bs}&interval=1m&startTime={int(t0*1000)}&endTime={int(t1*1000)}&limit=1500'
        rows = json.load(urllib.request.urlopen(u, timeout=20))
        return [(r[0] / 1000, float(r[2]) / k, float(r[3]) / k, float(r[4]) / k) for r in rows]
    except Exception:
        u = f'https://www.okx.com/api/v5/market/history-candles?instId={sym}-USDT-SWAP&bar=1m&after={int(t1*1000)}&limit=300'
        rows = json.load(urllib.request.urlopen(u, timeout=20))['data']
        return sorted((int(r[0]) / 1000, float(r[2]), float(r[3]), float(r[4])) for r in rows if int(r[0]) / 1000 >= t0)


def replay(r):
    side = 1 if r['side'] == 'LONG' else -1
    e, st = float(r['ref_px']), float(r['stop'])
    risk = abs(e - st)
    if not (risk > 0) or side * (e - st) <= 0:
        return None
    t0 = ts(r['ts']); t1 = t0 + int(r['max_hold_bars']) * BAR
    ks = klines(r['sym'], t0, t1)
    if not ks:
        return None
    exit_px = ks[-1][3]
    for _, hi, lo, _c in ks:
        if (side > 0 and lo <= st) or (side < 0 and hi >= st):
            exit_px = st
            break
    return side * (exit_px - e) / risk - (e + exit_px) * COST_SIDE / risk


def stats(rs, days):
    if not rs:
        return dict(n=0)
    wins = [x for x in rs if x > 0]; loss = [-x for x in rs if x < 0]
    d = {}
    for x, day in zip(rs, days):
        d[day] = d.get(day, 0) + x
    v = list(d.values())
    sd = (sum((a - sum(v) / len(v)) ** 2 for a in v) / (len(v) - 1)) ** .5 if len(v) > 2 else 0
    t = (sum(v) / len(v)) / (sd / len(v) ** .5) if sd > 0 else 0
    eq = pk = mdd = 0
    for x in rs:
        eq += x; pk = max(pk, eq); mdd = max(mdd, pk - eq)
    return dict(n=len(rs), avgR=sum(rs) / len(rs), pf=(sum(wins) / sum(loss)) if loss else float('inf'),
                wr=100 * len(wins) / len(rs), totR=sum(rs), maxDD_R=mdd, t_daily=t)


def main():
    rows = rest('chan_shadow?variant=eq.S1&order=ts.asc&limit=100000')
    if not rows:
        print('S1: no rows yet'); return
    t0 = rows[0]['ts']
    taken = [r for r in rows if r['s1_take']]
    live = [r for r in rows if r['kind'] == 'live']
    virt = [r for r in taken if r['kind'] == 'virtual']
    print(f'S1 since {t0}: rows {len(rows)} | live {len(live)} (S1 would take {sum(r["s1_take"] for r in live)}) '
          f'| virtual taken {len(virt)} | S1 taken total {len(taken)}/{MIN_N}')
    fails = {}
    for r in rows:
        for f in r['s1_fails']:
            fails[f] = fails.get(f, 0) + 1
    print('  gate fails:', dict(sorted(fails.items(), key=lambda x: -x[1])))
    if len(taken) < MIN_N or '--full' not in sys.argv:
        print(f'  counts only (pre-registered: no R/P&L before {MIN_N} taken trades)'); return

    trades = rest(f"bot_trades?strategy=eq.CHAN&status=neq.OPEN&opened_at=gte.{t0}&select=id,sym,side,opened_at,pnl,risk_usd&limit=100000")
    def real(r):
        b = ts(r['bar'])
        m = [t for t in trades if t['sym'] == r['sym'] and t['side'] == r['side'] and b <= ts(t['opened_at']) < b + 2 * BAR]
        return (float(m[0]['pnl']) / float(m[0]['risk_usd'])) if m and m[0]['risk_usd'] else None
    base = [(float(t['pnl']) / float(t['risk_usd']), t['opened_at'][:10]) for t in trades if t['risk_usd']]
    s1_live, gap = [], []
    for r in live:
        rr = real(r)
        if rr is None or not r['s1_take']:
            continue
        s1_live.append((rr, r['ts'][:10]))
        rp = replay(r)
        if rp is not None:
            gap.append(rp - rr)
    g = sum(gap) / len(gap) if gap else 0.0
    s1_virt = [(x - g, r['ts'][:10]) for r in virt if (x := replay(r)) is not None]
    allr = s1_live + s1_virt
    B, S, V = stats(*zip(*base)), stats(*zip(*allr)), stats(*zip(*s1_virt)) if s1_virt else dict(n=0)
    print('  baseline', B); print('  S1      ', S); print('  S1 virt ', V, f'(replay gap {g:+.3f}R on {len(gap)} live rows)')
    ok = S['n'] >= MIN_N and S['avgR'] > 0 and S['avgR'] - B['avgR'] >= 0.10 and S['t_daily'] >= 2 and V.get('avgR', 0) >= 0
    rej = S['avgR'] <= B['avgR'] or S['avgR'] < 0
    print('  VERDICT:', 'PROPOSE' if ok else 'REJECT' if rej else 'KEEP COLLECTING (to n=300)')


if __name__ == '__main__':
    main()
