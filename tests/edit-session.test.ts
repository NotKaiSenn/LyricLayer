import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { LyricLine, TrackInfo, TranslationEntry, TranslationLine } from "../src/types.ts";

// edit-session has value imports of sibling modules; bundle it like the other suites.
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/edit-session.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "neutral" });
const { EditSession, exportChoices } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0]!.text).toString("base64")}`) as typeof import("../src/edit-session.ts");

const track: TrackInfo = { uri: "spotify:track:example", title: "Song: One?", artist: "Artist" };
const stored = (lines: TranslationLine[], updatedAt = 1): TranslationEntry =>
  ({ version: 1, trackUri: track.uri, lines, createdAt: 1, updatedAt });
const aligned = (index: number, originalText: string, translatedText: string): TranslationLine => ({
  index, originalText, translatedText, alignment: [{ sourceStart: 0, sourceEnd: 1, text: translatedText }],
});
const plain = (texts: string[]): LyricLine[] => texts.map((text, index) => ({ index, text, startTime: 1000 * (index + 1) }));
const held: LyricLine[] = [{ index: 0, text: "hold light", startTime: 1000, endTime: 5000,
  syllables: [{ text: "hold", startTime: 1000, endTime: 3000 }, { text: "light", startTime: 3000, endTime: 5000 }] }];
const json = (value: unknown) => JSON.stringify(value);

test("保存过程中继续输入保留新草稿，保存基线只推进到已写入版本", () => {
  const session = new EditSession(track, plain(["Repeat", "Repeat"]));
  session.setValue(0, "已提交");
  const pending = session.toEntry();
  session.setValue(0, "继续输入");
  session.setValue(1, "另一处重复句");
  session.markSaved(pending);
  assert.equal(session.dirty, true);
  assert.deepEqual(session.values, ["继续输入", "另一处重复句"]);
  assert.equal(session.saved?.lines[0]?.translatedText, "已提交");
  session.markSaved(session.toEntry());
  assert.equal(session.dirty, false);
});

test("同样的歌词文本但时间或行号变化时不恢复旧定位草稿", () => {
  const session = new EditSession(track, plain(["Repeat", "Repeat"]));
  const state = session.snapshot();
  state.lines[1]!.startTime = 10000;
  assert.equal(session.fits(state), false);
});

test("保存保留未改文本的片段对齐，原文或译文改变时清除旧对齐", () => {
  const original = [aligned(0, "One", "第一句"), aligned(1, "Two", "第二句"), aligned(2, "Three", "第三句")];
  const session = new EditSession(track, [{ index: 0, text: "One" }, { index: 1, text: "Two" }, { index: 2, text: "Changed third line" }],
    stored(original));
  session.setValue(1, "已修改的译文");
  const saved = session.toEntry().lines;
  assert.deepEqual(saved[0]!.alignment, original[0]!.alignment);
  assert.equal(saved[1]!.alignment, undefined);
  assert.equal(saved[2]!.alignment, undefined);
  assert.equal(saved[2]!.originalText, "Changed third line");
  assert.equal(original[1]!.translatedText, "第二句");
});

test("未改动不算修改，改回原文本也不算", () => {
  const session = new EditSession(track, plain(["One", "Two"]), stored([aligned(0, "One", "一")]));
  assert.equal(session.dirty, false);
  assert.equal(session.filled(), 1);
  session.setValue(1, "二");
  assert.equal(session.dirty, true);
  session.setValue(1, "");
  assert.equal(session.dirty, false);
});

test("逐句编辑的草稿保留时间与动画，同时保留其他行未保存的文字", () => {
  const session = new EditSession(track, [...held, { index: 1, text: "next" }], stored([
    { index: 0, originalText: "hold light", translatedText: "握紧光" },
    { index: 1, originalText: "next", translatedText: "下一句" },
  ]));
  session.setValue(1, "另一行草稿");
  const draft: TranslationLine = { ...session.lineDraft(0), translatedText: " 握紧光 ",
    alignment: [{ sourceStart: 0, sourceEnd: 2, text: " 握紧光 ", startTime: 1200, endTime: 4800 }],
    motion: { amplitude: 1.3, stagger: 0.2, settleMs: 450 } };
  session.setLine(0, draft);
  const entry = session.toEntry();
  assert.deepEqual(entry.lines[0], { ...draft, index: 0, originalText: "hold light", startTime: 1000 });
  assert.equal(entry.lines[1]!.translatedText, "另一行草稿");
  session.markSaved(entry);
  assert.equal(session.dirty, false);
  assert.deepEqual(session.lineDraft(0).motion, draft.motion);
  assert.deepEqual(session.lineDraft(0).alignment, draft.alignment);
});

test("改过文字的行进入逐句编辑时不带旧对齐", () => {
  const session = new EditSession(track, [{ index: 0, text: "One" }], stored([aligned(0, "One", "第一句")]));
  session.setValue(0, "暂未保存");
  assert.equal(session.lineDraft(0).translatedText, "暂未保存");
  assert.equal(session.lineDraft(0).alignment, undefined);
});

test("逐句编辑的无效时间在保存时被拒绝", () => {
  const session = new EditSession(track, held);
  session.setLine(0, { translatedText: "越界",
    alignment: [{ sourceStart: 0, sourceEnd: 2, text: "越界", startTime: 900, endTime: 4900 }] });
  assert.throws(() => session.toEntry(), /第 1 行.*手动时间.*原行 1000–5000/);
});

test("JSON 对齐数据导入后规范化，未附原文时绑定当前歌词", () => {
  const line = aligned(0, "One", "第一句");
  const { originalText: _originalText, ...unbound } = line;
  for (const value of [
    { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1, lines: [{ ...line, ignoredField: "discard me" }] },
    { lines: [unbound] },
  ]) {
    const session = new EditSession(track, [{ index: 0, text: "One" }]);
    const outcome = session.import({}, json(value));
    assert.deepEqual(outcome, { kind: "lines", message: "已导入 JSON 备份中的 1 行译文" });
    assert.deepEqual(JSON.parse(json(session.toEntry().lines)), [line]);
  }
});

test("JSON 手动时间与动画参数完整保留，包括小数毫秒和原样译文", () => {
  const line: TranslationLine = { index: 0, startTime: 1000, originalText: "hold light", translatedText: " 握紧 光 \n",
    alignment: [
      { sourceStart: 0, sourceEnd: 1, text: " 握紧 ", startTime: 1250.5, endTime: 2650.25 },
      { sourceStart: 1, sourceEnd: 2, text: "光 \n", startTime: 3150.75, endTime: 4800.5 },
    ], motion: { amplitude: 1.65, stagger: 0.65, settleMs: 750 } };
  for (const fullBackup of [true, false]) {
    const session = new EditSession(track, held);
    session.import({ name: "backup.json" }, json({ ...(fullBackup
      ? { version: 1, trackUri: track.uri, createdAt: 1, updatedAt: 1 } : {}), lines: [line] }));
    const entry = session.toEntry();
    assert.deepEqual(entry.lines, [line]);
    const backup = exportChoices(track, held, entry).find(choice => choice.ariaLabel === "导出备份")!;
    assert.deepEqual(JSON.parse(backup.file!.text).lines, [line]);
  }
});

test("当前歌曲 JSON 手动时间超出真实行边界时拒绝导入，草稿保持不变", () => {
  // The provider's syllables extend beyond its line bounds. Import validation
  // must use the actual line bounds, not merely accept the wider syllable span.
  const source: LyricLine[] = [{ ...held[0]!, syllables: [{ text: "hold", startTime: 500, endTime: 3000 },
    { text: "light", startTime: 3000, endTime: 5500 }] }];
  for (const [startTime, endTime] of [[900, 4900], [1100, 5100]]) {
    const session = new EditSession(track, source, stored([{ index: 0, originalText: "hold light", translatedText: "原保存译文" }]));
    assert.throws(() => session.import({}, json({ lines: [{ index: 0, originalText: "hold light", translatedText: "越界译文",
      alignment: [{ sourceStart: 0, sourceEnd: 2, text: "越界译文", startTime, endTime }] }] })),
    /第 1 行.*手动时间.*原行 1000–5000/);
    assert.deepEqual(session.values, ["原保存译文"]);
    assert.equal(session.dirty, false);
  }
});

test("TXT 空行能对齐时作为占位，否则当作段落空行；LRC 按时间匹配", () => {
  const session = new EditSession(track, plain(["One", "Two", "Three"]));
  assert.equal(session.import({ name: "a.txt" }, "甲\n\n丙\n").kind, "lines");
  assert.deepEqual(session.values, ["甲", "", "丙"]);
  assert.deepEqual(session.import({}, "甲\n\n乙\n\n丙\n丁\n"),
    { kind: "lines", message: "已导入 4 行，但原歌词有 3 行，请检查是否错位" });
  assert.deepEqual(session.values, ["甲", "乙", "丙"]);
  assert.deepEqual(session.import({ name: "a.lrc" }, "[00:02.00]按时间的二\n"),
    { kind: "lines", message: "已按时间戳匹配 1 / 3 行" });
  assert.deepEqual(session.values, ["", "按时间的二", ""]);
});

test("没有原歌词时只接受 JSON 备份", () => {
  const session = new EditSession(track, []);
  assert.throws(() => session.import({ name: "a.txt" }, "一\n"), /暂时只能导入 LyricLayer JSON 备份/);
  session.import({}, json({ lines: [{ originalText: "One", translatedText: "一" }] }));
  assert.deepEqual(session.values, ["一"]);
});

test("另一首歌的 JSON 备份交给调用方确认，不改动当前草稿", () => {
  const session = new EditSession(track, plain(["One"]), stored([aligned(0, "One", "一")]));
  const outcome = session.import({}, json({ version: 1, trackUri: "spotify:track:other", title: "Other",
    createdAt: 5, updatedAt: 5, lines: [{ translatedText: "别的歌" }] }));
  assert.equal(outcome.kind, "other-track");
  assert.equal(outcome.kind === "other-track" && outcome.name, "《Other》");
  assert.equal(outcome.kind === "other-track" && outcome.entry.trackUri, "spotify:track:other");
  assert.deepEqual(session.values, ["一"]);
});

test("粘贴多行从当前行依次填入，超出部分报告数量", () => {
  const session = new EditSession(track, plain(["One", "Two", "Three"]));
  assert.deepEqual(session.fillFrom(1, ["乙", "丙", "多余"]), { filled: 2, overflow: 1 });
  assert.deepEqual(session.values, ["", "乙", "丙"]);
});

test("草稿快照只在同一保存版本和歌词下恢复，也可以放弃", () => {
  const session = new EditSession(track, plain(["One", "Two"]), stored([aligned(0, "One", "一")]));
  session.setValue(0, "改过的一");
  const draft = session.snapshot();
  const reopened = new EditSession(track, plain(["One", "Two"]), stored([aligned(0, "One", "一")]));
  assert.equal(reopened.fits(draft), true);
  reopened.restore(draft);
  assert.equal(reopened.values[0], "改过的一");
  reopened.discard();
  assert.equal(reopened.values[0], "一");
  assert.equal(new EditSession(track, plain(["One", "Two"]), stored([], 2)).fits(draft), false);
  assert.equal(new EditSession(track, plain(["Changed", "Two"]), stored([aligned(0, "One", "一")])).fits(draft), false);
});

test("导出在缓存变成静态或缺行时，保留全部已保存译文及时间戳", () => {
  const entry = stored([
    { index: 0, startTime: 30_660, originalText: "First", translatedText: "第一句" },
    { index: 1, startTime: 34_520, originalText: "Second", translatedText: "第二句" },
  ]);
  const choices = exportChoices(track, [{ index: 0, text: "First" }], entry);
  const pick = (label: string) => choices.find(choice => choice.ariaLabel === label)!;
  assert.equal(pick("导出仅原文").file!.text, "First");
  assert.equal(pick("导出原文带时间戳").file, undefined);
  assert.match(pick("导出原文带时间戳").detail, /时间戳/);
  assert.equal(pick("导出仅翻译").file!.text, "第一句\n第二句");
  assert.equal(pick("导出翻译带时间戳").file!.text, "[00:30.660]第一句\n[00:34.520]第二句");
  assert.equal(pick("导出原文带时间戳").ariaLabel, "导出原文带时间戳");
  const timed = exportChoices(track, [{ index: 0, text: "First", startTime: 30_660 }], entry);
  assert.equal(timed.find(choice => choice.ariaLabel === "导出原文带时间戳")!.file!.filename, "Artist - Song_ One_ - 原文.lrc");
  assert.equal(exportChoices(track, [], undefined).find(choice => choice.ariaLabel === "导出备份")!.file, undefined);
});
