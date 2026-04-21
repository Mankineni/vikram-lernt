/**
 * @file storage.js — Vikram Lernt persistence layer.
 *
 * Thin wrapper around `window.localStorage` for the five app keys defined
 * in CLAUDE.md. If localStorage is unavailable (Safari private mode, disabled
 * site data, strict sandbox) the wrapper silently falls back to an in-memory
 * store so the session keeps working — data will not survive a page reload.
 *
 * Exposes a single global: `window.VikramStorage`.
 *
 * @typedef {'math'|'german'} Subject
 *
 * @typedef {Object} CompletedLevel
 * @property {number} level      — Level index (0–10).
 * @property {number} score      — Correct answers out of 10.
 * @property {string} date       — ISO timestamp when the level was completed.
 *
 * @typedef {Object} ProgressData
 * @property {number} currentLevel
 * @property {CompletedLevel[]} completedLevels
 *
 * @typedef {Object} HistoryEntry
 * @property {string} id               — Unique entry id (generated if omitted).
 * @property {Subject} subject
 * @property {number} level
 * @property {string} topic
 * @property {string} question
 * @property {string[]} [options]      — Present for multiple-choice.
 * @property {string} userAnswer
 * @property {string} correctAnswer
 * @property {string} explanation
 * @property {boolean} isCorrect
 * @property {string} timestamp        — ISO timestamp (generated if omitted).
 *
 * @typedef {Object} HistoryFilters
 * @property {Subject}  [subject]
 * @property {number}   [level]
 * @property {string}   [topic]
 * @property {boolean}  [isCorrect]
 * @property {number}   [limit]        — Return only the most recent N entries.
 *
 * @typedef {Object} Streak
 * @property {number} count
 * @property {string|null} lastDate    — YYYY-MM-DD (local time) or null.
 *
 * @typedef {Object} Settings
 * @property {string} theme            — 'auto' | 'light' | 'dark'.
 * @property {string} language         — 'de' | 'en'.
 */

(function (global) {
  'use strict';

  // --- keys ------------------------------------------------------------

  const KEYS = Object.freeze({
    progressMath:   'vikram.progress.math',
    progressGerman: 'vikram.progress.german',
    history:        'vikram.history',
    streak:         'vikram.streak',
    settings:       'vikram.settings',
  });

  const PROGRESS_KEY = { math: KEYS.progressMath, german: KEYS.progressGerman };

  const DEFAULTS = {
    /** @returns {ProgressData} */
    progress: () => ({ currentLevel: 0, completedLevels: [] }),
    /** @returns {HistoryEntry[]} */
    history:  () => [],
    /** @returns {Streak} */
    streak:   () => ({ count: 0, lastDate: null }),
    /** @returns {Settings} */
    settings: () => ({ theme: 'auto', language: 'de' }),
  };

  // --- backing store (localStorage with in-memory fallback) ------------

  const store = (function () {
    try {
      const probe = '__vl_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return { impl: global.localStorage, persistent: true };
    } catch (err) {
      console.warn('[VikramStorage] localStorage unavailable — using in-memory fallback. Progress will not persist.', err);
      const mem = new Map();
      return {
        impl: {
          getItem:    (k)    => (mem.has(k) ? mem.get(k) : null),
          setItem:    (k, v) => { mem.set(k, String(v)); },
          removeItem: (k)    => { mem.delete(k); },
        },
        persistent: false,
      };
    }
  })();

  function readJson(key, fallback) {
    try {
      const raw = store.impl.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[VikramStorage] corrupt data at ${key}; resetting.`, err);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      store.impl.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[VikramStorage] failed to write ${key}.`, err);
      return false;
    }
  }

  // --- helpers ---------------------------------------------------------

  /** Local YYYY-MM-DD for a date (defaults to now). */
  function todayLocal(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Whole days between two YYYY-MM-DD strings (b - a). */
  function daysBetween(aStr, bStr) {
    const a = new Date(`${aStr}T00:00:00`);
    const b = new Date(`${bStr}T00:00:00`);
    return Math.round((b - a) / 86_400_000);
  }

  function makeId() {
    return 'h-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function requireSubject(subject) {
    if (!PROGRESS_KEY[subject]) {
      throw new Error(`[VikramStorage] unknown subject: ${subject}. Expected 'math' or 'german'.`);
    }
  }

  // --- progress --------------------------------------------------------

  /**
   * Read progress for a subject. Returns default shape on first run.
   * @param {Subject} subject
   * @returns {ProgressData}
   */
  function getProgress(subject) {
    requireSubject(subject);
    return readJson(PROGRESS_KEY[subject], DEFAULTS.progress());
  }

  /**
   * Save progress for a subject. Shallow-merges onto the existing record so
   * callers can pass partial updates (e.g. just `{ currentLevel }`).
   * @param {Subject} subject
   * @param {Partial<ProgressData>} data
   * @returns {boolean} true if persisted.
   */
  function saveProgress(subject, data) {
    requireSubject(subject);
    const current = getProgress(subject);
    const next    = { ...current, ...data };
    return writeJson(PROGRESS_KEY[subject], next);
  }

  // --- history ---------------------------------------------------------

  /**
   * Append a Q&A entry. `id` and `timestamp` are generated if missing.
   * @param {Omit<HistoryEntry, 'id'|'timestamp'> & Partial<Pick<HistoryEntry, 'id'|'timestamp'>>} entry
   * @returns {HistoryEntry} the stored entry, with id/timestamp filled in.
   */
  function addHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('[VikramStorage] addHistoryEntry: entry must be an object.');
    }
    const stored = {
      id:        entry.id        ?? makeId(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      ...entry,
    };
    const history = readJson(KEYS.history, DEFAULTS.history());
    history.push(stored);
    writeJson(KEYS.history, history);
    // Streak advances only once per day, and only after BOTH math and german
    // have been answered that day. updateStreak is a no-op if we already
    // counted today, so calling it here is safe.
    if (hasBothSubjectsToday(history)) updateStreak();
    return stored;
  }

  function hasBothSubjectsToday(history) {
    const today = todayLocal();
    const todays = history.filter(h => typeof h.timestamp === 'string'
      && h.timestamp.slice(0, 10) === today);
    const subjects = new Set(todays.map(e => e.subject));
    return subjects.has('math') && subjects.has('german');
  }

  /**
   * Return history entries, newest last. All filters are optional and AND-ed.
   * Passing `isCorrect: false` correctly filters to wrong answers only.
   * @param {HistoryFilters} [filters]
   * @returns {HistoryEntry[]}
   */
  function getHistory(filters = {}) {
    let entries = readJson(KEYS.history, DEFAULTS.history());
    if (filters.subject   != null) entries = entries.filter(h => h.subject   === filters.subject);
    if (filters.level     != null) entries = entries.filter(h => h.level     === filters.level);
    if (filters.topic     != null) entries = entries.filter(h => h.topic     === filters.topic);
    if (filters.isCorrect != null) entries = entries.filter(h => h.isCorrect === filters.isCorrect);
    if (filters.limit     != null) entries = entries.slice(-filters.limit);
    return entries;
  }

  // --- streak ----------------------------------------------------------

  /**
   * Advance the daily streak based on today's local date.
   *   - Same day as last:          no change.
   *   - Exactly one day later:     increments count.
   *   - Two or more days gap:      resets count to 1.
   *   - First-ever call:           starts count at 1.
   * Call once per day, when the user answers their first question.
   * @returns {Streak}
   */
  function updateStreak() {
    const today  = todayLocal();
    const streak = readJson(KEYS.streak, DEFAULTS.streak());
    let count = streak.count || 0;

    if (streak.lastDate === today) {
      // already counted today — no change
    } else if (streak.lastDate && daysBetween(streak.lastDate, today) === 1) {
      count += 1;
    } else {
      count = 1;
    }

    const next = { count, lastDate: today };
    writeJson(KEYS.streak, next);
    return next;
  }

  // --- bulk ------------------------------------------------------------

  /** Remove every `vikram.*` key from storage. Irreversible. */
  function clearAll() {
    for (const key of Object.values(KEYS)) {
      try { store.impl.removeItem(key); } catch (_) { /* swallow */ }
    }
  }

  /**
   * Serialize every stored value into a plain object suitable for
   * JSON.stringify + download. Missing slots are filled with defaults so
   * the shape is always complete.
   * @returns {{version: number, exportedAt: string, progress: {math: ProgressData, german: ProgressData}, history: HistoryEntry[], streak: Streak, settings: Settings}}
   */
  function exportData() {
    return {
      version:    1,
      exportedAt: new Date().toISOString(),
      progress: {
        math:   getProgress('math'),
        german: getProgress('german'),
      },
      history:  readJson(KEYS.history,  DEFAULTS.history()),
      streak:   readJson(KEYS.streak,   DEFAULTS.streak()),
      settings: readJson(KEYS.settings, DEFAULTS.settings()),
    };
  }

  // --- expose ----------------------------------------------------------

  global.VikramStorage = Object.freeze({
    getProgress,
    saveProgress,
    addHistoryEntry,
    getHistory,
    updateStreak,
    clearAll,
    exportData,
  });
})(typeof window !== 'undefined' ? window : globalThis);
