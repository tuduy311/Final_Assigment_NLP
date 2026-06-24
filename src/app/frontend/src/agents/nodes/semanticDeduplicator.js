/**
 * Node 4 — Semantic Deduplicator
 * Sends candidate pairs to BE → LLM for semantic similarity verdict.
 * Falls back to CREATE-all if LLM fails.
 */

import api from '../../services/api.js';

/**
 * @param {Array<{ task, event, score }>} candidatePairs - From heuristicFilter
 * @returns {Promise<Array<{ task_id, event_id, verdict, reason, suggested_action }>>}
 *          Returns [] on failure (fallback to CREATE).
 */
export const semanticDeduplicator = async (candidatePairs) => {
  if (candidatePairs.length === 0) return [];

  const payload = {
    candidate_pairs: candidatePairs.map((p, idx) => ({
      task_id: idx,
      task_title: p.task.title || '',
      task_deadline: p.task.deadline || '',
      event_id: p.event.id,
      event_title: p.event.summary || '',
      event_start: p.event.start?.date || p.event.start?.dateTime || '',
      // Carry internal reference for resolving back after LLM
      _task_ref: p.task,
      _event_ref: p.event,
    })),
  };

  try {
    const res = await api.post('/v1/calendar/check-conflicts', payload);
    const conflicts = res.data?.conflicts || [];

    // Re-attach task/event objects using the indices
    return conflicts.map(c => ({
      ...c,
      task: candidatePairs[c.task_id]?.task,
      event: candidatePairs[c.task_id]?.event,
    })).filter(c => c.task && c.event);

  } catch (err) {
    console.warn('[Deduplicator] LLM call failed, falling back to CREATE-all:', err.message);
    return null; // null signals fallback
  }
};
