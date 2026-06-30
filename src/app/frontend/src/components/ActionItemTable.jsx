import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2, Calendar as CalendarIcon, User, PlusCircle, Loader2,
  AlignLeft, Clock, Trash2, X, ChevronDown, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCalendarSyncAgent, SYNC_STATES } from '../agents/calendarSyncAgent';
import { CalendarSyncDialog } from './CalendarSyncDialog';
import { CalendarSyncResult } from './CalendarSyncResult';
import { saveActionItems } from '../services/api';

// ─── helpers ────────────────────────────────────────────────────────────────

const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00';
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/** Format a YYYY-MM-DD string to a human-readable date (e.g. "Mon, 30 Jun 2025") */
const formatDateDisplay = (isoStr) => {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr || '';
  try {
    const d = new Date(isoStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoStr;
  }
};

const extractDeadlineInfo = (deadlineValue) => {
  if (!deadlineValue) return { display: '', calendarValue: '', isResolved: false, rawPhrase: '', confidence: null };
  if (typeof deadlineValue === 'object') {
    const resolved = deadlineValue.resolved || null;
    const raw = deadlineValue.raw_phrase || '';
    const confidence = deadlineValue.confidence || 'low';
    return { display: resolved || raw || '', calendarValue: resolved || '', isResolved: !!resolved, rawPhrase: raw, confidence };
  }
  const isIso = /^\d{4}-\d{2}-\d{2}$/.test(deadlineValue);
  return { display: deadlineValue, calendarValue: deadlineValue, isResolved: isIso, rawPhrase: deadlineValue, confidence: null };
};

let _nextId = 1000;
const nextId = () => String(++_nextId);

// ─── DatePickerCell ─────────────────────────────────────────────────────────
/**
 * A user-friendly date cell:
 * - Shows a human-readable text label when a date is set
 * - Clicking the label / the calendar icon opens the native date input
 * - Clear (×) button removes the date
 */
const DatePickerCell = ({ value, rawPhrase, isResolved, confidence, disabled, onChange }) => {
  const humanLabel = isResolved && value ? formatDateDisplay(value) : null;
  const unresolved = !isResolved && rawPhrase;

  return (
    <div className="flex flex-col gap-1 w-full relative">
      {/* Trigger row */}
      <div
        className={`relative flex items-center gap-2 min-h-[36px] px-3 py-1.5 border rounded-md transition-colors select-none overflow-hidden
          ${disabled ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed' :
            humanLabel ? 'bg-green-50 border-green-300 hover:border-green-500' :
            'bg-white border-gray-300 hover:border-indigo-400'}`}
      >
        <CalendarIcon className={`w-4 h-4 flex-shrink-0 ${humanLabel ? 'text-green-600' : 'text-gray-400'}`} />

        {humanLabel ? (
          <span className="text-sm font-medium text-green-800 flex-1 truncate">{humanLabel}</span>
        ) : (
          <span className="text-sm text-gray-400 flex-1 italic truncate">No deadline set</span>
        )}

        {/* Hidden native date input layered over the cell */}
        {!disabled && (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onClick={(e) => {
              try {
                if (e.target.showPicker) e.target.showPicker();
              } catch (err) {}
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ color: 'transparent' }}
            title="Select date"
          />
        )}

        {/* Clear button must be z-10 to be clickable over the input */}
        {humanLabel && !disabled && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange('');
            }}
            className="relative z-10 ml-auto p-0.5 rounded hover:bg-green-200 text-green-600 hover:text-green-800 transition-colors"
            title="Clear date"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Badges */}
      {unresolved && (
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium leading-tight">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>Unresolved: &ldquo;{rawPhrase}&rdquo;</span>
        </span>
      )}
      {isResolved && rawPhrase && rawPhrase !== value && (
        <span className="text-[11px] text-green-600 font-medium leading-tight">
          ✅ Resolved from: &ldquo;{rawPhrase}&rdquo;
        </span>
      )}
    </div>
  );
};

// ─── ActionItemTable ─────────────────────────────────────────────────────────

export const ActionItemTable = ({ items, onSeek, userName, audioId }) => {
  const { accessToken } = useAuth();
  const agent = useCalendarSyncAgent();
  const [editableItems, setEditableItems] = useState([]);
  const lastKeyRef = useRef(null);
  const isInitialMount = useRef(true);

  // Sync from props (but only when source data actually changes)
  useEffect(() => {
    if (!items) return;
    const key = JSON.stringify(items.map(i => ({ t: i.title || i.task, d: i.deadline, a: i.assignee || i.assignees })));
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setEditableItems(items.map((item, idx) => {
      const info = extractDeadlineInfo(item.deadline);
      return {
        ...item,
        _id: String(idx),
        selected: true,
        title: item.title || item.task || '',
        description: item.description || '',
        note: item.note || '',
        reference_segments: item.reference_segments || [],
        assignee: item.assignees ? item.assignees.join(', ') : (item.assignee || item.owner || ''),
        deadline: info.calendarValue,
        deadlineResolved: info.isResolved,
        deadlineRaw: info.rawPhrase,
        deadlineConfidence: info.confidence,
      };
    }));
  }, [items]);

  // Auto-save changes to the backend
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!audioId) return;

    const handler = setTimeout(() => {
      const payload = editableItems.map(item => {
        const { deadline, deadlineResolved, deadlineRaw, deadlineConfidence, ...rest } = item;
        let finalDeadline = deadline;
        if (!deadlineResolved && deadlineRaw) {
          finalDeadline = { raw_phrase: deadlineRaw, resolved: null, confidence: deadlineConfidence || 'low' };
        } else if (deadlineResolved && deadlineRaw) {
          finalDeadline = { raw_phrase: deadlineRaw, resolved: deadline, confidence: deadlineConfidence || 'high' };
        }
        return { ...rest, deadline: finalDeadline };
      });
      
      saveActionItems(audioId, payload).catch(err => {
        console.error("Failed to auto-save action items", err);
      });
    }, 1000);

    return () => clearTimeout(handler);
  }, [editableItems, audioId]);

  // ── mutations ──────────────────────────────────────────────────────────────

  const updateItem = useCallback((id, field, value) => {
    setEditableItems(prev => prev.map(item => {
      if (item._id !== id) return item;
      let extra = {};
      if (field === 'deadline') {
        extra = { deadlineResolved: !!value, deadlineRaw: value || item.deadlineRaw, deadlineConfidence: null };
      }
      return { ...item, [field]: value, ...extra };
    }));
  }, []);

  const toggleSelect = useCallback((id) => {
    setEditableItems(prev => prev.map(i => i._id === id ? { ...i, selected: !i.selected } : i));
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allSelected = editableItems.every(i => i.selected);
    setEditableItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  }, [editableItems]);

  const addRow = useCallback(() => {
    const id = nextId();
    setEditableItems(prev => [...prev, {
      _id: id, selected: true, title: '', description: '', note: '',
      assignee: '', deadline: '', deadlineResolved: false, deadlineRaw: '',
      deadlineConfidence: null, reference_segments: [],
    }]);
  }, []);

  const removeRow = useCallback((id) => {
    setEditableItems(prev => prev.filter(i => i._id !== id));
  }, []);

  // ── agent sync ─────────────────────────────────────────────────────────────

  const handleSyncCalendar = async () => {
    const selected = editableItems.filter(i => i.selected);
    if (selected.length === 0) {
      alert('Please select at least one task to sync.');
      return;
    }
    if (!accessToken) {
      alert('Please sign in with Google to sync the calendar.');
      return;
    }
    await agent.run(selected, userName, accessToken);
  };

  const isSyncing = agent.state !== SYNC_STATES.IDLE && agent.state !== SYNC_STATES.DONE && agent.state !== SYNC_STATES.ERROR;
  const allSelected = editableItems.length > 0 && editableItems.every(i => i.selected);
  const someSelected = editableItems.some(i => i.selected);

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No action items found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Agent overlay dialogs */}
      <CalendarSyncDialog agent={agent} />
      {agent.result && <CalendarSyncResult result={agent.result} onClose={() => agent.reset()} />}

      {/* Toolbar */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        {/* Progress / Error */}
        <div className="text-sm min-h-[24px]">
          {isSyncing && agent.progress.phase && (
            <span className="text-indigo-600 font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {agent.progress.phase}
              {agent.progress.total > 0 && ` (${agent.progress.current}/${agent.progress.total})`}
            </span>
          )}
          {agent.state === SYNC_STATES.ERROR && (
            <span className="text-rose-500 font-medium flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {agent.errorMsg}
            </span>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Add row
          </button>

          <button
            onClick={handleSyncCalendar}
            disabled={isSyncing || !someSelected}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : agent.state === SYNC_STATES.DONE ? (
              <CheckCircle2 className="w-4 h-4 text-green-300" />
            ) : (
              <CalendarIcon className="w-4 h-4" />
            )}
            {isSyncing ? 'Syncing…' : agent.state === SYNC_STATES.DONE ? 'Done!' : 'Sync to Calendar'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-xl shadow-sm bg-white overflow-hidden">
        <div className="overflow-x-auto pb-1">
          <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="px-4 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3 font-semibold text-gray-700 w-2/5">Task</th>
              <th className="px-4 py-3 font-semibold text-gray-700 w-1/5">Assignee</th>
              <th className="px-4 py-3 font-semibold text-gray-700 w-1/5">Deadline</th>
              <th className="px-4 py-3 font-semibold text-gray-700 w-1/5">Notes & Refs</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {editableItems.map((item) => {
              const disabled = !item.selected;
              return (
                <tr
                  key={item._id}
                  className={`border-b border-gray-100 align-top last:border-0 transition-colors
                    ${item.selected ? 'bg-white hover:bg-slate-50' : 'bg-gray-50/60 opacity-70'}`}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleSelect(item._id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer mt-1"
                    />
                  </td>

                  {/* Task + Description */}
                  <td className="px-4 py-3">
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={item.title || ''}
                        onChange={(e) => updateItem(item._id, 'title', e.target.value)}
                        placeholder="Task title…"
                        disabled={disabled}
                        className="w-full font-semibold text-gray-900 border border-transparent rounded-md px-2 py-1 placeholder-gray-300
                          focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 hover:border-gray-300 transition-colors bg-transparent disabled:pointer-events-none"
                      />
                      <div className="flex items-start gap-1.5">
                        <AlignLeft className="w-3.5 h-3.5 mt-1.5 flex-shrink-0 text-gray-300" />
                        <textarea
                          value={item.description || ''}
                          onChange={(e) => updateItem(item._id, 'description', e.target.value)}
                          placeholder="Description…"
                          disabled={disabled}
                          rows={2}
                          className="w-full text-gray-600 border border-transparent rounded-md px-2 py-1 placeholder-gray-300 text-xs
                            focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 hover:border-gray-300 transition-colors bg-transparent resize-y disabled:pointer-events-none"
                        />
                      </div>
                    </div>
                  </td>

                  {/* Assignee */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      <input
                        type="text"
                        value={item.assignee || ''}
                        onChange={(e) => updateItem(item._id, 'assignee', e.target.value)}
                        placeholder="Unassigned"
                        disabled={disabled}
                        className="w-full border border-transparent rounded-md px-2 py-1 text-gray-700 placeholder-gray-300
                          focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 hover:border-gray-300 transition-colors bg-transparent disabled:pointer-events-none"
                      />
                    </div>
                  </td>

                  {/* Deadline — user-friendly date cell */}
                  <td className="px-4 py-3">
                    <DatePickerCell
                      value={item.deadline}
                      rawPhrase={item.deadlineRaw}
                      isResolved={item.deadlineResolved}
                      confidence={item.deadlineConfidence}
                      disabled={disabled}
                      onChange={(val) => updateItem(item._id, 'deadline', val)}
                    />
                  </td>

                  {/* Notes + Refs */}
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <textarea
                        value={item.note || ''}
                        onChange={(e) => updateItem(item._id, 'note', e.target.value)}
                        placeholder="Add a note…"
                        disabled={disabled}
                        rows={2}
                        className="w-full border border-transparent rounded-md px-2 py-1 text-gray-600 text-xs placeholder-gray-300
                          focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 hover:border-gray-300 transition-colors bg-transparent resize-y disabled:pointer-events-none"
                      />
                      {item.reference_segments?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.reference_segments.map((ref, i) => (
                            <button
                              key={i}
                              onClick={() => onSeek?.(ref.start)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-mono border border-blue-100 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                              title={`Jump to ${formatDuration(ref.start)}`}
                            >
                              ▶ [{formatDuration(ref.start)}–{formatDuration(ref.end)}]
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Remove row */}
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => removeRow(item._id)}
                      className="p-1 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                      title="Remove row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Footer count */}
      <p className="text-xs text-gray-400 text-right">
        {editableItems.filter(i => i.selected).length} / {editableItems.length} selected
      </p>
    </div>
  );
};

export default ActionItemTable;
