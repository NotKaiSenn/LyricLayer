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

test("JSON 接受人工或AI片段对齐，保留半开音节范围和完整文本", () => {
  const alignment = [
    { sourceStart: 0, sourceEnd: 2, text: "记住，" },
    { sourceStart: 3, sourceEnd: 5, text: "这一天。" },
  ];
  const parsed = parseJson(JSON.stringify({ lines: [{ index: 0, translatedText: "记住，这一天。", alignment }] }));
  assert.deepEqual(parsed.lines, [{ index: 0, translatedText: "记住，这一天。", alignment }]);
});

test("JSON 备份使用已验证的行，仍保留歌曲与备份元数据", () => {
  const parsed = parseJson(JSON.stringify({
    version: 1, trackUri: "spotify:track:x", title: "Test", artist: "Artist", createdAt: 1, updatedAt: 2,
    lines: [{ index: -1, translatedText: "甲", alignment: [{ sourceStart: 0, sourceEnd: 1, text: "甲", unused: true }], unused: true }],
  }));
  assert.deepEqual(parsed.entry, {
    version: 1, trackUri: "spotify:track:x", title: "Test", artist: "Artist", createdAt: 1, updatedAt: 2,
    lines: [{ translatedText: "甲", alignment: [{ sourceStart: 0, sourceEnd: 1, text: "甲" }] }],
  });
  assert.equal(parsed.entry?.lines, parsed.lines);
});

test("JSON 拒绝空或非法片段范围，而不是丢掉错误对齐", () => {
  const invalid = [
    [], null, {},
    [{ sourceStart: -1, sourceEnd: 1, text: "甲" }],
    [{ sourceStart: 0, sourceEnd: 0, text: "甲" }],
    [{ sourceStart: 0.5, sourceEnd: 1, text: "甲" }],
    [{ sourceStart: "0", sourceEnd: 1, text: "甲" }],
    [{ sourceStart: 0, sourceEnd: Number.MAX_SAFE_INTEGER + 1, text: "甲" }],
    [{ sourceStart: 0, sourceEnd: 1, text: 1 }],
    [{ sourceStart: 0, sourceEnd: 3, text: "甲" }, { sourceStart: 2, sourceEnd: 4, text: "" }],
    [{ sourceStart: 2, sourceEnd: 3, text: "甲" }, { sourceStart: 0, sourceEnd: 1, text: "" }],
  ];
  for (const alignment of invalid) {
    assert.throws(() => parseJson(JSON.stringify({ lines: [{ translatedText: "甲", alignment }] })), /第 1 行 alignment/);
  }
});

test("JSON 对齐片段必须精确拼回译文，包括空格和标点", () => {
  assert.throws(() => parseJson(JSON.stringify({ lines: [{
    translatedText: "Watch this, glow",
    alignment: [{ sourceStart: 0, sourceEnd: 2, text: "Watch this" }, { sourceStart: 2, sourceEnd: 3, text: "glow" }],
  }] })), /完整拼回 translatedText/);
});

test("旧版无alignment的完整JSON备份保持兼容", () => {
  const original = {
    version: 1, trackUri: "spotify:track:x", title: "Test", createdAt: 1, updatedAt: 2,
    lines: [{ index: 0, startTime: 1_000, originalText: "One", translatedText: "甲" }],
  };
  const parsed = parseJson(JSON.stringify(original));
  assert.deepEqual(parsed.entry, original);
  assert.equal(Object.hasOwn(parsed.lines[0]!, "alignment"), false);
});

test("JSON备份完整保留手动片段时间和动画参数，默认值不强行写入旧数据", () => {
  const line = { index: 0, originalText: "One two", translatedText: "甲乙", alignment: [
    { sourceStart: 0, sourceEnd: 1, text: "甲", startTime: 1000, endTime: 2000 },
    { sourceStart: 1, sourceEnd: 2, text: "乙", startTime: 2500, endTime: 4000 },
  ], motion: { amplitude: 0, stagger: 0.8, settleMs: 1000 } };
  const entry = { version: 1, trackUri: "spotify:track:x", createdAt: 1, updatedAt: 2, lines: [line] };
  const parsed = parseJson(JSON.stringify(entry));
  assert.deepEqual(parsed.entry, entry);
  assert.deepEqual(parseJson(JSON.stringify(parsed.entry)).lines, [line]);
  assert.deepEqual(parseJson(JSON.stringify({ lines: [{ translatedText: "甲", motion: { amplitude: 2, stagger: 0, settleMs: 100 } }] })).lines[0]!.motion,
    { amplitude: 2, stagger: 0, settleMs: 100 });
  assert.equal(parseJson('{"lines":[{"translatedText":"甲"}]}').lines[0]!.motion, undefined);
});

test("JSON拒绝缺失配对、非数值、非正跨度和重叠的手动时间", () => {
  const part = { sourceStart: 0, sourceEnd: 1, text: "甲" };
  for (const times of [{ startTime: 100 }, { endTime: 200 }, { startTime: -1, endTime: 200 },
    { startTime: 100, endTime: 100 }, { startTime: 200, endTime: 100 }, { startTime: "100", endTime: 200 },
    { startTime: NaN, endTime: 200 }, { startTime: 100, endTime: Infinity }]) {
    assert.throws(() => parseJson(JSON.stringify({ lines: [{ translatedText: "甲", alignment: [{ ...part, ...times }] }] })), /alignment/);
  }
  assert.throws(() => parseJson(JSON.stringify({ lines: [{ translatedText: "甲乙", alignment: [
    { ...part, startTime: 100, endTime: 300 },
    { sourceStart: 1, sourceEnd: 2, text: "乙", startTime: 200, endTime: 400 },
  ] }] })), /时间.*不能重叠/);
});

test("JSON严格拒绝无效动画参数并只保留已知字段", () => {
  for (const motion of [null, [], 1, { amplitude: -0.01 }, { amplitude: 2.01 }, { amplitude: "1" },
    { amplitude: NaN }, { stagger: -0.1 }, { stagger: 0.81 }, { settleMs: 99 }, { settleMs: 1001 }, { settleMs: Infinity }]) {
    assert.throws(() => parseJson(JSON.stringify({ lines: [{ translatedText: "甲", motion }] })), /motion/);
  }
  assert.deepEqual(parseJson(JSON.stringify({ lines: [{ translatedText: "甲", motion: { amplitude: 1.5, ignored: true } }] })).lines[0]!.motion,
    { amplitude: 1.5 });
});
