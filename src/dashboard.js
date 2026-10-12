import './styles/base.css';
import './styles/dashboard.css';

import gsap from 'gsap';
import { Skyline } from './skyline.js';
import { evaluate, classesLeft, shortName, KINDS, TERM_WEEKS, parseDate, isoDate, daysBetween, startOfDay, weeklyFromCredits, sumParts, slack } from './plan.js';
import { percent } from './core.js';
import { blank, sample, uid, cleanState, cleanCourse, takePending, forgetSaved } from './store.js';
import { savedRule, saveRule } from './settings.js';
import { wheel, range } from './wheel.js';
import { readReportFiles, readReportText, ReportError } from './report.js';
import { fillIcons } from './icons.js';
import { bindThemeToggle } from './theme.js';
import { magnetize } from './magnet.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
gsap.ticker.lagSmoothing(0); // a background tab should finish its tweens, not replay them in slow motion
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

fillIcons(document);
bindThemeToggle($('#theme-btn'));
magnetize();

// Courses are held in memory only, and a reload starts empty. The college's rule
// is a setting, remembered in a cookie (settings.js) and shared with the landing page.
forgetSaved();
let state = cleanState({ ...blank(), rule: savedRule() });
let views = new Map();
const rows = new Map(); // course id -> { el, parts: Map(part id -> el), shownPct }

const els = {
  lede: $('#lede'),
  ledeSub: $('#lede-sub'),
  skyLabels: $('#sky-labels'),
  skyTip: $('#sky-tip'),
  list: $('#rows'),
  rowTpl: $('#row-tpl'),
  partTpl: $('#part-tpl'),
  empty: $('#empty'),
  head: $('#courses-head'),
  foot: $('#courses-foot'),
  ruleVal: $('#rule-val'),
  termStart: $('#term-start'),
  termEnd: $('#term-end'),
  termAsOf: $('#term-asof'),
  termSuggest: $('#term-suggest'),
  termNote: $('#term-note'),
  toast: $('#toast'),
  file: $('#file-input'),
  importDlg: $('#import-dialog'),
  ruleDlg: $('#rule-dialog'),
};

/* ---------- Words and numbers ---------- */
// Two decimals, rounded the way reports print them, except that nothing is ever
// rounded up onto a whole number: 79.996% reads 79.99%, never 80.00%.
const fmt = (p) => {
  if (p == null) return '';
  let r = Math.round(p * 100) / 100;
  if (r % 1 === 0 && r > p) r = Math.floor(p * 100) / 100;
  return `${r.toFixed(2)}%`;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (iso) => {
  const d = parseDate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
};
const find = (id) => state.courses.find((c) => c.id === id);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where a course stands today, in plain words. Only shown when it matters. */
function nowText(v) {
  const kind = v.mode === 'separate' && v.worstKind ? `${v.worstKind} ` : '';
  if (v.status === 'empty') return { text: 'No classes yet', tone: 'muted' };
  if (v.status === 'below') return { text: `${kind}below ${v.min}% right now`, tone: 'danger' };
  if (v.status === 'edge') return { text: `${kind}no classes to spare right now`, tone: 'edge' };
  return { text: '', tone: '' };
}

/**
 * The three numbers people asked for: classes still to come, how many of
 * them must be attended, and how many can be skipped, to finish at or above
 * the minimum. Must attend + can skip = classes left. In separate mode they
 * are sums over the course's parts.
 *
 * Without an estimate of the classes to come, they say what the minimum
 * allows today: how many can be missed now, or how many it takes to get back.
 */
function stats(v) {
  const none = { text: '\u2014', tone: 'muted' };
  if (v.plan.total == null) {
    // The course's total classes is the one thing that always makes the numbers exact.
    const left = { text: { 'no-credits': 'Add credits', 'no-weekly': 'Add per week' }[v.plan.reason] || 'Add the total', tone: 'muted' };
    if (v.status === 'empty') return { left, attend: none, skip: none, note: '' };
    if (v.status === 'below') {
      return { left, attend: { text: Number.isFinite(v.need) ? `Next ${v.need}` : 'All', tone: 'danger' }, skip: { text: '0', tone: 'danger' }, note: '' };
    }
    return { left, attend: none, skip: { text: `${v.miss} now`, tone: v.miss ? 'good' : 'edge' }, note: '' };
  }
  const left = v.left;
  const e = v.end;
  // "of 60" when the college's total is known, "of ~48" when it is an estimate.
  const of = `of ${v.plan.source === 'total' || v.plan.source === 'credits' ? '' : '~'}${e.total}`;
  if (!left) return { left: { text: '0', tone: 'muted', of }, attend: { text: '0', tone: 'muted' }, skip: { text: '0', tone: 'muted' }, note: '' };
  if (!e.reachable) {
    const best = v.mode === 'separate' && v.endKind ? `${v.endKind} best case` : 'Best case';
    return { left: { text: String(left), tone: '', of }, attend: { text: `All ${left}`, tone: 'danger' }, skip: { text: '0', tone: 'danger' }, note: `${best} ${fmt(e.best)}` };
  }
  const skip = e.maxSkip;
  return {
    left: { text: String(left), tone: '', of },
    attend: { text: skip === 0 ? `All ${left}` : String(left - skip), tone: skip === 0 ? 'edge' : '' },
    skip: { text: String(skip), tone: skip === 0 ? 'edge' : 'good' },
    note: '',
  };
}

/** One line for tooltips and screen readers: "22 left: attend 12, skip up to 10". */
function statsLine(v) {
  const s = stats(v);
  if (v.plan.total == null) {
    if (v.status === 'empty') return 'No classes yet';
    if (v.status === 'below') return Number.isFinite(v.need) ? `Attend the next ${v.need} in a row to get back to ${v.min}%` : `Cannot get back to ${v.min}%`;
    return v.miss ? `Can miss ${v.miss} now and stay at ${v.min}%` : 'No classes to spare right now';
  }
  if (s.left.text === '0') return 'No classes left';
  const left = `${s.left.text} left ${s.left.of}`;
  if (s.note) return `${left}: attend all of them. ${s.note}`;
  if (s.skip.text === '0') return `${left}: attend all of them`;
  return `${left}: attend ${s.attend.text}, skip up to ${s.skip.text}`;
}

/**
 * Semester dates as used for the maths. A missing end date is assumed 18 weeks
 * after the start, the UGC's 90 teaching days, ending on the Friday before.
 */
const TERM_DAYS = 18 * 7 - 3;
function assumedEnd(start) {
  const s = parseDate(start);
  if (!s) return '';
  const d = new Date(s);
  d.setDate(d.getDate() + TERM_DAYS);
  return isoDate(d);
}
const guessEnd = () => (state.term.end ? '' : assumedEnd(state.term.start));
const termNow = () => ({ ...state.term, end: state.term.end || guessEnd() });

const REASON = {
  'no-end': 'Add the total classes this semester, or the day classes end, above.',
  'no-start': 'Add the total classes this semester, or the day classes began, above.',
  'too-early': 'After two weeks of classes Threshold can use your pace. Until then, add the total classes or the credits.',
  'no-credits': 'Enter the course credits: each is 15 classes over the semester, or 30 in a lab.',
  'no-total': 'Enter how many classes this course has this semester, all types together.',
  'no-weekly': 'Enter how many classes a week each type has.',
};

/**
 * The semester as a whole: its classes, how many the minimum needs, how many
 * can be missed in all and how many already were, then what that leaves.
 */
function forecastLine(j, exact, kind = '') {
  const { left, end: e, min } = j;
  const lead = kind ? `${kind}: ` : '';
  if (left === 0) return `${lead}No classes left. You finish at ${fmt(j.pct)}.`;
  const missed = j.conducted - j.attended;
  const semester = `${cap(`${exact ? '' : 'about '}${plural(e.total, 'class', 'classes')}`)} this semester.`;
  if (!e.reachable) {
    return `${lead}${semester} At ${min}% you need ${e.needed}, but you have missed ${missed}: even attending all ${left} left, you finish at ${fmt(e.best)}.`;
  }
  const spare = e.total - e.needed;
  const rest =
    e.maxSkip === 0 ? `Attend all ${left} left.` : e.maxSkip >= left ? `You can skip all ${left} left.` : `Of the ${left} left, attend ${left - e.maxSkip} and you can skip ${e.maxSkip}.`;
  return `${lead}${semester} At ${min}% you need ${e.needed}, so you can miss ${spare} in all. You have missed ${missed}. ${rest}`;
}

function forecastText(course, v) {
  if (v.plan.total == null) return REASON[v.plan.reason] || '';
  const exact = v.plan.source === 'total' || v.plan.source === 'credits';
  if (v.mode === 'separate') return v.parts.map((p) => forecastLine({ ...p.judge, left: p.judge.left ?? 0 }, exact, p.kind)).join(' ');
  return forecastLine(v, exact);
}

/** The weekly rates behind an estimate, in words: "2 theory and 2 practical a week". */
function ratesText(course, rates) {
  const bits = course.parts
    .map((p) => {
      const r = rates.get(p.id) || 0;
      const n = Math.round(r * 10) / 10;
      return n ? `${n % 1 ? n.toFixed(1) : n} ${p.kind.toLowerCase()}` : null;
    })
    .filter(Boolean);
  if (!bits.length) return 'no classes';
  return bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}`;
}

function planNote(course, v) {
  const src = v.plan.source;
  if (src === 'pace') {
    const start = parseDate(state.term.start);
    const asOf = parseDate(state.term.asOf) || startOfDay();
    const weeks = daysBetween(start, asOf) / 7;
    const rates = new Map(course.parts.map((p) => [p.id, p.conducted / weeks]));
    return `An estimate: your classes have run at about ${ratesText(course, rates)} a week, carried on to the end date. Add the total classes for exact numbers.`;
  }
  if (src === 'credits') {
    const w = weeklyFromCredits(course.credits, course.parts);
    return `${plural(course.credits, 'credit')} plan ${ratesText(course, w)} classes a week over a ${TERM_WEEKS}-week semester.`;
  }
  return '';
}

/* ---------- Summary ---------- */
const sky = new Skyline($('#sky-canvas'), {
  onHover: (id, rect) => showTip(id, rect),
  onPick: (id) => openRow(id, true),
  // Labels swell with their tanks.
  onDraw: (s) => {
    for (const b of els.skyLabels.children) {
      const label = b.firstElementChild;
      const k = 1 + (s.scaleOf(label.dataset.id) - 1) * 0.5;
      const v = k.toFixed(3);
      if (label.dataset.k !== v) {
        label.dataset.k = v;
        label.style.transform = k === 1 ? '' : `scale(${v})`;
      }
    }
  },
});

function showTip(id, rect) {
  const tip = els.skyTip;
  if (!id) {
    tip.classList.remove('is-on');
    return;
  }
  const c = find(id);
  const v = views.get(id);
  if (!c || !v) return;
  tip.innerHTML = `<b></b><span class="num"></span><span></span>`;
  tip.children[0].textContent = c.name;
  const now = nowText(v).text;
  tip.children[1].textContent = v.status === 'empty' ? 'No classes yet' : `${fmt(v.pct)}${now ? `, ${now}` : ''}`;
  tip.children[2].textContent = statsLine(v);
  const host = $('#sky').getBoundingClientRect();
  const x = Math.max(8, Math.min(host.width - 8, rect.left - host.left + rect.width / 2));
  tip.style.setProperty('--x', `${x}px`);
  tip.style.setProperty('--y', `${Math.max(0, rect.top - host.top - 12)}px`);
  tip.classList.add('is-on');
}

function paintSummary(intro) {
  const list = state.courses.map((c) => ({ c, v: views.get(c.id) }));
  const counted = list.filter(({ v }) => v.status !== 'empty');
  const mins = new Set(list.map(({ v }) => v.min));
  const sameMin = mins.size <= 1;
  const minText = sameMin ? `${list[0]?.v.min ?? state.rule.min}%` : 'their minimum';
  let lede;
  let sub = '';
  if (!list.length) {
    lede = 'Add your courses to see your margin.';
    sub = 'Import the attendance report from your college portal, or add courses by hand.';
  } else if (!counted.length) {
    lede = 'Log your first classes to see your margin.';
  } else {
    const below = counted.filter(({ v }) => v.status === 'below');
    if (below.length) {
      const which = (x) => (x.v.mode === 'separate' ? `${x.c.name} (${x.v.worstKind.toLowerCase()})` : x.c.name);
      lede = below.length === 1 && counted.length > 1 ? `${which(below[0])} is below ${minText}.` : `${below.length} of ${plural(counted.length, 'course')} ${below.length === 1 ? 'is' : 'are'} below ${minText}.`;
    } else {
      lede = counted.length === 1 ? `${counted[0].c.name} is at or above ${minText}.` : `All ${counted.length} courses are at or above ${minText}.`;
    }
    // The course with the least room by the last class (or right now, without a plan).
    const room = ({ v }) => (v.end ? (v.end.reachable ? v.end.maxSkip : -1e6 + v.end.best) : slack(v));
    const tight = counted.reduce((w, x) => (room(x) < room(w) ? x : w));
    const tv = tight.v;
    const tl = tv.left;
    if (tv.end && !tv.end.reachable) sub = `${tight.c.name} can no longer reach ${tv.min}% this semester. Best case ${fmt(tv.end.best)}.`;
    else if (tv.end && tl) {
      sub =
        tv.end.maxSkip === 0
          ? `${tight.c.name} has no room: attend all ${plural(tl, 'remaining class', 'remaining classes')}.`
          : `Least room: ${tight.c.name}. Of its ${tl} remaining classes you can skip ${tv.end.maxSkip}.`;
    } else if (tv.status === 'below') {
      sub = Number.isFinite(tv.need)
        ? `${tight.c.name} needs the next ${plural(tv.need, 'class', 'classes')} in a row to get back to ${tv.min}%.`
        : `${tight.c.name} can no longer reach ${tv.min}%.`;
    }
    else sub = `Least room right now: ${tight.c.name}.`;
    const tot = state.courses.reduce(
      (acc, c) => {
        const s = sumParts(c.parts);
        return { a: acc.a + s.attended, t: acc.t + s.conducted };
      },
      { a: 0, t: 0 },
    );
    sub += ` Overall ${fmt(percent(tot.a, tot.t))}.`;
  }
  if (els.lede.textContent !== lede) {
    els.lede.textContent = lede;
    if (!intro && !reduce) gsap.fromTo(els.lede, { y: 10, autoAlpha: 0.2 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'expo.out' });
  }
  els.ledeSub.textContent = sub;

  sky.update(
    list.map(({ c, v }) => ({ id: c.id, pct: v.status === 'empty' ? null : v.pct, min: v.min, below: v.status === 'below' })),
    { line: sameMin && list.length ? list[0].v.min : null, intro },
  );
  // Labels under the tanks.
  const labels = els.skyLabels;
  labels.style.setProperty('--n', Math.max(1, list.length));
  labels.replaceChildren(
    ...list.map(({ c, v }) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sky__label';
      b.dataset.id = c.id;
      b.dataset.state = v.status;
      b.setAttribute('aria-label', `${c.name}: ${v.status === 'empty' ? 'no classes yet' : fmt(v.pct)}. ${statsLine(v)}.`);
      b.innerHTML = '<span class="sky__short"></span><span class="sky__pct num"></span>';
      b.children[0].textContent = shortName(c.name);
      b.children[1].textContent = v.status === 'empty' ? '' : `${Math.floor(v.pct)}%`;
      li.append(b);
      return li;
    }),
  );
  $('#sky').hidden = !list.length;
}

els.skyLabels.addEventListener('click', (e) => {
  const b = e.target.closest('.sky__label');
  if (b) openRow(b.dataset.id, true);
});

/* ---------- Semester dates ---------- */
function paintTerm() {
  const { start, asOf } = state.term;
  const guess = guessEnd();
  const end = state.term.end || guess;
  for (const [input, val] of [
    [els.termStart, start],
    [els.termEnd, end],
    [els.termAsOf, asOf],
  ]) {
    if (document.activeElement !== input) input.value = val;
  }
  // An assumed end date looks provisional until the person sets the real one.
  els.termEnd.classList.toggle('is-guess', !!guess);
  els.termSuggest.hidden = !guess;
  els.termSuggest.textContent = 'Assumed';
  const e = parseDate(end);
  const now = parseDate(asOf) || startOfDay();
  let note;
  const planned = state.courses.length && state.courses.every((c) => ['total', 'credits'].includes(views.get(c.id)?.plan.source));
  if (planned) note = 'Every course has its total classes, so these dates only matter for an estimate from your pace.';
  else if (!e) note = 'Add the day classes began or end, or each course\'s total classes, to see the classes left.';
  else if (e < now) note = 'That end date has passed.';
  else {
    const days = daysBetween(now, e);
    const span = days >= 14 ? plural(Math.round(days / 7), 'week') : plural(days, 'day');
    note = guess
      ? `Assuming classes end 18 weeks after they began: ${span} left. Set the real date for exact numbers.`
      : `${span} of classes left${asOf ? ` from ${niceDate(asOf)}` : ''}.`;
  }
  els.termNote.textContent = note;
}

for (const [input, key] of [
  [els.termStart, 'start'],
  [els.termEnd, 'end'],
  [els.termAsOf, 'asOf'],
]) {
  input.addEventListener('change', () => {
    commit(() => (state.term[key] = parseDate(input.value) ? input.value : ''));
    paintAll();
  });
}
els.termSuggest.addEventListener('click', () => {
  els.termEnd.focus();
  try {
    els.termEnd.showPicker?.();
  } catch {
    // Some browsers only open the picker from a direct click on the field.
  }
});

/* ---------- Course rows ---------- */
const tweens = new WeakMap();
function tweenPct(node, from, to) {
  tweens.get(node)?.kill();
  if (reduce || from == null || to == null || Math.abs(from - to) < 0.05) {
    node.textContent = fmt(to);
    return;
  }
  const o = { v: from };
  tweens.set(node, gsap.to(o, { v: to, duration: 0.9, ease: 'expo.out', onUpdate: () => (node.textContent = fmt(o.v)) }));
}

function setText(node, text, animate) {
  if (node.textContent === text) return;
  node.textContent = text;
  if (animate && !reduce) gsap.fromTo(node, { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: 'expo.out' });
}

function makeRow(c) {
  const el = els.rowTpl.content.firstElementChild.cloneNode(true);
  fillIcons(el);
  el.dataset.id = c.id;
  const drawer = $('.row__drawer', el);
  drawer.id = `drawer-${c.id}`;
  const sum = $('.row__sum', el);
  sum.setAttribute('aria-controls', drawer.id);
  const name = $('.drawer__name', el);
  name.id = `name-${c.id}`;
  $('[data-for="name"]', el).setAttribute('for', name.id);
  const row = { el, parts: new Map(), shownPct: null, mode: null, wheels: [], minWheel: null };
  rows.set(c.id, row);
  els.list.append(el);
  return row;
}

function paintRow(c, v, animate) {
  const row = rows.get(c.id) ?? makeRow(c);
  const { el } = row;
  el.dataset.state = v.status;
  el.classList.toggle('is-unreachable', !!(v.end && !v.end.reachable));
  $('.row__name', el).textContent = c.name;
  const meta = [c.parts.map((p) => p.kind).join(' + ')];
  if (v.conducted) meta.push(`${v.attended} of ${v.conducted} attended`);
  if (c.credits) meta.push(plural(c.credits, 'credit'));
  if (c.min) meta.push(`needs ${c.min}%`);
  $('.row__parts', el).textContent = meta.join(', ');
  const s = stats(v);
  const now = nowText(v);
  const flag = $('.row__flag', el);
  flag.textContent = s.note || now.text;
  flag.dataset.tone = s.note ? 'danger' : now.tone;

  el.style.setProperty('--fill', v.status === 'empty' ? 0 : v.pct / 100);
  el.style.setProperty('--tick', v.min / 100);
  const pctEl = $('.row__pct', el);
  if (v.status === 'empty') {
    tweens.get(pctEl)?.kill();
    pctEl.textContent = 'No classes';
    row.shownPct = null;
  } else {
    tweenPct(pctEl, animate ? row.shownPct : null, v.pct);
    row.shownPct = v.pct;
  }

  for (const key of ['left', 'attend', 'skip']) {
    const node = $(`.row__${key} .row__v`, el);
    node.dataset.tone = s[key].tone;
    setText(node, s[key].text, animate);
  }
  $('.row__of', el).textContent = s.left.of || '';
  $('.row__sum', el).setAttribute('aria-label', `${c.name}, ${v.status === 'empty' ? 'no classes yet' : fmt(v.pct)}. ${statsLine(v)}. Show details.`);

  // Drawer
  const name = $('.drawer__name', el);
  if (document.activeElement !== name) name.value = c.name;
  paintParts(row, c, v);
  paintPlan(row, c, v);
  paintMin(row, c);
}

function paintParts(row, c, v) {
  const list = $('.parts', row.el);
  for (const [id, pel] of row.parts) {
    if (!c.parts.some((p) => p.id === id)) {
      pel.remove();
      row.parts.delete(id);
    }
  }
  c.parts.forEach((p) => {
    let pel = row.parts.get(p.id);
    if (!pel) {
      pel = els.partTpl.content.firstElementChild.cloneNode(true);
      fillIcons(pel);
      pel.dataset.part = p.id;
      row.parts.set(p.id, pel);
    }
    list.append(pel); // keeps order
    $('.part__kind', pel).textContent = p.kind;
    for (const input of $$('.cnt', pel)) {
      input.setAttribute('aria-label', `${p.kind} classes ${input.dataset.k === 'attended' ? 'attended' : 'held'}`);
      if (document.activeElement !== input) input.value = p[input.dataset.k];
    }
    const pv = v.parts.find((x) => x.id === p.id);
    const pp = $('.part__pct', pel);
    pp.textContent = p.conducted ? fmt(pv.judge.pct) : '';
    pel.dataset.state = v.mode === 'separate' ? pv.judge.status : '';
    const del = $('.part__del', pel);
    del.hidden = c.parts.length < 2;
    del.setAttribute('aria-label', `Remove ${p.kind}`);
  });
  const add = $('.parts__add', row.el);
  const missing = KINDS.filter((k) => !c.parts.some((p) => p.kind === k));
  const key = missing.join();
  if (add.dataset.key !== key) {
    add.dataset.key = key;
    add.replaceChildren(
      ...missing.map((k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link';
        b.dataset.act = 'add-part';
        b.dataset.kind = k;
        b.textContent = `+ ${k}`;
        return b;
      }),
    );
  }
}

const PLAN_LABEL = { total: 'Total classes', credits: 'Credits', pace: 'Pace so far', weekly: 'Per week' };

function paintPlan(row, c, v) {
  const el = row.el;
  const modes = $('.plan__modes', el);
  if (!modes.childElementCount) {
    modes.append(
      ...Object.entries(PLAN_LABEL).map(([mode, label]) => {
        const lab = document.createElement('label');
        lab.innerHTML = `<input type="radio" class="sr-only" name="plan-${c.id}" value="${mode}" /><span class="chip"></span>`;
        lab.lastChild.textContent = label;
        return lab;
      }),
    );
  }
  // "auto" shows whichever way it settled on.
  const mode = c.plan && c.plan !== 'auto' ? c.plan : v.plan.source || 'pace';
  for (const input of $$('input', modes)) input.checked = input.value === mode;

  const box = $('.plan__inputs', el);
  const sig = `${mode}|${c.parts.map((p) => p.id).join()}`;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.replaceChildren();
    row.wheels = [];
    const add = (label, w, read) => {
      const wrap = document.createElement('div');
      wrap.className = 'plan__field';
      const span = document.createElement('span');
      span.textContent = label;
      wrap.append(span, w.el);
      box.append(wrap);
      row.wheels.push({ w, read });
    };
    const edit = (change) => {
      commit(change);
      paintAll();
    };
    if (mode === 'total') {
      add(
        'Classes this semester',
        wheel({ values: range(1, 300), value: c.total, label: `${c.name}: classes this semester`, rows: 3, onChange: (n) => edit(() => (find(c.id).total = n)) }),
        (x) => x.total,
      );
    } else if (mode === 'credits') {
      add(
        'Credits',
        wheel({ values: range(0.5, 12, 0.5), value: c.credits, label: `${c.name}: credits`, rows: 3, onChange: (n) => edit(() => (find(c.id).credits = n)) }),
        (x) => x.credits,
      );
    } else if (mode === 'weekly') {
      c.parts.forEach((p) =>
        add(
          `${p.kind} a week`,
          wheel({
            values: range(0, 14, 0.5),
            value: p.perWeek || 0,
            label: `${c.name}: ${p.kind.toLowerCase()} classes a week`,
            rows: 3,
            onChange: (n) =>
              edit(() => {
                const q = find(c.id).parts.find((x) => x.id === p.id);
                if (q) q.perWeek = n;
              }),
          }),
          (x) => x.parts.find((q) => q.id === p.id)?.perWeek || 0,
        ),
      );
    }
  } else {
    for (const { w, read } of row.wheels) w.set(read(c));
  }
  const note = planNote(c, v);
  const forecast = forecastText(c, v);
  const fc = $('.plan__forecast', el);
  fc.textContent = [note, forecast].filter(Boolean).join(' ');
  fc.dataset.tone = v.end && !v.end.reachable ? 'danger' : '';
}

/** A course's own minimum, on a wheel whose first stop is the college's. */
function paintMin(row, c) {
  const box = $('.drawer__min', row.el);
  const sig = String(state.rule.min);
  if (box.dataset.sig === sig && row.minWheel) {
    row.minWheel.set(c.min);
    return;
  }
  box.dataset.sig = sig;
  row.minWheel = wheel({
    values: [null, ...range(40, 100)],
    value: c.min,
    format: (n) => (n == null ? `College, ${state.rule.min}%` : `${n}%`),
    label: `${c.name}: minimum attendance`,
    rows: 3,
    onChange: (n) => {
      commit(() => (find(c.id).min = n));
      paintAll();
    },
  });
  box.replaceChildren(row.minWheel.el);
}

function paintRows(intro) {
  for (const [id, row] of rows) {
    if (!state.courses.some((c) => c.id === id)) {
      row.el.remove();
      rows.delete(id);
    }
  }
  state.courses.forEach((c) => paintRow(c, views.get(c.id), !intro));
  // Move a row only when the order changed: moving a node resets the scroll of the wheels inside it, and drops focus.
  state.courses.forEach((c, i) => {
    const el = rows.get(c.id).el;
    if (els.list.children[i] !== el) els.list.insertBefore(el, els.list.children[i] || null);
  });
  if (intro && !reduce) {
    gsap.fromTo($$('.row', els.list), { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'expo.out', stagger: 0.05, clearProps: 'transform,opacity,visibility' });
  }
}

function paintAll({ intro = false } = {}) {
  views = new Map(state.courses.map((c) => [c.id, evaluate(c, state.rule, termNow())]));
  els.ruleVal.textContent = state.rule.mode === 'separate' && state.rule.labMin ? `${state.rule.min}/${state.rule.labMin}%` : `${state.rule.min}%`;
  const has = state.courses.length > 0;
  els.empty.hidden = has;
  els.head.hidden = !has;
  els.foot.hidden = !has;
  $('#term').hidden = !has;
  paintTerm();
  paintSummary(intro);
  paintRows(intro);
}

function openRow(id, scroll = false) {
  const row = rows.get(id);
  if (!row) return;
  setOpen(row.el, true);
  if (scroll) row.el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

function setOpen(el, open) {
  el.classList.toggle('is-open', open);
  $('.row__sum', el).setAttribute('aria-expanded', String(open));
}

/* ---------- Changes, with one level of undo ---------- */
let undoSnap = null;
let toastTimer = 0;

function commit(change, message) {
  const before = structuredClone(state);
  change();
  state = cleanState(state);
  saveRule(state.rule);
  if (message) {
    undoSnap = before;
    showToast(message);
  }
}

function showToast(msg) {
  $('.toast__msg', els.toast).textContent = msg;
  els.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  els.toast.classList.remove('is-on');
  undoSnap = null;
}

$('.toast__undo', els.toast).addEventListener('click', () => {
  if (!undoSnap) return;
  const snap = undoSnap;
  hideToast();
  state = cleanState(snap);
  paintAll();
});

/* Rows: one delegated handler for every button inside them. */
els.list.addEventListener('click', (e) => {
  const sum = e.target.closest('.row__sum');
  if (sum) {
    const el = sum.closest('.row');
    setOpen(el, !el.classList.contains('is-open'));
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const el = btn.closest('.row');
  const c = find(el.dataset.id);
  if (!c) return;
  const partEl = btn.closest('.part');
  const p = partEl && c.parts.find((x) => x.id === partEl.dataset.part);
  switch (btn.dataset.act) {
    case 'present':
    case 'absent': {
      const present = btn.dataset.act === 'present';
      commit(() => {
        const q = find(c.id).parts.find((x) => x.id === p.id);
        q.conducted++;
        if (present) q.attended++;
      }, `${present ? 'Present' : 'Absent'} in ${c.name} ${p.kind.toLowerCase()}`);
      sky.poke(c.id, present ? 1 : -1);
      bump(partEl, present);
      break;
    }
    case 'del-part':
      commit(() => (find(c.id).parts = c.parts.filter((x) => x.id !== p.id)), `Removed ${p.kind.toLowerCase()} from ${c.name}`);
      break;
    case 'add-part':
      commit(() => find(c.id).parts.push({ id: uid(), kind: btn.dataset.kind, attended: 0, conducted: 0 }));
      break;
    case 'delete': {
      commit(() => (state.courses = state.courses.filter((x) => x.id !== c.id)), `Removed ${c.name}`);
      const row = rows.get(c.id);
      rows.delete(c.id);
      if (reduce) row.el.remove();
      else gsap.to(row.el, { height: 0, autoAlpha: 0, duration: 0.5, ease: 'expo.inOut', onComplete: () => row.el.remove() });
      break;
    }
    default:
      return;
  }
  paintAll();
});

function bump(partEl, up) {
  if (reduce || !partEl) return;
  gsap.fromTo($('.part__counts', partEl), { y: up ? -5 : 5 }, { y: 0, duration: 0.6, ease: 'expo.out' });
}

// Edits commit when a field is left, not on every key.
els.list.addEventListener('change', (e) => {
  const t = e.target;
  const el = t.closest('.row');
  const c = el && find(el.dataset.id);
  if (!c) return;
  const partEl = t.closest('.part');
  if (t.classList.contains('cnt') && partEl) {
    const k = t.dataset.k;
    const raw = Math.max(0, Math.floor(Number(t.value) || 0));
    commit(() => {
      const q = find(c.id).parts.find((x) => x.id === partEl.dataset.part);
      q[k] = raw;
      // Attended above held pulls held up with it, so the edit is not lost.
      if (k === 'attended' && raw > q.conducted) q.conducted = raw;
      if (k === 'conducted' && raw < q.attended) q.attended = raw;
    });
  } else if (t.dataset.field === 'name') {
    const name = t.value.trim().slice(0, 60);
    if (name) commit(() => (find(c.id).name = name));
  } else if (t.name === `plan-${c.id}`) {
    // A wheel always shows a real value, so a way of counting starts from one:
    // the total from the current estimate (or the classes held), credits from 3.
    commit(() => {
      const q = find(c.id);
      q.plan = t.value;
      const held = sumParts(q.parts).conducted;
      if (t.value === 'total' && !q.total) q.total = Math.max(1, held, views.get(c.id)?.end?.total ?? 0);
      if (t.value === 'credits' && !q.credits) q.credits = 3;
    });
  } else return;
  paintAll();
});

// Typing into a number replaces it instead of appending to it; Enter commits.
els.list.addEventListener('focusin', (e) => {
  if (e.target.matches('input[type="number"], .cnt')) e.target.select();
});
els.list.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
});

/* ---------- Add, sample, clear ---------- */
function addCourse() {
  const c = cleanCourse({ id: uid(), name: 'New course', parts: [{ kind: 'Theory' }] });
  commit(() => state.courses.push(c));
  paintAll();
  const row = rows.get(c.id);
  setOpen(row.el, true);
  if (!reduce) gsap.from(row.el, { opacity: 0, y: 12, duration: 0.7, ease: 'expo.out', clearProps: 'opacity,transform' });
  const name = $('.drawer__name', row.el);
  row.el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  name.focus({ preventScroll: true });
  name.select();
}
$('#add-btn').addEventListener('click', addCourse);
$('#empty-add').addEventListener('click', addCourse);

function loadSample() {
  const had = state.courses.length > 0;
  // The sample brings its own courses and dates, not its own minimum.
  commit(() => (state = { ...sample(), rule: state.rule }), had ? 'Replaced your courses with the sample' : 'Loaded a sample semester');
  rows.forEach((r) => r.el.remove());
  rows.clear();
  paintAll({ intro: true });
}
$('#sample-btn').addEventListener('click', loadSample);
$('#empty-sample').addEventListener('click', loadSample);

$('#clear-btn').addEventListener('click', () => {
  commit(() => {
    state.courses = [];
    state.term = { start: '', end: '', asOf: '' };
  }, 'Cleared everything');
  paintAll();
});

/* ---------- Sheets (native dialogs) ---------- */
function openSheet(dlg) {
  if (dlg.open) return;
  dlg.classList.remove('is-closing');
  dlg.showModal();
}

function closeSheet(dlg) {
  if (!dlg.open || dlg.classList.contains('is-closing')) return;
  if (reduce) return dlg.close();
  dlg.classList.add('is-closing');
  dlg.addEventListener(
    'animationend',
    () => {
      dlg.classList.remove('is-closing');
      dlg.close();
    },
    { once: true },
  );
}

for (const dlg of [els.importDlg, els.ruleDlg]) {
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeSheet(dlg);
    // A click on the backdrop lands on the dialog element itself, outside its box.
    const r = dlg.getBoundingClientRect();
    if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) closeSheet(dlg);
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeSheet(dlg);
  });
}

/* ---------- The rule ---------- */
const PRESETS = [60, 65, 70, 75, 80, 85, 90];
const ruleChips = $('#rule-chips');
ruleChips.append(
  ...PRESETS.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip num';
    b.dataset.min = p;
    b.textContent = `${p}%`;
    return b;
  }),
);

const ruleWheel = wheel({
  values: range(40, 100),
  value: state.rule.min,
  format: (n) => `${n}%`,
  label: 'Minimum attendance',
  rows: 3,
  onChange: (n) => setRule(() => (state.rule.min = n)),
});
$('#rule-wheel').replaceWith(ruleWheel.el);
const labWheel = wheel({
  values: [null, ...range(40, 100)],
  value: state.rule.labMin,
  format: (n) => (n == null ? 'Same' : `${n}%`),
  label: 'Practical and studio minimum',
  rows: 3,
  onChange: (n) => setRule(() => (state.rule.labMin = n)),
});
$('#rule-lab-wheel').replaceWith(labWheel.el);

function paintRuleDialog() {
  const { min, mode, labMin } = state.rule;
  $$('.chip', ruleChips).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.min) === min)));
  ruleWheel.set(min);
  $$('input[name="rule-mode"]').forEach((r) => (r.checked = r.value === mode));
  $('#rule-lab-wrap').hidden = mode !== 'separate';
  labWheel.set(labMin);
}

function setRule(change) {
  commit(change);
  paintRuleDialog();
  paintAll();
}

ruleChips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-min]');
  if (b) setRule(() => (state.rule.min = Number(b.dataset.min)));
});
$$('input[name="rule-mode"]').forEach((r) => r.addEventListener('change', () => setRule(() => (state.rule.mode = r.value))));
$('#rule-btn').addEventListener('click', () => {
  paintRuleDialog();
  openSheet(els.ruleDlg);
});

/* ---------- Import ---------- */
let pending = null; // the report under review

function step(name) {
  $$('.import', els.importDlg).forEach((s) => (s.hidden = s.dataset.step !== name));
}

function importError(msg) {
  step('pick');
  $('#import-error').textContent = msg;
}

/** welcome: the first visit, straight from the landing page. */
function openImport(mode = 'import') {
  const welcome = mode === 'welcome';
  $('#import-title').textContent = welcome ? 'Import your attendance report?' : 'Import your report';
  $('#import-lede').hidden = !welcome;
  $('#import-error').textContent = '';
  step('pick');
  openSheet(els.importDlg);
}
$('#import-btn').addEventListener('click', () => openImport());
$('#import-drop').addEventListener('click', () => els.file.click());
$('#empty-drop').addEventListener('click', () => els.file.click());

els.file.addEventListener('change', () => {
  const files = [...els.file.files];
  els.file.value = '';
  if (files.length) readFiles(files);
});

async function readFiles(files) {
  openSheet(els.importDlg);
  $('#import-error').textContent = '';
  $('#busy-text').textContent = files.length > 1 ? `Reading ${files.length} reports` : `Reading ${files[0].name}`;
  step('busy');
  try {
    const report = await readReportFiles(files);
    review(report);
  } catch (err) {
    importError(err instanceof ReportError ? err.message : 'That file could not be read. Try pasting the table instead.');
  }
}

$('#paste-go').addEventListener('click', () => {
  const text = $('#paste-text').value;
  if (!text.trim()) return importError('Paste the table first.');
  try {
    review(readReportText(text));
  } catch (err) {
    importError(err.message);
  }
});

function review(report) {
  pending = report;
  reviewTotals.clear();
  const n = report.courses.length;
  // c.check: whether a course adds up to the percentage printed on the report (table.js).
  const printed = report.courses.filter((c) => c.check);
  const off = printed.filter((c) => !c.check.ok).length;
  let lede = `Found ${plural(n, 'course')} with ${plural(report.courses.reduce((s, c) => s + c.parts.length, 0), 'row')} of classes.`;
  const many = report.files > 1;
  if (printed.length) {
    lede += off
      ? ` ${off === 1 ? 'One percentage does' : `${off} percentages do`} not match ${many ? 'their reports' : 'the report'}. Check the classes below.`
      : many
        ? ' Every course matches the percentages on its reports.'
        : ' Every percentage matches the report.';
  }
  $('#review-lede').textContent = lede;
  const facts = $('#review-facts');
  facts.replaceChildren(...reportNotes(report));
  // The minimum: the report's if it states one, otherwise the one this device remembers.
  reviewMin = wheel({ values: range(40, 100), value: report.rule ?? state.rule.min, format: (n) => `${n}%`, label: 'Minimum attendance', rows: 3 });
  const min = document.createElement('div');
  min.className = 'review__min';
  min.innerHTML = '<div><b>Minimum attendance</b><span></span></div>';
  min.querySelector('span').textContent = report.rule
    ? `The report says ${report.rule}%. Scroll if yours is different.`
    : 'The report does not say. Scroll to your college\'s minimum; it is remembered on this device.';
  min.append(reviewMin.el);
  facts.append(min);
  if (report.start || report.asOf) {
    const bits = [report.start && `classes began ${niceDate(report.start)}`, report.asOf && `counts as of ${niceDate(report.asOf)}`].filter(Boolean);
    facts.append(check('use-dates', `Use ${many ? 'their' : 'its'} dates: ${bits.join(', ')}`, true));
  }
  // The end of classes drives every estimate; a report never says it.
  const end = document.createElement('label');
  end.className = 'review__end';
  end.innerHTML = '<span>Classes end on</span><input type="date" id="review-end" />';
  const guess = assumedEnd(report.start);
  const hint = document.createElement('span');
  hint.className = 'review__end-hint';
  hint.textContent = guess ? `Empty: about ${niceDate(guess)}, 18 weeks after classes began.` : 'Optional.';
  end.append(hint);
  facts.append(end);
  const list = $('#review-list');
  list.replaceChildren(
    ...report.courses.map((c, i) => {
      const li = document.createElement('li');
      li.className = 'review__item';
      const { attended, conducted } = sumParts(c.parts);
      li.innerHTML = `<input type="checkbox" checked data-i="${i}" /><textarea class="review__name" data-i="${i}" maxlength="60" rows="1" spellcheck="false"></textarea><span class="review__parts"></span><span class="review__pct num"></span><button type="button" class="review__total" aria-expanded="false"><span class="num"></span><i data-icon="caret"></i></button><div class="review__wheel" hidden></div>`;
      li.children[0].setAttribute('aria-label', `Import ${c.name}`);
      li.children[1].value = c.name;
      li.children[1].setAttribute('aria-label', 'Course name');
      li.children[2].textContent = c.parts.map((p) => `${p.kind} ${p.attended}/${p.conducted}`).join(' · ');
      reviewTotals.set(i, { value: c.total ?? null, est: estimateTotal(c, report), held: conducted, name: c.name });
      fillIcons(li);
      paintTotal(li, i);
      const pct = li.children[3];
      pct.textContent = fmt(percent(attended, conducted));
      if (c.check) {
        pct.dataset.match = c.check.ok ? 'yes' : 'no';
        if (!c.check.ok) pct.textContent += c.check.printed ? ` (report ${c.check.printed})` : ' (not as reported)';
      }
      return li;
    }),
  );
  updateReviewButton();
  $('#import-title').textContent = 'Check your courses';
  $('#import-lede').hidden = true;
  step('review');
  $$('.review__name', list).forEach(fitName);
  if (!reduce) gsap.from($$('.review__item', list), { y: 10, opacity: 0, duration: 0.6, ease: 'expo.out', stagger: 0.03 });
}

/* Each course's total classes this semester: a pill showing it (or the estimate,
   with a ~), which opens a wheel under the course. One wheel is open at a time. */
let reviewMin = null;
const reviewTotals = new Map();

function paintTotal(li, i) {
  const t = reviewTotals.get(i);
  const pill = $('.review__total', li);
  pill.firstElementChild.textContent = t.value ? `${t.value} classes` : t.est ? `~${t.est} classes` : 'Total classes';
  pill.dataset.set = t.value ? 'yes' : '';
  pill.setAttribute('aria-label', `${t.name}: ${t.value ? `${t.value} classes this semester` : 'total classes this semester, not set'}. Change it.`);
}

function closeTotals(except) {
  for (const li of $$('#review-list .review__item')) {
    if (li === except) continue;
    $('.review__wheel', li).hidden = true;
    $('.review__total', li).setAttribute('aria-expanded', 'false');
  }
}

$('#review-list').addEventListener('click', (e) => {
  const li = e.target.closest('.review__item');
  if (!li) return;
  const i = Number(li.children[0].dataset.i);
  const t = reviewTotals.get(i);
  if (e.target.closest('.review__use-est')) {
    t.value = null;
    paintTotal(li, i);
    closeTotals();
    return;
  }
  if (!e.target.closest('.review__total')) return;
  const box = $('.review__wheel', li);
  const open = box.hidden;
  closeTotals(li);
  box.hidden = !open;
  $('.review__total', li).setAttribute('aria-expanded', String(open));
  if (!open || box.childElementCount) return;
  const w = wheel({
    values: range(1, 300),
    value: t.value ?? t.est ?? Math.max(1, t.held),
    format: (n) => `${n}`,
    label: `${t.name}: classes this semester`,
    rows: 5,
    onChange: (n) => {
      t.value = n;
      paintTotal(li, i);
    },
  });
  const side = document.createElement('div');
  side.className = 'review__wheel-side';
  side.innerHTML = '<b>Classes this semester</b><span>All types together. A course that has finished has as many as it held.</span>';
  if (t.est) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'link review__use-est';
    reset.textContent = `Use the estimate, ~${t.est}`;
    side.append(reset);
  }
  box.append(w.el, side);
  // Opening the wheel picks what it shows, so the pill and the wheel agree.
  if (t.value == null) {
    t.value = w.value;
    paintTotal(li, i);
  }
});

/** What the review should say about the files themselves: what was added up, left out or not counted. */
function reportNotes(report) {
  const notes = [];
  const note = (text, tone = '') => {
    const p = document.createElement('p');
    p.className = 'review__note';
    p.dataset.tone = tone;
    p.textContent = text;
    notes.push(p);
  };
  const names = (list) => (list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
  if (report.files > 1) note(`Added up ${report.files} reports, course by course.`);
  if (report.skipped?.length) {
    const n = report.skipped.length;
    note(`Left out ${names(report.skipped)}: ${n === 1 ? 'its dates fall' : 'their dates fall'} inside another report's, so those classes are counted already.`);
  }
  if (report.failed?.length) note(`Could not read ${names(report.failed)}.`, 'danger');
  if (report.pending) note(`${plural(report.pending, 'class', 'classes')} not marked yet ${report.pending === 1 ? 'is' : 'are'} left out until ${report.pending === 1 ? 'it is' : 'they are'}.`);
  if (report.excused) note(`${plural(report.excused, 'exempted or late-admission class', 'exempted or late-admission classes')} ${report.excused === 1 ? 'counts' : 'count'} for neither side.`);
  // One month on its own is not the semester.
  if (!(report.files > 1) && report.start && report.asOf && daysBetween(parseDate(report.start), parseDate(report.asOf)) < 40) {
    note(`This report covers ${niceDate(report.start)} to ${niceDate(report.asOf)} only. For the whole semester, select every month's report together, or use the detailed one.`, 'edge');
  }
  return notes;
}

/** The total an import would assume without being told: classes held, plus the pace carried on to the assumed end. */
function estimateTotal(c, report) {
  const parts = c.parts.map((p, k) => ({ ...p, id: String(k) }));
  const term = { start: report.start || '', end: assumedEnd(report.start), asOf: report.asOf || '' };
  const plan = classesLeft({ parts, plan: 'pace' }, term);
  return plan.total == null ? null : plan.total + sumParts(parts).conducted;
}

function check(name, label, checked) {
  const lab = document.createElement('label');
  lab.className = 'check';
  lab.innerHTML = `<input type="checkbox" name="${name}" ${checked ? 'checked' : ''} /><span></span>`;
  lab.lastChild.textContent = label;
  return lab;
}

function updateReviewButton() {
  const n = $$('#review-list input[type="checkbox"]:checked').length;
  const go = $('#review-go');
  go.disabled = n === 0;
  go.textContent = n ? `Import ${plural(n, 'course')}` : 'Pick a course';
}
$('#review-list').addEventListener('change', updateReviewButton);

// A long course name wraps onto a second line instead of being cut off.
function fitName(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}
$('#review-list').addEventListener('input', (e) => e.target.matches('.review__name') && fitName(e.target));
$('#review-list').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.review__name')) {
    e.preventDefault();
    e.target.blur();
  }
});
$('#review-back').addEventListener('click', () => step('pick'));

$('#review-go').addEventListener('click', () => {
  if (!pending) return;
  const report = pending;
  const chosen = $$('#review-list .review__item')
    .filter((li) => li.children[0].checked)
    .map((li) => {
      const i = Number(li.children[0].dataset.i);
      const name = li.children[1].value.replace(/\s+/g, ' ').trim() || report.courses[i].name;
      return { ...report.courses[i], name, total: reviewTotals.get(i)?.value ?? null };
    });
  const useDates = $('input[name="use-dates"]', els.importDlg)?.checked;
  // An import replaces everything the dashboard held, dates included, so
  // nothing from an earlier report carries over; Undo brings it all back.
  commit(() => {
    if (reviewMin) state.rule.min = reviewMin.value;
    const endOn = $('#review-end', els.importDlg)?.value;
    state.term = { start: (useDates && report.start) || '', end: parseDate(endOn) ? endOn : '', asOf: (useDates && report.asOf) || '' };
    state.courses = chosen.map((c) => cleanCourse({ id: uid(), name: c.name, credits: c.credits, total: c.total, parts: c.parts.map((p) => ({ ...p, id: uid() })) }));
  }, `Imported ${plural(chosen.length, 'course')}`);
  pending = null;
  closeSheet(els.importDlg);
  rows.forEach((r) => r.el.remove());
  rows.clear();
  paintAll({ intro: true });
});

/* Drop a file anywhere on the dashboard. */
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('is-dragging');
});
addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('is-dragging');
});
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('is-dragging');
  const files = [...e.dataTransfer.files];
  if (files.length) readFiles(files);
});

/* ---------- First paint ---------- */
paintAll({ intro: true });
if (!reduce) {
  gsap.from('.summary__text > *, .term, .courses__head, .courses__foot, .empty', {
    y: 16,
    autoAlpha: 0,
    duration: 1,
    ease: 'expo.out',
    stagger: 0.06,
    clearProps: 'transform,opacity,visibility',
  });
}

// A report dropped on the landing page arrives here for review.
const handed = takePending();
const arrived = location.hash;
if (arrived) history.replaceState(null, '', location.pathname + location.search); // a reload should not reopen it
if (handed && handed.courses?.length) {
  review(handed);
  openSheet(els.importDlg);
} else if (arrived === '#import') openImport();
else if (arrived === '#start' && !state.courses.length) {
  // Coming from the landing page: offer the import first.
  setTimeout(() => openImport('welcome'), reduce ? 0 : 450);
}

