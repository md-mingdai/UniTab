/* ============================================
   UniTab - Background Image / Video Management
   ============================================ */

const Background = (() => {
  const imageEl = document.getElementById('background-image'); /* colour placeholder + blur filter */
  const photoEl = document.getElementById('background-photo'); /* the wallpaper itself (fades in) */
  const previewEl = document.getElementById('background-preview'); /* tiny fast preview (under the photo) */
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
  /* Preview slots — one small image per source, stored separately so a switch
     between sources can always find the matching preview. */
  const PREVIEW_KEYS = {
    bing: 'preview_bing',
    image: 'preview_image',
    video: 'preview_video',
  };
  /* Preview target: small enough that img.decode() returns in a few ms — a
     preview's whole job is to appear before the real wallpaper has even
     started decoding, so decode speed always wins over resolution. */
  const PREVIEW_MAX_SIDE = 512;
  const PREVIEW_QUALITY = 0.75;

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
  let previewObjectUrl = null; /* blob: URL currently painted by the preview layer */
  let previewSource = null; /* wallpaper type the preview layer currently shows */
  let currentVideoUrl = null; /* blob: URL currently playing in the <video> */
  let videoWanted = false; /* the video wallpaper is the active source */
  let activeSource = null; /* the source the visible layers currently belong to */

  /* In-memory preview mirror: after the first IndexedDB read a type switch can
     paint (and hand over its colour) without another round-trip. undefined =
     not read yet, null = known empty. previewReadSeq fences an in-flight read
     against a concurrent regenerate/clear that invalidates the slot. */
  const previewCache = { bing: undefined, image: undefined, video: undefined };
  const previewReads = { bing: null, image: null, video: null };
  const previewReadSeq = { bing: 0, image: 0, video: 0 };
  const previewInflight = { bing: null, image: null, video: null };
  let previewColorListener = null; /* opts.onPreviewColor of the active load */

  /** load(opts)
   *  source : 'none' | 'bing' | 'image' | 'color' | 'video'
   *  For 'bing' : opts.imageData = wallpaper URL
   *  For 'image': opts.imageStored (uploaded Blob in IndexedDB) and/or
   *               opts.imageData (http(s) link, or a legacy data: URL)
   *  For 'video': opts.videoBlob (optional), opts.volume, opts.loop, opts.onEnded
   *  onPreviewColor(source, color): called as soon as the preview colour of the
   *               active source is known — before its preview has even decoded. */
  function load(opts) {
    opts = normalizeOpts(opts);
    const token = ++loadToken;
    const source = opts && opts.source ? opts.source : null;

    /* A type switch must never leave the previous type's wallpaper/preview on
       screen — not even for the moment before the new preview has been read or
       decoded. Dropping the old photo also makes the new type's colour and
       preview visible immediately (colour → preview → wallpaper), instead of
       keeping the old wallpaper until the new one has decoded. Reloading the
       same source keeps both, avoiding a needless flash. */
    if (activeSource !== source) {
      clearPreviewLayer();
      clearPhoto();
    }

    activeSource = source;
    previewColorListener = opts && typeof opts.onPreviewColor === 'function'
      ? opts.onPreviewColor : null;

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
    clearPreviewLayer();
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

  /* ------------------------------------------------------------------
     Preview layer
     A tiny per-source WebP (see regeneratePreview) shown once the
     placeholder colour is up and while the full wallpaper is still
     decoding. The real wallpaper fades in above it.
     ------------------------------------------------------------------ */

  function clearPreviewLayer() {
    previewEl.classList.remove('is-ready');
    previewEl.style.backgroundImage = '';
    previewSource = null;
    releasePreviewUrl();
  }

  function releasePreviewUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  /* Drop the in-memory mirror of a slot (regenerate / clear paths). A read that
     is already in flight is fenced off by previewReadSeq and resolves empty. */
  function invalidatePreview(source) {
    previewCache[source] = null;
    previewReadSeq[source]++;
  }

  /* One read per slot, shared by every caller and kept in memory afterwards.
     boot.js starts this read for the active source in <head>; reuse its promise
     so the preview can paint before this script has opened the database. */
  function readPreviewRecord(source) {
    const cached = previewCache[source];
    if (cached !== undefined) return Promise.resolve(cached);
    if (!previewReads[source]) {
      const seq = previewReadSeq[source];
      const warm = window.__UNITAB_PREVIEW_PROMISE__;
      let read;
      if (warm && warm.source === source) {
        window.__UNITAB_PREVIEW_PROMISE__ = null; /* consume once */
        read = warm.promise;
      } else {
        read = getItem(PREVIEW_KEYS[source]);
      }
      previewReads[source] = read
        .then((rec) => {
          if (seq !== previewReadSeq[source]) return null; /* invalidated mid-read */
          previewCache[source] = rec || null;
          return previewCache[source];
        })
        .catch(() => {
          if (seq === previewReadSeq[source]) previewCache[source] = null;
          return null;
        })
        .finally(() => { previewReads[source] = null; });
    }
    return previewReads[source];
  }

  /* Hand the preview colour to the page as soon as it is known — before the
     preview has decoded and before the wallpaper. That is what turns the
     placeholder from the previous type's colour into this one immediately. */
  function notifyPreviewColor(source, color) {
    if (!color || activeSource !== source) return;
    const listener = previewColorListener;
    if (!listener) return;
    try { listener(source, color); } catch { /* cosmetic only */ }
  }

  /* Resolves 'shown' | 'missing' | 'failed' | 'stale'. */
  async function paintPreviewFromStore(source, token) {
    const rec = await readPreviewRecord(source);
    if (token !== loadToken) return 'stale';

    /* A preview of another wallpaper type must never sit under a new wallpaper:
       drop it before the colour placeholder shows through. */
    if (previewSource && previewSource !== source) clearPreviewLayer();

    if (!rec || !rec.blob) return 'missing';

    /* Colour first (synchronously with respect to the read), decode after. */
    notifyPreviewColor(source, rec.color);

    const url = URL.createObjectURL(rec.blob);
    const ok = await decode(url);
    if (token !== loadToken) {
      URL.revokeObjectURL(url);
      return 'stale';
    }
    if (!ok) {
      URL.revokeObjectURL(url);
      return 'failed';
    }
    previewEl.style.backgroundImage = 'url("' + cssUrl(url) + '")';
    previewEl.classList.add('is-ready'); /* opacity fade-in (css) */
    releasePreviewUrl();
    previewObjectUrl = url;
    previewSource = source;
    return 'shown';
  }

  /* Wallpapers saved by older builds (or whose generation failed earlier) have
     no preview slot yet. The first time one is shown, quietly build its preview
     from the same bytes — this also yields its preview colour via
     notifyPreviewColor, and makes the next visit instant. */
  function backfillPreview(source, preview, src) {
    if (!src) return;
    preview.then((status) => {
      if (status !== 'missing') return;
      if (previewInflight[source]) return; /* a pick is already regenerating it */
      if (activeSource !== source) return; /* user moved on meanwhile */
      regeneratePreview(source, src);
    }).catch(() => { /* cosmetic only */ });
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

    /* The stored bing preview first (a few ms), then the wallpaper below it. */
    const preview = paintPreviewFromStore('bing', token);

    const blob = await ensureBingBlob(url);
    if (token !== loadToken) return;
    backfillPreview('bing', preview, blob || url);
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      if (await displayPhoto(objectUrl, objectUrl, token) !== 'failed') return;
    }
    /* Download or cache unusable (offline, odd redirect, CORS): let the browser load it. */
    if (await displayPhoto(url, null, token) === 'failed') clearPhoto();
  }

  /* --- Custom image --- */
  async function showImage(opts, token) {
    /* The stored image preview first (a few ms), then the wallpaper below it. */
    const preview = paintPreviewFromStore('image', token);

    /* 1. Uploaded wallpaper: a Blob in IndexedDB. */
    if (opts.imageStored) {
      let blob = null;
      try { blob = await getItem(KEY_IMAGE); } catch { blob = null; }
      if (token !== loadToken) return;
      if (blob) {
        backfillPreview('image', preview, blob);
        const objectUrl = URL.createObjectURL(blob);
        if (await displayPhoto(objectUrl, objectUrl, token) === 'failed') clearPhoto();
        return;
      }
    }

    /* 2. An http(s) link, or a legacy data: URL that has not been migrated yet. */
    const data = opts.imageData;
    if (!data) { clearPhoto(); return; }
    backfillPreview('image', preview, data);
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
    videoEl.onloadeddata = null;
    videoEl.oncanplay = null;
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.classList.add('hidden');
  }

  async function showVideo(opts, token) {
    /* Any preview left over from another source must go: the preview on screen
       must always belong to the active wallpaper type. */
    clearPreviewLayer();

    /* Paint the video preview before the (possibly huge) video blob is read,
       so the placeholder colour gives way as early as possible. */
    const preview = paintPreviewFromStore('video', token);

    let blob = opts.videoBlob;
    if (!blob) {
      try { blob = await loadVideoBlob(); } catch { blob = null; }
    }
    if (token !== loadToken) return;
    if (!blob) { clearPreviewLayer(); hideVideo(); return; }

    backfillPreview('video', preview, blob);

    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(blob);

    videoRevealToken = token;
    videoEl.onloadeddata = revealVideo;
    videoEl.oncanplay = revealVideo;
    videoEl.classList.add('hidden');
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
          blackOut();
          if (typeof opts.onEndCallback === 'function') opts.onEndCallback();
        };
      }
    }

    videoWanted = true;
    if (!document.hidden) videoEl.play().catch(() => {});
  }

  /* The <video> element only becomes visible once it actually has a frame to
     paint. Until then the gradient-free preview / colour placeholder fills the
     screen, so a slow disk read or codec init never flashes empty video. */
  let videoRevealToken = -1;
  function revealVideo() {
    if (videoRevealToken !== loadToken) return;
    videoEl.classList.remove('hidden');
  }

  /* 「黑屏」 on-ended: hide the player and drop the preview + colour placeholder
     as well, so what is left behind is really black. */
  function blackOut() {
    hideVideo();
    clearPreviewLayer();
    setSolidColor('#000000');
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
        blackOut();
        if (typeof onEndCallback === 'function') onEndCallback();
      };
    }
  }

  /* --- Solid color --- */
  function setSolidColor(color) {
    imageEl.style.backgroundColor = color || '';
  }

  /* ------------------------------------------------------------------
     Preview generation (silent, on every pick)
     Every time a wallpaper of a type is picked the old preview of that type
     is dropped first (no cache pile-up), then a small WebP is generated in
     the background: a downscaled copy for images, the first frame for
     videos. Decode speed is the first requirement, so the target size is
     small and the encode happens off the paint path.
     ------------------------------------------------------------------ */

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas === 'function') {
      try { return new OffscreenCanvas(w, h); } catch { /* fall through */ }
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /* WebP when the engine can encode it; whatever it does produce decodes
     just as fast, so the fallback type is not special-cased further. */
  function encodeCanvas(canvas) {
    if (canvas.convertToBlob) {
      return canvas.convertToBlob({ type: 'image/webp', quality: PREVIEW_QUALITY });
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b); else reject(new Error('canvas.toBlob failed'));
      }, 'image/webp', PREVIEW_QUALITY);
    });
  }

  /* One small canvas: cover-fit, no upscale, and the same canvas feeds both
     the preview colour and the encoded preview. */
  function drawScaled(drawable, w0, h0) {
    const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(w0, h0, 1));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = makeCanvas(w, h);
    canvas.getContext('2d').drawImage(drawable, 0, 0, w, h);
    return canvas;
  }

  async function imagePreview(blob) {
    /* createImageBitmap decodes off the main thread; the bitmap is closed as
       soon as the small canvas is done with it. */
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(blob);
        try {
          const canvas = drawScaled(bmp, bmp.width, bmp.height);
          return { color: averageColor(canvas), blob: await encodeCanvas(canvas) };
        } finally {
          if (bmp.close) bmp.close();
        }
      } catch { /* fall back to <img> below */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('preview decode failed'));
        im.src = url;
      });
      const canvas = drawScaled(img, img.naturalWidth, img.naturalHeight);
      return { color: averageColor(canvas), blob: await encodeCanvas(canvas) };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* First frame only: preload='auto' reads metadata + the first GOP, not the
     whole file. Two rAFs make sure a frame is actually presentable. */
  function videoPreview(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      if ('playsInline' in v) v.playsInline = true;
      let settled = false;
      let timer = 0;

      const finish = async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let result = null;
        try {
          if (v.videoWidth && v.videoHeight) {
            const canvas = drawScaled(v, v.videoWidth, v.videoHeight);
            result = { color: averageColor(canvas), blob: await encodeCanvas(canvas) };
          }
        } catch { result = null; }
        URL.revokeObjectURL(url);
        resolve(result);
      };

      const grab = () => requestAnimationFrame(() => requestAnimationFrame(finish));
      v.onloadeddata = grab;
      v.oncanplay = grab;
      v.onerror = () => finish();
      timer = setTimeout(() => finish(), 8000); /* safety net, codec stalls */
      v.src = url;
      v.load();
    });
  }

  /* regeneratePreview(source, src)
     src: Blob | File | http(s) URL | legacy data: URL of the wallpaper that was
     just picked. Order matters: the stored preview of this type is removed
     straight away (synchronously queued), so a new tab opened meanwhile paints
     the placeholder colour only, never the previous wallpaper's preview.
     Resolves { blob, color } once the fresh preview is stored, or null when
     the source could not be turned into a preview (offline, CORS). */
  const previewJobSeq = { bing: 0, image: 0, video: 0 };

  function regeneratePreview(source, src) {
    const key = PREVIEW_KEYS[source];
    if (!key) return Promise.resolve(null);

    /* Two quick picks of the same type: the slower, older job must not win the
       slot — the newest call is the only one allowed to write (and repaint). */
    const seq = ++previewJobSeq[source];

    /* 每次选择壁纸先清空 preview，避免缓存堆积。 */
    invalidatePreview(source);
    deleteItem(key).catch(() => {});

    const job = (async () => {
      try {
        let blob = null;
        if (src instanceof Blob) {
          blob = src;
        } else if (typeof src === 'string') {
          let url = src;
          if (url.startsWith(BING_OTD_PREFIX)) url = url.slice(BING_OTD_PREFIX.length);
          if (url.startsWith('data:')) {
            blob = dataUrlToBlob(url);
          } else if (isBingUrl(url)) {
            blob = await ensureBingBlob(url); /* shares the wallpaper download + cache */
          } else {
            blob = await fetchImageBlob(url); /* needs CORS unless a host permission covers it */
          }
        }
        if (!blob || !blob.size) return null;

        const result = source === 'video' ? await videoPreview(blob) : await imagePreview(blob);
        if (!result || !result.blob || !result.blob.size) return null;
        /* Superseded (newer pick / cleared slot / reset): nothing is stored and
           there is no colour worth adopting any more. */
        if (seq !== previewJobSeq[source]) return null;

        /* Colour is ready before the encode/store: send it over now so the
           placeholder switches as early as physically possible. */
        notifyPreviewColor(source, result.color);

        const record = { blob: result.blob, color: result.color, time: Date.now() };
        putItem(key, record)
          .then(() => {
            /* A newer pick (or a reset) replaced this job: its delete happened
               after our put, so neither the slot mirror nor the layer may be
               updated from this stale result. */
            if (seq !== previewJobSeq[source]) return;
            previewCache[source] = record;
            /* If this source is what is on screen right now, slide the fresh
               preview under the wallpaper that is already loading above it. */
            if (activeSource === source) paintPreviewFromStore(source, loadToken);
          })
          .catch(() => {});
        return { blob: result.blob, color: result.color };
      } catch {
        return null;
      }
    })();

    previewInflight[source] = job;
    job.finally(() => {
      if (previewInflight[source] === job) previewInflight[source] = null;
    });
    return job;
  }

  const clearPreview = (source) => {
    const key = PREVIEW_KEYS[source];
    if (!key) return;
    /* Fence both an in-flight read and an in-flight regeneration of this slot:
       otherwise a late putItem could resurrect a preview that was just reset. */
    previewJobSeq[source]++;
    invalidatePreview(source);
    deleteItem(key).catch(() => {});
  };

  /* Reset paths: drop every preview slot at once. */
  function clearAllPreviews() {
    Object.keys(PREVIEW_KEYS).forEach((source) => clearPreview(source));
  }

  /* The preview colour of a type, used as the placeholder the instant a
     source is switched to (before any preview has decoded). */
  async function readPreviewColor(source) {
    const key = PREVIEW_KEYS[source];
    if (!key) return null;
    const rec = await readPreviewRecord(source);
    return rec && rec.color ? rec.color : null;
  }

  /* Warm all three slots right away: by the time the settings panel is opened
     and a type is switched to, its preview blob and colour are already in
     memory (no IndexedDB wait on the switch itself). */
  Object.keys(PREVIEW_KEYS).forEach((source) => {
    readPreviewRecord(source).catch(() => {});
  });

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
    regeneratePreview, readPreviewColor, clearPreview, clearAllPreviews,
    setVolume, setMuted, setLoop, setOnEnded
  };
})();
