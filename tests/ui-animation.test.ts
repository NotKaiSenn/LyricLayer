import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import type { LyricLine, TranslationEntry, TranslationLine } from "../src/types.ts";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/ui.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "LyricLayerUi",
  plugins: [{ name: "visual-editor-boundary", setup(build) {
    build.onResolve({ filter: /^\.\/visual-editor$/ }, () => ({ path: "visual", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
      contents: "export const createVisualEditor = options => globalThis.__createVisualEditor(options);",
    }));
  } }],
});
const track = { uri: "spotify:track:animation", title: "Example", artist: "Artist" };
const aligned = (index: number, originalText: string, translatedText: string): TranslationLine => ({
  index, originalText, translatedText,
  alignment: [{ sourceStart: 0, sourceEnd: 1, text: translatedText }],
});

function harness(lines: TranslationLine[], source: LyricLine[], blockStorage = false) {
  let entry: TranslationEntry = { version: 1, trackUri: track.uri, lines, createdAt: 1, updatedAt: 1 };
  const saved: TranslationEntry[] = [];
  const events: string[] = [];
  const notifications: Array<{ message: string; isError: boolean }> = [];
  const preferences = new Map<string, string>();
  const downloads: Blob[] = [];
  const blobs = new Map<string, Blob>();
  let fileText: string | undefined;
  let root: ElementFixture;
  let visualOptions: { line: LyricLine; translation: TranslationLine;
    onApply: (draft: TranslationLine) => void; onClose: () => void } | undefined;

  class ElementFixture {
    tag: string;
    children: ElementFixture[] = [];
    attributes = new Map<string, string>();
    listeners = new Map<string, () => void>();
    style: Record<string, string> = {};
    type = "";
    value = "";
    checked = false;
    disabled = false;
    textContent = "";
    href = "";
    scrollHeight = 42;
    files?: Array<{ text: () => Promise<string> }>;
    constructor(tag: string) { this.tag = tag; }
    append(...children: ElementFixture[]) { this.children.push(...children); }
    appendChild(child: ElementFixture) { this.children.push(child); return child; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
    click() {
      assert.equal(this.disabled, false);
      if (this.type === "file") {
        assert.ok(fileText);
        this.files = [{ text: async () => fileText! }];
        this.listeners.get("change")?.();
      } else if (this.tag === "a") downloads.push(blobs.get(this.href)!);
      else this.listeners.get("click")?.();
    }
    all(): ElementFixture[] { return [this, ...this.children.flatMap(child => child.all())]; }
    text(): string { return this.textContent + this.children.map(child => child.text()).join(""); }
  }

  const context = {
    Blob, Event,
    __createVisualEditor: (options: typeof visualOptions) => {
      visualOptions = options;
      return new ElementFixture("visual-editor");
    },
    document: { createElement: (tag: string) => new ElementFixture(tag) },
    window: {
      localStorage: {
        getItem: (key: string) => { if (blockStorage) throw new Error("blocked"); return preferences.get(key) ?? null; },
        setItem: (key: string, value: string) => { if (blockStorage) throw new Error("blocked"); preferences.set(key, value); },
      },
      dispatchEvent: (event: Event) => { events.push(event.type); return true; },
      Spicetify: {
        PopupModal: { display: ({ content }: { content: ElementFixture }) => { root = content; }, hide: () => {} },
        showNotification: (message: string, isError = false) => { notifications.push({ message, isError }); },
      },
    },
    URL: {
      createObjectURL: (blob: Blob) => { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; },
      revokeObjectURL: () => {},
    },
    setTimeout: () => 0,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const { TranslationUi } = (context as typeof context & { LyricLayerUi: { TranslationUi: any } }).LyricLayerUi;
  const ui = new TranslationUi({
    getTrack: () => track, getLyrics: async () => source, getExportLyrics: async () => source,
    store: {
      get: async () => entry,
      save: async (next: TranslationEntry) => { entry = JSON.parse(JSON.stringify(next)); saved.push(entry); },
    },
    onEntryChanged: async () => {},
  });
  return {
    ui, saved, events, notifications, preferences, downloads,
    visual: () => { assert.ok(visualOptions); return visualOptions; },
    all: () => root.all(),
    button: (text: string) => {
      const found = root.all().find(node => node.tag === "button" && node.text() === text);
      assert.ok(found, `Missing button ${text}`);
      return found;
    },
    setFile: (text: string) => { fileText = text; },
  };
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("编辑保存保留未改文本的片段对齐，原文或译文改变时清除旧对齐", async () => {
  const original = [aligned(0, "One", "第一句"), aligned(1, "Two", "第二句"), aligned(2, "Three", "第三句")];
  const run = harness(original, [
    { index: 0, text: "One" }, { index: 1, text: "Two" }, { index: 2, text: "Changed third line" },
  ]);
  await run.ui.openEditor(track);
  run.all().filter(node => node.tag === "textarea")[1]!.value = "已修改的译文";
  run.button("保存翻译").click();
  await settle();
  const saved = run.saved[0]!.lines;
  assert.deepEqual(saved[0]!.alignment, original[0]!.alignment);
  assert.equal(saved[1]!.alignment, undefined);
  assert.equal(saved[2]!.alignment, undefined);
  assert.equal(saved[2]!.originalText, "Changed third line");
  assert.equal(original[1]!.translatedText, "第二句");
});

test("动态跟随默认开启，切换即通知renderer且重新打开面板保留选择", async () => {
  for (const blocked of [false, true]) {
    const run = harness([], [], blocked);
    await run.ui.open();
    const toggle = run.all().find(node => node.attributes.get("aria-label") === "译文动态跟随")!;
    assert.ok(toggle);
    assert.equal(toggle.checked, true);
    toggle.checked = false;
    toggle.listeners.get("change")!();
    assert.deepEqual(run.events, ["lyric-layer-animation-change"]);
    if (!blocked) assert.equal([...run.preferences.values()][0], "false");
    await run.ui.open();
    assert.equal(run.all().find(node => node.attributes.get("aria-label") === "译文动态跟随")!.checked, false);
  }
});

test("可视化编辑应用草稿并保留其他行未保存内容，最终保存时保留时间与动画", async () => {
  const source: LyricLine[] = [{ index: 0, text: "hold light", startTime: 1000, endTime: 5000,
    syllables: [{ text: "hold", startTime: 1000, endTime: 3000 }, { text: "light", startTime: 3000, endTime: 5000 }] },
    { index: 1, text: "next" }];
  const run = harness([{ index: 0, originalText: "hold light", translatedText: "握紧光" },
    { index: 1, originalText: "next", translatedText: "下一句" }], source);
  await run.ui.openEditor(track);
  run.all().filter(node => node.tag === "textarea")[1]!.value = "另一行草稿";
  run.button("可视化编辑").click();
  const draft: TranslationLine = { ...run.visual().translation, translatedText: " 握紧光 ",
    alignment: [{ sourceStart: 0, sourceEnd: 2, text: " 握紧光 ", startTime: 1200, endTime: 4800 }],
    motion: { amplitude: 1.3, stagger: 0.2, settleMs: 450 } };
  run.visual().onApply(draft);
  assert.equal(run.saved.length, 0, "visual Apply changes the editor draft, not storage");
  assert.equal(run.all().filter(node => node.tag === "textarea")[1]!.value, "另一行草稿");
  run.button("保存翻译").click();
  await settle();
  assert.deepEqual(run.saved[0]!.lines[0], draft);
  assert.equal(run.saved[0]!.lines[1]!.translatedText, "另一行草稿");
  await run.ui.openEditor(track);
  run.button("可视化编辑").click();
  assert.deepEqual(JSON.parse(JSON.stringify(run.visual().translation.motion)), draft.motion);
  assert.deepEqual(run.visual().translation.alignment, draft.alignment);
});

test("取消可视化编辑保留文本草稿，不改保存数据", async () => {
  const run = harness([aligned(0, "One", "第一句")], [{ index: 0, text: "One" }]);
  await run.ui.openEditor(track);
  run.all().find(node => node.tag === "textarea")!.value = "暂未保存";
  run.button("可视化编辑").click();
  assert.equal(run.visual().translation.translatedText, "暂未保存");
  assert.equal(run.visual().translation.alignment, undefined);
  run.visual().onClose();
  assert.equal(run.all().find(node => node.tag === "textarea")!.value, "暂未保存");
  assert.equal(run.saved.length, 0);
});

test("JSON对齐数据经导入规范化后保存，导出备份仍保留片段", async () => {
  const line = aligned(0, "One", "第一句");
  const run = harness([], [{ index: 0, text: "One" }]);
  run.setFile(JSON.stringify({ version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1,
    lines: [{ ...line, ignoredField: "discard me" }] }));
  await run.ui.open();
  run.all().filter(node => node.tag === "button" && node.text() === "选择文件")[2]!.click();
  await settle();
  assert.deepEqual(run.saved[0]!.lines, [line]);
  await run.ui.open();
  run.button("导出").click();
  const backup = JSON.parse(await run.downloads[0]!.text());
  assert.deepEqual(backup.lines, [line]);
});

test("新JSON片段未附原文时绑定当前歌词，首次导入不丢对齐", async () => {
  const line = aligned(0, "One", "第一句");
  const { originalText: _originalText, ...unbound } = line;
  const run = harness([], [{ index: 0, text: "One" }]);
  run.setFile(JSON.stringify({ lines: [unbound] }));
  await run.ui.open();
  run.all().filter(node => node.tag === "button" && node.text() === "选择文件")[2]!.click();
  await settle();
  assert.deepEqual(run.saved[0]!.lines, [line]);
});

test("JSON手动时间与动画参数导入再导出完整保留，包括小数毫秒和原样译文", async () => {
  const source: LyricLine[] = [{ index: 0, text: "hold light", startTime: 1000, endTime: 5000,
    syllables: [{ text: "hold", startTime: 1000, endTime: 3000 }, { text: "light", startTime: 3000, endTime: 5000 }] }];
  const line: TranslationLine = { index: 0, startTime: 1000, originalText: "hold light", translatedText: " 握紧 光 \n",
    alignment: [
      { sourceStart: 0, sourceEnd: 1, text: " 握紧 ", startTime: 1250.5, endTime: 2650.25 },
      { sourceStart: 1, sourceEnd: 2, text: "光 \n", startTime: 3150.75, endTime: 4800.5 },
    ], motion: { amplitude: 1.65, stagger: 0.65, settleMs: 750 } };
  for (const fullBackup of [true, false]) {
    const run = harness([], source);
    run.setFile(JSON.stringify({ ...(fullBackup
      ? { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1 } : {}), lines: [line] }));
    await run.ui.open();
    run.all().filter(node => node.tag === "button" && node.text() === "选择文件")[2]!.click();
    await settle();
    assert.equal(run.saved.length, 1);
    assert.deepEqual(run.saved[0]!.lines, [line]);
    assert.ok(run.notifications.some(value => !value.isError && value.message.includes("已导入")));
    await run.ui.open();
    run.button("导出").click();
    const backup = JSON.parse(await run.downloads[0]!.text());
    assert.equal(backup.trackUri, track.uri);
    assert.deepEqual(backup.lines, [line]);
  }
});

test("当前歌曲JSON手动时间超出真实行边界时拒绝导入，原保存数据保持不变", async () => {
  // The provider's syllables extend beyond its line bounds. Import validation
  // must use the actual line bounds, not merely accept the wider syllable span.
  const source: LyricLine[] = [{ index: 0, text: "hold light", startTime: 1000, endTime: 5000,
    syllables: [{ text: "hold", startTime: 500, endTime: 3000 }, { text: "light", startTime: 3000, endTime: 5500 }] }];
  const savedLine: TranslationLine = { index: 0, startTime: 1000, originalText: "hold light", translatedText: "原保存译文",
    alignment: [{ sourceStart: 0, sourceEnd: 2, text: "原保存译文", startTime: 1200, endTime: 4500 }],
    motion: { amplitude: 1.1, stagger: 0.2, settleMs: 400 } };
  for (const [startTime, endTime] of [[900, 4900], [1100, 5100]]) {
    const run = harness([savedLine], source);
    run.setFile(JSON.stringify({ version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1, lines: [{
      index: 0, startTime: 1000, originalText: "hold light", translatedText: "越界译文",
      alignment: [{ sourceStart: 0, sourceEnd: 2, text: "越界译文", startTime, endTime }],
      motion: { amplitude: 1.8, stagger: 0.6, settleMs: 800 },
    }] }));
    await run.ui.open();
    run.all().filter(node => node.tag === "button" && node.text() === "选择文件")[2]!.click();
    await settle();
    assert.equal(run.saved.length, 0, "invalid import must never call storage.save");
    assert.equal(run.notifications.length, 1);
    assert.equal(run.notifications[0]!.isError, true);
    assert.match(run.notifications[0]!.message, /第 1 行.*手动时间.*原行 1000–5000/);
    await run.ui.open();
    run.button("导出").click();
    const unchanged = JSON.parse(await run.downloads[0]!.text());
    assert.deepEqual(unchanged.lines, [savedLine]);
    assert.equal(unchanged.updatedAt, 1);
  }
});
