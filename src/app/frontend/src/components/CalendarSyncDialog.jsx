import React, { useState } from 'react';
import { Calendar, AlertTriangle, AlertCircle, Check, X, CalendarDays, RefreshCw } from 'lucide-react';

/**
 * Renders all dialogs requested by the Agentic Calendar Sync FSM.
 */
export const CalendarSyncDialog = ({ agent }) => {
  const { 
    state, 
    pendingOwnership, 
    pendingEmptyFilter, 
    pendingConflict,
    respondOwnership,
    respondEmptyFilter,
    respondConflict
  } = agent;

  if (state === 'asking_ownership' && pendingOwnership) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
          <div className="flex items-center gap-3 mb-4 text-amber-500">
            <AlertCircle className="w-6 h-6" />
            <h3 className="text-lg font-semibold text-gray-900">Confirmation Needed</h3>
          </div>
          <p className="text-gray-600 mb-2">The following task is unassigned:</p>
          <div className="p-3 bg-gray-50 rounded-lg mb-6 border border-gray-200">
            <p className="font-medium text-gray-900">{pendingOwnership.title || 'Task'}</p>
          </div>
          <p className="text-gray-700 mb-6 font-medium text-center">Is this task yours?</p>
          
          <div className="flex gap-3 justify-end">
            <button 
              onClick={() => respondOwnership(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Not mine
            </button>
            <button 
              onClick={() => respondOwnership(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Yes, it's mine
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'asking_empty_filter' && pendingEmptyFilter) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
          <div className="flex items-center gap-3 mb-4 text-amber-500">
            <AlertTriangle className="w-6 h-6" />
            <h3 className="text-lg font-semibold text-gray-900">No Tasks Found</h3>
          </div>
          <p className="text-gray-600 mb-6">
            Among the selected tasks with valid dates, none are assigned to you.
            Do you want to sync all tasks anyway or cancel?
          </p>
          
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => respondEmptyFilter(true)}
              className="w-full px-4 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm font-medium text-left flex items-center gap-3"
            >
              <RefreshCw className="w-5 h-5" />
              <div>
                <p>Sync all tasks</p>
                <p className="text-xs text-indigo-100 font-normal mt-0.5">Ignore assignee filter</p>
              </div>
            </button>
            <button 
              onClick={() => respondEmptyFilter(false)}
              className="w-full px-4 py-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-medium text-left flex items-center gap-3"
            >
              <X className="w-5 h-5" />
              Cancel Sync
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'clarifying_conflicts' && pendingConflict) {
    return <ConflictDialog conflict={pendingConflict} respond={respondConflict} />;
  }

  return null;
};

// Internal component to manage the date picker state for RESCHEDULE
const ConflictDialog = ({ conflict, respond }) => {
  const [selectedDate, setSelectedDate] = useState(conflict.task.deadline || '');
  
  const isPast = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    return d < today;
  };

  const normalizeDate = (str) => {
    if (!str) return '';
    return String(str).replace(/T.*$/, '').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
  };
  const taskDate = normalizeDate(conflict.task.deadline);
  const eventDate = normalizeDate(conflict.event?.start?.date || conflict.event?.start?.dateTime);
  const isDuplicate = conflict.verdict === 'DUPLICATE' && taskDate === eventDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-2xl max-w-2xl w-full animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <CalendarDays className="w-6 h-6 text-indigo-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            {isDuplicate ? 'Duplicate Task Detected' : 'Related Calendar Event Detected'}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* New Task */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col h-full">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-2 block">New Task</span>
            <p className="font-medium text-gray-900 mb-1">{conflict.task.title || conflict.task.task || 'Untitled Task'}</p>
            {conflict.task.description && (
              <p className="text-xs text-gray-600 mb-3 line-clamp-2">{conflict.task.description}</p>
            )}
            <div className="mt-auto">
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {conflict.task.deadline}
              </p>
            </div>
          </div>

          {/* Existing Event */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col h-full">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 block">Existing Event</span>
            <p className="font-medium text-gray-900 mb-1">{conflict.event.summary || 'Untitled Event'}</p>
            {conflict.event.description && (
              <p className="text-xs text-gray-600 mb-3 line-clamp-2">{conflict.event.description}</p>
            )}
            <div className="mt-auto">
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {conflict.event.start?.date || new Date(conflict.event.start?.dateTime).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg mb-6 text-sm">
          <strong>Reason: </strong> {conflict.reason}
        </div>

        {isDuplicate ? (
          <div className="flex flex-col gap-3">
            <p className="text-gray-800 font-medium mb-2">How would you like to handle this?</p>
            <button 
              onClick={() => respond('PATCH')}
              className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-left transition-colors font-medium flex items-center justify-between"
            >
              <span>Update the existing event</span>
              <span className="text-xs bg-indigo-500 px-2 py-1 rounded">Keeps old date</span>
            </button>
            <button 
              onClick={() => respond('SKIP')}
              className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-left transition-colors font-medium"
            >
              Skip this new task
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-gray-800 font-medium mb-2">How would you like to handle this?</p>
            
            <div className="p-3 border border-indigo-200 bg-indigo-50 rounded-lg flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-indigo-800 font-medium">Reschedule existing event to:</span>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-white border border-gray-300 text-gray-900 px-3 py-1.5 rounded outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {isPast(selectedDate) && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> This date is in the past
                </p>
              )}
              <button 
                onClick={() => respond('RESCHEDULE', selectedDate)}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors font-medium"
              >
                Confirm Reschedule
              </button>
            </div>

            <button 
              onClick={() => respond('CREATE')}
              className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-left transition-colors font-medium"
            >
              Create as a separate event
            </button>
            
            <button 
              onClick={() => respond('SKIP')}
              className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-rose-600 rounded-lg text-left transition-colors font-medium"
            >
              Skip this new task
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
