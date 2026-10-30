import { characterCuesForSegment, characterPhaseAt, type CharacterCue } from "./character-timing";
import { sampleTranslationMotion } from "./translation-motion";
import type { CharacterMotionSample } from "./character-motion";
import { measureMotionLayout } from "./motion-layout";
import { constrainMotion, type Rect } from "./motion-collision";
import { motionSourcesForSegment } from "./native-motion-mapping";
import { bindNativeMotionSources } from "./native-motion-source";
import type { TranslationTiming } from "./translation-timing";
import type { LyricLine, TranslationMotionSettings } from "./types";

type Paint = Record<string, string>;
interface TimeRange { startTime: number; endTime: number }
interface Candidate {
  sourceIndex: number; weight: number; duration: number; element: HTMLElement; leaf: HTMLElement;
  emphasis: boolean; isLastWord: boolean; ranges: TimeRange[];
}
interface SegmentMirror {
  candidates: Candidate[]; cues: CharacterCue[]; groups: HTMLElement[]; ink: HTMLElement; container: HTMLElement;
  motion: { source: Candidate; ranges: TimeRange[]; duration: number; offset: number; index: number; count: number };
}

function mergeRanges(ranges: TimeRange[], deadline = Infinity): TimeRange[] {
  const result: TimeRange[] = [];
  for (const range of ranges.map(value => ({ startTime: value.startTime, endTime: Math.min(value.endTime, deadline) }))
    .filter(value => Number.isFinite(value.startTime) && Number.isFinite(value.endTime) && value.endTime > value.startTime)
    .sort((a, b) => a.startTime - b.startTime)) {
    const previous = result[result.length - 1];
    if (previous && range.startTime <= previous.endTime) previous.endTime = Math.max(previous.endTime, range.endTime);
    else result.push(range);
  }
  return result;
}

function capture(node: HTMLElement) {
  const style = getComputedStyle(node);
  const ink: Paint = {};
  for (const property of ["background-image", "background-size", "background-position", "background-repeat",
    "background-clip", "-webkit-background-clip", "-webkit-text-fill-color", "color", "text-shadow"]) {
    ink[property] = style.getPropertyValue(property);
  }
  const variable = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const colors = ink["background-image"]?.match(/(?:rgba?|color)\([^)]*\)/g);
  return { ink, lit: colors?.[0], unlit: colors?.[1],
    alpha: variable("--gradient-alpha", "0.85"), dim: variable("--gradient-alpha-end", "0.5"),
    color: variable("--gradient-color", "255"), blur: variable("--BlurAmount", "0px"),
    fade: variable("--SLR_FadeWidth", "0.55em") };
}

function apply(node: HTMLElement, paint: Paint): void {
  for (const [property, value] of Object.entries(paint)) {
    if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
  }
}

/** Native nodes supply palette and motion family, never a shared live pose.
 * Every translated glyph samples the family's curves on its own absolute clock. */
export class NativeMotionMirror {
  readonly nodes = new Set<HTMLElement>();
  readonly segments: Array<SegmentMirror | undefined>;
  readonly endTime: number;
  private readonly motionSettings: TranslationMotionSettings;

  constructor(private line: Element, lyric: LyricLine, timing: TranslationTiming, private spans: HTMLElement[], _fragment: DocumentFragment) {
    const bindings = bindNativeMotionSources(line, lyric);
    this.motionSettings = timing.motion ?? {};
    const deadline = Number.isFinite(lyric.endTime) ? lyric.endTime! : Infinity;
    this.segments = timing.segments.map((_segment, index) => {
      const cues = characterCuesForSegment(timing, index);
      const candidates = motionSourcesForSegment(timing, index).flatMap((mapping): Candidate[] => {
        const binding = bindings.get(mapping.sourceIndex);
        const syllable = lyric.syllables?.[mapping.sourceIndex];
        if (!binding || !syllable) return [];
        const { element, letters, letterStart, letterEnd, ancestors } = binding;
        const count = letterEnd - letterStart;
        // Letter choice supplies palette/pivot, not the current animation phase.
        const leaf = count > 0 ? letters[letterStart + Math.min(count - 1, Math.floor(mapping.position * count))]! : element;
        for (const node of [...ancestors, element, leaf]) this.nodes.add(node);
        const joinedIndices = [...bindings].filter(([, value]) => value.element === element).map(([sourceIndex]) => sourceIndex);
        const joined = joinedIndices.map(sourceIndex => lyric.syllables![sourceIndex]!);
        const sourceTimes = joinedIndices.flatMap<TimeRange>(sourceIndex => {
          const planned = timing.cues.filter(cue => cue.sourceIndex === sourceIndex);
          return planned.length ? planned : [lyric.syllables![sourceIndex]!];
        });
        const duration = Math.max(...joined.map(cue => cue.endTime)) - Math.min(...joined.map(cue => cue.startTime));
        return [{ sourceIndex: mapping.sourceIndex, weight: mapping.weight, duration, element, leaf, emphasis: count > 0,
          ranges: mergeRanges(sourceTimes, deadline),
          isLastWord: bindings.get((lyric.syllables?.length ?? 0) - 1)?.element === element }];
      });
      if (!candidates.length || !cues.length) return undefined;
      const ranges = mergeRanges(candidates.flatMap(candidate => candidate.ranges), deadline);
      if (!ranges.length) return undefined;
      const motion = { source: candidates.reduce((best, item) => item.weight > best.weight ? item : best), ranges,
        duration: ranges.reduce((sum, range) => sum + range.endTime - range.startTime, 0), offset: 0, index: 0, count: 1 };
      const span = spans[index]!;
      const text = span.textContent;
      span.textContent = "";
      span.dataset.lyricLayerNative = "true";
      span.dataset.lyricLayerReserve = text ?? "";
      const ink = document.createElement("span");
      ink.className = "lyric-layer-motion-ink";
      ink.textContent = text;
      span.appendChild(ink);
      // Six translated glyphs bound to two native letters still get six clocks.
      return { candidates, cues, groups: [ink], ink, container: span, motion };
    });
    for (const mirror of this.segments) {
      if (!mirror) continue;
      const siblings = this.segments.filter(value => value?.motion.source.element === mirror.motion.source.element);
      mirror.motion.index = siblings.indexOf(mirror);
      mirror.motion.count = siblings.length;
      // Native emphasis starts letters across the first 40% of a held word.
      // Fill still follows each character's own cue; overlapping motion is
      // independently sampled and never needs a shared moving wrapper.
      const stagger = Number.isFinite(this.motionSettings.stagger) ? Math.max(0, Math.min(0.8, this.motionSettings.stagger!)) : 0.4;
      mirror.motion.offset = mirror.motion.duration * stagger * mirror.motion.index / siblings.length;
    }
    this.endTime = Math.max(0, ...this.segments.flatMap(mirror => mirror?.motion.ranges.map(range => range.endTime) ?? []));
  }

  get count(): number { return this.segments.filter(Boolean).length; }
  isValid(): boolean { return [...this.nodes].every((node) => node.isConnected && this.line.contains(node)); }

  /** Batch source reads before target writes. Only palette snapshots are shared. */
  collect(position: number | undefined, cache: Map<HTMLElement, ReturnType<typeof capture>>, writes: Array<() => void>): void {
    const simple = !!this.line.closest(".SimpleLyricsMode");
    const refreshed = simple && !!this.line.closest(".Exp_RefreshedSimpleLyrics");
    const active = this.line.classList.contains("Active") && !this.line.classList.contains("Sung")
      && !this.line.classList.contains("NotSung") && !this.line.classList.contains("Hidden");
    const staged: Array<{ mirror: SegmentMirror; sourceIndex: number; phase: number; motionPhase: number;
      pose: CharacterMotionSample; ink: Paint; baseShadow: string;
      layout: ReturnType<typeof measureMotionLayout> }> = [];
    for (const mirror of this.segments) {
      if (!mirror) continue;
      // Palette observers can repaint retired lines at any player position.
      // Always sample their resting endpoint, never restart a tail from the
      // live clock. Upcoming lines rest at the beginning instead.
      const time = active ? position ?? this.endTime : this.line.classList.contains("Sung") ? this.endTime : 0;
      let candidate = mirror.candidates[0]!;
      for (const cue of mirror.cues) {
        if (cue.startTime > time) break;
        candidate = mirror.candidates.find(value => value.sourceIndex === cue.sourceIndex) ?? candidate;
      }
      let palette = cache.get(candidate.leaf);
      if (!palette) { palette = capture(candidate.leaf); cache.set(candidate.leaf, palette); }
      const phase = characterPhaseAt(mirror.cues, time);
      // Source activity, not the fill subdivisions, owns the motion lifetime.
      // Merge all associated words so a multi-cue glyph keeps moving through its
      // final word. Real gaps freeze this clock without any catch-up at the end.
      const motion = mirror.motion;
      const elapsed = motion.ranges.reduce((sum, cue) => sum + Math.max(0, Math.min(time - cue.startTime, cue.endTime - cue.startTime)), 0);
      const motionSource = motion.source;
      const pose = sampleTranslationMotion({ positionMs: elapsed, startTime: motion.offset,
        endTime: motion.duration, sourceDurationMs: motionSource.duration, fillProgress: phase.phase,
        motion: this.motionSettings,
        kind: motionSource.emphasis ? "emphasis" : "word", simple, refreshed,
        isLastWord: motionSource.isLastWord, index: motion.index, count: motion.count });
      const ink = { ...palette.ink };
      const transparent = ink["-webkit-text-fill-color"] === "transparent" || ink["-webkit-text-fill-color"] === "rgba(0, 0, 0, 0)";
      if (active && transparent) {
        // Refreshed RTL words reverse the two native gradient stops; the
        // translated glyphs flow left-to-right and need bright then dim again.
        const reversed = refreshed && this.line.classList.contains("rtl") && !candidate.emphasis;
        const lit = (reversed ? palette.unlit : palette.lit) ?? `rgba(255, 255, 255, ${palette.alpha})`;
        const dim = (reversed ? palette.lit : palette.unlit) ?? `rgba(255, 255, 255, ${palette.dim})`;
        if (refreshed) {
          ink["background-image"] = `linear-gradient(to right, ${lit} calc(50% - ${palette.fade} / 2), ${dim} calc(50% + ${palette.fade} / 2))`;
          ink["background-size"] = `calc(200% + ${palette.fade}) 100%`;
          ink["background-position"] = `${((100 - pose.gradient) / 1.5).toFixed(3)}% 0px`;
          ink["background-repeat"] = "no-repeat";
        } else {
          ink["background-image"] = `linear-gradient(90deg, ${lit} ${pose.gradient.toFixed(3)}%, ${dim} ${(pose.gradient + (simple ? 50 : 20)).toFixed(3)}%)`;
          ink["background-size"] = "100% 100%";
          ink["background-position"] = "0% 0%";
        }
        ink["background-clip"] = ink["-webkit-background-clip"] = "text";
      }
      const baseShadow = `0 0 ${palette.blur} rgba(${palette.color}, ${palette.color}, ${palette.color}, ${phase.phase >= 1 ? palette.alpha : palette.dim})`;
      staged.push({ mirror, sourceIndex: candidate.sourceIndex, phase: phase.phase,
        motionPhase: Math.max(0, Math.min(1, (elapsed - motion.offset) / (motion.duration - motion.offset))), pose, ink, baseShadow,
        layout: measureMotionLayout(mirror.container, mirror.ink) });
    }

    // The original lyric and unmatched translated segments are fixed obstacles.
    // All geometry is read before any queued writes, including under native
    // line scaling/scrolling. Only our own word/letter motion is removed.
    const obstacles: Rect[] = [];
    const obstacle = (node: HTMLElement) => {
      if (typeof node.getBoundingClientRect !== "function") return;
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) obstacles.push(rect);
    };
    for (const node of this.nodes) obstacle(node);
    this.spans.forEach((span, index) => { if (!this.segments[index]) obstacle(span); });
    staged.forEach(entry => { if (!entry.layout) obstacle(entry.mirror.ink); });
    const bounds = this.line.closest(".LyricsContainer")?.getBoundingClientRect?.();
    if (bounds && bounds.width > 0) {
      obstacles.push({ left: bounds.left - 1e6, right: bounds.left, top: -1e6, bottom: 1e6 },
        { left: bounds.right, right: bounds.right + 1e6, top: -1e6, bottom: 1e6 });
    }
    const measurable = staged.filter((entry): entry is typeof entry & { layout: NonNullable<typeof entry.layout> } => !!entry.layout);
    const limits = constrainMotion(measurable.map(({ layout, pose }) => ({
      rects: layout.rects, originX: layout.originX, originY: layout.originY,
      scale: pose.scale, x: pose.xEm * layout.pxPerEmX, y: pose.yEm * layout.pxPerEmY,
    })), obstacles);
    for (const entry of staged) {
      const { mirror, pose, layout, ink, baseShadow } = entry;
      const limit = limits[measurable.indexOf(entry as typeof measurable[number])];
      // Missing/hidden layout waits in a readable neutral pose until measurable.
      const scale = limit?.scale ?? 1;
      const xEm = layout && limit ? limit.x / layout.pxPerEmX : 0;
      const yEm = layout && limit ? limit.y / layout.pxPerEmY : 0;
      const motion: Paint = {
        // CSS individual scale precedes transform:translate. Compensate that
        // multiplication so the solver's x/y stay actual visible displacements.
        transform: `translate(${(xEm / scale).toFixed(6)}em, ${(yEm / scale).toFixed(6)}em)`,
        scale: scale.toFixed(6), "transform-origin": "50% 50%",
      };
      ink["text-shadow"] = `${active ? "" : `${baseShadow}, `}0 0 calc(${pose.glowBlurPx.toFixed(3)}px + ${pose.glowBlurEm.toFixed(4)}em) rgba(255, 255, 255, ${(layout ? pose.glowOpacity : 0).toFixed(3)}%)`;
      writes.push(() => {
        apply(mirror.groups[0]!, motion);
        apply(mirror.ink, ink);
        mirror.ink.dataset.lyricLayerSource = String(entry.sourceIndex);
        mirror.container.dataset.lyricLayerPhase = entry.phase.toFixed(4);
        mirror.container.dataset.lyricLayerMotionPhase = entry.motionPhase.toFixed(4);
        mirror.container.dataset.lyricLayerRequestedScale = pose.scale.toFixed(6);
        mirror.container.dataset.lyricLayerMotionGain = (limit?.scaleGain ?? 0).toFixed(4);
      });
    }
  }
}
