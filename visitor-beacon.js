/* ============================================================================
 * Fire-and-forget visit beacon. Sends path + referrer to the visitor-log Worker;
 * the Worker fills in the real IP/geo server-side. Uses a text/plain blob so it's
 * a CORS "simple request" (no preflight) and survives page unload via sendBeacon.
 * No-ops until visitor-config.js is filled with the deployed Worker URL.
 * ========================================================================== */
(function () {
  var base = (window.VISITOR_WORKER_URL || '').replace(/\/+$/, '');
  if (!base || /YOUR-SUBDOMAIN/.test(base)) return;

  try {
    var payload = JSON.stringify({
      path: location.pathname,
      referrer: document.referrer || ''
    });
    var url = base + '/log';
    var blob = new Blob([payload], { type: 'text/plain' });
    if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;
    // Fallback if sendBeacon is unavailable or refused the payload.
    fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'text/plain' }, keepalive: true })
      .catch(function () {});
  } catch (e) { /* never break the page over analytics */ }
})();
