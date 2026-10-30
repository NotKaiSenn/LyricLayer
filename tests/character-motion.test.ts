import assert from "node:assert/strict";
import test from "node:test";
import { sampleCharacterMotion as sample } from "../src/character-motion.ts";

const close = (actual: number, expected: number, epsilon = 1e-8): void => {
  assert.ok(Math.abs(actual - expected) <= epsilon, actual + " != " + expected);
};

test("同一个原词的译字拥有独立起点，短窗口仍有可见运动", () => {
  const common = { sourceDurationMs: 800, positionMs: 150 };
  const first = sample({ ...common, startTime: 0, endTime: 200 });
  const second = sample({ ...common, startTime: 200, endTime: 400 });
  assert.ok(first.scale > 1.02);
  assert.ok(first.ySize < -0.02);
  assert.equal(second.scale, 0.95);
  assert.equal(second.ySize, 0.01);
  assert.equal(second.gradient, -20);
  assert.equal(second.isMoving, false);
  const later = sample({ ...common, positionMs: 350, startTime: 200, endTime: 400 });
  close(later.scale, first.scale);
  close(later.ySize, first.ySize);
  close(later.glowOpacity, first.glowOpacity);
});

test("拆分窗口重放原词的完整 spline/spring 形状而不只产生微弱脉冲", () => {
  for (const elapsed of [0, 25, 75, 140, 199, 220, 350, 700]) {
    const whole = sample({ positionMs: elapsed * 4, startTime: 0, endTime: 800, sourceDurationMs: 800 });
    const split = sample({ positionMs: elapsed, startTime: 0, endTime: 200, sourceDurationMs: 800 });
    close(split.scale, whole.scale);
    close(split.ySize, whole.ySize);
    close(split.glowOpacity, whole.glowOpacity);
    close(split.gradient, whole.gradient);
  }
});

test("自然 cubic 驱动 spring 的绝对采样符合独立数值积分", () => {
  // Natural three-point spline, computed directly from the upstream scale
  // anchors (0,.95), (.7,1.0505), (1,1); independently integrate its ODE.
  const middleSecond = 3 * ((1 - 1.0505) / 0.3 - (1.0505 - 0.95) / 0.7);
  const target = (t: number): number => {
    if (t >= 1) return 1;
    const left = t < 0.7 ? 0 : 0.7;
    const right = t < 0.7 ? 0.7 : 1;
    const a = t < 0.7 ? 0.95 : 1.0505;
    const b = t < 0.7 ? 1.0505 : 1;
    const ma = t < 0.7 ? 0 : middleSecond;
    const mb = t < 0.7 ? middleSecond : 0;
    const width = right - left;
    return ma * (right - t) ** 3 / (6 * width) + mb * (t - left) ** 3 / (6 * width)
      + (a - ma * width ** 2 / 6) * (right - t) / width
      + (b - mb * width ** 2 / 6) * (t - left) / width;
  };
  let position = 0.95;
  let velocity = 0;
  const step = 0.00001;
  const omega = 0.88 * 2 * Math.PI;
  for (let i = 0; i < 150000; i++) {
    const time = i * step;
    const acceleration = omega ** 2 * (target(time) - position) - 2 * 0.64 * omega * velocity;
    const midpointPosition = position + velocity * step / 2;
    const midpointVelocity = velocity + acceleration * step / 2;
    const midpointAcceleration = omega ** 2 * (target(time + step / 2) - midpointPosition)
      - 2 * 0.64 * omega * midpointVelocity;
    position += midpointVelocity * step;
    velocity += midpointAcceleration * step;
    if (i === 39999 || i === 69999 || i === 99999 || i === 149999) {
      close(sample({ positionMs: (i + 1) * step * 1000, startTime: 0, endTime: 1000 }).scale, position, 1e-7);
    }
  }
});

test("结束后保留 spring 回落，拖动与播放历史不改变结果", () => {
  const options = { startTime: 4000, endTime: 4800, sourceDurationMs: 800 };
  const tail = sample({ ...options, positionMs: 4850 });
  assert.equal(tail.gradient, 100);
  assert.equal(tail.isMoving, true);
  assert.ok(Math.abs(tail.scale - 1) > 0.01);
  sample({ ...options, positionMs: 20000 });
  sample({ ...options, positionMs: 1000 });
  assert.deepEqual(sample({ ...options, positionMs: 4850 }), tail);
  const settled = sample({ ...options, positionMs: 20000 });
  close(settled.scale, 1);
  close(settled.ySize, 0);
  assert.equal(settled.isMoving, false);
});

test("Simple 普通 word 只有浮起，Emphasis 保留独立的长短音强度", () => {
  const options = { positionMs: 700, startTime: 0, endTime: 1800, simple: true, motionDurationMs: 1800 };
  const ordinary = sample(options);
  assert.equal(ordinary.scale, 1);
  assert.equal(ordinary.glowOpacity, 0);
  assert.ok(ordinary.ySize < 0.01);
  const short = sample({ ...options, kind: "emphasis", sourceDurationMs: 1499 });
  const long = sample({ ...options, kind: "emphasis", sourceDurationMs: 1501 });
  assert.ok(long.scale > short.scale);
  assert.ok(long.glowOpacity > short.glowOpacity);
  assert.ok(long.ySize < short.ySize);
});

test("普通强调使用原字母的更大 scale、双倍 lift 与 glow，而非基础 word 动画", () => {
  const options = { positionMs: 700, startTime: 0, endTime: 1000 };
  const ordinary = sample(options);
  const emphasized = sample({ ...options, kind: "emphasis" });
  assert.ok(emphasized.scale > ordinary.scale + 0.03);
  assert.ok(emphasized.ySize < ordinary.ySize);
  assert.ok(emphasized.glowOpacity > ordinary.glowOpacity * 3);
  close(emphasized.gradient, -20 + 120 * Math.sin(0.7 * Math.PI / 2));
});

test("Refreshed 强调的波形延续原长音，但未来译字不会整组提前抬起", () => {
  const options = { kind: "emphasis" as const, refreshed: true, startTime: 1000, endTime: 1200, sourceDurationMs: 4000 };
  const before = sample({ ...options, positionMs: 999 });
  assert.equal(before.scale, 1);
  assert.equal(before.yEm, 0);
  assert.equal(before.ySize, 0.01);
  assert.equal(before.isMoving, false);
  const held = sample({ ...options, positionMs: 2700 });
  assert.equal(held.gradient, 100);
  assert.ok(held.scale > 1.07);
  assert.ok(held.yEm < -0.03);
  assert.equal(held.isMoving, true);
  const short = sample({ ...options, sourceDurationMs: 200, positionMs: 2700 });
  assert.equal(short.scale, 1);
  assert.equal(short.isMoving, false);
});

test("Refreshed 保留原两段 bezier 峰值、末词强度、横向展开及背景浮起", () => {
  const options = { kind: "emphasis" as const, refreshed: true, startTime: 0, endTime: 400,
    sourceDurationMs: 2000, positionMs: 1000, count: 4, index: 0 };
  const plain = sample(options);
  close(plain.scale, 1.06);
  close(plain.xEm, -0.036);
  close(plain.glowBlurEm, (2 / 3) ** 3 * 0.5 * 0.3);
  const last = sample({ ...options, isLastWord: true, positionMs: 1200 });
  close(last.scale, 1.096);
  assert.ok(last.glowOpacity > plain.glowOpacity);
  const background = sample({ ...options, isBackground: true });
  assert.ok(background.yEm < plain.yEm);
  assert.equal(background.scale, plain.scale);
  const other = sample({ ...options, index: 3 });
  assert.ok(other.xEm > 0);
});

test("极短字窗以及所有模式的提前/结束采样始终有限", () => {
  for (const simple of [false, true]) for (const refreshed of [false, true]) {
    for (const kind of ["word", "emphasis"] as const) for (const duration of [0, 0.1, 16, 100, 10000]) {
      for (const positionMs of [-1, 0, 0.05, 16, 500, 40000]) {
        const frame = sample({ positionMs, startTime: 0, endTime: duration, sourceDurationMs: duration, simple, refreshed, kind });
        for (const [key, value] of Object.entries(frame)) {
          if (typeof value === "number") assert.ok(Number.isFinite(value), key + " must be finite");
        }
      }
    }
  }
});

test("多 cue 的填色 phase 与累计有效运动时长独立，运动尾部不强制完成填色", () => {
  const options = { positionMs: 700, startTime: 0, endTime: 1000, sourceDurationMs: 1000 };
  const original = sample(options);
  const projected = sample({ ...options, fillProgress: 0.25 });
  close(projected.gradient, 10);
  for (const key of ["scale", "xEm", "yEm", "ySize", "glowOpacity", "glowBlurPx"] as const) {
    close(projected[key], original[key]);
  }
  const tail = sample({ ...options, positionMs: 6000, fillProgress: 0.4 });
  close(tail.gradient, 28);
  assert.equal(tail.isMoving, false);
  const alreadyFilled = sample({ ...options, positionMs: 0, fillProgress: 1 });
  assert.equal(alreadyFilled.gradient, 100);
  assert.equal(alreadyFilled.scale, 0.95);
});

test("旧 Simple 保留原120点范围和 Sung 跳变，Refreshed使用150点连续范围", () => {
  const options = { positionMs: 500, startTime: 0, endTime: 1000, simple: true };
  close(sample({ ...options, fillProgress: 0.5 }).gradient, 10);
  close(sample({ ...options, kind: "emphasis", fillProgress: 0.5 }).gradient,
    -50 + 120 * Math.sin(Math.PI / 4));
  close(sample({ ...options, fillProgress: 1 - 1e-9 }).gradient, 70, 1e-6);
  assert.equal(sample({ ...options, fillProgress: 1 }).gradient, 100);
  close(sample({ ...options, refreshed: true, fillProgress: 0.5 }).gradient, 25);
  close(sample({ ...options, refreshed: true, fillProgress: 1 - 1e-9 }).gradient, 100, 1e-6);
});

test("外部填色 phase 正确 clamp，非finite 元数据不会写入 NaN 或 Infinity 样式", () => {
  const options = { positionMs: 500, startTime: 0, endTime: 1000 };
  for (const fillProgress of [-Infinity, -2, NaN]) {
    assert.equal(sample({ ...options, fillProgress }).gradient, -20);
  }
  for (const fillProgress of [Infinity, 2]) {
    assert.equal(sample({ ...options, fillProgress }).gradient, 100);
  }
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (const kind of ["word", "emphasis"] as const) for (const simple of [false, true]) {
      for (const refreshed of [false, true]) {
        const frame = sample({ positionMs: invalid, startTime: invalid, endTime: invalid,
          sourceDurationMs: invalid, motionDurationMs: invalid, fillProgress: invalid,
          index: invalid, count: invalid, kind, simple, refreshed });
        for (const [key, value] of Object.entries(frame)) {
          if (typeof value === "number") assert.ok(Number.isFinite(value), key + " must be finite");
        }
      }
    }
  }
});
