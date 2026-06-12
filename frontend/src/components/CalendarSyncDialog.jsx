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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
          <div className="flex items-center gap-3 mb-4 text-amber-400">
            <AlertCircle className="w-6 h-6" />
            <h3 className="text-lg font-semibold">Cần xác nhận</h3>
          </div>
          <p className="text-slate-300 mb-2">Công việc sau chưa được phân công cho ai:</p>
          <div className="p-3 bg-slate-800 rounded-lg mb-6 border border-slate-700">
            <p className="font-medium text-white">{pendingOwnership.title || 'Task'}</p>
          </div>
          <p className="text-slate-300 mb-6 font-medium text-center">Đây có phải là công việc của bạn không?</p>
          
          <div className="flex gap-3 justify-end">
            <button 
              onClick={() => respondOwnership(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Không phải
            </button>
            <button 
              onClick={() => respondOwnership(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/30 flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Đúng, là của tôi
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'asking_empty_filter' && pendingEmptyFilter) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
          <div className="flex items-center gap-3 mb-4 text-amber-400">
            <AlertTriangle className="w-6 h-6" />
            <h3 className="text-lg font-semibold">Không tìm thấy công việc</h3>
          </div>
          <p className="text-slate-300 mb-6">
            Trong danh sách các task có ngày, không tìm thấy task nào được giao cho bạn. 
            Bạn muốn xử lý đồng bộ tất cả các task hay kết thúc?
          </p>
          
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => respondEmptyFilter(true)}
              className="w-full px-4 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg font-medium text-left flex items-center gap-3"
            >
              <RefreshCw className="w-5 h-5" />
              <div>
                <p>Xử lý toàn bộ</p>
                <p className="text-xs text-indigo-200 font-normal mt-0.5">Bỏ qua bộ lọc và đưa tất cả vào lịch</p>
              </div>
            </button>
            <button 
              onClick={() => respondEmptyFilter(false)}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors font-medium text-left flex items-center gap-3"
            >
              <X className="w-5 h-5" />
              Kết thúc đồng bộ
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

  // Chỉ PATCH nếu task và event trùng CÙNG ngày. Khác ngày → luôn RESCHEDULE (dù LLM bảo DUPLICATE)
  const normalizeDate = (str) => {
    if (!str) return '';
    // YYYY-MM-DD or ISO datetime
    return String(str).replace(/T.*$/, '').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
  };
  const taskDate = normalizeDate(conflict.task.deadline);
  const eventDate = normalizeDate(conflict.event?.start?.date || conflict.event?.start?.dateTime);
  const isDuplicate = conflict.verdict === 'DUPLICATE' && taskDate === eventDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl max-w-2xl w-full animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
          <CalendarDays className="w-6 h-6 text-indigo-400" />
          <h3 className="text-lg font-semibold text-white">
            {isDuplicate ? 'Trùng lặp công việc' : 'Công việc liên quan'}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* New Task */}
          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-2 block">Task mới</span>
            <p className="font-medium text-white mb-2">{conflict.task.title}</p>
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {conflict.task.deadline}
            </p>
          </div>

          {/* Existing Event */}
          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">Lịch hiện tại</span>
            <p className="font-medium text-white mb-2">{conflict.event.summary}</p>
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {conflict.event.start?.date || new Date(conflict.event.start?.dateTime).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 p-4 rounded-lg mb-6 text-sm">
          <strong>Lý do: </strong> {conflict.reason}
        </div>

        {isDuplicate ? (
          <div className="flex flex-col gap-3">
            <p className="text-slate-300 font-medium mb-2">Bạn muốn làm gì với task này?</p>
            <button 
              onClick={() => respond('PATCH')}
              className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-left transition-colors font-medium flex items-center justify-between"
            >
              <span>Cập nhật nội dung event cũ</span>
              <span className="text-xs bg-indigo-500 px-2 py-1 rounded">Giữ ngày cũ</span>
            </button>
            <button 
              onClick={() => respond('SKIP')}
              className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-left transition-colors font-medium"
            >
              Bỏ qua task mới này
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-slate-300 font-medium mb-2">Bạn muốn làm gì với task này?</p>
            
            <div className="p-3 border border-indigo-500/30 bg-indigo-500/10 rounded-lg flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-indigo-200 font-medium">Dời lịch event cũ sang ngày mới:</span>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white px-3 py-1.5 rounded outline-none focus:border-indigo-500"
                />
              </div>
              {isPast(selectedDate) && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Ngày này ở trong quá khứ
                </p>
              )}
              <button 
                onClick={() => respond('RESCHEDULE', selectedDate)}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors font-medium"
              >
                Xác nhận dời ngày
              </button>
            </div>

            <button 
              onClick={() => respond('CREATE')}
              className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-left transition-colors font-medium"
            >
              Tạo mới độc lập (giữ nguyên cái cũ)
            </button>
            
            <button 
              onClick={() => respond('SKIP')}
              className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-left transition-colors font-medium text-red-400"
            >
              Bỏ qua task mới này
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
