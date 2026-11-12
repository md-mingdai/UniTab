/* ============================================
   UniTab - Settings Panel Management
   ============================================ */

const Settings = (() => {
  /* --- Defaults --- */
  const DEFAULTS = {
    engine: 'bing',
    useCustomSuggest: false, // 预设引擎使用自定义联想 API（自定义引擎始终启用）
    bgBlur: 0,
    overlayOpacity: 0,
    overlayColor: '#000000',
    bgSource: 'bing',     // 'bing' | 'image' | 'color' | 'video'
    bgImageData: null,    // 旧版本：自定义图片 base64（仅用于迁移；新版本改存 IndexedDB）
    bgImageStored: false, // 上传的自定义图片已保存在 IndexedDB（image_blob）
    bgImageFileName: '',  // 上传图片的原始文件名（仅用于显示和导出命名）
    bgImageUrl: null,     // 自定义图片 URL（仅当 bgSource === 'image' 且用户填了链接时使用）
    bgImageMode: 'single', // 'single' 单张 | 'slide' 幻灯片轮播 | 'schedule' 定时壁纸
    bgSlideMode: false,   // bgImageMode 的派生镜像（右键上一张/下一张等既有逻辑使用）
    bgSlideInterval: 0,   // 轮播间隔分钟数（0 = 每次打开新标签页换一张）
    bgSlideRandom: false, // 幻灯片随机顺序
    bgBingUrl: null,      // 必应壁纸 URL（仅 bgSource === 'bing' 时使用）
    bgBingCopyright: '',  // 必应壁纸标题 + 版权信息（持久化，刷新页面也显示）
    bgBingCopyrightLink: '', // 必应版权词条链接（API 的 copyrightlink，右键"打开来源页面"用）
    bgBingAutoRefresh: false, // 必应每日壁纸：每天首次打开时自动刷新（默认关闭）
    bingLastRefreshDate: null, // 最近一次必应壁纸刷新的日期（YYYY-MM-DD），用于判断是否过期
    bgColor: '#1a1d24',   // 纯色（仅 bgSource === 'color' 时使用）
    bgThemeColor: '',     // 当前生效的预览色（由下面三个按类型的字段派生）
    bgThemeColorBing: '', // 必应壁纸的预览色
    bgThemeColorImage: '',// 自定义图片的预览色
    bgThemeColorVideo: '',// 视频壁纸（首帧）的预览色
    showClock: true,     // 时钟总控（关闭则整个时钟隐藏，秒数子项随之隐藏）
    showSeconds: true,
    showBookmarks: true,  // 底部常用网址 Dock 栏开关
    autoHideBookmarks: false, // 自动收起 Dock 栏：只在鼠标接近底部时滑出（需先开启 Dock 栏）
    showContextMenu: true, // 主界面自定义右键菜单（按壁纸类型提供操作）
    autoHideSettingsIcon: false, // 自动隐藏设置图标：开启后仅在悬停其位置时显示
    settingsIconHideStrength: 50, // 自动隐藏强度 0-100（越低越容易浮现，0=不隐藏）
    showCursorEffect: false,  // 鼠标粒子特效
    cursorEffectStyle: 'confetti',  // 'confetti' | 'rain' | 'bubble' | 'star'
    glassStyle: 'frosted',    // 'frosted' | 'liquid' | 'matte' — 毛玻璃 / 液态玻璃 / 磨砂质感
    glassRadius: 20,          // 组件圆角 0-32px
    bgVideoSoundOn: false,    // 视频壁纸开启声音
    bgVideoVolume: 50,        // 视频壁纸音量 0-100
    bgVideoLoop: true,        // 视频壁纸循环播放
    bgVideoOnEnded: 'black',   // 'loop' | 'pause' | 'restart'
    bgVideoFileName: '',      // 视频文件名
    bgVideoPaused: false,     // 视频播放暂停（供右键菜单切换播放/暂停）
    foldedGroups: {}          // 设置分组折叠状态：{ [groupKey]: true }
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

  /* Value -> i18n key maps for the custom-select trigger labels, so the visible
     label re-translates when the language changes (native <option> text is static). */
  const ENGINE_LABEL_KEY = {
    google: 'settings.search.engine.google',
    bing: 'settings.search.engine.bing',
    sogou: 'settings.search.engine.sogou',
    baidu: 'settings.search.engine.baidu',
    custom: 'settings.search.engine.custom'
  };
  /* Custom engine config lives in its own keys (search.js reads them directly),
     so they are not duplicated into the unitab_settings blob. The full reset
     removes every unitab_* key, so these are cleared along with everything else. */
  const CUSTOM_URL_KEY = 'unitab_engine_custom_url';
  const CUSTOM_SUGGEST_KEY = 'unitab_engine_custom_suggest';
  const CURSOR_STYLE_LABEL_KEY = {
    confetti: 'settings.display.cursorStyle.confetti',
    rain: 'settings.display.cursorStyle.rain',
    bubble: 'settings.display.cursorStyle.bubble',
    star: 'settings.display.cursorStyle.star',
    kivotos: 'settings.display.cursorStyle.kivotos'
  };
  const GLASS_STYLE_LABEL_KEY = {
    frosted: 'settings.display.glassStyle.frosted',
    liquid: 'settings.display.glassStyle.liquid',
    matte: 'settings.display.glassStyle.matte'
  };
  const VIDEO_ONENDED_LABEL_KEY = {
    black: 'settings.bg.video.onEnded.black',
    lastframe: 'settings.bg.video.onEnded.lastframe',
    customimage: 'settings.bg.video.onEnded.customimage',
    bing: 'settings.bg.video.onEnded.bing'
  };
  /* Language names are shown as endonyms (each language in its own script), the
     usual convention for a language picker — only "Follow System" translates. */
  const LANG_ENDONYM = {
    zh_CN: '简体中文',
    zh_TW: '繁體中文',
    en: 'English'
  };

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

  /* Auto-hide settings gear: the button's opacity follows the pointer's distance
     to its centre (fully visible inside the near radius, gone past the far one). */
  const GEAR_FADE_IN_PX = 34;   // the button's own box fits inside this radius
  const GEAR_FADE_OUT_MAX_PX = 150; // outermost fade radius at 100 % strength
  let gearRect = null;
  let gearRafId = 0;
  let pointerX = -1e4;
  let pointerY = -1e4;

  /* Tabs */
  let tabButtons, tabPanels, tabIndicator;
  let settingCategories;

  /* Form elements */
  let bgFileInput, bgFileName, bgUrlInput, bgUrlApply, bgUrlError;
  let bgImageModeWrapper, bgImageModeTrigger, bgImageModeDropdown, bgImageModeLabel, bgImageModeSelect;
  let bgScheduleSummary, bgScheduleListBtn, bgScheduleOptions, scheduleListDialog, scheduleListClose;
  let bgScheduleRows, bgScheduleCount, bgScheduleAddInput;
  let bgSlideAddInput, bgSlideDirInput, bgSlideThumbs;
  let bgSlideIntervalInput, bgSlideRandomToggle, bgSlideCount, bgSlideOptions;
  let bgSlideIntervalWrapper, bgSlideIntervalLabel;
  let bgSlideIntervalTrigger, bgSlideIntervalDropdown;
  let bgSlideClear, bgSlideListBtn, slideListDialog, slideListClose;
  let bgSlideIntervalCustom, bgSlideIntervalCustomInput, bgSlideIntervalCustomApply;
  let bgSingleImage;
  let bgBingRefresh, bgBingMeta, bgBingAutoRefreshToggle, bgBingPanel, bgImagePanel, bgColorPanel, bgVideoPanel;
  let bgVideoInput, bgVideoName;
  let videoSoundToggle, videoVolumeWrapper;
  let videoVolumeSlider, videoVolumeDisplay;
  let videoLoopToggle;
  let videoOnEndedWrapper, videoOnEndedTrigger, videoOnEndedDropdown, videoOnEndedLabel, videoOnEndedNative;
  let bgColorSwatches, bgCustomColorTrigger, bgColorHex;
  let bgSourceOptions;
  let blurSlider, blurDisplay, opacitySlider, opacityDisplay;
  let overlayColorSwatches, customColorTrigger, colorHexDisplay;
  let engineSelectWrapper, engineSelectTrigger, engineSelectDropdown, engineSelectLabel, engineSelectNative;
  let customEngineConfig, customEngineUrlInput, customEngineSaveBtn, customEngineSaveStatus;
  let customSuggestWrapper, customSuggestTrigger, customSuggestDropdown, customSuggestLabel, customSuggestNative;
  let customSuggestToggle, customSuggestConfig;
  let languageSelectWrapper, languageSelectTrigger, languageSelectDropdown, languageSelectLabel, languageSelectNative;
  let showClockToggle, showSecondsGroup;
  let showSecondsToggle;
  let showBookmarksToggle;
  let autoHideBookmarksToggle, autoHideBookmarksGroup;
  let showContextMenuToggle;
  let autoHideSettingsIconToggle;
  let autoHideSettingsStrengthGroup, autoHideSettingsStrengthSlider, autoHideSettingsStrengthDisplay;
  let cursorEffectToggle;
  let cursorStyleGroup, cursorStyleWrapper, cursorStyleTrigger, cursorStyleDropdown, cursorStyleLabel, cursorStyleNative;
  let glassStyleWrapper, glassStyleTrigger, glassStyleDropdown, glassStyleLabel, glassStyleNative;
  let glassRadiusSlider, glassRadiusDisplay;

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
    initLanguageSelector();
    bindEvents();
    /* "Every new tab" rotation already advanced the index in boot.js (before the
       first paint), so applyBackground() here paints the new slide directly.
       Interval mode rotates via restartSlideTimer() inside applyBackground(). */
    applyBackground();
    /* The closed panel is laid out (just invisible), so the tab indicator can be
       placed now, while the page is still in `preload` and nothing transitions. */
    moveIndicator(getActiveTab());
    migrateLegacyImage();

    /* Make sure the latest changes reach localStorage when the tab goes away. */
    window.addEventListener('pagehide', flushSettings);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushSettings();
    });
    /* Settings changed in another tab: adopt them live (see onStorageSync). */
    window.addEventListener('storage', onStorageSync);

    /* Auto-fetch Bing wallpaper when the active source has no image yet
       (first-time install), or when daily auto-refresh is on and today's
       wallpaper has not been fetched yet (the recorded date is stale). */
    if (bgBingRefresh && state.bgSource === 'bing' &&
        (!state.bgBingUrl || (state.bgBingAutoRefresh && state.bingLastRefreshDate !== todayStr()))) {
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

    /* Collapsible setting categories */
    settingCategories = panel.querySelectorAll('.setting-category[data-group]');

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

    /* Image mode dropdown (single / slide / schedule) */
    bgImageModeWrapper = document.getElementById('bg-image-mode-wrapper');
    bgImageModeTrigger = document.getElementById('bg-image-mode-trigger');
    bgImageModeDropdown = document.getElementById('bg-image-mode-dropdown');
    bgImageModeLabel = document.getElementById('bg-image-mode-label');
    bgImageModeSelect = document.getElementById('bg-image-mode-select');

    /* Schedule controls */
    bgScheduleSummary = document.getElementById('bg-schedule-summary');
    bgScheduleListBtn = document.getElementById('bg-schedule-list-btn');
    bgScheduleOptions = document.getElementById('bg-schedule-options');
    scheduleListDialog = document.getElementById('schedule-list-dialog');
    scheduleListClose = document.getElementById('schedule-list-close');
    bgScheduleRows = document.getElementById('bg-schedule-rows');
    bgScheduleCount = document.getElementById('bg-schedule-count');
    bgScheduleAddInput = document.getElementById('bg-schedule-add-input');

    /* Slideshow controls (inside the image sub-panel) */
    bgSlideAddInput = document.getElementById('bg-slide-add-input');
    bgSlideDirInput = document.getElementById('bg-slide-dir-input');
    bgSlideThumbs = document.getElementById('bg-slide-thumbs');
    bgSlideIntervalInput = document.getElementById('bg-slide-interval-select');
    bgSlideIntervalWrapper = document.getElementById('bg-slide-interval-wrapper');
    bgSlideIntervalLabel = document.getElementById('bg-slide-interval-label');
    bgSlideIntervalTrigger = document.getElementById('bg-slide-interval-trigger');
    bgSlideIntervalDropdown = document.getElementById('bg-slide-interval-dropdown');
    bgSlideIntervalCustom = document.getElementById('bg-slide-interval-custom');
    bgSlideIntervalCustomInput = document.getElementById('bg-slide-interval-custom-input');
    bgSlideIntervalCustomApply = document.getElementById('bg-slide-interval-custom-apply');
    bgSlideRandomToggle = document.getElementById('bg-slide-random-toggle');
    bgSlideCount = document.getElementById('bg-slide-count');
    bgSlideOptions = document.getElementById('bg-slide-options');
    bgSlideClear = document.getElementById('bg-slide-clear');
    bgSlideListBtn = document.getElementById('bg-slide-list-btn');
    slideListDialog = document.getElementById('slide-list-dialog');
    slideListClose = document.getElementById('slide-list-close');
    bgSingleImage = document.getElementById('bg-single-image');

    /* Bing sub-panel */
    bgBingRefresh = document.getElementById('bg-bing-refresh');
    bgBingMeta = document.getElementById('bg-bing-meta');
    bgBingAutoRefreshToggle = document.getElementById('bg-bing-auto-refresh-toggle');

    /* Color sub-panel */
    bgColorSwatches = document.querySelectorAll('.bg-color-swatch[data-color]:not(.custom-swatch)');
    bgCustomColorTrigger = document.getElementById('bg-custom-color-trigger');
    bgColorHex = document.getElementById('bg-color-hex');

    /* Blur / Overlay */
    blurSlider = document.getElementById('bg-blur-slider');
    blurDisplay = document.getElementById('blur-value-display');
    opacitySlider = document.getElementById('overlay-opacity-slider');
    opacityDisplay = document.getElementById('opacity-value-display');

    /* Overlay color swatches (for mask) */
    overlayColorSwatches = document.querySelectorAll('.color-swatch[data-color]:not(.custom-swatch):not(.bg-color-swatch)');
    customColorTrigger = document.getElementById('custom-color-trigger');
    colorHexDisplay = document.getElementById('color-hex-display');

    /* Custom engine select */
    engineSelectWrapper = document.getElementById('engine-select-wrapper');
    engineSelectTrigger = document.getElementById('engine-select-trigger');
    engineSelectDropdown = document.getElementById('engine-select-dropdown');
    engineSelectLabel = document.getElementById('engine-select-label');
    engineSelectNative = document.getElementById('engine-select');

    /* Custom engine config (URL template + suggestion provider) */
    customEngineConfig = document.getElementById('custom-engine-config');
    customEngineUrlInput = document.getElementById('custom-engine-url');
    customEngineSaveBtn = document.getElementById('custom-engine-save');
    customEngineSaveStatus = document.getElementById('custom-engine-save-status');
    customSuggestWrapper = document.getElementById('custom-engine-suggest-wrapper');
    customSuggestTrigger = document.getElementById('custom-engine-suggest-trigger');
    customSuggestDropdown = document.getElementById('custom-engine-suggest-dropdown');
    customSuggestLabel = document.getElementById('custom-engine-suggest-label');
    customSuggestNative = document.getElementById('custom-engine-suggest');
    customSuggestToggle = document.getElementById('custom-suggest-toggle');
    customSuggestConfig = document.getElementById('custom-suggest-config');

    /* Language select */
    languageSelectWrapper = document.getElementById('language-select-wrapper');
    languageSelectTrigger = document.getElementById('language-select-trigger');
    languageSelectDropdown = document.getElementById('language-select-dropdown');
    languageSelectLabel = document.getElementById('language-select-label');
    languageSelectNative = document.getElementById('language-select');

    /* Display */
    showClockToggle = document.getElementById('show-clock-toggle');
    showSecondsGroup = document.getElementById('show-seconds-group');
    showSecondsToggle = document.getElementById('show-seconds-toggle');
    showBookmarksToggle = document.getElementById('show-bookmarks-toggle');
    autoHideBookmarksToggle = document.getElementById('auto-hide-bookmarks-toggle');
    autoHideBookmarksGroup = document.getElementById('auto-hide-bookmarks-group');
    showContextMenuToggle = document.getElementById('show-context-menu-toggle');
    autoHideSettingsIconToggle = document.getElementById('auto-hide-settings-toggle');
    autoHideSettingsStrengthGroup = document.getElementById('auto-hide-strength-group');
    autoHideSettingsStrengthSlider = document.getElementById('auto-hide-strength-slider');
    autoHideSettingsStrengthDisplay = document.getElementById('auto-hide-strength-display');
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

  /* --- Language Selector --- */
  function updateLanguageLabel(val) {
    languageSelectLabel.textContent = val === 'auto' ? I18n.t('settings.lang.auto') : (LANG_ENDONYM[val] || val);
  }

  function updateLanguageDropdown(val) {
    languageSelectDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === val);
    });
  }

  async function setLocale(val) {
    if (val === 'auto') {
      localStorage.removeItem('unitab_locale');
      const detected = I18n.detectBrowserLocale() || I18n.getDefaultLocale();
      await I18n.loadMessages(detected);
    } else {
      localStorage.setItem('unitab_locale', val);
      await I18n.loadMessages(val);
    }
    document.documentElement.lang = I18n.getCurrentLocale().replace('_', '-');
    I18n.applyTranslations();
    refreshDynamicTranslations();
    languageSelectNative.value = val;
    updateLanguageLabel(val);
    updateLanguageDropdown(val);
  }

  function refreshDynamicTranslations() {
    /* The preview-action button reservation was measured for the previous
       locale's labels; let refreshAdvancedInfo() re-measure it. */
    previewButtonWidthsReserved = false;
    syncFormToState();
    refreshVideoInfo();
    refreshAdvancedInfo();
    updateLanguageLabel(languageSelectNative.value || 'auto');
    if (resetAllPhrase) resetAllPhrase.textContent = I18n.t('settings.advanced.danger.resetAll.phrase');
    /* Tab label widths change with locale (e.g. 高级 ↔ Advanced), which shifts
       each button's offsetLeft. The indicator was measured for the old widths,
       so re-measure it now that the translations are in the DOM. Reading the
       offset values forces a synchronous reflow, so this is accurate. */
    moveIndicator(getActiveTab());
  }

  function initLanguageSelector() {
    if (!languageSelectWrapper || !languageSelectTrigger) return;
    const saved = localStorage.getItem('unitab_locale');
    const val = saved && I18n.getSupportedLocales().includes(saved) ? saved : 'auto';
    languageSelectNative.value = val;
    updateLanguageLabel(val);
    updateLanguageDropdown(val);
    initCustomSelect(languageSelectWrapper, (v) => setLocale(v));
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
      titleEl.textContent = title || (ok ? I18n.t('dialog.export.success.title') : I18n.t('dialog.export.failed.title'));
      detailEl.textContent = detail || '';
      okBtn.textContent = okLabel || I18n.t('dialog.export.ok');
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
  function buildExportName(blob, source, url, preferredName) {
    if (source === 'video') {
      const raw = sanitizeFileName(state.bgVideoFileName || I18n.t('export.filename.video', ['mp4'])) || I18n.t('export.filename.video', ['mp4']);
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
      return I18n.t('export.filename.bing', [stamp, mimeExtension(blob, 'jpg')]);
    }

    /* preferredName: the current slide / schedule slot's own file name. */
    let raw = sanitizeFileName(preferredName || state.bgImageFileName || nameFromUrl(url) || I18n.t('export.filename.image', ['jpg']));
    if (!raw) raw = I18n.t('export.filename.image', ['jpg']);

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
    if (applySavedSettings(saved, true)) saveSettings();
    syncFormToState();
  }

  /* Merge a saved blob over DEFAULTS, clamp/normalize legacy values and run the
     migrations. Returns true when a migration changed the state. `persist` is
     false when re-applying another tab's write — echoing it back is pointless
     and could fight that tab's own batched save. */
  function applySavedSettings(saved, persist) {
    /* Keys missing from an older save fall back to DEFAULTS through the spread. */
    state = saved && typeof saved === 'object' ? { ...DEFAULTS, ...saved } : { ...DEFAULTS };

    /* The strength slider bottoms out at 5 %; clamp values saved by older builds. */
    state.settingsIconHideStrength = Math.min(100, Math.max(5, state.settingsIconHideStrength));

    /* Fold state is a plain key -> bool map; ignore anything else from old saves. */
    if (!state.foldedGroups || typeof state.foldedGroups !== 'object') {
      state.foldedGroups = {};
    }

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
    /* 图片模式迁移：旧版只有 bgSlideMode 布尔；新版是 bgImageMode，
       bgSlideMode 保留为派生镜像。 */
    if (state.bgImageMode !== 'single' && state.bgImageMode !== 'slide' && state.bgImageMode !== 'schedule') {
      state.bgImageMode = state.bgSlideMode ? 'slide' : 'single';
      migrated = true;
    }
    if (state.bgSlideMode !== (state.bgImageMode === 'slide')) {
      state.bgSlideMode = state.bgImageMode === 'slide';
      migrated = true;
    }
    return migrated;
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
      console.warn('UniTab: unable to save settings:', e.message);
    }
  }

  function cancelPendingSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    saveDirty = false;
  }

  /* --- Cross-tab sync ---
     Another tab writing the settings blob arrives as a storage event (writes
     never fire the event in the tab that made them). Adopt that state live:
     re-merge, re-render the panel and repaint the wallpaper — no reload, and no
     echo write back, since the writer's value is already the newest truth. */
  function onStorageSync(e) {
    /* This tab is mid-reset (it just wiped storage): the writes are ours. */
    if (isResetting) return;

    if (e.key === STORAGE_KEY) {
      let saved = null;
      try {
        saved = e.newValue ? JSON.parse(e.newValue) : null;
      } catch { return; }
      /* A pending local flush could overwrite the value we just adopted. */
      cancelPendingSave();
      applySavedSettings(saved, false);
      syncFormToState();
      applyAllToDom();
      /* Panels whose content is derived from storage render asynchronously. */
      if (state.bgSource === 'video') refreshVideoInfo();
      refreshSlideInfo();
      refreshScheduleInfo();
      applyBackground();
      return;
    }

    /* The language choice lives under its own key; mirror the other tab. */
    if (e.key === 'unitab_locale') {
      const val = e.newValue && I18n.getSupportedLocales().includes(e.newValue) ? e.newValue : 'auto';
      setLocale(val);
    }
  }

  /* Force a write now, even if nothing went through the batched saveSettings()
     path. External code that mutates the state object directly (the context
     menu's play/pause and sound toggles, the video playback synced back from
     Chrome's global media controls) calls this so the change actually lands. */
  function persist() {
    saveDirty = true;
    flushSettings();
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
    colorHexDisplay.textContent = state.overlayColor.toUpperCase();

    /* Bing auto-refresh toggle */
    updateBgBingAutoRefreshToggle(state.bgBingAutoRefresh);

    /* Engine select */
    engineSelectNative.value = state.engine;
    updateEngineLabel(state.engine);
    updateEngineDropdown(state.engine);
    setCustomEngineConfigVisible(state.engine === 'custom');
    syncCustomEngineConfig();
    updateCustomSuggestToggle();

    /* Show seconds toggle */
    updateShowClockToggle(state.showClock);
    setShowSecondsGroupVisible(state.showClock);
    updateShowSecondsToggle(state.showSeconds);

    /* Bookmarks bar toggle + its auto-hide sub-option (only meaningful while
       the dock itself is on). */
    updateShowBookmarksToggle(state.showBookmarks);
    updateAutoHideBookmarksToggle(state.autoHideBookmarks);
    setGroupHidden(autoHideBookmarksGroup, !state.showBookmarks);

    /* Right-click menu toggle */
    updateShowContextMenuToggle(state.showContextMenu);

    /* Auto-hide settings icon toggle */
    updateAutoHideSettingsIconToggle(state.autoHideSettingsIcon);
    setAutoHideStrengthGroupVisible(state.autoHideSettingsIcon);
    autoHideSettingsStrengthSlider.value = state.settingsIconHideStrength;
    autoHideSettingsStrengthDisplay.textContent = state.settingsIconHideStrength + '%';

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
    if (bgColorHex) bgColorHex.textContent = state.bgColor.toUpperCase();

    /* Sub-panel visibility */
    setPanelVisible('bing', state.bgSource === 'bing');
    setPanelVisible('image', state.bgSource === 'image');
    setPanelVisible('color', state.bgSource === 'color');
    setPanelVisible('video', state.bgSource === 'video');

    /* Image filename hint — distinguishes between uploaded base64
       and a user-entered URL, both stored independently under 'image'. */
    if (state.bgImageData || state.bgImageStored) {
      bgFileName.textContent = state.bgImageFileName || I18n.t('settings.bg.file.uploaded');
    } else if (state.bgImageUrl) {
      bgFileName.textContent = state.bgImageUrl.length > 40
        ? state.bgImageUrl.substring(0, 40) + '...' : state.bgImageUrl;
    } else {
      bgFileName.textContent = I18n.t('settings.bg.file.noFile');
    }
    setBingMeta(state.bgBingCopyright || '');

    /* Image mode dropdown + sub-panels (single / slide / schedule). Only the
       active mode's block is shown; the others' data is kept untouched. */
    updateImageModeLabel(state.bgImageMode);
    updateSlideRandomToggle(state.bgSlideRandom);
    updateSlideIntervalLabel(state.bgSlideInterval || 0);
    if (bgSingleImage) setGroupHidden(bgSingleImage, state.bgImageMode !== 'single');
    if (bgSlideOptions) setGroupHidden(bgSlideOptions, state.bgImageMode !== 'slide');
    if (bgScheduleOptions) setGroupHidden(bgScheduleOptions, state.bgImageMode !== 'schedule');
    refreshScheduleSummary();

    /* Video settings */
    updateVideoSoundToggle(state.bgVideoSoundOn);
    setGroupHidden(videoVolumeWrapper, !state.bgVideoSoundOn);
    if (videoVolumeSlider) videoVolumeSlider.value = state.bgVideoVolume;
    if (videoVolumeDisplay) videoVolumeDisplay.textContent = state.bgVideoVolume + '%';
    updateVideoLoopToggle(state.bgVideoLoop);
    setGroupHidden(videoOnEndedWrapper, state.bgVideoLoop);
    if (videoOnEndedNative) videoOnEndedNative.value = state.bgVideoOnEnded;
    updateVideoOnEndedLabel(state.bgVideoOnEnded);
    updateVideoOnEndedDropdown(state.bgVideoOnEnded);

    /* Collapsible categories — re-apply on language change too (same DOM). */
    applyAllCategoryFolds();
  }

  /* What is stored in IndexedDB, as far as the video sub-panel shows it (file
     label). Looked up when the panel is opened or the source switched to video,
     not on every new tab: the blob survives source switches, but nothing here is
     visible until the panel is. */
  function refreshVideoInfo() {
    Background.loadVideoBlob().then((blob) => {
      if (blob) {
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        const name = state.bgVideoFileName || I18n.t('settings.bg.video.noFile');
        bgVideoName.textContent = `${name}（${sizeMB}MB）`;
      } else {
        bgVideoName.textContent = I18n.t('settings.bg.file.noFile');
      }
    }).catch(() => {
      bgVideoName.textContent = I18n.t('settings.bg.file.noFile');
    });
  }

  /* --- Slideshow info ---
     Blob URLs created for thumbnails; revoked before re-render so scrolling a
     large slideshow does not leak object URLs. */
  let slideThumbUrls = [];

  function revokeSlideThumbs() {
    slideThumbUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* gone */ } });
    slideThumbUrls = [];
  }

  /* --- Time-scheduled wallpapers ---
     Time input <-> minutes since midnight, plus the row renderer and the
     one-line summary shown in the main panel. */
  function minutesToTimeInput(min) {
    const m = Math.min(1439, Math.max(0, min | 0));
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  function timeInputToMinutes(value) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /* A slot's end may be the end of day (1440), displayed as 24:00. */
  function formatSlotEnd(end) {
    return end >= 1440 ? '24:00' : minutesToTimeInput(end);
  }

  /* End of a slot = the next slot's start (the last slot runs to midnight). */
  function scheduleSlotRange(items, index) {
    const start = items[index].start;
    const end = index + 1 < items.length ? items[index + 1].start : 1440;
    return { start, end };
  }

  async function refreshScheduleSummary() {
    if (!bgScheduleSummary) return;
    const active = await Background.activeScheduleEntry();
    if (!active) {
      bgScheduleSummary.textContent = I18n.t('settings.bg.schedule.empty');
      return;
    }
    const sched = await Background.loadSchedule();
    const range = scheduleSlotRange(sched.items, active.index);
    bgScheduleSummary.textContent = I18n.t('settings.bg.schedule.current', [
      minutesToTimeInput(range.start),
      formatSlotEnd(range.end),
      active.item.name || '',
    ]);
  }

  let scheduleThumbUrls = [];
  function revokeScheduleThumbs() {
    scheduleThumbUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* gone */ } });
    scheduleThumbUrls = [];
  }

  async function refreshScheduleInfo() {
    if (!bgScheduleRows) return;
    const sched = await Background.loadSchedule();
    const n = sched.items.length;
    revokeScheduleThumbs();
    bgScheduleRows.textContent = '';
    if (!n) {
      if (bgScheduleCount) bgScheduleCount.textContent = I18n.t('settings.bg.schedule.empty');
      return;
    }
    if (bgScheduleCount) {
      bgScheduleCount.textContent = I18n.t('settings.bg.schedule.slotCount', [String(n)]);
    }
    const active = await Background.activeScheduleEntry();
    sched.items.forEach((item, i) => {
      const range = scheduleSlotRange(sched.items, i);
      const row = document.createElement('div');
      row.className = 'bg-slide-item' + (active && active.index === i ? ' is-current' : '');
      row.dataset.slotId = item.id;

      const time = document.createElement('input');
      time.type = 'time';
      time.className = 'setting-input bg-schedule-time';
      time.value = minutesToTimeInput(item.start);
      time.dataset.slotTime = item.id;
      time.setAttribute('aria-label', I18n.t('settings.bg.schedule.slotTime'));
      row.appendChild(time);

      const img = document.createElement('img');
      img.className = 'bg-slide-item-thumb';
      img.alt = item.name || `slot-${i + 1}`;
      const url = URL.createObjectURL(item.blob);
      scheduleThumbUrls.push(url);
      img.src = url;
      img.loading = 'lazy';
      row.appendChild(img);

      const name = document.createElement('span');
      name.className = 'bg-slide-item-name';
      name.textContent = item.name || `slot-${i + 1}`;
      name.title = `${item.name || `slot-${i + 1}`}  ${minutesToTimeInput(range.start)} – ${formatSlotEnd(range.end)}`;
      row.appendChild(name);

      const rm = document.createElement('button');
      rm.className = 'bg-slide-item-remove';
      rm.type = 'button';
      rm.dataset.slotRemove = item.id;
      rm.setAttribute('aria-label', I18n.t('settings.bg.schedule.remove', [minutesToTimeInput(item.start)]));
      rm.textContent = '×';
      row.appendChild(rm);

      bgScheduleRows.appendChild(row);
    });
  }

  async function refreshSlideInfo() {
    if (!bgSlideThumbs) return;
    const slides = await Background.loadSlides();
    const n = slides.items.length;
    if (!n) {
      revokeSlideThumbs();
      bgSlideThumbs.textContent = '';
      if (bgSlideCount) bgSlideCount.textContent = I18n.t('settings.bg.slide.none');
      return;
    }
    if (bgSlideCount) {
      const label = I18n.t('settings.bg.slide.count', [String(n)]);
      const pos = I18n.t('settings.bg.slide.position', [String(slides.index + 1), String(n)]);
      bgSlideCount.textContent = `${label} · ${pos}`;
    }

    /* Selection-only change: the rows already exist and their blobs are decoded,
       so just move the highlight instead of rebuilding (rebuilding re-creates the
       object URLs, which re-decodes every thumb and makes the grid flicker). */
    const existingRows = bgSlideThumbs.querySelectorAll('[data-slide-index]');
    const sameList = existingRows.length === n && slides.items.every((s, i) => {
      const row = existingRows[i];
      return row && row.dataset.slideIndex === String(i);
    });
    if (sameList) {
      existingRows.forEach((row, i) => {
        row.classList.toggle('is-current', i === slides.index);
      });
      return;
    }

    revokeSlideThumbs();
    bgSlideThumbs.textContent = '';
    /* List rows: thumbnail + file name + remove button. Each thumb is a small
       canvas copy — decoding a full wallpaper twice per row would be wasteful. */
    slides.items.forEach((slide, i) => {
      const row = document.createElement('div');
      row.className = 'bg-slide-item' + (i === slides.index ? ' is-current' : '');
      row.dataset.slideIndex = String(i);
      const img = document.createElement('img');
      img.className = 'bg-slide-item-thumb';
      img.alt = slide.name || `slide-${i + 1}`;
      const url = URL.createObjectURL(slide.blob);
      slideThumbUrls.push(url);
      img.src = url;
      img.loading = 'lazy';
      row.appendChild(img);
      const name = document.createElement('span');
      name.className = 'bg-slide-item-name';
      name.textContent = slide.name || `slide-${i + 1}`;
      name.title = slide.name || `slide-${i + 1}`;
      row.appendChild(name);
      const rm = document.createElement('button');
      rm.className = 'bg-slide-item-remove';
      rm.type = 'button';
      rm.setAttribute('aria-label', I18n.t('settings.bg.slide.remove', [String(i + 1)]));
      rm.dataset.slideRemove = String(i);
      rm.textContent = '×';
      row.appendChild(rm);
      bgSlideThumbs.appendChild(row);
    });
  }

  /* --- Apply to DOM --- */

  /* The matte style: bright wallpapers need a denser tint to keep white copy readable;
     dark scenes can stay clearer. Threshold is relative luminance (0.16 sits between a
     dim scene and a bright sky). Keep in sync with boot.js, which does the same for the
     very first frame. (The liquid style measures the wallpaper itself.) */
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
      case 'showClock':
        if (typeof Clock !== 'undefined') {
          Clock.setShowClock(value);
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
        syncDockAutoHide(); /* the dock being off also disarms auto-hide */
        break;
      case 'autoHideBookmarks':
        syncDockAutoHide();
        break;
      case 'autoHideSettingsIcon':
        root.dataset.hideSettingsIcon = value ? 'true' : 'false';
        gearRect = null;
        if (value) {
          scheduleGearOpacity();
        } else if (toggle) {
          toggle.style.opacity = '';
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
    applyToDom('showClock', state.showClock);
    applyToDom('showSeconds', state.showSeconds);
    applyToDom('showBookmarks', state.showBookmarks);
    applyToDom('autoHideBookmarks', state.autoHideBookmarks);
    applyToDom('showContextMenu', state.showContextMenu);
    applyToDom('autoHideSettingsIcon', state.autoHideSettingsIcon);
    applyToDom('showCursorEffect', state.showCursorEffect);
    applyToDom('cursorEffectStyle', state.cursorEffectStyle);
    applyToDom('glassStyle', state.glassStyle);
    applyToDom('glassRadius', state.glassRadius);
  }

  /* The saved custom image, in the shape Background.load() expects. In slide
     mode the wallpaper is the current slide (background.js reads KEY_SLIDES);
     otherwise it is the single uploaded Blob or an image URL. */
  function customImageOpts() {
    if (state.bgImageMode === 'slide') return { slideMode: true };
    if (state.bgImageMode === 'schedule') return { scheduleMode: true };
    return {
      imageStored: !!state.bgImageStored,
      imageData: state.bgImageData || state.bgImageUrl
    };
  }

  function getVideoEndCallback() {
    const behavior = state.bgVideoOnEnded;
    if (behavior === 'customimage') {
      return () => {
        if (state.bgImageMode !== 'single' || state.bgImageStored || state.bgImageData || state.bgImageUrl) {
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
              state.bgBingCopyrightLink = res.copyrightlink || '';
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
      restartSlideTimer();
      return;
    }
    if (state.bgSource === 'image') {
      bgLoad({ source: 'image', ...customImageOpts(), color: state.bgColor });
      restartSlideTimer();
      restartScheduleTimer();
      return;
    }
    bgLoad({
      source: state.bgSource,
      imageData: state.bgBingUrl,
      color: state.bgColor
    });
    restartSlideTimer();
    restartScheduleTimer();
  }

  /* --- Slideshow timer ---
     Rotates the slideshow while its tab stays open. The "every new tab" mode
     (interval 0) advances once per page load in boot.js, before first paint.
     Not a chrome.alarms job: the rotation must be visible in the open tab. */
  let slideTimer = null;

  function restartSlideTimer() {
    if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
    if (state.bgSource !== 'image' || !state.bgSlideMode) return;
    const minutes = parseFloat(state.bgSlideInterval);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    slideTimer = setInterval(async () => {
      if (!state.bgSlideMode || state.bgSource !== 'image') return;
      if (state.bgSlideRandom) {
        const slides = await Background.loadSlides();
        if (slides.items.length < 2) return;
        let next;
        do {
          next = Math.floor(Math.random() * slides.items.length);
        } while (next === slides.index);
        await Background.gotoSlide(next);
      } else {
        await Background.advanceSlide(1);
      }
      /* gotoSlide/advanceSlide already promoted this slide's own preview into
         the shared slot (applySlidePreview). Calling pickPreview here would
         invalidate that fresh slot and regenerate it from scratch, killing the
         fade — so just repaint from the slide that is now current. */
      applyBackground();
    }, minutes * 60 * 1000);
  }

  /* --- Time-scheduled wallpapers timer ---
     While the tab stays open, wake up exactly when the next slot starts and
     repaint. The delay is recomputed from the schedule on every call, so an
     edited list (new slot, changed time) reschedules correctly. */
  let scheduleTimer = null;

  function restartScheduleTimer() {
    if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
    if (state.bgSource !== 'image' || state.bgImageMode !== 'schedule') return;
    /* Warm the previews of any newly added entries in the background. */
    if (Background.ensureSchedulePreviews) Background.ensureSchedulePreviews();
    (async () => {
      const sched = await Background.loadSchedule();
      if (!sched.items.length) return;
      const now = new Date();
      const nowMs = now.getTime();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      let next = Infinity;
      for (const it of sched.items) {
        const at = midnight + it.start * 60000;
        if (at > nowMs && at < next) next = at;
      }
      if (!Number.isFinite(next)) {
        /* All starts have passed today: the next boundary is tomorrow's first. */
        next = midnight + 86400000 + sched.items[0].start * 60000;
      }
      const delay = Math.max(1000, next - nowMs + 500);
      scheduleTimer = setTimeout(() => {
        scheduleTimer = null;
        if (state.bgImageMode !== 'schedule') return;
        applyBackground(); /* repaint for the new slot; reschedules itself */
        refreshScheduleSummary();
      }, delay);
    })().catch(() => {});
  }

  /* --- Sub-panel visibility --- */

  /* Show/hide a settings sub-option with a fade. The [hidden] attribute is
     instant, so on the way out we hold the element in the layout for the fade
     (opacity 0) before setting it, and on the way in we reveal from opacity 0.
     The `hidden` flag is kept in sync so callers can keep reading it. */
  /* Hide / reveal a settings sub-option (.setting-fade) or a collapsible
     category body. The visible behaviour is the same in both directions: the
     element fades out / in while the panel height morphs around it.
     On the way OUT the element must stop occupying layout space at the same
     time it fades, so the panel height shrinks in parallel instead of
     snapping closed once the fade finishes (that snap was the jarring
     "text fades, then the page resizes" the user reported). For .setting-fade
     elements the collapse is done with a precise inline max-height (and
     margin-bottom) transitioned to 0, so the panel follows smoothly. The
     `hidden` flag is still set at the end so callers can keep reading it. */
  function setGroupHidden(el, hide) {
    if (!el) return;
    /* Category bodies collapse the same way as .setting-fade elements: opacity
       fades while an inline max-height shrinks in parallel, so the content never
       sits as a blank block before the fold closes. */
    const isFade = el.classList.contains('setting-fade') ||
      el.classList.contains('setting-category-body');
    if (hide) {
      if (el.hidden) return;
      clearTimeout(el.__fadeTimer);
      if (isFade) {
        /* Lock the exact current height (and margin) so the collapse starts
           immediately from a real value, then shrink to nothing. */
        const cs = getComputedStyle(el);
        el.style.maxHeight = el.offsetHeight + 'px';
        el.style.marginBottom = cs.marginBottom;
        el.classList.add('setting-fade-hiding');
        void el.offsetHeight; /* commit the start values */
        el.style.maxHeight = '0px';
        el.style.marginBottom = '0px';
      } else {
        el.classList.add('setting-fade-hiding');
      }
      el.__fadeTimer = setTimeout(() => {
        el.hidden = true;
        el.style.maxHeight = '';
        el.style.marginBottom = '';
        el.classList.remove('setting-fade-hiding');
        el.__fadeTimer = null;
      }, 300);
    } else {
      if (!el.hidden) return;
      clearTimeout(el.__fadeTimer);
      el.__fadeTimer = null;
      el.hidden = false;
      /* Release any inline collapse values so the element can grow again. */
      el.style.maxHeight = '';
      el.style.marginBottom = '';
      el.classList.add('setting-fade-reveal');
      void el.offsetWidth; /* force reflow so the fade-in starts from opacity 0 */
      el.classList.remove('setting-fade-reveal');
    }
  }

  /* --- Collapsible setting categories ---
     Each `.setting-category[data-group]` wraps a header button and a body. Folding
     is persisted per group key in `state.foldedGroups` so a user's preferred
     layout survives reloads. The body fades out/in (same fade contract as
     .setting-fade) while the panel height morphs around it. */
  function categoryBodyOf(category) {
    return category.querySelector('.setting-category-body');
  }

  function applyCategoryFold(category, folded, animate) {
    const header = category.querySelector('.setting-category-header');
    const body = categoryBodyOf(category);
    if (header) header.setAttribute('aria-expanded', folded ? 'false' : 'true');
    if (!body) return;
    if (!animate) {
      clearTimeout(body.__fadeTimer);
      body.hidden = folded;
      body.classList.remove('setting-fade-hiding', 'setting-fade-reveal');
      return;
    }
    setGroupHidden(body, folded);
  }

  function applyAllCategoryFolds() {
    if (!settingCategories) return;
    settingCategories.forEach(cat => {
      applyCategoryFold(cat, !!state.foldedGroups[cat.dataset.group], false);
    });
  }

  function toggleCategory(category) {
    const key = category.dataset.group;
    if (!key) return;
    const folded = !state.foldedGroups[key];
    state.foldedGroups[key] = folded;
    saveSettings();
    morphPanel(() => applyCategoryFold(category, folded, true));
  }

  function setPanelVisible(name, visible) {
    const map = { bing: bgBingPanel, image: bgImagePanel, color: bgColorPanel, video: bgVideoPanel };
    const el = map[name];
    if (!el) return;
    setGroupHidden(el, !visible);
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
    const key = ENGINE_LABEL_KEY[engineKey];
    engineSelectLabel.textContent = key ? I18n.t(key) : engineKey;
  }

  function updateEngineDropdown(engineKey) {
    engineSelectDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === engineKey);
    });
  }

  /* --- Custom engine config --- */
  function setCustomEngineConfigVisible(visible) {
    setGroupHidden(customEngineConfig, !visible);
  }

  /* The custom suggestions API toggle: off by default for preset engines (they
     keep their native API); for the custom engine it is forced on (disabled),
     since the custom engine has no native suggestion API of its own. The
     provider picker shows whenever the toggle is effectively on. */
  function updateCustomSuggestToggle() {
    if (!customSuggestToggle) return;
    const forced = state.engine === 'custom';
    const effective = !!state.useCustomSuggest || forced;
    customSuggestToggle.classList.toggle('on', effective);
    customSuggestToggle.setAttribute('aria-checked', effective ? 'true' : 'false');
    customSuggestToggle.setAttribute('aria-disabled', forced ? 'true' : 'false');
    setGroupHidden(customSuggestConfig, !effective);
  }

  function customSuggestProvider() {
    const v = localStorage.getItem(CUSTOM_SUGGEST_KEY);
    return (v === 'google' || v === 'baidu') ? v : 'bing';
  }

  function updateCustomSuggestLabel(provider) {
    if (!customSuggestLabel) return;
    const key = provider === 'google'
      ? 'settings.search.engine.google'
      : provider === 'baidu'
        ? 'settings.search.engine.baidu'
        : 'settings.search.engine.bing';
    customSuggestLabel.textContent = I18n.t(key);
  }

  function updateCustomSuggestDropdown(provider) {
    if (!customSuggestDropdown) return;
    customSuggestDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === provider);
    });
  }

  /* The template must contain the {{query}} placeholder and produce a real
     http(s) URL once it is substituted. */
  /* A blank field, or one holding only the bare scheme, counts as "no custom URL"
     (the search then falls back to the default engine). */
  function isEmptyCustomUrl(template) {
    const t = (template || '').trim();
    return t === '' || t === 'https://' || t === 'http://';
  }

  /* An empty template is allowed: it means "no custom URL", so the search falls
     back to the default engine. A non-empty template must contain the {{query}}
     placeholder and produce a real http(s) URL once it is substituted. */
  function isValidCustomEngineUrl(template) {
    const t = (template || '').trim();
    if (isEmptyCustomUrl(t)) return true;
    if (!t.includes('{{query}}')) return false;
    try {
      const u = new URL(t.replace('{{query}}', 'test'));
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function validateCustomEngineUrl() {
    if (!customEngineUrlInput) return;
    const ok = isValidCustomEngineUrl(customEngineUrlInput.value.trim());
    customEngineUrlInput.setAttribute('aria-invalid', ok ? 'false' : 'true');
  }

  /* Default the scheme to https://: if the user typed a URL without an explicit
     http(s) scheme, prepend https:// so "example.com/s?q={{query}}" is usable. */
  function normalizeCustomEngineUrl(raw) {
    let v = (raw || '').trim();
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }

  let customSaveTimer = 0;

  function showCustomSaveStatus(text, ok) {
    if (!customEngineSaveStatus) return;
    customEngineSaveStatus.textContent = text;
    customEngineSaveStatus.classList.toggle('saved', ok !== false);
    customEngineSaveStatus.classList.toggle('error', ok === false);
    clearTimeout(customSaveTimer);
    customSaveTimer = setTimeout(() => {
      if (customEngineSaveStatus) customEngineSaveStatus.textContent = '';
    }, 1600);
  }

  /* Manual save: normalize the scheme, validate, and persist only when valid. */
  function saveCustomEngineUrl() {
    if (!customEngineUrlInput) return false;
    const url = normalizeCustomEngineUrl(customEngineUrlInput.value);
    if (url !== customEngineUrlInput.value) customEngineUrlInput.value = url;
    validateCustomEngineUrl();
    const ok = isValidCustomEngineUrl(url);
    if (ok) {
      /* A bare scheme (https://) means "no custom URL" -> store empty. */
      localStorage.setItem(CUSTOM_URL_KEY, isEmptyCustomUrl(url) ? '' : url);
      showCustomSaveStatus(I18n.t('settings.search.custom.saved'), true);
    } else {
      showCustomSaveStatus(I18n.t('settings.search.custom.invalid'), false);
    }
    return ok;
  }

  /* Populate the URL input and suggestion provider from localStorage, then mark
     the config visible only when the custom engine is the active one. */
  function syncCustomEngineConfig() {
    if (!customEngineUrlInput) return;
    if (customEngineSaveStatus) customEngineSaveStatus.textContent = '';
    const stored = localStorage.getItem(CUSTOM_URL_KEY) || '';
    /* An empty saved URL shows the bare https:// scheme as the starting point,
       so the user only has to type the host + {{query}} part. */
    const display = isEmptyCustomUrl(stored) ? 'https://' : stored;
    if (customEngineUrlInput.value !== display) customEngineUrlInput.value = display;
    const provider = customSuggestProvider();
    if (customSuggestNative) customSuggestNative.value = provider;
    updateCustomSuggestLabel(provider);
    updateCustomSuggestDropdown(provider);
    validateCustomEngineUrl();
  }

  function updateShowClockToggle(on) {
    if (!showClockToggle) return;
    showClockToggle.classList.toggle('on', !!on);
    showClockToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function setShowSecondsGroupVisible(visible) {
    setGroupHidden(showSecondsGroup, !visible);
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

  function updateAutoHideBookmarksToggle(on) {
    if (!autoHideBookmarksToggle) return;
    autoHideBookmarksToggle.classList.toggle('on', !!on);
    autoHideBookmarksToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  /* Dock auto-hide requires BOTH switches: the dock itself and the auto-hide
     option. The html attribute drives the CSS slide; Bookmarks.setAutoHide
     arms the bottom hot-zone that summons the dock. */
  function syncDockAutoHide() {
    const on = !!state.showBookmarks && !!state.autoHideBookmarks;
    document.documentElement.dataset.dockAutohide = on ? 'true' : 'false';
    if (typeof Bookmarks !== 'undefined' && Bookmarks.setAutoHide) {
      Bookmarks.setAutoHide(on);
    }
  }

  /* Right-click menu switch. The menu reads the state on demand, so this only
     mirrors it onto the switch itself. */
  function updateShowContextMenuToggle(on) {
    if (!showContextMenuToggle) return;
    showContextMenuToggle.classList.toggle('on', !!on);
    showContextMenuToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateAutoHideSettingsIconToggle(on) {
    if (!autoHideSettingsIconToggle) return;
    autoHideSettingsIconToggle.classList.toggle('on', !!on);
    autoHideSettingsIconToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateGearOpacity() {
    gearRafId = 0;
    if (!toggle) return;
    /* Touch screens have no pointer to follow; the CSS keeps the gear visible. */
    if (!state.autoHideSettingsIcon || window.matchMedia('(hover: none)').matches) {
      toggle.style.opacity = '1';
      return;
    }
    if (!gearRect) gearRect = toggle.getBoundingClientRect();
    const cx = gearRect.left + gearRect.width / 2;
    const cy = gearRect.top + gearRect.height / 2;
    /* Lower strength = larger reveal zone (the gear pops back in from farther
       away). The slider bottoms out at 5 %, so the gear always fades a little;
       100 limits the zone to the button itself. */
    const strength = Math.min(100, Math.max(5, state.settingsIconHideStrength));
    const outer = GEAR_FADE_IN_PX + (1 - strength / 100) * (GEAR_FADE_OUT_MAX_PX - GEAR_FADE_IN_PX);
    const d = Math.hypot(pointerX - cx, pointerY - cy);
    const t = Math.min(1, Math.max(0, (d - GEAR_FADE_IN_PX) / (outer - GEAR_FADE_IN_PX)));
    const eased = t * t * (3 - 2 * t);
    toggle.style.opacity = String(1 - eased);
  }

  function scheduleGearOpacity() {
    if (!gearRafId) gearRafId = requestAnimationFrame(updateGearOpacity);
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

  function updateBgBingAutoRefreshToggle(on) {
    if (!bgBingAutoRefreshToggle) return;
    bgBingAutoRefreshToggle.classList.toggle('on', !!on);
    bgBingAutoRefreshToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  /* Image mode dropdown mirrors the custom-select pattern used elsewhere:
     label text + "selected" highlight per option. */
  const IMAGE_MODE_KEY = {
    single: 'settings.bg.mode.single',
    slide: 'settings.bg.mode.slide',
    schedule: 'settings.bg.mode.schedule',
  };

  function updateImageModeLabel(mode) {
    const key = IMAGE_MODE_KEY[mode] || IMAGE_MODE_KEY.single;
    if (bgImageModeLabel) bgImageModeLabel.textContent = I18n.t(key);
    if (bgImageModeSelect) bgImageModeSelect.value = mode;
    if (bgImageModeWrapper) {
      bgImageModeWrapper.querySelectorAll('.custom-select-option').forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.value === mode);
      });
    }
  }

  function updateSlideRandomToggle(on) {
    if (!bgSlideRandomToggle) return;
    bgSlideRandomToggle.classList.toggle('on', !!on);
    bgSlideRandomToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function updateCursorStyleLabel(styleKey) {
    const key = CURSOR_STYLE_LABEL_KEY[styleKey];
    cursorStyleLabel.textContent = key ? I18n.t(key) : styleKey;
  }

  function updateCursorStyleDropdown(styleKey) {
    cursorStyleDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === styleKey);
    });
  }

  function setCursorStyleGroupVisible(visible) {
    setGroupHidden(cursorStyleGroup, !visible);
  }

  function setAutoHideStrengthGroupVisible(visible) {
    setGroupHidden(autoHideSettingsStrengthGroup, !visible);
  }

  function updateGlassStyleLabel(styleKey) {
    const key = GLASS_STYLE_LABEL_KEY[styleKey];
    glassStyleLabel.textContent = key ? I18n.t(key) : styleKey;
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
    const key = VIDEO_ONENDED_LABEL_KEY[val];
    videoOnEndedLabel.textContent = key ? I18n.t(key) : val;
  }

  function updateVideoOnEndedDropdown(val) {
    videoOnEndedDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === val);
    });
  }

  /* Slideshow interval label mirrors the custom-select pattern used by the
     video on-ended control: a key per value plus a "selected" highlight. */
  const SLIDE_INTERVAL_KEY = {
    0: 'settings.bg.slide.interval.newtab',
    0.1: 'settings.bg.slide.interval.6s',
    0.25: 'settings.bg.slide.interval.15s',
    0.5: 'settings.bg.slide.interval.30s',
    1: 'settings.bg.slide.interval.1min',
    5: 'settings.bg.slide.interval.5min'
  };

  function updateSlideIntervalLabel(val) {
    if (!bgSlideIntervalLabel) return;
    const key = SLIDE_INTERVAL_KEY[val];
    bgSlideIntervalLabel.textContent = key ? I18n.t(key) : formatSlideMinutes(val);
    if (bgSlideIntervalWrapper) {
      bgSlideIntervalWrapper.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.classList.toggle('selected', String(opt.dataset.value) === String(val));
      });
    }
  }

  /* Human label for an arbitrary custom interval (minutes). Sub-minute shows
     seconds; otherwise minutes with a unit suffix. */
  function formatSlideMinutes(val) {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return '';
    if (n < 1) {
      const secs = Math.round(n * 60);
      return secs + ' ' + I18n.t('settings.bg.slide.interval.secondsUnit');
    }
    return n + ' ' + I18n.t('settings.bg.slide.interval.minutesUnit');
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
    });
    moveIndicator(tabName);
    if (tabName === 'advanced') refreshAdvancedInfo();
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
    /* Measure the settled height. A sub-option that is collapsing right now
       (`.setting-fade-hiding`) still occupies layout while its max-height
       transition runs, which would inflate `to` and make the panel grow past
       its final size before snapping back ("switching the wallpaper source
       makes the panel jump long then recover"). Temporarily drop those
       elements out of layout so `to` is the true settled height, then restore
       them so their fade-out animation still plays. All in one synchronous
       tick, so the browser never paints the intermediate state. */
    const collapsing = [...panel.querySelectorAll('.setting-fade-hiding')];
    const wasHidden = collapsing.map((el) => { const h = el.hidden; el.hidden = true; return h; });
    const to = panel.offsetHeight;        /* natural height after the change */
    collapsing.forEach((el, i) => { el.hidden = wasHidden[i]; });
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

    /* Keyboard focus containment: Tab / Shift+Tab wrap at the panel's edges so
       focus cannot escape to the page behind the dialog. */
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !panel.classList.contains('open')) return;
      const focusables = panelFocusables();
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    });

    /* Collapsible setting categories: click the header to fold/unfold. */
    settingCategories.forEach(cat => {
      const header = cat.querySelector('.setting-category-header');
      if (!header) return;
      header.addEventListener('click', () => toggleCategory(cat));
      header.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggleCategory(cat);
        }
      });
    });
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
    bgBingRefresh.addEventListener('click', () => { refreshBingWallpaper(); });

    /* --- Bing auto-refresh toggle --- */
    if (bgBingAutoRefreshToggle) {
      bgBingAutoRefreshToggle.addEventListener('click', () => {
        const turningOn = !state.bgBingAutoRefresh;
        state.bgBingAutoRefresh = turningOn;
        updateBgBingAutoRefreshToggle(state.bgBingAutoRefresh);
        saveSettings();
        /* Turning it on checks the recorded date right away: if today's wallpaper
           has not been fetched yet, refresh now instead of waiting for next load. */
        if (turningOn && state.bgSource === 'bing' && bgBingRefresh &&
            !bgBingRefresh.disabled && state.bingLastRefreshDate !== todayStr()) {
          bgBingRefresh.click();
        }
      });
      bgBingAutoRefreshToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          bgBingAutoRefreshToggle.click();
        }
      });
    }

    /* --- Image upload --- */
    bgFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        bgFileName.textContent = I18n.t('settings.bg.file.selectImage');
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
          bgFileName.textContent = I18n.t('settings.bg.file.loadFailed');
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
        showUrlError(I18n.t('settings.bg.url.error.empty'));
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

    /* --- Image mode (custom image source) ---
       single / slide / schedule share the 'image' wallpaper source; only the
       active mode's controls are shown and only it drives the wallpaper. */

    /* Slideshow list opens as an independent dialog layered above the settings
       panel (same .confirm-dialog pattern as the confirm/export dialogs), so the
       grid and its add/folder/clear actions float over everything else. */
    function setSlideView(view) {
      if (!slideListDialog) return;
      const open = view === 'list';
      slideListDialog.hidden = !open;
      if (open) refreshSlideInfo();
    }

    function openSlideList() { setSlideView('list'); }
    function closeSlideList() { setSlideView('main'); }

    /* Schedule editor: same second-level dialog pattern as the slideshow list. */
    function openScheduleList() {
      if (!scheduleListDialog) return;
      scheduleListDialog.hidden = false;
      refreshScheduleInfo();
    }
    function closeScheduleList() {
      if (scheduleListDialog) scheduleListDialog.hidden = true;
    }

    let imageModeBusy = false;
    async function setImageMode(mode) {
      const next = (mode === 'slide' || mode === 'schedule') ? mode : 'single';
      if (imageModeBusy) return;
      imageModeBusy = true;
      try {
        state.bgImageMode = next;
        state.bgSlideMode = next === 'slide'; /* keep the derived mirror in sync */
        if (next === 'slide') {
          /* Seed the list with the current single image (if any). The single-image
             slot is kept intact — switching back still falls back to it. */
          await Background.migrateSingleImageToSlides();
        }
        updateImageModeLabel(next);
        saveSettings();
        syncFormToState();
        morphPanel(() => {
          if (bgSingleImage) setGroupHidden(bgSingleImage, next !== 'single');
          if (bgSlideOptions) setGroupHidden(bgSlideOptions, next !== 'slide');
          if (bgScheduleOptions) setGroupHidden(bgScheduleOptions, next !== 'schedule');
        });
        applyBackground();
        if (next === 'slide') await refreshSlideInfo();
        else if (next === 'schedule') await refreshScheduleInfo();
        else closeScheduleList();
      } finally {
        imageModeBusy = false;
      }
    }

    /* Both multi-file and folder pickers funnel through one handler. The file
       list lives for the duration of the await only; it is drained into
       IndexedDB (blobs) before anything is displayed. */
    /* Duplicate-image guard: some of the incoming files already exist in the
       slideshow (matched by content hash). Ask before importing them again. */
    function showSlideDuplicateConfirm(dupes, total) {
      const msg = I18n.t('settings.bg.slide.duplicate.confirm', [String(dupes.length), String(total)]);
      return showConfirmDialog(msg);
    }

    async function ingestSlideFiles(fileList) {
      const files = Array.from(fileList || []).filter((f) => f && f.type && f.type.startsWith('image/'));
      if (!files.length) {
        if (bgSlideCount) bgSlideCount.textContent = I18n.t('settings.bg.slide.selectImages');
        return;
      }
      if (bgSlideCount) bgSlideCount.textContent = I18n.t('settings.bg.slide.importing', [String(files.length)]);

      /* Fingerprint the incoming files and check them against the existing
         slideshow. When any are already present, ask once whether to import
         them anyway (duplicates) or cancel the whole batch. */
      let dupes = [];
      let hashes = null;
      try {
        const found = await Background.findDuplicateSlides(files);
        dupes = found.dupes;
        hashes = found.hashes;
      } catch { /* dedupe is best-effort; import proceeds without it */ }
      if (dupes.length) {
        const proceed = await showSlideDuplicateConfirm(dupes, files.length);
        if (!proceed) {
          if (bgSlideCount) bgSlideCount.textContent = I18n.t('settings.bg.slide.count', [String((await Background.loadSlides()).items.length)]);
          return;
        }
      }

      /* Append to the existing list (don't replace) — the list view is the place
         to grow the slideshow one file or one folder at a time. */
      let slides;
      try {
        slides = await Background.addSlides(files, hashes);
      } catch (e) {
        if (bgSlideCount) bgSlideCount.textContent = I18n.t('settings.bg.file.loadFailed');
        return;
      }
      state.bgImageMode = 'slide';
      state.bgSlideMode = true;
      updateImageModeLabel('slide');
      /* Point at the first newly added slide and show it now. */
      if (slides.items.length) {
        await Background.gotoSlide(slides.items.length - files.length);
      }
      saveSettings();
      syncFormToState();
      pickPreview('image', files[0], files[0]);
      applyBackground();
      await refreshSlideInfo();
    }

    if (bgSlideAddInput) bgSlideAddInput.addEventListener('change', async (e) => {
      await ingestSlideFiles(e.target.files);
      e.target.value = '';
    });
    if (bgSlideDirInput) bgSlideDirInput.addEventListener('change', async (e) => {
      await ingestSlideFiles(e.target.files);
      e.target.value = '';
    });

    /* Slideshow interval dropdown (custom select mirrors the other settings). */
    initCustomSelect(bgSlideIntervalWrapper, (val) => {
      if (val === 'custom') {
        /* Show the custom input; prefill with the current interval if it's not a preset. */
        if (bgSlideIntervalCustom) {
          bgSlideIntervalCustom.hidden = false;
          if (bgSlideIntervalCustomInput) {
            const cur = parseFloat(state.bgSlideInterval);
            bgSlideIntervalCustomInput.value = Number.isFinite(cur) && cur > 0 && !SLIDE_INTERVAL_KEY[cur] ? cur : '';
          }
        }
        if (bgSlideIntervalCustomInput) bgSlideIntervalCustomInput.focus();
        return; /* don't apply until user confirms via input */
      }
      if (bgSlideIntervalCustom) bgSlideIntervalCustom.hidden = true;
      const n = parseFloat(val);
      state.bgSlideInterval = Number.isFinite(n) ? n : 0;
      saveSettings();
      updateSlideIntervalLabel(state.bgSlideInterval);
      restartSlideTimer();
    });

    /* Custom interval input: apply on button click or Enter. */
    function applyCustomInterval() {
      if (!bgSlideIntervalCustomInput) return;
      const n = parseFloat(bgSlideIntervalCustomInput.value);
      if (!Number.isFinite(n) || n <= 0) return;
      const minutes = Math.max(0.05, Math.min(1440, n));
      state.bgSlideInterval = minutes;
      if (bgSlideIntervalCustom) bgSlideIntervalCustom.hidden = true;
      saveSettings();
      updateSlideIntervalLabel(minutes);
      restartSlideTimer();
    }
    if (bgSlideIntervalCustomApply) bgSlideIntervalCustomApply.addEventListener('click', applyCustomInterval);
    if (bgSlideIntervalCustomInput) bgSlideIntervalCustomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyCustomInterval(); }
    });

    /* Slideshow list dialog: open from the entry button, close via the back
       button or by clicking the backdrop (like the other confirm dialogs). */
    if (bgSlideListBtn) bgSlideListBtn.addEventListener('click', openSlideList);
    if (slideListClose) slideListClose.addEventListener('click', closeSlideList);
    if (slideListDialog) slideListDialog.addEventListener('click', (e) => {
      if (e.target === slideListDialog) closeSlideList();
    });

    /* Image mode dropdown (single / slide / schedule). */
    initCustomSelect(bgImageModeWrapper, (val) => setImageMode(val));

    /* Schedule list dialog: same open/close contract as the slideshow list. */
    if (bgScheduleListBtn) bgScheduleListBtn.addEventListener('click', openScheduleList);
    if (scheduleListClose) scheduleListClose.addEventListener('click', closeScheduleList);
    if (scheduleListDialog) scheduleListDialog.addEventListener('click', (e) => {
      if (e.target === scheduleListDialog) closeScheduleList();
    });
    /* Add a slot: pick one image, append it with an automatic start time (first
       slot 08:00, then one hour after the latest; the user can tweak the time
       inline afterwards). */
    if (bgScheduleAddInput) bgScheduleAddInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || !file.type || !file.type.startsWith('image/')) return;
      const cur = await Background.loadSchedule();
      let start = 480; /* 08:00 */
      if (cur.items.length) {
        start = Math.min(1439, cur.items[cur.items.length - 1].start + 60);
      }
      await Background.addScheduleEntry(file, start);
      await refreshScheduleInfo();
      refreshScheduleSummary();
      applyBackground();
    });
    /* Row interactions: change a slot's start time, or remove the slot.
       A time input fires change while the user is still typing (each field
       commit), so the change handler must NOT rebuild the row list — that
       destroys the input and drops focus mid-edit. It updates the record by the
       slot's stable id, refreshes the summary, and leaves the DOM alone. */
    if (bgScheduleRows) bgScheduleRows.addEventListener('change', async (e) => {
      const input = e.target && e.target.closest ? e.target.closest('[data-slot-time]') : null;
      if (!input) return;
      const id = input.dataset.slotTime;
      if (!id) return;
      const minutes = timeInputToMinutes(input.value);
      if (minutes == null) return;
      await Background.updateScheduleEntryStart(id, minutes);
      refreshScheduleSummary();
      if (state.bgImageMode === 'schedule') applyBackground();
    });
    if (bgScheduleRows) bgScheduleRows.addEventListener('click', async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-slot-remove]') : null;
      if (!btn) return;
      const id = btn.dataset.slotRemove;
      if (!id) return;
      await Background.removeScheduleEntry(id);
      await refreshScheduleInfo();
      refreshScheduleSummary();
      if (state.bgImageMode === 'schedule') applyBackground();
    });

    bgSlideRandomToggle.addEventListener('click', () => {
      state.bgSlideRandom = !state.bgSlideRandom;
      updateSlideRandomToggle(state.bgSlideRandom);
      saveSettings();
    });
    bgSlideRandomToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        bgSlideRandomToggle.click();
      }
    });

    if (bgSlideClear) bgSlideClear.addEventListener('click', async () => {
      await Background.clearSlides();
      revokeSlideThumbs();
      /* An emptied slideshow has nothing to paint; fall back to the single-image
         slot and close the dialog — there's no list to look at any more. */
      closeSlideList();
      await setImageMode('single');
      await refreshSlideInfo();
    });

    /* Delegate clicks in the list: the remove badge drops that slide, clicking
       anywhere else on the row switches the wallpaper to that slide. */
    if (bgSlideThumbs) bgSlideThumbs.addEventListener('click', async (e) => {
      const row = e.target && e.target.closest ? e.target.closest('[data-slide-index]') : null;
      if (!row) return;
      const index = parseInt(row.dataset.slideIndex, 10);
      if (!Number.isFinite(index)) return;

      const rmBtn = e.target && e.target.closest ? e.target.closest('[data-slide-remove]') : null;
      if (rmBtn) {
        const slides = await Background.removeSlide(index);
        /* Removing the last slide leaves nothing to paint; fall back to the
           single-image slot and close the dialog. */
        if (!slides.items.length) {
          closeSlideList();
          await setImageMode('single');
        }
      } else {
        /* Select this slide as the current one. */
        await Background.gotoSlide(index);
        const slide = await Background.currentSlide();
        if (slide && slide.blob) pickPreview('image', slide.blob, slide.blob);
      }
      saveSettings();
      syncFormToState();
      applyBackground();
      await refreshSlideInfo();
    });

    /* Reveal the next (or previous) slide now. Used by the right-click menu. */
    async function nudgeSlide(delta) {
      if (!state.bgSlideMode) return;
      const slide = await Background.advanceSlide(delta);
      if (slide && slide.blob) pickPreview('image', slide.blob, slide.blob);
      applyBackground();
      await refreshSlideInfo();
    }

    /* --- Background color swatches --- */
    bgColorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const val = swatch.dataset.color;
        state.bgColor = val;
        if (bgColorHex) bgColorHex.textContent = val.toUpperCase();
        updateBgColorSwatches(val);
        applyToDom('bgColor', val);
        saveSettings();
        applyBackground();
      });
    });
    if (bgCustomColorTrigger) {
      bgCustomColorTrigger.addEventListener('click', () => {
        if (!window.ColorPicker) return;
        window.ColorPicker.open(bgCustomColorTrigger, {
          color: state.bgColor,
          onApply: (val) => {
            state.bgColor = val;
            if (bgColorHex) bgColorHex.textContent = val.toUpperCase();
            updateBgColorSwatches(val);
            applyToDom('bgColor', val);
            saveSettings();
            applyBackground();
          }
        });
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
        colorHexDisplay.textContent = val.toUpperCase();
        state.overlayColor = val;
        updateOverlayColorSwatches(val);
        applyToDom('overlayColor', val);
        saveSettings();
      });
    });
    customColorTrigger.addEventListener('click', () => {
      if (!window.ColorPicker) return;
      window.ColorPicker.open(customColorTrigger, {
        color: state.overlayColor,
        onApply: (val) => {
          colorHexDisplay.textContent = val.toUpperCase();
          state.overlayColor = val;
          updateOverlayColorSwatches(val);
          applyToDom('overlayColor', val);
          saveSettings();
        }
      });
    });

    /* --- Engine select --- */
    initCustomSelect(engineSelectWrapper, (val) => {
      state.engine = val;
      updateEngineLabel(val);
      updateEngineDropdown(val);
      setCustomEngineConfigVisible(val === 'custom');
      updateCustomSuggestToggle();
      applyToDom('engine', val);
      saveSettings();
    });

    /* --- Custom engine config --- */
    if (customEngineUrlInput) {
      /* Live validation only while typing; nothing is persisted until Save. */
      customEngineUrlInput.addEventListener('input', () => {
        validateCustomEngineUrl();
        if (customEngineSaveStatus) customEngineSaveStatus.textContent = '';
      });
      customEngineUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveCustomEngineUrl();
        }
      });
      /* On commit (blur/change), show the https:// prefix but do not save. */
      customEngineUrlInput.addEventListener('change', () => {
        const url = normalizeCustomEngineUrl(customEngineUrlInput.value);
        if (url !== customEngineUrlInput.value) customEngineUrlInput.value = url;
        validateCustomEngineUrl();
      });
      if (customEngineSaveBtn) {
        customEngineSaveBtn.addEventListener('click', () => {
          saveCustomEngineUrl();
        });
      }
    }
    initCustomSelect(customSuggestWrapper, (val) => {
      localStorage.setItem(CUSTOM_SUGGEST_KEY, val);
      updateCustomSuggestLabel(val);
      updateCustomSuggestDropdown(val);
    });

    /* --- Custom suggestions API toggle (preset engines) --- */
    if (customSuggestToggle) {
      customSuggestToggle.addEventListener('click', () => {
        /* For the custom engine the toggle is forced on and cannot be changed. */
        if (state.engine === 'custom') return;
        state.useCustomSuggest = !state.useCustomSuggest;
        updateCustomSuggestToggle();
        saveSettings();
      });
      customSuggestToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          customSuggestToggle.click();
        }
      });
    }

    /* --- Clock master toggle --- */
    if (showClockToggle) {
      showClockToggle.addEventListener('click', () => {
        state.showClock = !state.showClock;
        updateShowClockToggle(state.showClock);
        setShowSecondsGroupVisible(state.showClock);
        applyToDom('showClock', state.showClock);
        saveSettings();
      });
      showClockToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          showClockToggle.click();
        }
      });
    }

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
      /* The auto-hide option only exists while the dock itself is on. */
      morphPanel(() => setGroupHidden(autoHideBookmarksGroup, !state.showBookmarks));
      saveSettings();
    });
    showBookmarksToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        showBookmarksToggle.click();
      }
    });

    /* --- Auto-hide dock toggle (requires the dock to be enabled) --- */
    if (autoHideBookmarksToggle) {
      autoHideBookmarksToggle.addEventListener('click', () => {
        state.autoHideBookmarks = !state.autoHideBookmarks;
        updateAutoHideBookmarksToggle(state.autoHideBookmarks);
        applyToDom('autoHideBookmarks', state.autoHideBookmarks);
        saveSettings();
      });
      autoHideBookmarksToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          autoHideBookmarksToggle.click();
        }
      });
    }

    /* --- Right-click menu toggle --- */
    if (showContextMenuToggle) {
      showContextMenuToggle.addEventListener('click', () => {
        state.showContextMenu = !state.showContextMenu;
        updateShowContextMenuToggle(state.showContextMenu);
        saveSettings();
      });
      showContextMenuToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          showContextMenuToggle.click();
        }
      });
    }

    /* --- Auto-hide settings icon toggle --- */
    autoHideSettingsIconToggle.addEventListener('click', () => {
      state.autoHideSettingsIcon = !state.autoHideSettingsIcon;
      updateAutoHideSettingsIconToggle(state.autoHideSettingsIcon);
      morphPanel(() => setAutoHideStrengthGroupVisible(state.autoHideSettingsIcon));
      applyToDom('autoHideSettingsIcon', state.autoHideSettingsIcon);
      saveSettings();
    });
    autoHideSettingsIconToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        autoHideSettingsIconToggle.click();
      }
    });

    /* --- Auto-hide strength slider --- */
    autoHideSettingsStrengthSlider.addEventListener('input', () => {
      const val = parseInt(autoHideSettingsStrengthSlider.value, 10);
      state.settingsIconHideStrength = val;
      autoHideSettingsStrengthDisplay.textContent = val + '%';
      scheduleGearOpacity();
      saveSettings();
    });

    /* --- Gear fade follows the pointer --- */
    document.addEventListener('pointermove', (e) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (state.autoHideSettingsIcon) scheduleGearOpacity();
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
      pointerX = -1e4;
      pointerY = -1e4;
      if (state.autoHideSettingsIcon) scheduleGearOpacity();
    });
    window.addEventListener('resize', () => {
      gearRect = null;
      if (state.autoHideSettingsIcon) scheduleGearOpacity();
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
    /* --- Cursor style select --- */
    initCustomSelect(cursorStyleWrapper, (val) => {
      state.cursorEffectStyle = val;
      updateCursorStyleLabel(val);
      updateCursorStyleDropdown(val);
      applyToDom('cursorEffectStyle', val);
      saveSettings();
    });

    /* --- Glass style select --- */
    /* --- Glass style select --- */
    initCustomSelect(glassStyleWrapper, (val) => {
      state.glassStyle = val;
      updateGlassStyleLabel(val);
      updateGlassStyleDropdown(val);
      applyToDom('glassStyle', val);
      saveSettings();
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
        bgVideoName.textContent = I18n.t('settings.bg.video.selectVideo');
        bgVideoInput.value = '';
        return;
      }
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      if (file.size > 100 * 1024 * 1024) {
        const ok = await showConfirmDialog(
          I18n.t('settings.bg.video.sizeWarning', [sizeMB])
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
        bgVideoName.textContent = I18n.t('settings.bg.video.loadFailed');
      });
    });

    /* --- Video sound toggle --- */
    function toggleVideoSound() {
      state.bgVideoSoundOn = !state.bgVideoSoundOn;
      updateVideoSoundToggle(state.bgVideoSoundOn);
      morphPanel(() => {
        setGroupHidden(videoVolumeWrapper, !state.bgVideoSoundOn);
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
        setGroupHidden(videoOnEndedWrapper, state.bgVideoLoop);
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
    initCustomSelect(videoOnEndedTrigger.closest('.custom-select-wrapper'), (val) => {
      state.bgVideoOnEnded = val;
      updateVideoOnEndedLabel(val);
      updateVideoOnEndedDropdown(val);
      Background.setOnEnded(val, getVideoEndCallback());
      saveSettings();
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
  }

  /* ================================================================
     Advanced tab
     ================================================================ */

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return I18n.t('general.unknown');
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
    if (source === 'bing') return I18n.t('bing.wallpaper');
    if (source === 'image') {
      if (state.bgImageStored || state.bgImageData) {
        return state.bgImageFileName ? I18n.t('image.wallpaper.uploaded', [state.bgImageFileName]) : I18n.t('image.wallpaper.uploaded', ['']);
      }
      return state.bgImageUrl ? I18n.t('image.wallpaper.url') : I18n.t('image.wallpaper.unset');
    }
    if (source === 'video') {
      return state.bgVideoFileName ? I18n.t('video.wallpaper', [state.bgVideoFileName]) : I18n.t('video.wallpaper');
    }
    if (source === 'color') return I18n.t('color.wallpaper');
    return I18n.t('wallpaper.unset');
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
      /* slideMode / scheduleMode resolve to a blob even without imageStored. */
      if (opts.imageStored || opts.slideMode || opts.scheduleMode) {
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
    clear: { busy: 'preview.action.clear.busy', done: 'preview.action.clear.done', failed: 'preview.action.clear.failed' },
    regen: {
      busy: 'preview.action.regen.busy',
      done: 'preview.action.regen.done',
      failed: 'preview.action.regen.failed',
      none: 'preview.action.regen.none',
      noData: 'preview.action.regen.noData',
    },
    repick: { busy: 'preview.action.repick.busy', done: 'preview.action.repick.done', failed: 'preview.action.repick.failed', none: 'preview.action.repick.none' },
  };

  /* Largest intrinsic size this button's labels need. */
  function measureButtonSize(button, labels) {
    if (!button) return null;
    const idle = button.textContent;
    const previousWidth = button.style.width;
    const previousMinWidth = button.style.minWidth;
    let maxWidth = 0;
    let maxHeight = 0;
    /* Measure the intrinsic content size even when CSS stretches the button to
       100% on narrow screens; freezing that container width would overflow.
       A stale min-width from a previous locale must also be dropped, or the
       re-measure would just re-read the old (too wide) reservation. */
    button.style.width = 'max-content';
    button.style.minWidth = '0';
    for (const label of labels) {
      /* labels are i18n keys — translate before measuring, or the key string
         itself (longer than any UI text) gets reserved as the button width. */
      button.textContent = I18n.t(label);
      maxWidth = Math.max(maxWidth, button.offsetWidth);
      maxHeight = Math.max(maxHeight, button.offsetHeight);
    }
    button.textContent = idle;
    button.style.width = previousWidth;
    button.style.minWidth = previousMinWidth;
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

  function setButtonBusy(button, textKey) {
    if (!button) return;
    if (!buttonIdleLabels.has(button)) buttonIdleLabels.set(button, button.textContent);
    clearTimeout(buttonResultTimers.get(button));
    buttonResultTimers.delete(button);
    button.disabled = true;
    button.textContent = I18n.t(textKey);
  }

  function setButtonResult(button, textKey) {
    if (!button) return;
    const idle = buttonIdleLabels.get(button) || button.textContent;
    clearTimeout(buttonResultTimers.get(button));
    button.disabled = false;
    button.textContent = I18n.t(textKey);
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
        ? I18n.t('settings.advanced.wallpaper.export.hint', [sourceLabel(source)])
        : I18n.t('settings.advanced.wallpaper.export.hint', [I18n.t('color.wallpaper')]);
    }
    if (advancedRegenPreview) advancedRegenPreview.disabled = !hasWallpaper;
    if (advancedRepickColor) advancedRepickColor.disabled = !hasWallpaper;

    if (advancedPreviewStatus) {
      if (!hasWallpaper) {
        advancedPreviewStatus.textContent = I18n.t('settings.advanced.preview.status.noPreview');
      } else if (typeof Background === 'undefined' || !Background.getPreviewInfo) {
        advancedPreviewStatus.textContent = I18n.t('settings.advanced.preview.status.cannotRead');
      } else {
        advancedPreviewStatus.textContent = I18n.t('settings.advanced.preview.status.reading');
        try {
          const info = await Background.getPreviewInfo(source);
          if (seq !== advancedRefreshSeq) return;
          if (info) {
            const color = info.color ? info.color.toUpperCase() : I18n.t('general.unknown');
            advancedPreviewStatus.textContent =
              I18n.t('settings.advanced.preview.status.cached', [formatBytes(info.size), color]);
          } else {
            advancedPreviewStatus.textContent = I18n.t('settings.advanced.preview.status.noCache');
          }
        } catch {
          if (seq === advancedRefreshSeq) advancedPreviewStatus.textContent = I18n.t('settings.advanced.preview.status.readFailed');
        }
      }
    }

    if (advancedStorageInfo) {
      advancedStorageInfo.textContent = I18n.t('settings.advanced.storage.status.loading');
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (seq !== advancedRefreshSeq) return;
          if (estimate && typeof estimate.usage === 'number') {
            const quota = typeof estimate.quota === 'number' && estimate.quota > 0
              ? ` / ${formatBytes(estimate.quota)}` : '';
            advancedStorageInfo.textContent = I18n.t('settings.advanced.storage.status.usage', [formatBytes(estimate.usage), quota]);
          } else {
            advancedStorageInfo.textContent = I18n.t('settings.advanced.storage.status.cannotRead');
          }
        } else {
          advancedStorageInfo.textContent = I18n.t('settings.advanced.storage.status.unsupported');
        }
      } catch {
        if (seq === advancedRefreshSeq) advancedStorageInfo.textContent = I18n.t('settings.advanced.storage.status.readFailed');
      }
    }
  }

  async function exportCurrentWallpaper() {
    if (!advancedExportBtn) return;
    const source = state.bgSource;
    if (source === 'color' || source === 'none') {
      await showExportDialog({
        ok: false,
        title: I18n.t('dialog.export.noWallpaper.title'),
        detail: I18n.t('dialog.export.noWallpaper.desc'),
      });
      return;
    }
    if (typeof Background === 'undefined' || !Background.getWallpaperBlob) {
      await showExportDialog({ ok: false, detail: I18n.t('dialog.export.notReady.desc') });
      return;
    }

    const originalLabel = advancedExportBtn.textContent;
    advancedExportBtn.disabled = true;
    advancedExportBtn.textContent = I18n.t('dialog.export.exporting');

    let url = '';
    let opts = {};
    let exportName = '';
    if (source === 'bing') {
      url = state.bgBingUrl || '';
      opts = { url };
    } else if (source === 'image') {
      opts = customImageOpts();
      url = state.bgImageUrl || (state.bgImageData && !state.bgImageData.startsWith('data:')
        ? state.bgImageData : '');
      /* File name follows the image actually being shown (slide / time slot). */
      try {
        if (opts.scheduleMode) {
          const active = await Background.activeScheduleEntry();
          if (active && active.item.name) exportName = active.item.name;
        } else if (opts.slideMode) {
          const slide = await Background.currentSlide();
          if (slide && slide.name) exportName = slide.name;
        }
      } catch { /* keep the generic fallback name */ }
    }

    try {
      let blob = null;
      try { blob = await Background.getWallpaperBlob(source, opts); } catch { blob = null; }

      if (blob && blob.size) {
        const fileName = buildExportName(blob, source, url, exportName);
        await downloadBlob(blob, fileName);
        await showExportDialog({
          ok: true,
          title: I18n.t('dialog.export.success.title'),
          detail: `${fileName}（${formatBytes(blob.size)}）`,
        });
      } else if (url) {
        /* The page could not turn this URL into a Blob (CORS / connect-src);
           let the browser's download manager handle the URL directly. */
        const fileName = buildExportName(null, source, url);
        await downloadUrl(url, fileName);
        await showExportDialog({
          ok: true,
          title: I18n.t('dialog.export.browser.title'),
          detail: I18n.t('dialog.export.browser.desc', [fileName]),
        });
      } else {
        await showExportDialog({
          ok: false,
          title: I18n.t('dialog.export.noData.title'),
          detail: I18n.t('dialog.export.noData.desc'),
        });
      }
    } catch (err) {
      await showExportDialog({
        ok: false,
        title: I18n.t('dialog.export.failed.title'),
        detail: I18n.t('dialog.export.failed.desc', [err && err.message ? '\n' + err.message : '']),
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
    advancedClearBingCache.textContent = I18n.t('settings.advanced.storage.clearBing.busy');
    try {
      await Background.clearBingCache();
      await showExportDialog({
        ok: true,
        title: I18n.t('settings.advanced.storage.clearBing.success.title'),
        detail: I18n.t('settings.advanced.storage.clearBing.success.desc'),
      });
    } catch (err) {
      await showExportDialog({
        ok: false,
        title: I18n.t('settings.advanced.storage.clearBing.failed.title'),
        detail: I18n.t('settings.advanced.storage.clearBing.failed.desc', [err && err.message ? err.message : I18n.t('general.unknown')]),
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
        const matches = resetAllInput.value.trim() === I18n.t('settings.advanced.danger.resetAll.phrase');
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
        setError(I18n.t('settings.advanced.danger.resetAll.error.paste'));
      }

      function onBeforeInput(e) {
        const type = e.inputType || '';
        if (type === 'insertFromPaste' || type === 'insertFromPasteAsQuotation'
            || type === 'insertFromDrop' || type === 'insertFromYank') {
          e.preventDefault();
          setError(I18n.t('settings.advanced.danger.resetAll.error.paste'));
        }
      }

      function onDrop(e) {
        e.preventDefault();
        setError(I18n.t('settings.advanced.danger.resetAll.error.drop'));
      }

      function onKeydown(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cleanup(false);
        } else if (e.key === 'Enter' && document.activeElement === resetAllInput) {
          if (resetAllConfirm.disabled) {
            e.preventDefault();
            setError(I18n.t('settings.advanced.danger.resetAll.error.incomplete'));
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
        if (resetAllInput.value.trim() !== I18n.t('settings.advanced.danger.resetAll.phrase')) {
          setError(I18n.t('settings.advanced.danger.resetAll.error.mismatch'));
          syncConfirm();
          return;
        }
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      if (resetAllPhrase) resetAllPhrase.textContent = I18n.t('settings.advanced.danger.resetAll.phrase');
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
    advancedResetAll.textContent = I18n.t('settings.advanced.danger.resetAll.busy');

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

    advancedResetAll.textContent = I18n.t('settings.advanced.danger.resetAll.done');
    await showExportDialog({
      ok: storageCleared,
      title: storageCleared ? I18n.t('settings.advanced.danger.resetAll.success.title') : I18n.t('settings.advanced.danger.resetAll.partial.title'),
      detail: storageCleared
        ? I18n.t('settings.advanced.danger.resetAll.success.desc')
        : I18n.t('settings.advanced.danger.resetAll.partial.desc'),
      okLabel: I18n.t('settings.advanced.danger.resetAll.reloadBtn'),
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

    /* 切换到必应时自动获取：从未获取过，或开启了自动刷新且已过期（当天
       还没取过）。仅靠 bgBingUrl 判断不够——从图片/视频切回来时 URL 往往
       还在，但可能已是昨天的壁纸，此时若开了自动刷新应立刻换新。 */
    if (val === 'bing' && (!state.bgBingUrl ||
        (state.bgBingAutoRefresh && state.bingLastRefreshDate !== todayStr()))) {
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
      return { ok: false, error: I18n.t('settings.bg.url.error.empty') };
    }
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      return { ok: false, error: I18n.t('settings.bg.url.error.invalid') };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: I18n.t('settings.bg.url.error.scheme') };
    }
    return { ok: true, url: parsed.href };
  }

  /* --- Bing meta helpers --- */
  /* Today's local date as YYYY-MM-DD, for comparing against bingLastRefreshDate. */
  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

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

  /* Shared Bing wallpaper refresh. Every entry point — the settings button,
     the context-menu action, the initial auto-fetch, switching the source to
     bing, and enabling daily auto-refresh — funnels through here, so the
     "refreshing" / "refreshed" notices appear exactly once per refresh. */
  async function refreshBingWallpaper() {
    if (typeof Background === 'undefined' || !Background.fetchBingOfTheDay) return;
    if (!bgBingRefresh) return;
    bgBingRefresh.disabled = true;
    setBingMeta(I18n.t('bing.meta.fetching'));
    if (typeof Notice !== 'undefined') Notice.show(I18n.t('bing.refresh.start'), 'info');
    try {
      const result = await Background.fetchBingOfTheDay();
      if (!result.ok) {
        setBingMeta(I18n.t('bing.meta.failed', [result.error || I18n.t('general.unknown')]));
        if (typeof Notice !== 'undefined') {
          Notice.show(I18n.t('bing.refresh.failed'), 'error', 2600);
        }
        return;
      }
      state.bgBingUrl = result.url;
      state.bgBingCopyright = formatBingMeta(result);
      /* 每次 fetch 都覆盖保存的词条链接：右键"打开来源页面"始终指向最新一次
         API 返回的版权词条，而不是图片 URL。 */
      state.bgBingCopyrightLink = result.copyrightlink || '';
      /* Record the refresh date on every refresh (manual or auto), so the
         next page load can tell whether today's wallpaper was already fetched. */
      state.bingLastRefreshDate = todayStr();
      saveSettings();
      /* 静默生成必应壁纸的 preview（低分辨率 WebP，先清空旧的再用预览色更新占位色），
         生成失败（离线等）则退回原来的整图取色。 */
      pickPreview('bing', result.url, result.url);
      applyBackground();
      setBingMeta(state.bgBingCopyright);
      if (typeof Notice !== 'undefined') Notice.show(I18n.t('bing.refresh.done'), 'success');
    } finally {
      bgBingRefresh.disabled = false;
    }
  }

  /* --- Dropdown open/close animation ---
     Toggling [hidden] alone pops the list instantly. Instead we play a short
     fade/slide keyframe on open and a matching reverse one on close, committing
     [hidden] only after the close animation finishes. A pending close timer is
     cancelled by an immediate re-open, so rapid toggling stays responsive. */
  const DROPDOWN_ANIM_MS = 200;

  function showDropdown(dropdown, trigger) {
    if (!dropdown) return;
    if (dropdown._dropdownHideTimer) {
      clearTimeout(dropdown._dropdownHideTimer);
      dropdown._dropdownHideTimer = null;
    }
    dropdown.classList.remove('dropdown-closing');
    dropdown.hidden = false;
    if (trigger) trigger.classList.add('open');
    /* Force reflow so re-opening restarts the animation (the class alone is
       already present after the first open, so no transition would re-run). */
    void dropdown.offsetWidth;
  }

  function hideDropdown(dropdown, trigger) {
    if (!dropdown) return;
    if (trigger) trigger.classList.remove('open');
    if (dropdown.hidden || dropdown.classList.contains('dropdown-closing')) return;
    if (reduceMotionQuery && reduceMotionQuery.matches) {
      dropdown.hidden = true;
      return;
    }
    dropdown.classList.add('dropdown-closing');
    dropdown._dropdownHideTimer = setTimeout(() => {
      dropdown.hidden = true;
      dropdown.classList.remove('dropdown-closing');
      dropdown._dropdownHideTimer = null;
    }, DROPDOWN_ANIM_MS);
  }

  function isDropdownOpen(dropdown) {
    return !!dropdown && !dropdown.hidden && !dropdown.classList.contains('dropdown-closing');
  }

  /* --- Custom select template ---
     One wiring for every dropdown (engine / cursor style / glass style / video
     on-ended / language): the trigger toggles the list with the open/close
     animation, a selected option runs the caller's onSelect callback, and the
     list flips upward when the panel edge would cut it off. Adding a dropdown
     later is just markup plus one call here. */
  function initCustomSelect(wrapper, onSelect) {
    if (!wrapper) return;
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const dropdown = wrapper.querySelector('.custom-select-dropdown');
    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDropdownOpen(dropdown)) {
        hideDropdown(dropdown, trigger);
      } else {
        closeAllDropdowns(); /* only one list at a time */
        showDropdown(dropdown, trigger);
        /* Last control of a short tab: flip up instead of clipping at the panel edge. */
        wrapper.classList.remove('drop-up');
        if (dropdown.getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom - 12) {
          wrapper.classList.add('drop-up');
        }
      }
    });

    dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        const native = wrapper.querySelector('select');
        if (native) native.value = val;
        onSelect(val);
        hideDropdown(dropdown, trigger);
      });
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('.custom-select-wrapper') !== wrapper) {
        hideDropdown(dropdown, trigger);
      }
    });
  }

  function closeAllDropdowns() {
    hideDropdown(engineSelectDropdown, engineSelectTrigger);
    hideDropdown(cursorStyleDropdown, cursorStyleTrigger);
    hideDropdown(glassStyleDropdown, glassStyleTrigger);
    hideDropdown(videoOnEndedDropdown, videoOnEndedTrigger);
    hideDropdown(languageSelectDropdown, languageSelectTrigger);
    hideDropdown(bgSlideIntervalDropdown, bgSlideIntervalTrigger);
  }

  /* --- Panel state --- */
  /* Closed means `visibility: hidden` in css (no backdrop blur kept alive, nothing
     focusable), so there are no `hidden` flips or timeouts to coordinate here. */

  /* Focus containment: while the panel is open, Tab cycles inside it, and
     closing returns focus to whatever had it before. */
  let lastFocusedBeforePanel = null;

  function panelFocusables() {
    const nodes = panel.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    return [...nodes].filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function openPanel() {
    lastFocusedBeforePanel = document.activeElement;
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
    /* Move focus into the dialog so keyboard users land inside it. */
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    overlayEl.classList.remove('open');
    toggle.style.opacity = '';
    toggle.style.pointerEvents = '';
    closeAllDropdowns();
    if (window.ColorPicker) window.ColorPicker.close();
    /* Return focus to the trigger (the toggle is visible again by now). */
    const back = lastFocusedBeforePanel;
    lastFocusedBeforePanel = null;
    if (back && typeof back.focus === 'function' && document.contains(back)) {
      back.focus({ preventScroll: true });
    }
  }

  return {
    init,
    getState: () => state,
    applyAllToDom,
    loadSettings,
    applyBackground,
    flush: flushSettings,
    persist,
    refreshBingWallpaper
  };
})();
