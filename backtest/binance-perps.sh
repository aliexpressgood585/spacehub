#!/usr/bin/env bash
# v85.3 gym universe: every USDT-margined PERPETUAL that Binance Futures trades TODAY and has traded for
# at least two years, read from the public archive itself (fapi.binance.com is geo-blocked from both the
# sandbox and GitHub runners; data.binance.vision is not). "Trades today" = a kline file exists for the
# last complete month; "two years" = a file exists 24 months earlier. Delivery contracts (BTCUSDT_210625),
# index products (BTCDOM, DEFI) and stablecoin pairs are excluded. Output: backtest/data/perps.txt, one
# base symbol per line (Binance spelling, e.g. 1000PEPE), BTC first. Crypto only by construction —
# Binance USDT-M has no equity products.
set -uo pipefail
OUT=backtest/data/perps.txt
mkdir -p backtest/data
LAST=$(date -u -d "$(date -u +%Y-%m-01) -1 month" +%Y-%m)
OLD=$(date -u -d "$(date -u +%Y-%m-01) -25 month" +%Y-%m)
BASE="https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix=data/futures/um/monthly/klines/"
marker=""; syms=()
for _ in $(seq 1 10); do
  url="$BASE"; [ -n "$marker" ] && url="$BASE&marker=$marker"
  x=$(curl -s -m 60 "$url") || break
  while read -r p; do syms+=("$p"); done < <(echo "$x" | grep -o '<Prefix>data/futures/um/monthly/klines/[^<]*/</Prefix>' | sed 's#.*/klines/##; s#/</Prefix>##')
  echo "$x" | grep -q '<IsTruncated>true' || break
  marker=$(echo "$x" | grep -o '<NextMarker>[^<]*</NextMarker>' | sed 's#<NextMarker>##; s#</NextMarker>##')
  [ -n "$marker" ] || break
done
echo "archive lists ${#syms[@]} symbols; last complete month $LAST, history check $OLD"
cands=()
for s in "${syms[@]}"; do
  case "$s" in *_*|*USDC|*BUSD|BTCDOMUSDT|DEFIUSDT|USDCUSDT|BUSDUSDT|TUSDUSDT|USDPUSDT|FDUSDUSDT|BTCSTUSDT) continue;; esac
  [[ "$s" == *USDT ]] || continue
  cands+=("${s%USDT}")
done
echo "${#cands[@]} USDT perpetual names to probe"
chk() { local b=$1; local h1 h2
  h1=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -I "https://data.binance.vision/data/futures/um/monthly/klines/${b}USDT/1h/${b}USDT-1h-${LAST}.zip")
  [ "$h1" = "200" ] || return 0
  h2=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -I "https://data.binance.vision/data/futures/um/monthly/klines/${b}USDT/1h/${b}USDT-1h-${OLD}.zip")
  [ "$h2" = "200" ] && echo "$b"
}
export -f chk; export LAST OLD
printf '%s\n' "${cands[@]}" | xargs -P 16 -n 1 bash -c 'chk "$@"' _ | sort -u > /tmp/perps.raw
{ grep -x BTC /tmp/perps.raw; grep -vx BTC /tmp/perps.raw; } > "$OUT"
echo "$(wc -l < "$OUT") perpetuals trading today with >= 2y history -> $OUT"
head -c 600 "$OUT" | tr '\n' ' '; echo
