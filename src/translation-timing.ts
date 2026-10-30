import type { LyricLine, TranslationAlignment, TranslationLine, TranslationMotionSettings } from "./types";

export interface TranslationTiming {
  segments: Array<{ text: string; start: number; end: number }>;
  cues: Array<{ startTime: number; endTime: number; start: number; end: number; sourceIndex?: number }>;
  method: "aligned" | "punctuation" | "weighted";
  motion?: TranslationMotionSettings;
}

interface Unit { text: string; weight: number }
interface SourceUnit {
  text: string;
  startTime: number;
  endTime: number;
  sourceIndex: number;
  isPartOfWord?: boolean;
  start: number;
  end: number;
}
interface Anchor { source: number; target: number }

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD = /[\p{L}\p{N}]/u;
const DECORATION = /^[\p{P}\p{Z}\s]+$/u;
const OPENING = /^[([{（［｛「『【《〈“‘]$/u;
const PHRASE_END = /[,，、;；:：.!！?？。](?:[\s\p{P}]*)$/u;

// Segmenter is present in Spotify's Chromium. The small fallback also keeps
// combining marks, ZWJ emoji and flag pairs intact in older JS hosts.
function graphemes(text: string): string[] {
  const Constructor = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: string }) => {
      segment(value: string): Iterable<{ segment: string }>;
    };
  }).Segmenter;
  if (Constructor) return Array.from(new Constructor(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
  const result: string[] = [];
  for (const point of text) {
    const previous = result[result.length - 1];
    const extendsPrevious = /^[\p{M}\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}]$/u.test(point)
      || point === "\u200D" || previous?.endsWith("\u200D")
      || (point === "\n" && previous === "\r")
      || (/^\p{Regional_Indicator}$/u.test(point) && previous !== undefined && /^\p{Regional_Indicator}$/u.test(previous));
    if (previous !== undefined && extendsPrevious) result[result.length - 1] += point;
    else result.push(point);
  }
  return result;
}

function textWeight(text: string): number {
  return graphemes(text).filter((part) => !DECORATION.test(part)).length;
}

function translationUnits(text: string): Unit[] {
  const parts = graphemes(text);
  const units: Unit[] = [];
  let pending = "";
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (DECORATION.test(part)) {
      if (!units.length || OPENING.test(part) || pending) pending += part;
      else units[units.length - 1]!.text += part;
      continue;
    }
    let value = part;
    if (WORD.test(part) && !CJK.test(part)) {
      while (index + 1 < parts.length) {
        const next = parts[index + 1]!;
        if (WORD.test(next) && !CJK.test(next)) { value += next; index++; continue; }
        const after = parts[index + 2];
        const connector = /^['’\-]$/u.test(next)
          || (next === "." && /\p{N}$/u.test(value) && after !== undefined && /^\p{N}/u.test(after));
        if (connector && after !== undefined && WORD.test(after) && !CJK.test(after)) {
          value += next + after;
          index += 2;
          continue;
        }
        break;
      }
    }
    units.push({ text: pending + value, weight: Math.max(1, textWeight(value)) });
    pending = "";
  }
  if (pending && units.length) units[units.length - 1]!.text += pending;
  return units;
}

function timedSource(line: LyricLine): SourceUnit[] {
  const valid = (line.syllables ?? []).flatMap((syllable, sourceIndex) => {
    const { startTime, endTime, text } = syllable;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime || !textWeight(text)) return [];
    return [{ text, startTime, endTime, sourceIndex, isPartOfWord: syllable.isPartOfWord, start: 0, end: 0 }];
  });
  // Sorting would change the meaning of explicit source indices. A reversed or
  // simultaneous timeline is instead handled by the reliable line-level fallback.
  if (valid.some((unit, index) => index > 0 && unit.startTime <= valid[index - 1]!.startTime)) return [];
  const total = valid.reduce((sum, unit) => sum + textWeight(unit.text), 0);
  let position = 0;
  valid.forEach((unit, index) => {
    unit.start = position / total;
    position += textWeight(unit.text);
    unit.end = position / total;
    const next = valid[index + 1];
    if (next) unit.endTime = Math.min(unit.endTime, next.startTime);
  });
  return valid;
}

function addAnchor(anchors: Anchor[], candidate: Anchor): boolean {
  const same = anchors.find((anchor) => anchor.source === candidate.source);
  if (same) return Math.abs(same.target - candidate.target) < 1e-9;
  const preceding = anchors.filter((anchor) => anchor.source < candidate.source);
  const before = preceding[preceding.length - 1];
  const after = anchors.find((anchor) => anchor.source > candidate.source);
  if ((before && candidate.target < before.target) || (after && candidate.target > after.target)) return false;
  anchors.push(candidate);
  anchors.sort((left, right) => left.source - right.source);
  return true;
}

function explicitAnchors(source: SourceUnit[], translation: TranslationLine): Anchor[] | undefined {
  const alignment = translation.alignment;
  if (!alignment?.length || alignment.map((part) => part.text).join("") !== translation.translatedText) return undefined;
  const total = textWeight(translation.translatedText);
  const boundaries = new Set<number>([0]);
  let offset = 0;
  for (const grapheme of graphemes(translation.translatedText)) { offset += grapheme.length; boundaries.add(offset); }
  const anchors: Anchor[] = [{ source: 0, target: 0 }, { source: 1, target: 1 }];
  let previousSourceEnd = 0;
  let targetWeight = 0;
  let textOffset = 0;
  for (const part of alignment) {
    if (!Number.isInteger(part.sourceStart) || !Number.isInteger(part.sourceEnd)
      || part.sourceStart < previousSourceEnd || part.sourceEnd <= part.sourceStart || !part.text) return undefined;
    const first = source.find((unit) => unit.sourceIndex === part.sourceStart);
    const last = source.find((unit) => unit.sourceIndex === part.sourceEnd - 1);
    if (!first || !last || source.filter((unit) => unit.sourceIndex >= part.sourceStart && unit.sourceIndex < part.sourceEnd).length !== part.sourceEnd - part.sourceStart) return undefined;
    textOffset += part.text.length;
    if (!boundaries.has(textOffset)) return undefined;
    const targetStart = targetWeight / total;
    targetWeight += textWeight(part.text);
    if (!addAnchor(anchors, { source: first.start, target: targetStart })
      || !addAnchor(anchors, { source: last.end, target: targetWeight / total })) return undefined;
    previousSourceEnd = part.sourceEnd;
  }
  return anchors;
}

export function validateTranslationMotion(motion: unknown): string | undefined {
  if (motion === undefined) return undefined;
  if (!motion || typeof motion !== "object" || Array.isArray(motion)) return "动画设置必须是对象";
  const values = motion as Record<string, unknown>;
  for (const [key, label, min, max] of [["amplitude", "动画幅度", 0, 2], ["stagger", "逐字错开", 0, 0.8],
    ["settleMs", "归位时长", 100, 1000]] as const) {
    const value = values[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)) {
      return `${label}必须是 ${min}–${max} 之间的数值`;
    }
  }
  return undefined;
}

/** Validate an editor/import draft against the actual source before saving it.
 * JSON alone cannot validate source indices, line bounds or untouched timings. */
export function validateVisualTranslation(line: LyricLine, translation: TranslationLine): string | undefined {
  if (typeof translation.translatedText !== "string") return "译文必须是文本";
  const motionError = validateTranslationMotion(translation.motion);
  if (motionError) return motionError;
  const alignment = translation.alignment;
  if (alignment === undefined) return undefined;
  if (!Array.isArray(alignment) || !alignment.length) return "片段对应不能为空";
  if (translation.originalText !== undefined && translation.originalText !== line.text) return "原歌词已变化，请重新设置片段对应";
  const source = timedSource(line);
  if (!source.length) return "当前行缺少有效的逐字时间，不能设置片段对应";
  const lineStart = Number.isFinite(line.startTime) ? line.startTime! : source[0]!.startTime;
  const lineEnd = Number.isFinite(line.endTime) ? line.endTime! : source[source.length - 1]!.endTime;
  let previousSourceEnd = 0;
  let previousTimeEnd = 0;
  for (const [index, part] of alignment.entries()) {
    const prefix = `第 ${index + 1} 段`;
    if (!part || typeof part.text !== "string" || !part.text) return `${prefix}的译文不能为空`;
    if (!Number.isSafeInteger(part.sourceStart) || !Number.isSafeInteger(part.sourceEnd)
      || part.sourceStart < 0 || part.sourceEnd <= part.sourceStart) return `${prefix}的原音节范围无效`;
    if (part.sourceStart < previousSourceEnd) return "原音节范围必须按顺序且不能重叠";
    const members = source.filter(unit => unit.sourceIndex >= part.sourceStart && unit.sourceIndex < part.sourceEnd);
    if (members.length !== part.sourceEnd - part.sourceStart) return `${prefix}的原音节范围越界或含无效时间`;
    const hasTime = part.startTime !== undefined || part.endTime !== undefined;
    if (hasTime && (typeof part.startTime !== "number" || typeof part.endTime !== "number"
      || !Number.isFinite(part.startTime) || !Number.isFinite(part.endTime)
      || part.startTime < 0 || part.endTime <= part.startTime)) return `${prefix}的开始和结束时间必须成对填写，且结束晚于开始`;
    const start = hasTime ? part.startTime! : members[0]!.startTime;
    const end = hasTime ? part.endTime! : members[members.length - 1]!.endTime;
    if (hasTime && (lineStart < 0 || lineEnd <= lineStart || start < lineStart || end > lineEnd)) {
      return `${prefix}的手动时间必须位于原行 ${lineStart}–${lineEnd} 毫秒内`;
    }
    if (start < previousTimeEnd) return `${prefix}的时间与前一片段重叠或倒序`;
    previousSourceEnd = part.sourceEnd;
    previousTimeEnd = end;
  }
  if (alignment.map(part => part.text).join("") !== translation.translatedText) return "片段文本必须完整拼回译文，包括空格和标点";
  if (!explicitAnchors(source, translation)) return "片段边界不能拆开完整字符，且对应必须覆盖有效译文";
  return undefined;
}

function projectSourceTimes(source: SourceUnit[], alignment: TranslationAlignment[]): SourceUnit[] {
  return source.map(unit => {
    const part = alignment.find(value => unit.sourceIndex >= value.sourceStart && unit.sourceIndex < value.sourceEnd);
    if (!part || part.startTime === undefined || part.endTime === undefined) return unit;
    const first = source.find(value => value.sourceIndex === part.sourceStart)!;
    const last = source.find(value => value.sourceIndex === part.sourceEnd - 1)!;
    const ratio = (part.endTime - part.startTime) / (last.endTime - first.startTime);
    return { ...unit,
      startTime: unit === first ? part.startTime : part.startTime + (unit.startTime - first.startTime) * ratio,
      endTime: unit === last ? part.endTime : part.startTime + (unit.endTime - first.startTime) * ratio,
    };
  });
}

function identityKey(text: string): string | undefined {
  const clean = text.normalize("NFKC").replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "").toLocaleLowerCase();
  return /^(?:\d+(?:[.,]\d+)*|[a-z][a-z'’\-]+)$/u.test(clean) ? clean : undefined;
}

function addIdentityAnchors(source: SourceUnit[], segments: TranslationTiming["segments"], anchors: Anchor[]): void {
  const words: Array<{ text: string; start: number; end: number }> = [];
  source.forEach((unit, index) => {
    const previous = source[index - 1];
    if (previous?.isPartOfWord && words.length) {
      const word = words[words.length - 1]!;
      word.text += unit.text;
      word.end = unit.end;
    } else words.push({ text: unit.text, start: unit.start, end: unit.end });
  });
  const sourceKeys = words.map((word) => identityKey(word.text));
  const targetKeys = segments.map((segment) => identityKey(segment.text));
  words.forEach((word, index) => {
    const key = sourceKeys[index];
    if (!key || sourceKeys.filter((other) => other === key).length !== 1 || targetKeys.filter((other) => other === key).length !== 1) return;
    const segment = segments[targetKeys.indexOf(key)]!;
    const proposed = anchors.map((anchor) => ({ ...anchor }));
    if (addAnchor(proposed, { source: word.start, target: segment.start })
      && addAnchor(proposed, { source: word.end, target: segment.end })) anchors.splice(0, anchors.length, ...proposed);
  });
}

function mappedPosition(position: number, anchors: Anchor[]): number {
  const afterIndex = anchors.findIndex((anchor) => anchor.source >= position);
  if (afterIndex <= 0) return anchors[0]!.target;
  const before = anchors[afterIndex - 1]!;
  const after = anchors[afterIndex]!;
  return before.target + (after.target - before.target) * (position - before.source) / (after.source - before.source);
}

/** Build approximate timing once per lyric/translation pair; never call an AI at playback time. */
export function buildTranslationTiming(line: LyricLine, translation: TranslationLine): TranslationTiming | undefined {
  const hasManualTime = translation.alignment?.some(part => part.startTime !== undefined || part.endTime !== undefined);
  if (hasManualTime && validateVisualTranslation(line, translation)) return undefined;
  const motion = validateTranslationMotion(translation.motion) ? undefined : translation.motion;
  const units = translationUnits(translation.translatedText);
  const total = units.reduce((sum, unit) => sum + unit.weight, 0);
  if (!total) return undefined;
  let position = 0;
  const segments = units.map((unit) => {
    const start = position / total;
    position += unit.weight;
    return { text: unit.text, start, end: position / total };
  });
  const source = timedSource(line);
  if (!source.length) {
    const { startTime, endTime } = line;
    if (startTime === undefined || endTime === undefined || !Number.isFinite(startTime)
      || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) return undefined;
    return { segments, cues: [{ startTime, endTime, start: 0, end: 1 }], method: "weighted", ...(motion ? { motion } : {}) };
  }
  // A provider may replace its lyric text while keeping roughly the same times.
  // Explicit indices from a different source text must not silently drift.
  let anchors = translation.originalText !== undefined && translation.originalText !== line.text
    ? undefined : explicitAnchors(source, translation);
  let method: TranslationTiming["method"] = anchors ? "aligned" : "weighted";
  if (!anchors) {
    anchors = [{ source: 0, target: 0 }, { source: 1, target: 1 }];
    const sourceBreaks = source.filter((unit, index) => index < source.length - 1 && PHRASE_END.test(unit.text)).map((unit) => unit.end);
    const targetBreaks = segments.filter((segment, index) => index < segments.length - 1 && PHRASE_END.test(segment.text)).map((segment) => segment.end);
    if (sourceBreaks.length > 0 && sourceBreaks.length === targetBreaks.length) {
      sourceBreaks.forEach((value, index) => addAnchor(anchors!, { source: value, target: targetBreaks[index]! }));
      method = "punctuation";
    }
    addIdentityAnchors(source, segments, anchors);
  }
  return {
    segments,
    cues: (method === "aligned" ? projectSourceTimes(source, translation.alignment!) : source)
      .map((unit) => ({ startTime: unit.startTime, endTime: unit.endTime, sourceIndex: unit.sourceIndex,
        start: mappedPosition(unit.start, anchors!), end: mappedPosition(unit.end, anchors!) }))
      // An omitted source phrase has no translated ink. Keeping its old times
      // could place a zero-width cue over a manually shifted neighbouring cue.
      .filter(cue => method !== "aligned" || cue.end > cue.start),
    method,
    ...(motion ? { motion } : {}),
  };
}

/** Absolute player time makes pause, seek backwards and remount deterministic. */
export function translationProgressAt(plan: TranslationTiming, timeMs: number): number {
  if (!Number.isFinite(timeMs) || !plan.cues.length || timeMs < plan.cues[0]!.startTime) return 0;
  let left = 0;
  let right = plan.cues.length - 1;
  while (left < right) {
    const middle = Math.ceil((left + right) / 2);
    if (plan.cues[middle]!.startTime <= timeMs) left = middle;
    else right = middle - 1;
  }
  const cue = plan.cues[left]!;
  const fraction = Math.max(0, Math.min(1, (timeMs - cue.startTime) / (cue.endTime - cue.startTime)));
  return Math.max(0, Math.min(1, cue.start + (cue.end - cue.start) * fraction));
}
