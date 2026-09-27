"""COUNT-ONLY progress of the pre-registered hypotheses (quant/PREREGISTRATION.md). It never fetches prices, never
computes returns or P&L: before a hypothesis has 200 trades, its count is the only thing anyone may look at.

    python -m quant.forward.status          -> prints counts, writes quant/reports/forward-status.json

Counts are EVENT counts, an upper bound on closed trades (the per-coin rate limits and H4's price condition can only
remove events). A hypothesis is READY when its event count reaches 200; the evaluation then computes the exact trade
count and, only if that is >= 200 too, the result.
H1 uses the Binance monthly funding archive for complete months and, for the running month, the collector's
last funding snapshot before each settlement (labelled estimate).
"""
from __future__ import annotations

import datetime as dt
import io
import json
import re
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
T0 = pd.Timestamp("2026-09-28T00:00:00Z")
PINNED10 = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT"]
READY = 200


def _anon():
    s = (ROOT / "trading-app/src/supa.ts").read_text()
    url = re.search(r"https://[a-z0-9]+\.supabase\.co", s).group(0)
    key = re.search(r"SUPA_KEY[^\n]*'(eyJ[^']+)'", s).group(1)          # the public anon key (read-only by RLS)
    return url, key


def q(ts) -> str:
    return urllib.parse.quote(pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ"))


def rest(table: str, query: str) -> list[dict]:
    url, key = _anon()
    out, a = [], 0
    while True:
        req = urllib.request.Request(f"{url}/rest/v1/{table}?{query}", headers={"apikey": key, "Authorization": f"Bearer {key}",
                                                                               "Range": f"{a}-{a + 999}"})
        rows = json.loads(urllib.request.urlopen(req, timeout=60).read())
        out += rows
        if len(rows) < 1000:
            return out
        a += 1000


def h1_funding(now: pd.Timestamp) -> dict:
    coins = [p.name.split("-funding")[0] for p in sorted((ROOT / "backtest/data").glob("*-funding.csv"))]
    n_arch, n_est, months = 0, 0, []
    m = T0.tz_localize(None).to_period("M")
    while m.end_time.tz_localize("UTC") < now:
        months.append(m)
        m += 1
    for c in coins:
        for m in months:
            u = f"https://data.binance.vision/data/futures/um/monthly/fundingRate/{c}USDT/{c}USDT-fundingRate-{m}.zip"
            try:
                z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(u, timeout=60).read()))
                df = pd.read_csv(z.open(z.namelist()[0]))
                t = pd.to_datetime(df.iloc[:, 0], unit="ms", utc=True)
                r = df.iloc[:, 2].astype(float)
                n_arch += int(((t >= T0) & (r.abs() >= 0.001)).sum())
            except Exception:
                pass
    start = (months[-1] + 1).start_time.tz_localize("UTC") if months else T0
    rows = rest("mkt_derivs", f"select=ts,symbol,funding&ts=gte.{q(start)}&order=ts.asc")
    if rows:
        d = pd.DataFrame(rows)
        d["ts"] = pd.to_datetime(d["ts"], utc=True)
        # last snapshot strictly before each 00/08/16 UTC settlement
        d["settle"] = (d["ts"] + pd.Timedelta(minutes=1)).dt.ceil("8h")
        last = d.sort_values("ts").groupby(["symbol", "settle"]).tail(1)
        last = last[(last["settle"] <= now) & (last["settle"] >= T0)]
        n_est = int((last["funding"].abs() >= 0.001).sum())
    return {"events": n_arch + n_est, "from_archive": n_arch, "estimated_running_month": n_est}


def h2_liq(now) -> dict:
    rows = rest("mkt_liq_15m", f"select=bucket,symbol,side,usd&source=eq.okx&bucket=gte.{q(T0 - pd.Timedelta(days=7))}")
    if not rows:
        return {"events": 0}
    d = pd.DataFrame(rows)
    d["bucket"] = pd.to_datetime(d["bucket"], utc=True)
    d = d[d["symbol"].isin(PINNED10)].sort_values("bucket")
    n = 0
    for (sym, side), g in d.groupby(["symbol", "side"]):
        last_ev = None
        for t, usd in zip(g["bucket"], g["usd"]):
            if t < T0 + pd.Timedelta(days=7) - pd.Timedelta(minutes=15) or t + pd.Timedelta(minutes=15) > now:
                continue
            prior = g[(g["bucket"] < t) & (g["bucket"] >= t - pd.Timedelta(days=7)) & (g["usd"] > 0)]["usd"]
            if len(prior) and usd >= max(250_000, 5 * float(prior.median())):
                if last_ev is None or t >= last_ev + pd.Timedelta(hours=4):
                    n += 1
                    last_ev = t
    return {"events": n, "note": "rate limit applied per coin x side (4h); the evaluation applies it per coin"}


def h3_options(now) -> dict:
    rows = rest("mkt_options", "select=ts,currency,skew10&order=ts.asc")
    if not rows:
        return {"events": 0}
    d = pd.DataFrame(rows)
    d["ts"] = pd.to_datetime(d["ts"], utc=True)
    d = d[(d["ts"].dt.hour == 0) & (d["ts"].dt.minute == 0)]
    n = 0
    for cur, g in d.groupby("currency"):
        s = g.set_index("ts")["skew10"].astype(float)
        for i in range(30, len(s)):
            if s.index[i] < T0:
                continue
            p = s.iloc[i - 30:i]
            if p.std() > 0 and abs((s.iloc[i] - p.mean()) / p.std()) >= 1.5:
                n += 1
    return {"events": n}


def h4_news(now) -> dict:
    rows = rest("mkt_news", f"select=published_at,coins&published_at=gte.{q(T0)}")
    n = sum(1 for r in rows for c in (r.get("coins") or []) if c in PINNED10)
    return {"events": n, "note": "UPPER BOUND: coin-tagged items; the >= 1% 60-minute move condition needs prices and is applied only at evaluation"}


T0_H5 = T0   # PREREGISTRATION_H5.md


def _kl_1h_daily(sym: str, day: pd.Timestamp) -> pd.DataFrame | None:
    url = f"https://data.binance.vision/data/futures/um/daily/klines/{sym}USDT/1h/{sym}USDT-1h-{day:%Y-%m-%d}.zip"
    try:
        raw = urllib.request.urlopen(url, timeout=20).read()
    except Exception:
        return None
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        df = pd.read_csv(z.open(z.namelist()[0]), header=None, usecols=[0, 2, 3, 4], names=["t", "h", "l", "c"], on_bad_lines="skip")
    return df[pd.to_numeric(df["t"], errors="coerce").notna()].astype(float)


def h5_donchian(now) -> dict:
    """COUNT of H5 closed trades after T0 (no prices or P&L reported): the frozen rule replayed on the daily 1h archive."""
    N, M, CAP, K = 168, 84, 672, 3.0
    days = pd.date_range((T0_H5 - pd.Timedelta(days=9)).normalize(), (now - pd.Timedelta(days=1)).normalize(), freq="D")
    closed, missing = 0, 0
    for sym in PINNED10:
        parts = [d for d in (_kl_1h_daily(sym, day) for day in days) if d is not None]
        missing += len(days) - len(parts)
        if not parts:
            continue
        b = pd.concat(parts).drop_duplicates("t").sort_values("t").reset_index(drop=True)
        h, l, c, t = b["h"].to_numpy(), b["l"].to_numpy(), b["c"].to_numpy(), b["t"].to_numpy()
        tr = np.maximum(h[1:] - l[1:], np.maximum(abs(h[1:] - c[:-1]), abs(l[1:] - c[:-1])))
        atr = pd.Series(np.concatenate([[np.nan], tr])).ewm(alpha=1 / 14, adjust=False).mean().to_numpy()
        pos, i = None, N
        while i < len(c) - 1:
            if pos is None:
                hh, ll = h[i - N:i].max(), l[i - N:i].min()
                d = 1 if c[i] > hh else -1 if c[i] < ll else 0
                if d and t[i] >= T0_H5.value // 10**6 and np.isfinite(atr[i]):
                    pos = (d, c[i] - d * K * atr[i], i + 1)
                i += 1
                continue
            d, stop, j = pos
            if (l[i] <= stop if d > 0 else h[i] >= stop) or i - j >= CAP - 1 or \
               (c[i] < l[i - M:i].min() if d > 0 else c[i] > h[i - M:i].max()):
                closed += 1
                pos = None
            i += 1
    return {"events": closed, "missing_daily_files": missing}


def main():
    now = pd.Timestamp.now(tz="UTC")
    out = {"checked_utc": now.isoformat(timespec="seconds"), "T0": T0.isoformat(), "ready_at": READY}
    if now < T0:
        out["note"] = "forward window has not started"
    for k, f in (("H1_funding", h1_funding), ("H2_liquidation_fade", h2_liq), ("H3_options_skew", h3_options), ("H4_news_momentum", h4_news), ("H5_donchian_1h", h5_donchian)):
        try:
            out[k] = f(now) if now >= T0 else {"events": 0}
        except Exception as e:
            out[k] = {"events": None, "error": str(e)[:200]}
    out["ready"] = [k for k in ("H1_funding", "H2_liquidation_fade", "H3_options_skew", "H4_news_momentum")   # H5 failed validation: counted, never ready
                    if (out[k].get("events") or 0) >= READY]
    (ROOT / "quant/reports/forward-status.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
