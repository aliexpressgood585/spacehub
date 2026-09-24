#!/usr/bin/env bash
# v85.1 gym: USDT-M futures klines from Binance's monthly archive, aggregated to slower bars in backtest/gym.ts.
# v85.3: the universe comes from backtest/binance-perps.sh when it has run (every USDT perpetual trading today
# with >= 2y of history, Binance spelling e.g. 1000PEPE); otherwise the pinned 40.
# v85.8: one multiplexed curl (-Z) instead of a spawned curl per file — 20,000 files in minutes, not tens of minutes.
set -uo pipefail
IV=${BT_IV:-1h}
if [ "$IV" = "1h" ] && [ -s backtest/data/perps.txt ]; then COINS=$(tr "\n" " " < backtest/data/perps.txt); else
COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA 1000PEPE WIF FET"; fi
MONTHS=${BT_MONTHS:-36}
[ "$IV" != "1h" ] && [ "$MONTHS" -gt 36 ] && MONTHS=36   # fast bars are capped at 36 months (memory in the gym)
OUT=backtest/data
BASE="https://data.binance.vision/data/futures/um/monthly/klines"
mkdir -p "$OUT"
months=(); for i in $(seq 1 "$MONTHS"); do months+=("$(date -u -d "$(date -u +%Y-%m-01) -$i month" +%Y-%m)"); done
TMP=/tmp/kl-$IV; rm -rf "$TMP"; mkdir -p "$TMP"
cfg=/tmp/kl-$IV.cfg; : > "$cfg"
for sym in $COINS; do for m in "${months[@]}"; do
  printf 'url = "%s"\noutput = "%s"\n' "$BASE/${sym}USDT/${IV}/${sym}USDT-${IV}-${m}.zip" "$TMP/${sym}.part-${m}.zip" >> "$cfg"
done; done
echo "Downloading $(grep -c '^url' "$cfg") $IV monthly files ($(echo $COINS | wc -w) coins x $MONTHS months) — one multiplexed curl ..."
t0=$(date +%s)
curl -s -Z --parallel-max 64 --parallel-immediate --fail --retry 2 --retry-delay 1 -m 120 --config "$cfg" || true
echo "  downloaded $(ls "$TMP" | wc -l) files in $(( $(date +%s) - t0 ))s"
for sym in $COINS; do
  out="$OUT/${sym}-${IV}.csv"; : > "$out"
  parts=$(ls "$TMP/${sym}.part-"*.zip 2>/dev/null | sort) || true
  for p in $parts; do unzip -p "$p" 2>/dev/null | grep '^[0-9]' >> "$out"; done
  n=$(wc -l < "$out"); [ "$n" -gt 0 ] || rm -f "$out"
done
rm -rf "$TMP"
echo "$IV fetch done: $(ls "$OUT"/*-"$IV".csv 2>/dev/null | wc -l) coins with data."
