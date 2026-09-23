#!/usr/bin/env bash
# v103bt: Binance USDT-M futures bookDepth archive (snapshots every ~30s of
# cumulative depth at +-0.2/1/2/3/4/5% from mid). Resampled to the LAST
# snapshot of each 5-minute bucket and cut to the +-0.2% and +-1% levels, so
# 90 days x 10 coins stays small. Output: <SYM>-book.csv
#   t_ms,bid02,ask02,bid1,ask1   (notional USDT)
set -uo pipefail
command -v gawk >/dev/null || sudo apt-get install -y -qq gawk >/dev/null
COINS="BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT"
DAYS=${BT_BOOK_DAYS:-90}
OUT=backtest/data
BASE="https://data.binance.vision/data/futures/um/daily/bookDepth"
mkdir -p "$OUT"
dl() {
  local sym=$1 d=$2 tmp="/tmp/bd-${1}-${2}.zip"
  curl -s -f -m 120 -o "$tmp" "$BASE/${sym}USDT/${sym}USDT-bookDepth-${d}.zip" || return 0
  unzip -p "$tmp" 2>/dev/null | gawk -F, '
    NR>1 && ($2=="-0.20"||$2=="0.20"||$2=="-1.00"||$2=="1.00") {
      gsub(/"/,"",$1); split($1,a,/[- :]/)
      t = mktime(a[1]" "a[2]" "a[3]" "a[4]" "a[5]" "a[6]) ; b = int(t/300)*300
      v[b","$2] = $4; seen[b]=1
    }
    END { for (b in seen) if ((b",-0.20") in v && (b",0.20") in v && (b",-1.00") in v && (b",1.00") in v)
      printf "%d,%s,%s,%s,%s\n", b*1000, v[b",-0.20"], v[b",0.20"], v[b",-1.00"], v[b",1.00"] }' \
    > "$OUT/${sym}-book.part-${d}"
  rm -f "$tmp"
}
export -f dl; export BASE OUT
jobs=/tmp/bd_jobs.txt; : > "$jobs"
for sym in $COINS; do for i in $(seq 2 $((DAYS+1))); do echo "$sym $(date -u -d "-$i day" +%Y-%m-%d)" >> "$jobs"; done; done
echo "Downloading $(wc -l < "$jobs") bookDepth daily files (8 workers) ..."
TZ=UTC xargs -P 8 -n 2 bash -c 'dl "$@"' _ < "$jobs"
for sym in $COINS; do
  out="$OUT/${sym}-book.csv"; cat "$OUT/${sym}-book.part-"* 2>/dev/null | sort -t, -k1,1n > "$out"; rm -f "$OUT/${sym}-book.part-"*
  echo "  ${sym}-book: $(wc -l < "$out") 5m snapshots"
done
