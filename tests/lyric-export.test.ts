import assert from "node:assert/strict";
import test from "node:test";
import { exportLyrics } from "../src/lyric-export.ts";
import type { TranslationLine } from "../src/types.ts";

const lines: TranslationLine[] = [
  { startTime: 30_660, originalText: "I've taken time away from the heartache", translatedText: "我花了些时间远离心痛" },
  { startTime: 60_820, originalText: "Come and go", translatedText: "来来去去" },
];

test("导出原文和翻译的 TXT，每行只包含所选文本", () => {
  assert.deepEqual(exportLyrics(lines, "original"), {
    text: "I've taken time away from the heartache\nCome and go",
    extension: "txt",
    lineCount: 2,
  });
  assert.deepEqual(exportLyrics(lines, "translation"), {
    text: "我花了些时间远离心痛\n来来去去",
    extension: "txt",
    lineCount: 2,
  });
});

test("导出原文和翻译的 LRC，时间戳固定保留三位毫秒", () => {
  assert.deepEqual(exportLyrics(lines, "original-timed"), {
    text: "[00:30.660]I've taken time away from the heartache\n[01:00.820]Come and go",
    extension: "lrc",
    lineCount: 2,
  });
  assert.deepEqual(exportLyrics(lines, "translation-timed"), {
    text: "[00:30.660]我花了些时间远离心痛\n[01:00.820]来来去去",
    extension: "lrc",
    lineCount: 2,
  });
});

test("空白翻译不导出，不回退为原文，也不要求空白行有时间戳", () => {
  const partiallyTranslated = [
    { originalText: "Missing translation", translatedText: " \n\u200B " },
    ...lines,
    { originalText: "Still untranslated", translatedText: "" },
  ];
  assert.equal(exportLyrics(partiallyTranslated, "translation").text, "我花了些时间远离心痛\n来来去去");
  assert.equal(exportLyrics(partiallyTranslated, "translation-timed").lineCount, 2);
  assert.equal(exportLyrics(partiallyTranslated, "original").lineCount, 4);
});

test("缺失、负数和非有限时间戳导致整个带时间戳导出失败", () => {
  for (const startTime of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const invalid = [...lines, { startTime, originalText: "No timestamp", translatedText: "没有时间戳" }];
    for (const mode of ["original-timed", "translation-timed"] as const) {
      assert.throws(() => exportLyrics(invalid, mode), /第 3 行歌词缺少有效时间戳/);
    }
    assert.equal(exportLyrics(invalid, "original").lineCount, 3);
    assert.equal(exportLyrics(invalid, "translation").lineCount, 3);
  }
});

test("零时间可导出，先四舍五入再处理秒和分钟进位，允许超过 99 分钟", () => {
  const timed = [0, 999.6, 59_999.6, 100 * 60_000 + 1.2].map((startTime) => ({
    startTime, originalText: "Line", translatedText: "译文",
  }));
  assert.equal(exportLyrics(timed, "original-timed").text,
    "[00:00.000]Line\n[00:01.000]Line\n[01:00.000]Line\n[100:00.001]Line");
});

test("清除零宽字符和首尾空白，将内嵌换行合并为一行，保留字面标点", () => {
  const dirty = [{
    originalText: " \u200B(<Maybe yes,\r\n  maybe no>)\u200D\u2060\uFEFF ",
    translatedText: " \u200C也许是\n\n  也许不是\u2028  你知道吗？ ",
  }];
  assert.equal(exportLyrics(dirty, "original").text, "(<Maybe yes, maybe no>)");
  assert.equal(exportLyrics(dirty, "translation").text, "也许是 也许不是 你知道吗？");
});

test("按传入顺序导出并保留重复歌词和时间戳，不修改源数据", () => {
  const repeated = Object.freeze([
    Object.freeze({ index: 4, startTime: 10_000, originalText: "Repeat", translatedText: "重复" }),
    Object.freeze({ index: 0, startTime: 1_000, originalText: "Before", translatedText: "之前" }),
    Object.freeze({ index: 5, startTime: 10_000, originalText: "Repeat", translatedText: "重复" }),
  ]);
  assert.equal(exportLyrics(repeated, "original-timed").text,
    "[00:10.000]Repeat\n[00:01.000]Before\n[00:10.000]Repeat");
});

test("没有所选内容时给出对应的中文提示", () => {
  for (const mode of ["original", "original-timed"] as const) {
    assert.throws(() => exportLyrics([], mode), /暂无可导出的原文歌词/);
    assert.throws(() => exportLyrics([{ translatedText: "只有翻译" }], mode), /暂无可导出的原文歌词/);
  }
  for (const mode of ["translation", "translation-timed"] as const) {
    assert.throws(() => exportLyrics([], mode), /暂无可导出的翻译/);
    assert.throws(() => exportLyrics([{ originalText: "Only original", translatedText: " \n\u200B " }], mode), /暂无可导出的翻译/);
  }
});
