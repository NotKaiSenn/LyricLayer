import type { TranslationAlignment, TranslationEntry, TranslationLine, TranslationMotionSettings } from "./types";

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

function parseAlignment(value: unknown, text: string, position: number): TranslationAlignment[] {
  const prefix = `JSON 第 ${position + 1} 行 alignment`;
  if (!Array.isArray(value) || !value.length) throw new Error(`${prefix} 必须是非空数组`);
  let previousEnd = 0;
  let previousTimeEnd = 0;
  const alignment = value.map((part, partIndex): TranslationAlignment => {
    if (!isObject(part) || typeof part.text !== "string" || !part.text
      || typeof part.sourceStart !== "number" || !Number.isSafeInteger(part.sourceStart)
      || typeof part.sourceEnd !== "number" || !Number.isSafeInteger(part.sourceEnd)
      || part.sourceStart < 0 || part.sourceEnd <= part.sourceStart) {
      throw new Error(`${prefix} 第 ${partIndex + 1} 段需要 text 和有效的 sourceStart/sourceEnd 音节范围`);
    }
    if (part.sourceStart < previousEnd) throw new Error(`${prefix} 的音节范围必须按顺序且不能重叠`);
    previousEnd = part.sourceEnd;
    const result: TranslationAlignment = { sourceStart: part.sourceStart, sourceEnd: part.sourceEnd, text: part.text };
    if (part.startTime !== undefined || part.endTime !== undefined) {
      if (typeof part.startTime !== "number" || typeof part.endTime !== "number"
        || !Number.isFinite(part.startTime) || !Number.isFinite(part.endTime)
        || part.startTime < 0 || part.endTime <= part.startTime) {
        throw new Error(`${prefix} 第 ${partIndex + 1} 段的 startTime/endTime 必须成对且为非负、正跨度的毫秒时间`);
      }
      if (part.startTime < previousTimeEnd) throw new Error(`${prefix} 的手动时间必须按顺序且不能重叠`);
      result.startTime = part.startTime;
      result.endTime = part.endTime;
      previousTimeEnd = part.endTime;
    }
    return result;
  });
  if (alignment.map((part) => part.text).join("") !== text) {
    throw new Error(`${prefix} 的片段文本必须完整拼回 translatedText`);
  }
  return alignment;
}

function parseMotion(value: unknown, position: number): TranslationMotionSettings {
  const prefix = `JSON 第 ${position + 1} 行 motion`;
  if (!isObject(value)) throw new Error(`${prefix} 必须是动画设置对象`);
  const result: TranslationMotionSettings = {};
  for (const [key, min, max] of [["amplitude", 0, 2], ["stagger", 0, 0.8], ["settleMs", 100, 1000]] as const) {
    const setting = value[key];
    if (setting === undefined) continue;
    if (typeof setting !== "number" || !Number.isFinite(setting) || setting < min || setting > max) {
      throw new Error(`${prefix}.${key} 必须是 ${min}–${max} 之间的数值`);
    }
    result[key] = setting;
  }
  return result;
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
    if (raw.alignment !== undefined) result.alignment = parseAlignment(raw.alignment, raw.translatedText, position);
    if (raw.motion !== undefined) result.motion = parseMotion(raw.motion, position);
    return result;
  });
  const trackUri = typeof parsed.trackUri === "string" ? parsed.trackUri : undefined;
  const isEntry = parsed.version === 1 && trackUri && typeof parsed.createdAt === "number" && typeof parsed.updatedAt === "number";
  return { trackUri, lines, entry: isEntry ? { ...parsed, lines } as unknown as TranslationEntry : undefined };
}
