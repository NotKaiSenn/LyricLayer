import { matchTranslations } from "./matcher";
import { exportLyrics, type LyricExportMode } from "./lyric-export";
import { parseJson, parseLrc, parseTxt } from "./parsers";
import { validateVisualTranslation } from "./translation-timing";
import type { LyricLine, TrackInfo, TranslationEntry, TranslationLine } from "./types";

/** Unsaved editor state, kept in memory so leaving edit mode never loses work. */
export interface DraftState {
  savedAt: number;
  lines: TranslationLine[];
  values: string[];
}

export type ImportOutcome =
  | { kind: "lines"; message: string }
  | { kind: "other-track"; entry: TranslationEntry; name: string };

export interface ExportChoice {
  label: string;
  detail: string;
  ariaLabel: string;
  file?: { text: string; filename: string; mimeType: string; message: string };
}

const cloneLine = (line: TranslationLine): TranslationLine => JSON.parse(JSON.stringify(line)) as TranslationLine;

export function canonicalize(lines: TranslationLine[], lyrics: LyricLine[], allowUnboundAlignment = false): TranslationLine[] {
  if (!lyrics.length) return lines;
  const matches = matchTranslations(lyrics, lines);
  return lyrics.map((lyric) => {
    const saved = matches.get(lyric.index);
    const alignment = saved?.alignment && (saved.originalText === lyric.text
      || (allowUnboundAlignment && saved.originalText === undefined)) ? saved.alignment : undefined;
    return {
      index: lyric.index,
      startTime: lyric.startTime,
      originalText: lyric.text,
      translatedText: saved?.translatedText ?? "",
      ...(alignment ? { alignment } : {}),
      ...(saved?.motion ? { motion: { ...saved.motion } } : {}),
    };
  });
}

export function entryFrom(track: TrackInfo, lines: TranslationLine[], existing?: TranslationEntry): TranslationEntry {
  const now = Date.now();
  return {
    version: 1,
    trackUri: track.uri,
    title: track.title,
    artist: track.artist,
    lines,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Trust the extension, then the content: users should not have to pick a format. */
export function importKind(file: { name?: string }, text: string): "txt" | "lrc" | "json" {
  const extension = file.name?.split(".").pop()?.toLowerCase();
  if (extension === "json" || extension === "lrc" || extension === "txt") return extension;
  if (text.replace(/^﻿/, "").trimStart().startsWith("{")) return "json";
  return /^\s*\[\d{1,3}:\d{2}/m.test(text) ? "lrc" : "txt";
}

/** Blank rows are placeholders only when keeping them makes the file line up
 * exactly with the lyrics; otherwise they are stanza breaks and are dropped. */
function parseTxtFor(text: string, lyricCount: number): TranslationLine[] {
  const compact = parseTxt(text, false);
  const spaced = parseTxt(text, true);
  return lyricCount && spaced.length === lyricCount && compact.length !== lyricCount ? spaced : compact;
}

function lyricFilename(track: TrackInfo, mode: LyricExportMode, extension: string): string {
  const name = Array.from(`${track.artist} - ${track.title}`
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim())
    .slice(0, 60)
    .join("")
    .replace(/[. ]+$/, "");
  return `${name || "lyrics"} - ${mode.startsWith("translation") ? "翻译" : "原文"}.${extension}`;
}

/** Every export format with its file, or the reason it is unavailable.
 * Translations come from the saved entry, not from an unsaved draft. */
export function exportChoices(track: TrackInfo, lyrics: LyricLine[], entry: TranslationEntry | undefined): ExportChoice[] {
  const savedTranslation = entry?.lines ?? [];
  const originalLines = lyrics.length
    ? lyrics.map((line) => ({ originalText: line.text, startTime: line.startTime, translatedText: "" }))
    : savedTranslation;
  const matches = matchTranslations(lyrics, savedTranslation);
  // Keep every saved translation, even if the current provider has different
  // lines or only static lyrics. Missing source timing must not erase saved timing.
  const translationLines = savedTranslation.map((line) => ({
    ...line,
    startTime: lyrics.find((lyric) => matches.get(lyric.index) === line)?.startTime ?? line.startTime,
  }));
  const formats: Array<{ mode: LyricExportMode; label: string; detail: string; ariaLabel: string; name: string }> = [
    { mode: "original", label: "原文 · TXT", detail: "纯文本，每行一句", ariaLabel: "导出仅原文", name: "原文" },
    { mode: "original-timed", label: "原文 · LRC", detail: "带时间戳，如 [00:30.660]", ariaLabel: "导出原文带时间戳", name: "带时间戳的原文" },
    { mode: "translation", label: "译文 · TXT", detail: "纯文本，跳过未翻译的行", ariaLabel: "导出仅翻译", name: "译文" },
    { mode: "translation-timed", label: "译文 · LRC", detail: "沿用原歌词的时间戳", ariaLabel: "导出翻译带时间戳", name: "带时间戳的译文" },
  ];
  const choices: ExportChoice[] = formats.map((format) => {
    try {
      const result = exportLyrics(format.mode.startsWith("translation") ? translationLines : originalLines, format.mode);
      return { label: format.label, detail: format.detail, ariaLabel: format.ariaLabel, file: {
        text: result.text, filename: lyricFilename(track, format.mode, result.extension), mimeType: "text/plain",
        message: `已导出 ${result.lineCount} 行${format.name}` } };
    } catch (error) {
      return { label: format.label, ariaLabel: format.ariaLabel,
        detail: error instanceof Error ? error.message : "当前没有可导出的歌词" };
    }
  });
  const trackId = entry?.trackUri.split(":").pop() || "track";
  choices.push(entry
    ? { label: "备份 · JSON", detail: "含对齐与动画设置，可再次导入", ariaLabel: "导出备份", file: {
      text: `${JSON.stringify(entry, null, 2)}\n`, filename: `lyric-layer-${trackId}.json`,
      mimeType: "application/json", message: "已导出备份" } }
    : { label: "备份 · JSON", detail: "保存翻译后才能导出备份", ariaLabel: "导出备份" });
  return choices;
}

/** One song's translation while it is being edited: the saved lines bound to
 * the current lyrics, plus the text typed for each of them. */
export class EditSession {
  readonly track: TrackInfo;
  readonly lyrics: LyricLine[];
  saved?: TranslationEntry;
  lines: TranslationLine[];
  values: string[];
  private visuallyEdited = new Set<number>();
  private baseline: string;

  constructor(track: TrackInfo, lyrics: LyricLine[], saved?: TranslationEntry) {
    this.track = track;
    this.lyrics = lyrics;
    this.saved = saved;
    this.lines = this.savedLines();
    this.values = this.lines.map((line) => line.translatedText);
    this.baseline = JSON.stringify(this.buildLines());
  }

  private savedLines(): TranslationLine[] {
    return this.lyrics.length
      ? canonicalize(this.saved?.lines ?? [], this.lyrics)
      : (this.saved?.lines ?? []).map((line, index) => ({ ...line, index: line.index ?? index }));
  }

  get size(): number { return this.lines.length; }

  /** Position of a lyric line (its renderer index) in this session. */
  positionOf(lyricIndex: number): number | undefined {
    const position = this.lines.findIndex((line) => line.index === lyricIndex);
    return position < 0 ? undefined : position;
  }

  buildLines(): TranslationLine[] {
    return this.lines.map((line, position) => {
      const translatedText = this.values[position] ?? line.translatedText;
      const { alignment, ...rest } = line;
      // Phrase offsets are only valid for the exact source and translation.
      // canonicalize already discarded alignment if the source changed.
      return { ...rest, translatedText, ...(alignment && translatedText === line.translatedText ? { alignment } : {}) };
    });
  }

  get dirty(): boolean { return JSON.stringify(this.buildLines()) !== this.baseline; }

  filled(): number { return this.values.filter((value) => value.trim()).length; }

  setValue(position: number, value: string): void {
    if (position >= 0 && position < this.values.length) this.values[position] = value;
  }

  /** Paste several rows from a line onwards. */
  fillFrom(position: number, rows: string[]): { filled: number; overflow: number } {
    const filled = Math.max(0, Math.min(rows.length, this.values.length - position));
    rows.slice(0, filled).forEach((value, offset) => { this.values[position + offset] = value; });
    return { filled, overflow: rows.length - filled };
  }

  /** The line as the line editor should start from. */
  lineDraft(position: number): TranslationLine {
    const current = this.lines[position]!;
    const translatedText = this.values[position] ?? current.translatedText;
    const { alignment, ...rest } = current;
    return { ...rest, translatedText, ...(alignment && translatedText === current.translatedText ? { alignment } : {}) };
  }

  /** Apply the line editor's draft, keeping this line's identity. */
  setLine(position: number, draft: TranslationLine): void {
    const current = this.lines[position];
    if (!current) return;
    this.lines[position] = { ...cloneLine(draft), index: current.index,
      originalText: current.originalText, startTime: current.startTime };
    this.values[position] = draft.translatedText;
    this.visuallyEdited.add(position);
  }

  lyricAt(position: number): LyricLine {
    const current = this.lines[position]!;
    return this.lyrics.find((lyric) => lyric.index === current.index)
      ?? { index: current.index ?? position, text: current.originalText ?? "", startTime: current.startTime };
  }

  snapshot(): DraftState {
    return { savedAt: this.saved?.updatedAt ?? 0, lines: this.lines.map(cloneLine), values: [...this.values] };
  }

  restore(state: DraftState): void {
    this.lines = state.lines.map(cloneLine);
    this.values = [...state.values];
    this.visuallyEdited.clear();
  }

  /** Whether a stored draft was made against this exact saved version and lyrics. */
  fits(state: DraftState): boolean {
    return state.savedAt === (this.saved?.updatedAt ?? 0) && state.lines.length === this.lines.length
      && state.lines.every((line, position) => line.originalText === this.lines[position]?.originalText
        && line.index === this.lines[position]?.index && line.startTime === this.lines[position]?.startTime);
  }

  discard(): void {
    this.lines = this.savedLines();
    this.values = this.lines.map((line) => line.translatedText);
    this.visuallyEdited.clear();
  }

  /** Parse a TXT, LRC or LyricLayer JSON file into this session's draft.
   * A JSON backup of another song is returned for the caller to confirm. */
  import(file: { name?: string }, text: string): ImportOutcome {
    const kind = importKind(file, text);
    const lyrics = this.lyrics;
    if (kind === "json") {
      const parsed = parseJson(text);
      if (parsed.trackUri && parsed.trackUri !== this.track.uri) {
        const name = parsed.entry?.title ? `《${parsed.entry.title}》` : "另一首歌";
        const target: TrackInfo = { ...this.track, uri: parsed.trackUri,
          title: parsed.entry?.title ?? this.track.title, artist: parsed.entry?.artist ?? this.track.artist };
        const entry = parsed.entry
          ? { ...parsed.entry, lines: parsed.lines, trackUri: target.uri, updatedAt: Date.now() }
          : entryFrom(target, parsed.lines);
        return { kind: "other-track", entry, name };
      }
      const lines = canonicalize(parsed.lines, lyrics, true);
      for (const [position, line] of lines.entries()) {
        const lyric = lyrics[position];
        if (!lyric || (!line.alignment?.some((part) => part.startTime !== undefined || part.endTime !== undefined) && !line.motion)) continue;
        const error = validateVisualTranslation(lyric, line);
        if (error) throw new Error(`第 ${lyric.index + 1} 行：${error}`);
      }
      this.replace(lines);
      return { kind: "lines", message: `已导入 JSON 备份中的 ${this.filled()} 行译文` };
    }
    if (!lyrics.length) throw new Error("还没有取得原歌词，暂时只能导入 LyricLayer JSON 备份");
    if (kind === "txt") {
      const parsed = parseTxtFor(text, lyrics.length);
      this.replace(canonicalize(parsed, lyrics));
      return { kind: "lines", message: parsed.length === lyrics.length
        ? `已导入 ${parsed.length} 行，与原歌词逐行对应`
        : `已导入 ${parsed.length} 行，但原歌词有 ${lyrics.length} 行，请检查是否错位` };
    }
    this.replace(canonicalize(parseLrc(text), lyrics));
    return { kind: "lines", message: `已按时间戳匹配 ${this.filled()} / ${lyrics.length} 行` };
  }

  private replace(lines: TranslationLine[]): void {
    this.lines = lines.map(cloneLine);
    this.values = this.lines.map((line) => line.translatedText);
    this.visuallyEdited.clear();
  }

  /** The entry to store, after checking every line edited in the line editor. */
  toEntry(): TranslationEntry {
    const lines = this.buildLines();
    for (const [position, line] of lines.entries()) {
      if (!this.visuallyEdited.has(position)) continue;
      const source = this.lyrics.find((lyric) => lyric.index === line.index);
      if (!source || (!line.alignment && !line.motion)) continue;
      const error = validateVisualTranslation(source, line);
      if (error) throw new Error(`第 ${(line.index ?? 0) + 1} 行：${error}`);
    }
    return entryFrom(this.track, lines, this.saved);
  }

  markSaved(entry: TranslationEntry): void {
    const unchanged = JSON.stringify(this.buildLines()) === JSON.stringify(entry.lines);
    this.saved = entry;
    if (unchanged) {
      this.lines = entry.lines.map(cloneLine);
      this.values = this.lines.map((line) => line.translatedText);
      this.visuallyEdited.clear();
    }
    // Storage is asynchronous: typing during a save remains an unsaved draft.
    this.baseline = JSON.stringify(entry.lines);
  }
}
