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


// Visitor globe: send clicks to this site's public stats page in a new tab
// (widget's injected anchor defaults to the mapmyvisitors.com homepage).
(function () {
  var STATS_URL = 'https://mapmyvisitors.com/web/1c5c2';
  function fix() {
    var a = document.getElementById('mmvst_a');
    if (!a) return false;
    if (a.getAttribute('href') !== STATS_URL) {
      a.setAttribute('href', STATS_URL);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    }
    return true;
  }
  var globe = document.querySelector('.visitor-globe');
  if (!globe) return;
  fix();
  new MutationObserver(fix).observe(globe, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href']
  });
})();
