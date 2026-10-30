import { NativeMotionMirror } from "./native-motion-mirror";
import { bindNativeMotionSources } from "./native-motion-source";
import { buildTranslationTiming, translationProgressAt, type TranslationTiming } from "./translation-timing";
import { normalizeLyricText } from "./matcher";
import { textWithoutInjectedTranslation } from "./spicy-lyrics-source";
import type { LyricLine, TranslationLine } from "./types";

export interface VisualPreview {
  element: HTMLElement;
  update(translation: TranslationLine): void;
  destroy(): void;
}

const OMIT = "[data-lyric-layer-translation], .lyric-layer-translation, .slt-interleaved-translation, .slt-romanization-line, .slt-original-line, .slt-replace-line, .bg-line, .bg-word, .musical-line, .dot, script, style, button";
const SNAPSHOT_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-feature-settings",
  "font-variation-settings", "line-height", "letter-spacing", "word-spacing", "white-space", "direction", "text-align",
  "display", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "align-self", "order",
  "gap", "align-items", "justify-content", "vertical-align",
  "margin-left", "margin-right", "padding-left", "padding-right",
  "color", "-webkit-text-fill-color", "background-image", "background-size", "background-position",
  "background-repeat", "background-clip", "-webkit-background-clip", "text-shadow",
  "--gradient-alpha", "--gradient-alpha-end", "--gradient-color", "--BlurAmount", "--SLR_FadeWidth",
];

// The editor can be outside #SpicyLyricsPage; these are the same layout rules
// used by the renderer, scoped here so a modal needs no dependency on page CSS.
const PREVIEW_CSS = `
.lyric-layer-visual-preview { border:1px solid #ffffff26; border-radius:10px; padding:12px; min-width:0; color:inherit; }
.lyric-layer-visual-preview .ll-preview-heading { display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:13px; margin-bottom:8px; }
.lyric-layer-visual-preview .ll-preview-note { opacity:.7; font-size:12px; }
.lyric-layer-visual-preview .ll-preview-mode { display:flex; align-items:center; gap:6px; margin-left:auto; font-size:12px; }
.lyric-layer-visual-preview .ll-preview-mode[hidden] { display:none; }
.lyric-layer-visual-preview .ll-preview-stage { position:relative; display:block; width:100%; min-height:100px; padding:12px 6px; box-sizing:border-box; overflow:hidden; background:#0002; border-radius:6px; }
.lyric-layer-visual-preview .ll-preview-line { position:static!important; width:100%!important; max-width:100%!important; height:auto!important; margin:0!important; padding:0!important; opacity:1!important; visibility:visible!important; transform:none!important; scale:1!important; translate:none!important; rotate:none!important; filter:none!important; }
.lyric-layer-visual-preview .ll-preview-line, .lyric-layer-visual-preview .ll-preview-line * { animation:none!important; transition:none!important; }
.lyric-layer-visual-preview [data-ll-preview-source] { transform:none!important; scale:1!important; translate:none!important; rotate:none!important; position:static!important; opacity:1!important; visibility:visible!important; pointer-events:none!important; }
.lyric-layer-visual-preview [data-ll-preview-after]::after { content:""!important; margin-left:var(--ll-preview-after-left,0px)!important; margin-right:var(--ll-preview-after-right,0px)!important; }
.lyric-layer-visual-preview .ll-preview-translation { display:block!important; flex:0 0 100%; width:100%; min-width:0; margin-top:.35em; font-family:inherit; font-size:.74em; font-weight:inherit; font-style:inherit; line-height:1.35; letter-spacing:0; direction:ltr; overflow-wrap:anywhere; background:none!important; text-shadow:none!important; transform:none!important; scale:1!important; }
.lyric-layer-visual-preview .lyric-layer-segment, .lyric-layer-visual-preview .lyric-layer-motion-ink { display:inline-block; max-width:100%; white-space:pre-wrap; vertical-align:baseline; }
.lyric-layer-visual-preview .lyric-layer-segment[data-lyric-layer-native] { display:inline-grid; background:none!important; text-shadow:none!important; }
.lyric-layer-visual-preview .lyric-layer-segment[data-lyric-layer-native]::before { content:attr(data-lyric-layer-reserve); grid-area:1/1; font-size:1.05em; visibility:hidden; white-space:inherit; }
.lyric-layer-visual-preview .lyric-layer-segment[data-lyric-layer-native] > .lyric-layer-motion-ink { grid-area:1/1; justify-self:center; align-self:center; }
.lyric-layer-visual-preview .ll-preview-controls { display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; }
.lyric-layer-visual-preview .ll-preview-controls button { flex:0 0 auto; padding:5px 10px; border:1px solid #ffffff26; border-radius:6px; color:inherit; background:#ffffff0d; cursor:pointer; }
.lyric-layer-visual-preview .ll-preview-controls button:hover:not(:disabled) { background:#ffffff1f; }
.lyric-layer-visual-preview .ll-preview-controls input[type=range] { min-width:60px; flex:1; accent-color:#1ed760; }
.lyric-layer-visual-preview .ll-preview-time { flex:0 0 auto; min-width:82px; text-align:right; font-variant-numeric:tabular-nums; }
@media (prefers-reduced-motion:reduce) {
  .lyric-layer-visual-preview .lyric-layer-segment, .lyric-layer-visual-preview .lyric-layer-motion-ink { transform:none!important; scale:none!important; translate:none!important; rotate:none!important; text-shadow:none!important; }
}
`;

function finiteTime(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function previewLyric(line: LyricLine): { lyric: LyricLine; estimated: boolean } {
  if (line.syllables?.length) return { lyric: line, estimated: false };
  const startTime = finiteTime(line.startTime) ? line.startTime : 0;
  const endTime = finiteTime(line.endTime) && line.endTime > startTime ? line.endTime : startTime + 4000;
  // This virtual syllable exists only in the preview. It never changes the
  // editor's source or the stored alignment, and is visibly marked estimated.
  return { lyric: { ...line, startTime, endTime, syllables: [{ text: line.text, startTime, endTime }] }, estimated: true };
}

function findMountedLine(line: LyricLine): HTMLElement | undefined {
  const key = normalizeLyricText(line.text);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("#SpicyLyricsPage .SpicyLyricsScrollContainer .line:not(.bg-line):not(.musical-line)"))
    .filter(node => !node.closest(".lyric-layer-visual-preview") && normalizeLyricText(textWithoutInjectedTranslation(node)) === key);
  return candidates.find(node => node.querySelector("[data-lyric-layer-translation]")?.getAttribute("data-line-index") === String(line.index))
    ?? candidates.find(node => node.parentElement?.dataset.index === String(line.index)) ?? candidates[0];
}

function snapshotLine(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  originals.forEach((original, index) => {
    const copy = copies[index]!;
    const style = getComputedStyle(original);
    copy.removeAttribute("style");
    copy.removeAttribute("id");
    for (const attribute of Array.from(copy.attributes)) {
      if (/^on/i.test(attribute.name)) copy.removeAttribute(attribute.name);
    }
    for (const property of SNAPSHOT_PROPERTIES) {
      const value = style.getPropertyValue(property);
      // Computed flex children are blockified. Preserve their parent flex/inline
      // layout too, and freeze it against unrelated modal/ancestor selectors.
      if (value) copy.style.setProperty(property, value, "important");
    }
    if (original.matches(".word, .letterGroup")) {
      // Spicy's word spacing is an empty ::after with a 0.32ch margin, not a
      // text space. Its page-scoped selector does not follow the cloned DOM.
      const after = getComputedStyle(original, "::after");
      if (after.content === '""' || after.content === "''") {
        copy.dataset.llPreviewAfter = "true";
        copy.style.setProperty("--ll-preview-after-left", after.marginLeft, "important");
        copy.style.setProperty("--ll-preview-after-right", after.marginRight, "important");
      }
    }
    if (original.classList.contains("SpaceLetter")) {
      copy.style.setProperty("min-width", style.minWidth, "important");
    }
    copy.dataset.llPreviewSource = "true";
  });
  clone.querySelectorAll(OMIT).forEach(node => node.remove());
  clone.classList.remove("Sung", "Hidden", "NotSung");
  clone.classList.add("line", "Active", "ll-preview-line");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("padding", "0", "important");
  if (clone.style.display === "none") clone.style.setProperty("display", "flex", "important");
  return clone;
}

function fallbackLine(line: LyricLine, emphasis: boolean): HTMLElement {
  const root = document.createElement("div");
  root.className = "line Active ll-preview-line";
  root.style.display = "block";
  root.style.fontSize = "28px";
  root.style.fontWeight = "700";
  root.style.lineHeight = "1.3";
  root.style.color = "rgba(255, 255, 255, 0.9)";
  const sourcePage = document.querySelector<HTMLElement>("#SpicyLyricsPage");
  if (sourcePage) root.style.fontFamily = getComputedStyle(sourcePage).fontFamily;
  const words: string[] = [];
  line.syllables?.forEach((syllable, index) => {
    if (index > 0 && line.syllables![index - 1]!.isPartOfWord && words.length) words[words.length - 1] += syllable.text;
    else words.push(syllable.text);
  });
  words.forEach((text, index) => {
    if (index) root.appendChild(document.createTextNode(" "));
    const word = document.createElement("span");
    word.className = emphasis ? "letterGroup" : "word";
    word.dataset.llPreviewSource = "true";
    word.style.display = "inline-block";
    word.style.setProperty("--gradient-alpha", "0.9");
    word.style.setProperty("--gradient-alpha-end", "0.4");
    word.style.setProperty("--gradient-color", "255");
    word.style.setProperty("-webkit-text-fill-color", "transparent");
    word.style.backgroundImage = "linear-gradient(90deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.4) 100%)";
    word.style.backgroundClip = "text";
    word.style.setProperty("-webkit-background-clip", "text");
    if (emphasis) {
      for (const part of Array.from(text)) {
        const letter = document.createElement("span");
        letter.className = "letter";
        letter.textContent = part;
        letter.style.cssText = word.style.cssText;
        letter.dataset.llPreviewSource = "true";
        word.appendChild(letter);
      }
    } else word.textContent = text;
    root.appendChild(word);
  });
  return root;
}

/** A standalone clock and DOM tree: never seek, play, or read Spotify's player.
 * NativeMotionMirror remains the sole animation/spacing implementation here. */
export function createVisualPreview(options: { line: LyricLine; translation: TranslationLine }): VisualPreview {
  const element = document.createElement("section");
  element.className = "lyric-layer-visual-preview";
  element.setAttribute("aria-label", "歌词动画预览");
  const css = document.createElement("style");
  css.textContent = PREVIEW_CSS;
  const heading = document.createElement("div");
  heading.className = "ll-preview-heading";
  const title = document.createElement("strong");
  title.textContent = "动画预览";
  const note = document.createElement("span");
  note.className = "ll-preview-note";
  const modeLabel = document.createElement("label");
  modeLabel.className = "ll-preview-mode";
  modeLabel.appendChild(document.createTextNode("仅预览："));
  const mode = document.createElement("select");
  mode.setAttribute("aria-label", "近似预览动画类型，不保存");
  for (const [value, text] of [["word", "普通"], ["emphasis", "强调"]]) {
    const option = document.createElement("option");
    option.value = value!; option.textContent = text!; mode.appendChild(option);
  }
  modeLabel.appendChild(mode);
  heading.append(title, note, modeLabel);
  const stage = document.createElement("div");
  stage.className = "ll-preview-stage LyricsContainer";
  const controls = document.createElement("div");
  controls.className = "ll-preview-controls";
  const play = document.createElement("button");
  play.type = "button"; play.textContent = "播放";
  const replay = document.createElement("button");
  replay.type = "button"; replay.textContent = "重播";
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.step = "1"; slider.value = "0";
  slider.setAttribute("aria-label", "预览时间（毫秒），不改变歌曲播放位置");
  const clock = document.createElement("output");
  clock.className = "ll-preview-time";
  controls.append(play, replay, slider, clock);
  element.append(css, heading, stage, controls);

  const source = findMountedLine(options.line);
  const { lyric, estimated } = previewLyric(options.line);
  let template = source && snapshotLine(source);
  if (template && !bindNativeMotionSources(template, lyric).size) template = undefined;
  const approximate = !template || estimated;
  modeLabel.hidden = !!template;
  note.textContent = approximate ? `近似预览${estimated ? " · 整句时间估算" : " · 未取得当前原文样式"}` : "当前原文字体与动画类型";
  const modeSource = source ?? document.querySelector("#SpicyLyricsPage");
  if (modeSource?.closest(".SimpleLyricsMode")) stage.classList.add("SimpleLyricsMode");
  if (modeSource?.closest(".Exp_RefreshedSimpleLyrics")) stage.classList.add("Exp_RefreshedSimpleLyrics");

  let translation = options.translation;
  let timing: TranslationTiming | undefined;
  let mirror: NativeMotionMirror | undefined;
  let spans: HTMLElement[] = [];
  let start = finiteTime(lyric.startTime) ? lyric.startTime : lyric.syllables?.[0]?.startTime ?? 0;
  let end = finiteTime(lyric.endTime) ? lyric.endTime : lyric.syllables?.[lyric.syllables.length - 1]?.endTime ?? start + 4000;
  let position = start;
  let playing = false;
  let disposed = false;
  let attached = false;
  let frame: number | undefined;
  let anchorTime = 0;
  let anchorPosition = position;
  const cleanups: Array<() => void> = [];

  function listen(target: EventTarget, event: string, handler: EventListener): void {
    target.addEventListener(event, handler);
    cleanups.push(() => target.removeEventListener(event, handler));
  }
  function stop(): void {
    playing = false;
    play.textContent = "播放";
    play.setAttribute("aria-pressed", "false");
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  }
  function paint(): void {
    if (disposed || !element.isConnected) return;
    attached = true;
    slider.value = String(Math.round(position - start));
    clock.value = `${((position - start) / 1000).toFixed(2)} / ${((end - start) / 1000).toFixed(2)}s`;
    slider.setAttribute("aria-valuetext", `${((position - start) / 1000).toFixed(2)} 秒，共 ${((end - start) / 1000).toFixed(2)} 秒`);
    if (timing) {
      const progress = translationProgressAt(timing, position);
      timing.segments.forEach((segment, index) => {
        if (mirror?.segments[index]) return;
        const phase = Math.max(0, Math.min(1, (progress - segment.start) / (segment.end - segment.start)));
        spans[index]!.style.opacity = String(0.4 + phase * 0.6);
      });
    }
    const writes: Array<() => void> = [];
    mirror?.collect(position, new Map(), writes);
    writes.forEach(write => write());
  }
  function tick(now: number): void {
    frame = undefined;
    if (disposed || !playing) return;
    if (!element.isConnected) { if (attached) destroy(); else stop(); return; }
    position = Math.min(end, anchorPosition + Math.max(0, now - anchorTime));
    paint();
    if (position >= end) stop();
    else frame = requestAnimationFrame(tick);
  }
  function begin(): void {
    if (disposed || !timing) return;
    if (position >= end) position = start;
    anchorTime = performance.now(); anchorPosition = position;
    playing = true; play.textContent = "暂停"; play.setAttribute("aria-pressed", "true");
    paint();
    if (frame === undefined) frame = requestAnimationFrame(tick);
  }
  function rebuild(): void {
    const previewLine = template ? template.cloneNode(true) as HTMLElement : fallbackLine(lyric, mode.value === "emphasis");
    stage.replaceChildren(previewLine);
    const target = document.createElement("div");
    // Do not set data-lyric-layer-translation: the live renderer owns/removes
    // that marker globally, whereas this independent tree belongs to the modal.
    target.className = "lyric-layer-translation ll-preview-translation";
    target.setAttribute("aria-label", `译文：${translation.translatedText}`);
    timing = buildTranslationTiming(lyric, translation);
    mirror = undefined;
    spans = [];
    if (timing) {
      const fragment = document.createDocumentFragment();
      spans = timing.segments.map(segment => {
        const span = document.createElement("span");
        span.className = "lyric-layer-segment"; span.textContent = segment.text;
        span.setAttribute("aria-hidden", "true"); fragment.appendChild(span); return span;
      });
      mirror = new NativeMotionMirror(previewLine, lyric, timing, spans, fragment);
      target.appendChild(fragment);
      const starts = timing.cues.map(cue => cue.startTime).filter(finiteTime);
      const ends = timing.cues.map(cue => cue.endTime).filter(finiteTime);
      if (starts.length) start = Math.min(finiteTime(lyric.startTime) ? lyric.startTime : Infinity, ...starts);
      if (ends.length) end = Math.max(finiteTime(lyric.endTime) ? lyric.endTime : 0, ...ends, mirror.endTime);
    } else target.textContent = translation.translatedText;
    previewLine.appendChild(target);
    end = Math.max(start + 1, end);
    position = Math.max(start, Math.min(end, position));
    slider.max = String(end - start);
    slider.disabled = play.disabled = replay.disabled = !timing;
    if (playing) { anchorTime = performance.now(); anchorPosition = position; }
    paint();
  }
  function destroy(): void {
    if (disposed) return;
    disposed = true;
    stop();
    removalObserver.disconnect();
    resizeObserver?.disconnect();
    cleanups.splice(0).forEach(cleanup => cleanup());
    mirror = undefined; spans = [];
  }

  listen(play, "click", () => { if (playing) stop(); else begin(); });
  listen(replay, "click", () => { stop(); position = start; begin(); });
  listen(slider, "input", () => {
    stop();
    position = start + Math.max(0, Math.min(end - start, Number(slider.value) || 0));
    paint();
  });
  listen(mode, "change", () => rebuild());
  listen(document, "visibilitychange", () => { if (document.hidden) stop(); });
  if (document.fonts) listen(document.fonts, "loadingdone", () => paint());
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reducedMotion) listen(reducedMotion, "change", () => paint());
  const removalObserver = new MutationObserver(records => {
    if (element.isConnected) { if (!attached) paint(); }
    else if (attached || records.some(record => Array.from(record.removedNodes).some(node => node.contains(element)))) destroy();
  });
  removalObserver.observe(document.body, { childList: true, subtree: true });
  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => paint());
  resizeObserver?.observe(stage);
  rebuild();
  // The creator appends element after this function returns. A single initial
  // frame handles that insertion; paused previews schedule no animation loop.
  frame = requestAnimationFrame(now => { frame = undefined; if (playing) tick(now); else paint(); });
  return { element, update(next) { if (!disposed) { translation = next; rebuild(); } }, destroy };
}
