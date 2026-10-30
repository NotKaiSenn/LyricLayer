import { buildTranslationTiming, validateVisualTranslation } from "./translation-timing";
import { createVisualPreview } from "./visual-preview";
import type { LyricLine, TranslationAlignment, TranslationLine } from "./types";

interface VisualEditorOptions {
  line: LyricLine;
  translation: TranslationLine;
  onApply: (draft: TranslationLine) => void;
  onClose: () => void;
}

const COLORS = ["#a5a0ff", "#65d8c2", "#ffc780", "#ef9fc8", "#83c7ff", "#d1dc88"];
const clone = (value: TranslationLine): TranslationLine => ({ ...value,
  alignment: value.alignment?.map(part => ({ ...part })), motion: value.motion ? { ...value.motion } : undefined });
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const seconds = (value: number): string => Number.isFinite(value) ? (value / 1000).toFixed(3) : "";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text: string, action: () => void, className = ""): HTMLButtonElement {
  const element = node("button", `ll-ve-button ${className}`.trim(), text);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}

function field(text: string, input: HTMLElement): HTMLLabelElement {
  const label = node("label", "ll-ve-field");
  label.append(node("span", "ll-ve-label", text), input);
  return label;
}

function boundaries(text: string): number[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => {
    segment(text: string): Iterable<{ segment: string }>;
  } }).Segmenter;
  const values = Segmenter ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), value => value.segment)
    : Array.from(text);
  let offset = 0;
  return values.slice(0, -1).map(value => offset += value.length);
}

/** Start with the existing mapping verbatim. Automatic mapping is only used for
 * an unaligned line or after the user explicitly chooses to rebuild it. */
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

export function createVisualEditor({ line, translation, onApply, onClose }: VisualEditorOptions): HTMLElement {
  const draft = clone(translation);
  const source = line.syllables ?? [];
  // Use the same normalized syllable endpoints as playback (providers can
  // slightly overlap neighbouring syllables in their raw timestamps).
  const sourceTimes = new Map((buildTranslationTiming(line, { translatedText: "字" })?.cues ?? [])
    .filter(cue => cue.sourceIndex !== undefined).map(cue => [cue.sourceIndex!, cue]));
  const validSource = source.length > 0 && source.every((part, index) => Number.isFinite(part.startTime)
    && Number.isFinite(part.endTime) && part.startTime >= 0 && part.endTime > part.startTime
    && sourceTimes.has(index));
  const lineStart = Number.isFinite(line.startTime) ? line.startTime : sourceTimes.get(0)?.startTime;
  const lineEnd = Number.isFinite(line.endTime) ? line.endTime : sourceTimes.get(source.length - 1)?.endTime;
  const timed = validSource && lineStart !== undefined && lineEnd !== undefined
    && Number.isFinite(lineStart) && Number.isFinite(lineEnd) && lineEnd > lineStart;
  if (!draft.alignment?.length && validSource) {
    const alignment = automaticParts(line, draft);
    const candidate = { ...draft, originalText: line.text, alignment };
    if (!validateVisualTranslation(line, candidate)) Object.assign(draft, candidate);
  }
  let selected = 0;
  let closed = false;
  const parts = (): TranslationAlignment[] => draft.alignment ?? [];
  const color = (index: number): string => COLORS[index % COLORS.length]!;
  const times = (part: TranslationAlignment): { start: number; end: number } => ({
    start: part.startTime ?? sourceTimes.get(part.sourceStart)?.startTime ?? Number.NaN,
    end: part.endTime ?? sourceTimes.get(part.sourceEnd - 1)?.endTime ?? Number.NaN,
  });
  const root = node("div", "lyric-layer-visual-editor");
  const heading = node("div", "ll-ve-heading");
  heading.append(node("span", "ll-ve-kicker", "可视化编辑"), node("p", "ll-ve-original", line.text));
  const textInput = node("textarea", "ll-ve-text");
  textInput.rows = 1;
  textInput.value = draft.translatedText;
  textInput.setAttribute("aria-label", "完整译文，保留空格和换行");
  const textSection = node("div", "ll-ve-card");
  textSection.append(field("译文", textInput));
  const sourceSection = node("div", "ll-ve-card");
  const sourceHeading = node("div", "ll-ve-section-heading");
  sourceHeading.append(node("span", "ll-ve-label", "原文音节"), node("span", "ll-ve-hint", "点选起点 · Shift 点选终点"));
  const chips = node("div", "ll-ve-chips");
  const chipButtons = source.map((syllable, index) => {
    const chip = button(`${index + 1}  ${syllable.text || "∅"}`, () => {});
    chip.className = "ll-ve-chip";
    chip.setAttribute("aria-label", `原文音节 ${index + 1}：${syllable.text || "空音节"}`);
    chip.addEventListener("click", event => {
      const part = parts()[selected];
      if (!part) return;
      if (event.shiftKey) part.sourceEnd = index + 1;
      else { part.sourceStart = index; if (part.sourceEnd <= index) part.sourceEnd = index + 1; }
      refresh();
    });
    chips.append(chip);
    return chip;
  });
  if (!validSource) chips.append(node("span", "ll-ve-hint", "缺少逐字时间，可编辑译文和动画。"));
  sourceSection.append(sourceHeading, chips);

  const workspace = node("div", "ll-ve-workspace");
  const fragmentCard = node("div", "ll-ve-card ll-ve-fragments-card");
  const fragmentHeading = node("div", "ll-ve-section-heading");
  const fragmentTools = node("div", "ll-ve-inline-actions");
  const rebuild = button("重新分段", () => {
    draft.originalText = line.text;
    draft.alignment = automaticParts(line, draft);
    selected = 0;
    renderFragments(); refresh();
  });
  rebuild.disabled = !validSource;
  rebuild.title = "按完整译文重新建立对应，替换当前分段";
  const clear = button("清除分段", () => { delete draft.alignment; selected = 0; renderFragments(); refresh(); });
  fragmentTools.append(rebuild, clear);
  fragmentHeading.append(node("span", "ll-ve-label", "译文片段"), fragmentTools);
  const fragmentList = node("div", "ll-ve-fragment-list");
  fragmentList.setAttribute("aria-label", "译文片段列表");
  fragmentCard.append(fragmentHeading, fragmentList);

  const detailCard = node("fieldset", "ll-ve-card ll-ve-detail");
  const detailLegend = node("legend", "ll-ve-label", "片段 1");
  const partText = node("textarea", "ll-ve-text");
  partText.rows = 1;
  partText.setAttribute("aria-label", "选中片段文字，光标位置用于拆分");
  const split = button("在光标处拆分", () => {
    const part = parts()[selected];
    if (!part) return;
    const stops = boundaries(part.text);
    if (!stops.length || part.sourceEnd - part.sourceStart < 2) return;
    const caret = partText.selectionStart;
    const offset = stops.reduce((best, value) => Math.abs(value - caret) < Math.abs(best - caret) ? value : best, stops[0]!);
    const fraction = offset / part.text.length;
    const middle = clamp(Math.round(part.sourceStart + (part.sourceEnd - part.sourceStart) * fraction), part.sourceStart + 1, part.sourceEnd - 1);
    const first: TranslationAlignment = { ...part, sourceEnd: middle, text: part.text.slice(0, offset) };
    const second: TranslationAlignment = { ...part, sourceStart: middle, text: part.text.slice(offset) };
    if (part.startTime !== undefined && part.endTime !== undefined) {
      const time = part.startTime + (part.endTime - part.startTime) * fraction;
      first.endTime = time; second.startTime = time;
    }
    parts().splice(selected, 1, first, second);
    renderFragments(); refresh(); partText.focus();
  });
  const merge = button("合并后段", () => {
    const current = parts()[selected];
    const next = parts()[selected + 1];
    if (!current || !next) return;
    const merged: TranslationAlignment = { sourceStart: current.sourceStart, sourceEnd: next.sourceEnd, text: current.text + next.text };
    if (current.startTime !== undefined || next.startTime !== undefined) {
      merged.startTime = times(current).start;
      merged.endTime = times(next).end;
    }
    parts().splice(selected, 2, merged);
    renderFragments(); refresh();
  });
  const editActions = node("div", "ll-ve-inline-actions");
  editActions.append(split, merge);
  const sourceInputs = node("div", "ll-ve-two-columns");
  const sourceStartInput = node("select", "ll-ve-input");
  const sourceEndInput = node("select", "ll-ve-input");
  source.forEach((syllable, index) => {
    for (const [input, value] of [[sourceStartInput, index], [sourceEndInput, index + 1]] as const) {
      const option = node("option", "", `${index + 1} · ${syllable.text || "∅"}`);
      option.value = String(value); input.append(option);
    }
  });
  sourceStartInput.setAttribute("aria-label", "片段对应原文的起始音节");
  sourceEndInput.setAttribute("aria-label", "片段对应原文的结束音节");
  sourceInputs.append(field("原文起点", sourceStartInput), field("原文终点", sourceEndInput));
  const timeInputs = node("div", "ll-ve-two-columns");
  const startInput = node("input", "ll-ve-input");
  const endInput = node("input", "ll-ve-input");
  for (const input of [startInput, endInput]) {
    input.type = "number"; input.step = "0.001";
    if (timed) { input.min = seconds(lineStart!); input.max = seconds(lineEnd!); }
  }
  startInput.setAttribute("aria-label", "片段开始时间，歌曲绝对秒数");
  endInput.setAttribute("aria-label", "片段结束时间，歌曲绝对秒数");
  timeInputs.append(field("开始 / 秒", startInput), field("结束 / 秒", endInput));
  const resetTime = button("跟随原文时间", () => {
    const part = parts()[selected];
    if (!part) return;
    delete part.startTime; delete part.endTime; refresh();
  });
  detailCard.append(detailLegend, field("片段文字", partText), editActions, sourceInputs, timeInputs, resetTime);
  workspace.append(fragmentCard, detailCard);

  const timelineCard = node("div", "ll-ve-card");
  const timelineHeading = node("div", "ll-ve-section-heading");
  timelineHeading.append(node("span", "ll-ve-label", "时间轴"), node("span", "ll-ve-hint", "拖边缘调整 · 拖中间移动"));
  const axis = node("div", "ll-ve-axis");
  axis.append(node("span", "", timed ? `${seconds(lineStart!)} s` : "—"), node("span", "", timed ? `${seconds(lineEnd!)} s` : "—"));
  const tracks = node("div", "ll-ve-tracks");
  timelineCard.append(timelineHeading, axis, tracks);

  const motionCard = node("div", "ll-ve-card ll-ve-motion");
  motionCard.append(node("span", "ll-ve-label", "动画"));
  const motionControls = [
    { key: "amplitude", text: "幅度", min: 0, max: 2, step: 0.05, fallback: 1 },
    { key: "stagger", text: "错峰", min: 0, max: 0.8, step: 0.05, fallback: 0.4 },
    { key: "settleMs", text: "收尾", min: 100, max: 1000, step: 10, fallback: 300 },
  ] as const;
  for (const setting of motionControls) {
    const label = node("label", "ll-ve-motion-control");
    const input = node("input", "ll-ve-range");
    input.type = "range"; input.min = String(setting.min); input.max = String(setting.max); input.step = String(setting.step);
    input.value = String(draft.motion?.[setting.key] ?? setting.fallback);
    input.setAttribute("aria-label", `动画${setting.text}`);
    const output = node("output", "ll-ve-motion-value");
    const show = () => { output.textContent = `${input.value}${setting.key === "settleMs" ? " ms" : setting.key === "amplitude" ? "×" : ""}`; };
    show();
    input.addEventListener("input", () => {
      draft.motion = { ...draft.motion, [setting.key]: Number(input.value) };
      show(); refresh();
    });
    label.append(node("span", "", setting.text), input, output);
    motionCard.append(label);
  }
  const preview = createVisualPreview({ line, translation: clone(draft) });
  preview.element.classList.add("ll-ve-preview");
  const status = node("p", "ll-ve-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const footer = node("div", "ll-ve-footer");
  const cancel = button("取消", () => { if (!closed) { closed = true; preview.destroy(); onClose(); } });
  const apply = button("应用到此行", () => {
    if (closed || validateVisualTranslation(line, draft)) return;
    closed = true;
    preview.destroy();
    onApply(clone(draft));
  }, "ll-ve-primary");
  footer.append(status, cancel, apply);
  root.append(heading, preview.element, motionCard, textSection, sourceSection, workspace, timelineCard, footer);

  type Row = { index: number; choice: HTMLButtonElement; time: HTMLElement; track: HTMLElement;
    bar: HTMLElement; body: HTMLButtonElement; left: HTMLButtonElement; right: HTMLButtonElement };
  let rows: Row[] = [];
  function changeTime(index: number, start: number, end: number): void {
    const part = parts()[index];
    if (!part) return;
    part.startTime = start; part.endTime = end;
    refresh();
  }
  function drag(handle: HTMLButtonElement, track: HTMLElement, index: number, mode: "start" | "end" | "move"): void {
    handle.addEventListener("pointerdown", event => {
      const part = parts()[index];
      if (!timed || !part || event.button !== 0) return;
      const initial = times(part);
      const lower = index ? Math.max(lineStart!, times(parts()[index - 1]!).end) : lineStart!;
      const upper = index + 1 < parts().length ? Math.min(lineEnd!, times(parts()[index + 1]!).start) : lineEnd!;
      const box = track.getBoundingClientRect();
      if (![initial.start, initial.end, lower, upper].every(Number.isFinite) || box.width <= 0 || upper <= lower) return;
      event.preventDefault(); selected = index; refresh();
      const origin = event.clientX;
      const pointer = event.pointerId;
      handle.setPointerCapture(pointer);
      const move = (next: PointerEvent) => {
        if (next.pointerId !== pointer) return;
        const delta = Math.round((next.clientX - origin) / box.width * (lineEnd! - lineStart!));
        if (mode === "start") changeTime(index, clamp(initial.start + delta, lower, initial.end - 1), initial.end);
        else if (mode === "end") changeTime(index, initial.start, clamp(initial.end + delta, initial.start + 1, upper));
        else {
          const offset = clamp(delta, lower - initial.start, upper - initial.end);
          changeTime(index, initial.start + offset, initial.end + offset);
        }
      };
      const end = (next: PointerEvent) => {
        if (next.pointerId !== pointer) return;
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        handle.removeEventListener("lostpointercapture", end);
        if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
      handle.addEventListener("lostpointercapture", end);
    });
    handle.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const part = parts()[index];
      if (!timed || !part) return;
      event.preventDefault();
      selected = index;
      const current = times(part);
      const lower = index ? Math.max(lineStart!, times(parts()[index - 1]!).end) : lineStart!;
      const upper = index + 1 < parts().length ? Math.min(lineEnd!, times(parts()[index + 1]!).start) : lineEnd!;
      if (![current.start, current.end, lower, upper].every(Number.isFinite) || upper <= lower) return;
      const delta = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 100 : 10);
      if (mode === "start") changeTime(index, clamp(current.start + delta, lower, current.end - 1), current.end);
      else if (mode === "end") changeTime(index, current.start, clamp(current.end + delta, current.start + 1, upper));
      else {
        const offset = clamp(delta, lower - current.start, upper - current.end);
        changeTime(index, current.start + offset, current.end + offset);
      }
    });
  }
  function renderFragments(): void {
    fragmentList.replaceChildren(); tracks.replaceChildren(); rows = [];
    if (!parts().length) fragmentList.append(node("p", "ll-ve-empty", validSource ? "选择「重新分段」建立对应。" : "没有可绑定的原文音节。"));
    parts().forEach((part, index) => {
      const choice = button("", () => { selected = index; refresh(); });
      choice.className = "ll-ve-fragment";
      choice.style.setProperty("--ll-ve-color", color(index));
      const number = node("span", "ll-ve-number", String(index + 1));
      const text = node("span", "ll-ve-fragment-text", part.text || "（空片段）");
      const time = node("span", "ll-ve-fragment-time");
      choice.append(number, text, time); fragmentList.append(choice);
      const row = node("div", "ll-ve-track-row");
      row.style.setProperty("--ll-ve-color", color(index));
      const track = node("div", "ll-ve-track");
      const bar = node("div", "ll-ve-bar");
      const body = button(part.text || String(index + 1), () => { selected = index; refresh(); });
      body.className = "ll-ve-bar-body";
      body.setAttribute("aria-label", `移动片段 ${index + 1}：${part.text}，左右方向键调整 10 毫秒，Shift 调整 100 毫秒`);
      const left = button("", () => { selected = index; refresh(); });
      const right = button("", () => { selected = index; refresh(); });
      left.className = right.className = "ll-ve-handle";
      left.setAttribute("aria-label", `调整片段 ${index + 1} 开始时间`);
      right.setAttribute("aria-label", `调整片段 ${index + 1} 结束时间`);
      bar.append(left, body, right); track.append(bar);
      row.append(node("span", "ll-ve-track-number", String(index + 1)), track); tracks.append(row);
      drag(left, track, index, "start"); drag(right, track, index, "end"); drag(body, track, index, "move");
      rows.push({ index, choice, time, track, bar, body, left, right });
    });
  }
  function refresh(): void {
    selected = clamp(selected, 0, Math.max(0, parts().length - 1));
    const part = parts()[selected];
    detailCard.disabled = !validSource || !part;
    detailLegend.textContent = part ? `片段 ${selected + 1}` : "片段";
    const sync = (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
      if (document.activeElement !== input) input.value = value;
    };
    sync(textInput, draft.translatedText);
    sync(partText, part?.text ?? "");
    if (part) {
      sync(sourceStartInput, String(part.sourceStart)); sync(sourceEndInput, String(part.sourceEnd));
      sync(startInput, seconds(times(part).start)); sync(endInput, seconds(times(part).end));
    }
    startInput.disabled = endInput.disabled = resetTime.disabled = !timed;
    split.disabled = !part || boundaries(part.text).length === 0 || part.sourceEnd - part.sourceStart < 2;
    split.title = split.disabled ? "拆分需要至少两个原文音节和两个译文字符" : "在片段文字的光标处拆分";
    merge.disabled = !parts()[selected + 1];
    clear.disabled = !parts().length;
    chipButtons.forEach((chip, index) => {
      const owner = parts().findIndex(value => value.sourceStart <= index && index < value.sourceEnd);
      chip.style.setProperty("--ll-ve-color", owner < 0 ? "#a0a0a0" : color(owner));
      chip.dataset.mapped = String(owner >= 0);
      chip.setAttribute("aria-pressed", String(!!part && part.sourceStart <= index && index < part.sourceEnd));
      chip.disabled = !validSource || !part;
    });
    rows.forEach(row => {
      const value = parts()[row.index]!;
      const time = times(value);
      row.choice.setAttribute("aria-pressed", String(row.index === selected));
      row.choice.querySelector(".ll-ve-fragment-text")!.textContent = value.text || "（空片段）";
      row.time.textContent = `${seconds(time.start)} – ${seconds(time.end)} s`;
      row.body.textContent = value.text || String(row.index + 1);
      row.bar.dataset.selected = String(row.index === selected);
      const measurable = timed && Number.isFinite(time.start) && Number.isFinite(time.end) && time.end > time.start;
      row.left.disabled = row.right.disabled = row.body.disabled = !measurable;
      row.bar.hidden = !measurable;
      if (measurable) {
        const start = clamp((time.start - lineStart!) / (lineEnd! - lineStart!), 0, 1);
        const end = clamp((time.end - lineStart!) / (lineEnd! - lineStart!), start, 1);
        row.bar.style.left = `${start * 100}%`; row.bar.style.width = `${(end - start) * 100}%`;
        row.bar.title = `${value.text} · ${seconds(time.start)} – ${seconds(time.end)} s`;
      }
    });
    const error = validateVisualTranslation(line, draft);
    apply.disabled = !!error;
    status.textContent = error ?? (timed ? "已同步预览" : "译文与动画可编辑");
    status.dataset.error = String(!!error);
    textInput.setAttribute("aria-invalid", String(!!draft.alignment?.length && parts().map(value => value.text).join("") !== draft.translatedText));
    if (!error && !closed) preview.update(clone(draft));
  }

  textInput.addEventListener("input", () => { draft.translatedText = textInput.value; refresh(); });
  partText.addEventListener("input", () => {
    const part = parts()[selected];
    if (!part) return;
    part.text = partText.value;
    draft.translatedText = parts().map(value => value.text).join("");
    refresh();
  });
  sourceStartInput.addEventListener("change", () => {
    const part = parts()[selected];
    if (part) { part.sourceStart = Number(sourceStartInput.value); refresh(); }
  });
  sourceEndInput.addEventListener("change", () => {
    const part = parts()[selected];
    if (part) { part.sourceEnd = Number(sourceEndInput.value); refresh(); }
  });
  for (const [input, key] of [[startInput, "start"], [endInput, "end"]] as const) input.addEventListener("input", () => {
    const part = parts()[selected];
    if (!part) return;
    const current = times(part);
    const value = input.value === "" ? Number.NaN : Number(input.value) * 1000;
    changeTime(selected, key === "start" ? value : current.start, key === "end" ? value : current.end);
  });
  renderFragments(); refresh();
  return root;
}
