/**
 * Merges transcript segments with diarization speaker labels based on timestamps.
 * 
 * @param {Object} transcriptResult - The result from the ASR endpoint (must contain .segments or similar)
 * @param {Object} diarizationResult - The result from the Diarization endpoint
 * @param {Object} speakerMap - Optional map of original speaker ID to custom name
 * @returns {string} The merged transcript text grouped by speakers
 */
export const mergeTranscriptAndDiarization = (transcriptResult, diarizationResult, speakerMap = {}) => {
  if (!transcriptResult || !diarizationResult) return '';

  const tSegments = transcriptResult.segments || [];
  let dSegments = [];
  
  if (Array.isArray(diarizationResult)) {
    dSegments = diarizationResult;
  } else if (diarizationResult.segments) {
    dSegments = diarizationResult.segments;
  }

  // Nếu không có segments, fallback trả về raw text
  if (tSegments.length === 0 || dSegments.length === 0) {
    return transcriptResult.text || '';
  }

  const merged = [];

  // Helper để tìm speaker cho một đoạn [start, end]
  const findSpeaker = (start, end) => {
    let bestSpeaker = 'Unknown';
    let maxOverlap = 0;

    for (const d of dSegments) {
      const dStart = d.start;
      const dEnd = d.end;

      const overlapStart = Math.max(start, dStart);
      const overlapEnd = Math.min(end, dEnd);
      const overlap = overlapEnd - overlapStart;

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSpeaker = d.speaker || d.label || bestSpeaker;
      }
    }
    return bestSpeaker;
  };

  // Helper get custom name
  const getSpeakerName = (speakerId) => {
    return speakerMap[speakerId] && speakerMap[speakerId].trim() !== '' 
      ? speakerMap[speakerId] 
      : speakerId;
  };

  // Nhóm các đoạn có cùng speaker liên tiếp
  let currentSpeaker = null;
  let currentText = '';
  let currentStart = 0;
  let currentEnd = 0;

  const formatTime = (time) => Number(time).toFixed(2);

  for (const t of tSegments) {
    const speaker = findSpeaker(t.start, t.end);

    if (speaker === currentSpeaker) {
      currentText += ' ' + t.text.trim();
      currentEnd = t.end;
    } else {
      if (currentSpeaker !== null) {
        const name = getSpeakerName(currentSpeaker);
        merged.push(`(${formatTime(currentStart)}-${formatTime(currentEnd)}): ${name}: ${currentText.trim()}`);
      }
      currentSpeaker = speaker;
      currentText = t.text.trim();
      currentStart = t.start;
      currentEnd = t.end;
    }
  }

  if (currentSpeaker !== null) {
    const name = getSpeakerName(currentSpeaker);
    merged.push(`(${formatTime(currentStart)}-${formatTime(currentEnd)}): ${name}: ${currentText.trim()}`);
  }

  return 'Meeting transcript:\n\n' + merged.join('\n\n');
};
