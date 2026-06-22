/* ============================================================================
 * visitors.html dashboard — fetches stats via GCClient and renders a minimal,
 * elegant ranking dashboard (Totals, Locations, Top referrers, Browsers,
 * Systems, Sizes) — serif numbers + hairline dividers, no colored bars.
 * ========================================================================== */
(function () {
  var root = document.getElementById('gc-dash');
  if (!root) return;

  var PERIODS = [
    { k: 'week', label: 'Week' },
    { k: 'month', label: 'Month' },
    { k: 'year', label: 'Year' },
    { k: 'all', label: 'All' }
  ];
  var state = { period: 'all' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function flag(cc) {
    if (!cc || cc.length !== 2) return '';
    return cc.toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(127397 + c.charCodeAt(0)); });
  }
  function relTime(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return iso || '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24); if (d < 30) return d + 'd ago';
    return new Date(t).toLocaleDateString();
  }

  if (!window.GCClient || !GCClient.hasToken()) {
    renderNoToken();
    return;
  }

  renderShell();
  load();

  function renderShell() {
    var ctrls = '<div class="gc-controls"><span class="gc-ctrl-label">Period</span>' +
      PERIODS.map(function (p) {
        return '<button class="gc-period' + (p.k === state.period ? ' is-active' : '') +
          '" data-period="' + p.k + '">' + p.label + '</button>';
      }).join('') + '</div>';
    root.innerHTML = ctrls + '<div id="gc-body"><div class="gc-state">Loading…</div></div>';
    root.querySelectorAll('.gc-period').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.period === state.period) return;
        state.period = b.dataset.period;
        root.querySelectorAll('.gc-period').forEach(function (x) { x.classList.toggle('is-active', x.dataset.period === state.period); });
        load();
      });
    });
  }

  function load() {
    var body = document.getElementById('gc-body');
    body.innerHTML = '<div class="gc-state">Loading…</div>';
    GCClient.all(state.period).then(function (d) {
      body.innerHTML =
        widget('Totals', totalsHtml(d.hits), 'full') +
        '<div class="gc-grid">' +
          widget('Locations', rowsHtml(d.locations.stats)) +
          widget('Top referrers', rowsHtml(d.toprefs.stats)) +
          widget('Browsers', rowsHtml(d.browsers.stats)) +
          widget('Systems', rowsHtml(d.systems.stats)) +
          widget('Sizes', rowsHtml(d.sizes.stats)) +
        '</div>' +
        '<div class="gc-widget gc-widget--full" id="gc-recent-widget"><h3>Recent visits</h3>' +
          '<div id="gc-recent"><div class="gc-empty">Loading…</div></div></div>';
      renderRecent();
    }).catch(function (e) {
      body.innerHTML = '<div class="gc-state">Couldn’t load stats (' + esc(e.message) +
        '). If this says HTTP 403, the token needs the <b>Read statistics</b> permission.</div>';
    });
  }

  function widget(title, inner, mod) {
    return '<div class="gc-widget' + (mod === 'full' ? ' gc-widget--full' : '') + '">' +
      '<h3>' + esc(title) + '</h3>' + inner + '</div>';
  }

  // Recent individual visits (time · country · device) via the export API.
  // Hidden entirely if unavailable (e.g. the token lacks the Export permission).
  function renderRecent() {
    if (!GCClient.recentVisits) return;
    GCClient.recentVisits(12).then(function (rows) {
      var holder = document.getElementById('gc-recent');
      var wrap = document.getElementById('gc-recent-widget');
      if (!rows || !rows.length) { if (wrap) wrap.remove(); return; }
      holder.innerHTML = '<div class="gc-rows">' + rows.map(function (r) {
        var cc = (r.loc || '').slice(0, 2);
        var dev = [r.browser, r.system].filter(Boolean).join(' · ');
        return '<div class="gc-row">' +
          '<span class="gc-label">' + (flag(cc) ? flag(cc) + ' ' : '') + esc(r.loc || '—') +
            (dev ? ' <span class="gc-sub">' + esc(dev) + '</span>' : '') + '</span>' +
          '<span class="gc-time">' + esc(relTime(r.date)) + '</span>' +
          '</div>';
      }).join('') + '</div>' +
        '<p class="gc-foot">Per-visit time · country · device. IP and city aren’t shown — GoatCounter doesn’t store them.</p>';
    });
  }

  // Totals: big number + per-day sparkline, DERIVED from /stats/hits
  // (sum of per-path counts; per-day series summed across paths).
  function totalsHtml(hits) {
    var list = (hits && hits.hits) || [];
    var n = list.reduce(function (a, h) { return a + (h.count || 0); }, 0);
    var byDay = {};
    list.forEach(function (h) {
      (h.stats || []).forEach(function (s) {
        var v = (typeof s.daily === 'number') ? s.daily
          : (s.hourly || []).reduce(function (a, x) { return a + x; }, 0);
        byDay[s.day] = (byDay[s.day] || 0) + v;
      });
    });
    var days = Object.keys(byDay).sort().map(function (k) { return { day: k, v: byDay[k] }; });
    var max = days.reduce(function (a, d) { return Math.max(a, d.v); }, 1);
    var active = days.filter(function (d) { return d.v > 0; }).length;
    // Only show a (subtle) sparkline when there's enough shape to be worth it.
    var spark = active >= 2
      ? '<div class="gc-spark">' + days.map(function (d) {
          var h = Math.max(2, Math.round((d.v / max) * 40));
          return '<div class="gc-day" title="' + esc(d.day) + ': ' + d.v + '" style="height:' + h + 'px"></div>';
        }).join('') + '</div>' +
        '<div class="gc-spark-axis"><span>' + esc(days[0].day) + '</span><span>' + esc(days[days.length - 1].day) + '</span></div>'
      : '';
    return '<div class="gc-summary"><span class="gc-big">' + n.toLocaleString() +
      '</span><span class="gc-big-label">' + (n === 1 ? 'visit' : 'visits') + '</span></div>' + spark;
  }

  // Friendly labels for breakdowns whose API `name` is empty (e.g. sizes).
  var ID_LABELS = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop', desktophd: 'Large desktop', unknown: '(unknown)' };
  function niceName(s) {
    if (s.name) return s.name;
    if (s.id && ID_LABELS[s.id]) return ID_LABELS[s.id];
    return s.id || '(unknown)';
  }

  // Minimal ranking rows — no colored bars: name (left) · faint % · serif count (right).
  function rowsHtml(stats) {
    var data = (stats || []).filter(function (s) { return (s.count || 0) > 0; });
    if (!data.length) return '<div class="gc-empty">Nothing to display</div>';
    var sum = data.reduce(function (a, s) { return a + (s.count || 0); }, 0) || 1;
    var rows = data.map(function (s) {
      var count = s.count || 0;
      var perc = Math.round((count / sum) * 100);
      var label = s.link
        ? '<a href="https://lorenzo-0-0.github.io' + esc(s.link) + '" target="_blank" rel="noopener">' + esc(s.name || s.link) + '</a>'
        : esc(niceName(s));
      return '<div class="gc-row">' +
        '<span class="gc-label">' + label + '</span>' +
        '<span class="gc-perc">' + perc + '%</span>' +
        '<span class="gc-count">' + count.toLocaleString() + '</span>' +
        '</div>';
    }).join('');
    return '<div class="gc-rows">' + rows + '</div>';
  }

  function renderNoToken() {
    root.innerHTML = '<div class="gc-state">' +
      'This dashboard reads live data from GoatCounter and needs a read-only API token.' +
      '<ol>' +
      '<li>Open <b>jingliangli.goatcounter.com</b> → top-menu username → <b>API</b>.</li>' +
      '<li>Create a token with <b>only</b> the <code>Read statistics</code> permission.</li>' +
      '<li>Paste it into <code>gc-client.js</code> (the <code>TOKEN</code> value).</li>' +
      '</ol>' +
      'Until then, you can always view the full dashboard at ' +
      '<a href="https://jingliangli.goatcounter.com" target="_blank" rel="noopener">jingliangli.goatcounter.com</a>.' +
      '</div>';
  }
})();
