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
  Background?: RawLead[];
}

interface RawLyrics {
  Type?: string;
  StartTime?: number;
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
    return (raw.Lines ?? []).filter(line => line.Text?.replace(ZERO_WIDTH_CHARACTERS, "").trim())
      .map((line, index) => ({ index, renderOrder: [index, index], text: (line.Text ?? "").trim() }));
  }

  const output: LyricLine[] = [];
  const hasText = (group: RawLead) => group.Syllables?.some(part => part.Text?.replace(ZERO_WIDTH_CHARACTERS, "").trim());
  const content = (raw.Content ?? []).filter(item => item.Type !== "Instrumental"
    && (item.Text?.trim() || item.Lead?.Text?.trim() || (item.Lead && hasText(item.Lead)) || item.Background?.some(hasText)));
  // These are native *rows*, not translation indices. Spicy inserts a row for
  // each background vocal and for gaps >= 3s (5s in minimal mode).
  const slots: [number, number] = [3, 5].map(gap => Number((raw.StartTime ?? 0) >= gap)) as [number, number];
  for (const [position, item] of content.entries()) {
    const syllables = item.Lead?.Syllables;
    const text = syllables?.length
      ? syllablesToText(syllables)
      : String(item.Text ?? item.Lead?.Text ?? "").replace(ZERO_WIDTH_CHARACTERS, "").trim();
    const renderOrder: [number, number] = [...slots];
    const next = content[position + 1];
    const gap = (next?.Lead?.StartTime ?? next?.StartTime ?? NaN) - (item.Lead?.EndTime ?? item.EndTime ?? NaN);
    const rows = 1 + (item.Background?.filter(hasText).length ?? 0);
    slots[0] += rows + Number(gap >= 3);
    slots[1] += rows + Number(gap >= 5);
    if (!text) continue;
    const timed = timedSyllables(syllables);
    const line: LyricLine = {
      index: output.length,
      renderOrder,
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
    const hasIndex = Number.isInteger(wrapperIndex) && wrapperIndex >= 0;
    const key = `${wrapperIndex}\u0000${text}`;
    if (!text || (hasIndex && seen.has(key))) return;
    if (hasIndex) seen.add(key);
    output.push({ index: output.length, text, ...(hasIndex ? { renderOrder: [wrapperIndex, wrapperIndex] as [number, number] } : {}) });
  });
  return output;
}

export { textWithoutInjectedTranslation };
