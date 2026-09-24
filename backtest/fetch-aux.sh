#!/usr/bin/env bash
# v85.5 gym: the auxiliary archives that widen the genome vocabulary beyond price/volume.
#  - fundingRate   (monthly, all perps in backtest/data/perps.txt)  -> {SYM}-funding.csv   calc_time,interval_h,rate
#  - premiumIndex  (monthly 1h klines, all perps)                     -> {SYM}-premium.csv   kline format, close = premium
#  - metrics       (DAILY files, 5-minute rows: open interest, top-trader long/short, taker buy/sell) for the
#                  pinned 40 only, capped at 36 months (40 x 1095 daily files)   -> {SYM}-metrics.csv
# Missing files are skipped: a coin without an archive simply has NaN for those features (its genes abstain).
set -uo pipefail
OUT=backtest/data; mkdir -p "$OUT"
MONTHS=${BT_MONTHS:-36}
MM=$MONTHS; [ "$MM" -gt 36 ] && MM=36
BASE="https://data.binance.vision/data/futures/um"
if [ -s "$OUT/perps.txt" ]; then ALL=$(tr "\n" " " < "$OUT/perps.txt"); else ALL="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET"; fi
PINNED="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET"

months=(); for i in $(seq 1 "$MONTHS"); do months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)"); done
days=(); last=$(date -u -d "$(date -u +%Y-%m-01) -1 day" +%Y-%m-%d); for i in $(seq 0 $((MM*31))); do d=$(date -u -d "$last -$i day" +%Y-%m-%d); [ "$d" \< "$(date -u -d "$(date -u +%Y-%m-01) -$MM month" +%Y-%m-%d)" ] && break; days+=("$d"); done

dl() { # kind sym period
  local kind=$1 sym=$2 p=$3 url tmp
  case "$kind" in
    funding) url="$BASE/monthly/fundingRate/${sym}USDT/${sym}USDT-fundingRate-${p}.zip"; tmp="/tmp/${sym}-fund-${p}.zip";;
    premium) url="$BASE/monthly/premiumIndexKlines/${sym}USDT/1h/${sym}USDT-1h-${p}.zip"; tmp="/tmp/${sym}-prem-${p}.zip";;
    metrics) url="$BASE/daily/metrics/${sym}USDT/${sym}USDT-metrics-${p}.zip"; tmp="/tmp/${sym}-metr-${p}.zip";;
  esac
  curl -s -f -m 120 -o "$tmp" "$url" 2>/dev/null || return 0
  unzip -p "$tmp" 2>/dev/null | grep -E '^[0-9]' > "$OUT/${sym}-${kind}.part-${p}" 2>/dev/null
  rm -f "$tmp"
}
export -f dl; export BASE OUT
jobs=/tmp/aux_jobs.txt; : > "$jobs"
for sym in $ALL; do for m in "${months[@]}"; do echo "funding $sym $m" >> "$jobs"; echo "premium $sym $m" >> "$jobs"; done; done
for sym in $PINNED; do for d in "${days[@]}"; do echo "metrics $sym $d" >> "$jobs"; done; done
echo "aux: downloading $(wc -l < "$jobs") files (funding + premium for $(echo $ALL | wc -w) perps x $MONTHS months; metrics for 40 coins x ${#days[@]} days) ..."
xargs -P 24 -n 3 bash -c 'dl "$@"' _ < "$jobs"
for kind in funding premium metrics; do
  n=0
  for sym in $ALL; do
    parts=$(ls "$OUT/${sym}-${kind}.part-"* 2>/dev/null | sort) || true
    [ -n "$parts" ] || continue
    out="$OUT/${sym}-${kind}.csv"; : > "$out"
    for p in $parts; do cat "$p" >> "$out"; rm -f "$p"; done
    n=$((n+1))
  done
  echo "  $kind: $n coins"
done
echo "aux fetch done."
