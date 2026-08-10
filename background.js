/* ============================================
   UniTab - Background Service Worker
   Acts as a CORS-bypass proxy for cross-origin
   JSONP suggestion endpoints (e.g. Baidu) that
   don't send Access-Control-Allow-Origin headers.

   In Manifest V3, host_permissions grant the
   extension's background service worker privileged
   cross-origin fetch access from extension contexts.
   ============================================ */

const GBK_DECODER = new TextDecoder('gbk');
const UTF8_DECODER = new TextDecoder('utf-8');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'fetch_jsonp' && message.url) {
    fetch(message.url)
      .then(async (resp) => {
        if (!resp.ok) {
          sendResponse({ ok: false, status: resp.status });
          return;
        }
        /* Read raw bytes then decode explicitly. Some browsers ignore the
           charset parameter on Content-Type for cross-origin responses when
           fetched from a service worker, which would corrupt non-UTF8
           encodings like Baidu's GBK. */
        const buf = await resp.arrayBuffer();
        const text = decodeText(buf, resp.headers.get('content-type') || '');
        sendResponse({ ok: true, text });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      });
    return true; // keep channel open for async sendResponse
  }
  return false;
});

function decodeText(buffer, contentType) {
  /* Inspect Content-Type charset first */
  const charsetMatch = contentType.match(/charset=([\w-]+)/i);
  let charset = charsetMatch ? charsetMatch[1].toLowerCase() : null;

  /* Peek at BOM if present */
  const view = new Uint8Array(buffer);
  if (view.length >= 3 && view[0] === 0xEF && view[1] === 0xBB && view[2] === 0xBF) {
    charset = 'utf-8';
  } else if (view.length >= 2 && view[0] === 0xFF && view[1] === 0xFE) {
    charset = 'utf-16le';
  } else if (view.length >= 2 && view[0] === 0xFE && view[1] === 0xFF) {
    charset = 'utf-16be';
  }

  /* Choose decoder */
  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch {
      /* Fall through to GBK or UTF-8 */
    }
  }
  /* Default: try GBK (common for Chinese services), then UTF-8 */
  try {
    const gbk = GBK_DECODER.decode(buffer);
    /* Heuristic: if GBK result has no replacement characters and contains
       typical JSONP identifier characters, prefer it. Otherwise fall back
       to UTF-8. Baidu's response is GBK so this picks the right encoding. */
    if (!gbk.includes('�')) return gbk;
  } catch {
    /* ignore */
  }
  return UTF8_DECODER.decode(buffer);
}
