// Free local sentiment model for the dtk news demo: FinBERT (Xenova/finbert, int8 ONNX, ~110 MB) run by transformers.js on the
// runner itself. No API, no key, no cost. Downloaded once per runner job into /tmp/hf-cache, then ~2 s to load and ~10 ms per
// headline. Returns positive / negative probabilities per headline; any failure returns an empty map (caller uses the rules alone).
export let lastError = ''
export async function finbertProbs(titles: string[]): Promise<Map<number, { pos: number; neg: number }>> {
  const out = new Map<number, { pos: number; neg: number }>()
  lastError = ''
  if (!titles.length) return out
  try {
    const tf: any = await import('@huggingface/transformers')
    tf.env.cacheDir = '/tmp/hf-cache'
    const clf = await tf.pipeline('text-classification', 'Xenova/finbert', { dtype: 'q8' })
    for (let i = 0; i < titles.length; i++) {
      const r: { label: string; score: number }[] = await clf(titles[i].slice(0, 400), { top_k: 3 })
      const p = (l: string) => r.find((x) => x.label === l)?.score ?? 0
      out.set(i, { pos: p('positive'), neg: p('negative') })
    }
  } catch (e) { lastError = String(e instanceof Error ? e.message : e).slice(0, 300) }
  return out
}
