import './styles/base.css';
import './styles/app.css';

import gsap from 'gsap';
import { Skyline } from './skyline.js';
import { evaluate, shortName, KINDS, parseDate, isoDate, daysBetween, startOfDay, weeklyFromCredits, sumParts, slack } from './plan.js';
import { percent } from './core.js';
import { load, save, sample, uid, cleanState, cleanCourse, takePending, STORAGE_KEY } from './store.js';
import { readReportFile, readReportText, ReportError } from './report.js';
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

let state = load();
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
// Truncated, never rounded up: 79.96% must not read as 80.0%.
const fmt = (p) => (p == null ? '' : `${(Math.floor(p * 10 + 1e-9) / 10).toFixed(1)}%`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (iso) => {
  const d = parseDate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
};
const norm = (s) => s.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const find = (id) => state.courses.find((c) => c.id === id);

/** Where a course stands today, in plain words. Only shown when it matters. */
function nowText(v) {
  const kind = v.mode === 'separate' && v.worstKind ? `${v.worstKind} ` : '';
  if (v.status === 'empty') return { text: 'No classes yet', tone: 'muted' };
  if (v.status === 'below') return { text: `${kind}below ${v.min}% right now`, tone: 'danger' };
  if (v.status === 'edge') return { text: `${kind}no classes to spare right now`, tone: 'edge' };
  return { text: '', tone: '' };
}

function leftFor(v) {
  return v.mode === 'separate' ? (v.parts.find((p) => p.kind === v.endKind)?.judge.left ?? v.left) : v.left;
}

/**
 * The three numbers people asked for: classes still to come, how many of
 * them must be attended, and how many can be skipped, to finish at or above
 * the minimum. Must attend + can skip = classes left.
 */
function stats(v) {
  const blank = { text: '', tone: '' };
  if (v.plan.total == null) {
    return { left: { text: v.plan.reason === 'no-end' || v.plan.reason === 'no-start' ? 'Add dates' : 'Pick an estimate', tone: 'muted' }, attend: blank, skip: blank, note: '' };
  }
  const left = leftFor(v);
  const e = v.end;
  if (!left) return { left: { text: '0', tone: 'muted' }, attend: { text: '0', tone: 'muted' }, skip: { text: '0', tone: 'muted' }, note: '' };
  if (!e.reachable) {
    return { left: { text: String(left), tone: '' }, attend: { text: `All ${left}`, tone: 'danger' }, skip: { text: '0', tone: 'danger' }, note: `Best case ${fmt(e.best)}` };
  }
  const skip = e.maxSkip;
  return {
    left: { text: String(left), tone: '' },
    attend: { text: skip === 0 ? `All ${left}` : String(left - skip), tone: skip === 0 ? 'edge' : '' },
    skip: { text: String(skip), tone: skip === 0 ? 'edge' : 'good' },
    note: '',
  };
}

/** One line for tooltips and screen readers: "22 left: attend 12, skip up to 10". */
function statsLine(v) {
  const s = stats(v);
  if (v.plan.total == null) return s.left.text;
  if (s.left.text === '0') return 'No classes left';
  if (s.note) return `${s.left.text} left: attend all of them. ${s.note}`;
  if (s.skip.text === '0') return `${s.left.text} left: attend all of them`;
  return `${s.left.text} left: attend ${s.attend.text}, skip up to ${s.skip.text}`;
}

/** Semester dates as used for the maths: a missing end date is assumed 16 weeks after the start. */
function guessEnd() {
  const s = parseDate(state.term.start);
  if (!s || state.term.end) return '';
  const d = new Date(s);
  d.setDate(d.getDate() + 16 * 7 - 3);
  return isoDate(d);
}
const termNow = () => ({ ...state.term, end: state.term.end || guessEnd() });

const REASON = {
  'no-end': 'Add the day classes end, above, to see what is still possible.',
  'no-start': 'Add the day classes began, or estimate from credits or classes a week.',
  'too-early': 'After two weeks of classes Threshold can use your pace. Until then, use credits or classes a week.',
  'no-credits': 'Enter the course credits to estimate the classes left.',
  'no-total': 'Enter how many classes are planned in total.',
};

function forecastLine(left, e, min, pct, exact, kind = '') {
  const lead = kind ? `${kind}: ` : '';
  if (left === 0) return `${lead}No classes left. You finish at ${fmt(pct)}.`;
  const head = `${lead}${exact ? '' : 'About '}${plural(left, 'class', 'classes')} left`;
  if (!e.reachable) return `${head}. Even attending every one, you finish at ${fmt(e.best)}, short of ${min}%.`;
  if (e.maxSkip === 0) return `${head}. Attend every one to finish at ${min}%.`;
  return `${head}. Skip up to ${e.maxSkip} and you still finish at ${min}% or above.`;
}

function forecastText(course, v) {
  if (v.plan.total == null) return REASON[v.plan.reason] || '';
  const exact = v.plan.source === 'total';
  if (v.mode === 'separate') {
    return v.parts.map((p) => forecastLine(p.judge.left ?? 0, p.judge.end, p.judge.min, p.judge.pct, exact, p.kind)).join(' ');
  }
  return forecastLine(v.left, v.end, v.min, v.pct, exact);
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
    return `Your classes have run at about ${ratesText(course, rates)} a week so far.`;
  }
  if (src === 'credits') {
    const w = weeklyFromCredits(course.credits, course.parts);
    return `${plural(course.credits, 'credit')} plans ${ratesText(course, w)} classes a week. One credit is one lecture hour or two lab hours a week.`;
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
      lede = below.length === 1 && counted.length > 1 ? `${below[0].c.name} is below ${minText}.` : `${below.length} of ${plural(counted.length, 'course')} ${below.length === 1 ? 'is' : 'are'} below ${minText}.`;
    } else {
      lede = counted.length === 1 ? `${counted[0].c.name} is at or above ${minText}.` : `All ${counted.length} courses are at or above ${minText}.`;
    }
    // The course with the least room by the last class (or right now, without a plan).
    const room = ({ v }) => (v.end ? (v.end.reachable ? v.end.maxSkip : -1e6 + v.end.best) : slack(v));
    const tight = counted.reduce((w, x) => (room(x) < room(w) ? x : w));
    const tv = tight.v;
    const tl = leftFor(tv);
    if (tv.end && !tv.end.reachable) sub = `${tight.c.name} can no longer reach ${tv.min}% this semester. Best case ${fmt(tv.end.best)}.`;
    else if (tv.end && tl) {
      sub =
        tv.end.maxSkip === 0
          ? `${tight.c.name} has no room: attend all ${plural(tl, 'remaining class', 'remaining classes')}.`
          : `Least room: ${tight.c.name}. Of its ${tl} remaining classes you can skip ${tv.end.maxSkip}.`;
    } else if (tv.status === 'below') {
      sub = Number.isFinite(tv.need)
        ? `${tight.c.name} needs the next ${plural(tv.need, 'class', 'classes')} in a row to get back above ${tv.min}%.`
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
  if (!e) note = 'Add the day classes began or end to see the classes left in each course.';
  else if (e < now) note = 'That end date has passed.';
  else {
    const days = daysBetween(now, e);
    const span = days >= 14 ? plural(Math.round(days / 7), 'week') : plural(days, 'day');
    note = guess
      ? `Assuming classes end 16 weeks after they began: ${span} left. Set the real date for exact numbers.`
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
  const min = $('.drawer__min', el);
  min.id = `min-${c.id}`;
  $('[data-for="min"]', el).setAttribute('for', min.id);
  const row = { el, parts: new Map(), shownPct: null, mode: null };
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
  $('.row__sum', el).setAttribute('aria-label', `${c.name}, ${v.status === 'empty' ? 'no classes yet' : fmt(v.pct)}. ${statsLine(v)}. Show details.`);

  // Drawer
  const name = $('.drawer__name', el);
  if (document.activeElement !== name) name.value = c.name;
  paintParts(row, c, v);
  paintPlan(row, c, v);
  paintMin(el, c);
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

const PLAN_LABEL = { auto: 'Pace so far', credits: 'Credits', weekly: 'Per week', total: 'Planned total' };

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
  for (const input of $$('input', modes)) input.checked = input.value === (c.plan || 'auto');

  const box = $('.plan__inputs', el);
  const mode = c.plan || 'auto';
  const sig = `${mode}|${c.parts.map((p) => p.id).join()}`;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.replaceChildren();
    if (mode === 'credits') {
      box.append(field('Credits', 'credits', c.credits ?? '', { step: '0.5', placeholder: '3' }));
    } else if (mode === 'weekly') {
      c.parts.forEach((p) => box.append(field(`${p.kind} a week`, 'perWeek', p.perWeek || '', { step: '0.5', part: p.id, placeholder: '2' })));
    } else if (mode === 'total') {
      c.parts.forEach((p) => box.append(field(`${p.kind} planned`, 'total', p.total ?? '', { part: p.id, placeholder: '30' })));
    }
  } else {
    for (const input of $$('input', box)) {
      if (document.activeElement === input) continue;
      const p = input.dataset.part && c.parts.find((x) => x.id === input.dataset.part);
      const val = input.dataset.field === 'credits' ? c.credits : p ? (input.dataset.field === 'total' ? p.total : p.perWeek || '') : '';
      input.value = val ?? '';
    }
  }
  const note = planNote(c, v);
  const forecast = forecastText(c, v);
  const fc = $('.plan__forecast', el);
  fc.textContent = [note, forecast].filter(Boolean).join(' ');
  fc.dataset.tone = v.end && !v.end.reachable ? 'danger' : '';
}

function field(label, name, value, { step = '1', part = '', placeholder = '' } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'plan__field';
  wrap.innerHTML = `<span></span><input type="number" class="num" min="0" max="${name === 'credits' ? 30 : 400}" inputmode="decimal" />`;
  wrap.firstChild.textContent = label;
  const input = wrap.lastChild;
  input.step = step;
  input.value = value;
  input.placeholder = placeholder;
  input.dataset.field = name;
  if (part) input.dataset.part = part;
  return wrap;
}

function paintMin(el, c) {
  const sel = $('.drawer__min', el);
  const opts = [''];
  for (let p = 50; p <= 100; p += 5) opts.push(String(p));
  if (c.min && !opts.includes(String(c.min))) opts.push(String(c.min));
  const sig = `${state.rule.min}|${opts.join()}`;
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.replaceChildren(...opts.map((o) => new Option(o ? `${o}%` : `Same as the college (${state.rule.min}%)`, o)));
  }
  sel.value = c.min ? String(c.min) : '';
}

function paintRows(intro) {
  for (const [id, row] of rows) {
    if (!state.courses.some((c) => c.id === id)) {
      row.el.remove();
      rows.delete(id);
    }
  }
  state.courses.forEach((c) => paintRow(c, views.get(c.id), !intro));
  state.courses.forEach((c) => els.list.append(rows.get(c.id).el));
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
  save(state);
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
  save(state);
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
  } else if (t.dataset.field === 'min') {
    commit(() => (find(c.id).min = t.value ? Number(t.value) : null));
  } else if (t.name === `plan-${c.id}`) {
    commit(() => (find(c.id).plan = t.value));
  } else if (t.dataset.field === 'credits') {
    commit(() => (find(c.id).credits = Number(t.value) > 0 ? Number(t.value) : null));
  } else if (t.dataset.field === 'perWeek' || t.dataset.field === 'total') {
    commit(() => {
      const q = find(c.id).parts.find((x) => x.id === t.dataset.part);
      q[t.dataset.field] = t.value === '' ? (t.dataset.field === 'total' ? null : 0) : Math.max(0, Number(t.value) || 0);
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
  commit(() => (state = sample()), had ? 'Replaced your courses with the sample' : 'Loaded a sample semester');
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

function paintRuleDialog() {
  const { min, mode, labMin } = state.rule;
  $$('.chip', ruleChips).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.min) === min)));
  const other = $('#rule-other');
  if (document.activeElement !== other) other.value = PRESETS.includes(min) ? '' : min;
  $$('input[name="rule-mode"]').forEach((r) => (r.checked = r.value === mode));
  $('#rule-lab-wrap').hidden = mode !== 'separate';
  const lab = $('#rule-lab');
  if (document.activeElement !== lab) lab.value = labMin ?? '';
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
$('#rule-other').addEventListener('change', (e) => {
  const n = Math.round(Number(e.target.value));
  if (n >= 1 && n <= 100) setRule(() => (state.rule.min = n));
  else paintRuleDialog();
});
$$('input[name="rule-mode"]').forEach((r) => r.addEventListener('change', () => setRule(() => (state.rule.mode = r.value))));
$('#rule-lab').addEventListener('change', (e) => {
  const n = Math.round(Number(e.target.value));
  setRule(() => (state.rule.labMin = n >= 1 && n <= 100 ? n : null));
});
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

/** welcome: the first visit, straight from "Open planner" on the landing page. */
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
  const f = els.file.files[0];
  els.file.value = '';
  if (f) readFile(f);
});

async function readFile(file) {
  openSheet(els.importDlg);
  $('#import-error').textContent = '';
  $('#busy-text').textContent = `Reading ${file.name}`;
  step('busy');
  try {
    const report = await readReportFile(file);
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
  const n = report.courses.length;
  $('#review-lede').textContent = `Found ${plural(n, 'course')} with ${plural(report.courses.reduce((s, c) => s + c.parts.length, 0), 'row')} of classes.`;
  const facts = $('#review-facts');
  facts.replaceChildren();
  if (report.rule) {
    facts.append(check('use-rule', `Use the report's minimum: ${report.rule}% in each course`, true));
  }
  if (report.start || report.asOf) {
    const bits = [report.start && `classes began ${niceDate(report.start)}`, report.asOf && `counts as of ${niceDate(report.asOf)}`].filter(Boolean);
    facts.append(check('use-dates', `Use its dates: ${bits.join(', ')}`, true));
  }
  const list = $('#review-list');
  list.replaceChildren(
    ...report.courses.map((c, i) => {
      const li = document.createElement('li');
      li.className = 'review__item';
      const { attended, conducted } = sumParts(c.parts);
      li.innerHTML = `<input type="checkbox" checked data-i="${i}" /><input class="review__name" data-i="${i}" maxlength="60" /><span class="review__parts"></span><span class="review__pct num"></span>`;
      li.children[0].setAttribute('aria-label', `Import ${c.name}`);
      li.children[1].value = c.name;
      li.children[1].setAttribute('aria-label', 'Course name');
      li.children[2].textContent = c.parts.map((p) => `${p.kind} ${p.attended}/${p.conducted}`).join(' · ');
      li.children[3].textContent = fmt(percent(attended, conducted));
      return li;
    }),
  );
  $('#review-mode').hidden = !state.courses.length;
  updateReviewButton();
  $('#import-title').textContent = 'Check your courses';
  $('#import-lede').hidden = true;
  step('review');
  if (!reduce) gsap.from($$('.review__item', list), { y: 10, opacity: 0, duration: 0.6, ease: 'expo.out', stagger: 0.03 });
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
$('#review-back').addEventListener('click', () => step('pick'));

$('#review-go').addEventListener('click', () => {
  if (!pending) return;
  const report = pending;
  const chosen = $$('#review-list .review__item')
    .filter((li) => li.children[0].checked)
    .map((li) => {
      const i = Number(li.children[0].dataset.i);
      const name = li.children[1].value.trim() || report.courses[i].name;
      return { ...report.courses[i], name };
    });
  const useRule = $('input[name="use-rule"]', els.importDlg)?.checked;
  const useDates = $('input[name="use-dates"]', els.importDlg)?.checked;
  const replace = !state.courses.length || $('input[name="merge"]:checked', els.importDlg)?.value === 'replace';
  commit(() => {
    if (useRule && report.rule) state.rule.min = report.rule;
    if (useDates) {
      if (report.start) state.term.start = report.start;
      if (report.asOf) state.term.asOf = report.asOf;
    }
    const incoming = chosen.map((c) => cleanCourse({ id: uid(), name: c.name, parts: c.parts.map((p) => ({ ...p, id: uid() })) }));
    if (replace) {
      state.courses = incoming;
      return;
    }
    for (const inc of incoming) {
      const old = state.courses.find((c) => norm(c.name) === norm(inc.name));
      if (!old) {
        state.courses.push(inc);
        continue;
      }
      for (const p of inc.parts) {
        const q = old.parts.find((x) => x.kind === p.kind);
        if (q) {
          q.attended = p.attended;
          q.conducted = p.conducted;
        } else old.parts.push(p);
      }
    }
  }, `Imported ${plural(chosen.length, 'course')}`);
  pending = null;
  closeSheet(els.importDlg);
  if (replace) {
    rows.forEach((r) => r.el.remove());
    rows.clear();
  }
  paintAll({ intro: true });
});

/* Drop a file anywhere on the planner. */
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
  const f = e.dataTransfer.files[0];
  if (f) readFile(f);
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
  // Coming from "Open planner" with nothing saved yet: offer the import first.
  setTimeout(() => openImport('welcome'), reduce ? 0 : 450);
}

// Other tabs: pick up their changes.
addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  state = load();
  paintAll();
});

