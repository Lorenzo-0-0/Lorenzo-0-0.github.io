document.querySelectorAll('.pub-teaser--video').forEach(function (wrap) {
  var vid = wrap.querySelector('video');
  if (!vid) return;
  wrap.addEventListener('mouseenter', function () {
    if (!vid.src) vid.src = wrap.dataset.video;
    var p = vid.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  });
  wrap.addEventListener('mouseleave', function () {
    vid.pause();
  });
});


// Visitor globe — self-hosted 3D earth (globe.gl + geojs.io).
// Replaces the dead ClustrMaps/MapMyVisitors widgets. Lazy-loaded when the
// section scrolls into view. Geolocates the current visitor and lights up
// their city. No third-party widget, no domain-lock, no account.
(function () {
  var el = document.getElementById('visitor-globe');
  if (!el) return;
  var caption = document.getElementById('visitor-caption');
  var started = false;
  var ACCENT = '#C2410C';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function geolocate() {
    // Primary: geojs.io (HTTPS, no-auth, CORS *). Fallback: ipwho.is.
    return fetch('https://get.geojs.io/v1/ip/geo.json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        return { lat: parseFloat(d.latitude), lng: parseFloat(d.longitude), city: d.city, country: d.country };
      })
      .catch(function () {
        return fetch('https://ipwho.is/')
          .then(function (r) { return r.json(); })
          .then(function (d) { return { lat: d.latitude, lng: d.longitude, city: d.city, country: d.country }; })
          .catch(function () { return null; });
      });
  }

  function start() {
    if (started) return;
    started = true;
    loadScript('https://cdn.jsdelivr.net/npm/globe.gl/dist/globe.gl.min.js')
      .then(function () {
        var size = Math.min(el.clientWidth || 280, 280);
        var world = Globe()(el)
          .width(size)
          .height(size)
          .backgroundColor('rgba(0,0,0,0)')
          .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg')
          .showAtmosphere(true)
          .atmosphereColor(ACCENT)
          .atmosphereAltitude(0.2);
        var c = world.controls();
        c.autoRotate = true;
        c.autoRotateSpeed = 0.9;
        c.enableZoom = false;

        geolocate().then(function (geo) {
          if (geo && isFinite(geo.lat) && isFinite(geo.lng)) {
            world.pointOfView({ lat: geo.lat, lng: geo.lng, altitude: 2.2 }, 1400);
            world.pointsData([{ lat: geo.lat, lng: geo.lng }])
              .pointColor(function () { return ACCENT; })
              .pointAltitude(0.05)
              .pointRadius(0.6);
            world.ringsData([{ lat: geo.lat, lng: geo.lng }])
              .ringColor(function () { return function (t) { return 'rgba(194,65,12,' + (1 - t) + ')'; }; })
              .ringMaxRadius(6)
              .ringPropagationSpeed(2.4)
              .ringRepeatPeriod(950);
            if (caption) {
              var place = [geo.city, geo.country].filter(Boolean).join(', ');
              caption.innerHTML = '👋 You’re visiting from <b>' + place + '</b>';
            }
          }
        });
      })
      .catch(function () { /* CDN blocked — leave the section empty rather than break */ });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { start(); io.disconnect(); }
    });
  }, { rootMargin: '300px' });
  io.observe(el);
})();
