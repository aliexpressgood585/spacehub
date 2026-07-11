#!/usr/bin/env bash
# Download 6 months of 15m + 1h USDT-M futures klines from Binance's MONTHLY
# archive (one zip per month — far fewer files than daily).
set -uo pipefail

COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA PEPE WIF FET TON XLM ETC HBAR VET EGLD FLOW CHZ MANA GRT SNX COMP MKR ENJ 1INCH ZIL KAVA ROSE CELO ONE QTUM IOTA XTZ NEO DASH ZEC BAND STORJ KSM JASMY"
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

# ── open-interest metrics (daily files — verified to exist; liquidationSnapshot
# does NOT exist in the archive). Fetched only when BT_FETCH_LIQ=1 (v47bt):
# ~22k small files for 20 majors → SYM-oi5.csv rows "ISO_time,oi_usd" (5-min samples)
if [ "${BT_FETCH_LIQ:-0}" = "1" ]; then
  LIQ_COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR SUI TRX APT ARB OP ATOM FIL"
  LBASE="https://data.binance.vision/data/futures/um/daily/metrics"
  dll() {
    local sym=$1 d=$2
    local url="$LBASE/${sym}USDT/${sym}USDT-metrics-${d}.zip"
    local tmp="/tmp/l-${sym}-${d}.zip"
    curl -s -f -m 30 -o "$tmp" "$url" 2>/dev/null || return 0
    # cols: create_time,symbol,sum_open_interest,sum_open_interest_value,
    #       count_toptrader_ls_ratio,sum_toptrader_ls_ratio(positions),...
    unzip -p "$tmp" 2>/dev/null | awk -F, -v oi="$OUT/${sym}-oi5.part-${d}" -v tt="$OUT/${sym}-tt.part-${d}" '$1 ~ /^2/ {
      gsub(/ /,"T",$1); printf "%s,%s\n", $1, $4 > oi
      if ($6 != "" && $6+0 > 0) printf "%s,%s\n", $1, $6 > tt
    }' 2>/dev/null
    rm -f "$tmp"
  }
  export -f dll
  export LBASE
  dates=()
  d0=$(date -u -d "$(date -u +%Y-%m-01) -$MONTHS month" +%Y-%m-%d)
  dcur="$d0"
  dend=$(date -u -d "2 days ago" +%Y-%m-%d)
  while [ "$dcur" \< "$dend" ] || [ "$dcur" = "$dend" ]; do
    dates+=("$dcur")
    dcur=$(date -u -d "$dcur +1 day" +%Y-%m-%d)
  done
  ljobs=/tmp/l_jobs.txt; : > "$ljobs"
  for sym in $LIQ_COINS; do for d in "${dates[@]}"; do echo "$sym $d" >> "$ljobs"; done; done
  echo "Downloading $(wc -l < "$ljobs") daily OI-metrics files ..."
  xargs -P 32 -n 2 bash -c 'dll "$@"' _ < "$ljobs"
  for sym in $LIQ_COINS; do
    for kind in oi5 tt; do
      out="$OUT/${sym}-${kind}.csv"; : > "$out"
      parts=$(ls "$OUT/${sym}-${kind}.part-"* 2>/dev/null | sort)
      [ -n "$parts" ] && cat $parts >> "$out"
      rm -f "$OUT/${sym}-${kind}.part-"*
    done
    echo "${sym}: oi5=$(wc -l < "$OUT/${sym}-oi5.csv") tt=$(wc -l < "$OUT/${sym}-tt.csv")"
  done
  echo "OI/top-trader metrics done"
  # Fear & Greed full daily history (free, alternative.me)
  curl -s -m 60 "https://api.alternative.me/fng/?limit=0&format=json" > "$OUT/fng.json" 2>/dev/null || true
  echo "fng: $(wc -c < "$OUT/fng.json" 2>/dev/null || echo 0) bytes"
fi
echo "Done."
