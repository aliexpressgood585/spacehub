import type { VercelRequest, VercelResponse } from '@vercel/node'
import { rateLimit } from './_rateLimit'

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1'

interface NvidiaModel {
  id: string
  owned_by?: string
}

function categorize(id: string): { category: string; label: string } {
  const s = id.toLowerCase()
  if (/whisper|riva|parakeet|speech|tts|audio/.test(s)) return { category: 'speech', label: 'קול ודיבור' }
  if (/stable-diffusion|sdxl|sd3|flux|kolors|image|vision.*gen|dall/.test(s)) return { category: 'image', label: 'יצירת תמונות' }
  if (/embed|rerank|retriev/.test(s)) return { category: 'embedding', label: 'חיפוש סמנטי / Embeddings' }
  if (/bionemo|protein|molmim|genom|dna|esm2|diffdock/.test(s)) return { category: 'bio', label: 'ביולוגיה וכימיה' }
  if (/vila|neva|vlm|vision-language|florence|paligemma/.test(s)) return { category: 'vision-language', label: 'ראייה + שפה (תמונה לטקסט)' }
  return { category: 'llm', label: 'שיחה וטקסט (LLM)' }
}

const CATEGORY_DESC: Record<string, string> = {
  llm: 'מודל שפה לשיחה, מענה על שאלות, כתיבה, סיכום וניתוח טקסט. אפשר לשוחח איתו ישירות בעמוד.',
  'vision-language': 'מבין גם תמונות וגם טקסט - אפשר לשאול שאלות על תמונה, לתאר תוכן חזותי או לנתח מסמכים סרוקים.',
  image: 'יוצר תמונות חדשות מתיאור טקסטואלי (טקסט להמרה לתמונה).',
  speech: 'ממיר דיבור לטקסט או טקסט לדיבור - שימושי לתמלול והפקת קול מלאכותי.',
  embedding: 'ממיר טקסט לוקטורים מספריים לצורך חיפוש סמנטי (RAG) והשוואת דמיון בין מסמכים.',
  bio: 'מודל ייעודי למחקר ביולוגי/כימי - חיזוי מבנה חלבונים, מולקולות וגנום.',
}

const STATIC_MODELS: NvidiaModel[] = [
  { id: 'meta/llama-3.3-70b-instruct' },
  { id: 'meta/llama-3.1-8b-instruct' },
  { id: 'meta/llama-3.1-70b-instruct' },
  { id: 'meta/llama-3.1-405b-instruct' },
  { id: 'meta/llama-3.2-1b-instruct' },
  { id: 'meta/llama-3.2-3b-instruct' },
  { id: 'mistralai/mistral-7b-instruct-v0.3' },
  { id: 'mistralai/mixtral-8x7b-instruct-v0.1' },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1' },
  { id: 'mistralai/mistral-large' },
  { id: 'google/gemma-2-9b-it' },
  { id: 'google/gemma-2-27b-it' },
  { id: 'microsoft/phi-3-mini-128k-instruct' },
  { id: 'microsoft/phi-3-small-128k-instruct' },
  { id: 'microsoft/phi-3-medium-128k-instruct' },
  { id: 'microsoft/phi-3.5-mini-instruct' },
  { id: 'qwen/qwen2-7b-instruct' },
  { id: 'qwen/qwen2.5-7b-instruct' },
  { id: 'qwen/qwen2.5-72b-instruct' },
  { id: 'deepseek-ai/deepseek-r1' },
  { id: 'deepseek-ai/deepseek-r1-distill-llama-70b' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct' },
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1' },
  { id: 'nvidia/mistral-nemo-minitron-8b-8k-instruct' },
  { id: 'ibm/granite-3.0-8b-instruct' },
  { id: 'ibm/granite-3.0-2b-instruct' },
  { id: '01-ai/yi-large' },
  { id: 'nv-mistralai/mistral-nemo-12b-instruct' },
  { id: 'nvidia/vila' },
  { id: 'microsoft/phi-3-vision-128k-instruct' },
  { id: 'meta/llama-3.2-11b-vision-instruct' },
  { id: 'meta/llama-3.2-90b-vision-instruct' },
  { id: 'adept/fuyu-8b' },
  { id: 'nvidia/stable-diffusion-xl' },
  { id: 'stabilityai/stable-diffusion-3-medium' },
  { id: 'black-forest-labs/flux.1-dev' },
  { id: 'black-forest-labs/flux.1-schnell' },
  { id: 'nvidia/nv-embedqa-e5-v5' },
  { id: 'nvidia/nv-embedqa-mistral-7b-v2' },
  { id: 'nvidia/rerank-qa-mistral-4b' },
  { id: 'snowflake/arctic-embed-l' },
  { id: 'nvidia/parakeet-ctc-0.6b-asr' },
  { id: 'nvidia/canary-1b' },
  { id: 'nvidia/riva-tts' },
  { id: 'nvidia/bionemo-esm2-650m' },
  { id: 'nvidia/bionemo-geneformer-10m' },
  { id: 'nvidia/molmim-generate' },
]

async function listModels(res: VercelResponse) {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ error: 'missing_key', models: [] })
    return
  }
  const models = STATIC_MODELS
    .map(m => {
      const { category, label } = categorize(m.id)
      return { id: m.id, ownedBy: m.owned_by || '', category, categoryLabel: label, description: CATEGORY_DESC[category] }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  res.status(200).json({ models })
}

async function chat(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) { res.status(200).json({ error: 'missing_key' }); return }

  const ip = (req.headers['x-forwarded-for'] as string || 'unknown').split(',')[0].trim()
  if (!rateLimit(ip, 15, 60_000)) {
    res.status(429).json({ error: 'rate_limited' })
    return
  }

  const { model, message } = req.body as { model?: string; message?: string }
  if (!model || !message) { res.status(400).json({ error: 'model and message required' }); return }
  if (message.length > 4000) { res.status(400).json({ error: 'message too long' }); return }

  try {
    const r = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: message }],
        max_tokens: 1024,
        temperature: 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await r.json() as { choices?: { message?: { content?: string } }[]; error?: unknown }
    if (!r.ok) {
      res.status(200).json({ error: typeof data.error === 'string' ? data.error : 'nvidia_error' })
      return
    }
    const reply = data.choices?.[0]?.message?.content || ''
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ reply })
  } catch (err: unknown) {
    res.status(200).json({ error: err instanceof Error ? err.message : 'error' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') return chat(req, res)
  return listModels(res)
}
