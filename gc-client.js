/* ============================================================================
 * GoatCounter stats client — shared by the homepage globe and visitors.html.
 *
 * Reads the site's own visitor stats from the GoatCounter API. The API sends
 * `access-control-allow-origin: *`, so a static page can call it directly with
 * a READ-ONLY token (scope: "Read statistics" only). The token can read stats
 * and nothing else — if ever abused, regenerate it in GoatCounter → API.
 * ========================================================================== */
window.GCClient = (function () {
  var BASE = 'https://jingliangli.goatcounter.com/api/v0';

  // GoatCounter API token. NOTE: this is a full-access token, used here at the
  // owner's explicit choice (they accepted the risk that a public token could be
  // misused). To harden later: create a token with only "Read statistics" and
  // regenerate this one in GoatCounter → API.
  // Public, STATS-ONLY token (read statistics scope) — safe to ship in the page.
  // The export-capable token lives only in the GOATCOUNTER_TOKEN Actions secret.
  var TOKEN = '1f30uzneth5f71a8cdtm3tbz5e13fk192u7fspq1xt8ogl8ggw9g';

  function hasToken() {
    return TOKEN && TOKEN !== 'PASTE_READ_ONLY_TOKEN' && TOKEN.length > 8;
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
    else start = new Date('2020-01-01T00:00:00Z'); // "all"
    return { start: iso(start), end: iso(end) };
  }

  // The API allows ~4 req/s. We SERIALIZE every request through one queue with a
  // min gap, auto-retry on HTTP 429 (honouring X-Rate-Limit-Reset), and cache by
  // URL so the globe + dashboard sharing /stats/locations only hit the API once.
  var MIN_GAP = 320;            // ms between requests (< 4/s)
  var MAX_RETRY = 4;
  var chain = Promise.resolve(); // serialization queue
  var cache = {};                // url -> promise

  function rawGet(url, attempt) {
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + TOKEN } }).then(function (res) {
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

  return {
    hasToken: hasToken,

    // Total visitors + daily series for the period.
    total: function (period) { return get('/stats/total', period); },

    // Top pages.
    hits: function (period) { return get('/stats/hits', period, 'limit=15'); },

    // One breakdown: kind in {locations, browsers, systems, sizes, toprefs, languages}.
    breakdown: function (kind, period) { return get('/stats/' + kind, period, 'limit=15'); },

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
    },

    // NOTE: recent per-visit rows are NOT fetched client-side — the GoatCounter
    // export API is too rate-limited. A GitHub Action (tools/build-recent-visits.mjs)
    // exports hourly into data/recent-visits.json, which analytics.js reads directly.

    // Aggregate GoatCounter location rows into globe points keyed by COUNTRY.
    // loc.id may be ISO-3166-2 ("SG" or "SG-01"); loc.name is "Singapore".
    // `ref` = the parsed data/country-centroids.json ({centroids, names}).
    toPoints: function (locStats, ref) {
      var byCountry = {};
      (locStats || []).forEach(function (loc) {
        var iso2 = null;
        if (loc.id) iso2 = String(loc.id).split('-')[0].toUpperCase();
        if (!iso2 || !ref.centroids[iso2]) {
          var alias = ref.names[String(loc.name || '').toLowerCase()];
          if (alias) iso2 = alias;
        }
        if (!iso2 || !ref.centroids[iso2]) return; // unmappable (e.g. "(unknown)")
        if (!byCountry[iso2]) byCountry[iso2] = { iso2: iso2, name: countryName(ref, iso2, loc.name), count: 0 };
        byCountry[iso2].count += (loc.count || 0);
      });
      return Object.keys(byCountry).map(function (k) {
        var c = byCountry[k];
        var ll = ref.centroids[k];
        return { lat: ll[0], lng: ll[1], count: c.count, name: c.name, iso2: k };
      });
    }
  };

  function countryName(ref, iso2, fallback) {
    // Reverse the names alias map for a clean country label.
    var keys = Object.keys(ref.names);
    for (var i = 0; i < keys.length; i++) {
      if (ref.names[keys[i]] === iso2) {
        return keys[i].replace(/\b\w/g, function (m) { return m.toUpperCase(); });
      }
    }
    return fallback || iso2;
  }
})();
