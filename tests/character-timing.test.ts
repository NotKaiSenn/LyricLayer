import assert from "node:assert/strict";
import test from "node:test";
import { characterCuesForSegment, characterPhaseAt } from "../src/character-timing.ts";
import type { CharacterCue } from "../src/character-timing.ts";
import { buildTranslationTiming } from "../src/translation-timing.ts";
import type { TranslationTiming } from "../src/translation-timing.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("同一原词对应多个译字时，各字拥有依次开始与结束的独立时间片", () => {
  const plan = buildTranslationTiming({ index: 0, text: "bright", syllables: [
    { text: "bright", startTime: 1000, endTime: 4000 },
  ] }, { translatedText: "闪耀吧" })!;
  const parts = plan.segments.map((_segment, index) => characterCuesForSegment(plan, index));
  assert.deepEqual(parts, [
    [{ startTime: 1000, endTime: 2000, start: 0, end: 1, sourceIndex: 0 }],
    [{ startTime: 2000, endTime: 3000, start: 0, end: 1, sourceIndex: 0 }],
    [{ startTime: 3000, endTime: 4000, start: 0, end: 1, sourceIndex: 0 }],
  ]);
  assert.deepEqual(parts.map(cues => characterPhaseAt(cues, 2500)), [
    { phase: 1, state: "after" }, { phase: 0.5, state: "active" }, { phase: 0, state: "before" },
  ]);
});

test("一个译字跨两个音节时保留中间休止，不把停顿摊进连续动画", () => {
  const plan = buildTranslationTiming({ index: 0, text: "a b", syllables: [
    { text: "a", startTime: 1000, endTime: 2000 },
    { text: "b", startTime: 4000, endTime: 6000 },
  ] }, { translatedText: "光" })!;
  const cues = characterCuesForSegment(plan, 0);
  assert.deepEqual(cues, [
    { startTime: 1000, endTime: 2000, start: 0, end: 0.5, sourceIndex: 0 },
    { startTime: 4000, endTime: 6000, start: 0.5, end: 1, sourceIndex: 1 },
  ]);
  assert.deepEqual(characterPhaseAt(cues, 1500), { phase: 0.25, state: "active" });
  assert.deepEqual(characterPhaseAt(cues, 2000), { phase: 0.5, state: "gap" });
  assert.deepEqual(characterPhaseAt(cues, 3999), { phase: 0.5, state: "gap" });
  assert.deepEqual(characterPhaseAt(cues, 4000), { phase: 0.5, state: "active" });
  assert.deepEqual(characterPhaseAt(cues, 5000), { phase: 0.75, state: "active" });
});

test("只投影实际相交的片段，保留源音节下标及字内进度", () => {
  const plan: TranslationTiming = { method: "weighted", segments: [{ text: "甲", start: 0.2, end: 0.6 }], cues: [
    { startTime: 1000, endTime: 5000, start: 0, end: 0.4, sourceIndex: 3 },
    { startTime: 6000, endTime: 9000, start: 0.4, end: 1, sourceIndex: 4 },
  ] };
  const [a, b] = characterCuesForSegment(plan, 0);
  assert.equal(a!.startTime, 3000);
  assert.equal(a!.endTime, 5000);
  close(a!.end, 0.5);
  assert.equal(a!.sourceIndex, 3);
  assert.equal(b!.startTime, 6000);
  close(b!.endTime, 7000);
  close(b!.start, 0.5);
  assert.equal(b!.end, 1);
  assert.equal(b!.sourceIndex, 4);
});

test("标点附着在译字上不抢占独立时段，显式短语对应约束分时", () => {
  const plan = buildTranslationTiming({ index: 0, text: "We glow", syllables: [
    { text: "We", startTime: 0, endTime: 1000 },
    { text: "glow", startTime: 2000, endTime: 6000 },
  ] }, { translatedText: "我们，发光！", alignment: [
    { sourceStart: 0, sourceEnd: 1, text: "我们，" },
    { sourceStart: 1, sourceEnd: 2, text: "发光！" },
  ] })!;
  assert.deepEqual(plan.segments.map(segment => segment.text), ["我", "们，", "发", "光！"]);
  assert.deepEqual(plan.segments.map((_segment, index) => characterCuesForSegment(plan, index)[0]!.startTime), [0, 500, 2000, 4000]);
  assert.deepEqual(plan.segments.map((_segment, index) => characterCuesForSegment(plan, index)[0]!.endTime), [500, 1000, 4000, 6000]);
});

test("整行时间fallback仍分配各字时间，不伪造sourceIndex", () => {
  const plan = buildTranslationTiming({ index: 0, text: "source", startTime: 1000, endTime: 3000 }, { translatedText: "甲乙" })!;
  assert.deepEqual(characterCuesForSegment(plan, 0), [{ startTime: 1000, endTime: 2000, start: 0, end: 1 }]);
  assert.deepEqual(characterCuesForSegment(plan, 1), [{ startTime: 2000, endTime: 3000, start: 0, end: 1 }]);
});

test("倒退跳转、暂停重复读取及首尾边界均由绝对时间决定", () => {
  const cues: CharacterCue[] = [{ startTime: 1000, endTime: 2000, start: 0, end: 1 }];
  assert.deepEqual(characterPhaseAt(cues, 2000), { phase: 1, state: "after" });
  assert.deepEqual(characterPhaseAt(cues, 1500), { phase: 0.5, state: "active" });
  assert.deepEqual(characterPhaseAt(cues, 1500), { phase: 0.5, state: "active" });
  assert.deepEqual(characterPhaseAt(cues, 1000), { phase: 0, state: "active" });
  assert.deepEqual(characterPhaseAt(cues, 999), { phase: 0, state: "before" });
  for (const time of [NaN, Infinity, -Infinity]) assert.deepEqual(characterPhaseAt(cues, time), { phase: 0, state: "before" });
  assert.deepEqual(characterPhaseAt([], 1000), { phase: 0, state: "before" });
});

test("非法片段、零宽映射、越界下标和坏时间不生成字符动画", () => {
  const good: TranslationTiming = { method: "weighted", segments: [{ text: "甲", start: 0, end: 1 }], cues: [
    { startTime: 1000, endTime: 2000, start: 0, end: 1 },
  ] };
  for (const index of [-1, 1, 0.5, NaN]) assert.deepEqual(characterCuesForSegment(good, index), []);
  for (const segment of [{ text: "", start: 0, end: 0 }, { text: "甲", start: NaN, end: 1 }, { text: "甲", start: 0, end: 2 }]) {
    assert.deepEqual(characterCuesForSegment({ ...good, segments: [segment] }, 0), []);
  }
  for (const cue of [
    { startTime: 0, endTime: 0, start: 0, end: 1 },
    { startTime: -1, endTime: 10, start: 0, end: 1 },
    { startTime: 0, endTime: Infinity, start: 0, end: 1 },
    { startTime: 0, endTime: 10, start: 0.5, end: 0.5 },
    { startTime: 0, endTime: 10, start: 0, end: 1, sourceIndex: -1 },
  ]) assert.deepEqual(characterCuesForSegment({ ...good, cues: [cue] }, 0), []);
  assert.deepEqual(characterPhaseAt([{ startTime: 0, endTime: 0, start: 0, end: 1 }], 1), { phase: 0, state: "before" });
});

test("时间重叠或倒序不排序修补，浮点相邻边界不多生成一个字片段", () => {
  const plan: TranslationTiming = { method: "weighted", segments: [{ text: "甲", start: 0, end: 1 }], cues: [
    { startTime: 1000, endTime: 3000, start: 0, end: 0.5 },
    { startTime: 2000, endTime: 4000, start: 0.5, end: 1 },
  ] };
  assert.deepEqual(characterCuesForSegment(plan, 0), []);
  assert.deepEqual(characterPhaseAt(plan.cues, 2500), { phase: 0, state: "before" });
  const adjacent: TranslationTiming = { method: "weighted", segments: [{ text: "甲", start: 0, end: 0.1 + 0.2 }], cues: [
    { startTime: 0, endTime: 1000, start: 0, end: 0.3 },
    { startTime: 2000, endTime: 3000, start: 0.3, end: 1 },
  ] };
  assert.equal(characterCuesForSegment(adjacent, 0).length, 1);
});
