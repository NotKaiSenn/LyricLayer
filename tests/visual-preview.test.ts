import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import type { LyricLine, TranslationLine, TranslationMotionSettings } from "../src/types.ts";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/visual-preview.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "PreviewTest",
  plugins: [{ name: "preview-platform-fixture", setup(build) {
    build.onLoad({ filter: /[\\/]visual-preview\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nexport { snapshotLine as __snapshotLine };`, loader: "ts",
    }));
    build.onResolve({ filter: /^\.\/native-motion-mirror$/ }, () => ({ path: "mirror", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const NativeMotionMirror = globalThis.__Mirror;" }));
  } }],
});

class Style {
  values = new Map<string, string>();
  priorities = new Map<string, string>();
  cssText = "";
  setProperty(name: string, value: string, priority = "") { this.values.set(name, value); this.priorities.set(name, priority); }
  getPropertyValue(name: string) { return this.values.get(name) ?? ""; }
}

class NodeFixture extends EventTarget {
  parent?: NodeFixture;
  children: NodeFixture[] = [];
  dataset: Record<string, string> = {};
  className = "";
  style = new Style();
  attrs = new Map<string, string>();
  value = "";
  disabled = false;
  hidden = false;
  private text = "";
  readonly tag: string;
  constructor(tag: string) { super(); this.tag = tag; }
  classList = {
    add: (...names: string[]) => { this.className = [...new Set([...this.className.split(/\s+/), ...names])].join(" ").trim(); },
    contains: (name: string) => this.className.split(/\s+/).includes(name),
  };
  get isConnected(): boolean { return this.tag === "body" || !!this.parent?.isConnected; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(""); }
  set textContent(value: string) { this.replaceChildren(); this.text = value; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  appendChild(node: NodeFixture) {
    if (node.tag === "fragment") { [...node.children].forEach(child => this.appendChild(child)); return node; }
    node.remove(); node.parent = this; this.children.push(node); return node;
  }
  append(...nodes: NodeFixture[]) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren(...nodes: NodeFixture[]) {
    this.children.forEach(child => { child.parent = undefined; }); this.children = []; this.text = ""; this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = undefined;
  }
  contains(node: NodeFixture): boolean { return node === this || this.children.some(child => child.contains(node)); }
}

interface PreviewFixture {
  element: NodeFixture;
  update(translation: TranslationLine): void;
  destroy(): void;
}
function descendants(node: NodeFixture): NodeFixture[] {
  return [node, ...node.children.flatMap(descendants)];
}
function harness(line: LyricLine, translation: TranslationLine) {
  const body = new NodeFixture("body");
  const document = Object.assign(new EventTarget(), {
    body, hidden: false, fonts: new EventTarget(),
    createElement: (tag: string) => new NodeFixture(tag),
    createTextNode: (text: string) => { const node = new NodeFixture("text"); node.textContent = text; return node; },
    createDocumentFragment: () => new NodeFixture("fragment"),
    querySelector: () => null, querySelectorAll: () => [],
  });
  let now = 0, nextFrame = 0;
  const frames = new Map<number, (time: number) => void>();
  const observers: Array<{ callback: (records: unknown[]) => void; disconnected: boolean }> = [];
  const resizeObservers: Array<{ disconnected: boolean }> = [];
  const mirrors: Array<{ lyric: LyricLine; timing: { segments: unknown[]; cues: Array<{ startTime: number; endTime: number }>; motion?: TranslationMotionSettings }; positions: number[] }> = [];
  class Mirror {
    positions: number[] = [];
    segments: object[];
    endTime: number;
    readonly lyric: LyricLine;
    readonly timing: typeof mirrors[number]["timing"];
    constructor(_element: NodeFixture, lyric: LyricLine, timing: typeof mirrors[number]["timing"]) {
      this.lyric = lyric; this.timing = timing;
      this.segments = timing.segments.map(() => ({}));
      this.endTime = Math.max(...timing.cues.map(cue => cue.endTime));
      mirrors.push(this);
    }
    collect(position: number, _cache: Map<unknown, unknown>, writes: Array<() => void>) {
      writes.push(() => this.positions.push(position));
    }
  }
  const noPlayer = new Proxy({}, { get() { throw new Error("preview accessed Spotify player"); } });
  const context = {
    __Mirror: Mirror, document, window: { matchMedia: () => new EventTarget(), Spicetify: noPlayer }, Spicetify: noPlayer,
    performance: { now: () => now },
    requestAnimationFrame(callback: (time: number) => void) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    MutationObserver: class {
      disconnected = false;
      readonly callback: (records: unknown[]) => void;
      constructor(callback: (records: unknown[]) => void) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    ResizeObserver: class {
      disconnected = false;
      constructor() { resizeObservers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const { createVisualPreview } = (context as typeof context & {
    PreviewTest: { createVisualPreview(options: { line: LyricLine; translation: TranslationLine }): PreviewFixture };
  }).PreviewTest;
  const preview = createVisualPreview({ line, translation });
  const control = (tag: string, text?: string) => descendants(preview.element).find(node => node.tag === tag && (text === undefined || node.textContent === text))!;
  const play = control("button", "播放"), replay = control("button", "重播"), slider = control("input"), mode = control("select");
  const mount = () => { body.appendChild(preview.element); observers.forEach(observer => observer.callback([])); };
  const advance = (time: number) => {
    now = time;
    const queued = [...frames.entries()];
    queued.forEach(([id]) => frames.delete(id));
    queued.forEach(([, callback]) => callback(now));
  };
  const remove = () => {
    preview.element.remove();
    observers.filter(observer => !observer.disconnected).forEach(observer => observer.callback([{ removedNodes: [preview.element] }]));
  };
  return { preview, mirrors, frames, observers, resizeObservers, play, replay, slider, mode, mount, advance, remove };
}

const line: LyricLine = { index: 0, text: "Hello world", startTime: 1000, endTime: 3000, syllables: [
  { text: "Hello", startTime: 1000, endTime: 2000 }, { text: "world", startTime: 2000, endTime: 3000 },
] };

test("预览使用独立绝对时间，暂停拖动和重播不访问播放器", () => {
  const h = harness(line, { translatedText: "你好世界" });
  h.mount(); h.advance(0);
  h.play.dispatchEvent(new Event("click"));
  h.advance(500);
  assert.equal(h.mirrors[0]!.positions.at(-1), 1500);
  assert.equal(h.slider.value, "500");
  h.play.dispatchEvent(new Event("click"));
  assert.equal(h.frames.size, 0);
  h.slider.value = "175"; h.slider.dispatchEvent(new Event("input"));
  assert.equal(h.mirrors[0]!.positions.at(-1), 1175);
  h.preview.update({ translatedText: "世界你好" });
  assert.equal(h.mirrors.length, 2);
  assert.equal(h.mirrors[1]!.positions.at(-1), 1175);
  assert.equal(h.slider.value, "175");
  h.replay.dispatchEvent(new Event("click"));
  assert.equal(h.mirrors[1]!.positions.at(-1), 1000);
  h.advance(2500);
  assert.equal(h.mirrors[1]!.positions.at(-1), 3000);
  assert.equal(h.play.textContent, "播放");
  assert.equal(h.frames.size, 0);
  h.preview.destroy();
});

test("初始化帧尚未执行时点击播放仍会继续推进", () => {
  const h = harness(line, { translatedText: "你好" });
  h.mount(); h.play.dispatchEvent(new Event("click")); h.advance(100);
  assert.equal(h.mirrors[0]!.positions.at(-1), 1100);
  assert.equal(h.frames.size, 1);
  h.preview.destroy();
  assert.equal(h.frames.size, 0);
});

test("手动片段时间与动画参数经真实 timing builder 传入预览镜像", () => {
  const translation: TranslationLine = { translatedText: "你好世界", motion: { amplitude: 1.6, stagger: 0.2, settleMs: 250 }, alignment: [
    { sourceStart: 0, sourceEnd: 1, text: "你好", startTime: 1100, endTime: 1800 },
    { sourceStart: 1, sourceEnd: 2, text: "世界", startTime: 2100, endTime: 2800 },
  ] };
  const h = harness(line, translation);
  h.mount(); h.advance(0);
  const timing = h.mirrors[0]!.timing;
  assert.deepEqual(JSON.parse(JSON.stringify(timing.motion)), translation.motion);
  assert.deepEqual(JSON.parse(JSON.stringify(timing.cues.map(cue => [cue.startTime, cue.endTime]))), [[1100, 1800], [2100, 2800]]);
  h.preview.destroy();
});

test("移除预览自动停止帧和观察器，移除后不再响应控制或更新", () => {
  const h = harness(line, { translatedText: "你好" });
  h.mount(); h.play.dispatchEvent(new Event("click")); h.advance(10); h.remove();
  const count = h.mirrors.length;
  assert.equal(h.frames.size, 0);
  assert.ok(h.observers.every(observer => observer.disconnected));
  assert.ok(h.resizeObservers.every(observer => observer.disconnected));
  h.play.dispatchEvent(new Event("click"));
  h.preview.update({ translatedText: "更改" });
  assert.equal(h.mirrors.length, count);
  assert.equal(h.frames.size, 0);
  h.preview.destroy();
});

test("首次绘制前被移除也会清理初始化帧", () => {
  const h = harness(line, { translatedText: "你好" });
  h.remove();
  assert.equal(h.frames.size, 0);
  assert.ok(h.observers.every(observer => observer.disconnected));
});

test("无原始音节时明确标注估算，普通或强调只影响预览且不修改输入", () => {
  const source: LyricLine = { index: 1, text: "A held word" };
  const translation = { translatedText: "延长的字" };
  const sourceBefore = JSON.stringify(source), translationBefore = JSON.stringify(translation);
  const h = harness(source, translation);
  h.mount(); h.advance(0);
  assert.ok(h.preview.element.textContent.includes("近似预览 · 整句时间估算"));
  assert.equal(h.mirrors[0]!.lyric.syllables!.length, 1);
  assert.equal(h.mirrors[0]!.lyric.endTime, 4000);
  h.mode.value = "emphasis"; h.mode.dispatchEvent(new Event("change"));
  assert.ok(descendants(h.preview.element).some(node => node.className === "letter"));
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(translation), translationBefore);
  h.preview.destroy();
});

test("真实 flex 行保留 blockified 词和强调词组的布局，带回页面外丢失的词间距", () => {
  class SnapshotNode {
    style = new Style();
    dataset: Record<string, string> = {};
    attributes: Array<{ name: string }> = [];
    children: SnapshotNode[] = [];
    className = "";
    computed: Record<string, string> = {};
    after = { content: "none", marginLeft: "0px", marginRight: "0px" };
    classList = {
      contains: (name: string) => this.className.split(/\s+/).includes(name),
      add: (...names: string[]) => { this.className = [...new Set([...this.className.split(/\s+/), ...names])].join(" ").trim(); },
      remove: (...names: string[]) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(" "); },
    };
    matches(selector: string) { return selector.split(",").some(part => this.classList.contains(part.trim().slice(1))); }
    removeAttribute() {}
    querySelectorAll(selector: string): SnapshotNode[] {
      return selector === "*" ? this.children.flatMap(child => [child, ...child.querySelectorAll("*")]) : [];
    }
    cloneNode(): SnapshotNode {
      const copy = new SnapshotNode(); copy.className = this.className;
      copy.children = this.children.map(child => child.cloneNode()); return copy;
    }
  }
  const source = new SnapshotNode();
  source.className = "line Sung";
  source.computed = { display: "flex", "flex-wrap": "wrap", "font-size": "50px", "column-gap": "0px" };
  const word = new SnapshotNode(); word.className = "word";
  word.computed = { display: "block", "font-size": "50px" };
  word.after = { content: '""', marginLeft: "0px", marginRight: "8px" };
  const group = new SnapshotNode(); group.className = "letterGroup";
  group.computed = { display: "block", "font-size": "50px" };
  const letter = new SnapshotNode(); letter.className = "letter SpaceLetter";
  letter.computed = { display: "inline-block", "white-space": "pre", "min-width": "7.5px" };
  group.children.push(letter); source.children.push(word, group);
  const context = { __Mirror: class {}, getComputedStyle: (node: SnapshotNode, pseudo?: string) => pseudo ? node.after : {
    getPropertyValue: (name: string) => node.computed[name] ?? "", minWidth: node.computed["min-width"] ?? "auto",
  } };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const copy = (context as typeof context & { PreviewTest: { __snapshotLine(node: SnapshotNode): SnapshotNode } }).PreviewTest.__snapshotLine(source);
  assert.equal(copy.style.getPropertyValue("display"), "flex");
  assert.equal(copy.style.getPropertyValue("flex-wrap"), "wrap");
  assert.equal(copy.style.getPropertyValue("font-size"), "50px");
  assert.equal(copy.style.priorities.get("display"), "important");
  assert.equal(copy.children[0]!.style.getPropertyValue("display"), "block");
  assert.equal(copy.children[0]!.style.getPropertyValue("--ll-preview-after-right"), "8px");
  assert.equal(copy.children[1]!.children[0]!.style.getPropertyValue("min-width"), "7.5px");
  assert.ok(copy.classList.contains("Active") && !copy.classList.contains("Sung"));
  // Root display must remain the captured value rather than being overwritten
  // by a stronger preview stylesheet rule, the cause of one-word-per-row.
  assert.doesNotMatch(bundle.outputFiles[0]!.text, /\.ll-preview-line\s*\{\s*display:\s*block\s*!important/);
});
