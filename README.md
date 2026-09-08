# SpaceHub

Real-time space platform: live ISS tracking, NASA imagery, space weather, and
~200 interactive astronomy modules. Free, no account required.

Live at **https://www.spacehubapp.com** (Vercel).

> This repository holds two independent projects that share a checkout.
> Everything below describes the **website**. The paper-trading crypto bot under
> `supabase/functions/trading-bot`, `backtest/` and `trading-app/` is a separate
> system with its own rules — see `CLAUDE.md`, `GO_LIVE.md` and `LIVE_READINESS.md`.

## Getting started

```bash
npm ci
npm run dev      # Vite dev server
npm run build    # tsc -b (app + node + api) then vite build
npm run preview  # serve the production build locally
npm run lint     # whole repo, including the bot sources
npx eslint src api   # website + serverless only — this is what CI gates on
```

Node 18+ (CI uses 20).

## Layout

| Path | What lives there |
| --- | --- |
| `src/App.tsx` | Shell: routes, the 15 dashboard tabs, and the `<Section>` wrapper every card renders through |
| `src/components/` | ~220 feature modules (trackers, calculators, visualisers), each its own lazy chunk |
| `src/pages/` | Routed pages — blog, tools index and detail, city landing pages, premium, privacy |
| `src/pages/toolsRegistry.ts` | The `/tools/:slug` catalogue: one crawlable URL per tool |
| `src/data/cities.ts` | The 183 `/iss/:city` landing pages, and the source `api/sitemap.ts` derives its URLs from |
| `src/lib/`, `src/contexts/`, `src/i18n/` | Supabase access, ISS + auth context, EN/HE strings |
| `api/` | Vercel serverless functions: data proxies, sitemap, Stripe checkout + webhook, newsletter |
| `public/sw.js`, `public/init.js` | Service worker (offline shell, stale-while-revalidate API cache) and its registration |

## Performance model

The site ships ~200 feature modules, so nearly all of the work is in *not*
loading them. Three rules keep the entry cost flat as modules are added:

1. **Every route is `lazy()`.** Only the shell, header, hero and background are
   in the entry chunk. The blog alone is ~190 KB of article prose and loads only
   when someone opens it.
2. **Every card mounts through `<Section>`** (`src/App.tsx`), which defers
   mounting until the card is within ~1200 px of the viewport. The Science tab
   holds ~110 cards; on open it fetches ~18 chunks, not 110. `<Section>` also
   wraps each card in an error boundary, so one broken module can't blank the
   page, and in `<Suspense>` for its skeleton.
3. **Heavy dependencies load on demand.** `three` (~725 KB) belongs to the
   starfield and the 3-D modules and is skipped entirely on `save-data` /
   2G connections; `@supabase/supabase-js` (~208 KB) is fetched only when a
   visitor actually has a stored session or signs in.

When adding a module: lazy-import it and render it through `<Section>`. A static
import at the top of `App.tsx` puts it in every visitor's first download.

### Service worker

`public/init.js` reloads the page when a **new** service worker takes control —
guarded on `navigator.serviceWorker.controller` being non-null at startup, so a
first-time visitor (whose page just loaded straight from the network) is never
reloaded. Do not add a second `controllerchange` or `SW_UPDATED` listener
elsewhere; duplicated triggers are what previously reloaded every first visit.
Bump `CACHE` / `API_CACHE` in `public/sw.js` when the cached shell changes, and
keep the `KEEP` map in `index.html` in sync with those names.

## Environment variables

Client (`VITE_`-prefixed, exposed in the browser bundle):

| Variable | Effect when missing |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Sign-in and cloud sync are hidden; the observation log stays local-only |
| `VITE_SENTRY_DSN` | Error reporting off |
| `VITE_ADSENSE_SLOT` | Ad slots render empty |

Server-only (Vercel project env, never `VITE_`-prefixed): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `RESEND_API_KEY`, `NASA_API_KEY`.
See `.env.example`.

## Deployment

Vercel builds `main` (SPA rewrites, security headers and the two crons live in
`vercel.json`). CI (`.github/workflows/ci.yml`) typechecks all three TS projects
with `tsc -b`, lints `src` + `api`, and builds.

## SEO surface

`/` plus 28 tool pages, 183 city pages and 50 blog articles, all listed by
`api/sitemap.ts`. The tool and city lists are derived from the same modules the
app renders, so the sitemap cannot advertise a URL that has no page behind it.
