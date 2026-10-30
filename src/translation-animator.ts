import { translationProgressAt, type TranslationTiming } from "./translation-timing";
import { playbackPosition } from "./playback-clock";
import { NativeMotionMirror } from "./native-motion-mirror";
import type { LyricLine } from "./types";
export { playbackPosition } from "./playback-clock";

interface AnimatedTranslation {
  line: Element;
  timing: TranslationTiming;
  spans: HTMLElement[];
  progress: number[];
  native: NativeMotionMirror;
  settled: boolean;
}

function isVisibleLine(line: Element): boolean {
  return line.isConnected
    && !line.closest(".LyricsContainer.Hidden, .LyricsContent.HiddenTransitioned, #SpicyLyricsPage[hidden]");
}

function isActiveLine(line: Element): boolean {
  return line.classList.contains("Active") && !line.classList.contains("Sung")
    && !line.classList.contains("NotSung") && !line.classList.contains("Hidden");
}

function needsAnimation(entry: AnimatedTranslation): boolean {
  // The native line state owns retirement, even if our clock or an edited
  // fragment still has time remaining. A seek back to Active can resume it.
  return isVisibleLine(entry.line) && isActiveLine(entry.line);
}

function isPlaying(): boolean {
  try { return window.Spicetify?.Player?.isPlaying?.() ?? true; } catch { return false; }
}

/** Each translated character advances on the playback clock. Native observers
 * refresh its palette, while the same clock also drives held-note tails. */
export class TranslationAnimator {
  private entries = new Map<HTMLElement, AnimatedTranslation>();
  private frame?: number;
  private pausedTimer?: number;
  private refreshAll = false;
  private pendingNative = new Set<HTMLElement>();
  private started = false;
  private nativeObserver?: MutationObserver;
  private nativeOwners = new Map<Element, Set<HTMLElement>>();
  private observersDirty = false;
  private readonly wake = () => this.refresh();

  start(): void {
    if (this.started) return;
    this.started = true;
    this.nativeObserver = new MutationObserver((records) => {
      const affected = new Set<HTMLElement>();
      for (const record of records) this.nativeOwners.get(record.target as Element)?.forEach((element) => affected.add(element));
      if (!affected.size || !this.started || document.hidden) return;
      if (isPlaying()) {
        // Native style mutations and progress events share the next frame;
        // neither should start a second read/write pass between vsyncs.
        affected.forEach(element => this.pendingNative.add(element));
        this.requestFrame();
      } else this.refresh();
    });
    for (const event of ["onplaypause", "onprogress"]) window.Spicetify?.Player?.addEventListener?.(event, this.wake);
    document.addEventListener("visibilitychange", this.wake);
  }

  stop(): void {
    this.started = false;
    for (const event of ["onplaypause", "onprogress"]) window.Spicetify?.Player?.removeEventListener?.(event, this.wake);
    document.removeEventListener("visibilitychange", this.wake);
    this.clear();
  }

  mount(line: Element, element: HTMLElement, timing: TranslationTiming, lyric: LyricLine): void {
    const fragment = document.createDocumentFragment();
    const spans = timing.segments.map((segment) => {
      const span = document.createElement("span");
      span.className = "lyric-layer-segment";
      span.textContent = segment.text;
      span.setAttribute("aria-hidden", "true");
      fragment.appendChild(span);
      return span;
    });
    const native = new NativeMotionMirror(line, lyric, timing, spans, fragment);
    // A solid theme without a reliable native binding keeps its ordinary text.
    if (!native.count && element.dataset.lyricLayerPaint === "solid") {
      element.textContent = timing.segments.map((segment) => segment.text).join("");
      return;
    }
    element.replaceChildren(fragment);
    element.setAttribute("aria-label", timing.segments.map((segment) => segment.text).join(""));
    element.dataset.lyricLayerAnimated = "true";
    element.dataset.lyricLayerTiming = timing.method;
    element.dataset.lyricLayerMotion = native.count === spans.length ? "native" : native.count ? "mixed" : "timing";
    this.entries.set(element, { line, timing, spans, native, progress: spans.map(() => -1), settled: false });
    this.observersDirty = true;
  }

  has(element: HTMLElement): boolean {
    const entry = this.entries.get(element);
    if (entry && !entry.native.isValid()) { this.remove(element); return false; }
    return !!entry;
  }

  remove(element: HTMLElement): void {
    this.entries.delete(element);
    this.observersDirty = true;
    delete element.dataset.lyricLayerAnimated;
    delete element.dataset.lyricLayerTiming;
    delete element.dataset.lyricLayerMotion;
    element.removeAttribute("aria-label");
  }

  clear(): void {
    this.entries.forEach((_entry, element) => this.remove(element));
    this.nativeObserver?.disconnect();
    this.nativeOwners.clear();
    this.pendingNative.clear();
    this.refreshAll = false;
    this.observersDirty = false;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    if (this.pausedTimer !== undefined) window.clearTimeout(this.pausedTimer);
    this.pausedTimer = undefined;
  }

  refresh(): void {
    if (this.pausedTimer !== undefined) window.clearTimeout(this.pausedTimer);
    this.pausedTimer = undefined;
    if (!this.started) return;
    for (const [element] of this.entries) if (!element.isConnected) this.remove(element);
    if (this.observersDirty) this.observeNative();
    if (document.hidden || !this.entries.size) return;
    this.refreshAll = true;
    if (isPlaying()) this.requestFrame();
    else {
      // Pausing or seeking while paused must replace any queued playing pose
      // immediately. The next paused poll also takes this synchronous path.
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      this.tick();
    }
  }

  private requestFrame(): void {
    if (this.frame === undefined && this.started && !document.hidden && this.entries.size) {
      this.frame = requestAnimationFrame(() => this.tick());
    }
  }

  private observeNative(): void {
    this.nativeObserver?.disconnect();
    this.nativeOwners.clear();
    this.entries.forEach((entry, element) => {
      for (const node of [entry.line, ...entry.native.nodes]) {
        let owners = this.nativeOwners.get(node);
        if (!owners) {
          owners = new Set();
          this.nativeOwners.set(node, owners);
          // No subtree: our translated styles can never trigger this observer.
          this.nativeObserver?.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
        }
        owners.add(element);
      }
    });
    this.observersDirty = false;
  }

  private paintNative(elements: Iterable<HTMLElement>, position = playbackPosition()): void {
    if (!this.started || document.hidden) return;
    const cache = new Map();
    const writes: Array<() => void> = [];
    for (const element of elements) {
      const entry = this.entries.get(element);
      if (entry?.native.count && element.isConnected && isVisibleLine(entry.line) && entry.native.isValid()) {
        entry.native.collect(position, cache, writes);
        entry.settled = !isActiveLine(entry.line) || (position !== undefined && position >= entry.native.endTime);
      }
    }
    writes.forEach((write) => write());
  }

  private tick(): void {
    this.frame = undefined;
    if (!this.started || document.hidden) return;
    let active = false;
    const position = playbackPosition();
    const refreshAll = this.refreshAll;
    this.refreshAll = false;
    const pendingNative = this.pendingNative;
    this.pendingNative = new Set();
    const nativeElements: HTMLElement[] = [];
    for (const [element, entry] of this.entries) {
      if (!element.isConnected) { this.remove(element); continue; }
      const lineActive = isActiveLine(entry.line);
      const animate = needsAnimation(entry);
      if (!animate) {
        // Retiring a line must clear its last pose immediately, including
        // timing-only text. Do not wait for a potentially later local deadline.
        const settle = !entry.settled && isVisibleLine(entry.line);
        if (!refreshAll && !pendingNative.has(element) && !settle) continue;
      }
      active ||= animate;
      nativeElements.push(element);
      // A missing player clock leaves the whole active translation readable.
      const progress = !lineActive ? (entry.line.classList.contains("Sung") ? 1 : 0)
        : position === undefined ? 1 : translationProgressAt(entry.timing, position);
      const requestedAmplitude = entry.timing.motion?.amplitude;
      const amplitude = Number.isFinite(requestedAmplitude) ? Math.max(0, Math.min(2, requestedAmplitude!)) : 1;
      entry.timing.segments.forEach((segment, index) => {
        if (entry.native.segments[index]) return;
        const local = Math.max(0, Math.min(1, (progress - segment.start) / (segment.end - segment.start)));
        const value = Math.round(local * 1000);
        if (entry.progress[index] === value) return;
        entry.progress[index] = value;
        const span = entry.spans[index]!;
        const lift = Math.sin(local * Math.PI);
        span.style.setProperty("--lyric-layer-sweep", `${(local * 120 - 10).toFixed(2)}%`);
        // The CSS lift variable also paints the fallback glow. Scale only the
        // actual displacement so amplitude=0 leaves fill and glow unchanged.
        span.style.setProperty("--lyric-layer-lift", lift.toFixed(3));
        span.style.setProperty("transform", `translateY(${(-0.055 * lift * amplitude).toFixed(5)}em)`);
      });
      entry.settled = !lineActive;
    }
    if (nativeElements.length) this.paintNative(nativeElements, position);
    if (active && isPlaying()) this.requestFrame();
    else if (active) {
      // Spicetify emits onprogress only during playback. A light paused poll
      // catches seeks within the same active line without animating paused text.
      this.pausedTimer = window.setTimeout(() => { this.pausedTimer = undefined; this.refresh(); }, 250);
    }
  }
}
