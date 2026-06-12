import React, { useState, useEffect } from 'react';
import { CheckCircle2, Calendar as CalendarIcon, User, PlusCircle, Loader2, AlignLeft, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCalendarSyncAgent, SYNC_STATES } from '../agents/calendarSyncAgent';
import { CalendarSyncDialog } from './CalendarSyncDialog';
import { CalendarSyncResult } from './CalendarSyncResult';
import { CalendarSyncDeadlinePanel } from './CalendarSyncDeadlinePanel';

// Helper function formatDuration to format seconds into MM:SS
const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00';
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// No longer needed: isAmbiguousDate and resolveFuzzyDate were removed since Backend Agent handles all date logic.

// Extract a display string and a calendar-ready value from the (possibly object) deadline
const extractDeadlineInfo = (deadlineValue) => {
  if (!deadlineValue) return { display: '', calendarValue: '', isResolved: false, rawPhrase: '', confidence: null };
  if (typeof deadlineValue === 'object') {
    const resolved = deadlineValue.resolved || null;
    const raw = deadlineValue.raw_phrase || '';
    const confidence = deadlineValue.confidence || 'low';
    return {
      display: resolved || raw || '',
      calendarValue: resolved || '',
      isResolved: !!resolved,
      rawPhrase: raw,
      confidence,
    };
  }
  // Legacy plain string
  return { display: deadlineValue, calendarValue: deadlineValue, isResolved: false, rawPhrase: deadlineValue, confidence: null };
}

export const ActionItemTable = ({ items, onSeek, userName }) => {
  const { user, accessToken } = useAuth();
  const agent = useCalendarSyncAgent();
  const [editableItems, setEditableItems] = useState([]);
  // Track the last source items by a stable key so we don't reset user edits on every re-render
  const lastItemsKeyRef = React.useRef(null);

  useEffect(() => {
    if (!items) return;
    // Build a stable key from the item content to avoid resetting edits on re-renders
    const key = JSON.stringify(items.map(i => ({
      t: i.title || i.task,
      d: i.deadline,
      a: i.assignee || i.assignees,
    })));
    if (key === lastItemsKeyRef.current) return; // Same data → don't reset user edits
    lastItemsKeyRef.current = key;

    setEditableItems(items.map((item, idx) => {
      const deadlineInfo = extractDeadlineInfo(item.deadline);
      return {
        ...item,
        id: idx,
        selected: true,
        title: item.title || item.task || '',
        description: item.description || '',
        note: item.note || '',
        reference_segments: item.reference_segments || [],
        assignee: item.assignees ? item.assignees.join(', ') : (item.assignee || item.owner || ''),
        deadline: deadlineInfo.display,
        deadlineResolved: deadlineInfo.isResolved,
        deadlineRaw: deadlineInfo.rawPhrase,
        deadlineConfidence: deadlineInfo.confidence,
      };
    }));
  }, [items])

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No action items found</p>
      </div>
    )
  }

  const handleItemChange = (id, field, value) => {
    setEditableItems(prev => prev.map(item => {
      if (item.id === id) {
        let updates = { [field]: value };
        // If user manually edits deadline, mark it as resolved and clear the old warning
        if (field === 'deadline') {
          updates.deadlineResolved = true;
          updates.deadlineRaw = value;
          updates.deadlineConfidence = null;
        }
        return { ...item, ...updates };
      }
      return item;
    }))
  }

  const toggleSelectAll = () => {
    const allSelected = editableItems.length > 0 && editableItems.every(i => i.selected)
    setEditableItems(prev => prev.map(item => ({ ...item, selected: !allSelected })))
  }

  const handleSyncCalendar = async () => {
    const selectedItems = editableItems.filter(item => item.selected);
    if (selectedItems.length === 0) {
      alert('Vui lòng chọn ít nhất 1 công việc để thêm vào lịch.');
      return;
    }
    if (!accessToken) {
      alert('Vui lòng đăng nhập Google để đồng bộ lịch.');
      return;
    }

    // Run the agent!
    await agent.run(selectedItems, userName, accessToken);
  };

  const isSyncing = agent.state !== SYNC_STATES.IDLE && agent.state !== SYNC_STATES.DONE && agent.state !== SYNC_STATES.ERROR;

  return (
    <div className="space-y-4">
      <CalendarSyncDeadlinePanel agent={agent} />
      <CalendarSyncDialog agent={agent} />
      {agent.result && <CalendarSyncResult result={agent.result} onClose={() => agent.reset()} />}

      <div className="flex justify-between items-center">
        <div className="text-sm">
          {isSyncing && agent.progress.phase && (
            <span className="text-indigo-600 font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {agent.progress.phase} {agent.progress.total > 0 ? `(${agent.progress.current}/${agent.progress.total})` : ''}
            </span>
          )}
          {agent.state === SYNC_STATES.ERROR && (
            <span className="text-rose-500 font-medium">{agent.errorMsg}</span>
          )}
        </div>

        <button
          onClick={handleSyncCalendar}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : agent.state === SYNC_STATES.DONE ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <PlusCircle className="w-4 h-4" />
          )}
          {isSyncing ? 'Đang đồng bộ...' : agent.state === SYNC_STATES.DONE ? 'Hoàn tất!' : 'Thêm vào Google Calendar'}
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 w-12 text-center">
                <input
                  type="checkbox"
                  checked={editableItems.length > 0 && editableItems.every(i => i.selected)}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900 w-2/5">Task Information</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900 w-1/4">Assignee & Time</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900 w-1/4">Notes & References</th>
            </tr>
          </thead>
          <tbody>
            {editableItems.map((item) => (
              <tr key={item.id} className={`border-b border-gray-200 transition-colors last:border-0 align-top ${item.selected ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50'}`}>
                <td className="px-4 py-4 text-center">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => handleItemChange(item.id, 'selected', e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer mt-1"
                  />
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={item.title || ''}
                      onChange={(e) => handleItemChange(item.id, 'title', e.target.value)}
                      className={`w-full font-semibold bg-transparent border-0 border-b ${item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'} focus:ring-0 px-0 py-1 transition-colors text-gray-900 placeholder-gray-400`}
                      placeholder="Task Title (Optional)"
                      disabled={!item.selected}
                    />
                    <div className="flex items-start gap-2">
                      <AlignLeft className={`w-4 h-4 mt-1 flex-shrink-0 ${item.selected ? 'text-gray-400' : 'text-gray-300'}`} />
                      <textarea
                        value={item.description || ''}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className={`w-full bg-transparent border-0 border-b ${item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'} focus:ring-0 px-0 py-1 transition-colors text-gray-600 placeholder-gray-400 resize-y min-h-[40px]`}
                        placeholder="Task description"
                        disabled={!item.selected}
                        rows={2}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-3">
                    <div className={`flex items-center gap-2 ${!item.selected && 'opacity-50'}`}>
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={item.assignee || ''}
                        onChange={(e) => handleItemChange(item.id, 'assignee', e.target.value)}
                        className={`w-full bg-transparent border-0 border-b ${item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'} focus:ring-0 px-0 py-1 transition-colors text-gray-700 placeholder-gray-400`}
                        placeholder="Unassigned"
                        disabled={!item.selected}
                      />
                    </div>
                    <div className={`flex items-center gap-2 ${!item.selected && 'opacity-50'}`}>
                      <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex flex-col w-full">
                        <input
                          type="text"
                          value={item.deadline || ''}
                          onChange={(e) => handleItemChange(item.id, 'deadline', e.target.value)}
                          className={`w-full bg-transparent border-0 border-b ${
                            item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'
                          } focus:ring-0 px-0 py-1 transition-colors ${
                            item.deadlineResolved ? 'text-green-600 font-semibold' : 'text-amber-600'
                          } placeholder-gray-400`}
                          placeholder="DD/MM/YYYY or phrase"
                          disabled={!item.selected}
                        />
                        {/* Confidence badge */}
                        {item.deadlineConfidence && !item.deadlineResolved && (
                          <span className="text-[10px] text-amber-500 mt-0.5">
                            ⏳ Unresolved — original: "{item.deadlineRaw}"
                          </span>
                        )}
                        {item.deadlineResolved && item.deadlineRaw && (
                          <span className="text-[10px] text-green-500 mt-0.5">
                            ✅ Resolved from: "{item.deadlineRaw}"
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Note</span>
                      <textarea
                        value={item.note || ''}
                        onChange={(e) => handleItemChange(item.id, 'note', e.target.value)}
                        className={`w-full bg-transparent border-0 border-b ${item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'} focus:ring-0 px-0 py-1 transition-colors text-gray-600 placeholder-gray-400 resize-y min-h-[40px] text-xs`}
                        placeholder="Add a note..."
                        disabled={!item.selected}
                        rows={2}
                      />
                    </div>
                    {item.reference_segments && item.reference_segments.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                          <Clock className="w-3 h-3" /> References
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {item.reference_segments.map((ref, i) => (
                            <button
                              key={i}
                              onClick={() => onSeek && onSeek(ref.start)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-mono border border-blue-100 hover:bg-blue-100 hover:border-blue-300 hover:text-blue-900 transition-colors cursor-pointer"
                              title={`Click to play from ${formatDuration(ref.start)}`}
                            >
                              ▶ [{formatDuration(ref.start)} - {formatDuration(ref.end)}]
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ActionItemTable
