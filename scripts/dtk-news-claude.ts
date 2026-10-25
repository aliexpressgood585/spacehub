// Claude sentiment scorer for the dtk news demo (era 3). Loaded by scripts/dtk-scan.ts ONLY when ANTHROPIC_API_KEY is set on the
// runner (a GitHub Actions secret; the SDK reads it from the environment, it never appears in code or state). One request scores a
// batch of headlines 1-10 for the coins they name. Any failure returns an empty map and the caller falls back to the keyword list.
import Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'
const SYSTEM = `You score crypto news headlines for a paper-trading demo. For each headline, judge how it is likely to move the price of the coin(s) it names over the next hours.
Score 1-10: 10 = euphoric, clearly very bullish for that coin; 8-9 = clearly bullish; 5-6 = neutral, routine, price recap or opinion; 2-3 = clearly bearish; 1 = panic.
A headline that only reports a price move that already happened is neutral (5). Be strict: reserve 9-10 for concrete, material good news (approval, major listing, large adoption, record inflows).
Return one entry per id with a short reason (max 12 words).`

export async function claudeScores(items: { id: number; title: string; coins: string[] }[]): Promise<Map<number, { score: number; why: string }>> {
  const out = new Map<number, { score: number; why: string }>()
  if (!items.length) return out
  try {
    const client = new Anthropic()
    const res: any = await (client.beta.messages.create as any)({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object', additionalProperties: false, required: ['scores'],
            properties: { scores: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'score', 'why'], properties: { id: { type: 'integer' }, score: { type: 'integer' }, why: { type: 'string' } } } } },
          },
        },
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: items.map((x) => `${x.id}. [${x.coins.join(', ')}] ${x.title}`).join('\n') }],
    })
    if (res.stop_reason === 'refusal') return out
    const text = (res.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    for (const s of JSON.parse(text).scores ?? []) if (Number.isFinite(s.score)) out.set(s.id, { score: Math.max(1, Math.min(10, s.score)), why: String(s.why ?? '').slice(0, 120) })
  } catch (e) { console.log(`claude scorer: ${e instanceof Error ? e.message : e}`) }
  return out
}
