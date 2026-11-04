/* ============================================
   UniTab - Custom Right-Click Menu (GNOME style)
   ============================================ */

/* A lightweight custom context menu for the main page. It is GNOME Shell-flavoured:
   an icon + label list in a floating, glassy rounded card that opens at the cursor
   and snaps back inside the viewport.

   Menu items depend on the active wallpaper type — a Bing wallpaper offers
   "refresh today's wallpaper" / "open source page", a custom image offers "open
   original image", a video offers "pause / play", and every type can be downloaded
   and opened in the settings panel. Each group fades in and out with the menu.

   The whole feature is switchable from the settings panel (display tab); when off,
   the native browser menu is left alone. */

const ContextMenu = (() => {
  'use strict';

  const Z_INDEX = 2147483647;   /* above the settings panel and its colour pickers */
  const FADE_MS = 160;          /* keep in sync with the CSS transition */

  let root = null;              /* .context-menu (positioned, glassy card) */
  let list = null;              /* <ul> inside the card */
  let built = false;
  let open = false;
  let hideTimer = 0;
  let items = [];               /* items of the currently open menu */
  let focusIndex = -1;
  let currentSource = null;

  /* --- icon paths (feather-style 24x24 strokes, drawn inline) --- */
  const ICONS = {
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    play: '<polygon points="6 4 20 12 6 20"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
  };

  /* --- small helpers ----------------------------------------------------- */

  function isEnabled() {
    try {
      const s = (typeof Settings !== 'undefined' && Settings.getState) ? Settings.getState() : null;
      /* Default on: an older save without the key keeps the menu. */
      return !(s && s.showContextMenu === false);
    } catch {
      return true;
    }
  }

  function wallpaperSource() {
    try {
      const s = (typeof Settings !== 'undefined' && Settings.getState) ? Settings.getState() : null;
      return s && s.bgSource ? s.bgSource : 'bing';
    } catch {
      return 'bing';
    }
  }

  function iconSvg(name) {
    return '<svg class="context-menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  /* --- menu construction ------------------------------------------------- */

  function buildRoot() {
    if (built) return;
    root = document.createElement('div');
    root.className = 'context-menu';
    root.id = 'context-menu';
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-hidden', 'true');
    list = document.createElement('ul');
    list.className = 'context-menu-list';
    list.setAttribute('role', 'menu');
    root.appendChild(list);
    document.body.appendChild(root);

    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.context-menu-item');
      if (!btn) return;
      const item = items[Number(btn.dataset.index)] || null;
      closeMenu();
      if (item && item.action) item.action();
    });
    built = true;
  }

  function renderItems() {
    list.innerHTML = '';
    items.forEach((item, index) => {
      if (item.type === 'separator') {
        const li = document.createElement('li');
        li.className = 'context-menu-separator';
        li.setAttribute('role', 'separator');
        list.appendChild(li);
        return;
      }
      const li = document.createElement('li');
      li.setAttribute('role', 'none');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'context-menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.dataset.index = String(index);
      btn.innerHTML = iconSvg(item.icon || 'settings') +
        '<span class="context-menu-label"></span>';
      const label = btn.querySelector('.context-menu-label');
      /* Translations resolve now; a missing key falls back to its own text. */
      label.textContent = item.labelKey ? I18n.t(item.labelKey) : (item.label || '');
      list.appendChild(li);
      li.appendChild(btn);
    });
    focusIndex = -1;
  }

  /* Items shown for the active wallpaper type. Download + settings are always
     offered; the middle group is source-specific. */
  function buildItems(source) {
    const s = (typeof Settings !== 'undefined' && Settings.getState) ? Settings.getState() : {};
    const items = [];

    if (source === 'bing') {
      items.push({
        icon: 'refresh',
        labelKey: 'contextmenu.bing.refresh',
        action: () => refreshBing()
      });
      /* 打开来源页面 = API 返回的版权词条链接（copyrightlink）；老数据可能
         还没有这个词条，回退到图片 URL。 */
      if (s.bgBingUrl || s.bgBingCopyrightLink) {
        const link = s.bgBingCopyrightLink || s.bgBingUrl;
        items.push({
          icon: 'external',
          labelKey: 'contextmenu.bing.source',
          action: () => window.open(link, '_blank', 'noopener,noreferrer')
        });
      }
      items.push({ type: 'separator' });
    } else if (source === 'video') {
      items.push({
        icon: s.bgVideoPaused ? 'play' : 'pause',
        labelKey: s.bgVideoPaused ? 'contextmenu.video.play' : 'contextmenu.video.pause',
        action: () => toggleVideoPlayback()
      });
      items.push({ type: 'separator' });
    } else if (source === 'image') {
      if (s.bgImageUrl) {
        items.push({
          icon: 'external',
          labelKey: 'contextmenu.image.open',
          action: () => window.open(s.bgImageUrl, '_blank', 'noopener,noreferrer')
        });
        items.push({ type: 'separator' });
      }
    } else if (source === 'color') {
      /* Solid colour: nothing to download or open, only the settings entry. */
    }

    items.push({
      icon: 'download',
      labelKey: source === 'color' ? 'contextmenu.color.copy' : 'contextmenu.download',
      action: () => source === 'color' ? copySolidColor() : downloadWallpaper()
    });
    items.push({
      icon: 'settings',
      labelKey: 'contextmenu.settings',
      action: () => openSettings()
    });
    return items;
  }

  /* --- item actions ------------------------------------------------------ */

  function refreshBing() {
    /* Reuse the settings panel's single refresh path: it fetches, records the
       date, regenerates the preview, re-applies the wallpaper, and shows the
       "refreshing" / "refreshed" notices. Works whether the panel is open or
       closed; when the panel is closed the button still exists but the handler
       needs no visible panel. */
    if (typeof Settings !== 'undefined' && Settings.refreshBingWallpaper) {
      Settings.refreshBingWallpaper();
      return;
    }
    /* Fallback (Settings not loaded): plain re-fetch. */
    if (typeof Background === 'undefined' || !Background.fetchBingOfTheDay) return;
    Background.fetchBingOfTheDay().then((res) => {
      if (!res || !res.ok || !res.url) return;
      const s = (typeof Settings !== 'undefined' && Settings.getState) ? Settings.getState() : null;
      if (s) {
        s.bgBingUrl = res.url;
        s.bgBingCopyright = res.copyright || '';
        s.bgBingCopyrightLink = res.copyrightlink || '';
        s.bingLastRefreshDate = new Date().toISOString().slice(0, 10);
        Settings.flush();
      }
    }).catch(() => {});
  }

  function toggleVideoPlayback() {
    const video = document.getElementById('background-video');
    if (!video) return;
    try {
      if (video.paused) {
        video.play();
        if (typeof Settings !== 'undefined' && Settings.getState) Settings.getState().bgVideoPaused = false;
      } else {
        video.pause();
        if (typeof Settings !== 'undefined' && Settings.getState) Settings.getState().bgVideoPaused = true;
      }
    } catch { /* playback promise can reject; ignore */ }
  }

  async function downloadWallpaper() {
    const source = wallpaperSource();
    try {
      let blob = null;
      const s = (typeof Settings !== 'undefined' && Settings.getState) ? Settings.getState() : {};
      if (typeof Background !== 'undefined' && Background.getWallpaperBlob) {
        blob = await Background.getWallpaperBlob(source, { url: s.bgBingUrl || s.bgImageUrl || '' });
      }
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = wallpaperFileName(source, s);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { /* download failures are silent — same as the native menu */ }
  }

  function wallpaperFileName(source, s) {
    const ext = source === 'video' ? 'webm' : (source === 'bing' ? 'jpg' : 'jpg');
    if (source === 'bing') return 'unitab-bing-' + new Date().toISOString().slice(0, 10) + '.' + ext;
    if (source === 'image') return s.bgImageFileName || 'unitab-wallpaper.' + ext;
    return 'unitab-wallpaper.' + ext;
  }

  function copySolidColor() {
    const s = (typeof Settings !== 'undefined' && Settings.getState) ? Settings.getState() : {};
    const hex = s.bgColor || '#000000';
    const done = () => showToast(I18n.t('contextmenu.color.copied'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(hex).then(done).catch(() => fallbackCopy(hex, done));
    } else {
      fallbackCopy(hex, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { /* ignore */ }
    ta.remove();
  }

  function openSettings() {
    const toggle = document.getElementById('settings-toggle');
    if (toggle) toggle.click();
  }

  /* --- toast (feedback for clipboard actions) ---------------------------- */

  let toastEl = null;
  let toastTimer = 0;

  function showToast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'context-menu-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.dataset.open = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.dataset.open = 'false'; }, 1800);
  }

  /* --- open / close / positioning ---------------------------------------- */

  function openMenu(clientX, clientY) {
    buildRoot();
    currentSource = wallpaperSource();
    items = buildItems(currentSource);
    renderItems();
    if (!items.length) return;

    root.dataset.open = 'true';
    root.setAttribute('aria-hidden', 'false');
    open = true;

    /* Measure the card while it is visible, then keep it inside the viewport. */
    const rect = root.getBoundingClientRect();
    const margin = 8;
    let left = clientX;
    let top = clientY;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, clientX - rect.width);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, clientY - rect.height);
    }
    root.style.left = left + 'px';
    root.style.top = top + 'px';
    root.style.transformOrigin = (clientX > left) ? 'right top' : 'left top';
  }

  function closeMenu() {
    if (!built || !open) return;
    open = false;
    root.dataset.open = 'false';
    root.setAttribute('aria-hidden', 'true');
    clearTimeout(hideTimer);
    /* Drop pointer events right away so clicks pass through during the fade. */
    root.style.pointerEvents = 'none';
    hideTimer = setTimeout(() => {
      root.style.pointerEvents = '';
      /* Leave the node in place: a re-open reuses it and saves a rebuild. */
    }, FADE_MS);
  }

  function isOpen() { return open; }

  /* --- keyboard navigation ----------------------------------------------- */

  function focusItem(index) {
    const btns = list.querySelectorAll('.context-menu-item');
    if (!btns.length) return;
    focusIndex = (index + btns.length) % btns.length;
    btns.forEach((b, i) => b.classList.toggle('focused', i === focusIndex));
    btns[focusIndex].focus({ preventScroll: true });
  }

  function handleMenuKeydown(e) {
    if (!open) return false;
    const btns = Array.from(list.querySelectorAll('.context-menu-item'));
    if (e.key === 'Escape') {
      closeMenu();
      e.preventDefault();
      return true;
    }
    if (e.key === 'ArrowDown') {
      focusItem(focusIndex < 0 ? 0 : focusIndex + 1);
      e.preventDefault();
      return true;
    }
    if (e.key === 'ArrowUp') {
      focusItem(focusIndex < 0 ? btns.length - 1 : focusIndex - 1);
      e.preventDefault();
      return true;
    }
    if (e.key === 'Home') { focusItem(0); e.preventDefault(); return true; }
    if (e.key === 'End') { focusItem(btns.length - 1); e.preventDefault(); return true; }
    return false;
  }

  /* --- event wiring ------------------------------------------------------ */

  /* The settings panel is the one place the native menu must keep working
     (copy / paste / spell-check inside its inputs, selects and dialogs). */
  function settingsPanelOpen() {
    const panel = document.getElementById('settings-panel');
    return !!(panel && panel.classList.contains('open'));
  }

  function bind() {
    /* The custom menu covers the whole main page whenever the settings panel is
       closed — wallpaper, clock, search, bookmarks. Right-clicking the open
       settings panel (or an open colour picker / dropdown inside it) keeps the
       native menu instead. */
    document.addEventListener('contextmenu', (e) => {
      if (!isEnabled()) return;
      if (settingsPanelOpen()) return;
      /* Right-clicking the menu itself keeps it open and stays on it. */
      if (root && root.contains(e.target)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      closeMenu();
      openMenu(e.clientX, e.clientY);
    });

    document.addEventListener('click', (e) => {
      if (!open) return;
      if (root && (root === e.target || root.contains(e.target))) return;
      closeMenu();
    });
    document.addEventListener('keydown', (e) => { handleMenuKeydown(e); });
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('blur', closeMenu);
  }

  function init() {
    bind();
  }

  return { init, openMenu, closeMenu, isOpen, refreshBing };
})();
