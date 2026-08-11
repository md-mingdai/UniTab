/* ============================================
   UniTab - Settings Panel Management
   ============================================ */

const Settings = (() => {
  /* --- Defaults --- */
  const DEFAULTS = {
    engine: 'google',
    bgBlur: 0,
    overlayOpacity: 0,
    overlayColor: '#000000',
    bgImageData: null,
    showSeconds: true
  };

  /* --- State --- */
  let state = { ...DEFAULTS };

  /* --- DOM refs --- */
  let panel, toggle, closeBtn, overlayEl;

  /* Form elements */
  let bgFileInput, bgFileName, bgUrlInput, bgUrlApply;
  let blurSlider, blurDisplay, opacitySlider, opacityDisplay;
  let colorSwatches, customColorTrigger, overlayColorInput, colorHexDisplay;
  let engineSelectWrapper, engineSelectTrigger, engineSelectDropdown, engineSelectLabel, engineSelectNative;
  let showSecondsToggle;
  let resetBtn;

  function init() {
    cacheDom();
    loadSettings();
    bindEvents();
    applyBackground();
  }

  function cacheDom() {
    panel = document.getElementById('settings-panel');
    toggle = document.getElementById('settings-toggle');
    closeBtn = document.getElementById('settings-close');
    overlayEl = document.getElementById('settings-overlay');

    bgFileInput = document.getElementById('bg-file-input');
    bgFileName = document.getElementById('bg-file-name');
    bgUrlInput = document.getElementById('bg-url-input');
    bgUrlApply = document.getElementById('bg-url-apply');
    blurSlider = document.getElementById('bg-blur-slider');
    blurDisplay = document.getElementById('blur-value-display');
    opacitySlider = document.getElementById('overlay-opacity-slider');
    opacityDisplay = document.getElementById('opacity-value-display');

    /* Custom color swatches */
    colorSwatches = document.querySelectorAll('.color-swatch[data-color]:not(.custom-swatch)');
    customColorTrigger = document.getElementById('custom-color-trigger');
    overlayColorInput = document.getElementById('overlay-color-input');
    colorHexDisplay = document.getElementById('color-hex-display');

    /* Custom select */
    engineSelectWrapper = document.getElementById('engine-select-wrapper');
    engineSelectTrigger = document.getElementById('engine-select-trigger');
    engineSelectDropdown = document.getElementById('engine-select-dropdown');
    engineSelectLabel = document.getElementById('engine-select-label');
    engineSelectNative = document.getElementById('engine-select');

    /* Display */
    showSecondsToggle = document.getElementById('show-seconds-toggle');

    resetBtn = document.getElementById('settings-reset');
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
    /* Migration: when this version added showSeconds (default true), the
       field may have been saved as false by an earlier build where it
       hadn't been declared yet. If showSeconds is missing from saved
       settings entirely, treat it as the default (true). If it was
       explicitly saved, respect the user's choice. */
    try {
      const raw = localStorage.getItem('unitab_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !('showSeconds' in parsed)) {
          state.showSeconds = DEFAULTS.showSeconds;
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

    /* Color swatches */
    updateColorSwatches(state.overlayColor);
    overlayColorInput.value = state.overlayColor;
    colorHexDisplay.textContent = state.overlayColor.toUpperCase();

    /* Engine select */
    engineSelectNative.value = state.engine;
    updateEngineLabel(state.engine);
    updateEngineDropdown(state.engine);

    /* Show seconds toggle */
    updateShowSecondsToggle(state.showSeconds);

    bgFileName.textContent = state.bgImageData ? '已设置图片' : '未选择文件';
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
    }
  }

  function applyAllToDom() {
    applyToDom('bgBlur', state.bgBlur);
    applyToDom('overlayOpacity', state.overlayOpacity);
    applyToDom('overlayColor', state.overlayColor);
    applyToDom('engine', state.engine);
    applyToDom('showSeconds', state.showSeconds);
  }

  function applyBackground() {
    if (typeof Background !== 'undefined') {
      Background.load(state.bgImageData);
    }
  }

  /* --- Color Swatches --- */
  function updateColorSwatches(activeColor) {
    colorSwatches.forEach(swatch => {
      const color = swatch.dataset.color;
      swatch.classList.toggle('active', color === activeColor);
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

  /* --- Events --- */
  function bindEvents() {
    /* Panel open/close */
    toggle.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);
    overlayEl.addEventListener('click', closePanel);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        closePanel();
      }
    });

    /* Blur slider */
    blurSlider.addEventListener('input', () => {
      const val = parseInt(blurSlider.value, 10);
      blurDisplay.textContent = val + 'px';
      state.bgBlur = val;
      applyToDom('bgBlur', val);
      saveSettings();
    });

    /* Overlay opacity slider */
    opacitySlider.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value, 10);
      opacityDisplay.textContent = val + '%';
      state.overlayOpacity = val;
      applyToDom('overlayOpacity', val);
      saveSettings();
    });

    /* Color swatches */
    colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const val = swatch.dataset.color;
        overlayColorInput.value = val;
        colorHexDisplay.textContent = val.toUpperCase();
        state.overlayColor = val;
        updateColorSwatches(val);
        applyToDom('overlayColor', val);
        saveSettings();
      });
    });

    /* Custom color trigger */
    customColorTrigger.addEventListener('click', () => {
      overlayColorInput.click();
    });

    overlayColorInput.addEventListener('input', () => {
      const val = overlayColorInput.value;
      colorHexDisplay.textContent = val.toUpperCase();
      state.overlayColor = val;
      updateColorSwatches(val);
      applyToDom('overlayColor', val);
      saveSettings();
    });

    /* Custom engine select */
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

    /* Close dropdown on outside click */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#engine-select-wrapper')) {
        engineSelectDropdown.hidden = true;
        engineSelectTrigger.classList.remove('open');
      }
    });

    /* Show seconds toggle */
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

    /* File upload */
    bgFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      bgFileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.bgImageData = ev.target.result;
        saveSettings();
        applyBackground();
      };
      reader.onerror = () => {
        bgFileName.textContent = '图片加载失败';
      };
      reader.readAsDataURL(file);
    });

    /* URL apply */
    bgUrlApply.addEventListener('click', () => {
      const url = bgUrlInput.value.trim();
      if (!url) return;
      state.bgImageData = url;
      saveSettings();
      applyBackground();
      bgFileName.textContent = url.length > 40 ? url.substring(0, 40) + '...' : url;
    });

    /* Reset */
    resetBtn.addEventListener('click', () => {
      state = { ...DEFAULTS };
      saveSettings();
      syncFormToState();
      applyAllToDom();
      applyBackground();
      bgUrlInput.value = '';
    });
  }

  function closeAllDropdowns() {
    if (engineSelectDropdown) {
      engineSelectDropdown.hidden = true;
    }
    if (engineSelectTrigger) {
      engineSelectTrigger.classList.remove('open');
    }
  }

  /* --- Panel state --- */
  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    overlayEl.hidden = false;
    toggle.style.opacity = '0';
    toggle.style.pointerEvents = 'none';
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    overlayEl.hidden = true;
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
