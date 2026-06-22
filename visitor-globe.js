/* ============================================================================
 * Visitor globe — self-hosted, clean light-blue rotating earth (globe.gl) with
 * real visitor-location dots from GoatCounter (via GCClient). Replaces the old
 * realistic earth-texture globe. Vendored assets only (globe.gl + local data),
 * so the only runtime third-party call is the GoatCounter stats API.
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
      var ref = res[2];
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

      // Real visitor dots from GoatCounter.
      if (window.GCClient && GCClient.hasToken()) {
        GCClient.breakdown('locations', 'all').then(function (loc) {
          var pts = GCClient.toPoints(loc.stats, ref);
          if (!pts.length) { setCaption(0, 0); return; }
          var max = pts.reduce(function (a, p) { return Math.max(a, p.count); }, 1);
          var totalVisits = pts.reduce(function (a, p) { return a + p.count; }, 0);

          world.pointsData(pts)
            .pointLat('lat').pointLng('lng')
            .pointColor(function () { return ACCENT; })
            .pointAltitude(function (d) { return 0.04 + (d.count / max) * 0.22; })
            .pointRadius(function (d) { return 0.28 + (d.count / max) * 0.45; })
            .pointResolution(12)
            .pointLabel(function (d) { return d.name + ': ' + d.count; });

          // Ripple rings on the top locations for life.
          var top = pts.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
          world.ringsData(top)
            .ringLat('lat').ringLng('lng')
            .ringColor(function () { return function (t) { return 'rgba(194,65,12,' + (1 - t) + ')'; }; })
            .ringMaxRadius(5).ringPropagationSpeed(2.2).ringRepeatPeriod(1000);

          setCaption(totalVisits, pts.length);
        }).catch(function () { setCaption(-1, 0); });
      } else {
        setCaption(-1, 0); // no token yet
      }
    }).catch(function () { /* asset/CDN failure — leave section empty, don't break page */ });
  }

  function setCaption(visits, countries) {
    if (!caption) return;
    if (visits < 0) { caption.innerHTML = '🌍 A globe of where my visitors come from'; return; }
    if (visits === 0) { caption.innerHTML = '🌍 Waiting for the first mapped visitor…'; return; }
    caption.innerHTML = '🌍 <b>' + visits.toLocaleString() + '</b> visits from <b>' +
      countries + '</b> ' + (countries === 1 ? 'country' : 'countries');
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { start(); io.disconnect(); } });
  }, { rootMargin: '300px' });
  io.observe(el);
};
