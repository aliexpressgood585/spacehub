# SpaceHub — Next Session Handoff Prompt

Copy everything below this line into a new Claude Code session.

---

## Project Overview

**SpaceHub** is a React 19 + TypeScript + Vite space-exploration web app deployed on Vercel.
- **Live URL:** https://www.spacehubapp.com/
- **GitHub:** `aliexpressgood585/spacehub`, branch: `main`
- **Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router v7
- **Backend:** Vercel serverless functions in `api/*.ts` (compiled by esbuild via `@vercel/node`, NOT by tsc)

---

## PERMANENT CONSTRAINTS — NEVER VIOLATE

1. **No auth/accounts.** Do not implement user authentication or account systems of any kind.
2. **No Stripe/payments.** Files `api/create-checkout-session.ts` and `api/webhook.ts` exist as stubs — do not activate them, do not wire them to the frontend.
3. **Vercel Hobby plan = max 12 serverless functions.** The repo is currently at exactly 12. Adding any new file to `api/` (without underscore prefix) will break deployment. Files prefixed with `_` (e.g. `api/_rateLimit.ts`) are shared modules, not counted as functions.

---

## Architecture

### Frontend (`src/`)
- Entry: `src/main.tsx` → `src/App.tsx`
- 211 components in `src/components/`, loaded with `React.lazy()` + `<Suspense>`
- Routing via React Router v7
- i18n: `src/i18n/LangContext.tsx` + `src/i18n/translations.ts`
- CSS: Tailwind v4 + custom classes in `src/index.css`
- TypeScript config: `tsconfig.app.json` — includes **only `src/`**. API files are NOT type-checked by `tsc -b`. They are compiled by esbuild at deploy time.
- tsconfig flags: `noUnusedLocals: true`, `noUnusedParameters: true` — enforced strictly

### Backend (`api/`)
Current 12 serverless functions (at Vercel Hobby limit):

| File | Purpose | External API |
|------|---------|-------------|
| `api/apod.ts` | NASA Astronomy Picture of the Day | api.nasa.gov |
| `api/astros.ts` | Astronauts currently in space | api.open-notify.org |
| `api/gallery.ts` | NASA image search | images-api.nasa.gov |
| `api/iss.ts` | ISS real-time position | api.open-notify.org |
| `api/neo.ts` | Near-Earth Objects | api.nasa.gov/neo |
| `api/newsletter.ts` | Newsletter subscription | — |
| `api/og.ts` | Open Graph image generation | — |
| `api/sitemap.ts` | Sitemap XML | — |
| `api/subscribe.ts` | Email subscribe | — |
| `api/tle.ts` | Satellite TLE data | celestrak.org |
| `api/create-checkout-session.ts` | Stripe stub (inactive) | Stripe |
| `api/webhook.ts` | Stripe stub (inactive) | Stripe |

**Shared module (not a function):**
- `api/_rateLimit.ts` — in-memory rate limiter, imported by apod.ts

### Key API patterns
All serverless functions must:
- Use `AbortSignal.timeout(8000)` — Vercel functions timeout at 10s
- Return HTTP 200 even on error, with a safe empty payload (`{ error: '...', results: [] }`)
- Set `Cache-Control` headers (cache on success, `no-store` on error)

---

## Current State (as of 2026-06-30)

### What is working
- Site deploys and loads: https://www.spacehubapp.com/ → 200 OK
- `/api/neo` → returns real asteroid data ✓
- `/api/gallery` → returns 12 NASA images ✓
- `/api/iss` → upstream (open-notify.org) intermittently down; component shows fallback ✓
- `/api/apod` → NASA DEMO_KEY rate-limited; `NasaAPOD.tsx` detects `'error' in data` and shows curated fallback ✓
- `/api/astros` → upstream intermittently down; component shows fallback crew ✓
- `LaunchCountdown` widget → fetches `https://lldev.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&format=json` directly from the browser (CORS supported, no proxy needed) ✓

### Recent fixes (committed to main)
| Commit | Fix |
|--------|-----|
| `316273998b` | LaunchCountdown: direct SpaceDevs fetch (CORS OK) |
| `6859d6aa1a` | Deleted `api/launches.ts` (was 13th function, broke Vercel) |
| `9d33c22a2c` | `package.json`: added `engines: { node: ">=18" }` |
| `2fbe8c40fc` | `api/iss.ts`: HTTP→HTTPS fix + timeout + graceful error |
| `c15d2c3fa4` | `api/gallery.ts`: timeout + graceful error |
| `6f5e132faf` | `api/neo.ts`: timeout + graceful error |
| `5636964ddd` | `NasaAPOD.tsx`: graceful rate-limit handling |
| `ae31574b00` | `ISSTracker.tsx`: TS2552 build error fix |

---

## Known Issues / Technical Debt

1. **NASA API key** — `api/apod.ts` and `api/neo.ts` use `DEMO_KEY` (env var `NASA_API_KEY`, falls back to `DEMO_KEY`). DEMO_KEY has a 30 requests/hour limit per IP. Set a real key in Vercel env vars to fix rate limiting.

2. **open-notify.org reliability** — `api/iss.ts` and `api/astros.ts` depend on this third-party free API that is frequently unreliable. Components already have fallback UI but real data may not appear.

3. **`api/create-checkout-session.ts` and `api/webhook.ts`** — These Stripe stubs count against the 12-function limit. If Stripe is never needed, they could be deleted to free up 2 slots. Do NOT delete without owner confirmation.

4. **`vercel.json`** — Review if rewrites/headers are correct before adding any new routes.

5. **`api/_rateLimit.ts`** — In-memory rate limiter; resets on cold start. Not production-grade but acceptable for current traffic.

---

## Coding Standards

- **TypeScript strict** — no `any`, no unused vars/params
- **No comments** unless the WHY is non-obvious
- **API functions:** always `try/catch`, always return 200 with empty payload on error, always set `Cache-Control`
- **`AbortSignal.timeout(8000)`** on all external fetches in API functions
- **`catch {`** (no binding) when the error value is unused — avoids TS `noUnusedLocals` violation
- Components use `React.lazy()` — do not import heavy components statically
- Tailwind v4 utility classes + custom classes defined in `src/index.css`

---

## Files to Read First

Before writing any code:
1. `package.json` — dependencies and engines
2. `vercel.json` — routing and function config
3. `api/_rateLimit.ts` — shared utility
4. The specific `api/*.ts` or `src/components/*.tsx` file relevant to your task

Do NOT scan all 211 components unless the task requires it.

---

## How to Push Changes

In Claude Code web sessions, `git push` may be blocked by the proxy. Use the GitHub MCP tools instead:
- `mcp__github__create_or_update_file` — to update a file (requires file SHA)
- `mcp__github__delete_file` — to delete a file
- Get the current SHA by reading the file via MCP or the GitHub API first
- Target: `owner: "aliexpressgood585"`, `repo: "spacehub"`, `branch: "main"`

To add spacehub to MCP scope in a new session:
```
mcp__Claude_Code_Remote__add_repo({ owner: "aliexpressgood585", repo: "spacehub" })
```
Then clone: `git clone --depth 1 https://github.com/aliexpressgood585/spacehub /workspace/spacehub`

---

## What to Do Next

The platform is stable. Potential improvements (prioritized):

1. **Set a real NASA API key** in Vercel environment variables (`NASA_API_KEY`) to fix APOD/NEO rate limiting.
2. **Improve ISS/Astros fallback** — consider an alternative upstream API if open-notify.org remains down.
3. **Performance** — 211 components lazy-loaded; consider route-level code splitting if LCP is slow.
4. **No new `api/` files** unless one of the existing 12 is deleted first.
