// A canvas "vessel": a liquid surface at the current attendance level and a
// dashed line at the target. The surface is a 1D height field (springs between
// neighbouring columns), so pointer movement and level changes make real
// ripples that travel and settle. The mean level follows its target on a
// slightly under-damped spring, which gives a small slosh on every change.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export class Liquid {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ range?: [number, number], target?: number, level?: number,
   *           spacing?: number, label?: boolean, interactive?: boolean }} opts
   * range: the percent shown at the bottom and top edges of the canvas.
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = [...(opts.range ?? [50, 100])]; // shown range, eases toward rangeTo
    this.rangeTo = [...this.range];
    this.target = opts.target ?? 75;
    this.spacing = opts.spacing ?? 8;
    this.label = opts.label ?? true;
    this.line = opts.line ?? true; // draw the dashed minimum line
    this.level = opts.level ?? this.range[0]; // where the mean surface is heading, in percent
    this.shown = this.level; // where it is now, in percent (spring state)
    this.vel = 0;
    this.time = 0;
    this.running = false;
    this.visible = true;
    this.listeners = new Set();

    this.readColors();
    this.resize();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.start();
    });
    this.io.observe(canvas);
    this.onTheme = () => {
      this.readColors();
      this.draw();
      this.start();
    };
    addEventListener('themechange', this.onTheme);

    if (opts.interactive ?? true) this.bindPointer();
    this.start();
  }

  readColors() {
    const s = getComputedStyle(this.canvas);
    this.colors = {
      accent: s.getPropertyValue('--accent').trim() || '#2e33f0',
      ink: s.getPropertyValue('--ink').trim() || '#101113',
      paper: s.getPropertyValue('--on-accent').trim() || '#f4f4f2',
      danger: s.getPropertyValue('--danger').trim() || '#d8401f',
    };
    this.font = s.getPropertyValue('--mono').trim() || 'monospace';
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    const n = Math.max(8, Math.ceil(r.width / this.spacing) + 1);
    if (n !== this.n) {
      this.n = n;
      this.hgt = new Float32Array(n); // offset from the mean surface, css px (positive = down)
      this.vy = new Float32Array(n);
      this.tmp = new Float32Array(n);
    }
    this.draw();
  }

  /** y in css px for a percent value. */
  yFor(pct) {
    const [lo, hi] = this.range;
    return this.h * (1 - (pct - lo) / (hi - lo));
  }

  /** Move the level. `kick` adds a splash proportional to the change. */
  setLevel(pct, { kick = true, instant = false } = {}) {
    this.empty = pct == null || Number.isNaN(pct);
    if (this.empty) pct = this.range[0] - 4;
    const delta = pct - this.level;
    this.level = pct;
    if (instant || reduceMotion.matches) {
      this.shown = pct;
      this.vel = 0;
    } else if (kick && Math.abs(delta) > 0.01) {
      // A drop makes the middle dip, a rise makes it bulge.
      const amp = Math.max(-14, Math.min(14, delta * 0.9 * (this.h / 260)));
      for (let i = 0; i < this.n; i++) {
        this.vy[i] += -amp * 0.35 * Math.sin((Math.PI * i) / (this.n - 1)) * (0.7 + 0.3 * Math.sin(i * 1.7));
      }
    }
    this.start();
  }

  setTarget(t) {
    this.target = t;
    this.start();
  }

  /** Change the percent shown at the bottom and top edges; eases there unless instant. */
  setRange(lo, hi, { instant = false } = {}) {
    this.rangeTo = [lo, hi];
    if (instant || reduceMotion.matches) this.range = [lo, hi];
    this.start();
  }

  /** Surface y (css px from the canvas top) at css x, waves included. */
  surfaceAt(x) {
    const base = this.yFor(this.shown);
    if (!this.n) return base;
    const f = Math.max(0, Math.min(this.n - 1, x / this.spacing));
    const i = Math.floor(f);
    const j = Math.min(this.n - 1, i + 1);
    const t = f - i;
    return base + this.hgt[i] * (1 - t) + this.hgt[j] * t + this.ambient(x);
  }

  ambient(x) {
    if (reduceMotion.matches) return 0;
    const t = this.time;
    const a = Math.min(5, this.h / 90);
    return a * (Math.sin(x * 0.011 + t * 1.1) * 0.6 + Math.sin(x * 0.023 - t * 0.7) * 0.4);
  }

  /** Called every frame with (this) after the step; used for text inversion. */
  onFrame(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  bindPointer() {
    let last = null;
    const disturb = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (last && x >= 0 && x <= this.w) {
        const near = Math.abs(y - this.surfaceAt(x)) < Math.max(60, this.h * 0.12);
        const dy = y - last.y;
        const dx = x - last.x;
        if (near) this.poke(x, Math.max(-9, Math.min(9, dy * 0.35 + Math.abs(dx) * 0.06)), 4);
      }
      last = { x, y };
    };
    this.onMove = (e) => disturb(e);
    this.onLeave = () => (last = null);
    this.onDown = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || x > this.w || y < 0 || y > this.h) return;
      this.poke(x, 10, 6);
    };
    // Listen on the window: the canvas usually sits under page content.
    addEventListener('pointermove', this.onMove, { passive: true });
    addEventListener('pointerdown', this.onDown, { passive: true });
    document.addEventListener('pointerleave', this.onLeave);
  }

  /** Push the surface down (positive) or up around x. */
  poke(x, force, radius) {
    if (reduceMotion.matches) return;
    const c = Math.round(x / this.spacing);
    for (let k = -radius; k <= radius; k++) {
      const i = c + k;
      if (i < 0 || i >= this.n) continue;
      this.vy[i] += force * Math.cos((k / (radius + 1)) * (Math.PI / 2));
    }
    this.start();
  }

  start() {
    if (this.running || !this.visible) return;
    this.running = true;
    this.prev = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.prev) / 1000);
      this.prev = now;
      this.step(dt);
      this.draw();
      for (const fn of this.listeners) fn(this);
      if (!this.visible || (reduceMotion.matches && this.settled())) {
        this.running = false;
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  settled() {
    if (Math.abs(this.vel) > 0.001 || Math.abs(this.level - this.shown) > 0.001) return false;
    if (this.range[0] !== this.rangeTo[0] || this.range[1] !== this.rangeTo[1]) return false;
    for (let i = 0; i < this.n; i++) if (Math.abs(this.vy[i]) > 0.01 || Math.abs(this.hgt[i]) > 0.05) return false;
    return true;
  }

  step(dt) {
    this.time += dt;
    // The scale eases toward a new range at the same pace as the level, so the two move together.
    const ease = 1 - Math.exp(-dt * 5.5);
    for (let i = 0; i < 2; i++) {
      const d = this.rangeTo[i] - this.range[i];
      this.range[i] = Math.abs(d) < 0.01 ? this.rangeTo[i] : this.range[i] + d * ease;
    }
    // Mean level: spring with damping ratio ~0.6, so a change overshoots a little and settles.
    const k = 38;
    const c = 2 * 0.62 * Math.sqrt(k);
    const steps = Math.max(1, Math.round(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const acc = k * (this.level - this.shown) - c * this.vel;
      this.vel += acc * h;
      this.shown += this.vel * h;

      // Height field: each column springs back to rest and pulls on its neighbours.
      const n = this.n;
      const hg = this.hgt;
      const vy = this.vy;
      for (let i = 0; i < n; i++) {
        vy[i] += (-90 * hg[i] - 2.4 * vy[i]) * h;
      }
      const spread = 900 * h;
      for (let i = 0; i < n; i++) {
        const l = i > 0 ? hg[i - 1] : hg[i];
        const r = i < n - 1 ? hg[i + 1] : hg[i];
        this.tmp[i] = (l + r - 2 * hg[i]) * spread;
      }
      for (let i = 0; i < n; i++) {
        vy[i] += this.tmp[i];
        hg[i] += vy[i] * h;
      }
    }
  }

  surfacePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, this.h + 2);
    for (let x = 0; x <= this.w + this.spacing; x += this.spacing / 2) ctx.lineTo(x, this.surfaceAt(x));
    ctx.lineTo(this.w + this.spacing, this.h + 2);
    ctx.closePath();
  }

  draw() {
    const { ctx, w, h, dpr, colors } = this;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Back layer: a lighter, slower copy of the surface for depth.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(0, h + 2);
    const base = this.yFor(this.shown);
    for (let x = 0; x <= w + this.spacing; x += this.spacing) {
      const t = this.time;
      const back = reduceMotion.matches ? 0 : Math.sin(x * 0.008 - t * 0.9) * Math.min(9, h / 50);
      ctx.lineTo(x, base - Math.min(10, h / 40) + back + this.hgtAt(x) * 0.5);
    }
    ctx.lineTo(w + this.spacing, h + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Liquid.
    ctx.fillStyle = colors.accent;
    this.surfacePath(ctx);
    ctx.fill();

    // Meniscus sheen along the surface.
    ctx.save();
    this.surfacePath(ctx);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= w + this.spacing; x += this.spacing / 2) {
      const y = this.surfaceAt(x) + 1;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    if (!this.line) return;

    // Threshold line: ink above the liquid, pale inside it.
    const ty = Math.round(this.yFor(this.target)) + 0.5;
    // calm: during an intro fill the level starts below the line; do not flash it as a warning.
    const below = !this.empty && !this.calm && this.level < this.target;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = below ? colors.danger : colors.ink;
    ctx.globalAlpha = below ? 0.9 : 0.55;
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(w, ty);
    ctx.stroke();
    this.surfacePath(ctx);
    ctx.clip();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = colors.paper;
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(w, ty);
    ctx.stroke();
    ctx.restore();

    if (this.label) {
      const text = `${this.target}%`;
      ctx.font = `500 ${w < 500 ? 11 : 12}px ${this.font}`;
      const tw = ctx.measureText(text).width;
      const lx = w - tw - Math.min(24, w * 0.04);
      const ly = ty - 8;
      const inLiquid = this.surfaceAt(lx + tw / 2) < ly;
      ctx.fillStyle = inLiquid ? colors.paper : below ? colors.danger : colors.ink;
      ctx.globalAlpha = 0.8;
      ctx.fillText(text, lx, ly);
      ctx.globalAlpha = 1;
    }
  }

  hgtAt(x) {
    const i = Math.max(0, Math.min(this.n - 1, Math.round(x / this.spacing)));
    return this.hgt[i];
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    removeEventListener('themechange', this.onTheme);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onDown);
    document.removeEventListener('pointerleave', this.onLeave);
  }
}

/**
 * Text that inverts where the liquid covers it. The element keeps its normal
 * (ink) text; a paper-coloured, aria-hidden copy sits on top, and both are cut
 * along the actual wave surface with clip-path polygons each frame.
 */
export function invertText(liquid, elements) {
  const items = [...elements].map((el) => {
    // <host><span.invert-a>original</span><span.invert-b aria-hidden>copy</span></host>
    const a = document.createElement('span');
    a.className = 'invert-a';
    a.append(...el.childNodes);
    const b = a.cloneNode(true);
    b.className = 'invert-b';
    b.setAttribute('aria-hidden', 'true');
    // The copy is decoration: no duplicate ids, nothing focusable.
    b.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    b.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach((n) => n.setAttribute('tabindex', '-1'));
    el.classList.add('invert-host');
    el.append(a, b);
    return { el, a, b, last: '' };
  });

  const vh = () => innerHeight;
  return liquid.onFrame(() => {
    const cr = liquid.canvas.getBoundingClientRect();
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh()) continue;
      const pts = [];
      const steps = Math.max(4, Math.ceil(r.width / 40));
      for (let s = 0; s <= steps; s++) {
        const px = (r.width * s) / steps;
        const y = cr.top + liquid.surfaceAt(r.left - cr.left + px) - r.top;
        pts.push([px, Math.max(-2, Math.min(r.height + 2, y))]);
      }
      // Fully above or below: skip the polygon maths.
      let top, bottom;
      if (pts.every(([, y]) => y <= -2)) {
        top = 'inset(0 0 100% 0)';
        bottom = 'none';
      } else if (pts.every(([, y]) => y >= r.height + 2)) {
        top = 'none';
        bottom = 'inset(100% 0 0 0)';
      } else {
        const W = r.width + 4;
        const H = r.height + 4;
        const edge = pts.map(([x, y], s) => `${s === 0 ? -4 : s === steps ? W : x.toFixed(1)}px ${y.toFixed(1)}px`);
        bottom = `polygon(${edge.join(',')},${W}px ${H}px,-4px ${H}px)`;
        top = `polygon(-4px -4px,${W}px -4px,${edge.reverse().join(',')})`;
      }
      const key = top + bottom;
      if (key !== it.last) {
        it.a.style.clipPath = top;
        it.b.style.clipPath = bottom;
        it.last = key;
      }
    }
  });
}
