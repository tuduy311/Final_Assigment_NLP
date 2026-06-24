/**
 * calendarSyncAgent.js — v2 (robust)
 *
 * Changes from v1:
 * - Dialog timeout: if user doesn't respond in 120 s, agent auto-skips
 * - Retry wrapper: network calls retry up to 3× with exponential back-off
 * - Graceful empty-items guard at the very start
 * - Better error messages distinguishing auth vs. network vs. logic errors
 * - reset() also clears internal resolvePromise to prevent stale callbacks
 */

import { useState, useRef, useCallback } from 'react';
import { preflightValidator } from './nodes/preflightValidator.js';
import { partitionTasks } from './nodes/meFilter.js';
import { fetchRelevantEvents } from './nodes/eventFetcher.js';
import { heuristicFilter } from './nodes/heuristicFilter.js';
import { semanticDeduplicator } from './nodes/semanticDeduplicator.js';
import { intentRouter } from './nodes/intentRouter.js';
import { executeAndAggregate } from './nodes/calendarExecutor.js';

export const SYNC_STATES = {
  IDLE: 'idle',
  COLLECTING_DEADLINES: 'collecting_deadlines',
  ASKING_OWNERSHIP: 'asking_ownership',
  ASKING_EMPTY_FILTER: 'asking_empty_filter',
  FETCHING: 'fetching',
  DEDUPLICATING: 'deduplicating',
  CLARIFYING_CONFLICTS: 'clarifying_conflicts',
  EXECUTING: 'executing',
  DONE: 'done',
  ERROR: 'error',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Retry an async fn up to `attempts` times with exponential back-off. */
const withRetry = async (fn, attempts = 3, baseDelayMs = 800) => {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Don't retry auth errors
      if (err.message === 'GOOGLE_TOKEN_EXPIRED') throw err;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastErr;
};

/** Classify an error into a user-friendly message. */
const classifyError = (err) => {
  if (err.message === 'GOOGLE_TOKEN_EXPIRED') {
    return 'Phiên Google hết hạn. Vui lòng tải lại trang và đăng nhập lại.';
  }
  if (err.message?.includes('Network') || err.message?.includes('fetch')) {
    return 'Không thể kết nối mạng. Kiểm tra internet và thử lại.';
  }
  if (err.message?.includes('401') || err.message?.includes('403')) {
    return 'Không có quyền truy cập Google Calendar. Vui lòng đăng nhập lại.';
  }
  return `Có lỗi xảy ra: ${err.message}`;
};

// ─── hook ─────────────────────────────────────────────────────────────────────

export const useCalendarSyncAgent = () => {
  const [state, setState] = useState(SYNC_STATES.IDLE);
  const [progress, setProgress] = useState({ phase: '', current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  const [pendingDeadlines, setPendingDeadlines] = useState([]);
  const [pendingOwnership, setPendingOwnership] = useState(null);
  const [pendingEmptyFilter, setPendingEmptyFilter] = useState(false);
  const [pendingConflict, setPendingConflict] = useState(null);
  const [result, setResult] = useState(null);

  const memory = useRef({
    googleToken: null,
    userName: null,
    initialItems: [],
    readyTasks: [],
    myTasks: [],
    existingEvents: [],
    conflicts: [],
    conflictDecisions: new Map(),
    resolvePromise: null,
    dialogTimer: null,
  });

  const updateProgress = (phase, current = 0, total = 0) =>
    setProgress({ phase, current, total });

  const abort = useCallback((msg) => {
    setErrorMsg(msg);
    setState(SYNC_STATES.ERROR);
    // Clear any pending dialog timer
    if (memory.current.dialogTimer) {
      clearTimeout(memory.current.dialogTimer);
      memory.current.dialogTimer = null;
    }
    memory.current.resolvePromise = null;
  }, []);

  /**
   * Wait for a dialog to be resolved (user interaction).
   * Auto-resolves with `defaultValue` after `timeoutMs` if user is idle.
   */
  const awaitDialog = (timeoutMs = 120_000, defaultValue = null) =>
    new Promise((resolve) => {
      memory.current.resolvePromise = resolve;

      if (timeoutMs > 0) {
        memory.current.dialogTimer = setTimeout(() => {
          console.warn('[Agent] Dialog timed out, using default:', defaultValue);
          if (memory.current.resolvePromise === resolve) {
            memory.current.resolvePromise = null;
            resolve(defaultValue);
          }
        }, timeoutMs);
      }
    });

  const resolveDialog = useCallback((value) => {
    if (memory.current.dialogTimer) {
      clearTimeout(memory.current.dialogTimer);
      memory.current.dialogTimer = null;
    }
    if (memory.current.resolvePromise) {
      const res = memory.current.resolvePromise;
      memory.current.resolvePromise = null;
      res(value);
    }
  }, []);

  // ─── main run ──────────────────────────────────────────────────────────────

  const run = async (selectedItems, userName, googleToken) => {
    // Guard: nothing selected
    if (!selectedItems || selectedItems.length === 0) {
      return abort('Không có task nào được chọn để đồng bộ.');
    }
    if (!googleToken) {
      return abort('Bạn chưa đăng nhập Google. Vui lòng đăng nhập trước.');
    }

    setState(SYNC_STATES.IDLE);
    setErrorMsg('');
    setResult(null);

    memory.current = {
      googleToken,
      userName,
      initialItems: selectedItems,
      readyTasks: [],
      myTasks: [],
      existingEvents: [],
      conflicts: [],
      conflictDecisions: new Map(),
      resolvePromise: null,
      dialogTimer: null,
    };

    updateProgress('Initializing…');

    try {
      // ── PHASE 0: Check missing deadlines ──────────────────────────────
      const readyTasks = selectedItems.filter(t => t.deadlineResolved && t.deadline);
      const missingTasks = selectedItems.filter(t => !t.deadlineResolved || !t.deadline);

      if (missingTasks.length > 0) {
        return abort('Some selected tasks do not have a deadline. Please set a date for them or uncheck them before syncing.');
      }
      memory.current.readyTasks = readyTasks;

      // Guard: after Phase 0, do we have anything?
      if (memory.current.readyTasks.length === 0) {
        return abort('Không có task nào có ngày hợp lệ sau bước điền deadline. Vui lòng nhập ngày cho ít nhất một task.');
      }

      // ── NODE 1: Preflight Validator ─────────────────────────────────────
      const { valid, invalidTasks } = preflightValidator(memory.current.readyTasks);
      if (!valid) {
        const titles = invalidTasks.map(i => `• ${i.title || 'Task'}: "${i.deadline}"`).join('\n');
        return abort(`Đồng bộ thất bại — các task sau có định dạng ngày sai:\n${titles}\n\nVui lòng sửa lại.`);
      }

      // ── NODE 2: Me Filter ───────────────────────────────────────────────
      let { myTasks, nullAssigneeTasks } = partitionTasks(memory.current.readyTasks, userName);

      // Ask ownership for unassigned tasks (one at a time, 60 s timeout → default skip)
      for (const task of nullAssigneeTasks) {
        setState(SYNC_STATES.ASKING_OWNERSHIP);
        setPendingOwnership(task);
        const isOwner = await awaitDialog(60_000, false);
        if (isOwner) myTasks.push(task);
        setPendingOwnership(null);
      }

      // If no "my" tasks, ask whether to process all
      if (myTasks.length === 0) {
        setState(SYNC_STATES.ASKING_EMPTY_FILTER);
        setPendingEmptyFilter(true);
        const processAll = await awaitDialog(60_000, false);
        setPendingEmptyFilter(false);

        if (processAll) {
          myTasks = [...memory.current.readyTasks];
        } else {
          return abort('Cancelled sync process.');
        }
      }

      memory.current.myTasks = myTasks;

      // ── NODE 3: Fetch existing events (with retry) ──────────────────────
      setState(SYNC_STATES.FETCHING);
      updateProgress('Fetching calendar events…');

      const existingEvents = await withRetry(
        () => fetchRelevantEvents(googleToken, myTasks),
        3
      );
      memory.current.existingEvents = existingEvents;

      // ── NODE 3.5: Heuristic pre-filter ─────────────────────────────────
      setState(SYNC_STATES.DEDUPLICATING);
      updateProgress('Analysing conflicts…');
      const candidatePairs = heuristicFilter(myTasks, existingEvents, 0.3);

      // ── NODE 4: Semantic deduplication (with retry + fallback) ──────────
      let conflicts = [];
      if (candidatePairs.length > 0) {
        try {
          const result = await withRetry(() => semanticDeduplicator(candidatePairs), 2);
          conflicts = result ?? []; // null → fallback CREATE-all
        } catch (dedupErr) {
          console.warn('[Agent] Dedup failed after retries, defaulting to CREATE-all:', dedupErr.message);
          conflicts = [];
        }
      }
      memory.current.conflicts = conflicts;

      // ── NODE 5: Conflict clarification dialogs ─────────────────────────
      if (conflicts.length > 0) {
        setState(SYNC_STATES.CLARIFYING_CONFLICTS);
        for (let i = 0; i < conflicts.length; i++) {
          const conflict = conflicts[i];
          updateProgress('Resolving conflicts…', i + 1, conflicts.length);

          setPendingConflict(conflict);
          // 90 s timeout → default to CREATE (safer than UPDATE/DELETE)
          const decision = await awaitDialog(90_000, { intent: 'CREATE' });

          if (decision?.intent === 'RESCHEDULE' && decision.date) {
            conflict.task.deadline = decision.date;
          }

          memory.current.conflictDecisions.set(conflict.task._id ?? conflict.task.id, {
            intent: decision?.intent ?? 'CREATE',
            existingEventId: conflict.event?.id || conflict.event_id,
          });
        }
        setPendingConflict(null);
      }

      // ── NODE 6: Intent Router ───────────────────────────────────────────
      const finalPlan = intentRouter(myTasks, memory.current.conflictDecisions);

      // Guard: empty plan
      if (!finalPlan || (finalPlan.toCreate?.length === 0 && finalPlan.toUpdate?.length === 0 && finalPlan.toDelete?.length === 0)) {
        // Nothing to do after routing — still mark done
        setResult({ created: 0, updated: 0, deleted: 0, errors: [], skipped: myTasks.length });
        return setState(SYNC_STATES.DONE);
      }

      // ── NODE 7 & 8: Execute + Aggregate ────────────────────────────────
      setState(SYNC_STATES.EXECUTING);
      const executionResult = await withRetry(
        () => executeAndAggregate(googleToken, finalPlan, (curr, tot) =>
          updateProgress('Syncing to calendar…', curr, tot)
        ),
        2
      );

      setResult(executionResult);
      setState(SYNC_STATES.DONE);

    } catch (err) {
      console.error('[CalendarSyncAgent] Fatal error:', err);
      abort(classifyError(err));
    }
  };

  // ─── Dialog Response Handlers ─────────────────────────────────────────────

  const submitDeadline = useCallback((taskId, dateStr) => { }, []);
  const skipDeadline = useCallback((taskId) => { }, []);

  const respondOwnership = useCallback((isOwner) => resolveDialog(isOwner), [resolveDialog]);
  const respondEmptyFilter = useCallback((processAll) => resolveDialog(processAll), [resolveDialog]);
  const respondConflict = useCallback((intent, newDate = null) => resolveDialog({ intent, date: newDate }), [resolveDialog]);

  const reset = useCallback(() => {
    // Clear any lingering timer
    if (memory.current.dialogTimer) {
      clearTimeout(memory.current.dialogTimer);
      memory.current.dialogTimer = null;
    }
    memory.current.resolvePromise = null;

    setState(SYNC_STATES.IDLE);
    setErrorMsg('');
    setResult(null);
    setProgress({ phase: '', current: 0, total: 0 });
    setPendingDeadlines([]);
    setPendingOwnership(null);
    setPendingEmptyFilter(false);
    setPendingConflict(null);
  }, []);

  return {
    run, reset, state, progress, errorMsg,
    pendingDeadlines, pendingOwnership, pendingEmptyFilter, pendingConflict, result,
    submitDeadline, skipDeadline, respondOwnership, respondEmptyFilter, respondConflict,
  };
};
