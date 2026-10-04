# PRE-REGISTRATION EVT2 — listing / delisting events traded at size (P-AGG2, paper)

Written 2026-10-04, before deployment, under the owner's explicit override of the AI Council for P-AGG2 only.
PAPER ONLY. `ALLOW_LIVE_EXECUTION` is never set. T0 = the first EVT2 decision after the P-AGG2 deploy.

EVT2 replaces the H7 240-minute rule in the paper book (H7 stays a frozen virtual record in fwd_trades). Rules are the
BL1 / BD1 rules of `quant/PREREGISTRATION_BLADE.md`, unchanged, run by the same code (`runBlade` with the EVT profile):
- Detection: Binance CMS catalogs 48 / 161, polled once per 5 s cycle plus a ~1 s watch inside each cycle.
  `detect_lag_ms` = first seen - releaseDate, journalled for every parsed article in `blade_events`.
- BL1 = spot listing of a coin that already has a USDT-M perp -> LONG the perp. BD1 = spot delisting -> SHORT each named
  perp in the liquid universe. Perp delistings are ignored.
- Gates: age <= 30 s; quote <= 5 s; spread <= 8 bps; walked impact <= 25% of the expected first-minute move; never
  beyond the visible book. No profit gate. Real costs on every fill (taker 5 bps per side + walked impact; exits +5 bps).
- Exits on aggTrades: BL1 stop -4%, half off at +3%, rest trails 1.5 x ATR(1m), 15 min. BD1 stop +4%, target -7%,
  240 min. Liquidation at entry x (1 -/+ (1/10 - 0.5%)) before the stop.
- Size: margin 8% of equity per event, isolated 10x (notional 80% of equity), <= 3 open. Ledger re-checks: lev <= 10,
  margin <= 8.01%, <= 3 open, stop <= 4.5%, announcement <= 90 s old at commit.
- Brake: only the account -12% UTC-day halt (agg2_day). No Blade levels, no Blade halt.

What the history already says (v122, `status/blade-events-v122.txt`; 1m bars cannot price a 30 s entry):
- BL1 at minute +1: all n 23, +1 bps per event (t 0.01); holdout n 7, +13 bps (t 0.07). Indistinguishable from zero.
- **BD1 at minute +1: all n 22, -385 bps per event (t -3.01, PF 0.23); holdout -62 bps.** The delisting short with these exits
  LOST in history at the fastest measurable entry. At minute +2 its holdout was +223 bps (n 7, t 1.55) and all-history -66.
- At 10x x 8% margin, one -385 bps event costs ~3.1% of equity; a full delisting batch (up to 3 shorts) ~9%.

Evaluation: counts only until 30 closed events. Then PF, net per event, and median detect lag over the last 10.
If median detect_lag_ms > 15 s: do not raise size; reduce lag first. If 30 events have PF < 1 or net <= 0: propose EVT off.
