import { formatSegments, MOTION_DEFAULTS, MOTION_PRESETS, motionPresetId, moveEdgeTime, nearestBoundary,
  parseSegments, partTimes, remapSegments, snapEdge, type EditContext } from "./alignment-edit";
import { buildTranslationTiming, validateVisualTranslation } from "./translation-timing";
import type { LyricLine, TranslationAlignment, TranslationLine, TranslationMotionSettings } from "./types";

export interface VisualEditorOptions {
  line: LyricLine;
  translation: TranslationLine;
  title: string;
  onApply: (draft: TranslationLine) => void;
  onClose: () => void;
  /** Every valid change, so the real lyrics page can show the draft live. */
  onChange?: (draft: TranslationLine) => void;
  onNavigate?: (delta: -1 | 1, draft: TranslationLine) => void;
  canNavigate?: { previous: boolean; next: boolean };
  onAudition?: () => void;
}

export interface VisualEditor {
  element: HTMLElement;
  /** The playback position on this line's timeline, or undefined to hide it. */
  setPlayhead(time: number | undefined): void;
  setAuditioning(active: boolean): void;
}

const COLORS = ["#a5a0ff", "#65d8c2", "#ffc780", "#ef9fc8", "#83c7ff", "#d1dc88"];
const AUTO_COLOR = "rgba(255,255,255,.72)";
const clone = (value: TranslationLine): TranslationLine => {
  const { alignment, motion, ...rest } = value;
  return { ...rest, ...(alignment ? { alignment: alignment.map(part => ({ ...part })) } : {}),
    ...(motion ? { motion: { ...motion } } : {}) };
};
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const seconds = (value: number): string => Number.isFinite(value) ? (value / 1000).toFixed(3) : "";

function clock(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const total = Math.max(0, value) / 1000;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(2).padStart(5, "0")}`;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text: string, className: string, action?: () => void): HTMLButtonElement {
  const element = node("button", className, text);
  element.type = "button";
  if (action) element.addEventListener("click", action);
  return element;
}

/** Where a newly typed "/" lands first: the phrases the automatic timing would use. */
function automaticParts(line: LyricLine, translation: TranslationLine): TranslationAlignment[] | undefined {
  const source = line.syllables ?? [];
  if (!source.length || !translation.translatedText.length) return undefined;
  const plan = buildTranslationTiming(line, { ...translation, alignment: undefined });
  const parts: TranslationAlignment[] = [];
  if (plan) {
    for (const segment of plan.segments) {
      const matching = plan.cues.filter(cue => cue.sourceIndex !== undefined && cue.start < segment.end && cue.end > segment.start);
      if (!matching.length) {
        if (parts.length) parts[parts.length - 1]!.text += segment.text;
        else return [{ sourceStart: 0, sourceEnd: source.length, text: translation.translatedText }];
        continue;
      }
      const sourceStart = Math.min(...matching.map(cue => cue.sourceIndex!));
      const sourceEnd = Math.max(...matching.map(cue => cue.sourceIndex!)) + 1;
      const previous = parts[parts.length - 1];
      // One original syllable cannot be assigned to two separate fragments.
      if (previous && sourceStart < previous.sourceEnd) {
        previous.text += segment.text;
        previous.sourceEnd = Math.max(previous.sourceEnd, sourceEnd);
      } else parts.push({ sourceStart, sourceEnd, text: segment.text });
    }
  }
  return parts.length && parts.map(part => part.text).join("") === translation.translatedText
    ? parts : [{ sourceStart: 0, sourceEnd: source.length, text: translation.translatedText }];
}

const MOTION_SLIDERS = [
  { key: "amplitude", label: "动作幅度", hint: "译文随原文放大、浮动的程度", min: 0, max: 2, step: 0.05,
    format: (value: number) => `${value.toFixed(2)}×` },
  { key: "stagger", label: "逐字错开", hint: "各字依次起跳的程度，0 为同时起跳", min: 0, max: 0.8, step: 0.05,
    format: (value: number) => `${Math.round(value * 100)}%` },
  { key: "settleMs", label: "回落时间", hint: "每段结束前回到原位所用的时间", min: 100, max: 1000, step: 10,
    format: (value: number) => `${Math.round(value)} ms` },
] as const;

export function createVisualEditor({ line, translation, title, onApply, onClose, onChange, onNavigate, canNavigate,
  onAudition }: VisualEditorOptions): VisualEditor {
  const draft = clone(translation);
  const source = line.syllables ?? [];
  // Use the same normalized syllable endpoints as playback (providers can
  // slightly overlap neighbouring syllables in their raw timestamps).
  const sourceTimes = new Map((buildTranslationTiming(line, { translatedText: "字" })?.cues ?? [])
    .filter(cue => cue.sourceIndex !== undefined).map(cue => [cue.sourceIndex!, cue]));
  const validSource = source.length > 0 && source.every((part, index) => Number.isFinite(part.startTime)
    && Number.isFinite(part.endTime) && part.startTime >= 0 && part.endTime > part.startTime
    && sourceTimes.has(index));
  const lineStart = Number.isFinite(line.startTime) ? line.startTime! : sourceTimes.get(0)?.startTime ?? Number.NaN;
  const lineEnd = Number.isFinite(line.endTime) ? line.endTime! : sourceTimes.get(source.length - 1)?.endTime ?? Number.NaN;
  const context: EditContext | undefined = validSource && Number.isFinite(lineStart) && Number.isFinite(lineEnd) && lineEnd > lineStart
    ? { lineStart, lineEnd, syllables: source.map((_, index) => {
      const cue = sourceTimes.get(index)!;
      return { start: cue.startTime, end: cue.endTime };
    }) }
    : undefined;
  // Phrases that no longer spell the translation cannot be shown as "/" marks.
  if (draft.alignment && draft.alignment.map(part => part.text).join("") !== draft.translatedText) delete draft.alignment;

  let segmentError: string | undefined;
  let closed = false;
  const color = (index: number): string => COLORS[index % COLORS.length]!;
  const autoPart = (): TranslationAlignment => ({ sourceStart: 0, sourceEnd: source.length, text: draft.translatedText });
  const shown = (): TranslationAlignment[] => draft.alignment ?? [autoPart()];
  const formatted = (): string => context
    ? formatSegments(draft.alignment ? draft.alignment.map(part => part.text) : [draft.translatedText])
    : draft.translatedText;
  const setAlignment = (parts: TranslationAlignment[]): void => {
    segmentError = undefined;
    draft.alignment = parts;
    draft.originalText = line.text;
    refresh();
  };

  const root = node("div", "ll-scope lyric-layer-visual-editor");
  const header = node("div", "ll-ve-header");
  const heading = node("div", "ll-ve-heading");
  heading.append(node("span", "ll-ve-heading-title", title), node("span", "ll-ve-heading-line", line.text));
  const previous = button("‹ 上一句", "ll-btn small", () => navigate(-1));
  const next = button("下一句 ›", "ll-btn small", () => navigate(1));
  const listen = button("▶ 试听这一句", "ll-btn small", () => onAudition?.());
  listen.title = "从这一句开头前一点开始播放，唱完自动暂停";
  const cancel = button("取消", "ll-btn small", () => finish(false));
  cancel.title = "Esc";
  const done = button("完成", "ll-btn small primary", () => finish(true));
  done.title = "Ctrl/Cmd + Enter";
  const headerActions = node("div", "ll-ve-header-actions");
  if (onNavigate) headerActions.append(previous, next);
  if (onAudition) headerActions.append(listen);
  headerActions.append(cancel, done);
  header.append(heading, headerActions);
  const status = node("p", "ll-ve-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  // Translation text. With word timing, "/" marks where one phrase ends.
  const textSection = node("section", "ll-ve-section");
  const textHead = node("div", "ll-ve-section-head");
  const textLabel = node("span", "ll-ve-title", "译文");
  textHead.append(textLabel);
  if (context) textHead.append(node("span", "ll-ve-hint", "用 / 把译文分成几段，每段对应原文的一组音节"));
  const textInput = node("textarea", "ll-ve-text");
  textInput.rows = 1;
  textInput.spellcheck = false;
  textInput.value = formatted();
  textInput.setAttribute("aria-label", context ? "译文，用斜杠分段" : "译文");
  textInput.placeholder = context ? "例如：我能看见/你眼中的光" : "输入译文";
  textSection.append(textHead, textInput);

  // One timeline: original syllables above, translated phrases below.
  const alignSection = node("section", "ll-ve-section");
  const alignHead = node("div", "ll-ve-section-head");
  const mode = node("span", "ll-ve-badge");
  const actions = node("div", "ll-ve-actions");
  const reset = button("恢复自动", "ll-btn small quiet", () => {
    segmentError = undefined;
    delete draft.alignment;
    refresh();
  });
  reset.title = "去掉所有分段和手动时间，让译文按字数自动跟随原文";
  actions.append(reset);
  alignHead.append(node("span", "ll-ve-title", "对齐"), mode, actions);
  alignSection.append(alignHead);

  const lanes = node("div", "ll-ve-lanes");
  const axis = node("div", "ll-ve-axis");
  const sourceTrack = node("div", "ll-ve-track source");
  const targetTrack = node("div", "ll-ve-track target");
  const lanesHint = node("p", "ll-ve-hint",
    "拖动色块两端对齐到音节 · 按住 Alt 拖动可自由调整时间 · 选中端点后可用方向键微调");
  const precise = node("details", "ll-ve-details");
  const preciseRows = node("div", "ll-ve-precise");
  precise.append(node("summary", "", "精确时间"), preciseRows);
  if (context) {
    axis.append(node("span", "", clock(context.lineStart)), node("span", "", clock(context.lineEnd)));
    lanes.append(node("span", "", ""), axis,
      node("span", "ll-ve-lane-label", "原文"), sourceTrack,
      node("span", "ll-ve-lane-label", "译文"), targetTrack);
    alignSection.append(lanes, lanesHint, precise);
  } else {
    alignSection.append(node("p", "ll-ve-hint", source.length
      ? "这一行的逐字时间不完整，译文会随整句显示，无法分段对齐。"
      : "这一行没有逐字时间，译文会随整句显示，无法分段对齐。"));
    mode.hidden = actions.hidden = true;
  }

  const position = (time: number): number => context ? clamp((time - context.lineStart) / (context.lineEnd - context.lineStart), 0, 1) * 100 : 0;
  const syllableBlocks = source.map((syllable, index) => {
    const block = node("span", "ll-ve-syllable", syllable.text.trim() || "·");
    const times = context?.syllables[index];
    if (times) {
      block.style.left = `${position(times.start)}%`;
      block.style.width = `${position(times.end) - position(times.start)}%`;
      block.title = `${syllable.text} · ${clock(times.start)} – ${clock(times.end)}`;
    }
    sourceTrack.append(block);
    return block;
  });

  const playheads = [node("div", "ll-ve-playhead"), node("div", "ll-ve-playhead")];
  playheads.forEach(playhead => { playhead.hidden = true; });
  sourceTrack.append(playheads[0]!);
  type Bar = { root: HTMLElement; label: HTMLElement; start: HTMLButtonElement; end: HTMLButtonElement };
  type PreciseRow = { label: HTMLElement; span: HTMLElement; start: HTMLInputElement; end: HTMLInputElement; follow: HTMLButtonElement };
  let bars: Bar[] = [];
  let preciseInputs: PreciseRow[] = [];

  function adjust(index: number, edge: "start" | "end", base: TranslationAlignment[], time: number, free: boolean): void {
    if (!context) return;
    setAlignment(free ? moveEdgeTime(base, index, edge, time, context)
      : snapEdge(base, index, edge, nearestBoundary(time, context), context));
  }

  function handle(index: number, edge: "start" | "end"): HTMLButtonElement {
    const element = button("", `ll-ve-handle ${edge}`);
    element.addEventListener("pointerdown", event => {
      if (!context || event.button !== 0) return;
      // Every move starts again from the pre-drag phrases, so snapping is stable.
      const base = shown().map(part => ({ ...part }));
      const box = targetTrack.getBoundingClientRect();
      if (box.width <= 0) return;
      event.preventDefault();
      element.focus({ preventScroll: true });
      element.setPointerCapture?.(event.pointerId);
      element.dataset.dragging = "true";
      const timeAt = (pointer: PointerEvent): number =>
        context.lineStart + clamp((pointer.clientX - box.left) / box.width, 0, 1) * (context.lineEnd - context.lineStart);
      const move = (pointer: PointerEvent) => {
        if (pointer.pointerId === event.pointerId) adjust(index, edge, base, timeAt(pointer), pointer.altKey);
      };
      const end = (pointer: PointerEvent) => {
        if (pointer.pointerId !== event.pointerId) return;
        delete element.dataset.dragging;
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", end);
        element.removeEventListener("pointercancel", end);
        element.removeEventListener("lostpointercapture", end);
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", end);
      element.addEventListener("pointercancel", end);
      element.addEventListener("lostpointercapture", end);
    });
    element.addEventListener("keydown", event => {
      if (!context || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault();
      const base = shown();
      const part = base[index];
      if (!part) return;
      const direction = event.key === "ArrowRight" ? 1 : -1;
      if (event.altKey) {
        const times = partTimes(part, context);
        setAlignment(moveEdgeTime(base, index, edge,
          (edge === "start" ? times.start : times.end) + direction * (event.shiftKey ? 100 : 10), context));
      } else {
        setAlignment(snapEdge(base, index, edge, (edge === "start" ? part.sourceStart : part.sourceEnd) + direction, context));
      }
    });
    return element;
  }

  function preciseRow(index: number): PreciseRow {
    const row = node("div", "ll-ve-precise-row");
    const label = node("span", "ll-ve-precise-text");
    const span = node("span", "ll-ve-precise-source");
    const start = node("input", "ll-ve-number");
    const end = node("input", "ll-ve-number");
    for (const [input, edge] of [[start, "start"], [end, "end"]] as const) {
      input.type = "number";
      input.step = "0.001";
      if (context) { input.min = seconds(context.lineStart); input.max = seconds(context.lineEnd); }
      input.setAttribute("aria-label", `第 ${index + 1} 段${edge === "start" ? "开始" : "结束"}时间（秒）`);
      input.addEventListener("change", () => {
        const part = draft.alignment?.[index];
        const value = Number(input.value) * 1000;
        if (!context || !part || input.value === "" || !Number.isFinite(value)) { refresh(); return; }
        const times = partTimes(part, context);
        part.startTime = edge === "start" ? value : times.start;
        part.endTime = edge === "end" ? value : times.end;
        refresh();
      });
    }
    const follow = button("跟随音节", "ll-btn small quiet", () => {
      const part = draft.alignment?.[index];
      if (!part) return;
      delete part.startTime;
      delete part.endTime;
      refresh();
    });
    follow.title = "去掉手动时间，按对应音节的时间显示";
    row.append(label, span, start, end, follow);
    preciseRows.append(row);
    return { label, span, start, end, follow };
  }

  function build(): void {
    const count = shown().length;
    if (bars.length !== count) {
      targetTrack.replaceChildren();
      bars = shown().map((_, index) => {
        const bar = node("div", "ll-ve-bar");
        const label = node("span", "ll-ve-bar-label");
        const start = handle(index, "start");
        const end = handle(index, "end");
        bar.append(start, label, end);
        targetTrack.append(bar);
        return { root: bar, label, start, end };
      });
      targetTrack.append(playheads[1]!);
    }
    const rows = draft.alignment?.length ?? 0;
    if (preciseInputs.length !== rows) {
      preciseRows.replaceChildren();
      const head = node("div", "ll-ve-precise-row head");
      head.append(node("span", "", "片段"), node("span", "", "原文"), node("span", "", "开始 / 秒"), node("span", "", "结束 / 秒"), node("span", "", ""));
      if (rows) preciseRows.append(head);
      preciseInputs = Array.from({ length: rows }, (_, index) => preciseRow(index));
    }
    precise.hidden = !rows;
  }

  function layout(): void {
    if (!context) return;
    build();
    const aligned = !!draft.alignment;
    const parts = shown();
    syllableBlocks.forEach((block, index) => {
      const owner = aligned ? parts.findIndex(part => part.sourceStart <= index && index < part.sourceEnd) : 0;
      block.dataset.mapped = String(owner >= 0);
      block.style.setProperty("--ll-ve-color", owner < 0 ? "rgba(255,255,255,.4)" : aligned ? color(owner) : AUTO_COLOR);
    });
    parts.forEach((part, index) => {
      const bar = bars[index]!;
      const times = partTimes(part, context);
      const start = position(times.start);
      bar.root.style.left = `${start}%`;
      bar.root.style.width = `${Math.max(0, position(times.end) - start)}%`;
      bar.root.style.setProperty("--ll-ve-color", aligned ? color(index) : AUTO_COLOR);
      bar.root.dataset.auto = String(!aligned);
      bar.root.dataset.manual = String(part.startTime !== undefined);
      const text = part.text || "（空）";
      bar.label.textContent = aligned ? text : `${text || "译文"} · 自动`;
      bar.root.title = `${text} · ${clock(times.start)} – ${clock(times.end)}${part.startTime !== undefined ? " · 手动时间" : ""}`;
      bar.start.setAttribute("aria-label", `第 ${index + 1} 段「${text}」的开始，方向键移动一个音节，Alt+方向键微调时间`);
      bar.end.setAttribute("aria-label", `第 ${index + 1} 段「${text}」的结束，方向键移动一个音节，Alt+方向键微调时间`);
      const row = preciseInputs[index];
      if (!row) return;
      row.label.textContent = text;
      row.label.style.setProperty("--ll-ve-color", color(index));
      const first = source[part.sourceStart]?.text.trim() ?? "";
      const last = source[part.sourceEnd - 1]?.text.trim() ?? "";
      row.span.textContent = part.sourceEnd - part.sourceStart > 1 ? `${first} … ${last}` : first;
      if (document.activeElement !== row.start) row.start.value = seconds(times.start);
      if (document.activeElement !== row.end) row.end.value = seconds(times.end);
      row.follow.disabled = part.startTime === undefined;
    });
  }

  // Animation: presets first, numbers only on request.
  const motionSection = node("section", "ll-ve-section");
  const motionHead = node("div", "ll-ve-section-head");
  const presets = node("div", "ll-ve-presets");
  presets.setAttribute("role", "group");
  presets.setAttribute("aria-label", "动画预设");
  const presetButtons = MOTION_PRESETS.map(preset => {
    const element = button(preset.label, "ll-ve-preset", () => {
      if (preset.motion) draft.motion = { ...preset.motion };
      else delete draft.motion;
      refresh();
    });
    element.title = preset.description;
    presets.append(element);
    return element;
  });
  const custom = node("span", "ll-ve-preset custom", "自定义");
  presets.append(custom);
  const presetHint = node("span", "ll-ve-hint");
  motionHead.append(node("span", "ll-ve-title", "动画"), presets, presetHint);
  const tuning = node("details", "ll-ve-details");
  const sliders = node("div", "ll-ve-sliders");
  tuning.append(node("summary", "", "细调"), sliders);
  const sliderInputs = MOTION_SLIDERS.map(setting => {
    const label = node("label", "ll-ve-slider");
    const copy = node("span", "ll-ve-slider-copy");
    copy.append(node("span", "ll-ve-slider-label", setting.label), node("span", "ll-ve-hint", setting.hint));
    const input = node("input", "ll-ve-range");
    input.type = "range";
    input.min = String(setting.min);
    input.max = String(setting.max);
    input.step = String(setting.step);
    const output = node("output", "ll-ve-slider-value");
    input.addEventListener("input", () => {
      draft.motion = { ...draft.motion, [setting.key]: Number(input.value) } as TranslationMotionSettings;
      refresh();
    });
    label.append(copy, input, output);
    sliders.append(label);
    return { setting, input, output };
  });
  motionSection.append(motionHead, tuning);

  const body = node("div", "ll-ve-body");
  body.append(textSection, alignSection, motionSection);
  root.append(header, status, body);

  const currentError = (): string | undefined => segmentError ?? validateVisualTranslation(line, draft);
  function finish(apply: boolean): void {
    if (closed || (apply && currentError())) return;
    closed = true;
    if (apply) onApply(clone(draft));
    else onClose();
  }
  function navigate(delta: -1 | 1): void {
    if (closed || currentError()) return;
    closed = true;
    onNavigate?.(delta, clone(draft));
  }

  function refresh(): void {
    if (document.activeElement !== textInput) textInput.value = formatted();
    textInput.style.height = "auto";
    textInput.style.height = `${Math.max(44, textInput.scrollHeight)}px`;
    layout();
    mode.textContent = draft.alignment ? `已分 ${draft.alignment.length} 段` : "自动";
    mode.dataset.manual = String(!!draft.alignment);
    reset.disabled = !draft.alignment;

    const preset = motionPresetId(draft.motion);
    presetButtons.forEach((element, index) => element.setAttribute("aria-pressed", String(MOTION_PRESETS[index]!.id === preset)));
    custom.hidden = preset !== "custom";
    presetHint.textContent = MOTION_PRESETS.find(value => value.id === preset)?.description ?? "已在细调中修改";
    for (const { setting, input, output } of sliderInputs) {
      const value = draft.motion?.[setting.key] ?? MOTION_DEFAULTS[setting.key];
      if (document.activeElement !== input) input.value = String(value);
      output.textContent = setting.format(Number(input.value));
    }

    const error = currentError();
    done.disabled = !!error;
    previous.disabled = !!error || !canNavigate?.previous;
    next.disabled = !!error || !canNavigate?.next;
    listen.disabled = !context && !(Number.isFinite(line.startTime) && Number.isFinite(line.endTime));
    status.textContent = error ?? "上方歌词按草稿实时显示 · 完成后回到列表保存";
    status.dataset.error = String(!!error);
    textInput.setAttribute("aria-invalid", String(!!segmentError));
    if (!error && !closed) onChange?.(clone(draft));
  }

  textInput.addEventListener("input", () => {
    segmentError = undefined;
    if (!context) { draft.translatedText = textInput.value; refresh(); return; }
    const segments = parseSegments(textInput.value);
    const text = segments.join("");
    if (!draft.alignment && segments.length <= 1) { draft.translatedText = text; refresh(); return; }
    const result = draft.alignment
      ? remapSegments(draft.alignment, segments, context)
      : remapSegments(automaticParts(line, { translatedText: text }) ?? [], segments, context, false);
    if (result.error !== undefined) { segmentError = result.error; refresh(); return; }
    draft.translatedText = text;
    if (result.parts.length) setAlignment(result.parts);
    else { delete draft.alignment; refresh(); }
  });
  textInput.addEventListener("blur", () => { if (!segmentError) textInput.value = formatted(); });
  root.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      finish(true);
    }
  });
  refresh();
  return {
    element: root,
    setPlayhead(time) {
      const visible = !!context && time !== undefined && time >= context.lineStart && time <= context.lineEnd;
      playheads.forEach(playhead => {
        playhead.hidden = !visible;
        if (visible) playhead.style.left = `${position(time!)}%`;
      });
    },
    setAuditioning(active) {
      listen.textContent = active ? "■ 停止试听" : "▶ 试听这一句";
      listen.setAttribute("aria-pressed", String(active));
    },
  };
}
