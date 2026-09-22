"""Read-only Bybit public stream recorder. No trading or model API calls.

Run with Python and websockets installed:
  python scripts/collect-market-data.py --db /persistent/market.sqlite
Public API: https://bybit-exchange.github.io/docs/v5/ws/connect
Raw orderbook snapshots/deltas must be reconstructed before using spread data.
Liquidation S is the liquidated position side; trade S is the taker side.
"""
import argparse
import asyncio
import json
import sqlite3
import time
import uuid

import websockets

SYMBOLS = 'BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH NEAR INJ SUI TRX APT ARB OP ATOM FIL UNI AAVE ICP ALGO SEI WLD TIA RUNE LDO CRV DYDX GALA SAND AXS IMX ENA PEPE WIF FET'.split()


def save(db, session, topic, payload, received):
    db.execute('INSERT INTO events VALUES (?,?,?,?,?)',
               (session, received, payload.get('ts'), topic, json.dumps(payload, separators=(',', ':'))))


async def ping(ws):
    while True:
        await asyncio.sleep(20)
        await ws.send(json.dumps({'op': 'ping'}))


async def collect(path):
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS events (session TEXT, received_ns INTEGER, exchange_ms INTEGER, topic TEXT, payload TEXT)')
    db.execute('CREATE INDEX IF NOT EXISTS events_received ON events(received_ns)')
    delay = 1
    try:
        while True:
            session = str(uuid.uuid4())
            heartbeat = None
            try:
                async with websockets.connect('wss://stream.bybit.com/v5/public/linear',
                                              ping_interval=None, open_timeout=15,
                                              max_size=8_000_000, max_queue=32) as ws:
                    save(db, session, '_connected', {}, time.time_ns())
                    db.commit()
                    for symbol in SYMBOLS:
                        contract = ('1000PEPE' if symbol == 'PEPE' else symbol) + 'USDT'
                        await ws.send(json.dumps({'op': 'subscribe', 'req_id': symbol,
                            'args': [f'allLiquidation.{contract}', f'publicTrade.{contract}',
                                     f'orderbook.1.{contract}']}))
                    heartbeat = asyncio.create_task(ping(ws))
                    committed = time.monotonic()
                    while True:
                        raw = await asyncio.wait_for(ws.recv(), timeout=45)
                        received = time.time_ns()
                        message = json.loads(raw)
                        save(db, session, message.get('topic', '_control'), message, received)
                        if message.get('op') == 'subscribe' and message.get('success') is not True:
                            raise RuntimeError('Subscription rejected: ' + str(message.get('req_id')))
                        if time.monotonic() - committed >= 1:
                            db.commit()
                            committed = time.monotonic()
                            delay = 1
            except (OSError, TimeoutError, websockets.exceptions.WebSocketException, RuntimeError, ValueError) as exc:
                save(db, session, '_disconnected', {'reason': str(exc)}, time.time_ns())
                db.commit()
                print(f'Collector disconnected: {exc}; retry in {delay}s', flush=True)
                await asyncio.sleep(delay)
                delay = min(60, delay * 2)
            finally:
                if heartbeat:
                    heartbeat.cancel()
                    await asyncio.gather(heartbeat, return_exceptions=True)
    finally:
        db.commit()
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, help='SQLite path on a persistent volume')
    args = parser.parse_args()
    try:
        asyncio.run(collect(args.db))
    except KeyboardInterrupt:
        pass
