/* ============================================
   UniTab - Cursor Effects (multiple styles)

   Nothing here costs anything while the effect is off: the canvas, the window
   listeners and (for the Kivotos style) anime.js + effect-kivotos.js are only
   created / loaded the first time they are actually needed.
   ============================================ */

const CursorEffect = (() => {
  const PALETTE = [
    '#26ccff', '#a255ff', '#ff5599', '#f8ff44',
    '#55ffcc', '#ff8c42', '#5b8dff',
  ];

  let canvas, ctx;
  let running = false;
  let visible = false;
  let style = 'confetti';
  let inited = false;
  let listening = false;
  let rafId = null;
  let mouseX = -1, mouseY = -1;
  let pointerMoved = false; /* the pointer moved since the last frame (star trail) */

  /* ============ Particle Pool ============ */
  const MAX_LIVE = 300; /* performance cap — recycle oldest if exceeded */
  let live = [];
  let pool = [];

  function spawn(x, y, cfg) {
    /* If we hit the cap, recycle the oldest particle immediately */
    const p = pool.length ? pool.pop() : (live.length >= MAX_LIVE ? live.shift() : {});
    if (!p) return;
    p.x = x; p.y = y;
    p.vx = cfg.vx; p.vy = cfg.vy;
    p.r = cfg.r; p.color = cfg.color;
    p.life = 1; p.fade = cfg.fade;
    p.drag = cfg.drag; p.grav = cfg.grav || 0;
    p.wander = cfg.wander || 0;
    p.shape = cfg.shape || 'circle'; /* 'circle' | 'star' */
    live.push(p);
  }

  /* ============ Effect: Confetti (click burst, gravity) ============ */
  function confettiBurst(x, y) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const f = Math.random() * 5 + 2;
      spawn(x, y, {
        vx: Math.cos(a) * f, vy: Math.sin(a) * f - 2,
        r: Math.random() * 3 + 1.5,
        color: PALETTE[i % PALETTE.length],
        fade: 0.012, drag: 0.98, grav: 0.12, wander: 0.08,
        shape: 'circle',
      });
    }
  }

  /* ============ Effect: Rain (gravity drops from click) ============ */
  function rainBurst(x, y) {
    for (let i = 0; i < 15; i++) {
      spawn(x, y, {
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 2 + 1,
        r: Math.random() * 2.5 + 1,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        fade: 0.015, drag: 0.99, grav: 0.06, wander: 0.02,
        shape: 'circle',
      });
    }
  }

  /* ============ Effect: Bubble (rising circles on click) ============ */
  function bubbleBurst(x, y) {
    for (let i = 0; i < 12; i++) {
      spawn(x, y, {
        vx: (Math.random() - 0.5) * 2,
        vy: -(Math.random() * 2.5 + 1),
        r: Math.random() * 5 + 3,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        fade: 0.012, drag: 0.985, grav: -0.02, wander: 0.04,
        shape: 'circle',
      });
    }
  }

  /* ============ Effect: Star (sparkles follow cursor) ============ */
  let lastSX = -1, lastSY = -1;
  function starTrail(x, y) {
    const dx = x - lastSX, dy = y - lastSY;
    if (dx * dx + dy * dy < 25) return;
    lastSX = x; lastSY = y;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const f = Math.random() * 1.5;
      spawn(x, y, {
        vx: Math.cos(a) * f, vy: Math.sin(a) * f - 0.8,
        r: Math.random() * 2.5 + 1.5,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        fade: 0.02, drag: 0.97, grav: -0.01, wander: 0.06,
        shape: 'star',
      });
    }
  }

  /* ============ Render Loop ============ */
  function drawStar4(c, cx, cy, r) {
    const step = Math.PI / 4;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 === 0 ? r : r * 0.35;
      const a = -Math.PI / 2 + i * step;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath();
  }

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.vx += (Math.random() - 0.5) * p.wander;
      p.vy += (Math.random() - 0.5) * p.wander;
      p.vy += p.grav;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      p.life -= p.fade;
      if (p.life <= 0) {
        pool.push(p);
        live[i] = live[live.length - 1];
        live.pop();
        continue;
      }
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      if (p.shape === 'star') {
        drawStar4(ctx, p.x, p.y, p.r);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    /* Continuous effects: the trail only needs a look when the pointer has moved. */
    if (style === 'star' && pointerMoved) {
      pointerMoved = false;
      starTrail(mouseX, mouseY);
    }

    /* Nothing left to draw: stop asking for frames. (The star style used to keep a
       60 fps loop alive for as long as the page was open once the mouse had moved;
       onMove() restarts the loop as soon as there is something to animate again.) */
    if (live.length === 0) {
      running = false;
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    pool.push(...live);
    live = [];
    lastSX = lastSY = -1;
    pointerMoved = false;
  }

  /* ============ Canvas (created on first use) ============ */
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
  }

  /* Assigning width/height clears and re-allocates the backing store, even when the
     value is unchanged, so only touch what changed. */
  function resize() {
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  /* A window drag fires dozens of resize events per frame: resize once per frame. */
  let resizeRaf = 0;
  function onResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      resize();
    });
  }

  /* ============ Events ============ */
  function isInteractive(t) {
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A'
      || tag === 'BUTTON' || tag === 'SELECT') return true;
    if (t.closest && (t.closest('.settings-panel') || t.closest('.settings-overlay'))) return true;
    return false;
  }

  let holdTimer = null;
  let holdX = 0, holdY = 0;

  function spawnAtCursor() {
    if (style === 'confetti') confettiBurst(holdX, holdY);
    else if (style === 'rain') rainBurst(holdX, holdY);
    else if (style === 'bubble') bubbleBurst(holdX, holdY);
    else return;
    startLoop();
  }

  function clearHold() {
    if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
  }

  function onClick(e) {
    if (!visible || isInteractive(e.target)) return;
    holdX = e.clientX; holdY = e.clientY;
    spawnAtCursor();
    /* Start continuous spawn on hold. Only one timer at a time: a second mousedown
       without a mouseup in between used to orphan the first interval, which then
       kept bursting forever. */
    clearHold();
    if (style === 'confetti' || style === 'rain' || style === 'bubble') {
      holdTimer = setInterval(spawnAtCursor, 120);
    }
  }

  function onMove(e) {
    mouseX = e.clientX; mouseY = e.clientY;
    holdX = e.clientX; holdY = e.clientY;
    if (style === 'star') {
      pointerMoved = true;
      startLoop();
    }
  }

  /* The button can be released where we never hear about it (context menu, another
     window, a different tab): all of those end the hold as well. */
  function onUp() { clearHold(); }
  function onVisibility() { if (document.hidden) clearHold(); }

  /* Listeners exist only while the canvas effects are on. */
  function bindListeners() {
    if (listening) return;
    listening = true;
    window.addEventListener('resize', onResize);
    window.addEventListener('mousedown', onClick);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
    window.addEventListener('contextmenu', onUp);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function unbindListeners() {
    if (!listening) return;
    listening = false;
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousedown', onClick);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('blur', onUp);
    window.removeEventListener('contextmenu', onUp);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  /* ============ Kivotos sub-mode (anime.js powered, loaded on demand) ============ */
  let kivotosLoad = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('could not load ' + src));
      document.head.appendChild(el);
    });
  }

  /* Resolves true once KivotosEffect exists and is initialised. */
  function ensureKivotos() {
    if (typeof KivotosEffect !== 'undefined') {
      KivotosEffect.init();
      return Promise.resolve(true);
    }
    if (!kivotosLoad) {
      kivotosLoad = loadScript('lib/anime.min.js')
        .then(() => loadScript('js/effect-kivotos.js'))
        .then(() => { KivotosEffect.init(); return true; })
        .catch((err) => {
          kivotosLoad = null; /* allow a retry the next time it is selected */
          console.warn('UniTab: Kivotos effect unavailable:', err.message);
          return false;
        });
    }
    return kivotosLoad;
  }

  /* ============ Mode ============ */
  function syncMode() {
    if (!inited) return; /* init() applies whatever was set before it ran */
    const wantsKivotos = visible && style === 'kivotos';
    const wantsCanvas = visible && !wantsKivotos;

    if (wantsCanvas) {
      ensureCanvas();
      canvas.hidden = false;
      bindListeners();
    } else {
      stopLoop();
      clearHold();
      unbindListeners();
      if (canvas) canvas.hidden = true;
    }

    if (wantsKivotos) {
      ensureKivotos().then((ok) => {
        /* The user may have switched away while the scripts were loading. */
        if (ok && visible && style === 'kivotos') KivotosEffect.setVisible(true);
      });
    } else if (typeof KivotosEffect !== 'undefined') {
      KivotosEffect.setVisible(false);
    }
  }

  /* ============ Public API ============ */
  function init(initialVisible, initialStyle) {
    if (initialStyle) style = initialStyle;
    visible = !!initialVisible;
    inited = true;
    syncMode();
  }

  function setVisible(on) {
    visible = !!on;
    syncMode();
  }

  function setStyle(s) {
    style = s || 'confetti';
    stopLoop();
    syncMode();
  }

  return { init, setVisible, setStyle };
})();
