/**
 * Node 6 — Intent Router
 * Combines myTasks (after dialog) and builds the final execution plan.
 * Each entry has: { task, intent, existingEventId? }
 *
 * Intents:
 *   CREATE     — No conflict, just create a new event
 *   RESCHEDULE — DELETE existing + CREATE new (different date, same task)
 *   PATCH      — Update title+description of existing (same task, same date)
 *   SKIP       — User chose to skip, do nothing
 */

/**
 * Build final execution plan from resolved tasks.
 *
 * @param {Array} myTasks - Tasks assigned to user (no conflict info)
 * @param {Map<number, { intent, existingEventId? }>} conflictDecisions
 *        Map from task.id → user's decision for conflicting tasks
 * @returns {Array<{ task, intent, existingEventId? }>}
 */
export const intentRouter = (myTasks, conflictDecisions = new Map()) => {
  return myTasks.map(task => {
    const decision = conflictDecisions.get(task._id ?? task.id);

    if (decision) {
      return {
        task,
        intent: decision.intent,
        existingEventId: decision.existingEventId || null,
      };
    }

    // No conflict detected → default CREATE
    return {
      task,
      intent: 'CREATE',
      existingEventId: null,
    };
  });
};
