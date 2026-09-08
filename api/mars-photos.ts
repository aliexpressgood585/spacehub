import type { VercelRequest, VercelResponse } from '@vercel/node'

// Mars rover photos, adapted from the feeds mars.nasa.gov serves today.
//
// The dashboard used to call NASA's Mars Rover Photos API
// (api.nasa.gov/mars-photos/api/v1/...). That service is gone — every path
// under it now answers 404 with a Heroku "No such app" page — so the module
// was dead in production regardless of the API key.
//
// The raw-image feeds behind mars.nasa.gov's own rover pages are live and
// public, so this function reads them and returns the exact shape the old API
// did. The component keeps its data model; the compatibility layer lives here.
// A proxy is required either way: mars.nasa.gov is not in the site's CSP
// connect-src, and routing through Vercel gives one cached upstream response
// for all visitors.

type RoverName = 'curiosity' | 'perseverance'

/** Mission facts, unavailable from the raw-image feeds. */
const ROVERS: Record<RoverName, { id: number; name: string; launch_date: string; landing_date: string }> = {
  curiosity:    { id: 5, name: 'Curiosity',    launch_date: '2011-11-26', landing_date: '2012-08-06' },
  perseverance: { id: 8, name: 'Perseverance', launch_date: '2020-07-30', landing_date: '2021-02-18' },
}

// Short badge codes, matching what the old API reported for each instrument.
// The feeds name instruments with underscores (FRONT_HAZCAM_RIGHT_A, MCZ_LEFT,
// NAV_LEFT_B), so these match on prefixes rather than \b word boundaries — `_`
// is a word character, and \bMCZ\b would never match MCZ_LEFT.
const CAMERA_CODES: [RegExp, string][] = [
  [/FRONT_HAZCAM|^FHAZ/i, 'FHAZ'],
  [/REAR_HAZCAM|^RHAZ/i, 'RHAZ'],
  [/NAVCAM|^NAV_/i, 'NAVCAM'],
  [/^MCZ/i, 'MASTCAM-Z'],
  [/MASTCAM|^MAST_/i, 'MASTCAM'],
  [/CHEMCAM/i, 'CHEMCAM'],
  [/MAHLI/i, 'MAHLI'],
  [/MARDI/i, 'MARDI'],
  [/SHERLOC/i, 'SHERLOC'],
  [/WATSON/i, 'WATSON'],
  [/SUPERCAM/i, 'SUPERCAM'],
  [/SKYCAM/i, 'SKYCAM'],
  [/PIXL/i, 'PIXL'],
  [/EDL/i, 'EDL'],
]

const cameraCode = (instrument: string): string => {
  for (const [re, code] of CAMERA_CODES) if (re.test(instrument)) return code
  return instrument.split('_')[0].slice(0, 10).toUpperCase() || 'CAM'
}

/** The feeds identify Perseverance images by string only, so derive a stable number. */
const numericId = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Camera name as the rover page shows it: the part of the title after "…: ". */
const titleToCameraName = (title: string, fallback: string): string => {
  const i = title.indexOf(': ')
  return (i >= 0 ? title.slice(i + 2) : title).trim() || fallback
}

interface Photo {
  id: number
  sol: number
  camera: { id: number; name: string; rover_id: number; full_name: string }
  img_src: string
  earth_date: string
  rover: { id: number; name: string; landing_date: string; launch_date: string; status: string; max_sol: number; max_date: string; total_photos: number }
}

interface Feed { photos: Photo[]; total: number }

// The mars2020 raw-image feed is erratic: usually a few hundred ms, but it
// regularly takes 15 s+. Allow for that rather than failing the card — the
// Cache-Control below means at most one visitor an hour ever waits for it.
export const config = { maxDuration: 30 }

const UPSTREAM_TIMEOUT_MS = 22_000

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`upstream ${r.status}`)
  return await r.json() as Record<string, unknown>
}

async function loadPerseverance(limit: number): Promise<Feed> {
  const j = await fetchJson(
    `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=${limit}&page=0&order=sol+desc`,
  )
  const images = (j.images ?? []) as Array<{
    sol: number
    imageid: string
    title?: string
    date_taken_utc?: string
    camera?: { instrument?: string }
    image_files?: { large?: string; medium?: string; full_res?: string; small?: string }
  }>
  const total = Number(j.total_images ?? j.total_results ?? 0)
  const meta = ROVERS.perseverance
  const newest = images[0]
  const maxSol = newest?.sol ?? 0
  const maxDate = (newest?.date_taken_utc ?? '').slice(0, 10)

  const photos = images
    .map(im => {
      const src = im.image_files?.large || im.image_files?.medium || im.image_files?.full_res || im.image_files?.small
      if (!src) return null
      const instrument = im.camera?.instrument ?? 'CAM'
      return {
        id: numericId(im.imageid),
        sol: im.sol,
        camera: {
          id: numericId(instrument),
          rover_id: meta.id,
          name: cameraCode(instrument),
          full_name: titleToCameraName(im.title ?? '', instrument),
        },
        img_src: src,
        earth_date: (im.date_taken_utc ?? '').slice(0, 10),
        rover: { ...meta, status: 'active', max_sol: maxSol, max_date: maxDate, total_photos: total },
      }
    })
    .filter((p): p is Photo => p !== null)

  return { photos, total }
}

async function loadCuriosity(limit: number): Promise<Feed> {
  const j = await fetchJson(
    `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=${limit}&page=0&condition_2=msl:mission`,
  )
  const items = (j.items ?? []) as Array<{
    id: number
    sol: number
    url?: string
    title?: string
    instrument?: string
    date_taken?: string
    is_thumbnail?: boolean
  }>
  const total = Number(j.total ?? 0)
  const meta = ROVERS.curiosity
  const newest = items[0]
  const maxSol = newest?.sol ?? 0
  const maxDate = (newest?.date_taken ?? '').slice(0, 10)

  const photos = items
    .filter(it => it.url && !it.is_thumbnail)
    .map(it => {
      const instrument = it.instrument ?? 'CAM'
      return {
        id: it.id,
        sol: it.sol,
        camera: {
          id: numericId(instrument),
          rover_id: meta.id,
          name: cameraCode(instrument),
          full_name: titleToCameraName(it.title ?? '', instrument),
        },
        img_src: it.url as string,
        earth_date: (it.date_taken ?? '').slice(0, 10),
        rover: { ...meta, status: 'active', max_sol: maxSol, max_date: maxDate, total_photos: total },
      }
    })

  return { photos, total }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rover = req.query.rover === 'perseverance' ? 'perseverance' : 'curiosity'
  const wantManifest = req.query.manifest === '1'

  try {
    // The manifest only needs the newest frame; the gallery wants a spread of
    // cameras to choose from.
    const feed = rover === 'perseverance'
      ? await loadPerseverance(wantManifest ? 1 : 40)
      : await loadCuriosity(wantManifest ? 1 : 40)

    res.setHeader('Cache-Control', `s-maxage=${wantManifest ? 21600 : 3600}, stale-while-revalidate=86400`)

    if (wantManifest) {
      const meta = ROVERS[rover]
      const newest = feed.photos[0]
      return res.json({
        photo_manifest: {
          ...meta,
          status: 'active',
          max_sol: newest?.sol ?? 0,
          max_date: newest?.earth_date ?? '',
          total_photos: feed.total,
          photos: [],
        },
      })
    }

    res.json({ latest_photos: feed.photos })
  } catch (err: unknown) {
    // 200 with an error body: the component shows its own retry state rather
    // than a broken card.
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ error: err instanceof Error ? err.message : 'error' })
  }
}
