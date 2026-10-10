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
   git tag -a v2.1.0 -m "Threshold 2.1.0"
   git push origin main --tags
   ```

---

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

[2.0.1]: https://github.com/sirgreaseball/threshold/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/sirgreaseball/threshold/compare/v1.2.1...v2.0.0
[1.2.1]: https://github.com/sirgreaseball/threshold/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/sirgreaseball/threshold/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/sirgreaseball/threshold/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/sirgreaseball/threshold/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/sirgreaseball/threshold/tree/v1.0.0
