import type { LyricLine } from "./types";

const CACHE_NAMES = ["SpicyLyrics_LyricsStore_g1", "SpicyLyrics_LyricsStore"];

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
    text += syllable.Text ?? "";
  });
  return text.trim();
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
      : String(item.Text ?? item.Lead?.Text ?? "").trim();
    if (!text) continue;
    output.push({
      index: output.length,
      text,
      startTime: secondsToMs(item.Lead?.StartTime ?? item.StartTime),
      endTime: secondsToMs(item.Lead?.EndTime ?? item.EndTime),
    });
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
  const words = copy.querySelectorAll(".word:not(.dot), .letterGroup");
  if (words.length) {
    return Array.from(words).map((word) => word.textContent?.trim() ?? "").filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  return copy.textContent?.replace(/\s+/g, " ").trim() ?? "";
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
