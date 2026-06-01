import React, { useState } from 'react'
import { CheckCircle2, Calendar as CalendarIcon, User, PlusCircle, Loader2 } from 'lucide-react'
import { createCalendarEvents } from '../services/api'

export const ActionItemTable = ({ items }) => {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null) // 'success' or 'error'

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No action items found</p>
      </div>
    )
  }

  const handleSyncCalendar = async () => {
    setIsSyncing(true)
    setSyncResult(null)
    try {
      const events = items.map(item => ({
        title: item.task || 'Action Item',
        description: `Owner: ${item.owner || 'Unassigned'}`,
        deadline: item.deadline || new Date().toISOString()
      }))
      await createCalendarEvents(events)
      setSyncResult('success')
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
              <th className="text-left px-4 py-3 font-semibold text-gray-900">Task</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900">Owner</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900">Deadline</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-900">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-b border-gray-200 hover:bg-gray-50 transition-colors last:border-0">
                <td className="px-4 py-3 text-gray-900">{item.task}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-gray-700">
                    <User className="w-4 h-4 text-gray-400" />
                    {item.owner || 'Unassigned'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-gray-700">
                    <CalendarIcon className="w-4 h-4 text-gray-400" />
                    {item.deadline || 'No deadline'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
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
