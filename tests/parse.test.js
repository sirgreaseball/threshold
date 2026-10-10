import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, courseName, titleCase } from '../src/parse.js';

// Shaped like the text pdf.js pulls out of a SAP-style college report (made-up
// school, student and numbers). Note the page break that splits a row.
const REPORT = `SCHOOL OF EXAMPLE STUDIES - SOMEWHERE
Student Name: TEST STUDENT
Student Number: 00000000000
Academic Year & Academic Session 2026-2027 , Semester 1
Attendance Report Date: From 13.07.2026 To 04.10.2026
S.No.   Course Name   Division Name   Lecture
Type
Total No. Of
Classes
Conducted
Total No. Of
Classes
Attended
Percentage (%)
1   DATA STRUCTURES   DATA
STRUCTURES T4
SEM-III
DIV-B
THEO   30   27   91.67
2   DATA STRUCTURES   DATA
STRUCTURESP4
SEM-III
BATCH-B2
PRAC   24   23
3   ENGINEERING
MATHEMATICS III
ENGG MATHS
III T4 SEM III
THEO   40   29   72.50
4   FINANCIAL
INSTITUTIONS,
MARKETS, INSTRUM
FIN
INSTITUTION,
MRKTS, INSTR
T4 CE-DS V
THEO   30   26   86.67
5   AI RECEPTIVE
SOFTWARE
DEVELOPMENT
AI RECEPTIVE
SOFTWARE
DEVELOPMEN
TT4 - DS
THEO   13   11
S.No.   Course Name   Division Name   Lecture
Type
Total No. Of
Classes
Conducted
Total No. Of
Classes
Attended
Percentage (%)
SEM-V A
6   AI RECEPTIVE SOFTWARE DEVELOPMENT   AI RECEPTIVE
SOFTWARE DEVELOPMEN TP4
PRAC   10   10   91.30
7   DESIGN STUDIO   DESIGN
STUDIO S4
STUDIO   20   18   90.00
8   PROBABILITY AND STATISTICS   PROB
STATS T4
TUT   12   10   83.33
1. The overall attendance % for each course is reflected once, whereas lectures conducted/attended for Theory /
Practical/Tutorial/Studio are shown in a separate row, as applicable.
3. You will be detained if you do not comply with the attendance requirement of 75% attendance in each course.
Student SAP ID | Student Name |Student Roll No.|Name of the Program |Academic Term`;

const summary = (r) => r.courses.map((c) => [c.name, c.parts.map((p) => `${p.kind} ${p.attended}/${p.conducted}`).join(', ')]);

test('reads a SAP-style report: courses, parts, rule and dates', () => {
  const r = parseReport(REPORT);
  assert.equal(r.rule, 75);
  assert.equal(r.start, '2026-07-13');
  assert.equal(r.asOf, '2026-10-04');
  assert.deepEqual(summary(r), [
    ['Data Structures', 'Theory 27/30, Practical 23/24'],
    ['Engineering Mathematics III', 'Theory 29/40'],
    ['Financial Institutions, Markets, Instrum', 'Theory 26/30'],
    ['AI Receptive Software Development', 'Theory 11/13, Practical 10/10'],
    ['Design Studio', 'Studio 18/20'],
    ['Probability and Statistics', 'Tutorial 10/12'],
  ]);
});

test('reads a plain or spreadsheet paste, whatever the column order', () => {
  const r = parseReport('Subject\tAttended\tConducted\nPhysics\t30\t40\nChemistry Lab\t18\t20\n1. Biology 25 20\nMaths, 28, 35\nOverall 101 115\n');
  assert.deepEqual(summary(r), [
    ['Physics', 'Theory 30/40'],
    ['Chemistry', 'Practical 18/20'],
    ['Biology', 'Theory 20/25'],
    ['Maths', 'Theory 28/35'],
  ]);
  assert.equal(r.rule, null);
});

test('finds the minimum however it is phrased', () => {
  assert.equal(parseReport('Minimum attendance: 85% in every subject').rule, 85);
  assert.equal(parseReport('students need 70% attendance to sit the exam').rule, 70);
  assert.equal(parseReport('nothing about it here, 93.5% overall').rule, null);
});

test('course names are cut where the division name repeats them', () => {
  const w = (s) => s.split(' ');
  assert.equal(courseName(w('COMPUTER NETWORKS COMPUTER NETWORKST4 CSDS SEM-V DIV-A')), 'Computer Networks');
  assert.equal(courseName(w('MOBILE APPLICATION DEVELOPMENT MOBILE APPLICATION DEVELOPMEN T T4 DS V A')), 'Mobile Application Development');
  assert.equal(courseName(w('DATA STRUCTURES AND DATA ANALYSIS DATA STRUCTURES AND DATA ANALYSIS T4')), 'Data Structures and Data Analysis');
  assert.equal(courseName(w('GAME DESIGN GAME DESIGNT4 CE-CSDS SEM V OE-1')), 'Game Design');
  assert.equal(courseName(w('OPERATIONS RESEARCH T4 SEM V')), 'Operations Research');
});

test('title case keeps acronyms and small words', () => {
  assert.equal(titleCase('INTRODUCTION TO AI AND ML'), 'Introduction to AI and ML');
  assert.equal(titleCase('Already Fine'), 'Already Fine');
});

test('empty or junk input finds nothing', () => {
  assert.equal(parseReport('').courses.length, 0);
  assert.equal(parseReport('hello world\nno numbers here').courses.length, 0);
});
