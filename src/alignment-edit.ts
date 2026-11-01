import type { TranslationAlignment, TranslationMotionSettings } from "./types";

/** Absolute, playback-normalized times of each original syllable, in ms. */
export interface SyllableTimes { start: number; end: number }

export interface EditContext {
  syllables: readonly SyllableTimes[];
  lineStart: number;
  lineEnd: number;
}

const MIN_SPAN_MS = 10;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const copy = (parts: readonly TranslationAlignment[]): TranslationAlignment[] => parts.map(part => ({ ...part }));
const manual = (part: TranslationAlignment): boolean => part.startTime !== undefined && part.endTime !== undefined;

/** Render phrase texts as one editable string. "/" separates phrases; a literal
 * slash or backslash is escaped with a backslash. A space after the separator
 * is only added when the phrase already ends in whitespace, so the visible
 * "hold on / to me" maps back to "hold on " + "to me" without doubling it. */
export function formatSegments(texts: readonly string[]): string {
  return texts.map(text => text.replace(/[\\/]/g, value => `\\${value}`))
    .reduce((output, text, index) => index === 0 ? text
      : output + (/\s$/.test(texts[index - 1]!) ? "/ " : "/") + text, "");
}

/** Inverse of formatSegments. Empty phrases are dropped and whitespace-only
 * phrases join their neighbour, so a half-typed "/" never yields an invalid part. */
export function parseSegments(input: string): string[] {
  const output: string[] = [];
  let current = "";
  let prefix = "";
  const push = () => {
    if (!current) return;
    if (/^\s+$/.test(current)) {
      if (output.length) output[output.length - 1] += current;
      else prefix += current;
    } else {
      output.push(prefix + current);
      prefix = "";
    }
    current = "";
  };
  for (let index = 0; index < input.length; index++) {
    const character = input[index]!;
    if (character === "\\" && index + 1 < input.length) {
      current += input[++index];
    } else if (character === "/") {
      const dropSpace = /\s$/.test(current) && input[index + 1] === " ";
      push();
      if (dropSpace) index++;
    } else current += character;
  }
  push();
  if (prefix) {
    if (output.length) output[output.length - 1] += prefix;
    else output.push(prefix);
  }
  return output;
}

export function partTimes(part: TranslationAlignment, context: EditContext): SyllableTimes {
  return {
    start: part.startTime ?? context.syllables[part.sourceStart]?.start ?? Number.NaN,
    end: part.endTime ?? context.syllables[part.sourceEnd - 1]?.end ?? Number.NaN,
  };
}

interface Boundary { leftEnd: number; rightStart: number; leftTime?: number; rightTime?: number }

/** Map an offset in the edited text back to the previous text. Unchanged
 * prefixes and suffixes keep their exact place; only the edited span stretches. */
function previousOffset(offset: number, previous: string, next: string): number {
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  if (offset <= prefix) return offset;
  if (offset >= next.length - suffix) return offset - next.length + previous.length;
  const nextSpan = next.length - suffix - prefix;
  const previousSpan = previous.length - suffix - prefix;
  return nextSpan > 0 ? prefix + (offset - prefix) * previousSpan / nextSpan : prefix;
}

export type RemapResult = { parts: TranslationAlignment[]; error?: undefined } | { parts?: undefined; error: string };

/** Rebuild phrase ranges after the phrase text changed. Boundaries that still
 * exist keep their exact syllable range and manual time; a new boundary splits
 * the old phrase in proportion to its text, and a removed one merges ranges. */
export function remapSegments(previous: readonly TranslationAlignment[], segments: readonly string[],
  context: EditContext, reword = true): RemapResult {
  const count = context.syllables.length;
  if (!segments.length) return { parts: [] };
  if (!previous.length) previous = [{ sourceStart: 0, sourceEnd: count, text: segments.join("") }];
  // Rewording phrases without adding or removing a "/" never moves a boundary.
  // A suggested (automatic) split is only a source of positions, never of order.
  if (reword && segments.length === previous.length) return { parts: previous.map((part, index) => ({ ...part, text: segments[index]! })) };
  const first = previous[0]!;
  const last = previous[previous.length - 1]!;
  if (segments.length > last.sourceEnd - first.sourceStart) {
    return { error: `分段数（${segments.length}）不能多于对应的原文音节数（${last.sourceEnd - first.sourceStart}）` };
  }
  const previousText = previous.map(part => part.text).join("");
  const nextText = segments.join("");
  const starts: number[] = [];
  previous.reduce((offset, part) => { starts.push(offset); return offset + part.text.length; }, 0);

  const boundaries: Boundary[] = [];
  let offset = 0;
  for (const segment of segments.slice(0, -1)) {
    offset += segment.length;
    const mapped = previousOffset(offset, previousText, nextText);
    const exact = starts.findIndex((start, index) => index > 0 && Math.abs(start - mapped) < 1e-9);
    if (exact > 0) {
      const left = previous[exact - 1]!;
      const right = previous[exact]!;
      boundaries.push({ leftEnd: left.sourceEnd, rightStart: right.sourceStart,
        leftTime: manual(left) ? left.endTime : undefined, rightTime: manual(right) ? right.startTime : undefined });
      continue;
    }
    let owner = 0;
    while (owner + 1 < previous.length && starts[owner + 1]! <= mapped) owner++;
    const part = previous[owner]!;
    const fraction = part.text.length ? clamp((mapped - starts[owner]!) / part.text.length, 0, 1) : 0.5;
    const split = clamp(Math.round(part.sourceStart + (part.sourceEnd - part.sourceStart) * fraction),
      part.sourceStart + 1, Math.max(part.sourceStart + 1, part.sourceEnd - 1));
    const time = manual(part) ? part.startTime! + (part.endTime! - part.startTime!) * fraction : undefined;
    boundaries.push({ leftEnd: split, rightStart: split, leftTime: time, rightTime: time });
  }

  const parts = segments.map((text, index): TranslationAlignment => {
    const sourceStart = index === 0 ? first.sourceStart : boundaries[index - 1]!.rightStart;
    const sourceEnd = index === segments.length - 1 ? last.sourceEnd : boundaries[index]!.leftEnd;
    const startTime = index === 0 ? (manual(first) ? first.startTime : undefined) : boundaries[index - 1]!.rightTime;
    const endTime = index === segments.length - 1 ? (manual(last) ? last.endTime : undefined) : boundaries[index]!.leftTime;
    return { sourceStart, sourceEnd, text,
      ...(startTime !== undefined && endTime !== undefined && endTime > startTime ? { startTime, endTime } : {}) };
  });
  const ordered = parts.every((part, index) => part.sourceEnd > part.sourceStart
    && (index === 0 || part.sourceStart >= parts[index - 1]!.sourceEnd));
  if (ordered) return { parts };
  // Many phrases were inserted into a short range at once. Spread them evenly;
  // the user can then drag any boundary into place.
  const span = last.sourceEnd - first.sourceStart;
  return { parts: segments.map((text, index) => ({ text,
    sourceStart: first.sourceStart + Math.round(span * index / segments.length),
    sourceEnd: first.sourceStart + Math.round(span * (index + 1) / segments.length) })) };
}

/** Whether the shared edge between part index and index + 1 moves as one. */
export function linked(parts: readonly TranslationAlignment[], index: number, context: EditContext): boolean {
  const left = parts[index];
  const right = parts[index + 1];
  if (!left || !right || left.sourceEnd !== right.sourceStart) return false;
  return Math.abs(partTimes(left, context).end - partTimes(right, context).start) < 1;
}

/** Snap one edge of a phrase to a syllable boundary (0…count). The neighbour on a
 * shared edge follows, so a fully covered line stays fully covered. Manual times
 * on the moved edge snap to that syllable as well. */
export function snapEdge(parts: readonly TranslationAlignment[], index: number, edge: "start" | "end",
  boundary: number, context: EditContext): TranslationAlignment[] {
  const next = copy(parts);
  const part = next[index];
  if (!part) return next;
  const count = context.syllables.length;
  if (edge === "end") {
    const neighbour = next[index + 1];
    const join = linked(parts, index, context);
    const upper = neighbour ? (join ? neighbour.sourceEnd - 1 : neighbour.sourceStart) : count;
    const value = clamp(Math.round(boundary), part.sourceStart + 1, Math.max(part.sourceStart + 1, upper));
    part.sourceEnd = value;
    if (manual(part)) part.endTime = Math.max(part.startTime! + MIN_SPAN_MS, context.syllables[value - 1]!.end);
    if (join && neighbour) {
      neighbour.sourceStart = value;
      if (manual(neighbour)) neighbour.startTime = Math.min(neighbour.endTime! - MIN_SPAN_MS, context.syllables[value]!.start);
    }
  } else {
    const neighbour = next[index - 1];
    const join = linked(parts, index - 1, context);
    const lower = neighbour ? (join ? neighbour.sourceStart + 1 : neighbour.sourceEnd) : 0;
    const value = clamp(Math.round(boundary), Math.min(lower, part.sourceEnd - 1), part.sourceEnd - 1);
    part.sourceStart = value;
    if (manual(part)) part.startTime = Math.min(part.endTime! - MIN_SPAN_MS, context.syllables[value]!.start);
    if (join && neighbour) {
      neighbour.sourceEnd = value;
      if (manual(neighbour)) neighbour.endTime = Math.max(neighbour.startTime! + MIN_SPAN_MS, context.syllables[value - 1]!.end);
    }
  }
  return next;
}

/** Move one edge to a free time. The phrase (and a touching neighbour) gain
 * manual times; the source range is unchanged. */
export function moveEdgeTime(parts: readonly TranslationAlignment[], index: number, edge: "start" | "end",
  time: number, context: EditContext): TranslationAlignment[] {
  const next = copy(parts);
  const part = next[index];
  if (!part) return next;
  const own = partTimes(part, context);
  const neighbourIndex = edge === "end" ? index + 1 : index - 1;
  const neighbour = next[neighbourIndex];
  const join = linked(parts, edge === "end" ? index : index - 1, context);
  const other = neighbour && partTimes(neighbour, context);
  part.startTime = own.start;
  part.endTime = own.end;
  if (edge === "end") {
    const upper = other ? (join ? other.end - MIN_SPAN_MS : other.start) : context.lineEnd;
    part.endTime = clamp(Math.round(time), own.start + MIN_SPAN_MS, upper);
    if (join && neighbour && other) { neighbour.startTime = part.endTime; neighbour.endTime = other.end; }
  } else {
    const lower = other ? (join ? other.start + MIN_SPAN_MS : other.end) : context.lineStart;
    part.startTime = clamp(Math.round(time), lower, own.end - MIN_SPAN_MS);
    if (join && neighbour && other) { neighbour.endTime = part.startTime; neighbour.startTime = other.start; }
  }
  return next;
}

/** The syllable boundary (0…count) closest to a time on the line. */
export function nearestBoundary(time: number, context: EditContext): number {
  const syllables = context.syllables;
  let best = 0;
  let distance = Infinity;
  for (let boundary = 0; boundary <= syllables.length; boundary++) {
    const at = boundary === 0 ? syllables[0]!.start
      : boundary === syllables.length ? syllables[boundary - 1]!.end
        : (syllables[boundary - 1]!.end + syllables[boundary]!.start) / 2;
    if (Math.abs(at - time) < distance) { distance = Math.abs(at - time); best = boundary; }
  }
  return best;
}

export const MOTION_DEFAULTS = { amplitude: 1, stagger: 0.4, settleMs: 300 } as const;

export const MOTION_PRESETS: ReadonlyArray<{ id: string; label: string; description: string; motion?: TranslationMotionSettings }> = [
  { id: "still", label: "静止", description: "只跟随原文变亮，不跳动", motion: { amplitude: 0 } },
  { id: "soft", label: "柔和", description: "幅度小、几乎同时起落", motion: { amplitude: 0.6, stagger: 0.15, settleMs: 500 } },
  { id: "standard", label: "标准", description: "与原文动画一致" },
  { id: "lively", label: "活泼", description: "幅度大、逐字依次跳起", motion: { amplitude: 1.4, stagger: 0.65, settleMs: 200 } },
];

function resolved(motion: TranslationMotionSettings | undefined): Required<TranslationMotionSettings> {
  return {
    amplitude: motion?.amplitude ?? MOTION_DEFAULTS.amplitude,
    stagger: motion?.stagger ?? MOTION_DEFAULTS.stagger,
    settleMs: motion?.settleMs ?? MOTION_DEFAULTS.settleMs,
  };
}

/** The preset matching these settings, or "custom". */
export function motionPresetId(motion: TranslationMotionSettings | undefined): string {
  const value = resolved(motion);
  const match = MOTION_PRESETS.find(preset => {
    const candidate = resolved(preset.motion);
    return Math.abs(candidate.amplitude - value.amplitude) < 1e-9
      && Math.abs(candidate.stagger - value.stagger) < 1e-9
      && Math.abs(candidate.settleMs - value.settleMs) < 1e-9;
  });
  return match?.id ?? "custom";
}
