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
 *   GET  /recent?limit=N   newest visits, redacted: {ts,country,city,region,browser,os}
 *   GET  /points           globe data: coords rounded to ~11km, aggregated + counts
 * ========================================================================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/log' && request.method === 'POST') return await handleLog(request, env, cors);
      if (url.pathname === '/recent' && request.method === 'GET') return await handleRecent(request, env, cors);
      if (url.pathname === '/points' && request.method === 'GET') return await handlePoints(env, cors);
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

async function handleRecent(request, env, cors) {
  const url = new URL(request.url);
  let limit = parseInt(url.searchParams.get('limit') || '30', 10);
  if (!(limit > 0 && limit <= 100)) limit = 30;
  const { results } = await env.DB.prepare(
    "SELECT ts, country, city, region, browser, os FROM visits ORDER BY ts DESC, id DESC LIMIT ?1"
  ).bind(limit).all();
  return json(results || [], 200, cors);
}

async function handlePoints(env, cors) {
  // Round coords to 0.1 deg (~11 km) and aggregate — city-ish clusters, never a
  // pinpoint location, and never the IP.
  const { results } = await env.DB.prepare(
    "SELECT ROUND(lat,1) AS lat, ROUND(lng,1) AS lng, COUNT(*) AS count " +
    "FROM visits WHERE lat IS NOT NULL AND lng IS NOT NULL " +
    "GROUP BY ROUND(lat,1), ROUND(lng,1)"
  ).all();
  const meta = await env.DB.prepare(
    "SELECT COUNT(*) AS total, COUNT(DISTINCT country) AS countries FROM visits"
  ).first();
  return json({
    points: results || [],
    total: (meta && meta.total) || 0,
    countries: (meta && meta.countries) || 0
  }, 200, cors);
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
    'Access-Control-Allow-Headers': 'Content-Type',
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
