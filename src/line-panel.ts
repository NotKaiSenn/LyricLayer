import { normalizeLyricText } from "./matcher";
import { playbackPosition } from "./playback-clock";
import { textWithoutInjectedTranslation } from "./spicy-lyrics-source";
import { createVisualEditor, type VisualEditor, type VisualEditorOptions } from "./visual-editor";
import type { LyricLine } from "./types";

export type LinePanelOptions = Omit<VisualEditorOptions, "onAudition">;

/** Line editing docked under the real lyrics page. The page itself is the
 * preview: it shows the draft, plays the real audio and the native animation. */
export interface LinePanel {
  open(options: LinePanelOptions): void;
  close(): void;
}

const PRE_ROLL_MS = 1500;
const POST_ROLL_MS = 600;
const HIGHLIGHT_INTERVAL_MS = 400;

function lineBounds(line: LyricLine): { start: number; end: number } | undefined {
  const start = line.startTime ?? line.syllables?.[0]?.startTime;
  const end = line.endTime ?? line.syllables?.[line.syllables.length - 1]?.endTime;
  return start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end } : undefined;
}

function findLineElement(line: LyricLine): HTMLElement | undefined {
  const key = normalizeLyricText(line.text);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    "#SpicyLyricsPage .SpicyLyricsScrollContainer .line:not(.bg-line):not(.musical-line)"))
    .filter(node => normalizeLyricText(textWithoutInjectedTranslation(node)) === key);
  return candidates.find(node => node.querySelector("[data-lyric-layer-translation]")?.getAttribute("data-line-index") === String(line.index))
    ?? candidates.find(node => node.parentElement?.dataset.index === String(line.index)) ?? candidates[0];
}

export function createLinePanel(): LinePanel {
  const container = document.createElement("div");
  container.className = "ll-scope ll-line-panel";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "逐句调整");
  let current: LinePanelOptions | undefined;
  let editor: VisualEditor | undefined;
  let frame: number | undefined;
  let highlighted: HTMLElement | undefined;
  let lastHighlight = 0;
  let positioned: HTMLElement | undefined;
  let host: HTMLElement | undefined;
  let resize: ResizeObserver | undefined;
  let audition: { end: number; startedAt: number; length: number } | undefined;
  const player = () => window.Spicetify?.Player;

  const highlight = (scroll = false) => {
    const element = current && findLineElement(current.line);
    if (element !== highlighted) {
      highlighted?.classList.remove("ll-editing-line");
      element?.classList.add("ll-editing-line");
      highlighted = element;
    }
    // Wait for the lyrics area to shrink above the panel before centring in it.
    if (scroll) requestAnimationFrame(() => element?.scrollIntoView?.({ block: "center", behavior: "smooth" }));
  };

  const stopAudition = () => {
    if (!audition) return;
    audition = undefined;
    try { player()?.pause?.(); } catch { /* The page stays usable without playback control. */ }
    editor?.setAuditioning(false);
  };

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const position = playbackPosition();
    editor?.setPlayhead(position);
    if (audition) {
      // A seek is not reported at once: ignore stale positions from before it,
      // but never let a missed end keep the song playing.
      const reached = position !== undefined && position >= audition.end && position <= audition.end + 3_000;
      if (reached || now - audition.startedAt > audition.length + 3_000) stopAudition();
    }
    if (now - lastHighlight > HIGHLIGHT_INTERVAL_MS) {
      lastHighlight = now;
      highlight();
    }
  };

  const toggleAudition = () => {
    if (audition) { stopAudition(); return; }
    const bounds = current && lineBounds(current.line);
    const control = player();
    if (!bounds || !control?.seek) return;
    try {
      const start = Math.max(0, bounds.start - PRE_ROLL_MS);
      control.seek(start);
      control.play?.();
      audition = { end: bounds.end + POST_ROLL_MS, startedAt: performance.now(), length: bounds.end + POST_ROLL_MS - start };
      editor?.setAuditioning(true);
    } catch {
      audition = undefined;
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !current) return;
    event.preventDefault();
    event.stopPropagation();
    current.onClose();
  };

  return {
    open(options) {
      stopAudition();
      current = options;
      if (!container.isConnected) {
        const page = document.getElementById("SpicyLyricsPage");
        const target = page ?? document.body;
        container.classList.toggle("floating", !page);
        if (page && getComputedStyle(page).position === "static") {
          page.classList.add("ll-panel-host");
          positioned = page;
        }
        target.appendChild(container);
        if (page) {
          // Spicy centres the active line in its lyrics area. Shrinking that area
          // to the space above the panel keeps the line being edited in view.
          host = page;
          page.classList.add("ll-panel-open");
          const measure = () => page.style.setProperty("--ll-panel-height", `${container.offsetHeight}px`);
          measure();
          if (typeof ResizeObserver !== "undefined") {
            resize = new ResizeObserver(measure);
            resize.observe(container);
          }
        }
        document.addEventListener("keydown", onKey, true);
        frame = requestAnimationFrame(tick);
      }
      editor = createVisualEditor({ ...options, onAudition: toggleAudition });
      container.replaceChildren(editor.element);
      highlight(true);
      editor.element.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    },
    close() {
      stopAudition();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      document.removeEventListener("keydown", onKey, true);
      highlighted?.classList.remove("ll-editing-line");
      highlighted = undefined;
      positioned?.classList.remove("ll-panel-host");
      positioned = undefined;
      resize?.disconnect();
      resize = undefined;
      host?.classList.remove("ll-panel-open");
      host?.style.removeProperty("--ll-panel-height");
      host = undefined;
      container.remove();
      current = editor = undefined;
    },
  };
}
