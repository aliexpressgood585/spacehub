"""Live / testnet runner. Same strategy functions and the same RiskManager as the backtest; only the data source
(closed candles from the exchange) and the fills (real orders) differ.

Loop (every `poll_s`):
  1. equity from the exchange -> RiskManager.mark (drawdown kill switch)
  2. reconcile with the exchange (stops present, positions the stop closed -> booked with their realised PnL)
  3. time exits (max hold) and signal exits for open trades
  4. on each newly CLOSED candle: signals on closed candles only -> risk checks -> sized entry + exchange stop
A kill switch writes reports/HALT and stops the loop; the runner refuses to start while HALT exists (manual reset:
delete the file after reviewing). Risk state (peak, day P&L, streak, pauses) is persisted so a restart cannot reset a
limit.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import time
from pathlib import Path

import numpy as np

from ..data.loader import TF_MS, Bars
from ..risk.manager import RiskManager, RiskState
from ..strategies import mean_reversion as MR
from ..strategies import momentum as MOM
from ..strategies import regime as RG
from .broker import OrderRejected
from .exchange import market_symbol

log = logging.getLogger("quant.runner")
SIGNALS = {"MR": MR.signals, "MOM": MOM.signals}
REGIME_OF = {"RG_MR": ("MR", RG.MEAN_REVERT), "RG_MOM": ("MOM", RG.TREND)}


class Runner:
    def __init__(self, cfg, mode, broker, journal, alerts, plan: list[dict], tf: str, reports_dir, clock=time.time, sleep=time.sleep):
        self.cfg, self.mode, self.broker, self.journal, self.alerts = cfg, mode, broker, journal, alerts
        self.plan, self.tf, self.clock, self.sleep = plan, tf, clock, sleep
        self.coins = list(cfg["universe"])
        self.rd = Path(reports_dir)
        self.halt_path = self.rd / "HALT"
        self.state_path = self.rd / f"risk_state_{mode}.json"
        self.last_bar: dict[str, int] = {}
        self.risk: RiskManager | None = None
        self.meta: dict[int, dict] = {}   # trade_id -> {max_hold_ms, strategy}

    # --- state ----------------------------------------------------------------------------------------------
    def _load_risk(self, equity: float) -> RiskManager:
        rm = RiskManager(self.cfg, equity)
        if self.state_path.exists():
            d = json.loads(self.state_path.read_text())
            rm.state = RiskState(**d["state"])
            for strat, rs in d.get("rs", {}).items():
                for r in rs:
                    rm.sizer(strat).add(r)
        return rm

    def _save_risk(self) -> None:
        d = {"state": dataclasses.asdict(self.risk.state), "rs": {k: v.rs[-500:] for k, v in self.risk.sizers.items()}}
        self.state_path.write_text(json.dumps(d))

    # --- lifecycle ------------------------------------------------------------------------------------------
    def start(self) -> None:
        if self.halt_path.exists():
            raise RuntimeError(f"HALT present ({self.halt_path.read_text().strip()}); review and delete it to restart")
        eq = self.broker.equity()
        self.risk = self._load_risk(eq)
        for c in self.coins:
            self.broker.prepare(c, int(self.cfg["risk"]["max_leverage"]))
        self.journal.event("INFO", "start", f"mode={self.mode} tf={self.tf} equity={eq:.2f} plan={json.dumps(self.plan)}")
        self.alerts.send("START", f"{self.mode} runner started, equity {eq:.2f}")
        self._reconcile()

    def kill(self, reason: str) -> None:
        self.broker.close_all(self.coins, "kill_switch")
        self.halt_path.write_text(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {reason}\n")
        self.journal.event("CRIT", "kill_switch", reason)
        self.alerts.send("KILL", f"kill switch: {reason}. All positions closed, runner halted.")

    # --- data -----------------------------------------------------------------------------------------------
    def fetch_closed(self, coin: str, n: int) -> Bars:
        tfm = TF_MS[self.tf]
        now = int(self.clock() * 1000)
        since = now - (n + 2) * tfm
        rows: list = []
        while since < now:
            chunk = self.broker.call(self.broker.ex.fetch_ohlcv, market_symbol(coin), self.tf, since, 1500)
            if not chunk:
                break
            rows += chunk
            since = int(chunk[-1][0]) + tfm
            if len(chunk) < 1500:
                break
        rows = [r for r in {int(r[0]): r for r in rows}.values() if int(r[0]) + tfm <= now]   # CLOSED candles only
        rows.sort(key=lambda r: r[0])
        a = np.array(rows, float)
        return Bars(coin, self.tf, a[:, 0].astype(np.int64), a[:, 1], a[:, 2], a[:, 3], a[:, 4], a[:, 5])

    def _need_bars(self) -> int:
        s = self.cfg["strategies"]
        pick = lambda v: v[self.tf] if isinstance(v, dict) else v  # noqa: E731
        return int(max(pick(s["mean_reversion"]["stat_window"]), pick(s["momentum"]["sig_window"]), pick(s["regime"]["window"])) + 400)

    # --- one iteration --------------------------------------------------------------------------------------
    def _reconcile(self) -> None:
        open_tr = self.journal.open_trades()
        rec = self.broker.reconcile(self.coins, {t["symbol"]: t["stop"] for t in open_tr})
        for t in open_tr:
            if t["symbol"] in rec["closed"] + rec["closed_no_stop"]:
                self._book_close(t, "STOP" if t["symbol"] in rec["closed"] else "NO_STOP")

    def _book_close(self, t: dict, reason: str, exit_px: float | None = None) -> None:
        pnl = self._realised(t)
        risk_amt = abs(t["entry"] - t["stop"]) * t["qty"]
        r = pnl / risk_amt if risk_amt > 0 else 0.0
        self.journal.close_trade(t["id"], exit_px or 0.0, pnl, r, reason)
        eq = self.broker.equity()
        ev = self.risk.on_trade_closed(int(self.clock() * 1000), pnl, r, t["strategy"], eq)
        self._save_risk()
        self.alerts.send("EXIT", f"{t['strategy']} {t['symbol']} {reason} pnl {pnl:+.2f} ({r:+.2f}R)")
        if ev == "KILL":
            self.kill(self.risk.state.halt_reason)
        elif ev:
            self.alerts.send(ev, f"{ev}: no new entries until 00:00 UTC")
            self.journal.event("WARN", ev, "entries paused until next UTC day")

    def _realised(self, t: dict) -> float:
        try:
            trades = self.broker.call(self.broker.ex.fetch_my_trades, market_symbol(t["symbol"]), int(t["open_ts"]))
            pnl = sum(float((x.get("info") or {}).get("realizedPnl", 0)) for x in trades)
            fees = sum(float((x.get("fee") or {}).get("cost") or 0) for x in trades)
            return pnl - fees
        except Exception as e:  # noqa: BLE001
            log.warning("realised pnl %s: %s", t["symbol"], e)
            return 0.0

    def step(self) -> None:
        now_ms = int(self.clock() * 1000)
        eq = self.broker.equity()
        if self.risk.mark(now_ms, eq) == "KILL":
            self._save_risk()
            self.kill(self.risk.state.halt_reason)
            return
        self._reconcile()
        if self.halt_path.exists():
            return
        tfm = TF_MS[self.tf]
        open_tr = {t["symbol"]: t for t in self.journal.open_trades()}
        for t in open_tr.values():          # time exits
            mh = self.meta.get(t["id"], {}).get("max_hold_ms")
            if mh and now_ms - t["open_ts"] >= mh:
                self.broker.market_close(t["symbol"], t["side"], t["qty"], "timeout")
                self._book_close(t, "TIMEOUT")
        open_tr = {t["symbol"]: t for t in self.journal.open_trades()}
        if not self.plan:
            self._save_risk()
            return
        bar_close = (now_ms // tfm) * tfm
        for coin in self.coins:
            if self.last_bar.get(coin) == bar_close:
                continue
            bars = self.fetch_closed(coin, self._need_bars())
            if len(bars) < 50 or int(bars.t[-1]) + tfm != bar_close:
                continue                        # stale / missing candle: never trade on it
            self.last_bar[coin] = bar_close
            self._on_bar(coin, bars, open_tr.get(coin), now_ms, eq)
        self._save_risk()

    def _on_bar(self, coin, bars: Bars, open_t, now_ms, eq) -> None:
        reg = None
        for item in self.plan:
            name, params = item["strategy"], item["params"]
            base, want = REGIME_OF.get(name, (name, None))
            if want is not None and reg is None:
                reg = RG.regimes(bars.close, self.cfg, self.tf)
            sig = SIGNALS[base](bars, params, self.cfg, self.tf)
            if want is not None:
                sig = sig.masked(reg == want)
            i = len(bars) - 1
            if open_t is not None and open_t["strategy"] == name:
                if (open_t["side"] > 0 and sig.exit_long[i]) or (open_t["side"] < 0 and sig.exit_short[i]):
                    self.broker.market_close(coin, open_t["side"], open_t["qty"], "signal")
                    self._book_close(open_t, "SIGNAL")
                continue
            if open_t is not None or sig.side[i] == 0:
                continue
            ok, why = self.risk.can_open(now_ms, eq, len(self.journal.open_trades()))
            if not ok:
                self.journal.event("INFO", "entry_refused", f"{name} {coin}: {why}")
                continue
            side = int(sig.side[i])
            stop = float(sig.stop_long[i] if side > 0 else sig.stop_short[i])
            entry_est = float(bars.close[i])
            open_notional = sum(t["qty"] * t["entry"] for t in self.journal.open_trades())
            qty, f, why = self.risk.size(name, eq, entry_est, stop, open_notional)
            if qty <= 0:
                self.journal.event("INFO", "entry_refused", f"{name} {coin}: {why}")
                continue
            try:
                res = self.broker.open_position(coin, side, qty, stop, None, strategy=name)
            except OrderRejected as e:
                self.alerts.send("ERROR", f"{name} {coin} entry rejected: {e}")
                continue
            if res:
                self.meta[res["trade_id"]] = {"max_hold_ms": int(sig.max_hold[i]) * TF_MS[self.tf], "strategy": name}
                open_t = self.journal.open_trades()[-1]

    def run_forever(self, poll_s: float = 5.0) -> None:
        self.start()
        backoff = poll_s
        while not self.halt_path.exists():
            try:
                self.step()
                backoff = poll_s
            except KeyboardInterrupt:
                raise
            except Exception as e:  # noqa: BLE001 — reconnect / transient faults: alert, back off, continue
                self.journal.event("ERROR", "loop", f"{type(e).__name__}: {e}")
                self.alerts.send("ERROR", f"loop error {type(e).__name__}: {e}")
                backoff = min(backoff * 2, 300)
            self.sleep(backoff)
