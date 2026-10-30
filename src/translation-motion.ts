import { sampleCharacterMotion, type CharacterMotionOptions, type CharacterMotionSample } from "./character-motion";
import type { TranslationMotionSettings } from "./types";

export interface TranslationMotionOptions extends CharacterMotionOptions {
  motion?: TranslationMotionSettings;
}

const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value));
const smoothstep = (value: number): number => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const finite = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

/** Sample a native motion family inside a source-word motion window.
 * This window is separate from the glyph's much shorter fill interval.
 * This returns the original word+letter composite as the desired pose. Layout
 * geometry decides how much of it fits, rather than imposing a global strength
 * limit. Movement uses the translated font's em instead of the primary size. */
export function sampleTranslationMotion(options: TranslationMotionOptions): CharacterMotionSample {
  const start = finite(options.startTime, 0);
  const end = finite(options.endTime, start);
  const position = finite(options.positionMs, start);
  const duration = end - start;
  const valid = Number.isFinite(duration) && duration > 0;
  const fillProgress = options.fillProgress ?? (valid ? (position - start) / duration : 0);
  const sourceDuration = clamp(finite(options.sourceDurationMs, valid ? duration : 16), 16, 60_000);
  const emphasis = options.kind === "emphasis";
  // Run the oscillator in real elapsed milliseconds. Replaying a complete
  // source response and its settling tail inside each fill interval accelerated
  // long notes by 10–40x. The source length still determines emphasis strength;
  // short motion windows simply give the native spring less time to respond.
  const native = sampleCharacterMotion({ ...options,
    positionMs: position - start, startTime: 0, endTime: valid ? duration : 16,
    sourceDurationMs: emphasis ? sourceDuration : valid ? duration : 16,
    motionDurationMs: valid ? duration : 16, fillProgress,
  });
  const rest: CharacterMotionSample = {
    scale: 1, xEm: 0, yEm: 0, ySize: 0, glowOpacity: 0,
    glowBlurPx: 0, glowBlurEm: 0, gradient: native.gradient, isMoving: false,
  };
  if (!valid || position <= start || position >= end) return rest;

  // Real-time entry/exit ramps meet the source deadline with zero velocity.
  // On genuinely short words the ramps overlap naturally; they never squeeze
  // a full-strength long-note bounce into a few frames.
  const elapsed = position - start;
  const amplitude = clamp(finite(options.motion?.amplitude, 1), 0, 2);
  const settleMs = clamp(finite(options.motion?.settleMs, 300), 100, 1000);
  const envelope = smoothstep(elapsed / Math.min(duration, 180))
    * smoothstep((end - position) / Math.min(duration, settleMs));
  const scale = 1 + (native.scale - 1) * envelope * amplitude;
  const xEm = native.xEm * envelope * amplitude || 0;
  const yEm = (native.ySize + native.yEm) * envelope * amplitude || 0;
  // CSS clamps the original alpha to 100%; preserve that rendered intensity
  // while letting the timing envelope fade it smoothly to zero at the boundary.
  // A staggered motion may precede this glyph's fill. Legacy white glow must
  // not light future text early; Refreshed already models its native dim alpha.
  const glowGate = options.refreshed ? 1 : smoothstep(finite(fillProgress, 0));
  const glowOpacity = clamp(native.glowOpacity, 0, 100) * envelope * glowGate;
  const glowBlurPx = Math.max(0, native.glowBlurPx) * envelope;
  const glowBlurEm = Math.max(0, native.glowBlurEm) * envelope;
  return { ...rest, scale, xEm, yEm, glowOpacity, glowBlurPx, glowBlurEm,
    isMoving: Math.abs(scale - 1) + Math.abs(xEm) + Math.abs(yEm) + glowOpacity > 1e-8 };
}
