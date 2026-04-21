import React from 'react'
import { CheckCircle2, Calendar, User } from 'lucide-react'

export const ActionItemTable = ({ items }) => {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No action items found</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
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
            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-900">{item.task}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 text-gray-700">
                  <User className="w-4 h-4 text-gray-500" />
                  {item.owner || 'Unassigned'}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  {item.deadline || 'No deadline'}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                  <span className="text-sm text-gray-600">Pending</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ActionItemTable
