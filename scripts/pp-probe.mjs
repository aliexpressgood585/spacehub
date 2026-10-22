// one-off reachability probe from the Actions runner: PumpPortal websocket + DexScreener + pump.fun REST. Prints only.
const out = {}
try { const r = await fetch('https://frontend-api-v3.pump.fun/coins?offset=0&limit=5&sort=last_trade_timestamp&order=DESC', { headers: { 'User-Agent': 'spacehub-paper/1.0' }, signal: AbortSignal.timeout(10000) }); out.pumpfun = r.status } catch (e) { out.pumpfun = String(e) }
try { const r = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump', { signal: AbortSignal.timeout(10000) }); out.dexscreener = r.status } catch (e) { out.dexscreener = String(e) }
out.pumpportal = await new Promise((res) => {
  let n = 0, trades = 0, sample = null
  const ws = new WebSocket('wss://pumpportal.fun/api/data')
  const done = (why) => { try { ws.close() } catch {} ; res({ why, msgs: n, trades, sample }) }
  const t = setTimeout(() => done('timeout'), 20000)
  ws.onopen = () => ws.send(JSON.stringify({ method: 'subscribeNewToken' }))
  ws.onmessage = (m) => { n++; const d = JSON.parse(String(m.data)); if (d.txType) { trades++; sample ??= { txType: d.txType, vSol: d.vSolInBondingCurve, vTok: d.vTokensInBondingCurve, mc: d.marketCapSol } } if (trades >= 5) { clearTimeout(t); done('ok') } }
  ws.onerror = (e) => { clearTimeout(t); done('error ' + (e.message || e.type)) }
})
console.log('PROBE ' + JSON.stringify(out))
