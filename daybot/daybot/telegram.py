"""Telegram alerts + commands, over the plain Bot API (no extra dependency).
Commands are accepted ONLY from TELEGRAM_CHAT_ID:
  /status   — equity, positions, orders, active blocks
  /stop     — cancel entry orders, close every position at market, halt until /resume
  /resume   — clear /stop (does NOT clear the kill switch or the weekly stop)
  /approve  — clear the weekly -5% stop
  /reset_kill — clear the drawdown kill switch (re-anchors the peak at the current equity)
"""
from __future__ import annotations

import json
import logging
import os
import queue
import threading
import time
import urllib.parse
import urllib.request

log = logging.getLogger("daybot.tg")


class Telegram:
    def __init__(self, token: str | None = None, chat_id: str | None = None, prefix: str = ""):
        self.token = token or os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self.chat = str(chat_id or os.environ.get("TELEGRAM_CHAT_ID", ""))
        self.prefix = prefix
        self.q: queue.Queue[str] = queue.Queue()
        self.handlers: dict[str, callable] = {}
        self._offset = 0
        self.enabled = bool(self.token and self.chat)
        if not self.enabled:
            log.warning("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) — alerts go to the log only")

    def _api(self, method: str, **params) -> dict:
        url = f"https://api.telegram.org/bot{self.token}/{method}"
        data = urllib.parse.urlencode(params).encode()
        with urllib.request.urlopen(url, data=data, timeout=35) as r:
            return json.loads(r.read())

    def send(self, text: str) -> None:
        log.info("ALERT %s", text.replace("\n", " | "))
        if self.enabled:
            self.q.put(f"{self.prefix}{text}")

    def start(self) -> None:
        if not self.enabled:
            return
        threading.Thread(target=self._sender, name="tg-send", daemon=True).start()
        threading.Thread(target=self._poller, name="tg-poll", daemon=True).start()

    def _sender(self) -> None:
        while True:
            text = self.q.get()
            for n in range(3):
                try:
                    self._api("sendMessage", chat_id=self.chat, text=text[:4000])
                    break
                except Exception as e:
                    log.warning("telegram send failed (%d): %s", n + 1, e)
                    time.sleep(2 * (n + 1))

    def _poller(self) -> None:
        while True:
            try:
                r = self._api("getUpdates", offset=self._offset, timeout=30)
                for u in r.get("result", []):
                    self._offset = u["update_id"] + 1
                    msg = u.get("message") or {}
                    if str(msg.get("chat", {}).get("id")) != self.chat:
                        continue  # ignore everyone else
                    cmd = (msg.get("text") or "").strip().split()[0].split("@")[0].lower() if msg.get("text") else ""
                    h = self.handlers.get(cmd)
                    if h:
                        try:
                            self.send(h())
                        except Exception as e:
                            self.send(f"⚠️ הפקודה {cmd} נכשלה: {e}")
            except Exception as e:
                log.warning("telegram poll: %s", e)
                time.sleep(5)
