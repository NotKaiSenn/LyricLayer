import type { SpicetifyApi } from "./types";

type Player = NonNullable<SpicetifyApi["Player"]>;
type Phase = "pausing" | "seeking" | "starting" | "playing" | "paused";
interface Run { start: number; end: number; phase: Phase; since: number; track?: string; confirmedAt?: number }
const COMMAND_TIMEOUT = 5000;
const SEEK_TOLERANCE = 200;

/** Transport acknowledgements, not a timer, advance an audition. Pauses do not
 * consume its duration; the unadjusted audio clock owns its stop boundary. */
export class Audition {
  private run?: Run;

  constructor(private player: () => Player | undefined, private changed: (active: boolean) => void,
    private failed: (message: string) => void) {}

  toggle(start: number, end: number, now: number): void {
    if (this.run) { this.stop(); return; }
    const player = this.player();
    if (!player?.seek || !player.play || !player.pause || !player.getProgress || !player.isPlaying) {
      this.failed("播放器暂时不能试听，请稍后再试");
      return;
    }
    const run: Run = { start: Math.round(Math.max(0, start)), end, phase: "pausing", since: now, track: player.data?.item?.uri };
    this.run = run;
    this.changed(true);
    this.command(run, () => { if (player.isPlaying!()) return player.pause!(); });
    this.tick(now);
  }

  stop(pause = true): void {
    const run = this.run;
    if (!run) return;
    this.run = undefined;
    this.changed(false);
    const player = this.player();
    if (pause && player?.data?.item?.uri === run.track) {
      try { void Promise.resolve(player?.pause?.()).catch(() => {}); } catch { /* Already stopped. */ }
    }
  }

  private command(run: Run, action: () => void | Promise<void>): void {
    try { void Promise.resolve(action()).catch(() => this.reject(run)); }
    catch { this.reject(run); }
  }

  private reject(run: Run): void {
    if (this.run !== run) return;
    this.stop();
    this.failed("试听未能完成播放定位，请重试");
  }

  tick(now: number): void {
    const run = this.run;
    if (!run) return;
    const player = this.player();
    if (!player || player.data?.item?.uri !== run.track) { this.stop(false); return; }
    try {
      const playing = player.isPlaying?.() === true;
      const position = player.getProgress?.();
      if (run.phase === "pausing" && !playing) {
        run.phase = "seeking";
        run.since = now;
        this.command(run, () => player.seek!(run.start));
        return;
      }
      if (run.phase === "seeking") {
        if (!playing && position !== undefined && Number.isFinite(position) && Math.abs(position - run.start) <= SEEK_TOLERANCE) {
          // Two settled samples prevent a transient state update from resuming
          // audio before the seek has landed. No fixed sleep starts playback.
          run.confirmedAt ??= now;
          if (now - run.confirmedAt >= 50) {
            run.phase = "starting";
            run.since = now;
            this.command(run, () => player.play!());
          }
        } else run.confirmedAt = undefined;
      } else if (run.phase === "starting" && playing) run.phase = "playing";

      if (run.phase === "playing" || run.phase === "paused") {
        run.phase = playing ? "playing" : "paused";
        if (position !== undefined && Number.isFinite(position)) {
          if (position < run.start - SEEK_TOLERANCE || position > run.end + 1000) this.stop(false);
          else if (position >= run.end) this.stop();
        }
      } else if (now - run.since > COMMAND_TIMEOUT) this.reject(run);
    } catch { this.reject(run); }
  }
}
