import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Calendar as CalendarIcon, User, PlusCircle, Loader2, AlignLeft, Clock } from 'lucide-react'
import { createCalendarEvents } from '../services/api'

// Helper function formatDuration to format seconds into MM:SS
const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00';
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Helper: extract displayable deadline string from model's deadline (string or object)
const extractDeadline = (dl) => {
  if (!dl) return '';
  if (typeof dl === 'string') return dl;
  if (typeof dl === 'object') {
    // Model trả về: { resolved, raw_phrase, reasoning, anchor, offset_from_anchor, confidence }
    return dl.resolved || dl.raw_phrase || '';
  }
  return '';
};

export const ActionItemTable = ({ items, onSeek }) => {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [editableItems, setEditableItems] = useState([])

  const previousItemsRef = useRef(null)

  useEffect(() => {
    if (items) {
      const currentItemsStr = JSON.stringify(items)
      if (previousItemsRef.current !== currentItemsStr) {
        setEditableItems(items.map((item, idx) => ({
          ...item,
          id: idx,
          selected: true,
          title: item.title || item.task || '',
          description: item.description || '',
          note: item.note || '',
          reference_segments: item.reference_segments || [],
          assignee: item.assignees ? item.assignees.join(', ') : (item.assignee || item.owner || ''),
          deadline: extractDeadline(item.deadline),
          deadline_info: item.deadline_info || null
        })))
        previousItemsRef.current = currentItemsStr
      }
    }
  }, [items])

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No action items found</p>
      </div>
    )
  }

  const handleItemChange = (id, field, value) => {
    setEditableItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const toggleSelectAll = () => {
    const allSelected = editableItems.length > 0 && editableItems.every(i => i.selected)
    setEditableItems(prev => prev.map(item => ({ ...item, selected: !allSelected })))
  }

  const handleSyncCalendar = async () => {
    const selectedItems = editableItems.filter(item => item.selected)
    if (selectedItems.length === 0) {
      alert('Vui lòng chọn ít nhất 1 công việc để thêm vào lịch.')
      return
    }

    setIsSyncing(true)
    setSyncResult(null)
    try {
      const events = selectedItems.map(item => ({
        title: item.title || 'Action Item',
        description: `${item.description || ''}\n\nOwner: ${item.assignee || 'Unassigned'}\nNote: ${item.note || ''}`,
        deadline: item.deadline || new Date().toISOString()
      }))
      const response = await createCalendarEvents(events)

      if (response.failed && response.failed.length > 0) {
        console.error('Failed to sync some events:', response.failed)
        alert(`Failed to sync some tasks to Google Calendar:\n\n${response.failed.map(f => `- ${f.title}: ${f.error}`).join('\n')}`)
        if (response.created && response.created.length > 0) {
          setSyncResult('success')
        } else {
          setSyncResult('error')
        }
      } else {
        setSyncResult('success')
      }
    } catch (err) {
      console.error('Failed to sync to calendar:', err)
      setSyncResult('error')
    } finally {
      setIsSyncing(false)
      setTimeout(() => setSyncResult(null), 3000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleSyncCalendar}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : syncResult === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <PlusCircle className="w-4 h-4" />
          )}
          {isSyncing ? 'Syncing...' : syncResult === 'success' ? 'Synced!' : 'Add to Google Calendar'}
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
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={item.title || ''}
                      onChange={(e) => handleItemChange(item.id, 'title', e.target.value)}
                      className={`w-full font-semibold border rounded-md px-3 py-2 transition-colors ${item.selected ? 'bg-white border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-gray-900' : 'bg-transparent border-transparent text-gray-500'}`}
                      placeholder="Task Title (Optional)"
                      disabled={!item.selected}
                    />
                    <div className="flex items-start gap-2">
                      <AlignLeft className={`w-4 h-4 mt-3 flex-shrink-0 ${item.selected ? 'text-gray-400' : 'text-gray-300'}`} />
                      <textarea
                        value={item.description || ''}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className={`w-full border rounded-md px-3 py-2 transition-colors resize-y min-h-[60px] ${item.selected ? 'bg-white border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-gray-700' : 'bg-transparent border-transparent text-gray-500'}`}
                        placeholder="Task description"
                        disabled={!item.selected}
                        rows={2}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-4 mt-1">
                    <div className={`flex items-center gap-2 ${!item.selected && 'opacity-50'}`}>
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={item.assignee || ''}
                        onChange={(e) => handleItemChange(item.id, 'assignee', e.target.value)}
                        className={`w-full border rounded-md px-3 py-1.5 transition-colors ${item.selected ? 'bg-white border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-gray-700' : 'bg-transparent border-transparent'}`}
                        placeholder="Unassigned"
                        disabled={!item.selected}
                      />
                    </div>
                    <div className={`flex items-center gap-2 ${!item.selected && 'opacity-50'}`}>
                      <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <input
                        type="date"
                        value={item.deadline || ''}
                        onChange={(e) => handleItemChange(item.id, 'deadline', e.target.value)}
                        title={item.deadline_info ? `Transcript: "${item.deadline_info.raw_phrase || 'N/A'}"${item.deadline_info.reasoning ? `\nReasoning: ${item.deadline_info.reasoning}` : ''}${item.deadline_info.confidence ? `\nConfidence: ${item.deadline_info.confidence}` : ''}` : ''}
                        className={`w-full border rounded-md px-3 py-1.5 transition-colors ${item.selected ? 'bg-white border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-gray-700' : 'bg-transparent border-transparent'}`}
                        disabled={!item.selected}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-3 mt-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase ml-1">Note</span>
                      <textarea
                        value={item.note || ''}
                        onChange={(e) => handleItemChange(item.id, 'note', e.target.value)}
                        className={`w-full border rounded-md px-3 py-2 transition-colors resize-y min-h-[60px] text-sm ${item.selected ? 'bg-white border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-gray-700' : 'bg-transparent border-transparent text-gray-500'}`}
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
      {syncResult === 'error' && (
        <p className="text-sm text-red-500 text-right">Failed to sync to Google Calendar.</p>
      )}
    </div>
  )
}

export default ActionItemTable
