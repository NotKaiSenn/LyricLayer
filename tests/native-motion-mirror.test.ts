import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { buildTranslationTiming } from "../src/translation-timing.ts";
import { parseJson } from "../src/parsers.ts";
import type { TranslationTiming } from "../src/translation-timing.ts";
import type { LyricLine } from "../src/types.ts";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/native-motion-mirror.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "NativeMotionTest",
  plugins: [{
    name: "controlled-native-bindings",
    setup(build) {
      build.onResolve({ filter: /^\.\/native-motion-source$/ }, () => ({ path: "source", namespace: "fixture" }));
      build.onResolve({ filter: /^\.\/motion-layout$/ }, () => ({ path: "layout", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "layout"
        ? "export const measureMotionLayout = (container, ink) => globalThis.__measureMotionLayout(container, ink);"
        : "export const bindNativeMotionSources = () => globalThis.__motionBindings;" }));
    },
  }],
});

type Event = { kind: "read" | "measure" | "write"; node: NodeFixture; property?: string };
class StyleFixture {
  values = new Map<string, string>();
  private node: NodeFixture;
  private events: Event[];
  constructor(node: NodeFixture, events: Event[]) { this.node = node; this.events = events; }
  getPropertyValue(property: string) { return this.values.get(property) ?? ""; }
  setProperty(property: string, value: string) {
    this.events.push({ kind: "write", node: this.node, property });
    this.values.set(property, value);
  }
}

// Native selection and glyph measurement are injected independently. The actual
// solver operates on these controlled boxes; browser layout is verified in QA.
class NodeFixture {
  children: NodeFixture[] = [];
  parent?: NodeFixture;
  dataset: Record<string, string> = {};
  className = "";
  classList = { contains: (name: string) => this.className.split(/\s+/).includes(name) };
  isConnected = true;
  style: StyleFixture;
  readonly name: string;
  private text = "";
  constructor(name: string, events: Event[]) { this.name = name; this.style = new StyleFixture(this, events); }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(""); }
  set textContent(value: string) { this.replaceChildren(); this.text = value; }
  appendChild(child: NodeFixture) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    this.children.push(child);
    return child;
  }
  replaceChildren() {
    this.children.forEach(child => { child.parent = undefined; });
    this.children = [];
    this.text = "";
  }
  contains(node: NodeFixture): boolean { return node === this || this.children.some(child => child.contains(node)); }
  closest(selector: string): NodeFixture | null {
    const name = selector.startsWith(".") ? selector.slice(1) : "";
    return this.classList.contains(name) ? this : this.parent?.closest(selector) ?? null;
  }
}

interface Binding {
  element: NodeFixture;
  letters: NodeFixture[];
  letterStart: number;
  letterEnd: number;
  ancestors: NodeFixture[];
}
interface MotionLayoutFixture {
  rects: Array<{ left: number; right: number; top: number; bottom: number }>;
  originX: number;
  originY: number;
  pxPerEmX: number;
  pxPerEmY: number;
}
interface MirrorFixture {
  count: number;
  endTime: number;
  nodes: Set<NodeFixture>;
  segments: Array<{ groups: NodeFixture[]; ink: NodeFixture; container: NodeFixture } | undefined>;
  collect(position: number | undefined, cache: Map<unknown, unknown>, writes: Array<() => void>): void;
  isValid(): boolean;
}

function harness() {
  const events: Event[] = [];
  const bindings = new Map<number, Binding>();
  const layouts = new Map<NodeFixture, MotionLayoutFixture | undefined>();
  const computed = new Map<NodeFixture, Record<string, string>>();
  const node = (name: string, values: Record<string, string> = {}) => {
    const result = new NodeFixture(name, events);
    computed.set(result, { width: "100px", height: "40px", "box-sizing": "border-box", "transform-origin": "50px 20px", ...values });
    return result;
  };
  const line = node("native-line");
  line.className = "Active";
  const fragment = node("target-fragment");
  let created = 0;
  const context = {
    __motionBindings: bindings,
    __measureMotionLayout: (container: NodeFixture) => {
      events.push({ kind: "measure", node: container });
      const value = layouts.get(container);
      assert.ok(layouts.has(container), "every mounted target has an explicit measurement result");
      return value;
    },
    document: { createElement: (tag: string) => node(`${tag}-${++created}`) },
    getComputedStyle: (source: NodeFixture) => {
      assert.ok(line.contains(source), "computed styles are read only from the original lyric tree");
      events.push({ kind: "read", node: source });
      const values = computed.get(source)!;
      return {
        getPropertyValue: (property: string) => values[property] ?? "",
        transformOrigin: values["transform-origin"], boxSizing: values["box-sizing"],
      };
    },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const { NativeMotionMirror } = (context as typeof context & {
    NativeMotionTest: { NativeMotionMirror: new (...args: unknown[]) => MirrorFixture };
  }).NativeMotionTest;
  const bind = (index: number, element: NodeFixture, letters: NodeFixture[] = [], ancestors: NodeFixture[] = []) => {
    bindings.set(index, { element, letters, letterStart: 0, letterEnd: letters.length, ancestors });
  };
  const mount = (lyric: LyricLine, timing: TranslationTiming) => {
    const spans = timing.segments.map((segment, index) => {
      const span = node(`translation-${index}`);
      span.textContent = segment.text;
      fragment.appendChild(span);
      layouts.set(span, { rects: [{ left: index * 100, right: index * 100 + 30, top: 0, bottom: 40 }],
        originX: index * 100 + 15, originY: 20, pxPerEmX: 30, pxPerEmY: 30 });
      return span;
    });
    const mirror = new NativeMotionMirror(line, lyric, timing, spans, fragment);
    return { mirror, spans };
  };
  return { node, line, fragment, events, computed, layouts, bind, mount };
}

const lyric = (texts: string[]): LyricLine => ({ index: 0, text: texts.join(" "), syllables: texts.map((text, index) => ({
  text, startTime: index * 1000, endTime: index * 1000 + 800,
})) });
const timingFor = (source: LyricLine, translatedText: string) => buildTranslationTiming(source, { translatedText })!;
function paint(mirror: MirrorFixture, position = 0) {
  const writes: Array<() => void> = [];
  mirror.collect(position, new Map(), writes);
  writes.forEach(write => write());
}

const transparentInk = {
  "-webkit-text-fill-color": "rgba(0, 0, 0, 0)",
  "--gradient-alpha": "0.91", "--gradient-alpha-end": "0.36",
};
const scales = (mirror: MirrorFixture) => mirror.segments.map(segment =>
  Number(segment!.groups[0]!.style.getPropertyValue("scale")));
const phases = (mirror: MirrorFixture) => mirror.segments.map(segment =>
  Number(segment!.container.dataset.lyricLayerPhase));
const motionPhases = (mirror: MirrorFixture) => mirror.segments.map(segment =>
  Number(segment!.container.dataset.lyricLayerMotionPhase));
function peakTimes(mirror: MirrorFixture, until: number, step: number) {
  const peaks = mirror.segments.map(() => ({ time: 0, scale: -Infinity }));
  for (let position = 0; position <= until; position += step) {
    paint(mirror, position);
    scales(mirror).forEach((scale, index) => {
      if (scale > peaks[index]!.scale) peaks[index] = { time: position, scale };
    });
  }
  return peaks.map(peak => peak.time);
}

test("同一原词的相邻译字各自启动、到达峰值并高亮，没有共享运动容器", () => {
  const run = harness();
  const source = lyric(["daylight"]);
  const word = run.line.appendChild(run.node("word", { ...transparentInk, scale: "1.13", transform: "matrix(1, 0, 0, 1, 0, -6)" }));
  run.bind(0, word);
  const { mirror, spans } = run.mount(source, timingFor(source, "晨光"));
  assert.equal(mirror.count, 2);
  assert.deepEqual(run.fragment.children, spans);
  assert.equal(mirror.segments[0]!.groups[0], mirror.segments[0]!.ink);
  assert.equal(mirror.segments[1]!.groups[0], mirror.segments[1]!.ink);
  assert.deepEqual(spans.map(span => span.dataset.lyricLayerReserve), ["晨", "光"]);
  assert.notEqual(mirror.segments[0]!.groups[0], mirror.segments[1]!.groups[0]);
  assert.equal(run.fragment.textContent, "晨光");
  paint(mirror, 200);
  assert.deepEqual(phases(mirror), [0.5, 0]);
  assert.notEqual(...scales(mirror) as [number, number]);
  const firstFill = mirror.segments[0]!.ink.style.getPropertyValue("background-image");
  const waitingFill = mirror.segments[1]!.ink.style.getPropertyValue("background-image");
  assert.notEqual(firstFill, waitingFill);
  assert.match(firstFill, /0\.91\) 40\.000%/);
  assert.match(waitingFill, /0\.91\) -20\.000%/);
  for (const span of spans) {
    assert.equal(span.style.getPropertyValue("scale"), "", "the outer reserved box never scales");
    assert.equal(span.style.getPropertyValue("transform"), "", "the outer reserved box never moves");
  }
  paint(mirror, 600);
  assert.deepEqual(phases(mirror), [1, 0.5]);
  const [firstPeak, secondPeak] = peakTimes(mirror, 2500, 10);
  assert.ok(secondPeak! > firstPeak!, "independent stagger shifts the peaks instead of replaying one shared pose");
});

test("三秒长音映射六个译字独立错开启动，重叠运动且逐帧连续", () => {
  const run = harness();
  const source: LyricLine = { index: 0, text: "oh", syllables: [{ text: "oh", startTime: 1000, endTime: 4000 }] };
  const group = run.line.appendChild(run.node("letter-group", { scale: "1.05" }));
  const letters = ["o", "h"].map((text, index) => group.appendChild(run.node(text, {
    ...transparentInk, "transform-origin": `${25 + index * 50}px 20px`,
  })));
  run.bind(0, group, letters);
  const { mirror, spans } = run.mount(source, timingFor(source, "晨光照亮了你"));
  assert.equal(mirror.count, 6);
  assert.deepEqual(run.fragment.children, spans);
  assert.equal(new Set(mirror.segments.map(segment => segment!.groups[0])).size, 6);
  for (let index = 0; index < 6; index++) {
    const start = 1000 + index * 200;
    paint(mirror, start);
    assert.equal(scales(mirror)[index], 1);
    assert.equal(motionPhases(mirror)[index], 0);
    paint(mirror, start + 80);
    assert.notEqual(scales(mirror)[index], 1, "each glyph starts its own native response");
    if (index < 5) assert.equal(motionPhases(mirror)[index + 1], 0);
  }
  paint(mirror, 2200);
  assert.equal(new Set(motionPhases(mirror)).size, 6);
  assert.ok(scales(mirror).every(scale => scale !== 1), "letters overlap in motion instead of taking turns doing complete short bounces");
  assert.deepEqual(phases(mirror), [1, 1, 0.4, 0, 0, 0], "fill retains the original independent character windows");
  for (const segment of mirror.segments.slice(3)) {
    assert.match(segment!.ink.style.getPropertyValue("text-shadow"), /, 0\.000%\)$/, "future legacy glyphs move without glowing white before their fill");
  }
  assert.equal(mirror.segments[0]!.ink.style.getPropertyValue("transform-origin"), "50% 50%");
  assert.equal(mirror.segments[5]!.ink.style.getPropertyValue("transform-origin"), "50% 50%");
  const peaks = peakTimes(mirror, 4000, 10);
  for (let index = 1; index < peaks.length; index++) assert.ok(peaks[index]! > peaks[index - 1]!);
  let previous = [1, 1, 1, 1, 1, 1];
  let maxStep = 0;
  let maxScale = 1;
  for (let time = 1000; time <= 4000; time += 1000 / 60) {
    paint(mirror, time);
    const current = scales(mirror);
    current.forEach((scale, index) => { maxStep = Math.max(maxStep, Math.abs(scale - previous[index]!)); });
    maxScale = Math.max(maxScale, ...current);
    previous = current;
  }
  assert.ok(maxStep < 0.025, `60Hz scale steps stay smooth: ${maxStep}`);
  assert.ok(maxScale > 1.2, "smoothing the time base must not flatten the roomy native emphasis");
  paint(mirror, 4000);
  assert.deepEqual(scales(mirror), [1, 1, 1, 1, 1, 1]);
});

test("填色结束不强制截断长音动作，所有模式在真实源末严格归位", () => {
  for (const mode of ["", " SimpleLyricsMode", " SimpleLyricsMode Exp_RefreshedSimpleLyrics"]) {
    const run = harness();
    run.line.className += mode;
    const source: LyricLine = { index: 0, text: "hold", syllables: [{ text: "hold", startTime: 1000, endTime: 7000 }] };
    const group = run.line.appendChild(run.node("long-native-word"));
    const letter = group.appendChild(run.node("long-native-letter", transparentInk));
    run.bind(0, group, [letter]);
    const { mirror, spans } = run.mount(source, timingFor(source, "晨光照亮了你"));
    assert.equal(mirror.endTime, 7000, "the animation scheduler ends with the lyric rather than adding another source duration");
    const pose = (index: number) => {
      const ink = mirror.segments[index]!.ink;
      return [ink.style.getPropertyValue("transform"), ink.style.getPropertyValue("scale"), ink.style.getPropertyValue("text-shadow")];
    };
    paint(mirror, 999);
    const neutral = pose(0);
    for (let index = 0; index < 5; index++) {
      paint(mirror, 2000 + index * 1000);
      assert.equal(phases(mirror)[index], 1);
      assert.notDeepEqual(pose(index), neutral, "a filled glyph keeps its source-word motion instead of snapping back at fillEnd");
      assert.equal(spans[index]!.style.getPropertyValue("transform"), "");
      assert.equal(spans[index]!.style.getPropertyValue("scale"), "");
    }
    paint(mirror, 7000);
    for (let index = 0; index < 6; index++) assert.deepEqual(pose(index), neutral);
    paint(mirror, 12000);
    for (let index = 0; index < 6; index++) assert.deepEqual(pose(index), neutral);
    paint(mirror, 1500);
    assert.notDeepEqual(pose(0), neutral, "backward seeking reconstructs the active glyph after the line has finished");
  }
});

test("预留尺寸保留每段原译文，标点空白和组合字符不重复出现在文本中", () => {
  const run = harness();
  const source = lyric(["song"]);
  const word = run.line.appendChild(run.node("word", transparentInk));
  run.bind(0, word);
  const text = "晨光， Á 👨‍👩‍👧‍👦\n";
  const timing = timingFor(source, text);
  const { mirror, spans } = run.mount(source, timing);
  assert.equal(run.fragment.textContent, text);
  for (const [index, span] of spans.entries()) {
    assert.equal(span.dataset.lyricLayerReserve, timing.segments[index]!.text);
    assert.equal(span.textContent, timing.segments[index]!.text);
    assert.equal(span.children.length, 1, "a CSS-only reserve does not duplicate real text nodes");
    assert.equal(span.children[0], mirror.segments[index]!.ink);
  }
  paint(mirror, 400);
  assert.equal(run.fragment.textContent, text);
});

test("多个源音节绑定同一DOM词节点，译字仍按音节与字内区间分别启动", () => {
  const run = harness();
  const source = lyric(["sun", "set"]);
  const joined = run.line.appendChild(run.node("joined-word", transparentInk));
  run.bind(0, joined); run.bind(1, joined);
  const { mirror, spans } = run.mount(source, timingFor(source, "甲乙丙丁"));
  paint(mirror, 1100);
  assert.deepEqual(phases(mirror), [1, 1, 0.25, 0]);
  assert.deepEqual(mirror.segments.map(segment => segment!.ink.dataset.lyricLayerSource), ["0", "0", "1", "1"]);
  assert.equal(new Set(spans).size, 4);
  assert.notEqual(scales(mirror)[2], scales(mirror)[3]);
  assert.notEqual(mirror.segments[2]!.ink.style.getPropertyValue("background-image"),
    mirror.segments[3]!.ink.style.getPropertyValue("background-image"));
  assert.equal(run.events.filter(event => event.kind === "read").length, 1);
});

test("多源片段使用自己的运动层，跳转后重新选择对应源节点的颜色", () => {
  const run = harness();
  const source = lyric(["a", "b", "c"]);
  const phrase = run.line.appendChild(run.node("phrase"));
  for (let index = 0; index < 3; index++) run.bind(index,
    phrase.appendChild(run.node(`word-${index}`, { scale: String(1 + index / 10) })), [], [phrase]);
  const timing: TranslationTiming = { method: "weighted",
    segments: [{ text: "first ", start: 0, end: 0.6 }, { text: "second", start: 0.6, end: 1 }],
    cues: [
      { sourceIndex: 0, startTime: 0, endTime: 800, start: 0, end: 0.3 },
      { sourceIndex: 1, startTime: 1000, endTime: 1800, start: 0.3, end: 0.8 },
      { sourceIndex: 2, startTime: 2000, endTime: 2800, start: 0.8, end: 1 },
    ],
  };
  const { mirror } = run.mount(source, timing);
  const first = mirror.segments[0]!;
  const second = mirror.segments[1]!;
  assert.notEqual(first.groups[0], second.groups[0]);
  assert.equal(first.groups.length, 1);
  assert.equal(second.groups.length, 1);
  paint(mirror, 2500);
  assert.equal(first.ink.dataset.lyricLayerSource, "1");
  assert.equal(second.ink.dataset.lyricLayerSource, "2");
  paint(mirror, 500);
  assert.equal(first.ink.dataset.lyricLayerSource, "0");
  assert.equal(second.ink.dataset.lyricLayerSource, "1");
});

test("一帧先捕获全部源样式再写译文，同一源节点只读取一次", () => {
  const run = harness();
  const source = lyric(["one", "two"]);
  const first = run.line.appendChild(run.node("first", { scale: "1.2" }));
  const second = run.line.appendChild(run.node("second", { scale: "1.3" }));
  run.bind(0, first); run.bind(1, second);
  const { mirror } = run.mount(source, timingFor(source, "甲乙丙丁"));
  const writes: Array<() => void> = [];
  mirror.collect(1500, new Map(), writes);
  assert.ok(run.events.every(event => event.kind !== "write"), "all source and geometry reads precede every write");
  assert.deepEqual(run.events.filter(event => event.kind === "read").map(event => event.node), [first, second]);
  assert.equal(run.events.filter(event => event.kind === "measure").length, 4);
  const readCount = run.events.length;
  assert.equal(writes.length, 4);
  writes.forEach(write => write());
  assert.ok(run.events.length > readCount);
  assert.ok(run.events.slice(readCount).every(event => event.kind === "write" && !run.line.contains(event.node)));
  run.events.length = 0;
  paint(mirror, 1500);
  assert.ok(run.events.every(event => event.kind !== "write"), "unchanged target styles are not written again");
  assert.deepEqual(run.events.filter(event => event.kind === "read").map(event => event.node), [first, second]);
});

test("字间有余量时保留原强调幅度，窄间距才限制相邻字且不改变截止时间", () => {
  const run = harness();
  const source: LyricLine = { index: 0, text: "hold", syllables: [{ text: "hold", startTime: 1000, endTime: 7000 }] };
  const group = run.line.appendChild(run.node("held-word"));
  const letter = group.appendChild(run.node("held-letter", transparentInk));
  run.bind(0, group, [letter]);
  const { mirror, spans } = run.mount(source, timingFor(source, "晨光"));
  paint(mirror, 5000);
  const roomyScale = scales(mirror)[0]!;
  const roomyFill = mirror.segments[0]!.ink.style.getPropertyValue("background-image");
  const roomyPhase = phases(mirror)[0];
  assert.ok(roomyScale > 1.15, "a free glyph must keep its original emphasis instead of a fixed 3.5% limit");
  assert.equal(roomyScale, Number(spans[0]!.dataset.lyricLayerRequestedScale));
  assert.equal(Number(spans[0]!.dataset.lyricLayerMotionGain), 1);

  run.layouts.set(spans[1]!, { rects: [{ left: 33, right: 63, top: 0, bottom: 40 }],
    originX: 48, originY: 20, pxPerEmX: 30, pxPerEmY: 30 });
  paint(mirror, 5000);
  const narrowScale = scales(mirror)[0]!;
  assert.ok(narrowScale > 1.035 && narrowScale < roomyScale,
    "even a constrained glyph uses its remaining space rather than a fixed cap or an all-or-nothing switch");
  assert.equal(phases(mirror)[0], roomyPhase);
  assert.equal(mirror.segments[0]!.ink.style.getPropertyValue("background-image"), roomyFill);
  assert.equal(mirror.endTime, 7000);
  for (const span of spans) {
    assert.equal(span.style.getPropertyValue("transform"), "");
    assert.equal(span.style.getPropertyValue("scale"), "");
  }
  // CSS individual scale is composed outside translate, so undo that scale to
  // recover the effective centre offset used by the geometric solver.
  const transformed = (index: number) => {
    const segment = mirror.segments[index]!;
    const geometry = run.layouts.get(spans[index]!)!;
    const scale = Number(segment.ink.style.getPropertyValue("scale"));
    const translate = segment.ink.style.getPropertyValue("transform").match(/translate\(([-.\d]+)em,\s*([-.\d]+)em\)/)!;
    const dx = Number(translate[1]) * geometry.pxPerEmX * scale;
    const rect = geometry.rects[0]!;
    return { left: geometry.originX + (rect.left - geometry.originX) * scale + dx,
      right: geometry.originX + (rect.right - geometry.originX) * scale + dx };
  };
  assert.ok(transformed(0).right <= transformed(1).left + 1e-4, "the rendered glyph boxes do not intersect");

  paint(mirror, 7000);
  assert.equal(scales(mirror)[0], 1, "a constrained glyph is neutral at its source's exact endpoint");
  assert.equal(phases(mirror)[0], 1);
  run.layouts.set(spans[1]!, { rects: [{ left: 100, right: 130, top: 0, bottom: 40 }],
    originX: 115, originY: 20, pxPerEmX: 30, pxPerEmY: 30 });
  paint(mirror, 5000);
  assert.equal(scales(mirror)[0], roomyScale, "resizing to make room restores the full pose without replaying history");
  paint(mirror, 7000);
  assert.deepEqual(scales(mirror), [1, 1]);
});

test("可见但无法测量的译字仍作为障碍物，隐藏字不占用动画空间", () => {
  const run = harness();
  const source: LyricLine = { index: 0, text: "hold", syllables: [{ text: "hold", startTime: 1000, endTime: 7000 }] };
  const group = run.line.appendChild(run.node("held-word"));
  const letter = group.appendChild(run.node("held-letter", transparentInk));
  run.bind(0, group, [letter]);
  const { mirror, spans } = run.mount(source, timingFor(source, "晨光"));
  const fallbackInk = mirror.segments[1]!.ink;
  run.layouts.set(spans[1]!, undefined);
  let visible = false;
  Object.assign(fallbackInk, { getBoundingClientRect: () => {
    run.events.push({ kind: "measure", node: fallbackInk });
    return visible ? { left: 31.5, right: 61.5, top: 0, bottom: 40, width: 30, height: 40 }
      : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  } });
  paint(mirror, 5000);
  const unconstrained = scales(mirror)[0]!;
  assert.equal(unconstrained, Number(spans[0]!.dataset.lyricLayerRequestedScale), "zero-size fallback boxes are ignored");
  assert.ok(unconstrained > 1.15);

  visible = true;
  run.events.length = 0;
  const writes: Array<() => void> = [];
  mirror.collect(5000, new Map(), writes);
  assert.ok(run.events.some(event => event.kind === "measure" && event.node === fallbackInk));
  assert.ok(run.events.every(event => event.kind !== "write"), "fallback bounds are also captured before writes");
  writes.forEach(write => write());
  const limited = scales(mirror)[0]!;
  assert.ok(limited > 1 && limited < unconstrained, "the visible unmeasurable neighbour limits the active glyph");
  const transform = mirror.segments[0]!.ink.style.getPropertyValue("transform");
  const x = Number(transform.match(/translate\(([-.\d]+)em,/)![1]) * 30 * limited;
  assert.ok(15 + 15 * limited + x <= 31.5 + 1e-4, "the animated ink does not cross into the fallback ink bounds");
  assert.equal(scales(mirror)[1], 1);
  assert.equal(fallbackInk.style.getPropertyValue("transform"), "translate(0.000000em, 0.000000em)");
  paint(mirror, 7000);
  assert.equal(scales(mirror)[0], 1);
  assert.equal(phases(mirror)[0], 1);
});

test("原生偏心pivot不挤占相邻译字，所有译文都围绕预留框中心运动", () => {
  for (const values of [
    { width: "120px", height: "40px", "transform-origin": "30px 30px" },
    { width: "100px", height: "20px", "box-sizing": "content-box", "transform-origin": "62px 8px 5px",
      "padding-left": "10px", "padding-right": "10px", "border-left-width": "2px", "border-right-width": "2px",
      "padding-top": "5px", "padding-bottom": "5px", "border-top-width": "1px", "border-bottom-width": "1px" },
    { width: "auto", height: "auto", "transform-origin": "13px 18px" },
    { "transform-origin": "20% 80%" },
  ] as Array<Record<string, string>>) {
    const run = harness();
    const source = lyric(["word"]);
    const word = run.line.appendChild(run.node("word", values));
    run.bind(0, word);
    const { mirror } = run.mount(source, timingFor(source, "字"));
    paint(mirror);
    assert.equal(mirror.segments[0]!.groups[0]!.style.getPropertyValue("transform-origin"), "50% 50%");
  }
});

test("保留原生颜色与文字裁剪，运动和渐变使用译字自己的时钟", () => {
  const run = harness();
  const source = lyric(["word"]);
  const motion = { transform: "matrix(1.2, 0, 0, 1.2, 2, -4)", scale: "1.08 1.1", translate: "0px -2px",
    rotate: "2deg", opacity: "0.78", filter: "blur(0.5px)" };
  const ink = { "background-image": "linear-gradient(90deg, white 40%, gray 55%)", "background-size": "120% 100%",
    "background-position": "10% 0%", "background-repeat": "no-repeat", "background-clip": "text",
    "-webkit-background-clip": "text", "-webkit-text-fill-color": "rgba(0, 0, 0, 0)", color: "rgb(222, 221, 220)",
    "text-shadow": "rgba(255, 255, 255, 0.7) 0px 0px 6px" };
  const word = run.line.appendChild(run.node("word", { ...motion, ...ink,
    "--gradient-alpha": "0.91", "--gradient-alpha-end": "0.36" }));
  run.bind(0, word);
  const { mirror, spans } = run.mount(source, timingFor(source, "字"));
  paint(mirror, 400);
  const segment = mirror.segments[0]!;
  assert.notEqual(segment.groups[0]!.style.getPropertyValue("transform"), motion.transform);
  assert.notEqual(segment.groups[0]!.style.getPropertyValue("scale"), motion.scale);
  for (const property of ["color", "background-repeat", "background-clip", "-webkit-background-clip", "-webkit-text-fill-color"]) {
    assert.equal(segment.ink.style.getPropertyValue(property), ink[property as keyof typeof ink]);
  }
  assert.match(segment.ink.style.getPropertyValue("background-image"), /rgba\(255, 255, 255, 0\.91\) 40\.000%/);
  assert.match(segment.ink.style.getPropertyValue("background-image"), /rgba\(255, 255, 255, 0\.36\) 60\.000%/);
  assert.equal(segment.ink.style.getPropertyValue("background-size"), "100% 100%");
  assert.equal(segment.ink.style.getPropertyValue("background-position"), "0% 0%");
  assert.notEqual(segment.ink.style.getPropertyValue("text-shadow"), ink["text-shadow"]);
  assert.notEqual(segment.ink.style.getPropertyValue("transform"), "", "only the inner glyph owns motion");
  assert.equal(spans[0]!.style.getPropertyValue("transform"), "", "the reserved layout box stays still");
  assert.equal(spans[0]!.style.getPropertyValue("text-shadow"), "", "ink is not doubled on the reserved box");
});

test("从祖先识别新版简洁模式，保留原生渐变宽度但每个译字独立推进", () => {
  const run = harness();
  const mode = run.node("mode");
  mode.className = "SimpleLyricsMode Exp_RefreshedSimpleLyrics";
  mode.appendChild(run.line);
  const source = lyric(["word"]);
  const word = run.line.appendChild(run.node("word", { ...transparentInk, "--SLR_FadeWidth": "0.8em" }));
  run.bind(0, word);
  const { mirror } = run.mount(source, timingFor(source, "晨光"));
  paint(mirror, 200);
  const first = mirror.segments[0]!.ink;
  const second = mirror.segments[1]!.ink;
  assert.match(first.style.getPropertyValue("background-image"), /50% - 0\.8em \/ 2/);
  assert.equal(first.style.getPropertyValue("background-size"), "calc(200% + 0.8em) 100%");
  assert.equal(first.style.getPropertyValue("background-position"), "50.000% 0px");
  assert.equal(second.style.getPropertyValue("background-position"), "100.000% 0px");
});

test("未绑定片段保持原文本，原节点移除使mirror失效", () => {
  const run = harness();
  const source = lyric(["one", "two", "three"]);
  const word = run.line.appendChild(run.node("shared-word"));
  run.bind(0, word); run.bind(2, word);
  const timing: TranslationTiming = { method: "weighted",
    segments: ["甲", "乙", "丙"].map((text, index) => ({ text, start: index / 3, end: (index + 1) / 3 })),
    cues: [0, 1, 2].map(index => ({ sourceIndex: index, startTime: index * 1000, endTime: index * 1000 + 800,
      start: index / 3, end: (index + 1) / 3 })),
  };
  const { mirror, spans } = run.mount(source, timing);
  assert.equal(mirror.count, 2);
  assert.equal(run.fragment.children.length, 3);
  assert.equal(run.fragment.children[1], spans[1]);
  assert.equal(spans[1]!.textContent, "乙");
  assert.equal(spans[1]!.dataset.lyricLayerNative, undefined);
  assert.notEqual(mirror.segments[0]!.groups[0], mirror.segments[2]!.groups[0]);
  assert.equal(mirror.isValid(), true);
  word.isConnected = false;
  assert.equal(mirror.isValid(), false);
  word.isConnected = true;
  run.line.replaceChildren();
  assert.equal(mirror.isValid(), false);
});

test("无效或零宽字符时间不创建半残缺的运动层", () => {
  for (const cues of [[], [{ sourceIndex: 0, startTime: 0, endTime: 0, start: 0, end: 1 }],
    [{ sourceIndex: 0, startTime: 0, endTime: 800, start: 0.5, end: 0.5 }]]) {
    const run = harness();
    const source = lyric(["word"]);
    const word = run.line.appendChild(run.node("word"));
    run.bind(0, word);
    const { mirror, spans } = run.mount(source, { method: "weighted", segments: [{ text: "字", start: 0, end: 1 }], cues });
    assert.equal(mirror.count, 0);
    assert.equal(run.fragment.textContent, "字");
    assert.equal(spans[0]!.children.length, 0);
    assert.equal(spans[0]!.dataset.lyricLayerNative, undefined);
    paint(mirror);
    assert.equal(run.events.length, 0);
  }
});

test("单字跨普通词和强调词时运动类型固定，100ms与900ms音节间停顿冻结姿态", () => {
  const run = harness();
  const source: LyricLine = { index: 0, text: "a hold", syllables: [
    { text: "a", startTime: 100, endTime: 200 },
    { text: "hold", startTime: 700, endTime: 1600 },
  ] };
  const plain = run.line.appendChild(run.node("plain-word", transparentInk));
  const emphasis = run.line.appendChild(run.node("emphasis-word"));
  const letter = emphasis.appendChild(run.node("held-letter", transparentInk));
  run.bind(0, plain); run.bind(1, emphasis, [letter]);
  const { mirror } = run.mount(source, { method: "weighted",
    segments: [{ text: "光", start: 0, end: 1 }],
    cues: [
      { sourceIndex: 0, startTime: 100, endTime: 200, start: 0, end: 0.2 },
      { sourceIndex: 1, startTime: 700, endTime: 1600, start: 0.2, end: 1 },
    ],
  });
  const segment = mirror.segments[0]!;
  const pose = () => [segment.groups[0]!.style.getPropertyValue("transform"),
    segment.groups[0]!.style.getPropertyValue("scale"), segment.ink.style.getPropertyValue("text-shadow")];
  paint(mirror, 100);
  assert.equal(segment.ink.dataset.lyricLayerSource, "0");
  assert.equal(scales(mirror)[0], 1, "every translated glyph starts in its neutral reserved box");
  paint(mirror, 200);
  const frozen = pose();
  const fill = segment.ink.style.getPropertyValue("background-image");
  assert.equal(phases(mirror)[0], 0.2, "target coverage and elapsed duration are different clocks");
  assert.match(fill, /17\.082%/);
  for (const position of [350, 699, 350]) {
    paint(mirror, position);
    assert.deepEqual(pose(), frozen, "the pause and backward seek reconstruct the same motion pose");
    assert.equal(segment.ink.style.getPropertyValue("background-image"), fill);
    assert.equal(segment.ink.dataset.lyricLayerSource, "0");
  }
  paint(mirror, 700);
  assert.equal(segment.ink.dataset.lyricLayerSource, "1");
  assert.deepEqual(pose(), frozen, "switching palette cue must not switch motion family or source duration");
  paint(mirror, 701);
  assert.notDeepEqual(pose(), frozen, "motion resumes after the rest");
  assert.ok(Math.abs(scales(mirror)[0]! - Number(frozen[1])) < 0.001, "resuming is continuous");
  paint(mirror, 1150);
  assert.equal(phases(mirror)[0], 0.6);
  assert.match(segment.ink.style.getPropertyValue("background-image"), /77\.082%/);
});

test("跨源译字延续到最后关联词末，主源提前结束与休止都不会截断动作", () => {
  const run = harness();
  const source: LyricLine = { index: 0, text: "held end", endTime: 5400, syllables: [
    { text: "held", startTime: 1000, endTime: 4000 },
    { text: "end", startTime: 5000, endTime: 5400 },
  ] };
  const held = run.line.appendChild(run.node("dominant-word"));
  const letter = held.appendChild(run.node("held-letter", transparentInk));
  const last = run.line.appendChild(run.node("last-word", transparentInk));
  run.bind(0, held, [letter]); run.bind(1, last);
  const { mirror } = run.mount(source, { method: "weighted", segments: [{ text: "光", start: 0, end: 1 }],
    cues: [{ sourceIndex: 0, startTime: 1000, endTime: 4000, start: 0, end: 0.9 },
      { sourceIndex: 1, startTime: 5000, endTime: 5400, start: 0.9, end: 1 }] });
  assert.equal(mirror.endTime, 5400);
  const ink = mirror.segments[0]!.ink;
  const pose = () => [ink.style.getPropertyValue("scale"), ink.style.getPropertyValue("transform"), ink.style.getPropertyValue("text-shadow")];
  paint(mirror, 4000);
  const paused = pose();
  assert.notEqual(scales(mirror)[0], 1, "the dominant source's end is not the end of this multi-source glyph");
  for (const time of [4250, 4999, 5000, 4250]) {
    paint(mirror, time);
    assert.deepEqual(pose(), paused, "rests and seeks preserve the same source activity clock");
  }
  paint(mirror, 5001);
  assert.ok(Math.abs(scales(mirror)[0]! - Number(paused[0])) < 0.002, "resuming does not catch up skipped wall-clock time");
  paint(mirror, 5300);
  assert.notEqual(scales(mirror)[0], 1);
  paint(mirror, 5399);
  assert.ok(Math.abs(scales(mirror)[0]! - 1) < 1e-4);
  paint(mirror, 5400);
  assert.equal(scales(mirror)[0], 1);
  assert.equal(phases(mirror)[0], 1);
});

test("句末约束和未知播放位置都按真实运动截止归位，不使用首字fill末加尾巴", () => {
  for (const deadline of [15_000, 30_000]) {
    const run = harness();
    const source: LyricLine = { index: 0, text: "hold", endTime: deadline,
      syllables: [{ text: "hold", startTime: 0, endTime: 30_000 }] };
    const word = run.line.appendChild(run.node("long-word"));
    const letter = word.appendChild(run.node("long-letter", transparentInk));
    run.bind(0, word, [letter]);
    const { mirror } = run.mount(source, timingFor(source, "晨光照亮了你"));
    assert.equal(mirror.endTime, deadline);
    paint(mirror, deadline);
    assert.ok(scales(mirror).every(scale => scale === 1));
    const writes: Array<() => void> = [];
    mirror.collect(undefined, new Map(), writes);
    writes.forEach(write => write());
    assert.ok(scales(mirror).every(scale => scale === 1));
    assert.ok(motionPhases(mirror).every(phase => phase === 1));
    if (deadline === 30_000) assert.ok(phases(mirror).every(phase => phase === 1));
  }
});

test("保存的手动片段时间与逐字参数进入真实mirror，仍按新窗口归位", () => {
  const run = harness();
  const source: LyricLine = { index: 0, text: "oh", startTime: 0, endTime: 5000,
    syllables: [{ text: "oh", startTime: 0, endTime: 3000 }] };
  const word = run.line.appendChild(run.node("source-word"));
  const letter = word.appendChild(run.node("source-letter", transparentInk));
  run.bind(0, word, [letter]);
  const translation = parseJson(JSON.stringify({ lines: [{ index: 0, originalText: "oh", translatedText: "晨光照亮了你",
    alignment: [{ sourceStart: 0, sourceEnd: 1, text: "晨光照亮了你", startTime: 2000, endTime: 5000 }],
    motion: { amplitude: 1.5, stagger: 0.8, settleMs: 600 } }] })).lines[0]!;
  const plan = buildTranslationTiming(source, translation)!;
  const { mirror } = run.mount(source, plan);
  assert.equal(mirror.endTime, 5000);
  paint(mirror, 1500);
  assert.ok(scales(mirror).every(scale => scale === 1));
  assert.ok(phases(mirror).every(phase => phase === 0));
  paint(mirror, 2300);
  assert.ok(motionPhases(mirror)[0]! > 0);
  assert.ok(motionPhases(mirror).slice(1).every(phase => phase === 0), "0.8 stagger spreads starts across the configured source share");
  paint(mirror, 4000);
  assert.ok(scales(mirror)[0]! > 1.3, "the saved amplitude reaches the requested native delta before collision limiting");
  assert.ok(motionPhases(mirror)[0]! < 1, "the provider's old 3000ms end does not cut off the new timing");
  assert.equal(motionPhases(mirror)[5], 0, "the final glyph starts at its custom 4000ms stagger point");
  paint(mirror, 5000);
  assert.ok(scales(mirror).every(scale => scale === 1));
  assert.ok(phases(mirror).every(phase => phase === 1));
});

test("零错开与零幅度按保存设置生效，填色和光晕不随幅度归零", () => {
  const source: LyricLine = { index: 0, text: "oh", syllables: [{ text: "oh", startTime: 0, endTime: 3000 }] };
  const mount = (amplitude: number) => {
    const run = harness();
    const word = run.line.appendChild(run.node("word"));
    const letter = word.appendChild(run.node("letter", transparentInk));
    run.bind(0, word, [letter]);
    return run.mount(source, buildTranslationTiming(source, { translatedText: "晨光", motion: { amplitude, stagger: 0 } })!).mirror;
  };
  const moving = mount(1);
  const still = mount(0);
  paint(moving, 2000); paint(still, 2000);
  assert.deepEqual(motionPhases(moving), [0.6667, 0.6667]);
  assert.equal(scales(moving)[0], scales(moving)[1]);
  assert.ok(scales(moving)[0]! > 1.2);
  assert.deepEqual(scales(still), [1, 1]);
  assert.deepEqual(phases(still), phases(moving));
  assert.equal(still.segments[0]!.ink.style.getPropertyValue("text-shadow"), moving.segments[0]!.ink.style.getPropertyValue("text-shadow"));
});

test("原生彩色渐变保留两个色标的RGB与alpha，只改变逐字高亮位置", () => {
  for (const refreshed of [false, true]) {
    const run = harness();
    if (refreshed) run.line.className += " SimpleLyricsMode Exp_RefreshedSimpleLyrics";
    const source = lyric(["color"]);
    const lit = "rgba(235, 142, 67, 0.73)";
    const dim = "rgba(53, 87, 119, 0.24)";
    const word = run.line.appendChild(run.node("color-word", { ...transparentInk,
      "background-image": `linear-gradient(90deg, ${lit} 13%, ${dim} 33%)` }));
    run.bind(0, word);
    const { mirror } = run.mount(source, timingFor(source, "晨光"));
    paint(mirror, 200);
    const first = mirror.segments[0]!.ink;
    const second = mirror.segments[1]!.ink;
    for (const ink of [first, second]) {
      const gradient = ink.style.getPropertyValue("background-image");
      assert.ok(gradient.includes(lit));
      assert.ok(gradient.includes(dim));
      assert.doesNotMatch(gradient, /rgba\(255, 255, 255/);
    }
    const property = refreshed ? "background-position" : "background-image";
    assert.notEqual(first.style.getPropertyValue(property), second.style.getPropertyValue(property));
  }
});

test("新版简洁RTL普通词的暗色在前渐变转换为译文亮色在前，强调字母不反转", () => {
  for (const emphasis of [false, true]) {
    const run = harness();
    run.line.className += " SimpleLyricsMode Exp_RefreshedSimpleLyrics rtl";
    const source = lyric(["word"]);
    const lit = "rgba(239, 173, 71, 0.88)";
    const dim = "rgba(71, 96, 121, 0.31)";
    const nativeStops = emphasis ? [lit, dim] : [dim, lit];
    const word = run.line.appendChild(run.node("rtl-word", { ...transparentInk,
      "background-image": `linear-gradient(to right, ${nativeStops[0]} 40%, ${nativeStops[1]} 60%)` }));
    run.bind(0, word, emphasis ? [word] : []);
    const { mirror } = run.mount(source, timingFor(source, "晨光"));
    paint(mirror, 200);
    for (const segment of mirror.segments) {
      const gradient = segment!.ink.style.getPropertyValue("background-image");
      assert.equal(gradient,
        `linear-gradient(to right, ${lit} calc(50% - 0.55em / 2), ${dim} calc(50% + 0.55em / 2))`);
    }
    assert.equal(mirror.segments[0]!.ink.style.getPropertyValue("background-position"), "50.000% 0px");
    assert.equal(mirror.segments[1]!.ink.style.getPropertyValue("background-position"), "100.000% 0px");
  }
});
