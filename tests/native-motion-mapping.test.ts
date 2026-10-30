import assert from "node:assert/strict";
import test from "node:test";
import { motionSourcesForSegment } from "../src/native-motion-mapping.ts";
import { buildTranslationTiming } from "../src/translation-timing.ts";
import type { TranslationTiming } from "../src/translation-timing.ts";
import type { LyricLine, TranslationLine } from "../src/types.ts";

function plan(texts: string[], translatedText: string, alignment?: TranslationLine["alignment"]): TranslationTiming {
  const source: LyricLine = { index: 0, text: texts.join(" "), syllables: texts.map((text, index) => ({
    text, startTime: index * 1000, endTime: index * 1000 + 800,
  })) };
  return buildTranslationTiming(source, { translatedText, alignment })!;
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("一个原词对应多个译字，保留字母强调在词内的相对位置", () => {
  const timing = plan(["daylight"], "迎接晨光");
  assert.deepEqual(timing.cues.map(cue => cue.sourceIndex), [0]);
  for (let index = 0; index < 4; index++) {
    const sources = motionSourcesForSegment(timing, index);
    assert.equal(sources.length, 1);
    assert.equal(sources[0]!.sourceIndex, 0);
    close(sources[0]!.position, (index + 0.5) / 4);
    close(sources[0]!.weight, 1);
  }
});

test("多个原音节对应一个译文词，保留各音节供动画依次跟随", () => {
  const timing = plan(["天", "空"], "sky");
  const sources = motionSourcesForSegment(timing, 0);
  assert.deepEqual(sources.map(source => source.sourceIndex), [0, 1]);
  sources.forEach(source => { close(source.position, 0.5); close(source.weight, 0.5); });
});

test("只取实际重叠的词内位置，并按译文所覆盖范围计算候选权重", () => {
  const timing: TranslationTiming = {
    method: "weighted", segments: [{ text: "word", start: 0.2, end: 0.6 }],
    cues: [
      { startTime: 0, endTime: 100, start: 0, end: 0.3, sourceIndex: 3 },
      { startTime: 200, endTime: 300, start: 0.3, end: 1, sourceIndex: 8 },
    ],
  };
  const sources = motionSourcesForSegment(timing, 0);
  assert.deepEqual(sources.map(source => source.sourceIndex), [3, 8]);
  close(sources[0]!.position, 5 / 6);
  close(sources[1]!.position, 3 / 14);
  close(sources[0]!.weight, 0.25);
  close(sources[1]!.weight, 0.75);
});

test("人工或AI短语对齐改变动画来源，而不是按整行字数重排", () => {
  const timing = plan(["a", "b", "c"], "甲乙丙丁戊", [
    { sourceStart: 0, sourceEnd: 2, text: "甲" },
    { sourceStart: 2, sourceEnd: 3, text: "乙丙丁戊" },
  ]);
  assert.equal(timing.method, "aligned");
  assert.deepEqual(motionSourcesForSegment(timing, 0).map(source => source.sourceIndex), [0, 1]);
  for (let index = 1; index < 5; index++) {
    const sources = motionSourcesForSegment(timing, index);
    assert.deepEqual(sources.map(source => source.sourceIndex), [2]);
    close(sources[0]!.position, (index - 0.5) / 4);
  }
});

test("标点短语与相同数字锚点同时约束动画来源", () => {
  const punctuated = plan(["one,", "two"], "甲乙丙丁，戊");
  assert.equal(punctuated.method, "punctuation");
  assert.deepEqual(motionSourcesForSegment(punctuated, 3).map(source => source.sourceIndex), [0]);
  assert.deepEqual(motionSourcesForSegment(punctuated, 4).map(source => source.sourceIndex), [1]);
  const numbered = plan(["a", "42", "b"], "甲乙42丙");
  const index = numbered.segments.findIndex(segment => segment.text === "42");
  const sources = motionSourcesForSegment(numbered, index);
  assert.equal(sources.length, 1);
  assert.equal(sources[0]!.sourceIndex, 1);
  close(sources[0]!.position, 0.5);
  close(sources[0]!.weight, 1);
});

test("无译文的源音节不驱动相邻译字，原下标在过滤后不变", () => {
  const timing = plan(["a", "skip", "b"], "甲乙", [
    { sourceStart: 0, sourceEnd: 1, text: "甲" }, { sourceStart: 2, sourceEnd: 3, text: "乙" },
  ]);
  assert.deepEqual(motionSourcesForSegment(timing, 0).map(source => source.sourceIndex), [0]);
  assert.deepEqual(motionSourcesForSegment(timing, 1).map(source => source.sourceIndex), [2]);
  const withInvalid = buildTranslationTiming({ index: 0, text: "a b", syllables: [
    { text: "a", startTime: 0, endTime: 100 },
    { text: "bad", startTime: NaN, endTime: 200 },
    { text: "b", startTime: 300, endTime: 400 },
  ] }, { translatedText: "甲乙" })!;
  assert.deepEqual(withInvalid.cues.map(cue => cue.sourceIndex), [0, 2]);
  assert.deepEqual(motionSourcesForSegment(withInvalid, 1).map(source => source.sourceIndex), [2]);
});

test("仅整行时间或非法映射不会伪造原词动画来源", () => {
  const timing = buildTranslationTiming({ index: 0, text: "line", startTime: 0, endTime: 1000 }, { translatedText: "整行" })!;
  assert.equal(timing.cues[0]!.sourceIndex, undefined);
  assert.deepEqual(motionSourcesForSegment(timing, 0), []);
  for (const index of [-1, 0.5, 99, NaN]) assert.deepEqual(motionSourcesForSegment(timing, index), []);
  timing.cues = [
    { startTime: 0, endTime: 100, start: 0, end: 0.5, sourceIndex: -1 },
    { startTime: 0, endTime: 100, start: 0.5, end: 0.5, sourceIndex: 1 },
    { startTime: 0, endTime: 100, start: NaN, end: 1, sourceIndex: 2 },
    { startTime: 100, endTime: 0, start: 0, end: 1, sourceIndex: 3 },
  ];
  assert.deepEqual(motionSourcesForSegment(timing, 0), []);
});

test("浮点边界接触不会让译字额外挂到相邻词上", () => {
  const timing = plan(["a", "bb", "ccc"], "甲乙丙");
  const boundary = timing.segments[1]!.end;
  timing.cues = [
    { startTime: 0, endTime: 100, start: 0, end: boundary, sourceIndex: 0 },
    { startTime: 100, endTime: 200, start: boundary - Number.EPSILON, end: 1, sourceIndex: 1 },
  ];
  assert.deepEqual(motionSourcesForSegment(timing, 1).map(source => source.sourceIndex), [0]);
});
