import React, { useState, useEffect } from 'react'
import { CheckCircle2, Calendar as CalendarIcon, User, PlusCircle, Loader2 } from 'lucide-react'
import { createCalendarEvents } from '../services/api'

export const ActionItemTable = ({ items }) => {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [editableItems, setEditableItems] = useState([])

  useEffect(() => {
    if (items) {
      setEditableItems(items.map((item, idx) => ({
        ...item,
        id: idx,
        selected: true,
        title: item.title || item.task || '',
        assignee: item.assignee || item.owner || ''
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

    setIsSyncing(true)
    setSyncResult(null)
    try {
      const events = selectedItems.map(item => ({
        title: item.title || 'Action Item',
        description: `Owner: ${item.assignee || 'Unassigned'}`,
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
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
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
      
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
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
              <th className="text-left px-4 py-3 font-semibold text-gray-900 w-2/5">Title</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900 w-1/4">Assignee</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900 w-1/4">Deadline</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900 w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {editableItems.map((item) => (
              <tr key={item.id} className={`border-b border-gray-200 transition-colors last:border-0 ${item.selected ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50'}`}>
                <td className="px-4 py-3 text-center">
                  <input 
                    type="checkbox" 
                    checked={item.selected}
                    onChange={(e) => handleItemChange(item.id, 'selected', e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={item.title || ''}
                    onChange={(e) => handleItemChange(item.id, 'title', e.target.value)}
                    className={`w-full bg-transparent border-0 border-b ${item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'} focus:ring-0 px-0 py-1 transition-colors text-gray-900 placeholder-gray-400`}
                    placeholder="Task description"
                    disabled={!item.selected}
                  />
                </td>
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3">
                  <div className={`flex items-center gap-2 ${!item.selected && 'opacity-50'}`}>
                    <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={item.deadline || ''}
                      onChange={(e) => handleItemChange(item.id, 'deadline', e.target.value)}
                      className={`w-full bg-transparent border-0 border-b ${item.selected ? 'border-transparent hover:border-gray-300 focus:border-indigo-500' : 'border-transparent'} focus:ring-0 px-0 py-1 transition-colors text-gray-700 placeholder-gray-400`}
                      placeholder="No deadline"
                      disabled={!item.selected}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className={`flex items-center gap-2 ${!item.selected && 'opacity-50'}`}>
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span className="text-gray-600">Pending</span>
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
