// Public futures candles. No API key. Binance first, then Bybit (same contract symbol), then OKX.

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }

const OKX_BAR: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1D',
}
const BYBIT_IV: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '1d': 'D',
}

function okxInst(symbol: string): { id: string; k: number } | null {
  const base = symbol.replace(/USDT$/, '')
  if (!base) return null
  if (/^1000[A-Z]/.test(base)) return { id: `${base.slice(4)}-USDT-SWAP`, k: 1000 }
  return { id: `${base}-USDT-SWAP`, k: 1 }
}

function mapBinance(rows: any[]): Bar[] {
  return rows
    .map((x) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[7] || +x[5] || 0 }))
    .filter((b) => b.t > 0 && b.c > 0)
}

const down = new Set<string>()

async function getJson(url: string, host: string): Promise<any | null> {
  if (down.has(host)) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!r.ok) { down.add(host); return null }
    return await r.json()
  } catch {
    down.add(host)
    return null
  }
}

async function binance(symbol: string, interval: string, limit: number, endTime?: number): Promise<Bar[] | null> {
  const q = `symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`
  const tail = endTime ? `&endTime=${endTime}` : ''
  const urls: [string, string][] = [
    ['fapi', `https://fapi.binance.com/fapi/v1/klines?${q}${tail}`],
    ['vision', `https://data-api.binance.vision/fapi/v1/klines?${q}${tail}`],
  ]
  for (const [host, u] of urls) {
    const d = await getJson(u, host)
    if (Array.isArray(d) && d.length) return mapBinance(d)
  }
  return null
}

async function bybit(symbol: string, interval: string, limit: number): Promise<Bar[] | null> {
  const iv = BYBIT_IV[interval]
  if (!iv) return null
  const d = await getJson(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${iv}&limit=${Math.min(1000, limit)}`, 'bybit')
  const list = d?.result?.list
  if (d?.retCode !== 0 || !Array.isArray(list) || !list.length) return null
  return list
    .map((x: string[]) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[6] || +x[5] || 0 }))
    .filter((b: Bar) => b.t > 0 && b.c > 0)
    .reverse()
}

async function okx(symbol: string, interval: string, limit: number): Promise<Bar[] | null> {
  const inst = okxInst(symbol)
  const bar = OKX_BAR[interval]
  if (!inst || !bar) return null
  const d = await getJson(`https://www.okx.com/api/v5/market/candles?instId=${inst.id}&bar=${bar}&limit=${Math.min(300, limit)}`, 'okx')
  if (d?.code !== '0' || !Array.isArray(d.data) || !d.data.length) return null
  const k = inst.k
  return d.data
    .map((x: string[]) => ({ t: +x[0], o: +x[1] * k, h: +x[2] * k, l: +x[3] * k, c: +x[4] * k, v: +x[7] || +x[5] || 0 }))
    .filter((b: Bar) => b.t > 0 && b.c > 0)
    .reverse()
}

export async function futuresKlines(symbol: string, interval: string, limit = 400, earliestMs?: number): Promise<{ bars: Bar[]; src: string }> {
  let src = 'Binance Futures'
  let bars = await binance(symbol, interval, limit)
  if (!bars) {
    bars = await bybit(symbol, interval, limit)
    src = 'Bybit'
  }
  if (!bars) {
    bars = await okx(symbol, interval, limit)
    src = 'OKX'
  }
  if (!bars?.length) throw new Error('no candles')
  if (earliestMs && bars[0].t > earliestMs + 60_000 && src === 'Binance Futures') {
    const older = await binance(symbol, interval, limit, bars[0].t - 1)
    if (older?.length) {
      const seen = new Set(bars.map((b) => b.t))
      bars = [...older.filter((b) => !seen.has(b.t)), ...bars].sort((a, b) => a.t - b.t)
    }
  }
  return { bars, src }
}
