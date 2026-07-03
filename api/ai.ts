import type { VercelRequest, VercelResponse } from '@vercel/node'

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1'

const rateLimitStore = new Map<string, { count: number; reset: number }>()
function rateLimit(ip: string, limit = 15, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  if (!entry || now > entry.reset) { rateLimitStore.set(ip, { count: 1, reset: now + windowMs }); return true }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

function categorize(id: string): { category: string; label: string } {
  const s = id.toLowerCase()
  if (/whisper|riva|parakeet|speech|tts|audio/.test(s)) return { category: 'speech', label: 'קול ודיבור' }
  if (/stable-diffusion|sdxl|sd3|flux|kolors|image|vision.*gen|dall/.test(s)) return { category: 'image', label: 'יצירת תמונות' }
  if (/embed|rerank|retriev/.test(s)) return { category: 'embedding', label: 'חיפוש סמנטי' }
  if (/bionemo|protein|molmim|genom|dna|esm2|diffdock/.test(s)) return { category: 'bio', label: 'ביולוגיה וכימיה' }
  if (/vila|neva|vlm|vision-language|florence|paligemma/.test(s)) return { category: 'vision-language', label: 'ראייה + שפה' }
  return { category: 'llm', label: 'שיחה וטקסט (LLM)' }
}

const CATEGORY_DESC: Record<string, string> = {
  llm: 'מודל שפה לשיחה, מענה על שאלות, כתיבה, סיכום וניתוח טקסט.',
  'vision-language': 'מבין גם תמונות וגם טקסט - אפשר לשאול שאלות על תמונה.',
  image: 'יוצר תמונות חדשות מתיאור טקסטואלי.',
  speech: 'ממיר דיבור לטקסט או טקסט לדיבור.',
  embedding: 'ממיר טקסט לוקטורים לחיפוש סמנטי (RAG).',
  bio: 'מודל ייעודי למחקר ביולוגי/כימי.',
}

const MODELS = [
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-405b-instruct',
  'meta/llama-3.2-1b-instruct',
  'meta/llama-3.2-3b-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
  'mistralai/mixtral-8x7b-instruct-v0.1',
  'mistralai/mixtral-8x22b-instruct-v0.1',
  'mistralai/mistral-large',
  'google/gemma-2-9b-it',
  'google/gemma-2-27b-it',
  'microsoft/phi-3-mini-128k-instruct',
  'microsoft/phi-3-small-128k-instruct',
  'microsoft/phi-3-medium-128k-instruct',
  'microsoft/phi-3.5-mini-instruct',
  'qwen/qwen2-7b-instruct',
  'qwen/qwen2.5-7b-instruct',
  'qwen/qwen2.5-72b-instruct',
  'deepseek-ai/deepseek-r1',
  'deepseek-ai/deepseek-r1-distill-llama-70b',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/llama-3.3-nemotron-super-49b-v1',
  'nvidia/mistral-nemo-minitron-8b-8k-instruct',
  'ibm/granite-3.0-8b-instruct',
  'ibm/granite-3.0-2b-instruct',
  'nv-mistralai/mistral-nemo-12b-instruct',
  'nvidia/vila',
  'microsoft/phi-3-vision-128k-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'meta/llama-3.2-90b-vision-instruct',
  'nvidia/stable-diffusion-xl',
  'stabilityai/stable-diffusion-3-medium',
  'black-forest-labs/flux.1-dev',
  'black-forest-labs/flux.1-schnell',
  'nvidia/nv-embedqa-e5-v5',
  'nvidia/nv-embedqa-mistral-7b-v2',
  'nvidia/rerank-qa-mistral-4b',
  'snowflake/arctic-embed-l',
  'nvidia/parakeet-ctc-0.6b-asr',
  'nvidia/canary-1b',
  'nvidia/bionemo-esm2-650m',
  'nvidia/molmim-generate',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) {
    return res.status(200).json({ error: 'missing_key', models: [] })
  }

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${NVIDIA_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) {
        const data = await r.json() as { data: { id: string; owned_by?: string }[] }
        const models = (data.data || []).map(m => {
          const { category, label } = categorize(m.id)
          return { id: m.id, ownedBy: m.owned_by || 'nvidia', category, categoryLabel: label, description: CATEGORY_DESC[category] || '' }
        }).sort((a, b) => a.id.localeCompare(b.id))
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
        return res.status(200).json({ models })
      }
    } catch { /* fall through to static list */ }

    const models = MODELS.map(id => {
      const { category, label } = categorize(id)
      return { id, ownedBy: 'nvidia', category, categoryLabel: label, description: CATEGORY_DESC[category] || '' }
    }).sort((a, b) => a.id.localeCompare(b.id))
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ models })
  }

  if (req.method === 'POST') {
    const ip = ((req.headers['x-forwarded-for'] as string) || 'unknown').split(',')[0].trim()
    if (!rateLimit(ip)) return res.status(429).json({ error: 'rate_limited' })

    const { model, message } = req.body as { model?: string; message?: string }
    if (!model || !message) return res.status(400).json({ error: 'missing params' })
    if (message.length > 4000) return res.status(400).json({ error: 'message too long' })

    try {
      const r = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: message }],
          max_tokens: 1024,
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await r.json() as { choices?: { message?: { content?: string } }[]; error?: unknown }
      if (!r.ok) return res.status(200).json({ error: 'nvidia_error' })
      return res.status(200).json({ reply: data.choices?.[0]?.message?.content || '' })
    } catch (err: unknown) {
      return res.status(200).json({ error: err instanceof Error ? err.message : 'error' })
    }
  }

  return res.status(405).json({ error: 'method not allowed' })
}
