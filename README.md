# Vikram Lernt

A daily-practice Progressive Web App for Vikram, a 6th-grade student in Lilienthal, Niedersachsen, to strengthen his **Mathematik** and **Deutsch** skills through bite-sized daily exercises aligned with the Niedersachsen Klasse 6 Kerncurriculum.

## What it does

- Presents **one Math + one German question per day** from the student's current level.
- Uses an **11-step leveling system** (0 = Einsteiger → 10 = Experte), 10 questions per level, ≥7/10 to advance.
- Gives an **explanation or worked example** on every answer.
- Stores full **history** of every question answered, filterable by subject / level / correct-wrong.
- Generates a **Zeugnis-style report** (Note 1–6) after every 3 completed levels per subject.
- Works **offline** as a PWA after the first load; installable to a phone home screen.

See `CLAUDE.md` for the full product spec.

## Tech stack

- Vanilla **HTML + CSS + JavaScript** — no build step.
- `localStorage` for all persistence (progress, history, streak, settings).
- **PWA** via `manifest.json` + `service-worker.js`.
- Question bank as static JSON files under `data/math` and `data/german`.

## Project structure

```
/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   └── styles.css
├── js/
│   ├── app.js          # main logic & routing
│   ├── storage.js      # localStorage wrapper
│   ├── quiz.js         # quiz flow
│   ├── history.js      # history rendering
│   ├── report.js       # Zeugnis generation
│   └── questions.js    # question loader
├── data/
│   ├── math/           # level-0.json … level-10.json
│   └── german/         # level-0.json … level-10.json
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── CLAUDE.md
└── README.md
```

## Run locally

No build step. Serve the folder over HTTP (a service worker will not register from `file://`):

```bash
python -m http.server 8080
```

Then open http://localhost:8080 on your phone or desktop browser.

## Deploy

Hosted on **GitHub Pages** from the `main` branch (root). Push to `main` and the site updates.

## Status

Skeleton only — app logic not yet implemented.
