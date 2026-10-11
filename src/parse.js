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
  PRACTICAL: 'Practical', PRAC: 'Practical', PRACT: 'Practical', PRCT: 'Practical', PR: 'Practical', LAB: 'Practical', LABS: 'Practical',
  TUTORIAL: 'Tutorial', TUT: 'Tutorial', TUTL: 'Tutorial', TUTO: 'Tutorial',
  STUDIO: 'Studio', STDO: 'Studio', STUD: 'Studio',
};
const KIND_WORDS = Object.keys(KIND).join('|');

/**
 * The kind of class a report's type label names: "THEO", "TUTL", "Embedded
 * Lab", "Seminar", "Moot court". The first word it knows decides; anything
 * else ("Core", "Program Elective") counts as theory.
 */
export function kindOf(raw) {
  for (const w of String(raw || '').toUpperCase().split(/[^A-Z]+/)) {
    if (KIND[w]) return KIND[w];
    if (w === 'P') return 'Practical';
    if (/^(PRAC|LABORAT|PROJ|WORKSHOP|FIELD|CLINIC|MOOT|INTERN)/.test(w)) return 'Practical';
    if (/^(TUTOR|SEMINAR)/.test(w)) return 'Tutorial';
  }
  return 'Theory';
}
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
    rows.push({ name, kind: kindOf(m[1]), attended: Math.min(x, y), conducted: Math.max(x, y) });
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

// A date the way reports print one: 06.07.2026, 6/7/26, 2026-07-06, 6 Jul 2026, 06-Jul-2026, July 6, 2026.
const MONTH = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const DATE = `(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?[\\s./-]*(?:${MONTH})[a-z]*\\.?[\\s,./-]*\\d{4}|(?:${MONTH})[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})`;

/** A date as reports print it, as 'YYYY-MM-DD', or null. */
export function toIso(s) {
  let d;
  let m;
  let y;
  let g;
  if ((g = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, m, d] = g.map(Number);
  else if ((g = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/))) {
    [, d, m, y] = g.map(Number);
    if (m > 12 && d <= 12) [d, m] = [m, d]; // month first
  } else {
    const month = s.toLowerCase().match(new RegExp(MONTH));
    const nums = s.match(/\d+/g) || [];
    if (!month || nums.length < 2) return null;
    m = MONTH.split('|').indexOf(month[0]) + 1;
    d = Number(nums[0]);
    y = Number(nums.at(-1));
  }
  if (y < 100) y += 2000;
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDates(flat) {
  const range = (lead) => flat.match(new RegExp(`${lead}(${DATE})\\s*(?:to|till|until|-|–)\\s*:?\\s*(${DATE})`, 'i'));
  const m = range('from\\s*:?\\s*') || range('');
  if (!m) return { start: null, asOf: null };
  return { start: toIso(m[1].trim()), asOf: toIso(m[2].trim()) };
}

const SMALL = new Set(['and', 'of', 'in', 'for', 'the', 'to', 'with', 'on', 'a', 'an', 'at', 'by', 'or']);
const ACRONYM = new Set(['AI', 'ML', 'OS', 'IT', 'IOT', 'UI', 'UX', 'AR', 'VR', 'XR', 'DBMS', 'OOP', 'OOPS', 'HCI', 'NLP', 'DSA', 'CAD', 'CAM', 'VLSI', 'DSP', 'EVS', 'GIS', 'API', 'SQL', 'HR', 'CSR', 'IPR', 'IPC', 'CPC', 'ADR', 'GST', 'ESG', 'FDI', 'WTO', 'UN', 'EU', 'UK', 'USA', 'IFRS', 'GAAP', 'ERP', 'CRM', 'SCM', 'MIS', 'IB', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);

// Each run of letters gets a capital: "SOCIO-LEGAL" -> "Socio-Legal", "B.COM" -> "B.Com", "WOMEN'S" -> "Women's".
const capitalise = (w) => w.toLowerCase().replace(/\p{L}[\p{L}'’]*/gu, (run) => run[0].toUpperCase() + run.slice(1));

/** "COMPUTER NETWORKS" -> "Computer Networks", keeping acronyms ("AI", "(IPC)") and small words. */
export function titleCase(s) {
  const shouting = s === s.toUpperCase();
  return s
    .split(' ')
    .filter(Boolean)
    .map((w, i) => {
      const bare = w.replace(/[^\p{L}\p{N}]/gu, '');
      if (ACRONYM.has(bare.toUpperCase())) return w.toUpperCase();
      if (!shouting) return w;
      // Short and bracketed, or with no vowel at all, it is an abbreviation: "(BNS)", "CRPC".
      if (/^\(\p{Lu}{2,6}\)\W*$/u.test(w) || /^[B-DF-HJ-NP-TV-XZ]{2,5}$/.test(bare)) return w;
      if (i > 0 && SMALL.has(bare.toLowerCase())) return w.toLowerCase();
      return capitalise(w);
    })
    .join(' ');
}
