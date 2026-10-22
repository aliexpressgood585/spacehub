// one-off reachability probe from the Actions runner: public Solana RPC (pump.fun curve account) + SOL price. Prints only.
const out = {}
const curve = 'CEkTGsKT33V98pzdN4j33cJFwCp9JdHC9FjATgNGqZyd'
for (const url of ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com']) {
  try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [[curve], { encoding: 'base64' }] }) })
    const d = await r.json(); out[url] = [r.status, d.result ? 'ok' : JSON.stringify(d).slice(0, 120)]
    let ok = 0; for (let i = 0; i < 20; i++) { const q = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [[curve], { encoding: 'base64' }] }) }); if (q.ok) ok++ }
    out[url].push(`burst ${ok}/20`)
  } catch (e) { out[url] = String(e) }
}
for (const u of ['https://data-api.binance.vision/api/v3/ticker/price?symbol=SOLUSDT', 'https://api.exchange.coinbase.com/products/SOL-USD/ticker']) {
  try { const r = await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0' }, signal: AbortSignal.timeout(10000) }); out[u.slice(8, 30)] = [r.status, (await r.text()).slice(0, 60)] } catch (e) { out[u] = String(e) }
}
console.log('PROBE ' + JSON.stringify(out))
