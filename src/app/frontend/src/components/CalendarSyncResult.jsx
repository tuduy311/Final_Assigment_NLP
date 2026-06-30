import React from 'react';
import { Calendar, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

export const CalendarSyncResult = ({ result, onClose }) => {
  if (!result) return null;

  const total = result.created.length + result.updated.length + result.skipped.length + result.failed.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-2xl max-w-xl w-full animate-in fade-in zoom-in duration-200">
        
        <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Sync Complete</h3>
              <p className="text-gray-500 text-sm">Processed {total} tasks</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <ResultCard title="Created" count={result.created.length} icon={Calendar} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-100" />
          <ResultCard title="Updated" count={result.updated.length} icon={Clock} color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-100" />
          <ResultCard title="Skipped" count={result.skipped.length} icon={CheckCircle2} color="text-gray-500" bg="bg-gray-50" border="border-gray-200" />
          <ResultCard title="Failed" count={result.failed.length} icon={XCircle} color="text-rose-600" bg="bg-rose-50" border="border-rose-100" />
        </div>

        {result.failed.length > 0 && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-3 max-h-32 overflow-y-auto">
            <h4 className="text-sm font-semibold text-rose-700 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Error Details
            </h4>
            <ul className="text-xs text-rose-600 space-y-1 list-disc pl-4">
              {result.failed.map((f, i) => (
                <li key={i}>{f.task.title}: {f.error}</li>
              ))}
            </ul>
          </div>
        )}

        <button 
          onClick={onClose}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
};

const ResultCard = ({ title, count, icon: Icon, color, bg, border }) => (
  <div className={`p-4 rounded-xl border ${border} ${bg} flex items-center justify-between`}>
    <div>
      <p className={`text-sm font-medium ${color} mb-1`}>{title}</p>
      <p className={`text-2xl font-bold ${color.replace('text-', 'text-').replace('600', '900')}`}>{count}</p>
    </div>
    <Icon className={`w-8 h-8 opacity-50 ${color}`} />
  </div>
);
