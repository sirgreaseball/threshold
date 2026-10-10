// Reads an attendance report (text pulled out of a PDF, or pasted) into courses.
//
// Two passes:
// 1. Typed rows, the format of SAP-style college reports such as NMIMS:
//    "<S.No> <course> <division> THEO <held> <attended> [<percent>]". The record
//    is anchored on the type word and the two counts after it; everything
//    between the previous record and this one is the course text.
// 2. Plain lines, for anything else: "<name> ... <number> <number>" per line,
//    including tab- or comma-separated spreadsheet pastes.
// Held is always the larger of the two counts, so column order never matters.

const KIND = {
  THEORY: 'Theory', THEO: 'Theory', TH: 'Theory', LECTURE: 'Theory', LECT: 'Theory', LEC: 'Theory',
  PRACTICAL: 'Practical', PRAC: 'Practical', PR: 'Practical', LAB: 'Practical',
  TUTORIAL: 'Tutorial', TUT: 'Tutorial',
  STUDIO: 'Studio',
};
const KIND_WORDS = Object.keys(KIND).join('|');
const TYPED_ROW = new RegExp(`\\b(${KIND_WORDS})\\b[\\s:|,-]*(\\d{1,3})[\\s|,;]+(\\d{1,3})(?![\\d.])`, 'gi');

const HEADER_BITS = [
  /S\.?\s?No\.?/gi,
  /Sr\.?\s?No\.?/gi,
  /Course\s+Name/gi,
  /Subject\s+Name/gi,
  /Division\s+Name/gi,
  /Lecture\s+Type/gi,
  /Total\s+No\.?\s+Of\s+Classes\s+(?:Conducted|Attended)/gi,
  /Percentage\s*\(%\)/gi,
];

/**
 * @returns {{ courses: {name: string, parts: {kind: string, attended: number, conducted: number}[]}[],
 *             rule: number|null, start: string|null, asOf: string|null, rows: number }}
 */
export function parseReport(raw) {
  const text = String(raw || '').replace(/\r/g, '').replace(/[\t  ]+/g, ' ');
  const flat = text.replace(/\s+/g, ' ');
  // Both passes run; a plain list that happens to say "Lab" once must not be read as a typed report.
  const typed = typedRows(flat);
  const plain = plainRows(String(raw || '').replace(/\r/g, ''));
  const rows = plain.length > typed.length ? plain : typed;
  const { start, asOf } = findDates(flat);
  return { courses: group(rows), rule: findRule(flat), start, asOf, rows: rows.length };
}

function typedRows(flat) {
  const rows = [];
  let prevEnd = 0;
  let serial = 0;
  for (const m of flat.matchAll(TYPED_ROW)) {
    const blob = flat.slice(prevEnd, m.index);
    prevEnd = m.index + m[0].length;
    const { words, found } = afterSerial(stripHeaders(blob), serial + 1);
    if (found) serial = found;
    const name = courseName(words);
    if (!name) continue;
    const x = Number(m[2]);
    const y = Number(m[3]);
    rows.push({ name, kind: KIND[m[1].toUpperCase()], attended: Math.min(x, y), conducted: Math.max(x, y) });
  }
  return rows;
}

function stripHeaders(s) {
  for (const re of HEADER_BITS) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Reports number their rows. Find the expected serial (the last occurrence that
 * is followed by a word), which skips the page header, the student details and
 * any text a previous row spilled onto the next page.
 */
function afterSerial(blob, expected) {
  const words = blob.split(' ').filter(Boolean);
  for (const want of [expected, null]) {
    for (let i = words.length - 2; i >= 0; i--) {
      const isSerial = want == null ? /^\d{1,3}\.?$/.test(words[i]) : words[i].replace(/\.$/, '') === String(want);
      if (isSerial && /\p{L}/u.test(words[i + 1])) return { words: words.slice(i + 1), found: Number(words[i].replace(/\.$/, '')) };
    }
    if (expected > 1) break; // only the first row may start from an unexpected number
  }
  // No serial: drop leading numbers (a percentage left over from the previous row).
  let i = 0;
  while (i < words.length && !/\p{L}/u.test(words[i])) i++;
  return { words: words.slice(i).slice(-12), found: 0 };
}

/**
 * Report rows run the course name straight into a division name that repeats
 * it, often abbreviated: "COMPUTER NETWORKS COMPUTER NETWORKST4 CSDS SEM-V".
 * Cut where the longest run of the opening words repeats.
 */
export function courseName(words) {
  if (!words.length) return '';
  const norm = words.map((w) => w.toUpperCase().replace(/[^\p{L}\p{N}]/gu, ''));
  let best = null;
  for (let i = 1; i < words.length; i++) {
    if (!similar(norm[i], norm[0])) continue;
    let k = 0;
    while (i + k < words.length && k < i && similar(norm[i + k], norm[k])) k++;
    if (!best || k > best.k) best = { i, k };
  }
  let name = best ? words.slice(0, best.i) : words;
  if (!best) {
    // No repeat: stop at the first code-like word (T4, SEM, DIV-A, BATCH-A1).
    const cut = name.findIndex((w, i) => i > 0 && (/\d/.test(w) || /^(DIV|SEM|BATCH|SEC|SECTION)\b/i.test(w)));
    if (cut > 0) name = name.slice(0, cut);
  }
  return titleCase(name.join(' ').replace(/[\s,;:-]+$/, ''));
}

function similar(u, v) {
  if (!u || !v) return false;
  if (u === v) return true;
  if (u.length >= 3 && v.startsWith(u)) return true; // FIN ~ FINANCIAL
  if (v.length >= 3 && u.startsWith(v)) return true; // NETWORKST4 ~ NETWORKS
  if (u.length >= 3 && u[0] === v[0] && isSubsequence(u, v)) return true; // MRKTS ~ MARKETS
  return false;
}

function isSubsequence(small, big) {
  let j = 0;
  for (let i = 0; i < big.length && j < small.length; i++) if (big[i] === small[j]) j++;
  return j === small.length;
}

/** Line-by-line fallback: a name followed by two whole numbers. */
function plainRows(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const tokens = line.trim().split(/[\s,;|]+/).filter(Boolean);
    if (tokens.length < 3) continue;
    let start = 0;
    if (/^\d{1,3}\.?$/.test(tokens[0]) && tokens[1] && /\p{L}/u.test(tokens[1])) start = 1; // serial number
    const firstNum = tokens.findIndex((t, i) => i >= start && /^\d{1,3}$/.test(t));
    if (firstNum <= start) continue;
    const nums = tokens.slice(firstNum).filter((t) => /^\d{1,3}$/.test(t)).map(Number);
    if (nums.length < 2) continue;
    const nameTokens = tokens.slice(start, firstNum).filter((t) => !KIND[t.toUpperCase()]);
    const kindToken = tokens.find((t) => KIND[t.toUpperCase()]);
    const name = titleCase(nameTokens.join(' '));
    if (!name || /^(total|overall|grand total)$/i.test(name)) continue;
    rows.push({ name, kind: kindToken ? KIND[kindToken.toUpperCase()] : 'Theory', attended: Math.min(nums[0], nums[1]), conducted: Math.max(nums[0], nums[1]) });
  }
  return rows;
}

function group(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.name.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!map.has(key)) map.set(key, { name: r.name, parts: [] });
    const course = map.get(key);
    const part = course.parts.find((p) => p.kind === r.kind);
    if (part) {
      part.attended += r.attended;
      part.conducted += r.conducted;
    } else course.parts.push({ kind: r.kind, attended: r.attended, conducted: r.conducted });
  }
  return [...map.values()];
}

function findRule(flat) {
  const patterns = [
    /requirement\s+of\s+(\d{2,3})\s*%/i,
    /minimum\s+(?:of\s+)?(\d{2,3})\s*%\s*attendance/i,
    /(\d{2,3})\s*%\s*(?:minimum\s+)?attendance/i,
    /attendance\s*[:-]?\s*(?:of|requirement|criteria|criterion|is|must be)?\s*(?:at\s+least|minimum|min\.?)?\s*(\d{2,3})\s*%/i,
  ];
  for (const re of patterns) {
    const m = flat.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 40 && n <= 100) return n;
    }
  }
  return null;
}

function findDates(flat) {
  const d = '(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})';
  const m = flat.match(new RegExp(`from\\s*:?\\s*${d}\\s*(?:to|-|till|until)\\s*:?\\s*${d}`, 'i'));
  if (!m) return { start: null, asOf: null };
  const iso = (dd, mm, yy) => {
    const date = new Date(Number(yy), Number(mm) - 1, Number(dd));
    if (date.getMonth() !== Number(mm) - 1) return null;
    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  };
  return { start: iso(m[1], m[2], m[3]), asOf: iso(m[4], m[5], m[6]) };
}

const SMALL = new Set(['and', 'of', 'in', 'for', 'the', 'to', 'with', 'on', 'a', 'an', 'at', 'by', 'or']);
const ACRONYM = new Set(['AI', 'ML', 'OS', 'IT', 'IOT', 'UI', 'UX', 'AR', 'VR', 'XR', 'DBMS', 'OOP', 'OOPS', 'HCI', 'NLP', 'DSA', 'CAD', 'CAM', 'VLSI', 'DSP', 'EVS', 'GIS', 'API', 'SQL', 'HR', 'CSR', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);

/** "COMPUTER NETWORKS" -> "Computer Networks", keeping acronyms ("AI") and small words. */
export function titleCase(s) {
  const shouting = s === s.toUpperCase();
  return s
    .split(' ')
    .filter(Boolean)
    .map((w, i) => {
      const bare = w.replace(/[^\p{L}\p{N}]/gu, '');
      if (ACRONYM.has(bare.toUpperCase())) return w.toUpperCase();
      if (!shouting) return w;
      if (i > 0 && SMALL.has(bare.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}
