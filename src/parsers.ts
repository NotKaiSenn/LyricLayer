import type { TranslationEntry, TranslationLine } from "./types";

export function parseTxt(input: string, preserveEmptyLines = false): TranslationLine[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let rows = normalized.split("\n");
  if (rows[rows.length - 1] === "") rows = rows.slice(0, -1);
  if (!preserveEmptyLines) rows = rows.filter((row) => row.trim().length > 0);
  return rows.map((translatedText, index) => ({ index, translatedText: translatedText.trim() }));
}

function timestampToMs(minutes: string, seconds: string, fraction?: string): number {
  const base = Number(minutes) * 60_000 + Number(seconds) * 1_000;
  if (!fraction) return base;
  return base + Number(fraction.padEnd(3, "0").slice(0, 3));
}

export function parseLrc(input: string): TranslationLine[] {
  const output: TranslationLine[] = [];
  const rowPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const rawRow of input.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const stamps = [...rawRow.matchAll(rowPattern)];
    if (!stamps.length) continue;
    const text = rawRow.replace(rowPattern, "").trim();
    if (!text) continue;
    for (const stamp of stamps) {
      output.push({
        startTime: timestampToMs(stamp[1] ?? "0", stamp[2] ?? "0", stamp[3]),
        translatedText: text,
      });
    }
  }
  return output.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJson(input: string): { trackUri?: string; lines: TranslationLine[]; entry?: TranslationEntry } {
  const parsed: unknown = JSON.parse(input.replace(/^\uFEFF/, ""));
  if (!isObject(parsed) || !Array.isArray(parsed.lines)) {
    throw new Error("JSON 必须包含 lines 数组");
  }
  const lines = parsed.lines.map((raw, position): TranslationLine => {
    if (!isObject(raw) || typeof raw.translatedText !== "string") {
      throw new Error(`JSON 第 ${position + 1} 行缺少 translatedText`);
    }
    const result: TranslationLine = { translatedText: raw.translatedText };
    if (typeof raw.index === "number" && Number.isInteger(raw.index) && raw.index >= 0) result.index = raw.index;
    if (typeof raw.startTime === "number" && Number.isFinite(raw.startTime)) result.startTime = raw.startTime;
    if (typeof raw.originalText === "string") result.originalText = raw.originalText;
    return result;
  });
  const trackUri = typeof parsed.trackUri === "string" ? parsed.trackUri : undefined;
  const isEntry = parsed.version === 1 && trackUri && typeof parsed.createdAt === "number" && typeof parsed.updatedAt === "number";
  return { trackUri, lines, entry: isEntry ? parsed as unknown as TranslationEntry : undefined };
}
