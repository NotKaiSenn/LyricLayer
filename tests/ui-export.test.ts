import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import type { LyricLine, TrackInfo, TranslationEntry } from "../src/types.ts";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/ui.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "LyricLayerUi",
});

const track: TrackInfo = { uri: "spotify:track:original", artist: "Artist", title: "Song: One?" };
const entry: TranslationEntry = {
  version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1,
  lines: [
    { index: 0, startTime: 30_660, originalText: "First", translatedText: "第一句" },
    { index: 1, startTime: 34_520, originalText: "Second", translatedText: "第二句" },
  ],
};

function createHarness(source: Promise<LyricLine[]>) {
  const downloads: Array<{ filename: string; blob: Blob }> = [];
  const requests: Array<{ source: string; uri: string }> = [];
  const blobs = new Map<string, Blob>();
  const elements: Array<ReturnType<typeof element>> = [];
  let currentTrack = track;
  let modalTitle = "";

  // Only the DOM operations used by the export menu are needed here. Downloads
  // remain in memory so this verifies the actual button-to-file flow.
  function element(tag: string) {
    const attributes = new Map<string, string>();
    const listeners = new Map<string, () => void>();
    const node = {
      disabled: false, href: "", download: "", attributes,
      append: (..._children: unknown[]) => {},
      appendChild: (child: unknown) => child,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
      click: () => {
        assert.equal(node.disabled, false, "Cannot click a disabled export format");
        if (tag === "a") downloads.push({ filename: node.download, blob: blobs.get(node.href)! });
        else listeners.get("click")?.();
      },
    };
    elements.push(node);
    return node;
  }

  const context = {
    Blob,
    document: { createElement: element },
    window: { Spicetify: {
      PopupModal: { display: ({ title }: { title: string }) => { modalTitle = title; } },
      showNotification: () => {},
    } },
    URL: {
      createObjectURL: (blob: Blob) => {
        const url = `blob:test-${blobs.size}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL: () => {},
    },
    setTimeout: () => 0,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const { TranslationUi } = (context as typeof context & { LyricLayerUi: { TranslationUi: any } }).LyricLayerUi;
  const ui = new TranslationUi({
    getTrack: () => currentTrack,
    getLyrics: () => { throw new Error("Export must not use the mounted DOM fallback"); },
    getExportLyrics: (uri: string) => { requests.push({ source: "lyrics", uri }); return source; },
    store: { get: async (uri: string) => { requests.push({ source: "translations", uri }); return entry; } },
    onEntryChanged: () => { throw new Error("Export must not change saved translations"); },
  });
  return {
    ui, downloads, requests,
    setTrack: (next: TrackInfo) => { currentTrack = next; },
    title: () => modalTitle,
    button: (label: string) => {
      const found = elements.find((node) => node.attributes.get("aria-label") === label);
      assert.ok(found, `Missing export button: ${label}`);
      return found;
    },
  };
}

test("导出面板在缓存变成静态或缺行时，保留全部已保存译文及时间戳", async () => {
  const before = structuredClone(entry);
  const harness = createHarness(Promise.resolve([{ index: 0, text: "First" }]));
  await harness.ui.openLyricsExport(track);

  harness.button("导出仅原文").click();
  assert.equal(await harness.downloads[0]!.blob.text(), "First");
  assert.equal(harness.button("导出原文带时间戳").disabled, true);
  harness.button("导出仅翻译").click();
  assert.equal(await harness.downloads[1]!.blob.text(), "第一句\n第二句");
  harness.button("导出翻译带时间戳").click();
  assert.equal(await harness.downloads[2]!.blob.text(), "[00:30.660]第一句\n[00:34.520]第二句");
  assert.deepEqual(entry, before);
});

test("导出加载期间切歌，仍按原歌曲读取并用原歌曲生成文件名", async () => {
  let resolveLyrics!: (lyrics: LyricLine[]) => void;
  const harness = createHarness(new Promise((resolve) => { resolveLyrics = resolve; }));
  const loading = harness.ui.openLyricsExport(track);
  harness.setTrack({ uri: "spotify:track:other", artist: "Other artist", title: "Other song" });
  resolveLyrics([{ index: 0, text: "First", startTime: 30_660 }]);
  await loading;

  harness.button("导出原文带时间戳").click();
  assert.deepEqual(harness.requests, [
    { source: "lyrics", uri: track.uri },
    { source: "translations", uri: track.uri },
  ]);
  assert.equal(harness.title(), `导出歌词 · ${track.title}`);
  assert.equal(harness.downloads[0]!.filename, "Artist - Song_ One_ - 原文.lrc");
  assert.equal(await harness.downloads[0]!.blob.text(), "[00:30.660]First");
});
