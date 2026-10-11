import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineReports, readReportText } from '../src/report.js';

// Made-up monthly reports for one student.
const month = (file, start, asOf, rows) => ({
  file,
  start,
  asOf,
  rule: 80,
  rows: rows.length,
  courses: rows.map(([name, kind, attended, conducted]) => ({ name, parts: [{ kind, attended, conducted }], check: { ok: true, printed: '' } })),
});
const july = month('july.pdf', '2026-07-01', '2026-07-31', [['Physics', 'Theory', 5, 6], ['Physics', 'Practical', 4, 4]]);
const aug = month('aug.pdf', '2026-08-01', '2026-08-31', [['Physics', 'Theory', 7, 9], ['Chemistry', 'Theory', 3, 3]]);
const summary = (r) => r.courses.map((c) => [c.name, c.parts.map((p) => `${p.kind} ${p.attended}/${p.conducted}`).join(', ')]);

test('monthly reports add up, course by course and part by part', () => {
  const r = combineReports([aug, july]);
  assert.deepEqual(summary(r), [
    ['Physics', 'Theory 12/15, Practical 4/4'],
    ['Chemistry', 'Theory 3/3'],
  ]);
  assert.equal(r.start, '2026-07-01');
  assert.equal(r.asOf, '2026-08-31');
  assert.equal(r.files, 2);
  assert.deepEqual(r.skipped, []);
});

test('a report inside another one is left out, so nothing counts twice', () => {
  const whole = month('detail.pdf', '2026-07-01', '2026-08-31', [['Physics', 'Theory', 12, 15], ['Physics', 'Practical', 4, 4], ['Chemistry', 'Theory', 3, 3]]);
  const r = combineReports([july, whole, aug, july]);
  assert.deepEqual(summary(r), summary(combineReports([july, aug])));
  assert.deepEqual(r.skipped.sort(), ['aug.pdf', 'july.pdf', 'july.pdf']);
  assert.equal(r.files, 1);
});

test('a report that runs past today counts only to today', () => {
  const r = readReportText('From 01.10.2026 To 31.12.2099\nSubject\tHeld\tAttended\nPhysics\t10\t9\n');
  assert.equal(r.start, '2026-10-01');
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(r.asOf, today);
});
