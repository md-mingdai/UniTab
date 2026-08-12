/* ============================================
   UniTab - Kivotos Effect (from Steam Workshop)
   Original: fireworks.js — unchanged logic
   ============================================ */

const KivotosEffect = (() => {
  let fireworksCanvas, ctx;
  let pointerX = 0, pointerY = 0;

  const state = { darkMode: 'system' };

  const lightColors = ['102, 167, 221', '62, 131, 225', '33, 78, 194'];
  const darkColors = ['252, 146, 174', '202, 180, 190', '207, 198, 255'];

  const config = {
    colors: lightColors,
    numberOfParticles: 12,
    orbitRadius: { min: 25, max: 50 },
    circleRadius: { min: 5, max: 10 },
    diffuseRadius: { min: 25, max: 50 },
    animeDuration: { min: 900, max: 1500 }
  };

  let fireworksRender = null;
  let activeFireworksCount = 0;
  let bound = false;

  function setCanvasSize() {
    if (!fireworksCanvas) return;
    fireworksCanvas.width = window.innerWidth;
    fireworksCanvas.height = window.innerHeight;
    fireworksCanvas.style.width = window.innerWidth + 'px';
    fireworksCanvas.style.height = window.innerHeight + 'px';
  }

  function setParticleDirection(p) {
    const angle = (anime.random(0, 360) * Math.PI) / 180;
    const value = anime.random(config.diffuseRadius.min, config.diffuseRadius.max);
    const radius = (Math.random() < 0.5 ? -1 : 1) * value;
    return {
      x: p.x + radius * Math.cos(angle),
      y: p.y + radius * Math.sin(angle)
    };
  }

  function createParticle(x, y) {
    const color = 'rgba(' + config.colors[anime.random(0, config.colors.length - 1)] + ',' + anime.random(0.2, 0.8) + ')';
    const radius = anime.random(config.circleRadius.min, config.circleRadius.max);
    const angle = anime.random(0, 360);
    const endPos = setParticleDirection({ x, y });

    return {
      x: x, y: y, color: color, radius: radius, angle: angle, endPos: endPos,
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.angle * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius * Math.sin(Math.PI / 3), this.radius * Math.cos(Math.PI / 3));
        ctx.lineTo(-this.radius * Math.sin(Math.PI / 3), this.radius * Math.cos(Math.PI / 3));
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
      }
    };
  }

  function createCircle(x, y) {
    return {
      x: x, y: y,
      radius: 0.1,
      alpha: 0.5,
      lineWidth: 6,
      color: state.darkMode === 'dark' ? 'rgb(233, 179, 237)' : 'rgb(106, 159, 255)',
      draw() {
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, true);
        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = this.color;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };
  }

  function renderParticle(anim) {
    anim.animatables.forEach(function(animatable) {
      if (typeof animatable.target.draw === 'function') {
        animatable.target.draw();
      }
    });
  }

  function animateParticles(x, y) {
    const circle = createCircle(x, y);
    const particles = [];
    for (let i = 0; i < config.numberOfParticles; i++) {
      particles.push(createParticle(x, y));
    }

    activeFireworksCount++;

    anime.timeline({
      complete: function() {
        activeFireworksCount--;
        if (activeFireworksCount <= 0) {
          activeFireworksCount = 0;
          if (fireworksRender) fireworksRender.pause();
          if (ctx) ctx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
        }
      }
    })
      .add({
        targets: particles,
        x: function(p) { return p.endPos.x; },
        y: function(p) { return p.endPos.y; },
        radius: 0,
        duration: anime.random(config.animeDuration.min, config.animeDuration.max),
        easing: 'easeOutExpo',
        update: renderParticle
      })
      .add({
        targets: circle,
        radius: anime.random(config.orbitRadius.min, config.orbitRadius.max),
        lineWidth: 0,
        alpha: {
          value: 0,
          easing: 'linear',
          duration: anime.random(600, 800)
        },
        duration: anime.random(1200, 1800),
        easing: 'easeOutExpo',
        update: renderParticle
      }, 0);
  }

  function handleMouseDown(e) {
    if (!fireworksCanvas || fireworksCanvas.hidden) return;
    /* Skip clicks on interactive elements */
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A' || tag === 'BUTTON' || tag === 'SELECT') return;
    if (e.target.closest('.settings-panel') || e.target.closest('.settings-overlay')) return;

    pointerX = e.clientX;
    pointerY = e.clientY;
    if (activeFireworksCount === 0 && fireworksRender) fireworksRender.play();
    animateParticles(pointerX, pointerY);
  }

  function updateTheme(theme) {
    if (theme === 'system') {
      state.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      state.darkMode = theme;
    }
    config.colors = state.darkMode === 'dark' ? darkColors : lightColors;
  }

  function init() {
    if (bound) return;
    fireworksCanvas = document.createElement('canvas');
    fireworksCanvas.className = 'fireworks';
    fireworksCanvas.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;pointer-events:none;';
    fireworksCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fireworksCanvas);
    ctx = fireworksCanvas.getContext('2d');

    setCanvasSize();

    fireworksRender = anime({
      targets: [],
      duration: Infinity,
      autoplay: false,
      update: function() {
        ctx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
      }
    });

    updateTheme('system');
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (state.darkMode === 'system') updateTheme('system');
    });

    window.addEventListener('resize', setCanvasSize);
    window.addEventListener('mousedown', handleMouseDown);
    bound = true;
  }

  function setVisible(on) {
    if (!fireworksCanvas) return;
    fireworksCanvas.hidden = !on;
    if (!on && fireworksRender) {
      fireworksRender.pause();
      activeFireworksCount = 0;
      ctx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
    }
  }

  return { init: init, setVisible: setVisible };
})();
