/**
 * @file quiz.js — renders one question at a time, grades the answer,
 * shows feedback (green on correct, red with worked example on wrong),
 * persists every attempt to history, and on round completion updates
 * progress (advance if score ≥ 7/10, else repeat with shuffle).
 *
 * Exposes `window.VikramQuiz.start(opts)` which takes over a container
 * element and drives the whole round.
 *
 * Depends on: storage.js, questions.js.
 */

(function (global) {
  'use strict';

  const PASS_THRESHOLD = 7;  // out of 10
  const MAX_LEVEL      = 10;

  /**
   * Kick off a quiz round inside a container element.
   * @param {object}  opts
   * @param {'math'|'german'} opts.subject
   * @param {HTMLElement}     opts.container
   * @param {number=}         opts.level          — default: user's current level
   * @param {Array=}          opts.questions      — default: questions of that level
   * @param {boolean=}        opts.shuffle        — default true
   * @param {function=}       opts.onComplete     — called with summary
   * @param {function=}       opts.onExit         — called if user exits early
   * @returns {Promise<void>}
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

    const roundQuestions = (opts.shuffle !== false) ? shuffle(questions.slice()) : questions.slice();

    const session = {
      subject:      opts.subject,
      level,
      questions:    roundQuestions,
      index:        0,
      correctCount: 0,
      container:    opts.container,
      onComplete:   opts.onComplete,
      onExit:       opts.onExit,
    };

    renderQuestion(session);
  }

  // --- rendering ------------------------------------------------------

  function renderQuestion(session) {
    const q = session.questions[session.index];
    if (!q) { finish(session); return; }

    const total = session.questions.length;
    session.container.innerHTML = `
      <section class="quiz quiz--${session.subject}" aria-labelledby="quiz-q-${session.index}">
        <header class="quiz__header">
          <span class="quiz__progress">Frage ${session.index + 1} von ${total}</span>
          <span class="quiz__topic">${escapeHtml(q.topic)}</span>
        </header>
        <h2 id="quiz-q-${session.index}" class="quiz__question">${escapeHtml(q.question)}</h2>
        <form class="quiz__form" novalidate>
          ${renderAnswerInput(q)}
          <button type="submit" class="btn btn--${session.subject} btn--block quiz__submit">
            Antwort prüfen
          </button>
        </form>
      </section>
    `;

    const form = session.container.querySelector('.quiz__form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.elements.answer;
      const raw = input.value ?? '';
      if (!raw.toString().trim()) {
        // empty — nudge the user
        const firstInput = form.querySelector('input[name="answer"]');
        if (firstInput) firstInput.focus();
        return;
      }
      handleSubmit(session, q, raw);
    });

    // Autofocus for text-style inputs (radios keep native behaviour).
    const textInput = form.querySelector('input.quiz__input');
    if (textInput) textInput.focus();
  }

  function renderAnswerInput(q) {
    if (q.type === 'multiple_choice') {
      return `
        <fieldset class="quiz__options">
          <legend class="visually-hidden">Antwortmöglichkeiten</legend>
          ${q.options.map((opt, i) => `
            <label class="quiz__option">
              <input type="radio" name="answer" value="${escapeAttr(opt)}" required ${i === 0 ? '' : ''} />
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

  function handleSubmit(session, q, userAnswer) {
    const correct = checkAnswer(q, userAnswer);

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
      isCorrect:     correct,
    });

    if (correct) session.correctCount += 1;
    renderFeedback(session, q, userAnswer, correct);
  }

  function renderFeedback(session, q, userAnswer, correct) {
    const isLast = session.index === session.questions.length - 1;
    const btnLabel = isLast ? 'Ergebnis sehen' : 'Weiter →';

    session.container.innerHTML = `
      <section class="quiz quiz--${session.subject}">
        <header class="quiz__header">
          <span class="quiz__progress">Frage ${session.index + 1} von ${session.questions.length}</span>
          <span class="quiz__topic">${escapeHtml(q.topic)}</span>
        </header>
        ${correct ? renderCorrectCard(q) : renderWrongCard(q, userAnswer)}
        <button class="btn btn--${session.subject} btn--block quiz__next" autofocus>
          ${btnLabel}
        </button>
      </section>
    `;

    const nextBtn = session.container.querySelector('.quiz__next');
    nextBtn.addEventListener('click', () => {
      session.index += 1;
      renderQuestion(session);
    });
    nextBtn.focus();

    if (correct && !prefersReducedMotion()) {
      spawnConfetti(session.container.querySelector('.quiz'), 18);
    }
  }

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

  function finish(session) {
    const { subject, level, correctCount, questions } = session;
    const total   = questions.length;
    const passed  = correctCount >= PASS_THRESHOLD;
    const percent = Math.round((correctCount / total) * 100);

    // Record result and (conditionally) advance.
    const progress = global.VikramStorage.getProgress(subject);
    const completedEntry = {
      level,
      score: correctCount,
      date: new Date().toISOString(),
    };
    const patch = {
      completedLevels: [...progress.completedLevels, completedEntry],
    };
    let advanced = false;
    let nextLevel = level;
    if (passed && level === progress.currentLevel && level < MAX_LEVEL) {
      patch.currentLevel = level + 1;
      nextLevel = level + 1;
      advanced = true;
    }
    global.VikramStorage.saveProgress(subject, patch);
    // Streak is advanced automatically by addHistoryEntry once both
    // subjects have been answered today — no need to call it here.

    const subjectClass = subject;
    const message = passed && advanced
      ? `Du hast Level ${level} bestanden und bist jetzt auf Level ${nextLevel}! 🎉`
      : passed
        ? `Du hast Level ${level} bestanden!`
        : `Du brauchst mindestens ${PASS_THRESHOLD} von ${total}. Versuch das Level nochmal — die Fragen werden neu gemischt.`;

    session.container.innerHTML = `
      <section class="quiz quiz--${subjectClass} quiz__summary" role="status" aria-live="polite">
        <div class="quiz__summary-icon" aria-hidden="true">${passed ? '🎉' : '💪'}</div>
        <h2 class="quiz__summary-title">${passed ? 'Super gemacht!' : 'Fast geschafft!'}</h2>
        <div class="quiz__summary-score">
          <span class="quiz__summary-bignum">${correctCount}<span class="quiz__summary-sep">/</span>${total}</span>
          <span class="quiz__summary-pct">${percent}% richtig</span>
        </div>
        <p class="quiz__summary-message">${escapeHtml(message)}</p>
        <div class="quiz__summary-actions">
          <button class="btn btn--${subjectClass} btn--block quiz__done">Zurück zum Dashboard</button>
        </div>
      </section>
    `;

    session.container.querySelector('.quiz__done').addEventListener('click', () => {
      if (typeof session.onComplete === 'function') {
        session.onComplete({
          subject, level, total,
          score: correctCount,
          passed, advanced, nextLevel,
        });
      }
    });

    if (passed && !prefersReducedMotion()) {
      spawnConfetti(session.container.querySelector('.quiz'), 48);
    }
  }

  // --- small confetti burst (CSS-driven) -----------------------------

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

  // --- grading -------------------------------------------------------

  /**
   * @param {object} q — question
   * @param {string} userAnswer
   * @returns {boolean}
   */
  function checkAnswer(q, userAnswer) {
    const correct = String(q.correctAnswer ?? '');
    const user    = String(userAnswer    ?? '');

    if (q.type === 'multiple_choice') return user === correct;       // exact
    if (q.type === 'number_input')    return normNumber(user) === normNumber(correct);
    if (q.type === 'text_input')      return normText(user)   === normText(correct);
    return user === correct;
  }

  function normNumber(s) {
    // Accept German comma or English dot. Strip whitespace. Normalize
    // trailing zeros, leading '+', and U+2212 minus (typographic) vs
    // ASCII hyphen-minus so "37", "37,0", "+37", "−2" and "-2" all
    // compare as expected. Non-numeric strings pass through literally.
    const cleaned = String(s)
      .trim()
      .replace(/\s+/g, '')
      .replace(/,/g, '.')
      .replace(/\u2212/g, '-')   // U+2212 MINUS SIGN → '-'
      .replace(/^\+/, '');
    if (cleaned === '') return '';
    const n = Number(cleaned);
    return Number.isFinite(n) ? String(n) : cleaned;
  }

  function normText(s) {
    return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // --- misc helpers --------------------------------------------------

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

  // --- expose --------------------------------------------------------

  global.VikramQuiz = Object.freeze({
    start,
    checkAnswer,
  });
})(typeof window !== 'undefined' ? window : globalThis);
