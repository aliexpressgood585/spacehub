#!/usr/bin/env bash
# Clenow trend study: DAILY klines (and optionally funding) for EVERY USDT-M perpetual Binance has ever listed,
# INCLUDING delisted ones (LUNA, FTT, ...) — the archive keeps them, so the universe is point-in-time and free of
# survivorship bias. Output: backtest/data/daily/{SYM}-1d.csv (+ {SYM}-funding.csv with KIND=funding).
# One S3 listing per symbol gives exactly the files that exist; one curl process downloads them all (HTTP/2).
set -uo pipefail
KIND=${KIND:-klines}                   # klines | funding
OUT=backtest/data/daily; mkdir -p "$OUT" "$OUT/zip"
S3="https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix="
list() { local pre=$1 marker="" out=""; for _ in $(seq 1 20); do
  local url="$S3$pre"; [ -n "$marker" ] && url="$url&marker=$marker"
  local x; x=$(curl -s -m 60 "$url") || break
  out+=$(echo "$x" | grep -o '<Key>[^<]*\.zip</Key>\|<Prefix>[^<]*</Prefix>' | sed 's#</*Key>##g; s#</*Prefix>##g')$'\n'
  echo "$x" | grep -q '<IsTruncated>true' || break
  marker=$(echo "$x" | grep -o '<NextMarker>[^<]*' | sed 's#<NextMarker>##'); [ -n "$marker" ] || break
done; echo "$out"; }
if [ "$KIND" = klines ]; then
  list data/futures/um/monthly/klines/ | sed 's#data/futures/um/monthly/klines/##; s#/$##' | grep -E '^[A-Z0-9]+USDT$' \
    | grep -vE '^(BTCDOM|DEFI|USDC|BUSD|TUSD|USDP|FDUSD|BTCST|FOOTBALL|BLUEBIRD)USDT$' > "$OUT/symbols.txt"
  PRE=data/futures/um/monthly/klines; SUB=1d; SYMS="$OUT/symbols.txt"
else
  PRE=data/futures/um/monthly/fundingRate; SUB=""; SYMS=${SYMS:-$OUT/funding-symbols.txt}
fi
echo "$(wc -l < "$SYMS") symbols"
export -f list; export S3 PRE SUB
cat "$SYMS" | xargs -P 32 -I{} bash -c 'p="$PRE/{}/"; [ -n "$SUB" ] && p="$PRE/{}/$SUB/"; list "$p" | grep "\.zip$"' > "$OUT/keys-$KIND.txt"
echo "$(wc -l < "$OUT/keys-$KIND.txt") files"
cfg="$OUT/curl-$KIND.cfg"; : > "$cfg"
while read -r k; do f=$(basename "$k"); [ -s "$OUT/zip/$f" ] || printf 'url = "https://data.binance.vision/%s"\noutput = "%s/zip/%s"\n' "$k" "$OUT" "$f" >> "$cfg"; done < "$OUT/keys-$KIND.txt"
curl -s -Z --parallel-max 64 --retry 3 --config "$cfg" || true
python3 - "$OUT" "$KIND" <<'PY'
import sys, zipfile, glob, os, collections
out, kind = sys.argv[1], sys.argv[2]
rows = collections.defaultdict(list)
pat = "*-1d-*.zip" if kind == "klines" else "*-fundingRate-*.zip"
for z in glob.glob(os.path.join(out, "zip", pat)):
    sym = os.path.basename(z).split("-")[0].removesuffix("USDT")
    try:
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                for line in zf.read(n).decode().splitlines():
                    if line and line[0].isdigit(): rows[sym].append(line)
    except Exception: pass
suf = "-1d.csv" if kind == "klines" else "-funding.csv"
for s, ls in rows.items():
    ls = sorted(set(ls), key=lambda x: int(x.split(",")[0]))
    open(os.path.join(out, s + suf), "w").write("\n".join(ls) + "\n")
print(len(rows), "symbols written")
PY
