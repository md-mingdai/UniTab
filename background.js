/* ============================================
   UniTab - Background Service Worker
   Acts as a CORS-bypass proxy for cross-origin
   JSONP suggestion endpoints (e.g. Baidu) that
   don't send Access-Control-Allow-Origin headers.

   In Manifest V3, host_permissions grant the
   extension's background service worker privileged
   cross-origin fetch access from extension contexts.
   ============================================ */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'fetch_jsonp' && message.url) {
    /* Use fetch from the SW context — privileged via host_permissions.
       The response is opaque CORS-wise but the SW can still read the body. */
    fetch(message.url)
      .then((resp) => resp.text())
      .then((text) => {
        try {
          sendResponse({ ok: true, text });
        } catch (e) {
          /* sendResponse may fail if the caller is gone; ignore */
        }
      })
      .catch((err) => {
        try {
          sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
        } catch (e) {
          /* ignore */
        }
      });
    return true; // keep channel open for async sendResponse
  }
  return false;
});
