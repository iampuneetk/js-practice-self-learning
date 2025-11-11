// app.js
// Module of *pure-logic* factories that encapsulate private state via closures.
// No DOM, timers, or globals here—callers drive it and render however they want.
//
// Why closures?
// - Each factory below returns functions that *close over* private variables.
// - As long as the returned functions are reachable, the closed-over variables
//   remain alive on the heap (not the stack). That's power (persistent state)
//   but also risk (accidental retention / memory leaks if you capture too much).

/**
 * createCounter: returns a small state machine using closures.
 * Note: We consider this "pure-logic" (no I/O), though `increment()` mutates
 * the internal binding. From the outside, state remains encapsulated.
 */
export function createCounter(initial = 0) {
  // This `value` lives in the closure's environment record.
  let value = Number.isFinite(initial) ? Math.trunc(initial) : 0;

  // Exposed operations that *close over* `value`.
  function increment(step = 1) {
    value += Math.trunc(step);
    return value;
  }
  function decrement(step = 1) {
    value -= Math.trunc(step);
    return value;
  }
  function reset(next = 0) {
    value = Math.trunc(next);
    return value;
  }
  function get() {
    return value;
  }

  // A tiny "snapshot" avoids leaking the live closure:
  // callers can persist plain data instead of the whole instance.
  function snapshot() {
    return { value };
  }

  // No "dispose" needed because we don't hold external refs.

  return Object.freeze({ increment, decrement, reset, get, snapshot });
}

/**
 * createQuiz: immutable questions in, closure-managed progress out.
 * The API never exposes the `questions` array itself—only copies/indices.
 */
export function createQuiz(questionsInput) {
  // Defensive copy to avoid retaining caller's potentially giant object graph.
  // This also prevents accidental external mutation.
  const questions = questionsInput.map(q => ({
    id: q.id,
    text: q.text,
    choices: q.choices.slice(),
    answer: q.answer,
  }));

  // Private state:
  let index = 0;
  let correct = 0;
  // Store only minimal per-question user data to avoid leaks.
  // (No DOM nodes, no big blobs.)
  const userAnswers = new Map(); // id -> choiceIndex

  // Expose readonly view of current question (by value, not by reference).
  function getCurrent() {
    const q = questions[index];
    return {
      id: q.id,
      text: q.text,
      choices: q.choices.slice(),
      // Do NOT expose `answer` here; keep it private to avoid UI coupling.
      index,
      total: questions.length,
      isLast: index === questions.length - 1,
      isFirst: index === 0
    };
  }

  function answer(choiceIndex) {
    const q = questions[index];
    if (!q) return { ok: false, reason: "no-question" };
    if (choiceIndex < 0 || choiceIndex >= q.choices.length) {
      return { ok: false, reason: "invalid-choice" };
    }

    // If user changes answer, adjust score correctly.
    const prev = userAnswers.get(q.id);
    const wasCorrect = prev === q.answer;
    const nowCorrect = choiceIndex === q.answer;

    if (!wasCorrect && nowCorrect) correct += 1;
    if (wasCorrect && !nowCorrect) correct -= 1;

    userAnswers.set(q.id, choiceIndex);
    return { ok: true, correct: nowCorrect, chosen: choiceIndex };
  }

  function next() {
    if (index < questions.length - 1) index += 1;
    return getCurrent();
  }
  function prev() {
    if (index > 0) index -= 1;
    return getCurrent();
  }

  function score() {
    return { correct, total: questions.length };
  }

  function isFinished() {
    // Finished when all have an answer
    return userAnswers.size === questions.length;
  }

  function restart() {
    index = 0;
    correct = 0;
    userAnswers.clear();
    return getCurrent();
  }

  function getAnswerStatus() {
    // Returns a small, leak-safe summary for UI
    return questions.map(q => ({
      id: q.id,
      chosen: userAnswers.has(q.id) ? userAnswers.get(q.id) : null
    }));
  }

  // A leak-safe snapshot: serializable data, not live closures or DOM
  function snapshot() {
    return {
      index,
      correct,
      total: questions.length,
      answers: Array.from(userAnswers.entries())
    };
  }

  // "Dispose" pattern: if the engine had outward refs (timers, listeners),
  // we would release them here. Provided for symmetry / future-proofing.
  function dispose() {
    userAnswers.clear();
    // No timers / DOM refs, so nothing else to drop.
  }

  return Object.freeze({
    getCurrent,
    answer,
    next,
    prev,
    score,
    isFinished,
    restart,
    getAnswerStatus,
    snapshot,
    dispose
  });
}

/**
 * Anti-pattern example (DON'T USE): a cache that leaks.
 * Shows how closures can keep large objects alive accidentally.
 */
export function makeLeakyCache() {
  // This array will grow forever unless callers call `clear` or drop the cache.
  const bigRetention = [];

  function add(item) {
    // ❌ If `item` contains DOM nodes, images, or huge graphs, they stick around.
    bigRetention.push(item);
  }
  function size() {
    return bigRetention.length;
  }
  function clear() {
    // Drop references so GC can reclaim memory.
    bigRetention.length = 0;
  }

  return { add, size, clear };
}

/**
 * Safer alternative: WeakMap keyed by objects you don't own.
 * If the key becomes unreachable elsewhere, GC can reclaim entries.
 */
export function makeEphemeralMetaStore() {
  const meta = new WeakMap();
  function set(obj, data) { meta.set(obj, data); }
  function get(obj) { return meta.get(obj); }
  function has(obj) { return meta.has(obj); }
  // No manual clear needed—entries vanish when keys are collected.
  return { set, get, has };
}
