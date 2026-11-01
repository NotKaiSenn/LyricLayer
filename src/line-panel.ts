import { lyricsPage } from "./dom-renderer";
import { playbackPosition } from "./playback-clock";
import { createVisualEditor, type VisualEditor, type VisualEditorOptions } from "./visual-editor";
import type { LyricLine } from "./types";

export type LinePanelOptions = Omit<VisualEditorOptions, "onAudition">;

/** Alignment and animation for one line, unfolded in place under that line on
 * the real lyrics page. The page itself is the preview: it shows the draft,
 * and auditioning plays the real audio with the native animation. */
export interface LinePanel {
  /** Build the editor for a line; the caller places it under the line. */
  open(options: LinePanelOptions): HTMLElement;
  close(): void;
}

const PRE_ROLL_MS = 1500;
const POST_ROLL_MS = 600;
// Let the seek settle before resuming, so playback never starts from the old spot.
const SEEK_SETTLE_MS = 150;
// Spicy holds off following the active line for 750 ms after the user scrolls.
const HOLD_SCROLL_EVERY_MS = 400;

/** Tell Spicy the user is looking at the list, so it does not scroll to follow
 * the active line (e.g. while auditioning) out from under the open editor. */
function holdAutoScroll(): void {
  const list = lyricsPage()?.querySelector(".SpicyLyricsScrollContainer");
  try {
    list?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 0 }));
  } catch { /* Without it Spicy simply keeps following playback. */ }
}

function lineBounds(line: LyricLine): { start: number; end: number } | undefined {
  const start = line.startTime ?? line.syllables?.[0]?.startTime;
  const end = line.endTime ?? line.syllables?.[line.syllables.length - 1]?.endTime;
  return start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end } : undefined;
}

export function createLinePanel(): LinePanel {
  let current: LinePanelOptions | undefined;
  let editor: VisualEditor | undefined;
  let frame: number | undefined;
  let audition: { end: number; startedAt: number; length: number } | undefined;
  let resume: number | undefined;
  let lastHold = 0;
  const player = () => window.Spicetify?.Player;

  const stopAudition = () => {
    if (resume !== undefined) clearTimeout(resume);
    resume = undefined;
    if (!audition) return;
    audition = undefined;
    try { player()?.pause?.(); } catch { /* The page stays usable without playback control. */ }
    editor?.setAuditioning(false);
  };

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (now - lastHold > HOLD_SCROLL_EVERY_MS) {
      lastHold = now;
      holdAutoScroll();
    }
    const position = playbackPosition();
    editor?.setPlayhead(position);
    if (audition) {
      // A seek is not reported at once: ignore stale positions from before it,
      // but never let a missed end keep the song playing.
      const reached = position !== undefined && position >= audition.end && position <= audition.end + 3_000;
      if (reached || now - audition.startedAt > audition.length + 3_000) stopAudition();
    }
  };

  const toggleAudition = () => {
    if (audition) { stopAudition(); return; }
    const bounds = current && lineBounds(current.line);
    const control = player();
    if (!bounds || !control?.seek) return;
    try {
      const start = Math.max(0, bounds.start - PRE_ROLL_MS);
      if (control.isPlaying?.()) control.pause?.();
      control.seek(start);
      audition = { end: bounds.end + POST_ROLL_MS, startedAt: performance.now(), length: bounds.end + POST_ROLL_MS - start };
      editor?.setAuditioning(true);
      resume = window.setTimeout(() => {
        resume = undefined;
        if (!audition) return;
        audition.startedAt = performance.now();
        try { control.play?.(); } catch { stopAudition(); }
      }, SEEK_SETTLE_MS);
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
      if (!current) {
        document.addEventListener("keydown", onKey, true);
        frame = requestAnimationFrame(tick);
      }
      current = options;
      editor = createVisualEditor({ ...options, onAudition: toggleAudition });
      return editor.element;
    },
    close() {
      stopAudition();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      document.removeEventListener("keydown", onKey, true);
      current = editor = undefined;
    },
  };
}
