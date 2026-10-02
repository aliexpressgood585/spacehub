"""v121 quant lab — build the 5-minute panel: every coin in backtest/data/m1 on ONE common UTC grid
(2025-09-01 .. 2026-08-31), plus the Binance futures metrics archive (5-min open interest, top-trader and global
long/short ratios, taker buy/sell volume ratio) and settled funding.
Causality: a metrics row stamped T is a snapshot taken at T; it is attached to the bar that CLOSES at T and then
lagged one more bar (published-with-delay safety). Funding = the last settled rate, known at settlement time.
Output: backtest/data/panel5m.npz (float32 [coins, T])."""
import os, glob, numpy as np, pandas as pd
D = '/home/user/spacehub/backtest/data'
MAJORS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'SUI']
T0 = 1756684800000
T1 = 1788220800000
STEP = 300_000
grid = np.arange(T0, T1, STEP, dtype=np.int64)
coins = sorted(os.path.basename(f)[:-7] for f in glob.glob(f'{D}/m1/*-1m.csv') if os.path.getsize(f) > 0)
coins = MAJORS + [c for c in coins if c not in MAJORS]
C, T = len(coins), len(grid)
F = {k: np.full((C, T), np.nan, np.float32) for k in ['o', 'h', 'l', 'c', 'v', 'tb', 'qv', 'oi', 'tls', 'lsr', 'tkr', 'fund']}
for ci, c in enumerate(coins):
    m = pd.read_csv(f'{D}/m1/{c}-1m.csv', header=None, usecols=[0, 1, 2, 3, 4, 5, 7, 9], names=['t', 'o', 'h', 'l', 'c', 'v', 'qv', 'tb'])
    m['b'] = m.t - m.t % STEP
    a = m.groupby('b').agg(o=('o', 'first'), h=('h', 'max'), l=('l', 'min'), c=('c', 'last'), v=('v', 'sum'), qv=('qv', 'sum'), tb=('tb', 'sum'))
    idx = ((a.index.values - T0) // STEP).astype(np.int64); ok = (idx >= 0) & (idx < T)
    for k in ['o', 'h', 'l', 'c', 'v', 'tb', 'qv']: F[k][ci, idx[ok]] = a[k].values[ok]
    fm = f'{D}/aux12/{c}-m.csv'
    if os.path.exists(fm) and os.path.getsize(fm) > 0:
        x = pd.read_csv(fm, header=None, names=['ts', 's', 'oi', 'oiv', 'ctls', 'tls', 'lsr', 'tkr'])
        ts = pd.to_datetime(x.ts, utc=True).dt.tz_localize(None).values.astype('datetime64[ms]').astype(np.int64)
        bi = ((ts - T0) // STEP).astype(np.int64)          # snapshot at T -> bar that closes at T is bi-1; +1 bar lag -> bi
        ok = (bi >= 0) & (bi < T)
        for k in ['oi', 'tls', 'lsr', 'tkr']: F[k][ci, bi[ok]] = x[k].values[ok]
    ff = f'{D}/aux12/{c}-f.csv'
    if os.path.exists(ff) and os.path.getsize(ff) > 0:
        x = pd.read_csv(ff, header=None, names=['t', 'iv', 'r'])
        bi = ((x.t.values - T0) // STEP).astype(np.int64) + 1; ok = (bi >= 0) & (bi < T)
        F['fund'][ci, bi[ok]] = x.r.values[ok]
    print(c, int(np.isfinite(F['c'][ci]).sum()), int(np.isfinite(F['oi'][ci]).sum()), flush=True)
# forward-fill the snapshot series (metrics, funding) so a missing row = last known value; prices are NOT filled
for k in ['oi', 'tls', 'lsr', 'tkr', 'fund']:
    df = pd.DataFrame(F[k].T).ffill(); F[k] = df.values.T.astype(np.float32)
np.savez(f'{D}/panel5m.npz', coins=np.array(coins), grid=grid, majors=np.array([c in MAJORS for c in coins]), **F)
print('panel', C, T)
