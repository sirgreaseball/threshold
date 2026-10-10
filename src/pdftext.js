// Pulls the text out of a PDF in the browser, with where each piece sits on its
// page, so a table can be read by its columns. Loaded only when someone imports
// a PDF, so pdf.js never weighs down the first visit. The legacy build carries
// the polyfills older phones need.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** @returns {Promise<{ text: string, pieces: import('./table.js').Piece[] }>} y runs down the page. */
export async function pdfText(buffer, maxPages = 20) {
  // isEvalSupported: false keeps pdf.js from compiling anything found inside the file.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  let text = '';
  const pieces = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const { height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str + (item.hasEOL ? '\n' : ' ');
        const [, , , d, x, y] = item.transform;
        if (item.str.trim()) pieces.push({ page: i, x, y: height - y, w: item.width, h: item.height || Math.abs(d), str: item.str });
      }
      text += '\n';
    }
  } finally {
    await doc.destroy();
  }
  return { text, pieces };
}
