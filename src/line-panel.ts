import { playbackPosition } from "./playback-clock";
import { createVisualEditor, type VisualEditor, type VisualEditorOptions } from "./visual-editor";
import type { LyricLine } from "./types";
import { Audition } from "./audition";
import { notify } from "./ui-kit";

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
  const player = () => window.Spicetify?.Player;

  const audition = new Audition(player, active => editor?.setAuditioning(active), message => notify(message, true));

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const position = playbackPosition();
    editor?.setPlayhead(position);
    audition.tick(now);
  };

  const toggleAudition = () => {
    const bounds = current && lineBounds(current.line);
    if (bounds) audition.toggle(bounds.start - PRE_ROLL_MS, bounds.end + POST_ROLL_MS, performance.now());
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !current) return;
    event.preventDefault();
    event.stopPropagation();
    current.onClose();
  };

  return {
    open(options) {
      audition.stop();
      if (!current) {
        document.addEventListener("keydown", onKey, true);
        frame = requestAnimationFrame(tick);
      }
      current = options;
      editor = createVisualEditor({ ...options, onAudition: toggleAudition });
      return editor.element;
    },
    close() {
      audition.stop();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      document.removeEventListener("keydown", onKey, true);
      current = editor = undefined;
    },
  };
}
