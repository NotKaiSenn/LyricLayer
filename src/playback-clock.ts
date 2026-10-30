interface ClockHost {
  SpicyLyrics?: { testing?: { getProgress?: () => unknown } };
  Spicetify?: {
    Player?: { getProgress?: () => unknown; isPlaying?: () => unknown };
    LocalStorage?: { get?: (key: string) => unknown };
  };
}

let cachedSettings: string | undefined;
let cachedOffset = 0;

function playbackOffset(host: ClockHost): number {
  try {
    // Spicy Lyrics persists this signed millisecond offset in its settings blob.
    const settings = host.Spicetify?.LocalStorage?.get?.("SL:settings");
    if (typeof settings !== "string") return 0;
    if (settings === cachedSettings) return cachedOffset;
    cachedSettings = settings;
    cachedOffset = 0;
    const value: unknown = JSON.parse(settings);
    if (value && typeof value === "object") {
      const offset = (value as { playbackOffset?: unknown }).playbackOffset;
      if (typeof offset === "number" && Number.isFinite(offset)) cachedOffset = offset;
    }
    return cachedOffset;
  } catch { return 0; }
}

function simpleModeAdjustment(): number {
  try {
    return document.getElementById("SpicyLyricsPage")?.classList.contains("SimpleLyricsMode") ? 33.5 : 0;
  } catch { return 0; }
}

/** Match Spicy's lyric clock, including the user's sync offset, in milliseconds. */
export function playbackPosition(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window as unknown as ClockHost;
  let position: number | undefined;
  try {
    // Where exposed, this also follows Spicy's audio-side sampling and smoothing.
    // https://github.com/Spikerko/spicy-lyrics/blob/main/src/utils/expose.ts
    const native = host.SpicyLyrics?.testing?.getProgress?.();
    if (typeof native === "number" && Number.isFinite(native)) position = native;
  } catch { /* Older versions may not expose a usable native clock. */ }

  if (position === undefined) {
    let raw: unknown;
    try { raw = host.Spicetify?.Player?.getProgress?.(); } catch { return undefined; }
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
    let playing = false;
    try { playing = host.Spicetify?.Player?.isPlaying?.() === true; } catch { /* Use the measured position. */ }
    // v6.4.70 GetProgress adds 100 ms only while playing, then subtracts the
    // configured offset. Positive offsets deliberately delay the lyrics.
    // https://github.com/Spikerko/spicy-lyrics/blob/main/src/utils/Gets/GetProgress.ts
    position = Math.max(0, raw + (playing ? 100 : 0) - playbackOffset(host));
  }

  // Native Animate applies this after GetProgress, including while paused.
  return Math.max(0, position - simpleModeAdjustment());
}
