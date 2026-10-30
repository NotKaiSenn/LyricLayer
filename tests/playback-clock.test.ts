import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/playback-clock.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "LyricLayerClock",
});

function harness() {
  const state = { raw: 5000, playing: true, settings: "{}", simple: false };
  const native: { getProgress?: () => unknown } = {};
  const player = { getProgress: () => state.raw, isPlaying: () => state.playing };
  const storage = { get: (key: string) => { assert.equal(key, "SL:settings"); return state.settings; } };
  const context = {
    window: { SpicyLyrics: { testing: native }, Spicetify: { Player: player, LocalStorage: storage } },
    document: { getElementById: (id: string) => {
      assert.equal(id, "SpicyLyricsPage");
      return { classList: { contains: (name: string) => { assert.equal(name, "SimpleLyricsMode"); return state.simple; } } };
    } },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const { playbackPosition } = (context as typeof context & {
    LyricLayerClock: { playbackPosition: () => number | undefined };
  }).LyricLayerClock;
  return { state, native, player, storage, position: playbackPosition };
}

test("优先原生歌词时钟，不重复叠加其补偿与用户偏移", () => {
  const run = harness();
  run.native.getProgress = () => 4321;
  run.state.settings = '{"playbackOffset":2000}';
  assert.equal(run.position(), 4321);
  run.state.simple = true;
  assert.equal(run.position(), 4287.5);
  run.state.playing = false;
  assert.equal(run.position(), 4287.5);
});

test("fallback遵循偏移方向，播放加100ms，暂停不累加时间", () => {
  const run = harness();
  run.state.settings = '{"playbackOffset":750}';
  assert.equal(run.position(), 4350);
  run.state.playing = false;
  assert.equal(run.position(), 4250);
  assert.equal(run.position(), 4250);
  run.state.settings = '{"playbackOffset":-750}';
  assert.equal(run.position(), 5750);
  run.state.simple = true;
  assert.equal(run.position(), 5716.5);
});

test("同页修改偏移与Simple模式即时生效，倒退跳转直接采用新位置", () => {
  const run = harness();
  assert.equal(run.position(), 5100);
  run.state.settings = '{"playbackOffset":200}';
  assert.equal(run.position(), 4900);
  run.state.raw = 2500;
  assert.equal(run.position(), 2400);
  run.state.simple = true;
  assert.equal(run.position(), 2366.5);
  run.state.settings = '{"playbackOffset":0}';
  assert.equal(run.position(), 2566.5);
});

test("坏配置与存储异常不会中断动画，也不会保留上一个偏移", () => {
  const run = harness();
  run.state.settings = '{"playbackOffset":750}';
  assert.equal(run.position(), 4350);
  for (const settings of ["bad json", "null", "[]", '{"playbackOffset":"750"}', '{"playbackOffset":1e400}']) {
    run.state.settings = settings;
    assert.equal(run.position(), 5100);
    assert.equal(run.position(), 5100);
  }
  run.storage.get = () => { throw new Error("storage unavailable"); };
  assert.equal(run.position(), 5100);
});

test("原生API异常或非数值时降级，缺失player时钟返回undefined", () => {
  const run = harness();
  for (const value of [undefined, "1234", NaN, Infinity]) {
    run.native.getProgress = () => value;
    assert.equal(run.position(), 5100);
  }
  run.native.getProgress = () => { throw new Error("not ready"); };
  assert.equal(run.position(), 5100);
  run.player.getProgress = () => NaN;
  assert.equal(run.position(), undefined);
  run.player.getProgress = () => { throw new Error("player unavailable"); };
  assert.equal(run.position(), undefined);
});

test("起点、负偏移结果与Simple补偿不会产生负时钟", () => {
  const run = harness();
  run.state.raw = 0;
  run.state.playing = false;
  run.state.simple = true;
  run.state.settings = '{"playbackOffset":500}';
  assert.equal(run.position(), 0);
  run.native.getProgress = () => 0;
  assert.equal(run.position(), 0);
});
