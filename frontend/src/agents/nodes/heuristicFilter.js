/**
 * Node 3.5 — Heuristic Pre-filter
 * Uses Jaccard similarity on title tokens to find candidate (task, event) pairs
 * before calling the expensive LLM endpoint.
 *
 * Strategy: For each task, pick the top-1 most similar event (if any passes threshold).
 * This reduces LLM calls from O(n×m) to O(n) at most.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'with', 'in', 'on', 'of',
  'is', 'are', 'will', 'be', 'by', 'at', 'from', 'this', 'that', 'our',
]);

/**
 * Tokenize text: lowercase, remove punctuation, filter short/stopwords.
 * @param {string} text
 * @returns {string[]}
 */
export const tokenize = (text) =>
  (text || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

/**
 * Compute Jaccard similarity between two token arrays.
 * @param {string[]} tokA
 * @param {string[]} tokB
 * @returns {number} - 0 to 1
 */
export const jaccard = (tokA, tokB) => {
  const sA = new Set(tokA);
  const sB = new Set(tokB);
  const intersection = [...sA].filter(x => sB.has(x)).length;
  const union = new Set([...sA, ...sB]).size;
  return union === 0 ? 0 : intersection / union;
};

/**
 * Get the start date timestamp from a Google Calendar event.
 * @param {object} event
 * @returns {number} - Unix timestamp in ms
 */
const getEventTimestamp = (event) => {
  const dateStr = event.start?.date || event.start?.dateTime;
  if (!dateStr) return 0;
  return new Date(dateStr).getTime();
};

/**
 * For each task in myTasks, find the single best-matching existing event.
 * Ranking: (1) highest Jaccard score, (2) closest date if scores equal.
 *
 * @param {Array} myTasks - Tasks assigned to current user
 * @param {Array} existingEvents - Google Calendar events in time window
 * @param {number} threshold - Minimum Jaccard score (default 0.3)
 * @returns {Array<{ task, event, score }>} - One entry per task that has a match
 */
export const heuristicFilter = (myTasks, existingEvents, threshold = 0.3) => {
  const candidates = [];

  for (const task of myTasks) {
    const taskTokens = tokenize(task.title);
    const taskDate = new Date(
      String(task.deadline || '')
        .replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1')
        .replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1')
    ).getTime() || 0;

    const scored = existingEvents
      .map(event => ({
        task,
        event,
        score: jaccard(taskTokens, tokenize(event.summary || '')),
      }))
      .filter(p => p.score >= threshold)
      .sort((a, b) => {
        // Primary: higher score first
        if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
        // Secondary: closer date first (tie-break)
        const distA = Math.abs(getEventTimestamp(a.event) - taskDate);
        const distB = Math.abs(getEventTimestamp(b.event) - taskDate);
        return distA - distB;
      });

    // Take only the top-1 candidate per task
    if (scored.length > 0) {
      candidates.push(scored[0]);
    }
  }

  return candidates;
};
