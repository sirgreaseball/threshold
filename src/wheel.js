// A number wheel, like the one in Apple's timer: flick, drag or scroll it and it
// settles on a value in the middle band, with the rows tilting away above and
// below. It is a native scroll container with scroll-snap, so momentum and
// snapping feel like the platform's own; this file only reads where it stopped.
//
// Keyboard: arrows step by one, Page Up and Page Down by ten, Home and End jump
// to the ends. It is announced as a spin button.

/**
 * @param {{ values: any[], value?: any, format?: (v: any) => string, label: string,
 *           rows?: number, onChange?: (v: any) => void }} opts
 * @returns {{ el: HTMLElement, readonly value: any, set: (v: any, opts?: { smooth?: boolean }) => void }}
 */
export function wheel({ values, value, format = String, label, rows = 5, onChange }) {
  const root = document.createElement('div');
  root.className = 'wheel';
  root.style.setProperty('--rows', rows);
  root.innerHTML = '<div class="wheel__view" tabindex="0" role="spinbutton" data-lenis-prevent><ol class="wheel__list"></ol></div>';
  const view = root.firstElementChild;
  const list = view.firstElementChild;
  const items = values.map((v, i) => {
    const li = document.createElement('li');
    li.className = 'wheel__item';
    li.textContent = format(v);
    li.dataset.i = i;
    return li;
  });
  list.append(...items);
  view.setAttribute('aria-label', label);
  const numbers = values.filter((v) => typeof v === 'number');
  if (numbers.length) {
    view.setAttribute('aria-valuemin', Math.min(...numbers));
    view.setAttribute('aria-valuemax', Math.max(...numbers));
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index = indexOf(value);
  let itemH = 0;
  let raf = 0;
  let settle = 0;
  let lit = -1;
  // Only a person's scroll changes the value. A scroll nobody made (the page moved
  // the wheel, which resets it to the top) is put back instead.
  let touched = false;

  function indexOf(v) {
    const i = values.indexOf(v);
    if (i >= 0) return i;
    // The nearest value, for a number the wheel does not list.
    let best = 0;
    let gap = Infinity;
    if (typeof v === 'number') {
      values.forEach((x, k) => {
        if (typeof x === 'number' && Math.abs(x - v) < gap) {
          gap = Math.abs(x - v);
          best = k;
        }
      });
    }
    return best;
  }

  function announce() {
    const v = values[index];
    if (typeof v === 'number') view.setAttribute('aria-valuenow', v);
    else view.removeAttribute('aria-valuenow');
    view.setAttribute('aria-valuetext', format(v));
  }

  // Rows tilt away from the middle and fade, as on a real wheel.
  function paint() {
    if (!itemH) return;
    const center = view.scrollTop / itemH;
    const from = Math.max(0, Math.floor(center - rows));
    const to = Math.min(items.length - 1, Math.ceil(center + rows));
    for (let i = from; i <= to; i++) {
      const d = i - center;
      const s = items[i].style;
      s.transform = `rotateX(${Math.max(-75, Math.min(75, -d * 20))}deg)`;
      s.opacity = String(Math.max(0.12, 1 - Math.abs(d) * 0.32));
    }
    const on = Math.max(0, Math.min(items.length - 1, Math.round(center)));
    if (on !== lit) {
      items[lit]?.classList.remove('is-on');
      items[on].classList.add('is-on');
      lit = on;
    }
  }

  function commit() {
    clearTimeout(settle);
    if (!itemH) return;
    if (!touched) {
      if (Math.abs(view.scrollTop - index * itemH) > 1) view.scrollTop = index * itemH;
      return;
    }
    const i = Math.max(0, Math.min(items.length - 1, Math.round(view.scrollTop / itemH)));
    if (Math.abs(view.scrollTop - i * itemH) > 1) {
      view.scrollTo({ top: i * itemH, behavior: reduce ? 'auto' : 'smooth' });
      return; // commits again once it has settled
    }
    touched = false;
    if (i === index) return;
    index = i;
    announce();
    onChange?.(values[i]);
  }

  function go(i, smooth = !reduce) {
    i = Math.max(0, Math.min(items.length - 1, i));
    if (!itemH) {
      index = i;
      announce();
      return;
    }
    view.scrollTo({ top: i * itemH, behavior: smooth ? 'smooth' : 'auto' });
  }

  view.addEventListener(
    'scroll',
    () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          paint();
        });
      }
      clearTimeout(settle);
      settle = setTimeout(commit, 160);
    },
    { passive: true },
  );
  view.addEventListener('scrollend', commit);
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown']) view.addEventListener(type, () => (touched = true), { passive: true });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.wheel__item');
    if (li) go(Number(li.dataset.i));
  });
  view.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (step) go(index + step);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else return;
    e.preventDefault();
  });

  // The wheel can only scroll once it is laid out: a closed sheet or drawer has no size yet.
  new ResizeObserver(() => {
    const h = items[0]?.offsetHeight || 0;
    if (!h) return;
    const first = !itemH;
    itemH = h;
    if (first || Math.abs(view.scrollTop - index * itemH) > 1) view.scrollTop = index * itemH;
    paint();
  }).observe(view);
  announce();

  return {
    el: root,
    get value() {
      return values[index];
    },
    set(v, { smooth = false } = {}) {
      const i = indexOf(v);
      if (i === index && itemH && Math.abs(view.scrollTop - i * itemH) <= 1) return;
      index = i;
      announce();
      go(i, smooth);
    },
  };
}

/** Whole numbers from a to b, or with a step: range(0.5, 12, 0.5). */
export const range = (a, b, step = 1) => Array.from({ length: Math.floor((b - a) / step + 1e-9) + 1 }, (_, i) => +(a + i * step).toFixed(2));
