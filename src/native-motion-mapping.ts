import type { TranslationTiming } from "./translation-timing";

export interface MotionSource {
  /** Index in the original lyric's syllable array, before filtering or grouping. */
  sourceIndex: number;
  /** Midpoint of the covered part of this syllable, from 0 to 1. */
  position: number;
  /** This source's share of the segment's mapped text, normalized to sum to 1. */
  weight: number;
}

/**
 * Reuse the phrase/identity alignment from timing to select original animations.
 * A long source syllable can drive several translated characters; a translated
 * word can retain several source candidates for the renderer to follow in turn.
 * No DOM-letter counts or playback history are involved in this mapping.
 */
export function motionSourcesForSegment(timing: TranslationTiming, segmentIndex: number): MotionSource[] {
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return [];
  const segment = timing.segments[segmentIndex];
  if (!segment || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)
    || segment.end <= segment.start) return [];

  const sources: MotionSource[] = [];
  let covered = 0;
  for (const cue of timing.cues) {
    if (cue.sourceIndex === undefined || !Number.isInteger(cue.sourceIndex) || cue.sourceIndex < 0
      || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start
      || !Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime) || cue.endTime <= cue.startTime) continue;
    const start = Math.max(segment.start, cue.start);
    const end = Math.min(segment.end, cue.end);
    const overlap = end - start;
    // Adjacent floating-point boundaries can differ by an insignificant ulp.
    // Do not attach a neighboring word's movement to such an empty intersection.
    if (overlap <= Number.EPSILON * 8) continue;
    sources.push({
      sourceIndex: cue.sourceIndex,
      position: ((start + end) / 2 - cue.start) / (cue.end - cue.start),
      weight: overlap,
    });
    covered += overlap;
  }
  if (!covered) return [];
  return sources.map((source) => ({ ...source, weight: source.weight / covered }));
}
