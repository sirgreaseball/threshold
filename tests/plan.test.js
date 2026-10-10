import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyFromCredits, classesLeft, evaluate, minFor, shortName, parseDate, daysBetween } from '../src/plan.js';

const part = (id, kind, attended, conducted, extra = {}) => ({ id, kind, attended, conducted, ...extra });
const weekly = (credits, parts) => Object.fromEntries(weeklyFromCredits(credits, parts));

test('credits to classes a week (1 credit = 1 lecture hour or 2 lab hours a week)', () => {
  const th = part('t', 'Theory', 0, 0);
  const pr = part('p', 'Practical', 0, 0);
  const tu = part('u', 'Tutorial', 0, 0);
  assert.deepEqual(weekly(3, [th, pr]), { p: 2, t: 2 }); // 2 lectures + 2 lab hours: 60 hours over 15 weeks
  assert.deepEqual(weekly(4, [th, pr]), { p: 2, t: 3 });
  assert.deepEqual(weekly(2, [th]), { t: 2 });
  assert.deepEqual(weekly(1, [pr]), { p: 2 });
  assert.deepEqual(weekly(4, [th, tu]), { u: 1, t: 3 });
  assert.equal(weeklyFromCredits(0, [th]), null);
});

const term = { start: '2026-07-13', end: '2026-11-13', asOf: '2026-10-04' };
const cn = () => ({ id: 'cn', name: 'Computer Networks', parts: [part('t', 'Theory', 21, 22), part('p', 'Practical', 20, 22)] });

test('classes left: pace so far, credits, weekly and planned totals', () => {
  // 22 classes in 83 days is about 1.86 a week; 40 days are left, so about 11 more of each.
  const pace = classesLeft(cn(), term);
  assert.equal(pace.source, 'pace');
  assert.deepEqual(Object.fromEntries(pace.byPart), { t: 11, p: 11 });
  assert.equal(pace.total, 22);

  // 3 credits plan 2 + 2 a week over the 17.6-week term: 35 planned per part, 13 still to come.
  const cred = classesLeft({ ...cn(), plan: 'credits', credits: 3 }, term);
  assert.equal(cred.source, 'credits');
  assert.deepEqual(Object.fromEntries(cred.byPart), { t: 13, p: 13 });

  const wk = classesLeft({ ...cn(), plan: 'weekly', parts: [part('t', 'Theory', 21, 22, { perWeek: 3 }), part('p', 'Practical', 20, 22, { perWeek: 2 })] }, term);
  assert.deepEqual(Object.fromEntries(wk.byPart), { t: 17, p: 11 });

  const tot = classesLeft({ ...cn(), plan: 'total', parts: [part('t', 'Theory', 21, 22, { total: 30 }), part('p', 'Practical', 20, 22, { total: 20 })] }, term);
  assert.deepEqual(Object.fromEntries(tot.byPart), { t: 8, p: 0 });

  assert.equal(classesLeft(cn(), { ...term, end: '' }).reason, 'no-end');
  assert.equal(classesLeft(cn(), { ...term, start: '' }).reason, 'no-start');
});

test('evaluate: combined counts against one minimum', () => {
  const e = evaluate(cn(), { min: 80, mode: 'combined' }, term);
  assert.equal(e.pct.toFixed(2), '93.18'); // matches the report
  assert.equal(e.status, 'safe');
  assert.equal(e.miss, 7);
  // 41 of 44 now, 22 to come: finishing at 80% needs 53 of 66, so 10 can be skipped.
  assert.deepEqual(e.end, { total: 66, needed: 53, maxSkip: 10, reachable: true, best: (63 * 100) / 66 });
});

test('evaluate: separate minimums per type, worst part leads', () => {
  const course = { id: 'x', name: 'Chem', parts: [part('t', 'Theory', 30, 36), part('p', 'Practical', 15, 20)] };
  const e = evaluate(course, { min: 75, mode: 'separate', labMin: 85 }, term);
  assert.equal(e.worstKind, 'Practical');
  assert.equal(e.status, 'below');
  assert.equal(e.need, 14); // 15 of 20 is 75%; reaching 85% takes 14 in a row
});

test('evaluate: in separate mode the counts add up over the parts', () => {
  const course = { id: 'x', name: 'Chem', parts: [part('t', 'Theory', 30, 36), part('p', 'Practical', 15, 20)] };
  const e = evaluate(course, { min: 75, mode: 'separate', labMin: null }, term);
  assert.equal(e.status, 'edge'); // the practical has nothing to spare
  assert.equal(e.miss, 4); // so all four are theory classes
  assert.equal(e.left, 27); // 17 theory and 10 practical still to come
  assert.equal(e.end.maxSkip, 9); // 7 theory and 2 practical can be skipped
  assert.equal(e.end.reachable, true);
  // At 85% for labs, 25 of 30 practicals is the best case: short of the line, whatever the theory does.
  const strict = evaluate(course, { min: 75, mode: 'separate', labMin: 85 }, term);
  assert.equal(strict.end.reachable, false);
  assert.equal(strict.endKind, 'Practical');
  assert.equal(strict.end.best.toFixed(2), '83.33');
});

test('a course minimum overrides the college one', () => {
  assert.equal(minFor({ min: 75, mode: 'combined' }, { min: 90 }), 90);
  assert.equal(minFor({ min: 75, mode: 'separate', labMin: 85 }, {}, { kind: 'Practical' }), 85);
  assert.equal(minFor({ min: 75, mode: 'combined', labMin: 85 }, {}, { kind: 'Practical' }), 75);
});

test('short names', () => {
  assert.equal(shortName('Computer Networks'), 'CN');
  assert.equal(shortName('Financial Institutions, Markets, Instrum'), 'FIMI');
  assert.equal(shortName('Engineering Mathematics III'), 'EM3');
  assert.equal(shortName('Physics'), 'Phys');
  assert.equal(shortName('Physics 2'), 'Phy2');
});

test('dates', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(daysBetween(parseDate('2026-07-13'), parseDate('2026-10-04')), 83);
});
