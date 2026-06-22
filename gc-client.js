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
  var TOKEN = '1f30uzneth5f71a8cdtm3tbz5e13fk192u7fspq1xt8ogl8ggw9g';

  // The recent-visits list uses the export API, which needs a token with the
  // "Export" permission (the current token is stats-only). Flip to true once
  // TOKEN has Export — until then we skip export so the console stays clean.
  var EXPORT_ENABLED = false;

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

    // Recent individual visits via the async export API (the only source of
    // per-visit rows). Needs a token with the "Export" permission; returns null
    // on any failure (missing permission, timeout, parse error) so the UI can
    // hide gracefully. Rows: {date, loc, browser, system}. No IP (GoatCounter
    // doesn't store it). Cached in-memory (period-independent).
    _recentCache: undefined,
    recentVisits: function (limit) {
      if (!hasToken() || !EXPORT_ENABLED) return Promise.resolve(null);
      if (this._recentCache !== undefined) return Promise.resolve(this._recentCache);
      var self = this;
      var lim = limit || 12;
      var H = { 'Authorization': 'Bearer ' + TOKEN };

      return fetch(BASE + '/export', { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: '{}' })
        .then(function (r) { if (!r.ok) throw new Error('export ' + r.status); return r.json(); })
        .then(function (j) { if (!j.id) throw new Error('no id'); return poll(j.id, 0); })
        .then(download).then(function (text) { return parse(text, lim); })
        .then(function (rows) { self._recentCache = rows; return rows; })
        .catch(function () { self._recentCache = null; return null; });

      function poll(id, n) {
        if (n > 10) return Promise.reject(new Error('timeout'));
        return new Promise(function (res) { setTimeout(res, 1400); }).then(function () {
          return fetch(BASE + '/export/' + id, { headers: H }).then(function (r) { return r.json(); }).then(function (s) {
            if (s.error) throw new Error(s.error);
            return s.finished_at ? id : poll(id, n + 1);
          });
        });
      }
      function download(id) {
        return fetch(BASE + '/export/' + id + '/download', { headers: H }).then(function (r) {
          if (!r.ok) throw new Error('download ' + r.status);
          return r.arrayBuffer();
        }).then(function (buf) {
          var b = new Uint8Array(buf);
          if (b.length > 2 && b[0] === 0x1f && b[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
            return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
          }
          return new TextDecoder('utf-8').decode(buf);
        });
      }
      function splitCSV(line) {
        var out = [], cur = '', q = false;
        for (var i = 0; i < line.length; i++) {
          var ch = line[i];
          if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
          else { if (ch === ',') { out.push(cur); cur = ''; } else if (ch === '"') q = true; else cur += ch; }
        }
        out.push(cur); return out;
      }
      function parse(text, lim) {
        var lines = text.split(/\r?\n/).filter(function (l) { return l.length; });
        if (lines.length < 2) return [];
        var head = splitCSV(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
        var ix = function (k) { return head.indexOf(k); };
        var di = ix('date'), li = ix('location'), bi = ix('browser'), si = ix('system');
        var rows = lines.slice(1).map(function (l) {
          var c = splitCSV(l);
          return { date: di >= 0 ? c[di] : '', loc: li >= 0 ? c[li] : '', browser: bi >= 0 ? c[bi] : '', system: si >= 0 ? c[si] : '' };
        }).filter(function (r) { return r.date; });
        rows.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        return rows.slice(0, lim);
      }
    },

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
