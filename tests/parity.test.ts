// ════════════════════════════════════════════════════════════════════════════
// tests/parity.test.ts — the live bot and the backtest must run the SAME rules.
//
// tests/strategy.test.ts proves the shared module is correct. This file proves
// that the two consumers actually USE it, and have not quietly grown a second
// copy of a rule beside it.
//
// It is a source-text test on purpose. The alternative — importing both files
// and comparing behaviour — cannot work: the bot needs Deno, Supabase and the
// network at module scope, and the backtest reads CSVs off disk. A structural
// assertion that runs anywhere, in milliseconds, with no fixtures, catches the
// specific failure that cost us v79bt: a constant or a formula drifting on one
// side while the other is never touched.
//
//     node --experimental-strip-types tests/parity.test.ts
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

declare const process: { exit(code: number): never }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOT = join(root, 'supabase/functions/trading-bot/index.ts')
const BT = join(root, 'backtest/backtest.ts')

const bot = readFileSync(BOT, 'utf8')
const bt = readFileSync(BT, 'utf8')

let passed = 0
const failures: string[] = []
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

/** Source with comments and string literals removed, so a rule quoted in prose
 *  (or in a log line) is never mistaken for a rule the code executes. This is
 *  the exact trap the first draft of scripts/acceptance-check.sh fell into: it
 *  reported a failure for a field name that survived only inside a comment. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map(l => {
      const i = l.indexOf('//')
      if (i < 0) return l
      // keep '//' that is inside a string or a URL
      const before = l.slice(0, i)
      const quotes = (before.match(/['"`]/g) || []).length
      if (quotes % 2 === 1 || before.endsWith(':')) return l
      return before
    })
    .join('\n')
    .replace(/`[^`]*`/g, '``')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
}

const botCode = code(bot)
const btCode = code(bt)

// ─── 1. both sides import the shared module ─────────────────────────────────
check('the live bot imports shared/strategy.ts',
  /import \* as S from ['"]\.\.\/\.\.\/\.\.\/shared\/strategy\.ts['"]/.test(bot))
check('the backtest imports shared/strategy.ts',
  /import \* as S from ['"]\.\.\/shared\/strategy\.ts['"]/.test(bt))

// The bot is deployed as a remote import pinned to a commit SHA, so a relative
// path resolves against that same SHA. An absolute or bare specifier would
// silently un-pin the strategy from the release.
check('the bot imports the module by relative path, so it stays pinned to the release SHA',
  !/from ['"]https?:\/\/[^'"]*strategy\.ts['"]/.test(bot))

// ─── 2. neither side keeps its own copy of an indicator ─────────────────────
for (const [label, src] of [['live bot', botCode], ['backtest', btCode]] as const) {
  check(`the ${label} does not define its own calcATR`,
    !/function\s+calcATR\s*\(/.test(src))
  check(`the ${label} does not define its own calcADX`,
    !/function\s+calcADX\s*\(/.test(src))
  check(`the ${label} takes calcATR from the shared module`,
    /calcATR\s*=\s*S\.calcATR/.test(src))
  check(`the ${label} takes calcADX from the shared module`,
    /calcADX\s*=\s*S\.calcADX/.test(src))
}

// ─── 3. no second copy of a tuned constant in the live bot ──────────────────
// Each of these cost a validation batch. A literal reappearing here means
// someone has a number the other side cannot see.
const forbiddenLiterals: [string, RegExp, string][] = [
  ['the ADX tier table', /adx4?\s*>\s*45\s*\?\s*2\.0/, 'use S.adxTierMult'],
  ['the Donchian window', /slice\(\s*-16\s*,\s*-1\s*\)/, 'use S.donchSignal'],
  ['the stop multiplier', /atr4\s*\*\s*1\.4/, 'use S.stopDistance'],
  ['the trail ratio', /\(\s*2\.5\s*\/\s*1\.4\s*\)/, 'use S.TRAIL_ATR_MULT / S.SL_ATR_MULT'],
  ['the base risk', /BASE_RISK_PCT\s*=\s*0\.0/, 'use S.BASE_RISK_PCT'],
  ['the heat cap', /MAX_HEAT_PCT\s*=\s*0\.9/, 'use S.MAX_HEAT_PCT'],
  ['the taker fee', /const FEE\s*=\s*0\.0005/, 'use S.FEE_TAKER'],
  ['the maker fee', /FEE_MAKER\s*=\s*0\.0002/, 'use S.FEE_MAKER'],
  ['the slippage assumption', /const SLIP\s*=\s*0\.0003/, 'use S.SLIP'],
  ['the ROTA parameters', /ROTA_K\s*=\s*8/, 'use S.ROTA_K'],
]
for (const [what, re, fix] of forbiddenLiterals) {
  check(`the live bot no longer hardcodes ${what}`, !re.test(botCode), fix)
}

// The 40-coin universe must have exactly one owner (standing rule 2).
// Matched by its tail rather than its head: the bot legitimately contains short
// probe lists that start ['BTC','ETH','SOL',…], and a check that fires on those
// is a check that gets ignored.
const universeLiteral = /'PEPE'\s*,\s*'WIF'\s*,\s*'FET'/
check('the live bot does not re-declare the 40-coin universe', !universeLiteral.test(bot),
  'use S.CRYPTO_40 — one list, or the release hash lies')
check('the backtest does not re-declare the 40-coin universe as its own pin',
  !/const\s+CORE40\s*=\s*new Set\(\[/.test(bt),
  'CORE40 must derive from S.CRYPTO_40')

// ─── 4. the paper-only lock is intact ───────────────────────────────────────
// Not a strategy rule, but the one invariant that must never regress, and the
// cheapest possible place to assert it.
check('ALLOW_LIVE_EXECUTION is the outermost gate',
  /const ALLOW_LIVE\s*=\s*Deno\.env\.get\(['"]ALLOW_LIVE_EXECUTION['"]\)\s*===\s*['"]true['"]/.test(bot))
check('paper mode cannot be turned off by a database column alone',
  /const paperMode\s*=\s*!ALLOW_LIVE/.test(bot))
check('live execution additionally requires LIVE_TRADING and both keys',
  /liveMode\s*=\s*ALLOW_LIVE\s*&&/.test(bot) &&
  /LIVE_TRADING['"]\)\s*===\s*['"]1['"]/.test(bot) &&
  /BYBIT_API_KEY/.test(bot) && /BYBIT_API_SECRET/.test(bot))
check('ALLOW_LIVE_EXECUTION is set nowhere in this repo',
  !/ALLOW_LIVE_EXECUTION\s*[:=]\s*['"]?true/.test(bot))

// ─── 5. the retired engine stays retired ────────────────────────────────────
check('no trade insert is left untagged (the LEGACY column default)',
  (() => {
    const inserts = bot.match(/from\(['"]bot_trades['"]\)\.insert\(/g) || []
    const tagged = bot.match(/strategy:\s*['"](DONCH4H|ROTA)['"]/g) || []
    return inserts.length > 0 && tagged.length >= inserts.length
  })(), 'every bot_trades insert must carry an explicit strategy')

// ─── 6. bars carry their timestamps ─────────────────────────────────────────
// "real bar timestamps, not i*timeframe" — the bot threw the open time away on
// every feed until v59.0, which made bar-alignment unanswerable on the live side.
check('every kline mapper keeps the bar open time',
  (() => {
    const mappers = botCode.match(/map\(k\s*=>\s*\(\{[^}]*open:\+k\[1\]/g) || []
    const withT = botCode.match(/map\(k\s*=>\s*\(\{t:\+k\[0\],open:\+k\[1\]/g) || []
    return mappers.length > 0 && withT.length === mappers.length
  })(), 'a feed that drops `t` cannot be checked for staleness')

// ─── 7. no secrets in source ────────────────────────────────────────────────
for (const [label, src] of [['live bot', bot], ['backtest', bt]] as const) {
  check(`no service-role JWT is hardcoded in the ${label}`,
    !/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/.test(src))
  check(`no Bybit key literal in the ${label}`,
    !/(BYBIT_API_KEY|BYBIT_API_SECRET)\s*=\s*['"][A-Za-z0-9]{8,}/.test(src))
}

// ─── 8. the learning reads back every field it writes ───────────────────────
// v83.2: the agent_stats select omitted `ev`, so each cycle restarted the event count at 0,
// wrote 1 back, and k = n/ev deflated every corrected t to ~0 — no agent could ever be proven
// and the factory could never promote. Every Stat field must round-trip through the select.
{
  // raw source on purpose: the select list IS a string literal, which code() strips
  const runner = readFileSync(join(root, 'supabase/functions/trading-bot/scalp-runner.ts'), 'utf8')
  const sel = runner.match(/from\(\s*'agent_stats'\s*\)\s*\.select\(\s*'([^']*)'/)
  check('the scalp runner reads agent_stats with an explicit select', !!sel)
  for (const f of ['agent', 'n', 's', 's2', 'ev', 'updated_at'])
    check(`agent_stats select reads back \`${f}\``, !!sel && sel[1].split(',').map(x => x.trim()).includes(f), sel?.[1] ?? 'no select')
}

// ─── report ─────────────────────────────────────────────────────────────────
console.log(`\n  live/backtest parity — ${passed} assertions passed, ${failures.length} failed`)
if (failures.length) {
  console.log('')
  for (const f of failures) console.log(`   FAIL  ${f}`)
  console.log('')
  process.exit(1)
}
console.log('  OK\n')
