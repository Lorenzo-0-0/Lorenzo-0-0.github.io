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


// Visitor globe: let the MapMyVisitors widget keep its own anchor (points to
// this site's geo stats map). Only open it in a new tab — do NOT override href.
(function () {
  var globe = document.querySelector('.visitor-globe');
  if (!globe) return;
  function openInNewTab() {
    var a = document.getElementById('mmvst_a');
    if (!a) return;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  }
  openInNewTab();
  new MutationObserver(openInNewTab).observe(globe, { childList: true, subtree: true });
})();
