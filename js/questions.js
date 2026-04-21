/**
 * @file questions.js — loads per-level question banks from /data.
 *
 * Exposes `window.VikramQuestions` with three async methods:
 *   - loadLevel(subject, level)          → loads one level's JSON (cached)
 *   - getCurrentLevelQuestions(subject)  → current level per user progress
 *   - getTodaysQuestions()               → { math, german } picked from each
 *                                          subject's current level, preferring
 *                                          questions the user hasn't seen yet
 *
 * All loads are memoized in an in-memory Map, so revisiting a level in the
 * same session doesn't refetch. Call `VikramQuestions.clearCache()` if you
 * want a fresh read (e.g. after editing a JSON locally).
 *
 * Depends on: storage.js (for progress + history lookup).
 */

(function (global) {
  'use strict';

  /** key = `${subject}-${level}` → Promise<Question[]> */
  const cache = new Map();

  /**
   * Fetch a level's questions. Returns the same Promise for repeat calls
   * (we cache the Promise, not just the value — so concurrent callers share
   * the single in-flight request).
   * @param {'math'|'german'} subject
   * @param {number} level
   * @returns {Promise<Array<object>>}
   */
  function loadLevel(subject, level) {
    requireSubject(subject);
    const key = `${subject}-${level}`;
    if (cache.has(key)) return cache.get(key);

    const url = `data/${subject}/level-${level}.json`;
    const promise = fetch(url, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => Array.isArray(data.questions) ? data.questions : [])
      .catch((err) => {
        cache.delete(key);          // don't cache failures
        throw err;
      });

    cache.set(key, promise);
    return promise;
  }

  /**
   * Return the questions of the user's current level for a subject.
   * @param {'math'|'german'} subject
   * @returns {Promise<Array<object>>}
   */
  function getCurrentLevelQuestions(subject) {
    requireSubject(subject);
    const progress = global.VikramStorage.getProgress(subject);
    return loadLevel(subject, progress.currentLevel);
  }

  /**
   * Return today's practice pair: one random unanswered question per subject
   * drawn from each subject's current level. Falls back to any question in
   * the level if everything has been seen.
   * @returns {Promise<{
   *   math: object|null,
   *   german: object|null,
   *   level: { math: number, german: number }
   * }>}
   */
  async function getTodaysQuestions() {
    const [mathQs, germanQs] = await Promise.all([
      getCurrentLevelQuestions('math'),
      getCurrentLevelQuestions('german'),
    ]);

    return {
      math:   pickUnanswered(mathQs,   'math'),
      german: pickUnanswered(germanQs, 'german'),
      level: {
        math:   global.VikramStorage.getProgress('math').currentLevel,
        german: global.VikramStorage.getProgress('german').currentLevel,
      },
    };
  }

  /** Drop memoized results. Next loadLevel call re-fetches. */
  function clearCache() { cache.clear(); }

  // --- helpers --------------------------------------------------------

  function pickUnanswered(questions, subject) {
    if (!questions || questions.length === 0) return null;

    const history = global.VikramStorage.getHistory({ subject });
    // Match on question id if the history entry carries one, otherwise on
    // question text. Either works uniquely within a subject's question bank.
    const seenIds   = new Set(history.map(h => h.questionId).filter(Boolean));
    const seenTexts = new Set(history.map(h => h.question));

    const unseen = questions.filter(
      q => !seenIds.has(q.id) && !seenTexts.has(q.question)
    );
    const pool = unseen.length > 0 ? unseen : questions;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function requireSubject(subject) {
    if (subject !== 'math' && subject !== 'german') {
      throw new Error(`[VikramQuestions] unknown subject: ${subject}`);
    }
  }

  // --- expose ---------------------------------------------------------

  global.VikramQuestions = Object.freeze({
    loadLevel,
    getCurrentLevelQuestions,
    getTodaysQuestions,
    clearCache,
  });
})(typeof window !== 'undefined' ? window : globalThis);
