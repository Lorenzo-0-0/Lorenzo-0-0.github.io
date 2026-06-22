/* ============================================================================
 * Visitor globe — self-hosted, clean light-blue rotating earth (globe.gl) with
 * per-COUNTRY visitor dots. Count + locations come from GoatCounter (via
 * GCClient), so the globe is always consistent with the Visitor Analytics
 * dashboard. Dots are placed at country centroids (data/country-centroids.json),
 * never a precise location — the precise per-visit log is private (owner panel).
 * Vendored assets only (globe.gl + local datasets).
 *
 * window.initVisitorGlobe(globeEl, captionEl, linkUrl) — lazy-loads when in view.
 * If linkUrl is given, a tap on the globe navigates there (a rotate-drag won't).
 * ========================================================================== */
window.initVisitorGlobe = function (el, caption, linkUrl) {
  if (!el) return;
  var started = false;
  var ACCENT = '#C2410C';

  // Tap-to-navigate (only on a tap, not a rotate-drag).
  if (linkUrl) {
    el.classList.add('is-clickable');
    el.style.cursor = 'pointer';
    el.setAttribute('title', 'View full analytics');
    var dn = null;
    el.addEventListener('pointerdown', function (e) { dn = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    el.addEventListener('pointerup', function (e) {
      if (!dn) return;
      var moved = Math.abs(e.clientX - dn.x) + Math.abs(e.clientY - dn.y);
      var quick = Date.now() - dn.t < 400;
      dn = null;
      if (moved < 6 && quick) window.location.href = linkUrl;
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }

  function start() {
    if (started) return;
    started = true;

    Promise.all([
      loadScript('assets/globe.gl.min.js'),
      getJSON('data/countries.geojson'),
      getJSON('data/country-centroids.json')
    ]).then(function (res) {
      var countries = res[1];
      var centroids = (res[2] && res[2].centroids) || {};
      var size = Math.min(el.clientWidth || 240, 240);

      var world = Globe()(el)
        .width(size).height(size)
        .backgroundColor('rgba(0,0,0,0)')
        .globeImageUrl(null)                 // no photo texture — flat color
        .showAtmosphere(true)
        .atmosphereColor('#acd6ef')
        .atmosphereAltitude(0.2)
        .hexPolygonsData(countries.features) // ClustrMaps-style dotted continents
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.32)
        .hexPolygonUseDots(true)
        .hexPolygonColor(function () { return 'rgba(54,110,170,0.55)'; });

      // Recolor the ocean sphere to a clean light blue (mutate existing material,
      // no THREE constructor needed since globe.gl bundles its own three.js).
      var m = world.globeMaterial();
      m.color.set('#cfe7f5');
      m.emissive.set('#2e6bb0');
      m.emissiveIntensity = 0.10;
      m.shininess = 6;

      var c = world.controls();
      c.autoRotate = true;
      c.autoRotateSpeed = 0.7;
      c.enableZoom = false;

      drawFromGoatCounter(world, centroids);
    }).catch(function () { /* asset failure — leave section empty, don't break page */ });
  }

  // Pull the SAME data the dashboard shows: total from /stats/hits, per-country
  // breakdown from /stats/locations. Plot a dot at each country's centroid.
  function drawFromGoatCounter(world, centroids) {
    if (!window.GCClient || !GCClient.hasToken()) { setCaption(-1, 0); return; }

    Promise.all([
      GCClient.hits('all'),
      GCClient.breakdown('locations', 'all')
    ]).then(function (r) {
      var hits = r[0], loc = r[1];

      var total = ((hits && hits.hits) || []).reduce(function (a, h) { return a + (h.count || 0); }, 0);

      var stats = ((loc && loc.stats) || []).filter(function (s) { return (s.count || 0) > 0; });
      var pts = [];
      stats.forEach(function (s) {
        var cc = (s.id || '').toUpperCase();
        var ll = centroids[cc];
        if (!ll) return;
        pts.push({ lat: ll[0], lng: ll[1], count: s.count, name: s.name || cc });
      });

      if (pts.length) {
        var max = pts.reduce(function (a, p) { return Math.max(a, p.count); }, 1);
        world.pointsData(pts)
          .pointLat('lat').pointLng('lng')
          .pointColor(function () { return ACCENT; })
          .pointAltitude(function (d) { return 0.04 + (d.count / max) * 0.22; })
          .pointRadius(function (d) { return 0.28 + (d.count / max) * 0.45; })
          .pointResolution(12)
          .pointLabel(function (d) {
            return d.name + ': ' + d.count + (d.count === 1 ? ' visit' : ' visits');
          });

        var top = pts.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
        world.ringsData(top)
          .ringLat('lat').ringLng('lng')
          .ringColor(function () { return function (t) { return 'rgba(194,65,12,' + (1 - t) + ')'; }; })
          .ringMaxRadius(5).ringPropagationSpeed(2.2).ringRepeatPeriod(1000);
      }

      setCaption(total, stats.length);
    }).catch(function () { setCaption(-1, 0); });
  }

  function setCaption(visits, countries) {
    if (!caption) return;
    if (visits < 0) { caption.innerHTML = '🌍 A globe of where my visitors come from'; return; }
    if (visits === 0) { caption.innerHTML = '🌍 Waiting for the first mapped visitor…'; return; }
    caption.innerHTML = '🌍 <b>' + visits.toLocaleString() + '</b> ' + (visits === 1 ? 'visit' : 'visits') +
      ' from <b>' + countries + '</b> ' + (countries === 1 ? 'country' : 'countries');
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { start(); io.disconnect(); } });
  }, { rootMargin: '300px' });
  io.observe(el);
};
