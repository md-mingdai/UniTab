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

    if (saved.glassStyle === 'liquid' || saved.glassStyle === 'frosted') {
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
     DB_NAME / DB_STORE / PREVIEW_KEYS in background.js. */
  try {
    var source = saved.bgSource;
    var previewKey = source === 'bing' ? 'preview_bing'
      : source === 'image' ? 'preview_image'
      : source === 'video' ? 'preview_video'
      : null;
    if (previewKey && window.indexedDB) {
      var warm = new Promise(function (resolve) {
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
      window.__UNITAB_PREVIEW_PROMISE__ = { source: source, promise: warm };
    }
  } catch (e2) {
    /* no IndexedDB (private mode / disabled): the preview is simply skipped */
  }
})();
