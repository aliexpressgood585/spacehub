// meme-desk — "ממים חיים" GitHub-Actions runner (.github/workflows/meme-desk.yml): ONE cycle per call, state = meme/state.json
// on the `pm-desk-data` branch. The cycle itself lives in scripts/meme-core.ts (shared with server/meme-live). PAPER ONLY.
// Run: node --experimental-strip-types scripts/meme-desk.ts <state.json>   (env MEME_FEED=<file>: read scripts/meme-feed.ts output
// instead of pump.fun, which refuses GitHub runners)
import fs from 'node:fs'
import { cycle, freshState, feedSource, pumpSource } from './meme-core.ts'

const FILE = process.argv[2] ?? 'meme/state.json'
const dir = FILE.replace(/[^/]*$/, '') || './'
const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : freshState()
const src = process.env.MEME_FEED ? feedSource(process.env.MEME_FEED) : pumpSource
const note = await cycle(st, (day, lines) => fs.appendFileSync(`${dir}paths-${day}.jsonl`, lines.join('\n') + '\n'), 2000, src)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(FILE + '.tmp', JSON.stringify(st)); fs.renameSync(FILE + '.tmp', FILE)
console.log(JSON.stringify({ ...note, cash: st.cash.toFixed(2), err: st.last_error }))
