// Reads an attendance report as a table, from where each piece of text sits on
// the page rather than the order it comes out in. That is what lets one reader
// handle every school's report: law with tutorial rows, pharmacy with
// practicals, commerce with theory only, or another college's table entirely,
// as long as it has a header row that names its columns.
//
// Input: text pieces with a page, a position and a size. pdf.js gives these for
// a PDF; a pasted table becomes one piece per cell.
//
// 1. Find the header: a line that names a course column and a held or attended
//    column. Header words stacked over two or three lines ("Total No. Of /
//    Classes / Conducted") join the column they sit over. A label that spans
//    several columns ("Theory" over "Held" and "Attended") names their kind.
// 2. Every piece below it belongs to the column under its centre.
// 3. A record starts at each serial number, or at each line with counts in it
//    when there is no serial column. Lines between records are cells of the
//    record above that wrapped ("LAW OF TORTS AND" + "CONSUMER PROTECTION").
// 4. Records with the same course name, or with the name left blank, become
//    the parts of one course.
//
// A register, with one row per class marked P (present), A (absent) and so on
// instead of counts, is read the same way: each row is one class held.

import { kindOf, titleCase, toIso } from './parse.js';

/** @typedef {{ page: number, x: number, y: number, w: number, h: number, str: string }} Piece */

// Checked in order; the first match names the column.
const ROLES = [
  ['serial', /^(s\.?\s*no\.?|sr\.?(\s*no\.?)?|sl\.?\s*no\.?|serial(\s*no\.?)?|#|no\.?)$/i],
  ['percent', /%|percent/i],
  ['absent', /absent|missed/i],
  ['attended', /attend|present|\batt[dn]?\b/i],
  ['division', /division|section|batch|group|\bdiv\b|\bsec\b/i],
  ['code', /code|\bid\b/i],
  ['credits', /credit/i],
  ['date', /^(class |lecture )?date$/i],
  ['other', /faculty|teacher|instructor|professor|semester|\bdate\b|remark|status|eligib|slot|room/i],
  ['type', /type|component|category|nature|\bmode\b|\bkind\b/i],
  ['held', /conduct|held|deliver|total|taken|occur|sessions|lectures|classes|periods|hours|\b(cond|del|tot)\b/i],
  ['name', /course|subject|paper|module|title|name|particular|description/i],
];
const roleOf = (text) => ROLES.find(([, re]) => re.test(text.trim()))?.[0] ?? null;
const COUNTS = ['held', 'attended', 'absent'];

// A kind of class named in a column header ("Theory Held", "Lab" over two columns).
const KIND_WORD = /\b(theory|theo|lectures?|lect|practicals?|prac|labs?|laboratory|tutorials?|tut|tutl|studio|seminars?)\b/i;
const kindIn = (text) => {
  const m = text.match(KIND_WORD);
  if (m) return kindOf(m[1]);
  return /\b(total|overall|aggregate|combined)\b/i.test(text) ? 'Total' : null;
};

const isCount = (s) => /^\d{1,4}$/.test(s.trim());

/**
 * @param {Piece[]} pieces
 * @returns {{ courses: object[], rows: number } | null} null when no table header is found.
 */
export function readTable(pieces) {
  const lines = linesOf(dedupe(pieces));
  const records = [];
  let table = null;
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = headerAt(lines, i);
    if (header) {
      table = header;
      i = header.last;
      continue;
    }
    if (!table) continue;
    const cells = cellsOf(line, table.cols);
    if (!cells) {
      // Prose (a footnote across the page) ends the record above.
      current = null;
      continue;
    }
    const hasSerial = table.cols.some((c) => c.key === 'serial');
    const counts = Object.entries(cells).some(([key, ps]) => COUNTS.includes(key.split(':')[0]) && ps.some((p) => /\d/.test(p.str)));
    const starts = hasSerial ? cells.serial?.some((p) => /^\d{1,3}\.?$/.test(p.str.trim())) : counts;
    if (starts) {
      current = { cells: {}, kinds: table.kinds, page: line.page, lastY: line.y, h: line.h };
      records.push(current);
      add(current, cells);
    } else if (current && (line.page !== current.page || line.y - current.lastY <= 2.2 * current.h)) {
      // A wrapped cell, possibly carried over to the next page.
      add(current, cells);
      current.page = line.page;
      current.lastY = line.y;
    }
  }
  if (!table) return null;
  return group(records.map(finish).filter(Boolean));
}

/** The same table, pasted: one line per row, cells split by tabs or by two or more spaces. */
export function piecesFromText(text) {
  const pieces = [];
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const tabbed = lines.some((l) => l.includes('\t'));
  lines.forEach((line, row) => {
    const cells = tabbed ? line.split('\t') : line.trim().split(/\s{2,}/);
    if (cells.length < 2) return;
    cells.forEach((str, col) => {
      if (str.trim()) pieces.push({ page: 1, x: col * 100, y: row * 12, w: 60, h: 10, str: str.trim() });
    });
  });
  return pieces;
}

/* ---------- Lines, header and columns ---------- */

// Some PDFs draw the same text twice in the same place.
function dedupe(pieces) {
  const seen = new Set();
  return pieces.filter((p) => {
    if (!p.str || !p.str.trim()) return false;
    const key = `${p.page}|${Math.round(p.x)}|${Math.round(p.y)}|${p.str}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linesOf(pieces) {
  const sorted = [...pieces].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines = [];
  for (const p of sorted) {
    const last = lines.at(-1);
    if (last && last.page === p.page && Math.abs(p.y - last.y) <= 0.4 * Math.max(p.h, last.h, 1)) last.pieces.push(p);
    else lines.push({ page: p.page, y: p.y, h: p.h || 10, pieces: [p] });
  }
  for (const l of lines) l.pieces.sort((a, b) => a.x - b.x);
  return lines;
}

/** A header starting at line i: its columns, the kinds its counts are split by, and its last line. Or null. */
function headerAt(lines, i) {
  const first = lines[i];
  if (!first.pieces.some((p) => ['name', 'held', 'attended'].includes(roleOf(p.str)) || KIND_WORD.test(p.str))) return null;
  if (first.pieces.some((p) => isCount(p.str))) return null;
  // Header text stacked on the next few lines joins the band.
  let last = i;
  while (
    last + 1 < lines.length &&
    last - i < 4 &&
    lines[last + 1].page === first.page &&
    lines[last + 1].y - lines[last].y <= 1.6 * lines[last].h &&
    !lines[last + 1].pieces.some((p) => isCount(p.str))
  ) {
    last++;
  }
  const { cols, kinds } = columnsOf(lines.slice(i, last + 1));
  const has = (r) => cols.some((c) => c.role === r);
  if (!has('name') || !(has('held') || has('attended'))) return null;
  return { cols, kinds, last };
}

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);

function columnsOf(band) {
  const all = band.flatMap((line, li) => line.pieces.map((p) => ({ str: p.str, li, x0: p.x, x1: p.x + p.w })));
  // A label over two or more side-by-side columns is a group ("Theory" over "Held" and "Attended").
  const isGroup = (g) => {
    const under = all.filter((p) => p.li > g.li && overlap(g, p) > 0);
    return under.some((a) => under.some((b) => a !== b && overlap(a, b) <= 0));
  };
  const groups = all.filter(isGroup);
  let cols = [];
  for (const p of all.filter((q) => !groups.includes(q))) {
    let best = null;
    let most = 0;
    for (const c of cols) {
      const o = overlap(p, c);
      if (o > most) {
        most = o;
        best = c;
      }
    }
    if (best) {
      best.text += ` ${p.str}`;
      best.x0 = Math.min(best.x0, p.x0);
      best.x1 = Math.max(best.x1, p.x1);
    } else cols.push({ text: p.str, x0: p.x0, x1: p.x1 });
  }
  cols.sort((a, b) => a.x0 - b.x0);
  for (const c of cols) c.role = roleOf(c.text);
  // The serial number is the first column or none.
  cols.forEach((c, k) => {
    if (c.role === 'serial' && k > 0) c.role = null;
  });
  // A header split into words on one line ("Subject" "Name") is one column.
  const merged = [];
  for (const c of cols) {
    const prev = merged.at(-1);
    if (prev && (c.role === prev.role || c.role === null) && c.x0 - prev.x1 < 0.6 * (band[0].h || 10)) {
      prev.text += ` ${c.text}`;
      prev.x1 = Math.max(prev.x1, c.x1);
      prev.role = prev.role ?? roleOf(prev.text);
    } else merged.push({ ...c });
  }
  cols = merged;
  // The kind a count column is for: from its group label, or its own words.
  for (const c of cols) {
    const g = groups.filter((q) => overlap(q, c) > 0).sort((a, b) => overlap(b, c) - overlap(a, c))[0];
    c.kind = (g && kindIn(g.str)) || kindIn(c.text);
  }
  // Counts split into two or more kinds of class ("Theory Held", "Practical Held") give each record several parts.
  const kinds = [...new Set(cols.filter((c) => COUNTS.includes(c.role) && c.kind && c.kind !== 'Total').map((c) => c.kind))];
  const split = kinds.length > 1;
  // Only the first column for each role (and kind) counts; later ones ("Total" after "Held") are ignored.
  const taken = new Set();
  for (const c of cols) {
    let key = c.role;
    if (split && COUNTS.includes(c.role)) key = kinds.includes(c.kind) ? `${c.role}:${c.kind}` : 'other';
    if (key && key !== 'other' && taken.has(key)) key = 'other';
    if (key) taken.add(key);
    c.key = key;
  }
  // Each column owns the page from halfway to its left neighbour to halfway to its right one.
  cols.forEach((c) => {
    c.cx = (c.x0 + c.x1) / 2;
  });
  cols.forEach((c, k) => {
    c.from = k === 0 ? -Infinity : (cols[k - 1].cx + c.cx) / 2;
    c.to = k === cols.length - 1 ? Infinity : (c.cx + cols[k + 1].cx) / 2;
  });
  return { cols, kinds: split ? kinds : [null] };
}

/**
 * Pieces of a line by column key, or null when the line is prose running across the table.
 * A piece belongs to the header it sits under; one under no header goes by its centre.
 */
function cellsOf(line, cols) {
  const span = cols.length > 1 ? cols.at(-1).cx - cols[0].cx : Infinity;
  const cells = {};
  for (const p of line.pieces) {
    const cx = p.x + p.w / 2;
    let col = null;
    let most = 0;
    for (const c of cols) {
      const o = Math.min(p.x + p.w, c.x1) - Math.max(p.x, c.x0);
      if (o > most) {
        most = o;
        col = c;
      }
    }
    col ||= cols.find((c) => cx >= c.from && cx < c.to);
    if (!col) continue;
    // A piece wider than most of the table is a sentence, not a cell.
    if (p.w > 0.6 * span && cols.length > 2) return null;
    (cells[col.key || 'other'] ||= []).push(p);
  }
  return cells;
}

function add(rec, cells) {
  for (const [key, pieces] of Object.entries(cells)) (rec.cells[key] ||= []).push(...pieces);
}

/* ---------- Records and courses ---------- */

const text = (pieces = []) =>
  [...pieces]
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
    .map((p) => p.str.trim())
    .join(' ')
    .replace(/-\s+(?=\p{Ll})/gu, '-') // a word broken at the line end
    .replace(/\s+/g, ' ')
    .trim();

const int = (s) => {
  const m = String(s).match(/\d{1,4}/);
  return m ? Number(m[0]) : null;
};

// A count is a whole number: "85.19" or "85%" under "Attendance" is the percentage, not a count.
const count = (s) => (/%|\d[.,]\d/.test(s) ? null : int(s));

/** Held and attended for one kind of class in a record, or null. */
function countsOf(c, suffix) {
  const cell = (role) => text(c[role + suffix]);
  let held = count(cell('held'));
  let attended = count(cell('attended'));
  // "23/27" in an attendance column: attended over held.
  const frac = cell('attended').match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (frac) {
    attended = Number(frac[1]);
    held = Number(frac[2]);
  }
  const absent = count(cell('absent'));
  if (attended == null && held != null && absent != null) attended = held - absent;
  if (held == null && attended != null && absent != null) held = attended + absent;
  if (held == null || attended == null || attended < 0 || held > 5000) return null;
  return attended > held ? { held: attended, attended: held } : { held, attended };
}

// The marks of a register. Classes not marked yet, exempted or held before a late
// admission count for neither side; they are reported, not counted.
const MARK = { P: 'present', PR: 'present', PRESENT: 'present', A: 'absent', AB: 'absent', ABSENT: 'absent', NU: 'pending', E: 'excused', L: 'excused' };

function finish(rec) {
  const c = rec.cells;
  // A totals row is not a course.
  if (['name', 'code', 'serial', 'type'].some((r) => /^(grand\s*)?(total|overall|aggregate)\b/i.test(text(c[r])))) return null;
  const base = { name: text(c.name).replace(/[\s,;:-]+$/, ''), code: text(c.code), type: text(c.type), percent: null, decimals: 0, credits: null };
  // One class in a register.
  const mark = rec.kinds[0] == null && MARK[text(c.attended).toUpperCase()];
  if (mark) {
    const held = mark === 'present' || mark === 'absent';
    return { ...base, parts: held ? [{ kind: null, held: 1, attended: mark === 'present' ? 1 : 0 }] : [], mark, date: toIso(text(c.date)) };
  }
  const split = rec.kinds[0] != null;
  const parts = [];
  for (const kind of rec.kinds) {
    const n = countsOf(c, kind ? `:${kind}` : '');
    // In a table split by kind, a course with no lab shows blanks or zeros there.
    if (n && !(split && n.held === 0)) parts.push({ kind, ...n });
  }
  if (!parts.length) return null;
  const pct = text(c.percent).match(/\d{1,3}(?:\.\d+)?/);
  const credits = Number(text(c.credits).match(/\d+(?:\.\d+)?/)?.[0]);
  return {
    name: text(c.name).replace(/[\s,;:-]+$/, ''),
    code: text(c.code),
    type: text(c.type),
    parts,
    percent: pct ? Number(pct[0]) : null,
    decimals: pct ? (pct[0].split('.')[1] || '').length : 0,
    credits: credits > 0 && credits <= 30 ? credits : null,
  };
}

const keyOf = (s) => s.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// "Physics Lab", "Chemistry (Practical)": a course name that ends in the kind of class.
const KIND_TAIL = /[\s([–-]+(theory|lectures?|lab|labs|laboratory|practicals?|tutorials?)[)\].]*$/i;

// A register names the class by its division: "Computer NetworksT4 CSDS Sem-V Div-A",
// "Operating Systems P4 CSDS Batch-A1". The letter before the digit is the kind.
const DIVISION = /^(.+?)\s*([TPUS])\d(?![a-z\d])/;
const DIVISION_KIND = { T: 'Theory', P: 'Practical', U: 'Tutorial', S: 'Studio' };
const tailOf = (name) => {
  const m = name.match(KIND_TAIL);
  return m && m.index > 0 ? { bare: name.slice(0, m.index), word: m[1] } : null;
};

const pctOf = (a, t) => (t > 0 ? (a * 100) / t : 0);
const near = (p, printed, decimals) => Math.abs(p - printed) < 10 ** -decimals;

function group(records) {
  const courses = [];
  const byKey = new Map();
  // Every name, and the names that differ only in their kind of class ("Physics Theory", "Physics Lab").
  const names = new Set(records.map((r) => keyOf(r.name)));
  const variants = new Map();
  for (const r of records) {
    const t = tailOf(r.name);
    if (!t) continue;
    const k = keyOf(t.bare);
    if (!variants.has(k)) variants.set(k, new Set());
    variants.get(k).add(keyOf(r.name));
  }
  let prev = null;
  for (const r of records) {
    // A blank name continues the course above (a merged cell), then the code, then a number.
    let name = r.name || (prev ? prev.name : r.code) || `Course ${courses.length + 1}`;
    let type = r.type;
    const division = !type && r.mark && name.match(DIVISION);
    if (division) {
      name = division[1];
      type = DIVISION_KIND[division[2]];
    }
    const t = tailOf(name);
    if (t) {
      type ||= t.word;
      // Next to plain "Physics", or to "Physics Theory", "Physics Lab" is the lab part of Physics.
      // On its own, "Legal Theory" keeps its name.
      const k = keyOf(t.bare);
      if (names.has(k) || variants.get(k).size > 1) name = t.bare;
    }
    const key = keyOf(name);
    let course = byKey.get(key);
    if (!course) {
      course = { name: titleCase(name), parts: [], credits: null, rows: [], pending: 0, excused: 0 };
      byKey.set(key, course);
      courses.push(course);
    }
    for (const p of r.parts) {
      const kind = p.kind ?? kindOf(type);
      const part = course.parts.find((q) => q.kind === kind);
      if (part) {
        part.attended += p.attended;
        part.conducted += p.held;
      } else course.parts.push({ kind, attended: p.attended, conducted: p.held });
    }
    if (r.mark === 'pending') course.pending++;
    if (r.mark === 'excused') course.excused++;
    course.rows.push(r);
    if (r.credits && !course.credits) course.credits = r.credits;
    prev = { name };
  }
  const order = ['Theory', 'Practical', 'Tutorial', 'Studio'];
  for (const course of courses) {
    course.parts.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
    course.check = checkOf(course);
    delete course.rows;
  }
  const sum = (k) => courses.reduce((s, c) => s + c[k], 0);
  const out = { courses, rows: records.length, pending: sum('pending'), excused: sum('excused') };
  // A register knows when classes really began and when the last one was marked.
  const dates = records.filter((r) => r.date && (r.mark === 'present' || r.mark === 'absent')).map((r) => r.date).sort();
  if (dates.length) Object.assign(out, { start: dates[0], asOf: dates.at(-1) });
  return out;
}

/**
 * Whether a course adds up to the percentage the report prints. Reports print
 * it once per course (attended over held across all its rows) or once per
 * row; either way every printed figure must match. Null when none is printed.
 */
function checkOf(course) {
  const printed = course.rows.filter((r) => r.percent != null);
  if (!printed.length) return null;
  const a = course.parts.reduce((s, p) => s + p.attended, 0);
  const t = course.parts.reduce((s, p) => s + p.conducted, 0);
  const whole = printed.every((r) => near(pctOf(a, t), r.percent, r.decimals));
  const perRow = printed.every((r) => {
    const ra = r.parts.reduce((s, p) => s + p.attended, 0);
    const rt = r.parts.reduce((s, p) => s + p.held, 0);
    return near(pctOf(ra, rt), r.percent, r.decimals);
  });
  const first = printed[0];
  return { ok: whole || perRow, printed: `${first.percent.toFixed(first.decimals)}%` };
}
