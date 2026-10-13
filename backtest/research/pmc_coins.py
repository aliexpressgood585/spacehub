"""Poly coins: the live rule (5m, favourite at 90-98c, 180 s before the end, hold to the result) per coin, on any pmc_fetch file.
Run: python3 backtest/research/pmc_coins.py <pmc.jsonl> [more.jsonl ...]"""
import json, sys, math, statistics as st
sys.argv = [sys.argv[0], sys.argv[1]] + sys.argv[2:]
files = sys.argv[1:]
src = open('backtest/research/pmc_stoploss.py').read().split("print('Entry")[0].replace("open(sys.argv[1])", "(l for f in FILES for l in open(f))")
FILES = files; exec(src)
vols = {}
for r in rows: vols.setdefault(r['coin'], []).append(r['vol'])
coins = sorted(vols)
print('split at', cut, '| median 5m market volume ($):', {c: round(st.median(vols[c])) for c in coins})
for grp in [[c] for c in coins] + [['btc', 'eth', 'sol', 'xrp'], ['bnb', 'doge', 'hype', 'zec'], coins]:
    x = trades('5m', 180, .90, .98, None, coins=grp)
    a = [y for y in x if not y[4]]; b = [y for y in x if y[4]]
    print(f"{','.join(grp):28} IS {s(a)[:52]} | OOS {s(b)[:52]}")
