import type { LyricLine, LyricSyllable } from "./types";

const CACHE_NAMES = ["SpicyLyrics_LyricsStore_g1", "SpicyLyrics_LyricsStore"];
const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

interface RawSyllable {
  Text?: string;
  StartTime?: number;
  EndTime?: number;
  IsPartOfWord?: boolean;
}

interface RawLead {
  Text?: string;
  StartTime?: number;
  EndTime?: number;
  Syllables?: RawSyllable[];
}

interface RawContent {
  Type?: string;
  Text?: string;
  StartTime?: number;
  EndTime?: number;
  Lead?: RawLead;
}

interface RawLyrics {
  Type?: string;
  Lines?: Array<{ Text?: string }>;
  Content?: RawContent[];
}

interface CacheEnvelope {
  ExpiresAt?: number;
  Value?: unknown;
  Content?: unknown;
}

function isRawLyrics(value: unknown): value is RawLyrics {
  if (!value || typeof value !== "object") return false;
  const raw = value as RawLyrics;
  return Array.isArray(raw.Lines) || Array.isArray(raw.Content);
}

function unwrapCache(value: unknown): RawLyrics | undefined {
  if (isRawLyrics(value)) return value;
  if (!value || typeof value !== "object") return undefined;
  const envelope = value as CacheEnvelope;
  if (envelope.Value === "NO_LYRICS") return undefined;
  if (typeof envelope.ExpiresAt === "number" && envelope.ExpiresAt < Date.now()) return undefined;
  if (isRawLyrics(envelope.Content)) return envelope.Content;
  if (isRawLyrics(envelope.Value)) return envelope.Value;
  return undefined;
}

function secondsToMs(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1_000) : undefined;
}

function syllablesToText(syllables: RawSyllable[]): string {
  let text = "";
  syllables.forEach((syllable, index) => {
    const previous = syllables[index - 1];
    if (previous && !previous.IsPartOfWord) text += " ";
    text += (syllable.Text ?? "").replace(ZERO_WIDTH_CHARACTERS, "");
  });
  return text.trim();
}

function timedSyllables(syllables: RawSyllable[] | undefined): LyricSyllable[] | undefined {
  if (!syllables?.length) return undefined;
  const output: LyricSyllable[] = [];
  for (const syllable of syllables) {
    const startTime = secondsToMs(syllable.StartTime);
    const endTime = secondsToMs(syllable.EndTime);
    const previous = output[output.length - 1];
    // Keep source indices stable for phrase alignment. A broken timestamp makes
    // the whole group unsuitable; never silently filter out a single syllable.
    if (startTime === undefined || endTime === undefined
      || !Number.isFinite(startTime) || !Number.isFinite(endTime)
      || startTime < 0 || endTime <= startTime
      || (previous && startTime < previous.endTime)) return undefined;
    const timed: LyricSyllable = {
      text: (syllable.Text ?? "").replace(ZERO_WIDTH_CHARACTERS, ""),
      startTime,
      endTime,
    };
    if (typeof syllable.IsPartOfWord === "boolean") timed.isPartOfWord = syllable.IsPartOfWord;
    output.push(timed);
  }
  return output;
}

export function extractLyricLines(raw: RawLyrics): LyricLine[] {
  if (raw.Type === "Static" || (raw.Lines && !raw.Content)) {
    return (raw.Lines ?? []).map((line, index) => ({ index, text: (line.Text ?? "").trim() }));
  }

  const output: LyricLine[] = [];
  for (const item of raw.Content ?? []) {
    if (item.Type === "Instrumental") continue;
    const syllables = item.Lead?.Syllables;
    const text = syllables?.length
      ? syllablesToText(syllables)
      : String(item.Text ?? item.Lead?.Text ?? "").replace(ZERO_WIDTH_CHARACTERS, "").trim();
    if (!text) continue;
    const timed = timedSyllables(syllables);
    const line: LyricLine = {
      index: output.length,
      text,
      startTime: secondsToMs(item.Lead?.StartTime ?? item.StartTime) ?? timed?.[0]?.startTime,
      endTime: secondsToMs(item.Lead?.EndTime ?? item.EndTime) ?? timed?.[timed.length - 1]?.endTime,
    };
    if (timed) line.syllables = timed;
    output.push(line);
  }
  return output;
}

export async function readSpicyLyricsLines(trackUri: string): Promise<LyricLine[]> {
  const uriParts = trackUri.split(":");
  const trackId = uriParts[uriParts.length - 1];
  if (!trackId || typeof caches === "undefined") return [];
  try {
    for (const cacheName of CACHE_NAMES) {
      if (typeof caches.has === "function" && !(await caches.has(cacheName))) continue;
      const cache = await caches.open(cacheName);
      const response = await cache.match(`/${trackId}`);
      if (!response) continue;
      const lyrics = unwrapCache(await response.clone().json());
      if (lyrics) return extractLyricLines(lyrics);
    }
  } catch (error) {
    console.warn("LyricLayer: cannot read Spicy Lyrics cache", error);
  }
  return [];
}

function textWithoutInjectedTranslation(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll("[data-lyric-layer-translation], .slt-interleaved-translation, .slt-romanization-line, .slt-original-line, .slt-replace-line")
    .forEach((node) => node.remove());
  const wordSelector = ".word:not(.dot), .letterGroup";
  // A letterGroup already contains all of its emphasized letters. Only read
  // outermost syllables so nested word markup cannot duplicate their text.
  const words = Array.from(copy.querySelectorAll(wordSelector))
    .filter((word) => !word.parentElement?.closest(wordSelector));
  let text = "";
  if (words.length) {
    words.forEach((word, index) => {
      // Spicy Lyrics marks the preceding syllable when the next one belongs
      // to the same word, including syllables wrapped in a word-group.
      const previous = words[index - 1];
      if (previous && !previous.classList.contains("PartOfWord")) text += " ";
      text += word.textContent ?? "";
    });
  } else {
    text = copy.textContent ?? "";
  }
  return text.replace(ZERO_WIDTH_CHARACTERS, "").replace(/\s+/g, " ").trim();
}

export function readMountedFallbackLines(root: ParentNode = document): LyricLine[] {
  const seen = new Set<string>();
  const output: LyricLine[] = [];
  const selector = "#SpicyLyricsPage .SpicyLyricsScrollContainer .line:not(.musical-line):not(.bg-line)";
  root.querySelectorAll(selector).forEach((element) => {
    const text = textWithoutInjectedTranslation(element);
    const wrapperIndex = Number(element.parentElement?.dataset.index);
    const key = `${Number.isFinite(wrapperIndex) ? wrapperIndex : "?"}\u0000${text}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    output.push({ index: output.length, text });
  });
  return output;
}

export { textWithoutInjectedTranslation };
