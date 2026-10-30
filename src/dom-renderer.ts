import { normalizeLyricText } from "./matcher";
import { textWithoutInjectedTranslation } from "./spicy-lyrics-source";
import { playbackPosition, TranslationAnimator } from "./translation-animator";
import { buildTranslationTiming } from "./translation-timing";
import { isTranslationAnimationEnabled, TRANSLATION_ANIMATION_EVENT } from "./translation-settings";
import type { LyricLine, TranslationLine } from "./types";

const LINE_SELECTOR = ".line:not(.musical-line):not(.bg-line)";
const TRANSLATION_SELECTOR = "[data-lyric-layer-translation]";

export class TranslationRenderer {
  private roots = new Map<Element, MutationObserver>();
  private pageObserver?: MutationObserver;
  private scheduled = false;
  private renderFrame?: number;
  private animator = new TranslationAnimator();
  private readonly animationSettingChanged = () => { this.clearDom(); this.schedule(); };
  private lyricLines: LyricLine[] = [];
  private translations = new Map<number, TranslationLine>();
  private onLyricsUiChanged?: () => void;

  start(onLyricsUiChanged: () => void): void {
    this.onLyricsUiChanged = onLyricsUiChanged;
    this.animator.start();
    window.addEventListener(TRANSLATION_ANIMATION_EVENT, this.animationSettingChanged);
    this.discoverRoots();
    this.pageObserver = new MutationObserver((records) => {
      // Page/ancestor classes include font and Simple Lyrics mode switches. Do not
      // observe per-frame word styles or run a full render for each animated letter.
      if (records.some((record) => record.type === "childList"
        || Array.from(this.roots.keys()).some((root) => (record.target as Element).contains(root)))) this.schedule();
    });
    this.pageObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  stop(): void {
    window.removeEventListener(TRANSLATION_ANIMATION_EVENT, this.animationSettingChanged);
    this.animator.stop();
    if (this.renderFrame !== undefined) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = undefined;
    this.scheduled = false;
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
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = undefined;
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
      const observer = new MutationObserver((records) => {
        if (records.some((record) => record.type !== "attributes"
          || record.target === root || (record.target as Element).matches(LINE_SELECTOR))) this.schedule();
      });
      observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class", "data-lyrics-type"] });
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
    const position = element.classList.contains("Active") ? playbackPosition() : undefined;
    if (position !== undefined) {
      const timed = candidates.find((line) => line.startTime !== undefined && line.endTime !== undefined
        && position >= line.startTime && position <= line.endTime);
      if (timed) return timed.index;
    }
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
          if (existing) this.animator.remove(existing);
          existing?.remove();
          return;
        }
        const element = existing ?? document.createElement("div");
        element.className = "lyric-layer-translation";
        element.dataset.lyricLayerTranslation = "true";
        if (element.dataset.lineIndex !== String(index) || element.textContent !== translation.translatedText) {
          this.animator.remove(element);
          element.textContent = translation.translatedText;
        }
        element.dataset.lineIndex = String(index);
        this.syncSyllablePalette(line, element);
        // Native line/static gradients already animate on the parent. A syllable
        // line paints its own leaves and can safely host independent translation ink.
        const animate = isTranslationAnimationEnabled() && !!element.dataset.lyricLayerPaint
          && typeof window.Spicetify?.Player?.getProgress === "function";
        if (animate && !this.animator.has(element)) {
          const lyric = this.lyricLines.find((candidate) => candidate.index === index);
          const timing = lyric && buildTranslationTiming(lyric, translation);
          if (timing && lyric) this.animator.mount(line, element, timing, lyric);
        } else if (!animate && this.animator.has(element)) {
          this.animator.remove(element);
          element.textContent = translation.translatedText;
        }
        if (!existing) line.appendChild(element);
      });
    });
    this.animator.refresh();
  }

  private syncSyllablePalette(line: Element, translation: HTMLElement): void {
    const source = line.querySelector(".word:not(.dot), .letter");
    if (!source) {
      delete translation.dataset.lyricLayerPaint;
      return;
    }
    const style = getComputedStyle(source);
    const set = (name: string, value: string) => {
      if (translation.style.getPropertyValue(name) !== value) translation.style.setProperty(name, value);
    };
    const fill = style.getPropertyValue("-webkit-text-fill-color");
    const transparent = fill === "transparent" || fill === "rgba(0, 0, 0, 0)";
    const alpha = style.getPropertyValue("--gradient-alpha").trim();
    if (transparent && alpha) {
      translation.dataset.lyricLayerPaint = "syllable";
      for (const name of ["color", "alpha", "alpha-end"]) {
        set(`--lyric-layer-gradient-${name}`, style.getPropertyValue(`--gradient-${name}`).trim());
      }
    } else {
      // Themes can replace Spicy's transparent gradient with an ordinary fill.
      translation.dataset.lyricLayerPaint = "solid";
      set("--lyric-layer-source-color", style.color);
      set("--lyric-layer-source-fill", fill || style.color);
      set("--lyric-layer-source-shadow", style.textShadow);
    }
  }

  private clearDom(): void {
    this.animator.clear();
    document.querySelectorAll(TRANSLATION_SELECTOR).forEach((element) => element.remove());
  }
}
