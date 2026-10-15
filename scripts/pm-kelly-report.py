"""Kelly / calibration report for the three Polymarket paper desks (docs/POLY_PLAYBOOK.md, chapters 2, 3, 4, 7).
For every desk: closed trades since its 'judged since' time (docs/POLY_SUPERVISOR.md) and over all history.
  implied p   = average entry price (what the market said)
  realised p  = win rate (what happened)
  edge        = realised p - implied p
  EV per $    = mean(pnl / cost)            (after fees and slippage, as booked)
  Kelly f*    = (p - price) / (1 - price)   with p = realised win rate, price = average entry
  quarter K   = f*/4, the stake ceiling the playbook allows; compared with the desk's current stake
  Brier(mkt)  = mean((entry price - outcome)^2), the market's own score on our trades; calibration by price bucket
Usage: python3 scripts/pm-kelly-report.py [out.json]   (reads the live state files; read only)"""
import json, sys, math, urllib.request, datetime as dt
RAW = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/{}/state.json'
DESKS = {'pm': ('Poly', '2026-10-15T18:30', 0.03), 'pmc': ('Poly Coins', '2026-10-15T19:00', 0.03), 'pmn': ('Poly News (SQ)', '2026-10-15T16:10', 0.02)}
def load(d):
    return json.load(urllib.request.urlopen(urllib.request.Request(RAW.format(d) + f'?x={dt.datetime.now().timestamp()}', headers={'User-Agent': 'x'}), timeout=30))
def stats(T):
    T = [t for t in T if t.get('status') == 'CLOSED' and t.get('cost')]
    n = len(T)
    if not n: return {'n': 0}
    won = [1 if (t.get('exit_px') or 0) >= 0.999 or t['pnl'] > 0 else 0 for t in T]
    px = [t['entry_px'] for t in T]
    r = [t['pnl'] / t['cost'] for t in T]
    p, price = sum(won) / n, sum(px) / n
    m = sum(r) / n; sd = (sum((x - m) ** 2 for x in r) / max(1, n - 1)) ** .5
    f = (p - price) / (1 - price) if price < 1 else 0
    se_p = (p * (1 - p) / n) ** .5
    buckets = {}
    for w, q in zip(won, px):
        b = f'{int(q * 20) / 20:.2f}'
        s = buckets.setdefault(b, [0, 0, 0.0]); s[0] += 1; s[1] += w; s[2] += q
    return {'n': n, 'win_rate': round(p, 4), 'avg_price': round(price, 4), 'edge': round(p - price, 4), 'edge_se': round(se_p, 4),
            'ev_per_usd': round(m, 4), 't': round(m / sd * n ** .5, 2) if sd else None, 'kelly': round(f, 4), 'quarter_kelly': round(f / 4, 4),
            'brier_market': round(sum((q - w) ** 2 for w, q in zip(won, px)) / n, 4),
            'calibration': {b: {'n': s[0], 'won': round(s[1] / s[0], 3), 'price': round(s[2] / s[0], 3)} for b, s in sorted(buckets.items())}}
out = {'at': dt.datetime.utcnow().isoformat(timespec='seconds') + 'Z', 'desks': {}}
for d, (name, since, stake) in DESKS.items():
    s = load(d); T = s.get('trades', [])
    judged = [t for t in T if (t.get('opened_at') or '') >= since]
    open_ = [t for t in T if t.get('status') == 'OPEN']
    out['desks'][d] = {'name': name, 'since': since, 'stake': stake, 'all': stats(T), 'judged': stats(judged),
                       'open': len(open_), 'open_cost': round(sum(t['cost'] for t in open_), 2)}
    if d == 'pmn' and open_:   # chapter 4: annualised return if every open position resolves as bought, and at the research win rate
        now = dt.datetime.now(dt.timezone.utc); rows = []
        for t in open_:
            try: days = max(1, (dt.datetime.fromisoformat(t['end_time'].replace('Z', '+00:00')) - now).days)
            except Exception: continue
            rows.append((t['entry_px'], days))
        if rows:
            px = sum(a for a, _ in rows) / len(rows); days = sorted(b for _, b in rows)[len(rows) // 2]
            out['desks'][d]['annualised_if_all_win'] = round((1 / px) ** (365 / days) - 1, 3)
            out['desks'][d]['annualised_at_wr_0908'] = round((0.908 / px) ** (365 / days) - 1, 3)
            out['desks'][d]['median_days_left'] = days
for d, x in out['desks'].items():
    print(f"== {x['name']}  stake {x['stake']*100:.0f}%  open {x['open']} (${x['open_cost']})")
    for k in ('all', 'judged'):
        s = x[k]
        if not s['n']: print(f'   {k:6}: no closed trades'); continue
        print(f"   {k:6}: n {s['n']:4}  WR {s['win_rate']*100:5.1f}% (+-{s['edge_se']*100:.1f})  avg price {s['avg_price']*100:5.1f}c  edge {s['edge']*100:+5.1f}pp"
              f"  EV {s['ev_per_usd']*100:+5.2f}%/$ t {s['t']}  Kelly {s['kelly']*100:+6.1f}%  1/4K {s['quarter_kelly']*100:+5.1f}%  Brier(mkt) {s['brier_market']}")
    if 'annualised_if_all_win' in x:
        print(f"   open SQ: median {x['median_days_left']} days left; annualised {x['annualised_if_all_win']*100:.0f}% if all win, {x['annualised_at_wr_0908']*100:.0f}% at the research WR 90.8%")
    s = x['all']
    if s['n']: print('   calibration (all):', '  '.join(f"{b}: n{v['n']} won {v['won']*100:.0f}% vs {v['price']*100:.0f}c" for b, v in s['calibration'].items()))
if len(sys.argv) > 1: json.dump(out, open(sys.argv[1], 'w'), indent=1)
