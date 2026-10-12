// Cursor-aware details, in the spirit of lusion.co:
// - [data-magnet] elements lean toward a nearby cursor and spring back when it
//   leaves (the value is the strength, 0.3 by default);
// - [data-magnet-inner] children move a little further, for depth;
// - buttons get --px/--py so their inner glow follows the cursor;
// - [data-spot] surfaces get --mx/--my for a soft spotlight that tracks it.
// Mouse only (a touch has no "near"), and nothing with reduced motion.

import gsap from 'gsap';

// GSAP writes its version onto window when its clock first starts. Start the
// clock now and take the note back: nothing reads it, and it names the library.
gsap.ticker.wake();
delete window.gsapVersions;

const fine = matchMedia('(hover: hover) and (pointer: fine)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export function magnetize() {
  if (!fine.matches || reduce.matches) return;
  const springs = new WeakMap();
  let px = -1e5;
  let py = -1e5;
  let raf = 0;

  const spring = (el) => {
    let s = springs.get(el);
    if (!s) {
      const to = (prop) => gsap.quickTo(el, prop, { duration: 0.75, ease: 'power3.out' });
      el.style.setProperty('--mx', '0');
      el.style.setProperty('--my', '0');
      s = { x: to('--mx'), y: to('--my'), on: false };
      springs.set(el, s);
    }
    return s;
  };

  function tick() {
    raf = 0;
    for (const el of document.querySelectorAll('[data-magnet]')) {
      const s = spring(el);
      const inner = el.querySelector('[data-magnet-inner]');
      const si = inner && spring(inner);
      const r = el.getBoundingClientRect();
      // Measure from where the element would sit without its own lean.
      const cx = r.left + r.width / 2 - (parseFloat(el.style.getPropertyValue('--mx')) || 0);
      const cy = r.top + r.height / 2 - (parseFloat(el.style.getPropertyValue('--my')) || 0);
      const dx = px - cx;
      const dy = py - cy;
      const reach = Math.max(r.width, r.height) / 2 + 36;
      const d = Math.hypot(dx, dy);
      if (d < reach) {
        const k = (Number(el.dataset.magnet) || 0.3) * (1 - 0.35 * (d / reach) ** 2);
        // A lean, not a chase: never more than a few pixels (6% of the short side,
        // 1.5 to 3 px), so neighbours a normal gap apart keep clear air between them.
        const cap = Math.max(1.5, Math.min(3, Math.min(r.width, r.height) * 0.06));
        let mx = dx * k;
        let my = dy * k;
        const len = Math.hypot(mx, my);
        if (len > cap) {
          mx *= cap / len;
          my *= cap / len;
        }
        s.x(mx);
        s.y(my);
        si?.x(mx * 0.5);
        si?.y(my * 0.5);
        s.on = true;
      } else if (s.on) {
        s.x(0);
        s.y(0);
        si?.x(0);
        si?.y(0);
        s.on = false;
      }
      if (el.classList.contains('btn')) {
        el.style.setProperty('--px', `${px - r.left}px`);
        el.style.setProperty('--py', `${py - r.top}px`);
      }
    }
    const spot = document.elementFromPoint(px, py)?.closest('[data-spot]');
    if (spot) {
      const r = spot.getBoundingClientRect();
      spot.style.setProperty('--sx', `${px - r.left}px`);
      spot.style.setProperty('--sy', `${py - r.top}px`);
    }
  }

  const queue = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      px = e.clientX;
      py = e.clientY;
      queue();
    },
    { passive: true },
  );
  // Content scrolling under a still cursor changes what is near it.
  addEventListener('scroll', queue, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    px = py = -1e5;
    queue();
  });
}
