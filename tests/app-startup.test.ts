import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import type { LyricLine, TranslationEntry } from "../src/types.ts";

// Run the real app entry point, replacing only its external DOM/storage surfaces.
// In particular, this exercises startup before Player.data.item exists.
const stubs: Record<string, string> = {
  "dom-renderer": `export class TranslationRenderer {
    start(callback) { window.harness.uiChanged = callback; }
    clear() { window.harness.latest = []; }
    update(lines, translations) { window.harness.latest = [...translations.values()]; }
  }`,
  "storage": `export class IndexedDbTranslationStore {
    get(uri) { return window.harness.readEntry(uri); }
  }`,
  "spicy-lyrics-source": `export const readSpicyLyricsLines = uri => window.harness.readLyrics(uri);
    export const readMountedFallbackLines = () => [];`,
  "styles": `export const injectStyles = () => {};`,
  "ui": `export class TranslationUi {
    constructor(options) { window.harness.uiOptions = options; window.harness.trackChanges = []; }
    get active() { return false; }
    trackChanged(uri) { window.harness.trackChanges.push(uri); }
    pageChanged() {}
  }`,
};
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/app.ts", import.meta.url))],
  bundle: true, write: false, format: "iife",
  plugins: [{
    name: "app-surfaces",
    setup(build) {
      build.onResolve({ filter: /^\.\/(dom-renderer|storage|spicy-lyrics-source|styles|ui)$/ }, (args) => ({ path: args.path.slice(2), namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
    },
  }],
});

const uriA = "spotify:track:first";
const uriB = "spotify:track:second";
const lyrics = (uri: string): LyricLine[] => [{ index: 0, text: uri, startTime: 1_000 }];
const entry = (uri: string): TranslationEntry => ({
  version: 1, trackUri: uri, createdAt: 1, updatedAt: 1,
  lines: [{ index: 0, originalText: uri, translatedText: `Translation for ${uri}` }],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function settle() {
  // App initialization and its asynchronous cache/storage callbacks use microtasks.
  await new Promise<void>((resolve) => setImmediate(resolve));
}
async function harness() {
  const h = {
    latest: [] as TranslationEntry["lines"],
    entryRequests: [] as string[], lyricRequests: [] as string[],
    uiChanged: () => {}, songChanged: () => {},
    uiOptions: undefined as any,
    readEntry: async (uri: string): Promise<TranslationEntry | undefined> => entry(uri),
    readLyrics: async (uri: string): Promise<LyricLine[]> => lyrics(uri),
  };
  const player = {
    data: { item: undefined as { uri: string; name: string } | undefined },
    addEventListener: (event: string, callback: () => void) => { if (event === "songchange") h.songChanged = callback; },
  };
  const context = {
    window: { harness: {
      ...h,
      readEntry: (uri: string) => { h.entryRequests.push(uri); return h.readEntry(uri); },
      readLyrics: (uri: string) => { h.lyricRequests.push(uri); return h.readLyrics(uri); },
    }, Spicetify: { Player: player, PopupModal: {} }, LyricLayer: undefined as any },
    document: { body: {}, querySelectorAll: () => [] },
    queueMicrotask, setTimeout, console,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  await settle();
  assert.ok(context.window.LyricLayer, "App initializes without waiting forever for a selected track");
  return {
    h, app: context.window.LyricLayer,
    uiChanged: () => context.window.harness.uiChanged(),
    songChanged: () => h.songChanged(),
    latest: () => context.window.harness.latest,
    trackChanges: () => (context.window.harness as unknown as { trackChanges: string[] }).trackChanges,
    setTrack: (uri?: string) => { player.data.item = uri ? { uri, name: uri } : undefined; },
  };
}

test("Spotify启动时Player先就绪、歌曲稍后出现，首次歌词UI刷新加载保存译文", async () => {
  const run = await harness();
  assert.equal(run.latest().length, 0);
  run.setTrack(uriA);
  run.uiChanged();
  await settle();
  assert.deepEqual(run.h.entryRequests, [uriA]);
  assert.equal(run.latest()[0]?.translatedText, entry(uriA).lines[0]!.translatedText);
});

test("同一歌曲连续UI刷新和songchange共享未完成的翻译加载", async () => {
  const run = await harness();
  const pending = deferred<TranslationEntry>();
  run.h.readEntry = () => pending.promise;
  run.setTrack(uriA);
  run.uiChanged();
  run.uiChanged();
  run.songChanged();
  run.uiChanged();
  assert.deepEqual(run.h.entryRequests, [uriA]);
  assert.equal(run.h.lyricRequests.length, 0, "Lyrics cannot resolve ahead of saved translations");
  pending.resolve(entry(uriA));
  await settle();
  assert.deepEqual(run.h.lyricRequests, [uriA]);
  assert.equal(run.latest().length, 1);
});

test("切歌时旧歌延迟返回不会覆盖新歌，已resolved的UI仍校准歌曲URI", async () => {
  const run = await harness();
  const pending = deferred<TranslationEntry>();
  run.h.readEntry = (uri) => uri === uriA ? pending.promise : Promise.resolve(entry(uri));
  run.setTrack(uriA);
  run.uiChanged();
  run.setTrack(uriB);
  run.songChanged();
  await settle();
  pending.resolve(entry(uriA));
  await settle();
  assert.equal(run.latest()[0]?.originalText, uriB);
  assert.deepEqual(run.h.lyricRequests, [uriB]);
  assert.deepEqual([...run.trackChanges()], [uriA, uriB], "edit mode hears about every song change");

  run.h.readEntry = async (uri) => entry(uri);
  run.setTrack(uriA);
  run.uiChanged(); // No songchange event: the already-resolved source must not hide the new track.
  await settle();
  assert.equal(run.latest()[0]?.originalText, uriA);
});

test("旧歌曲cache请求结束不会清除新歌曲的进行中请求", async () => {
  const run = await harness();
  run.h.readLyrics = async () => [];
  run.setTrack(uriA);
  await run.app.loadCurrentTrack();
  const oldSource = deferred<LyricLine[]>();
  run.h.readLyrics = () => oldSource.promise;
  const oldLoad = run.app.ensureLyrics(false);
  run.setTrack(uriB);
  run.h.readLyrics = async () => [];
  await run.app.loadCurrentTrack();
  const newSource = deferred<LyricLine[]>();
  run.h.readLyrics = () => newSource.promise;
  const newLoad = run.app.ensureLyrics(false);
  oldSource.resolve(lyrics(uriA));
  await oldLoad;
  const before = run.h.lyricRequests.length;
  const duplicate = run.app.ensureLyrics(false);
  assert.equal(run.h.lyricRequests.length, before, "Current track's pending cache read remains deduplicated");
  newSource.resolve(lyrics(uriB));
  await Promise.all([newLoad, duplicate]);
  assert.equal(run.latest()[0]?.originalText, uriB);
});
