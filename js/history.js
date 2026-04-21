/**
 * @file history.js — renders the Verlauf (history) screen.
 *
 * Features:
 *   - Scrollable list of every Q&A attempt, newest first.
 *   - Filter chips: Alle / Mathe / Deutsch / Nur falsche.
 *   - Tap an entry to expand it (full question, both answers, explanation).
 *   - "Nur falsche üben" review: picks up all wrong attempts for the chosen
 *     subject, de-duplicates by question id, loads the originals from the
 *     data files (so quiz.js gets the proper question objects), and launches
 *     a custom quiz session.
 *
 * Exposes `window.VikramHistory.render(container)` — called by app.js when
 * the user navigates to #history.
 */

(function (global) {
  'use strict';

  let rootEl = null;
  let state  = { filter: 'all', expanded: new Set() };

  /** Entry point called by app.js. */
  function render(container) {
    rootEl = container;
    state = { filter: 'all', expanded: new Set() };
    paint();
  }

  function paint() {
    const entries = getFiltered();
    const wrongMath   = global.VikramStorage.getHistory({ subject: 'math',   isCorrect: false }).length;
    const wrongGerman = global.VikramStorage.getHistory({ subject: 'german', isCorrect: false }).length;
    const count = entries.length;

    rootEl.innerHTML = `
      <section class="history" aria-labelledby="history-title">
        <h2 id="history-title" class="section-title">Verlauf</h2>
        <p class="section-subtitle">${count} ${count === 1 ? 'Eintrag' : 'Einträge'}</p>

        <nav class="history__filters" role="tablist" aria-label="Filter">
          ${chip('all',    'Alle')}
          ${chip('math',   'Mathe',  '📐')}
          ${chip('german', 'Deutsch','📖')}
          ${chip('wrong',  'Nur falsche','✕')}
        </nav>

        ${(wrongMath + wrongGerman > 0) ? `
          <section class="history__review" aria-label="Falsche Antworten üben">
            <h3 class="history__review-title">Nur falsche üben</h3>
            <div class="history__review-buttons">
              ${wrongMath > 0
                ? `<button class="btn btn--math"   data-review="math">📐 Mathe (${wrongMath})</button>`
                : ''}
              ${wrongGerman > 0
                ? `<button class="btn btn--german" data-review="german">📖 Deutsch (${wrongGerman})</button>`
                : ''}
            </div>
          </section>
        ` : ''}

        ${count === 0 ? `
          <p class="history__empty">Noch keine Einträge — fang eine Übungsrunde an!</p>
        ` : `
          <ul class="history__list" role="list">
            ${entries.map(renderEntry).join('')}
          </ul>
        `}

        <a class="btn btn--block btn--ghost history__back" href="#">Zurück zum Dashboard</a>
      </section>
    `;

    rootEl.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        paint();
      });
    });

    rootEl.querySelectorAll('[data-history-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.historyId;
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        paint();
      });
    });

    rootEl.querySelectorAll('[data-review]').forEach(btn => {
      btn.addEventListener('click', () => { startReview(btn.dataset.review); });
    });
  }

  // --- rendering helpers ----------------------------------------------

  function chip(id, label, icon) {
    const active = state.filter === id;
    return `
      <button class="history__chip ${active ? 'history__chip--active' : ''}"
              data-filter="${id}" role="tab" aria-selected="${active}">
        ${icon ? `<span aria-hidden="true">${icon}</span>` : ''}
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }

  function renderEntry(e) {
    const isOpen   = state.expanded.has(e.id);
    const subjIcon = e.subject === 'math' ? '📐' : '📖';
    const when     = formatDate(e.timestamp);

    return `
      <li class="history__entry ${isOpen ? 'history__entry--open' : ''}">
        <button class="history__summary" data-history-id="${escapeAttr(e.id)}"
                aria-expanded="${isOpen}">
          <div class="history__row1">
            <span class="history__subject history__subject--${e.subject}" aria-hidden="true">${subjIcon}</span>
            <span class="history__topic">${escapeHtml(e.topic || '')}</span>
            <span class="history__status history__status--${e.isCorrect ? 'correct' : 'wrong'}"
                  aria-label="${e.isCorrect ? 'richtig' : 'falsch'}">
              ${e.isCorrect ? '✓' : '✕'}
            </span>
          </div>
          <div class="history__row2">
            <span class="history__q-preview">${escapeHtml(e.question)}</span>
          </div>
          <div class="history__row3">
            <time datetime="${escapeAttr(e.timestamp)}">${when}</time>
            <span>Level ${e.level}</span>
          </div>
        </button>
        ${isOpen ? `
          <div class="history__detail" role="region">
            <p class="history__q-full">${escapeHtml(e.question)}</p>
            <dl class="history__answers">
              <dt>Deine Antwort</dt>
              <dd class="history__ans history__ans--${e.isCorrect ? 'correct' : 'wrong'}">
                ${escapeHtml(e.userAnswer || '') || '<em>(leer)</em>'}
              </dd>
              <dt>Richtige Antwort</dt>
              <dd><strong>${escapeHtml(e.correctAnswer)}</strong></dd>
            </dl>
            <div class="history__walkthrough">
              <h4>Erklärung</h4>
              <p>${escapeHtml(e.explanation || '')}</p>
            </div>
          </div>
        ` : ''}
      </li>
    `;
  }

  // --- data helpers ---------------------------------------------------

  function getFiltered() {
    const all = global.VikramStorage.getHistory().slice().reverse();  // newest first
    switch (state.filter) {
      case 'math':   return all.filter(e => e.subject === 'math');
      case 'german': return all.filter(e => e.subject === 'german');
      case 'wrong':  return all.filter(e => !e.isCorrect);
      default:       return all;
    }
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch (_) { return ''; }
  }

  // --- review-wrong flow ----------------------------------------------

  async function startReview(subject) {
    const wrong = global.VikramStorage.getHistory({ subject, isCorrect: false });
    if (wrong.length === 0) return;

    // Dedupe by questionId (fall back to question text)
    const seen = new Set();
    const deduped = [];
    for (const e of wrong) {
      const key = e.questionId || e.question;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(e);
    }

    // Reconstruct full question objects. Prefer the originals from the JSON
    // bank so quiz.js gets the proper `type` field; fall back to rebuilding
    // from the history entry if the data can't be loaded.
    const byLevel = new Map();
    for (const e of deduped) {
      if (!byLevel.has(e.level)) byLevel.set(e.level, []);
      byLevel.get(e.level).push(e);
    }

    const questions = [];
    for (const [level, items] of byLevel) {
      let original = null;
      try {
        original = await global.VikramQuestions.loadLevel(subject, level);
      } catch (_) { /* fall back below */ }

      for (const e of items) {
        const match = original && original.find(
          q => q.id === e.questionId || q.question === e.question
        );
        questions.push(match || reconstructQuestion(e));
      }
    }

    if (questions.length === 0) return;

    rootEl.innerHTML = `<div id="review-root" class="quiz-root"></div>`;
    global.VikramQuiz.start({
      subject,
      container:  document.getElementById('review-root'),
      questions,
      level:      questions[0].level ?? global.VikramStorage.getProgress(subject).currentLevel,
      onComplete: () => {
        // Stay on the History screen after review; progress toward the
        // current level is NOT updated from a custom-question session
        // because quiz.js uses its own session.level (the review level
        // might not match the user's current level). Re-render history.
        render(rootEl);
      },
    });
  }

  function reconstructQuestion(e) {
    const hasOptions = Array.isArray(e.options) && e.options.length > 0;
    return {
      id:            e.questionId || `review-${e.id}`,
      topic:         e.topic || 'Wiederholung',
      type:          hasOptions ? 'multiple_choice' : 'text_input',
      question:      e.question,
      options:       e.options,
      correctAnswer: e.correctAnswer,
      explanation:   e.explanation,
    };
  }

  // --- escape ---------------------------------------------------------

  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESC[c]); }
  function escapeAttr(s) { return escapeHtml(s); }

  // --- expose ---------------------------------------------------------

  global.VikramHistory = Object.freeze({ render });
})(typeof window !== 'undefined' ? window : globalThis);
