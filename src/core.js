// Attendance maths. Every function works in whole numbers: `target` is an
// integer percent (75, not 0.75), so 100 * attended and target * conducted
// are exact integers and no floating-point rounding can creep in.
// See tests/core.test.js for the cases where the float version goes wrong.

/** Current attendance as a percent, or null when no lectures have happened. */
export function percent(attended, conducted) {
  return conducted > 0 ? (attended * 100) / conducted : null;
}

/** How many more lectures can be missed while staying at or above target. */
export function canMiss(attended, conducted, target) {
  if (target <= 0) return Infinity;
  return Math.max(0, Math.floor((100 * attended - target * conducted) / target));
}

/** How many lectures in a row must be attended to get back to target. */
export function mustAttend(attended, conducted, target) {
  if (100 * attended >= target * conducted) return 0;
  if (target >= 100) return Infinity;
  return Math.ceil((target * conducted - 100 * attended) / (100 - target));
}

/**
 * Look ahead to the end of the semester, given `remaining` lectures still to come.
 * maxSkip is how many of those can be missed and still finish at or above target;
 * it is negative when even attending every one would not be enough.
 */
export function forecast(attended, conducted, target, remaining) {
  const total = conducted + remaining;
  const needed = Math.ceil((target * total) / 100);
  const maxSkip = attended + remaining - needed;
  return {
    total,
    needed,
    maxSkip: Math.min(maxSkip, remaining),
    reachable: maxSkip >= 0,
    best: percent(attended + remaining, total),
  };
}

/** 'empty' (no lectures yet), 'safe', 'edge' (at or above target, nothing to spare) or 'below'. */
export function status(attended, conducted, target) {
  if (conducted === 0) return 'empty';
  if (100 * attended < target * conducted) return 'below';
  return canMiss(attended, conducted, target) === 0 ? 'edge' : 'safe';
}
