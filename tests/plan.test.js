import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyFromCredits, classesLeft, evaluate, minFor, shortName, parseDate, daysBetween, roundTotal } from '../src/plan.js';

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

test('an estimated total lands on whole credits', () => {
  assert.equal(roundTotal(58), 60);
  assert.equal(roundTotal(20, 15), 15); // a one-credit course that has finished
  assert.equal(roundTotal(42, 33), 45);
  assert.equal(roundTotal(50, 47), 60); // never below what was held
  assert.equal(roundTotal(3), 15);
  assert.equal(roundTotal(69), 60); // leans down: the pace so far runs high
  assert.equal(roundTotal(80, 40), 75); // a five-credit course
  assert.equal(roundTotal(118), 120); // a course with a lab, as some colleges run them
});

test('classes left: pace so far, credits, weekly and planned totals', () => {
  // 22 classes in 83 days is about 1.86 a week; 40 days are left, so about 11 more of each.
  const pace = classesLeft(cn(), term);
  assert.equal(pace.source, 'pace');
  // 44 held at this pace makes about 66, which lands on 60: four credits.
  assert.deepEqual(Object.fromEntries(pace.byPart), { t: 8, p: 8 });
  assert.equal(pace.total, 16);

  // 3 credits plan 2 + 2 a week over a 15-week semester: 30 classes of each, 8 still to come.
  const cred = classesLeft({ ...cn(), plan: 'credits', credits: 3 }, term);
  assert.equal(cred.source, 'credits');
  assert.deepEqual(Object.fromEntries(cred.byPart), { t: 8, p: 8 });

  const wk = classesLeft({ ...cn(), plan: 'weekly', parts: [part('t', 'Theory', 21, 22, { perWeek: 3 }), part('p', 'Practical', 20, 22, { perWeek: 2 })] }, term);
  assert.deepEqual(Object.fromEntries(wk.byPart), { t: 17, p: 11 });

  // 60 classes this semester, 44 held: 16 to come, shared like the classes so far.
  const tot = classesLeft({ ...cn(), total: 60 }, term);
  assert.equal(tot.source, 'total');
  assert.deepEqual(Object.fromEntries(tot.byPart), { t: 8, p: 8 });

  assert.equal(classesLeft(cn(), { ...term, end: '' }).reason, 'no-end');
  assert.equal(classesLeft(cn(), { ...term, start: '' }).reason, 'no-start');
});

test('classes left: what the college plans comes before an estimate', () => {
  // A total or credits need no dates at all, and beat the pace so far.
  assert.equal(classesLeft({ ...cn(), total: 60, credits: 3 }, { start: '', end: '', asOf: '' }).source, 'total');
  assert.equal(classesLeft({ ...cn(), credits: 3 }, term).source, 'credits');
  assert.equal(classesLeft({ ...cn(), total: 60, plan: 'pace' }, term).source, 'pace');
  // Shares always add up to the classes left, however they split.
  const odd = classesLeft({ id: 'x', name: 'X', total: 47, parts: [part('a', 'Theory', 10, 13), part('b', 'Tutorial', 3, 4), part('c', 'Practical', 2, 3)] }, term);
  assert.equal(odd.total, 27);
  assert.equal([...odd.byPart.values()].reduce((s, n) => s + n, 0), 27);
});

test('a semester counted the way students count it', () => {
  // 60 classes this semester, 31 of 38 attended, 80% minimum: 48 needed, so 12
  // can be missed in all. 7 are gone; of the 22 left, attend 17 and skip 5.
  const course = { id: 'x', name: 'Torts', total: 60, parts: [part('t', 'Theory', 24, 29), part('u', 'Tutorial', 7, 9)] };
  const e = evaluate(course, { min: 80, mode: 'combined' }, { start: '', end: '', asOf: '' });
  assert.equal(e.left, 22);
  assert.equal(e.end.total, 60);
  assert.equal(e.end.needed, 48);
  assert.equal(e.end.maxSkip, 5);
  assert.equal(e.left - e.end.maxSkip, 17);
  // At 72%, 43.2 classes are needed: 44, never 43, since 43 of 60 is 71.67%.
  assert.equal(evaluate(course, { min: 72, mode: 'combined' }, term).end.needed, 44);
});

test('evaluate: combined counts against one minimum', () => {
  const e = evaluate(cn(), { min: 80, mode: 'combined' }, term);
  assert.equal(e.pct.toFixed(2), '93.18'); // matches the report
  assert.equal(e.status, 'safe');
  assert.equal(e.miss, 7);
  // 41 of 44 now, 16 to come (the pace lands on 60): finishing at 80% needs 48 of 60, so 9 can be skipped.
  assert.deepEqual(e.end, { total: 60, needed: 48, maxSkip: 9, reachable: true, best: 95 });
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
  assert.equal(e.left, 19); // 56 held at this pace lands on 75, five credits: 12 theory and 7 practical to come
  assert.equal(e.end.maxSkip, 7); // 6 theory and 1 practical can be skipped
  assert.equal(e.end.reachable, true);
  // At 85% for labs, 22 of 27 practicals is the best case: short of the line, whatever the theory does.
  const strict = evaluate(course, { min: 75, mode: 'separate', labMin: 85 }, term);
  assert.equal(strict.end.reachable, false);
  assert.equal(strict.endKind, 'Practical');
  assert.equal(strict.end.best.toFixed(2), '81.48');
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
  assert.equal(shortName('Code of Civil Procedure, 1908 (CPC)'), 'CPC');
  assert.equal(shortName('Companies Act 2013 and Compliance'), 'CAC');
});

test('dates', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(daysBetween(parseDate('2026-07-13'), parseDate('2026-10-04')), 83);
});
