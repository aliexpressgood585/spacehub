"""v121 quant lab — the search loop. Every hypothesis below was written down before its result was read.
Stage 1 (screen): each family is tested with time exits (pure signal content), direction (follow/fade) chosen on TRAIN only.
   PASS_SCREEN = TRAIN net>0, VALIDATION net>0, OOS net>0 with t>=2 and PF>1.
Stage 2 (candidates = screen passers, else the 6 best by TRAIN+VALIDATION t): exit optimisation, dynamic TP/SL, filters,
   chosen on TRAIN+VALIDATION only, then OOS read once; robustness = parameter perturbation, remove best 1%, coin
   concentration, OOS halves, Monte Carlo; walk-forward re-selection.
Usage: python3 run.py [section ...]   sections: screen xs liq sweep tod lag regime score ml stage2"""
import sys, json, numpy as np, pandas as pd
from lib import load, base_features, sim, barrier_labels, stats, splits, verdict, record, thresholds, roll, shift, D, DB
P = load(); C, T = P['C'], P['T']; A, B = P['split']
o, h, l, c = [P[k].astype(np.float64) for k in ('o', 'h', 'l', 'c')]
fund = np.nan_to_num(P['fund']).astype(np.float64); cost = P['cost']; COST_BPS = float(cost.mean() * 1e4)
print('loading features ...', flush=True)
X = base_features(P)
atr = X['atr'].astype(np.float64)
ROWS = []
CAND = []
HZ = (3, 12, 48, 288)
valid = np.isfinite(P['c']) & np.isfinite(X['atr'])

def run(sig, mode=0, H=12, a=0.0, b=0.0, cool=0):
    sig = sig.astype(np.int8)
    return sim(sig, o, h, l, c, atr, fund, cost, mode, H, a, b, cool, int(np.count_nonzero(sig)) + 10)

def sd(s): return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in s.items()}

def test(family, name, sig, extra=None, H_list=HZ, choose_dir=True, mode=0, a=0.0, b=0.0):
    """time-exit test over horizons; direction chosen on TRAIN; returns the best-by-TRAIN row"""
    best = None
    for H in H_list:
        cands = []
        for d in ((1, -1) if choose_dir else (1,)):
            tr = run(sig * d, mode, H, a, b)
            s3 = splits(P, tr)
            cands.append((s3[0]['net'] if s3[0]['n'] >= 30 else -1e9, d, tr, s3))
        _, d, tr, (st, sv, so) = max(cands, key=lambda x: x[0])
        v = verdict(st, sv, so, COST_BPS)
        exp = dict(family=family, name=name, H=H, dir='follow' if d == 1 else 'fade', mode=mode, a=a, b=b, train=sd(st), val=sd(sv), oos=sd(so), verdict=v, **(extra or {}))
        record(ROWS, exp)
        if best is None or st['t'] + sv['t'] > best[0]: best = (st['t'] + sv['t'], exp, sig * d)
    if best and best[1]['train']['net'] > 0 and best[1]['train']['n'] >= 100: CAND.append(best)
    return best

def quantile_sig(F, q, mask=None):
    hi, lo = thresholds(F, A, q)
    s = np.zeros((C, T), np.int8)
    s[(F >= hi) & valid] = 1; s[(F <= lo) & valid] = -1
    if mask is not None: s[~mask] = 0
    return s

# ---------------------------------------------------------------- 1-3, 5, 6, 7, 14: single-feature screen
SCREEN = {
    'trend':      ['donpos', 'd50', 'd200', 'r288', 'adx_dir'],
    'meanrev':    ['dvwap', 'bbz', 'exmove', 'spike'],
    'momentum':   ['r1', 'r3', 'r12', 'r48', 'accel'],
    'volatility': ['atrr', 'bbwp'],
    'volume':     ['rvol_dir', 'pvdiv', 'vtrend_dir'],
    'micro':      ['oi1_dir', 'oi12_dir', 'oi48_dir', 'tlsz', 'lsrz', 'tkrz', 'fundz', 'fund', 'cvd3', 'cvd12', 'imb'],
    'stat':       ['rpct', 'ac1_mom', 'z288'],
}
def derived(name):
    sgn = np.sign(np.nan_to_num(X['r3']))
    if name == 'adx_dir': return (X['adx'] * np.sign(np.nan_to_num(X['d50']))).astype(np.float32)
    if name == 'rvol_dir': return (np.log(X['rvol']) * np.sign(np.nan_to_num(X['spike']))).astype(np.float32)
    if name == 'vtrend_dir': return (np.log(X['vtrend']) * np.sign(np.nan_to_num(X['r12']))).astype(np.float32)
    if name == 'pvdiv': return (X['r12'] * -np.log(X['vtrend'])).astype(np.float32)          # price up on falling volume = high
    if name.startswith('oi') and name.endswith('_dir'):
        k = name[:-4]; return (X[k] * 100 * np.sign(np.nan_to_num(X['r' + {'oi1': '1', 'oi12': '12', 'oi48': '48'}[k]]))).astype(np.float32)
    if name == 'ac1_mom': return (X['ac1'] * X['r12']).astype(np.float32)                     # momentum where returns persist
    if name == 'z288': return ((P['c'] - roll(P['c'], 288)) / roll(P['c'], 288, 'std')).astype(np.float32)
    return X[name]

def sec_screen():
    for fam, feats in SCREEN.items():
        for f in feats:
            F = derived(f)
            for q in (0.1, 0.02):
                test(fam, f'{f} q{q}', quantile_sig(F, q), dict(q=q))
            print(fam, f, flush=True)
    # 5 volatility events: squeeze release + breakout direction; ATR compression -> expansion
    sq = (X['bbwp'] < 0.1)
    rel = shift(sq.astype(np.float32), 1) > 0
    brk = np.zeros((C, T), np.int8); cc = P['c']
    brk[(cc > X['hi48']) & valid] = 1; brk[(cc < X['lo48']) & valid] = -1
    test('volatility', 'squeeze->break48', np.where(rel, brk, 0).astype(np.int8))
    exp = (X['atrr'] > 1.5) & (shift(roll(X['atrr'], 48, 'max'), 1) < 0.9)
    test('volatility', 'compression->expansion', np.where(exp, np.sign(np.nan_to_num(X['spike'])), 0).astype(np.int8))
    test('trend', 'break48', brk); test('trend', 'break288', np.where((cc > X['hi288']), 1, np.where(cc < X['lo288'], -1, 0)).astype(np.int8))
    test('trend', 'break48+volexp', np.where((X['rvol'] > 2) & (X['atrr'] > 1.2), brk, 0).astype(np.int8))
    mtf = np.sign(np.nan_to_num(X['r12'])) + np.sign(np.nan_to_num(X['r48'])) + np.sign(np.nan_to_num(X['r288'])) + np.sign(np.nan_to_num(X['d200']))
    test('trend', 'multi-tf agree 4/4', np.where(mtf == 4, 1, np.where(mtf == -4, -1, 0)).astype(np.int8))
    test('volume', 'break48+rvol>2', np.where(X['rvol'] > 2, brk, 0).astype(np.int8))

# ---------------------------------------------------------------- 3/4: cross-sectional momentum / relative strength baskets
def basket(F, H, N, side):
    """rank at bars r = k*H (+ entry at next open), long top N / short bottom N; side: 'ls', 'long', 'short'."""
    rs = np.arange(300, T - H - 2, H)
    rows = []; prevL, prevS = set(), set()
    for r in rs:
        f = F[:, r]; ok = np.isfinite(f) & (o[:, r + 1] > 0) & (o[:, r + 1 + H] > 0)
        idx = np.where(ok)[0]
        if len(idx) < 2 * N + 5: prevL, prevS = set(), set(); continue
        order = idx[np.argsort(f[idx])]
        L, S = set(order[-N:]), set(order[:N])
        ret = o[:, r + 1 + H] / o[:, r + 1] - 1
        gl = np.mean([ret[i] for i in L]); gs = -np.mean([ret[i] for i in S])
        cl = np.mean([cost[i] / 2 for i in L]) * (len(L - prevL) + len(prevL - L)) / N
        cs = np.mean([cost[i] / 2 for i in S]) * (len(S - prevS) + len(prevS - S)) / N
        fl = np.mean([fund[i, r] for i in L]) * H / 96; fs = -np.mean([fund[i, r] for i in S]) * H / 96
        if side == 'ls': g, cst = (gl + gs) / 2, (cl + cs) / 2 + (fl + fs) / 2
        elif side == 'long': g, cst = gl, cl + fl
        else: g, cst = gs, cs + fs
        rows.append((0, r + 1, 1, g, g - cst, H, r + 1 + H))
        prevL, prevS = (L, S) if side != 'short' else (set(), S)
        if side == 'long': prevS = set()
    return np.array(rows) if rows else np.zeros((0, 7))

def sec_xs():
    feats = {'r12': X['r12'], 'r48': X['r48'], 'r288': X['r288'], 'accel': X['accel'], 'rvol': np.log(X['rvol']),
             'cvd12': X['cvd12'], 'oi12': X['oi12'], 'fundz': X['fundz'], 'tlsz': X['tlsz'], 'dvwap': X['dvwap'], 'volexp': np.log(X['atrr'])}
    for fn, F in feats.items():
        for H in (12, 48, 288):
            for N in (3, 5, 10):
                for side in ('ls', 'long', 'short'):
                    best = None
                    for d, lab in ((1, 'strong'), (-1, 'weak-as-strong')):
                        tr = basket(F * d, H, N, side); s3 = splits(P, tr)
                        if best is None or s3[0]['net'] > best[0]: best = (s3[0]['net'], lab, s3)
                    _, lab, (st, sv, so) = best
                    record(ROWS, dict(family='xsection', name=f'rank {fn} {side} N{N}', H=H, dir=lab, train=sd(st), val=sd(sv), oos=sd(so), verdict=verdict(st, sv, so, COST_BPS / 2)))
        print('xs', fn, flush=True)

# ---------------------------------------------------------------- 8: liquidation-cascade proxy (OI drop + big candle + volume)
def sec_liq():
    oi3 = X['oi3']; hi, lo = thresholds(oi3, A, 0.01)
    big = np.abs(np.nan_to_num(X['r3'])) * np.sqrt(3) >= 2.0
    ev = (oi3 <= lo) & big & (X['rvol'] >= 2) & valid
    d = np.sign(np.nan_to_num(X['r3'])).astype(np.int8)            # direction of the cascade
    cont = np.where(ev, d, 0).astype(np.int8)
    test('liquidation', 'cascade continuation', cont, choose_dir=False)
    test('liquidation', 'cascade reversal (immediate)', -cont, choose_dir=False)
    # reversal only after a confirmed reclaim: within 6 bars, a close back beyond the event bar's open
    rec = np.zeros((C, T), np.int8); cc = P['c']; oo = P['o']
    for ci in range(C):
        idx = np.where(ev[ci])[0]
        for i in idx:
            lvl, s = oo[ci, i], d[ci, i]
            for k in range(i + 1, min(T, i + 7)):
                if s < 0 and cc[ci, k] > lvl: rec[ci, k] = 1; break
                if s > 0 and cc[ci, k] < lvl: rec[ci, k] = -1; break
    test('liquidation', 'cascade reversal after reclaim', rec, choose_dir=False)
    test('liquidation', 'cascade reversal after reclaim + vol', np.where(X['rvol'] >= 1.5, rec, 0).astype(np.int8), choose_dir=False)
    # rejection: cascade fails to extend (next 3 bars do not make a new extreme) -> continuation of the rejection
    for q in (0.05, 0.02):
        hi2, lo2 = thresholds(oi3, A, q)
        ev2 = (oi3 <= lo2) & big & valid
        test('liquidation', f'OI drop q{q} + big candle', np.where(ev2, d, 0).astype(np.int8), dict(q=q))
        ev3 = (oi3 >= hi2) & big & valid
        test('liquidation', f'OI surge q{q} + big candle', np.where(ev3, d, 0).astype(np.int8), dict(q=q))
    print('liq done', flush=True)

# ---------------------------------------------------------------- 9: liquidity sweeps with confirmed reclaim
def sec_sweep():
    cc, hh, ll = P['c'], P['h'], P['l']
    for w, lab in ((48, '4h'), (288, '1d')):
        hi, lo = X[f'hi{w}'], X[f'lo{w}']
        s = np.zeros((C, T), np.int8)
        s[(hh > hi) & (cc < hi) & valid] = -1; s[(ll < lo) & (cc > lo) & valid] = 1
        test('sweep', f'sweep prev {lab} high/low + reclaim', s, choose_dir=False)
        test('sweep', f'sweep prev {lab} + reclaim + rvol>1.5', np.where(X['rvol'] > 1.5, s, 0).astype(np.int8), choose_dir=False)
        # confirmed reclaim: the NEXT bar also closes back inside
        s2 = np.zeros((C, T), np.int8); ps = shift(s.astype(np.float32), 1)
        s2[(ps == -1) & (cc < shift(hi, 1))] = -1; s2[(ps == 1) & (cc > shift(lo, 1))] = 1
        test('sweep', f'sweep prev {lab} + 2-bar confirmed reclaim', s2, choose_dir=False)
        # false breakout of the prior close-high (close above then back below within 3 bars)
    # equal highs/lows: two prior 48-bar extremes within 0.15 ATR (the 2 most recent 24-bar halves), then swept and reclaimed
    h1, h2 = shift(roll(hh, 24, 'max'), 1), shift(roll(hh, 24, 'max'), 25)
    l1, l2 = shift(roll(ll, 24, 'min'), 1), shift(roll(ll, 24, 'min'), 25)
    eqh = np.abs(h1 - h2) < 0.15 * X['atr']; eql = np.abs(l1 - l2) < 0.15 * X['atr']
    lvlh, lvll = np.fmax(h1, h2), np.fmin(l1, l2)
    s = np.zeros((C, T), np.int8)
    s[eqh & (hh > lvlh) & (cc < lvlh) & valid] = -1; s[eql & (ll < lvll) & (cc > lvll) & valid] = 1
    test('sweep', 'equal highs/lows sweep + reclaim', s, choose_dir=False)
    print('sweep done', flush=True)

# ---------------------------------------------------------------- 11: time of day
def sec_tod():
    hour = X['hour']; minute = ((P['grid'] // 60000) % 60)
    for hr in range(24):
        at = np.zeros((C, T), np.int8); col = (hour == hr) & (minute == 0)
        at[:, col] = 1; at &= valid
        test('time', f'hour {hr:02d}UTC long-all', at.astype(np.int8), H_list=(12,))
    sessions = {'asia 00-08': (0, 0, 96), 'europe 07-16': (7, 0, 108), 'us 13-21': (13, 0, 96), 'london open 07-09': (7, 0, 24),
                'ny open 13:30-15:30': (13, 30, 24), 'us close 20-22': (20, 0, 24)}
    for nm, (hr, mn, Hs) in sessions.items():
        col = (hour == hr) & (minute == mn); at = np.zeros((C, T), np.int8); at[:, col] = 1; at &= valid
        test('time', f'session {nm} long-all', at.astype(np.int8), H_list=(Hs,))
        # session momentum: follow the previous 8 hours' move at the session open
        mom = np.where(at > 0, np.sign(np.nan_to_num(np.log(P['c'] / shift(P['c'], 96)))), 0).astype(np.int8)
        test('time', f'session {nm} follow prior 8h', mom, H_list=(Hs,))
    # weekday
    dow = X['dow']
    for dd in range(7):
        col = (dow == dd) & (hour == 0) & (minute == 0); at = np.zeros((C, T), np.int8); at[:, col] = 1; at &= valid
        test('time', f'weekday {dd} long-all 24h', at.astype(np.int8), H_list=(288,))
    print('tod done', flush=True)

# ---------------------------------------------------------------- 12/13: cross-asset & lag (5m panel)
def sec_lag():
    coins = list(P['coins']); bi, ei = coins.index('BTC'), coins.index('ETH')
    lr = np.nan_to_num(X['lr'])
    # lag correlation BTC(t) -> alt(t+L), pooled over alts, TRAIN part
    res = {}
    for L in (0, 1, 2, 3, 6):
        cs = []
        for ci in range(C):
            if ci in (bi,): continue
            x, y = lr[bi, 300:A - L], lr[ci, 300 + L:A]
            if np.std(y) > 0: cs.append(np.corrcoef(x, y)[0, 1])
        res[L] = float(np.mean(cs))
    record(ROWS, dict(family='lag', name='corr BTC 5m return -> alt return L bars later (TRAIN, mean over alts)', corr=res, verdict='info'))
    for lead, li in (('BTC', bi), ('ETH', ei)):
        z = X['r1'][li]
        for k in (2.0, 3.0):
            for lagfrac in (0.3, 1e9):
                big = np.abs(z) >= k
                s = np.zeros((C, T), np.int8)
                alt_small = np.abs(np.nan_to_num(X['r1'])) < lagfrac * np.abs(np.nan_to_num(z))[None, :]
                s[:, big] = np.sign(z[big]).astype(np.int8)
                s[li] = 0
                if lead == 'ETH': s[bi] = 0
                s = np.where(alt_small & valid, s, 0).astype(np.int8)
                test('lag', f'{lead} 5m move |z|>={k} -> alts follow' + (' (alt lagging)' if lagfrac < 1 else ''), s, H_list=(1, 3, 12), extra=dict(k=k))
    # BTC breakout -> alts that have NOT broken out yet
    cc = P['c']; bb = np.zeros(T, np.int8)
    bb[cc[bi] > X['hi48'][bi]] = 1; bb[cc[bi] < X['lo48'][bi]] = -1
    first = (bb != 0) & (shift(bb[None, :].astype(np.float32), 1)[0] == 0)
    notyet = (cc < X['hi48']) & (cc > X['lo48'])
    s = np.where(first[None, :] & notyet & valid, bb[None, :], 0).astype(np.int8); s[bi] = 0
    test('lag', 'BTC 4h breakout -> alts not yet broken out', s, H_list=(3, 12, 48))
    # BTC dominance proxy: BTC 4h return minus alt-index 4h return -> alts next move
    alt = np.nanmean(np.where(np.arange(C)[:, None] == bi, np.nan, X['r48']), axis=0)
    dom = X['r48'][bi] - alt
    domF = np.repeat(dom[None, :], C, axis=0).astype(np.float32); domF[bi] = np.nan
    test('lag', 'BTC-dominance rise (4h) -> alts', quantile_sig(domF, 0.1), H_list=(12, 48, 288))
    print('lag done', flush=True)

# ---------------------------------------------------------------- 10: regime classifier, family x regime
def regimes():
    R = np.full((C, T), 5, np.int8)                       # 5 = RANGE default
    R[X['adx'] > 25] = 0                                  # TREND
    R[X['bbwp'] < 0.15] = 3                               # LOW VOL
    R[(X['atrr'] > 1.3) & (X['bbwp'] > 0.85)] = 2         # HIGH VOL
    R[((P['c'] > X['hi48']) | (P['c'] < X['lo48'])) & (X['rvol'] > 2)] = 1        # BREAKOUT
    R[(np.abs(np.nan_to_num(X['r3'])) * np.sqrt(3) > 3) & (X['rvol'] > 3) & (np.nan_to_num(X['oi3']) < -0.01)] = 4   # PANIC / LIQUIDATION
    return R
RNAMES = ['TREND', 'BREAKOUT', 'HIGHVOL', 'LOWVOL', 'PANIC', 'RANGE']

def sec_regime():
    R = regimes()
    share = {RNAMES[r]: float((R[valid] == r).mean()) for r in range(6)}
    record(ROWS, dict(family='regime', name='regime shares', shares=share, verdict='info'))
    base = [('r12', 0.1), ('r48', 0.1), ('dvwap', 0.1), ('bbz', 0.1), ('exmove', 0.02), ('cvd12', 0.1), ('oi12_dir', 0.1), ('tkrz', 0.1), ('donpos', 0.1)]
    for f, q in base:
        sig = quantile_sig(derived(f), q)
        for H in (12, 48):
            for d in (1, -1):
                tr = run(sig * d, 0, H)
                # choose regimes on TRAIN: positive net with >= 50 trades
                reg = R[tr[:, 0].astype(int), (tr[:, 1] - 1).astype(int)]
                keep = []
                for r in range(6):
                    m = (reg == r) & (tr[:, 1] < A)
                    if m.sum() >= 50 and tr[m, 4].mean() > 0: keep.append(r)
                if not keep: continue
                sel = tr[np.isin(reg, keep)]
                st, sv, so = splits(P, sel)
                record(ROWS, dict(family='regime', name=f'{f} q{q} {"follow" if d == 1 else "fade"} only in {"+".join(RNAMES[r] for r in keep)}', H=H,
                                  train=sd(st), val=sd(sv), oos=sd(so), verdict=verdict(st, sv, so, COST_BPS)))
    print('regime done', flush=True)

# ---------------------------------------------------------------- 15/20: scoring model + top-N portfolio selection
GROUPS = {'trend': ['d50', 'd200', 'donpos', 'r288'], 'momentum': ['r3', 'r12', 'accel'], 'volume': ['rvol_dir', 'vtrend_dir'],
          'volatility': ['atrr'], 'orderflow': ['cvd12', 'tkrz', 'oi12_dir'], 'positioning': ['tlsz', 'fundz'], 'meanrev': ['dvwap', 'bbz']}
def zs(F):
    m = np.nanmean(F[:, :A], axis=1, keepdims=True); s = np.nanstd(F[:, :A], axis=1, keepdims=True)
    return np.clip((F - m) / s, -4, 4)
def fwd(H): return (o[:, np.minimum(np.arange(T) + 1 + H, T - 1)] / o[:, np.minimum(np.arange(T) + 1, T - 1)] - 1).astype(np.float32)

def composite(H):
    f = fwd(H); tr_mask = np.zeros(T, bool); tr_mask[300:A - H] = True
    score = np.zeros((C, T), np.float32); used = {}
    for g, feats in GROUPS.items():
        gs = np.zeros((C, T), np.float32)
        for fn in feats:
            Z = zs(derived(fn)); m = np.isfinite(Z) & np.isfinite(f) & tr_mask[None, :]
            corr = np.corrcoef(Z[m], f[m])[0, 1]; w = np.sign(corr)
            gs += np.nan_to_num(Z) * w; used[fn] = round(float(corr), 4)
        score += gs / len(feats)
    return score, used

def sec_score():
    for H in (12, 48, 288):
        score, used = composite(H)
        for q in (0.1, 0.02, 0.005):
            sig = quantile_sig(score, q)
            tr = run(sig, 0, H); st, sv, so = splits(P, tr)
            record(ROWS, dict(family='score', name=f'composite score q{q}', H=H, weights=used, train=sd(st), val=sd(sv), oos=sd(so), verdict=verdict(st, sv, so, COST_BPS)))
        # top-N per bar across coins, only if |score| above the TRAIN 98th percentile (minimum expectancy threshold)
        thr = np.nanquantile(np.abs(score[:, :A]), 0.98)
        for N in (1, 3):
            sig = np.zeros((C, T), np.int8); a_ = np.abs(score)
            for t in range(300, T, 1):
                col = a_[:, t]
                if not np.isfinite(col).any(): continue
                top = np.argsort(-np.nan_to_num(col))[:N]
                for ci in top:
                    if col[ci] >= thr and valid[ci, t]: sig[ci, t] = 1 if score[ci, t] > 0 else -1
            tr = run(sig, 0, H); st, sv, so = splits(P, tr)
            record(ROWS, dict(family='score', name=f'top-{N} per bar by |score| >= p98', H=H, train=sd(st), val=sd(sv), oos=sd(so), verdict=verdict(st, sv, so, COST_BPS)))
        print('score', H, flush=True)

# ---------------------------------------------------------------- 16: machine learning, triple barrier, monthly walk-forward
def sec_ml():
    import lightgbm as lgb
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    feats = ['r1', 'r3', 'r12', 'r48', 'r288', 'accel', 'd50', 'd200', 'bbz', 'bbwp', 'donpos', 'atrr', 'dvwap', 'rpct', 'ac1', 'adx',
             'cvd3', 'cvd12', 'oi1', 'oi12', 'oi48', 'tlsz', 'lsrz', 'tkrz', 'fundz']
    Xr = np.stack([derived(f) if f in ('rvol_dir',) else X[f] for f in feats] + [np.log(X['rvol']), np.log(X['vtrend'])], axis=-1)
    names = feats + ['lrvol', 'lvtrend']
    H, K = 48, 1.5
    # label: +1 if +K ATR is touched before -K ATR within H bars (from the next open), 0 if the lower first; timeouts dropped
    step = 6
    tt = np.arange(300, T - H - 2, step)
    lab = barrier_labels(o, h, l, atr, tt.astype(np.int64), H, K)
    month = ((P['grid'][tt] - P['grid'][0]) // (30.4 * 86_400_000)).astype(int)
    Xs = Xr[:, tt, :]
    preds = {m: np.full((C, len(tt)), np.nan) for m in ('logit', 'lgbm')}
    for mth in range(4, month.max() + 1):
        trm = month < mth - 0; trm &= (tt < (tt[month == mth][0] - 288 if (month == mth).any() else T))   # 1-day embargo
        tem = month == mth
        Xtr = Xs[:, trm, :].reshape(-1, Xs.shape[2]); ytr = lab[:, trm].reshape(-1)
        ok = (ytr >= 0) & np.isfinite(Xtr).all(axis=1); Xtr, ytr = Xtr[ok], ytr[ok]
        if len(ytr) > 400_000: sel = np.random.RandomState(mth).choice(len(ytr), 400_000, replace=False); Xtr, ytr = Xtr[sel], ytr[sel]
        Xte = Xs[:, tem, :].reshape(-1, Xs.shape[2]); okte = np.isfinite(Xte).all(axis=1)
        sc = StandardScaler().fit(Xtr)
        lr_ = LogisticRegression(max_iter=300, C=0.1).fit(sc.transform(Xtr), ytr)
        gb = lgb.LGBMClassifier(n_estimators=200, num_leaves=15, learning_rate=0.05, min_child_samples=500, subsample=0.7, subsample_freq=1, colsample_bytree=0.7, verbose=-1).fit(Xtr, ytr)
        for nm, mdl, Xin in (('logit', lr_, sc.transform(np.nan_to_num(Xte))), ('lgbm', gb, np.nan_to_num(Xte))):
            p = np.full(len(Xte), np.nan); p[okte] = mdl.predict_proba(Xin[okte])[:, 1]
            preds[nm][:, tem] = p.reshape(C, -1)
        print('ml month', mth, flush=True)
    for nm, pr in preds.items():
        # AUC on all predicted months
        from sklearn.metrics import roc_auc_score
        m = np.isfinite(pr) & (lab >= 0)
        auc = roc_auc_score(lab[m], pr[m]) if m.sum() > 100 else 0.5
        for qq in (0.1, 0.02):
            hi_, lo_ = np.nanquantile(pr, 1 - qq), np.nanquantile(pr, qq)
            sig = np.zeros((C, T), np.int8)
            sig[:, tt] = np.where(pr >= hi_, 1, np.where(pr <= lo_, -1, 0))
            tr = run(sig, 1, H, K, K); st, sv, so = splits(P, tr)
            record(ROWS, dict(family='ml', name=f'{nm} triple-barrier {K}ATR/{H} bars, top/bottom {qq}', H=H, auc=round(float(auc), 4), train=sd(st), val=sd(sv), oos=sd(so),
                              verdict=verdict(st, sv, so, COST_BPS), note='walk-forward monthly predictions; the "train" period here is still out-of-model (months 4-6)'))
        if nm == 'lgbm':
            imp = sorted(zip(names, gb.feature_importances_.tolist()), key=lambda x: -x[1])[:10]
            record(ROWS, dict(family='ml', name='lgbm feature importance (last month model)', imp=imp, verdict='info'))


# ---------------------------------------------------------------- stage 2: exits, dynamic TP/SL, filters, robustness
EXITS = [(0, H, 0, 0) for H in (3, 12, 48, 96, 288)] + [(1, H, a, b) for H in (48, 288) for a in (1, 1.5, 2, 3) for b in (1, 1.5, 2)] + \
        [(2, H, a, b) for H in (96, 288) for a in (1.5, 2.5, 4) for b in (1.5, 2.5)] + [(3, 288, a, b) for a in (2, 3) for b in (1, 1.5)] + \
        [(4, 288, a, b) for a in (1, 1.5) for b in (2, 3)]
def tv(tr):   # TRAIN+VALIDATION combined, used for every stage-2 choice
    return stats(tr, 0, B)
def robust(P, tr, label):
    so = stats(tr, B, T); oos = tr[tr[:, 1] >= B]
    out = dict(oos=sd(so))
    if len(oos) < 10: return out
    per = pd.Series(oos[:, 4]).groupby(oos[:, 0].astype(int)).sum()
    out['coins_traded'] = int(len(per)); out['coins_pos'] = int((per > 0).sum())
    out['top_coin_share'] = float(per.max() / per[per > 0].sum()) if (per > 0).any() else 1.0
    mid = B + (T - B) // 2
    out['oos_h1'] = sd(stats(tr, B, mid)); out['oos_h2'] = sd(stats(tr, mid, T))
    day = (oos[:, 1] // 288).astype(int); ds = pd.Series(oos[:, 4]).groupby(day).sum().values
    rng = np.random.RandomState(7); bs = np.array([rng.choice(ds, len(ds)).sum() for _ in range(2000)])
    out['mc_ploss'] = float((bs <= 0).mean())
    return out
def accept(rb, neigh_share):
    o_ = rb['oos']
    return bool(o_['n'] >= 100 and o_['net'] > 0 and o_['pf'] > 1 and o_['rm1'] > 0 and rb.get('coins_traded', 0) >= 5 and rb.get('top_coin_share', 1) < 0.4
                and rb.get('coins_pos', 0) >= 0.5 * rb.get('coins_traded', 1) and rb['oos_h1']['net'] > 0 and rb['oos_h2']['net'] > 0 and rb.get('mc_ploss', 1) < 0.1 and neigh_share >= 0.6)
FILTERS = {}
def build_filters():
    coins = list(P['coins']); bi = coins.index('BTC')
    FILTERS.update({'adx>20': X['adx'] > 20, 'rvol>1': X['rvol'] > 1, '|fundz|<2': np.abs(np.nan_to_num(X['fundz'])) < 2,
                    'BTC calm (atrr<1.3)': np.repeat((X['atrr'][bi] < 1.3)[None, :], C, 0), 'liquid (qv>train median)': P['qv'] > np.nanmedian(P['qv'][:, :A], axis=1, keepdims=True),
                    'vol normal (0.1<bbwp<0.9)': (X['bbwp'] > 0.1) & (X['bbwp'] < 0.9)})
def sec_stage2():
    build_filters(); R = regimes()
    pool = sorted(CAND, key=lambda x: -x[0])
    seen, picks = set(), []
    for sc, exp, sig in pool:
        key = (exp['family'], exp['name'].split(' q')[0])
        if key in seen: continue
        seen.add(key); picks.append((sc, exp, sig))
        if len(picks) >= 12: break
    for sc, exp, sig in picks:
        res = []
        for (m, H, a, b) in EXITS:
            tr = run(sig, m, H, a, b); s = tv(tr)
            res.append((s['t'] if s['n'] >= 50 else -9, (m, H, a, b), tr))
        res.sort(key=lambda x: -x[0]); _, ex, tr = res[0]
        # parameter perturbation: the exit configs adjacent to the chosen one (same mode) -> share positive OOS
        neigh = [x for x in res if x[1][0] == ex[0] and x[1] != ex and sum(1 for i in (1, 2, 3) if x[1][i] != ex[i]) == 1]
        nshare = float(np.mean([stats(x[2], B, T)['net'] > 0 for x in neigh])) if neigh else 0.0
        rb = robust(P, tr, exp['name'])
        # dynamic exits: best exit per regime (chosen on TRAIN+VALIDATION), combined
        dyn = []
        for rg in range(6):
            best_r = None
            for (m, H, a, b) in EXITS[::3]:
                trr = run(sig, m, H, a, b); reg = R[trr[:, 0].astype(int), (trr[:, 1] - 1).astype(int)]; sub = trr[reg == rg]
                s = stats(sub, 0, B)
                if s['n'] >= 30 and (best_r is None or s['t'] > best_r[0]): best_r = (s['t'], sub)
            if best_r and best_r[0] > 0: dyn.append(best_r[1])
        dyn_tr = np.concatenate(dyn) if dyn else np.zeros((0, 7))
        # filters, chosen on TRAIN+VALIDATION (must keep >= 50% of trades)
        fres = {}
        for fn, mask in FILTERS.items():
            trf = run(np.where(mask, sig, 0).astype(np.int8), *ex)
            s = tv(trf); fres[fn] = (s, stats(trf, B, T))
        base_tv = tv(tr)
        good = [(fn, v) for fn, v in fres.items() if v[0]['n'] >= 0.5 * base_tv['n'] and v[0]['t'] > base_tv['t']]
        bestf = max(good, key=lambda x: x[1][0]['t']) if good else None
        exp2 = dict(family='stage2', name=exp['name'], src=exp['family'], dir=exp['dir'], exit=dict(mode=ex[0], H=ex[1], a=ex[2], b=ex[3]),
                    trainval=sd(base_tv), robust=rb, neighbours_pos=nshare, accepted=accept(rb, nshare),
                    dynamic=dict(trainval=sd(stats(dyn_tr, 0, B)), oos=sd(stats(dyn_tr, B, T))),
                    filter=(dict(name=bestf[0], trainval=sd(bestf[1][0]), oos=sd(bestf[1][1])) if bestf else None), verdict='ACCEPTED' if accept(rb, nshare) else 'rejected')
        record(ROWS, exp2)
        print('stage2', exp['family'], exp['name'], exp2['verdict'], round(rb['oos']['net'], 1), flush=True)

SECTIONS = dict(screen=sec_screen, xs=sec_xs, liq=sec_liq, sweep=sec_sweep, tod=sec_tod, lag=sec_lag, regime=sec_regime, score=sec_score, ml=sec_ml, stage2=sec_stage2)
if __name__ == '__main__':
    for s in (sys.argv[1:] or list(SECTIONS)):
        SECTIONS[s]()
    print('done', len(ROWS), flush=True)
