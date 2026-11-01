import { normalizeLyricText } from "./matcher";
import { textWithoutInjectedTranslation } from "./spicy-lyrics-source";
import { playbackPosition, TranslationAnimator } from "./translation-animator";
import { buildTranslationTiming } from "./translation-timing";
import { isTranslationAnimationEnabled, TRANSLATION_ANIMATION_EVENT } from "./translation-settings";
import type { LyricLine, TranslationLine } from "./types";

const LINE_SELECTOR = ".line:not(.musical-line):not(.bg-line)";
const TRANSLATION_SELECTOR = "[data-lyric-layer-translation]";

/** While editing, empty lines get a clickable placeholder, one line can show
 * an editor instead of its translation, and a click activates a line. */
export interface EditHooks {
  placeholder: string;
  editing?: { index: number; element: HTMLElement };
  onActivate(index: number, line: Element): void;
  /** The editor was (re)attached, e.g. after Spicy re-created the line. */
  onEditorMounted?(): void;
}

/** Let Spicy Lyrics handle a click on our injected text as a click on its own
 * line. Its delegated listener only reacts to a word (or emphasis letter) of a
 * syllable line, or to the line element of a line-synced one. */
export function clickNativeLine(line: Element): void {
  const target = line.querySelector(".word:not(.dot), .Emphasis") ?? line;
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

export class TranslationRenderer {
  private roots = new Map<Element, MutationObserver>();
  private pageObserver?: MutationObserver;
  private scheduled = false;
  private renderFrame?: number;
  private animator = new TranslationAnimator();
  private readonly animationSettingChanged = () => { this.clearDom(); this.schedule(); };
  private lyricLines: LyricLine[] = [];
  private translations = new Map<number, TranslationLine>();
  // What each mounted element was built from, so a changed draft remounts
  // only the lines it touched instead of clearing the whole page.
  private builtFrom = new WeakMap<HTMLElement, string>();
  private onLyricsUiChanged?: () => void;
  private editHooks?: EditHooks;
  private readonly translationClicked = (event: Event) => {
    const element = event.currentTarget as HTMLElement;
    const line = element.parentElement;
    if (!line) return;
    const index = Number(element.dataset.lineIndex);
    if (this.editHooks && Number.isInteger(index)) this.editHooks.onActivate(index, line);
    else clickNativeLine(line);
  };

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

  /** keepDom repaints in place: live editing previews call this on every change. */
  update(lyricLines: LyricLine[], translations: Map<number, TranslationLine>, keepDom = false): void {
    this.lyricLines = lyricLines;
    this.translations = translations;
    if (!keepDom) this.clearDom();
    this.schedule();
  }

  clear(): void {
    this.lyricLines = [];
    this.translations = new Map();
    this.clearDom();
  }

  refresh(): void { this.schedule(); }

  setEditHooks(hooks: EditHooks | undefined): void {
    this.editHooks = hooks;
    this.schedule();
  }

  /** Render synchronously, e.g. so a newly placed editor can take focus. */
  renderNow(): void {
    if (this.renderFrame !== undefined) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = undefined;
    this.scheduled = false;
    this.discoverRoots();
    this.renderMountedLines();
  }

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
    const editing = this.editHooks?.editing;
    this.roots.forEach((_observer, root) => {
      root.querySelectorAll(LINE_SELECTOR).forEach((line) => {
        const index = this.resolveLineIndex(line);
        let existing = line.querySelector(`:scope > ${TRANSLATION_SELECTOR}`) as HTMLElement | null;
        if (editing && index === editing.index) {
          if (existing && existing !== editing.element) {
            this.animator.remove(existing);
            existing.remove();
          }
          if (editing.element.parentElement !== line) {
            line.appendChild(editing.element);
            this.editHooks?.onEditorMounted?.();
          }
          return;
        }
        // The editor moved on (or editing ended); this line renders normally again.
        if (existing?.dataset.llEditor) {
          existing.remove();
          existing = null;
        }
        const translation = index === undefined ? undefined : this.translations.get(index);
        if (!translation?.translatedText.trim()) {
          if (existing) this.animator.remove(existing);
          if (this.editHooks && index !== undefined) {
            const placeholder = existing?.dataset.llPlaceholder ? existing : this.createTranslation();
            if (placeholder !== existing) existing?.remove();
            placeholder.className = "lyric-layer-translation ll-placeholder";
            placeholder.dataset.llPlaceholder = "true";
            placeholder.dataset.lineIndex = String(index);
            placeholder.textContent = this.editHooks.placeholder;
            this.builtFrom.delete(placeholder);
            if (placeholder.parentElement !== line) line.appendChild(placeholder);
          } else existing?.remove();
          return;
        }
        const element = existing && !existing.dataset.llPlaceholder ? existing : this.createTranslation();
        if (element !== existing) existing?.remove();
        element.className = "lyric-layer-translation";
        const source = JSON.stringify(translation);
        if (element.dataset.lineIndex !== String(index) || element.textContent !== translation.translatedText
          || this.builtFrom.get(element) !== source) {
          this.animator.remove(element);
          element.textContent = translation.translatedText;
          this.builtFrom.set(element, source);
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
        if (element.parentElement !== line) line.appendChild(element);
      });
    });
    this.animator.refresh();
  }

  private createTranslation(): HTMLElement {
    const element = document.createElement("div");
    element.dataset.lyricLayerTranslation = "true";
    element.addEventListener("click", this.translationClicked);
    return element;
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
