/* ============================================
   UniTab - Boot (runs in <head>, before the first paint)

   Applies the saved *look* to <html> so the very first frame already has the right
   glass style / radius / blur / mask / placeholder colour, instead of painting the
   defaults and jumping to the saved values once the other scripts have run.

   It also hands the parsed settings to Settings.loadSettings(), so localStorage is
   read and JSON-parsed once per new tab, not twice.

   Keep this file tiny and dependency-free: it blocks rendering.
   ============================================ */

(function () {
  'use strict';

  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('unitab_settings'));
  } catch (e) {
    /* corrupt or unavailable storage: Settings falls back to its defaults */
  }
  if (!saved || typeof saved !== 'object') saved = null;

  /* Read-once hand-off to Settings.loadSettings() (it deletes the property). */
  window.__UNITAB_SAVED__ = saved;
  if (!saved) return;

  try {
    var root = document.documentElement;
    var style = root.style;

    if (saved.glassStyle === 'liquid' || saved.glassStyle === 'frosted' || saved.glassStyle === 'matte') {
      root.dataset.glass = saved.glassStyle;
    }
    if (typeof saved.glassRadius === 'number') {
      style.setProperty('--glass-radius', saved.glassRadius + 'px');
    }
    if (typeof saved.bgBlur === 'number') {
      style.setProperty('--bg-filter', saved.bgBlur > 0 ? 'blur(' + saved.bgBlur + 'px)' : 'none');
    }
    if (typeof saved.overlayOpacity === 'number') {
      style.setProperty('--overlay-opacity', String(saved.overlayOpacity));
    }
    if (typeof saved.overlayColor === 'string' && saved.overlayColor) {
      style.setProperty('--overlay-color', saved.overlayColor);
    }

    /* Placeholder behind the wallpaper until it has decoded: the solid colour for
       the colour source, otherwise the active *type's* own preview colour. Using
       the per-type field matters when switching bing (yellow) → image/video
       (green): the first frame already shows the new type's colour instead of
       the previous type's. Falls back to the legacy single value on upgrade. */
    var placeholder = '';
    if (saved.bgSource === 'color') {
      placeholder = saved.bgColor;
    } else if (saved.bgSource === 'image') {
      placeholder = saved.bgThemeColorImage || saved.bgThemeColor;
    } else if (saved.bgSource === 'video') {
      placeholder = saved.bgThemeColorVideo || saved.bgThemeColor;
    } else {
      placeholder = saved.bgThemeColorBing || saved.bgThemeColor;
    }
    if (typeof placeholder === 'string' && placeholder) {
      style.setProperty('--bg-theme-color', placeholder);
      /* How bright the scene behind the glass is decides how dense the matte tint
         must be (see [data-wallpaper-tone] in style.css). Kept in sync with
         wallpaperTone() in settings.js. (The liquid style measures the wallpaper
         itself, see js/liquid-glass.js.) */
      var m = /^#([0-9a-f]{6})$/i.exec(placeholder.trim());
      if (m) {
        var n = parseInt(m[1], 16);
        var lin = function (v) {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        var lum = 0.2126 * lin((n >> 16) & 255)
          + 0.7152 * lin((n >> 8) & 255)
          + 0.0722 * lin(n & 255);
        root.dataset.wallpaperTone = lum > 0.16 ? 'light' : 'dark';
      }
    }

    /* Bottom dock auto-hide: park it below the viewport from the very first
       frame so it never flashes in before sliding down. Requires the dock
       itself to be enabled; settings.js keeps the attribute in sync later. */
    if (saved.showBookmarks !== false && saved.autoHideBookmarks === true) {
      root.dataset.dockAutohide = 'true';
    }

    /* Liquid glass: replay what js/liquid-glass.js measured for this wallpaper last
       time (light or dark glass, tint strength per pane), so the first frame is
       already right. The key must equal cacheKey() in that file. */
    if (saved.glassStyle === 'liquid') {
      try {
        var lg = JSON.parse(localStorage.getItem('unitab_lg'));
        var val = function (n) { return style.getPropertyValue(n).trim(); };
        var theme = val('--bg-theme-color');
        var key = [theme === 'transparent' ? '' : theme, val('--overlay-opacity'), val('--overlay-color'),
          val('--bg-filter'),
          window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'd' : 'l',
          Math.round(window.innerWidth / 320), Math.round(window.innerHeight / 320)].join('|');
        if (lg && lg.k === key && typeof lg.css === 'string') {
          var tokens = document.createElement('style');
          tokens.id = 'lg-tokens';
          tokens.textContent = lg.css;
          document.head.appendChild(tokens);
          for (var group in lg.tones) root.setAttribute('data-lg-' + group, lg.tones[group]);
        }
      } catch (e3) {
        /* no cache: the stylesheet's dark defaults apply until the engine has measured */
      }
    }
  } catch (e) {
    /* purely cosmetic: ignore */
  }

  /* Start reading the active type's stored preview right now (still in <head>),
     so it can paint before background.js has even loaded. Background.load()
     consumes __UNITAB_PREVIEW_PROMISE__ exactly once. The database name, store
     name and key format are duplicated here on purpose — keep them in sync with
     DB_NAME / DB_STORE / PREVIEW_KEYS in background.js.

     Slideshow ("every new tab" interval=0) is special: the index is advanced HERE
     (before first paint), and the current slide's own preview is used directly —
     giving each slide its own placeholder colour and preview image.
     Scheduled wallpapers pick the slot covering the current clock time the same
     way, so the first frame already shows the right slot's preview and colour. */
  try {
    var source = saved.bgSource;
    var isScheduled = source === 'image' && saved.bgImageMode === 'schedule';
    var isSlide = source === 'image' && !isScheduled && saved.bgSlideMode;
    var previewKey = source === 'bing' ? 'preview_bing'
      : source === 'image' ? 'preview_image'
      : source === 'video' ? 'preview_video'
      : null;
    if (previewKey && window.indexedDB) {
      var warm;
      if (isScheduled) {
        /* Scheduled wallpapers: read the slot table, pick the entry covering
           "now" (wrapping to the previous evening's last slot), use its pv. */
        warm = new Promise(function (resolve) {
          var req = indexedDB.open('unitab_bg', 1);
          req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains('media')) {
              req.result.createObjectStore('media');
            }
          };
          req.onerror = function () { resolve(null); };
          req.onsuccess = function () {
            var db = req.result;
            try {
              var tx = db.transaction('media', 'readonly');
              var get = tx.objectStore('media').get('image_scheduled');
              get.onsuccess = function () {
                var rec = get.result;
                if (!rec || !Array.isArray(rec.items) || !rec.items.length) { resolve(null); return; }
                var now = new Date();
                var nowMin = now.getHours() * 60 + now.getMinutes();
                var pick = -1;
                for (var i = 0; i < rec.items.length; i++) {
                  if (rec.items[i].start <= nowMin) pick = i;
                  else break;
                }
                if (pick === -1) pick = rec.items.length - 1;
                var entry = rec.items[pick];
                resolve(entry && entry.pv && entry.pv.blob
                  ? { blob: entry.pv.blob, color: entry.pv.color, time: Date.now() }
                  : null);
              };
              get.onerror = function () { resolve(null); };
              tx.oncomplete = function () { db.close(); };
              tx.onerror = tx.onabort = function () { db.close(); };
            } catch (err) {
              db.close();
              resolve(null);
            }
          };
        });
      } else if (isSlide) {
        /* Slideshow: read the slide list, advance for interval=0, then use the
           current slide's own preview (pv) directly as the warm record. */
        warm = new Promise(function (resolve) {
          var req = indexedDB.open('unitab_bg', 1);
          req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains('media')) {
              req.result.createObjectStore('media');
            }
          };
          req.onerror = function () { resolve(null); };
          req.onsuccess = function () {
            var db = req.result;
            var done = function (rec) { try { db.close(); } catch (_) {} resolve(rec || null); };
            var settled = false;
            var finish = function (rec) { if (!settled) { settled = true; done(rec); } };
            try {
              var tx = db.transaction('media', 'readwrite');
              var store = tx.objectStore('media');
              var slidesReq = store.get('image_slides');
              var pvRecord = null; /* captured current slide's pv, resolved on commit */
              slidesReq.onsuccess = function () {
                var rec2 = slidesReq.result;
                if (!rec2 || !Array.isArray(rec2.items) || rec2.items.length === 0) { finish(null); return; }
                var idx = rec2.index || 0;
                var interval = typeof saved.bgSlideInterval === 'number' ? saved.bgSlideInterval : 0;
                var random = !!saved.bgSlideRandom;
                if (interval === 0 && rec2.items.length > 1) {
                  if (random) {
                    var next;
                    do { next = Math.floor(Math.random() * rec2.items.length); } while (next === idx);
                    idx = next;
                  } else {
                    idx = (idx + 1) % rec2.items.length;
                  }
                  rec2.index = idx;
                  store.put(rec2, 'image_slides');
                }
                var slide = rec2.items[idx];
                if (slide && slide.pv && slide.pv.blob) {
                  pvRecord = { blob: slide.pv.blob, color: slide.pv.color, time: Date.now() };
                }
              };
              slidesReq.onerror = function () { finish(null); };
              /* Resolve on tx.oncomplete: the advanced index write is committed
                 before background.js reads KEY_SLIDES, and pvRecord is already
                 captured from the get above. */
              tx.oncomplete = function () { finish(pvRecord); };
              tx.onerror = tx.onabort = function () { finish(null); };
            } catch (err) { try { db.close(); } catch (_) {} resolve(null); }
          };
        });
      } else {
        warm = new Promise(function (resolve) {
          var req = indexedDB.open('unitab_bg', 1);
          req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains('media')) {
              req.result.createObjectStore('media');
            }
          };
          req.onerror = function () { resolve(null); };
          req.onsuccess = function () {
            var db = req.result;
            try {
              var tx = db.transaction('media', 'readonly');
              var get = tx.objectStore('media').get(previewKey);
              get.onsuccess = function () { resolve(get.result || null); };
              get.onerror = function () { resolve(null); };
              tx.oncomplete = function () { db.close(); };
              tx.onerror = tx.onabort = function () { db.close(); };
            } catch (err) {
              db.close();
              resolve(null);
            }
          };
        });
      }
      window.__UNITAB_PREVIEW_PROMISE__ = { source: source, promise: warm };
    }
  } catch (e2) {
    /* no IndexedDB (private mode / disabled): the preview is simply skipped */
  }
})();
