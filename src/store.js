// Saved state, in this browser only. Version 2 holds courses made of parts.
// Version 1 (single subjects) is migrated on first load.

import { KINDS, PLAN_MODES, isoDate } from './plan.js';

const KEY = 'threshold.v2';
const OLD_KEY = 'threshold.v1';
const PENDING = 'threshold.pending';

export const blank = () => ({
  v: 2,
  rule: { min: 75, mode: 'combined', labMin: null },
  term: { start: '', end: '', asOf: '' },
  courses: [],
});

export const uid = () => Math.random().toString(36).slice(2, 10);

const whole = (n, max = 9999) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
const pct = (n) => (Number.isInteger(Number(n)) && n >= 1 && n <= 100 ? Number(n) : null);
const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');

export function cleanPart(p) {
  const conducted = whole(p.conducted);
  const perWeek = Math.max(0, Math.min(40, Number(p.perWeek) || 0));
  const total = p.total == null || p.total === '' ? null : whole(p.total);
  return {
    id: String(p.id || uid()),
    kind: KINDS.includes(p.kind) ? p.kind : 'Theory',
    attended: Math.min(whole(p.attended), conducted),
    conducted,
    perWeek,
    total,
  };
}

export function cleanCourse(c) {
  const parts = (Array.isArray(c.parts) && c.parts.length ? c.parts : [{ kind: 'Theory' }]).map(cleanPart);
  const credits = Number(c.credits);
  return {
    id: String(c.id || uid()),
    name: String(c.name || 'Course').slice(0, 60),
    credits: credits > 0 && credits <= 30 ? credits : null,
    min: pct(c.min),
    plan: PLAN_MODES.includes(c.plan) ? c.plan : 'auto',
    parts,
  };
}

export function cleanState(s) {
  const b = blank();
  const rule = s?.rule || {};
  return {
    v: 2,
    rule: {
      min: pct(rule.min) ?? b.rule.min,
      mode: rule.mode === 'separate' ? 'separate' : 'combined',
      labMin: pct(rule.labMin),
    },
    term: { start: date(s?.term?.start), end: date(s?.term?.end), asOf: date(s?.term?.asOf) },
    courses: Array.isArray(s?.courses) ? s.courses.filter((c) => c && typeof c.name === 'string').map(cleanCourse) : [],
  };
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function load() {
  const v2 = read(KEY);
  if (v2 && Array.isArray(v2.courses)) return cleanState(v2);
  const v1 = read(OLD_KEY);
  if (v1 && Array.isArray(v1.subjects)) {
    return cleanState({
      rule: { min: v1.target },
      term: { end: v1.semEnd },
      courses: v1.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        plan: s.perWeek > 0 ? 'weekly' : 'auto',
        parts: [{ kind: 'Theory', attended: s.attended, conducted: s.conducted, perWeek: s.perWeek }],
      })),
    });
  }
  return blank();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage full: the planner still works for this visit.
  }
}

export const STORAGE_KEY = KEY;

/** The landing page hands a parsed report to the planner through the session. */
export function setPending(report) {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify(report));
  } catch {
    // Without session storage the planner opens with an empty import dialog instead.
  }
}

export function takePending() {
  try {
    const raw = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * A believable semester to explore: theory and practical rows, credits, and a
 * term that runs from twelve weeks ago to five weeks from now. Numbers are made up.
 */
export function sample(today = new Date()) {
  const day = (offset) => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return isoDate(d);
  };
  const course = (name, credits, ...parts) => ({ id: uid(), name, credits, plan: 'auto', parts: parts.map(([kind, attended, conducted]) => ({ id: uid(), kind, attended, conducted })) });
  return cleanState({
    rule: { min: 75, mode: 'combined' },
    term: { start: day(-84), end: day(35), asOf: day(0) },
    courses: [
      course('Computer Networks', 3, ['Theory', 20, 23], ['Practical', 19, 22]),
      course('Operating Systems', 4, ['Theory', 26, 33], ['Practical', 20, 22]),
      course('Software Engineering', 3, ['Theory', 17, 23], ['Practical', 17, 22]),
      course('Distributed Computing', 3, ['Theory', 12, 22], ['Practical', 18, 22]),
      course('Probability and Statistics', 4, ['Theory', 27, 34], ['Tutorial', 9, 11]),
      course('Design Thinking', 2, ['Studio', 14, 16]),
    ],
  });
}
