import assert from "node:assert/strict";
import test from "node:test";
import { buildTranslationTiming, translationProgressAt, validateVisualTranslation } from "../src/translation-timing.ts";
import type { LyricLine, TranslationLine } from "../src/types.ts";

const syllable = (text: string, startTime: number, endTime: number, isPartOfWord = false) => ({ text, startTime, endTime, isPartOfWord });
const source = (...syllables: NonNullable<LyricLine["syllables"]>): LyricLine => ({ index: 0, text: "Source", syllables });
const translated = (translatedText: string): TranslationLine => ({ translatedText });
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("译文按中文字和拉丁词分段，保留标点、空白、emoji与组合字符", () => {
  const text = "“你 e\u0301clair, don't 👨‍👩‍👧‍👦 🇭🇰 好！”";
  const plan = buildTranslationTiming({ index: 0, text: "Source", startTime: 0, endTime: 2_000 }, translated(text))!;
  assert.deepEqual(plan.segments.map((segment) => segment.text), ["“你 ", "e\u0301clair, ", "don't ", "👨‍👩‍👧‍👦 ", "🇭🇰 ", "好！”"]);
  assert.equal(plan.segments.map((segment) => segment.text).join(""), text);
  assert.equal(plan.segments[0]!.start, 0);
  assert.equal(plan.segments.at(-1)!.end, 1);
  plan.segments.slice(1).forEach((segment, index) => assert.equal(segment.start, plan.segments[index]!.end));
});

test("音节间停顿保持进度，长音在自身持续时间内缓慢推进", () => {
  const plan = buildTranslationTiming(source(syllable("a", 1_000, 2_000), syllable("b", 4_000, 8_000)), translated("甲乙"))!;
  close(translationProgressAt(plan, 1_500), 0.25);
  close(translationProgressAt(plan, 2_000), 0.5);
  close(translationProgressAt(plan, 3_500), 0.5);
  close(translationProgressAt(plan, 5_000), 0.625);
  close(translationProgressAt(plan, 8_000), 1);
});

test("拖动进度条不依赖历史帧，播放前后与非法时间有确定结果", () => {
  const plan = buildTranslationTiming(source(syllable("a", 1_000, 2_000), syllable("b", 4_000, 8_000)), translated("甲乙"))!;
  assert.equal(translationProgressAt(plan, 99_000), 1);
  close(translationProgressAt(plan, 1_500), 0.25);
  assert.equal(translationProgressAt(plan, -1), 0);
  assert.equal(translationProgressAt(plan, Number.NaN), 0);
  assert.equal(translationProgressAt(plan, Infinity), 0);
});

test("中英两边的对应短语标点约束时间边界", () => {
  const plan = buildTranslationTiming(source(syllable("one,", 0, 1_000), syllable("two", 2_000, 3_000)), translated("甲乙丙丁，戊"))!;
  assert.equal(plan.method, "punctuation");
  close(translationProgressAt(plan, 1_000), 0.8);
  close(translationProgressAt(plan, 1_800), 0.8);
  close(translationProgressAt(plan, 2_500), 0.9);
});

test("标点短语数量不一致时不强行逐句对应", () => {
  const plan = buildTranslationTiming(source(syllable("one,", 0, 1_000), syllable("two", 2_000, 3_000)), translated("甲，乙，丙丁戊"))!;
  assert.equal(plan.method, "weighted");
  close(translationProgressAt(plan, 1_000), 0.5);
});

test("唯一数字锚点让数字片段跟随原文数字的时间", () => {
  const plan = buildTranslationTiming(source(syllable("a", 0, 1_000), syllable("42", 2_000, 3_000), syllable("b", 4_000, 5_000)), translated("甲乙42丙"))!;
  close(translationProgressAt(plan, 2_000), 0.4);
  close(translationProgressAt(plan, 3_000), 0.8);
});

test("原样英文锚点会先合并PartOfWord音节", () => {
  const plan = buildTranslationTiming(source(syllable("a", 0, 1_000), syllable("Sp", 2_000, 3_000, true), syllable("ace", 3_000, 4_000), syllable("b", 5_000, 6_000)), translated("甲乙 Space 丙"))!;
  close(translationProgressAt(plan, 2_000), 2 / 8);
  close(translationProgressAt(plan, 4_000), 7 / 8);
});

test("重复数字和逆序英文不会产生倒退的映射", () => {
  const plan = buildTranslationTiming(source(syllable("red", 0, 100), syllable("42", 200, 300), syllable("blue", 400, 500), syllable("42", 600, 700)), translated("blue 42 red 42"))!;
  let previous = 0;
  for (let time = 0; time <= 700; time += 10) {
    const progress = translationProgressAt(plan, time);
    assert.ok(progress >= previous && progress <= 1);
    previous = progress;
  }
});

test("显式AI或人工片段对应优先，仍保留音节内部停顿", () => {
  const lyric = source(syllable("a", 0, 1_000), syllable("b", 2_000, 3_000), syllable("c", 4_000, 6_000));
  const plan = buildTranslationTiming(lyric, { translatedText: "甲乙丙丁戊", alignment: [
    { sourceStart: 0, sourceEnd: 2, text: "甲" }, { sourceStart: 2, sourceEnd: 3, text: "乙丙丁戊" },
  ] })!;
  assert.equal(plan.method, "aligned");
  close(translationProgressAt(plan, 1_000), 0.1);
  close(translationProgressAt(plan, 1_500), 0.1);
  close(translationProgressAt(plan, 3_000), 0.2);
  close(translationProgressAt(plan, 5_000), 0.6);
});

test("显式对应可以跳过无译文的原音节，跳过期间不扫亮", () => {
  const lyric = source(syllable("a", 0, 1_000), syllable("b", 2_000, 3_000), syllable("c", 4_000, 6_000));
  const plan = buildTranslationTiming(lyric, { translatedText: "甲乙", alignment: [
    { sourceStart: 0, sourceEnd: 1, text: "甲" }, { sourceStart: 2, sourceEnd: 3, text: "乙" },
  ] })!;
  assert.equal(plan.method, "aligned");
  close(translationProgressAt(plan, 2_500), 0.5);
});

test("歌词来源文字变更时忽略旧显式音节下标", () => {
  const plan = buildTranslationTiming(source(syllable("a", 0, 1_000), syllable("b", 2_000, 3_000)), {
    originalText: "A different provider version", translatedText: "甲乙丙丁",
    alignment: [{ sourceStart: 0, sourceEnd: 1, text: "甲" }, { sourceStart: 1, sourceEnd: 2, text: "乙丙丁" }],
  })!;
  assert.equal(plan.method, "weighted");
  close(translationProgressAt(plan, 1_000), 0.5);
});

test("残缺、越界、重叠、逆序或拆开grapheme的显式对应降级", () => {
  const lyric = source(syllable("a", 0, 1_000), syllable("b", 2_000, 3_000));
  for (const translation of [
    { translatedText: "甲乙", alignment: [{ sourceStart: 0, sourceEnd: 2, text: "甲" }] },
    { translatedText: "甲乙", alignment: [{ sourceStart: 0, sourceEnd: 9, text: "甲乙" }] },
    { translatedText: "甲乙", alignment: [{ sourceStart: 0, sourceEnd: 2, text: "甲" }, { sourceStart: 1, sourceEnd: 2, text: "乙" }] },
    { translatedText: "甲乙", alignment: [{ sourceStart: 1, sourceEnd: 2, text: "甲" }, { sourceStart: 0, sourceEnd: 1, text: "乙" }] },
    { translatedText: "e\u0301", alignment: [{ sourceStart: 0, sourceEnd: 1, text: "e" }, { sourceStart: 1, sourceEnd: 2, text: "\u0301" }] },
  ]) assert.equal(buildTranslationTiming(lyric, translation)!.method, "weighted");
});

test("缺少合法音节时只在可靠行时间存在时使用整行近似", () => {
  assert.equal(buildTranslationTiming({ index: 0, text: "Static" }, translated("静态")), undefined);
  for (const [startTime, endTime] of [[0, 0], [-1, 100], [100, 0], [NaN, 100], [0, Infinity]]) {
    assert.equal(buildTranslationTiming({ index: 0, text: "Invalid", startTime, endTime }, translated("无效")), undefined);
  }
  const plan = buildTranslationTiming({ index: 0, text: "Line", startTime: 100, endTime: 500 }, translated("整行"))!;
  close(translationProgressAt(plan, 300), 0.5);
});

test("坏音节被忽略，轻微交叠被截到下一音节，时间倒序不排序造假", () => {
  const plan = buildTranslationTiming(source(syllable("a", 0, 1_500), syllable("bad", NaN, 1_000), syllable("b", 1_000, 2_000)), translated("甲乙"))!;
  assert.equal(plan.cues[0]!.endTime, 1_000);
  close(translationProgressAt(plan, 1_000), 0.5);
  assert.equal(buildTranslationTiming(source(syllable("a", 1_000, 2_000), syllable("b", 0, 1_000)), translated("甲乙")), undefined);
});

test("只有标点空白的译文不创建动画", () => {
  assert.equal(buildTranslationTiming({ index: 0, text: "Source", startTime: 0, endTime: 1_000 }, translated(" ，！ ")), undefined);
});

test("手动片段时间按原音节相对时序投影，保留原下标、内部休止与默认片段", () => {
  const lyric = { ...source(syllable("a", 1000, 2000), syllable("b", 4000, 5000), syllable("c", 7000, 10000)), startTime: 1000, endTime: 10000 };
  const translation: TranslationLine = { translatedText: "甲乙丙", motion: { amplitude: 1.5, stagger: 0.2, settleMs: 500 }, alignment: [
    { sourceStart: 0, sourceEnd: 2, text: "甲乙", startTime: 2000, endTime: 4000 },
    { sourceStart: 2, sourceEnd: 3, text: "丙" },
  ] };
  assert.equal(validateVisualTranslation(lyric, translation), undefined);
  const plan = buildTranslationTiming(lyric, translation)!;
  assert.equal(plan.method, "aligned");
  assert.deepEqual(plan.cues.map(({ sourceIndex, startTime, endTime }) => ({ sourceIndex, startTime, endTime })), [
    { sourceIndex: 0, startTime: 2000, endTime: 2500 },
    { sourceIndex: 1, startTime: 3500, endTime: 4000 },
    { sourceIndex: 2, startTime: 7000, endTime: 10000 },
  ]);
  close(translationProgressAt(plan, 3000), 1 / 3);
  close(translationProgressAt(plan, 6000), 2 / 3);
  assert.deepEqual(plan.motion, translation.motion);
  assert.equal(lyric.syllables![0]!.startTime, 1000, "projection never edits provider timestamps");
});

test("跳过的原音节不遮住移动后的手动片段，缺失行时间时使用原音节首尾", () => {
  const lyric = source(syllable("a", 0, 1000), syllable("b", 2000, 3000), syllable("c", 4000, 9000));
  const translation: TranslationLine = { translatedText: "甲乙", alignment: [
    { sourceStart: 0, sourceEnd: 1, text: "甲", startTime: 2000, endTime: 4000 },
    { sourceStart: 2, sourceEnd: 3, text: "乙", startTime: 5000, endTime: 8000 },
  ] };
  assert.equal(validateVisualTranslation(lyric, translation), undefined);
  const plan = buildTranslationTiming(lyric, translation)!;
  assert.deepEqual(plan.cues.map(cue => cue.sourceIndex), [0, 2]);
  close(translationProgressAt(plan, 3000), 0.25);
  close(translationProgressAt(plan, 4500), 0.5);
});

test("可视编辑校验报告原文、范围、字符边界、参数及混合时间错误", () => {
  const lyric = { ...source(syllable("a", 1000, 2000), syllable("b", 3000, 4000)), startTime: 1000, endTime: 5000 };
  const aligned: TranslationLine = { translatedText: "甲乙", alignment: [
    { sourceStart: 0, sourceEnd: 1, text: "甲" }, { sourceStart: 1, sourceEnd: 2, text: "乙" },
  ] };
  assert.equal(validateVisualTranslation(lyric, aligned), undefined);
  assert.equal(validateVisualTranslation({ index: 0, text: "Static" }, { translatedText: "静态", motion: { amplitude: 0 } }), undefined);
  const invalid: TranslationLine[] = [
    { ...aligned, originalText: "changed" }, { ...aligned, translatedText: "不同" }, { ...aligned, alignment: [] },
    { ...aligned, motion: { amplitude: 2.1 } }, { ...aligned, motion: { stagger: -1 } }, { ...aligned, motion: { settleMs: 20 } },
    { translatedText: "甲", alignment: [{ sourceStart: 0, sourceEnd: 3, text: "甲" }] },
    { translatedText: "甲乙", alignment: [{ sourceStart: 0, sourceEnd: 2, text: "甲" }, { sourceStart: 1, sourceEnd: 2, text: "乙" }] },
    { translatedText: "e\u0301", alignment: [{ sourceStart: 0, sourceEnd: 1, text: "e" }, { sourceStart: 1, sourceEnd: 2, text: "\u0301" }] },
    ...[{ startTime: 1200 }, { startTime: 900, endTime: 1500 }, { startTime: 1100, endTime: 5100 },
      { startTime: 1500, endTime: 3500 }, { startTime: 2000, endTime: 2000 }].map(times => ({
      ...aligned, alignment: [{ ...aligned.alignment![0]!, ...times }, aligned.alignment![1]!],
    })),
  ];
  for (const draft of invalid) assert.equal(typeof validateVisualTranslation(lyric, draft), "string", JSON.stringify(draft));
  const badManual = { ...aligned, alignment: [{ ...aligned.alignment![0]!, startTime: 1500, endTime: 3500 }, aligned.alignment![1]!] };
  assert.equal(buildTranslationTiming(lyric, badManual), undefined, "invalid manual timing must not silently play automatic timing");
});
