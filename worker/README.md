# visitor-log Worker

A tiny Cloudflare Worker + D1 database that records one row per visit to
`lorenzo-0-0.github.io`. The page **never holds a write key** — this Worker reads
the real visitor IP and geo *server-side* (`CF-Connecting-IP` + `request.cf`) and
writes to D1. Public read endpoints never expose IP or exact coordinates.

## Routes
- `POST /log` — record a visit (the page's `navigator.sendBeacon` target). Returns 204.
  Dedups: the same IP hitting the same path within 30 min is ignored.
- `GET /recent?limit=N` — newest visits (≤100, default 30), redacted:
  `{ ts, country, city, region, browser, os }`. No IP, no coords.
- `GET /points` — globe data: coordinates rounded to ~11 km and aggregated to
  `{ lat, lng, count }`, plus `{ total, countries }`. No IP, no exact coords.

## One-time deploy (~5 min)
```bash
# 1. Free Cloudflare account, then:
npm i -g wrangler
wrangler login

# 2. Create the D1 database, then paste the printed `database_id` into wrangler.toml
cd worker
wrangler d1 create visitor-log

# 3. Create the table (remote = the real D1, not the local dev copy)
wrangler d1 execute visitor-log --remote --file=schema.sql

# 4. Deploy — this prints  https://visitor-log.<your-subdomain>.workers.dev
wrangler deploy
```

Then paste that URL into `../visitor-config.js` (the `VISITOR_WORKER_URL` value),
commit, and push the site.

## Local smoke test (no Cloudflare account needed)
```bash
cd worker
wrangler dev --local        # serves on http://localhost:8787 with a local D1
# in another shell:
wrangler d1 execute visitor-log --local --file=schema.sql
curl -X POST localhost:8787/log -d '{"path":"/","referrer":""}'
curl localhost:8787/recent
curl localhost:8787/points
```
Note: in local dev `request.cf` geo is empty, so city/lat/lng will be null —
that's expected; on the deployed edge they are populated.

## Owner-only: see full rows incl. IP
```bash
wrangler d1 execute visitor-log --remote \
  --command "SELECT ts, ip, city, country, org, path FROM visits ORDER BY id DESC LIMIT 50"
```

## Free-tier headroom
D1 free tier: 5 GB storage, 5M row-reads/day, 100k row-writes/day — orders of
magnitude beyond a personal homepage. No inactivity pause (unlike Supabase free).
