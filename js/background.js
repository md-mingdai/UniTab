/* ============================================
   UniTab - Background Image Management
   ============================================ */

const Background = (() => {
  const imageEl = document.getElementById('background-image');

  /* Marker prefix that flags a URL as a Bing Daily Wallpaper source. */
  const BING_OTD_PREFIX = 'bing-otd:';
  /* format=js returns JSONP wrapped in parens, e.g. ({"images":[...]})
     The SW returns the raw text; we strip the wrapping below. */
  const BING_OTD_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
  const BING_OTD_BASE = 'https://cn.bing.com';

  /** load({ source, imageData, color })
   *  source : 'none' | 'bing' | 'image' | 'color'
   *  - 'none'  : clear background → show default CSS gradient
   *  - 'bing'  : imageData is bing-otd:URL → apply the wallpaper URL
   *  - 'image' : imageData is base64 or raw URL → apply as CSS url()
   *  - 'color' : color is a CSS color string → apply solid color via body style
   *
   *  Also accepts a plain string for backward compat (treats as 'image'). */
  function load(opts) {
    /* Backward compat: plain string → treat as image source */
    if (typeof opts === 'string') {
      const data = opts;
      if (!data) { clear(); return; }
      if (data.startsWith(BING_OTD_PREFIX)) {
        applyImage(data.slice(BING_OTD_PREFIX.length));
      } else if (data.startsWith('data:')) {
        applyImage(data);
      } else {
        fetchAndApply(data);
      }
      return;
    }

    if (!opts || opts.source === 'none') {
      clear();
      setSolidColor('');
      return;
    }

    if (opts.source === 'color') {
      clear();
      setSolidColor(opts.color || '');
      return;
    }

    /* source === 'bing' or source === 'image' */
    setSolidColor('');
    const data = opts.imageData;
    if (!data) { clear(); return; }

    if (opts.source === 'bing') {
      const url = typeof data === 'string' && data.startsWith(BING_OTD_PREFIX)
        ? data.slice(BING_OTD_PREFIX.length) : data;
      applyImage(url);
      return;
    }

    /* source === 'image' */
    if (typeof data === 'string' && data.startsWith('data:')) {
      applyImage(data);
    } else {
      fetchAndApply(data);
    }
  }

  function applyImage(src) {
    imageEl.style.backgroundImage = `url(${src})`;
  }

  function fetchAndApply(url) {
    const img = new Image();
    img.onload = () => { applyImage(url); };
    img.onerror = () => {
      console.warn('UniTab: Could not load background image from URL:', url);
      clear();
    };
    img.src = url;
  }

  function clear() {
    imageEl.style.backgroundImage = '';
  }

  /* Apply / clear solid background color.
     We set it on the .background-image element (which covers the full
     viewport) so it hides the ::before gradient fallback. Setting it on
     body would be blocked by the gradient layer on top. */
  function setSolidColor(color) {
    if (color) {
      imageEl.style.background = color;
    } else {
      imageEl.style.background = '';
    }
  }

  /* Fetch Bing's daily wallpaper metadata via the background service worker.
     Returns a promise that resolves to { ok, url, copyright, headline }. */
  async function fetchBingOfTheDay() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return { ok: false, error: '需要 Service Worker 环境' };
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'fetch_jsonp', url: BING_OTD_API, headers: { 'Accept': 'application/json' } },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.ok) {
            resolve({ ok: false, error: response && response.error || 'SW 请求失败' });
            return;
          }
          try {
            /* Bing returns format=js as JSONP wrapped in parens:
               ({"images":[...], "tooltips":{...}})
               Strip the outermost parens before JSON.parse. */
            const text = response.text.trim();
            let json = text;
            if (text.startsWith('(') && text.endsWith(')')) {
              json = text.slice(1, -1).trim();
            }
            const data = JSON.parse(json);
            const img = data && data.images && data.images[0];
            if (!img || !img.url) {
              resolve({ ok: false, error: '必应返回数据缺少 url 字段' });
              return;
            }
            const url = img.url.startsWith('http') ? img.url : (BING_OTD_BASE + img.url);
            resolve({
              ok: true,
              url,
              copyright: img.copyright || '',
              headline: img.headline || '',
              startdate: img.startdate || ''
            });
          } catch (e) {
            resolve({ ok: false, error: '解析必应 JSONP 失败: ' + e.message });
          }
        }
      );
    });
  }

  function getBingOtdPrefix() {
    return BING_OTD_PREFIX;
  }

  /* Extract the dominant color from an image URL (or data: URI).
     Returns a promise that resolves to a CSS hex color string.
     Samples a downscaled version for performance. */
  function extractThemeColor(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          const size = 32;
          c.width = size; c.height = size;
          const cx = c.getContext('2d');
          cx.drawImage(img, 0, 0, size, size);
          const data = cx.getImageData(0, 0, size, size).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i + 1]; b += data[i + 2];
            count++;
          }
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          resolve('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''));
        } catch {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = src;
    });
  }

  return { load, clear, fetchBingOfTheDay, getBingOtdPrefix, extractThemeColor };
})();
