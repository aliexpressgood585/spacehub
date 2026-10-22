// Minimal, dependency-free Solana helpers for the meme desk: base58, the pump.fun bonding-curve PDA and the curve account
// layout. Read-only public RPC (getMultipleAccounts). PAPER ONLY: nothing here signs or sends a transaction.
import { createHash } from 'node:crypto'

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function b58decode(s: string): Uint8Array {
  let n = 0n
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i) }
  const bytes: number[] = []
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n }
  for (const ch of s) { if (ch === '1') bytes.unshift(0); else break }
  return Uint8Array.from(bytes)
}
export function b58encode(b: Uint8Array): string {
  let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x)
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n }
  for (const x of b) { if (x === 0) s = '1' + s; else break }
  return s
}

// ed25519: is a 32-byte string a valid compressed point? (a PDA must NOT be one)
const P = 2n ** 255n - 19n
const D = (-121665n * inv(121666n)) % P
function mod(a: bigint) { const r = a % P; return r < 0n ? r + P : r }
function pow(b: bigint, e: bigint) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n } return r }
function inv(a: bigint) { return pow(a, P - 2n) }
export function onCurve(k: Uint8Array): boolean {
  const c = Uint8Array.from(k); c[31] &= 0x7f
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(c[i])
  if (y >= P) return false
  const y2 = y * y % P, num = mod(y2 - 1n), den = mod(D * y2 + 1n)
  const x2 = num * inv(den) % P
  if (x2 === 0n) return true
  return pow(x2, (P - 1n) / 2n) === 1n          // Euler: x^2 must be a square
}

export function findPda(seeds: Uint8Array[], program: string): string {
  const prog = b58decode(program)
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash('sha256')
    for (const s of seeds) h.update(s)
    h.update(Uint8Array.of(bump)); h.update(prog); h.update(Buffer.from('ProgramDerivedAddress'))
    const out = new Uint8Array(h.digest())
    if (!onCurve(out)) return b58encode(out)
  }
  throw new Error('no PDA')
}

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
export const bondingCurveOf = (mint: string) => findPda([Buffer.from('bonding-curve'), b58decode(mint)], PUMP_PROGRAM)

// pump.fun BondingCurve account: 8-byte discriminator, then u64 LE virtual tokens, virtual SOL, real tokens, real SOL,
// total supply, bool complete
export type CurveAcct = { vT: number; vS: number; rT: number; rS: number; complete: boolean }
export function parseCurve(b64: string): CurveAcct | null {
  const b = Buffer.from(b64, 'base64'); if (b.length < 49) return null
  return { vT: Number(b.readBigUInt64LE(8)), vS: Number(b.readBigUInt64LE(16)), rT: Number(b.readBigUInt64LE(24)),
    rS: Number(b.readBigUInt64LE(32)), complete: b[48] === 1 }
}

export const RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com']
let rpcIx = 0
// up to 100 accounts per call; rotates public endpoints on failure; null entries = account missing
export async function getCurves(keys: string[]): Promise<(CurveAcct | null)[]> {
  const out: (CurveAcct | null)[] = []
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100); let err: any
    for (let a = 0; a < RPCS.length; a++) {
      const url = RPCS[(rpcIx + a) % RPCS.length]
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [chunk, { encoding: 'base64' }] }) })
        if (!r.ok) throw new Error(`rpc ${r.status}`)
        const d: any = await r.json(); if (!d.result) throw new Error('rpc ' + JSON.stringify(d.error ?? d).slice(0, 80))
        for (const v of d.result.value) out.push(v ? parseCurve(v.data[0]) : null)
        rpcIx = (rpcIx + a) % RPCS.length; err = null; break
      } catch (e) { err = e }
    }
    if (err) throw err
  }
  return out
}
