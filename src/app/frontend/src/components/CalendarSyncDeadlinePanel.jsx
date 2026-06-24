import React, { useState } from 'react';
import { Calendar, Check, X, AlertCircle } from 'lucide-react';

export const CalendarSyncDeadlinePanel = ({ agent }) => {
  const { state, pendingDeadlines, submitDeadline, skipDeadline } = agent;

  if (state !== 'collecting_deadlines' || pendingDeadlines.length === 0) return null;

  return (
    <div className="fixed top-24 right-6 w-96 bg-slate-900 border border-indigo-500/50 shadow-[0_0_30px_rgba(79,70,229,0.15)] rounded-xl z-40 flex flex-col max-h-[80vh] animate-in slide-in-from-right-8 duration-300">
      
      <div className="p-4 border-b border-slate-800 bg-indigo-500/10 rounded-t-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-white">Bổ sung ngày tháng</h3>
          <p className="text-xs text-indigo-200 mt-1">
            {pendingDeadlines.length} công việc chưa có ngày thực hiện rõ ràng. Vui lòng cập nhật để đồng bộ.
          </p>
        </div>
      </div>

      <div className="overflow-y-auto p-4 flex flex-col gap-4 bg-slate-900 rounded-b-xl custom-scrollbar">
        {pendingDeadlines.map((task) => (
          <DeadlineItem 
            key={task.id} 
            task={task} 
            onSubmit={(date) => submitDeadline(task.id, date)}
            onSkip={() => skipDeadline(task.id)}
          />
        ))}
      </div>
    </div>
  );
};

const DeadlineItem = ({ task, onSubmit, onSkip }) => {
  const [date, setDate] = useState('');

  return (
    <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
      <p className="text-sm font-medium text-slate-200 mb-3 line-clamp-2" title={task.title}>
        {task.title}
      </p>
      
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-sm text-white rounded pl-9 pr-3 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>
        
        <button
          onClick={() => {
            if (date) onSubmit(date);
          }}
          disabled={!date}
          className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 text-white transition-colors"
          title="Xác nhận"
        >
          <Check className="w-4 h-4" />
        </button>
        
        <button
          onClick={onSkip}
          className="p-1.5 rounded bg-slate-700 hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 transition-colors"
          title="Bỏ qua task này"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
