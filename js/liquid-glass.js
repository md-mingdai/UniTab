/* ============================================
   UniTab - Liquid Glass engine

   The look is Apple's "Liquid Glass": a pane that behaves like a thick piece of
   curved glass rather than a sheet of frosted plastic. Three things cooperate here
   (the colours, shadows and layout live in css/liquid-glass.css):

   1. OPTICS - every pane is ONE element whose `backdrop-filter` is an SVG filter:
        - an edge band (the "bezel") refracts the wallpaper like the rim of a lens
          (feDisplacementMap, driven by a generated displacement map),
        - inside the bezel the glass is frosted (blur), so text sits on a calm field,
        - a generated rim image paints the specular highlight and the inner glow, lit
          from the top left, wrapping round the corners.
      The maps only depend on a pane's size and corner radius: they are generated once
      per size (a canvas -> PNG blob), cached, and swapped in when the size changes.
      Browsers that cannot run an SVG filter as a backdrop-filter (Firefox, Safari)
      keep the same material with a plain CSS blur instead of refraction.

   2. ADAPTATION - Apple lets small glass elements flip between a light and a dark
      look depending on what is behind them. The wallpaper is sampled into a coarse
      colour field; for each group of panes the engine measures what sits behind it
      and picks the look (dark glass + white ink, or light glass + navy ink) that
      needs the least tint to keep text at its target contrast, then solves for that
      tint. That is the balance between "liquid" (as clear as the text allows) and
      legible (never below the target), instead of one fixed smoky pane.

   3. HAND-OFF - the result is written as one small <style id="lg-tokens"> (ink, tint
      and alpha per pane) and cached in localStorage, so boot.js can replay it before
      the very first paint.

   Nothing here runs unless <html data-glass="liquid">.
   ============================================ */

const LiquidGlass = (() => {
  'use strict';

  const root = document.documentElement;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CACHE_KEY = 'unitab_lg';
  const STYLE_ID = 'lg-tokens';

  /* ------------------------------------------------------------------
     What is glass
     ------------------------------------------------------------------ */

  /* One entry per pane. `group` panes share a light/dark decision (a suggestion list
     must match the search box it hangs from). `scrim` is the black that is already
     laid over the wallpaper where the pane sits (settings overlay, dialog overlay).
     `weight` is how much the pane counts in its group's decision. */
  const PANES = [
    { key: 'search', sel: '.search-container',     group: 'search', weight: 1.0, scrim: 0 },
    { key: 'menu',   sel: '.suggestions-dropdown', group: 'search', weight: 0.5, scrim: 0 },
    { key: 'dock',   sel: '.bookmarks-container',  group: 'dock',   weight: 1.0, scrim: 0 },
    { key: 'toggle', sel: '.settings-toggle',      group: 'toggle', weight: 1.0, scrim: 0 },
    { key: 'panel',  sel: '.settings-panel',       group: 'panel',  weight: 1.0, scrim: 0.30 },
    { key: 'dialog', sel: '.confirm-dialog-body',  group: 'panel',  weight: 0.5, scrim: 0.55 },
  ];

  /* `carry`: the elements that receive the group's ink/tint tokens (everything inside
     inherits them). `target`: contrast the text on this group must reach, measured
     for the group's weakest everyday text (`inkA` = its alpha). `lightBias`: extra
     cost of the light look - big panes prefer to stay dark, as in iOS, unless the
     light look is clearly better. */
  const GROUPS = {
    search: { carry: ['.search-stack'],        target: 3.8, inkA: 0.66, lightBias: 0.00 },
    dock:   { carry: ['.bookmarks-container'], target: 4.5, inkA: 0.80, lightBias: 0.00 },
    toggle: { carry: ['.settings-toggle'],     target: 3.0, inkA: 0.86, lightBias: 0.00 },
    panel:  { carry: ['.settings-panel', '.confirm-dialog-body'], target: 4.2, inkA: 0.72, lightBias: 0.10 },
  };
  const CLOCK = { sel: '.clock', target: 4.5, inkA: 0.96 };

  /* The two looks. Colours as [r, g, b]; every number the contrast model needs is
     here, and the same values are written into the stylesheet, so the model and what
     is painted cannot drift apart. */
  const TONES = {
    dark: {
      ink: [255, 255, 255], tint: [9, 13, 24],
      sat: 1.5, bright: 1.04, haze: 0.05,     /* haze: average white sheen over the pane */
      aMin: 0.07, aMax: 0.72,                 /* tint alpha limits */
      sheen: 0.15, sh: '2 6 16', shk: 1, hair: '255 255 255 / 0.10',
      focus: '180 200 255',
    },
    light: {
      ink: [12, 20, 42], tint: [255, 255, 255],
      sat: 1.10, bright: 1.08, haze: 0.10,    /* little saturation boost: light glass over a vivid sky turns to candy otherwise */
      aMin: 0.22, aMax: 0.78,
      sheen: 0.30, sh: '24 36 70', shk: 0.72, hair: '20 30 60 / 0.07',
      focus: '40 90 200',
    },
  };

  /* ------------------------------------------------------------------
     Optics (tweakable at runtime for tuning: LiquidGlass.optics.shift = 0.3, then refresh())
     ------------------------------------------------------------------ */
  const OPTICS = {
    bezelRatio: 0.30, bezelMin: 8, bezelMax: 18,  /* bezel width = clamp(short side * ratio) px */
    shift: 0.40,       /* peak refraction, in bezel widths. Keep < 0.5: beyond that the rim inverts */
    profile: 'cos',    /* 'cos': eased, no stretching right at the rim | 'pow': (1 - d/bezel)^falloff, steeper */
    falloff: 2,
    rimBlur: 1.5,      /* px: softens the refracted rim (magnified detail would otherwise alias into stripes) */
    maskFrom: 0.22, maskTo: 0.80,  /* frost fades in between these distances from the rim (bezels) */
    light: [-0.62, -0.78],         /* unit-ish vector pointing at the light (top left) */
    shade: {
      dark:  { glow: 0.40, shadow: 0.10, spec: 0.95 },
      light: { glow: 0.28, shadow: 0.16, spec: 0.85 },
    },
  };
  const PAD = 96;      /* filter region grows beyond the pane so a stale map never leaves a gap */

  /* ------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });

  /* sRGB byte -> linear light, sampled every 0.25 (fast WCAG luminance) */
  const LIN = new Float32Array(1021);
  for (let i = 0; i < LIN.length; i++) {
    const c = i / 4 / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const lum = (r, g, b) => 0.2126 * LIN[(r * 4 + 0.5) | 0] + 0.7152 * LIN[(g * 4 + 0.5) | 0] + 0.0722 * LIN[(b * 4 + 0.5) | 0];
  const ratio = (a, b) => (a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05));

  /* ------------------------------------------------------------------
     Capability
     ------------------------------------------------------------------ */
  /* An SVG filter as a backdrop-filter is a Chromium feature (Chrome, Edge, Brave, Opera, ...). */
  const isChromium = /Chrome\//.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent);
  const hasBackdrop = !!(window.CSS && CSS.supports && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')));
  const mqDark = mq('(prefers-color-scheme: dark)');
  const mqContrast = mq('(prefers-contrast: more)');
  const mqSolid = mq('(prefers-reduced-transparency: reduce)');
  const lensOn = () => isChromium && hasBackdrop && !mqSolid.matches;

  /* ------------------------------------------------------------------
     1. Maps
     ------------------------------------------------------------------ */

  /* Width of the refracting rim. Never wider than the corner radius (down to bezelMin): the
     pull at a rounded corner runs along the nearest edge, which flips along the diagonal
     that starts one radius in; with the rim narrower than that it is already zero there. */
  const bezelFor = (w, h, r) => clamp(
    Math.round(Math.min(w, h) * OPTICS.bezelRatio),
    OPTICS.bezelMin,
    Math.max(OPTICS.bezelMin, Math.min(OPTICS.bezelMax, r))
  );

  /* Rounded-rect geometry for pixel centre (px, py) relative to the middle of a w*h box:
     distance in from the edge, and the outward normal there. Written into `out`. */
  function edgeAt(px, py, hw, hh, r, out) {
    const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
    const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
    const outer = Math.sqrt(ox * ox + oy * oy);
    out.d = r - outer - Math.min(Math.max(qx, qy), 0);
    if (qx > 0 && qy > 0) { out.nx = (px < 0 ? -1 : 1) * qx / outer; out.ny = (py < 0 ? -1 : 1) * qy / outer; }
    else if (qx > qy) { out.nx = px < 0 ? -1 : 1; out.ny = 0; }
    else { out.nx = 0; out.ny = py < 0 ? -1 : 1; }
  }

  /* Displacement + frost map, one PNG: R,G = which way (and how far) the wallpaper is
     pulled at this pixel (128 = not at all), B = how frosted the pixel is (255 = fully). */
  function lensMap(w, h, r, B) {
    const img = new ImageData(w, h), D = img.data;
    for (let i = 0; i < D.length; i += 4) { D[i] = 128; D[i + 1] = 128; D[i + 2] = 255; D[i + 3] = 255; }
    const hw = w / 2, hh = h / 2, e = { d: 0, nx: 0, ny: 0 };
    const m0 = B * OPTICS.maskFrom, m1 = B * OPTICS.maskTo;
    const reach = Math.ceil(Math.max(B, m1)) + 1;
    const p = OPTICS.falloff, cosine = OPTICS.profile === 'cos';
    for (let y = 0; y < h; y++) {
      const edgeRow = Math.min(y + 0.5, h - y - 0.5) < reach;
      for (let x = 0; x < w; x++) {
        if (!edgeRow && x === reach) x = Math.max(reach, w - reach); /* skip the untouched middle */
        edgeAt(x + 0.5 - hw, y + 0.5 - hh, hw, hh, r, e);
        const i = (y * w + x) * 4;
        if (e.d < B) {
          const t = e.d <= 0 ? 0 : e.d / B;
          const m = cosine ? 0.5 * (1 + Math.cos(Math.PI * t)) : Math.pow(1 - t, p);
          D[i] = Math.round(128 - 127 * e.nx * m);
          D[i + 1] = Math.round(128 - 127 * e.ny * m);
        }
        D[i + 2] = Math.round(255 * smoothstep(m0, m1, e.d));
      }
    }
    return img;
  }

  /* Rim image, drawn at device resolution so the 1px highlight stays crisp on retina:
     a thin specular line, an inner glow on the lit side and a soft shade on the far
     side. Brightest where the edge faces the light (top left) and, weaker, opposite. */
  function shadeMap(w, h, r, B, tone, s) {
    const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
    const img = new ImageData(W, H), P = img.data;
    const k = OPTICS.shade[tone], L = OPTICS.light;
    const hw = W / 2, hh = H / 2, R = Math.min(r * s, hw, hh), e = { d: 0, nx: 0, ny: 0 };
    const depth = B * 0.9 * s;
    const half = Math.min(hw, hh);                  /* the middle of a thin pane lies this far in */
    /* The nearest edge flips along the medial axis - the centre line of a thin pane and the
       diagonal that runs in from each rounded corner, starting one radius in - and so would
       the lit/shaded side. The glow therefore has to be gone before it gets there, or it
       leaves a crease. */
    const fadeEnd = Math.min(Math.max(R, 6 * s), 0.65 * half), fadeStart = 0.35 * fadeEnd;
    const reach = Math.ceil(Math.min(Math.max(fadeEnd, 14 * s), half)) + 1;
    for (let y = 0; y < H; y++) {
      const edgeRow = Math.min(y + 0.5, H - y - 0.5) < reach;
      for (let x = 0; x < W; x++) {
        if (!edgeRow && x === reach) x = Math.max(reach, W - reach);
        edgeAt(x + 0.5 - hw, y + 0.5 - hh, hw, hh, R, e);
        const d = e.d;
        if (d < -0.5) continue;
        const cover = d < 0.5 ? d + 0.5 : 1;          /* anti-aliased outer edge */
        const dc = Math.max(d, 0) / s;                  /* css px from the edge */
        const nl = e.nx * L[0] + e.ny * L[1];           /* >0: edge faces the light */
        const bevel = Math.exp(-d / depth) * (1 - smoothstep(fadeStart, fadeEnd, d));
        let wa = 0, ka = 0;
        if (nl > 0) wa = Math.pow(nl, 1.2) * bevel * k.glow; else ka = Math.pow(-nl, 1.2) * bevel * k.shadow;
        const lit = nl > 0 ? Math.pow(nl, 1.5) : 0.55 * Math.pow(-nl, 1.5);
        const spec = lit * k.spec * (Math.exp(-dc * dc / 1.1) + 0.23 * Math.exp(-dc / 2.6));
        const aw = Math.min(1, wa + spec), kk = ka * (1 - aw), a = (aw + kk) * cover;
        if (a <= 0) continue;
        const i = (y * W + x) * 4;
        P[i] = P[i + 1] = P[i + 2] = Math.round(255 * aw / (aw + kk));
        P[i + 3] = Math.round(a * 255);
      }
    }
    return img;
  }

  function toBlobURL(img) {
    return new Promise((resolve) => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').putImageData(img, 0, 0);
      c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : ''), 'image/png');
    });
  }

  /* key -> Promise<blob url>; entries still used by a pane are never evicted */
  const assets = new Map();
  function asset(key, make) {
    let p = assets.get(key);
    if (!p) { p = make(); assets.set(key, p); trimAssets(); }
    return p;
  }
  function trimAssets() {
    if (assets.size <= 48) return;
    const used = new Set();
    panes.forEach((S) => { used.add('L' + S.lensKey); used.add('S' + S.shadeKey); });
    for (const [key, p] of assets) {
      if (assets.size <= 36) break;
      if (used.has(key)) continue;
      assets.delete(key);
      p.then((url) => url && setTimeout(() => URL.revokeObjectURL(url), 4000));
    }
  }

  /* ------------------------------------------------------------------
     2. Panes: filters, maps, geometry
     ------------------------------------------------------------------ */
  const panes = new Map();   /* element -> pane state */
  let svg = null, defs = null, uid = 0;
  let active = false;

  function ensureSvg() {
    if (svg) return;
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function makeFilter(S) {
    ensureSvg();
    S.id = 'lg-' + (++uid);
    defs.insertAdjacentHTML('beforeend',
      '<filter id="' + S.id + '" x="0" y="0" width="1" height="1" filterUnits="userSpaceOnUse"' +
      ' primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' +
      '<feFlood flood-color="rgb(128,128,255)" result="flat"/>' +
      '<feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="img"/>' +
      '<feMerge result="m"><feMergeNode in="flat"/><feMergeNode in="img"/></feMerge>' +
      '<feDisplacementMap in="SourceGraphic" in2="m" scale="1" xChannelSelector="R" yChannelSelector="G" result="disp"/>' +
      '<feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="mk"/>' +
      '<feGaussianBlur in="disp" stdDeviation="1" result="rim"/>' +
      '<feGaussianBlur in="disp" stdDeviation="8" edgeMode="duplicate" result="blur"/>' +
      '<feComposite in="blur" in2="mk" operator="in" result="blurM"/>' +
      '<feComposite in="blurM" in2="rim" operator="over"/>' +
      '</filter>');
    S.filter = defs.lastElementChild;
    S.fImg = S.filter.querySelector('feImage');
    S.fDisp = S.filter.querySelector('feDisplacementMap');
    const blurs = S.filter.querySelectorAll('feGaussianBlur');
    S.fRim = blurs[0];
    S.fBlur = blurs[1];
  }

  function dropFilter(S) {
    if (S.filter) S.filter.remove();
    S.filter = S.fImg = S.fDisp = S.fRim = S.fBlur = null;
    S.lensKey = S.shadeKey = '';
    S.el.style.removeProperty('--lg-lens');
    S.el.style.removeProperty('--lg-shade');
  }

  function paneFor(el) {
    let S = panes.get(el);
    if (!S) {
      const def = PANES.find((p) => el.matches(p.sel));
      S = { el, def, id: '', filter: null, lensKey: '', shadeKey: '', token: 0, frost: 10 };
      panes.set(el, S);
    }
    return S;
  }

  /* Bring one pane's filter and rim image in line with its current size, radius and
     look. Async (PNG encoding); a newer call supersedes an older one still waiting. */
  async function refreshPane(S) {
    const el = S.el;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;                       /* display:none - done when it shows */
    const cs = getComputedStyle(el);
    const r0 = parseFloat(cs.borderTopLeftRadius);
    const r = clamp(isNaN(r0) ? 0 : r0, 0, Math.min(w, h) / 2);
    const frost = parseFloat(cs.getPropertyValue('--lg-frost')) || 10;
    const dpr = Math.round((window.devicePixelRatio || 1) * 4) / 4;
    const B = bezelFor(w, h, r);
    const tone = state.tone[S.def.group] || 'dark';
    const lensKey = w + 'x' + h + 'r' + r + 'B' + B + OPTICS.profile + OPTICS.falloff + 'm' + OPTICS.maskFrom + '-' + OPTICS.maskTo;
    const shadeKey = w + 'x' + h + 'r' + r + 'B' + B + 'd' + dpr + tone + JSON.stringify(OPTICS.shade[tone]) + OPTICS.light;
    const token = ++S.token;

    if (lensOn()) {
      const url = await asset('L' + lensKey, () => toBlobURL(lensMap(w, h, r, B)));
      if (token !== S.token || !active) return;
      if (!S.filter) makeFilter(S);
      S.filter.setAttribute('width', w + PAD);
      S.filter.setAttribute('height', h + PAD);
      S.fImg.setAttribute('href', url);
      S.fImg.setAttribute('width', w);
      S.fImg.setAttribute('height', h);
      S.fDisp.setAttribute('scale', (2 * OPTICS.shift * B).toFixed(2));
      S.fBlur.setAttribute('stdDeviation', frost);
      S.fRim.setAttribute('stdDeviation', OPTICS.rimBlur);
      S.lensKey = lensKey;
      el.style.setProperty('--lg-lens', 'url(#' + S.id + ')');
    } else if (S.filter) {
      dropFilter(S);
    }

    const sUrl = await asset('S' + shadeKey, () => toBlobURL(shadeMap(w, h, r, B, tone, dpr)));
    if (token !== S.token || !active) return;
    S.shadeKey = shadeKey;
    el.style.setProperty('--lg-shade', 'url("' + sUrl + '")');
    el.setAttribute('data-lg', '');
  }

  const dirty = new Set();
  let mapRaf = 0;
  function queuePane(S) {
    dirty.add(S);
    if (!mapRaf) mapRaf = requestAnimationFrame(flushPanes);
  }
  async function flushPanes() {
    mapRaf = 0;
    const batch = Array.from(dirty);
    dirty.clear();
    for (const S of batch) { if (active) await refreshPane(S); }
  }
  function queueAll() { panes.forEach(queuePane); }

  /* Until the maps for a new size exist, stretch the current ones over the new box. The
     rim then stays on the edge while a pane morphs in height or a window is dragged,
     instead of staying where the old edge was (or leaving a strip with no filter at all). */
  function stretch(S) {
    if (!S.filter) return;
    const w = S.el.offsetWidth, h = S.el.offsetHeight;
    if (!w || !h) return;
    S.filter.setAttribute('width', w + PAD);
    S.filter.setAttribute('height', h + PAD);
    S.fImg.setAttribute('width', w);
    S.fImg.setAttribute('height', h);
  }

  /* A size that is still changing is not worth a new image per frame: wait until it settles. */
  function queueSettled(S) {
    clearTimeout(S.settle);
    S.settle = setTimeout(() => { if (active) queuePane(S); }, 140);
  }

  /* ------------------------------------------------------------------
     3. What is behind the glass: the wallpaper as a coarse colour field
     ------------------------------------------------------------------ */
  let baseCache = { key: '', canvas: null };
  const makeCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  function bgUrl(el) {
    const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(el).backgroundImage || '');
    return m ? m[1] : '';
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = url;
    });
  }

  /* The wallpaper exactly as it sits in the viewport (cover-fit), one canvas pixel per
     `cell` px. Tries the video frame, the photo, then the stored preview (same-origin
     blobs, so the canvas stays readable); falls back to the plain colour. */
  async function baseCanvas(gw, gh, cell) {
    const bgEl = $('background-image');
    const photo = $('background-photo'), prev = $('background-preview'), video = $('background-video');
    const cands = [];
    if (video && !video.classList.contains('hidden') && video.readyState >= 2 && video.videoWidth) {
      cands.push({ kind: 'video', el: video, url: 'video' });
    }
    if (photo && photo.classList.contains('is-ready')) { const u = bgUrl(photo); if (u) cands.push({ kind: 'image', url: u }); }
    if (prev && prev.classList.contains('is-ready')) { const u = bgUrl(prev); if (u) cands.push({ kind: 'image', url: u }); }
    const under = bgEl ? getComputedStyle(bgEl).backgroundColor : 'rgba(0,0,0,0)';
    const box = bgEl ? bgEl.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };

    const paintBase = (cx) => {
      cx.fillStyle = '#1b1f2a';           /* the stylesheet's default backdrop */
      cx.fillRect(0, 0, gw, gh);
      cx.fillStyle = under;
      cx.fillRect(0, 0, gw, gh);
    };

    for (const c of cands) {
      const key = [c.kind, c.url, gw, gh, under, Math.round(box.width), Math.round(box.height)].join('|');
      if (c.kind === 'image' && baseCache.key === key) return baseCache.canvas;
      let drawable = c.el, nw = 0, nh = 0;
      if (c.kind === 'video') { nw = drawable.videoWidth; nh = drawable.videoHeight; }
      else {
        drawable = await loadImage(c.url);
        if (!drawable) continue;
        nw = drawable.naturalWidth; nh = drawable.naturalHeight;
      }
      if (!nw || !nh) continue;
      /* two steps (4x oversampled first) so the average is a real average, not 4 samples */
      const mid = makeCanvas(gw * 4, gh * 4), mx = mid.getContext('2d');
      mx.imageSmoothingQuality = 'high';
      const sc = Math.max(box.width / nw, box.height / nh);
      const dw = nw * sc, dh = nh * sc;
      mx.drawImage(drawable, (box.left + (box.width - dw) / 2) * 4 / cell, (box.top + (box.height - dh) / 2) * 4 / cell, dw * 4 / cell, dh * 4 / cell);
      const out = makeCanvas(gw, gh), cx = out.getContext('2d', { willReadFrequently: true });
      paintBase(cx);
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(mid, 0, 0, gw, gh);
      try { cx.getImageData(0, 0, 1, 1); } catch (e) { continue; }   /* cross-origin: tainted */
      if (c.kind === 'image') baseCache = { key, canvas: out };
      return out;
    }
    const out = makeCanvas(gw, gh), cx = out.getContext('2d', { willReadFrequently: true });
    paintBase(cx);
    return out;
  }

  const num = (name, fallback) => {
    const v = parseFloat(root.style.getPropertyValue(name));
    return isNaN(v) ? fallback : v;
  };

  /* Field = { cell, gw, gh, data: Float32Array(r,g,b per cell, 0..255), blurred: Map } */
  async function readField() {
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    const cell = clamp(Math.round(Math.max(vw, vh) / 110), 6, 20);
    const gw = Math.ceil(vw / cell), gh = Math.ceil(vh / cell);
    const canvas = await baseCanvas(gw, gh, cell);
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, gw, gh).data;
    const data = new Float32Array(gw * gh * 3);
    for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { data[j] = px[i]; data[j + 1] = px[i + 1]; data[j + 2] = px[i + 2]; }

    /* the overlay (opacity slider + colour) sits above the wallpaper */
    const oa = clamp(num('--overlay-opacity', 0) / 100, 0, 1);
    if (oa > 0) {
      const ctx = makeCanvas(1, 1).getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillStyle = root.style.getPropertyValue('--overlay-color').trim() || '#000';
      ctx.fillRect(0, 0, 1, 1);
      const o = ctx.getImageData(0, 0, 1, 1).data;
      for (let j = 0; j < data.length; j += 3) {
        data[j] += (o[0] - data[j]) * oa; data[j + 1] += (o[1] - data[j + 1]) * oa; data[j + 2] += (o[2] - data[j + 2]) * oa;
      }
    }
    const bf = /blur\(([\d.]+)px\)/.exec(root.style.getPropertyValue('--bg-filter'));
    return { cell, gw, gh, data, wallpaperBlur: bf ? parseFloat(bf[1]) : 0, blurred: new Map() };
  }

  /* Gaussian blur of the field (what the frost does to the wallpaper), sigma in cells. */
  function blurredField(f, sigma) {
    if (sigma < 0.35) return f.data;
    const key = sigma.toFixed(2);
    let out = f.blurred.get(key);
    if (out) return out;
    const rad = Math.ceil(sigma * 2.6), ker = new Float32Array(rad * 2 + 1);
    let sum = 0;
    for (let i = -rad; i <= rad; i++) { ker[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += ker[i + rad]; }
    for (let i = 0; i < ker.length; i++) ker[i] /= sum;
    const { gw, gh, data } = f, tmp = new Float32Array(data.length);
    out = new Float32Array(data.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) for (let c = 0; c < 3; c++) {
      let a = 0;
      for (let k = -rad; k <= rad; k++) a += ker[k + rad] * data[(y * gw + clamp(x + k, 0, gw - 1)) * 3 + c];
      tmp[(y * gw + x) * 3 + c] = a;
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) for (let c = 0; c < 3; c++) {
      let a = 0;
      for (let k = -rad; k <= rad; k++) a += ker[k + rad] * tmp[(clamp(y + k, 0, gh - 1) * gw + x) * 3 + c];
      out[(y * gw + x) * 3 + c] = a;
    }
    f.blurred.set(key, out);
    return out;
  }

  /* ------------------------------------------------------------------
     4. The contrast model
     ------------------------------------------------------------------ */

  /* Where a pane's text sits, as an inner rectangle in viewport px (the refracting rim
     carries no text). Panes that are not on screen yet are placed where they will open. */
  function paneRect(def, byKey) {
    const els = qa(def.sel);
    const el = els.find((e) => e.offsetWidth > 0) || els[0];
    const vw = innerWidth, vh = innerHeight;
    let x, y, w, h;
    if (el && el.offsetWidth > 0) {
      w = el.offsetWidth; h = el.offsetHeight;
      if (def.key === 'panel' || def.key === 'dialog') { x = (vw - w) / 2; y = (vh - h) / 2; }
      else { const r = el.getBoundingClientRect(); x = r.left; y = r.top; }
    } else if (def.key === 'menu' && byKey.search) {
      const s = byKey.search; x = s.x; y = s.y + s.h + 8; w = s.w; h = 280;
    } else if (def.key === 'dialog') {
      w = Math.min(380, vw * 0.9); h = 220; x = (vw - w) / 2; y = (vh - h) / 2;
    } else return null;
    return { x, y, w, h };
  }

  /* Samples (after the frost and the look's own saturate/brightness) under a pane. */
  function paneSamples(f, rect, sigmaPx, T, scrim) {
    const B = bezelFor(rect.w, rect.h, Infinity);
    const inset = Math.min(B + 6, Math.min(rect.w, rect.h) / 2 - 2);
    const x0 = rect.x + inset, x1 = rect.x + rect.w - inset, y0 = rect.y + inset, y1 = rect.y + rect.h - inset;
    const data = blurredField(f, Math.hypot(sigmaPx, f.wallpaperBlur) / f.cell);
    const gx0 = clamp(Math.floor(x0 / f.cell), 0, f.gw - 1), gx1 = clamp(Math.ceil(x1 / f.cell) - 1, gx0, f.gw - 1);
    const gy0 = clamp(Math.floor(y0 / f.cell), 0, f.gh - 1), gy1 = clamp(Math.ceil(y1 / f.cell) - 1, gy0, f.gh - 1);
    const n = (gx1 - gx0 + 1) * (gy1 - gy0 + 1), out = new Float32Array(n * 3);
    /* the CSS saturate() matrix, then brightness(); the scrim is already part of the backdrop */
    const s = T.sat;
    const m00 = 0.213 + 0.787 * s, m01 = 0.715 - 0.715 * s, m02 = 0.072 - 0.072 * s;
    const m10 = 0.213 - 0.213 * s, m11 = 0.715 + 0.285 * s, m12 = 0.072 - 0.072 * s;
    const m20 = 0.213 - 0.213 * s, m21 = 0.715 - 0.715 * s, m22 = 0.072 + 0.928 * s;
    const keep = (1 - scrim) * T.bright;
    let o = 0;
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
      const i = (y * f.gw + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2];
      out[o++] = clamp((m00 * r + m01 * g + m02 * b) * keep, 0, 255);
      out[o++] = clamp((m10 * r + m11 * g + m12 * b) * keep, 0, 255);
      out[o++] = clamp((m20 * r + m21 * g + m22 * b) * keep, 0, 255);
    }
    return { px: out, n };
  }

  /* Worst-case (low percentile) contrast of the ink over the glass at tint alpha `a`. */
  function worstContrast(S, T, a, inkA, pct, buf) {
    const { px, n } = S, tr = T.tint[0], tg = T.tint[1], tb = T.tint[2], h = T.haze;
    const ir = T.ink[0], ig = T.ink[1], ib = T.ink[2];
    for (let i = 0; i < n; i++) {
      let r = px[i * 3] * (1 - a) + tr * a, g = px[i * 3 + 1] * (1 - a) + tg * a, b = px[i * 3 + 2] * (1 - a) + tb * a;
      r += (255 - r) * h; g += (255 - g) * h; b += (255 - b) * h;
      const yl = lum(r, g, b);
      const yi = lum(r + (ir - r) * inkA, g + (ig - g) * inkA, b + (ib - b) * inkA);
      buf[i] = ratio(yi, yl);
    }
    const v = buf.subarray(0, n).sort();
    return v[Math.min(n - 1, Math.floor(n * pct))];
  }

  /* Smallest tint alpha that reaches the target contrast (bisection; contrast rises with alpha). */
  function solveAlpha(S, T, target, inkA, pct) {
    const buf = new Float32Array(S.n);
    const lo = T.aMin, hi = T.aMax;
    const wLo = worstContrast(S, T, lo, inkA, pct, buf);
    if (wLo >= target) return { a: lo, ok: true, worst: wLo };
    const wHi = worstContrast(S, T, hi, inkA, pct, buf);
    if (wHi < target) return { a: hi, ok: false, worst: wHi };
    let a0 = lo, a1 = hi;
    for (let i = 0; i < 9; i++) {
      const mid = (a0 + a1) / 2;
      if (worstContrast(S, T, mid, inkA, pct, buf) >= target) a1 = mid; else a0 = mid;
    }
    return { a: a1, ok: true, worst: target };
  }

  /* ------------------------------------------------------------------
     5. Decide, write, cache
     ------------------------------------------------------------------ */
  const state = {
    tone: { search: 'dark', dock: 'dark', toggle: 'dark', panel: 'dark', clock: 'dark' },
    alpha: { search: 0.3, menu: 0.3, dock: 0.3, toggle: 0.3, panel: 0.4, dialog: 0.4 },
    clockShadow: 0.3,
    detail: {},
  };

  function toneBlock(tone) {
    const T = TONES[tone];
    return '--fg-rgb:' + T.ink.join(' ') + ';--lg-tint:' + T.tint.join(' ') + ';--lg-sat:' + T.sat + ';--lg-bright:' + T.bright +
      ';--lg-sheen:' + T.sheen + ';--lg-sh:' + T.sh + ';--lg-shk:' + T.shk + ';--lg-hair:' + T.hair +
      ';--lg-focus:' + T.focus + ';';
  }

  function tokensCSS() {
    const H = ':root[data-glass="liquid"] ';
    let css = '';
    for (const g in GROUPS) css += H + ':is(' + GROUPS[g].carry.join(',') + '){' + toneBlock(state.tone[g]) + '}\n';
    PANES.forEach((p) => { css += H + p.sel + '{--lg-a:' + state.alpha[p.key].toFixed(3) + '}\n'; });
    const ck = TONES[state.tone.clock], k = state.clockShadow.toFixed(2);
    const sh = state.tone.clock === 'dark'
      ? '0 1px 2px rgb(0 0 0 / .22),0 2px 22px rgb(0 0 0 / ' + k + ')'
      : '0 1px 0 rgb(255 255 255 / .35),0 2px 20px rgb(255 255 255 / ' + k + ')';
    css += H + CLOCK.sel + '{--fg-rgb:' + ck.ink.join(' ') + ';--lg-text-shadow:' + sh + '}\n';
    return css;
  }

  function cacheKey() {
    const g = (n) => root.style.getPropertyValue(n).trim();
    const theme = g('--bg-theme-color');
    return [theme === 'transparent' ? '' : theme, g('--overlay-opacity'), g('--overlay-color'), g('--bg-filter'),
      mqDark.matches ? 'd' : 'l', Math.round(innerWidth / 320), Math.round(innerHeight / 320)].join('|');
  }

  function publish(snap) {
    let el = $(STYLE_ID);
    if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el); }
    if (snap) root.classList.add('lg-snap');     /* tone changed: swap at once, do not fade through grey */
    const css = tokensCSS();
    el.textContent = css;
    const tones = {};
    for (const g in state.tone) { root.setAttribute('data-lg-' + g, state.tone[g]); tones[g] = state.tone[g]; }
    if (snap) { void root.offsetWidth; requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('lg-snap'))); }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ k: cacheKey(), css, tones })); } catch (e) { /* storage unavailable */ }
  }

  /* "Increase contrast": a denser floor, and room to go well past the usual ceiling so the
     raised target can actually be reached. */
  const effective = (T, hi) => (hi
    ? Object.assign({}, T, { aMin: Math.max(T.aMin, 0.45), aMax: Math.max(T.aMax, 0.94) })
    : T);

  let solving = false, again = false, timer = 0;
  function scheduleSolve(delay) {
    clearTimeout(timer);
    timer = setTimeout(solve, delay == null ? 90 : delay);
  }

  async function solve() {
    if (!active) return;
    if (solving) { again = true; return; }
    solving = true;
    try {
      const field = await readField();
      if (!active) return;
      const hi = mqContrast.matches;
      const byKey = {}, rects = {};
      PANES.forEach((p) => { const r = paneRect(p, byKey); if (r) { rects[p.key] = r; byKey[p.key] = r; } });
      const prev = Object.assign({}, state.tone);
      const detail = {};
      let flipped = false;

      for (const g in GROUPS) {
        const G = GROUPS[g], members = PANES.filter((p) => p.group === g && rects[p.key]);
        if (!members.length) continue;
        const target = G.target + (hi ? 2.5 : 0);
        const res = {};
        const cost = {};
        for (const tone of ['dark', 'light']) {
          const Tt = effective(TONES[tone], hi);
          let c = 0, wsum = 0;
          res[tone] = {};
          for (const p of members) {
            const sigma = parseFloat(getComputedStyle(document.querySelector(p.sel) || root).getPropertyValue('--lg-frost')) || 10;
            const S = paneSamples(field, rects[p.key], sigma, Tt, p.scrim);
            const r = solveAlpha(S, Tt, target, G.inkA, 0.06);
            res[tone][p.key] = r;
            c += p.weight * (Math.max(r.a, Tt.aMin) + (r.ok ? 0 : 0.6 + (target - r.worst) * 0.15));
            wsum += p.weight;
          }
          cost[tone] = c / wsum;
        }
        cost.light += G.lightBias;
        cost[mqDark.matches ? 'dark' : 'light'] -= 0.02;   /* nudge toward the system scheme */
        cost[prev[g]] -= 0.05;                      /* hysteresis: do not flip on a whisker */
        const tone = cost.light < cost.dark ? 'light' : 'dark';
        if (tone !== prev[g]) flipped = true;
        state.tone[g] = tone;
        for (const p of members) {
          const r = res[tone][p.key], T = effective(TONES[tone], hi);
          state.alpha[p.key] = clamp(r.a + 0.03, T.aMin, T.aMax);
          detail[p.key] = { tone, need: +r.a.toFixed(3), worst: +r.worst.toFixed(2), ok: r.ok };
        }
      }

      /* The clock has no glass: pick the ink that contrasts better, then add a halo for the shortfall. */
      const ct = document.querySelector(CLOCK.sel);
      if (ct && ct.firstChild) {
        const range = document.createRange();
        range.selectNodeContents(ct);
        const rb = range.getBoundingClientRect();
        if (rb.width > 0) {
          const rect = { x: rb.left - 8, y: rb.top - 6, w: rb.width + 16, h: rb.height + 12 };
          const bare = (tone) => {
            const T = Object.assign({}, TONES[tone], { sat: 1, bright: 1, haze: 0, tint: [0, 0, 0], aMin: 0, aMax: 0 });
            const S = paneSamples(field, rect, 3, T, 0);
            return worstContrast(S, T, 0, CLOCK.inkA, 0.06, new Float32Array(S.n));
          };
          const wd = bare('dark'), wl = bare('light');
          const dark = wd + 0.4 + (prev.clock === 'dark' ? 0.4 : 0) >= wl + (prev.clock === 'light' ? 0.4 : 0);
          const worst = dark ? wd : wl;
          if ((dark ? 'dark' : 'light') !== prev.clock) flipped = true;
          state.tone.clock = dark ? 'dark' : 'light';
          state.clockShadow = clamp(0.16 + Math.max(0, CLOCK.target - worst) * 0.1, 0.16, 0.5);
          detail.clock = { tone: state.tone.clock, wd: +wd.toFixed(2), wl: +wl.toFixed(2) };
        }
      }

      state.detail = detail;
      publish(flipped);
      /* a changed look needs a matching rim image */
      for (const g in GROUPS) if (prev[g] !== state.tone[g]) panes.forEach((S) => { if (S.def.group === g) queuePane(S); });
    } catch (e) {
      /* purely cosmetic: keep whatever is on screen */
      if (window.console) console.warn('[LiquidGlass]', e);
    } finally {
      solving = false;
      if (again) { again = false; scheduleSolve(60); }
    }
  }

  /* ------------------------------------------------------------------
     6. Lifecycle
     ------------------------------------------------------------------ */
  let ro = null, mo = null, videoTimer = 0, lastSig = '';

  function signature() {
    const g = (n) => root.style.getPropertyValue(n);
    return ['--glass-radius', '--overlay-opacity', '--overlay-color', '--bg-filter', '--bg-theme-color', '--bg-solid-color'].map(g).join('|');
  }

  function onRootMutation(list) {
    for (const m of list) {
      if (m.attributeName === 'data-glass') { sync(); return; }
    }
    const sig = signature();
    if (sig === lastSig) return;
    const radiusChanged = sig.split('|')[0] !== lastSig.split('|')[0];
    lastSig = sig;
    if (radiusChanged) queueAll();
    scheduleSolve(120);
  }

  function start() {
    if (active) return;
    active = true;
    ensureSvg();
    qa(PANES.map((p) => p.sel).join(',')).forEach((el) => { const S = paneFor(el); ro.observe(el); queuePane(S); });
    scheduleSolve(0);
    videoTimer = setInterval(() => {
      const v = $('background-video');
      if (!document.hidden && v && !v.classList.contains('hidden') && !v.paused) scheduleSolve(0);
    }, 2500);
  }

  function stop() {
    if (!active) return;
    active = false;
    clearInterval(videoTimer);
    clearTimeout(timer);
    cancelAnimationFrame(mapRaf); mapRaf = 0;
    dirty.clear();
    ro.disconnect();
    panes.forEach((S) => { clearTimeout(S.settle); dropFilter(S); S.el.removeAttribute('data-lg'); });
    panes.clear();
    for (const g in state.tone) root.removeAttribute('data-lg-' + g);   /* the other style must not inherit light-tone overrides */
    root.classList.remove('lg-snap');
    if (svg) { svg.remove(); svg = defs = null; }
    assets.forEach((p) => p.then((url) => url && URL.revokeObjectURL(url)));
    assets.clear();
    baseCache = { key: '', canvas: null };
  }

  function sync() {
    if (root.dataset.glass === 'liquid') start(); else stop();
  }

  function init() {
    ro = new ResizeObserver((entries) => {
      if (!active) return;
      for (const e of entries) {
        const S = paneFor(e.target);
        if (S.shadeKey) { stretch(S); queueSettled(S); }   /* resized: the old maps stay on the edge meanwhile */
        else queuePane(S);                                  /* first time it has a size: now */
      }
    });
    mo = new MutationObserver(onRootMutation);
    mo.observe(root, { attributes: true, attributeFilter: ['style', 'data-glass'] });
    lastSig = signature();

    /* wallpaper changes: a photo / preview fades in, a video starts, a colour is picked */
    const wallpaperWatch = new MutationObserver(() => { if (active) scheduleSolve(100); });
    ['background-image', 'background-photo', 'background-preview', 'background-video'].forEach((id) => {
      const el = $(id);
      if (el) wallpaperWatch.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'src'] });
    });
    const video = $('background-video');
    if (video) ['loadeddata', 'playing', 'seeked'].forEach((ev) => video.addEventListener(ev, () => { if (active) scheduleSolve(60); }));

    [mqDark, mqContrast, mqSolid].forEach((m) => m.addEventListener && m.addEventListener('change', () => {
      if (!active) return;
      queueAll();
      scheduleSolve(0);
    }));
    window.addEventListener('resize', () => { if (active) { queueAll(); scheduleSolve(150); } });
    document.addEventListener('visibilitychange', () => { if (active && !document.hidden) scheduleSolve(0); });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    refresh() { queueAll(); scheduleSolve(0); },
    optics: OPTICS,
    tones: TONES,
    /* Sample the wallpaper under a viewport rect and decide which ink (white on a
       dark pane, deep navy on a light one) contrasts better once the glass has sat
       over it. Returns 'dark' (=> use white ink) or 'light' (=> use dark ink).
       Used by components that are not part of the persistent pane layout (the
       right-click menu follows the cursor) and cannot be solved on the usual cycle.
       Falls back to the global wallpaper tone when nothing can be sampled. */
    async sampleTone(rect) {
      if (!rect || rect.w <= 0 || rect.h <= 0) {
        return root.dataset.wallpaperTone === 'light' ? 'light' : 'dark';
      }
      try {
        const field = await readField();
        const R = { x: rect.x, y: rect.y, w: Math.min(rect.w, innerWidth - rect.x), h: Math.min(rect.h, innerHeight - rect.y) };
        if (R.w <= 0 || R.h <= 0) return root.dataset.wallpaperTone === 'light' ? 'light' : 'dark';
        /* The menu carries a light tint and a blur; sample with a moderate sigma so
           local bright / dark patches of the wallpaper still tip the decision. */
        const sigma = 24;
        const pick = (tone) => {
          const T = effective(TONES[tone], mqContrast.matches);
          const S = paneSamples(field, R, sigma, T, 0);
          return worstContrast(S, T, 0.12, 0.92, 0.06, new Float32Array(S.n));
        };
        const wd = pick('dark'), wl = pick('light');
        return wl > wd ? 'light' : 'dark';
      } catch (e) {
        return root.dataset.wallpaperTone === 'light' ? 'light' : 'dark';
      }
    },
    debug() { return { active, lens: lensOn(), state, panes: Array.from(panes.values()).map((S) => ({ key: S.def.key, id: S.id, lensKey: S.lensKey })) }; },
  };
})();
