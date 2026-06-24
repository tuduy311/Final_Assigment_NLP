/**
 * Node 1 — Pre-flight Validator
 * Validates deadline format for all tasks after Phase 0 merge.
 * Returns { valid: true } or { valid: false, invalidTasks: [] }
 */

const VALID_DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,          // YYYY-MM-DD
  /^\d{2}\/\d{2}\/\d{4}$/,        // DD/MM/YYYY
  /^\d{2}-\d{2}-\d{4}$/,          // DD-MM-YYYY
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, // ISO datetime
];

export const isValidDateFormat = (deadline) => {
  if (!deadline || !String(deadline).trim()) return false;
  return VALID_DATE_PATTERNS.some(p => p.test(String(deadline).trim()));
};

/**
 * @param {Array} tasks - All tasks after Phase 0 merge
 * @returns {{ valid: boolean, invalidTasks: Array }}
 */
export const preflightValidator = (tasks) => {
  const invalidTasks = tasks.filter(
    task => task.deadline && !isValidDateFormat(task.deadline)
  );

  return {
    valid: invalidTasks.length === 0,
    invalidTasks,
  };
};
