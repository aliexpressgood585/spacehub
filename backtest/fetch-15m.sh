#!/usr/bin/env bash
# v85.4 gym: 15m USDT-M futures klines. Monthly archive zips, parallel.
set -uo pipefail

# v85.4: 15m bars for the pinned 40 (Binance spelling), capped at 36 months — 15m x 289 coins x 72m would be ~14GB.
COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET"
MONTHS=${BT_MONTHS:-36}; [ "$MONTHS" -gt 36 ] && MONTHS=36
IV=15m
OUT=backtest/data
BASE="https://data.binance.vision/data/futures/um/monthly/klines"
mkdir -p "$OUT"

months=()
for i in $(seq 1 "$MONTHS"); do
  months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)")
done

dl() {
  local sym=$1 m=$2
  local bsym="${sym}USDT"
  local url="$BASE/${bsym}/${IV}/${bsym}-${IV}-${m}.zip"
  local tmp="/tmp/${sym}-${IV}-${m}.zip"
  curl -s -f -m 120 -o "$tmp" "$url" 2>/dev/null || return 0
  unzip -p "$tmp" 2>/dev/null | grep '^[0-9]' > "$OUT/${sym}-${IV}.part-${m}" 2>/dev/null
  rm -f "$tmp"
}
export -f dl
export BASE OUT IV

jobs=/tmp/15m_jobs.txt; : > "$jobs"
for sym in $COINS; do
  for m in "${months[@]}"; do echo "$sym $m" >> "$jobs"; done
done

echo "Downloading $(wc -l < "$jobs") 1h monthly files (parallel, 12 workers) ..."
xargs -P 16 -n 2 bash -c 'dl "$@"' _ < "$jobs"

for sym in $COINS; do
  out="$OUT/${sym}-${IV}.csv"; : > "$out"
  parts=$(ls "$OUT/${sym}-${IV}.part-"* 2>/dev/null | sort)
  for p in $parts; do cat "$p" >> "$out"; rm -f "$p"; done
  n=$(wc -l < "$out")
  echo "  ${sym}-${IV}: ${n} bars"
done
echo "1h fetch done."
