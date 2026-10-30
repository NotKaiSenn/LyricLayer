import assert from "node:assert/strict";
import test from "node:test";
import { extractLyricLines } from "../src/spicy-lyrics-source.ts";

test("逐词歌词合并主声部音节、转成毫秒并忽略 instrumental", () => {
  const result = extractLyricLines({
    Type: "Syllable",
    Content: [
      { Type: "Instrumental", StartTime: 0, EndTime: 3 },
      {
        Type: "Vocal",
        Lead: {
          StartTime: 12.2,
          EndTime: 16.4,
          Syllables: [
            { Text: "I", IsPartOfWord: false },
            { Text: "used", IsPartOfWord: false },
            { Text: "to", IsPartOfWord: false },
            { Text: "rule", IsPartOfWord: false },
          ],
        },
      },
    ],
  });
  assert.deepEqual(result, [{ index: 0, text: "I used to rule", startTime: 12_200, endTime: 16_400 }]);
});

test("静态歌词保留全部行供编辑器使用", () => {
  assert.deepEqual(extractLyricLines({ Type: "Static", Lines: [{ Text: "One" }, { Text: "Two" }] }), [
    { index: 0, text: "One" },
    { index: 1, text: "Two" },
  ]);
});

test("读取缓存时清理 Spicy Lyrics 渲染前会移除的零宽字符", () => {
  assert.deepEqual(extractLyricLines({ Type: "Line", Content: [
    { Type: "Vocal", Text: "Come\u200B and\u2060 go", StartTime: 1, EndTime: 2 },
  ] }), [
    { index: 0, text: "Come and go", startTime: 1_000, endTime: 2_000 },
  ]);
});

test("逐音节时间转换为毫秒并保留词内标记，缺失行时间从首尾音节推导", () => {
  assert.deepEqual(extractLyricLines({ Type: "Syllable", Content: [{ Type: "Vocal", Lead: { Syllables: [
    { Text: "re\u200B", StartTime: 1.2346, EndTime: 1.8, IsPartOfWord: true },
    { Text: "member", StartTime: 1.8, EndTime: 2.7, IsPartOfWord: false },
    { Text: "this", StartTime: 3.1, EndTime: 3.4 },
    { Text: "day", StartTime: 3.4, EndTime: 5 },
  ] } }] }), [{
    index: 0, text: "remember this day", startTime: 1_235, endTime: 5_000,
    syllables: [
      { text: "re", startTime: 1_235, endTime: 1_800, isPartOfWord: true },
      { text: "member", startTime: 1_800, endTime: 2_700, isPartOfWord: false },
      { text: "this", startTime: 3_100, endTime: 3_400 },
      { text: "day", startTime: 3_400, endTime: 5_000 },
    ],
  }]);
});

test("有效音节不覆盖已有行边界，也不删除空文本音节改变源下标", () => {
  const result = extractLyricLines({ Type: "Syllable", Content: [{ Type: "Vocal", Lead: {
    StartTime: 0.5, EndTime: 5,
    Syllables: [
      { Text: "One", StartTime: 1, EndTime: 2 },
      { Text: "", StartTime: 2, EndTime: 2.5 },
      { Text: "two", StartTime: 3, EndTime: 4 },
    ],
  } }] });
  assert.equal(result[0]?.startTime, 500);
  assert.equal(result[0]?.endTime, 5_000);
  assert.equal(result[0]?.text, "One  two");
  assert.equal(result[0]?.syllables?.length, 3);
  assert.equal(result[0]?.syllables?.[1]?.text, "");
});

test("任意音节时间无效时整组降级，仍保留原文和行时间", () => {
  const invalid = [
    { StartTime: 2.2 },
    { StartTime: -1, EndTime: 3 },
    { StartTime: Number.NaN, EndTime: 3 },
    { StartTime: 2.2, EndTime: Number.POSITIVE_INFINITY },
    { StartTime: 2.2, EndTime: 2.2 },
    { StartTime: 3, EndTime: 2.2 },
    { StartTime: 1.9, EndTime: 3 },
    { StartTime: 2.2, EndTime: 2.20001 },
    { StartTime: 1e308, EndTime: 1.1e308 },
  ];
  for (const timing of invalid) {
    const result = extractLyricLines({ Type: "Syllable", Content: [{ Type: "Vocal", Lead: {
      StartTime: 1, EndTime: 4,
      Syllables: [{ Text: "One", StartTime: 1, EndTime: 2 }, { Text: "two", ...timing }],
    } }] });
    assert.deepEqual(result, [{ index: 0, text: "One two", startTime: 1_000, endTime: 4_000 }]);
    assert.equal(Object.hasOwn(result[0]!, "syllables"), false);
  }
});
