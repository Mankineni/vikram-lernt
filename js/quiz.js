/**
 * @file quiz.js — level-round quiz flow.
 *
 * Features:
 *   - Renders one question at a time with big inputs for 360 px screens.
 *   - Green card on correct; red card with worked-example on wrong.
 *   - Back/forward nav between questions. Already-answered questions show
 *     in read-only review mode; the live unanswered question shows the form.
 *   - Session state is persisted to localStorage on every answer, so a
 *     browser refresh mid-round resumes where the user left off.
 *   - On round completion: writes to progress; advances level on ≥ 7/10.
 *   - Streak is advanced transparently by `addHistoryEntry` in storage.js.
 *
 * Exposes `window.VikramQuiz`:
 *   - start(opts)        — begin a fresh round
 *   - resume(opts)       — resume a previously-saved session
 *   - hasActiveSession() — is there a non-stale session in storage?
 *   - checkAnswer(q,u)   — compare helper (also used in tests)
 *
 * Depends on: storage.js, questions.js.
 */

(function (global) {
  'use strict';

  const PASS_THRESHOLD = 7;   // correct out of 10
  const MAX_LEVEL      = 10;

  /**
   * Begin a new round.
   * @param {object} opts
   * @param {'math'|'german'} opts.subject
   * @param {HTMLElement}     opts.container
   * @param {number=}         opts.level         — default: user's current level
   * @param {Array=}          opts.questions     — default: level's full bank
   * @param {boolean=}        opts.shuffle       — default true
   * @param {function=}       opts.onComplete    — summary callback
   */
  async function start(opts) {
    if (!opts || !opts.subject || !opts.container) {
      throw new Error('[VikramQuiz] start: subject and container are required');
    }

    const level = (opts.level != null)
      ? opts.level
      : global.VikramStorage.getProgress(opts.subject).currentLevel;

    let questions = opts.questions;
    if (!questions) {
      questions = await global.VikramQuestions.loadLevel(opts.subject, level);
    }
    if (!questions || questions.length === 0) {
      opts.container.innerHTML = `<p class="quiz__error">Keine Fragen verfügbar.</p>`;
      return;
    }

    const ordered = (opts.shuffle !== false) ? shuffle(questions.slice()) : questions.slice();

    const session = {
      subject:    opts.subject,
      level,
      questions:  ordered,
      answers:    new Array(ordered.length).fill(null),
      drafts:     {},                       // index -> in-progress raw input
      index:      0,
      startedAt:  new Date().toISOString(),
      finalized:  false,
      container:  opts.container,
      onComplete: opts.onComplete,
    };

    persist(session);
    renderCurrent(session);
  }

  /**
   * Resume a session previously saved by a prior round.
   * @param {{ container: HTMLElement, onComplete?: function }} opts
   * @returns {boolean} true if a session was resumed.
   */
  function resume(opts) {
    const saved = global.VikramStorage.getSession();
    if (!saved || !Array.isArray(saved.questions) || saved.questions.length === 0) {
      return false;
    }
    const session = {
      subject:    saved.subject,
      level:      saved.level,
      questions:  saved.questions,
      answers:    Array.isArray(saved.answers) ? saved.answers : [],
      drafts:     saved.drafts || {},
      index:      Math.min(saved.index || 0, saved.questions.length - 1),
      startedAt:  saved.startedAt || new Date().toISOString(),
      finalized:  !!saved.finalized,
      container:  opts.container,
      onComplete: opts.onComplete,
    };
    // pad answers array to match questions length
    while (session.answers.length < session.questions.length) session.answers.push(null);

    renderCurrent(session);
    return true;
  }

  /** Does a non-stale session exist? */
  function hasActiveSession() {
    const s = global.VikramStorage.getSession();
    return !!(s && Array.isArray(s.questions) && s.questions.length > 0);
  }

  // --- rendering ------------------------------------------------------

  function renderCurrent(session) {
    if (session.finalized) { renderSummary(session); return; }

    const q = session.questions[session.index];
    if (!q) { finish(session); return; }

    const answered = session.answers[session.index];
    if (answered) {
      renderFeedback(session, q, answered);
    } else {
      renderLiveQuestion(session, q);
    }
  }

  function renderLiveQuestion(session, q) {
    const total = session.questions.length;
    const canBack = session.index > 0;

    session.container.innerHTML = `
      <section class="quiz quiz--${session.subject}" aria-labelledby="quiz-q-${session.index}">
        <header class="quiz__header">
          <span class="quiz__progress">Frage ${session.index + 1} von ${total}</span>
          <span class="quiz__topic">${escapeHtml(q.topic)}</span>
        </header>
        <h2 id="quiz-q-${session.index}" class="quiz__question">${escapeHtml(q.question)}</h2>
        <form class="quiz__form" novalidate>
          ${renderAnswerInput(q)}
          <div class="quiz__buttons">
            ${canBack ? `<button type="button" class="btn btn--ghost quiz__back">← Zurück</button>` : ''}
            <button type="submit" class="btn btn--${session.subject} quiz__submit">
              Antwort prüfen
            </button>
          </div>
        </form>
      </section>
    `;

    restoreDraft(session, q);

    const form = session.container.querySelector('.quiz__form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = readAnswer(form);
      if (!raw || !raw.toString().trim()) {
        const firstInput = form.querySelector('input[name="answer"]');
        if (firstInput) firstInput.focus();
        return;
      }
      handleSubmit(session, q, raw);
    });

    // Save drafts as the user types/selects so a refresh doesn't wipe them.
    form.addEventListener('input', () => {
      session.drafts[session.index] = readAnswer(form);
      persist(session);
    });

    wireBack(session);

    const textInput = form.querySelector('input.quiz__input');
    if (textInput) textInput.focus();
  }

  function renderFeedback(session, q, { userAnswer, isCorrect }) {
    const total = session.questions.length;
    const canBack    = session.index > 0;
    const canForward = session.index < total - 1 || isLastAndDone(session);
    const isLast     = session.index === total - 1;

    let forwardLabel = 'Weiter →';
    if (isLast && allAnswered(session)) forwardLabel = 'Ergebnis sehen →';
    else if (session.answers[session.index + 1]) forwardLabel = 'Nächste ansehen →';

    session.container.innerHTML = `
      <section class="quiz quiz--${session.subject}" aria-labelledby="quiz-q-${session.index}">
        <header class="quiz__header">
          <span class="quiz__progress">Frage ${session.index + 1} von ${total}</span>
          <span class="quiz__topic">${escapeHtml(q.topic)}</span>
        </header>
        <h2 id="quiz-q-${session.index}" class="quiz__question">${escapeHtml(q.question)}</h2>
        ${isCorrect ? renderCorrectCard(q) : renderWrongCard(q, userAnswer)}
        <div class="quiz__buttons">
          ${canBack ? `<button type="button" class="btn btn--ghost quiz__back">← Zurück</button>` : ''}
          ${canForward ? `<button type="button" class="btn btn--${session.subject} quiz__next">${forwardLabel}</button>` : ''}
        </div>
      </section>
    `;

    wireBack(session);
    wireForward(session);

    const next = session.container.querySelector('.quiz__next');
    if (next) next.focus();
  }

  function renderSummary(session) {
    const { subject, level } = session;
    const total   = session.questions.length;
    const correct = session.answers.filter(a => a && a.isCorrect).length;
    const passed  = correct >= PASS_THRESHOLD;
    const percent = Math.round((correct / total) * 100);

    // --- compute advancement once and persist -------------------------
    if (!session.finalized) {
      const progress = global.VikramStorage.getProgress(subject);
      const patch = {
        completedLevels: [
          ...progress.completedLevels,
          { level, score: correct, date: new Date().toISOString() },
        ],
      };
      if (passed && level === progress.currentLevel && level < MAX_LEVEL) {
        patch.currentLevel = level + 1;
      }
      global.VikramStorage.saveProgress(subject, patch);
      session.finalized  = true;
      session.finalSaved = { correct, passed, advanced: !!patch.currentLevel };
      persist(session);
    }

    const { advanced } = session.finalSaved || { advanced: false };
    const nextLevel = advanced ? level + 1 : level;
    const message = passed && advanced
      ? `Du hast Level ${level} bestanden und bist jetzt auf Level ${nextLevel}! 🎉`
      : passed
        ? `Du hast Level ${level} bestanden!`
        : `Du brauchst mindestens ${PASS_THRESHOLD} von ${total}. Versuch das Level nochmal — die Fragen werden neu gemischt.`;

    session.container.innerHTML = `
      <section class="quiz quiz--${subject} quiz__summary" role="status" aria-live="polite">
        <div class="quiz__summary-icon" aria-hidden="true">${passed ? '🎉' : '💪'}</div>
        <h2 class="quiz__summary-title">${passed ? 'Super gemacht!' : 'Fast geschafft!'}</h2>
        <div class="quiz__summary-score">
          <span class="quiz__summary-bignum">${correct}<span class="quiz__summary-sep">/</span>${total}</span>
          <span class="quiz__summary-pct">${percent}% richtig</span>
        </div>
        <p class="quiz__summary-message">${escapeHtml(message)}</p>
        <div class="quiz__summary-actions">
          <button type="button" class="btn btn--ghost quiz__review">← Fragen nochmal ansehen</button>
          <button type="button" class="btn btn--${subject} quiz__done">Zurück zum Dashboard</button>
        </div>
      </section>
    `;

    session.container.querySelector('.quiz__review').addEventListener('click', () => {
      session.index = session.questions.length - 1;
      renderCurrent(session);
    });

    session.container.querySelector('.quiz__done').addEventListener('click', () => {
      global.VikramStorage.clearSession();
      if (typeof session.onComplete === 'function') {
        session.onComplete({
          subject, level, total,
          score: correct,
          passed,
          advanced,
          nextLevel,
        });
      }
    });

    if (passed && !session.confettiShown && !prefersReducedMotion()) {
      spawnConfetti(session.container.querySelector('.quiz'), 48);
      session.confettiShown = true;
    }
  }

  // --- input rendering ------------------------------------------------

  function renderAnswerInput(q) {
    if (q.type === 'multiple_choice') {
      return `
        <fieldset class="quiz__options">
          <legend class="visually-hidden">Antwortmöglichkeiten</legend>
          ${q.options.map((opt) => `
            <label class="quiz__option">
              <input type="radio" name="answer" value="${escapeAttr(opt)}" required />
              <span class="quiz__option-text">${escapeHtml(opt)}</span>
            </label>
          `).join('')}
        </fieldset>
      `;
    }
    if (q.type === 'number_input') {
      return `
        <label class="quiz__input-label" for="quiz-answer">Deine Antwort</label>
        <input id="quiz-answer" class="quiz__input" type="text"
               inputmode="decimal" name="answer" autocomplete="off" required />
      `;
    }
    // text_input
    return `
      <label class="quiz__input-label" for="quiz-answer">Deine Antwort</label>
      <input id="quiz-answer" class="quiz__input" type="text"
             name="answer" autocomplete="off" autocapitalize="off" required />
    `;
  }

  function readAnswer(form) {
    const el = form.elements.answer;
    if (!el) return '';
    // RadioNodeList has .value for the checked radio in the group
    return typeof el.value === 'string' ? el.value : '';
  }

  function restoreDraft(session, q) {
    const saved = session.drafts[session.index];
    if (saved == null || saved === '') return;
    if (q.type === 'multiple_choice') {
      const match = session.container.querySelector(
        `.quiz__form input[name="answer"][value="${cssEscape(saved)}"]`
      );
      if (match) match.checked = true;
    } else {
      const input = session.container.querySelector('.quiz__form input.quiz__input');
      if (input) input.value = saved;
    }
  }

  // --- feedback cards -------------------------------------------------

  function renderCorrectCard(q) {
    return `
      <div class="feedback feedback--correct" role="status" aria-live="polite">
        <div class="feedback__icon" aria-hidden="true">✓</div>
        <h3 class="feedback__title">Richtig! Super gemacht.</h3>
        <p class="feedback__explanation">${escapeHtml(q.explanation)}</p>
      </div>
    `;
  }

  function renderWrongCard(q, userAnswer) {
    const userText = String(userAnswer).trim() || '(keine Antwort)';
    return `
      <div class="feedback feedback--wrong" role="status" aria-live="polite">
        <div class="feedback__icon" aria-hidden="true">✕</div>
        <h3 class="feedback__title">Leider falsch.</h3>
        <dl class="feedback__answers">
          <dt>Deine Antwort</dt>
          <dd>${escapeHtml(userText)}</dd>
          <dt>Richtige Antwort</dt>
          <dd><strong>${escapeHtml(q.correctAnswer)}</strong></dd>
        </dl>
        <div class="feedback__walkthrough">
          <h4>So geht's:</h4>
          <p>${escapeHtml(q.explanation)}</p>
        </div>
      </div>
    `;
  }

  // --- submit and nav wiring ------------------------------------------

  function handleSubmit(session, q, userAnswer) {
    const isCorrect = checkAnswer(q, userAnswer);

    global.VikramStorage.addHistoryEntry({
      subject:       session.subject,
      level:         session.level,
      topic:         q.topic,
      question:      q.question,
      questionId:    q.id,
      options:       q.options,
      userAnswer:    String(userAnswer),
      correctAnswer: q.correctAnswer,
      explanation:   q.explanation,
      isCorrect,
    });

    session.answers[session.index] = { userAnswer: String(userAnswer), isCorrect };
    delete session.drafts[session.index];
    persist(session);

    renderCurrent(session);

    if (isCorrect && !prefersReducedMotion()) {
      spawnConfetti(session.container.querySelector('.quiz'), 18);
    }
  }

  function wireBack(session) {
    const back = session.container.querySelector('.quiz__back');
    if (!back) return;
    back.addEventListener('click', () => {
      session.index = Math.max(0, session.index - 1);
      persist(session);
      renderCurrent(session);
    });
  }

  function wireForward(session) {
    const next = session.container.querySelector('.quiz__next');
    if (!next) return;
    next.addEventListener('click', () => {
      const total = session.questions.length;
      if (session.index < total - 1) {
        session.index += 1;
        persist(session);
        renderCurrent(session);
      } else if (allAnswered(session)) {
        finish(session);
      }
    });
  }

  function finish(session) { renderSummary(session); }

  // --- state helpers --------------------------------------------------

  function allAnswered(session) {
    return session.answers.length === session.questions.length
      && session.answers.every(a => a && typeof a === 'object');
  }

  function isLastAndDone(session) {
    return session.index === session.questions.length - 1
      && session.answers[session.index];
  }

  function persist(session) {
    // Strip DOM refs and callbacks before storing.
    const { subject, level, questions, answers, drafts, index, startedAt, finalized, finalSaved, confettiShown } = session;
    global.VikramStorage.saveSession({
      subject, level, questions, answers, drafts, index, startedAt, finalized, finalSaved, confettiShown,
    });
  }

  // --- grading --------------------------------------------------------

  /**
   * @param {object} q
   * @param {string} userAnswer
   * @returns {boolean}
   */
  function checkAnswer(q, userAnswer) {
    const correct = String(q.correctAnswer ?? '');
    const user    = String(userAnswer    ?? '');

    if (q.type === 'multiple_choice') return user === correct;
    if (q.type === 'number_input')    return normNumber(user) === normNumber(correct);
    if (q.type === 'text_input')      return normText(user)   === normText(correct);
    return user === correct;
  }

  function normNumber(s) {
    const cleaned = String(s)
      .trim()
      .replace(/\s+/g, '')
      .replace(/,/g, '.')
      .replace(/\u2212/g, '-')
      .replace(/^\+/, '');
    if (cleaned === '') return '';
    const n = Number(cleaned);
    return Number.isFinite(n) ? String(n) : cleaned;
  }

  function normText(s) {
    return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // --- confetti -------------------------------------------------------

  function spawnConfetti(target, count) {
    if (!target) return;
    target.style.position = target.style.position || 'relative';
    const colors = ['#4a90e2', '#f5a623', '#3fa866', '#e06c7a', '#f0c75e', '#a78bfa'];
    const wrap = document.createElement('div');
    wrap.className = 'confetti';
    wrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'confetti__piece';
      el.style.left = (Math.random() * 100) + '%';
      el.style.background = colors[i % colors.length];
      el.style.setProperty('--dx', ((Math.random() - 0.5) * 220) + 'px');
      el.style.animationDelay    = (Math.random() * 0.15) + 's';
      el.style.animationDuration = (1 + Math.random() * 0.6) + 's';
      wrap.appendChild(el);
    }
    target.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2200);
  }

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // --- helpers --------------------------------------------------------

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]); }
  function escapeAttr(s) { return escapeHtml(s); }

  function cssEscape(s) {
    // Fallback when CSS.escape isn't available.
    if (global.CSS && typeof global.CSS.escape === 'function') return global.CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // --- expose ---------------------------------------------------------

  global.VikramQuiz = Object.freeze({
    start,
    resume,
    hasActiveSession,
    checkAnswer,
  });
})(typeof window !== 'undefined' ? window : globalThis);
