import React from 'react';
import { Calendar, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

export const CalendarSyncResult = ({ result, onClose }) => {
  if (!result) return null;

  const total = result.created.length + result.updated.length + result.skipped.length + result.failed.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl max-w-xl w-full animate-in fade-in zoom-in duration-200">
        
        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Đồng bộ hoàn tất</h3>
              <p className="text-slate-400 text-sm">Đã xử lý {total} công việc</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <ResultCard title="Tạo mới" count={result.created.length} icon={Calendar} color="text-emerald-400" bg="bg-emerald-400/10" border="border-emerald-400/20" />
          <ResultCard title="Cập nhật" count={result.updated.length} icon={Clock} color="text-indigo-400" bg="bg-indigo-400/10" border="border-indigo-400/20" />
          <ResultCard title="Bỏ qua" count={result.skipped.length} icon={CheckCircle2} color="text-slate-400" bg="bg-slate-400/10" border="border-slate-400/20" />
          <ResultCard title="Lỗi" count={result.failed.length} icon={XCircle} color="text-rose-400" bg="bg-rose-400/10" border="border-rose-400/20" />
        </div>

        {result.failed.length > 0 && (
          <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 max-h-32 overflow-y-auto">
            <h4 className="text-sm font-semibold text-rose-400 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Chi tiết lỗi
            </h4>
            <ul className="text-xs text-rose-200 space-y-1 list-disc pl-4">
              {result.failed.map((f, i) => (
                <li key={i}>{f.task.title}: {f.error}</li>
              ))}
            </ul>
          </div>
        )}

        <button 
          onClick={onClose}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};

const ResultCard = ({ title, count, icon: Icon, color, bg, border }) => (
  <div className={`p-4 rounded-xl border ${border} ${bg} flex items-center justify-between`}>
    <div>
      <p className={`text-sm font-medium ${color} mb-1`}>{title}</p>
      <p className="text-2xl font-bold text-white">{count}</p>
    </div>
    <Icon className={`w-8 h-8 opacity-50 ${color}`} />
  </div>
);
