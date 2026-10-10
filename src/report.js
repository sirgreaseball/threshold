// Reading a report file or pasted text, shared by the landing page and the planner.

import { parseReport } from './parse.js';

export class ReportError extends Error {}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export async function readReportFile(file) {
  if (file.size > 15 * 1024 * 1024) throw new ReportError('That file is over 15 MB. An attendance report is usually under 1 MB.');
  let text;
  if (isPdf(file)) {
    const { pdfText } = await import('./pdftext.js');
    try {
      text = await pdfText(await file.arrayBuffer());
    } catch {
      throw new ReportError('That PDF could not be opened. If it is password-protected, open it and save a copy without the password.');
    }
    if (!text.trim()) throw new ReportError('That PDF has no text in it, it is probably a scan. Copy the table from your portal and paste it instead.');
  } else {
    text = await file.text();
  }
  return readReportText(text);
}

export function readReportText(text) {
  const report = parseReport(text);
  if (!report.courses.length) {
    throw new ReportError('No courses found. Each course needs a name and two numbers: classes attended and classes held.');
  }
  return report;
}
