"""Telegram alerts (entries, exits, errors, kill-switch). Needs env TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID;
without them alerts are logged only. An alert never raises: a failed notification must not stop the trader."""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.request

log = logging.getLogger("quant.alerts")


class Alerts:
    def __init__(self, enabled: bool = True, env: dict | None = None, sender=None, min_interval_s: float = 1.0):
        env = os.environ if env is None else env
        self.token, self.chat = env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_CHAT_ID")
        self.enabled = bool(enabled and self.token and self.chat)
        self.sender = sender or self._send
        self.min_interval_s = min_interval_s
        self._last = 0.0
        self.sent: list[str] = []

    def _send(self, text: str) -> None:
        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        data = json.dumps({"chat_id": self.chat, "text": text[:4000]}).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5).read()

    def send(self, kind: str, text: str) -> None:
        msg = f"[{kind}] {text}"
        log.info(msg)
        self.sent.append(msg)
        if not self.enabled:
            return
        try:
            wait = self.min_interval_s - (time.time() - self._last)
            if wait > 0:
                time.sleep(wait)
            self.sender(msg)
            self._last = time.time()
        except Exception as e:  # noqa: BLE001 — alerts must never break trading
            log.warning("telegram alert failed: %s", type(e).__name__)
