const MIN_PRIMARY_OVERLAP_RATIO = 0.6;
const MIN_SECONDARY_OVERLAP_RATIO = 0.2;

const normalizeDiarizationSegments = (diarizationResult) => {
  if (Array.isArray(diarizationResult)) return diarizationResult;
  return diarizationResult?.segments || [];
};

const getSpeakerName = (speakerId, speakerMap) => {
  const mappedName = speakerMap?.[speakerId]?.trim();
  return mappedName || speakerId;
};

const formatTime = (time) => Number(time).toFixed(2);

const getSpeakerMatch = (segment, diarizationSegments, speakerMap) => {
  const start = Number(segment.start);
  const end = Number(segment.end);
  const duration = Math.max(end - start, 0.001);
  const overlapsBySpeaker = new Map();

  for (const diarization of diarizationSegments) {
    const diarizationStart = Number(diarization.start);
    const diarizationEnd = Number(diarization.end);
    const overlapStart = Math.max(start, diarizationStart);
    const overlapEnd = Math.min(end, diarizationEnd);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (overlap <= 0) continue;

    const speakerId = diarization.speaker || diarization.label || 'Unknown';
    overlapsBySpeaker.set(
      speakerId,
      (overlapsBySpeaker.get(speakerId) || 0) + overlap
    );
  }

  if (overlapsBySpeaker.size === 0) {
    return {
      speakerIds: ['Unknown'],
      speaker: 'Unknown',
      confidence: 0,
      mixed: false,
      lowOverlap: true
    };
  }

  const overlaps = Array.from(overlapsBySpeaker, ([speakerId, overlap]) => ({
    speakerId,
    overlap,
    ratio: overlap / duration
  })).sort((a, b) => b.overlap - a.overlap);

  const primary = overlaps[0];
  const significantSpeakers = overlaps.filter(
    item => item.ratio >= MIN_SECONDARY_OVERLAP_RATIO
  );
  const mixed = (
    primary.ratio < MIN_PRIMARY_OVERLAP_RATIO &&
    significantSpeakers.length > 1
  );

  const speakerIds = mixed
    ? significantSpeakers.map(item => item.speakerId)
    : [primary.speakerId];

  return {
    speakerIds,
    speaker: speakerIds.map(speakerId => getSpeakerName(speakerId, speakerMap)).join(' / '),
    confidence: Math.min(primary.ratio, 1),
    mixed,
    lowOverlap: primary.ratio < MIN_PRIMARY_OVERLAP_RATIO
  };
};

const canMergeIntoCurrentGroup = (currentGroup, speakerMatch) => {
  return (
    currentGroup &&
    currentGroup.speaker === speakerMatch.speaker &&
    currentGroup.mixed === speakerMatch.mixed &&
    currentGroup.lowOverlap === speakerMatch.lowOverlap
  );
};

export const buildEditableTranscriptSegments = (
  transcriptResult,
  diarizationResult,
  speakerMap = {}
) => {
  const transcriptSegments = transcriptResult?.segments || [];
  const diarizationSegments = normalizeDiarizationSegments(diarizationResult);

  return transcriptSegments.map(segment => {
    if (diarizationSegments.length === 0) {
      return {
        ...segment,
        speakerIds: [],
        speaker: null,
        confidence: null,
        mixed: false,
        lowOverlap: false
      };
    }

    return {
      ...segment,
      ...getSpeakerMatch(segment, diarizationSegments, speakerMap)
    };
  });
};

/**
 * Build display-ready transcript groups without splitting ASR text at diarization
 * boundaries. If one ASR segment overlaps multiple speakers, keep the sentence
 * intact and mark it as mixed/low-overlap instead of cutting words apart.
 */
export const buildMergedTranscriptSegments = (
  transcriptResult,
  diarizationResult,
  speakerMap = {}
) => {
  if (!transcriptResult || !diarizationResult) return [];

  const transcriptSegments = transcriptResult.segments || [];
  const diarizationSegments = normalizeDiarizationSegments(diarizationResult);

  if (transcriptSegments.length === 0 || diarizationSegments.length === 0) {
    return transcriptResult.text
      ? [{
          start: null,
          end: null,
          speaker: null,
          text: transcriptResult.text,
          confidence: null,
          mixed: false,
          lowOverlap: false
        }]
      : [];
  }

  const mergedGroups = [];

  for (const segment of transcriptSegments) {
    const text = segment.text?.trim();
    if (!text) continue;

    const speakerMatch = getSpeakerMatch(segment, diarizationSegments, speakerMap);
    const currentGroup = mergedGroups[mergedGroups.length - 1];

    if (canMergeIntoCurrentGroup(currentGroup, speakerMatch)) {
      currentGroup.end = segment.end;
      currentGroup.text = `${currentGroup.text} ${text}`;
      currentGroup.confidence = Math.min(currentGroup.confidence, speakerMatch.confidence);
      currentGroup.sourceSegments += 1;
      continue;
    }

    mergedGroups.push({
      start: segment.start,
      end: segment.end,
      speakerIds: speakerMatch.speakerIds,
      speaker: speakerMatch.speaker,
      text,
      confidence: speakerMatch.confidence,
      mixed: speakerMatch.mixed,
      lowOverlap: speakerMatch.lowOverlap,
      sourceSegments: 1
    });
  }

  return mergedGroups;
};

/**
 * Merges transcript segments with diarization speaker labels based on timestamp
 * overlap. This keeps ASR sentences whole and groups consecutive segments with
 * the same speaker label.
 */
export const mergeTranscriptAndDiarization = (
  transcriptResult,
  diarizationResult,
  speakerMap = {}
) => {
  const mergedGroups = buildMergedTranscriptSegments(
    transcriptResult,
    diarizationResult,
    speakerMap
  );

  if (mergedGroups.length === 0) return '';

  const lines = mergedGroups.map(group => {
    if (group.start === null || group.end === null) return group.text;

    const speaker = group.speaker || 'Unknown';
    const qualifier = group.mixed
      ? ' (mixed)'
      : group.lowOverlap
      ? ' (low overlap)'
      : '';

    return `(${formatTime(group.start)}-${formatTime(group.end)}): ${speaker}${qualifier}: ${group.text}`;
  });

  return `Meeting transcript:\n\n${lines.join('\n\n')}`;
};
