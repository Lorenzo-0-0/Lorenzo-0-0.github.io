/* ============================================================================
 * visitor-log Worker — per-visit logger for lorenzo-0-0.github.io.
 *
 * The page never holds a write key. This Worker reads the REAL visitor IP and
 * geo SERVER-SIDE from the request (CF-Connecting-IP + request.cf) and writes a
 * row to Cloudflare D1. The only client-supplied fields are `path` + `referrer`
 * (untrusted, length-capped). Public read endpoints never expose IP or exact
 * coordinates.
 *
 *   POST /log              record a visit (sendBeacon target). 204.
 *   GET  /admin?limit=N    OWNER ONLY — requires `Authorization: Bearer <ADMIN_KEY>`
 *                          (or ?key=). Returns FULL rows incl. IP. No key set or
 *                          wrong key => 401. This is the only read endpoint for
 *                          the per-visit log; it is never exposed publicly.
 *   GET  /gc/stats/<kind>  read-only proxy to the GoatCounter stats API for the
 *                          public dashboard/globe. GoatCounter dropped CORS from
 *                          /api/v0 (mid-2026), so the page can't call it directly
 *                          any more; this forwards whitelisted aggregate reads
 *                          with the token held server-side (env.GC_TOKEN).
 * ========================================================================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/log' && request.method === 'POST') return await handleLog(request, env, cors);
      if (url.pathname === '/admin' && request.method === 'GET') return await handleAdmin(request, env, cors);
      if (url.pathname.indexOf('/gc/stats/') === 0 && request.method === 'GET') return await handleStats(request, env, cors, url);
      if (url.pathname === '/') return json({ ok: true, service: 'visitor-log' }, 200, cors);
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500, cors);
    }
  }
};

/* ---------- routes ---------- */

async function handleLog(request, env, cors) {
  const cf = request.cf || {};
  const ip = request.headers.get('CF-Connecting-IP') || '';

  let body = {};
  try { body = JSON.parse((await request.text()) || '{}'); } catch (_) { body = {}; }
  const path = cap(body.path, 200) || '/';
  const referrer = cap(body.referrer, 300);
  const { browser, os } = parseUA(request.headers.get('User-Agent') || '');

  // Dedup / rate-limit: skip if this IP already hit this path in the last 30 min.
  // Kills reload double-counting AND throttles beacon flooding from one source.
  if (ip) {
    const dup = await env.DB.prepare(
      "SELECT 1 FROM visits WHERE ip = ?1 AND path = ?2 " +
      "AND ts > strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 minutes') LIMIT 1"
    ).bind(ip, path).first();
    if (dup) return new Response(null, { status: 204, headers: cors });
  }

  await env.DB.prepare(
    "INSERT INTO visits (ip, city, region, country, lat, lng, org, path, referrer, browser, os) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)"
  ).bind(
    ip || null,
    cf.city || null,
    cf.region || null,
    cf.country || null,
    numOrNull(cf.latitude),
    numOrNull(cf.longitude),
    cf.asOrganization || null,
    path,
    referrer || null,
    browser,
    os
  ).run();

  return new Response(null, { status: 204, headers: cors });
}

// OWNER ONLY. Gated by a shared secret (env.ADMIN_KEY, set via
// `wrangler secret put ADMIN_KEY`). Accepts the key as `Authorization: Bearer <k>`
// (preferred — stays out of URLs/logs) or `?key=<k>`. Returns the FULL per-visit
// rows including IP. This is the single read path; nothing here is public.
async function handleAdmin(request, env, cors) {
  const url = new URL(request.url);
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const key = bearer || url.searchParams.get('key') || '';
  if (!env.ADMIN_KEY || !safeEqual(key, env.ADMIN_KEY)) {
    return json({ error: 'unauthorized' }, 401, cors);
  }
  let limit = parseInt(url.searchParams.get('limit') || '200', 10);
  if (!(limit > 0 && limit <= 1000)) limit = 200;
  const { results } = await env.DB.prepare(
    "SELECT id, ts, ip, city, region, country, lat, lng, org, path, referrer, browser, os " +
    "FROM visits ORDER BY ts DESC, id DESC LIMIT ?1"
  ).bind(limit).all();
  const meta = await env.DB.prepare(
    "SELECT COUNT(*) AS total, COUNT(DISTINCT country) AS countries FROM visits"
  ).first();
  return json({
    rows: results || [],
    total: (meta && meta.total) || 0,
    countries: (meta && meta.countries) || 0
  }, 200, cors);
}

// Read-only GoatCounter stats proxy. Only whitelisted aggregate endpoints are
// reachable — never the per-visit export or any write API — so exposing this
// publicly leaks nothing beyond what the dashboard already shows. The token
// stays server-side (`wrangler secret put GC_TOKEN`); responses are edge-cached
// for 5 min so page loads don't chew the GoatCounter rate limit.
var GC_BASE = 'https://jingliangli.goatcounter.com/api/v0/stats/';
var GC_KINDS = ['total', 'hits', 'browsers', 'systems', 'locations', 'languages', 'sizes', 'toprefs', 'campaigns'];

async function handleStats(request, env, cors, url) {
  var kind = url.pathname.slice('/gc/stats/'.length);
  if (GC_KINDS.indexOf(kind) === -1) return json({ error: 'unknown stat' }, 404, cors);
  if (!env.GC_TOKEN) return json({ error: 'stats proxy not configured' }, 500, cors);

  var qs = new URLSearchParams();
  ['start', 'end', 'limit', 'offset', 'daily'].forEach(function (k) {
    var v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  });
  var upstream = GC_BASE + kind + (qs.toString() ? '?' + qs.toString() : '');

  var cacheKey = new Request(upstream); // token is never part of the cache key
  var hit = await caches.default.match(cacheKey);
  if (hit) return withCors(hit, cors);

  var r = await fetch(upstream, { headers: { 'Authorization': 'Bearer ' + env.GC_TOKEN } });
  var body = await r.text();
  var headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': r.ok ? 'public, max-age=300' : 'no-store'
  };
  // pass the reset hint through so the client's 429 backoff keeps working
  var reset = r.headers.get('X-Rate-Limit-Reset');
  if (reset) headers['X-Rate-Limit-Reset'] = reset;

  var resp = new Response(body, { status: r.status, headers: headers });
  if (r.ok) await caches.default.put(cacheKey, resp.clone());
  return withCors(resp, cors);
}

// CORS headers vary per Origin, so cached responses are stored bare and the
// per-request headers are stamped on the way out.
function withCors(resp, cors) {
  var out = new Response(resp.body, resp);
  for (var k in cors) out.headers.set(k, cors[k]);
  return out;
}

// Length-aware constant-time-ish string compare (avoid early-exit timing leak).
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- helpers ---------- */

function cap(v, n) {
  if (v == null) return '';
  return String(v).slice(0, n);
}
function numOrNull(v) {
  var f = parseFloat(v);
  return isFinite(f) ? f : null;
}

function parseUA(ua) {
  ua = ua || '';
  var os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';
  var browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  return { browser: browser, os: os };
}

function corsHeaders(request, env) {
  var origin = request.headers.get('Origin') || '';
  var allow = isAllowed(origin, env) ? origin : (env.ALLOW_ORIGIN || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
}
function isAllowed(origin, env) {
  if (!origin) return false;
  if (env.ALLOW_ORIGIN && origin === env.ALLOW_ORIGIN) return true;
  try {
    var h = new URL(origin).hostname;
    return /\.github\.io$/.test(h) || h === 'localhost' || h === '127.0.0.1';
  } catch (_) { return false; }
}

function json(obj, status, cors) {
  var headers = { 'Content-Type': 'application/json; charset=utf-8' };
  for (var k in cors) headers[k] = cors[k];
  return new Response(JSON.stringify(obj), { status: status, headers: headers });
}
