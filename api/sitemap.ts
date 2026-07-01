import type { VercelRequest, VercelResponse } from '@vercel/node'

const BASE = 'https://www.spacehubapp.com'

const CITIES = [
  'new-york', 'london', 'los-angeles', 'paris', 'tokyo', 'sydney', 'toronto',
  'berlin', 'dubai', 'chicago', 'tel-aviv', 'jerusalem', 'amsterdam', 'madrid',
  'rome', 'moscow', 'beijing', 'singapore', 'mumbai', 'cairo', 'mexico-city',
  'buenos-aires', 'sao-paulo', 'johannesburg', 'seoul', 'bangkok', 'istanbul',
  'vienna', 'stockholm', 'miami', 'houston', 'san-francisco', 'cape-town',
  'melbourne', 'seattle', 'barcelona', 'milan', 'lisbon', 'prague', 'warsaw',
  'lagos', 'nairobi', 'lima', 'bogota', 'santiago', 'montreal', 'vancouver',
  'riyadh', 'shanghai', 'hong-kong', 'jakarta', 'kuala-lumpur', 'manila', 'accra',
]

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
]

export default function handler(req: VercelRequest, res: VercelResponse) {
  const today = new Date().toISOString().slice(0, 10)

  const staticPages = ['', '/premium', '/blog'].map(path => `
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages}${cityPages}${blogPages}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).send(xml)
}
