"""v121 quant lab — shared core: panel loading, causal features, numba trade simulator, statistics, experiment DB.
Splits (fixed before any result was read): TRAIN = first 50% of the 12 months, VALIDATION = next 20%, OUT-OF-SAMPLE = last 30%.
Costs per side: taker 5 bps + slippage 2 bps (majors) / 5 bps (others); funding = side x last settled rate x hours/8.
Entry at the NEXT bar's open after the signal bar closes (5 minutes of latency at minimum)."""
import json, os, time, numpy as np, pandas as pd
from numba import njit
D = '/home/user/spacehub/backtest/data'
HERE = os.path.dirname(os.path.abspath(__file__))
DB = f'{HERE}/experiments.jsonl'
SPLITS = (0.5, 0.7)

def load():
    z = np.load(f'{D}/panel5m.npz')
    P = {k: z[k] for k in z.files}
    C, T = P['c'].shape
    P['C'], P['T'] = C, T
    P['cost'] = np.where(P['majors'], 2 * (0.0005 + 0.0002), 2 * (0.0005 + 0.0005)).astype(np.float64)
    P['split'] = (int(T * SPLITS[0]), int(T * SPLITS[1]))
    return P

def roll(x, w, fn='mean', minp=None):
    df = pd.DataFrame(x.T)
    r = getattr(df.rolling(w, min_periods=minp or w), fn)()
    return r.values.T.astype(np.float32)

def ema(x, p):
    return pd.DataFrame(x.T).ewm(span=p, adjust=False).mean().values.T.astype(np.float32)

def shift(x, k):
    y = np.full_like(x, np.nan)
    if k > 0: y[:, k:] = x[:, :-k]
    else: y[:, :k] = x[:, -k:]
    return y

def base_features(P):
    o, h, l, c, v, tb = P['o'], P['h'], P['l'], P['c'], P['v'], P['tb']
    pc = shift(c, 1)
    tr = np.fmax(h - l, np.fmax(np.abs(h - pc), np.abs(l - pc)))
    X = {}
    X['atr'] = ema(tr, 27)                         # ~Wilder 14
    X['atr100'] = roll(tr, 100)
    lr = np.log(c / pc)
    X['lr'] = lr
    X['vol288'] = roll(lr, 288, 'std')
    for k in (1, 3, 12, 48, 288):
        X[f'r{k}'] = (np.log(c / shift(c, k)) / (X['vol288'] * np.sqrt(k))).astype(np.float32)     # vol-normalised return
    X['accel'] = X['r3'] - X['r12']
    X['e20'], X['e50'], X['e200'] = ema(c, 20), ema(c, 50), ema(c, 200)
    X['d50'] = (c - X['e50']) / X['atr']
    X['d200'] = (c - X['e200']) / X['atr']
    m20, s20 = roll(c, 20), roll(c, 20, 'std')
    X['bbz'] = (c - m20) / s20
    X['bbw'] = 4 * s20 / m20
    X['bbwp'] = roll(X['bbw'], 288 * 3, 'rank', 288) / (288 * 3)
    hi48, lo48 = shift(roll(h, 48, 'max'), 1), shift(roll(l, 48, 'min'), 1)
    hi288, lo288 = shift(roll(h, 288, 'max'), 1), shift(roll(l, 288, 'min'), 1)
    X['hi48'], X['lo48'], X['hi288'], X['lo288'] = hi48, lo48, hi288, lo288
    X['donpos'] = (c - lo48) / (hi48 - lo48)
    vprev = shift(roll(v, 48), 1)
    X['rvol'] = v / vprev
    X['vtrend'] = roll(v, 12) / roll(v, 96)
    X['spike'] = np.log(c / o) / X['atr'] * 0 + (c - o) / X['atr']          # bar body in ATR
    X['exmove'] = np.log(c / pc) / (X['atr'] / c)                          # bar return in ATR units
    X['atrr'] = X['atr'] / X['atr100'] if False else ema(tr, 27) / roll(tr, 288)   # compression (<1) / expansion (>1)
    imb = (2 * tb - v) / v
    X['cvd3'] = roll(np.nan_to_num(2 * tb - v), 3, 'sum') / roll(v, 3, 'sum')
    X['cvd12'] = roll(np.nan_to_num(2 * tb - v), 12, 'sum') / roll(v, 12, 'sum')
    X['imb'] = imb
    # session VWAP (UTC day)
    day = (P['grid'] // 86_400_000)
    tp = (h + l + c) / 3
    pv = pd.DataFrame((tp * v).T); vv = pd.DataFrame(v.T); g = pd.Series(day)
    X['vwap'] = (pv.groupby(g.values).cumsum() / vv.groupby(g.values).cumsum()).values.T.astype(np.float32)
    X['dvwap'] = (c - X['vwap']) / X['atr']
    X['rpct'] = roll(X['r12'], 288 * 3, 'rank', 288) / (288 * 3)
    # rolling lag-1 autocorrelation of 5m returns over one day (momentum persistence vs reversal)
    lr0 = np.nan_to_num(lr); lr1 = shift(lr0, 1)
    num = roll(lr0 * lr1, 288, 'mean') - roll(lr0, 288) * roll(lr1, 288)
    X['ac1'] = num / (roll(lr0, 288, 'std') * roll(lr1, 288, 'std'))
    # ADX(14) approx via EMA
    up, dn = h - shift(h, 1), shift(l, 1) - l
    pdm = np.where((up > dn) & (up > 0), up, 0).astype(np.float32); ndm = np.where((dn > up) & (dn > 0), dn, 0).astype(np.float32)
    atr_s = ema(tr, 27)
    pdi, ndi = 100 * ema(pdm, 27) / atr_s, 100 * ema(ndm, 27) / atr_s
    X['adx'] = ema(100 * np.abs(pdi - ndi) / (pdi + ndi), 27)
    # microstructure (metrics archive, already lagged one bar in the panel)
    oi = P['oi']
    X['oi1'] = np.log(oi / shift(oi, 1)); X['oi3'] = np.log(oi / shift(oi, 3)); X['oi12'] = np.log(oi / shift(oi, 12)); X['oi48'] = np.log(oi / shift(oi, 48))
    for k in ('tls', 'lsr', 'tkr'):
        x = np.log(P[k]); X[f'{k}z'] = (x - roll(x, 288 * 7, 'mean', 288)) / roll(x, 288 * 7, 'std', 288)
    X['fund'] = P['fund']
    X['fundz'] = (P['fund'] - roll(P['fund'], 288 * 14, 'mean', 288)) / roll(P['fund'], 288 * 14, 'std', 288)
    X['hour'] = ((P['grid'] // 3_600_000) % 24).astype(np.int8)
    X['dow'] = (((P['grid'] // 86_400_000) + 3) % 7).astype(np.int8)          # 0 = Monday
    for k in X:
        if X[k].dtype == np.float32 or X[k].dtype == np.float64: X[k] = np.where(np.isfinite(X[k]), X[k], np.nan).astype(np.float32)
    return X

# ---------------- trade simulator ----------------
# mode 0 time exit H bars; 1 bracket TP=a*atr SL=b*atr timeout H; 2 trail SL=b*atr chandelier a*atr timeout H;
# 3 bracket + breakeven after +1 atr; 4 partial: half at a*atr then trail b*atr on the rest; timeout H
@njit(cache=True)
def sim(sig, o, h, l, c, atr, fund, cost, mode, H, a, b, cool, maxn):
    C, T = sig.shape
    out = np.empty((maxn, 7))     # coin, entry bar, side, gross, net, bars held, exit bar
    n = 0
    for ci in range(C):
        busy = 0
        for i in range(T - 2):
            s = sig[ci, i]
            if s == 0 or i < busy: continue
            j = i + 1
            e = o[ci, j]; A = atr[ci, i]
            if not (e > 0) or not (A > 0): continue
            px = np.nan; k = j; maker_part = 0.0
            stop = e - s * b * A; tp = e + s * a * A; best = e; half = False; realized = 0.0
            end = min(T - 1, j + H - 1)
            for k in range(j, end + 1):
                if not (h[ci, k] > 0): continue
                if mode == 0:
                    continue
                adv = l[ci, k] if s > 0 else h[ci, k]
                fav = h[ci, k] if s > 0 else l[ci, k]
                if s * (adv - stop) <= 0:
                    px = o[ci, k] if s * (o[ci, k] - stop) <= 0 else stop
                    break
                if mode == 1 or mode == 3:
                    if s * (fav - tp) >= 0:
                        px = o[ci, k] if s * (o[ci, k] - tp) >= 0 else tp
                        break
                    if mode == 3 and s * (fav - (e + s * A)) >= 0 and s * (stop - e) < 0:
                        stop = e
                elif mode == 2 or mode == 4:
                    if mode == 4 and not half and s * (fav - tp) >= 0:
                        half = True; realized = 0.5 * s * (tp / e - 1)
                        if s * (stop - e) < 0: stop = e
                    if s > 0:
                        if h[ci, k] > best: best = h[ci, k]
                        tl = best - (b if mode == 4 else a) * atr[ci, k]
                        if tl > stop: stop = tl
                    else:
                        if l[ci, k] < best: best = l[ci, k]
                        tl = best + (b if mode == 4 else a) * atr[ci, k]
                        if tl < stop: stop = tl
            if np.isnan(px):
                k = end
                while k > j and not (c[ci, k] > 0): k -= 1
                px = c[ci, k]
            if not (px > 0): continue
            g = s * (px / e - 1)
            if mode == 4:
                g = realized + (0.5 if half else 1.0) * g
            hours = (k - j + 1) / 12.0
            f = fund[ci, i]
            fc = s * f * hours / 8.0 if f == f else 0.0
            out[n, 0] = ci; out[n, 1] = j; out[n, 2] = s; out[n, 3] = g; out[n, 4] = g - cost[ci] - fc; out[n, 5] = k - j + 1; out[n, 6] = k
            n += 1
            busy = k + 1 + cool
    return out[:n]

def stats(tr, lo=None, hi=None):
    """tr = sim output; lo/hi = entry-bar range. t on DAILY sums of net returns (all coins pooled)."""
    if lo is not None: tr = tr[(tr[:, 1] >= lo) & (tr[:, 1] < hi)]
    n = len(tr)
    if n == 0: return dict(n=0, g=0.0, net=0.0, t=0.0, pf=0.0, wr=0.0)
    net, g = tr[:, 4], tr[:, 3]
    day = (tr[:, 1] // 288).astype(np.int64)
    ds = np.bincount(day - day.min(), weights=net); ds = ds[np.bincount(day - day.min()) > 0]
    t = ds.mean() / ds.std(ddof=1) * np.sqrt(len(ds)) if len(ds) > 1 and ds.std(ddof=1) > 0 else 0.0
    w, ls = net[net > 0], net[net <= 0]
    eq = np.cumsum(ds); dd = float(np.max(np.maximum.accumulate(eq) - eq)) if len(eq) else 0.0
    sd = ds.std(ddof=1) if len(ds) > 1 else 0; dsd = np.sqrt(np.mean(np.minimum(ds, 0) ** 2)) if len(ds) else 0
    srt = np.sort(net); k = max(1, int(np.ceil(0.01 * n)))
    return dict(n=int(n), g=float(g.mean() * 1e4), net=float(net.mean() * 1e4), t=float(t),
                pf=float(w.sum() / -ls.sum()) if ls.sum() < 0 else 99.0, wr=float(len(w) / n),
                aw=float(w.mean() * 1e4) if len(w) else 0.0, al=float(-ls.mean() * 1e4) if len(ls) else 0.0,
                sh=float(ds.mean() / sd * np.sqrt(365)) if sd > 0 else 0.0, so=float(ds.mean() / dsd * np.sqrt(365)) if dsd > 0 else 0.0,
                dd=dd * 100, tot=float(net.sum() * 100), cal=float(net.sum() / max(1, len(ds)) * 365 / dd) if dd > 0 else 0.0,
                rm1=float(srt[:-k].mean() * 1e4) if n > k else 0.0, hold=float(tr[:, 5].mean()))

def splits(P, tr):
    a, b = P['split']; T = P['T']
    return stats(tr, 0, a), stats(tr, a, b), stats(tr, b, T)

def verdict(tr_s, va_s, oo_s, cost_bps):
    if tr_s['n'] < 30 or oo_s['n'] < 30: return 'too_few'
    if tr_s['net'] > 0 and va_s['net'] > 0 and oo_s['net'] > 0 and oo_s['t'] >= 2 and oo_s['pf'] > 1: return 'PASS_SCREEN'
    if abs(tr_s['g']) < 0.3 * cost_bps: return 'no_gross_edge'
    if tr_s['g'] > 0 and tr_s['net'] <= 0: return 'gross_below_cost'
    if tr_s['net'] > 0 and oo_s['g'] <= 0: return 'sign_flip'
    if tr_s['net'] > 0 and oo_s['net'] <= 0: return 'decay_oos'
    if tr_s['net'] > 0 and va_s['net'] <= 0: return 'fails_validation'
    return 'not_significant'

def record(rows, exp):
    exp['ts'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    rows.append(exp)
    with open(DB, 'a') as f: f.write(json.dumps(exp, default=float) + '\n')

def thresholds(F, a, q):
    """per-coin quantile thresholds from the TRAIN part only"""
    tr = F[:, :a]
    hi = np.nanquantile(tr, 1 - q, axis=1)[:, None]; lo = np.nanquantile(tr, q, axis=1)[:, None]
    return hi, lo

@njit(cache=True)
def barrier_labels(o, h, l, atr, tt, H, K):
    C = o.shape[0]; lab = np.full((C, len(tt)), -1, np.int8)
    for ci in range(C):
        for n_ in range(len(tt)):
            t = tt[n_]; e = o[ci, t + 1]; a_ = atr[ci, t]
            if not (e > 0 and a_ > 0): continue
            up = e + K * a_; dn = e - K * a_
            for k in range(t + 1, t + 1 + H):
                if l[ci, k] <= dn: lab[ci, n_] = 0; break
                if h[ci, k] >= up: lab[ci, n_] = 1; break
    return lab
