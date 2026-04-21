/**
 * @file app.js — glue code: routing, dashboard rendering, and navigation.
 *
 * Responsibilities:
 *   - render the home dashboard with live progress + streak from storage
 *   - handle "Heute üben" → start a level round in quiz.js
 *   - handle bottom-tab navigation (Mathe / Deutsch)
 *   - handle hamburger drawer links (Verlauf / Zeugnis / Einstellungen / Über)
 *     via hash-based routes so the CSS-only drawer keeps working without
 *     intercepting its <a href="#..."> clicks
 *   - re-render dashboard after quiz rounds so progress stays in sync
 *
 * Depends on: storage.js, questions.js, quiz.js (and optionally
 * history.js / report.js when those modules land).
 */

(function (global) {
  'use strict';

  const LEVEL_NAMES = {
    0: 'Einsteiger',
    1: 'Leicht',
    2: 'Leicht',
    3: 'Mittel',
    4: 'Mittel',
    5: 'Fortgeschritten',
    6: 'Fortgeschritten',
    7: 'Schwer',
    8: 'Schwer',
    9: 'Experte',
    10: 'Experte',
  };

  const ROUTES = {
    '':         renderHome,
    'home':     renderHome,
    'history':  renderHistoryView,
    'zeugnis':  renderZeugnisView,
    'settings': renderSettingsView,
    'about':    renderAboutView,
  };

  let mainEl, drawerToggle;

  // --- init -----------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    mainEl       = document.getElementById('main');
    drawerToggle = document.getElementById('drawer-toggle');
    if (!mainEl) return;

    wireGlobalEvents();

    // Clean up any leftover finalized session before the first render —
    // the round is already saved to progress, the session key is just a
    // stale marker.
    const pending = global.VikramStorage.getSession();
    if (pending && pending.finalized) global.VikramStorage.clearSession();

    routeFromHash();
    updateStreakDisplay();
  }

  function resumeQuiz() {
    closeDrawer();
    mainEl.innerHTML = `<div id="quiz-root" class="quiz-root"></div>`;
    const container = document.getElementById('quiz-root');
    const resumed = global.VikramQuiz.resume({
      container,
      onComplete: onQuizComplete,
    });
    if (!resumed) {
      global.VikramStorage.clearSession();
      renderHome();
    }
  }

  function onQuizComplete() {
    global.VikramStorage.clearSession();
    if (global.location.hash) global.location.hash = '';
    else renderHome();
    updateStreakDisplay();
  }

  // --- routing --------------------------------------------------------

  function wireGlobalEvents() {
    window.addEventListener('hashchange', routeFromHash);

    document.querySelectorAll('.bottomnav__tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const subject = btn.classList.contains('bottomnav__tab--math') ? 'math' : 'german';
        activateTab(subject);
        goHomeAndScrollTo(subject);
      });
    });

    // Labels pointing at the drawer checkbox aren't natively keyboard-
    // activatable. Let Enter and Space toggle the drawer to match a real
    // button's behaviour.
    document.querySelectorAll('label[for="drawer-toggle"]').forEach(label => {
      label.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (drawerToggle) drawerToggle.checked = !drawerToggle.checked;
        }
      });
    });
  }

  function routeFromHash() {
    const raw = (global.location.hash || '').replace(/^#/, '');
    closeDrawer();

    if (raw === 'quiz-math')   { startQuiz('math');   return; }
    if (raw === 'quiz-german') { startQuiz('german'); return; }

    const handler = ROUTES[raw] || renderHome;
    handler();
  }

  function closeDrawer() {
    if (drawerToggle && drawerToggle.checked) drawerToggle.checked = false;
  }

  function goHomeAndScrollTo(subject) {
    if (global.location.hash) {
      // hashchange will trigger renderHome; schedule the scroll for after
      const onHash = () => {
        scrollToCard(subject);
        global.removeEventListener('hashchange', onHash);
      };
      global.addEventListener('hashchange', onHash);
      global.location.hash = '';
    } else {
      renderHome();
      scrollToCard(subject);
    }
  }

  function scrollToCard(subject) {
    const card = document.querySelector(`.levelcard--${subject}`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function activateTab(subject) {
    document.querySelectorAll('.bottomnav__tab').forEach(b => {
      const isMe = b.classList.contains(`bottomnav__tab--${subject}`);
      if (isMe) b.setAttribute('aria-current', 'page');
      else      b.removeAttribute('aria-current');
    });
  }

  // --- dashboard ------------------------------------------------------

  function renderHome() {
    const mathP   = global.VikramStorage.getProgress('math');
    const germanP = global.VikramStorage.getProgress('german');
    const session = getResumableSession();

    mainEl.innerHTML = `
      <section class="dashboard" aria-labelledby="dashboard-title">
        <h2 id="dashboard-title" class="section-title">Heute üben</h2>
        <p class="section-subtitle">Eine Aufgabe pro Fach. Los geht's!</p>
        ${levelCardHtml('math',   mathP,   session)}
        ${levelCardHtml('german', germanP, session)}
      </section>
    `;

    mainEl.querySelectorAll('[data-action="start"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        startQuiz(btn.dataset.subject);
      });
    });
    mainEl.querySelectorAll('[data-action="resume"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        resumeQuiz();
      });
    });

    updateStreakDisplay();
  }

  function getResumableSession() {
    const s = global.VikramStorage.getSession();
    if (!s || !Array.isArray(s.questions) || s.questions.length === 0) return null;
    if (s.finalized) return null;   // round is done, nothing to resume
    return s;
  }

  function levelCardHtml(subject, progress, pendingSession) {
    const emoji     = subject === 'math' ? '📐' : '📖';
    const title     = subject === 'math' ? 'Mathe' : 'Deutsch';
    const level     = progress.currentLevel;
    const levelName = LEVEL_NAMES[level] || '';
    const stats     = lastLevelStats(progress);
    const pct       = stats.score != null ? Math.round((stats.score / 10) * 100) : 0;

    const hasPendingHere = pendingSession && pendingSession.subject === subject;

    let meta;
    if (hasPendingHere) {
      const total = pendingSession.questions.length;
      const pos   = Math.min((pendingSession.index || 0) + 1, total);
      meta = `Angefangen: Frage ${pos} von ${total} auf Level ${pendingSession.level}`;
    } else if (stats.score != null) {
      meta = `Letzter Versuch: ${stats.score} von 10`;
    } else {
      meta = level === 0
        ? 'Noch nicht gestartet — los geht\u2019s!'
        : 'Bereit für eine neue Runde.';
    }

    const buttons = hasPendingHere
      ? `
        <button class="btn btn--block btn--${subject}" type="button"
                data-action="resume" data-subject="${subject}">
          ▶ Weitermachen
        </button>
        <button class="btn btn--block btn--ghost" type="button"
                data-action="start" data-subject="${subject}">
          ↻ Neu starten
        </button>
      `
      : `
        <button class="btn btn--block btn--${subject}" type="button"
                data-action="start" data-subject="${subject}">
          Starten
        </button>
      `;

    return `
      <article class="levelcard levelcard--${subject}" aria-labelledby="${subject}-card-title">
        <header class="levelcard__header">
          <span class="levelcard__icon" aria-hidden="true">${emoji}</span>
          <h3 id="${subject}-card-title" class="levelcard__title">${title}</h3>
        </header>
        <p class="levelcard__level">
          <span class="levelcard__level-label">Level</span>
          <span class="levelcard__level-number">${level}</span>
          ${levelName ? `<span class="levelcard__level-name">· ${levelName}</span>` : ''}
        </p>
        <div class="progress" role="progressbar"
             aria-label="Letztes Ergebnis Level ${level}"
             aria-valuemin="0" aria-valuemax="10" aria-valuenow="${stats.score ?? 0}">
          <div class="progress__bar" style="width: ${pct}%"></div>
        </div>
        <p class="levelcard__meta">${meta}</p>
        <div class="levelcard__actions">
          ${buttons}
        </div>
      </article>
    `;
  }

  function lastLevelStats(progress) {
    const forCurrent = progress.completedLevels.filter(c => c.level === progress.currentLevel);
    const last = forCurrent.length > 0 ? forCurrent[forCurrent.length - 1] : null;
    return { score: last ? last.score : null, date: last ? last.date : null };
  }

  function updateStreakDisplay() {
    // Read via exportData — storage.js doesn't expose a dedicated getter,
    // but exportData returns the full shape and is cheap (5 small reads).
    const { streak } = global.VikramStorage.exportData();
    const count = streak.count || 0;

    const el = document.querySelector('.topbar__streak-count');
    if (el) el.textContent = String(count);

    const wrap = document.querySelector('.topbar__streak');
    if (wrap) {
      wrap.setAttribute('aria-label', `Lernserie: ${count} Tage`);
      wrap.classList.toggle('topbar__streak--active', count > 0);
    }
  }

  // --- quiz -----------------------------------------------------------

  async function startQuiz(subject) {
    closeDrawer();
    // Starting a new round abandons any prior in-progress session.
    global.VikramStorage.clearSession();
    mainEl.innerHTML = `<div id="quiz-root" class="quiz-root"></div>`;
    const container = document.getElementById('quiz-root');

    try {
      await global.VikramQuiz.start({
        subject,
        container,
        onComplete: onQuizComplete,
      });
    } catch (err) {
      console.error('[app] quiz failed to start', err);
      container.innerHTML = `
        <div class="quiz__error">
          <p>Ups — die Fragen konnten nicht geladen werden.</p>
          <p>Tipp: Die App muss über HTTP laufen (nicht <code>file://</code>).</p>
          <button class="btn btn--math btn--block" onclick="location.hash=''">Zurück</button>
        </div>
      `;
    }
  }

  // --- other views (minimal until their modules land) -----------------

  function renderHistoryView() {
    if (global.VikramHistory && typeof global.VikramHistory.render === 'function') {
      mainEl.innerHTML = '';
      global.VikramHistory.render(mainEl);
      return;
    }
    placeholder('Verlauf', 'Der Verlauf wird in einer kommenden Version angezeigt.');
  }

  function renderZeugnisView() {
    if (global.VikramReport && typeof global.VikramReport.render === 'function') {
      mainEl.innerHTML = '';
      global.VikramReport.render(mainEl);
      return;
    }
    placeholder('Zeugnis', 'Das Zeugnis wird generiert, sobald 3 Level pro Fach abgeschlossen sind.');
  }

  function renderSettingsView() {
    mainEl.innerHTML = `
      <section class="settings" aria-labelledby="settings-title">
        <h2 id="settings-title" class="section-title">Einstellungen</h2>
        <p class="section-subtitle">Verwalte deine Daten.</p>
        <div class="settings__group">
          <button class="btn btn--math btn--block" id="btn-export">Daten exportieren (JSON)</button>
          <button class="btn btn--german btn--block" id="btn-clear">Alle Daten löschen</button>
          <a class="btn btn--block btn--ghost" href="#">Zurück zum Dashboard</a>
        </div>
      </section>
    `;
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (global.confirm('Alle Fortschritte und der Verlauf werden unwiderruflich gelöscht. Fortfahren?')) {
        global.VikramStorage.clearAll();
        global.location.hash = '';
        renderHome();
      }
    });
  }

  function renderAboutView() {
    mainEl.innerHTML = `
      <section class="about" aria-labelledby="about-title">
        <h2 id="about-title" class="section-title">Über Vikram Lernt</h2>
        <p>Vikram Lernt ist eine tägliche Übungs-App für Mathe und Deutsch,
           angelehnt an das Niedersachsen-Kerncurriculum Klasse 6.</p>
        <p>Alle Daten bleiben auf deinem Gerät. Die App funktioniert auch offline.</p>
        <a class="btn btn--math btn--block" href="#">Zurück zum Dashboard</a>
      </section>
    `;
  }

  function placeholder(title, msg) {
    mainEl.innerHTML = `
      <section>
        <h2 class="section-title">${escape(title)}</h2>
        <p class="section-subtitle">${escape(msg)}</p>
        <a class="btn btn--math btn--block" href="#">Zurück zum Dashboard</a>
      </section>
    `;
  }

  // --- data export ----------------------------------------------------

  function exportData() {
    const data = global.VikramStorage.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vikram-lernt-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- helpers --------------------------------------------------------

  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
})(typeof window !== 'undefined' ? window : globalThis);
