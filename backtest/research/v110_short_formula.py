"""v110bt — "find the short-term formula" (owner, 2026-09-30).

Pre-registered rules, written BEFORE any result was read:
  * cost: 16 bps per round trip (taker 5 bps x2 + slippage 3 bps x2) on every trade;
  * split: in-sample (IS) = first 70% of each series' time span, out-of-sample (OOS) = last 30%;
  * a variant is chosen on IS only; OOS is read once and is the verdict;
  * t-statistics are on DAILY sums (trades on the same day are not independent);
  * PASS = OOS net > 0 and OOS t(daily) >= 2, with IS net > 0 as well.
  * the number of variants tried ("looks") is printed so a pass can be read against luck.

Families (all intraday, holds <= 24h):
  A. Bitcoin/ETH intraday time-series momentum (Gao et al. style): the first part of a
     session predicts the last part of the same session.
  B. Hour-of-day seasonality: long/short only in the hours that were best on IS.
  C. Cross-market lead-lag from US markets (Nasdaq-100, S&P 500, dollar index, gold, VIX,
     10y yield): the last US hour / US day predicts crypto's next hours.
Data: backtest/data/*-5m.csv and *-1h.csv (Binance USDT-M archive), Yahoo hourly/daily.
"""
import json, glob, os, sys, math
import numpy as np, pandas as pd

COST = 0.0016
DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
XM = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/xm'
LOOKS = 0
OUT = []

def load(sym, tf):
    df = pd.read_csv(f'{DATA}/{sym}-{tf}.csv', header=None, usecols=[0, 1, 4])
    df.columns = ['t', 'o', 'c']
    df['t'] = pd.to_datetime(df['t'], unit='ms', utc=True)
    return df.set_index('t')

def stats(tr):
    """tr: DataFrame with columns t (entry time), r (gross return, signed)."""
    if len(tr) == 0: return dict(n=0, gross=0, net=0, t=0, days=0)
    net = tr['r'] - COST
    d = net.groupby(tr['t'].dt.floor('D')).sum()
    tt = d.mean() / (d.std(ddof=1) / math.sqrt(len(d))) if len(d) > 2 and d.std() > 0 else 0
    return dict(n=len(tr), gross=tr['r'].mean() * 1e4, net=net.mean() * 1e4, t=tt, days=len(d), tot=net.sum() * 100)

def split(tr, t0, t1):
    cut = t0 + (t1 - t0) * 0.7
    return tr[tr['t'] < cut], tr[tr['t'] >= cut]

def report(fam, name, tr, t0, t1, chosen=False):
    global LOOKS
    LOOKS += 1
    a, b = split(tr, t0, t1)
    si, so = stats(a), stats(b)
    OUT.append(dict(fam=fam, name=name, IS=si, OOS=so, chosen=chosen))
    return si, so

def fmt(s): return f"n={s['n']:5d} gross={s['gross']:+7.1f} net={s['net']:+7.1f}bps t={s['t']:+5.2f} tot={s.get('tot',0):+7.1f}%"

# ---------- A. intraday time-series momentum ----------
def fam_A():
    for sym in ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']:
        px = load(sym, '5m')
        t0, t1 = px.index[0], px.index[-1]
        # sessions: (name, session start hour UTC, predictor minutes, holding window start/end offsets in minutes)
        for sname, h0, length in [('utc_day', 0, 24 * 60), ('us_session', 13.5, 390)]:
            for pred_m, hold_m in [(30, 30), (60, 60), (60, 30)]:
                recs = []
                days = pd.date_range(t0.normalize(), t1.normalize(), freq='D', tz='UTC')
                c = px['c']
                for d in days:
                    if sname == 'us_session' and d.weekday() >= 5: continue
                    s = d + pd.Timedelta(minutes=h0 * 60)
                    e = s + pd.Timedelta(minutes=length)
                    try:
                        p0 = c.asof(s); p1 = c.asof(s + pd.Timedelta(minutes=pred_m))
                        q0 = c.asof(e - pd.Timedelta(minutes=hold_m)); q1 = c.asof(e)
                    except Exception: continue
                    if not all(np.isfinite([p0, p1, q0, q1])) or p0 <= 0: continue
                    sig = np.sign(p1 / p0 - 1)
                    if sig == 0: continue
                    recs.append((e - pd.Timedelta(minutes=hold_m), sig * (q1 / q0 - 1)))
                tr = pd.DataFrame(recs, columns=['t', 'r'])
                report('A', f'{sym} {sname} first{pred_m}->last{hold_m}', tr, t0, t1)

# ---------- B. hour-of-day seasonality ----------
def fam_B():
    for sym in ['BTC', 'ETH']:
        px = load(sym, '1h')
        r = px['c'].pct_change().shift(-1).dropna()   # return of the NEXT hour, entered at this bar's close
        t0, t1 = r.index[0], r.index[-1]
        cut = t0 + (t1 - t0) * 0.7
        ris = r[r.index < cut]
        mean_h = ris.groupby(ris.index.hour).mean()
        for k in [1, 2, 3]:
            best = list(mean_h.sort_values().index[-k:]); worst = list(mean_h.sort_values().index[:k])
            sel = r[r.index.hour.isin(best)]
            report('B', f'{sym} long best{k} hours {best}', pd.DataFrame({'t': sel.index, 'r': sel.values}), t0, t1)
            sel2 = r[r.index.hour.isin(worst)]
            report('B', f'{sym} short worst{k} hours {worst}', pd.DataFrame({'t': sel2.index, 'r': -sel2.values}), t0, t1)

# ---------- C. cross-market lead-lag ----------
def yahoo(name, tf):
    d = json.load(open(f'{XM}/{name}-{tf}.json'))['chart']['result'][0]
    s = pd.Series(d['indicators']['quote'][0]['close'], index=pd.to_datetime(d['timestamp'], unit='s', utc=True)).dropna()
    return s[~s.index.duplicated()]

def fam_C():
    btc1h = load('BTC', '1h')['c']
    eth1h = load('ETH', '1h')['c']
    for mkt in ['NDX', 'SPX', 'DXY', 'GOLD', 'VIX', 'TNX']:
        # C1 daily: the market's day return (close-to-close, stamped at its bar time) -> crypto next 24h from 21:00 UTC
        d = yahoo(mkt, '1d')
        dr = d.pct_change().dropna()
        for coin, px in [('BTC', btc1h), ('ETH', eth1h)]:
            for thr in [0.0, 0.01]:
                recs = []
                for ts, v in dr.items():
                    if abs(v) < thr or not np.isfinite(v): continue
                    ent = ts.normalize() + pd.Timedelta(hours=21)
                    a = px.asof(ent); b = px.asof(ent + pd.Timedelta(hours=24))
                    if not (np.isfinite(a) and np.isfinite(b)) or ent + pd.Timedelta(hours=24) > px.index[-1] or ent < px.index[0]: continue
                    sgn = np.sign(v) * (-1 if mkt in ('DXY', 'VIX', 'TNX') else 1)   # risk-on direction
                    recs.append((ent, sgn * (b / a - 1)))
                tr = pd.DataFrame(recs, columns=['t', 'r'])
                if len(tr) < 50: continue
                t0, t1 = tr['t'].min(), tr['t'].max()
                report('C', f'{mkt} day move>={thr:.0%} -> {coin} next 24h (follow risk-on)', tr, t0, t1)
                report('C', f'{mkt} day move>={thr:.0%} -> {coin} next 24h (FADE)', tr.assign(r=-tr['r']), t0, t1)
        # C2 hourly: the market's last hourly return -> crypto next 1h / 4h
        h = yahoo(mkt, '1h')
        hr = h.pct_change().dropna()
        for coin, px in [('BTC', btc1h)]:
            for hold in [1, 4]:
                for thr_sd in [0, 2]:
                    sd = hr.std()
                    recs = []
                    for ts, v in hr.items():
                        if abs(v) < thr_sd * sd or not np.isfinite(v): continue
                        ent = ts + pd.Timedelta(hours=1)     # bar stamped at its open; act after it closes
                        a = px.asof(ent); b = px.asof(ent + pd.Timedelta(hours=hold))
                        if not (np.isfinite(a) and np.isfinite(b)) or ent + pd.Timedelta(hours=hold) > px.index[-1]: continue
                        sgn = np.sign(v) * (-1 if mkt in ('DXY', 'VIX', 'TNX') else 1)
                        recs.append((ent, sgn * (b / a - 1)))
                    tr = pd.DataFrame(recs, columns=['t', 'r'])
                    if len(tr) < 50: continue
                    t0, t1 = tr['t'].min(), tr['t'].max()
                    report('C', f'{mkt} 1h move>={thr_sd}sd -> {coin} next {hold}h (follow)', tr, t0, t1)
                    report('C', f'{mkt} 1h move>={thr_sd}sd -> {coin} next {hold}h (FADE)', tr.assign(r=-tr['r']), t0, t1)

if __name__ == '__main__':
    fam_A(); fam_B(); fam_C()
    print(f'v110bt — {LOOKS} variants tried (looks). Cost {COST*1e4:.0f} bps/round trip. IS=first 70%, OOS=last 30%.')
    print(f'Luck alone: at OOS t>=2 expect ~{LOOKS*0.023:.1f} false passes among {LOOKS} looks.\n')
    for fam in 'ABC':
        rows = [x for x in OUT if x['fam'] == fam]
        print(f'== family {fam}: {len(rows)} variants')
        for x in sorted(rows, key=lambda x: -x['IS']['net'])[:12]:
            print(f"  {x['name'][:58]:58s}\n     IS  {fmt(x['IS'])}\n     OOS {fmt(x['OOS'])}")
    passes = [x for x in OUT if x['IS']['net'] > 0 and x['OOS']['net'] > 0 and x['OOS']['t'] >= 2 and x['OOS']['n'] >= 30]
    print(f'\nPASS (IS net>0, OOS net>0, OOS t>=2, n>=30): {len(passes)}')
    for x in passes: print(f"  {x['name']}\n     IS  {fmt(x['IS'])}\n     OOS {fmt(x['OOS'])}")
    json.dump(OUT, open('/tmp/claude-0/v110.json', 'w'), default=float)
