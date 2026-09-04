import type { LyricLine, TranslationLine } from "./types";

export const DEFAULT_TIME_TOLERANCE_MS = 1_000;

export function normalizeLyricText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function matchTranslations(
  lyricsLines: readonly LyricLine[],
  translationLines: readonly TranslationLine[],
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS,
): Map<number, TranslationLine> {
  const result = new Map<number, TranslationLine>();
  const usedTranslations = new Set<number>();

  const candidates: Array<{ lyric: number; translation: number; difference: number }> = [];
  lyricsLines.forEach((lyric, lyricPosition) => {
    const lyricStart = lyric.startTime;
    if (lyricStart === undefined) return;
    translationLines.forEach((translation, translationPosition) => {
      if (translation.startTime === undefined) return;
      const difference = Math.abs(lyricStart - translation.startTime);
      if (difference <= toleranceMs) candidates.push({ lyric: lyricPosition, translation: translationPosition, difference });
    });
  });
  candidates.sort((a, b) => a.difference - b.difference);
  for (const candidate of candidates) {
    const lyricIndex = lyricsLines[candidate.lyric]?.index;
    if (lyricIndex === undefined || result.has(lyricIndex) || usedTranslations.has(candidate.translation)) continue;
    result.set(lyricIndex, translationLines[candidate.translation]!);
    usedTranslations.add(candidate.translation);
  }

  translationLines.forEach((translation, translationPosition) => {
    if (usedTranslations.has(translationPosition) || translation.index === undefined) return;
    const target = lyricsLines.find((line) => line.index === translation.index);
    if (!target || result.has(target.index)) return;
    result.set(target.index, translation);
    usedTranslations.add(translationPosition);
  });

  translationLines.forEach((translation, translationPosition) => {
    if (usedTranslations.has(translationPosition) || !translation.originalText) return;
    const key = normalizeLyricText(translation.originalText);
    if (!key) return;
    const target = lyricsLines.find((line) => !result.has(line.index) && normalizeLyricText(line.text) === key);
    if (!target) return;
    result.set(target.index, translation);
    usedTranslations.add(translationPosition);
  });

  return result;
}
