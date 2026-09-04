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
}

export interface LyricLine {
  index: number;
  text: string;
  startTime?: number;
  endTime?: number;
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
