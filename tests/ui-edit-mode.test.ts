import assert from "node:assert/strict";
import test from "node:test";
import type { LyricLine, TranslationEntry, TranslationLine } from "../src/types.ts";
import { createUiHarness, defaultTrack as track, settle } from "./ui-harness.ts";

const lyrics: LyricLine[] = ["One", "Two", "Three"].map((text, index) => ({ index, text, startTime: 1000 * (index + 1), endTime: 1000 * (index + 2) }));
const entry: TranslationEntry = { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1, lines: [
  { index: 0, originalText: "One", startTime: 1000, translatedText: "一" },
  { index: 1, originalText: "Two", startTime: 2000, translatedText: "二" },
  { index: 2, originalText: "Three", startTime: 3000, translatedText: "" },
] };
const lastPreview = (run: ReturnType<typeof createUiHarness>) => run.previews[run.previews.length - 1];
const texts = (lines: TranslationLine[] | undefined) => lines?.map(line => line.translatedText);

test("进入编辑模式：页面变成编辑器，工具栏显示进度，空行显示占位，未修改不能保存", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  assert.ok(run.toolbar());
  assert.deepEqual(run.modes, [true]);
  assert.equal(run.hooks()?.placeholder, "点击输入译文");
  assert.equal(run.progress(), "已翻译 2 / 3 行");
  assert.equal(run.status(), "已保存");
  assert.equal(run.button("保存").disabled, true);
  assert.deepEqual(texts(lastPreview(run)), ["一", "二", ""]);
});

test("点击译文：原生跳转到该句，在原位出现输入框并暂停播放；输入实时显示在歌词页", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  run.clickLine(2);
  assert.deepEqual(run.nativeClicks, [2], "the click also seeks like a native one");
  assert.equal(run.editingIndex(), 2);
  assert.equal(run.player.playing, false);
  assert.equal(run.active(), run.editorInput());
  run.type("三");
  assert.equal(run.progress(), "已翻译 3 / 3 行");
  assert.equal(run.status(), "未保存");
  assert.equal(run.button("保存").disabled, false);
  assert.deepEqual(texts(lastPreview(run)), ["一", "二", "三"]);
  run.type("");
  assert.equal(run.button("保存").disabled, true, "typing back to the saved text is not a change");
});

test("Enter 跳到下一句但不移动播放位置；Shift+Enter 与输入法组字不拦截；Esc 结束输入", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  run.clickLine(0);
  assert.equal(run.key("Enter", { isComposing: true }).defaultPrevented, false);
  assert.equal(run.key("Enter", { shiftKey: true }).defaultPrevented, false);
  assert.equal(run.key("Enter").defaultPrevented, true);
  assert.equal(run.editingIndex(), 1);
  assert.equal(run.editorInput().value, "二");
  assert.deepEqual(run.player.seeks, [], "keyboard moves never re-seek a paused player");
  run.key("Escape");
  assert.equal(run.editingIndex(), undefined);
  assert.ok(run.toolbar(), "Escape only ends typing, not edit mode");
});

test("在别处按下会结束输入；Ctrl/Cmd+S 保存且保持在编辑模式", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  run.clickLine(2);
  run.type("三");
  run.pressOutside();
  assert.equal(run.editingIndex(), undefined);
  assert.equal(run.documentKey("s", { metaKey: true }).defaultPrevented, true);
  await settle();
  assert.equal(run.saved[0]!.lines[2]!.translatedText, "三");
  assert.ok(run.toolbar());
  assert.equal(run.status(), "已保存");
  assert.ok(run.notifications.some(value => value.message === "翻译已保存"));
});

test("退出编辑：有修改时可继续编辑、放弃或保存并退出；没有修改直接退出", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  run.clickLine(2);
  run.type("三");
  run.button("退出编辑").click();
  await settle();
  run.dialogButton("继续编辑").click();
  await settle();
  assert.ok(run.toolbar());
  run.button("退出编辑").click();
  await settle();
  run.dialogButton("保存并退出").click();
  await settle();
  assert.equal(run.saved.length, 1);
  assert.equal(run.toolbar(), undefined);
  assert.equal(run.hooks(), undefined);
  assert.equal(lastPreview(run), undefined, "the page shows the saved translation again");
  assert.deepEqual(run.modes, [true, false]);

  await run.enter();
  run.clickLine(0);
  run.type("不要了");
  run.button("退出编辑").click();
  await settle();
  run.dialogButton("放弃修改").click();
  await settle();
  assert.equal(run.toolbar(), undefined);
  await run.enter();
  assert.equal(run.status(), "已保存", "a discarded draft does not come back");
  run.button("退出编辑").click();
  await settle();
  assert.equal(run.dialog(), undefined);
  assert.equal(run.toolbar(), undefined);
});

test("连续快速点击按钮：只进入一次，退出确认框也只弹一个", async () => {
  const run = createUiHarness({ entry, lyrics });
  await Promise.all([run.ui.toggle(), run.ui.toggle(), run.ui.toggle()]);
  await settle();
  assert.deepEqual(run.modes, [true]);
  run.clickLine(2);
  run.type("三");
  void run.ui.toggle();
  void run.ui.toggle();
  await settle();
  assert.equal(run.notifications.length, 0);
  run.dialogButton("继续编辑").click();
  await settle();
  assert.equal(run.dialog(), undefined);
  assert.ok(run.toolbar());
});

test("切歌时退出编辑并暂存修改，回到这首歌可恢复或放弃", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  run.clickLine(0);
  run.type("改过的一");
  run.ui.trackChanged("spotify:track:other");
  assert.equal(run.toolbar(), undefined);
  assert.match(run.notifications[0]!.message, /未保存的修改已暂存/);
  await run.enter();
  assert.match(run.banner().text(), /已恢复上次未保存的修改/);
  assert.equal(run.status(), "未保存");
  run.button("放弃修改").click();
  assert.equal(run.status(), "已保存");
  assert.deepEqual(texts(lastPreview(run)), ["一", "二", ""]);
});

test("对齐与动画在那一句下方展开：改动实时生效，上一句/下一句连续切换不会卡住", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  run.clickLine(0);
  run.labelled("对齐与动画").click();
  assert.equal(run.editingIndex(), 0, "it unfolds in place, under the same line");
  assert.ok(run.hooks()!.editing!.element.classList.contains("expanded"), "the plain field gives way to the line editor");
  assert.equal(run.hooks()!.editing!.after, true, "unfolded under the line, which keeps its own text and preview");
  assert.equal(run.panelOpen(), true);
  assert.equal(run.panel().title, "第 1 行");
  assert.deepEqual({ ...run.panel().canNavigate }, { previous: false, next: true });
  const changed: TranslationLine = { index: 0, translatedText: "新的一", motion: { amplitude: 0 } };
  run.panel().onChange!(changed);
  assert.equal(run.status(), "未保存");
  assert.deepEqual(texts(lastPreview(run)), ["新的一", "二", ""]);
  // The editor hands over its current draft each time; switching back and forth must keep working.
  run.panel().onNavigate!(1, changed);
  for (let step = 1; step < 4; step++) {
    const delta = step % 2 ? -1 : 1;
    run.panel().onNavigate!(delta, run.panel().translation);
  }
  assert.equal(run.panel().title, "第 1 行");
  assert.equal(run.panel().translation.translatedText, "新的一");
  run.panel().onNavigate!(1, run.panel().translation);
  assert.equal(run.panel().title, "第 2 行");
  assert.equal(run.editingIndex(), 1, "the unfolded editor moves to the next line");
  assert.deepEqual(run.player.seeks, [], "panel navigation does not seek");
  run.clickLine(2);
  assert.equal(run.panel().title, "第 3 行", "clicking another line moves the open editor there");
  assert.equal(run.editingIndex(), 2);
  run.panel().onClose();
  assert.equal(run.panelOpen(), false);
  assert.equal(run.editingIndex(), 2, "folding returns to the plain field of the same line");
  assert.equal(run.hooks()!.editing!.element.classList.contains("expanded"), false);
  assert.equal(run.hooks()!.editing!.after, false);
  assert.equal(run.active(), run.editorInput());
  run.documentKey("s", { ctrlKey: true });
  await settle();
  assert.equal(run.saved[0]!.lines[0]!.motion?.amplitude, 0);
});

test("导入先进草稿并可撤销；无效 JSON 不改动；另一首歌的备份确认后存到那首歌", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  run.setFile("甲\n\n丙\n", "translation.txt");
  run.button("导入").click();
  await settle();
  assert.deepEqual(texts(lastPreview(run)), ["甲", "", "丙"]);
  assert.match(run.banner().text(), /已导入 3 行，与原歌词逐行对应/);
  assert.equal(run.saved.length, 0);
  run.button("撤销导入").click();
  assert.deepEqual(texts(lastPreview(run)), ["一", "二", ""]);

  run.setFile("{ not json");
  run.button("导入").click();
  await settle();
  assert.equal(run.notifications[run.notifications.length - 1]!.isError, true);
  assert.equal(run.status(), "已保存");

  run.setFile(JSON.stringify({ version: 1, trackUri: "spotify:track:other", title: "Other", createdAt: 5, updatedAt: 5,
    lines: [{ translatedText: "别的歌" }] }));
  run.button("导入").click();
  await settle();
  assert.match(run.dialog()!.text(), /《Other》/);
  run.dialogButton("保存到《Other》").click();
  await settle();
  assert.equal(run.saved[0]!.trackUri, "spotify:track:other");
  assert.deepEqual(texts(lastPreview(run)), ["一", "二", ""]);
});

test("导出菜单列出各格式；有未保存修改时说明，备份在保存前不可用", async () => {
  const run = createUiHarness({ lyrics });
  await run.enter();
  run.clickLine(0);
  run.type("一");
  await run.menu("导出");
  assert.match(run.text(), /有未保存的修改，译文导出的是上次保存的版本/);
  assert.equal(run.labelled("导出备份").disabled, true);
  run.labelled("导出原文带时间戳").click();
  assert.equal(await run.downloads[0]!.blob.text(), "[00:01.000]One\n[00:02.000]Two\n[00:03.000]Three");
});

test("删除需要确认；删除后仍在编辑模式，内容清空", async () => {
  const run = createUiHarness({ entry, lyrics });
  await run.enter();
  await run.menu("更多");
  run.labelled("删除这首歌的翻译").click();
  await settle();
  run.dialogButton("取消").click();
  await settle();
  assert.deepEqual(run.deleted, []);
  await run.menu("更多");
  run.labelled("删除这首歌的翻译").click();
  await settle();
  run.dialogButton("删除").click();
  await settle();
  assert.deepEqual(run.deleted, [track.uri]);
  assert.ok(run.toolbar());
  assert.deepEqual(texts(lastPreview(run)), ["", "", ""]);
});

test("动态跟随默认开启，在更多菜单里切换并记住", async () => {
  for (const blockStorage of [false, true]) {
    const run = createUiHarness({ blockStorage, lyrics });
    await run.enter();
    await run.menu("更多");
    const toggle = run.labelled("译文动态跟随");
    assert.equal(toggle.checked, true);
    toggle.checked = false;
    toggle.dispatch("change");
    assert.deepEqual(run.events, ["lyric-layer-animation-change"]);
    if (!blockStorage) assert.equal([...run.preferences.values()][0], "false");
    await run.menu("更多");
    await run.menu("更多");
    assert.equal(run.labelled("译文动态跟随").checked, false);
  }
});

test("没有歌词页或原歌词时不进入编辑模式，并说明原因", async () => {
  const noPage = createUiHarness({ lyrics, noPage: true });
  await noPage.enter();
  assert.equal(noPage.toolbar(), undefined);
  assert.match(noPage.notifications[0]!.message, /歌词页/);
  const noLyrics = createUiHarness({ lyrics: [] });
  await noLyrics.enter();
  assert.equal(noLyrics.toolbar(), undefined);
  assert.match(noLyrics.notifications[0]!.message, /还没有取得这首歌的原歌词/);
});

test("歌词页关闭或变成小窗时退出编辑并暂存修改", async () => {
  for (const cardMode of [false, true]) {
    const run = createUiHarness({ entry, lyrics });
    await run.enter();
    run.clickLine(0);
    run.type("改过的一");
    run.ui.pageChanged();
    assert.ok(run.toolbar(), "nothing happens while the page is still there");
    run.closePage(cardMode);
    run.ui.pageChanged();
    assert.equal(run.ui.active, false);
    assert.equal(run.hooks(), undefined);
    assert.match(run.notifications[0]!.message, /歌词页已关闭，未保存的修改已暂存/);
    if (cardMode) {
      await run.enter();
      assert.equal(run.ui.active, false, "the small card is not an editing surface");
      assert.match(run.notifications[1]!.message, /完整歌词页/);
    }
  }
});
