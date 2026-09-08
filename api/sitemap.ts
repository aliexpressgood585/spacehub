import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CITY_DATA } from '../src/data/cities'

const BASE = 'https://www.spacehubapp.com'

// Derived from the same table the /iss/:city pages render, so the sitemap can
// never advertise a URL that has no page behind it (or miss one that does).
const CITIES = Object.keys(CITY_DATA)

const BLOG_SLUGS = [
  'best-telescope-for-kids-2026',
  'lunar-eclipse-guide-2026',
  'how-to-find-north-star-polaris',
  'messier-objects-guide-2026',
  'astrophotography-software-guide-2026',
  'saturn-rings-viewing-guide-2026',
  'best-telescope-eyepieces-2026',
  'best-astronomy-gifts-2026',
  'how-to-see-andromeda-galaxy',
  'how-to-photograph-iss-2026',
  'best-space-books-2026',
  'jupiter-opposition-2026-guide',
  'best-stargazing-camping-gear-2026',
  'how-to-see-planets-telescope-2026',
  'solar-eclipse-photography-guide-2026',
  'how-to-see-iss',
  'perseid-meteor-shower-2026',
  'starlink-satellites-how-to-see',
  'best-telescopes-beginners-2026',
  'northern-lights-2026-guide',
  'moon-photography-guide-2026',
  'star-trails-photography-guide-2026',
  'best-dark-sky-locations-2026',
  'best-astronomy-apps-2026',
  'best-binoculars-astronomy-2026',
  'astrophotography-beginners-2026',
  'space-weather-explained',
  'best-red-flashlight-astronomy-2026',
  'how-to-see-milky-way-2026',
  'venus-planet-guide-2026',
  'how-to-collimate-telescope-2026',
  'best-goto-telescopes-2026',
  'how-to-see-nebulae-telescope-2026',
  'how-to-observe-sun-safely-2026',
  'meteor-shower-calendar-2026',
  'geminid-meteor-shower-2026',
  'best-smart-telescopes-2026',
  'mars-viewing-guide-2026',
  'comet-viewing-guide-2026',
  'best-telescope-filters-2026',
  'deep-sky-astrophotography-guide-2026',
  'light-pollution-bortle-scale-guide',
  'best-budget-telescopes-under-200-2026',
  'james-webb-telescope-discoveries-2026',
  'artemis-moon-missions-guide-2026',
  'iss-facts-guide-2026',
  'how-to-stargaze-with-kids-2026',
  'how-to-see-mercury-2026',
  'star-chart-planisphere-guide-2026',
  'best-dew-heaters-telescope-2026',
]

// Tool pages — keep in sync with src/pages/toolsRegistry.ts
const TOOL_SLUGS = [
  'star-map', 'tonights-sky', 'iss-tracker', 'iss-pass-predictor', 'moon-phase',
  'meteor-showers', 'solar-system-3d', 'planet-visibility', 'planet-explorer',
  'satellite-tracker', 'aurora-forecast', 'space-weather', 'light-pollution',
  'seeing-forecast', 'telescope-advisor', 'astrophotography-planner',
  'observation-log', 'night-sky-calendar', 'eclipse-countdown',
  'constellation-guide', 'deep-sky-browser', 'exoplanet-explorer',
  'asteroid-tracker', 'mars-weather', 'nasa-apod', 'jwst-gallery',
  'astro-calculator', 'space-quiz',
]

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const today = new Date().toISOString().slice(0, 10)

  const staticPages = ['', '/premium', '/blog', '/tools'].map(path => `
  <url>
    <loc>${BASE}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${path === '' ? 'hourly' : 'weekly'}</changefreq>
    <priority>${path === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('')

  const cityPages = CITIES.map(city => `
  <url>
    <loc>${BASE}/iss/${city}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`).join('')

  const blogPages = BLOG_SLUGS.map(slug => `
  <url>
    <loc>${BASE}/blog/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')

  const toolPages = TOOL_SLUGS.map(slug => `
  <url>
    <loc>${BASE}/tools/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages}${toolPages}${cityPages}${blogPages}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).send(xml)
}
