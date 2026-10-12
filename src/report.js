// Reading a report file or pasted text, shared by the landing page and the dashboard.
//
// A PDF is read as a table first, from where its text sits on the page
// (table.js). Text without a table header falls back to the text reader
// (parse.js), which also finds the minimum and the dates in both cases.
//
// Several files at once are added up, for colleges that send one report a
// month. A report whose dates fall inside another's is left out, so a
// monthly report dropped next to the detailed one never counts twice.

import { parseReport } from './parse.js';
import { readTable, piecesFromText } from './table.js';
import { isoDate, parseDate, daysBetween } from './plan.js';

export class ReportError extends Error {}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

// A page left open across a release asks for files the new release no longer has.
const STALE = 'Threshold was updated while this page was open. Reload the page, then drop the file again.';

export async function readReportFile(file) {
  if (file.size > 15 * 1024 * 1024) throw new ReportError('That file is over 15 MB. An attendance report is usually under 1 MB.');
  if (!isPdf(file)) return readReportText(await file.text());
  let pdfText;
  try {
    ({ pdfText } = await import('./pdftext.js'));
  } catch {
    throw new ReportError(STALE);
  }
  let pdf;
  try {
    pdf = await pdfText(await file.arrayBuffer());
  } catch (err) {
    if (err?.name === 'PasswordException') throw new ReportError('That PDF is password-protected. Open it, save a copy without the password, and drop that in.');
    if (err?.name === 'InvalidPDFException') throw new ReportError('That file is damaged or is not really a PDF. Download the report again from your portal.');
    // The reader itself failed to start: almost always a page from before a release.
    throw new ReportError(STALE);
  }
  if (!pdf.text.trim()) throw new ReportError('That PDF has no text in it, it is probably a scan. Copy the table from your portal and paste it instead.');
  const text = parseReport(pdf.text);
  const table = readTable(pdf.pieces);
  return found(table?.courses.length ? { ...text, ...table } : text);
}

export function readReportText(raw) {
  const text = parseReport(raw);
  const table = readTable(piecesFromText(raw));
  // A paste can mix a table with loose lines; keep whichever reading found more rows.
  return found(table && table.rows >= text.rows ? { ...text, ...table } : text);
}

/** Several files, read and added up. One unreadable file among others is skipped and named. */
export async function readReportFiles(files) {
  const reports = [];
  const failed = [];
  let error = null;
  for (const file of files) {
    try {
      reports.push({ ...(await readReportFile(file)), file: file.name });
    } catch (err) {
      failed.push(file.name);
      error ||= err;
    }
  }
  if (!reports.length) throw error;
  return { ...combineReports(reports), failed };
}

function found(report) {
  if (!report.courses.length) {
    throw new ReportError('No courses found. Each course needs a name and two numbers: classes attended and classes held.');
  }
  // A monthly report runs to the end of the month; its counts run only to today.
  const today = isoDate(new Date());
  if (report.asOf && report.asOf > today) report.asOf = today;
  return report;
}

const keyOf = (s) => s.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const span = (r) => (r.start && r.asOf ? daysBetween(parseDate(r.start), parseDate(r.asOf)) : -1);
const overlaps = (a, b) => a.start && a.asOf && b.start && b.asOf && a.start <= b.asOf && b.start <= a.asOf;

/**
 * Reports added up course by course and part by part. The widest report goes
 * first; any report whose dates overlap one already taken is left out and
 * listed in `skipped`, since its classes are counted already.
 */
export function combineReports(reports) {
  if (reports.length === 1) return { ...reports[0], files: 1, skipped: [] };
  const taken = [];
  const skipped = [];
  for (const r of [...reports].sort((a, b) => span(b) - span(a))) {
    if (taken.some((t) => overlaps(t, r))) skipped.push(r.file);
    else taken.push(r);
  }
  taken.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const courses = [];
  const byKey = new Map();
  for (const r of taken) {
    for (const c of r.courses) {
      let course = byKey.get(keyOf(c.name));
      if (!course) {
        course = { name: c.name, parts: [], credits: c.credits ?? null, check: null };
        byKey.set(keyOf(c.name), course);
        courses.push(course);
      }
      for (const p of c.parts) {
        const q = course.parts.find((x) => x.kind === p.kind);
        if (q) {
          q.attended += p.attended;
          q.conducted += p.conducted;
        } else course.parts.push({ ...p });
      }
      // Each month's percentage checks that month: the sum passes when every one of them did.
      if (c.check) course.check = { ok: (course.check?.ok ?? true) && c.check.ok, printed: null };
    }
  }
  const dated = taken.filter((r) => r.start && r.asOf);
  const sum = (k) => taken.reduce((s, r) => s + (r[k] || 0), 0);
  return {
    courses,
    rule: taken.find((r) => r.rule)?.rule ?? null,
    start: dated.length ? dated.map((r) => r.start).sort()[0] : null,
    asOf: dated.length ? dated.map((r) => r.asOf).sort().at(-1) : null,
    rows: sum('rows'),
    pending: sum('pending'),
    excused: sum('excused'),
    files: taken.length,
    skipped,
  };
}
