// The landing page's scroll story, worked out for any minimum P:
// start comfortably above the line with k1 classes to spare, skip k1 to land on
// the line, skip k2 more to sink below it, then attend n in a row to get back.
// Every number on the page comes from here, so the copy is true for any P.

import { canMiss, mustAttend } from './core.js';

export function story(P) {
  for (const k1 of [4, 3, 2, 1]) {
    for (const k2 of [4, 3, 2]) {
      let best = null;
      for (let t0 = 24; t0 <= 240; t0++) {
        for (let a0 = t0; a0 >= 0; a0--) {
          if (100 * a0 < P * t0) break; // fewer attended only lowers the percent
          if (canMiss(a0, t0, P) !== k1) continue;
          const t2 = t0 + k1 + k2;
          const n = mustAttend(a0, t2, P);
          if (!Number.isFinite(n) || n === 0) continue;
          const exact = 100 * (a0 + n) === P * (t2 + n);
          const p0 = (100 * a0) / t0;
          const score = (exact ? 0 : 8) + Math.abs(n - 10) + Math.abs(p0 - (P + 9)) * 0.5 + t0 * 0.02;
          if (!best || score < best.score) best = { P, a0, t0, k1, k2, n, exact, score };
        }
      }
      if (best) return best;
    }
  }
  return null;
}

/** Every class in order, as {a, t} after it. keys: indexes of the four story beats. */
export function timeline(s) {
  const seq = [{ a: s.a0, t: s.t0 }];
  const step = (da) => {
    const p = seq[seq.length - 1];
    seq.push({ a: p.a + da, t: p.t + 1 });
  };
  for (let i = 0; i < s.k1 + s.k2; i++) step(0);
  for (let i = 0; i < s.n; i++) step(1);
  return { seq, keys: [0, s.k1, s.k1 + s.k2, s.k1 + s.k2 + s.n] };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const word = (n) => WORDS[n] ?? String(n);
export const Word = (n) => {
  const w = word(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
