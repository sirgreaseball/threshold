# Threshold: development log

This is the working log for the "Playing with AI" project. It records what was built, in what order, what went wrong, and what the AI tool did versus what I decided. It is the raw material for the Experimentation and Analysis sections of the report.

- **AI tool:** Claude Code (Anthropic's agentic coding tool, running the Claude Opus 5.5 model) inside the Claude desktop app.
- **Date:** 10 October 2026
- **Project:** Threshold, an attendance planner. For every course it tells a student how many classes they can miss before their college's minimum (75%, 80% or anything else), how many they must attend in a row to recover, and what is still possible before the last class. It reads the attendance report PDF a college portal already gives out.
- **Stack:** Vite 6, plain JavaScript (no framework), GSAP 3.15 with ScrollTrigger and SplitText, Lenis 1.3 for smooth scrolling, Canvas 2D for the liquid effects, pdf.js 4.10 (loaded only when a PDF is imported), Geist and Geist Mono fonts, Phosphor icons. Data is stored in the browser's localStorage only.
- **Size:** about 6,600 lines across 21 files after round 2 (about 3,000 after round 1). 19 tests cover the maths, the report parser, semester planning and the landing story.

---

## 1. Choosing the project and the name

I asked Claude Code for a project idea that fits the assignment rubric. It suggested an attendance calculator ("Can I Bunk?") because every student understands the 75% rule, it is small enough to finish, and its maths has edge cases where an AI is likely to slip. That last point mattered for the analysis section.

I asked for other name options. It gave three rounds of names grouped by tone (roll-call words, maths words, cheeky words, Indian college slang) and warned against "Proxy" because it implies cheating. I picked **Threshold**.

**What I decided:** the project, the name, and the design brief: premium, Awwwards-level, inspired by sites like lusion.co, but visibly different from my earlier OS dashboard ("sandbox"), which already used a dark WebGL particle look.

## 2. The maths first, with tests

Before any UI, Claude Code wrote the core maths (`src/core.js`):

- `canMiss(a, t, P)`: the largest k with a / (t + k) ≥ P%
- `mustAttend(a, t, P)`: the smallest n with (a + n) / (t + n) ≥ P%
- `forecast(...)`: how many of the remaining lectures can be skipped before end-sem
- `status(...)`: empty, safe, on the line, or below

**Key decision, made by the AI and checked by experiment:** it kept every calculation in whole numbers. The target is stored as an integer percent (75, not 0.75), so `100 * attended` and `target * conducted` are exact integers.

To show this was not just caution, it compared the usual decimal formula against the exact integer one for every combination of up to 80 lectures (3,320 cases per target):

| Target | Cases where the decimal formula is wrong |
|---|---|
| 60% | 47 |
| 65% | 196 |
| 70% | 0 |
| 75% | 0 |
| 80% | **2,614 of 3,320** |
| 85% | 22 |

The decimal version happens to be right at 75%, which is why most online calculators look fine. At 80% it is wrong in most cases, because `1 - 0.8` in floating point is `0.19999999999999996`. Example: with 3 of 5 attended and an 80% target, the decimal formula says attend 6 in a row; the real answer is 5.

The tests (`tests/core.test.js`) check both functions against a slow brute-force counter for 8 targets and every case up to 80 lectures. They also cover the edge cases: no lectures yet, exactly at 75%, a 100% target, and attended greater than conducted in saved data. All 7 tests pass.

**Small snag:** `node --test tests/` failed on Node 24 with only "test failed" and no detail. Pointing it at `tests/*.test.js` fixed it.

## 3. Design direction

Claude Code proposed the concept and I approved it:

- **Motif:** the page is a vessel. Cobalt liquid sits at your attendance level, and a dashed line marks 75%. The visual metaphor is literally the product's name.
- **Palette:** cool off-white paper, near-black ink, one accent (cobalt), and vermilion used only for "below the line". Light and dark modes both follow the system setting.
- **Type:** Geist for text and large figures, Geist Mono for small numeric labels.
- **Motion:** every scroll animation is scrubbed to the scroll position (nothing plays on a timer), with Lenis smoothing. Reduced-motion settings turn all of it off.

## 4. The liquid engine

`src/liquid.js` simulates the surface as a row of springs (a 1D height field). Each column springs back to rest and pulls on its neighbours, so a poke travels across as a real ripple and then settles. The mean level follows its target on a slightly under-damped spring, which gives a small slosh whenever attendance changes.

- Moving the pointer near the surface makes waves. Clicking makes a splash.
- **Text inversion:** headlines over the liquid are drawn twice, once in ink and once in white. Both layers are cut along the actual wave surface with CSS `clip-path` polygons on every frame. Text is dark above the water and white below it, and the cut follows the waves.

## 5. The landing page

- **Hero:** the liquid fills from empty to 84.2% (32 of 38) while the headline "Stay above the line." rises. The 75% line sits between the headline and the subtitle.
- **Scroll story (one subject's semester):**
  1. Four skips take you to 76.2% (32 of 42), one class from the line.
  2. Four more take you under, to 69.6% (32 of 46). You now need 10 in a row.
  3. Ten classes attended bring you back to exactly 75% (42 of 56).
  
  Every number on screen comes from `core.js`, and each skip or attended class makes its own ripple.
- **Three questions:** big figures count up with scroll.
- **Try it:** a live calculator in its own small vessel.
- **The maths:** the formulas light up character by character, with the 80% finding above.
- **Footer:** a giant wordmark that fills to the threshold.

## 6. The planner app (`/app/`)

- An overall attendance figure and a vessel showing it.
- A last-teaching-day setting.
- One row per subject: an editable name, a meter with a tick at the target, attended and held counts, and the next step ("Miss up to 3 more", "Attend the next 7 in a row").
- Present and Absent buttons.
- A drawer with lectures per week and the end-sem forecast.
- One-step undo for every log action.
- A sample semester, an empty state, a duplicate-name check, and sync across browser tabs.

## 7. Problems found and fixed

Most of these were found by the AI itself, through screenshots and automated browser runs rather than by reading code. That is worth noting in the analysis: its first drafts had real bugs, and its testing loop is what caught them.

1. **Headline sat on top of the subtitle.** A generic `.invert-host { position: relative }` rule appeared later in the CSS than `.hero__title { position: absolute }` and overrode it. Fixed by giving the generic rule zero specificity with `:where()`.
2. **Headline still sat on the 75% line instead of above it.** The shared `.beat` rule set `min-height: 115dvh`, overriding the hero's 100dvh, so the headline was anchored to a taller box. The AI found this by measuring the element's computed `bottom` against its real position in the browser.
3. **Scroll-story copy drifted through the liquid at the wrong moments** and overlapped the live readout. The anchors were redesigned so each beat's text comes to rest in the dry band above the surface, and all beat copy moved to the left column.
4. **The fixed nav collided with text scrolling under it.** The nav now slides away while you scroll down and comes back on any scroll up.
5. **The demo's percentage label lost its colour inversion.** Setting `textContent` on the element wiped out the duplicated text layers. Fixed by updating an inner span.
6. **Split headings clipped descenders** ("subject" lost the tail of its j). Fixed with padding on SplitText's mask wrappers.
7. **Adding a subject created a second subject called "7".** After Add, focus should jump to the new row's count field. But the row was `visibility: hidden` during its entrance animation, so focus stayed in the Add box. Typing "7" and pressing Enter then added a subject named "7". An automated test caught it. Fixed by animating opacity instead of visibility.
8. **Typing into a count appended to the old value** ("0" became "011"). The fields now select their contents on focus.
9. **A saved-data bug caught in review before it ran:** the object spread order in `store.js` would have let a missing `id` in old saved data overwrite the freshly generated one.
10. **Testing environment:**
    - The in-app browser pane throttles animation frames to about one per second when hidden, which made every animation look broken.
    - GSAP's lag smoothing then replayed the number tweens in slow motion.
    - Fix: verification moved to headless Chrome with throttling turned off, and the app now uses `gsap.ticker.lagSmoothing(0)`, so a background tab finishes its tweens instead of crawling.
11. **Dev server:** running `npx vite` from the parent folder tried to download a different Vite version (8). The launcher now calls the project's own Vite binary.

## 8. Verification

The final check ran on 10 October 2026, against both the dev server and the production build, using headless Chrome (playwright-core with the system Chrome).

- Landing page at 1440×900 (light and dark) and 390×844 (phone): no console errors, no horizontal scroll, and correct readouts at every story beat.
- Planner on desktop, phone and dark mode:
  - Load sample, mark present, open the drawer.
  - Add a subject, then type its counts with the keyboard.
  - Undo, the duplicate check, and saving to storage.
  - The forecast text matched hand calculations, for example "27 of 37 with 14 left: can skip 2" (needs 39 of 51).
- Reduced motion: the page renders statically and the readout still follows the scroll.
- `npm test`: 7 of 7 pass. `npm run build`: succeeds. The landing page JavaScript is about 29 kB gzipped.

## 9. Notes for the analysis section

**Strong:**
- It planned the maths before the UI and ran its own experiment to justify a design choice.
- It wrote a brute-force test oracle without being asked.
- It caught most of its own layout bugs by taking screenshots and measuring the DOM.
- It kept a consistent design system across two pages.

**Weak:**
- First drafts had several CSS cascade bugs that only showed up visually.
- It cannot judge motion "feel" from still screenshots alone.
- A throttled preview environment briefly misled it into thinking animations were broken.
- It needed my taste calls on name and direction.

**My role:**
- Product decisions, naming, design direction, and what to keep or cut.
- Reviewing the result in my own browser.
- Deploying it.

---

# Round 2: polish, real reports, any college

After round 1 I gave Claude Code a second, much broader brief:
- polish everything;
- fix animations that "start off and stop at weird points";
- add a light and dark theme toggle whose animation starts at the button and fills the screen;
- support any minimum (my school, STME, needs 80%; others need 70%);
- read the attendance sheet we actually get from the portal;
- work on phones;
- work for any school and any subject;
- estimate classes per subject from credits, "do research on this".

I attached my real attendance report (a two-page PDF from the NMIMS portal).

## 10. What the real report looks like

The PDF lists one row per course *component*. For each course it shows theory (THEO) and practical (PRAC), with classes held and attended, plus one combined percentage per course. Its footer states the rule: "80% attendance in each course". Claude Code ran pdf.js on it in Node and confirmed the extracted text was clean and in reading order. It also confirmed that every printed percentage equals (theory attended + practical attended) / (theory held + practical held). For example, Computer Networks is (21 + 20) / (22 + 22) = 93.18%.

That changed the data model. A course is now a list of parts (theory, practical, tutorial, studio), and the minimum applies to the course total, the way the report counts it. A setting switches to "each type on its own" for colleges that check theory and practical separately, with an optional separate lab minimum. Any course can also have its own minimum.

## 11. Research: credits and class counts

My guess was "3 credits have 60 hours, 4 have more, 2 have 30, 1 has 15". Claude Code looked up the Indian credit definitions:

- **AICTE model curriculum:** 1 hour of lecture a week = 1 credit, 1 hour of tutorial a week = 1 credit, 2 hours of practical a week = 1 credit (one practical hour is 0.5 credit).
- **UGC framework, as universities implement it:**
  - 1 theory credit = 15 hours of teaching over a semester of about 15 weeks;
  - 1 practicum credit = 30 hours;
  - a 4-credit course with 3 lecture credits and 1 practicum credit = 45 + 30 hours.
- **Attendance rules differ:**
  - the UGC baseline is 75%;
  - VTU asks for 85% per subject and Anna University for 75%, according to secondary sources;
  - my own report states 80% per course.

  So the minimum has to be a setting, not a constant.

This explains my guess. A 3-credit course with a lab is usually 2 lecture credits plus 1 lab credit, which is 2 lecture hours and 2 lab hours a week: 30 + 30 = 60 hours. My report fits that exactly. Computer Networks had 22 theory and 22 practical classes by week 12, about 2 of each a week.

Credits alone do not say how the hours split between lecture and lab, so the planner gives four ways to estimate the classes still to come:
1. **Pace so far (default):** classes held ÷ weeks elapsed × weeks left. It needs only the semester dates, and the report supplies the start date and the "as of" date.
2. **Credits:** applies the AICTE rule. Each lab part takes one credit (2 classes a week), and theory gets the rest.
3. **Per week:** typed in for each part.
4. **Planned total:** for colleges that publish a session plan.

All four feed the same whole-number forecast: "About 22 classes left. Skip up to 10 and you still finish at 80% or above."

Sources used:
- [AICTE model curriculum, first-year UG](https://aicte.gov.in/sites/default/files/model%20curriculum%20for%201st%20year%20ug.compressed.pdf)
- [Nagaland University FYUGP guidelines](https://nagalanduniversity.ac.in/files/nep2020/2023-FYUGP-GuidelinesNU.pdf)
- [VTU attendance (third-party summary)](https://onlineresult.in/tools/attendance-calculator/vtu)
- [UGC 75% guideline (summary)](https://bhattandjoshiassociates.com/ugc-guidelines-on-attendance-and-gujarat-universitys-policy/)

## 12. Reading reports from any college

`src/parse.js` has two passes:
- **Typed rows:** anchored on the type word and the two counts after it (`THEO 22 21`). The text before each row holds the serial number, the course name and the division name.
  - The parser finds the expected serial number, which skips page headers, the student's details and text spilled across a page break.
  - It cuts the course name where the division name starts repeating it. "COMPUTER NETWORKS COMPUTER NETWORKST4 CSDS SEM-V" becomes "Computer Networks". Abbreviated repeats match too: "FIN INSTITUTION, MRKTS" matches "FINANCIAL INSTITUTIONS, MARKETS".
- **Plain lines:** for anything else, such as a name followed by two whole numbers, or tab- and comma-separated spreadsheet pastes.

The larger of the two counts is always "held", so column order never matters. The parser also finds the minimum ("requirement of 80% attendance") and the report dates. It never stores the student's name or ID.

On my real report it found all 8 courses (13 rows), the 80% rule and the dates. Every percentage matched the printed one. The committed tests use a made-up report in the same format, because the real one has my personal details.

## 13. The new pieces

- **Planner:**
  - Import sheet with a drop zone, a file picker and a paste box. A review step lets me untick or rename courses, and offers to "update matching courses and add new ones" or replace everything.
  - A "your college's rule" sheet.
  - A summary chart with one liquid tank per course against the minimum line. A tank turns vermilion when its course is below the line, and a tap ripples it.
  - Each course row expands to its parts (Present and Absent per part, editable counts), its plan and its own minimum.
  - Undo for every change.
- **Landing page:**
  - The story recalculates for any minimum from 50% to 95%. The copy is generated from `src/story.js`, and a test checks the story is true for all 46 values.
  - A "Your minimum" picker in the live readout.
  - A "Start from the sheet you already get" section whose panel fills with liquid as a file is dragged over it. Dropping the PDF parses it and hands it to the planner's review step.
- **Theme toggle:** built on the View Transitions API. The new theme floods out from the button as a wobbling blob of liquid, and the canvases recolour live underneath. Reduced motion switches instantly.
- **Phones:**
  - Hero heights use svh, so nothing jumps when the address bar hides.
  - Fields are at least 16px on touch screens, so iOS does not zoom.
  - Hover styles apply only to real pointers, taps are instant (no 300ms delay), controls are not text-selectable, and safe areas are respected.
  - Sheets open as bottom sheets.
- **Installable:** a web app manifest and icons, so the planner can be added to a home screen. There is also a social preview image.

## 14. Problems found and fixed in round 2

1. **"Animations stop at weird points."** Claude Code went through each scroll animation:
   - The count-up figures in "Three questions" froze on wrong numbers when you stopped scrolling ("3" instead of "4"). They now slide out of a mask and always show the real value.
   - The formula reveal and the heading reveals now finish before the element reaches the middle of the screen, where people stop to read.
   - Split headings flashed unsplit, then hid, then rose. They now stay hidden until they are split.
   - The readout lagged its spring and showed "79.9%" next to copy that said "exactly 80%". It now snaps once it is within 0.06 of the target.
2. **The minimum picker could not be clicked.** The story text layer sits over the sticky stage, and a sticky element is its own stacking context, so no z-index can lift the readout above it. Fix: the text layer passes clicks through and only its links take them.
3. **Logging one class skewed every forecast.** Marking Present moved the shared "counts as of" date to today. That told the pace estimate that every other course had six more days of classes it had not seen. Fixed: logging no longer moves that date.
4. **Rounding.** The chart showed 86% and the row showed 87.0% for the same course (86.96%). Every percentage is now truncated, never rounded up, so 79.96% can never read as 80.0%.
5. **The `hidden` attribute did not hide.** Components that set their own `display` beat it. The "16 weeks" suggestion stayed visible after a date was set, and so did a "your planner already has courses" note on an empty planner. One global rule fixes both.
6. **A pasted list read as a report.** A plain paste containing "Chemistry Lab 18 20" matched the typed-row pattern once ("Lab 18 20"), so the rest of the list was ignored. Both passes now run and the one that finds more rows wins. A test caught this on the first run.
7. **Dev server reload.** The first PDF import in development made Vite reload the page halfway through. Pre-bundling pdf.js fixed it.
8. **Phone layout.** The readout overlapped the story text, and the date fields overflowed. Both fixed after screenshots at 390px.
9. **Page-to-page transitions, removed.** I had also added a cross-fade between the landing page and the planner. Chrome aborted the one into the landing page with "ViewTransition opt-in disabled".
   - Claude Code narrowed it down with about a dozen minimal builds. It is not Lenis, ScrollTrigger, SplitText or any single element. It needs the landing page's stage markup together with any external module script. A late style change alone did not trigger it.
   - With no root cause and a flaky console error, the fade was removed. The theme flood uses the same API within one page and is unaffected.

## 15. Verification (round 2)

- **Unit tests:** `npm test` passes 19 tests:
  - maths against brute force;
  - the parser on a SAP-style report, on spreadsheet pastes and on rule phrasing;
  - credits, pace, weekly and total estimates;
  - separate minimums;
  - the landing story for every minimum from 50% to 95%.
- **Headless Chrome on the production build**, at 1440×900 and 390×844, in light and dark, and with reduced motion. Zero console errors.
  - Landing: the intro, switching the minimum to 80% (every story number checked), each story beat, each section, and the theme flood caught mid-way.
  - Then dropping my real PDF on the landing page, which opens the planner's review with "Found 8 courses with 13 rows of classes".
  - Planner: importing the real PDF, setting the end date, opening a course, logging a class, switching to credits (3 credits gives "About 25 classes left. Skip up to 6"), changing the rule to 85% ("4 of 8 courses are below 85%"), and the theme flood.
- **Not verified:** a real phone. Emulation cannot show sticky hover, the software keyboard or real touch feel. Those need a check on an actual device.

## 16. More notes for the analysis section

- **Research turned into a model.** The tool did not stop at quoting "1 credit = 15 hours". It checked the rule against my own report's numbers, explained why my guess of 60 hours for a 3-credit course was right, and then designed around the part credits cannot tell you (the lecture and lab split).
- **Real data beat assumptions.** The NMIMS sheet changed the whole data model (courses with parts, combined percentages). A generic attendance calculator would have got this wrong.
- **It still ships bugs, and its own testing catches most of them.** Three of the round-2 bugs were logic bugs, not visual ones: the shared date, the rounding mismatch and the paste misdetection. All three were caught by reading its own outputs critically or by a test, not by me.
- **Knowing when to stop.** It spent a long, systematic bisect on a browser quirk, then removed the feature rather than ship a flaky one, and recorded the dead end honestly here.

---

# Round 3: launch polish and deploy

My third brief:
- fix a "very weird animation" on the splash page's "Open planner" button on Windows;
- add an all-rights-reserved line to both pages;
- show an import prompt as soon as the planner opens, with a close button and "Browse files";
- replace "miss up to" and "skip up to" with plain numbers on the collapsed rows: classes left, how many you must attend, how many you can skip;
- make things react to the cursor the way lusion.co does;
- make a logo that is visible in the browser tab, with the tab reading "Threshold";
- pick a cool name that is actually free, and deploy on Vercel.

## 17. What the weird animation was

Claude Code recorded the intro and the hover frame by frame in Chrome on Windows (at 125% display scaling) and found two things:
- **The hover.** It slid a cobalt fill up through the dark pill, leaving a dark crescent across the top. On the hero, the pill then turned cobalt on cobalt water and all but vanished. Buttons now cross-fade to their hover colour, with a soft glow that follows the cursor inside the pill. The hero button turns paper on hover, so it can never disappear into the water.
- **The intro.** The 75% line flashed vermilion for the first second, because the water starts below the line while it fills. The line now stays neutral until the intro finishes.

## 18. Changes

- **Plain numbers.** Each collapsed course row shows three numbers: **Classes left**, **You must attend** and **You can skip**. Must attend + can skip = classes left. A short flag such as "below 80% right now" appears only when it matters. Without an end date the planner assumes 16 weeks from the start, shows that date as provisional, and asks for the real one.
- **Welcome import prompt.** "Open planner" on the landing page opens the planner with "Import your attendance report?", a drop zone, "Browse files" and a close button. It only appears while the planner is empty and does not come back on reload.
- **Cursor-aware details**, all mouse-only and all off with reduced motion:
  - Buttons, the theme toggle, the rule pill and the chevrons lean toward a nearby cursor and spring back.
  - A soft light follows the cursor across course rows, the tank panel and the drop zone.
  - Row meters thicken and the three numbers lift one after another.
  - In the tank chart, tanks near the cursor swell like a dock, their labels grow with them, and the water lifts toward the pointer, then settles with a ripple.
- **Logo.** An ink tile with cobalt water and a white threshold line through it, as SVG plus PNGs at 32, 180, 192 and 512 px and a maskable icon. It was checked on light and dark tab strips at 16 px. Both pages are now titled "Threshold".
- **Footer.** "© 2026 Dhruv Sonar. All rights reserved." on both pages.

## 19. Name and deploy

- **Name.** Claude Code checked about 45 vercel.app names over HTTP (a free name answers 404 DEPLOYMENT_NOT_FOUND).
  - Taken: threshold, thresh, getthreshold, usethreshold, trythreshold, abovetheline, waterline, meniscus and most other obvious names.
  - Free: stayabove, abovethreshold, onthreshold, keepabove, skipsafe and a few more.
  - Chosen: **stayabove**, which echoes the headline "Stay above the line".
- **Code.** Pushed to a private GitHub repo, sirgreaseball/threshold.
- **Vercel.** A Vercel project, stayabove, builds it from the repo.
- **Protection setting.** The new project came with Vercel Authentication on every URL except custom domains, which would have put the public site behind a Vercel login. It was switched to standard protection: the public domain is open, and preview builds stay private.

