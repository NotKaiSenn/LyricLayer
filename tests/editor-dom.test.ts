import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type { LyricLine, TranslationLine } from "../src/types.ts";

const bundle = await build({ stdin: { contents: `export { TranslationRenderer } from './src/dom-renderer';
  export { TranslationUi } from './src/ui'; export { readMountedFallbackLines } from './src/spicy-lyrics-source';`,
  resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts" },
  bundle: true, write: false, format: "iife", globalName: "TestApp" });
const lyrics: LyricLine[] = ["Repeat", "Middle", "Repeat"].map((text, index) => ({
  index, text, renderOrder: [1 + index * 2, index * 2], startTime: 4000 + index * 5000, endTime: 6000 + index * 5000,
  syllables: [{ text, startTime: 4000 + index * 5000, endTime: 6000 + index * 5000 }],
}));

function harness() {
  const dom = new JSDOM(`<div id="SpicyLyricsPage"><div class="LyricsContent"><div class="simplebar-content-wrapper"><div class="SpicyLyricsScrollContainer"></div></div></div></div><button id="transport">Play</button>`,
    { url: "https://example.test", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.localStorage.setItem("lyric-layer-animation-enabled", "false");
  const frames = new Map<number, FrameRequestCallback>();
  const intervals = new Map<number, () => void>();
  let frameId = 0;
  let now = 0;
  w.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  w.cancelAnimationFrame = id => { frames.delete(id); };
  w.setInterval = callback => { intervals.set(++frameId, callback); return frameId; };
  w.clearInterval = id => { intervals.delete(id); };
  const state = { position: 4000, playing: false };
  const seeks: number[] = [];
  w.Spicetify = { Player: { data: { item: { uri: "track" } },
    getProgress: () => state.position, isPlaying: () => state.playing,
    pause: () => { state.playing = false; }, play: () => { state.playing = true; },
    seek: time => { seeks.push(time); state.position = time; } } };
  w.eval(bundle.outputFiles[0]!.text);
  const api = w.TestApp;
  const root = w.document.querySelector(".SpicyLyricsScrollContainer")!;
  const rows = lyrics.map(line => {
    const wrapper = w.document.createElement("div");
    wrapper.dataset.index = String(line.renderOrder![0]);
    wrapper.innerHTML = `<div class="line NotSung"><span class="word">${line.text}</span></div>`;
    root.append(wrapper);
    return wrapper.firstElementChild as HTMLElement;
  });
  let renders = 0;
  const renderer = new api.TranslationRenderer();
  renderer.start(() => { renders++; });
  const translations: TranslationLine[] = lyrics.map(line => ({ index: line.index, originalText: line.text,
    startTime: line.startTime, translatedText: `译文${line.index}` }));
  renderer.update(lyrics, new Map(translations.map(line => [line.index, line])));
  const flush = async (count = 1) => {
    for (let i = 0; i < count; i++) {
      await new Promise(resolve => setImmediate(resolve));
      const pending = [...frames.entries()];
      pending.forEach(([id]) => frames.delete(id));
      now += 100;
      pending.forEach(([, callback]) => callback(now));
    }
    await new Promise(resolve => setImmediate(resolve));
  };
  const click = (element: Element) => {
    element.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  };
  return { w, root, rows, renderer, frames, intervals, state, seeks, api, translations, flush, click,
    renders: () => renders, close: () => { renderer.stop(); w.close(); } };
}

test("真实 DOM：重复句保持各自行号，播放/暂停/Active 变化和虚拟行重挂载都不会搬走编辑器", async () => {
  const h = harness();
  try {
    const editor = h.w.document.createElement("div");
    editor.dataset.lyricLayerTranslation = "true";
    editor.dataset.llEditor = "true";
    let mounts = 0;
    h.renderer.setEditHooks({ placeholder: "输入", editing: { index: 2, element: editor, after: true },
      onActivate() {}, onEditorMounted() { mounts++; } });
    h.renderer.renderNow();
    for (let i = 0; i < 12; i++) {
      h.state.position = i % 2 ? 4000 : 14000;
      h.state.playing = !!(i % 2);
      h.rows[0]!.className = "line Active";
      h.rows[2]!.className = "line Active";
      h.renderer.renderNow();
      await h.flush();
      assert.equal(editor.previousElementSibling, h.rows[2]);
      assert.deepEqual(h.rows.map(row => row.querySelector("[data-line-index]")?.getAttribute("data-line-index")), ["0", "1", "2"]);
    }
    assert.equal(mounts, 1);
    const wrapper = h.rows[2]!.parentElement!;
    wrapper.remove();
    h.root.append(wrapper);
    h.renderer.renderNow();
    assert.equal(editor.previousElementSibling, h.rows[2]);
    h.w.document.getElementById("SpicyLyricsPage")!.classList.add("MinimalLyricsMode");
    h.rows.forEach((row, i) => { row.parentElement!.dataset.index = String(lyrics[i]!.renderOrder![1]); });
    h.renderer.renderNow();
    assert.equal(editor.previousElementSibling, h.rows[2]);
  } finally { h.close(); }
});

test("真实 MutationObserver：译文和空占位渲染后静止，编辑器改 DOM 不产生自我重绘循环", async () => {
  const h = harness();
  try {
    h.renderer.setEditHooks({ placeholder: "输入", onActivate() {} });
    h.renderer.update(lyrics, new Map([[0, h.translations[0]]]), true);
    await h.flush(6);
    assert.equal(h.frames.size, 0);
    const before = h.renders();
    h.rows[0]!.querySelector("[data-lyric-layer-translation]")!.textContent = "改动";
    await h.flush(6);
    assert.equal(h.renders(), before);
    h.rows[0]!.classList.add("Active");
    await h.flush(6);
    assert.equal(h.renders(), before + 1);
    assert.equal(h.frames.size, 0);
  } finally { h.close(); }
});

test("完整编辑器：连续切换/收起/展开可操作，按钮不会触发原生 seek，播放器暂停不关闭面板", async () => {
  const h = harness();
  const track = { uri: "track", title: "Test", artist: "Test" };
  const entry = { version: 1, trackUri: "track", createdAt: 1, updatedAt: 1, lines: h.translations };
  let nativeClicks = 0;
  h.root.addEventListener("click", event => { if ((event.target as Element).matches(".word, .line")) nativeClicks++; });
  const ui = new h.api.TranslationUi({ getTrack: () => track, getLyrics: async () => lyrics,
    getExportLyrics: async () => lyrics, store: { get: async () => entry }, onEntryChanged: async () => {},
    onPreview: (_uri: string, lines: TranslationLine[] | undefined) => h.renderer.update(lyrics, new Map((lines ?? h.translations).map(line => [line.index, line])), true),
    setEditHooks: hooks => h.renderer.setEditHooks(hooks), renderNow: () => h.renderer.renderNow() });
  try {
    await ui.enter();
    await h.flush(2);
    h.click(h.rows[0]!.querySelector("[data-lyric-layer-translation]")!);
    assert.ok(h.root.closest(".ll-scroll-owned"), "the plain editor owns native scrolling too");
    h.click(h.w.document.querySelector('[aria-label="对齐与动画"]')!);
    for (let i = 0; i < 30; i++) {
      h.click(h.w.document.querySelector(`[aria-label="${i % 2 ? "上一句" : "下一句"}"]`)!);
      await h.flush();
      assert.match(h.w.document.querySelector(".ll-ve-heading-title")!.textContent!, new RegExp(`第 ${i % 2 ? 1 : 2} 行`));
      assert.equal(h.w.document.querySelectorAll(".ll-inline-editor").length, 1);
    }
    h.click(h.rows[2]!.querySelector("[data-lyric-layer-translation]")!);
    assert.equal(h.w.document.querySelector(".ll-ve-heading-title")!.textContent, "第 3 行");
    const transport = h.w.document.getElementById("transport")!;
    h.click(transport);
    transport.focus();
    h.rows[2]!.className = "line Active";
    await h.flush(2);
    assert.equal(h.w.document.activeElement, transport);
    assert.ok(h.w.document.querySelector(".lyric-layer-visual-editor"));
    for (let i = 0; i < 6; i++) {
      h.click([...h.w.document.querySelectorAll("button")].find(button => button.textContent === "收起")!);
      h.click(h.w.document.querySelector('[aria-label="对齐与动画"]')!);
    }
    assert.equal(nativeClicks, 2);
    assert.deepEqual(h.seeks, []);
    assert.equal(h.w.document.querySelectorAll(".ll-scroll-owned").length, 1, "navigation reuses one scroll owner");
    await ui.exit();
    await h.flush(2);
    assert.equal(h.w.document.querySelector(".ll-inline-editor"), null);
    assert.equal(h.frames.size, 0);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.w.document.querySelector(".ll-scroll-owned"), null);
  } finally { h.close(); }
});

test("无虚拟行号的 fallback 不会按文本合并重复句", () => {
  const h = harness();
  try {
    h.rows.forEach(row => delete row.parentElement!.dataset.index);
    assert.equal(h.api.readMountedFallbackLines(h.w.document).length, 3);
  } finally { h.close(); }
});
