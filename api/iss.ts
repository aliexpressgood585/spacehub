import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { fetchIssTle, predictPasses, describePass, compass, type Pass } from './_issPasses.js'

// ISS endpoint. Live position by default, plus the push-alert surface:
//   GET                     -> live ISS position/altitude/velocity
//   GET  ?action=vapid      -> VAPID public key for pushManager.subscribe()
//   POST ?action=subscribe  -> register/refresh a subscription + its location
//   POST ?action=unsub      -> drop a subscription
//   GET  ?action=cron       -> (CRON_SECRET) send ISS pass alerts that are due
//
// Push lives here rather than in its own api/push.ts purely to respect the
// 12-function Vercel Hobby ceiling this project is already at. For the same
// reason the cron runs once a day: Hobby rejects any schedule more frequent
// than daily, and an invalid schedule fails the whole deployment. That makes
// the nightly digest the primary alert; the 20-minute "overhead soon" ping
// only fires on plans that allow a frequent cron.

const SUPABASE_URL = process.env.PUSH_SUPABASE_URL || process.env.ANALYTICS_SUPABASE_URL || ''
const SERVICE_KEY = process.env.PUSH_SUPABASE_SERVICE_KEY || ''
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@spacehubapp.com'
const CRON_SECRET = process.env.CRON_SECRET || ''

const pushConfigured = () => Boolean(SUPABASE_URL && SERVICE_KEY && VAPID_PUBLIC && VAPID_PRIVATE)

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

interface SubRow {
  endpoint: string
  p256dh: string
  auth: string
  lat: number | null
  lng: number | null
  city: string | null
  tz: string | null
  last_sent_at: string | null
  last_pass_at: string | null
}

const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

const rateStore = new Map<string, { count: number; reset: number }>()
function rateLimit(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateStore.get(ip)
  if (!entry || now > entry.reset) {
    rateStore.set(ip, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || '')

  // Public: hand out the VAPID key so the client can subscribe.
  if (action === 'vapid') {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json({ key: VAPID_PUBLIC || null })
  }

  // Vercel attaches `Authorization: Bearer $CRON_SECRET` to scheduled
  // invocations. Recognising that directly means the cron still works even if
  // the query string in the schedule's path is dropped — otherwise a cron run
  // would silently fall through and just return the ISS position.
  const isCronRequest =
    Boolean(CRON_SECRET) && req.headers.authorization === `Bearer ${CRON_SECRET}`

  if (action === 'subscribe' || action === 'unsub' || action === 'cron' || isCronRequest) {
    if (!pushConfigured()) return res.status(503).json({ error: 'push not configured' })
    if (action === 'subscribe') return subscribe(req, res)
    if (action === 'unsub') return unsubscribe(req, res)
    return runCron(req, res)
  }

  return livePosition(res)
}

async function livePosition(res: VercelResponse) {
  try {
    const [posRes, tleRes] = await Promise.all([
      fetch('https://api.open-notify.org/iss-now.json', { signal: AbortSignal.timeout(8000) }),
      fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', { signal: AbortSignal.timeout(8000) }),
    ])

    if (!posRes.ok) throw new Error(`position feed ${posRes.status}`)
    const posData = await posRes.json() as { iss_position: { latitude: string; longitude: string }; timestamp: number }

    // Derive altitude and velocity from TLE mean motion (Kepler's 3rd law)
    let altitude = 420
    let velocity = 27600
    if (tleRes.ok) {
      const tle = await tleRes.text()
      const line2 = tle.trim().split('\n').find((l: string) => l.trim().startsWith('2 '))
      if (line2) {
        const meanMotion = parseFloat(line2.slice(52, 63)) // rev/day
        const mu = 398600.4418 // km³/s²
        const T = 86400 / meanMotion
        const a = Math.cbrt(mu * Math.pow(T / (2 * Math.PI), 2))
        altitude = Math.round(a - 6371)
        velocity = Math.round(Math.sqrt(mu / a) * 3600) // km/h
      }
    }

    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10')
    res.json({
      latitude: parseFloat(posData.iss_position.latitude),
      longitude: parseFloat(posData.iss_position.longitude),
      altitude,
      velocity,
      timestamp: posData.timestamp,
    })
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      error: err instanceof Error ? err.message : 'upstream error',
      latitude: 0,
      longitude: 0,
      altitude: 420,
      velocity: 27600,
      timestamp: Math.floor(Date.now() / 1000),
    })
  }
}

async function subscribe(req: VercelRequest, res: VercelResponse) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (!rateLimit(ip)) return res.status(429).json({ error: 'rate_limited' })

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}
  const sub = body.subscription
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: 'invalid subscription' })
  }
  if (!/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 800) {
    return res.status(400).json({ error: 'invalid endpoint' })
  }

  const lat = Number.isFinite(Number(body.lat)) ? Math.max(-90, Math.min(90, Number(body.lat))) : null
  const lng = Number.isFinite(Number(body.lng)) ? Math.max(-180, Math.min(180, Number(body.lng))) : null

  const row = {
    endpoint: String(sub.endpoint),
    p256dh: String(sub.keys.p256dh).slice(0, 200),
    auth: String(sub.keys.auth).slice(0, 100),
    lat,
    lng,
    city: body.city ? String(body.city).slice(0, 80) : null,
    tz: body.tz ? String(body.tz).slice(0, 60) : null,
    updated_at: new Date().toISOString(),
  }

  const r = await sb('/push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
  if (!r.ok) return res.status(502).json({ error: 'store failed' })
  return res.status(200).json({ ok: true })
}

async function unsubscribe(req: VercelRequest, res: VercelResponse) {
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}
  if (!body.endpoint) return res.status(400).json({ error: 'endpoint required' })
  await sb(`/push_subscriptions?endpoint=eq.${encodeURIComponent(String(body.endpoint))}`, {
    method: 'DELETE',
  })
  return res.status(200).json({ ok: true })
}

async function runCron(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization || ''
  const ok = CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || req.query.secret === CRON_SECRET)
  if (!ok) return res.status(401).json({ error: 'unauthorized' })

  const tle = await fetchIssTle()
  if (!tle) return res.status(502).json({ error: 'tle unavailable' })

  const listed = await sb('/push_subscriptions?select=*&lat=not.is.null&limit=2000')
  if (!listed.ok) return res.status(502).json({ error: 'read failed' })
  const subs = (await listed.json()) as SubRow[]

  const now = new Date()
  let imminent = 0
  let digests = 0
  let removed = 0

  for (const s of subs) {
    if (s.lat == null || s.lng == null) continue

    let passes: Pass[]
    try {
      passes = predictPasses(tle[0], tle[1], s.lat, s.lng, now, 24).filter(p => p.visible)
    } catch {
      continue
    }
    if (!passes.length) continue

    const next = passes[0]
    const minsAway = (next.start.getTime() - now.getTime()) / 60_000
    const alreadySent = s.last_pass_at === next.start.toISOString()

    let payload: { title: string; body: string; url: string } | null = null

    if (minsAway <= 20 && minsAway > 0 && !alreadySent) {
      // The alert the UI actually promises: shortly before it flies over.
      payload = {
        title: '🛰️ ISS overhead soon',
        body: `Look up in ${Math.round(minsAway)} min — ${Math.round(next.maxElevation)}° high, rising in the ${compass(next.startAzimuth)}.`,
        url: '/tools/iss-tracker',
      }
    } else {
      // Otherwise a once-a-day heads-up listing tonight's visible passes, so the
      // feature still delivers on schedules that only run the cron a few times.
      const sentToday =
        s.last_sent_at && new Date(s.last_sent_at).toDateString() === now.toDateString()
      const tonight = passes.filter(p => (p.start.getTime() - now.getTime()) / 3600_000 <= 18)
      if (!sentToday && tonight.length) {
        payload = {
          title: `🛰️ ISS visible tonight${s.city ? ` over ${s.city}` : ''}`,
          body: tonight.slice(0, 3).map(p => describePass(p, s.tz || undefined)).join('  ·  '),
          url: '/tools/iss-pass-predictor',
        }
      }
    }

    if (!payload) continue

    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      )
      if (payload.title.includes('soon')) imminent++
      else digests++

      await sb(`/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          last_sent_at: now.toISOString(),
          last_pass_at: next.start.toISOString(),
        }),
      })
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      // 404/410 mean the browser dropped the subscription — stop retrying it.
      if (code === 404 || code === 410) {
        await sb(`/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' })
        removed++
      }
    }
  }

  return res.status(200).json({ ok: true, checked: subs.length, imminent, digests, removed })
}
