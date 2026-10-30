import assert from "node:assert/strict";
import test from "node:test";
import type { LyricLine, TranslationEntry } from "../src/types.ts";
import { createUiHarness, defaultTrack as track, settle } from "./ui-harness.ts";

const lyrics: LyricLine[] = ["One", "Two", "Three"].map((text, index) => ({ index, text, startTime: 1000 * (index + 1) }));
const entry: TranslationEntry = { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1, lines: [
  { index: 0, originalText: "One", startTime: 1000, translatedText: "一" },
  { index: 1, originalText: "Two", startTime: 2000, translatedText: "二" },
  { index: 2, originalText: "Three", startTime: 3000, translatedText: "" },
] };

test("打开即是逐行编辑器：显示进度，未修改时不能保存", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  assert.equal(run.inputs().length, 3);
  assert.match(run.text(), /已翻译 2 \/ 3 行/);
  assert.equal(run.button("保存").disabled, true);
  run.type(2, "三");
  assert.match(run.text(), /已翻译 3 \/ 3 行/);
  assert.equal(run.status(), "有未保存的修改");
  assert.equal(run.button("保存").disabled, false);
  run.type(2, "");
  assert.equal(run.button("保存").disabled, true, "typing back to the saved text is not a change");
});

test("保存后编辑器保持打开，状态回到已保存", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  run.type(2, "三");
  run.button("保存").click();
  await settle();
  assert.equal(run.saved.length, 1);
  assert.equal(run.isOpen(), true);
  assert.notEqual(run.status(), "有未保存的修改");
  assert.equal(run.button("保存").disabled, true);
  assert.ok(run.notifications.some((value) => value.message === "翻译已保存"));
});

test("Ctrl/Cmd+S 保存，Enter 跳到下一句，输入法组字时的 Enter 不拦截", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  const [first, second] = run.inputs();
  const composing = first!.dispatch("keydown", { key: "Enter", isComposing: true });
  assert.equal(composing.defaultPrevented, false);
  const newline = first!.dispatch("keydown", { key: "Enter", shiftKey: true });
  assert.equal(newline.defaultPrevented, false, "Shift+Enter keeps a line break");
  const next = first!.dispatch("keydown", { key: "Enter" });
  assert.equal(next.defaultPrevented, true);
  assert.equal(run.active(), second);
  run.type(2, "三");
  run.inputs()[2]!.dispatch("keydown", { key: "s", ctrlKey: true });
  await settle();
  assert.equal(run.saved[0]!.lines[2]!.translatedText, "三");
});

test("关闭弹窗不丢修改：重新打开恢复草稿，也可以放弃", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  run.type(0, "改过的一");
  await run.open();
  assert.equal(run.inputs()[0]!.value, "改过的一");
  assert.match(run.banner().text(), /已恢复上次未保存的修改/);
  assert.equal(run.status(), "有未保存的修改");
  run.button("放弃修改").click();
  assert.equal(run.inputs()[0]!.value, "一");
  await run.open();
  assert.equal(run.inputs()[0]!.value, "一", "a discarded draft does not come back");
  assert.equal(run.banner().hidden, true);
});

test("导入自动识别格式并先进草稿；TXT 空行能对齐时作为占位；可撤销", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  run.setFile("甲\n\n丙\n", "translation.txt");
  run.button("导入").click();
  await settle();
  assert.deepEqual(run.inputs().map((input) => input.value), ["甲", "", "丙"]);
  assert.match(run.banner().text(), /已导入 3 行，与原歌词逐行对应/);
  assert.equal(run.saved.length, 0);
  run.button("撤销导入").click();
  assert.deepEqual(run.inputs().map((input) => input.value), ["一", "二", ""]);

  // Blank rows that do not line up are stanza breaks and are dropped.
  run.setFile("甲\n\n乙\n\n丙\n丁\n");
  run.button("导入").click();
  await settle();
  assert.deepEqual(run.inputs().map((input) => input.value), ["甲", "乙", "丙"]);
  assert.match(run.banner().text(), /已导入 4 行，但原歌词有 3 行，请检查是否错位/);

  run.setFile("[00:02.00]按时间的二\n", "translation.lrc");
  run.button("导入").click();
  await settle();
  assert.deepEqual(run.inputs().map((input) => input.value), ["", "按时间的二", ""]);
  assert.match(run.banner().text(), /已按时间戳匹配 1 \/ 3 行/);
});

test("粘贴多行依次填入后续行并说明结果", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  const paste = run.inputs()[1]!.dispatch("paste", { clipboardData: { getData: () => "乙\n丙\n多余\n" } });
  assert.equal(paste.defaultPrevented, true);
  assert.deepEqual(run.inputs().map((input) => input.value), ["一", "乙", "丙"]);
  assert.match(run.banner().text(), /已填入 2 行，剩余 1 行超出歌词末尾/);
});

test("删除需要在应用内确认，取消不删除", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  await run.menu("更多");
  run.labelled("删除这首歌的翻译").click();
  await settle();
  assert.ok(run.dialog(), "a confirmation dialog is shown");
  run.dialogButton("取消").click();
  await settle();
  assert.equal(run.dialog(), undefined);
  assert.deepEqual(run.deleted, []);

  await run.menu("更多");
  run.labelled("删除这首歌的翻译").click();
  await settle();
  run.dialogButton("删除").click();
  await settle();
  assert.deepEqual(run.deleted, [track.uri]);
  assert.deepEqual(run.inputs().map((input) => input.value), ["", "", ""]);
});

test("还没有原歌词时给出说明，仍可导入 JSON 备份", async () => {
  const run = createUiHarness({ lyrics: [] });
  await run.open();
  assert.match(run.text(), /还没有取得这首歌的原歌词/);
  run.setFile("一\n二\n", "translation.txt");
  run.button("导入").click();
  await settle();
  assert.match(run.notifications[0]!.message, /暂时只能导入 LyricLayer JSON 备份/);
  run.setFile(JSON.stringify({ lines: [{ originalText: "One", translatedText: "一" }] }));
  run.button("导入").click();
  await settle();
  assert.deepEqual(run.inputs().map((input) => input.value), ["一"]);
});

test("另一首歌的 JSON 备份需确认后保存到那首歌，不改动当前编辑器", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.open();
  run.setFile(JSON.stringify({ version: 1, trackUri: "spotify:track:other", title: "Other", createdAt: 5, updatedAt: 5,
    lines: [{ translatedText: "别的歌" }] }));
  run.button("导入").click();
  await settle();
  assert.match(run.dialog()!.text(), /《Other》/);
  run.dialogButton("保存到《Other》").click();
  await settle();
  assert.equal(run.saved[0]!.trackUri, "spotify:track:other");
  assert.deepEqual(run.inputs().map((input) => input.value), ["一", "二", ""]);
});
