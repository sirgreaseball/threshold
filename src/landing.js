import 'lenis/dist/lenis.css';
import './styles/base.css';
import './styles/landing.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

import { Liquid, invertText } from './liquid.js';
import { percent, canMiss, mustAttend, status, forecast } from './core.js';
import { story, timeline, word, Word } from './story.js';
import { setPending } from './store.js';
import { readReportFiles, ReportError } from './report.js';
import { fillIcons } from './icons.js';
import { bindThemeToggle } from './theme.js';
import { magnetize } from './magnet.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

fillIcons(document);
bindThemeToggle($('#theme-btn'));
magnetize();

/* Smooth scroll, driven by GSAP's ticker so ScrollTrigger and Lenis share a frame. */
let lenis = null;
gsap.ticker.lagSmoothing(0);
if (!reduce) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
}
$$('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(target, { duration: 1.6, offset: -40 }) : target.scrollIntoView();
  }),
);

// Truncated, never rounded up: 79.96% must not read as 80.0%.
const fmt = (p) => (p == null ? '0%' : `${(Math.floor(p * 10 + 1e-9) / 10).toFixed(1)}%`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const count = (n) => (n <= 20 ? word(n) : String(n));

/* One sentence for a course's state. Shared by the stage readout and the demo. */
function sentence(a, t, P) {
  switch (status(a, t, P)) {
    case 'empty':
      return { pre: 'No classes', big: '0', post: 'yet.', short: 'No classes yet' };
    case 'below': {
      const n = mustAttend(a, t, P);
      return n === Infinity
        ? { pre: 'You cannot reach', big: `${P}%`, post: 'any more.', short: `Cannot reach ${P}%` }
        : { pre: 'Attend the next', big: String(n), post: n === 1 ? 'class to get back.' : 'in a row to get back.', short: `Attend the next ${n} in a row` };
    }
    case 'edge':
      return { pre: 'You are on the line.', big: '0', post: 'classes to spare.', short: 'On the line. Miss none.' };
    default: {
      const k = canMiss(a, t, P);
      return { pre: 'You can miss', big: String(k), post: k === 1 ? 'more class.' : 'more classes.', short: `You can miss ${k} more` };
    }
  }
}

/** Write text into every element tagged data-story=key, inverted copies included. */
function setStory(key, text) {
  for (const el of $$(`[data-story="${key}"]`)) {
    const layers = [...el.children].filter((c) => c.classList.contains('invert-a') || c.classList.contains('invert-b'));
    if (layers.length) layers.forEach((l) => (l.textContent = text));
    else el.textContent = text;
  }
}

/* ---------- The minimum, passed on to the dashboard ---------- */
const clampP = (n) => Math.max(50, Math.min(95, Math.round(Number(n) || 75)));
let P = 75;
// Nothing is saved, so the dashboard learns the minimum from its address.
const dashboardUrl = (hash = '') => `/dashboard/${P === 75 ? '' : `?min=${P}`}${hash}`;
let S = story(P);
let TL = timeline(S);

function writeCopy() {
  const { a0, t0, k1, k2, n, exact } = S;
  const t1 = t0 + k1;
  const t2 = t1 + k2;
  const last = TL.seq[TL.seq.length - 1];
  const classes = (x) => `${count(x)} ${x === 1 ? 'class' : 'classes'}`;
  setStory('P%', `${P}%`);
  setStory(
    'beatA',
    `Take one course: ${a0} of ${t0} classes attended, ${fmt(percent(a0, t0))}. Skip ${word(k1)} and it falls to ${fmt(percent(a0, t1))}. One more skip and it is below the line.`,
  );
  setStory('beatB', `${Word(k2)} more skips: ${a0} of ${t2}, ${fmt(percent(a0, t2))}. Now it takes ${classes(n)} in a row, without a single miss, to get back.`);
  setStory(
    'beatC',
    `${n <= 20 ? Word(n) : n} ${n === 1 ? 'class' : 'classes'} later it is back ${exact ? `at exactly ${P}%` : `above ${P}%, at ${fmt(percent(last.a, last.t))}`}. Threshold does this sum for every course you take, every time your attendance changes.`,
  );
  buildTrack();
}

/* The readout's track: one mark per class in the story, in the order it is told
   (the misses, then the run of attended classes), with a two-item key below. */
let ticks = [];
function buildTrack() {
  const track = $('#hud-track');
  if (!track) return;
  const groups = [
    { kind: 'miss', count: S.k1 },
    { kind: 'miss', count: S.k2 },
    { kind: 'attend', count: S.n },
  ];
  ticks = [];
  const bars = document.createElement('div');
  bars.className = 'hud__bars';
  bars.append(
    ...groups.map((g) => {
      const row = document.createElement('div');
      row.className = 'hud__ticks';
      row.style.flex = `${g.count} 1 0`;
      for (let i = 0; i < g.count; i++) {
        const t = document.createElement('span');
        t.className = `hud__tick is-${g.kind}`;
        row.append(t);
        ticks.push(t);
      }
      return row;
    }),
  );
  const key = document.createElement('div');
  key.className = 'hud__key';
  key.innerHTML = '<span><i class="hud__swatch is-miss"></i>missed</span><span><i class="hud__swatch is-attend"></i>attended</span>';
  track.replaceChildren(bars, key);
}

/** What the readout says at step i of the story. */
function hudState(i) {
  const { a, t } = TL.seq[i];
  if (i === TL.keys[3]) return S.exact ? `Back at ${P}%` : `Back above ${P}%`;
  const st = status(a, t, P);
  if (st === 'below') return `Attend the next ${mustAttend(a, t, P)} in a row`;
  if (st === 'edge') return 'No classes to spare';
  const k = canMiss(a, t, P);
  return `${k} ${k === 1 ? 'class' : 'classes'} to spare`;
}

/* ---------- Stage: one course's semester, told by scrolling ---------- */
const stage = $('.stage');
const liquid = new Liquid($('.stage__canvas'), { range: [P - 15, P + 25], target: P, level: P - 17, spacing: 9 });
invertText(liquid, $$('[data-invert]', stage));
writeCopy();

const hud = {
  pct: $('.hud__pct'),
  a: $('.hud__a'),
  t: $('.hud__t'),
  state: $('.hud__state'),
};

let current = -1;
let progress = 0;
let intro = !reduce; // while the intro fill runs, scroll does not drive the level
function show(i, kick = true) {
  if (i === current) return;
  current = i;
  const { a, t } = TL.seq[i];
  hud.a.textContent = a;
  hud.t.textContent = t;
  hud.state.textContent = hudState(i);
  // Classes 1..i of the story have happened; mark i is the latest.
  ticks.forEach((tick, k) => {
    tick.classList.toggle('is-done', k < i);
    tick.classList.toggle('is-now', k === i - 1);
  });
  if (!intro) liquid.setLevel(percent(a, t), { kick });
}

// The readout follows the liquid's actual (springy) level, not the target.
liquid.onFrame(() => {
  // Snap to the exact value once the spring is nearly there, so "exactly 80%" never reads 79.9%.
  const v = Math.abs(liquid.shown - liquid.level) < 0.06 ? liquid.level : liquid.shown;
  const text = fmt(v);
  if (hud.pct.textContent !== text) hud.pct.textContent = text;
});

let anchors = [0, 0.33, 0.66, 1];
function measure() {
  const total = stage.offsetHeight - innerHeight;
  anchors = $$('.beat', stage).map((b, i) => (i === 0 ? 0 : Math.min(1, b.offsetTop / total)));
}
const smooth = (u) => u * u * (3 - 2 * u);
function fromProgress(p) {
  const keys = TL.keys;
  let seg = 0;
  while (seg < anchors.length - 2 && p > anchors[seg + 1]) seg++;
  const span = anchors[seg + 1] - anchors[seg] || 1;
  // A short hold at each anchor, so the copy and the numbers agree while you read.
  const u = Math.max(0, Math.min(1, ((p - anchors[seg]) / span - 0.12) / 0.76));
  return Math.round(keys[seg] + smooth(u) * (keys[seg + 1] - keys[seg]));
}

ScrollTrigger.create({
  trigger: stage,
  start: 'top top',
  end: 'bottom bottom',
  onRefresh: measure,
  onUpdate: (self) => {
    progress = self.progress;
    show(fromProgress(progress));
    liquid.start(); // with reduced motion the loop sleeps; wake it so the text cut follows the scroll
  },
});
measure();
show(0, false);

/* Intro: the liquid fills from empty while the headline rises. */
const heroLines = $$('.hero__title .line > span');
if (reduce) {
  liquid.setLevel(percent(S.a0, S.t0), { instant: true });
} else {
  const fill = { v: P - 17 };
  liquid.calm = true; // the water starts under the line; it is filling, not failing
  const tl = gsap.timeline({ delay: 0.15 });
  tl.to(fill, {
    v: percent(S.a0, S.t0),
    duration: 2.4,
    ease: 'power3.inOut',
    onUpdate: () => liquid.setLevel(fill.v, { kick: false }),
    onComplete: () => {
      intro = false;
      liquid.calm = false;
      const { a, t } = TL.seq[current];
      liquid.setLevel(percent(a, t), { kick: false });
    },
  })
    .from(heroLines, { yPercent: 105, duration: 1.5, ease: 'expo.out', stagger: 0.09 }, 0.35)
    .from('.hero__below > *', { y: 24, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1 }, 1.1)
    .from('.hud', { autoAlpha: 0, y: -10, duration: 1.2, ease: 'expo.out' }, 1.0)
    .from('.nav', { autoAlpha: 0, duration: 1.2, ease: 'power2.out' }, 0.2);
}

// Beat copy rises up through the water and comes to rest at its anchor (scrubbed).
const mm = gsap.matchMedia();
if (!reduce) {
  $$('.beat:not(.beat--hero)').forEach((beat) => {
    const copy = $('.beat__copy', beat);
    gsap.fromTo(copy, { y: 80 }, { y: 0, ease: 'none', scrollTrigger: { trigger: beat, start: 'top bottom', end: 'top top', scrub: true } });
    gsap.fromTo(copy, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', scrollTrigger: { trigger: beat, start: 'top bottom', end: 'top 75%', scrub: true } });
  });
  mm.add('(min-width: 768px)', () => {
    gsap.to('.hero__title, .hero__below', {
      y: -120,
      ease: 'none',
      scrollTrigger: { trigger: '.beat--hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  });
}
// On phones the HUD sits top right, in the way of everything scrolling out. So the
// hero and each beat's copy hold still at their anchor and dissolve there instead
// of sliding up under it. Holding still is not motion, so reduced motion gets it too.
mm.add('(max-width: 767px)', () => {
  const hold = (targets, trigger, f) =>
    gsap.fromTo(
      targets,
      { y: 0, autoAlpha: 1 },
      {
        y: () => innerHeight * f,
        autoAlpha: 0,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger, start: 'top top', end: () => `top -${innerHeight * f}`, scrub: true, invalidateOnRefresh: true },
      },
    );
  hold('.hero__title, .hero__below', '.beat--hero', 0.4);
  $$('.beat:not(.beat--hero) .beat__copy').forEach((copy) => hold(copy, copy.closest('.beat'), 0.3));
});

/* ---------- The minimum picker ---------- */
const rule = $('.rule');
const ruleBtn = $('#rule-btn');
const ruleChips = $('#rule-chips');
const PRESETS = [65, 70, 75, 80, 85, 90];
ruleChips.append(
  ...PRESETS.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip num';
    b.dataset.p = p;
    b.textContent = `${p}%`;
    return b;
  }),
);

function paintRule() {
  $$('.chip', ruleChips).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.p) === P)));
  const other = $('#rule-other');
  if (document.activeElement !== other) other.value = PRESETS.includes(P) ? '' : P;
}

function setRuleOpen(open) {
  rule.classList.toggle('is-open', open);
  ruleBtn.setAttribute('aria-expanded', String(open));
}

function setP(next) {
  next = clampP(next);
  if (next === P) return;
  P = next;
  S = story(P);
  TL = timeline(S);
  writeCopy();
  liquid.setTarget(P);
  liquid.setRange(P - 15, P + 25);
  current = -1;
  show(fromProgress(progress));
  paintRule();
  syncTry();
  for (const a of $$('a[href^="/dashboard/"]')) a.href = dashboardUrl('#start');
}

ruleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  paintRule();
  setRuleOpen(!rule.classList.contains('is-open'));
});
ruleChips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  setP(Number(b.dataset.p));
  setRuleOpen(false);
});
$('#rule-other').addEventListener('change', (e) => {
  const n = Math.round(Number(e.target.value));
  if (n >= 50 && n <= 95) setP(n);
  paintRule();
});
document.addEventListener('click', (e) => {
  if (!rule.contains(e.target)) setRuleOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && rule.classList.contains('is-open')) {
    setRuleOpen(false);
    ruleBtn.focus();
  }
});

/* Nav hides while reading down and returns on any scroll up. */
const nav = $('.nav');
ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate: (self) => {
    nav.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 120);
    nav.classList.toggle('is-scrolled', self.scroll() > 24);
    if (self.scroll() > innerHeight * 0.6) setRuleOpen(false);
  },
  // A reload part way down the page gets the bar straight away.
  onRefresh: (self) => nav.classList.toggle('is-scrolled', self.scroll() > 24),
});

/* ---------- Split headings: lines rise as they enter, finished well before the middle ---------- */
document.fonts.ready.then(() => {
  $$('[data-split]').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    el.classList.add('is-split');
    if (reduce) return;
    gsap.from(split.lines, {
      yPercent: 110,
      ease: 'none',
      stagger: 0.12,
      scrollTrigger: { trigger: el, start: 'top 94%', end: 'top 64%', scrub: 0.6 },
    });
  });
  ScrollTrigger.refresh();
});

/* ---------- Questions: each figure slides out of its mask, always showing its real value ---------- */
$$('.q').forEach((row) => {
  if (reduce) return;
  gsap.fromTo($('.q__mask .num', row), { yPercent: 105 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: row, start: 'top 94%', end: 'top 70%', scrub: 0.6 } });
  gsap.from($$('.q__body, .q__fig > span:last-child', row), {
    autoAlpha: 0,
    y: 16,
    ease: 'none',
    scrollTrigger: { trigger: row, start: 'top 92%', end: 'top 72%', scrub: 0.6 },
  });
});

/* ---------- Import a report: the panel fills as a file comes near ---------- */
const drop = $('#report-drop');
const dropFile = $('#report-file');
const pool = new Liquid($('.report__canvas'), { range: [0, 100], level: -4, spacing: 8, label: false, line: false });
invertText(pool, $$('#report-drop [data-invert]'));
const REST = 16;
ScrollTrigger.create({ trigger: drop, start: 'top 80%', once: true, onEnter: () => pool.setLevel(REST) });

function setLayers(el, text) {
  for (const layer of el.children) layer.textContent = text;
}
function dropState(name, title, body) {
  drop.dataset.state = name;
  setLayers($('#report-title-text'), title);
  setLayers($('#report-status'), body);
}

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
drop.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  drop.classList.add('is-over');
  pool.setLevel(64);
});
drop.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
drop.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) {
    drop.classList.remove('is-over');
    if (drop.dataset.state !== 'reading') pool.setLevel(REST);
  }
});
drop.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove('is-over');
  const files = [...e.dataTransfer.files];
  if (files.length) handleReports(files);
});
// Dropped beside the panel: do not let the browser navigate away to the file.
addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
addEventListener('drop', (e) => hasFiles(e) && e.preventDefault());

drop.addEventListener('click', () => dropFile.click());
dropFile.addEventListener('change', () => {
  const files = [...dropFile.files];
  dropFile.value = '';
  if (files.length) handleReports(files);
});

async function handleReports(files) {
  dropState('reading', files.length > 1 ? `Reading ${files.length} reports` : 'Reading your report', files.length > 1 ? 'Adding them up, course by course.' : files[0].name);
  pool.setLevel(80);
  try {
    const report = await readReportFiles(files);
    setPending(report);
    dropState('done', `Found ${plural(report.courses.length, 'course')}`, 'Opening your dashboard to check them.');
    pool.setLevel(108);
    setTimeout(() => location.assign(dashboardUrl()), reduce ? 0 : 700);
  } catch (err) {
    dropState('error', 'That did not work', err instanceof ReportError ? err.message : 'That file could not be read. Open the dashboard and paste the table instead.');
    pool.setLevel(REST);
  }
}

/* ---------- The three questions, answered for whatever is in Try it ---------- */
const plainClasses = (x) => `${x} ${x === 1 ? 'class' : 'classes'}`;
function setQ(key, text, animate) {
  for (const el of $$(`[data-q="${key}"]`)) {
    if (el.textContent === text) continue;
    el.textContent = text;
    // The big figures roll up into place when they change.
    if (animate && !reduce && key.startsWith('f')) gsap.fromTo(el, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', overwrite: 'auto' });
  }
}

let questionsShown = false;
function updateQuestions(a, t, p, left) {
  const animate = questionsShown;
  questionsShown = true;
  const st = status(a, t, p);
  const k = st === 'safe' || st === 'edge' ? canMiss(a, t, p) : 0;
  // 1. How many can I miss?
  if (st === 'empty') setQ('q1', 'Put in how many classes were held to see this.', animate);
  else if (st === 'below') setQ('q1', `At ${a} of ${t} you are already below ${p}%, so there is nothing to spare. The next answer is the way back.`, animate);
  else if (st === 'edge') setQ('q1', `At ${a} of ${t} you are right on the line for ${p}%. Missing even one more class takes you below it.`, animate);
  else setQ('q1', `With ${a} of ${t} attended and ${/^8/.test(p) ? 'an' : 'a'} ${p}% minimum, you can miss ${k} more before you drop below the line.`, animate);
  setQ('f1', String(k), animate);
  setQ('c1', k === 1 ? 'class to spare' : 'classes to spare', animate);

  // 2. How do I get back above the line?
  if (st === 'below') {
    const n = mustAttend(a, t, p);
    setQ('q2', n === 1 ? `At ${a} of ${t}, the next class you attend takes you back to ${p}%.` : `At ${a} of ${t} you need ${n} classes in a row, without a single miss, to get back to ${p}%.`, animate);
    setQ('f2', String(n), animate);
    setQ('c2', n === 1 ? 'class to get back' : 'in a row', animate);
  } else if (st === 'empty') {
    setQ('q2', 'Put in how many classes were held to see this.', animate);
    setQ('f2', '0', animate);
    setQ('c2', 'in a row', animate);
  } else {
    // Missing twice what you can spare shows how much more the way back costs.
    const over = Math.max(1, 2 * k);
    const m = mustAttend(a, t + over, p);
    const back = m === 1 ? 'the next class' : `${m} classes in a row`;
    setQ(
      'q2',
      k ? `You are above the line now. Miss ${over}, twice what you can spare, and you would need ${back} to get back.` : `You are right on the line. Miss even one and you would need ${back} to get back.`,
      animate,
    );
    setQ('f2', String(m), animate);
    setQ('c2', `${m === 1 ? 'class to get back' : 'in a row'}, after missing ${over}`, animate);
  }

  // 3. Will I end the semester above it?
  const f = forecast(a, t, p, left);
  if (!left) {
    setQ('q3', t ? `With no classes left, you finish at ${fmt(percent(a, t))}.` : 'Put in how many classes are still to come this semester.', animate);
    setQ('f3', '0', animate);
    setQ('c3', 'classes still to come', animate);
  } else if (!f.reachable) {
    setQ('q3', `Even attending all ${left} classes still to come, you would finish at ${fmt(f.best)}, short of ${p}%.`, animate);
    setQ('f3', '0', animate);
    setQ('c3', `of the ${left} still to come you can skip`, animate);
  } else {
    const skip = f.maxSkip;
    const verdict =
      skip === left ? `you could skip all ${left} and still finish at ${p}% or above` : skip === 0 ? `you must attend every one of them to finish at ${p}%` : `you can skip ${skip} of them and still finish at ${p}% or above`;
    setQ('q3', `With ${plainClasses(left)} still to come, ${verdict}.`, animate);
    setQ('f3', String(skip), animate);
    setQ('c3', `of the ${left} still to come you can skip`, animate);
  }
}

/* ---------- Try it: a live calculator in its own vessel ---------- */
const vessel = new Liquid($('.vessel__canvas'), { range: [40, 100], level: 38, spacing: 7, target: P });
vessel.setLevel(null, { instant: true }); // empty until it scrolls into view
invertText(vessel, $$('.vessel [data-invert]'));
const tryA = $('#try-a');
const tryT = $('#try-t');
const tryL = $('#try-l');
const trySeg = $('#try-seg');
const read = {
  pre: $$('.vessel__pre'),
  big: $$('.vessel__big'),
  post: $$('.vessel__post'),
  pct: $$('.vessel__pct-text'),
};
let tryLive = false;
let tryTouched = false; // until someone edits the numbers, they follow the example course
let lastBig = null;

const getP = () => Number($('input[name="try-p"]:checked', trySeg)?.value || P);

function syncTry() {
  if (!tryTouched) {
    tryA.value = S.a0;
    tryT.value = S.t0;
  }
  const values = [...new Set([...PRESETS, P])].sort((x, y) => x - y);
  trySeg.replaceChildren(
    ...values.map((p) => {
      const lab = document.createElement('label');
      lab.innerHTML = `<input type="radio" class="sr-only" name="try-p" value="${p}" /><span class="chip num">${p}%</span>`;
      lab.firstChild.checked = p === P;
      return lab;
    }),
  );
  // Before the vessel fills, a new minimum still re-answers the questions.
  if (tryLive) updateTry();
  else updateQuestions(Number(tryA.value), Number(tryT.value), getP(), Number(tryL.value));
}
syncTry();

function updateTry(fromField) {
  tryLive = true;
  let a = Math.max(0, Math.floor(Number(tryA.value) || 0));
  let t = Math.max(0, Math.floor(Number(tryT.value) || 0));
  // Keep attended within held, moving whichever field the person did not touch.
  if (a > t) fromField === 't' ? (a = t) : (t = a);
  if (String(a) !== tryA.value && document.activeElement !== tryA) tryA.value = a;
  if (String(t) !== tryT.value && document.activeElement !== tryT) tryT.value = t;
  const p = getP();
  const s = sentence(a, t, p);
  read.pre.forEach((n) => (n.textContent = s.pre));
  read.post.forEach((n) => (n.textContent = s.post));
  read.pct.forEach((n) => (n.textContent = `${fmt(percent(a, t))} now, ${p}% needed`));
  if (s.big !== lastBig) {
    read.big.forEach((n) => (n.textContent = s.big));
    if (lastBig !== null && !reduce) gsap.fromTo(read.big, { yPercent: 18, autoAlpha: 0.4 }, { yPercent: 0, autoAlpha: 1, duration: 0.7, ease: 'expo.out' });
    lastBig = s.big;
  }
  vessel.setTarget(p);
  vessel.setLevel(percent(a, t));
  updateQuestions(a, t, p, Math.max(0, Math.floor(Number(tryL.value) || 0)));
}

$$('[data-step]').forEach((b) =>
  b.addEventListener('click', () => {
    const [field, d] = b.dataset.step.split(':');
    const input = { a: tryA, t: tryT, l: tryL }[field];
    input.value = Math.max(0, (Number(input.value) || 0) + Number(d));
    tryTouched = true;
    updateTry(field);
  }),
);
tryA.addEventListener('input', () => {
  tryTouched = true;
  updateTry('a');
});
tryT.addEventListener('input', () => {
  tryTouched = true;
  updateTry('t');
});
tryL.addEventListener('input', () => updateTry('l'));
[tryA, tryT].forEach((el) => el.addEventListener('blur', () => updateTry(el === tryA ? 'a' : 't')));
trySeg.addEventListener('change', () => updateTry());
// Fill the vessel when it first scrolls into view.
ScrollTrigger.create({ trigger: '.vessel', start: 'top 75%', once: true, onEnter: () => updateTry() });

/* ---------- Maths: the formulas light up as you read down, done before they reach the middle ---------- */
$$('[data-chars]').forEach((p) => {
  const text = p.textContent;
  p.setAttribute('aria-label', text);
  p.innerHTML = [...text].map((c) => `<span class="char" aria-hidden="true">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  if (reduce) return gsap.set($$('.char', p), { opacity: 1 });
  gsap.to($$('.char', p), {
    opacity: 1,
    ease: 'none',
    stagger: 0.05,
    scrollTrigger: { trigger: p, start: 'top 92%', end: 'top 64%', scrub: 0.5 },
  });
});

/* ---------- End: the wordmark fills to the line as the page runs out ---------- */
const mark = $('.end__mark');
if (reduce) {
  mark.style.setProperty('--fill-top', '28%');
  mark.style.setProperty('--line-s', 1);
} else {
  const st = { fill: 100, line: 0 };
  gsap.to(st, {
    fill: 28,
    line: 1,
    ease: 'none',
    onUpdate: () => {
      mark.style.setProperty('--fill-top', `${st.fill}%`);
      mark.style.setProperty('--line-s', st.line);
    },
    scrollTrigger: { trigger: mark, start: 'top 95%', end: 'max', scrub: 0.8 },
  });
}
