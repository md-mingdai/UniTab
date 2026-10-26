/* ============================================
   UniTab - Settings Panel Management
   ============================================ */

const Settings = (() => {
  /* --- Defaults --- */
  const DEFAULTS = {
    engine: 'bing',
    bgBlur: 0,
    overlayOpacity: 0,
    overlayColor: '#000000',
    bgSource: 'bing',     // 'bing' | 'image' | 'color' | 'video'
    bgImageData: null,    // 旧版本：自定义图片 base64（仅用于迁移；新版本改存 IndexedDB）
    bgImageStored: false, // 上传的自定义图片已保存在 IndexedDB（image_blob）
    bgImageFileName: '',  // 上传图片的原始文件名（仅用于显示和导出命名）
    bgImageUrl: null,     // 自定义图片 URL（仅当 bgSource === 'image' 且用户填了链接时使用）
    bgBingUrl: null,      // 必应壁纸 URL（仅 bgSource === 'bing' 时使用）
    bgBingCopyright: '',  // 必应壁纸标题 + 版权信息（持久化，刷新页面也显示）
    bgColor: '#1a1d24',   // 纯色（仅 bgSource === 'color' 时使用）
    bgThemeColor: '',     // 当前生效的预览色（由下面三个按类型的字段派生）
    bgThemeColorBing: '', // 必应壁纸的预览色
    bgThemeColorImage: '',// 自定义图片的预览色
    bgThemeColorVideo: '',// 视频壁纸（首帧）的预览色
    showSeconds: true,
    showBookmarks: true,  // 底部常用网址 Dock 栏开关
    showCursorEffect: false,  // 鼠标粒子特效
    cursorEffectStyle: 'confetti',  // 'confetti' | 'rain' | 'bubble' | 'star'
    glassStyle: 'frosted',    // 'frosted' | 'liquid' — 毛玻璃 / 液态玻璃
    glassRadius: 20,          // 组件圆角 0-32px
    bgVideoSoundOn: false,    // 视频壁纸开启声音
    bgVideoVolume: 50,        // 视频壁纸音量 0-100
    bgVideoLoop: true,        // 视频壁纸循环播放
    bgVideoOnEnded: 'black',   // 'loop' | 'pause' | 'restart'
    bgVideoFileName: ''       // 视频文件名
  };

  /* --- State --- */
  let state = { ...DEFAULTS };

  const STORAGE_KEY = 'unitab_settings';

  /* 每种壁纸类型各存一份预览色：切换类型时直接取用，永远不会沿用上一个
     类型的颜色（bing 黄 → 图片/视频绿 的即时切换就靠这个）。 */
  const COLOR_KEY = {
    bing: 'bgThemeColorBing',
    image: 'bgThemeColorImage',
    video: 'bgThemeColorVideo'
  };

  /* Must be typed by hand in the Advanced danger zone. Pasting is blocked. */
  const RESET_PHRASE = '我确认清空全部配置且无法恢复';

  /* Writes are batched (see saveSettings): a slider drag fires `input` ~60 times a
     second, and every one of those used to JSON.stringify + synchronously write the
     whole settings blob to localStorage. */
  const SAVE_DELAY = 300;
  let saveTimer = 0;
  let saveDirty = false;

  const reduceMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* --- DOM refs --- */
  let panel, toggle, closeBtn, overlayEl;

  /* Tabs */
  let tabButtons, tabPanels, tabIndicator;

  /* Form elements */
  let bgFileInput, bgFileName, bgUrlInput, bgUrlApply, bgUrlError;
  let bgBingRefresh, bgBingMeta, bgBingPanel, bgImagePanel, bgColorPanel, bgVideoPanel;
  let bgVideoInput, bgVideoName;
  let videoSoundToggle, videoVolumeWrapper;
  let videoVolumeSlider, videoVolumeDisplay;
  let videoLoopToggle;
  let videoOnEndedWrapper, videoOnEndedTrigger, videoOnEndedDropdown, videoOnEndedLabel, videoOnEndedNative;
  let bgColorSwatches, bgCustomColorTrigger, bgColorInput, bgColorHex;
  let bgSourceOptions;
  let blurSlider, blurDisplay, opacitySlider, opacityDisplay;
  let overlayColorSwatches, customColorTrigger, overlayColorInput, colorHexDisplay;
  let engineSelectWrapper, engineSelectTrigger, engineSelectDropdown, engineSelectLabel, engineSelectNative;
  let showSecondsToggle;
  let showBookmarksToggle;
  let cursorEffectToggle;
  let cursorStyleGroup, cursorStyleWrapper, cursorStyleTrigger, cursorStyleDropdown, cursorStyleLabel, cursorStyleNative;
  let glassStyleWrapper, glassStyleTrigger, glassStyleDropdown, glassStyleLabel, glassStyleNative;
  let glassRadiusSlider, glassRadiusDisplay;
  let resetBtn, settingsFooter;

  /* Advanced tab */
  let advancedExportBtn, advancedExportHint;
  let advancedPreviewStatus, advancedClearPreviews, advancedRegenPreview, advancedRepickColor;
  let advancedStorageInfo, advancedClearBingCache, advancedResetAll;

  /* Typed confirmation dialog */
  let resetAllDialog, resetAllInput, resetAllConfirm, resetAllCancel, resetAllError, resetAllPhrase;

  /* Set while the full reset is in progress: pagehide must not write the old
     in-memory settings back into the localStorage that was just cleared. */
  let isResetting = false;

  function init() {
    cacheDom();
    loadSettings();
    bindEvents();
    applyBackground();
    /* The closed panel is laid out (just invisible), so the tab indicator can be
       placed now, while the page is still in `preload` and nothing transitions. */
    moveIndicator(getActiveTab());
    updateFooterVisibility(getActiveTab());
    migrateLegacyImage();

    /* Make sure the latest changes reach localStorage when the tab goes away. */
    window.addEventListener('pagehide', flushSettings);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushSettings();
    });

    /* Auto-fetch Bing wallpaper if that's the active source but no
       image has been fetched yet (e.g. first-time install). */
    if (state.bgSource === 'bing' && !state.bgBingUrl && bgBingRefresh) {
      bgBingRefresh.click();
    }
  }

  function cacheDom() {
    panel = document.getElementById('settings-panel');
    toggle = document.getElementById('settings-toggle');
    closeBtn = document.getElementById('settings-close');
    overlayEl = document.getElementById('settings-overlay');

    /* Tabs */
    tabButtons = panel.querySelectorAll('.settings-tab');
    tabPanels = panel.querySelectorAll('.settings-tab-panel');
    tabIndicator = panel.querySelector('.settings-tab-indicator');

    /* Background source radios */
    bgSourceOptions = document.querySelectorAll('.radio-option[data-bg-source]');

    /* Background sub-panels */
    bgBingPanel = document.getElementById('bg-bing-panel');
    bgImagePanel = document.getElementById('bg-image-panel');
    bgColorPanel = document.getElementById('bg-color-panel');
    bgVideoPanel = document.getElementById('bg-video-panel');
    bgVideoInput = document.getElementById('bg-video-input');
    bgVideoName = document.getElementById('bg-video-name');
    videoSoundToggle = document.getElementById('video-sound-toggle');
    videoVolumeWrapper = document.getElementById('video-volume-wrapper');
    videoVolumeSlider = document.getElementById('video-volume-slider');
    videoVolumeDisplay = document.getElementById('volume-value-display');
    videoLoopToggle = document.getElementById('video-loop-toggle');
    videoOnEndedWrapper = document.getElementById('video-onended-wrapper');
    videoOnEndedTrigger = document.getElementById('video-onended-trigger');
    videoOnEndedDropdown = document.getElementById('video-onended-dropdown');
    videoOnEndedLabel = document.getElementById('video-onended-label');
    videoOnEndedNative = document.getElementById('video-onended-select');

    /* Image sub-panel */
    bgFileInput = document.getElementById('bg-file-input');
    bgFileName = document.getElementById('bg-file-name');
    bgUrlInput = document.getElementById('bg-url-input');
    bgUrlApply = document.getElementById('bg-url-apply');
    bgUrlError = document.getElementById('bg-url-error');

    /* Bing sub-panel */
    bgBingRefresh = document.getElementById('bg-bing-refresh');
    bgBingMeta = document.getElementById('bg-bing-meta');

    /* Color sub-panel */
    bgColorSwatches = document.querySelectorAll('.bg-color-swatch[data-color]:not(.custom-swatch)');
    bgCustomColorTrigger = document.getElementById('bg-custom-color-trigger');
    bgColorInput = document.getElementById('bg-color-input');
    bgColorHex = document.getElementById('bg-color-hex');

    /* Blur / Overlay */
    blurSlider = document.getElementById('bg-blur-slider');
    blurDisplay = document.getElementById('blur-value-display');
    opacitySlider = document.getElementById('overlay-opacity-slider');
    opacityDisplay = document.getElementById('opacity-value-display');

    /* Overlay color swatches (for mask) */
    overlayColorSwatches = document.querySelectorAll('.color-swatch[data-color]:not(.custom-swatch):not(.bg-color-swatch)');
    customColorTrigger = document.getElementById('custom-color-trigger');
    overlayColorInput = document.getElementById('overlay-color-input');
    colorHexDisplay = document.getElementById('color-hex-display');

    /* Custom engine select */
    engineSelectWrapper = document.getElementById('engine-select-wrapper');
    engineSelectTrigger = document.getElementById('engine-select-trigger');
    engineSelectDropdown = document.getElementById('engine-select-dropdown');
    engineSelectLabel = document.getElementById('engine-select-label');
    engineSelectNative = document.getElementById('engine-select');

    /* Display */
    showSecondsToggle = document.getElementById('show-seconds-toggle');
    showBookmarksToggle = document.getElementById('show-bookmarks-toggle');
    cursorEffectToggle = document.getElementById('cursor-effect-toggle');
    cursorStyleGroup = document.getElementById('cursor-style-group');
    cursorStyleWrapper = document.getElementById('cursor-style-wrapper');
    cursorStyleTrigger = document.getElementById('cursor-style-trigger');
    cursorStyleDropdown = document.getElementById('cursor-style-dropdown');
    cursorStyleLabel = document.getElementById('cursor-style-label');
    cursorStyleNative = document.getElementById('cursor-style-select');

    /* Glass style select */
    glassStyleWrapper = document.getElementById('glass-style-wrapper');
    glassStyleTrigger = document.getElementById('glass-style-trigger');
    glassStyleDropdown = document.getElementById('glass-style-dropdown');
    glassStyleLabel = document.getElementById('glass-style-label');
    glassStyleNative = document.getElementById('glass-style-select');
    glassRadiusSlider = document.getElementById('glass-radius-slider');
    glassRadiusDisplay = document.getElementById('radius-value-display');

    resetBtn = document.getElementById('settings-reset');
    settingsFooter = document.getElementById('settings-footer');

    /* Advanced tab */
    advancedExportBtn = document.getElementById('advanced-export-wallpaper');
    advancedExportHint = document.getElementById('advanced-export-hint');
    advancedPreviewStatus = document.getElementById('advanced-preview-status');
    advancedClearPreviews = document.getElementById('advanced-clear-previews');
    advancedRegenPreview = document.getElementById('advanced-regen-preview');
    advancedRepickColor = document.getElementById('advanced-repick-color');
    advancedStorageInfo = document.getElementById('advanced-storage-info');
    advancedClearBingCache = document.getElementById('advanced-clear-bing-cache');
    advancedResetAll = document.getElementById('advanced-reset-all');

    /* Typed confirmation dialog */
    resetAllDialog = document.getElementById('reset-all-dialog');
    resetAllInput = document.getElementById('reset-all-input');
    resetAllConfirm = document.getElementById('reset-all-confirm');
    resetAllCancel = document.getElementById('reset-all-cancel');
    resetAllError = document.getElementById('reset-all-error');
    resetAllPhrase = document.getElementById('reset-all-phrase');
  }

  /* --- Confirm Dialog --- */
  function showConfirmDialog(message) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('confirm-dialog');
      const msg = document.getElementById('confirm-dialog-msg');
      const okBtn = document.getElementById('confirm-dialog-ok');
      const cancelBtn = document.getElementById('confirm-dialog-cancel');
      msg.textContent = message;
      dialog.hidden = false;
      function cleanup(result) {
        dialog.hidden = true;
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  /* --- Export Result Dialog (二级弹窗) ---
     okLabel is optional; defaults to 「知道了」. */
  function showExportDialog({ ok = false, title, detail, okLabel }) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('export-dialog');
      const icon = document.getElementById('export-dialog-icon');
      const titleEl = document.getElementById('export-dialog-title');
      const detailEl = document.getElementById('export-dialog-detail');
      const okBtn = document.getElementById('export-dialog-ok');

      icon.classList.toggle('export-dialog-icon--error', !ok);
      icon.innerHTML = ok
        ? '<circle cx="12" cy="12" r="10"></circle><path d="m8 12 2.5 2.5L16 9"></path>'
        : '<circle cx="12" cy="12" r="10"></circle><path d="M12 8v5"></path><path d="M12 16.5h.01"></path>';
      titleEl.textContent = title || (ok ? '导出完成' : '导出失败');
      detailEl.textContent = detail || '';
      okBtn.textContent = okLabel || '知道了';
      dialog.hidden = false;

      function onOk() {
        dialog.hidden = true;
        okBtn.removeEventListener('click', onOk);
        resolve();
      }
      okBtn.addEventListener('click', onOk);
    });
  }

  /* Extension hint derived from the blob's real MIME, so a stored file
     whose name lost its suffix on the way in still downloads playable. */
  const MIME_EXT = {
    'mp4': 'mp4', 'webm': 'webm', 'ogg': 'ogv', 'ogv': 'ogv',
    'quicktime': 'mov', 'x-matroska': 'mkv', 'x-msvideo': 'avi',
    'x-flv': 'flv', 'x-ms-wmv': 'wmv', 'mpegurl': 'm3u8',
    'jpeg': 'jpg', 'jpg': 'jpg', 'png': 'png', 'webp': 'webp',
    'gif': 'gif', 'avif': 'avif', 'svg+xml': 'svg', 'bmp': 'bmp',
    'x-icon': 'ico', 'vnd.microsoft.icon': 'ico', 'tiff': 'tif',
    'heic': 'heic', 'heif': 'heif',
  };

  function mimeExtension(blob, fallback) {
    const sub = blob && blob.type ? blob.type.split('/')[1].toLowerCase() : '';
    if (!sub || sub === 'octet-stream') return fallback;
    return MIME_EXT[sub] || sub.replace(/^x-/, '') || fallback;
  }

  /* Strip only what is illegal on some OS, plus trailing dots that
     Windows drops silently. Hyphens, spaces and CJK stay untouched. */
  function sanitizeFileName(name) {
    return String(name || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/[.\s]+$/, '')
      .trim();
  }

  function nameFromUrl(url) {
    if (typeof url !== 'string' || url.startsWith('data:')) return '';
    try {
      const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
      return decodeURIComponent(last);
    } catch {
      return '';
    }
  }

  /* Name for the Advanced tab's "export current wallpaper" action. The
     extension comes from the real blob MIME whenever one is available. */
  function buildExportName(blob, source, url) {
    if (source === 'video') {
      const raw = sanitizeFileName(state.bgVideoFileName || 'unitab-视频壁纸') || 'unitab-视频壁纸';
      if (/\.(mp4|webm|mov|mkv|avi|ogv|flv|wmv|m4v|3gp)$/i.test(raw)) return raw;
      return `${raw}.${mimeExtension(blob, 'mp4')}`;
    }

    if (source === 'bing') {
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');
      return `unitab-必应壁纸-${stamp}.${mimeExtension(blob, 'jpg')}`;
    }

    let raw = sanitizeFileName(state.bgImageFileName || nameFromUrl(url) || 'unitab-图片壁纸');
    if (!raw) raw = 'unitab-图片壁纸';

    const ext = mimeExtension(blob, 'jpg');
    if (/\.(jpe?g|png|webp|gif|avif|svg|bmp|ico|tiff?|heic|heif)$/i.test(raw)) {
      /* Prefer the blob's real type over a possibly misleading URL suffix. */
      return blob && blob.type ? `${raw.replace(/\.[^.]+$/, '')}.${ext}` : raw;
    }
    return `${raw}.${ext}`;
  }

  /* Hands the blob to the browser's download manager, which files it in
     the default download folder. Resolves as soon as the download is
     handed off — the manager streams it, so we don't wait on the bytes. */
  function downloadBlob(blob, fileName) {
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = URL.createObjectURL(blob);
      } catch (err) { reject(err); return; }

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();

      /* Revoking early can abort the transfer in Firefox; keep the URL
         alive well past hand-off. Detached so the dialog isn't delayed. */
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      resolve();
    });
  }

  /* Fallback for wallpapers the page cannot fetch into a Blob (for example a
     cross-origin image URL blocked by connect-src). The browser's own
     download manager still gets the URL; target=_blank keeps the new tab page
     alive if the server sends an image instead of an attachment. */
  function downloadUrl(url, fileName) {
    return new Promise((resolve, reject) => {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.rel = 'noopener';
        a.target = '_blank';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /* --- Load / Save --- */
  function loadSettings() {
    /* boot.js (in <head>) has already read and parsed localStorage once. */
    let saved = window.__UNITAB_SAVED__;
    delete window.__UNITAB_SAVED__;
    if (saved === undefined) {
      flushSettings();
      try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      } catch {
        saved = null;
      }
    }
    /* Keys missing from an older save fall back to DEFAULTS through the spread. */
    state = saved && typeof saved === 'object' ? { ...DEFAULTS, ...saved } : { ...DEFAULTS };

    let migrated = false;

    /* Migration: pre-bgSource builds stored everything in bgImageData. */
    if (state.bgSource == null) {
      const data = state.bgImageData;
      if (!data) {
        state.bgSource = 'bing';
      } else if (typeof data === 'string' && data.startsWith('bing-otd:')) {
        state.bgSource = 'bing';
        state.bgBingUrl = data.slice(Background.getBingOtdPrefix().length);
        state.bgImageData = null;
      } else {
        state.bgSource = 'image';
      }
      migrated = true;
    }
    /* Migration: pre-bgBingUrl builds stored bing URL inside bgImageData
       under the bing-otd: prefix. Move it to its own field so the two
       sources don't trample each other. */
    if (state.bgBingUrl == null && state.bgImageData
        && typeof state.bgImageData === 'string'
        && state.bgImageData.startsWith(Background.getBingOtdPrefix())) {
      state.bgBingUrl = state.bgImageData.slice(Background.getBingOtdPrefix().length);
      state.bgImageData = null;
      migrated = true;
    }
    /* Migration: 'none' source removed — redirect to 'bing'. */
    if (state.bgSource === 'none') {
      state.bgSource = 'bing';
      state.bgImageData = null;
      migrated = true;
    }
    /* Migrate old on-ended values to new options */
    if (state.bgVideoOnEnded === 'loop' || state.bgVideoOnEnded === 'pause' || state.bgVideoOnEnded === 'restart') {
      state.bgVideoOnEnded = 'black';
      migrated = true;
    }
    /* 预览色改为按壁纸类型分别保存：老数据只有一个 bgThemeColor，先归到当前
       类型；之后切换类型会同步命中各自颜色，不再沿用上一个壁纸的颜色。 */
    const activeColorKey = COLOR_KEY[state.bgSource];
    if (activeColorKey) {
      if (!state[activeColorKey] && state.bgThemeColor) {
        state[activeColorKey] = state.bgThemeColor;
        migrated = true;
      }
      if (state[activeColorKey] && state.bgThemeColor !== state[activeColorKey]) {
        state.bgThemeColor = state[activeColorKey];
        migrated = true;
      }
    }
    if (migrated) saveSettings();
    syncFormToState();
  }

  /* Persisting is deferred and batched: saveSettings() marks the state dirty and a
     single write follows SAVE_DELAY ms later (immediately when the tab is hidden or
     closed, see init). */
  function saveSettings() {
    if (isResetting) return;
    saveDirty = true;
    if (!saveTimer) saveTimer = setTimeout(flushSettings, SAVE_DELAY);
  }

  function flushSettings() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    if (!saveDirty || isResetting) return;
    saveDirty = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('UniTab: 无法保存设置:', e.message);
    }
  }

  function cancelPendingSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    saveDirty = false;
  }

  /* Earlier builds kept an uploaded wallpaper as a base64 string inside the settings
     blob (several MB that were parsed on every new tab and re-written on every slider
     tick, and that silently stopped saving once they hit the ~5 MB localStorage
     quota). Move it into IndexedDB once; this page keeps showing the data URL it
     already loaded. If the move fails the base64 simply stays where it was. */
  function migrateLegacyImage() {
    const data = state.bgImageData;
    if (typeof data !== 'string' || !data.startsWith('data:')) return;
    /* Decoding a few MB of base64 is main-thread work: wait until the page has settled. */
    setTimeout(() => {
      if (state.bgImageData !== data) return; /* changed in the meantime */
      Background.migrateLegacyImage(data).then((ok) => {
        if (!ok || state.bgImageData !== data) return;
        /* 静默补一份 preview，老数据迁移后下次启动有预览可用（会先清空旧槽）。 */
        Background.regeneratePreview('image', data).then((rec) => {
          if (rec && rec.color) adoptPreviewColor('image', rec.color);
        });
        state.bgImageData = null;
        state.bgImageStored = true;
        saveSettings();
      });
    }, 1500);
  }

  function syncFormToState() {
    blurSlider.value = state.bgBlur;
    blurDisplay.textContent = state.bgBlur + 'px';
    opacitySlider.value = state.overlayOpacity;
    opacityDisplay.textContent = state.overlayOpacity + '%';

    /* Overlay color swatches (mask) */
    updateOverlayColorSwatches(state.overlayColor);
    overlayColorInput.value = state.overlayColor;
    colorHexDisplay.textContent = state.overlayColor.toUpperCase();

    /* Engine select */
    engineSelectNative.value = state.engine;
    updateEngineLabel(state.engine);
    updateEngineDropdown(state.engine);

    /* Show seconds toggle */
    updateShowSecondsToggle(state.showSeconds);

    /* Bookmarks bar toggle */
    updateShowBookmarksToggle(state.showBookmarks);

    /* Cursor effect toggle */
    updateCursorEffectToggle(state.showCursorEffect);
    setCursorStyleGroupVisible(state.showCursorEffect);
    cursorStyleNative.value = state.cursorEffectStyle;
    updateCursorStyleLabel(state.cursorEffectStyle);
    updateCursorStyleDropdown(state.cursorEffectStyle);

    /* Glass style select */
    glassStyleNative.value = state.glassStyle;
    updateGlassStyleLabel(state.glassStyle);
    updateGlassStyleDropdown(state.glassStyle);

    /* Glass radius slider */
    glassRadiusSlider.value = state.glassRadius;
    glassRadiusDisplay.textContent = state.glassRadius + 'px';

    /* Background source radios */
    updateBgSourceRadios(state.bgSource);

    /* Background color swatches */
    updateBgColorSwatches(state.bgColor);
    if (bgColorInput) bgColorInput.value = state.bgColor;
    if (bgColorHex) bgColorHex.textContent = state.bgColor.toUpperCase();

    /* Sub-panel visibility */
    setPanelVisible('bing', state.bgSource === 'bing');
    setPanelVisible('image', state.bgSource === 'image');
    setPanelVisible('color', state.bgSource === 'color');
    setPanelVisible('video', state.bgSource === 'video');

    /* Image filename hint — distinguishes between uploaded base64
       and a user-entered URL, both stored independently under 'image'. */
    if (state.bgImageData || state.bgImageStored) {
      bgFileName.textContent = state.bgImageFileName || '已上传图片';
    } else if (state.bgImageUrl) {
      bgFileName.textContent = state.bgImageUrl.length > 40
        ? state.bgImageUrl.substring(0, 40) + '...' : state.bgImageUrl;
    } else {
      bgFileName.textContent = '未选择文件';
    }
    setBingMeta(state.bgBingCopyright || '');

    /* Video settings */
    updateVideoSoundToggle(state.bgVideoSoundOn);
    if (videoVolumeWrapper) videoVolumeWrapper.hidden = !state.bgVideoSoundOn;
    if (videoVolumeSlider) videoVolumeSlider.value = state.bgVideoVolume;
    if (videoVolumeDisplay) videoVolumeDisplay.textContent = state.bgVideoVolume + '%';
    updateVideoLoopToggle(state.bgVideoLoop);
    if (videoOnEndedWrapper) videoOnEndedWrapper.hidden = state.bgVideoLoop;
    if (videoOnEndedNative) videoOnEndedNative.value = state.bgVideoOnEnded;
    updateVideoOnEndedLabel(state.bgVideoOnEnded);
    updateVideoOnEndedDropdown(state.bgVideoOnEnded);
  }

  /* What is stored in IndexedDB, as far as the video sub-panel shows it (file
     label). Looked up when the panel is opened or the source switched to video,
     not on every new tab: the blob survives source switches, but nothing here is
     visible until the panel is. */
  function refreshVideoInfo() {
    Background.loadVideoBlob().then((blob) => {
      if (blob) {
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        const name = state.bgVideoFileName || '已存储视频';
        bgVideoName.textContent = `${name}（${sizeMB}MB）`;
      } else {
        bgVideoName.textContent = '未选择文件';
      }
    }).catch(() => {
      bgVideoName.textContent = '未选择文件';
    });
  }

  /* --- Apply to DOM --- */

  /* Bright wallpapers need a denser liquid tint to keep white copy readable;
     dark scenes can stay clearer. Threshold is relative luminance (0.16 sits
     between a dim scene and a bright sky). Keep in sync with boot.js, which
     does the same for the very first frame. */
  function setWallpaperTone(color) {
    const root = document.documentElement;
    const m = typeof color === 'string' && /^#([0-9a-f]{6})$/i.exec(color.trim());
    if (!m) {
      delete root.dataset.wallpaperTone;
      return;
    }
    const n = parseInt(m[1], 16);
    const lin = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = 0.2126 * lin((n >> 16) & 255)
      + 0.7152 * lin((n >> 8) & 255)
      + 0.0722 * lin(n & 255);
    root.dataset.wallpaperTone = lum > 0.16 ? 'light' : 'dark';
  }

  function applyToDom(key, value) {
    const root = document.documentElement;
    switch (key) {
      case 'bgBlur':
        /* `none`, not blur(0px): at 0 no off-screen filter pass is paid for at all. */
        root.style.setProperty('--bg-filter', value > 0 ? 'blur(' + value + 'px)' : 'none');
        break;
      case 'overlayOpacity':
        root.style.setProperty('--overlay-opacity', value);
        break;
      case 'overlayColor':
        root.style.setProperty('--overlay-color', value);
        break;
      case 'bgColor':
        root.style.setProperty('--bg-solid-color', value);
        if (state.bgSource === 'color') setWallpaperTone(value);
        break;
      case 'bgThemeColor':
        root.style.setProperty('--bg-theme-color', value || 'transparent');
        /* The colour source has no extracted colour of its own. */
        setWallpaperTone(value || (state.bgSource === 'color' ? state.bgColor : ''));
        break;
      case 'engine':
        if (typeof Search !== 'undefined') {
          Search.setEngine(value, false);
        }
        break;
      case 'showSeconds':
        if (typeof Clock !== 'undefined') {
          Clock.setShowSeconds(value);
        }
        break;
      case 'showBookmarks':
        if (typeof Bookmarks !== 'undefined' && Bookmarks.setVisible) {
          Bookmarks.setVisible(value);
        }
        break;
      case 'showCursorEffect':
        if (typeof CursorEffect !== 'undefined' && CursorEffect.setVisible) {
          CursorEffect.setVisible(value);
        }
        break;
      case 'cursorEffectStyle':
        if (typeof CursorEffect !== 'undefined' && CursorEffect.setStyle) {
          CursorEffect.setStyle(value);
        }
        break;
      case 'glassStyle':
        root.dataset.glass = value;
        break;
      case 'glassRadius':
        root.style.setProperty('--glass-radius', value + 'px');
        break;
    }
  }

  function applyAllToDom() {
    applyToDom('bgBlur', state.bgBlur);
    applyToDom('overlayOpacity', state.overlayOpacity);
    applyToDom('overlayColor', state.overlayColor);
    applyToDom('bgColor', state.bgColor);
    applyToDom('bgThemeColor', state.bgThemeColor);
    applyToDom('engine', state.engine);
    applyToDom('showSeconds', state.showSeconds);
    applyToDom('showBookmarks', state.showBookmarks);
    applyToDom('showCursorEffect', state.showCursorEffect);
    applyToDom('cursorEffectStyle', state.cursorEffectStyle);
    applyToDom('glassStyle', state.glassStyle);
    applyToDom('glassRadius', state.glassRadius);
  }

  /* The saved custom image, in the shape Background.load() expects. */
  function customImageOpts() {
    return {
      imageStored: !!state.bgImageStored,
      imageData: state.bgImageData || state.bgImageUrl
    };
  }

  function getVideoEndCallback() {
    const behavior = state.bgVideoOnEnded;
    if (behavior === 'customimage') {
      return () => {
        if (state.bgImageStored || state.bgImageData || state.bgImageUrl) {
          bgLoad({ source: 'image', ...customImageOpts(), color: state.bgColor });
        }
      };
    }
    if (behavior === 'bing') {
      return () => {
        if (state.bgBingUrl) {
          bgLoad({ source: 'bing', imageData: state.bgBingUrl });
        } else {
          Background.fetchBingOfTheDay().then((res) => {
            if (res && res.ok && res.url) {
              state.bgBingUrl = res.url;
              state.bgBingCopyright = res.copyright || '';
              saveSettings();
              bgLoad({ source: 'bing', imageData: res.url });
            }
          });
        }
      };
    }
    return null;
  }

  function applyBackground() {
    if (typeof Background === 'undefined') return;
    if (state.bgSource === 'video') {
      bgLoad({
        source: 'video',
        volume: state.bgVideoVolume,
        loop: state.bgVideoLoop,
        onEnded: state.bgVideoOnEnded,
        soundOn: state.bgVideoSoundOn,
        onEndCallback: getVideoEndCallback()
      });
      return;
    }
    if (state.bgSource === 'image') {
      bgLoad({ source: 'image', ...customImageOpts(), color: state.bgColor });
      return;
    }
    bgLoad({
      source: state.bgSource,
      imageData: state.bgBingUrl,
      color: state.bgColor
    });
  }

  /* --- Sub-panel visibility --- */
  function setPanelVisible(name, visible) {
    const map = { bing: bgBingPanel, image: bgImagePanel, color: bgColorPanel, video: bgVideoPanel };
    const el = map[name];
    if (!el) return;
    if (visible) {
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  /* --- Background source radios --- */
  function updateBgSourceRadios(source) {
    if (!bgSourceOptions) return;
    bgSourceOptions.forEach(btn => {
      const checked = btn.dataset.bgSource === source;
      btn.classList.toggle('checked', checked);
      btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    });
  }

  /* --- Background color swatches --- */
  function updateBgColorSwatches(color) {
    if (!bgColorSwatches) return;
    bgColorSwatches.forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.color === color);
    });
  }

  /* --- Overlay color swatches (mask) --- */
  function updateOverlayColorSwatches(activeColor) {
    if (!overlayColorSwatches) return;
    overlayColorSwatches.forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.color === activeColor);
    });
  }

  /* --- Engine Select --- */
  function updateEngineLabel(engineKey) {
    const option = engineSelectNative.querySelector(`option[value="${engineKey}"]`);
    engineSelectLabel.textContent = option ? option.textContent : engineKey;
  }

  function updateEngineDropdown(engineKey) {
    engineSelectDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === engineKey);
    });
  }

  function updateShowSecondsToggle(on) {
    if (!showSecondsToggle) return;
    showSecondsToggle.classList.toggle('on', !!on);
    showSecondsToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateShowBookmarksToggle(on) {
    if (!showBookmarksToggle) return;
    showBookmarksToggle.classList.toggle('on', !!on);
    showBookmarksToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateCursorEffectToggle(on) {
    if (!cursorEffectToggle) return;
    cursorEffectToggle.classList.toggle('on', !!on);
    cursorEffectToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateVideoSoundToggle(on) {
    if (!videoSoundToggle) return;
    videoSoundToggle.classList.toggle('on', !!on);
    videoSoundToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateCursorStyleLabel(styleKey) {
    const opt = cursorStyleNative.querySelector(`option[value="${styleKey}"]`);
    cursorStyleLabel.textContent = opt ? opt.textContent : styleKey;
  }

  function updateCursorStyleDropdown(styleKey) {
    cursorStyleDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === styleKey);
    });
  }

  function setCursorStyleGroupVisible(visible) {
    if (!cursorStyleGroup) return;
    cursorStyleGroup.hidden = !visible;
  }

  function updateGlassStyleLabel(styleKey) {
    const opt = glassStyleNative.querySelector(`option[value="${styleKey}"]`);
    glassStyleLabel.textContent = opt ? opt.textContent : styleKey;
  }

  function updateGlassStyleDropdown(styleKey) {
    glassStyleDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === styleKey);
    });
  }

  function updateVideoLoopToggle(on) {
    if (!videoLoopToggle) return;
    videoLoopToggle.classList.toggle('on', !!on);
    videoLoopToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateVideoOnEndedLabel(val) {
    const opt = videoOnEndedNative.querySelector(`option[value="${val}"]`);
    videoOnEndedLabel.textContent = opt ? opt.textContent : val;
  }

  function updateVideoOnEndedDropdown(val) {
    videoOnEndedDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === val);
    });
  }

  /* --- Tab switching --- */
  function switchTab(tabName) {
    if (!tabButtons || !tabPanels) return;
    if (tabName === getActiveTab()) {
      if (tabName === 'advanced') refreshAdvancedInfo();
      return;
    }
    morphPanel(() => {
      tabButtons.forEach(btn => {
        const active = btn.dataset.tab === tabName;
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      });
      tabPanels.forEach(p => {
        p.hidden = p.dataset.tabPanel !== tabName;
      });
      updateFooterVisibility(tabName);
    });
    moveIndicator(tabName);
    if (tabName === 'advanced') refreshAdvancedInfo();
  }

  /* The Advanced tab has its own danger zone, so the per-tab "restore
     defaults" footer would be redundant (and has no defaults to restore). */
  function updateFooterVisibility(tabName) {
    if (settingsFooter) settingsFooter.hidden = tabName === 'advanced';
  }

  function moveIndicator(tabName) {
    if (!tabIndicator) return;
    const activeBtn = panel.querySelector(`.settings-tab[data-tab="${tabName}"]`);
    if (!activeBtn) return;
    const inset = 14; // px to shrink from each side
    /* offsetLeft / offsetWidth are layout values: unlike getBoundingClientRect() they
       are not skewed by the panel's open/close scale transform. The slide itself is a
       transform (see css), so no layout work per animation frame. */
    const left = activeBtn.offsetLeft + inset;
    const width = Math.max(activeBtn.offsetWidth - inset * 2, 20);
    tabIndicator.style.width = width + 'px';
    tabIndicator.style.transform = 'translateX(' + left + 'px)';
  }

  /* --- Panel height morph ---
     The panel is as tall as its content, so swapping a tab or revealing a control used
     to make the whole centred panel jump (up to ~230 px). `mutate` performs the DOM
     change; the height is then eased from the old size to the new one. */
  let morphCleanup = null;

  function morphPanel(mutate) {
    const animate = panel.classList.contains('open')
      && !(reduceMotionQuery && reduceMotionQuery.matches);
    if (!animate) {
      mutate();
      return;
    }

    const from = panel.offsetHeight;      /* may be mid-morph: continue from there */
    if (morphCleanup) morphCleanup();     /* drop the previous inline height */
    mutate();
    const to = panel.offsetHeight;        /* natural height after the change */
    if (Math.abs(from - to) < 2) return;

    panel.style.height = from + 'px';
    panel.classList.add('is-morphing');
    void panel.offsetHeight;              /* commit the start height */
    panel.style.height = to + 'px';

    let timer = 0;
    const finish = () => {
      clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
      panel.classList.remove('is-morphing');
      panel.style.height = '';
      if (morphCleanup === finish) morphCleanup = null;
    };
    const onEnd = (e) => {
      if (e.target === panel && e.propertyName === 'height') finish();
    };
    panel.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, 450);      /* safety net if no transition runs */
    morphCleanup = finish;
  }

  function getActiveTab() {
    if (!tabButtons) return 'bg';
    const active = panel.querySelector('.settings-tab[aria-selected="true"]');
    return active ? active.dataset.tab : 'bg';
  }

  /* --- Events --- */
  function bindEvents() {
    /* Tab switching */
    if (tabButtons) {
      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
      });
    }

    /* Panel open/close */
    toggle.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);
    overlayEl.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        closePanel();
      }
    });

    /* --- Background source radios --- */
    bgSourceOptions.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.bgSource;
        if (val) setBgSource(val);
      });
    });

    /* --- Bing refresh --- */
    bgBingRefresh.addEventListener('click', async () => {
      if (typeof Background === 'undefined' || !Background.fetchBingOfTheDay) return;
      bgBingRefresh.disabled = true;
      setBingMeta('正在获取…');
      try {
        const result = await Background.fetchBingOfTheDay();
        if (!result.ok) {
          setBingMeta('获取失败：' + (result.error || '未知错误'));
          return;
        }
        state.bgBingUrl = result.url;
        state.bgBingCopyright = formatBingMeta(result);
        saveSettings();
        /* 静默生成必应壁纸的 preview（低分辨率 WebP，先清空旧的再用预览色更新占位色），
           生成失败（离线等）则退回原来的整图取色。 */
        pickPreview('bing', result.url, result.url);
        applyBackground();
        setBingMeta(state.bgBingCopyright);
      } finally {
        bgBingRefresh.disabled = false;
      }
    });

    /* --- Image upload --- */
    bgFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        bgFileName.textContent = '请选择图片文件';
        bgFileInput.value = '';
        return;
      }
      bgFileName.textContent = file.name;
      /* The File goes into IndexedDB as it is. It used to be converted to a base64
         string (+33 %) kept inside the localStorage settings blob. */
      let stored = false;
      try {
        await Background.saveImageBlob(file);
        stored = true;
      } catch {
        /* IndexedDB unavailable (some private modes): use the old base64 route. */
      }
      let dataUrl = null;
      if (!stored) {
        dataUrl = await readAsDataUrl(file).catch(() => null);
        if (!dataUrl) {
          bgFileName.textContent = '图片加载失败';
          return;
        }
      }
      /* Clear the URL slot so the upload "wins" — having both stored
         at once caused the two sources to fight for the same field. */
      state.bgImageStored = stored;
      state.bgImageData = dataUrl;
      state.bgImageUrl = null;
      state.bgImageFileName = file.name;
      saveSettings();
      /* 静默生成图片 preview（低分辨率 WebP，先清空旧的再生成，预览色一并采用），
         生成失败则退回整图取色。 */
      pickPreview('image', file, file);
      applyBackground();
    });

    /* --- URL apply --- */
    bgUrlApply.addEventListener('click', () => {
      const raw = bgUrlInput.value.trim();
      if (!raw) {
        showUrlError('请输入图片链接');
        return;
      }
      const check = validateImageUrl(raw);
      if (!check.ok) {
        showUrlError(check.error);
        return;
      }
      /* Clear the upload slot so the URL "wins". */
      state.bgImageUrl = check.url;
      state.bgImageData = null;
      state.bgImageFileName = '';
      if (state.bgImageStored) {
        state.bgImageStored = false;
        Background.clearImageBlob();
      }
      saveSettings();
      /* URL 图片可能因 CORS 无法生成 preview（fetch 不到像素）：成功则一并采用
         预览色，失败则退回原来的 extractThemeColor 只取色。 */
      pickPreview('image', check.url, check.url);
      applyBackground();
      bgFileName.textContent = check.url.length > 40 ? check.url.substring(0, 40) + '...' : check.url;
      showUrlError('');
    });

    /* Clear the error as soon as the user edits the input again. */
    bgUrlInput.addEventListener('input', () => {
      if (bgUrlError && !bgUrlError.hidden) showUrlError('');
    });

    /* --- Background color swatches --- */
    bgColorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const val = swatch.dataset.color;
        state.bgColor = val;
        if (bgColorInput) bgColorInput.value = val;
        if (bgColorHex) bgColorHex.textContent = val.toUpperCase();
        updateBgColorSwatches(val);
        applyToDom('bgColor', val);
        saveSettings();
        applyBackground();
      });
    });
    if (bgCustomColorTrigger) {
      bgCustomColorTrigger.addEventListener('click', () => {
        if (bgColorInput) bgColorInput.click();
      });
    }
    if (bgColorInput) {
      bgColorInput.addEventListener('input', () => {
        const val = bgColorInput.value;
        state.bgColor = val;
        if (bgColorHex) bgColorHex.textContent = val.toUpperCase();
        updateBgColorSwatches(val);
        applyToDom('bgColor', val);
        saveSettings();
        applyBackground();
      });
    }

    /* --- Blur slider --- */
    blurSlider.addEventListener('input', () => {
      const val = parseInt(blurSlider.value, 10);
      blurDisplay.textContent = val + 'px';
      state.bgBlur = val;
      applyToDom('bgBlur', val);
      saveSettings();
    });

    /* --- Overlay opacity slider --- */
    opacitySlider.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value, 10);
      opacityDisplay.textContent = val + '%';
      state.overlayOpacity = val;
      applyToDom('overlayOpacity', val);
      saveSettings();
    });

    /* --- Overlay (mask) color swatches --- */
    overlayColorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const val = swatch.dataset.color;
        overlayColorInput.value = val;
        colorHexDisplay.textContent = val.toUpperCase();
        state.overlayColor = val;
        updateOverlayColorSwatches(val);
        applyToDom('overlayColor', val);
        saveSettings();
      });
    });
    customColorTrigger.addEventListener('click', () => { overlayColorInput.click(); });
    overlayColorInput.addEventListener('input', () => {
      const val = overlayColorInput.value;
      colorHexDisplay.textContent = val.toUpperCase();
      state.overlayColor = val;
      updateOverlayColorSwatches(val);
      applyToDom('overlayColor', val);
      saveSettings();
    });

    /* --- Engine select --- */
    engineSelectTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !engineSelectDropdown.hidden;
      if (isOpen) {
        engineSelectDropdown.hidden = true;
        engineSelectTrigger.classList.remove('open');
      } else {
        engineSelectDropdown.hidden = false;
        engineSelectTrigger.classList.add('open');
      }
    });
    engineSelectDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        engineSelectNative.value = val;
        state.engine = val;
        updateEngineLabel(val);
        updateEngineDropdown(val);
        applyToDom('engine', val);
        saveSettings();
        engineSelectDropdown.hidden = true;
        engineSelectTrigger.classList.remove('open');
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#engine-select-wrapper')) {
        engineSelectDropdown.hidden = true;
        engineSelectTrigger.classList.remove('open');
      }
    });

    /* --- Show seconds toggle --- */
    showSecondsToggle.addEventListener('click', () => {
      state.showSeconds = !state.showSeconds;
      updateShowSecondsToggle(state.showSeconds);
      applyToDom('showSeconds', state.showSeconds);
      saveSettings();
    });
    showSecondsToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        showSecondsToggle.click();
      }
    });

    /* --- Show bookmarks bar toggle --- */
    showBookmarksToggle.addEventListener('click', () => {
      state.showBookmarks = !state.showBookmarks;
      updateShowBookmarksToggle(state.showBookmarks);
      applyToDom('showBookmarks', state.showBookmarks);
      saveSettings();
    });
    showBookmarksToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        showBookmarksToggle.click();
      }
    });

    /* --- Cursor effect toggle --- */
    cursorEffectToggle.addEventListener('click', () => {
      state.showCursorEffect = !state.showCursorEffect;
      updateCursorEffectToggle(state.showCursorEffect);
      morphPanel(() => setCursorStyleGroupVisible(state.showCursorEffect));
      applyToDom('showCursorEffect', state.showCursorEffect);
      saveSettings();
    });
    cursorEffectToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        cursorEffectToggle.click();
      }
    });

    /* --- Cursor style select --- */
    cursorStyleTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !cursorStyleDropdown.hidden;
      cursorStyleDropdown.hidden = isOpen;
      cursorStyleTrigger.classList.toggle('open', !isOpen);
    });
    cursorStyleDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        cursorStyleNative.value = val;
        state.cursorEffectStyle = val;
        updateCursorStyleLabel(val);
        updateCursorStyleDropdown(val);
        applyToDom('cursorEffectStyle', val);
        saveSettings();
        cursorStyleDropdown.hidden = true;
        cursorStyleTrigger.classList.remove('open');
      });
    });
    /* Close dropdown on outside click */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#cursor-style-wrapper')) {
        cursorStyleDropdown.hidden = true;
        cursorStyleTrigger.classList.remove('open');
      }
    });

    /* --- Glass style select --- */
    glassStyleTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !glassStyleDropdown.hidden;
      glassStyleDropdown.hidden = isOpen;
      glassStyleTrigger.classList.toggle('open', !isOpen);
    });
    glassStyleDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        glassStyleNative.value = val;
        state.glassStyle = val;
        updateGlassStyleLabel(val);
        updateGlassStyleDropdown(val);
        applyToDom('glassStyle', val);
        saveSettings();
        glassStyleDropdown.hidden = true;
        glassStyleTrigger.classList.remove('open');
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#glass-style-wrapper')) {
        glassStyleDropdown.hidden = true;
        glassStyleTrigger.classList.remove('open');
      }
    });

    /* --- Glass radius slider --- */
    glassRadiusSlider.addEventListener('input', () => {
      const val = parseInt(glassRadiusSlider.value, 10);
      glassRadiusDisplay.textContent = val + 'px';
      state.glassRadius = val;
      applyToDom('glassRadius', val);
      saveSettings();
    });

    /* --- Video wallpaper file input --- */
    bgVideoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        bgVideoName.textContent = '请选择视频文件';
        bgVideoInput.value = '';
        return;
      }
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      if (file.size > 100 * 1024 * 1024) {
        const ok = await showConfirmDialog(
          `文件大小 ${sizeMB}MB，较大的视频可能导致浏览器卡顿。是否继续使用？`
        );
        if (!ok) {
          bgVideoInput.value = '';
          return;
        }
      }
      bgVideoName.textContent = file.name + `（${sizeMB}MB）`;
      Background.saveVideoBlob(file).then(() => {
        state.bgVideoFileName = file.name;
        saveSettings();
        /* 静默截取视频首帧生成 preview（低分辨率 WebP，先清空旧的，预览色来自首帧）。 */
        pickPreview('video', file, null);
        applyBackground();
      }).catch(() => {
        bgVideoName.textContent = '视频保存失败';
      });
    });

    /* --- Video sound toggle --- */
    function toggleVideoSound() {
      state.bgVideoSoundOn = !state.bgVideoSoundOn;
      updateVideoSoundToggle(state.bgVideoSoundOn);
      morphPanel(() => {
        if (videoVolumeWrapper) videoVolumeWrapper.hidden = !state.bgVideoSoundOn;
      });
      Background.setMuted(!state.bgVideoSoundOn);
      saveSettings();
    }
    videoSoundToggle.addEventListener('click', toggleVideoSound);
    videoSoundToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggleVideoSound();
      }
    });

    /* --- Video volume slider --- */
    videoVolumeSlider.addEventListener('input', () => {
      const val = parseInt(videoVolumeSlider.value, 10);
      videoVolumeDisplay.textContent = val + '%';
      state.bgVideoVolume = val;
      Background.setVolume(val);
      saveSettings();
    });

    /* --- Video loop toggle --- */
    videoLoopToggle.addEventListener('click', () => {
      state.bgVideoLoop = !state.bgVideoLoop;
      updateVideoLoopToggle(state.bgVideoLoop);
      morphPanel(() => {
        if (videoOnEndedWrapper) videoOnEndedWrapper.hidden = state.bgVideoLoop;
      });
      if (state.bgVideoLoop) {
        Background.setLoop(true);
      } else {
        Background.setOnEnded(state.bgVideoOnEnded, getVideoEndCallback());
      }
      saveSettings();
    });
    videoLoopToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        videoLoopToggle.click();
      }
    });

    /* --- Video on-ended select --- */
    videoOnEndedTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !videoOnEndedDropdown.hidden;
      videoOnEndedDropdown.hidden = isOpen;
      videoOnEndedTrigger.classList.toggle('open', !isOpen);
    });
    videoOnEndedDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        videoOnEndedNative.value = val;
        state.bgVideoOnEnded = val;
        updateVideoOnEndedLabel(val);
        updateVideoOnEndedDropdown(val);
        Background.setOnEnded(val, getVideoEndCallback());
        saveSettings();
        videoOnEndedDropdown.hidden = true;
        videoOnEndedTrigger.classList.remove('open');
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#video-onended-wrapper')) {
        videoOnEndedDropdown.hidden = true;
        videoOnEndedTrigger.classList.remove('open');
      }
    });

    /* While a slider is held, the preview follows it 1:1 (.is-dragging in css). */
    trackDragging(blurSlider);
    trackDragging(opacitySlider);

    /* --- Advanced tab actions --- */
    if (advancedExportBtn) {
      advancedExportBtn.addEventListener('click', exportCurrentWallpaper);
    }
    if (advancedClearPreviews) {
      advancedClearPreviews.addEventListener('click', clearPreviewBuffer);
    }
    if (advancedRegenPreview) {
      advancedRegenPreview.addEventListener('click', regenerateCurrentPreview);
    }
    if (advancedRepickColor) {
      advancedRepickColor.addEventListener('click', repickPreviewColor);
    }
    if (advancedClearBingCache) {
      advancedClearBingCache.addEventListener('click', clearBingCacheFromAdvanced);
    }
    if (advancedResetAll) {
      advancedResetAll.addEventListener('click', resetAllConfiguration);
    }

    /* --- Reset (per-tab) --- */
    resetBtn.addEventListener('click', () => {
      const activeTab = getActiveTab();
      switch (activeTab) {
        case 'bg':
          /* 丢弃仍在生成中的预览 / 取色结果：否则重置完成后，迟到的结果会把
             刚刚清空的预览色又写回来。 */
          pickSeq.bing++;
          pickSeq.image++;
          pickSeq.video++;
          state.bgSource = DEFAULTS.bgSource;
          state.bgBlur = DEFAULTS.bgBlur;
          state.overlayOpacity = DEFAULTS.overlayOpacity;
          state.overlayColor = DEFAULTS.overlayColor;
          state.bgImageData = DEFAULTS.bgImageData;
          state.bgImageStored = DEFAULTS.bgImageStored;
          state.bgImageFileName = DEFAULTS.bgImageFileName;
          state.bgImageUrl = DEFAULTS.bgImageUrl;
          state.bgBingUrl = DEFAULTS.bgBingUrl;
          state.bgBingCopyright = DEFAULTS.bgBingCopyright;
          state.bgColor = DEFAULTS.bgColor;
          state.bgThemeColor = DEFAULTS.bgThemeColor;
          state.bgThemeColorBing = DEFAULTS.bgThemeColorBing;
          state.bgThemeColorImage = DEFAULTS.bgThemeColorImage;
          state.bgThemeColorVideo = DEFAULTS.bgThemeColorVideo;
          state.bgVideoVolume = DEFAULTS.bgVideoVolume;
          state.bgVideoLoop = DEFAULTS.bgVideoLoop;
          state.bgVideoOnEnded = DEFAULTS.bgVideoOnEnded;
          state.bgVideoFileName = DEFAULTS.bgVideoFileName;
          state.bgVideoSoundOn = DEFAULTS.bgVideoSoundOn;
          saveSettings();
          syncFormToState();
          applyAllToDom();
          applyBackground();
          if (bgUrlInput) bgUrlInput.value = '';
          showUrlError('');
          bgVideoName.textContent = '未选择文件';
          Background.clearVideoBlob();
          Background.clearImageBlob();
          Background.clearBingCache();
          Background.clearAllPreviews();
          setBingMeta('');
          /* Back on the default source: fetch today's wallpaper, as a first run does. */
          if (state.bgSource === 'bing' && !state.bgBingUrl && bgBingRefresh) {
            bgBingRefresh.click();
          }
          break;
        case 'search':
          state.engine = DEFAULTS.engine;
          saveSettings();
          syncFormToState();
          applyToDom('engine', state.engine);
          break;
        case 'display':
          state.showSeconds = DEFAULTS.showSeconds;
          state.showBookmarks = DEFAULTS.showBookmarks;
          state.showCursorEffect = DEFAULTS.showCursorEffect;
          state.cursorEffectStyle = DEFAULTS.cursorEffectStyle;
          state.glassStyle = DEFAULTS.glassStyle;
          state.glassRadius = DEFAULTS.glassRadius;
          saveSettings();
          syncFormToState();
          applyToDom('showSeconds', state.showSeconds);
          applyToDom('showBookmarks', state.showBookmarks);
          applyToDom('showCursorEffect', state.showCursorEffect);
          applyToDom('cursorEffectStyle', state.cursorEffectStyle);
          applyToDom('glassStyle', state.glassStyle);
          applyToDom('glassRadius', state.glassRadius);
          break;
      }
    });
  }

  /* ================================================================
     Advanced tab
     ================================================================ */

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '未知';
    if (bytes < 1024) return Math.round(bytes) + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = -1;
    do {
      value /= 1024;
      unit++;
    } while (value >= 1024 && unit < units.length - 1);
    return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, '') + ' ' + units[unit];
  }

  function sourceLabel(source) {
    if (source === 'bing') return '必应每日壁纸';
    if (source === 'image') {
      if (state.bgImageStored || state.bgImageData) {
        return state.bgImageFileName ? `自定义图片 · ${state.bgImageFileName}` : '自定义图片（已上传）';
      }
      return state.bgImageUrl ? '自定义图片（链接）' : '自定义图片（未设置）';
    }
    if (source === 'video') {
      return state.bgVideoFileName ? `视频壁纸 · ${state.bgVideoFileName}` : '视频壁纸';
    }
    if (source === 'color') return '纯色背景';
    return '未设置';
  }

  /* Resolve the active wallpaper into the shape Background.regeneratePreview()
     accepts. Uploaded images/videos are read from IndexedDB once here; URL
     sources stay URLs so the preview generator can use its own fetch/cache. */
  async function resolveCurrentWallpaperSource() {
    const source = state.bgSource;
    if (source === 'bing') {
      return { source, src: state.bgBingUrl || null };
    }
    if (source === 'image') {
      const opts = customImageOpts();
      if (opts.imageStored) {
        let blob = null;
        try { blob = await Background.getWallpaperBlob('image', opts); } catch { blob = null; }
        if (blob) return { source, src: blob };
      }
      return { source, src: opts.imageData || null };
    }
    if (source === 'video') {
      let blob = null;
      try { blob = await Background.getWallpaperBlob('video', {}); } catch { blob = null; }
      return { source, src: blob || null };
    }
    return { source, src: null };
  }

  /* Preview maintenance actions report through the button itself instead of a
     secondary dialog: busy label while running, then a brief result label. */
  const BUTTON_RESULT_MS = 1600;
  const buttonResultTimers = new WeakMap();
  const buttonIdleLabels = new WeakMap();

  /* Every label these buttons can show. Their sizes are measured once, before
     the first action, so the button box never changes while it is reporting. */
  const PREVIEW_ACTION_TEXT = {
    clear: { busy: '清空中…', done: '已清空', failed: '清空失败' },
    regen: {
      busy: '生成中…',
      done: '已生成',
      failed: '生成失败',
      none: '无需生成',
      noData: '无数据',
    },
    repick: { busy: '拾取中…', done: '已拾取', failed: '拾取失败', none: '无需拾取' },
  };

  /* Largest intrinsic size this button's labels need. */
  function measureButtonSize(button, labels) {
    if (!button) return null;
    const idle = button.textContent;
    const previousWidth = button.style.width;
    let maxWidth = 0;
    let maxHeight = 0;
    /* Measure the intrinsic content size even when CSS stretches the button to
       100% on narrow screens; freezing that container width would overflow. */
    button.style.width = 'max-content';
    for (const label of labels) {
      button.textContent = label;
      maxWidth = Math.max(maxWidth, button.offsetWidth);
      maxHeight = Math.max(maxHeight, button.offsetHeight);
    }
    button.textContent = idle;
    button.style.width = previousWidth;
    return { width: maxWidth, height: maxHeight };
  }

  let previewButtonWidthsReserved = false;
  function reservePreviewButtonWidths() {
    if (previewButtonWidthsReserved) return;
    if (!advancedClearPreviews || !advancedRegenPreview || !advancedRepickColor) return;
    /* Only measure with a real layout: the Advanced panel is hidden until its tab
       is shown, and hidden buttons report 0. Retried on the next refresh. */
    if (!advancedClearPreviews.offsetWidth) return;

    const buttons = [advancedClearPreviews, advancedRegenPreview, advancedRepickColor];
    const groups = [
      [advancedClearPreviews, Object.values(PREVIEW_ACTION_TEXT.clear)],
      [advancedRegenPreview, Object.values(PREVIEW_ACTION_TEXT.regen)],
      [advancedRepickColor, Object.values(PREVIEW_ACTION_TEXT.repick)],
    ];

    let maxWidth = 0;
    let maxHeight = 0;
    for (const [button, labels] of groups) {
      const size = measureButtonSize(button, labels);
      if (!size) return;
      maxWidth = Math.max(maxWidth, size.width);
      maxHeight = Math.max(maxHeight, size.height);
    }
    if (!maxWidth) return;

    /* One shared size for the whole section, so the button with the longest
       label does not look out of place next to the others. */
    for (const button of buttons) {
      button.style.minWidth = (maxWidth + 2) + 'px';
      button.style.minHeight = maxHeight + 'px';
    }
    previewButtonWidthsReserved = true;
  }

  function setButtonBusy(button, text) {
    if (!button) return;
    if (!buttonIdleLabels.has(button)) buttonIdleLabels.set(button, button.textContent);
    clearTimeout(buttonResultTimers.get(button));
    buttonResultTimers.delete(button);
    button.disabled = true;
    button.textContent = text;
  }

  function setButtonResult(button, text) {
    if (!button) return;
    const idle = buttonIdleLabels.get(button) || button.textContent;
    clearTimeout(buttonResultTimers.get(button));
    button.disabled = false;
    button.textContent = text;
    const timer = setTimeout(() => {
      buttonResultTimers.delete(button);
      button.textContent = idle;
    }, BUTTON_RESULT_MS);
    buttonResultTimers.set(button, timer);
  }

  function resetButton(button) {
    if (!button) return;
    clearTimeout(buttonResultTimers.get(button));
    buttonResultTimers.delete(button);
    const idle = buttonIdleLabels.get(button);
    if (idle) button.textContent = idle;
    button.disabled = false;
  }

  let advancedRefreshSeq = 0;

  async function refreshAdvancedInfo() {
    if (!advancedExportBtn) return;
    reservePreviewButtonWidths();
    const seq = ++advancedRefreshSeq;
    const source = state.bgSource;
    const hasWallpaper = source !== 'color' && source !== 'none';

    advancedExportBtn.disabled = !hasWallpaper;
    if (advancedExportHint) {
      advancedExportHint.textContent = hasWallpaper
        ? `当前：${sourceLabel(source)}`
        : '当前：纯色背景，没有可导出的壁纸。';
    }
    if (advancedRegenPreview) advancedRegenPreview.disabled = !hasWallpaper;
    if (advancedRepickColor) advancedRepickColor.disabled = !hasWallpaper;

    if (advancedPreviewStatus) {
      if (!hasWallpaper) {
        advancedPreviewStatus.textContent = '纯色背景不使用壁纸预览。';
      } else if (typeof Background === 'undefined' || !Background.getPreviewInfo) {
        advancedPreviewStatus.textContent = '当前预览：无法读取。';
      } else {
        advancedPreviewStatus.textContent = '当前预览：正在读取…';
        try {
          const info = await Background.getPreviewInfo(source);
          if (seq !== advancedRefreshSeq) return;
          if (info) {
            const color = info.color ? info.color.toUpperCase() : '未知';
            advancedPreviewStatus.textContent =
              `当前预览：已缓存（${formatBytes(info.size)}） · 预览色 ${color}`;
          } else {
            advancedPreviewStatus.textContent = '当前预览：未缓存，可点击“重新生成当前预览”。';
          }
        } catch {
          if (seq === advancedRefreshSeq) advancedPreviewStatus.textContent = '当前预览：读取失败。';
        }
      }
    }

    if (advancedStorageInfo) {
      advancedStorageInfo.textContent = '本地存储占用：正在读取…';
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (seq !== advancedRefreshSeq) return;
          if (estimate && typeof estimate.usage === 'number') {
            const quota = typeof estimate.quota === 'number' && estimate.quota > 0
              ? ` / ${formatBytes(estimate.quota)}` : '';
            advancedStorageInfo.textContent = `本地存储占用：约 ${formatBytes(estimate.usage)}${quota}`;
          } else {
            advancedStorageInfo.textContent = '本地存储占用：无法读取。';
          }
        } else {
          advancedStorageInfo.textContent = '当前浏览器不支持存储占用查询。';
        }
      } catch {
        if (seq === advancedRefreshSeq) advancedStorageInfo.textContent = '本地存储占用：读取失败。';
      }
    }
  }

  async function exportCurrentWallpaper() {
    if (!advancedExportBtn) return;
    const source = state.bgSource;
    if (source === 'color' || source === 'none') {
      await showExportDialog({
        ok: false,
        title: '没有可导出的壁纸',
        detail: '当前背景是纯色，请先切换到必应、自定义图片或视频壁纸。',
      });
      return;
    }
    if (typeof Background === 'undefined' || !Background.getWallpaperBlob) {
      await showExportDialog({ ok: false, detail: '壁纸模块尚未准备好，请稍后重试。' });
      return;
    }

    const originalLabel = advancedExportBtn.textContent;
    advancedExportBtn.disabled = true;
    advancedExportBtn.textContent = '导出中…';

    let url = '';
    let opts = {};
    if (source === 'bing') {
      url = state.bgBingUrl || '';
      opts = { url };
    } else if (source === 'image') {
      opts = customImageOpts();
      url = state.bgImageUrl || (state.bgImageData && !state.bgImageData.startsWith('data:')
        ? state.bgImageData : '');
    }

    try {
      let blob = null;
      try { blob = await Background.getWallpaperBlob(source, opts); } catch { blob = null; }

      if (blob && blob.size) {
        const fileName = buildExportName(blob, source, url);
        await downloadBlob(blob, fileName);
        await showExportDialog({
          ok: true,
          title: '导出完成',
          detail: `${fileName}（${formatBytes(blob.size)}）`,
        });
      } else if (url) {
        /* The page could not turn this URL into a Blob (CORS / connect-src);
           let the browser's download manager handle the URL directly. */
        const fileName = buildExportName(null, source, url);
        await downloadUrl(url, fileName);
        await showExportDialog({
          ok: true,
          title: '已交给浏览器下载',
          detail: `${fileName}\n如果浏览器直接打开了图片，请右键另存为。`,
        });
      } else {
        await showExportDialog({
          ok: false,
          title: '没有可导出的壁纸',
          detail: '当前壁纸的数据不存在，或本地存储已被清除。',
        });
      }
    } catch (err) {
      await showExportDialog({
        ok: false,
        title: '导出失败',
        detail: '下载被浏览器拦截或失败了，请检查本站的下载权限设置。'
          + (err && err.message ? '\n' + err.message : ''),
      });
    } finally {
      advancedExportBtn.textContent = originalLabel;
      advancedExportBtn.disabled = false;
      refreshAdvancedInfo();
    }
  }

  async function clearPreviewBuffer() {
    if (!advancedClearPreviews) return;
    if (typeof Background === 'undefined' || !Background.clearAllPreviews) return;

    setButtonBusy(advancedClearPreviews, PREVIEW_ACTION_TEXT.clear.busy);
    /* Cancel settings-side late colour adoption as well as Background's own
       preview jobs, otherwise a result from before the clear could reappear. */
    pickSeq.bing++;
    pickSeq.image++;
    pickSeq.video++;
    themeColorSeq++;

    let cleared = true;
    try {
      await Background.clearAllPreviews();
    } catch {
      cleared = false;
    }

    setButtonResult(
      advancedClearPreviews,
      cleared ? PREVIEW_ACTION_TEXT.clear.done : PREVIEW_ACTION_TEXT.clear.failed
    );
    refreshAdvancedInfo();
  }

  async function regenerateCurrentPreview() {
    if (!advancedRegenPreview) return;
    if (typeof Background === 'undefined' || !Background.regeneratePreview) return;

    setButtonBusy(advancedRegenPreview, PREVIEW_ACTION_TEXT.regen.busy);
    try {
      const current = await resolveCurrentWallpaperSource();
      if (current.source === 'color' || current.source === 'none') {
        setButtonResult(advancedRegenPreview, PREVIEW_ACTION_TEXT.regen.none);
        return;
      }
      if (!current.src) {
        setButtonResult(advancedRegenPreview, PREVIEW_ACTION_TEXT.regen.noData);
        return;
      }

      const seq = ++pickSeq[current.source];
      const rec = await Background.regeneratePreview(current.source, current.src);
      if (seq !== pickSeq[current.source]) {
        resetButton(advancedRegenPreview); /* superseded by a newer pick */
        return;
      }
      if (rec && rec.color) adoptPreviewColor(current.source, rec.color);
      setButtonResult(
        advancedRegenPreview,
        rec ? PREVIEW_ACTION_TEXT.regen.done : PREVIEW_ACTION_TEXT.regen.failed
      );
    } catch {
      setButtonResult(advancedRegenPreview, PREVIEW_ACTION_TEXT.regen.failed);
    } finally {
      refreshAdvancedInfo();
    }
  }

  async function repickPreviewColor() {
    if (!advancedRepickColor) return;
    if (typeof Background === 'undefined' || !Background.recomputePreviewColor) return;

    setButtonBusy(advancedRepickColor, PREVIEW_ACTION_TEXT.repick.busy);
    try {
      const current = await resolveCurrentWallpaperSource();
      if (current.source === 'color' || current.source === 'none') {
        setButtonResult(advancedRepickColor, PREVIEW_ACTION_TEXT.repick.none);
        return;
      }

      const color = await Background.recomputePreviewColor(current.source, current.src);
      if (color) {
        adoptPreviewColor(current.source, color);
        setButtonResult(advancedRepickColor, PREVIEW_ACTION_TEXT.repick.done);
      } else {
        setButtonResult(advancedRepickColor, PREVIEW_ACTION_TEXT.repick.failed);
      }
    } catch {
      setButtonResult(advancedRepickColor, PREVIEW_ACTION_TEXT.repick.failed);
    } finally {
      refreshAdvancedInfo();
    }
  }

  async function clearBingCacheFromAdvanced() {
    if (!advancedClearBingCache) return;
    if (typeof Background === 'undefined' || !Background.clearBingCache) return;

    const originalLabel = advancedClearBingCache.textContent;
    advancedClearBingCache.disabled = true;
    advancedClearBingCache.textContent = '清理中…';
    try {
      await Background.clearBingCache();
      await showExportDialog({
        ok: true,
        title: '必应缓存已清除',
        detail: '下次使用必应壁纸时会重新下载最新壁纸。',
      });
    } catch (err) {
      await showExportDialog({
        ok: false,
        title: '清除失败',
        detail: err && err.message ? err.message : '未知错误',
      });
    } finally {
      advancedClearBingCache.textContent = originalLabel;
      advancedClearBingCache.disabled = false;
      refreshAdvancedInfo();
    }
  }

  /* Typed second confirmation for the full reset. Pasting and dropping text
     are blocked on purpose: the user must type the warning phrase by hand. */
  function showResetAllDialog() {
    return new Promise((resolve) => {
      if (!resetAllDialog || !resetAllInput || !resetAllConfirm) {
        resolve(false);
        return;
      }
      let settled = false;

      function setError(text) {
        if (!resetAllError) return;
        resetAllError.textContent = text || '';
        resetAllError.hidden = !text;
        if (text) resetAllInput.setAttribute('aria-invalid', 'true');
        else resetAllInput.removeAttribute('aria-invalid');
      }

      function syncConfirm() {
        const matches = resetAllInput.value.trim() === RESET_PHRASE;
        resetAllConfirm.disabled = !matches;
        if (matches) setError('');
      }

      function cleanup(result) {
        if (settled) return;
        settled = true;
        resetAllDialog.hidden = true;
        resetAllInput.value = '';
        resetAllInput.removeAttribute('aria-invalid');
        resetAllInput.removeEventListener('input', onInput);
        resetAllInput.removeEventListener('paste', onPaste);
        resetAllInput.removeEventListener('beforeinput', onBeforeInput);
        resetAllInput.removeEventListener('drop', onDrop);
        resetAllDialog.removeEventListener('keydown', onKeydown);
        resetAllDialog.removeEventListener('click', onBackdrop);
        resetAllConfirm.removeEventListener('click', onConfirm);
        resetAllCancel.removeEventListener('click', onCancel);
        resolve(result);
      }

      function onInput() {
        setError('');
        syncConfirm();
      }

      function onPaste(e) {
        e.preventDefault();
        setError('此输入框禁止粘贴，请手动输入警告文字。');
      }

      function onBeforeInput(e) {
        const type = e.inputType || '';
        if (type === 'insertFromPaste' || type === 'insertFromPasteAsQuotation'
            || type === 'insertFromDrop' || type === 'insertFromYank') {
          e.preventDefault();
          setError('此输入框禁止粘贴，请手动输入警告文字。');
        }
      }

      function onDrop(e) {
        e.preventDefault();
        setError('此输入框禁止拖放文本，请手动输入警告文字。');
      }

      function onKeydown(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cleanup(false);
        } else if (e.key === 'Enter' && document.activeElement === resetAllInput) {
          if (resetAllConfirm.disabled) {
            e.preventDefault();
            setError('请完整输入上面的警告文字。');
          } else {
            e.preventDefault();
            cleanup(true);
          }
        }
      }

      function onBackdrop(e) {
        if (e.target === resetAllDialog) cleanup(false);
      }

      function onConfirm() {
        if (resetAllInput.value.trim() !== RESET_PHRASE) {
          setError('输入内容不匹配，请重新输入。');
          syncConfirm();
          return;
        }
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      if (resetAllPhrase) resetAllPhrase.textContent = RESET_PHRASE;
      resetAllInput.value = '';
      resetAllInput.removeAttribute('aria-invalid');
      resetAllConfirm.disabled = true;
      setError('');
      resetAllDialog.hidden = false;

      resetAllInput.addEventListener('input', onInput);
      resetAllInput.addEventListener('paste', onPaste);
      resetAllInput.addEventListener('beforeinput', onBeforeInput);
      resetAllInput.addEventListener('drop', onDrop);
      resetAllDialog.addEventListener('keydown', onKeydown);
      resetAllDialog.addEventListener('click', onBackdrop);
      resetAllConfirm.addEventListener('click', onConfirm);
      resetAllCancel.addEventListener('click', onCancel);
      requestAnimationFrame(() => resetAllInput.focus());
    });
  }

  async function resetAllConfiguration() {
    if (!advancedResetAll) return;
    const confirmed = await showResetAllDialog();
    if (!confirmed) return;

    /* From here on, nothing may write the old in-memory state back. */
    isResetting = true;
    cancelPendingSave();

    advancedResetAll.disabled = true;
    advancedResetAll.textContent = '正在清空…';

    let storageCleared = true;
    try {
      if (typeof Background !== 'undefined' && Background.clearAllStorage) {
        storageCleared = await Background.clearAllStorage();
      }
    } catch {
      storageCleared = false;
    }

    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('unitab_')) localStorage.removeItem(key);
      });
    } catch {
      storageCleared = false;
    }

    advancedResetAll.textContent = '已清空';
    await showExportDialog({
      ok: storageCleared,
      title: storageCleared ? '已清空全部配置' : '配置已清除，但缓存清理不完整',
      detail: storageCleared
        ? '页面将重新加载，恢复首次安装状态。'
        : '设置已清除，但部分本地缓存可能仍在。页面将重新加载。',
      okLabel: '重新加载',
    });
    window.location.reload();
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /* Extract theme color from an image source (Blob or URL) and persist it.
     Only a fallback for when preview generation failed; `source` scopes the
     result to its wallpaper type. */
  let themeColorSeq = 0;
  function extractAndSaveThemeColor(src, source) {
    if (!Background.extractThemeColor) return;
    const active = source === state.bgSource;
    const seq = active ? ++themeColorSeq : themeColorSeq;
    const pick = source ? pickSeq[source] : undefined;
    Background.extractThemeColor(src).then((color) => {
      /* Ignore an empty result, and a stale one if a newer wallpaper was chosen since. */
      if (!color) return;
      if (active && seq !== themeColorSeq) return;
      if (source && pick !== undefined && pick !== pickSeq[source]) return;
      adoptPreviewColor(source, color);
    }).catch(() => { /* cosmetic only */ });
  }

  /* 使用预览色作为占位色：pick / fetch / 切换类型都会走到这里。
     The preview colour is cheaper than a full extractThemeColor round-trip —
     it is computed from the tiny preview canvas while the preview itself is
     being generated. Stored per wallpaper type, so switching back to a type
     reuses its own colour instead of the previous type's.

     `source` is the type the colour belongs to; the DOM (and the persisted
     active colour) only change while that type is the active one. */
  function adoptPreviewColor(source, color) {
    const key = COLOR_KEY[source];
    if (!key || !color) return;
    const stored = state[key] !== color;
    if (stored) state[key] = color;

    if (state.bgSource === source && state.bgThemeColor !== color) {
      themeColorSeq++; /* a slower extract from an older pick must not win */
      state.bgThemeColor = color;
      applyToDom('bgThemeColor', color);
      saveSettings();
    } else if (stored) {
      saveSettings();
    }
  }

  /* Apply the cached colour of a type the moment it is switched to. Called
     synchronously from setBgSource: no IndexedDB / async wait whatsoever.
     Without a cached colour the neutral bgColor stands in until the preview
     read (or its regeneration) reports the real one. */
  function applyTypePreviewColor(source) {
    const key = COLOR_KEY[source];
    const color = key ? (state[key] || state.bgColor || '') : '';
    themeColorSeq++; /* cancel an in-flight extract belonging to the old type */
    state.bgThemeColor = color;
    applyToDom('bgThemeColor', color);
  }

  /* Background reports a preview colour as soon as it is known (before the
     preview decodes). It is only adopted for the active type. */
  function onPreviewColorFromBackground(source, color) {
    if (state.bgSource === source) adoptPreviewColor(source, color);
  }

  /* Every Background.load() goes through here so the early colour callback is
     never forgotten. */
  function bgLoad(opts) {
    if (typeof Background === 'undefined') return;
    opts = opts || {};
    opts.onPreviewColor = onPreviewColorFromBackground;
    return Background.load(opts);
  }

  /* Pick flows: silently generate a fresh preview for the wallpaper just picked
     and adopt its preview colour. Regeneration itself empties the old slot
     first; the per-source token skips anything an older (superseded) pick
     would try to apply after the fact. */
  const pickSeq = { bing: 0, image: 0, video: 0 };

  function pickPreview(source, src, colorFallbackSrc) {
    if (typeof Background === 'undefined' || !Background.regeneratePreview) return;
    const seq = ++pickSeq[source];
    Background.regeneratePreview(source, src).then((rec) => {
      if (seq !== pickSeq[source]) return; /* another pick of this type came later */
      if (rec && rec.color) {
        adoptPreviewColor(source, rec.color);
      } else if (colorFallbackSrc && Background.extractThemeColor) {
        extractAndSaveThemeColor(colorFallbackSrc, source);
      }
    });
  }

  /* While a slider thumb is held, <html> carries .is-dragging, which switches off the
     background layers' transitions (see css): the blur / mask preview then follows the
     thumb 1:1 instead of chasing it through a 0.4 s transition that is re-targeted on
     every input event. */
  function trackDragging(slider) {
    if (!slider) return;
    const root = document.documentElement;
    const stop = () => {
      root.classList.remove('is-dragging');
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
    };
    slider.addEventListener('pointerdown', () => {
      root.classList.add('is-dragging');
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    });
    slider.addEventListener('keydown', () => root.classList.add('is-dragging'));
    slider.addEventListener('keyup', stop);
    slider.addEventListener('blur', stop);
  }

  /* --- Background source selection --- */
  function setBgSource(val) {
    if (state.bgSource === val) return; // 已经选中，不重复操作
    state.bgSource = val;

    /* 同步换上该类型自己的预览色（0 延迟，不读 IndexedDB）：这就是
       “bing 黄 → 图片/视频绿”切换不再卡在旧颜色的关键。若该类型还没生成
       过预览，则先用中性色占位；随后 preview 读取/生成通过 onPreviewColor
       回调立刻补上真实颜色。 */
    applyTypePreviewColor(val);

    updateBgSourceRadios(val);
    morphPanel(() => {
      setPanelVisible('bing', val === 'bing');
      setPanelVisible('image', val === 'image');
      setPanelVisible('color', val === 'color');
      setPanelVisible('video', val === 'video');
    });

    /* 切换到视频时检查 IndexedDB 中是否已有视频 */
    if (val === 'video') refreshVideoInfo();

    /* 切换到必应但还没获取过 ➜ 自动获取一次 */
    if (val === 'bing' && !state.bgBingUrl) {
      saveSettings();
      bgBingRefresh.click();
      return;
    }
    saveSettings();
    applyBackground();
  }

  /* Validate that a string is a safe http(s) image URL.
     Rejects javascript:, data:, file:, blob: and other non-http schemes
     to prevent XSS via the CSS url() setter. Returns { ok, url, error }. */
  function validateImageUrl(input) {
    if (typeof input !== 'string' || !input.trim()) {
      return { ok: false, error: '链接不能为空' };
    }
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      return { ok: false, error: '链接格式不合法' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: '仅支持 http / https 链接' };
    }
    return { ok: true, url: parsed.href };
  }

  /* --- Bing meta helpers --- */
  function setBingMeta(text) {
    if (!bgBingMeta) return;
    /* The line wraps when the copyright text arrives: ease the panel to its new height. */
    morphPanel(() => { bgBingMeta.textContent = text || ''; });
  }

  /* Show / clear the URL input error line. Pass empty string to clear. */
  function showUrlError(text) {
    if (!bgUrlError) return;
    morphPanel(() => {
      if (text) {
        bgUrlError.textContent = text;
        bgUrlError.hidden = false;
        bgUrlInput.setAttribute('aria-invalid', 'true');
      } else {
        bgUrlError.textContent = '';
        bgUrlError.hidden = true;
        bgUrlInput.removeAttribute('aria-invalid');
      }
    });
  }

  function formatBingMeta(result) {
    if (!result || !result.ok) return '';
    const parts = [];
    if (result.headline) parts.push(result.headline);
    if (result.copyright) parts.push(result.copyright);
    if (result.startdate) {
      parts.push(result.startdate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
    }
    return parts.join(' · ');
  }

  function closeAllDropdowns() {
    if (engineSelectDropdown) engineSelectDropdown.hidden = true;
    if (engineSelectTrigger) engineSelectTrigger.classList.remove('open');
    if (cursorStyleDropdown) cursorStyleDropdown.hidden = true;
    if (cursorStyleTrigger) cursorStyleTrigger.classList.remove('open');
    if (glassStyleDropdown) glassStyleDropdown.hidden = true;
    if (glassStyleTrigger) glassStyleTrigger.classList.remove('open');
    if (videoOnEndedDropdown) videoOnEndedDropdown.hidden = true;
    if (videoOnEndedTrigger) videoOnEndedTrigger.classList.remove('open');
  }

  /* --- Panel state --- */
  /* Closed means `visibility: hidden` in css (no backdrop blur kept alive, nothing
     focusable), so there are no `hidden` flips or timeouts to coordinate here. */
  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    overlayEl.classList.add('open');
    requestAnimationFrame(() => {
      /* Cheap re-check once per open (fonts / breakpoint may have changed the tabs). */
      moveIndicator(getActiveTab());
    });
    toggle.style.opacity = '0';
    toggle.style.pointerEvents = 'none';
    if (state.bgSource === 'video') refreshVideoInfo();
    if (getActiveTab() === 'advanced') refreshAdvancedInfo();
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    overlayEl.classList.remove('open');
    toggle.style.opacity = '';
    toggle.style.pointerEvents = '';
    closeAllDropdowns();
  }

  return {
    init,
    getState: () => state,
    applyAllToDom,
    loadSettings,
    flush: flushSettings
  };
})();
