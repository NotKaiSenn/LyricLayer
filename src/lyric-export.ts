import type { TranslationLine } from "./types";

export type LyricExportMode = "original" | "original-timed" | "translation" | "translation-timed";

export function exportLyrics(
  lines: readonly TranslationLine[],
  mode: LyricExportMode,
): { text: string; extension: "txt" | "lrc"; lineCount: number } {
  const translated = mode === "translation" || mode === "translation-timed";
  const timed = mode === "original-timed" || mode === "translation-timed";
  const rows: string[] = [];

  for (const [index, line] of lines.entries()) {
    const text = cleanText(translated ? line.translatedText : line.originalText);
    if (!text) continue;

    if (timed) {
      if (typeof line.startTime !== "number" || !Number.isFinite(line.startTime) || line.startTime < 0) {
        throw new Error(`第 ${index + 1} 行歌词缺少有效时间戳，请使用不带时间戳的导出方式。`);
      }
      rows.push(`${formatTimestamp(line.startTime)}${text}`);
    } else {
      rows.push(text);
    }
  }

  if (!rows.length) {
    throw new Error(translated ? "暂无可导出的翻译，请先添加并保存翻译。" : "暂无可导出的原文歌词，请先打开 Spicy Lyrics 并等待歌词加载。");
  }

  return { text: rows.join("\n"), extension: timed ? "lrc" : "txt", lineCount: rows.length };
}

function cleanText(text: string | undefined): string {
  return (text ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ")
    .trim();
}

function formatTimestamp(startTime: number): string {
  const totalMilliseconds = Math.round(startTime);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}]`;
}
