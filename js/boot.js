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
       the colour source, otherwise the image's average colour. */
    var placeholder = saved.bgSource === 'color' ? saved.bgColor : saved.bgThemeColor;
    if (typeof placeholder === 'string' && placeholder) {
      style.setProperty('--bg-theme-color', placeholder);
    }
  } catch (e) {
    /* purely cosmetic: ignore */
  }
})();
