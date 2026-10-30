import assert from "node:assert/strict";
import test from "node:test";
import { constrainMotion } from "../src/motion-collision.ts";
import type { MotionGlyph, MotionLimit, Rect } from "../src/motion-collision.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const box = (left: number, top = 0, width = 20, height = 24): Rect => ({ left, right: left + width, top, bottom: top + height });
const glyph = (left: number, options: Partial<MotionGlyph> = {}): MotionGlyph => ({
  rects: [box(left)], originX: left + 10, originY: 12, scale: 1.26, x: 0, y: -4, ...options,
});
function posed(rect: Rect, input: MotionGlyph, pose: MotionLimit): Rect {
  return {
    left: input.originX + (rect.left - input.originX) * pose.scale + pose.x,
    right: input.originX + (rect.right - input.originX) * pose.scale + pose.x,
    top: input.originY + (rect.top - input.originY) * pose.scale + pose.y,
    bottom: input.originY + (rect.bottom - input.originY) * pose.scale + pose.y,
  };
}
function separated(a: Rect, b: Rect, margin = 0): boolean {
  return a.right + margin <= b.left + 1e-8 || b.right + margin <= a.left + 1e-8
    || a.bottom + margin <= b.top + 1e-8 || b.bottom + margin <= a.top + 1e-8;
}
function checkAll(inputs: MotionGlyph[], outputs: MotionLimit[], obstacles: Rect[] = [], margin = 0): void {
  inputs.forEach((input, i) => input.rects.forEach(rect => {
    const result = posed(rect, input, outputs[i]!);
    for (let j = i + 1; j < inputs.length; j++) for (const other of inputs[j]!.rects) {
      assert.ok(separated(result, posed(other, inputs[j]!, outputs[j]!), margin), `glyphs ${i}/${j} collide`);
    }
    for (const obstacle of obstacles) assert.ok(separated(result, obstacle, margin), "obstacle collision");
  }));
}

test("空隙足够时保留原缩放、横移和浮动，不套用全局幅度上限", () => {
  const inputs = [glyph(0, { x: 3 }), glyph(50, { x: -2 }), glyph(140, { scale: 1.6, y: -12 })];
  const result = constrainMotion(inputs);
  inputs.forEach((input, i) => {
    near(result[i]!.scale, input.scale); near(result[i]!.x, input.x); near(result[i]!.y, input.y);
    assert.deepEqual([result[i]!.scaleGain, result[i]!.xGain, result[i]!.yGain], [1, 1, 1]);
  });
  checkAll(inputs, result, [], 0.5);
});

test("紧排字只压缩向邻字侵入的分量，上下浮动仍保留原幅度", () => {
  const inputs = [glyph(0), glyph(21, { scale: 1, y: 0 })];
  const [first, second] = constrainMotion(inputs, [], 0);
  near(first!.scale, 1.1); near(first!.y, -4);
  near(second!.scale, 1); near(second!.y, 0);
  assert.ok(first!.scale > 1.035);
  checkAll(inputs, [first!, second!]);
  const both = [glyph(0), glyph(21)];
  const pair = constrainMotion(both, [], 0);
  near(pair[0]!.scale, 1.05); near(pair[1]!.scale, 1.05);
  checkAll(both, pair);
});

test("横向展开靠近邻字才受限，且各字对独立、遍历顺序无关", () => {
  const inputs = [glyph(0, { x: 4 }), glyph(22, { x: -3 }), glyph(90, { x: 3 }), glyph(150, { x: -2 })];
  const result = constrainMotion(inputs);
  assert.ok(result[0]!.x < 4 && result[1]!.x > -3);
  near(result[2]!.scale, 1.26); near(result[2]!.x, 3);
  near(result[3]!.scale, 1.26); near(result[3]!.x, -2);
  const order = [3, 1, 0, 2];
  const shuffled = constrainMotion(order.map(i => inputs[i]!));
  order.forEach((index, i) => assert.deepEqual(shuffled[i], result[index]));
  checkAll(inputs, result, [], 0.5);
});

test("裁掉空格后的非对称字框使用真实变换中心，收缩也可能侵入邻字", () => {
  const inputs = [glyph(0, { rects: [box(0, 0, 30)], originX: 15, scale: 1, y: 0 }),
    glyph(32, { rects: [box(32, 0, 10)], originX: 0, scale: 0.8, y: 0 })];
  const result = constrainMotion(inputs, [], 0);
  near(result[1]!.scale, 0.9375);
  assert.ok(result[1]!.scaleGain < 1);
  checkAll(inputs, result);
  const whitespace = [glyph(0, { rects: [box(0, 0, 10)], originX: 20, scale: 1.3, x: 0, y: 0 }), glyph(24, { scale: 1, y: 0 })];
  const expanded = constrainMotion(whitespace, [], 0);
  near(expanded[0]!.scale, 1.3);
  checkAll(whitespace, expanded);
});

test("换行和多行片段按矩形处理，同一字的多个片段不会互相限制", () => {
  const inputs = [glyph(0, { rects: [box(0, 0, 50, 20), box(0, 25, 30, 20)], originX: 25, originY: 22.5, scale: 1.2, y: 0 }),
    glyph(5, { rects: [box(5, 49, 35, 20)], originX: 22.5, originY: 59, scale: 1.2, y: -5, x: 2 })];
  const result = constrainMotion(inputs, [], 0.5);
  assert.ok(result[1]!.y > -5);
  near(result[1]!.x, 2);
  checkAll(inputs, result, [], 0.5);
  const alone = constrainMotion([inputs[0]!]);
  near(alone[0]!.scale, 1.2);
});

test("原歌词静态障碍限制向上侵入，横向空隙仍保留展开", () => {
  const inputs = [glyph(0, { rects: [box(0, 35)], originY: 47, scale: 1.3, x: 2, y: -12 })];
  const obstacles = [box(-10, 0, 80, 30)];
  const result = constrainMotion(inputs, obstacles, 1);
  assert.ok(result[0]!.y > -12 && result[0]!.scale < 1.3);
  near(result[0]!.x, 2);
  checkAll(inputs, result, obstacles, 1);
});

test("对角字框按中性几何选择更宽的空隙，不让远处的上一行压低当前字幅度", () => {
  const inputs = [glyph(0, { y: -10 }), glyph(100, { rects: [box(100, 26)], originY: 38, y: -15, x: 2 })];
  const result = constrainMotion(inputs);
  inputs.forEach((input, i) => { near(result[i]!.scale, input.scale); near(result[i]!.y, input.y); });
  checkAll(inputs, result, [], 0.5);
});

test("对角轴不随连续姿态换轴，临界点没有位移跳变", () => {
  const inputsAt = (t: number) => [glyph(0, { scale: 1.2, x: 2 + t, y: 1.6 - t }),
    glyph(22, { rects: [box(22, 26)], originY: 38, scale: 1, x: 0, y: 0 })];
  // Previously the two axis gains crossed here. y jumped from 1.6 to 0.6px
  // and x from 0.75 to 2px, despite the input changing only 0.000002px.
  const before = constrainMotion(inputsAt(-1e-6))[0]!;
  const after = constrainMotion(inputsAt(1e-6))[0]!;
  for (const property of ["scale", "x", "y"] as const) {
    assert.ok(Math.abs(after[property] - before[property]) < 0.00001, `${property} jumped`);
  }
  for (let step = -100; step <= 100; step++) {
    const inputs = inputsAt(step / 100);
    const result = constrainMotion(inputs);
    near(result[0]!.y, inputs[0]!.y);
    checkAll(inputs, result, [], 0.5);
  }
});

test("预算边缘只有很窄的保守平滑段，位置与速度连续且不突破间距", () => {
  const at = (demand: number) => {
    const inputs = [glyph(0, { scale: 1, x: demand }), glyph(22, { scale: 1, y: 0 })];
    const result = constrainMotion(inputs);
    checkAll(inputs, result, [], 0.5);
    near(result[0]!.y, -4);
    return result[0]!.x;
  };
  const budget = 1.5, width = budget * 0.1;
  for (const demand of [0, 0.5, 1, budget - width]) near(at(demand), demand);
  for (const demand of [budget + width, 2, 5]) near(at(demand), budget);
  near(at(budget), budget - width / 4);
  for (let step = 0; step <= 200; step++) {
    const demand = (budget - width) + step / 200 * 2 * width;
    const actual = at(demand);
    assert.ok(actual <= Math.min(demand, budget) + 1e-10);
    assert.ok(Math.min(demand, budget) - actual <= width / 4 + 1e-10);
  }
  const h = 1e-5;
  for (const boundary of [budget - width, budget, budget + width]) {
    const left = (at(boundary) - at(boundary - h)) / h;
    const right = (at(boundary + h) - at(boundary)) / h;
    assert.ok(Math.abs(left - right) < 0.0001, `velocity corner at ${boundary}`);
  }
});

test("平滑预算不依赖前帧，不会为截止点添加拖尾", () => {
  const pose = [glyph(0, { scale: 1, x: 1.5 }), glyph(22, { scale: 1, y: 0 })];
  const expected = constrainMotion(pose);
  constrainMotion([glyph(0, { x: 30, y: 6 }), glyph(22)]);
  assert.deepEqual(constrainMotion(pose), expected);
  const neutral = pose.map(input => ({ ...input, scale: 1, x: 0, y: 0 }));
  constrainMotion(neutral).forEach(result => assert.deepEqual([result.scale, result.x, result.y], [1, 0, 0]));
});

test("移动障碍跨过接触点时只限制挤入分量，切向与离开运动没有突跳", () => {
  for (const y of [-2, 0, 2]) {
    const input = glyph(0, { rects: [box(0, 0, 10, 10)], originX: 5, originY: 5, scale: 1.2, x: 2, y });
    const at = (t: number, margin = 0) => {
      const obstacle = box(0, 10 - t, 10, 10);
      const result = constrainMotion([input], [obstacle], margin)[0]!;
      near(result.x, 2);
      if (y <= 0) near(result.y, y);
      const actual = posed(input.rects[0]!, input, result);
      // In the pre-existing overlap, never make penetration deeper. With a
      // positive neutral gap, it remains a normally separated pair.
      assert.ok(obstacle.top - actual.bottom >= Math.min(0, -t) - 1e-8);
      if (t <= 0) checkAll([input], [result], [obstacle]);
      return result;
    };
    const before = at(-1e-6), after = at(1e-6);
    for (const property of ["scale", "x", "y"] as const) {
      assert.ok(Math.abs(before[property] - after[property]) < 0.00001, `${property} jumped at contact`);
    }
    for (const t of [-0.1, -0.001, 0, 0.001, 0.1]) {
      at(t);
      at(t, 0.5);
    }
  }
});

test("已有轻微重叠只禁止继续侵入，保留收缩、切向和明确离开方向", () => {
  const inputs = [glyph(0, { x: -3 }), glyph(19.9, { x: 3, y: 5 })];
  const result = constrainMotion(inputs);
  near(result[0]!.scale, 1); near(result[1]!.scale, 1);
  inputs.forEach((input, i) => { near(result[i]!.x, input.x); near(result[i]!.y, input.y); });
  checkAll(inputs, result);
  const shrinking = inputs.map(input => ({ ...input, scale: 0.8 }));
  constrainMotion(shrinking).forEach(result => near(result.scale, 0.8));
  const reversed = constrainMotion([...inputs].reverse());
  assert.deepEqual(reversed.reverse(), result);
});

test("完全对齐的重叠框不以遍历顺序猜测离开方向，仍保留切向浮动", () => {
  const inputs = [glyph(0, { x: -3 }), glyph(0, { x: 3, y: 5 })];
  const result = constrainMotion(inputs);
  result.forEach((output, i) => {
    near(output.scale, 1); near(output.x, 0); near(output.y, inputs[i]!.y);
  });
  assert.deepEqual(constrainMotion([...inputs].reverse()).reverse(), result);
});

test("整体平移和正比例缩放不改变幅度比例，负坐标不影响安全性", () => {
  const inputs = [glyph(0, { x: 3 }), glyph(24, { x: -2 }), glyph(47, { scale: 1.1, y: 4 })];
  const original = constrainMotion(inputs, [], 0.5);
  const k = 1.75, dx = -500, dy = -70;
  const transformed = inputs.map(input => ({ ...input, originX: input.originX * k + dx, originY: input.originY * k + dy,
    x: input.x * k, y: input.y * k, rects: input.rects.map(r => ({ left: r.left * k + dx, right: r.right * k + dx,
      top: r.top * k + dy, bottom: r.bottom * k + dy })) }));
  const result = constrainMotion(transformed, [], 0.5 * k);
  result.forEach((actual, i) => { near(actual.scale, original[i]!.scale); near(actual.x / k, original[i]!.x); near(actual.y / k, original[i]!.y); });
  checkAll(transformed, result, [], 0.5 * k);
});

test("不会依赖邻字向外移动或缩小腾出的空间，组合约束仍保持分离", () => {
  const inputs = [glyph(0, { x: -6, scale: 1.3 }), glyph(22, { x: -5, scale: 0.8 }), glyph(43, { x: -7, scale: 1.4 })];
  const result = constrainMotion(inputs, [box(-25)], 0.5);
  checkAll(inputs, result, [box(-25)], 0.5);
});

test("中性姿态始终不变，错误几何和极端输入不会产生非有限样式", () => {
  const neutral = [glyph(0, { scale: 1, x: 0, y: 0 }), glyph(20, { scale: 1, x: 0, y: 0 })];
  constrainMotion(neutral).forEach(result => assert.deepEqual([result.scale, result.x, result.y], [1, 0, 0]));
  const overlapping = constrainMotion([glyph(0), glyph(10)]);
  overlapping.forEach(result => assert.deepEqual([result.scale, result.x, result.y], [1, 0, -4]));
  const extremes = [glyph(-100, { scale: 1e308, x: 1e308, y: -1e308 }), glyph(0, { scale: -2, x: NaN, y: Infinity }),
    glyph(30, { originX: NaN, originY: Infinity, rects: [box(30), { left: NaN, right: 40, top: 0, bottom: 20 }] })];
  for (const result of constrainMotion(extremes, [], NaN)) for (const value of Object.values(result)) assert.ok(Number.isFinite(value));
  assert.deepEqual(constrainMotion([]), []);
});

test("不同字宽、换行、偏心中心和混合运动的随机布局均保持真实矩形分离", () => {
  let seed = 0x23ba91;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let run = 0; run < 250; run++) {
    const inputs: MotionGlyph[] = [];
    for (let row = 0; row < 3; row++) {
      let left = -40;
      for (let column = 0; column < 5; column++) {
        const width = 8 + random() * 35;
        const rect = box(left, row * 40 - 25, width, 22 + random() * 8);
        inputs.push(glyph(left, { rects: [rect], originX: left + width / 2 + (random() - 0.5) * 28,
          originY: rect.top + 12 + (random() - 0.5) * 20, scale: 0.45 + random() * 1.6,
          x: (random() - 0.5) * 30, y: (random() - 0.5) * 25 }));
        left = rect.right + 1 + random() * 12;
      }
    }
    checkAll(inputs, constrainMotion(inputs, [], 0.5), [], 0.5);
  }
});
