// Reading a report file or pasted text, shared by the landing page and the dashboard.
//
// A PDF is read as a table first, from where its text sits on the page
// (table.js). Text without a table header falls back to the text reader
// (parse.js), which also finds the minimum and the dates in both cases.

import { parseReport } from './parse.js';
import { readTable, piecesFromText } from './table.js';

export class ReportError extends Error {}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export async function readReportFile(file) {
  if (file.size > 15 * 1024 * 1024) throw new ReportError('That file is over 15 MB. An attendance report is usually under 1 MB.');
  if (!isPdf(file)) return readReportText(await file.text());
  const { pdfText } = await import('./pdftext.js');
  let pdf;
  try {
    pdf = await pdfText(await file.arrayBuffer());
  } catch {
    throw new ReportError('That PDF could not be opened. If it is password-protected, open it and save a copy without the password.');
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

function found(report) {
  if (!report.courses.length) {
    throw new ReportError('No courses found. Each course needs a name and two numbers: classes attended and classes held.');
  }
  return report;
}
