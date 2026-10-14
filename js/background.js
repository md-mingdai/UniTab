/* ============================================
   UniTab - Background Image / Video Management
   ============================================ */

const Background = (() => {
  const imageEl = document.getElementById('background-image'); /* colour placeholder + blur filter */
  const photoEl = document.getElementById('background-photo'); /* the wallpaper itself (fades in) */
  const videoEl = document.getElementById('background-video');

  /* Marker prefix that flags a URL as a Bing Daily Wallpaper source. */
  const BING_OTD_PREFIX = 'bing-otd:';
  const BING_OTD_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
  const BING_OTD_BASE = 'https://cn.bing.com';

  /* ------------------------------------------------------------------
     IndexedDB blob store (one shared connection)
       video_blob     uploaded video wallpaper
       image_blob     uploaded image wallpaper (used to be a base64 string inside
                      localStorage: parsed and re-written on every slider tick, and
                      silently dropped once it passed the 5 MiB localStorage quota)
       bing_wallpaper { url, blob } the last Bing wallpaper, so a new tab can paint
                      it from disk instead of going to the network
     ------------------------------------------------------------------ */
  const DB_NAME = 'unitab_bg';
  const DB_STORE = 'media';
  const KEY_VIDEO = 'video_blob';
  const KEY_IMAGE = 'image_blob';
  const KEY_BING = 'bing_wallpaper';

  let dbPromise = null;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(DB_STORE)) {
            req.result.createObjectStore(DB_STORE);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          /* Let a future schema upgrade proceed; reopen lazily afterwards. */
          db.onversionchange = () => { db.close(); dbPromise = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  function withStore(mode, run) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, mode);
      const request = run(transaction.objectStore(DB_STORE));
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  const getItem = (key) => withStore('readonly', (s) => s.get(key)).then((v) => (v === undefined ? null : v));
  const putItem = (key, value) => withStore('readwrite', (s) => s.put(value, key));
  const deleteItem = (key) => withStore('readwrite', (s) => s.delete(key));
  const hasItem = (key) => withStore('readonly', (s) => s.count(key)).then((n) => n > 0);

  const saveVideoBlob = (blob) => putItem(KEY_VIDEO, blob);
  const loadVideoBlob = () => getItem(KEY_VIDEO);
  const hasVideoBlob = () => hasItem(KEY_VIDEO).catch(() => false);
  const clearVideoBlob = () => deleteItem(KEY_VIDEO).catch(() => {});

  const saveImageBlob = (blob) => putItem(KEY_IMAGE, blob);
  const clearImageBlob = () => deleteItem(KEY_IMAGE).catch(() => {});
  const clearBingCache = () => deleteItem(KEY_BING).catch(() => {});

  /* ------------------------------------------------------------------
     State
     ------------------------------------------------------------------ */

  /* Bumped by every load()/clear(): a slow async step (IndexedDB read, download,
     decode) that finds a newer token has been superseded and must not touch the DOM. */
  let loadToken = 0;
  let photoObjectUrl = null; /* blob: URL currently painted by the photo layer */
  let currentVideoUrl = null; /* blob: URL currently playing in the <video> */
  let videoWanted = false; /* the video wallpaper is the active source */

  /** load(opts)
   *  source : 'none' | 'bing' | 'image' | 'color' | 'video'
   *  For 'bing' : opts.imageData = wallpaper URL
   *  For 'image': opts.imageStored (uploaded Blob in IndexedDB) and/or
   *               opts.imageData (http(s) link, or a legacy data: URL)
   *  For 'video': opts.videoBlob (optional), opts.volume, opts.loop, opts.onEnded */
  function load(opts) {
    opts = normalizeOpts(opts);
    const token = ++loadToken;

    if (!opts || opts.source === 'none') {
      clearAll(); setSolidColor(''); return;
    }

    switch (opts.source) {
      case 'color':
        clearAll(); setSolidColor(opts.color || '');
        return;
      case 'video':
        setSolidColor(''); clearPhoto();
        showVideo(opts, token);
        return;
      case 'bing':
        hideVideo(); setSolidColor('');
        showBing(opts, token);
        return;
      case 'image':
        hideVideo(); setSolidColor('');
        showImage(opts, token);
        return;
      default:
        clearAll();
    }
  }

  /* Legacy call style: load('<url | data: URL | bing-otd:url>') */
  function normalizeOpts(opts) {
    if (typeof opts !== 'string') return opts;
    if (!opts) return { source: 'none' };
    if (opts.startsWith(BING_OTD_PREFIX)) return { source: 'bing', imageData: opts };
    return { source: 'image', imageData: opts };
  }

  function clear() {
    loadToken++;
    clearAll();
  }

  function clearAll() {
    clearPhoto();
    imageEl.style.backgroundColor = '';
    hideVideo();
  }

  /* ------------------------------------------------------------------
     Photo layer
     ------------------------------------------------------------------ */

  function clearPhoto() {
    photoEl.classList.remove('is-ready');
    photoEl.style.backgroundImage = '';
    releasePhotoUrl();
  }

  function releasePhotoUrl() {
    if (photoObjectUrl) {
      URL.revokeObjectURL(photoObjectUrl);
      photoObjectUrl = null;
    }
  }

  /* Decode off the main thread first, so painting the wallpaper never janks a frame. */
  function decode(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(true), () => resolve(false));
      } else {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
      }
    });
  }

  /* Escape for use inside url("...") */
  function cssUrl(src) {
    return src.replace(/["\\\n\r]/g, (c) => '\\' + c.charCodeAt(0).toString(16) + ' ');
  }

  /* Resolves 'shown' | 'stale' (superseded while decoding) | 'failed' (undecodable). */
  async function displayPhoto(src, objectUrl, token) {
    const ok = await decode(src);
    if (token !== loadToken || !ok) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return token !== loadToken ? 'stale' : 'failed';
    }
    photoEl.style.backgroundImage = 'url("' + cssUrl(src) + '")';
    photoEl.classList.add('is-ready'); /* opacity fade-in (css) */
    releasePhotoUrl();
    photoObjectUrl = objectUrl || null;
    return 'shown';
  }

  /* --- Bing wallpaper --- */
  const bingInflight = new Map();

  function isBingUrl(url) {
    return typeof url === 'string' && url.startsWith(BING_OTD_BASE + '/');
  }

  async function fetchImageBlob(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return blob.type && blob.type.startsWith('image/') ? blob : null;
    } catch {
      return null;
    }
  }

  /* The wallpaper bytes: from the disk cache when it holds this exact URL, otherwise
     downloaded once and cached. Concurrent callers share one download. */
  function ensureBingBlob(url) {
    let p = bingInflight.get(url);
    if (!p) {
      p = (async () => {
        try {
          const cached = await getItem(KEY_BING);
          if (cached && cached.url === url && cached.blob) return cached.blob;
        } catch { /* fall through to the network */ }
        const blob = await fetchImageBlob(url);
        if (blob) putItem(KEY_BING, { url, blob }).catch(() => {});
        return blob;
      })();
      bingInflight.set(url, p);
      p.finally(() => bingInflight.delete(url));
    }
    return p;
  }

  async function showBing(opts, token) {
    let url = opts.imageData;
    if (typeof url === 'string' && url.startsWith(BING_OTD_PREFIX)) {
      url = url.slice(BING_OTD_PREFIX.length);
    }
    if (!url) { clearPhoto(); return; }

    const blob = await ensureBingBlob(url);
    if (token !== loadToken) return;
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      if (await displayPhoto(objectUrl, objectUrl, token) !== 'failed') return;
    }
    /* Download or cache unusable (offline, odd redirect, CORS): let the browser load it. */
    if (await displayPhoto(url, null, token) === 'failed') clearPhoto();
  }

  /* --- Custom image --- */
  async function showImage(opts, token) {
    /* 1. Uploaded wallpaper: a Blob in IndexedDB. */
    if (opts.imageStored) {
      let blob = null;
      try { blob = await getItem(KEY_IMAGE); } catch { blob = null; }
      if (token !== loadToken) return;
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        if (await displayPhoto(objectUrl, objectUrl, token) === 'failed') clearPhoto();
        return;
      }
    }

    /* 2. An http(s) link, or a legacy data: URL that has not been migrated yet. */
    const data = opts.imageData;
    if (!data) { clearPhoto(); return; }
    if (await displayPhoto(data, null, token) === 'failed') {
      console.warn('UniTab: Could not load background image');
      clearPhoto();
    }
  }

  /* Moves a legacy base64 wallpaper out of localStorage into IndexedDB.
     Resolves true when the Blob is stored. Uses add(), not put(): if the user has
     uploaded a newer wallpaper in the meantime the key exists, the write fails and
     the newer upload is left untouched. */
  async function migrateLegacyImage(dataUrl) {
    try {
      const blob = dataUrlToBlob(dataUrl);
      if (!blob || !blob.size) return false;
      await withStore('readwrite', (s) => s.add(blob, KEY_IMAGE));
      return true;
    } catch {
      return false;
    }
  }

  function dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || comma < 0) return null;
    const meta = dataUrl.slice(5, comma);
    const mime = meta.split(';')[0] || 'application/octet-stream';
    const payload = dataUrl.slice(comma + 1);
    let bytes;
    if (/;base64$/i.test(meta)) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    return new Blob([bytes], { type: mime });
  }

  /* ------------------------------------------------------------------
     Video playback
     ------------------------------------------------------------------ */

  /* Idempotent: with no video loaded this is a no-op. (It used to call
     videoEl.load() on every colour-picker / swatch event, resetting the media
     element dozens of times per drag.) */
  function hideVideo() {
    videoWanted = false;
    if (!currentVideoUrl && videoEl.classList.contains('hidden')) return;
    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = null;
    }
    videoEl.onended = null;
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.classList.add('hidden');
  }

  async function showVideo(opts, token) {
    let blob = opts.videoBlob;
    if (!blob) {
      try { blob = await loadVideoBlob(); } catch { blob = null; }
    }
    if (token !== loadToken) return;
    if (!blob) { hideVideo(); return; }

    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(blob);

    videoEl.classList.remove('hidden');
    videoEl.src = currentVideoUrl;
    videoEl.muted = !opts.soundOn;
    videoEl.volume = (opts.volume ?? 50) / 100;
    videoEl.loop = opts.loop !== false;

    videoEl.onended = null;
    if (opts.loop) {
      videoEl.loop = true;
    } else {
      videoEl.loop = false;
      const behavior = opts.onEnded || 'black';
      if (behavior === 'lastframe') {
        /* Pause on last frame — do nothing, video naturally stops */
      } else {
        videoEl.onended = () => {
          hideVideo();
          if (typeof opts.onEndCallback === 'function') opts.onEndCallback();
        };
      }
    }

    videoWanted = true;
    if (!document.hidden) videoEl.play().catch(() => {});
  }

  /* A wallpaper nobody can see should not keep decoding frames (and re-blurring the
     glass panels above it) in a background tab. */
  document.addEventListener('visibilitychange', () => {
    if (!videoWanted || !currentVideoUrl) return;
    if (document.hidden) {
      videoEl.pause();
    } else if (!videoEl.ended) {
      videoEl.play().catch(() => {});
    }
  });

  function setVolume(vol) {
    videoEl.volume = Math.max(0, Math.min(1, vol / 100));
  }

  function setMuted(muted) {
    videoEl.muted = !!muted;
  }

  function setLoop(loop) {
    videoEl.loop = loop;
    if (loop) videoEl.onended = null;
  }

  function setOnEnded(behavior, onEndCallback) {
    videoEl.loop = false;
    videoEl.onended = null;
    if (behavior === 'lastframe') {
      /* Pause on last frame — do nothing, video naturally stops */
    } else {
      videoEl.onended = () => {
        hideVideo();
        if (typeof onEndCallback === 'function') onEndCallback();
      };
    }
  }

  /* --- Solid color --- */
  function setSolidColor(color) {
    imageEl.style.backgroundColor = color || '';
  }

  /* --- Bing wallpaper API --- */
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
              ok: true, url,
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

  function getBingOtdPrefix() { return BING_OTD_PREFIX; }

  /* ------------------------------------------------------------------
     Dominant colour (placeholder shown while the wallpaper decodes)
     ------------------------------------------------------------------ */

  function averageColor(drawable) {
    const size = 32;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(drawable, 0, 0, size, size);
    const data = cx.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
    }
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* Legacy path: load through an <img> (URLs the extension cannot fetch itself). */
  function extractViaImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try { resolve(averageColor(img)); } catch { resolve(''); }
      };
      img.onerror = () => resolve('');
      img.src = src;
    });
  }

  /** extractThemeColor(src)  src: Blob | URL string
   *  Blobs are decoded straight to 32x32 by createImageBitmap, off the main thread,
   *  instead of decoding the whole (often 4K+) picture just to average it. */
  async function extractThemeColor(src) {
    let blob = null;
    if (typeof Blob !== 'undefined' && src instanceof Blob) {
      blob = src;
    } else if (typeof src === 'string') {
      const url = src.startsWith(BING_OTD_PREFIX) ? src.slice(BING_OTD_PREFIX.length) : src;
      /* Share the wallpaper download with the display path instead of fetching twice. */
      if (isBingUrl(url)) blob = await ensureBingBlob(url);
      src = url;
    }

    if (blob && typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(blob, { resizeWidth: 32, resizeHeight: 32, resizeQuality: 'low' });
        try { return averageColor(bmp); } finally { if (bmp.close) bmp.close(); }
      } catch { /* fall back to <img> below */ }
    }

    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      try { return await extractViaImage(objectUrl); } finally { URL.revokeObjectURL(objectUrl); }
    }
    return typeof src === 'string' ? extractViaImage(src) : '';
  }

  return {
    load, clear, fetchBingOfTheDay, getBingOtdPrefix, extractThemeColor,
    saveVideoBlob, loadVideoBlob, hasVideoBlob, clearVideoBlob,
    saveImageBlob, clearImageBlob, migrateLegacyImage, clearBingCache,
    setVolume, setMuted, setLoop, setOnEnded
  };
})();
