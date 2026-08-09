/* ============================================================================
 * GoatCounter stats client — powers the aggregate dashboard on visitors.html
 * (Totals / Locations / Browsers / Systems / Sizes / referrers). The per-visit
 * log + visitor globe now come from the visitor-log Worker, not from here.
 *
 * Reads the site's own visitor stats via the visitor-log Worker's /gc proxy.
 * The page used to call the GoatCounter API directly with a bearer token, but
 * GoatCounter dropped the `Access-Control-Allow-Origin` header from /api/v0
 * (mid-2026): the CORS preflight gets no Allow-* headers back and every fetch
 * dies with "Failed to fetch". The Worker now forwards whitelisted stats reads
 * with the token held server-side (GC_TOKEN secret) — no token in this page.
 * ========================================================================== */
window.GCClient = (function () {
  var BASE = (window.VISITOR_WORKER_URL || 'https://stats.jingliangli.com')
    .replace(/\/+$/, '') + '/gc';

  // Kept for callers (analytics.js / visitor-globe.js gate on it). Auth now
  // lives in the Worker, so the client is always "configured".
  function hasToken() {
    return true;
  }

  // ISO-8601 rounded to the hour (GoatCounter expects hour-rounded bounds).
  function iso(d) {
    return d.toISOString().slice(0, 13) + ':00:00Z';
  }
  function range(period) {
    var end = new Date();
    var start = new Date(end.getTime());
    if (period === 'week') start.setDate(start.getDate() - 7);
    else if (period === 'month') start.setDate(start.getDate() - 30);
    else if (period === 'year') start.setFullYear(start.getFullYear() - 1);
    // "all": the GoatCounter site has no data before 2026 (account created
    // mid-2026); starting at 2020 made /stats/hits return ~14 MB of zero-filled
    // hourly series. 2026-01-01 keeps every real hit and cuts it to ~1 MB.
    else start = new Date('2026-01-01T00:00:00Z');
    return { start: iso(start), end: iso(end) };
  }

  // The API allows ~4 req/s. We SERIALIZE every request through one queue with a
  // min gap, auto-retry on HTTP 429 (honouring X-Rate-Limit-Reset), and cache by
  // URL so the globe + dashboard sharing /stats/locations only hit the API once.
  var MIN_GAP = 320;            // ms between requests (< 4/s)
  var MAX_RETRY = 4;
  var chain = Promise.resolve(); // serialization queue
  var cache = {};                // url -> promise

  // Plain GET, no custom headers → a CORS "simple request", no preflight.
  function rawGet(url, attempt) {
    return fetch(url).then(function (res) {
      if (res.status === 429 && attempt < MAX_RETRY) {
        var reset = parseFloat(res.headers.get('X-Rate-Limit-Reset')) || 1;
        return new Promise(function (r) { setTimeout(r, (reset + 0.25) * 1000); })
          .then(function () { return rawGet(url, attempt + 1); });
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function get(path, period, extra) {
    if (!hasToken()) return Promise.reject(new Error('NO_TOKEN'));
    var r = range(period);
    var url = BASE + path + '?start=' + encodeURIComponent(r.start) +
      '&end=' + encodeURIComponent(r.end) + (extra ? '&' + extra : '');
    if (cache[url]) return cache[url];
    var p = chain.then(function () { return rawGet(url, 0); });
    // keep the queue moving with a gap, regardless of success/failure
    chain = p.catch(function () {}).then(function () {
      return new Promise(function (res) { setTimeout(res, MIN_GAP); });
    });
    p.catch(function () { delete cache[url]; }); // don't cache failures
    cache[url] = p;
    return p;
  }

  // Breakdown endpoints support limit (max 100) + offset and set `more` when
  // truncated — follow the pagination so lists NEVER silently cap. (The old
  // hard limit=15 froze the globe at "15 countries" and dropped the dots for
  // every country past the top 15 once the real list outgrew it.)
  function paged(path, period, key) {
    function step(offset, acc) {
      var extra = 'limit=100' + (offset ? '&offset=' + offset : '');
      return get(path, period, extra).then(function (d) {
        var arr = (d && d[key]) || [];
        acc = acc.concat(arr);
        if (d && d.more && arr.length) return step(offset + arr.length, acc);
        var out = {};
        out[key] = acc;
        out.more = false;
        return out;
      });
    }
    return step(0, []);
  }

  return {
    hasToken: hasToken,

    // Total visitors + daily series for the period.
    total: function (period) { return get('/stats/total', period); },

    // Pages. /stats/hits rejects `offset` (unlike the breakdowns), so this is
    // one max-size page — complete while the site has under 100 paths.
    hits: function (period) { return get('/stats/hits', period, 'limit=100'); },

    // One breakdown: kind in {locations, browsers, systems, sizes, toprefs, languages}.
    breakdown: function (kind, period) { return paged('/stats/' + kind, period, 'stats'); },

    // Fetch everything for the dashboard, batched to respect the rate limit.
    // NOTE: /stats/total is flaky (intermittent HTTP 400) — Totals is derived
    // from /stats/hits instead (which carries per-path daily series + counts).
    all: function (period) {
      var self = this;
      // All requests serialize + de-dup + 429-retry inside get(); fire together.
      return Promise.all([
        self.hits(period).then(tag('hits')),
        self.breakdown('locations', period).then(tag('locations')),
        self.breakdown('browsers', period).then(tag('browsers')),
        self.breakdown('systems', period).then(tag('systems')),
        self.breakdown('sizes', period).then(tag('sizes')),
        self.breakdown('toprefs', period).then(tag('toprefs'))
      ]).then(function (arr) {
        var o = {};
        arr.forEach(function (x) { o[x.__k] = x; });
        return o;
      });
      function tag(k) { return function (v) { v.__k = k; return v; }; }
    }
  };
})();
