import type { LyricLine } from "./types";

export interface NativeMotionSource {
  /** The original word, or the shared container of its animated letters. */
  element: HTMLElement;
  /** All letters in the rendered word, retaining their actual DOM order. */
  letters: HTMLElement[];
  /** Half-open subset belonging to this cached syllable in a joined word. */
  letterStart: number;
  letterEnd: number;
  /** Original wrappers between the line and element, ordered outside to inside. */
  ancestors: HTMLElement[];
}

const NATIVE_WORD = ".word:not(.dot), .letterGroup";
const EXCLUDED = "[data-lyric-layer-translation], .slt-interleaved-translation, .slt-romanization-line, .slt-original-line, .slt-replace-line, .bg-line, .bg-word, .musical-line, .dot";
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

function normalizedText(text: string): string {
  // Whitespace is represented differently by word groups, SpaceLetter spans,
  // and joined syllables. Keep punctuation and case as strict source evidence.
  return text.replace(ZERO_WIDTH, "").replace(/\s+/gu, "");
}

function nativeText(element: HTMLElement): string {
  // Do not mutate the live animation tree, including third-party annotations.
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(EXCLUDED).forEach((node) => node.remove());
  return normalizedText(copy.textContent ?? "");
}

function wrappersBetween(line: Element, element: HTMLElement): HTMLElement[] {
  const wrappers: HTMLElement[] = [];
  for (let parent = element.parentElement; parent && parent !== line; parent = parent.parentElement) wrappers.push(parent);
  return wrappers.reverse();
}

function letterContainer(root: HTMLElement, letters: HTMLElement[]): HTMLElement {
  let parent = letters[0]?.parentElement;
  while (parent && parent !== root && !letters.every((letter) => parent!.contains(letter))) parent = parent.parentElement;
  return parent ?? root;
}

/** Bind stable source syllable indices to the original, live animation nodes.
 * Text must match as a whole before any binding is accepted: romanized or
 * replaced lyrics must never accidentally borrow another word's animation.
 * Joining two cached syllables does not change their original source indices.
 */
export function bindNativeMotionSources(line: Element, lyric: LyricLine): Map<number, NativeMotionSource> {
  const result = new Map<number, NativeMotionSource>();
  if (!lyric.syllables?.length) return result;

  const roots = Array.from(line.querySelectorAll<HTMLElement>(NATIVE_WORD)).filter((element) =>
    !element.closest(EXCLUDED) && element.closest(".line") === line
    && !element.parentElement?.closest(NATIVE_WORD));

  let offset = 0;
  const rendered = roots.flatMap((root) => {
    const text = nativeText(root);
    if (!text) return [];
    const start = offset;
    offset += text.length;
    let letters = Array.from(root.querySelectorAll<HTMLElement>(".letter"))
      .filter((element) => !element.closest(EXCLUDED) && element.closest(".line") === line);
    const letterTexts = letters.map(nativeText);
    // Mixed plain and letter text has no unambiguous letter-coordinate system.
    if (letterTexts.join("") !== text) letters = [];
    let letterOffset = 0;
    const ranges = letters.map((_letter, index) => {
      const start = letterOffset;
      letterOffset += letterTexts[index]!.length;
      return { start, end: letterOffset };
    });
    const element = letters.length ? letterContainer(root, letters) : root;
    return [{ text, start, end: offset, element, letters, ranges, ancestors: wrappersBetween(line, element) }];
  });

  const sourceTexts = lyric.syllables.map((syllable) => normalizedText(syllable.text));
  if (!offset || rendered.map((unit) => unit.text).join("") !== sourceTexts.join("")) return result;

  let sourceOffset = 0;
  let renderedIndex = 0;
  sourceTexts.forEach((text, sourceIndex) => {
    const start = sourceOffset;
    sourceOffset += text.length;
    if (!text) return;
    while (rendered[renderedIndex] && rendered[renderedIndex]!.end <= start) renderedIndex++;
    const unit = rendered[renderedIndex];
    // Spicy may join multiple source syllables. The opposite case, splitting a
    // cached syllable across independent words, has no single faithful source.
    if (!unit || start < unit.start || sourceOffset > unit.end) return;
    const localStart = start - unit.start;
    const localEnd = sourceOffset - unit.start;
    const overlaps = unit.ranges.flatMap((range, index) => range.end > localStart && range.start < localEnd ? [index] : []);
    result.set(sourceIndex, {
      element: unit.element,
      letters: unit.letters,
      letterStart: overlaps[0] ?? 0,
      letterEnd: overlaps.length ? overlaps[overlaps.length - 1]! + 1 : 0,
      ancestors: unit.ancestors,
    });
  });
  return result;
}
