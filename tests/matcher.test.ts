import assert from "node:assert/strict";
import test from "node:test";
import { matchTranslations } from "../src/matcher.ts";
import type { LyricLine, TranslationLine } from "../src/types.ts";

const lyrics: LyricLine[] = [
  { index: 0, text: "Hello, world!", startTime: 10_000 },
  { index: 1, text: "Repeated", startTime: 20_000 },
  { index: 2, text: "Repeated", startTime: 30_000 },
];

test("时间戳在容差内最近匹配且一对一", () => {
  const translations: TranslationLine[] = [
    { startTime: 10_800, translatedText: "你好" },
    { startTime: 20_100, translatedText: "第一次" },
  ];
  const result = matchTranslations(lyrics, translations);
  assert.equal(result.get(0)?.translatedText, "你好");
  assert.equal(result.get(1)?.translatedText, "第一次");
  assert.equal(result.size, 2);
});

test("优先级为时间戳、index、originalText", () => {
  const translations: TranslationLine[] = [
    { index: 2, startTime: 20_050, originalText: "Hello world", translatedText: "时间优先" },
    { index: 2, translatedText: "索引匹配" },
    { originalText: "HELLO WORLD", translatedText: "文本匹配" },
  ];
  const result = matchTranslations(lyrics, translations);
  assert.equal(result.get(1)?.translatedText, "时间优先");
  assert.equal(result.get(2)?.translatedText, "索引匹配");
  assert.equal(result.get(0)?.translatedText, "文本匹配");
});

test("同一翻译不会匹配多个重复歌词行", () => {
  const result = matchTranslations(lyrics, [{ originalText: "Repeated", translatedText: "重复" }]);
  assert.equal(result.size, 1);
});
