/* ============================================================================
 * Real-time current-visitor detail card. Shows the person currently viewing the
 * page: IP, city/region/country (+flag), network/ISP, coordinates, local time.
 * Source: ipwho.is (primary) → geojs.io (fallback), both CORS-open, no key.
 * NOTE: this is the ONLY way to show an IP/city — GoatCounter (used for the
 * aggregate stats) deliberately stores no IP and no city for past visitors.
 * ========================================================================== */
(function () {
  var el = document.getElementById('visitor-live');
  if (!el) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function flag(cc) {
    if (!cc || cc.length !== 2) return '';
    return cc.toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(127397 + c.charCodeAt(0)); });
  }
  function localTime(tz) {
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz || undefined }).format(new Date()); }
    catch (e) { return new Date().toLocaleString(); }
  }
  function normalize(d, src) {
    if (src === 'ipwho') {
      return {
        ip: d.ip, city: d.city, region: d.region, country: d.country, cc: d.country_code,
        isp: (d.connection && (d.connection.isp || d.connection.org)) || '',
        lat: d.latitude, lng: d.longitude, tz: (d.timezone && d.timezone.id) || ''
      };
    }
    return {
      ip: d.ip, city: d.city, region: '', country: d.country, cc: d.country_code,
      isp: d.organization_name || d.organization || '',
      lat: d.latitude, lng: d.longitude, tz: d.timezone || ''
    };
  }
  function fetchInfo() {
    // geojs is the reliable primary (CORS, no rate-limit). ipwho.is is a fallback
    // only (it 403s under load) and would add a region field if reached.
    return fetch('https://get.geojs.io/v1/ip/geo.json').then(function (r) {
      if (!r.ok) throw new Error('geojs ' + r.status);
      return r.json();
    }).then(function (d) {
      if (d && d.ip) return normalize(d, 'geojs');
      throw new Error('geojs empty');
    }).catch(function () {
      return fetch('https://ipwho.is/').then(function (r) { return r.json(); })
        .then(function (d) { return (d && d.ip) ? normalize(d, 'ipwho') : null; })
        .catch(function () { return null; });
    });
  }

  var promise = fetchInfo();
  window.__visitorLive = promise; // exposed (e.g. for a globe "you" marker)
  promise.then(function (info) {
    if (!info || !info.ip) { el.innerHTML = ''; return; }
    var place = [info.city, info.region, info.country].filter(Boolean).join(', ');
    var coords = (isFinite(info.lat) && isFinite(info.lng))
      ? (Number(info.lat).toFixed(3) + ', ' + Number(info.lng).toFixed(3)) : '—';
    var rows = [
      ['IP', '<span class="vl-v mono">' + esc(info.ip) + '</span>'],
      ['Network', '<span class="vl-v">' + esc(info.isp || '—') + '</span>'],
      ['Coordinates', '<span class="vl-v mono">' + esc(coords) + '</span>'],
      ['Local time', '<span class="vl-v">' + esc(localTime(info.tz)) + '</span>']
    ];
    el.innerHTML =
      '<p class="vl-line">📍 You’re visiting from <b>' + esc(place) + '</b> ' + flag(info.cc) + '</p>' +
      '<div class="vl-grid">' + rows.map(function (r) { return '<span class="vl-k">' + r[0] + '</span>' + r[1]; }).join('') + '</div>';
  });
})();
