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

# After launch: feedback rounds

Each note below came after the site was live. Each one shipped as its own release (see CHANGELOG.md).

## 20. Feedback: the hover effect overshot

My first look at the live site found a problem: with the cursor near the top-right buttons, "Import" slid into the theme toggle. Each magnetic element could lean toward the cursor by about a third of the distance, which is up to about 15 px. Two neighbours 10 px apart leaned into each other.

The fix:
- Each lean is capped at 6% of the element's short side, which is 1.5 to 3 px.
- The tank swell went from 34% to 16%, and labels grow half as much as their tanks.
- The row lifts went from 3 px to 2 px.
- The button clusters got 12 px gaps.

An automated sweep moved the cursor around every magnetic element and checked every pair for overlap. The result: no overlaps; the largest lean is 2.4 px; the tightest pair keeps 7.4 px of space, where before they touched.

## 21. Feedback: make the splash page make sense

My next note: the readout ("84.2%, 32 of 38 attended, you can miss 4 more") reads like someone's personal data to a first-time visitor who has entered nothing. The question figures ("4 classes to spare", "13 in a row", "9 of 30") came out of nowhere.

What changed:
- **The readout is labelled "Example course".** It now shows a track with one mark per class in the story: outlined for missed, filled for attended, faint for still to come. A small key explains the marks. The track fills in as you scroll, so it doubles as the story's progress bar.
- **Readout wording.** "4 classes to spare", "No classes to spare", "Attend the next 10 in a row", "Back at 75%".
- **The story copy introduces the example.** "Take one course: 32 of 38 classes attended, 84.2%..." Every number is generated for whichever minimum is chosen.
- **"Try it on one course" moved up** to sit right after the story. Its numbers start from the example course until you edit them.
- **The three questions now answer for that same example**, with the numbers in the sentence. For instance, "From 32 of 38, with 30 classes left, the example can skip 11 and still finish at 75%". The third question became "Will I end the semester above it?"

## 22. Feedback: answers that follow your numbers, and a nav that stays readable

The note: the three answers still used the example course, not what was typed into Try it. And after scrolling down and back up, the returning nav's logo sat on top of the headline and was hard to see.

What changed:
- **Try it has a third number, "Still to come this semester" (30 by default).**
  - The three questions are now answered for whatever is in Try it. They update on every keystroke, stepper click or change of minimum.
  - They say how many classes you can miss, how many in a row you would need, and how many of the classes still to come you can skip. Below the line, the second one is the way back. Above it, it is what missing twice your spare would cost.
  - Each answer covers its edge cases: right on the line, below it, a finish that is out of reach, and no classes left.
  - A changed figure rolls up into place. That animation uses y and opacity, so it never fights the scroll-scrubbed yPercent reveal on the same element.
- **Question 2's scenario changed** from "miss one more than you can spare" to "miss twice what you can spare". With live numbers, missing one too many nearly always costs only one class to recover ("you would need the next class"), which says little. Twice the spare shows how much more the way back costs. Missing 8 means 10 in a row at 75%, and 13 at 80%.
- **The nav gets a frosted bar once the page has scrolled 24 px.**
  - The bar is the paper colour at 72%, with an 18 px backdrop blur and a hairline border.
  - It fades in over 0.5 s, and it also appears after a reload part way down the page.
  - At the very top the nav stays transparent, as before.
  - The planner's bar was already frosted, so both pages now match.
- **Text no longer scrolls under the HUD.** While checking the nav, a sweep found the same kind of problem at the HUD. On phones, tablets and small laptops (up to about 1180 px wide), the hero and the story copy slid up underneath the fixed readout.
  - From 768 px wide, the copy stops 40 px short of the HUD, which is 240 px wide. Its width is capped with a calc, and tablets drop the stagger of the second and third beats.
  - On phones, the hero and each beat's copy hold still at their anchor and dissolve there, rather than sliding up under the readout. The beat padding keeps the anchor below the HUD on short phones too: 300 px, or 34svh if that is more. Holding still is not motion, so reduced motion gets this as well.
  - Screens 1366 px and wider are unchanged.

Verification:
- 19 tests pass.
- A headless check typed into Try it and switched the minimum. Every answer matched the maths for:
  - the example at 75% and 80%;
  - a course below the line (20 of 44);
  - 60 classes to come;
  - a safe course;
  - stepper clicks.
- Zero console errors.
- An overlap sweep ran at 19 scroll positions on 7 screen sizes, from 360x640 to 1440x900. It found zero text-over-HUD collisions.
- The landing regression and the hover sweep still pass, with 0 overlaps and a largest lean of 2.4 px.

## 23. Feedback: drop the credit line, and a proper repository

My next note:
- remove "Built with Claude Code" from the bottom of the site, and keep only "Your data stays in the browser, nothing uploaded.";
- push the project to GitHub with a really good README;
- keep the dev log and the commits in step with the changes;
- have no collaborators on the repository except me.

What changed:
- **Footers.** Both pages now end with the copyright line and "Your data stays in the browser, nothing uploaded." The planner's footer used to say "Saved in this browser only. Nothing is sent anywhere." It now matches the landing page word for word.
- **README.** The short note became a full project page:
  - light and dark screenshots, which swap with GitHub's theme through `<picture>`;
  - the three answers, with a worked example;
  - the maths as rendered formulas, and the table of where the decimal formula goes wrong;
  - the import pipeline as a Mermaid diagram;
  - the rules and credits model;
  - the planner, the landing story and phones;
  - design notes, the stack and the page weight;
  - the project layout, how to run it and the tests;
  - privacy, how it was made, and the license.
- **Screenshots.**
  - A headless Chrome script took them at 2x from the dev server.
  - They use only the built-in sample semester, so no real attendance data is in the repository.
  - The script waited for the "Loaded a sample semester" toast to clear, and moved focus off the import prompt's close button, so neither shows.
  - They were resized to 1600 px wide, given rounded corners and saved to `docs/media/`, about 3 MB in all.
- **package.json** is now `private` and `UNLICENSED`, with an author. That matches "All rights reserved". It used to say ISC, a permissive open-source license.
- **CHANGELOG.md** lists every release since launch with its commits and its dev log section. It ends with a short routine for adding the next release.
- **Tags.** The git history is tagged with the release versions:
  - v1.0.0: launch;
  - v1.0.1: the hover fix;
  - v1.1.0: the landing page that explains itself;
  - v1.2.0: answers that follow Try it, the frosted nav, and text kept clear of the readout;
  - v1.2.1: this release.

Collaborators, checked through the GitHub API before pushing:
- The repository is private.
- Its only collaborator is the owner (admin), and there are no pending invitations.
- Every commit is authored by me, with no co-author trailers, so GitHub lists a single contributor.
- Vercel's GitHub app can read the repository, because it deploys every push. It is an app installation, not a collaborator.

## 24. Feedback: every school's report, logic that holds, nothing kept

My next note, after trying a School of Law report:
- the import did not work for other schools' reports. Courses came out as "TUT" and similar instead of the subject's name;
- the attendance was not worked out as intended;
- switching the minimum on the dashboard from 75 to 70 or 80 did not seem to change the numbers;
- move the planner off `/app`, rename it, and give "Open planner" a better label;
- store nothing locally, and stay open to whatever report gets uploaded: law, pharmacy, commerce, business management;
- try a different way of reading the PDF;
- then commit and push, with me as the only contributor, and make the repository public.

What was wrong:
- **The reader.** The old parser read the PDF's text in the order pdf.js returns it and anchored each row on its type word (THEO, PRAC, TUT, STUDIO). The law report types its tutorials TUTL, which it did not know. Tutorial rows were swallowed into the next row's text, so courses came out named "Tutl", "Al" or "Of", with counts from the wrong rows.
- **Merging.** When the dashboard already had courses, the review step defaulted to "Update matching courses and add new ones". A second report mixed with the first one's courses.
- **Rows without dates** showed nothing under "You must attend" and "You can skip". Changing the minimum looked like it did nothing.
- **One decimal, truncated.** 7 of 9 classes, 77.78% on a report, showed as 77.7%.
- **The minimum itself was fine.** A headless test on the dev server showed every number following the minimum whenever the classes left were known. What I saw came from the four problems above.

What changed:
- **A new reader that goes by position** (`src/table.js`). pdf.js gives every piece of text with its page, position and size, so the reader works with the table's layout:
  1. **The header.** It finds a line that names a course column and a held or attended column. Header words stacked over two or three lines ("Total No. Of / Classes / Conducted") join the column under them. A label over several columns, such as "Theory" over "Held" and "Attended", names their kind.
  2. **Columns.** Each column runs from halfway to its left neighbour to halfway to its right one. Every piece below the header goes to the column under its centre.
  3. **Records.** A record starts at each serial number, or at each line with counts when there is no serial column. Lines in between are cells that wrapped ("LAW OF TORTS AND" / "CONSUMER PROTECTION"), including across a page break. A sentence wider than most of the table is a footnote, and ends the record.
  4. **Courses.** Records with the same course name become the parts of one course. The type column only decides whether a part is theory, practical, tutorial or studio.
  5. **The check.** Each course is checked against the percentage printed on the report, whether the report prints it once per course or once per row.

  Columns are known by their words: serial number, course or subject, code, type, held (conducted, delivered, total), attended (present), absent, percentage and credits. So the reader also handles absent-only columns, "23/27" fractions, separate theory and lab columns, merged course cells and totals rows. Text with no header row still goes to the old text reader, which now knows TUTL and other codes.
- **Class types by their words** (`kindOf`). THEO and Lecture are theory; PRAC, Lab, Embedded Lab and Moot court are practical; TUTL and Seminar are tutorial; STDO is studio. Anything else, such as "Program Elective", counts as theory.
- **Names and dates.** "(IPC)", "CRPC", "Socio-Legal" and "Women's" come out right. Dates are read in more formats: 06.07.2026, 6 Jul 2026, July 6, 2026 and 2026-07-06.
- **The review checks the report.** It says "Every percentage matches the report", or flags each course that does not add up, with the printed figure beside it.
- **Imports replace everything,** the dates of the last report included. Undo brings it all back. The merge choice is gone.
- **Nothing is stored.**
  - The dashboard's state lives in memory.
  - Courses saved by earlier versions under `threshold.v2` and `threshold.v1` are deleted on sight.
  - What is left in storage: the theme, and the one-time hand-off of a report dropped on the landing page, deleted as soon as it is read.
  - The landing page passes its minimum along in the address, as `/dashboard/?min=80`.
- **Numbers that always answer.**
  - Percentages have two decimals, rounded like the report, but never rounded up onto a whole number: 79.996% reads 79.99%.
  - Without dates, the rows say what the minimum allows today: "4 now" under "You can skip", or "Next 6" under "You must attend".
  - In separate mode, a row's numbers are sums over its parts.
- **The sample keeps your minimum.** It used to reset it to 75%.
- **The planner is now the dashboard,** at `/dashboard/`.
  - `vercel.json` sends `/app` and anything under it there permanently, and the web manifest starts there.
  - The nav says "Dashboard" and the calls to action say "Check my attendance".
  - The closing line is "Drop in your report. Know before you skip.", since nothing is set up to last any more.
- **Small layout fixes.** Long names in the review wrap instead of being cut off. On narrow phones, the hero's "Import my report" link moves under the button.

How it was checked:
- **29 tests pass**, 10 of them new:
  - the position reader on synthetic reports: a stacked header repeated on page two, TUTL rows, wrapped names, a row split by the page break, and footnotes;
  - other layouts: codes, absent columns, fractions, merged cells, totals rows, and theory and lab counts in separate columns, flat or under a group label;
  - a course that does not add up to its printed percentage;
  - class types, names and dates;
  - the separate-mode sums.
- **Two real reports, kept out of the repository,** went through the same code as the browser. One is the School of Law report, with theory and tutorial rows. The other is an engineering report, with theory and practical rows. Every course's percentage matched the printed one: 8 of 8 on each.
- **Headless Chrome on the dev server:**
  - Courses saved by an old version were deleted, and nothing was loaded.
  - The law report imported with "Every percentage matches the report."
  - Switching the minimum between 80, 75, 70 and 85 changed every row. For example, the sample's Computer Networks can skip 10 at 75% and 6 at 80%.
  - Separate mode showed the sums.
  - A reload left the dashboard and storage empty.
  - A pasted table without dates showed "5 now" at 75% and "1 now" at 80%, and "Next 6" and "Next 15" for the course below the line.
  - The sample kept 80%.
  - The landing page handed on `?min=80`, and a report dropped there arrived for review with nothing left in session storage.
- **No regressions.** The hover sweep found no overlaps, and there is no sideways scroll at 360, 390 and 430 px wide.

The repository:
- It is now public, at my request. It is still all rights reserved: the README's license section and `package.json` say so, and being able to read the code does not grant a license to use it.
- The only collaborator is still me. Every commit is mine, with no co-author lines.
- The real reports used for testing are not in the repository. Every fixture is made up.

**After the release (2.0.1).** Checking the live site after the push:
- `/app` and `/app/index.html` redirected to the dashboard, but the bare `/app/` gave a 404. That is the address the 1.x buttons and the installed web app used. Vercel's `/app/:path*` pattern does not match an empty last segment.
- The fix is a plain pattern, `/app/(.*)` to `/dashboard/$1`.
- Checked live:
  - `/app`, `/app/`, `/app/?min=80` and `/app/index.html` all return 308 to `/dashboard/`, with the query kept;
  - a browser opening `/app/#start` lands on the dashboard with the import prompt open;
  - the full headless run (import, every minimum, separate mode, reload, paste, sample, hand-off) passed on the live site with no errors.

**2.0.2.** The dashboard screenshot from the law import showed a tank labelled "BNS2": the short label took an initial from every word, the year 2023 included. A name that ends in its own bracketed abbreviation now uses it, so that course reads "IPC". A year gives no initial, and only a small number or a Roman numeral at the end stays whole ("Mathematics III" is still "M3"). Two new cases in the plan tests cover it; 29 tests pass.

## 25. Feedback: "this is what I actually need"

My next note was two screenshots: a table I had worked out for the same law report, next to the dashboard, which showed different numbers. My table had, for each course:
- the target total classes for the semester: 60, 75 or 30;
- the most classes I can miss;
- the classes attended so far;
- how many more I need to attend.

What was different. Three inputs differed, and one of them was the dashboard's fault:
1. **Total classes.** My table plans each course's semester at 15 classes a credit. The report does not say how many classes a course has, so the dashboard estimated it from the pace so far and an end date it assumed, 16 weeks after the start. Classes had run slower than planned, so the estimate came out about a fifth short of the plan. **This was the dashboard's fault, and it is fixed.**
2. **The minimum.** My table lets a 60-class course miss 17, so it needs 43, about 72%. The report's rule is 80%: 48 needed, 12 can be missed. Even at 72%, 43 of 60 is 71.67%, below the line. The safe number is 44 needed, so 16 can be missed, not 17. Threshold always rounds the safe way.
3. **Attended so far.** My table's attended counts were higher than the report's, which is dated 27 September. The dashboard can only use the counts in the file. A newer report, or an edit in the course, brings them up to date.

What changed:
- **Each course has a total.** It is the classes the course has this semester, all types together. The review step asks for it beside every course, with the estimate as a placeholder, and each course's drawer has it under "Total classes". With it, the classes left, must attend and can skip are exact, and the dates are not needed at all.
- **What the college plans comes before an estimate.** The order is: a course's total classes, then its credits, then the pace so far, then classes a week. The drawer's chips show whichever one is in use.
- **Credits plan a 15-week semester.** That is 15 classes a credit, or 30 in a lab: a 4-credit course with a tutorial comes out at 45 lectures and 15 tutorials, 60 in all. Credits used to stretch over the dates, so an assumed 15.6-week semester made the same course 62.
- **The semester, spelled out the way people count it.** Classes left shows the total beside it, "22 of 60", or "of ~48" when it is an estimate. An opened course reads: "60 classes this semester. At 80% you need 48, so you can miss 12 in all. You have missed 7. Of the 22 left, attend 17 and you can skip 5." That is my table's columns in a sentence, worked out the safe way.
- Rows show attended of held ("31 of 38 attended") beside the class types.
- A row with no way to count the rest of the semester says "Add the total", the one input that always makes it exact.
- The sample semester now goes by its credits. Its 2-credit studio became 1 credit, so that it stays believable at 30 classes.

How it was checked:
- **31 tests pass.** The new ones cover:
  - a total that beats credits and the pace, and needs no dates;
  - shares of the classes left that always add up, however they split;
  - a made-up 60-class course counted the way students count it: 48 needed, 12 can be missed, 7 gone, of 22 left attend 17 and skip 5;
  - 72% needing 44 of 60, never 43.
- **The law report, imported with each course's total typed into the review,** at 80% and then 72%, on desktop and a phone. Every row matched a hand calculation, with no errors and no sideways scroll.
- **The full headless run passed:** import, every minimum, separate mode, reload, paste and sample. The README screenshots were retaken.

## 26. Feedback: check it yourself first, and take the detailed report too

My next note came with five of my own reports from my engineering school: the detailed register of every class from July to 10 October, and four monthly summaries for July, August, September and October. I asked for three things:
- work out the numbers independently first, instead of trusting the app;
- make the detailed register work too;
- make sure the model holds up.

**The independent count, done first, with nothing from the app.**
- The PDFs were read with PyMuPDF, a different engine from the app's pdf.js, and parsed with fresh regular expressions.
- The register has 338 classes, serial numbers 1 to 338 with no gaps, 4 of them not updated yet.
- Counted per course and type, the register matched the sum of the four monthly reports in all 13 rows. That is two independent sources agreeing.
- Each course's percentage, how many classes can be missed now and how many it takes to get back were then worked out by brute force, one class at a time.

**What the app got wrong:**
- **The register did not read at all.** It came out as one course called "Page". The table reader found the header, but:
  - a course name written far left of its centred header fell into the serial-number column;
  - the attendance column held P and A, not numbers.
- **Monthly reports were each read correctly, one at a time,** and every percentage matched. But one month is not the semester, and the dashboard could only take one file.
- **A monthly report runs to the end of its month,** so the October report said its counts were "as of 31 October", three weeks in the future.
- **pdf.js stopped after 20 pages.** A full-semester register runs to about 25.
- **The estimate of classes left depended on an assumed end date,** 16 weeks after classes began. A monthly report starts on the 1st, two weeks before classes did, so the same attendance gave very different estimates by route.

What changed:
- **A piece of text belongs to the header it sits under.** Only a piece under no header goes by its centre, as before. Every earlier report reads the same.
- **Registers.**
  - A row marked P is a class attended, and A is a class missed.
  - NU (not updated), E (exemption) and L (late admission) count for neither side. The review says how many there were.
  - The kind of class comes from the division code glued to the name: "NetworksT4" is theory, "P4" practical, "U4" tutorial and "S4" studio.
  - The dates on the rows say when classes really began and when the last class was marked.
- **Several files at once,** on the landing page and the dashboard.
  - Reports are added up course by course and part by part.
  - The widest report goes first, and any report whose dates overlap one already taken is left out and named. The detailed register dropped with the four monthly reports is counted once, not twice.
  - A file that cannot be read is named, and the rest still import.
- **A single month gets a warning:** "This report covers 1 Oct to 12 Oct only. For the whole semester, select every month's report together, or use the detailed one."
- **Counts never run past today.** A report dated into the future is counted as of today.
- **Up to 100 pages are read.**
- **When classes end.** The review asks for the date. Left empty, classes are assumed to end 18 weeks after they began, the UGC's 90 teaching days, on the Friday before. For my school, 13 July plus 18 weeks is 13 November, the Friday before end-semester exams start on 16 November.
- **A report that states no minimum says so.** The register has none, so the review says which minimum the dashboard keeps.

How it was checked:
- **The register alone, the four monthly reports together, and all five files at once** were imported in headless Chrome. All three gave the same attended and held counts as the independent count, in every course.
- **The register's route was compared number by number** with an independent model written in Python. It covered 8 courses, five figures each: the percentage, classes left, the estimated total, must attend and can skip. All 40 matched.
- **All five at once** left the four monthly reports out and named them.
- **October alone** showed the one-month warning.
- **The landing page took four files at once** and handed them to the dashboard.
- **35 tests pass,** 4 of them new: a synthetic register with marks, a page break and a glued division code; monthly reports added up; a report inside another one left out; and a report that runs past today.
- **The law report, totals, paste, sample and hand-off checks all still pass,** with no errors and no sideways scroll on a phone.

What stays an estimate: without each course's total classes or the real end date, classes left comes from the pace so far. Monthly reports start on the 1st, so the pace counts a fortnight with no classes. The review asks for both: each course's total makes its numbers exact, and the real end date brings the estimate much closer.

## 27. Feedback: "why can't I upload my PDF?"

My next note said only that I could not upload my PDF, with no message, no page and no file named.

**Reproducing it first.** On the live site, through the real file picker, my own report uploaded and reached the review on desktop and on a phone, from both the landing page and the dashboard. There were no errors and no failed requests. So the upload path itself worked, and the cause had to sit around it. Three things could make an upload fail with no useful message:
- **A page open across a release.** Three releases went out that day. The PDF reader is loaded only on first use, from a file whose name changes with each release. A page opened before the release asks for a file that is gone. The import failed with "That file could not be read. Try pasting the table instead.", which says nothing about the real problem.
- **One message for every PDF error.** A damaged file, or a reader that failed to start, was blamed on a password.
- **Drops beside the panel.** On the landing page, a file dropped anywhere but the drop panel was quietly ignored. Only the browser's own behaviour, opening the file, was blocked.

What changed:
- A reader that cannot be loaded says "Threshold was updated while this page was open. Reload the page, then drop the file again."
- pdf.js errors are told apart. A password-protected PDF and a damaged file each get their own message; anything else is the reader failing to start, and gets the reload message.
- A file dropped anywhere on the landing page is read, and the page scrolls to the panel so the progress shows.

How it was checked, in headless Chrome on the dev server:
- a good report reached the review;
- with the reader's file blocked, as a page from before a release would see it, the import gave the reload message;
- a password-protected PDF and a damaged one each gave their own message;
- a good file and a damaged one together imported the good one and named the other;
- a file dropped on the landing page's headline opened the dashboard with the review.

The law report, paste, sample and hand-off checks still pass, and 35 tests pass.

## 28. Feedback: matching pages, my own minimum, a fuller story, a finished course

My next note came with screenshots, and asked for six things:
- The dashboard's bar and edges did not line up with the landing page's.
- An import quietly used 75%. I wanted to choose the minimum while confirming the import, and to have the site remember my settings.
- Scrolling the landing page, the screen was mostly empty water between the lines of the story, on a laptop and on a phone.
- On a phone, a dark band showed below the blue water, so in the dark theme the page read black, blue, black.
- The numbers were still wrong for a course that had finished. It had far fewer classes than the dashboard assumed, and all of them had been held. I had attended all I needed and skipped the one I could, yet the dashboard still planned classes. I asked for a way to give each course its number of classes, picked by scrolling numbers like Apple's timer instead of typing them.
- The site should be secure and say as little as possible about how it is built, because it is going out for everyone to use.

What changed:
- **Matching edges.** The dashboard's bar now has the landing nav's height (68px, 60px on phones), gutter and logo size. The page uses the full width with the same side gutter. At 1920, 1440 and 390px wide, the logo and the right edge sit in the same place on both pages.
- **Number wheels.** Every count is picked on a wheel that snaps to each number, tilts its rows like a drum, and works with the arrow keys, Page Up, Page Down, Home and End. This covers the minimum, the lab minimum, and each course's total classes, credits and classes a week. A wheel commits only a value the user scrolled to, so a repaint of the page never moves it. An early version did: every repaint re-appended the rows, which reset the wheels' scroll.
- **Choosing the minimum at import.** The review step opens with a minimum wheel. It is set from the report's own rule when the report states one, and from the last minimum used otherwise. Each course in the review has a "classes this semester" pill that opens a wheel, with a reset to the estimate.
- **A course that has finished.** With its total set to the classes it held, a course has nothing left and reads "Finished", or "Finished below X%". A course whose classes have all been held now plans nothing more.
- **Settings remembered in cookies.** The minimum, the lab rule and the theme are first-party cookies: `th_min`, `th_mode`, `th_labmin` and `th_theme`, kept for a year, SameSite=Lax, and Secure on https. Courses are still never stored. The theme's start-up script moved from an inline script to `/t.js`, so the pages need no inline script at all.
- **A story that fills the screen.**
  - A ledger of the example course's semester, one square per class, sits in the water beside the story. On narrower screens that are tall enough, it runs along the bottom instead. Past classes are already marked, and the story's own classes fill in as you scroll.
  - Each beat's copy rests on the line like the hero, holds while the water tells its part, and dissolves as the next one arrives. The numbers wait with it.
  - Below 1024px, rising copy would cross the ledger. There, each beat's copy appears in its place once the one before it has gone, and the ledger leaves before the stage scrolls it up through the last beat.
  - The "Three questions" header is in two columns on wide screens.
- **No band under the water on phones.** The stage is now as tall as the largest viewport (`lvh`), and the water's colour continues below the canvas, so collapsing browser bars never show the page behind.
- **Security headers.** Every response carries:
  - a content security policy that allows only the site's own scripts, styles, fonts, images and workers, with no inline scripts, no eval, no framing and no form posts elsewhere;
  - `nosniff` and no referrer;
  - a permissions policy that turns off the camera, microphone, location and payments;
  - same-origin opener and resource policies.
- **Saying less about the build.** Built files are named by their content hash alone, with no preload helper and no licence banners. The animation and scrolling libraries no longer leave their names and versions on `window`. The notices their licences require are in `/legal.txt`.

One limit is worth stating plainly. Any website's code reaches the browser, so it can be read, however its files are named. What protects the work is its licence ("All rights reserved") and a private repository.

How it was checked, in headless Chrome:
- the 35 tests pass;
- the wheels work in the review, the course drawer and the rule sheet, and a minimum of 82% survived a reload and reached the landing page;
- the landing story was checked frame by frame on a phone (390×844), a tablet (820×1180) and a laptop (1366×768): no copy crosses the ledger, and there are no page errors;
- the built site was checked under the new headers. On both pages, my own report read with every percentage matching, and a password-protected PDF and a damaged one each gave their own message, with no policy violations;
- the live site after the deploy passed the same checks, and sends every header.
