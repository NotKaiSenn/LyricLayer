import { normalizeLyricText } from "./matcher";
import { textWithoutInjectedTranslation } from "./spicy-lyrics-source";
import { TranslationAnimator } from "./translation-animator";
import { buildTranslationTiming } from "./translation-timing";
import { isTranslationAnimationEnabled, TRANSLATION_ANIMATION_EVENT } from "./translation-settings";
import type { LyricLine, TranslationLine } from "./types";

const LINE_SELECTOR = ".line:not(.musical-line):not(.bg-line)";
const TRANSLATION_SELECTOR = "[data-lyric-layer-translation]";
const OWN_SELECTOR = `${TRANSLATION_SELECTOR}, .ll-scope, [data-lyric-layer-button]`;

function ownNode(node: Node): boolean {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  return !!element?.closest(OWN_SELECTOR);
}

/** Our text, buttons and animation must never schedule another full render. */
function nativeMutation(record: MutationRecord): boolean {
  if (ownNode(record.target)) return false;
  return record.type !== "childList" || [...record.addedNodes, ...record.removedNodes].some(node => !ownNode(node));
}

/** While editing, empty lines get a clickable placeholder, one line can show
 * an editor instead of its translation, and a click activates a line. */
export interface EditHooks {
  placeholder: string;
  /** inside: replaces the line's translation (a plain field). after: sits right
   * below the line, which keeps rendering its own text and draft translation. */
  editing?: { index: number; element: HTMLElement; after?: boolean };
  onActivate(index: number, line: Element): void;
  /** The editor was (re)attached, e.g. after Spicy re-created the line. */
  onEditorMounted?(): void;
}

/** The full Spicy Lyrics page. The Now Playing card reuses the same element in
 * CardMode, which is too small to edit in. */
export function lyricsPage(): HTMLElement | undefined {
  const page = document.getElementById("SpicyLyricsPage");
  return page && !page.classList.contains("CardMode") ? page : undefined;
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
    event.stopPropagation();
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
      if (records.some((record) => nativeMutation(record) && (record.type === "childList"
        || Array.from(this.roots.keys()).some((root) => (record.target as Element).contains(root))))) this.schedule();
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
        if (records.some((record) => nativeMutation(record) && (record.type !== "attributes"
          || record.target === root || (record.target as Element).matches(LINE_SELECTOR)))) this.schedule();
      });
      observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class", "data-lyrics-type"] });
      this.roots.set(root, observer);
      added = true;
    });
    return added;
  }

  private resolveLineIndex(element: Element, mounted: Element[]): number | undefined {
    const textKey = normalizeLyricText(textWithoutInjectedTranslation(element));
    if (!textKey) return undefined;
    const candidates = this.lyricLines.filter((line) => normalizeLyricText(line.text) === textKey);
    // Identity belongs to the source row. Active/Sung and the playback clock
    // describe its pose, and must never change which occurrence we edit.
    const virtualIndex = Number(element.parentElement?.dataset.index);
    if (Number.isInteger(virtualIndex) && virtualIndex >= 0) {
      const mode = element.closest(".MinimalLyricsMode") ? 1 : 0;
      const exact = candidates.filter(line => (line.renderOrder?.[mode] ?? line.index) === virtualIndex);
      if (exact.length === 1) return exact[0]!.index;
    } else if (mounted.length === this.lyricLines.length) {
      // Older, non-virtualized pages mount the entire source in order.
      const ordered = this.lyricLines[mounted.indexOf(element)];
      if (ordered && normalizeLyricText(ordered.text) === textKey) return ordered.index;
    }
    // Never guess the nearest repeated sentence: that can attach one editor to
    // several rows and audition a different timestamp. Unique text is safe.
    return candidates.length === 1 ? candidates[0]!.index : undefined;
  }

  private renderMountedLines(): void {
    const editing = this.editHooks?.editing;
    let editorMounted = false;
    this.roots.forEach((_observer, root) => {
      const mounted = Array.from(root.querySelectorAll(LINE_SELECTOR));
      mounted.forEach((line) => {
        const index = this.resolveLineIndex(line, mounted);
        const editHere = editing && !editorMounted && index === editing.index
          && !root.closest(".Hidden, .HiddenTransitioned, [hidden]");
        if (editHere) editorMounted = true;
        let existing = line.querySelector(`:scope > ${TRANSLATION_SELECTOR}`) as HTMLElement | null;
        if (editHere && editing.after && line.nextElementSibling !== editing.element) {
          // Outside the line: growing the line box would stretch the gradient
          // that paints its text, and the line must keep previewing the draft.
          line.after(editing.element);
          // It was just moved out of this line. The old query result must not
          // be treated as a stale inline editor and remove the expanded panel.
          if (existing === editing.element) existing = null;
          this.editHooks?.onEditorMounted?.();
        }
        if (editHere && !editing.after) {
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
            if (placeholder.className !== "lyric-layer-translation ll-placeholder") placeholder.className = "lyric-layer-translation ll-placeholder";
            placeholder.dataset.llPlaceholder = "true";
            placeholder.dataset.lineIndex = String(index);
            if (placeholder.textContent !== this.editHooks.placeholder) placeholder.textContent = this.editHooks.placeholder;
            this.builtFrom.delete(placeholder);
            if (placeholder.parentElement !== line) line.appendChild(placeholder);
          } else existing?.remove();
          return;
        }
        const element = existing && !existing.dataset.llPlaceholder ? existing : this.createTranslation();
        if (element !== existing) existing?.remove();
        if (element.className !== "lyric-layer-translation") element.className = "lyric-layer-translation";
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
