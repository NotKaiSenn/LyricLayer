import { normalizeLyricText } from "./matcher";
import { textWithoutInjectedTranslation } from "./spicy-lyrics-source";
import type { LyricLine, TranslationLine } from "./types";

const LINE_SELECTOR = ".line:not(.musical-line):not(.bg-line)";
const TRANSLATION_SELECTOR = "[data-lyric-layer-translation]";

export class TranslationRenderer {
  private roots = new Map<Element, MutationObserver>();
  private pageObserver?: MutationObserver;
  private scheduled = false;
  private lyricLines: LyricLine[] = [];
  private translations = new Map<number, TranslationLine>();
  private onLyricsUiChanged?: () => void;

  start(onLyricsUiChanged: () => void): void {
    this.onLyricsUiChanged = onLyricsUiChanged;
    this.discoverRoots();
    this.pageObserver = new MutationObserver(() => this.schedule());
    this.pageObserver.observe(document.body, { childList: true, subtree: true });
  }

  stop(): void {
    this.pageObserver?.disconnect();
    this.roots.forEach((observer) => observer.disconnect());
    this.roots.clear();
    this.clearDom();
  }

  update(lyricLines: LyricLine[], translations: Map<number, TranslationLine>): void {
    this.lyricLines = lyricLines;
    this.translations = translations;
    this.clearDom();
    this.schedule();
  }

  clear(): void {
    this.lyricLines = [];
    this.translations = new Map();
    this.clearDom();
  }

  refresh(): void { this.schedule(); }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      const addedRoot = this.discoverRoots();
      this.renderMountedLines();
      if (addedRoot || this.roots.size > 0) this.onLyricsUiChanged?.();
    });
  }

  private discoverRoots(): boolean {
    let added = false;
    const activeRoots = new Set<Element>(document.querySelectorAll("#SpicyLyricsPage .SpicyLyricsScrollContainer"));
    for (const [root, observer] of this.roots) {
      if (root.isConnected && activeRoots.has(root)) continue;
      observer.disconnect();
      this.roots.delete(root);
    }
    activeRoots.forEach((root) => {
      if (this.roots.has(root)) return;
      const observer = new MutationObserver(() => this.schedule());
      observer.observe(root, { childList: true, subtree: true });
      this.roots.set(root, observer);
      added = true;
    });
    return added;
  }

  private resolveLineIndex(element: Element): number | undefined {
    const textKey = normalizeLyricText(textWithoutInjectedTranslation(element));
    if (!textKey) return undefined;
    const candidates = this.lyricLines.filter((line) => normalizeLyricText(line.text) === textKey);
    const first = candidates[0];
    if (!first) return undefined;
    if (candidates.length === 1) return first.index;
    const virtualIndex = Number(element.parentElement?.dataset.index);
    if (!Number.isFinite(virtualIndex)) return first.index;
    return candidates.reduce((best, current) =>
      Math.abs(current.index - virtualIndex) < Math.abs(best.index - virtualIndex) ? current : best
    , first).index;
  }

  private renderMountedLines(): void {
    this.roots.forEach((_observer, root) => {
      root.querySelectorAll(LINE_SELECTOR).forEach((line) => {
        const index = this.resolveLineIndex(line);
        const translation = index === undefined ? undefined : this.translations.get(index);
        const existing = line.querySelector(`:scope > ${TRANSLATION_SELECTOR}`) as HTMLElement | null;
        if (!translation?.translatedText.trim()) {
          existing?.remove();
          return;
        }
        const element = existing ?? document.createElement("div");
        element.className = "lyric-layer-translation";
        element.dataset.lyricLayerTranslation = "true";
        element.dataset.lineIndex = String(index);
        if (element.textContent !== translation.translatedText) element.textContent = translation.translatedText;
        if (!existing) line.appendChild(element);
      });
    });
  }

  private clearDom(): void {
    document.querySelectorAll(TRANSLATION_SELECTOR).forEach((element) => element.remove());
  }
}
