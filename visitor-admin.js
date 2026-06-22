/* ============================================================================
 * Owner-only visitor log (visitors.html). A subtle trigger reveals a private
 * panel that calls the visitor-log Worker's /admin endpoint with an access key
 * (stored in localStorage after first unlock) and renders the FULL per-visit
 * rows — IP, network, location, page, referrer, device, time — auto-refreshing.
 *
 * Security: the key gates the Worker endpoint; the page ships NO key. A normal
 * visitor can click the trigger but sees only the unlock prompt.
 * ========================================================================== */
(function () {
  var KEY_LS = 'vlog_admin_key';
  var trigger = document.getElementById('vlog-trigger');
  var sec = document.getElementById('vlog');
  var body = sec && document.getElementById('vlog-body');
  if (!trigger || !sec || !body) return;

  var base = (window.VISITOR_WORKER_URL || '').replace(/\/+$/, '');
  var timer = null;

  var COUNTRY = (function () {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { return null; }
  })();

  trigger.addEventListener('click', function () {
    if (!sec.hidden) { close(); return; }
    open();
  });

  function open() {
    sec.hidden = false;
    trigger.classList.add('is-open');
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var key = localStorage.getItem(KEY_LS);
    if (key) loadPanel(key); else renderUnlock('');
  }
  function close() {
    stopTimer();
    sec.hidden = true;
    trigger.classList.remove('is-open');
  }

  /* ---------- unlock ---------- */
  function renderUnlock(msg) {
    stopTimer();
    body.innerHTML =
      '<div class="vlog-card vlog-unlock">' +
        '<h2>Private visitor log</h2>' +
        '<p class="vlog-hint">Owner only — enter your access key to see full per-visit details, including IP.</p>' +
        (msg ? '<p class="vlog-err">' + esc(msg) + '</p>' : '') +
        '<form id="vlog-form" autocomplete="off">' +
          '<input id="vlog-key" type="password" autocomplete="off" spellcheck="false" placeholder="access key" />' +
          '<button type="submit">Unlock</button>' +
        '</form>' +
      '</div>';
    var form = document.getElementById('vlog-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var k = (document.getElementById('vlog-key').value || '').trim();
      if (k) verify(k);
    });
    var inp = document.getElementById('vlog-key');
    if (inp) inp.focus();
  }

  function verify(k) {
    body.innerHTML = '<div class="vlog-card"><p class="vlog-loading">Checking…</p></div>';
    fetchAdmin(k, 1).then(function () {
      localStorage.setItem(KEY_LS, k);
      loadPanel(k);
    }).catch(function (err) {
      renderUnlock(err && err.status === 401 ? 'Wrong key. Try again.' : 'Couldn’t reach the server.');
    });
  }

  /* ---------- panel ---------- */
  function loadPanel(key) {
    refresh(key, false);
    stopTimer();
    timer = setInterval(function () { if (!document.hidden && !sec.hidden) refresh(key, true); }, 15000);
  }

  function refresh(key, silent) {
    if (!silent) body.innerHTML = '<div class="vlog-card"><p class="vlog-loading">Loading log…</p></div>';
    fetchAdmin(key, 200).then(render).catch(function (err) {
      if (err && err.status === 401) {
        localStorage.removeItem(KEY_LS); stopTimer();
        renderUnlock('Key no longer valid — re-enter it.');
      } else if (!silent) {
        body.innerHTML = '<div class="vlog-card"><p class="vlog-err">Couldn’t load (' +
          esc((err && err.message) || 'error') + ').</p></div>';
      }
    });
  }

  function fetchAdmin(key, limit) {
    if (!base || /YOUR-SUBDOMAIN/.test(base)) {
      return Promise.reject(new Error('Worker URL not configured'));
    }
    return fetch(base + '/admin?limit=' + limit, { headers: { 'Authorization': 'Bearer ' + key } })
      .then(function (r) {
        if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
        return r.json();
      });
  }

  function render(data) {
    var rows = (data && data.rows) || [];
    var total = (data && data.total) || 0;
    var cc = (data && data.countries) || 0;
    var head =
      '<div class="vlog-head">' +
        '<div class="vlog-title"><h2>Visitor log <span class="vlog-tag">private</span></h2>' +
          '<p class="vlog-meta"><b>' + total.toLocaleString() + '</b> ' + (total === 1 ? 'visit' : 'visits') +
            ' · <b>' + cc + '</b> ' + (cc === 1 ? 'country' : 'countries') +
            ' · updated ' + esc(nowTime()) + '</p></div>' +
        '<div class="vlog-actions">' +
          '<span class="vlog-live" title="Auto-refreshes every 15s">● live</span>' +
          '<button id="vlog-refresh" class="vlog-btn">Refresh</button>' +
          '<button id="vlog-lock" class="vlog-btn">Lock</button>' +
        '</div>' +
      '</div>';
    var table = rows.length ? tableHtml(rows) : '<p class="vlog-empty">No visits logged yet.</p>';
    body.innerHTML = '<div class="vlog-card">' + head + table + '</div>';
    document.getElementById('vlog-refresh').addEventListener('click', function () {
      refresh(localStorage.getItem(KEY_LS), false);
    });
    document.getElementById('vlog-lock').addEventListener('click', function () {
      localStorage.removeItem(KEY_LS); stopTimer();
      renderUnlock('Locked. Enter your key to view again.');
    });
  }

  function tableHtml(rows) {
    var trs = rows.map(function (r) {
      var cc = (r.country || '').slice(0, 2);
      var loc = [r.city, r.region, countryName(cc)].filter(Boolean).join(', ') || '—';
      var coord = (r.lat != null && r.lng != null) ? (round(r.lat) + ', ' + round(r.lng)) : '';
      return '<tr>' +
        '<td class="vlog-time"><span class="vlog-abs">' + esc(localTime(r.ts)) + '</span>' +
          '<span class="vlog-rel">' + esc(relTime(r.ts)) + '</span></td>' +
        '<td>' + (flag(cc) ? flag(cc) + ' ' : '') + esc(loc) +
          (coord ? '<span class="vlog-coord">' + esc(coord) + '</span>' : '') + '</td>' +
        '<td class="vlog-ip">' + esc(r.ip || '—') + '</td>' +
        '<td>' + esc(r.org || '—') + '</td>' +
        '<td class="vlog-path">' + esc(r.path || '—') + '</td>' +
        '<td class="vlog-ref">' + esc(r.referrer || '—') + '</td>' +
        '<td>' + esc([r.browser, r.os].filter(Boolean).join(' · ') || '—') + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="vlog-scroll"><table class="vlog-table">' +
      '<thead><tr>' +
        '<th>Time</th><th>Location</th><th>IP</th><th>Network</th><th>Page</th><th>Referrer</th><th>Device</th>' +
      '</tr></thead><tbody>' + trs + '</tbody></table></div>';
  }

  /* ---------- helpers ---------- */
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function round(n) { return Math.round(n * 100) / 100; }
  function flag(cc) {
    if (!cc || cc.length !== 2) return '';
    return cc.toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(127397 + c.charCodeAt(0)); });
  }
  function countryName(cc) {
    if (!cc) return '';
    if (COUNTRY) { try { return COUNTRY.of(cc.toUpperCase()) || cc; } catch (e) {} }
    return cc;
  }
  function localTime(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return iso || '';
    return new Date(t).toLocaleString();
  }
  function relTime(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24); if (d < 30) return d + 'd ago';
    return new Date(t).toLocaleDateString();
  }
  function nowTime() { return new Date().toLocaleTimeString(); }
})();
