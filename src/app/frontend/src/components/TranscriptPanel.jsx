import React from 'react';
import { Loader2 } from 'lucide-react';

const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00:000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');
  if (h > 0) return `${h}:${mStr}:${sStr}:${msStr}`;
  return `${mStr}:${sStr}:${msStr}`;
};

export const TranscriptPanel = ({
  transcriptResult,
  diarizationResult,
  isMergedView,
  speakerMap,
  handleEditStart,
  handleEditSave,
  handleEditCancel,
  isEditing,
  editedSegments,
  setEditedSegments,
  isSavingCorrection,
  editableTranscriptSegments,
  mergedDisplayLines,
  audioPlayerRef,
  showSpeakerColumn
}) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        {!isEditing ? (
          <button onClick={handleEditStart} className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-200 shadow-sm">
            Edit Transcript
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleEditCancel} className="px-4 py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-200 shadow-sm">
              Cancel
            </button>
            <button onClick={handleEditSave} disabled={isSavingCorrection} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
              {isSavingCorrection && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Corrections
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {editableTranscriptSegments.map((seg, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 md:grid-cols-[max-content_max-content_minmax(0,1fr)] gap-2 md:gap-3 rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-3"
            >
              <div className="font-semibold text-gray-400 whitespace-nowrap font-mono text-xs md:mt-2">
                [{formatDuration(seg.start)} - {formatDuration(seg.end)}]
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start md:mt-1">
                {showSpeakerColumn && seg.speaker && (
                  <span className="max-w-[180px] truncate rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                    {seg.speaker}
                  </span>
                )}
                {showSpeakerColumn && seg.mixed && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                    Mixed
                  </span>
                )}
                {showSpeakerColumn && !seg.mixed && seg.lowOverlap && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200">
                    Low overlap
                  </span>
                )}
              </div>
              <textarea
                value={editedSegments[idx]}
                onChange={(e) => {
                  const newArr = [...editedSegments];
                  newArr[idx] = e.target.value;
                  setEditedSegments(newArr);
                }}
                className="min-w-0 w-full px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[44px] text-gray-800 text-sm shadow-sm bg-white"
                rows={2}
              />
            </div>
          ))}
        </div>
      ) : diarizationResult && isMergedView ? (
        <div className="text-gray-700 space-y-3">
          {mergedDisplayLines.map((item, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 md:grid-cols-[max-content_max-content_minmax(0,1fr)] gap-2 md:gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-4 py-3"
            >
              <div
                className="font-semibold text-gray-400 whitespace-nowrap font-mono text-xs md:mt-1 cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => {
                  if (item.start !== null) {
                    audioPlayerRef.current?.seekTo(item.start)
                    audioPlayerRef.current?.play()
                  }
                }}
                title="Click to jump to this segment"
              >
                {item.start !== null && item.end !== null
                  ? `[${formatDuration(item.start)} - ${formatDuration(item.end)}]`
                  : ''}
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start">
                {item.speaker && (
                  <span className="max-w-[180px] truncate rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                    {item.speaker}
                  </span>
                )}
                {item.mixed && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                    Mixed
                  </span>
                )}
                {!item.mixed && item.lowOverlap && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200">
                    Low overlap
                  </span>
                )}
              </div>
              <p className="min-w-0 leading-relaxed text-gray-800 break-words">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-700 space-y-3">
          {transcriptResult.segments && transcriptResult.segments.length > 0
            ? transcriptResult.segments.map((seg, idx) => (
              <div key={idx} className="flex gap-3 group/seg">
                <span
                  className="font-semibold text-gray-400 whitespace-nowrap font-mono text-xs mt-1 w-[145px] cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => {
                    audioPlayerRef.current?.seekTo(seg.start)
                    audioPlayerRef.current?.play()
                  }}
                  title="Click to jump to this segment"
                >
                  [{formatDuration(seg.start)} - {formatDuration(seg.end)}]:
                </span>
                <span className="leading-relaxed"> {seg.text.trim()}</span>
              </div>
            ))
            : <p className="whitespace-pre-wrap leading-relaxed">{transcriptResult.text}</p>
          }
        </div>
      )}
    </div>
  );
};

export default TranscriptPanel;
