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
