/* Unified custom color picker.
   Replaces the native <input type="color"> dialog used by the wallpaper and
   mask custom swatches. One floating popover is shared by both triggers; it
   live-applies the color through the caller's onApply callback. */
(function () {
  'use strict';

  let root = null;
  let sv = null, svCursor = null, hue = null, hueCursor = null;
  let hexInput = null, preview = null;
  let anchor = null;      /* trigger the popover is anchored to */
  let onApply = null;
  let current = { h: 0, s: 0, v: 0 };
  let dragging = null;    /* 'sv' | 'hue' */
  let closeTimer = null;

  const reduceMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  /* --- color math --- */
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    const p = (x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0');
    return '#' + p(r) + p(g) + p(b);
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function hexToHsv(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToHsv(rgb[0], rgb[1], rgb[2]) : null;
  }

  function hsvToHex(h, s, v) {
    const [r, g, b] = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
  }

  /* --- rendering --- */
  function render() {
    const { h, s, v } = current;
    sv.style.background = 'linear-gradient(to top, #000, rgba(0,0,0,0)), ' +
      'linear-gradient(to right, #fff, hsl(' + h + ', 100%, 50%))';
    svCursor.style.left = (s * 100) + '%';
    svCursor.style.top = ((1 - v) * 100) + '%';
    hueCursor.style.left = (h / 360 * 100) + '%';
    hexInput.value = hsvToHex(h, s, v).toUpperCase();
    preview.style.background = hexInput.value;
  }

  function emit() {
    if (onApply) onApply(hsvToHex(current.h, current.s, current.v));
  }

  function updateDrag(e) {
    if (dragging === 'sv') {
      const r = sv.getBoundingClientRect();
      current.s = clamp((e.clientX - r.left) / r.width, 0, 1);
      current.v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
      render();
      emit();
    } else if (dragging === 'hue') {
      const r = hue.getBoundingClientRect();
      current.h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360;
      render();
      emit();
    }
  }

  function startDrag(e, kind) {
    e.preventDefault();
    dragging = kind;
    const el = kind === 'sv' ? sv : hue;
    if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch {} }
    updateDrag(e);
  }

  /* --- positioning --- */
  function position() {
    if (!anchor || !root || root.hidden) return;
    const ar = anchor.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = clamp(ar.right - r.width, 8, vw - r.width - 8);
    let top = ar.bottom + 6;
    const up = top + r.height > vh - 8;
    if (up) top = ar.top - r.height - 6;
    root.style.left = left + 'px';
    root.style.top = top + 'px';
    root.classList.toggle('drop-up', up);
  }

  /* --- open / close --- */
  function open(anchorEl, opts) {
    if (!anchorEl) return;
    if (!root) build();
    if (!root.hidden && anchor === anchorEl) { close(); return; }  /* toggle */
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

    anchor = anchorEl;
    onApply = (opts && opts.onApply) || null;
    current = hexToHsv(opts && opts.color) || { h: 0, s: 0, v: 0 };
    render();

    root.classList.remove('dropdown-closing');
    root.hidden = false;
    void root.offsetWidth;   /* restart open animation */
    position();
    document.addEventListener('scroll', position, true);
  }

  function close() {
    if (!root || root.hidden) return;
    document.removeEventListener('scroll', position, true);
    if (reduceMotionQuery && reduceMotionQuery.matches) {
      root.hidden = true;
      root.classList.remove('dropdown-closing');
      anchor = null; onApply = null;
      return;
    }
    root.classList.add('dropdown-closing');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      root.hidden = true;
      root.classList.remove('dropdown-closing');
      closeTimer = null;
    }, 180);
    anchor = null; onApply = null;
  }

  function onDocClick(e) {
    if (!root || root.hidden) return;
    if (anchor && anchor.contains(e.target)) return;  /* anchor toggles itself */
    if (root.contains(e.target)) return;
    close();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  /* --- DOM --- */
  function build() {
    root = document.createElement('div');
    root.className = 'color-picker';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '自定义颜色');
    root.hidden = true;
    root.innerHTML =
      '<div class="cp-sv" id="cp-sv"><div class="cp-sv-cursor" id="cp-sv-cursor"></div></div>' +
      '<div class="cp-hue" id="cp-hue"><div class="cp-hue-cursor" id="cp-hue-cursor"></div></div>' +
      '<div class="cp-footer">' +
        '<input class="cp-hex" id="cp-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off">' +
        '<div class="cp-preview" id="cp-preview"></div>' +
      '</div>';
    document.body.appendChild(root);

    sv = root.querySelector('#cp-sv');
    svCursor = root.querySelector('#cp-sv-cursor');
    hue = root.querySelector('#cp-hue');
    hueCursor = root.querySelector('#cp-hue-cursor');
    hexInput = root.querySelector('#cp-hex');
    preview = root.querySelector('#cp-preview');

    sv.addEventListener('pointerdown', (e) => startDrag(e, 'sv'));
    hue.addEventListener('pointerdown', (e) => startDrag(e, 'hue'));

    hexInput.addEventListener('input', () => {
      const hsv = hexToHsv(hexInput.value);
      if (hsv) { current = hsv; render(); emit(); }
    });
    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); hexInput.blur(); }
    });

    document.addEventListener('pointermove', (e) => { if (dragging) updateDrag(e); });
    document.addEventListener('pointerup', () => { dragging = null; });
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
  }

  window.ColorPicker = { open, close };
})();
