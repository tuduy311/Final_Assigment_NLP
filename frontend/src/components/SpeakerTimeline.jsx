import React, { useMemo } from 'react';

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
const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-red-500'
];

export const SpeakerTimeline = ({ segments, duration, speakerMap, onSeek }) => {
  const speakers = useMemo(() => {
    const s = new Set(segments.map(seg => seg.speaker || seg.label));
    return Array.from(s).sort();
  }, [segments]);

  // Create a map of speaker to color
  const speakerColorMap = useMemo(() => {
    const map = {};
    speakers.forEach((spk, idx) => {
      map[spk] = COLORS[idx % COLORS.length];
    });
    return map;
  }, [speakers]);

  // If no duration is provided, find the max end time
  const totalDuration = duration || Math.max(...segments.map(s => s.end));

  if (!totalDuration || totalDuration <= 0) return null;

  return (
    <div className="mt-6 border border-gray-200 p-4 rounded-xl bg-gray-50 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Speaker Timeline</h3>
      
      <div className="relative h-24 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-inner">
        {/* Timeline Ticks */}
        <div className="absolute top-0 left-0 right-0 h-4 border-b border-gray-100 flex justify-between px-2 text-[10px] text-gray-400">
          <span>0:00</span>
          <span>{Math.floor(totalDuration / 60)}:{(Math.floor(totalDuration % 60)).toString().padStart(2, '0')}</span>
        </div>

        {/* Segments */}
        <div className="absolute top-6 bottom-2 left-0 right-0">
          {segments.map((seg, idx) => {
            const left = (seg.start / totalDuration) * 100;
            const width = ((seg.end - seg.start) / totalDuration) * 100;
            const spk = seg.speaker || seg.label;
            const colorClass = speakerColorMap[spk] || 'bg-gray-500';
            const mappedName = speakerMap?.[spk] || spk;
            
            return (
              <div 
                key={idx}
                onClick={(e) => {
                  e.preventDefault();
                  if (onSeek) onSeek(seg.start);
                }}
                className={`absolute top-0 bottom-0 ${colorClass} opacity-80 hover:opacity-100 transition-opacity border-r border-white group cursor-pointer`}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10 shadow-lg">
                  {mappedName} [{formatDuration(seg.start)} - {formatDuration(seg.end)}]
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4">
        {speakers.map(spk => (
          <div key={spk} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${speakerColorMap[spk]}`}></div>
            <span className="text-sm text-gray-600">{speakerMap?.[spk] || spk}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpeakerTimeline;
