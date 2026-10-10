// Pulls the text out of a PDF in the browser. Loaded only when someone imports
// a PDF, so pdf.js never weighs down the first visit. The legacy build carries
// the polyfills older phones need.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function pdfText(buffer, maxPages = 20) {
  // isEvalSupported: false keeps pdf.js from compiling anything found inside the file.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  let out = '';
  try {
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) out += item.str + (item.hasEOL ? '\n' : ' ');
      out += '\n';
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
