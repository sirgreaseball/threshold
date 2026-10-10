// Course-level planning on top of core.js: courses made of parts (theory,
// practical, tutorial, studio), college rules, semester dates, and estimates of
// how many classes are still to come. Pure functions; no DOM.

import { percent, canMiss, mustAttend, status, forecast } from './core.js';

export const KINDS = ['Theory', 'Practical', 'Tutorial', 'Studio'];
const LAB = new Set(['Practical', 'Studio']);
export const isLab = (kind) => LAB.has(kind);

const DAY = 86400000;

/** 'YYYY-MM-DD' to a local-midnight Date, or null if missing or invalid. */
export function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from a to b. Rounded, so a daylight-saving hour never loses a day. */
export const daysBetween = (a, b) => Math.round((b - a) / DAY);

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function sumParts(parts) {
  let attended = 0;
  let conducted = 0;
  for (const p of parts) {
    attended += p.attended;
    conducted += p.conducted;
  }
  return { attended, conducted };
}

/**
 * The minimum that applies. A course's own minimum wins; in "separate" mode a
 * lab-type part can have its own minimum; otherwise the college-wide one.
 */
export function minFor(rule, course, part) {
  if (course.min) return course.min;
  if (part && rule.mode === 'separate' && rule.labMin && isLab(part.kind)) return rule.labMin;
  return rule.min;
}

/**
 * Classes a week for each part, implied by a course's credits. Uses the AICTE
 * definition: 1 credit = 1 lecture or tutorial hour a week, or 2 lab hours a
 * week, and treats each hour as one class (that is how most attendance
 * reports count a two-hour lab). Each lab or tutorial part takes one credit as
 * long as theory keeps at least one; theory gets the rest.
 * Returns Map(partId -> classes a week), or null without credits.
 */
export function weeklyFromCredits(credits, parts) {
  if (!(credits > 0) || !parts.length) return null;
  const labs = parts.filter((p) => isLab(p.kind));
  const tuts = parts.filter((p) => p.kind === 'Tutorial');
  const theory = parts.filter((p) => !isLab(p.kind) && p.kind !== 'Tutorial');
  const out = new Map();
  if (!theory.length && !tuts.length) {
    labs.forEach((p) => out.set(p.id, (2 * credits) / labs.length));
    return out;
  }
  let left = credits;
  for (const p of [...labs, ...tuts]) {
    const cost = 1;
    const ok = !theory.length || left - cost >= 1;
    out.set(p.id, ok ? (isLab(p.kind) ? 2 : 1) : 0);
    if (ok) left -= cost;
  }
  theory.forEach((p) => out.set(p.id, Math.max(0, left) / theory.length));
  return out;
}

/** How a course's classes left are worked out. "auto" takes the first that has what it needs, in this order. */
export const PLAN_MODES = ['auto', 'total', 'credits', 'pace', 'weekly'];

// A semester is planned as 15 teaching weeks, so a credit is 15 classes, or 30 in a lab.
export const TERM_WEEKS = 15;

/**
 * Split n classes over a course's parts in proportion to the classes each has
 * held so far (evenly before any), so the shares add up to exactly n.
 */
function share(n, parts) {
  const held = parts.reduce((s, p) => s + p.conducted, 0);
  const raw = parts.map((p) => (held ? (n * p.conducted) / held : n / parts.length));
  const out = raw.map(Math.floor);
  let rest = n - out.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest-- <= 0) break;
    out[i]++;
  }
  return new Map(parts.map((p, i) => [p.id, out[i]]));
}

/**
 * Classes still to come for each part of a course.
 * term: { start, end, asOf } as 'YYYY-MM-DD' strings ('' when unknown).
 * Returns { total, byPart: Map, source, reason } where source is one of
 * 'total' | 'credits' | 'pace' | 'weekly' and total is null when unknown.
 *
 * - total: the classes the course has this semester, as the college plans it.
 * - credits: that total worked out from credits, a 15-week semester.
 * - pace: classes held so far a week, until the end date. An estimate.
 * - weekly: classes a week for each part, until the end date.
 */
export function classesLeft(course, term, today = new Date()) {
  const start = parseDate(term.start);
  const end = parseDate(term.end);
  const asOf = parseDate(term.asOf) || startOfDay(today);
  const mode = course.plan || 'auto';
  const parts = course.parts;
  const none = (reason) => ({ total: null, byPart: null, source: null, reason });
  const weeksLeft = end ? Math.max(0, daysBetween(asOf, end)) / 7 : 0;

  const fromTotal = () => {
    if (!(course.total > 0)) return none('no-total');
    const held = parts.reduce((s, p) => s + p.conducted, 0);
    return done(share(Math.max(0, course.total - held), parts), 'total');
  };
  const fromCredits = () => {
    const weekly = weeklyFromCredits(course.credits, parts);
    if (!weekly) return none('no-credits');
    return done(new Map(parts.map((p) => [p.id, Math.max(0, Math.round((weekly.get(p.id) || 0) * TERM_WEEKS) - p.conducted)])), 'credits');
  };
  const fromPace = () => {
    if (!end) return none('no-end');
    if (!start) return none('no-start');
    const elapsed = daysBetween(start, asOf);
    if (elapsed < 14 || !parts.some((p) => p.conducted > 0)) return none('too-early');
    return done(new Map(parts.map((p) => [p.id, Math.round(((p.conducted * 7) / elapsed) * weeksLeft)])), 'pace');
  };
  const fromWeekly = () => {
    if (!end) return none('no-end');
    if (!parts.some((p) => p.perWeek > 0)) return none('no-weekly');
    return done(new Map(parts.map((p) => [p.id, Math.round((p.perWeek || 0) * weeksLeft)])), 'weekly');
  };

  if (mode === 'total') return fromTotal();
  if (mode === 'credits') return fromCredits();
  if (mode === 'pace') return fromPace();
  if (mode === 'weekly') return fromWeekly();
  // auto: what the college plans beats an estimate.
  if (course.total > 0) return fromTotal();
  if (course.credits > 0) return fromCredits();
  const pace = fromPace();
  if (pace.total == null && end && parts.some((p) => p.perWeek > 0)) return fromWeekly();
  return pace;

  function done(byPart, source) {
    let total = 0;
    for (const v of byPart.values()) total += v;
    return { total, byPart, source, reason: null };
  }
}

/** The numbers for one set of counts against one minimum. */
export function judge(attended, conducted, min, left = null) {
  const st = status(attended, conducted, min);
  return {
    attended,
    conducted,
    min,
    pct: percent(attended, conducted),
    status: st,
    miss: st === 'safe' || st === 'edge' ? canMiss(attended, conducted, min) : 0,
    need: st === 'below' ? mustAttend(attended, conducted, min) : 0,
    left,
    end: left == null ? null : forecast(attended, conducted, min, left),
  };
}

/** Lower is worse: below the line sorts before on-the-line, which sorts before safe. */
export function slack(j) {
  if (j.status === 'empty') return Infinity;
  if (j.status === 'below') return -1 - (Number.isFinite(j.need) ? j.need : 1e6);
  return j.miss;
}

/** Everything the dashboard shows for one course. */
export function evaluate(course, rule, term, today = new Date()) {
  const left = classesLeft(course, term, today);
  const { attended, conducted } = sumParts(course.parts);
  if (rule.mode !== 'separate' || course.parts.length < 2) {
    const j = judge(attended, conducted, minFor(rule, course, course.parts[0]), left.total);
    return { ...j, mode: 'combined', plan: left, parts: course.parts.map((p) => partView(p, rule, course, left)) };
  }
  // Separate: each part must clear its own minimum. The course takes its status
  // from its worst part, and its counts are the sums over the parts: the classes
  // that can be missed now, the classes needed to get back, and by the last
  // class, how many of those still to come can be skipped.
  const parts = course.parts.map((p) => partView(p, rule, course, left));
  const js = parts.map((p) => p.judge);
  const worst = parts.reduce((w, p) => (slack(p.judge) < slack(w.judge) ? p : w));
  const sum = (f) => js.reduce((s, j) => s + f(j), 0);
  const below = js.some((j) => j.status === 'below');
  let end = null;
  let endKind = null;
  if (js.every((j) => j.end)) {
    const short = parts.filter((p) => !p.judge.end.reachable);
    const tightest = parts.reduce((w, p) => (endSlack(p.judge.end) < endSlack(w.judge.end) ? p : w));
    endKind = tightest.kind;
    end = {
      total: sum((j) => j.end.total),
      needed: sum((j) => j.end.needed),
      maxSkip: short.length ? tightest.judge.end.maxSkip : sum((j) => j.end.maxSkip),
      reachable: !short.length,
      best: tightest.judge.end.best,
    };
  }
  return {
    ...worst.judge,
    pct: percent(attended, conducted),
    attended,
    conducted,
    miss: below ? 0 : sum((j) => j.miss),
    need: sum((j) => j.need),
    mode: 'separate',
    worstKind: worst.kind,
    end,
    endKind,
    left: left.total,
    plan: left,
    parts,
  };
}

const endSlack = (e) => (e.reachable ? e.maxSkip : -1e6 + e.best);

function partView(p, rule, course, left) {
  const min = minFor(rule, course, p);
  return { id: p.id, kind: p.kind, judge: judge(p.attended, p.conducted, min, left.byPart ? left.byPart.get(p.id) ?? 0 : null) };
}

/** Short label for a course: initials of its main words, or the start of a one-word name. */
export function shortName(name) {
  // A name that carries its own abbreviation uses it: "Code of Civil Procedure (CPC)" -> "CPC".
  const own = name.match(/\((\p{Lu}[\p{Lu}\p{N}]{1,5})\)\W*$/u);
  if (own) return own[1];
  const stop = new Set(['and', 'of', 'in', 'for', 'the', 'to', 'with', 'on', 'a', 'an', '&']);
  const words = name
    .replace(/[^\p{L}\p{N}\s&]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !stop.has(w.toLowerCase()));
  if (!words.length) return name.slice(0, 3);
  // A small number or Roman numeral at the end stays whole ("Mathematics III" -> "M3");
  // other numbers, such as a year, give no initial. The rest give initials.
  const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  let tail = '';
  const last = words[words.length - 1];
  if (words.length > 1 && /^\d{1,2}$/.test(last)) tail = words.pop();
  else if (words.length > 1 && roman[last.toUpperCase()]) tail = String(roman[words.pop().toUpperCase()]);
  const lettered = words.filter((w) => !/^\d+$/.test(w));
  if (!lettered.length) return name.slice(0, 4);
  if (lettered.length === 1) return lettered[0].slice(0, tail ? 3 : 4) + tail;
  return (
    lettered
      .slice(0, 4)
      .map((w) => w[0].toUpperCase())
      .join('') + tail
  );
}
