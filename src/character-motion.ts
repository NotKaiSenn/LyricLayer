/**
 * Independent sampling of Spicy Lyrics 6.4.70's animation parameters.
 * Reference: src/utils/Lyrics/Animator/Lyrics/LyricsAnimator.ts and Lyrics/lyrics.ts
 * in https://github.com/Spikerko/spicy-lyrics . This implementation evaluates the
 * spline-driven oscillator from absolute time, so translated characters do not
 * share the current pose of their source word and seeking needs no frame replay.
 */
export interface CharacterMotionOptions {
  positionMs: number;
  startTime: number;
  endTime: number;
  kind?: "word" | "emphasis";
  simple?: boolean;
  refreshed?: boolean;
  sourceDurationMs?: number;
  motionDurationMs?: number;
  /** Projected fill phase when multiple source cues have unequal durations. */
  fillProgress?: number;
  isLastWord?: boolean;
  isBackground?: boolean;
  index?: number;
  count?: number;
}

export interface CharacterMotionSample {
  scale: number;
  xEm: number;
  yEm: number;
  /** Multiplier of --DefaultLyricsSize; separate from the letter's em offset. */
  ySize: number;
  /** Percentage, matching Spicy's --text-shadow-opacity. */
  glowOpacity: number;
  glowBlurPx: number;
  glowBlurEm: number;
  /** Percentage for --gradient-position or --SLM_GradientPosition. */
  gradient: number;
  isMoving: boolean;
}

type Polynomial = [number, number, number, number];
interface CurveSpan { from: number; to: number; coefficients: Polynomial }
interface Curve { spans: CurveSpan[]; first: number; last: number }
interface SpringState { position: number; velocity: number }
const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value));
const finite = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

/** Natural cubic spline (zero curvature at both endpoints), as used upstream. */
function curve(points: Array<[number, number]>): Curve {
  const count = points.length;
  const diagonal = Array<number>(count).fill(0);
  const upper = Array<number>(count).fill(0);
  const rhs = Array<number>(count).fill(0);
  const second = Array<number>(count).fill(0);
  diagonal[0] = diagonal[count - 1] = 1;
  for (let i = 1; i < count - 1; i++) {
    const left = points[i]![0] - points[i - 1]![0];
    const right = points[i + 1]![0] - points[i]![0];
    const factor = left / diagonal[i - 1]!;
    diagonal[i] = 2 * (left + right) - factor * upper[i - 1]!;
    upper[i] = right;
    rhs[i] = 6 * ((points[i + 1]![1] - points[i]![1]) / right
      - (points[i]![1] - points[i - 1]![1]) / left) - factor * rhs[i - 1]!;
  }
  for (let i = count - 2; i > 0; i--) second[i] = (rhs[i]! - upper[i]! * second[i + 1]!) / diagonal[i]!;
  const spans: CurveSpan[] = [];
  for (let i = 0; i < count - 1; i++) {
    const [from, value] = points[i]!;
    const [to, next] = points[i + 1]!;
    const width = to - from;
    spans.push({ from, to, coefficients: [value,
      (next - value) / width - width * (2 * second[i]! + second[i + 1]!) / 6,
      second[i]! / 2, (second[i + 1]! - second[i]!) / (6 * width)] });
  }
  return { spans, first: points[0]![1], last: points[count - 1]![1] };
}

const wordScale = curve([[0, 0.95], [0.7, 1.0505], [1, 1]]);
const letterScale = curve([[0, 0.95], [0.7, 1.175], [1, 1]]);
const simpleLetterScale = curve([[0, 0.95], [0.7, 1.07], [1, 1]]);
const wordY = curve([[0, 0.01], [0.9, -1 / 60], [1, 0]]);
const simpleWordY = curve([[0, 0.01], [1, -0.033]]);
const letterY = curve([[0, 0.01], [0.9, -1 / 56], [1, 0]]);
const simpleLetterY = curve([[0, 0.01], [0.9, -1 / 62], [1, 0]]);
const glow = curve([[0, 0], [0.15, 1], [0.6, 1], [1, 0]]);

function polynomialValue(p: Polynomial, t: number): number {
  return ((p[3] * t + p[2]) * t + p[1]) * t + p[0];
}

/** Exact underdamped solution with a cubic goal, rather than frame accumulation. */
function stepPolynomialSpring(state: SpringState, goal: Polynomial, seconds: number,
  frequency: number, damping: number): SpringState {
  const omega = frequency * 2 * Math.PI;
  // Particular solution q to q'' + 2*d*w*q' + w*w*q = w*w*goal.
  const q3 = goal[3];
  const q2 = goal[2] - 6 * damping * q3 / omega;
  const q1 = goal[1] - 4 * damping * q2 / omega - 6 * q3 / (omega * omega);
  const q0 = goal[0] - 2 * damping * q1 / omega - 2 * q2 / (omega * omega);
  const residual = state.position - q0;
  const velocity = state.velocity - q1;
  const decay = damping * omega;
  const angular = omega * Math.sqrt(1 - damping * damping);
  const exponential = Math.exp(-decay * seconds);
  const cosine = Math.cos(angular * seconds);
  const sine = Math.sin(angular * seconds);
  const b = (velocity + decay * residual) / angular;
  return {
    position: polynomialValue([q0, q1, q2, q3], seconds)
      + exponential * (residual * cosine + b * sine),
    velocity: q1 + 2 * q2 * seconds + 3 * q3 * seconds * seconds
      + exponential * (velocity * cosine - (decay * b + angular * residual) * sine),
  };
}

function sampleSpring(shape: Curve, elapsedMs: number, durationMs: number,
  frequency: number, damping: number, strength = 1): SpringState {
  let state: SpringState = { position: shape.first, velocity: 0 };
  if (elapsedMs <= 0) return state;
  // Sub-frame metadata can occur in imported lyrics. Keep oscillator arithmetic
  // well conditioned without changing the character's actual fill window.
  const duration = Math.max(16, durationMs) / 1000;
  const elapsed = elapsedMs / 1000;
  for (const span of shape.spans) {
    const start = span.from * duration;
    if (elapsed <= start) break;
    const seconds = Math.min(elapsed, span.to * duration) - start;
    const c = span.coefficients;
    const goal: Polynomial = [c[0] * strength, c[1] * strength / duration,
      c[2] * strength / duration ** 2, c[3] * strength / duration ** 3];
    state = stepPolynomialSpring(state, goal, seconds, frequency, damping);
  }
  if (elapsed > duration) {
    state = stepPolynomialSpring(state, [shape.last, 0, 0, 0], elapsed - duration, frequency, damping);
  }
  return state;
}

function springMoving(state: SpringState, final: number): boolean {
  return Math.abs(state.position - final) > 1 / 3840 || Math.abs(state.velocity) > 0.01;
}

/** Evaluate a CSS cubic-bezier using a bracketed solve in its x coordinate. */
function bezier(x: number, x1: number, y1: number, x2: number, y2: number): number {
  if (x <= 0 || x >= 1) return clamp(x);
  let low = 0;
  let high = 1;
  let t = x;
  for (let i = 0; i < 24; i++) {
    const complement = 1 - t;
    const at = 3 * complement * complement * t * x1 + 3 * complement * t * t * x2 + t ** 3;
    if (at < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  const complement = 1 - t;
  return 3 * complement * complement * t * y1 + 3 * complement * t * t * y2 + t ** 3;
}

function emphasisEnvelope(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  return progress < 0.5 ? bezier(progress * 2, 0.2, 0.4, 0.58, 1)
    : 1 - bezier((progress - 0.5) * 2, 0.3, 0, 0.58, 1);
}

/**
 * Each character owns its start and fill end. A held source word also supplies
 * its motion duration, so translating it into several glyphs does not turn its
 * long emphasis into several tiny bounces. Motion tails may overlap; their
 * start, local phase and fill never become a shared word-level wrapper.
 */
export function sampleCharacterMotion(options: CharacterMotionOptions): CharacterMotionSample {
  const startTime = finite(options.startTime, 0);
  const endTime = finite(options.endTime, startTime + 1);
  const positionMs = finite(options.positionMs, startTime);
  const simple = !!options.simple || !!options.refreshed;
  const refreshed = !!options.refreshed;
  const emphasis = options.kind === "emphasis";
  const fillDuration = Math.max(1, finite(endTime - startTime, 1));
  const sourceDuration = Math.max(1, finite(options.sourceDurationMs, fillDuration));
  const duration = Math.max(1, finite(options.motionDurationMs, emphasis ? sourceDuration : fillDuration));
  const elapsed = finite(positionMs - startTime, 0);
  const phase = options.fillProgress ?? elapsed / fillDuration;
  const progress = Number.isNaN(phase) ? 0 : clamp(phase);
  const easedFill = emphasis && !refreshed ? Math.sin(progress * Math.PI / 2) : progress;
  // Legacy Simple really ends its active sweep at 70%, then becomes 100% in
  // Sung state. Only Refreshed uses the continuous -50..100 (150-point) range.
  const gradient = progress >= 1 ? 100
    : (simple ? -50 : -20) + (refreshed ? 150 : 120) * easedFill;
  const result: CharacterMotionSample = {
    scale: 1, xEm: 0, yEm: 0, ySize: 0.01, glowOpacity: 0,
    glowBlurPx: refreshed && emphasis ? 0 : 4, glowBlurEm: 0,
    gradient, isMoving: false,
  };

  const wordMotionDuration = refreshed ? Math.max(1000, duration) : duration;
  // A normal source word split into short translated windows must not feed its
  // slow spring a tiny pulse. Reparameterize its original response in the same
  // ratio as its time window; damping and curve shape remain unchanged.
  const springRate = emphasis ? 1 : sourceDuration / duration;
  const wordScaleState = sampleSpring(wordScale, elapsed, duration, 0.88 * springRate, 0.64);
  const wordYState = sampleSpring(simple ? simpleWordY : wordY, elapsed, duration, 1.45 * springRate, 0.4);
  const wordGlowState = sampleSpring(glow, elapsed, duration, 1.18 * springRate, 0.56);
  if (simple) {
    result.ySize = refreshed
      ? 0.01 - 0.043 * (1 - (1 - clamp(elapsed / wordMotionDuration)) ** 2)
      : wordYState.position;
  } else {
    result.scale = wordScaleState.position;
    result.ySize = wordYState.position;
    result.glowOpacity = clamp(wordGlowState.position * 35, 0, 100);
    result.glowBlurPx = Math.max(0, 4 + 2 * wordGlowState.position);
  }
  result.isMoving = elapsed >= 0 && (elapsed < wordMotionDuration
    || (!simple && (springMoving(wordScaleState, 1) || springMoving(wordGlowState, 0)))
    || (!refreshed && springMoving(wordYState, simple ? -0.033 : 0)));
  if (!emphasis) return result;

  if (refreshed) {
    const grow = (value: number): number => value > 1 ? Math.sqrt(value) : value ** 3;
    const last = !!options.isLastWord;
    const held = Math.max(1000, duration);
    const amount = Math.min(1.2, grow(Math.max(1000, sourceDuration) / 2000) * 0.6 * (last ? 1.6 : 1));
    const blur = Math.min(0.8, grow(Math.max(1000, sourceDuration) / 3000) * 0.5 * (last ? 1.5 : 1));
    const waveDuration = held * (last ? 1.2 : 1);
    const swell = emphasisEnvelope(elapsed / waveDuration);
    // Upstream's float leads the word's shared wave by 400 ms. Starting this
    // independent letter at its own cue avoids all future characters lifting
    // before their turn; keep the original float amplitude and 1.4x duration.
    const floatProgress = elapsed / (waveDuration * 1.4);
    const float = floatProgress > 0 && floatProgress < 1
      ? Math.sin(floatProgress * Math.PI) * 0.05 * (options.isBackground ? 2 : 1) : 0;
    const count = Math.max(1, finite(options.count, 1));
    const index = clamp(finite(options.index, 0), 0, count - 1);
    result.scale *= 1 + swell * 0.1 * amount;
    result.xEm = -swell * 0.03 * amount * (count / 2 - index) || 0;
    result.yEm = -swell * 0.025 * amount - float || 0;
    result.glowBlurEm = Math.min(0.3, blur * 0.3);
    result.glowOpacity = swell * blur * (0.4 + 0.6 * clamp((gradient + 50) / 150)) * 100;
    result.isMoving ||= elapsed >= 0 && elapsed < waveDuration * 1.4;
    return result;
  }

  const long = sourceDuration > 1500;
  const scaleStrength = simple ? (long ? 1.103 : 1.09) : 1;
  const yStrength = simple ? (long ? 0.45 : 0.1) : 1;
  const glowStrength = simple ? (long ? 0.4 : 0.285) : 1;
  const scaleState = sampleSpring(simple ? simpleLetterScale : letterScale, elapsed, duration, 0.88, 0.64, scaleStrength);
  const yState = sampleSpring(simple ? simpleLetterY : letterY, elapsed, duration, 1.45, 0.4, yStrength);
  const glowState = sampleSpring(glow, elapsed, duration, 1.18, 0.56, glowStrength);
  // LetterGroup's word pose and letter's pose used to be nested DOM transforms.
  // Compose them per character instead of restoring a shared moving wrapper.
  result.ySize += result.scale * yState.position * 2;
  result.scale *= scaleState.position;
  result.glowBlurPx = Math.max(0, 4 + 12 * glowState.position);
  result.glowOpacity = Math.max(0, glowState.position * 185);
  result.isMoving ||= elapsed >= 0 && (elapsed < duration || springMoving(scaleState, 1)
    || springMoving(yState, 0) || springMoving(glowState, 0));
  return result;
}
