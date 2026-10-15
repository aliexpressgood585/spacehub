"""Download Binance USDⓈ-M Futures history for the backtest from the public archive (data.binance.vision).

1m klines (every other timeframe is aggregated from them, exactly like the exchange does) + funding rates.
No API key is needed. Output: data/<SYM>-1m.npz and data/<SYM>-funding.csv.

    python scripts/fetch_history.py --months 24            # coins from config.yaml
    python scripts/fetch_history.py --months 24 --coins BTC ETH
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import io
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from daybot.config import load_config  # noqa: E402

BASE = "https://data.binance.vision/data/futures/um/monthly"


def months_back(n: int) -> list[str]:
    """The n most recent COMPLETE calendar months, oldest first."""
    d = date.today().replace(day=1)
    out = []
    for _ in range(n):
        y, m = (d.year, d.month - 1) if d.month > 1 else (d.year - 1, 12)
        d = date(y, m, 1)
        out.append(f"{y:04d}-{m:02d}")
    return out[::-1]


def get(url: str) -> bytes | None:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:  # network blip -> retry
            pass
    raise RuntimeError(f"download failed: {url}")


def read_zip_csv(blob: bytes) -> list[list[str]]:
    z = zipfile.ZipFile(io.BytesIO(blob))
    rows = list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]))))
    return [r for r in rows if r and r[0][:1].isdigit()]  # drop the header line (newer files have one)


def fetch_symbol(sym: str, months: list[str], out: Path) -> str:
    pair = f"{sym}USDT"
    urls = [f"{BASE}/klines/{pair}/1m/{pair}-1m-{m}.zip" for m in months]
    with cf.ThreadPoolExecutor(8) as ex:
        blobs = list(ex.map(get, urls))
    rows = [r for b in blobs if b for r in read_zip_csv(b)]
    if not rows:
        return f"{sym}: no data"
    a = np.array([[float(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[7])] for r in rows])
    a = a[np.argsort(a[:, 0], kind="stable")]
    a = a[np.concatenate([[True], np.diff(a[:, 0]) > 0])]
    # columns: open time (ms), open, high, low, close, quote volume (USDT)
    np.savez_compressed(out / f"{sym}-1m.npz", t=a[:, 0].astype(np.int64), o=a[:, 1], h=a[:, 2], l=a[:, 3], c=a[:, 4], v=a[:, 5])
    furls = [f"{BASE}/fundingRate/{pair}/{pair}-fundingRate-{m}.zip" for m in months]
    with cf.ThreadPoolExecutor(8) as ex:
        fblobs = list(ex.map(get, furls))
    with open(out / f"{sym}-funding.csv", "w", newline="") as f:
        w = csv.writer(f)
        for b in fblobs:
            if b:
                for r in read_zip_csv(b):
                    w.writerow([r[0], r[2]])  # calc_time (ms), funding rate
    missing = sum(b is None for b in blobs)
    return f"{sym}: {len(a):,} 1m bars, {months[0]}..{months[-1]}, missing months {missing}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=24)
    ap.add_argument("--coins", nargs="*")
    ap.add_argument("--out", default=str(ROOT / "data"))
    a = ap.parse_args()
    coins = a.coins or load_config(ROOT / "config.yaml").universe
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    months = months_back(a.months)
    for s in coins:
        print(fetch_symbol(s, months, out), flush=True)


if __name__ == "__main__":
    main()
