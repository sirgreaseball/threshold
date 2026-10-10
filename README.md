# Threshold

Attendance planner for colleges with a minimum attendance rule (75%, 80%, 85% or anything else). For every course it tells you:
- how many classes you can miss right now,
- how many you must attend in a row to get back above the line,
- what is still possible before the last class.

Drop in the attendance report PDF from your college portal and it reads the courses, their theory and practical rows, and the minimum. Everything runs in the browser, and nothing is uploaded.

Built with Claude Code for the "Playing with AI" project. The full process log is in [docs/DEVLOG.md](docs/DEVLOG.md).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # maths, report parser, planning and story checks
npm run build    # static site in dist/
```

## Layout

- `index.html`, `src/landing.js`, `src/story.js`: the landing page and its scroll story, worked out for any minimum
- `app/index.html`, `src/app.js`, `src/skyline.js`: the planner and its per-course tank chart
- `src/core.js`: attendance maths, in whole numbers
- `src/plan.js`: courses made of parts, college rules, classes left from pace, credits, weekly counts or planned totals
- `src/parse.js`, `src/report.js`, `src/pdftext.js`: reading reports (pdf.js loads only when a PDF is imported)
- `src/liquid.js`: the canvas liquid and the text-inversion effect
- `src/theme.js`: light and dark themes, with the flood transition from the toggle
- `src/store.js`: saving to this browser, migration from v1, and the sample semester

## How classes left are estimated

1. **Pace so far** (default): classes held ÷ weeks elapsed × weeks left.
2. **Credits:** uses the AICTE definition, where 1 credit = 1 lecture hour or 2 lab hours a week. Each lab part takes one credit and theory gets the rest. A 3-credit course with a lab comes out at 2 lecture hours and 2 lab hours a week, about 60 classes over a 15-week semester.
3. **Per week:** set for each part.
4. **Planned total:** from the course's session plan.
