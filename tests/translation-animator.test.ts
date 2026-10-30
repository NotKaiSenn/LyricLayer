import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import type { TranslationMotionSettings } from "../src/types.ts";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/translation-animator.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "AnimatorTest",
  plugins: [{
    name: "controlled-player-and-native-paint",
    setup(build) {
      build.onResolve({ filter: /^\.\/(playback-clock|native-motion-mirror)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path.endsWith("playback-clock")
        ? "export const playbackPosition = () => globalThis.__state.position;"
        : "export const NativeMotionMirror = globalThis.__NativeMotionMirror;" }));
    },
  }],
});

class ElementFixture {
  isConnected = true;
  dataset: Record<string, string> = {};
  classes = new Set<string>();
  classList = { contains: (value: string) => this.classes.has(value) };
  children: ElementFixture[] = [];
  textContent = "";
  className = "";
  properties = new Map<string, string>();
  style = { setProperty: (name: string, value: string) => this.properties.set(name, value) };
  attributes = new Map<string, string>();
  appendChild(child: ElementFixture) { this.children.push(child); return child; }
  replaceChildren(fragment: ElementFixture) { this.children = [...fragment.children]; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  closest() { return null; }
}

interface AnimatorFixture {
  start(): void;
  stop(): void;
  refresh(): void;
  mount(line: ElementFixture, element: ElementFixture, timing: unknown, lyric: unknown): void;
}

function harness() {
  const state = { position: 0, playing: true };
  const frames = new Map<number, (time: number) => void>();
  const timers = new Map<number, () => void>();
  const listeners = new Map<string, Set<() => void>>();
  const paints: Array<{ line: ElementFixture; position: number }> = [];
  const operations: string[] = [];
  let nextId = 1;
  const listen = (name: string, callback: () => void) => {
    const set = listeners.get(name) ?? new Set();
    set.add(callback);
    listeners.set(name, set);
  };
  const unlisten = (name: string, callback: () => void) => listeners.get(name)?.delete(callback);
  const observers: Array<{ callback: (records: Array<{ target: ElementFixture }>) => void; targets: Set<ElementFixture> }> = [];
  class Observer {
    callback: (records: Array<{ target: ElementFixture }>) => void;
    targets = new Set<ElementFixture>();
    constructor(callback: Observer["callback"]) { this.callback = callback; observers.push(this); }
    observe(target: ElementFixture) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }
  class NativeMirror {
    line: ElementFixture;
    count: number;
    endTime = 1000;
    nodes = new Set<ElementFixture>();
    segments: unknown[];
    constructor(line: ElementFixture) {
      this.line = line;
      this.count = line.dataset.fallback ? 0 : 1;
      this.segments = [this.count ? {} : undefined];
    }
    isValid() { return this.line.isConnected; }
    collect(position: number, _cache: unknown, writes: Array<() => void>) {
      operations.push("read");
      writes.push(() => { operations.push("write"); paints.push({ line: this.line, position }); });
    }
  }
  const document = {
    hidden: false,
    createElement: () => new ElementFixture(),
    createDocumentFragment: () => new ElementFixture(),
    addEventListener: listen,
    removeEventListener: unlisten,
  };
  const context = {
    __state: state, __NativeMotionMirror: NativeMirror,
    document, MutationObserver: Observer,
    requestAnimationFrame: (callback: (time: number) => void) => { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    window: {
      Spicetify: { Player: { isPlaying: () => state.playing, addEventListener: listen, removeEventListener: unlisten } },
      setTimeout: (callback: () => void, delay: number) => {
        assert.equal(delay, 250);
        const id = nextId++; timers.set(id, callback); return id;
      },
      clearTimeout: (id: number) => timers.delete(id),
    },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const { TranslationAnimator } = (context as typeof context & {
    AnimatorTest: { TranslationAnimator: new () => AnimatorFixture };
  }).AnimatorTest;
  const animator = new TranslationAnimator();
  animator.start();
  const mount = (active = true, fallback = false, motion?: TranslationMotionSettings) => {
    const line = new ElementFixture();
    if (active) line.classes.add("Active");
    if (fallback) line.dataset.fallback = "true";
    const element = new ElementFixture();
    const timing = {
      segments: [{ text: "字", start: 0, end: 1 }],
      cues: [{ startTime: 0, endTime: 1000, start: 0, end: 1 }], method: "weighted",
    };
    const lyric = { index: 0, text: "word", startTime: 0, endTime: 1000 };
    const remount = (nextMotion?: TranslationMotionSettings) => animator.mount(line, element, { ...timing, motion: nextMotion }, lyric);
    remount(motion);
    return { line, element, remount };
  };
  const emit = (event: string) => [...listeners.get(event) ?? []].forEach(callback => callback());
  const mutate = (target: ElementFixture) => {
    observers.forEach(observer => { if (observer.targets.has(target)) observer.callback([{ target }]); });
  };
  const frame = (time: number) => {
    const due = [...frames.values()];
    frames.clear();
    due.forEach(callback => callback(time));
  };
  const poll = () => {
    const due = [...timers.values()];
    timers.clear();
    due.forEach(callback => callback());
  };
  return { animator, state, frames, timers, paints, operations, document, mount, emit, mutate, frame, poll };
}

test("playing poses advance on every display frame, including sub-33ms intervals", () => {
  const run = harness();
  run.mount();
  run.animator.refresh();
  assert.equal(run.paints.length, 0);
  const times = [0, 16.6, 33.2, 49.9, 66.5, 83.2, 90.1, 97];
  for (const time of times) {
    run.state.position = time;
    run.frame(time);
    assert.equal(run.frames.size, 1);
  }
  assert.deepEqual(run.paints.map(paint => paint.position), times);
});

test("progress and native mutation bursts produce one paint at the next frame", () => {
  const run = harness();
  const { line } = run.mount();
  run.animator.refresh();
  for (let i = 0; i < 5; i++) { run.emit("onprogress"); run.mutate(line); }
  assert.equal(run.frames.size, 1);
  assert.equal(run.paints.length, 0);
  run.frame(0);
  assert.equal(run.paints.length, 1);
  run.state.position = 16;
  for (let i = 0; i < 5; i++) { run.mutate(line); run.emit("onprogress"); }
  assert.equal(run.paints.length, 1);
  run.frame(16);
  assert.deepEqual(run.paints.map(paint => paint.position), [0, 16]);
});

test("a playing seek redraws every mounted line on the next frame", () => {
  const run = harness();
  run.mount();
  const idle = run.mount(false);
  run.animator.refresh();
  run.frame(0);
  run.paints.length = 0;
  run.state.position = 4000;
  run.emit("onprogress");
  assert.equal(run.paints.length, 0);
  run.frame(16);
  assert.equal(run.paints.length, 2);
  assert.ok(run.paints.every(paint => paint.position === 4000));
  assert.ok(run.paints.some(paint => paint.line === idle.line));
});

test("pausing cancels the queued playing frame and paused seeks paint synchronously", () => {
  const run = harness();
  run.mount();
  run.animator.refresh();
  run.frame(0);
  run.state.playing = false;
  run.state.position = 125;
  run.emit("onplaypause");
  assert.equal(run.paints.at(-1)?.position, 125);
  assert.equal(run.frames.size, 0);
  assert.equal(run.timers.size, 1);
  run.state.position = 800;
  run.emit("onprogress");
  assert.equal(run.paints.at(-1)?.position, 800);
  assert.equal(run.timers.size, 1);
  run.state.position = 300;
  run.poll();
  assert.equal(run.paints.at(-1)?.position, 300);
  assert.equal(run.frames.size, 0);
  run.state.playing = true;
  run.emit("onplaypause");
  assert.equal(run.timers.size, 0);
  assert.equal(run.frames.size, 1);
});

test("the first frame at the deadline restores a Sung line and retires its loop", () => {
  const run = harness();
  const { line } = run.mount();
  run.state.position = 990;
  run.animator.refresh();
  run.frame(0);
  line.classes.delete("Active");
  line.classes.add("Sung");
  run.state.position = 1000;
  run.frame(10);
  assert.deepEqual(run.paints.map(paint => paint.position), [990, 1000]);
  assert.equal(run.frames.size, 0);
  assert.equal(run.timers.size, 0);
});

test("idle native palette mutations use one frame and paused mutations remain immediate", () => {
  const run = harness();
  const { line } = run.mount(false);
  run.animator.refresh();
  run.frame(0);
  assert.equal(run.frames.size, 0);
  run.paints.length = 0;
  run.mutate(line);
  run.mutate(line);
  assert.equal(run.frames.size, 1);
  assert.equal(run.paints.length, 0);
  run.frame(16);
  assert.equal(run.paints.length, 1);
  assert.equal(run.frames.size, 0);
  run.state.playing = false;
  run.mutate(line);
  assert.equal(run.paints.length, 2);
  assert.equal(run.frames.size, 0);
});

test("fallback glyphs also show paused seek progress immediately", () => {
  const run = harness();
  const { element } = run.mount(true, true);
  run.state.playing = false;
  run.state.position = 500;
  run.animator.refresh();
  assert.equal(element.children[0]?.properties.get("--lyric-layer-sweep"), "50.00%");
  run.state.position = 1000;
  run.emit("onprogress");
  assert.equal(element.children[0]?.properties.get("--lyric-layer-lift"), "0.000");
});

test("fallback amplitude controls displacement without scaling its fill or glow", () => {
  const run = harness();
  const standard = run.mount(true, true);
  const still = run.mount(true, true, { amplitude: 0 });
  const doubled = run.mount(true, true, { amplitude: 2, stagger: 0.8, settleMs: 1000 });
  run.state.playing = false;
  run.state.position = 500;
  run.animator.refresh();
  const properties = (entry: typeof standard) => entry.element.children[0]!.properties;
  assert.equal(properties(standard).get("transform"), "translateY(-0.05500em)");
  assert.equal(properties(still).get("transform"), "translateY(0.00000em)");
  assert.equal(properties(doubled).get("transform"), "translateY(-0.11000em)");
  for (const entry of [standard, still, doubled]) {
    assert.equal(properties(entry).get("--lyric-layer-sweep"), "50.00%");
    assert.equal(properties(entry).get("--lyric-layer-lift"), "1.000", "the glow's CSS input is unaffected by amplitude");
  }
  run.state.position = 1000;
  run.emit("onprogress");
  assert.ok(Math.abs(Number(properties(doubled).get("transform")!.match(/translateY\(([-.\d]+)em\)/)![1])) < 1e-8);
  run.state.position = 250;
  run.emit("onprogress");
  assert.equal(properties(still).get("transform"), "translateY(0.00000em)");
  assert.equal(properties(still).get("--lyric-layer-sweep"), "20.00%");
});

test("remounting changed motion at the same paused time replaces the cached fallback pose", () => {
  const run = harness();
  const target = run.mount(true, true, { amplitude: 1 });
  run.state.playing = false;
  run.state.position = 500;
  run.animator.refresh();
  const oldSpan = target.element.children[0]!;
  assert.equal(oldSpan.properties.get("transform"), "translateY(-0.05500em)");
  target.remount({ amplitude: 0 });
  run.animator.refresh();
  const newSpan = target.element.children[0]!;
  assert.notEqual(newSpan, oldSpan);
  assert.equal(newSpan.properties.get("transform"), "translateY(0.00000em)");
  assert.equal(newSpan.properties.get("--lyric-layer-sweep"), "50.00%");
  const native = run.mount(true, false, { amplitude: 2 });
  run.animator.refresh();
  assert.equal(native.element.children[0]!.properties.get("transform"), undefined, "native-bound glyphs remain owned by the mirror");
});

test("multiple native lines still finish all geometry reads before applying any writes", () => {
  const run = harness();
  run.mount();
  run.mount();
  run.animator.refresh();
  run.frame(0);
  assert.deepEqual(run.operations, ["read", "read", "write", "write"]);
});

test("hidden and stopped animators do not keep painting or retain scheduled work", () => {
  const run = harness();
  const { line } = run.mount();
  run.animator.refresh();
  run.document.hidden = true;
  run.frame(0);
  assert.equal(run.frames.size, 0);
  assert.equal(run.paints.length, 0);
  run.document.hidden = false;
  run.emit("visibilitychange");
  run.frame(16);
  assert.equal(run.paints.length, 1);
  run.animator.stop();
  assert.equal(run.frames.size, 0);
  assert.equal(run.timers.size, 0);
  run.emit("onprogress");
  run.mutate(line);
  run.frame(32);
  assert.equal(run.paints.length, 1);
});
