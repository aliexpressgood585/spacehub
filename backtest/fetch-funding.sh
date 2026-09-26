#!/usr/bin/env bash
# v94.0 lab: the REAL Binance USDT-M funding archive (monthly fundingRate files) for the pinned 40 only —
# fetch-aux.sh does the same plus premium + daily metrics (~45k files) the lab does not need.
# Output: backtest/data/{SYM}-funding.csv  (calc_time, funding_interval_hours, last_funding_rate)
set -uo pipefail
OUT=backtest/data; mkdir -p "$OUT"
MONTHS=${BT_MONTHS:-72}
COINS=${LAB_COINS:-"BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET"}
BASE="https://data.binance.vision/data/futures/um/monthly/fundingRate"
months=(); for i in $(seq 1 "$MONTHS"); do months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)"); done
TMP=/tmp/fund-zips; rm -rf "$TMP"; mkdir -p "$TMP"; cfg=/tmp/fund.cfg; : > "$cfg"
for sym in $COINS; do for m in "${months[@]}"; do
  printf 'url = "%s"\noutput = "%s"\n' "$BASE/${sym}USDT/${sym}USDT-fundingRate-${m}.zip" "$TMP/${sym}.part-${m}.zip" >> "$cfg"
done; done
curl -s -Z --parallel-max 64 --parallel-immediate --fail --retry 2 --retry-delay 1 -m 60 --config "$cfg" || true
for sym in $COINS; do
  out="$OUT/${sym}-funding.csv"; : > "$out"
  for p in $(ls "$TMP/${sym}.part-"*.zip 2>/dev/null | sort); do unzip -p "$p" 2>/dev/null | grep '^[0-9]' >> "$out"; done
  [ -s "$out" ] || rm -f "$out"
done
rm -rf "$TMP"
echo "funding: $(ls "$OUT"/*-funding.csv 2>/dev/null | wc -l) coins with an archive."
