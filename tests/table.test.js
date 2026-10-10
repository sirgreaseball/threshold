import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTable, piecesFromText } from '../src/table.js';
import { readReportText } from '../src/report.js';
import { kindOf, titleCase, parseReport } from '../src/parse.js';

// Positioned text the way pdf.js reports it: x from the left, y down the page,
// about 5 pt a character at a 9 pt font. Made-up school, student and numbers.
const line = (page, y, ...cells) => cells.map(([x, str, w = str.length * 5]) => ({ page, x, y, w, h: 9, str }));
const header = (page, y) => [
  ...line(page, y, [22, 'S.No.'], [95, 'Course Name'], [204, 'Division Name'], [284, 'Lecture'], [336, 'Total No. Of'], [411, 'Total No. Of'], [475, 'Percentage (%)']),
  ...line(page, y + 12, [290, 'Type'], [349, 'Classes'], [424, 'Classes']),
  ...line(page, y + 24, [340, 'Conducted'], [419, 'Attended']),
];

// Shaped like an NMIMS SAP report: a stacked three-line header, tutorial rows
// typed TUTL, names that wrap, a row split by the page break, footnotes.
const SAP = [
  ...line(1, 40, [150, 'SCHOOL OF EXAMPLE STUDIES']),
  ...line(1, 70, [22, 'Student Name : TEST STUDENT'], [300, 'Student Number : 00000000000']),
  ...line(1, 90, [22, 'Attendance Report Date: From 06.07.2026 To 26.09.2026']),
  ...header(1, 237),
  ...line(1, 280, [42, '1'], [64, 'PUBLIC FINANCE'], [201, 'PF T4 SEM I'], [286, 'THEO'], [364, '30'], [440, '26'], [501, '87.50']),
  ...line(1, 300, [42, '2'], [64, 'PUBLIC FINANCE'], [201, 'PF T4 SEM I'], [286, 'TUTL'], [366, '10'], [442, '9']),
  ...line(1, 320, [42, '3'], [64, 'LAW OF TORTS AND CONSUMER'], [201, 'TORTS T4'], [286, 'THEO'], [364, '36'], [440, '30'], [501, '81.25']),
  ...line(1, 332, [64, 'PROTECTION ACTS'], [201, 'SEM I A']),
  ...line(1, 352, [42, '4'], [64, 'LAW OF TORTS AND CONSUMER'], [201, 'TORTS T4'], [286, 'TUTL'], [364, '12'], [440, '9']),
  ...line(1, 364, [64, 'PROTECTION ACTS'], [201, 'SEM I A']),
  ...line(1, 384, [42, '5'], [64, 'CODE OF CIVIL PROCEDURE'], [201, 'CPC T4'], [286, 'THEO'], [364, '44'], [440, '37'], [501, '84.09']),
  ...header(2, 40),
  ...line(2, 84, [64, 'AND LIMITATION (CPC)']),
  ...line(2, 104, [42, '6'], [64, 'DESIGN STUDIO'], [201, 'DS S4'], [286, 'STDO'], [364, '20'], [440, '18'], [501, '90.00']),
  ...line(2, 200, [22, '1.'], [34, 'The overall attendance % for each course is reflected once, whereas classes held and attended are shown per row.', 480]),
  ...line(2, 212, [22, '3.'], [34, 'You will be detained if you do not meet the requirement of 80% attendance in each course.', 450]),
];

const summary = (r) => r.courses.map((c) => [c.name, c.parts.map((p) => `${p.kind} ${p.attended}/${p.conducted}`).join(', ')]);

test('reads a report as a table: subjects, not class types, with every row in its course', () => {
  const r = readTable(SAP);
  assert.deepEqual(summary(r), [
    ['Public Finance', 'Theory 26/30, Tutorial 9/10'],
    ['Law of Torts and Consumer Protection Acts', 'Theory 30/36, Tutorial 9/12'],
    ['Code of Civil Procedure and Limitation (CPC)', 'Theory 37/44'],
    ['Design Studio', 'Studio 18/20'],
  ]);
  assert.equal(r.rows, 6);
  // The printed percentage is attended over held across all of a course's rows: 35 of 40 is 87.50%.
  assert.deepEqual(r.courses[0].check, { ok: true, printed: '87.50%' });
  assert.ok(r.courses.every((c) => c.check.ok));
});

test('a course that does not add up to its printed percentage is flagged', () => {
  const rows = SAP.map((p) => (p.page === 1 && p.y === 280 && p.str === '26' ? { ...p, str: '24' } : p));
  const r = readTable(rows);
  assert.deepEqual(r.courses[0].check, { ok: false, printed: '87.50%' });
  assert.ok(r.courses.slice(1).every((c) => c.check.ok));
});

test('counts split into columns by kind, on one header line or under a group label', () => {
  const flat = readTable([
    ...line(1, 50, [20, 'Subject'], [200, 'Theory Held'], [270, 'Theory Att'], [340, 'Lab Held'], [410, 'Lab Att'], [480, 'Total %']),
    ...line(1, 70, [20, 'Pharmaceutics'], [210, '40'], [280, '35'], [350, '20'], [420, '18'], [490, '88.33']),
    ...line(1, 90, [20, 'Pharmacology'], [210, '30'], [280, '24'], [350, '0'], [420, '0'], [490, '80.00']),
  ]);
  assert.deepEqual(summary(flat), [
    ['Pharmaceutics', 'Theory 35/40, Practical 18/20'],
    ['Pharmacology', 'Theory 24/30'],
  ]);
  assert.ok(flat.courses.every((c) => c.check.ok));

  const stacked = readTable([
    ...line(1, 50, [20, 'Sr. No.'], [60, 'Course'], [230, 'Theory', 80], [330, 'Tutorial', 80], [430, 'Total', 80]),
    ...line(1, 62, [230, 'Held'], [275, 'Attended'], [330, 'Held'], [375, 'Attended'], [430, 'Held'], [475, 'Attended']),
    ...line(1, 80, [20, '1'], [60, 'LEGAL THEORY'], [235, '30'], [285, '27'], [335, '10'], [385, '9'], [435, '40'], [485, '36']),
    ...line(1, 100, [20, '2'], [60, 'COMPANY LAW'], [235, '28'], [285, '22'], [335, '8'], [385, '6'], [435, '36'], [485, '28']),
  ]);
  assert.deepEqual(summary(stacked), [
    ['Legal Theory', 'Theory 27/30, Tutorial 9/10'],
    ['Company Law', 'Theory 22/28, Tutorial 6/8'],
  ]);
});

test('reads other layouts: codes, an absent column, lab rows named after their course', () => {
  const r = readTable([
    ...line(1, 50, [20, 'Code'], [80, 'Subject'], [240, 'Faculty'], [320, 'Type'], [400, 'Total'], [450, 'Present'], [500, 'Absent'], [550, 'Attendance %']),
    ...line(1, 70, [20, 'CS301'], [80, 'Computer Networks'], [240, 'Dr. A'], [320, 'Embedded Theory'], [405, '40'], [455, '34'], [505, '6'], [560, '85.00']),
    ...line(1, 90, [20, 'CS301L'], [80, 'Computer Networks Lab'], [240, 'Dr. A'], [320, 'Embedded Lab'], [405, '20'], [455, '19'], [505, '1'], [560, '95.00']),
    ...line(1, 110, [20, 'MA201'], [80, 'Probability'], [240, 'Dr. B'], [320, 'Lecture'], [405, '30'], [505, '4']),
    ...line(1, 130, [20, 'TOTAL'], [400, '90'], [450, '79'], [500, '11']),
  ]);
  assert.deepEqual(summary(r), [
    ['Computer Networks', 'Theory 34/40, Practical 19/20'],
    ['Probability', 'Theory 26/30'],
  ]);
});

test('reads attendance written as a fraction, and a merged course cell', () => {
  const r = readTable([
    ...line(1, 50, [20, 'Sr'], [60, 'Subject'], [220, 'Component'], [320, 'Attendance']),
    ...line(1, 70, [20, '1'], [60, 'Organic Chemistry'], [220, 'Theory'], [325, '23/27']),
    ...line(1, 90, [20, '2'], [220, 'Practical'], [325, '14 / 16']),
  ]);
  assert.deepEqual(summary(r), [['Organic Chemistry', 'Theory 23/27, Practical 14/16']]);
});

test('a pasted table with tabs, and the text reader for anything without a header', () => {
  const r = readReportText('Subject\tHeld\tAttended\nPhysics\t40\t30\nPhysics Lab\t20\t18\n');
  assert.deepEqual(summary(r), [['Physics', 'Theory 30/40, Practical 18/20']]);
  assert.equal(readTable(piecesFromText('Physics 30 40\nMaths 20 25')), null);
  assert.equal(readReportText('Physics 30 40\nMaths 20 25').courses.length, 2);
});

test('class types from any report', () => {
  assert.equal(kindOf('THEO'), 'Theory');
  assert.equal(kindOf('TUTL'), 'Tutorial');
  assert.equal(kindOf('PRAC'), 'Practical');
  assert.equal(kindOf('Embedded Lab'), 'Practical');
  assert.equal(kindOf('Seminar'), 'Tutorial');
  assert.equal(kindOf('STDO'), 'Studio');
  assert.equal(kindOf('Moot Court'), 'Practical');
  assert.equal(kindOf('Program Elective'), 'Theory');
  assert.equal(kindOf(''), 'Theory');
});

test('names keep their abbreviations and hyphens', () => {
  assert.equal(titleCase('CODE OF CIVIL PROCEDURE, 1908 (CPC)'), 'Code of Civil Procedure, 1908 (CPC)');
  assert.equal(titleCase('INDIAN PENAL CODE (IPC)'), 'Indian Penal Code (IPC)');
  assert.equal(titleCase('SOCIO-LEGAL STUDIES'), 'Socio-Legal Studies');
  assert.equal(titleCase("WOMEN'S RIGHTS AND CRPC"), "Women's Rights and CRPC");
  assert.equal(titleCase('LAW OF CONTRACTS II'), 'Law of Contracts II');
});

test('report dates in any common format', () => {
  assert.deepEqual([parseReport('From 06.07.2026 To 26.09.2026').start, parseReport('From 06.07.2026 To 26.09.2026').asOf], ['2026-07-06', '2026-09-26']);
  assert.equal(parseReport('Period: 7 Jul 2026 to 27 Sep 2026').asOf, '2026-09-27');
  assert.equal(parseReport('from July 7, 2026 till September 27, 2026').start, '2026-07-07');
  assert.equal(parseReport('From 2026-07-07 To 2026-09-27').asOf, '2026-09-27');
});
