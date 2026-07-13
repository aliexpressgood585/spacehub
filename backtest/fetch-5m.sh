#!/usr/bin/env bash
# Download 12 months of 5m USDT-M futures klines from Binance's archive.
# Top-10 coins only — 5m files are large (~2MB/month/coin), 10×12=120 downloads.
set -uo pipefail

COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT"
MONTHS=${BT_MONTHS:-12}
OUT=backtest/data
BASE="https://data.binance.vision/data/futures/um/monthly/klines"
mkdir -p "$OUT"

months=()
for i in $(seq 1 "$MONTHS"); do
  months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)")
done

dl() {
  local sym=$1 m=$2
  local url="$BASE/${sym}USDT/5m/${sym}USDT-5m-${m}.zip"
  local tmp="/tmp/${sym}-5m-${m}.zip"
  curl -s -f -m 120 -o "$tmp" "$url" 2>/dev/null || return 0
  unzip -p "$tmp" 2>/dev/null | grep '^[0-9]' > "$OUT/${sym}-5m.part-${m}" 2>/dev/null
  rm -f "$tmp"
}
export -f dl
export BASE OUT

jobs=/tmp/5m_jobs.txt; : > "$jobs"
for sym in $COINS; do
  for m in "${months[@]}"; do echo "$sym $m" >> "$jobs"; done
done

echo "Downloading $(wc -l < "$jobs") 5m monthly files (parallel, 8 workers) ..."
xargs -P 8 -n 2 bash -c 'dl "$@"' _ < "$jobs"

for sym in $COINS; do
  out="$OUT/${sym}-5m.csv"; : > "$out"
  parts=$(ls "$OUT/${sym}-5m.part-"* 2>/dev/null | sort)
  for p in $parts; do cat "$p" >> "$out"; rm -f "$p"; done
  n=$(wc -l < "$out")
  echo "  ${sym}-5m: ${n} bars"
done
echo "5m fetch done."
