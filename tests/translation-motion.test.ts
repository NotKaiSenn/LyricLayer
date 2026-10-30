import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { sampleCharacterMotion as rawSample } from "../src/character-motion.ts";
import type { CharacterMotionOptions, CharacterMotionSample } from "../src/character-motion.ts";
import type { TranslationMotionSettings } from "../src/types.ts";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/translation-motion.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node",
});
const { sampleTranslationMotion: sample } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0]!.text).toString("base64")}`) as {
  sampleTranslationMotion: (options: CharacterMotionOptions & { motion?: TranslationMotionSettings }) => CharacterMotionSample;
};
const modes = [
  { kind: "word" }, { kind: "emphasis" },
  { kind: "word", simple: true }, { kind: "emphasis", simple: true },
  { kind: "word", refreshed: true }, { kind: "emphasis", refreshed: true, isLastWord: true },
] as const;
const rest = (pose: CharacterMotionSample): void => {
  assert.equal(pose.scale, 1);
  assert.equal(pose.xEm, 0);
  assert.equal(pose.yEm, 0);
  assert.equal(pose.ySize, 0);
  assert.equal(pose.glowOpacity, 0);
  assert.equal(pose.glowBlurEm, 0);
  assert.equal(pose.glowBlurPx, 0);
  assert.equal(pose.isMoving, false);
};

test("每种原生曲线都在运动窗口起点前及真实源终点起严格静止，不附加长音尾巴", () => {
  for (const mode of modes) {
    const options = { ...mode, startTime: 2500, endTime: 3000, sourceDurationMs: 6000, motionDurationMs: 90_000 };
    for (const positionMs of [0, 2499, 2500, 3000, 3001, 3100, 6000, 20_000]) {
      const pose = sample({ ...options, positionMs });
      rest(pose);
      assert.equal(pose.gradient, positionMs >= 3000 ? 100 : mode.refreshed || mode.simple ? -50 : -20);
    }
  }
});

test("按真实毫秒平滑入场归位，起止点附近没有硬切的位移、缩放或光晕", () => {
  for (const mode of modes) {
    const options = { ...mode, startTime: 2000, endTime: 2800, sourceDurationMs: 3000 };
    for (const positionMs of [2000 + 0.001, 2800 - 0.001]) {
      const pose = sample({ ...options, positionMs });
      assert.ok(Math.abs(pose.scale - 1) < 1e-8);
      assert.ok(Math.abs(pose.yEm) < 1e-8);
      assert.ok(pose.glowOpacity < 1e-7);
      assert.ok(pose.glowBlurEm < 1e-8);
    }
    const near = sample({ ...options, positionMs: 2799 });
    const nearer = sample({ ...options, positionMs: 2799.9 });
    assert.ok(Math.abs(nearer.yEm) <= Math.abs(near.yEm) * 0.05 + 1e-10);
    assert.ok(Math.abs(nearer.scale - 1) <= Math.abs(near.scale - 1) * 0.05 + 1e-10);
  }
});

test("长音使用重叠的独立运动窗口，逐字启动且同在源结束时归位", () => {
  for (const mode of modes.filter(mode => mode.kind === "emphasis")) {
    const options = { ...mode, startTime: 1000, endTime: 4000, sourceDurationMs: 3000 };
    const samples = Array.from({ length: 101 }, (_, index) => ({
      time: 1000 + index * 30, pose: sample({ ...options, positionMs: 1000 + index * 30 }),
    }));
    const peak = samples.reduce((best, entry) => entry.pose.scale > best.pose.scale ? entry : best);
    assert.ok(peak.pose.scale > 1.005);
    assert.ok(peak.time > 1000 && peak.time < 4000);
    rest(sample({ ...options, startTime: 1200, positionMs: 1200 }));
    const first = sample({ ...options, positionMs: 2500 });
    const next = sample({ ...options, startTime: 1200, positionMs: 2500 });
    assert.ok(first.isMoving && next.isMoving);
    assert.notEqual(first.scale, next.scale);
    rest(sample({ ...options, positionMs: 4000 }));
    rest(sample({ ...options, startTime: 1200, positionMs: 4000 }));
  }
});

test("所有模式与长短音输出有限原目标姿态，只保留CSS透明度边界", () => {
  for (const mode of modes) for (const sourceDurationMs of [16, 100, 800, 3000, 30_000]) {
    for (const index of [0, 10, 29]) for (let time = 0; time <= 600; time += 5) {
      const pose = sample({ ...mode, startTime: 100, endTime: 500, sourceDurationMs,
        count: 30, index, isBackground: true, positionMs: time });
      for (const value of Object.values(pose)) if (typeof value === "number") assert.ok(Number.isFinite(value));
      assert.ok(pose.scale > 0);
      assert.equal(pose.ySize, 0);
      assert.ok(pose.glowOpacity >= 0 && pose.glowOpacity <= 100);
      assert.ok(pose.glowBlurPx >= 0);
      assert.ok(pose.glowBlurEm >= 0);
    }
  }
});

test("空间约束之前保留原始word与letter复合幅度，不再统一压到3.5%", () => {
  // A 3s word is sampled at its real 2000ms point, with no compressed tail.
  const common = { kind: "emphasis" as const, sourceDurationMs: 3000, count: 6, index: 0 };
  const target = sample({ ...common, startTime: 1000, endTime: 4000, positionMs: 3000, fillProgress: 1 });
  const native = rawSample({ ...common, startTime: 0, endTime: 3000, motionDurationMs: 3000,
    positionMs: 2000, fillProgress: 1 });
  assert.ok(target.scale > 1.2, "roomy layouts should be allowed the original emphasis");
  assert.equal(target.scale, native.scale);
  assert.equal(target.xEm, native.xEm);
  assert.equal(target.yEm, native.ySize + native.yEm);
  assert.equal(target.ySize, 0, "do not multiply the primary lyric size a second time");
  assert.equal(target.glowOpacity, Math.min(100, native.glowOpacity));
  assert.equal(target.glowBlurPx, native.glowBlurPx);
  assert.equal(target.glowBlurEm, native.glowBlurEm);
  assert.equal(target.gradient, native.gradient);
});

test("Refreshed的原始横向展开和光晕作为几何适配目标保留", () => {
  // Refreshed keeps its long wave and float timing; a glyph's fill phase no
  // longer fast-forwards the whole 5040ms float into a short character cue.
  const common = { kind: "emphasis" as const, sourceDurationMs: 3000, refreshed: true,
    isLastWord: true, count: 6, index: 0 };
  const target = sample({ ...common, startTime: 1000, endTime: 4000, positionMs: 2500 });
  const native = rawSample({ ...common, startTime: 0, endTime: 3000, motionDurationMs: 3000,
    positionMs: 1500, fillProgress: 0.5 });
  assert.ok(target.scale > 1.035);
  assert.ok(target.xEm < 0, "horizontal spread must not be unconditionally removed");
  for (const property of ["scale", "xEm", "glowOpacity", "glowBlurPx", "glowBlurEm", "gradient"] as const) {
    assert.ok(Math.abs(target[property] - native[property]) < 1e-10, property);
  }
  assert.ok(Math.abs(target.yEm - native.ySize - native.yEm) < 1e-10);
  const opposite = sample({ ...common, index: 5, startTime: 1000, endTime: 4000, positionMs: 2500 });
  assert.ok(opposite.xEm > 0);
});

test("短源按真实时间响应，100至500ms窗口不强行重放完整长音弹跳", () => {
  for (const duration of [100, 200, 500]) {
    let previous = 1;
    let peak = 1;
    let maxStep = 0;
    for (let positionMs = 0; positionMs <= duration; positionMs += 1000 / 60) {
      const pose = sample({ kind: "emphasis", startTime: 0, endTime: duration, sourceDurationMs: duration, positionMs });
      peak = Math.max(peak, pose.scale);
      maxStep = Math.max(maxStep, Math.abs(pose.scale - previous));
      previous = pose.scale;
    }
    assert.ok(peak < 1.1, `a genuinely short source has no time for a full long-note swell: ${duration}ms`);
    assert.ok(maxStep < 0.02, `a short source remains smooth at 60Hz: ${duration}ms / ${maxStep}`);
    rest(sample({ kind: "emphasis", startTime: 0, endTime: duration, sourceDurationMs: duration, positionMs: duration }));
  }
});

test("未填色的legacy字可以错峰移动但没有提前点亮的白光，Refreshed保留dim glow", () => {
  const common = { startTime: 0, endTime: 3000, sourceDurationMs: 3000, positionMs: 1500, kind: "emphasis" as const };
  for (const simple of [false, true]) {
    const waiting = sample({ ...common, simple, fillProgress: 0 });
    const partial = sample({ ...common, simple, fillProgress: 0.5 });
    const sung = sample({ ...common, simple, fillProgress: 1 });
    assert.equal(waiting.glowOpacity, 0);
    assert.ok(waiting.isMoving);
    assert.ok(partial.glowOpacity > 0 && partial.glowOpacity < sung.glowOpacity);
    assert.equal(partial.glowOpacity, sung.glowOpacity * 0.5);
    assert.equal(waiting.scale, sung.scale);
    assert.equal(waiting.yEm, sung.yEm);
  }
  assert.ok(sample({ ...common, refreshed: true, fillProgress: 0 }).glowOpacity > 0);
});

test("暂停重复读取、前后跳转和延迟挂载不改变同一时刻的姿态", () => {
  for (const mode of modes) {
    const options = { ...mode, startTime: 1000, endTime: 1500, sourceDurationMs: 3000 };
    const expected = sample({ ...options, positionMs: 1250 });
    for (const positionMs of [1600, 500, 1300, 1500, 1000, 25_000]) sample({ ...options, positionMs });
    assert.deepEqual(sample({ ...options, positionMs: 1250 }), expected);
    assert.deepEqual(sample({ ...options, positionMs: 1250 }), expected);
  }
});

test("填色进度独立于运动及收尾，可保留跨音节的不同速度", () => {
  const options = { startTime: 0, endTime: 500, sourceDurationMs: 4000, positionMs: 250, kind: "emphasis" as const };
  const a = sample({ ...options, fillProgress: 0.2 });
  const b = sample({ ...options, fillProgress: 0.8 });
  assert.equal(a.scale, b.scale);
  assert.equal(a.yEm, b.yEm);
  assert.notEqual(a.gradient, b.gradient);
  assert.equal(a.gradient, -20 + 120 * Math.sin(0.2 * Math.PI / 2));
  const ended = sample({ ...options, positionMs: 500, fillProgress: 0.2 });
  rest(ended);
  assert.equal(ended.gradient, a.gradient);
  const before = sample({ ...options, positionMs: -1, fillProgress: 0.8 });
  rest(before);
  assert.equal(before.gradient, b.gradient);
});

test("普通、Simple与Refreshed仍保留原曲线区别，不退化为同一基础跳动", () => {
  const options = { startTime: 0, endTime: 800, sourceDurationMs: 3000, positionMs: 320 };
  const ordinary = sample(options);
  const simple = sample({ ...options, simple: true });
  const emphasis = sample({ ...options, kind: "emphasis" });
  const refreshed = sample({ ...options, kind: "emphasis", refreshed: true });
  assert.equal(simple.scale, 1);
  assert.equal(simple.glowOpacity, 0);
  assert.notEqual(ordinary.yEm, simple.yEm);
  assert.ok(emphasis.scale > ordinary.scale);
  assert.notEqual(emphasis.yEm, refreshed.yEm);
  assert.notEqual(emphasis.glowOpacity, refreshed.glowOpacity);
});

test("非法时间及非有限元数据安全回退，不生成NaN样式", () => {
  for (const endTime of [0, -1, NaN, Infinity]) {
    rest(sample({ startTime: 0, endTime, positionMs: 500, fillProgress: 1 }));
  }
  for (const mode of modes) for (const positionMs of [NaN, Infinity, -Infinity, 0.0001, 0.5]) {
    const pose = sample({ ...mode, startTime: 0, endTime: 1, positionMs,
      sourceDurationMs: Infinity, motionDurationMs: NaN, count: Infinity, index: NaN });
    for (const value of Object.values(pose)) if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
});

test("幅度只乘运动增量，归位时长控制末段且所有设置仍在截止时静止", () => {
  const options = { kind: "emphasis" as const, refreshed: true, isLastWord: true,
    startTime: 0, endTime: 3000, sourceDurationMs: 3000, positionMs: 1500, fillProgress: 1, index: 0, count: 6 };
  const base = sample(options);
  const doubled = sample({ ...options, motion: { amplitude: 2 } });
  const still = sample({ ...options, motion: { amplitude: 0 } });
  assert.ok(Math.abs((doubled.scale - 1) - (base.scale - 1) * 2) < 1e-12);
  assert.equal(doubled.xEm, base.xEm * 2);
  assert.equal(doubled.yEm, base.yEm * 2);
  assert.equal(still.scale, 1);
  assert.equal(still.xEm, 0);
  assert.equal(still.yEm, 0);
  assert.equal(doubled.glowOpacity, base.glowOpacity);
  assert.equal(still.glowOpacity, base.glowOpacity);
  assert.equal(doubled.glowBlurEm, base.glowBlurEm);
  const shortReturn = sample({ ...options, positionMs: 2500, motion: { settleMs: 100 } });
  const longReturn = sample({ ...options, positionMs: 2500, motion: { settleMs: 1000 } });
  assert.ok(Math.abs((longReturn.scale - 1) - (shortReturn.scale - 1) * 0.5) < 1e-12);
  assert.equal(longReturn.xEm, shortReturn.xEm * 0.5);
  for (const motion of [{ amplitude: 0 }, { amplitude: 2, settleMs: 100 }, { amplitude: 2, settleMs: 1000 }]) {
    rest(sample({ ...options, positionMs: 3000, motion }));
  }
});
