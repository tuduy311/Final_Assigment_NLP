/**
 * Node 2 — Me Filter
 * Splits multi-assignee strings, checks each entity against Me/userName.
 * Handles null assignees by queuing them for user confirmation.
 * otherTasks are silently dropped — not synced.
 */

/**
 * Split an assignee string like "Bill, Seth" or "Bill and Seth" into individual names.
 * @param {string|null} assigneeStr
 * @returns {string[]}
 */
export const splitAssignees = (assigneeStr) => {
  if (!assigneeStr || !String(assigneeStr).trim()) return [];
  return String(assigneeStr)
    .split(/,|\band\b/i)
    .map(s => s.trim())
    .filter(Boolean);
};

/**
 * Check if a single name refers to the current user.
 * @param {string} name
 * @param {string|null} userName - The resolved real name of the user (e.g., "John")
 * @returns {boolean}
 */
export const isSelf = (name, userName) => {
  const n = (name || '').toLowerCase().trim();
  if (n === 'me') return true;
  if (userName && n === userName.toLowerCase().trim()) return true;
  return false;
};

/**
 * Partition tasks into myTasks and nullAssigneeTasks.
 * otherTasks (assigned to someone else) are silently dropped.
 *
 * @param {Array} tasks - All validated tasks
 * @param {string|null} userName
 * @returns {{
 *   myTasks: Array,          - Tasks clearly assigned to the current user
 *   nullAssigneeTasks: Array - Tasks with no assignee — need user confirmation
 * }}
 */
export const partitionTasks = (tasks, userName) => {
  const myTasks = [];
  const nullAssigneeTasks = [];

  for (const task of tasks) {
    const assignees = splitAssignees(task.assignee);

    if (assignees.length === 0) {
      // No assignee — ask user
      nullAssigneeTasks.push(task);
      continue;
    }

    if (assignees.some(a => isSelf(a, userName))) {
      myTasks.push(task);
    }
    // else: other people's tasks — drop silently
  }

  return { myTasks, nullAssigneeTasks };
};
