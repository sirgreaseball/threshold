// Light and dark themes. The choice is stored; without one the page follows the
// system. Switching floods the new theme out from the toggle as a blob of
// liquid, using the View Transitions API: the old page is a still snapshot, the
// new page is live underneath, and a wobbling clip-path reveals it.

import { icon } from './icons.js';

const KEY = 'threshold.theme';
const root = document.documentElement;
const system = matchMedia('(prefers-color-scheme: dark)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export const currentTheme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function apply(next, remember) {
  root.dataset.theme = next;
  if (remember) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The toggle still works for this visit.
    }
  }
  // Match the browser chrome (status bar, tab strip) to the page.
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', paper));
  dispatchEvent(new CustomEvent('themechange', { detail: next }));
}

// Follow the system until the person picks a theme themselves.
system.addEventListener('change', () => {
  if (!stored()) apply(system.matches ? 'dark' : 'light', false);
});

/** A wobbly circle as a CSS polygon: the edge of the flood at one moment. */
function blob(cx, cy, r, wobble, t, points = 72) {
  const out = [];
  for (let j = 0; j < points; j++) {
    const a = (j / points) * Math.PI * 2;
    const k =
      1 +
      wobble *
        (0.55 * Math.sin(3 * a + 5.1 * t + 0.6) + 0.3 * Math.sin(5 * a - 7.3 * t + 2.1) + 0.15 * Math.sin(9 * a + 11.7 * t + 4.2));
    out.push(`${(cx + Math.cos(a) * r * k).toFixed(1)}px ${(cy + Math.sin(a) * r * k).toFixed(1)}px`);
  }
  return `polygon(${out.join(',')})`;
}

/**
 * Keyframes for the flood. Easing is baked into the radius (slow start as the
 * drop forms, fast through the middle, a soft landing), and the wobble swells
 * mid-way and dies to zero so the last frame is a clean full cover.
 */
function floodFrames(cx, cy) {
  const far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) * 1.18;
  const frames = [];
  const K = 36;
  for (let i = 0; i <= K; i++) {
    const t = i / K;
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const r = 2 + far * e;
    const wobble = 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t);
    frames.push({ clipPath: blob(cx, cy, r, wobble, t) });
  }
  return frames;
}

let busy = false;

async function toggle(btn) {
  if (busy) return;
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  if (!document.startViewTransition || reduce.matches) {
    apply(next, true);
    sync(btn);
    return;
  }
  busy = true;
  const r = btn.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  root.classList.add('theme-flooding');
  const vt = document.startViewTransition(() => {
    apply(next, true);
    sync(btn);
  });
  try {
    await vt.ready;
    root.animate(floodFrames(cx, cy), {
      duration: 1150,
      easing: 'linear',
      pseudoElement: '::view-transition-new(root)',
    });
    await vt.finished;
  } catch {
    // A skipped transition still applied the theme.
  } finally {
    root.classList.remove('theme-flooding');
    busy = false;
  }
}

function sync(btn) {
  const dark = currentTheme() === 'dark';
  btn.setAttribute('aria-pressed', String(dark));
  btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

/** Wire up a toggle button: <button class="theme-btn"></button>. */
export function bindThemeToggle(btn) {
  btn.innerHTML = `<span class="theme-btn__icon theme-btn__sun">${icon('sun')}</span><span class="theme-btn__icon theme-btn__moon">${icon('moon')}</span>`;
  btn.type = 'button';
  sync(btn);
  btn.addEventListener('click', () => toggle(btn));
  addEventListener('themechange', () => sync(btn));
}

// The inline script in <head> already set data-theme before first paint; make
// sure the meta colours agree with it.
apply(currentTheme(), false);
