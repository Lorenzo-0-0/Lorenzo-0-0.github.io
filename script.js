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


// Visitor globe: point clicks to THIS site's MapMyVisitors stats map
// (the widget's native anchor only points to the mapmyvisitors.com homepage).
// web/1c5i9 = public visitor map for https://lorenzo-0-0.github.io/ (verified).
(function () {
  var STATS_URL = 'https://mapmyvisitors.com/web/1c5i9';
  var globe = document.querySelector('.visitor-globe');
  if (!globe) return;
  function fix() {
    var a = document.getElementById('mmvst_a');
    if (!a) return;
    if (a.getAttribute('href') !== STATS_URL) a.setAttribute('href', STATS_URL);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  }
  fix();
  new MutationObserver(fix).observe(globe, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['href']
  });
})();
