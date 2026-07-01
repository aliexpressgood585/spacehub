import type { VercelRequest, VercelResponse } from '@vercel/node'

const BASE = 'https://spacehubapp.com'

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
  'best-telescopes-2025', 'how-to-see-iss', 'space-weather-guide',
  'astrophotography-beginners', 'james-webb-discoveries', 'moon-phases-explained',
  'meteor-showers-2025', 'stargazing-guide', 'solar-system-facts',
  'astronaut-life-iss',
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
    <priority>0.6</priority>
  </url>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages}${cityPages}${blogPages}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).send(xml)
}
