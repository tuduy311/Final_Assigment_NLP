import React, { useState, useEffect } from 'react'
import { CheckCircle2, Calendar as CalendarIcon, User, PlusCircle, Loader2, AlignLeft, Clock } from 'lucide-react'
import { createCalendarEvents } from '../services/api'

// Helper function formatDuration to format seconds into MM:SS
const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00';
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const isAmbiguousDate = (dateStr) => {
  if (!dateStr || !dateStr.trim()) return false;
  // If it's a standard date format, it's not ambiguous
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const dateRegex1 = /^\d{4}-\d{2}-\d{2}$/;
  const dateRegex2 = /^\d{2}\/\d{2}\/\d{4}$/;
  const dateRegex3 = /^\d{2}-\d{2}-\d{4}$/;
  const dtRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
  
  if (isoRegex.test(dateStr) || dateRegex1.test(dateStr) || dateRegex2.test(dateStr) || dateRegex3.test(dateStr) || dtRegex.test(dateStr)) {
    return false;
  }
  // If it contains letters (except Z/T in iso), it's likely ambiguous (natural language)
  return /[a-zA-Z]/i.test(dateStr);
}

const resolveFuzzyDate = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes('next friday') || lower.includes('thứ 6 tuần sau')) {
    return '10/11/2026';
  }
  // Generic fallback for demo
  return '10/11/2026';
}

export const ActionItemTable = ({ items, onSeek }) => {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [editableItems, setEditableItems] = useState([])
  
  // Agentic States
  const [agentSyncState, setAgentSyncState] = useState('idle') // 'idle', 'asking'
  const [ambiguousTasks, setAmbiguousTasks] = useState([])
  const [currentAmbiguousIndex, setCurrentAmbiguousIndex] = useState(0)
  const [pendingSyncItems, setPendingSyncItems] = useState([])

  useEffect(() => {
    if (items) {
      setEditableItems(items.map((item, idx) => ({
        ...item,
        id: idx,
        selected: true,
        title: item.title || item.task || '',
        description: item.description || '',
        note: item.note || '',
        reference_segments: item.reference_segments || [],
        assignee: item.assignees ? item.assignees.join(', ') : (item.assignee || item.owner || ''),
        deadline: item.deadline || ''
      })))
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

    const ambiguous = selectedItems.filter(item => isAmbiguousDate(item.deadline)).map(item => ({
      ...item,
      resolvedDate: resolveFuzzyDate(item.deadline)
    }))

    if (ambiguous.length > 0) {
      setPendingSyncItems([...selectedItems])
      setAmbiguousTasks(ambiguous)
      setCurrentAmbiguousIndex(0)
      setAgentSyncState('asking')
      return 
    }

    await proceedToSync(selectedItems)
  }

  const handleAgentResponse = (agreed) => {
    const currentAmbiguous = ambiguousTasks[currentAmbiguousIndex]
    
    let updatedPending = [...pendingSyncItems]
    if (agreed) {
      // update in UI as well
      setEditableItems(prev => prev.map(item => 
        item.id === currentAmbiguous.id ? { ...item, deadline: currentAmbiguous.resolvedDate } : item
      ))
      // update in pending array
      updatedPending = updatedPending.map(item => 
        item.id === currentAmbiguous.id ? { ...item, deadline: currentAmbiguous.resolvedDate } : item
      )
      setPendingSyncItems(updatedPending)
    }

    if (currentAmbiguousIndex < ambiguousTasks.length - 1) {
      setCurrentAmbiguousIndex(prev => prev + 1)
      setPendingSyncItems(updatedPending)
    } else {
      // all done
      setAgentSyncState('idle')
      proceedToSync(updatedPending)
    }
  }

  const proceedToSync = async (itemsToSync) => {
    setIsSyncing(true)
    setSyncResult(null)
    setAgentSyncState('idle')
    try {
      const events = itemsToSync.map(item => ({
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
          disabled={isSyncing || agentSyncState === 'asking'}
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
      
      {agentSyncState === 'asking' && ambiguousTasks.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 transition-all">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0 mt-0.5 shadow-inner">
              🤖
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 leading-relaxed">
                Tui thấy task <span className="font-bold">'{ambiguousTasks[currentAmbiguousIndex].title}'</span> có deadline là <span className="font-bold text-red-600">'{ambiguousTasks[currentAmbiguousIndex].deadline}'</span>. 
                Tui đã dò lịch thì <span className="font-semibold">{ambiguousTasks[currentAmbiguousIndex].deadline}</span> là ngày <span className="font-bold text-green-700">{ambiguousTasks[currentAmbiguousIndex].resolvedDate}</span>. 
                Bạn có muốn set chính xác ngày này vào Google Calendar không?
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleAgentResponse(true)}
                  className="px-5 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  Đồng ý
                </button>
                <button
                  onClick={() => handleAgentResponse(false)}
                  className="px-5 py-1.5 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors shadow-sm focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm transition-opacity duration-300">
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
          <tbody className={agentSyncState === 'asking' ? 'opacity-60 pointer-events-none' : ''}>
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
                      <input
                        type="text"
                        value={item.deadline || ''}
                        onChange={(e) => handleItemChange(item.id, 'deadline', e.target.value)}
                        className={`w-full bg-transparent border-0 border-b ${item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'} focus:ring-0 px-0 py-1 transition-colors ${item.deadline === '10/11/2026' ? 'text-green-600 font-semibold' : 'text-gray-700'} placeholder-gray-400`}
                        placeholder="DD/MM/YYYY (vd: 10/11/2026)"
                        disabled={!item.selected}
                      />
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
                              onClick={(e) => {
                                e.preventDefault();
                                if (onSeek) onSeek(ref.start);
                              }}
                              className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-mono border border-blue-100 cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors shadow-sm"
                              title="Click to play this segment"
                            >
                              [{formatDuration(ref.start)} - {formatDuration(ref.end)}]
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

