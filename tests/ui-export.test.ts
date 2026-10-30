import assert from "node:assert/strict";
import test from "node:test";
import type { LyricLine, TrackInfo, TranslationEntry } from "../src/types.ts";
import { createUiHarness, settle } from "./ui-harness.ts";

const track: TrackInfo = { uri: "spotify:track:original", artist: "Artist", title: "Song: One?" };
const entry: TranslationEntry = {
  version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1,
  lines: [
    { index: 0, startTime: 30_660, originalText: "First", translatedText: "第一句" },
    { index: 1, startTime: 34_520, originalText: "Second", translatedText: "第二句" },
  ],
};

async function exportAs(run: ReturnType<typeof createUiHarness>, label: string) {
  await run.menu("导出");
  return run.labelled(label);
}

test("导出菜单在缓存变成静态或缺行时，保留全部已保存译文及时间戳", async () => {
  const before = structuredClone(entry);
  // The editor may fall back to mounted DOM lines; export must use the cache.
  const run = createUiHarness({ track, entry, lyrics: [{ index: 0, text: "Mounted fallback" }],
    exportLyrics: async () => [{ index: 0, text: "First" }] });
  await run.open();

  (await exportAs(run, "导出仅原文")).click();
  assert.equal(await run.downloads[0]!.blob.text(), "First");
  assert.equal((await exportAs(run, "导出原文带时间戳")).disabled, true);
  (await exportAs(run, "导出仅翻译")).click();
  assert.equal(await run.downloads[1]!.blob.text(), "第一句\n第二句");
  (await exportAs(run, "导出翻译带时间戳")).click();
  assert.equal(await run.downloads[2]!.blob.text(), "[00:30.660]第一句\n[00:34.520]第二句");
  assert.deepEqual(entry, before);
  assert.equal(run.saved.length, 0, "exporting never changes saved translations");
});

test("导出期间切歌，仍按打开时的歌曲读取并生成文件名", async () => {
  let resolveLyrics!: (lyrics: LyricLine[]) => void;
  const run = createUiHarness({ track, entry, lyrics: [{ index: 0, text: "First", startTime: 30_660 }],
    exportLyrics: () => new Promise((resolve) => { resolveLyrics = resolve; }) });
  await run.open();
  run.button("导出").click();
  run.setTrack({ uri: "spotify:track:other", artist: "Other artist", title: "Other song" });
  resolveLyrics([{ index: 0, text: "First", startTime: 30_660 }]);
  await settle();

  run.labelled("导出原文带时间戳").click();
  assert.ok(run.requests.every((request) => request.uri === track.uri));
  assert.ok(run.requests.some((request) => request.source === "lyrics"));
  assert.ok(run.text().includes(track.title));
  assert.equal(run.downloads[0]!.filename, "Artist - Song_ One_ - 原文.lrc");
  assert.equal(await run.downloads[0]!.blob.text(), "[00:30.660]First");
});

test("有未保存修改时导出菜单说明译文来自上次保存，备份在保存前不可用", async () => {
  const run = createUiHarness({ track, lyrics: [{ index: 0, text: "First", startTime: 30_660 }] });
  await run.open();
  run.type(0, "第一句");
  await run.menu("导出");
  assert.match(run.text(), /有未保存的修改，译文导出的是上次保存的版本/);
  assert.equal(run.labelled("导出备份").disabled, true);
});
