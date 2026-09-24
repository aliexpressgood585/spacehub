#!/usr/bin/env bash
# v85.1 gym: 1h USDT-M futures klines for the pinned 40-coin universe (aggregated to 4h/1d in
# backtest/gym.ts). Monthly archive zips, 40 x BT_MONTHS files, parallel.
set -uo pipefail

COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA PEPE WIF FET"
MONTHS=${BT_MONTHS:-36}
IV=1h
OUT=backtest/data
BASE="https://data.binance.vision/data/futures/um/monthly/klines"
mkdir -p "$OUT"

months=()
for i in $(seq 1 "$MONTHS"); do
  months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)")
done

dl() {
  local sym=$1 m=$2
  local bsym="${sym}USDT"; [ "$sym" = "PEPE" ] && bsym="1000PEPEUSDT"
  local url="$BASE/${bsym}/${IV}/${bsym}-${IV}-${m}.zip"
  local tmp="/tmp/${sym}-${IV}-${m}.zip"
  curl -s -f -m 120 -o "$tmp" "$url" 2>/dev/null || return 0
  unzip -p "$tmp" 2>/dev/null | grep '^[0-9]' > "$OUT/${sym}-${IV}.part-${m}" 2>/dev/null
  rm -f "$tmp"
}
export -f dl
export BASE OUT IV

jobs=/tmp/1h_jobs.txt; : > "$jobs"
for sym in $COINS; do
  for m in "${months[@]}"; do echo "$sym $m" >> "$jobs"; done
done

echo "Downloading $(wc -l < "$jobs") 1h monthly files (parallel, 12 workers) ..."
xargs -P 12 -n 2 bash -c 'dl "$@"' _ < "$jobs"

for sym in $COINS; do
  out="$OUT/${sym}-${IV}.csv"; : > "$out"
  parts=$(ls "$OUT/${sym}-${IV}.part-"* 2>/dev/null | sort)
  for p in $parts; do cat "$p" >> "$out"; rm -f "$p"; done
  n=$(wc -l < "$out")
  echo "  ${sym}-${IV}: ${n} bars"
done
echo "1h fetch done."
