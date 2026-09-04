import assert from "node:assert/strict";
import test from "node:test";
import { parseJson, parseLrc, parseTxt } from "../src/parsers.ts";

test("TXT 默认忽略空行并重新连续编号", () => {
  assert.deepEqual(parseTxt("甲\n\n乙\n"), [
    { index: 0, translatedText: "甲" },
    { index: 1, translatedText: "乙" },
  ]);
});

test("TXT 可保留空行", () => {
  assert.deepEqual(parseTxt("甲\n\n乙", true), [
    { index: 0, translatedText: "甲" },
    { index: 1, translatedText: "" },
    { index: 2, translatedText: "乙" },
  ]);
});

test("LRC 支持百分秒、毫秒与同一行多个时间戳", () => {
  assert.deepEqual(parseLrc("[00:12.20][00:13.250]甲\n[01:02]乙"), [
    { startTime: 12_200, translatedText: "甲" },
    { startTime: 13_250, translatedText: "甲" },
    { startTime: 62_000, translatedText: "乙" },
  ]);
});

test("JSON 接受 index 和 startTime 两类行", () => {
  const parsed = parseJson(JSON.stringify({ trackUri: "spotify:track:x", lines: [
    { index: 0, translatedText: "甲" },
    { startTime: 1200, translatedText: "乙" },
  ] }));
  assert.equal(parsed.trackUri, "spotify:track:x");
  assert.deepEqual(parsed.lines, [
    { index: 0, translatedText: "甲" },
    { startTime: 1200, translatedText: "乙" },
  ]);
});
