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

// Visitor globe fallback: if ClustrMaps fails to render (service/DNS down),
// reveal the self-built CSS globe so the section never shows an empty gap.
(function () {
  function checkGlobe() {
    var wrap = document.querySelector('.visitor-globe');
    if (!wrap) return;
    var clstr = wrap.querySelector('.clstrm_outer');
    var rendered = clstr && clstr.offsetHeight > 10;
    if (!rendered) {
      var fallback = wrap.querySelector('.css-globe');
      if (fallback) fallback.hidden = false;
    }
  }
  if (document.readyState === 'complete') {
    setTimeout(checkGlobe, 3000);
  } else {
    window.addEventListener('load', function () { setTimeout(checkGlobe, 3000); });
  }
})();
