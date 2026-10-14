"""Polymarket live scan for two riskless-looking ideas (owner 2026-10-14, research only, never trades):
  A. NEG-RISK BASKETS. In a neg-risk event exactly one listed outcome resolves YES (non-augmented events only: an augmented
     event can gain outcomes later, so its listed set is not exhaustive). Buying one YES of every open outcome pays $1;
     buying one NO of every open outcome pays (n - 1). If the walked asks + taker fee cost less, the difference is locked in.
     Reported per event: best edge per set at the touch and the largest set count that still clears the cost (book-walked).
  B. DECIDED-NOT-SETTLED. Markets whose result is already proposed to UMA (umaResolutionStatus 'proposed') but still trade:
     the ask on the side priced >= 0.90 and what $1 at settlement leaves after the taker fee.
Fee = shares x rate x (p (1 - p))^exponent from each market's feeSchedule (0 when feesEnabled is false), as shared/pm.ts.
Run: python3 -I backtest/research/pm_arb_scan.py [rounds] [seconds between rounds]
"""
import json, sys, time, urllib.request

G = 'https://gamma-api.polymarket.com'
C = 'https://clob.polymarket.com'

def get(url, data=None):
    for i in range(4):
        try:
            req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                         headers={'content-type': 'application/json', 'user-agent': 'Mozilla/5.0'})
            return json.load(urllib.request.urlopen(req, timeout=30))
        except Exception as e:
            err = e; time.sleep(1 + 2 * i)
    raise err

def events():
    out, cur = [], ''
    while True:   # keyset paging: the offset form refuses offsets past a few thousand (HTTP 422)
        page = get(f'{G}/events/keyset?active=true&closed=false&limit=500' + (f'&after_cursor={cur}' if cur else ''))
        out += page.get('events', [])
        cur = page.get('next_cursor')
        if not cur or not page.get('events'): return out

BIDS = {}
def books(tokens):
    res = {}
    for i in range(0, len(tokens), 400):
        for b in get(f'{C}/books', [{'token_id': t} for t in tokens[i:i + 400]]):
            res[b['asset_id']] = sorted((float(a['price']), float(a['size'])) for a in b.get('asks', []))
            BIDS[b['asset_id']] = max((float(a['price']) for a in b.get('bids', [])), default=0.0)
    return res

def feeOf(m):
    if not m.get('feesEnabled'): return lambda p: 0.0
    s = m.get('feeSchedule') or {}
    r, x = float(s.get('rate', 0)), float(s.get('exponent', 1))
    return lambda p: r * (p * (1 - p)) ** x

def setCost(legs, k):
    """cost of buying k shares of every leg (asks walked, fee per fill), or None if a book is too thin."""
    tot = 0.0
    for asks, fee in legs:
        need = k
        for p, s in asks:
            q = min(need, s); tot += q * (p + fee(p)); need -= q
            if need <= 1e-9: break
        if need > 1e-9: return None
    return tot

def basket(legs, payout):
    """edge per set at the touch (payout - cost of 1 set) and the largest whole set count with cost <= payout * k."""
    if any(not a for a, _ in legs): return None
    one = setCost(legs, 1)
    if one is None: return None
    lo, hi = 0, 1
    while hi < 10**6 and (c := setCost(legs, hi)) is not None and c <= payout * hi: lo, hi = hi, hi * 2
    while hi - lo > 1:
        mid = (lo + hi) // 2; c = setCost(legs, mid)
        if c is not None and c <= payout * mid: lo = mid
        else: hi = mid
    return payout - one, lo, (payout * lo - setCost(legs, lo)) if lo else 0.0

def scan():
    ev = events()
    nr, dec = [], []
    for e in ev:
        ms = [m for m in e.get('markets', []) if m.get('clobTokenIds')]
        if e.get('negRisk') and not e.get('negRiskAugmented'):
            open_ = [m for m in ms if m.get('active') and not m.get('closed') and m.get('acceptingOrders')]
            done = [m for m in ms if m.get('closed')]
            if len(open_) >= 2 and all(json.loads(m.get('outcomePrices') or '[0,1]')[0] in ('0', 0) for m in done):
                nr.append((e, open_))
        for m in ms:
            if m.get('umaResolutionStatus') == 'proposed' and m.get('acceptingOrders') and not m.get('closed') \
                    and (m.get('endDate') or '9') < time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()):
                dec.append((e, m))
    toks = set()
    for _, ms in nr:
        for m in ms: toks.update(json.loads(m['clobTokenIds']))
    for _, m in dec: toks.update(json.loads(m['clobTokenIds']))
    bk = books(sorted(toks))
    A = []
    for e, ms in nr:
        yes = [(bk.get(json.loads(m['clobTokenIds'])[0], []), feeOf(m)) for m in ms]
        no = [(bk.get(json.loads(m['clobTokenIds'])[1], []), feeOf(m)) for m in ms]
        for kind, legs, pay in (('YES', yes, 1.0), ('NO', no, len(ms) - 1.0)):
            r = basket(legs, pay)
            if r: A.append((r[0] / (pay - r[0]), kind, len(ms), r[1], r[2], e.get('title', '')[:60], float(e.get('volume24hr') or 0)))
    B = []
    for e, m in dec:
        t = json.loads(m['clobTokenIds']); f = feeOf(m)
        for j, (side, tok) in enumerate(zip(json.loads(m['outcomes']), t)):
            asks, other = bk.get(tok, []), t[1 - j]
            # the market must agree this side won: a bid >= 0.90 on it, or the other side offered at <= 0.10
            # (a lone 0.95 ask with no bids can be a stale ladder left on the LOSING side)
            agreed = BIDS.get(tok, 0) >= 0.90 or (bk.get(other) and bk[other][0][0] <= 0.10)
            if asks and asks[0][0] >= 0.90 and agreed:
                p = asks[0][0]; c = p + f(p)
                depth = sum(s * q for q, s in asks if q + f(q) < 1)
                B.append(((1 - c) / c, p, depth, side, m.get('question', '')[:60], m.get('endDate', '')[:16]))
    return len(ev), len(nr), len(dec), A, B

if __name__ == '__main__':
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    gap = float(sys.argv[2]) if len(sys.argv) > 2 else 60
    for i in range(rounds):
        t = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())
        n, nnr, nd, A, B = scan()
        pos = sorted([a for a in A if a[0] > 0], reverse=True)
        print(f'\n=== {t} UTC  events {n} | neg-risk baskets {nnr} | proposed-not-settled markets {nd}')
        print(f'A. baskets priced: {len(A)}, with a positive edge at the touch: {len(pos)}')
        for r, k, n_, sets, usd, title, v in pos[:15]:
            print(f'   {k:3} n{n_:<3} edge {100 * r:+6.2f}%  fills {sets:>7} sets  locked ${usd:9.2f}  vol24h ${v:>11,.0f}  {title}')
        near = sorted(A, reverse=True)[:5]
        print('   closest overall:', ' | '.join(f'{k} n{n_} {100 * r:+.2f}%' for r, k, n_, *_ in near))
        Bs = sorted(B, reverse=True)
        print(f'B. proposed sides at >= 90c with an ask: {len(B)}; return to $1 after fee (top 15):')
        for r, p, d, side, q, end in Bs[:15]:
            print(f'   {100 * r:+6.2f}%  ask {p:.3f}  ${d:>10,.0f} below $1  [{side}] {q}  end {end}')
        sys.stdout.flush()
        if i + 1 < rounds: time.sleep(gap)
