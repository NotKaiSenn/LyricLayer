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
