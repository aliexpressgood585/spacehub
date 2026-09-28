import assert from 'node:assert/strict'
import { trendPullback } from '../shared/trend-pullback.ts'
const bars=Array.from({length:160},(_,i)=>({t:i*300000,o:100+i*.05-.02,h:100+i*.05+.08,l:100+i*.05-.08,c:100+i*.05}))
// 24-bar breakout, pullback, then bullish confirmation.
bars.push({t:160*300000,o:108,h:108.3,l:107.95,c:108.2})
bars.push({t:161*300000,o:108.15,h:108.2,l:107.97,c:108.02})
bars.push({t:162*300000,o:108.03,h:108.18,l:108.0,c:108.14})
const a=trendPullback(bars)
assert.equal(a?.side,1,'confirmed long')
assert.ok(a!.stop<bars.at(-1)!.c)
const short=bars.map(b=>({t:b.t,o:220-b.o,c:220-b.c,h:220-b.l,l:220-b.h}))
assert.equal(trendPullback(short)?.side,-1,'confirmed short')
assert.equal(trendPullback(bars.slice(0,160)),null,'no breakout and retest')
assert.equal(trendPullback(bars.slice(0,100)),null,'short history')
const gap=structuredClone(bars);gap[40].t+=1;assert.equal(trendPullback(gap),null,'gap')
const bad=structuredClone(bars);bad[100].c=NaN;assert.equal(trendPullback(bad),null,'invalid feed')
const flat=bars.map(b=>({...b,o:100,h:100,l:100,c:100}));assert.equal(trendPullback(flat),null,'flat market')
const failure=structuredClone(bars);failure.at(-1)!.c=107.95;failure.at(-1)!.l=107.9;assert.equal(trendPullback(failure),null,'failed retest')
console.log('PASS: long, short, no signal, short history, data gaps, invalid price, flat market, failed retest')
