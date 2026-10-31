import assert from "node:assert/strict";
import test from "node:test";
import type { LyricLine, TranslationEntry, TranslationLine } from "../src/types.ts";
import { createUiHarness, defaultTrack as track, settle } from "./ui-harness.ts";

const aligned = (index: number, originalText: string, translatedText: string): TranslationLine => ({
  index, originalText, translatedText,
  alignment: [{ sourceStart: 0, sourceEnd: 1, text: translatedText }],
});
const stored = (lines: TranslationLine[]): TranslationEntry => ({ version: 1, trackUri: track.uri, lines, createdAt: 1, updatedAt: 1 });

async function importJson(run: ReturnType<typeof createUiHarness>, value: unknown): Promise<void> {
  run.setFile(JSON.stringify(value));
  run.button("导入").click();
  await settle();
}

async function exportBackup(run: ReturnType<typeof createUiHarness>): Promise<{ lines: TranslationLine[]; trackUri: string; updatedAt: number }> {
  await run.menu("导出");
  run.labelled("导出备份").click();
  return JSON.parse(await run.downloads[run.downloads.length - 1]!.blob.text());
}

test("编辑保存保留未改文本的片段对齐，原文或译文改变时清除旧对齐", async () => {
  const original = [aligned(0, "One", "第一句"), aligned(1, "Two", "第二句"), aligned(2, "Three", "第三句")];
  const run = createUiHarness({ entry: stored(original), lyrics: [
    { index: 0, text: "One" }, { index: 1, text: "Two" }, { index: 2, text: "Changed third line" },
  ] });
  await run.open();
  run.type(1, "已修改的译文");
  run.button("保存").click();
  await settle();
  const saved = run.saved[0]!.lines;
  assert.deepEqual(saved[0]!.alignment, original[0]!.alignment);
  assert.equal(saved[1]!.alignment, undefined);
  assert.equal(saved[2]!.alignment, undefined);
  assert.equal(saved[2]!.originalText, "Changed third line");
  assert.equal(original[1]!.translatedText, "第二句");
});

test("动态跟随默认开启，切换即通知renderer且重新打开面板保留选择", async () => {
  for (const blockStorage of [false, true]) {
    const run = createUiHarness({ blockStorage });
    await run.open();
    await run.menu("更多");
    const toggle = run.labelled("译文动态跟随");
    assert.equal(toggle.checked, true);
    toggle.checked = false;
    toggle.dispatch("change");
    assert.deepEqual(run.events, ["lyric-layer-animation-change"]);
    if (!blockStorage) assert.equal([...run.preferences.values()][0], "false");
    await run.open();
    await run.menu("更多");
    assert.equal(run.labelled("译文动态跟随").checked, false);
  }
});

test("可视化编辑应用草稿并保留其他行未保存内容，最终保存时保留时间与动画", async () => {
  const source: LyricLine[] = [{ index: 0, text: "hold light", startTime: 1000, endTime: 5000,
    syllables: [{ text: "hold", startTime: 1000, endTime: 3000 }, { text: "light", startTime: 3000, endTime: 5000 }] },
  { index: 1, text: "next" }];
  const run = createUiHarness({ lyrics: source, entry: stored([
    { index: 0, originalText: "hold light", translatedText: "握紧光" },
    { index: 1, originalText: "next", translatedText: "下一句" },
  ]) });
  await run.open();
  run.type(1, "另一行草稿");
  run.labelled("调整第 1 行的对齐与动画").click();
  const draft: TranslationLine = { ...run.visual().translation, translatedText: " 握紧光 ",
    alignment: [{ sourceStart: 0, sourceEnd: 2, text: " 握紧光 ", startTime: 1200, endTime: 4800 }],
    motion: { amplitude: 1.3, stagger: 0.2, settleMs: 450 } };
  run.visual().onApply(draft);
  assert.equal(run.saved.length, 0, "visual Apply changes the editor draft, not storage");
  assert.equal(run.inputs()[1]!.value, "另一行草稿");
  assert.equal(run.labelled("调整第 1 行的对齐与动画").dataset.custom, "true");
  run.button("保存").click();
  await settle();
  assert.deepEqual(run.saved[0]!.lines[0], draft);
  assert.equal(run.saved[0]!.lines[1]!.translatedText, "另一行草稿");
  await run.open();
  run.labelled("调整第 1 行的对齐与动画").click();
  assert.deepEqual(JSON.parse(JSON.stringify(run.visual().translation.motion)), draft.motion);
  assert.deepEqual(run.visual().translation.alignment, draft.alignment);
});

test("取消可视化编辑保留文本草稿，不改保存数据", async () => {
  const run = createUiHarness({ entry: stored([aligned(0, "One", "第一句")]), lyrics: [{ index: 0, text: "One" }] });
  await run.open();
  run.type(0, "暂未保存");
  run.labelled("调整第 1 行的对齐与动画").click();
  assert.equal(run.visual().translation.translatedText, "暂未保存");
  assert.equal(run.visual().translation.alignment, undefined);
  run.visual().onClose();
  assert.equal(run.inputs()[0]!.value, "暂未保存");
  assert.equal(run.saved.length, 0);
});

test("JSON对齐数据经导入规范化后保存，导出备份仍保留片段", async () => {
  const line = aligned(0, "One", "第一句");
  const run = createUiHarness({ lyrics: [{ index: 0, text: "One" }] });
  await run.open();
  await importJson(run, { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1,
    lines: [{ ...line, ignoredField: "discard me" }] });
  assert.equal(run.saved.length, 0, "an import is a draft until saved");
  run.button("保存").click();
  await settle();
  assert.deepEqual(run.saved[0]!.lines, [line]);
  await run.open();
  assert.deepEqual((await exportBackup(run)).lines, [line]);
});

test("新JSON片段未附原文时绑定当前歌词，首次导入不丢对齐", async () => {
  const line = aligned(0, "One", "第一句");
  const { originalText: _originalText, ...unbound } = line;
  const run = createUiHarness({ lyrics: [{ index: 0, text: "One" }] });
  await run.open();
  await importJson(run, { lines: [unbound] });
  run.button("保存").click();
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
    const run = createUiHarness({ lyrics: source });
    await run.open();
    await importJson(run, { ...(fullBackup
      ? { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1 } : {}), lines: [line] });
    assert.match(run.banner().text(), /已导入/);
    run.button("保存").click();
    await settle();
    assert.equal(run.saved.length, 1);
    assert.deepEqual(run.saved[0]!.lines, [line]);
    assert.ok(run.notifications.every(value => !value.isError));
    await run.open();
    const backup = await exportBackup(run);
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
    const run = createUiHarness({ lyrics: source, entry: stored([savedLine]) });
    await run.open();
    await importJson(run, { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1, lines: [{
      index: 0, startTime: 1000, originalText: "hold light", translatedText: "越界译文",
      alignment: [{ sourceStart: 0, sourceEnd: 2, text: "越界译文", startTime, endTime }],
      motion: { amplitude: 1.8, stagger: 0.6, settleMs: 800 },
    }] });
    assert.equal(run.saved.length, 0, "invalid import must never call storage.save");
    assert.equal(run.notifications.length, 1);
    assert.equal(run.notifications[0]!.isError, true);
    assert.match(run.notifications[0]!.message, /第 1 行.*手动时间.*原行 1000–5000/);
    assert.equal(run.inputs()[0]!.value, "原保存译文", "a rejected file leaves the editor untouched");
    assert.equal(run.button("保存").disabled, true);
    const unchanged = await exportBackup(run);
    assert.deepEqual(unchanged.lines, [savedLine]);
    assert.equal(unchanged.updatedAt, 1);
  }
});

test("逐句面板：弹窗收起，草稿连同其他未保存行实时显示在歌词页，结束后恢复已保存显示", async () => {
  const run = createUiHarness({ entry: stored([aligned(0, "One", "一"), aligned(1, "Two", "二")]),
    lyrics: [{ index: 0, text: "One" }, { index: 1, text: "Two" }] });
  await run.open();
  run.type(0, "改过的一");
  run.labelled("调整第 2 行的对齐与动画").click();
  assert.equal(run.isOpen(), false, "the modal gives way to the real lyrics page");
  assert.equal(run.panelOpen(), true);
  assert.equal(run.visual().title, "第 2 行");
  assert.deepEqual({ ...run.visual().canNavigate }, { previous: true, next: false });
  run.visual().onChange!({ ...run.visual().translation, translatedText: "草稿二" });
  const shown = run.previews[run.previews.length - 1]!;
  assert.deepEqual(shown.map(line => line.translatedText), ["改过的一", "草稿二"]);
  assert.equal(shown[1]!.originalText, "Two");
  run.visual().onClose();
  assert.equal(run.panelOpen(), false);
  assert.equal(run.previews[run.previews.length - 1], undefined, "closing shows the saved translation again");
  assert.equal(run.isOpen(), true);
  assert.equal(run.inputs()[1]!.value, "二");
  assert.equal(run.saved.length, 0);
});

test("逐句面板：上一句/下一句会先应用当前草稿，再打开相邻行", async () => {
  const run = createUiHarness({ entry: stored([aligned(0, "One", "一"), aligned(1, "Two", "二")]),
    lyrics: [{ index: 0, text: "One" }, { index: 1, text: "Two" }] });
  await run.open();
  run.labelled("调整第 1 行的对齐与动画").click();
  assert.deepEqual({ ...run.visual().canNavigate }, { previous: false, next: true });
  run.visual().onNavigate!(1, { index: 0, translatedText: "新的一", motion: { amplitude: 0 } });
  assert.equal(run.visual().title, "第 2 行");
  assert.equal(run.visual().translation.translatedText, "二");
  run.visual().onApply({ index: 1, translatedText: "新的二" });
  assert.deepEqual(run.inputs().map(input => input.value), ["新的一", "新的二"]);
  assert.equal(run.status(), "有未保存的修改");
  run.button("保存").click();
  await settle();
  assert.equal(run.saved[0]!.lines[0]!.motion?.amplitude, 0);
});
