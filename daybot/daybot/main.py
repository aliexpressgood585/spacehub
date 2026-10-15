"""24/7 loop: on every closed 1m bar -> market data -> engine.step (filters -> setups -> risk -> execution).

    python -m daybot.main --config config.yaml
"""
from __future__ import annotations

import argparse
import json
import logging
import logging.handlers
import os
import signal
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .config import ConfigError, load_config
from .data import LiveFeed, MarketData
from .engine import Engine, gate_pass
from .executor import LiveBroker, make_exchange
from .filters import calendar_is_stale
from .journal import Journal
from .risk import RiskState
from .setups import check_config_tfs
from .telegram import Telegram

log = logging.getLogger("daybot")


def load_env(path: Path) -> None:
    """Minimal .env reader (KEY=VALUE lines). Real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def setup_logging(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    fh = logging.handlers.RotatingFileHandler(path, maxBytes=20_000_000, backupCount=10, encoding="utf-8")
    sh = logging.StreamHandler(sys.stdout)
    for h in (fh, sh):
        h.setFormatter(fmt)
    logging.basicConfig(level=logging.INFO, handlers=[fh, sh])
    logging.getLogger("ccxt").setLevel(logging.WARNING)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    a = ap.parse_args()
    cfg_path = Path(a.config).resolve()
    load_env(cfg_path.parent / ".env")
    try:
        cfg = load_config(cfg_path)
    except ConfigError as e:
        print(e, file=sys.stderr)
        sys.exit(2)
    errs = check_config_tfs(cfg)
    if errs:
        print("config rejected:\n  " + "\n  ".join(errs), file=sys.stderr)
        sys.exit(2)
    setup_logging(cfg.p("log"))
    tz = ZoneInfo(cfg["timezone"])
    tg = Telegram(prefix="" if cfg.mode == "live" else f"[{cfg.mode.upper()}] ")
    tg.start()
    journal = Journal(cfg.p("db"))

    import ccxt

    ex = make_exchange(cfg)
    broker = LiveBroker(cfg, ex, tg)
    try:
        notes = broker.reconcile(journal, cfg.universe)
    except ccxt.AuthenticationError as e:
        msg = f"API keys missing or rejected for mode {cfg.mode} ({e}). Testnet keys only work on testnet. Not starting."
        log.error(msg)
        tg.send(f"⛔ {msg}")
        time.sleep(3)
        sys.exit(2)

    gate_file = cfg.root / cfg["gate"]["file"]
    gate = json.loads(gate_file.read_text()) if gate_file.exists() else None
    allowed = gate_pass(cfg, gate)
    eng = Engine(cfg, broker, journal, tg, allowed=allowed, risk_state=RiskState.from_dict(journal.load_state("risk")))
    eng.stopped = bool((journal.load_state("engine") or {}).get("stopped"))
    lock = threading.Lock()

    wake = threading.Event()
    feed = LiveFeed(cfg.mode, cfg.universe, on_close=lambda s, t: wake.set())
    feed.start()
    md = MarketData(ex, feed, cfg.universe)

    def cmd_stop() -> str:
        with lock:
            eng.stopped = True
            eng.flatten(int(time.time() * 1000), "MANUAL_STOP")
            eng._persist()
        return "🛑 נעצר: כל הפקודות בוטלו וכל הפוזיציות נסגרו. /resume כדי להמשיך."

    def cmd_resume() -> str:
        with lock:
            eng.stopped = False
            eng._persist()
        return "▶️ חזר לפעול (Kill Switch ועצירה שבועית — רק עם /reset_kill או /approve)"

    def cmd_approve() -> str:
        with lock:
            eng.risk.approve_week()
            eng._persist()
        return "✅ העצירה השבועית שוחררה"

    def cmd_reset_kill() -> str:
        with lock:
            eng.risk.reset_kill(broker.equity())
            eng._persist()
        return f"✅ ה-Kill Switch שוחרר. שיא חדש: ${broker.equity():,.2f}"

    def cmd_status() -> str:
        with lock:
            return eng.status()

    tg.handlers.update({"/stop": cmd_stop, "/resume": cmd_resume, "/approve": cmd_approve,
                        "/reset_kill": cmd_reset_kill, "/status": cmd_status})

    running = True

    def on_signal(*_):
        nonlocal running
        running = False
        wake.set()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    start_msg = [f"🤖 daybot עלה · מצב {cfg.mode} · הון ${broker.equity():,.2f}",
                 f"סטאפים פעילים: {', '.join(sorted(allowed)) or 'אין — אף סטאפ לא עבר את הבקטסט, הבוט רק מנטר'}"]
    if calendar_is_stale(int(time.time() * 1000), cfg):
        start_msg.append("⚠️ רשימת החדשות (news_events) ריקה ל-45 הימים הקרובים — עדכן את config.yaml")
    tg.send("\n".join(start_msg + notes))

    last_hb = time.time()
    last_summary_day = None
    last_err = 0.0
    last_min = 0
    while running:
        now = time.time()
        wait = 60 - (now % 60) + 3  # 3 s after the minute closes; the websocket close event can wake us earlier
        wake.wait(timeout=wait)
        wake.clear()
        if not running:
            break
        now_ms = (int(time.time() * 1000) // 60_000) * 60_000
        if now_ms == last_min:
            continue
        time.sleep(1.5)  # let the exchange publish the closed bar
        last_min = now_ms
        try:
            with lock:
                try:
                    md.refresh_slow()
                except Exception as e:
                    log.warning("slow data: %s", e)
                views = {}
                for s in cfg.universe:
                    try:
                        views[s] = md.view(s, now_ms)
                    except Exception as e:
                        log.warning("data %s: %s", s, e)
                if "BTC" not in views:
                    log.warning("no BTC data — no new entries this minute")
                eng.step(now_ms, views if "BTC" in views else {})
        except Exception as e:
            log.exception("step failed")
            if time.time() - last_err > 600:
                tg.send(f"⚠️ שגיאה בלולאה הראשית: {e}")
                last_err = time.time()

        if time.time() - last_hb >= cfg["telegram"]["heartbeat_minutes"] * 60:
            last_hb = time.time()
            tg.send(f"💓 חי · הון ${broker.equity():,.2f} · פוזיציות {len(broker.positions())} · "
                    f"websocket {'תקין' if feed.healthy() else 'מנותק'} · API {'תקין' if broker.ok() else 'בעיה'}")
        loc = datetime.now(tz)
        h, m = map(int, cfg["telegram"]["daily_summary_time"].split(":"))
        if (loc.hour, loc.minute) >= (h, m) and last_summary_day != loc.date():
            last_summary_day = loc.date()
            tg.send(journal.daily_summary(cfg["timezone"]) + f"\nהון: ${broker.equity():,.2f}")
            if calendar_is_stale(now_ms, cfg):
                tg.send("⚠️ אין אירועי חדשות ב-45 הימים הקרובים ב-config.yaml — עדכן את הרשימה")
    feed.stop()
    tg.send("⏹ daybot נעצר (הסטופים נשארים בבורסה)")
    time.sleep(2)


if __name__ == "__main__":
    main()
