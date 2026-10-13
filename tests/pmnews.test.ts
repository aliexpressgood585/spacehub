// pm-news (observation only): headline -> market matching uses RARE shared words only.
import { words, matchScore } from '../scripts/pm-news.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.error('FAIL', m) } }
const df = new Map([['league', 9], ['premier', 6], ['haaland', 1], ['erling', 1], ['zacharia', 1], ['katie', 1]])
ok(matchScore('Barcelona scout Erling Haaland at derby', "Will Erling Haaland win the 2026 Ballon d'Or?", df) === 2, 'two rare names match')
ok(matchScore("Who made Troy's Premier League team of the week?", 'Will Brentford win the 2026-27 English Premier League?', df) === 0, 'common words do not match')
ok(!words('Will the market win this week').size, 'stopwords dropped')
console.log(`pm news: ${n - bad}/${n} passed`)
if (bad) process.exit(1)
