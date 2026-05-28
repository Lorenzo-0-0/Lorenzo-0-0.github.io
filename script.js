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

// Visitor globe: fallback emoji globe is shown by default (zero white-screen risk).
// If ClustrMaps successfully renders its real visitor globe, hide the emoji fallback.
(function () {
  var wrap = document.querySelector('.visitor-globe');
  if (!wrap) return;
  var fallback = wrap.querySelector('.css-globe');
  function syncFallback() {
    var clstr = wrap.querySelector('.clstrm_outer');
    var clustrmapsOk = clstr && clstr.offsetHeight > 10;
    if (fallback) fallback.hidden = clustrmapsOk;
  }
  // Check multiple times: ClustrMaps may take a moment to inject its DOM.
  syncFallback();
  setTimeout(syncFallback, 1500);
  setTimeout(syncFallback, 4000);
})();
