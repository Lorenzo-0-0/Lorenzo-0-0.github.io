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


// Visitor globe — clean light-blue rotating earth with real visitor dots from
// GoatCounter. Built by visitor-globe.js (shared with visitors.html); data from
// gc-client.js. Vendored globe.gl + local datasets, so the only runtime
// third-party call is the GoatCounter stats API.
if (typeof window.initVisitorGlobe === 'function') {
  window.initVisitorGlobe(
    document.getElementById('visitor-globe'),
    document.getElementById('visitor-caption')
  );
}
