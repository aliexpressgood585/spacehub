#!/usr/bin/env bash
# Download historical USDT-M futures klines from Binance's public data archive
# (data.binance.vision) — reachable from GitHub runners (REST fapi is geo-blocked).
set -uo pipefail

COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA PEPE WIF FET"
INTERVALS="5m 15m 1h"
DAYS=${BT_DAYS:-46}
OUT=backtest/data
BASE="https://data.binance.vision/data/futures/um/daily/klines"
mkdir -p "$OUT"

# date list: last DAYS days ending yesterday (today's dump may not exist yet)
dates=()
for i in $(seq 1 "$DAYS"); do dates+=("$(date -u -d "-$i day" +%Y-%m-%d)"); done

dl() {
  local sym=$1 iv=$2 d=$3
  local url="$BASE/${sym}USDT/${iv}/${sym}USDT-${iv}-${d}.zip"
  local tmp="/tmp/${sym}-${iv}-${d}.zip"
  curl -s -f -m 30 -o "$tmp" "$url" 2>/dev/null || return 0
  unzip -p "$tmp" 2>/dev/null | grep '^[0-9]' > "$OUT/${sym}-${iv}.part-${d}" 2>/dev/null
  rm -f "$tmp"
}
export -f dl
export BASE OUT

jobs=/tmp/bt_jobs.txt; : > "$jobs"
for sym in $COINS; do for iv in $INTERVALS; do
  for d in "${dates[@]}"; do echo "$sym $iv $d" >> "$jobs"; done
done; done

echo "Downloading $(wc -l < "$jobs") files (parallel) ..."
xargs -P 12 -n 3 bash -c 'dl "$@"' _ < "$jobs"

for sym in $COINS; do for iv in $INTERVALS; do
  out="$OUT/${sym}-${iv}.csv"; : > "$out"
  # shellcheck disable=SC2012
  parts=$(ls "$OUT/${sym}-${iv}.part-"* 2>/dev/null | sort)
  [ -n "$parts" ] && cat $parts >> "$out"
  rm -f "$OUT/${sym}-${iv}.part-"*
  echo "${sym}-${iv}: $(wc -l < "$out") rows"
done; done
echo "Done."
