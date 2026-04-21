/**
 * @file report.js — renders a Zeugnis-style progress card.
 *
 * The Zeugnis unlocks once the user has completed ≥ 3 distinct levels in
 * at least one subject. For each ready subject we compute:
 *   - overall accuracy (across the full history)
 *   - Note (1–6) from the German school grading scale
 *   - top 3 strongest topics (≥ 2 attempts and ≥ 70%)
 *   - up to 3 weakest topics (≥ 2 attempts and < 70%)
 *   - a short motivational line in German + English keyed to the Note
 *
 * A "Als Bild herunterladen" button uses html2canvas loaded on demand from
 * a CDN to snapshot the card as a PNG.
 *
 * Exposes `window.VikramReport.render(container)`.
 */

(function (global) {
  'use strict';

  const MIN_LEVELS_FOR_REPORT = 3;

  /** German Schulnote scale. Match order is deterministic (check high → low). */
  const NOTE_SCALE = [
    { note: 1, name: 'sehr gut',     min: 90 },
    { note: 2, name: 'gut',          min: 75 },
    { note: 3, name: 'befriedigend', min: 60 },
    { note: 4, name: 'ausreichend',  min: 45 },
    { note: 5, name: 'mangelhaft',   min: 20 },
    { note: 6, name: 'ungenügend',   min: 0  },
  ];

  const MOTIVATION = {
    1: { de: 'Ausgezeichnet — weiter so!',                           en: 'Excellent — keep it up!' },
    2: { de: 'Sehr schön gemacht!',                                  en: 'Very nicely done!' },
    3: { de: 'Gut gemacht. Mit etwas mehr Übung wird es noch besser.', en: 'Good work. A bit more practice and it will be even better.' },
    4: { de: 'Weiter so — jede Runde hilft dir.',                    en: 'Keep going — every round helps you.' },
    5: { de: 'Übe weiter. Konzentriere dich auf ein Thema.',         en: 'Keep practicing. Focus on one topic at a time.' },
    6: { de: 'Gib nicht auf. Fang mit dem ersten Thema an.',         en: 'Don\u2019t give up. Start with the first topic.' },
  };

  const SUBJECT_LABEL = { math: 'Mathematik', german: 'Deutsch' };
  const SUBJECT_ICON  = { math: '📐',         german: '📖' };

  /** Entry point called by app.js. */
  function render(container) {
    const today = new Date().toLocaleDateString('de-DE', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const math   = computeSubjectStats('math');
    const german = computeSubjectStats('german');
    const mathReady   = math.uniqueLevels   >= MIN_LEVELS_FOR_REPORT;
    const germanReady = german.uniqueLevels >= MIN_LEVELS_FOR_REPORT;
    const anyReady    = mathReady || germanReady;

    container.innerHTML = `
      <section class="zeugnis-view" aria-labelledby="zeugnis-title">
        <h2 id="zeugnis-title" class="section-title">Zeugnis</h2>
        <p class="section-subtitle">
          ${anyReady
            ? 'Dein aktueller Leistungsstand.'
            : `Das Zeugnis erscheint, sobald du ${MIN_LEVELS_FOR_REPORT} Level pro Fach abgeschlossen hast.`}
        </p>

        ${anyReady ? renderZeugnisCard({ today, math, german, mathReady, germanReady }) : `
          <div class="zeugnis__progress-hint">
            <p>${SUBJECT_ICON.math} ${SUBJECT_LABEL.math}: ${math.uniqueLevels} / ${MIN_LEVELS_FOR_REPORT} Level</p>
            <p>${SUBJECT_ICON.german} ${SUBJECT_LABEL.german}: ${german.uniqueLevels} / ${MIN_LEVELS_FOR_REPORT} Level</p>
          </div>
        `}

        ${anyReady ? `
          <div class="zeugnis__actions">
            <button class="btn btn--math btn--block" id="zeugnis-download">Als Bild herunterladen</button>
            <p class="zeugnis__download-status" id="zeugnis-status" role="status" aria-live="polite"></p>
          </div>
        ` : ''}

        <a class="btn btn--block btn--ghost" href="#">Zurück zum Dashboard</a>
      </section>
    `;

    const btn = container.querySelector('#zeugnis-download');
    if (btn) {
      btn.addEventListener('click', async () => {
        const card   = container.querySelector('#zeugnis-card');
        const status = container.querySelector('#zeugnis-status');
        await downloadAsImage(card, status);
      });
    }
  }

  // --- card template --------------------------------------------------

  function renderZeugnisCard({ today, math, german, mathReady, germanReady }) {
    return `
      <article class="zeugnis" id="zeugnis-card">
        <header class="zeugnis__header">
          <div>
            <h3 class="zeugnis__title">Vikram Lernt — Zeugnis</h3>
            <p class="zeugnis__date">Stand: ${escapeHtml(today)}</p>
          </div>
          <div class="zeugnis__seal" aria-hidden="true">🏅</div>
        </header>

        ${subjectBlock('math',   math,   mathReady)}
        ${subjectBlock('german', german, germanReady)}

        <footer class="zeugnis__footer">
          <p class="zeugnis__signature">Klasse 6 · Niedersachsen-Kerncurriculum</p>
        </footer>
      </article>
    `;
  }

  function subjectBlock(subject, stats, ready) {
    const icon  = SUBJECT_ICON[subject];
    const label = SUBJECT_LABEL[subject];

    if (!ready) {
      return `
        <section class="zeugnis__subject zeugnis__subject--${subject} zeugnis__subject--locked">
          <header class="zeugnis__subject-header">
            <h4 class="zeugnis__subject-title"><span aria-hidden="true">${icon}</span> ${label}</h4>
          </header>
          <p class="zeugnis__locked-msg">
            Zeugnis verfügbar nach ${MIN_LEVELS_FOR_REPORT} abgeschlossenen Leveln
            (${stats.uniqueLevels}/${MIN_LEVELS_FOR_REPORT}).
          </p>
        </section>
      `;
    }

    const noteEntry = pickNote(stats.pct);
    const mot = MOTIVATION[noteEntry.note];

    return `
      <section class="zeugnis__subject zeugnis__subject--${subject}">
        <header class="zeugnis__subject-header">
          <h4 class="zeugnis__subject-title"><span aria-hidden="true">${icon}</span> ${label}</h4>
          <div class="zeugnis__note" aria-label="Note ${noteEntry.note} – ${noteEntry.name}">
            <span class="zeugnis__note-number">${noteEntry.note}</span>
            <span class="zeugnis__note-label">${escapeHtml(noteEntry.name)}</span>
          </div>
        </header>

        <p class="zeugnis__score">
          ${stats.pct}% richtig · ${stats.correctCount} von ${stats.totalAnswered} Aufgaben
        </p>

        ${stats.topicStrengths.length > 0 ? `
          <div class="zeugnis__section">
            <h5>Stärken</h5>
            <ul>${stats.topicStrengths.map(t =>
              `<li>${escapeHtml(t.topic)} <span class="zeugnis__pct">(${t.pct}%)</span></li>`
            ).join('')}</ul>
          </div>
        ` : ''}

        ${stats.topicWeak.length > 0 ? `
          <div class="zeugnis__section">
            <h5>Übungsbedarf</h5>
            <ul>${stats.topicWeak.map(t =>
              `<li>${escapeHtml(t.topic)} <span class="zeugnis__pct">(${t.pct}%)</span></li>`
            ).join('')}</ul>
          </div>
        ` : ''}

        <p class="zeugnis__motivation">
          <strong>${escapeHtml(mot.de)}</strong><br>
          <em>${escapeHtml(mot.en)}</em>
        </p>
      </section>
    `;
  }

  // --- stats ----------------------------------------------------------

  function computeSubjectStats(subject) {
    const history  = global.VikramStorage.getHistory({ subject });
    const total    = history.length;
    const correct  = history.filter(h => h.isCorrect).length;
    const pct      = total > 0 ? Math.round((correct / total) * 100) : 0;

    const progress     = global.VikramStorage.getProgress(subject);
    const uniqueLevels = new Set(progress.completedLevels.map(c => c.level)).size;

    // topic breakdown
    const topicMap = new Map();
    for (const h of history) {
      if (!h.topic) continue;
      const t = topicMap.get(h.topic) || { topic: h.topic, total: 0, correct: 0 };
      t.total   += 1;
      t.correct += h.isCorrect ? 1 : 0;
      topicMap.set(h.topic, t);
    }

    const topics = [...topicMap.values()]
      .filter(t => t.total >= 2)
      .map(t => ({ ...t, pct: Math.round((t.correct / t.total) * 100) }));

    const strengths = topics.slice().sort((a, b) => b.pct - a.pct || b.total - a.total).filter(t => t.pct >= 70).slice(0, 3);
    const weak      = topics.slice().sort((a, b) => a.pct - b.pct || b.total - a.total).filter(t => t.pct <  70).slice(0, 3);

    return {
      totalAnswered:  total,
      correctCount:   correct,
      pct,
      uniqueLevels,
      topicStrengths: strengths,
      topicWeak:      weak,
    };
  }

  function pickNote(pct) {
    for (const entry of NOTE_SCALE) {
      if (pct >= entry.min) return entry;
    }
    return NOTE_SCALE[NOTE_SCALE.length - 1];
  }

  // --- download -------------------------------------------------------

  async function downloadAsImage(cardEl, statusEl) {
    if (!cardEl) return;
    setStatus(statusEl, 'Bild wird vorbereitet …');
    try {
      const html2canvas = await ensureHtml2Canvas();
      const canvas = await html2canvas(cardEl, { backgroundColor: '#ffffff', scale: 2 });
      const link = document.createElement('a');
      link.download = `vikram-zeugnis-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatus(statusEl, 'Heruntergeladen.');
    } catch (err) {
      console.error('[report] download failed', err);
      setStatus(statusEl, 'Download fehlgeschlagen. Bist du offline? Die Bild-Funktion braucht beim ersten Mal Internet.');
    }
  }

  function setStatus(el, msg) { if (el) el.textContent = msg; }

  let html2canvasPromise = null;
  function ensureHtml2Canvas() {
    if (global.html2canvas) return Promise.resolve(global.html2canvas);
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload  = () => global.html2canvas ? resolve(global.html2canvas) : reject(new Error('html2canvas missing after load'));
      s.onerror = () => { html2canvasPromise = null; reject(new Error('html2canvas CDN unreachable')); };
      document.head.appendChild(s);
    });
    return html2canvasPromise;
  }

  // --- escape ---------------------------------------------------------

  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESC[c]); }

  // --- expose ---------------------------------------------------------

  global.VikramReport = Object.freeze({ render });
})(typeof window !== 'undefined' ? window : globalThis);
