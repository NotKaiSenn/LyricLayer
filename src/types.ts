export interface TranslationEntry {
  version: 1;
  trackUri: string;
  title?: string;
  artist?: string;
  lines: TranslationLine[];
  createdAt: number;
  updatedAt: number;
}

export interface TranslationLine {
  index?: number;
  startTime?: number;
  originalText?: string;
  translatedText: string;
  alignment?: TranslationAlignment[];
  motion?: TranslationMotionSettings;
}

export interface TranslationMotionSettings {
  /** Multiplier of native scale delta and displacement; 0–2, default 1. */
  amplitude?: number;
  /** Share of source activity used for staggered starts; 0–0.8, default 0.4. */
  stagger?: number;
  /** Smooth return before the source deadline, in milliseconds; 100–1000. */
  settleMs?: number;
}

/** Optional human/AI phrase mapping into the original syllable array. */
export interface TranslationAlignment {
  sourceStart: number;
  /** Exclusive syllable index. */
  sourceEnd: number;
  text: string;
  /** Optional paired override of this phrase's absolute track time, in ms. */
  startTime?: number;
  endTime?: number;
}

export interface LyricSyllable {
  text: string;
  /** Absolute track time in milliseconds. */
  startTime: number;
  endTime: number;
  isPartOfWord?: boolean;
}

export interface LyricLine {
  index: number;
  text: string;
  startTime?: number;
  endTime?: number;
  syllables?: LyricSyllable[];
}

export interface TrackInfo {
  uri: string;
  title: string;
  artist: string;
  coverUrl?: string;
}

export interface SpicetifyPlayerItem {
  uri?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { images?: Array<{ url?: string }> };
  metadata?: Record<string, string | undefined>;
}

export interface SpicetifyApi {
  Player?: {
    data?: { item?: SpicetifyPlayerItem };
    getProgress?: () => number;
    isPlaying?: () => boolean;
    addEventListener?: (event: string, listener: (event?: unknown) => void) => void;
    removeEventListener?: (event: string, listener: (event?: unknown) => void) => void;
  };
  PopupModal?: {
    display: (options: { title: string; content: HTMLElement; isLarge?: boolean }) => void;
    hide?: () => void;
  };
  LocalStorage?: {
    get: (key: string) => string | null;
    set: (key: string, value: string) => void;
  };
  Tippy?: (element: Element, options: Record<string, unknown>) => void;
  TippyProps?: Record<string, unknown>;
  showNotification?: (message: string, isError?: boolean, timeout?: number) => void;
}

declare global {
  const Spicetify: SpicetifyApi;
  interface Window { Spicetify?: SpicetifyApi; LyricLayer?: unknown; }
}
