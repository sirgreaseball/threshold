// The planner's summary: one liquid tank per course on a shared scale, with
// the college minimum as a dashed line across all of them. Each tank has its
// own small height field, so a tap or a logged class makes its surface ripple.
//
// The tanks also notice the cursor before it touches them: tanks near it swell
// (like a dock), and the water under it rises a little toward the pointer, then
// settles back with a ripple when the cursor moves on.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export class Skyline {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onHover?: (id: string|null, rect?: object) => void, onPick?: (id: string) => void,
   *           onDraw?: (sky: Skyline) => void }} hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.tanks = new Map();
    this.order = [];
    this.lo = 50;
    this.hi = 100;
    this.loTo = 50;
    this.line = null;
    this.hover = null;
    this.px = null; // pointer x in canvas px, or null when away
    this.py = null;
    this.time = 0;
    this.running = false;
    this.visible = true;
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
    };
    addEventListener('themechange', this.onTheme);

    // Listen on the whole panel, so the tanks react while the cursor is still on its way.
    const zone = canvas.parentElement || canvas;
    zone.addEventListener('pointermove', (e) => this.pointer(e));
    zone.addEventListener('pointerleave', () => {
      this.px = this.py = null;
      this.setHover(null);
      this.start();
    });
    canvas.addEventListener('click', (e) => {
      const t = this.hit(e);
      if (t) {
        this.poke(t.id, 1, e);
        this.hooks.onPick?.(t.id);
      }
    });
  }

  readColors() {
    const s = getComputedStyle(this.canvas);
    const v = (n, f) => s.getPropertyValue(n).trim() || f;
    this.colors = {
      accent: v('--accent', '#2e33f0'),
      danger: v('--danger', '#d23d1c'),
      ink: v('--ink', '#101113'),
      track: v('--paper-3', '#dcdcd7'),
      hair: v('--hair', 'rgba(0,0,0,.12)'),
      paper: v('--paper', '#f1f1ee'),
    };
    this.font = v('--mono', 'monospace');
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.layout();
    this.draw();
  }

  /**
   * items: [{ id, pct (null when no classes), min, below }] in display order.
   * line: the shared minimum, or null when courses have different ones.
   */
  update(items, { line, intro = false } = {}) {
    const ids = new Set(items.map((i) => i.id));
    for (const id of [...this.tanks.keys()]) if (!ids.has(id)) this.tanks.delete(id);
    const lowest = Math.min(...items.map((i) => (i.pct == null ? 100 : i.pct)), ...items.map((i) => i.min), 100);
    // Scale: from a round number comfortably under the lowest value up to 100%.
    this.loTo = Math.max(0, Math.min(70, Math.floor((lowest - 12) / 10) * 10));
    if (!this.tanks.size || reduceMotion.matches) this.lo = this.loTo;
    this.line = line;
    items.forEach((it, i) => {
      let t = this.tanks.get(it.id);
      const level = it.pct == null ? null : it.pct;
      if (!t) {
        t = { id: it.id, shown: this.lo - 6, vel: 0, level, wait: intro ? i * 0.07 : 0, hgt: null, vy: null, s: 1 };
        this.tanks.set(it.id, t);
      } else if (level != null && t.level != null && Math.abs(level - t.level) > 0.01) {
        this.kick(t, level - t.level);
      }
      t.level = level;
      t.min = it.min;
      t.below = it.below;
      if (reduceMotion.matches) t.shown = level ?? this.lo - 6;
    });
    this.order = items.map((i) => i.id);
    this.layout();
    this.start();
  }

  layout() {
    const n = this.order.length || 1;
    const slot = this.w / n;
    this.slot = slot;
    const tw = Math.max(12, Math.min(64, slot * 0.5));
    this.order.forEach((id, i) => {
      const t = this.tanks.get(id);
      if (!t) return;
      t.cx = slot * i + slot / 2;
      t.bw = tw;
      this.place(t);
      const m = Math.max(3, Math.round(tw / 5));
      if (!t.hgt || t.hgt.length !== m) {
        t.hgt = new Float32Array(m);
        t.vy = new Float32Array(m);
      }
    });
  }

  /** Width and left edge from the current swell. */
  place(t) {
    t.w = t.bw * t.s;
    t.x = t.cx - t.w / 2;
  }

  top() {
    return 12;
  }

  y(p) {
    const top = this.top();
    return top + (1 - (p - this.lo) / (this.hi - this.lo)) * (this.h - top);
  }

  kick(t, delta) {
    if (reduceMotion.matches || !t.vy) return;
    const amp = Math.max(-10, Math.min(10, delta * 3));
    for (let i = 0; i < t.vy.length; i++) t.vy[i] -= amp * Math.sin((Math.PI * (i + 0.5)) / t.vy.length);
  }

  /** A logged class: the tank's surface jumps (present) or sags (absent). */
  poke(id, dir = 1, e = null) {
    const t = this.tanks.get(id);
    if (!t || reduceMotion.matches) return;
    let at = t.vy.length / 2;
    if (e) {
      const r = this.canvas.getBoundingClientRect();
      at = ((e.clientX - r.left - t.x) / t.w) * t.vy.length;
    }
    for (let i = 0; i < t.vy.length; i++) {
      const d = Math.abs(i + 0.5 - at);
      t.vy[i] += (dir > 0 ? -14 : 10) * Math.max(0, 1 - d / 2.5);
    }
    this.start();
  }

  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.floor(x / this.slot);
    return this.tanks.get(this.order[i]) || null;
  }

  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.px = e.clientX - r.left;
    this.py = e.clientY - r.top;
    const over = this.py >= -8 && this.py <= this.h + 64 ? this.hit(e) : null; // the labels sit below the canvas
    this.setHover(over ? over.id : null);
    this.start();
  }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id;
    const t = id && this.tanks.get(id);
    if (t) {
      const r = this.canvas.getBoundingClientRect();
      this.hooks.onHover?.(id, { left: r.left + t.cx - t.bw / 2, width: t.bw, top: r.top + this.y(Math.max(t.level ?? this.lo, this.lo)) });
    } else this.hooks.onHover?.(null);
    this.start();
  }

  start() {
    if (this.running || !this.visible) return;
    this.running = true;
    let prev = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      this.step(dt);
      this.draw();
      if (!this.visible || this.settled()) {
        this.running = false;
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  settled() {
    if (this.px != null) return false; // keep reacting while the cursor is around
    if (Math.abs(this.lo - this.loTo) > 0.01) return false;
    for (const t of this.tanks.values()) {
      if (t.wait > 0 || Math.abs(t.s - 1) > 0.002) return false;
      const target = t.level ?? this.lo - 6;
      if (Math.abs(target - t.shown) > 0.005 || Math.abs(t.vel) > 0.005) return false;
      for (let i = 0; i < t.vy.length; i++) if (Math.abs(t.vy[i]) > 0.01 || Math.abs(t.hgt[i]) > 0.03) return false;
    }
    return true;
  }

  step(dt) {
    this.time += dt;
    this.lo += (this.loTo - this.lo) * (1 - Math.exp(-dt * 5));
    if (Math.abs(this.loTo - this.lo) < 0.01) this.lo = this.loTo;
    const k = 46;
    const c = 2 * 0.58 * Math.sqrt(k);
    const steps = Math.max(1, Math.round(dt / (1 / 120)));
    const h = dt / steps;
    const near = this.px != null && !reduceMotion.matches;
    const reach = this.slot * 0.95;
    for (const t of this.tanks.values()) {
      // Swell toward the cursor (Gaussian falloff across neighbouring tanks).
      const want = near ? 1 + 0.34 * Math.exp(-(((this.px - t.cx) / reach) ** 2)) : 1;
      t.s += (want - t.s) * (1 - Math.exp(-dt * 11));
      if (Math.abs(want - t.s) < 0.001) t.s = want;
      this.place(t);
      if (t.wait > 0) {
        t.wait -= dt;
        continue;
      }
      const target = t.level ?? this.lo - 6;
      const n = t.hgt.length;
      // Water under the cursor lifts toward it, more strongly the closer the cursor is to the surface.
      let lift = null;
      if (near && t.level != null) {
        const surfaceY = this.y(t.shown);
        const vertical = Math.exp(-(((this.py - surfaceY) / 110) ** 2));
        lift = (i) => {
          const colX = t.x + ((i + 0.5) / n) * t.w;
          return -10 * vertical * Math.exp(-(((colX - this.px) / (t.w * 0.5)) ** 2));
        };
      }
      for (let s = 0; s < steps; s++) {
        t.vel += (k * (target - t.shown) - c * t.vel) * h;
        t.shown += t.vel * h;
        for (let i = 0; i < n; i++) {
          const rest = lift ? lift(i) : 0;
          t.vy[i] += (-120 * (t.hgt[i] - rest) - 3.2 * t.vy[i]) * h;
        }
        for (let i = 0; i < n; i++) {
          const l = i > 0 ? t.hgt[i - 1] : t.hgt[i];
          const r = i < n - 1 ? t.hgt[i + 1] : t.hgt[i];
          t.vy[i] += (l + r - 2 * t.hgt[i]) * 700 * h;
        }
        for (let i = 0; i < n; i++) t.hgt[i] += t.vy[i] * h;
      }
    }
  }

  surface(t, u) {
    // u in [0, 1] across the tank.
    const n = t.hgt.length;
    const f = Math.max(0, Math.min(n - 1, u * n - 0.5));
    const i = Math.floor(f);
    const j = Math.min(n - 1, i + 1);
    const w = f - i;
    return this.y(t.shown) + t.hgt[i] * (1 - w) + t.hgt[j] * w;
  }

  draw() {
    const { ctx, w, h, dpr, colors } = this;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const top = this.y(100);

    for (const id of this.order) {
      const t = this.tanks.get(id);
      if (!t || t.x == null) continue;
      const r = Math.min(10, t.w / 2);
      const hot = this.hover === id;
      // Track: the empty vessel up to 100%.
      ctx.save();
      roundRect(ctx, t.x, top, t.w, h - top + r, r);
      ctx.fillStyle = colors.track;
      ctx.globalAlpha = hot ? 1 : 0.55 + 0.45 * Math.min(1, (t.s - 1) / 0.34);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.clip();
      // Liquid.
      if (t.shown > this.lo - 6) {
        const steps = Math.max(4, Math.round(t.w / 3));
        ctx.beginPath();
        ctx.moveTo(t.x, h + r);
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          ctx.lineTo(t.x + u * t.w, this.surface(t, u));
        }
        ctx.lineTo(t.x + t.w, h + r);
        ctx.closePath();
        ctx.fillStyle = t.below ? colors.danger : colors.accent;
        ctx.fill();
        // Meniscus: a thin light line riding the surface.
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const yy = this.surface(t, u) + 1;
          s ? ctx.lineTo(t.x + u * t.w, yy) : ctx.moveTo(t.x, yy);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      // A course with its own minimum gets its own short line.
      if (t.min !== this.line) {
        const my = Math.round(this.y(t.min)) + 0.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = colors.ink;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(t.x, my);
        ctx.lineTo(t.x + t.w, my);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    if (this.line != null) {
      const ly = Math.round(this.y(this.line)) + 0.5;
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(w, ly);
      ctx.stroke();
      ctx.restore();
      // Label the line where there is room beside the last tank.
      const last = this.tanks.get(this.order.at(-1));
      const gap = last ? w - (last.cx + (last.bw * 1.34) / 2) : 0;
      if (gap >= 30) {
        ctx.font = `500 11px ${this.font}`;
        ctx.fillStyle = colors.ink;
        ctx.globalAlpha = 0.7;
        ctx.textAlign = 'right';
        ctx.fillText(`${this.line}%`, w - 2, ly - 6);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }
    }
    this.hooks.onDraw?.(this);
  }

  /** Current swell of a tank, 1 at rest. */
  scaleOf(id) {
    return this.tanks.get(id)?.s ?? 1;
  }

  destroy() {
    this.running = false;
    this.ro.disconnect();
    this.io.disconnect();
    removeEventListener('themechange', this.onTheme);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
