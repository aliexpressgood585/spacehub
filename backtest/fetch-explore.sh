#!/usr/bin/env bash
# Download 6 months of 15m + 1h USDT-M futures klines from Binance's MONTHLY
# archive (one zip per month — far fewer files than daily).
set -uo pipefail

COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA PEPE WIF FET"
INTERVALS="15m 1h"
MONTHS=${BT_MONTHS:-6}
OUT=backtest/data
BASE="https://data.binance.vision/data/futures/um/monthly/klines"
mkdir -p "$OUT"

months=()
for i in $(seq 1 "$MONTHS"); do
  months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)")
done

dl() {
  local sym=$1 iv=$2 m=$3
  local url="$BASE/${sym}USDT/${iv}/${sym}USDT-${iv}-${m}.zip"
  local tmp="/tmp/${sym}-${iv}-${m}.zip"
  curl -s -f -m 60 -o "$tmp" "$url" 2>/dev/null || return 0
  unzip -p "$tmp" 2>/dev/null | grep '^[0-9]' > "$OUT/${sym}-${iv}.part-${m}" 2>/dev/null
  rm -f "$tmp"
}
export -f dl
export BASE OUT

jobs=/tmp/ex_jobs.txt; : > "$jobs"
for sym in $COINS; do for iv in $INTERVALS; do
  for m in "${months[@]}"; do echo "$sym $iv $m" >> "$jobs"; done
done; done

echo "Downloading $(wc -l < "$jobs") monthly files (parallel) ..."
xargs -P 12 -n 3 bash -c 'dl "$@"' _ < "$jobs"

for sym in $COINS; do for iv in $INTERVALS; do
  out="$OUT/${sym}-${iv}.csv"; : > "$out"
  # shellcheck disable=SC2012
  parts=$(ls "$OUT/${sym}-${iv}.part-"* 2>/dev/null | sort)
  [ -n "$parts" ] && cat $parts >> "$out"
  rm -f "$OUT/${sym}-${iv}.part-"*
  echo "${sym}-${iv}: $(wc -l < "$out") rows"
done; done
# ── funding rates (monthly, tiny files) ──
FBASE="https://data.binance.vision/data/futures/um/monthly/fundingRate"
dlf() {
  local sym=$1 m=$2
  local url="$FBASE/${sym}USDT/${sym}USDT-fundingRate-${m}.zip"
  local tmp="/tmp/f-${sym}-${m}.zip"
  curl -s -f -m 30 -o "$tmp" "$url" 2>/dev/null || return 0
  unzip -p "$tmp" 2>/dev/null | grep '^[0-9]' | cut -d, -f1,3 > "$OUT/${sym}-fund.part-${m}" 2>/dev/null
  rm -f "$tmp"
}
export -f dlf
export FBASE
fjobs=/tmp/f_jobs.txt; : > "$fjobs"
for sym in $COINS; do for m in "${months[@]}"; do echo "$sym $m" >> "$fjobs"; done; done
echo "Downloading $(wc -l < "$fjobs") funding files ..."
xargs -P 12 -n 2 bash -c 'dlf "$@"' _ < "$fjobs"
for sym in $COINS; do
  out="$OUT/${sym}-fund.csv"; : > "$out"
  parts=$(ls "$OUT/${sym}-fund.part-"* 2>/dev/null | sort)
  [ -n "$parts" ] && cat $parts >> "$out"
  rm -f "$OUT/${sym}-fund.part-"*
done
echo "funding done"
echo "Done."
