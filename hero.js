/**
 * hero.js
 * Controla la animación de fragmentación del hero, vinculada al progreso
 * del scroll (scroll-driven). No depende de ninguna librería externa.
 *
 * Estrategia técnica:
 * En vez de duplicar el contenido en 8 copias vivas, se usan dos capas
 * independientes que ocupan EXACTAMENTE el mismo rectángulo:
 *   1) .hero-browser  → la ventana de navegador real (topbar + escena +
 *      texto). Está intacta al principio.
 *   2) .hero-fragments → 8 paneles en grid. Cada uno pinta como fondo la
 *      rebanada de ventana que le corresponde, así que cuando la ventana
 *      real se desvanece y los paneles aparecen, el relevo es invisible:
 *      a partir de ahí lo que se separa "es" la ventana rota.
 *
 * Dentro de la ventana, HeroScene encaja la imagen pixel art en modo cover
 * (llena el área sin deformarse) y anima únicamente dos cosas: las máquinas
 * y el árbol. Todo lo demás de la escena queda quieto.
 */

(function () {
  'use strict';

  const PIN_SELECTOR = '[data-hero-pin]';
  const FRAGMENT_TRAVEL = [
    { x: -140, y: -90, r: -9 },
    { x: 30, y: -150, r: 6 },
    { x: 150, y: -70, r: 11 },
    { x: 190, y: -10, r: -4 },
    { x: -190, y: 10, r: 5 },
    { x: -150, y: 90, r: -11 },
    { x: 20, y: 160, r: 8 },
    { x: 150, y: 100, r: -6 }
  ];

  // El pixel art no debe moverse a 60fps: a 12fps el movimiento se siente
  // "de la época" y además el canvas casi no cuesta.
  const FX_INTERVAL = 1000 / 12;

  /**
   * Zonas luminosas de la escena, en coordenadas normalizadas de la imagen
   * (0–1). Cada una se recorta de la propia imagen y se aclara: nunca se
   * inyecta un color que no esté ya en el original.
   *
   * Las máquinas y el foco de la farola. Los charcos y el reflejo del agua
   * quedan completamente quietos.
   */
  const GLOW_REGIONS = [
    // Marquesinas de las 4 máquinas. Son las que más se notan, así que van
    // con bright y max altos: el parpadeo tiene que leerse de lejos.
    { x: 0.406, y: 0.429, w: 0.071, h: 0.045, dur: 6.7,  delay: -1.3, max: 1.60, bright: 1.90 },
    { x: 0.520, y: 0.429, w: 0.068, h: 0.045, dur: 9.1,  delay: -4.7, max: 1.55, bright: 1.90 },
    { x: 0.629, y: 0.426, w: 0.066, h: 0.048, dur: 7.3,  delay: -0.4, max: 1.60, bright: 1.90 },
    { x: 0.738, y: 0.429, w: 0.068, h: 0.045, dur: 11.9, delay: -6.2, max: 1.50, bright: 1.90 },
    // Pantallas: más contenidas, para que no compitan con las marquesinas.
    { x: 0.411, y: 0.525, w: 0.043, h: 0.096, dur: 8.3,  delay: -2.9, max: 0.85, bright: 1.50 },
    { x: 0.522, y: 0.501, w: 0.046, h: 0.119, dur: 5.9,  delay: -7.5, max: 0.80, bright: 1.50 },
    { x: 0.631, y: 0.499, w: 0.053, h: 0.122, dur: 10.7, delay: -3.6, max: 0.85, bright: 1.50 },
    { x: 0.741, y: 0.516, w: 0.045, h: 0.104, dur: 7.9,  delay: -5.1, max: 0.80, bright: 1.50 },
    // Foco de la farola bajo el árbol: ciclo corto, como un tubo gastado.
    { x: 0.253, y: 0.276, w: 0.068, h: 0.140, dur: 4.3,  delay: -1.9, max: 1.15, bright: 1.55 }
  ];

  /**
   * Grupos de destellos del árbol. Son las únicas partículas que quedan:
   * el cielo, las motas en suspensión y los reflejos del suelo se quitaron.
   */
  const TREE_CLUSTERS = [
    { count: 18, x: 0.020, y: 0.02, w: 0.55, h: 0.16 }, // rama alta que cruza hacia la derecha
    { count: 10, x: 0.000, y: 0.02, w: 0.28, h: 0.32 }, // masa de follaje de la izquierda
    { count: 7,  x: 0.145, y: 0.30, w: 0.08, h: 0.52 }  // enredadera que baja por el tronco
  ];


  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Suaviza un progreso local (0–1) para que la transición dentro de
  // esa ventana se sienta física, sin retrasar el conjunto general.
  function smoothstep(t) {
    const c = clamp(t, 0, 1);
    return c * c * (3 - 2 * c);
  }

  // Generador determinista: las partículas caen siempre en el mismo sitio,
  // así un resize no reorganiza el cielo.
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function toggleAttr(el, name, on) {
    if (on) el.setAttribute(name, '');
    else el.removeAttribute(name);
  }

  /* =========================================================
     ESCENA: imagen + brillos de las máquinas + destellos del árbol
     ========================================================= */
  class HeroScene {
    constructor(content, reducedMotion) {
      this.content = content;
      this.reducedMotion = reducedMotion;
      this.img = content ? content.querySelector('.hero-scene__img') : null;
      this.placeholder = content ? content.querySelector('.hero-browser__placeholder') : null;
      this.ready = false;
      this.rect = null;
      this.glows = [];
      this.canvas = null;
      this.ctx = null;
      this.particles = [];
      this.pixelUnit = 3;

      this.running = false;
      this.rafId = 0;
      this.lastFx = 0;

      this.tick = this.tick.bind(this);
    }

    get src() {
      return this.img ? this.img.currentSrc || this.img.src : '';
    }

    init(onReady) {
      if (!this.img) return;

      const handleLoad = () => {
        if (!this.img.naturalWidth) return;
        this.ready = true;
        this.img.classList.add('is-ready');
        this.placeholder?.classList.add('is-hidden');
        this.build();
        onReady?.();
      };

      // Si el archivo no está, no se toca nada: queda el placeholder CSS
      // que ya existía y los fragmentos vuelven a su aspecto de vidrio.
      this.img.addEventListener('error', () => { this.ready = false; });

      if (this.img.complete) handleLoad();
      else this.img.addEventListener('load', handleLoad);
    }

    build() {
      const src = this.src;

      GLOW_REGIONS.forEach((region) => {
        const el = document.createElement('div');
        el.className = 'hero-glow hero-glow--flicker';
        el.setAttribute('aria-hidden', 'true');
        el.style.backgroundImage = 'url("' + src + '")';
        el.style.setProperty('--glow-dur', region.dur + 's');
        el.style.setProperty('--glow-delay', region.delay + 's');
        el.style.setProperty('--glow-max', String(region.max));
        el.style.setProperty('--glow-brightness', String(region.bright));
        this.content.appendChild(el);
        this.glows.push({ el, region });
      });

      if (!this.reducedMotion) {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'hero-scene__fx';
        this.canvas.setAttribute('aria-hidden', 'true');
        this.content.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.particles = this.buildParticles();
      }
    }

    /**
     * Destellos del árbol: hojas que "atrapan" luz. El movimiento lo dan el
     * titileo y un vaivén de 1 píxel de arte, no un desplazamiento del dibujo
     * (eso dejaría costuras y rompería el pixel art).
     */
    buildParticles() {
      const rnd = makeRng(20260818);
      const WARM = ['#ffd98a', '#ffb347', '#f2d14a'];
      const list = [];

      TREE_CLUSTERS.forEach((cluster) => {
        for (let i = 0; i < cluster.count; i++) {
          list.push({
            x: cluster.x + rnd() * cluster.w,
            y: cluster.y + rnd() * cluster.h,
            c: WARM[Math.floor(rnd() * WARM.length)],
            s1: 0.10 + rnd() * 0.16, s2: 0.05 + rnd() * 0.09,
            p1: rnd() * 6.283, p2: rnd() * 6.283,
            max: 0.35 + rnd() * 0.35,
            // amp = cuántos píxeles de arte recorre; sw/sh = tamaño del
            // destello. Mezclar 1 y 2 hace que unos sean chispas y otros
            // racimos de hoja, y el conjunto se lee como follaje agitándose.
            amp: rnd() < 0.45 ? 2 : 1,
            sw: rnd() < 0.35 ? 2 : 1,
            sh: rnd() < 0.20 ? 2 : 1,
            sway: 0.05 + rnd() * 0.09, swayP: rnd() * 6.283
          });
        }
      });

      return list;
    }

    /** Encaja la imagen en modo cover y coloca todas las capas. */
    layout() {
      if (!this.ready || !this.content) return null;

      const w = this.content.clientWidth;
      const h = this.content.clientHeight;
      const nw = this.img.naturalWidth;
      const nh = this.img.naturalHeight;
      if (!w || !h || !nw || !nh) return null;

      // cover: la imagen llena la ventana entera conservando su proporción.
      // Lo que sobre se recorta, así que cuanto más cerca esté la proporción
      // de la imagen de la del área de contenido, menos se pierde.
      const scale = Math.max(w / nw, h / nh);
      const pw = Math.round(nw * scale);
      const ph = Math.round(nh * scale);
      const x = Math.round((w - pw) / 2);
      const y = Math.round((h - ph) / 2);

      this.rect = { x, y, w: pw, h: ph };
      this.pixelUnit = Math.max(2, Math.round(pw / 512));

      this.img.style.left = x + 'px';
      this.img.style.top = y + 'px';
      this.img.style.width = pw + 'px';
      this.img.style.height = ph + 'px';

      const src = this.src;
      this.glows.forEach(({ el, region }) => {
        const gx = Math.round(x + region.x * pw);
        const gy = Math.round(y + region.y * ph);
        el.style.left = gx + 'px';
        el.style.top = gy + 'px';
        el.style.width = Math.round(region.w * pw) + 'px';
        el.style.height = Math.round(region.h * ph) + 'px';
        el.style.backgroundImage = 'url("' + src + '")';
        el.style.backgroundSize = pw + 'px ' + ph + 'px';
        el.style.backgroundPosition = (x - gx) + 'px ' + (y - gy) + 'px';
      });

      if (this.canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.fxW = w;
        this.fxH = h;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.lastFx = 0;
      }

      return this.rect;
    }

    start() {
      if (this.running || this.reducedMotion || !this.ready) return;
      this.running = true;
      this.rafId = requestAnimationFrame(this.tick);
    }

    stop() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.rafId);
    }

    tick(now) {
      if (!this.running) return;

      if (this.ctx && this.rect && now - this.lastFx >= FX_INTERVAL) {
        this.lastFx = now;
        this.drawFx(now / 1000);
      }

      this.rafId = requestAnimationFrame(this.tick);
    }

    drawFx(t) {
      const ctx = this.ctx;
      const r = this.rect;
      const u = this.pixelUnit;

      ctx.clearRect(0, 0, this.fxW, this.fxH);

      // --- Destellos de las hojas que atrapan luz ---
      for (let i = 0; i < this.particles.length; i++) {
        const q = this.particles[i];

        // Dos senos desfasados: el ciclo nunca se repite a simple vista.
        let v = Math.sin(t * q.s1 + q.p1) * 0.62 + Math.sin(t * q.s2 + q.p2) * 0.38;
        v = (v + 1) / 2;
        let a = (v - 0.28) / 0.72; // apagones largos: no todo brilla siempre
        if (a <= 0) continue;
        // Cuantizado: escalones de luz, no degradados.
        a = Math.round(a * q.max * 5) / 5;
        if (a <= 0) continue;

        // Vaivén y cabeceo, ambos redondeados a píxeles de arte enteros:
        // el destello salta de casilla en casilla, nunca se desliza.
        const vaiven = Math.round(Math.sin(t * q.sway + q.swayP) * q.amp) * u;
        const cabeceo = Math.round(Math.sin(t * q.sway * 0.7 + q.swayP * 1.6) * q.amp * 0.6) * u;
        const sx = r.x + q.x * r.w + vaiven;
        const sy = r.y + q.y * r.h + cabeceo;

        ctx.globalAlpha = a;
        ctx.fillStyle = q.c;
        // Se ancla a la rejilla del pixel art para que nada quede a medio píxel.
        ctx.fillRect(Math.round(sx / u) * u, Math.round(sy / u) * u, q.sw * u, q.sh * u);
      }

      ctx.globalAlpha = 1;
    }

    destroy() {
      this.stop();
    }
  }

  /* =========================================================
     FRAGMENTACIÓN LIGADA AL SCROLL
     ========================================================= */
  class HeroFragmentation {
    constructor(root) {
      this.root = root;
      this.sticky = root.querySelector('.hero-sticky');
      this.browser = root.querySelector('.hero-browser');
      this.topbar = root.querySelector('.hero-browser__topbar');
      this.content = root.querySelector('.hero-browser__content');
      this.copy = root.querySelector('.hero-copy');
      this.fragmentsLayer = root.querySelector('.hero-fragments');
      this.fragments = Array.from(root.querySelectorAll('.hero-fragment'));
      this.tabsToggle = root.querySelector('.hero-browser__tabs-toggle');
      this.tabsOverview = document.getElementById(
        this.tabsToggle?.getAttribute('aria-controls') || 'hero-tabs-overview'
      );
      this.tabCards = this.tabsOverview
        ? Array.from(this.tabsOverview.querySelectorAll('.hero-tab-card'))
        : [];
      this.tabsClose = this.tabsOverview?.querySelector('.hero-tabs-overview__close') || null;
      this.onOverviewKeydown = this.onOverviewKeydown.bind(this);

      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.pinStart = 0;
      this.pinDistance = 1;
      this.ticking = false;
      this.progress = 0;

      this.scene = new HeroScene(this.content, this.reducedMotion);

      this.onScroll = this.onScroll.bind(this);
      this.onResize = this.onResize.bind(this);

      this.init();
    }

    init() {
      this.setupTabs();
      this.setupScene();

      if (this.reducedMotion) {
        this.root.classList.add('is-reduced-motion');
        // Sin pin ni fragmentación: el hero queda estático y se va
        // con el flujo normal del documento.
        return;
      }

      this.measure();
      window.addEventListener('resize', this.onResize, { passive: true });
      window.addEventListener('orientationchange', this.onResize, { passive: true });
      window.addEventListener('scroll', this.onScroll, { passive: true });
      this.applyProgress(0);
    }

    // --- Escena pixel art dentro de la ventana ---
    setupScene() {
      this.scene.init(() => {
        this.root.classList.add('has-scene');
        this.measure();
        this.applyProgress(this.progress);
      });

      if (this.reducedMotion) return;

      // La escena solo consume CPU/GPU mientras el hero está en pantalla.
      if ('IntersectionObserver' in window) {
        this.visibilityObserver = new IntersectionObserver((entries) => {
          const visible = entries.some((e) => e.isIntersecting);
          if (visible && !document.hidden) this.scene.start();
          else this.scene.stop();
        }, { threshold: 0 });
        this.visibilityObserver.observe(this.root);
      } else {
        this.scene.start();
      }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.scene.stop();
        else if (this.isOnScreen()) this.scene.start();
      });
    }

    isOnScreen() {
      const r = this.root.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    }

    // --- Tab overview: abre/cierra la vista de las secciones y navega
    // a la elegida, igual que el selector de pestañas de un navegador. ---
    setupTabs() {
      if (!this.tabsToggle || !this.tabsOverview) return;

      this.tabsToggle.addEventListener('click', () => this.openTabsOverview());
      this.tabsClose?.addEventListener('click', () => this.closeTabsOverview());

      // Cerrar al tocar el fondo (fuera de las cards)
      this.tabsOverview.addEventListener('click', (e) => {
        if (e.target === this.tabsOverview) this.closeTabsOverview();
      });

      const behavior = this.reducedMotion ? 'auto' : 'smooth';

      this.tabCards.forEach((card) => {
        card.addEventListener('click', () => {
          const targetSelector = card.dataset.target;
          const target = targetSelector && document.querySelector(targetSelector);
          this.closeTabsOverview();
          if (target) {
            target.scrollIntoView({ behavior, block: 'start' });
          }
        });
      });
    }

    openTabsOverview() {
      this.tabsOverview.hidden = false;
      // requestAnimationFrame para que el navegador registre "hidden=false"
      // antes de agregar la clase que dispara la transición.
      requestAnimationFrame(() => this.tabsOverview.classList.add('is-open'));
      this.tabsToggle.setAttribute('aria-expanded', 'true');
      this.tabCards[0]?.focus();
      document.addEventListener('keydown', this.onOverviewKeydown);
    }

    closeTabsOverview() {
      if (this.tabsOverview.hidden) return;
      this.tabsOverview.classList.remove('is-open');
      this.tabsToggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', this.onOverviewKeydown);

      const finish = () => {
        this.tabsOverview.hidden = true;
        this.tabsOverview.removeEventListener('transitionend', finish);
      };

      if (this.reducedMotion) {
        finish();
      } else {
        this.tabsOverview.addEventListener('transitionend', finish);
      }
      this.tabsToggle.focus();
    }

    onOverviewKeydown(e) {
      if (e.key === 'Escape') this.closeTabsOverview();
    }

    measure() {
      const rect = this.root.getBoundingClientRect();
      this.pinStart = rect.top + window.scrollY;
      this.pinDistance = Math.max(this.root.offsetHeight - window.innerHeight, 1);

      const sceneRect = this.scene.layout();
      this.tagFragments();
      if (sceneRect) this.paintFragments(sceneRect);
    }

    /** Marca qué fragmentos tocan el borde exterior, las esquinas y la topbar. */
    tagFragments() {
      if (!this.fragmentsLayer) return;
      const cw = this.fragmentsLayer.clientWidth;
      const ch = this.fragmentsLayer.clientHeight;
      const borderW = parseFloat(getComputedStyle(this.browser).borderTopWidth) || 0;
      const contentTop = borderW + (this.topbar ? this.topbar.offsetHeight : 0);

      this.fragments.forEach((el) => {
        const l = el.offsetLeft;
        const t = el.offsetTop;
        const r = l + el.offsetWidth;
        const b = t + el.offsetHeight;

        const isLeft = l < 1;
        const isTop = t < 1;
        const isRight = Math.abs(r - cw) < 1;
        const isBottom = Math.abs(b - ch) < 1;

        toggleAttr(el, 'data-edge-left', isLeft);
        toggleAttr(el, 'data-edge-top', isTop);
        toggleAttr(el, 'data-edge-right', isRight);
        toggleAttr(el, 'data-edge-bottom', isBottom);
        toggleAttr(el, 'data-top-row', t < contentTop);

        let corner = '';
        if (isTop && isLeft) corner = 'tl';
        else if (isTop && isRight) corner = 'tr';
        else if (isBottom && isRight) corner = 'br';
        else if (isBottom && isLeft) corner = 'bl';
        if (corner) el.setAttribute('data-corner', corner);
        else el.removeAttribute('data-corner');
      });
    }

    /**
     * Le da a cada fragmento la rebanada exacta de ventana que cubre.
     * La imagen vive dentro del área de contenido, que empieza después del
     * borde y de la topbar: por eso se desplaza el origen antes de repartir.
     */
    paintFragments(sceneRect) {
      const src = this.scene.src;
      if (!src) return;

      const borderW = parseFloat(getComputedStyle(this.browser).borderTopWidth) || 0;
      const contentTop = borderW + (this.topbar ? this.topbar.offsetHeight : 0);
      const imgX = sceneRect.x + borderW;
      const imgY = sceneRect.y + contentTop;

      this.fragments.forEach((el) => {
        el.style.setProperty('--slice-img', 'url("' + src + '")');
        el.style.setProperty('--slice-size', sceneRect.w + 'px ' + sceneRect.h + 'px');
        el.style.setProperty(
          '--slice-pos',
          (imgX - el.offsetLeft) + 'px ' + (imgY - el.offsetTop) + 'px'
        );
        el.style.setProperty('--content-top', Math.max(0, contentTop - el.offsetTop) + 'px');
      });
    }

    onResize() {
      this.measure();
      this.applyProgress(this.progress);
    }

    onScroll() {
      if (this.ticking) return;
      this.ticking = true;
      requestAnimationFrame(() => {
        const raw = (window.scrollY - this.pinStart) / this.pinDistance;
        this.progress = clamp(raw, 0, 1);
        this.applyProgress(this.progress);
        this.ticking = false;
      });
    }

    applyProgress(progress) {
      // "progress" es el avance crudo del scroll (0–1). Cada propiedad
      // define su propia ventana y se suaviza dentro de ella, así los
      // hitos se respetan y a la vez cada movimiento entra y sale con
      // una curva física. Es una función pura del scroll: si el usuario
      // para, se detiene; si sube, se reproduce al revés.
      //
      //   0–8%    ventana intacta
      //   8–24%   aparecen las grietas sobre la ventana entera
      //   18–30%  relevo invisible: la ventana real se va, los 8 trozos entran
      //   30–100% los trozos se separan, giran y se desvanecen
      const hasScene = this.scene.ready;

      // Retroceso global de toda la ventana (rota o no). Se aplica igual a
      // las dos capas para que durante el relevo no se despeguen ni un píxel.
      const recedeT = smoothstep(progress / (hasScene ? 0.9 : 0.65));
      const recedeScale = lerp(1, hasScene ? 0.92 : 0.86, recedeT);
      const transform = 'scale(' + recedeScale + ')';
      this.browser.style.transform = transform;
      if (this.fragmentsLayer) this.fragmentsLayer.style.transform = transform;

      // La ventana real se apaga justo cuando entran los fragmentos.
      this.browser.style.opacity = hasScene
        ? 1 - smoothstep((progress - 0.18) / 0.12)
        : 1 - recedeT;

      // --- Texto: se desvanece más rápido (~40%) y sube levemente ---
      const textT = smoothstep(progress / 0.4);
      this.copy.style.transform = 'translateY(' + lerp(0, -40, textT) + 'px)';
      this.copy.style.opacity = 1 - textT;

      // --- Fragmentos ---
      const fadeOut = smoothstep((progress - 0.62) / 0.38);
      let crackA;
      let sliceA;

      if (hasScene) {
        crackA = smoothstep((progress - 0.08) / 0.16) * 0.55 * (1 - fadeOut);
        sliceA = smoothstep((progress - 0.18) / 0.12) * (1 - fadeOut);
      } else {
        // Sin imagen: se conserva el comportamiento original de vidrio.
        const bell = Math.sin(smoothstep((progress - 0.2) / 0.8) * Math.PI);
        sliceA = bell * 0.9;
        crackA = bell * 0.14;
      }

      const breakT = hasScene
        ? smoothstep((progress - 0.30) / 0.70)
        : smoothstep((progress - 0.2) / 0.8);

      this.fragments.forEach((el, i) => {
        const vector = FRAGMENT_TRAVEL[i % FRAGMENT_TRAVEL.length];
        const tx = lerp(0, vector.x, breakT);
        const ty = lerp(0, vector.y, breakT);
        const rot = lerp(0, vector.r, breakT);
        // Cada trozo se acerca o se aleja un poco: sugiere profundidad
        // sin necesidad de 3D.
        const depth = 1 + breakT * (i % 2 === 0 ? 0.06 : -0.045);

        el.style.transform =
          'translate3d(' + tx + 'px, ' + ty + 'px, 0) rotate(' + rot + 'deg) scale(' + depth + ')';
        el.style.setProperty('--crack-a', crackA.toFixed(3));
        el.style.setProperty('--slice-a', sliceA.toFixed(3));
      });
    }
  }

  function initAll() {
    document.querySelectorAll(PIN_SELECTOR).forEach((el) => new HeroFragmentation(el));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
