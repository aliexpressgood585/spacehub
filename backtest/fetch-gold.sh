#!/usr/bin/env bash
# v74bt: fetch PAXG (Paxos Gold) and XAUT (Tether Gold) — Binance-listed
# gold-backed tokens. Tries USDⓈ-M futures archive first (same fee/funding
# model as CRYPTO_40); falls back to spot archive if no futures market
# exists for the symbol. Writes to backtest/data/{SYM}-{iv}.csv — same
# filename convention as fetch-explore.sh, so loadCSV() just works.
set -uo pipefail

SYMS="PAXG XAUT"
INTERVALS="15m 1h"
MONTHS=${BT_MONTHS:-36}
OUT=backtest/data
FUT="https://data.binance.vision/data/futures/um/monthly/klines"
SPOT="https://data.binance.vision/data/spot/monthly/klines"
mkdir -p "$OUT"

months=()
for i in $(seq 1 "$MONTHS"); do
  months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)")
done

dl() {
  local base=$1 sym=$2 iv=$3 m=$4
  local url="$base/${sym}USDT/${iv}/${sym}USDT-${iv}-${m}.zip"
  local tmp="/tmp/g-${sym}-${iv}-${m}.zip"
  curl -s -f -m 60 -o "$tmp" "$url" 2>/dev/null || return 1
  unzip -p "$tmp" 2>/dev/null | grep '^[0-9]' > "$OUT/${sym}-${iv}.part-${m}" 2>/dev/null
  rm -f "$tmp"
  return 0
}

for sym in $SYMS; do
  for iv in $INTERVALS; do
    src="futures"
    for m in "${months[@]}"; do
      dl "$FUT" "$sym" "$iv" "$m" && continue
      dl "$SPOT" "$sym" "$iv" "$m" && src="spot(mixed)"
    done
    out="$OUT/${sym}-${iv}.csv"; : > "$out"
    parts=$(ls "$OUT/${sym}-${iv}.part-"* 2>/dev/null | sort)
    [ -n "$parts" ] && cat $parts >> "$out"
    rm -f "$OUT/${sym}-${iv}.part-"*
    echo "${sym}-${iv} [$src]: $(wc -l < "$out") rows"
  done
done
