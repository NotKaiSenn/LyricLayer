import assert from "node:assert/strict";
import test from "node:test";
import { formatSegments, linked, motionPresetId, MOTION_PRESETS, moveEdgeTime, nearestBoundary, parseSegments,
  remapSegments, snapEdge, type EditContext } from "../src/alignment-edit.ts";
import type { TranslationAlignment } from "../src/types.ts";

// Eight 500 ms syllables starting at 12 s: I can see the light in your eyes.
const context: EditContext = {
  syllables: Array.from({ length: 8 }, (_, index) => ({ start: 12_000 + index * 500, end: 12_500 + index * 500 })),
  lineStart: 12_000, lineEnd: 16_000,
};
const two: TranslationAlignment[] = [
  { sourceStart: 0, sourceEnd: 5, text: "我能看见" },
  { sourceStart: 5, sourceEnd: 8, text: "你眼中的光" },
];

test("「/」分段可逆：中文无空格、英文保留一个空格、转义字面斜杠", () => {
  for (const texts of [["我能看见", "你眼中的光"], ["hold on ", "to me"], ["A", " B"], ["A ", " B"],
    ["24/7", "不停"], ["a\\b", "c/"], ["行\n", "下一行"], ["只有一段"]]) {
    assert.deepEqual(parseSegments(formatSegments(texts)), texts, JSON.stringify(texts));
  }
  assert.equal(formatSegments(["hold on ", "to me"]), "hold on / to me");
  assert.equal(formatSegments(["24/7"]), "24\\/7");
  assert.deepEqual(parseSegments("我能看见/你眼中的光"), ["我能看见", "你眼中的光"]);
});

test("输入中途的空分段和纯空白分段不会产生无效片段", () => {
  assert.deepEqual(parseSegments("我能看见/"), ["我能看见"]);
  assert.deepEqual(parseSegments("/我能看见"), ["我能看见"]);
  assert.deepEqual(parseSegments("A //B"), ["A ", "B"]);
  assert.deepEqual(parseSegments("A/ /B"), ["A ", "B"]);
  assert.deepEqual(parseSegments(""), []);
});

test("新增分隔符只拆分所在片段，其他片段的范围和手动时间保持不变", () => {
  const manual: TranslationAlignment[] = [
    { ...two[0]!, startTime: 12_100, endTime: 14_400 },
    { ...two[1]! },
  ];
  const result = remapSegments(manual, ["我能", "看见", "你眼中的光"], context);
  assert.deepEqual(result.parts, [
    { sourceStart: 0, sourceEnd: 3, text: "我能", startTime: 12_100, endTime: 13_250 },
    { sourceStart: 3, sourceEnd: 5, text: "看见", startTime: 13_250, endTime: 14_400 },
    { sourceStart: 5, sourceEnd: 8, text: "你眼中的光" },
  ]);
});

test("删除分隔符合并相邻范围；修改片段文字不移动边界", () => {
  assert.deepEqual(remapSegments(two, ["我能看见你眼中的光"], context).parts,
    [{ sourceStart: 0, sourceEnd: 8, text: "我能看见你眼中的光" }]);
  assert.deepEqual(remapSegments(two, ["我能看见了", "你眼里的光"], context).parts, [
    { sourceStart: 0, sourceEnd: 5, text: "我能看见了" },
    { sourceStart: 5, sourceEnd: 8, text: "你眼里的光" },
  ]);
  const gapped: TranslationAlignment[] = [{ ...two[0]!, sourceEnd: 3 }, two[1]!];
  assert.deepEqual(remapSegments(gapped, ["我能看见", "你眼中的", "光"], context).parts?.slice(0, 2),
    [{ sourceStart: 0, sourceEnd: 3, text: "我能看见" }, { sourceStart: 5, sourceEnd: 7, text: "你眼中的" }]);
});

test("分段多于音节时给出可读错误，挤在一起时均匀分布", () => {
  assert.match(remapSegments(two, "一/二/三/四/五/六/七/八/九".split("/"), context).error!, /分段数（9）.*音节数（8）/);
  const crowded = remapSegments([{ sourceStart: 0, sourceEnd: 8, text: "abcdefgh" }],
    ["abcdefg", "h", ""].filter(Boolean), context);
  assert.ok(crowded.parts!.every(part => part.sourceEnd > part.sourceStart));
});

test("拖动共享边界时相邻片段一起移动，至少保留一个音节", () => {
  assert.equal(linked(two, 0, context), true);
  assert.deepEqual(snapEdge(two, 0, "end", 3, context).map(part => [part.sourceStart, part.sourceEnd]), [[0, 3], [3, 8]]);
  assert.deepEqual(snapEdge(two, 0, "end", 99, context).map(part => [part.sourceStart, part.sourceEnd]), [[0, 7], [7, 8]]);
  assert.deepEqual(snapEdge(two, 1, "start", 0, context).map(part => [part.sourceStart, part.sourceEnd]), [[0, 1], [1, 8]]);
  // A line edge may leave unsung syllables unmapped.
  assert.deepEqual(snapEdge(two, 0, "start", 2, context)[0], { sourceStart: 2, sourceEnd: 5, text: "我能看见" });
  assert.deepEqual(two[0], { sourceStart: 0, sourceEnd: 5, text: "我能看见" }, "inputs are not mutated");
});

test("自由时间只改时间，相邻片段跟随且不越过行边界", () => {
  const moved = moveEdgeTime(two, 0, "end", 14_730, context);
  assert.deepEqual(moved, [
    { sourceStart: 0, sourceEnd: 5, text: "我能看见", startTime: 12_000, endTime: 14_730 },
    { sourceStart: 5, sourceEnd: 8, text: "你眼中的光", startTime: 14_730, endTime: 16_000 },
  ]);
  assert.equal(moveEdgeTime(two, 1, "end", 99_000, context)[1]!.endTime, 16_000);
  assert.equal(moveEdgeTime(two, 0, "start", 0, context)[0]!.startTime, 12_000);
  // Snapping a manual edge returns it to the syllable grid without losing the other edge.
  const snapped = snapEdge(moved, 0, "end", 4, context);
  assert.deepEqual(snapped.map(part => [part.startTime, part.endTime]), [[12_000, 14_000], [14_000, 16_000]]);
});

test("指针时间吸附到最近的音节边界", () => {
  assert.equal(nearestBoundary(11_000, context), 0);
  assert.equal(nearestBoundary(13_240, context), 2);
  assert.equal(nearestBoundary(13_260, context), 3);
  assert.equal(nearestBoundary(99_000, context), 8);
});

test("动画预设可识别，未设置等同标准，其他值为自定义", () => {
  for (const preset of MOTION_PRESETS) assert.equal(motionPresetId(preset.motion), preset.id);
  assert.equal(motionPresetId(undefined), "standard");
  assert.equal(motionPresetId({ amplitude: 1, stagger: 0.4, settleMs: 300 }), "standard");
  assert.equal(motionPresetId({ amplitude: 1.1 }), "custom");
});
