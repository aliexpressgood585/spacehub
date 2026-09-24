#!/usr/bin/env bash
# v85.5 gym: the auxiliary archives that widen the genome vocabulary beyond price/volume.
#  - fundingRate   (monthly, all perps in backtest/data/perps.txt)  -> {SYM}-funding.csv   calc_time,interval_h,rate
#  - premiumIndex  (monthly 1h klines, all perps)                     -> {SYM}-premium.csv   kline format, close = premium
#  - metrics       (DAILY files, 5-30 minute rows: open interest, top-trader long/short, taker buy/sell) for the
#                  pinned 40 only, capped at 36 months (40 x ~1095 daily files)   -> {SYM}-metrics.csv
# Missing files are skipped: a coin without an archive simply has NaN for those features (its genes abstain).
# v85.8: ONE curl process with HTTP/2 multiplexing (curl -Z, a --config file of url/output pairs) instead of
# ~85,000 spawned curls — the v85.5 run sat in this step for over half an hour.
set -uo pipefail
OUT=backtest/data; mkdir -p "$OUT"
MONTHS=${BT_MONTHS:-36}
MM=$MONTHS; [ "$MM" -gt 36 ] && MM=36
BASE="https://data.binance.vision/data/futures/um"
if [ -s "$OUT/perps.txt" ]; then ALL=$(tr "\n" " " < "$OUT/perps.txt"); else ALL="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET"; fi
PINNED="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET"

months=(); for i in $(seq 1 "$MONTHS"); do months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)"); done
days=(); last=$(date -u -d "$(date -u +%Y-%m-01) -1 day" +%Y-%m-%d); floor=$(date -u -d "$(date -u +%Y-%m-01) -$MM month" +%Y-%m-%d)
for i in $(seq 0 $((MM*31))); do d=$(date -u -d "$last -$i day" +%Y-%m-%d); [ "$d" \< "$floor" ] && break; days+=("$d"); done

TMP=/tmp/aux-zips; rm -rf "$TMP"; mkdir -p "$TMP"
cfg=/tmp/aux-curl.cfg; : > "$cfg"
for sym in $ALL; do for m in "${months[@]}"; do
  printf 'url = "%s"\noutput = "%s"\n' "$BASE/monthly/fundingRate/${sym}USDT/${sym}USDT-fundingRate-${m}.zip" "$TMP/${sym}-funding.part-${m}.zip" >> "$cfg"
  printf 'url = "%s"\noutput = "%s"\n' "$BASE/monthly/premiumIndexKlines/${sym}USDT/1h/${sym}USDT-1h-${m}.zip" "$TMP/${sym}-premium.part-${m}.zip" >> "$cfg"
done; done
for sym in $PINNED; do for d in "${days[@]}"; do
  printf 'url = "%s"\noutput = "%s"\n' "$BASE/daily/metrics/${sym}USDT/${sym}USDT-metrics-${d}.zip" "$TMP/${sym}-metrics.part-${d}.zip" >> "$cfg"
done; done
n=$(grep -c '^url' "$cfg")
echo "aux: $n files (funding + premium for $(echo $ALL | wc -w) perps x $MONTHS months; metrics for 40 coins x ${#days[@]} days) — one multiplexed curl ..."
t0=$(date +%s)
curl -s -Z --parallel-max 64 --parallel-immediate --fail --retry 2 --retry-delay 1 -m 60 --config "$cfg" || true
echo "aux: downloaded $(ls "$TMP" | wc -l) files in $(( $(date +%s) - t0 ))s (a 404 = no archive for that coin/period)"
for kind in funding premium metrics; do
  c=0
  for sym in $ALL; do
    parts=$(ls "$TMP/${sym}-${kind}.part-"*.zip 2>/dev/null | sort) || true
    [ -n "$parts" ] || continue
    out="$OUT/${sym}-${kind}.csv"; : > "$out"
    for p in $parts; do unzip -p "$p" 2>/dev/null | grep -E '^[0-9]' >> "$out"; done
    c=$((c+1))
  done
  echo "  $kind: $c coins"
done
rm -rf "$TMP"
echo "aux fetch done."
