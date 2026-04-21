# CLAUDE.md - Vikram's Learning Companion

## Project Overview

**App Name:** Vikram Lernt (Vikram Learns)
**Purpose:** A daily practice Progressive Web App (PWA) to help Vikram, a 6th-grade student in Lilienthal, Lower Saxony (Niedersachsen), Germany, improve his Mathematics and German language skills through adaptive daily practice.
**Target User:** Vikram — 6th standard (Klasse 6) student following the Niedersachsen curriculum.
**Deployment:** Built with Claude Code, hosted on GitHub Pages, accessible via mobile browser URL.

---

## Core Requirements

### 1. Curriculum Alignment
- All content must align with **Niedersachsen Klasse 6 Kerncurriculum** (core curriculum) for:
  - **Mathematik** (Mathematics)
  - **Deutsch** (German language — grammar, not literature)
- Language of instruction for German questions: German (with English/simple hints where needed).
- Language of instruction for Math questions: German terminology with clear English fallback (Vikram learns in German school).

### 2. Daily Practice Flow
When Vikram opens the app:
1. He sees the **Home screen** with current level, streak, and two big tabs: **Mathe** and **Deutsch**.
2. Each session presents:
   - **1 Math question** (from current Math level)
   - **1 German question** (from current German level)
3. He selects or types an answer.
4. On **correct answer**: positive feedback + short explanation of why.
5. On **wrong answer**: AI shows the correct answer **with a worked example** explaining the concept step by step, in language a 6th grader understands.
6. Every answered question is saved to history.

### 3. Leveling System (0–10)

| Level | Difficulty | Description |
|-------|-----------|-------------|
| 0 | Einsteiger | Very basic, revision from Klasse 4–5 |
| 1–2 | Leicht | Easy warmup |
| 3–4 | Mittel | Klasse 6 standard |
| 5–6 | Fortgeschritten | Klasse 6 advanced |
| 7–8 | Schwer | Challenge problems |
| 9–10 | Experte | Competition / Klasse 7 preview |

- **Each level contains 10 questions per subject.**
- Vikram must get **≥7/10 correct** to unlock the next level.
- If he scores <7/10, the level repeats with shuffled/new questions.
- He can replay any completed level to improve his score.

### 4. Math Topic Coverage (Klasse 6 Niedersachsen)
Questions across all levels must cover:
- Addition, Subtraktion, Multiplikation, Division (whole numbers & decimals)
- Bruchrechnung (fractions — add, subtract, multiply, divide, simplify)
- Dezimalzahlen (decimals)
- Prozentrechnung (percentages)
- Durchschnitt / Mittelwert (averages, mean)
- Statistik (basic statistics — median, mode, range, simple diagrams)
- Geometrie basics (area, perimeter, angles)
- Einheiten umrechnen (unit conversion — length, weight, time, money)
- Textaufgaben (word problems)
- Zahlenfolgen (number patterns / sequences)
- Negative Zahlen (negative numbers — introduction)
- Teilbarkeit (divisibility rules)

### 5. German Topic Coverage (Klasse 6 Niedersachsen)
Grammar focus:
- **Wortarten** (parts of speech — Nomen, Verb, Adjektiv, Pronomen, Artikel, Präposition, Konjunktion, Adverb)
- **Fälle / Kasus** (Nominativ, Genitiv, Dativ, Akkusativ)
- **Zeitformen** (Präsens, Präteritum, Perfekt, Plusquamperfekt, Futur I & II)
- **Satzglieder** (Subjekt, Prädikat, Objekt, adverbiale Bestimmungen)
- **Aktiv/Passiv** (introduction)
- **Direkte/Indirekte Rede** (direct/indirect speech — introduction)
- **Rechtschreibung** (spelling — dass/das, s/ss/ß, groß-/kleinschreibung)
- **Zeichensetzung** (punctuation — commas, direct speech)
- **Wortfamilien und Wortbildung** (word families, compound words)
- **Starke und schwache Verben** (strong/weak verbs)

### 6. Rating / Report System (Schulnoten-Style)
After every **3 levels completed per subject**, Vikram receives a **Zeugnis-style report** (German school grading):

| Note | Punkte | Meaning |
|------|--------|---------|
| 1 | sehr gut | 90–100% |
| 2 | gut | 75–89% |
| 3 | befriedigend | 60–74% |
| 4 | ausreichend | 45–59% |
| 5 | mangelhaft | 20–44% |
| 6 | ungenügend | 0–19% |

The report shows:
- Overall Note per subject
- Strengths (topics with high accuracy)
- Areas to improve (topics with low accuracy)
- Motivational message in German + English

### 7. History & Review
- All Q&A stored with: question, his answer, correct answer, explanation, topic, level, subject, timestamp, correct/wrong flag.
- **History tab** shows filterable list (by subject, by level, by correct/wrong).
- Tap any history item to see the full explanation again.
- Option to **review only wrong answers** for targeted practice.

---

## UI / UX Design

### Layout Principles
- **Mobile-first** (designed for phone screen, works on tablet/desktop).
- **Two-tab main navigation** at bottom: **📐 Mathe** and **📖 Deutsch**.
- **Top bar:** App name, current level per subject, streak counter (🔥).
- **Hamburger/menu icon** for: History, Reports (Zeugnis), Settings, About.
- Colors: calm, kid-friendly — soft blue for Math, warm orange for German, green for correct, red (gentle) for wrong.
- Font: large, readable (min 16px body, 20px+ for questions).
- Buttons: big tap targets (min 48×48 px).

### Screens
1. **Home / Dashboard** — Level cards for both subjects, streak, "Heute üben" button.
2. **Quiz screen** — One question at a time, answer input, submit, feedback card.
3. **History** — Scrollable list, filters, search.
4. **Zeugnis (Report)** — Generated every 3 levels, shareable/downloadable.
5. **Settings** — Clear history, export data, about.

---

## Technical Architecture

### Stack
- **Frontend:** Vanilla HTML + CSS + JavaScript (no build step for simplicity + GitHub Pages compatibility). Optionally use a tiny framework like **Alpine.js** or **Preact via CDN** if complexity grows.
- **Styling:** Plain CSS with CSS variables for theming; optionally Tailwind via CDN for prototyping.
- **Storage:** `localStorage` for everything (questions answered, progress, levels, history). No backend needed.
- **PWA:** manifest.json + service worker for offline support and "Add to Home Screen".
- **Hosting:** GitHub Pages from `main` branch, `/` root or `/docs` folder.

### Data Model (localStorage keys)
```
vikram.progress.math   = { currentLevel, completedLevels: [{level, score, date}] }
vikram.progress.german = { currentLevel, completedLevels: [{level, score, date}] }
vikram.history         = [ { id, subject, level, topic, question, options?, userAnswer, correctAnswer, explanation, isCorrect, timestamp } ]
vikram.streak          = { count, lastDate }
vikram.settings        = { theme, language }
```

### Question Bank Structure
Questions stored as static JSON files:
```
/data/math/level-0.json
/data/math/level-1.json
...
/data/math/level-10.json
/data/german/level-0.json
...
/data/german/level-10.json
```

Each question object:
```json
{
  "id": "math-l3-q5",
  "topic": "Bruchrechnung",
  "type": "multiple_choice" | "text_input" | "number_input",
  "question": "Was ist 1/2 + 1/4?",
  "options": ["1/6", "2/6", "3/4", "3/6"],
  "correctAnswer": "3/4",
  "explanation": "Bringe beide Brüche auf den gleichen Nenner: 1/2 = 2/4. Dann 2/4 + 1/4 = 3/4.",
  "hints": ["Finde den gemeinsamen Nenner zuerst."]
}
```

### File Structure
```
/
├── index.html
├── manifest.json
├── service-worker.js
├── /css
│   └── styles.css
├── /js
│   ├── app.js          # main logic
│   ├── storage.js      # localStorage wrapper
│   ├── quiz.js         # quiz flow
│   ├── history.js      # history rendering
│   ├── report.js       # Zeugnis generation
│   └── questions.js    # question loader
├── /data
│   ├── /math
│   └── /german
├── /icons
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---

## Development Guidelines for Claude Code

When working on this project:
1. **Keep it simple.** No unnecessary dependencies. This must run on GitHub Pages with zero build step.
2. **Mobile-first CSS** — test at 360px width minimum.
3. **Accessibility** — semantic HTML, proper labels, keyboard navigation, ARIA where useful.
4. **All text in both German and English** where helpful for a bilingual learner. German is primary.
5. **Age-appropriate** — Vikram is ~11–12 years old. Keep tone encouraging, never condescending.
6. **No external API calls.** Everything must work offline after first load.
7. **Question quality matters more than quantity.** Each question must have a clear, pedagogically sound explanation.
8. **Commit often.** Small, focused commits with clear messages.
9. **Test on actual mobile** — Vikram will use this on his phone.

---

## Success Criteria

- Vikram opens the app daily and completes at least 1 Math + 1 German question.
- After 4 weeks, Vikram has completed at least levels 0–3 in both subjects.
- He can see clear progress through the Zeugnis reports.
- App works offline after first load.
- App loads in <2 seconds on a mid-range Android phone.
