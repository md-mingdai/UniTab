/* ============================================
   UniTab - Background Image / Video Management
   ============================================ */

const Background = (() => {
  const imageEl = document.getElementById('background-image');
  const videoEl = document.getElementById('background-video');

  /* Marker prefix that flags a URL as a Bing Daily Wallpaper source. */
  const BING_OTD_PREFIX = 'bing-otd:';
  const BING_OTD_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
  const BING_OTD_BASE = 'https://cn.bing.com';

  /* IndexedDB helpers for video blob storage */
  const DB_NAME = 'unitab_bg';
  const DB_STORE = 'media';
  const DB_KEY = 'video_blob';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveVideoBlob(blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(blob, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadVideoBlob() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearVideoBlob() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch { /* ignore */ }
  }

  /* Current video ObjectURL to revoke on change */
  let currentVideoUrl = null;

  /** load(opts)
   *  source : 'none' | 'bing' | 'image' | 'color' | 'video'
   *  For 'video': opts.videoBlob or opts.videoUrl, opts.volume, opts.loop, opts.onEnded */
  function load(opts) {
    console.log('[BG] load called with:', typeof opts === 'string' ? opts.substring(0, 60) : JSON.stringify(opts).substring(0, 120));
    if (typeof opts === 'string') {
      if (!opts) { clear(); return; }
      if (opts.startsWith(BING_OTD_PREFIX)) {
        hideVideo(); applyImage(opts.slice(BING_OTD_PREFIX.length));
      } else if (opts.startsWith('data:')) {
        hideVideo(); applyImage(opts);
      } else {
        hideVideo(); fetchAndApply(opts);
      }
      return;
    }

    if (!opts || opts.source === 'none') {
      clear(); setSolidColor(''); return;
    }

    if (opts.source === 'color') {
      clear(); setSolidColor(opts.color || ''); return;
    }

    if (opts.source === 'video') {
      setSolidColor('');
      imageEl.style.backgroundImage = '';
      applyVideo(opts);
      return;
    }

    /* source === 'bing' or source === 'image' */
    hideVideo();
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
    console.log('[BG] applyImage called, src length:', src ? src.length : 0);
    imageEl.style.backgroundImage = `url(${src})`;
    console.log('[BG] backgroundImage set, computed:', getComputedStyle(imageEl).backgroundImage.substring(0, 80));
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
    imageEl.style.backgroundColor = '';
    hideVideo();
  }

  function hideVideo() {
    console.log('[BG] hideVideo called');
    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = null;
    }
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.classList.add('hidden');
  }

  /* --- Video playback --- */
  async function applyVideo(opts) {
    let blob = opts.videoBlob;
    if (!blob) {
      try { blob = await loadVideoBlob(); } catch { blob = null; }
    }
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

    videoEl.play().catch(() => {});
  }

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
    console.log('[BG] setSolidColor:', color || '(empty)');
    if (color) {
      imageEl.style.backgroundColor = color;
    } else {
      imageEl.style.backgroundColor = '';
    }
  }

  /* --- Bing wallpaper --- */
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

  /* Extract dominant color from an image */
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
            r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
          }
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          resolve('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''));
        } catch { resolve(''); }
      };
      img.onerror = () => resolve('');
      img.src = src;
    });
  }

  return {
    load, clear, fetchBingOfTheDay, getBingOtdPrefix, extractThemeColor,
    saveVideoBlob, loadVideoBlob, clearVideoBlob,
    setVolume, setMuted, setLoop, setOnEnded
  };
})();
