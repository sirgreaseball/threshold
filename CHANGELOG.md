# Changelog

This file lists every release of Threshold since it went live at [stayabove.vercel.app](https://stayabove.vercel.app). Every release went live on the day of its commit, because each push to `main` deploys.

The story behind each change is in [docs/DEVLOG.md](docs/DEVLOG.md): the feedback that prompted it, what was tried, and how it was checked. Each release below links its dev log section.

Versions follow [semantic versioning](https://semver.org):
- a **patch** is a fix or a copy change;
- a **minor** release adds or reworks a feature;
- a **major** release breaks saved data or the way the app is used.

Each release has a git tag (`v1.2.0` and so on).

## How to add a release

1. Make the change in small commits, each with a plain subject line ("Fix …", "Add …", "Make …").
2. Add a dev log section that says:
   - what the feedback or problem was;
   - what changed;
   - how it was verified.
3. Add an entry at the top of this file, under a new version. List the commits and link the dev log section.
4. Bump `version` in `package.json`.
5. Tag and push. Vercel deploys `main` on its own.
   ```bash
   git tag -a v2.3.0 -m "Threshold 2.3.0"
   git push origin main --tags
   ```

---

## [2.3.0] - 2026-10-12

### Added
- **Number wheels** for every count: the minimum, the lab minimum, and each course's total classes, credits and classes a week. They scroll and snap like a phone's timer and work from the keyboard.
- **The minimum is chosen at import**, on a wheel in the review. It starts from the report's own rule, or from your last choice. Each course in the review can be given its classes this semester.
- **Settings are remembered** in first-party cookies: the minimum, the lab rule and the theme. Courses are still never stored.
- **A ledger on the landing page:** the example course's semester, one square per class, filling in as the story scrolls.
- **Security headers** on every page: a strict content security policy, no framing, no referrer, a permissions policy, and same-origin opener and resource policies.

### Changed
- The dashboard's bar and edges match the landing page's nav exactly.
- Each beat of the landing story rests on the line and holds while the water tells its part, and the numbers wait with it. Below 1024px, the copy appears in place instead of rising across the ledger.
- Built files are named by content hash alone, without licence banners. The notices are in `/legal.txt`. The animation libraries no longer leave globals on `window`.

### Fixed
- A course that has finished reads "Finished" and plans nothing more, once its total is set to the classes it held.
- On phones, a dark band no longer shows below the water when the browser bars move.
- Wheels no longer reset when the dashboard repaints.

Commits: `0b137f2`, `e90d254`, `3e8fea2`, `7c6e717`, `339850d`, `9ac07fe`, `b09e40f`, `3ab49e7`. Dev log: [section 28](docs/DEVLOG.md#28-feedback-matching-pages-my-own-minimum-a-fuller-story-a-finished-course).

## [2.2.1] - 2026-10-12

### Fixed
- **Uploads that failed without saying why.**
  - A page left open across a release could not load the PDF reader and said only "That file could not be read". It now says Threshold was updated and asks for a reload.
  - A password-protected PDF, a damaged file and a reader that failed to start each get their own message. They used to share one that blamed a password.
- On the landing page, a file dropped anywhere outside the drop panel was ignored. It is now read, and the panel scrolls into view.

Commit: `10bcc91`. Dev log: [section 27](docs/DEVLOG.md#27-feedback-why-cant-i-upload-my-pdf).

## [2.2.0] - 2026-10-12

Every kind of report, and every number checked twice.

### Added
- **Detailed registers.** A report that lists every class on its own row, marked P or A, now reads:
  - each row is one class held;
  - classes marked NU (not updated), E (exemption) or L (late admission) count for neither side, and the review says how many;
  - the kind of class comes from the division code ("T4", "P4", "U4", "S4");
  - the dates say when classes really began.
- **Several files at once.** Monthly reports are added up course by course. A report whose dates fall inside another one's is left out and named, so nothing counts twice, and a file that cannot be read is named while the rest import.
- The review asks when classes end, and says which minimum the dashboard keeps when a report states none.
- A single month on its own gets a warning that it is not the semester.

### Changed
- Without an end date, classes are assumed to end 18 weeks after they began (the UGC's 90 teaching days), not 16.
- Text belongs to the column header it sits under. Only text under no header goes by its centre.
- PDFs are read up to 100 pages, not 20.

### Fixed
- A detailed register came out as one course called "Page".
- A monthly report counted its classes as of the end of its month, even when that was in the future.

Commits: `d0cb6b8` (registers), `6ce9d73` (several reports, the end date), and a docs commit with this entry. Dev log: [section 26](docs/DEVLOG.md#26-feedback-check-it-yourself-first-and-take-the-detailed-report-too).

## [2.1.0] - 2026-10-10

Exact numbers for the whole semester.

### Added
- **Each course's total classes this semester.** The review step asks for it beside every course (usually 15 a credit), and each course's drawer has it under "Total classes". With it, classes left, must attend and can skip are exact, and no dates are needed.
- Classes left shows the semester beside it: "22 of 60", or "of ~48" when it is an estimate.
- Rows show attended of held ("31 of 38 attended").
- An opened course spells out the semester the way students count it: the classes it has, how many the minimum needs, how many can be missed in all, how many already were, and what that leaves.

### Changed
- What the college plans comes before an estimate. The order is a course's total classes, then its credits, then the pace so far, then classes a week.
- Credits plan a 15-week semester: 15 classes a credit, or 30 in a lab. They used to stretch over the dates, which made a 4-credit course 62 classes instead of 60.
- A row with no way to count the rest of the semester says "Add the total".
- The sample's 2-credit studio is now 1 credit, so it stays believable at 30 classes.

Commits: `7e12cfd` (course totals), and a docs commit with this entry. Dev log: [section 25](docs/DEVLOG.md#25-feedback-this-is-what-i-actually-need).

## [2.0.2] - 2026-10-10

### Fixed
- The short labels under the tanks took an initial from a year, so a course named "..., 2023 (IPC)" read "BNS2". A name that ends in its own bracketed abbreviation now uses it ("IPC"), and a year gives no initial.

Commit: `8285468`. Dev log: [section 24](docs/DEVLOG.md#24-feedback-every-schools-report-logic-that-holds-nothing-kept), "After the release".

## [2.0.1] - 2026-10-10

### Fixed
- The old address `/app/`, which the 1.x buttons and installed web apps used, gave a 404 instead of opening the dashboard. `/app`, `/app/` and everything under them now redirect to `/dashboard/`, keeping `?min=` and any `#` link.

Commit: `779aeeb`. Dev log: [section 24](docs/DEVLOG.md#24-feedback-every-schools-report-logic-that-holds-nothing-kept), "After the release".

## [2.0.0] - 2026-10-10

Any school's report, and nothing kept.

### Changed, breaking
- **Nothing is saved between visits.** Courses live in memory, so a reload starts empty. Courses that 1.x saved in `localStorage` are deleted on the first visit.
- **The planner is now the dashboard, at `/dashboard/`.** `/app` and everything under it redirect there permanently, and the web manifest starts there.
- **An import replaces everything** on the dashboard, the previous report's dates included. The merge option is gone, and Undo brings the old courses back.

### Added
- **A report reader that works by position** (`src/table.js`). It finds the header row and its columns, starts a record at each serial number, joins wrapped names and rows split by a page break, and skips footnotes. It reads:
  - tutorial rows typed TUTL, and other class codes;
  - absent-only columns and "23/27" fractions;
  - theory and lab counts in separate columns, on one header line or under a group label;
  - merged course cells and totals rows.

  The text reader stays as the fallback for text without a header row.
- **The review checks the report.** It says whether every course adds up to the percentage printed on the report, and flags any course that does not.
- Rows without dates show what the minimum allows today: "4 now" to skip, or "Next 6" to attend.
- Dates in more formats: 7 Jul 2026, July 7, 2026 and 2026-07-07.
- Course names keep "(IPC)", "Socio-Legal" and "CRPC".

### Fixed
- Courses on another school's report came out named after their class type ("Tutl"), with counts from the wrong rows.
- Percentages show two decimals, rounded the way the report prints them (77.78%, not 77.7%). They are never rounded up onto a whole number.
- In separate mode, a row's classes left, must attend and can skip are sums over its parts. They used to show only the tightest part.
- Loading the sample no longer resets the minimum to 75%.
- Long course names wrap in the review instead of being cut off.
- On narrow phones, the hero's "Import my report" link moves under the button instead of breaking over two lines.

### Copy
- "Open planner" became "Dashboard" in the nav and "Check my attendance" on the page.
- The closing line is now "Drop in your report. Know before you skip.", since nothing is set up to last any more.

Commits: `4bc40f1` (the reader), `bdfc258` (separate-mode sums), `7cf4f99` (the dashboard and memory-only state), and a docs commit with this entry. Dev log: [section 24](docs/DEVLOG.md#24-feedback-every-schools-report-logic-that-holds-nothing-kept).

## [1.2.1] - 2026-10-10

The repository gets a proper front page.

### Changed
- Both footers now end with the copyright line and "Your data stays in the browser, nothing uploaded." The "Built with Claude Code" line is gone.
- `package.json` is now `private` and `UNLICENSED`, with an author. It used to say ISC, which contradicted "All rights reserved".

### Added
- A full README. It has light and dark screenshots that follow GitHub's theme, the maths as formulas, the import pipeline as a diagram, the project layout and how to run it.
- This changelog, plus git tags for every release since launch.

Commits: `d809c9d` (footers), `e4c282c` (README), `2795954` (this changelog and the dev log), and a final README tidy. Dev log: [section 23](docs/DEVLOG.md#23-feedback-drop-the-credit-line-and-a-proper-repository).

## [1.2.0] - 2026-10-10

The answers follow your numbers.

### Added
- "Still to come this semester" in Try it, with its own stepper.

### Changed
- The three answers on the landing page follow whatever is in Try it. They update on every keystroke, every stepper click and every change of minimum.
  - Each answer has its own wording for being right on the line, being below it, a finish that can't be reached, and no classes left.
  - A changed figure rolls up into place.
- The second answer now shows what missing twice your spare would cost. Missing one too many almost always costs just one class, which says little.
- The nav gets a frosted bar once the page has scrolled 24 px, so the logo never lands on top of the headline. At the top it stays clear.

### Fixed
- Story text no longer slides under the readout.
  - From 768 px wide, the copy stops 40 px short of it.
  - On phones, the hero and the story copy hold still and dissolve in place. This also works with reduced motion.
  - Screens 1366 px and wider are unchanged.

Commit: `c8df419`. Dev log: [section 22](docs/DEVLOG.md#22-feedback-answers-that-follow-your-numbers-and-a-nav-that-stays-readable).

## [1.1.0] - 2026-10-10

The landing page explains itself.

### Changed
- The readout is labelled "Example course". It shows the semester as a row of class marks (missed, attended, still to come) that fills in as you scroll, so it doubles as the story's progress bar.
- The readout says "4 classes to spare", "No classes to spare", "Attend the next 10 in a row" or "Back at 75%".
- The story copy introduces its example course, and every number in it is generated for the chosen minimum.
- Try it moved up to sit right after the story.

Commit: `ebfe925`. Dev log: [section 21](docs/DEVLOG.md#21-feedback-make-the-splash-page-make-sense).

## [1.0.1] - 2026-10-10

Hover, toned down.

### Fixed
- Magnetic elements could lean up to about 15 px and run into their neighbours. The changes:
  - The lean is now capped at 1.5 to 3 px.
  - The tank swell dropped from 34% to 16%, and row lifts from 3 px to 2 px.
  - Button clusters have 12 px gaps.
- An automated sweep found no overlaps afterwards.

Commits: `a460d75`, `2900a20`. Dev log: [section 20](docs/DEVLOG.md#20-feedback-the-hover-effect-overshot).

## [1.0.0] - 2026-10-10

First release, live at stayabove.vercel.app.

### Added
- **Launch:**
  - the name and address, picked from about 45 checked names;
  - the logo, favicons, web manifest and social card;
  - "Threshold" in the browser tab.
- **The import prompt** when the planner opens from the landing page, with a close button and "Browse files".
- **Collapsed course rows** show classes left, how many you must attend and how many you can skip.
- **Cursor-aware details:**
  - magnetic buttons;
  - spotlights that follow the pointer;
  - tanks that swell like a dock.
- "© 2026 Dhruv Sonar. All rights reserved." on both pages.

### Fixed
- The "Open planner" hover left a crescent and made the button vanish against the water. It now cross-fades.
- The line no longer flashes red during the intro.

Commits: `6199b3c`, `8524cf4`. Dev log: [Round 3](docs/DEVLOG.md#round-3-launch-polish-and-deploy), sections 17 to 19.

### Before the repository

Rounds 1 and 2 were built before the repository existed. The first commit, `6199b3c`, contains them along with round 3.

- **Round 2:**
  - courses made of parts (theory, practical, tutorial, studio);
  - any minimum, with a separate lab minimum and per-course overrides;
  - classes left from pace, credits, per week or a planned total;
  - PDF and paste import with a review step;
  - the tank chart, the theme flood transition and phone layouts.

  Dev log: [Round 2](docs/DEVLOG.md#round-2-polish-real-reports-any-college), sections 10 to 16.
- **Round 1:**
  - the liquid landing page and text that inverts under the water;
  - whole-number attendance maths with brute-force tests;
  - a first planner.

  Dev log: sections 1 to 9.

[2.2.1]: https://github.com/sirgreaseball/threshold/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/sirgreaseball/threshold/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/sirgreaseball/threshold/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/sirgreaseball/threshold/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/sirgreaseball/threshold/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/sirgreaseball/threshold/compare/v1.2.1...v2.0.0
[1.2.1]: https://github.com/sirgreaseball/threshold/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/sirgreaseball/threshold/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/sirgreaseball/threshold/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/sirgreaseball/threshold/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/sirgreaseball/threshold/tree/v1.0.0
