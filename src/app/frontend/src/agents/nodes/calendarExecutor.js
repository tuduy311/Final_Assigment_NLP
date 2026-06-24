/**
 * Node 7 & 8 — Calendar Executor & Result Aggregator
 * Executes the final plan against Google Calendar API and aggregates results.
 */

import { createEvent, patchEvent, deleteEvent, buildEventBody } from '../googleCalendarApi.js';

/**
 * Execute the intent plan and aggregate results.
 * @param {string} googleToken - OAuth access token
 * @param {Array<{ task, intent, existingEventId? }>} finalPlan
 * @param {Function} onProgress - Callback (current, total)
 * @returns {Promise<{ created[], updated[], skipped[], failed[] }>}
 */
export const executeAndAggregate = async (googleToken, finalPlan, onProgress) => {
  const result = {
    created: [],
    updated: [],
    skipped: [],
    failed: [],
  };

  let current = 0;

  for (const item of finalPlan) {
    current++;
    if (onProgress) onProgress(current, finalPlan.length);

    const { task, intent, existingEventId } = item;

    try {
      if (intent === 'SKIP') {
        result.skipped.push(task);
        continue;
      }

      if (intent === 'CREATE') {
        await createEvent(googleToken, buildEventBody(task));
        result.created.push(task);
        continue;
      }

      if (intent === 'RESCHEDULE') {
        // DELETE old + CREATE new
        if (existingEventId) {
          try {
            await deleteEvent(googleToken, existingEventId);
          } catch (delErr) {
            if (!delErr.message.includes('404')) {
              throw delErr; // Rethrow if not 404 Not Found
            }
          }
        }
        await createEvent(googleToken, buildEventBody(task));
        result.updated.push(task);
        continue;
      }

      if (intent === 'PATCH') {
        // Update summary and description only
        if (existingEventId) {
          const body = buildEventBody(task);
          await patchEvent(googleToken, existingEventId, {
            summary: body.summary,
            description: body.description,
          });
          result.updated.push(task);
        } else {
          // Fallback if no ID
          await createEvent(googleToken, buildEventBody(task));
          result.created.push(task);
        }
        continue;
      }
    } catch (err) {
      console.error(`[Executor] Failed to process task ${task.title}:`, err);
      // Let 401 bubble up to abort everything
      if (err.message === 'GOOGLE_TOKEN_EXPIRED') throw err;

      result.failed.push({
        task,
        error: err.message,
      });
    }
  }

  return result;
};
