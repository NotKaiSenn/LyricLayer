import type { TranslationTiming } from "./translation-timing";

/** One uninterrupted part of a translated character's own animation clock. */
export interface CharacterCue {
  startTime: number;
  endTime: number;
  /** Progress within this translated segment, rather than within the line. */
  start: number;
  end: number;
  sourceIndex?: number;
}

export interface CharacterPhase {
  phase: number;
  state: "before" | "active" | "gap" | "after";
}

const EPSILON = Number.EPSILON * 8;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Divide the original cue at translated character boundaries. Sharing an
 * original word therefore shares its style, but not its entire time interval.
 * Do not join separated intervals: a rest inside one character remains a rest. */
export function characterCuesForSegment(plan: TranslationTiming, index: number): CharacterCue[] {
  if (!Number.isInteger(index) || index < 0) return [];
  const segment = plan.segments[index];
  if (!segment || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)
    || segment.start < 0 || segment.end > 1 || segment.end - segment.start <= EPSILON) return [];
  const width = segment.end - segment.start;
  const result: CharacterCue[] = [];
  for (const cue of plan.cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end)
      || cue.start < 0 || cue.end > 1 || cue.end - cue.start <= EPSILON
      || !Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime)
      || cue.startTime < 0 || cue.endTime <= cue.startTime
      || (cue.sourceIndex !== undefined && (!Number.isInteger(cue.sourceIndex) || cue.sourceIndex < 0))) continue;
    const start = Math.max(segment.start, cue.start);
    const end = Math.min(segment.end, cue.end);
    if (end - start <= EPSILON) continue;
    const duration = cue.endTime - cue.startTime;
    const cueWidth = cue.end - cue.start;
    const part: CharacterCue = {
      startTime: cue.startTime + (start - cue.start) / cueWidth * duration,
      endTime: cue.startTime + (end - cue.start) / cueWidth * duration,
      start: clamp((start - segment.start) / width),
      end: clamp((end - segment.start) / width),
    };
    if (cue.sourceIndex !== undefined) part.sourceIndex = cue.sourceIndex;
    const previous = result[result.length - 1];
    // Sorting would conceal a broken source timeline and change its indices.
    if (previous && (part.startTime < previous.endTime || part.start < previous.end - EPSILON)) return [];
    result.push(part);
  }
  return result;
}

/** Absolute time makes replay and backward seeking independent of past frames. */
export function characterPhaseAt(cues: readonly CharacterCue[], timeMs: number): CharacterPhase {
  if (!Number.isFinite(timeMs) || !cues.length) return { phase: 0, state: "before" };
  let previous: CharacterCue | undefined;
  for (const cue of cues) {
    if (!Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime)
      || cue.startTime < 0 || cue.endTime <= cue.startTime
      || !Number.isFinite(cue.start) || !Number.isFinite(cue.end)
      || cue.start < 0 || cue.end > 1 || cue.end <= cue.start
      || (previous && (cue.startTime < previous.endTime || cue.start < previous.end - EPSILON))) {
      return { phase: 0, state: "before" };
    }
    previous = cue;
  }
  const first = cues[0]!;
  if (timeMs < first.startTime) return { phase: 0, state: "before" };
  let left = 0;
  let right = cues.length - 1;
  while (left < right) {
    const middle = Math.ceil((left + right) / 2);
    if (cues[middle]!.startTime <= timeMs) left = middle;
    else right = middle - 1;
  }
  const cue = cues[left]!;
  if (timeMs >= cue.endTime) {
    return { phase: clamp(cue.end), state: left === cues.length - 1 ? "after" : "gap" };
  }
  const local = (timeMs - cue.startTime) / (cue.endTime - cue.startTime);
  return { phase: clamp(cue.start + (cue.end - cue.start) * local), state: "active" };
}
