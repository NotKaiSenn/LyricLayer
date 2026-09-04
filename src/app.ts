import { TranslationRenderer } from "./dom-renderer";
import { matchTranslations } from "./matcher";
import { readMountedFallbackLines, readSpicyLyricsLines } from "./spicy-lyrics-source";
import { IndexedDbTranslationStore } from "./storage";
import { injectStyles } from "./styles";
import type { LyricLine, TrackInfo, TranslationEntry } from "./types";
import { TranslationUi } from "./ui";

const BUTTON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M4 6h12M4 10h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 15h5m-5 4h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".68"/><path d="M18 13v7m-3.5-3.5h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function currentTrack(): TrackInfo | undefined {
  const item = window.Spicetify?.Player?.data?.item;
  const uri = item?.uri;
  if (!item || !uri?.startsWith("spotify:track:")) return undefined;
  const metadata = item.metadata ?? {};
  const artists = item.artists?.map((artist) => artist.name).filter(Boolean).join(", ");
  return {
    uri,
    title: item.name ?? metadata.title ?? "未知歌曲",
    artist: artists || metadata.artist_name || "未知艺人",
    coverUrl: item.album?.images?.[0]?.url ?? metadata.image_xlarge_url ?? metadata.image_url,
  };
}

async function waitForSpicetify(): Promise<void> {
  while (!window.Spicetify?.Player || !window.Spicetify.PopupModal || !document.body) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

class LyricLayerApp {
  private store = new IndexedDbTranslationStore();
  private renderer = new TranslationRenderer();
  private ui = new TranslationUi({
    store: this.store,
    getTrack: currentTrack,
    getLyrics: () => this.ensureLyrics(true),
    onEntryChanged: (trackUri) => this.reloadEntry(trackUri),
  });
  private entry?: TranslationEntry;
  private lyrics: LyricLine[] = [];
  private sourceResolved = false;
  private loadGeneration = 0;
  private sourceLoad?: Promise<LyricLine[]>;
  private interfaceScheduled = false;
  private readonly songChange = () => void this.loadCurrentTrack();

  async start(): Promise<void> {
    injectStyles();
    this.renderer.start(() => {
      this.insertButtons();
      if (!this.sourceResolved) void this.ensureLyrics(false);
    });
    window.Spicetify?.Player?.addEventListener?.("songchange", this.songChange);
    await this.loadCurrentTrack();
    this.insertButtons();
  }

  private async loadCurrentTrack(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.entry = undefined;
    this.lyrics = [];
    this.sourceResolved = false;
    this.sourceLoad = undefined;
    this.renderer.clear();
    const track = currentTrack();
    if (!track) return;
    const entry = await this.store.get(track.uri);
    if (generation !== this.loadGeneration || currentTrack()?.uri !== track.uri) return;
    this.entry = entry;
    const cached = await readSpicyLyricsLines(track.uri);
    if (generation !== this.loadGeneration || currentTrack()?.uri !== track.uri) return;
    this.sourceResolved = cached.length > 0;
    this.lyrics = cached.length ? cached : this.linesFromEntry(entry);
    this.render();
  }

  private linesFromEntry(entry?: TranslationEntry): LyricLine[] {
    return (entry?.lines ?? [])
      .filter((line) => line.originalText)
      .map((line, position) => ({
        index: line.index ?? position,
        text: line.originalText ?? "",
        startTime: line.startTime,
      }));
  }

  private async ensureLyrics(allowFallback: boolean): Promise<LyricLine[]> {
    const track = currentTrack();
    if (!track) return [];
    if (this.sourceResolved) return this.lyrics;
    if (this.sourceLoad) return this.sourceLoad;
    const generation = this.loadGeneration;
    this.sourceLoad = (async () => {
      const cached = await readSpicyLyricsLines(track.uri);
      if (generation !== this.loadGeneration || currentTrack()?.uri !== track.uri) return [];
      const fallback = allowFallback ? readMountedFallbackLines() : [];
      const next = cached.length ? cached : (this.lyrics.length ? this.lyrics : fallback);
      if (next.length && (cached.length || !this.lyrics.length)) {
        this.sourceResolved = cached.length > 0;
        this.lyrics = next;
        this.render();
      }
      return next;
    })().finally(() => { this.sourceLoad = undefined; });
    return this.sourceLoad;
  }

  private render(): void {
    const map = this.entry ? matchTranslations(this.lyrics, this.entry.lines) : new Map();
    this.renderer.update(this.lyrics, map);
  }

  private async reloadEntry(trackUri: string): Promise<void> {
    if (currentTrack()?.uri !== trackUri) return;
    this.entry = await this.store.get(trackUri);
    if (!this.lyrics.length) this.lyrics = this.linesFromEntry(this.entry);
    this.render();
  }

  private insertButtons(): void {
    if (this.interfaceScheduled) return;
    this.interfaceScheduled = true;
    queueMicrotask(() => {
      this.interfaceScheduled = false;
      const controls = document.querySelectorAll("#SpicyLyricsPage .ViewControls, #SpicyLyricsNPVCard .CardControls");
      controls.forEach((container) => {
        if (container.querySelector("[data-lyric-layer-button]")) return;
        const button = document.createElement("button");
        button.className = container.classList.contains("CardControls") ? "ViewControl CardControl lyric-layer-control" : "ViewControl lyric-layer-control";
        button.dataset.lyricLayerButton = "true";
        button.title = "自定义翻译";
        button.setAttribute("aria-label", "自定义翻译");
        button.innerHTML = BUTTON_ICON;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.ui.open();
        });
        try {
          window.Spicetify?.Tippy?.(button, { ...(window.Spicetify.TippyProps ?? {}), content: "自定义翻译" });
        } catch { /* native title remains as fallback */ }
        const romanization = container.querySelector("#RomanizationToggle");
        if (romanization) romanization.insertAdjacentElement("afterend", button);
        else container.appendChild(button);
      });
    });
  }
}

void (async () => {
  await waitForSpicetify();
  const app = new LyricLayerApp();
  await app.start();
  window.LyricLayer = app;
})().catch((error) => {
  console.error("LyricLayer failed to initialize", error);
  window.Spicetify?.showNotification?.("LyricLayer 初始化失败，请查看控制台", true);
});
