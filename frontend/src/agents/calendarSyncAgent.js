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

export const useCalendarSyncAgent = () => {
  const [state, setState] = useState(SYNC_STATES.IDLE);
  const [progress, setProgress] = useState({ phase: '', current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  
  // Dialog States
  const [pendingDeadlines, setPendingDeadlines] = useState([]);
  const [pendingOwnership, setPendingOwnership] = useState(null); // task object
  const [pendingEmptyFilter, setPendingEmptyFilter] = useState(false);
  const [pendingConflict, setPendingConflict] = useState(null); // { task, event, verdict, reason }
  const [result, setResult] = useState(null);

  // Internal Agent Memory
  const memory = useRef({
    googleToken: null,
    userName: null,
    initialItems: [],
    readyTasks: [],
    myTasks: [],
    otherTasks: [],
    existingEvents: [],
    conflicts: [],
    conflictDecisions: new Map(), // task.id -> { intent, existingEventId }
    resolvePromise: null, // Used to pause/resume async flows for dialogs
  });

  const updateProgress = (phase, current, total) => {
    setProgress({ phase, current, total });
  };

  const abort = (msg) => {
    setErrorMsg(msg);
    setState(SYNC_STATES.ERROR);
    memory.current.resolvePromise = null;
  };

  /**
   * Helper to await a dialog decision.
   * Sets up a promise that will be resolved by the respective respond...() function.
   */
  const awaitDialog = () => {
    return new Promise(resolve => {
      memory.current.resolvePromise = resolve;
    });
  };

  const run = async (selectedItems, userName, googleToken) => {
    setState(SYNC_STATES.IDLE);
    setErrorMsg('');
    setResult(null);

    memory.current = {
      googleToken,
      userName,
      initialItems: selectedItems,
      readyTasks: [],
      myTasks: [],
      otherTasks: [], // Note: otherTasks are dropped per plan v6, but we track them if needed
      existingEvents: [],
      conflicts: [],
      conflictDecisions: new Map(),
      resolvePromise: null,
    };

    updateProgress('Initializing', 0, 1);

    try {
      // PHASE 0: Pre-Sync (Deadlines)
      const missingDeadlines = selectedItems.filter(t => !t.deadlineResolved);
      const ready = selectedItems.filter(t => t.deadlineResolved);
      
      memory.current.readyTasks = [...ready];

      if (missingDeadlines.length > 0) {
        setState(SYNC_STATES.COLLECTING_DEADLINES);
        setPendingDeadlines(missingDeadlines);
        await awaitDialog(); 
        // Dialog will resolve this when user finishes filling or skipping all
      }

      // NODE 1: Pre-flight Validator
      const { valid, invalidTasks } = preflightValidator(memory.current.readyTasks);
      if (!valid) {
        const titles = invalidTasks.map(i => `• ${i.title || 'Action Item'}`).join('\n');
        abort(`ĐỒNG BỘ THẤT BẠI!\n\nCác công việc sau đang sai định dạng:\n${titles}\n\nVui lòng sửa lại ngày.`);
        return;
      }

      // NODE 2: Me Filter
      let { myTasks, nullAssigneeTasks } = partitionTasks(memory.current.readyTasks, userName);
      
      // Resolve null assignees
      for (const task of nullAssigneeTasks) {
        setState(SYNC_STATES.ASKING_OWNERSHIP);
        setPendingOwnership(task);
        const isOwner = await awaitDialog();
        if (isOwner) myTasks.push(task);
        setPendingOwnership(null);
      }

      // Check empty myTasks
      if (myTasks.length === 0) {
        setState(SYNC_STATES.ASKING_EMPTY_FILTER);
        setPendingEmptyFilter(true);
        const processAll = await awaitDialog();
        setPendingEmptyFilter(false);
        if (processAll) {
          myTasks = [...memory.current.readyTasks]; // Process everything
        } else {
          abort('Đã hủy đồng bộ vì không có task nào của bạn.');
          return;
        }
      }

      memory.current.myTasks = myTasks;

      // NODE 3: Fetch Events
      setState(SYNC_STATES.FETCHING);
      updateProgress('Fetching calendar events...', 0, 1);
      
      let existingEvents;
      try {
        existingEvents = await fetchRelevantEvents(googleToken, myTasks);
      } catch (err) {
        if (err.message === 'GOOGLE_TOKEN_EXPIRED') {
          return abort('Phiên Google hết hạn. Vui lòng tải lại trang và đăng nhập lại.');
        }
        throw err;
      }
      memory.current.existingEvents = existingEvents;

      // NODE 3.5: Heuristic Pre-filter
      setState(SYNC_STATES.DEDUPLICATING);
      updateProgress('Analyzing conflicts...', 0, 1);
      const candidatePairs = heuristicFilter(myTasks, existingEvents, 0.3);

      // NODE 4: Semantic Deduplicator
      const conflicts = await semanticDeduplicator(candidatePairs);
      if (conflicts === null) {
        // Fallback to CREATE all
        memory.current.conflicts = [];
      } else {
        memory.current.conflicts = conflicts;
      }

      // NODE 5: Clarification Dialog
      if (memory.current.conflicts.length > 0) {
        setState(SYNC_STATES.CLARIFYING_CONFLICTS);
        for (let i = 0; i < memory.current.conflicts.length; i++) {
          const conflict = memory.current.conflicts[i];
          updateProgress('Resolving conflicts...', i + 1, memory.current.conflicts.length);
          
          setPendingConflict(conflict);
          const decision = await awaitDialog(); // { intent, date? }
          
          if (decision.intent === 'RESCHEDULE' && decision.date) {
            // Update the task's deadline so the Executor uses the new date
            conflict.task.deadline = decision.date;
          }
          
          memory.current.conflictDecisions.set(conflict.task.id, {
            intent: decision.intent,
            existingEventId: conflict.event_id,
          });
        }
        setPendingConflict(null);
      }

      // NODE 6: Intent Router
      const finalPlan = intentRouter(myTasks, memory.current.conflictDecisions);

      // NODE 7 & 8: Executor & Result Aggregator
      setState(SYNC_STATES.EXECUTING);
      const executionResult = await executeAndAggregate(
        googleToken, 
        finalPlan, 
        (curr, tot) => updateProgress('Syncing to calendar...', curr, tot)
      );

      setResult(executionResult);
      setState(SYNC_STATES.DONE);

    } catch (err) {
      console.error('[CalendarSyncAgent] Fatal Error:', err);
      abort(`Có lỗi xảy ra: ${err.message}`);
    }
  };

  // --- Dialog Response Handlers ---

  const submitDeadline = (taskId, dateStr) => {
    const task = pendingDeadlines.find(t => t.id === taskId);
    if (task) {
      task.deadline = dateStr;
      task.deadlineResolved = true;
      memory.current.readyTasks.push(task);
    }
    const remaining = pendingDeadlines.filter(t => t.id !== taskId);
    setPendingDeadlines(remaining);
    if (remaining.length === 0 && memory.current.resolvePromise) {
      memory.current.resolvePromise();
    }
  };

  const skipDeadline = (taskId) => {
    const remaining = pendingDeadlines.filter(t => t.id !== taskId);
    setPendingDeadlines(remaining);
    if (remaining.length === 0 && memory.current.resolvePromise) {
      memory.current.resolvePromise();
    }
  };

  const respondOwnership = (isOwner) => {
    if (memory.current.resolvePromise) memory.current.resolvePromise(isOwner);
  };

  const respondEmptyFilter = (processAll) => {
    if (memory.current.resolvePromise) memory.current.resolvePromise(processAll);
  };

  const respondConflict = (intent, newDate = null) => {
    if (memory.current.resolvePromise) memory.current.resolvePromise({ intent, date: newDate });
  };

  return {
    run,
    state,
    progress,
    errorMsg,
    pendingDeadlines,
    pendingOwnership,
    pendingEmptyFilter,
    pendingConflict,
    result,
    submitDeadline,
    skipDeadline,
    respondOwnership,
    respondEmptyFilter,
    respondConflict,
  };
};
