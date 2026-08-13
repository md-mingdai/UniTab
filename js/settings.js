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
    bgImageData: null,    // 自定义图片 base64
    bgImageUrl: null,     // 自定义图片 URL（仅当 bgSource === 'image' 且用户填了链接时使用）
    bgBingUrl: null,      // 必应壁纸 URL（仅 bgSource === 'bing' 时使用）
    bgBingCopyright: '',  // 必应壁纸标题 + 版权信息（持久化，刷新页面也显示）
    bgColor: '#1a1d24',   // 纯色（仅 bgSource === 'color' 时使用）
    bgThemeColor: '',     // 图片主题色（用于图片加载前的占位背景）
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
  let resetBtn;

  function init() {
    cacheDom();
    loadSettings();
    bindEvents();
    applyBackground();

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

  /* --- Load / Save --- */
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('unitab_settings'));
      if (saved && typeof saved === 'object') {
        state = { ...DEFAULTS, ...saved };
      } else {
        state = { ...DEFAULTS };
      }
    } catch {
      state = { ...DEFAULTS };
    }
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
      saveSettings();
    }
    /* Migration: pre-bgBingUrl builds stored bing URL inside bgImageData
       under the bing-otd: prefix. Move it to its own field so the two
       sources don't trample each other. */
    if (state.bgBingUrl == null && state.bgImageData
        && typeof state.bgImageData === 'string'
        && state.bgImageData.startsWith(Background.getBingOtdPrefix())) {
      state.bgBingUrl = state.bgImageData.slice(Background.getBingOtdPrefix().length);
      state.bgImageData = null;
      saveSettings();
    }
    /* Migration: 'none' source removed — redirect to 'bing'. */
    if (state.bgSource === 'none') {
      state.bgSource = 'bing';
      state.bgImageData = null;
      saveSettings();
    }
    /* Migration: showSeconds was added later, default to true if missing. */
    try {
      const raw = localStorage.getItem('unitab_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !('showSeconds' in parsed)) {
          state.showSeconds = DEFAULTS.showSeconds;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('bgColor' in parsed)) {
          state.bgColor = DEFAULTS.bgColor;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('showBookmarks' in parsed)) {
          state.showBookmarks = DEFAULTS.showBookmarks;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('showCursorEffect' in parsed)) {
          state.showCursorEffect = DEFAULTS.showCursorEffect;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('cursorEffectStyle' in parsed)) {
          state.cursorEffectStyle = DEFAULTS.cursorEffectStyle;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('bgThemeColor' in parsed)) {
          state.bgThemeColor = DEFAULTS.bgThemeColor;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('bgVideoFileName' in parsed)) {
          state.bgVideoFileName = DEFAULTS.bgVideoFileName;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('bgVideoSoundOn' in parsed)) {
          state.bgVideoSoundOn = DEFAULTS.bgVideoSoundOn;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('glassStyle' in parsed)) {
          state.glassStyle = DEFAULTS.glassStyle;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('glassRadius' in parsed)) {
          state.glassRadius = DEFAULTS.glassRadius;
          saveSettings();
        }
        if (parsed && typeof parsed === 'object' && !('bgVideoVolume' in parsed)) {
          state.bgVideoVolume = DEFAULTS.bgVideoVolume;
          state.bgVideoLoop = DEFAULTS.bgVideoLoop;
          state.bgVideoOnEnded = DEFAULTS.bgVideoOnEnded;
          saveSettings();
        }
        /* Migrate old on-ended values to new options */
        if (state.bgVideoOnEnded === 'loop' || state.bgVideoOnEnded === 'pause' || state.bgVideoOnEnded === 'restart') {
          state.bgVideoOnEnded = 'black';
          saveSettings();
        }
      }
    } catch {
      /* ignore */
    }
    syncFormToState();
  }

  function saveSettings() {
    try {
      localStorage.setItem('unitab_settings', JSON.stringify(state));
    } catch (e) {
      console.warn('UniTab: 无法保存设置:', e.message);
    }
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
    if (state.bgImageData) {
      bgFileName.textContent = '已上传图片';
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

    /* Check if video exists in IndexedDB */
    if (state.bgSource === 'video') {
      Background.loadVideoBlob().then((blob) => {
        if (blob) {
          const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
          const name = state.bgVideoFileName || '已存储视频';
          bgVideoName.textContent = `${name}（${sizeMB}MB）`;
        }
      });
    }
  }

  /* --- Apply to DOM --- */
  function applyToDom(key, value) {
    const root = document.documentElement;
    switch (key) {
      case 'bgBlur':
        root.style.setProperty('--bg-blur', value + 'px');
        break;
      case 'overlayOpacity':
        root.style.setProperty('--overlay-opacity', value);
        break;
      case 'overlayColor':
        root.style.setProperty('--overlay-color', value);
        break;
      case 'bgColor':
        root.style.setProperty('--bg-solid-color', value);
        break;
      case 'bgThemeColor':
        root.style.setProperty('--bg-theme-color', value || 'transparent');
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

  function getVideoEndCallback() {
    const behavior = state.bgVideoOnEnded;
    if (behavior === 'customimage') {
      return () => {
        const data = state.bgImageData || state.bgImageUrl;
        if (data) {
          Background.load({ source: 'image', imageData: data, color: state.bgColor });
        }
      };
    }
    if (behavior === 'bing') {
      return () => {
        if (state.bgBingUrl) {
          Background.load({ source: 'bing', imageData: state.bgBingUrl });
        } else {
          Background.fetchBingOfTheDay().then((res) => {
            if (res && res.ok && res.url) {
              state.bgBingUrl = res.url;
              state.bgBingCopyright = res.copyright || '';
              saveSettings();
              Background.load({ source: 'bing', imageData: res.url });
            }
          });
        }
      };
    }
    return null;
  }

  function applyBackground() {
    if (typeof Background !== 'undefined') {
      if (state.bgSource === 'video') {
        Background.load({
          source: 'video',
          volume: state.bgVideoVolume,
          loop: state.bgVideoLoop,
          onEnded: state.bgVideoOnEnded,
          soundOn: state.bgVideoSoundOn,
          onEndCallback: getVideoEndCallback()
        });
        return;
      }
      const data = state.bgSource === 'image'
        ? (state.bgImageData || state.bgImageUrl)
        : state.bgBingUrl;
      Background.load({
        source: state.bgSource,
        imageData: data,
        color: state.bgColor
      });
    }
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
    tabButtons.forEach(btn => {
      const active = btn.dataset.tab === tabName;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    tabPanels.forEach(p => {
      p.hidden = p.dataset.tabPanel !== tabName;
    });
    moveIndicator(tabName);
  }

  function moveIndicator(tabName) {
    if (!tabIndicator) return;
    const activeBtn = panel.querySelector(`.settings-tab[data-tab="${tabName}"]`);
    if (!activeBtn) return;
    const tabsRect = activeBtn.parentElement.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const inset = 14; // px to shrink from each side
    const left = btnRect.left - tabsRect.left + inset;
    const width = Math.max(btnRect.width - inset * 2, 20);
    tabIndicator.style.left = left + 'px';
    tabIndicator.style.width = width + 'px';
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
        applyBackground();
        setBingMeta(state.bgBingCopyright);
        extractAndSaveThemeColor(result.url);
      } finally {
        bgBingRefresh.disabled = false;
      }
    });

    /* --- Image upload --- */
    bgFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        bgFileName.textContent = '请选择图片文件';
        bgFileInput.value = '';
        return;
      }
      bgFileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        /* Clear the URL slot so the upload "wins" — having both stored
           at once caused the two sources to fight for the same field. */
        state.bgImageData = ev.target.result;
        state.bgImageUrl = null;
        saveSettings();
        applyBackground();
        extractAndSaveThemeColor(ev.target.result);
      };
      reader.onerror = () => { bgFileName.textContent = '图片加载失败'; };
      reader.readAsDataURL(file);
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
      saveSettings();
      applyBackground();
      bgFileName.textContent = check.url.length > 40 ? check.url.substring(0, 40) + '...' : check.url;
      extractAndSaveThemeColor(check.url);
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
      setCursorStyleGroupVisible(state.showCursorEffect);
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
      state.bgVideoFileName = file.name;
      Background.saveVideoBlob(file).then(() => {
        saveSettings();
        applyBackground();
      });
    });

    /* --- Video sound toggle --- */
    function toggleVideoSound() {
      state.bgVideoSoundOn = !state.bgVideoSoundOn;
      updateVideoSoundToggle(state.bgVideoSoundOn);
      if (videoVolumeWrapper) videoVolumeWrapper.hidden = !state.bgVideoSoundOn;
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
      if (videoOnEndedWrapper) videoOnEndedWrapper.hidden = state.bgVideoLoop;
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

    /* --- Reset (per-tab) --- */
    resetBtn.addEventListener('click', () => {
      const activeTab = getActiveTab();
      switch (activeTab) {
        case 'bg':
          state.bgSource = DEFAULTS.bgSource;
          state.bgBlur = DEFAULTS.bgBlur;
          state.overlayOpacity = DEFAULTS.overlayOpacity;
          state.overlayColor = DEFAULTS.overlayColor;
          state.bgImageData = DEFAULTS.bgImageData;
          state.bgImageUrl = DEFAULTS.bgImageUrl;
          state.bgBingUrl = DEFAULTS.bgBingUrl;
          state.bgBingCopyright = DEFAULTS.bgBingCopyright;
          state.bgColor = DEFAULTS.bgColor;
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
          setBingMeta('');
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

  /* Extract theme color from an image source and persist it. */
  function extractAndSaveThemeColor(src) {
    if (!Background.extractThemeColor) return;
    Background.extractThemeColor(src).then((color) => {
      if (color) {
        state.bgThemeColor = color;
        saveSettings();
        applyToDom('bgThemeColor', color);
      }
    });
  }

  /* --- Background source selection --- */
  function setBgSource(val) {
    if (state.bgSource === val) return; // 已经选中，不重复操作
    state.bgSource = val;
    updateBgSourceRadios(val);
    setPanelVisible('bing', val === 'bing');
    setPanelVisible('image', val === 'image');
    setPanelVisible('color', val === 'color');
    setPanelVisible('video', val === 'video');

    /* 切换到视频时检查 IndexedDB 中是否已有视频 */
    if (val === 'video') {
      Background.loadVideoBlob().then((blob) => {
        if (blob) {
          const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
          const name = state.bgVideoFileName || '已存储视频';
          bgVideoName.textContent = `${name}（${sizeMB}MB）`;
        } else {
          bgVideoName.textContent = '未选择文件';
        }
      });
    }

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
    if (bgBingMeta) bgBingMeta.textContent = text || '';
  }

  /* Show / clear the URL input error line. Pass empty string to clear. */
  function showUrlError(text) {
    if (!bgUrlError) return;
    if (text) {
      bgUrlError.textContent = text;
      bgUrlError.hidden = false;
      bgUrlInput.setAttribute('aria-invalid', 'true');
    } else {
      bgUrlError.textContent = '';
      bgUrlError.hidden = true;
      bgUrlInput.removeAttribute('aria-invalid');
    }
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
  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    /* Show overlay first, then fade in on next frame so the transition
       actually plays (setting both at once would skip the animation). */
    overlayEl.hidden = false;
    requestAnimationFrame(() => {
      if (overlayEl) overlayEl.style.opacity = '1';
      /* Position the tab indicator after the panel is visible so
         getBoundingClientRect returns correct values. */
      moveIndicator(getActiveTab());
    });
    toggle.style.opacity = '0';
    toggle.style.pointerEvents = 'none';
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    if (overlayEl) overlayEl.style.opacity = '0';
    /* Hide after the fade transition completes — 220ms matches CSS. */
    if (overlayEl) {
      setTimeout(() => {
        /* Guard against reopening during the timeout window. */
        if (!panel.classList.contains('open')) {
          overlayEl.hidden = true;
        }
      }, 240);
    }
    toggle.style.opacity = '';
    toggle.style.pointerEvents = '';
    closeAllDropdowns();
  }

  return {
    init,
    getState: () => state,
    applyAllToDom,
    loadSettings
  };
})();
