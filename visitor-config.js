/* Single source of truth for the visitor-log Worker endpoint (no trailing slash).
 * Served from our own domain: *.workers.dev is GFW-blocked in mainland China
 * (DNS pollution since 2022), so mainland visitors could never reach the old
 * visitor-log.jingliangli.workers.dev URL — which still works as a fallback. */
window.VISITOR_WORKER_URL = 'https://stats.jingliangli.com';
