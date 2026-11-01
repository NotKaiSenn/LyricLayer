import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/audition.ts", import.meta.url))],
  bundle: true, write: false, format: "esm" });
const { Audition } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0]!.text).toString("base64")}`) as typeof import("../src/audition.ts");

function harness() {
  const state = { playing: true, position: 40000 };
  const commands: Array<string | number> = [];
  const changes: boolean[] = [];
  const errors: string[] = [];
  const player = {
    data: { item: { uri: "track:a" } },
    isPlaying: () => state.playing, getProgress: () => state.position,
    pause: (): void | Promise<void> => { commands.push("pause"); },
    seek: (time: number): void | Promise<void> => { commands.push(time); },
    play: (): void | Promise<void> => { commands.push("play"); },
  };
  const audition = new Audition(() => player, value => changes.push(value), message => errors.push(message));
  const start = () => {
    audition.toggle(8500, 12600, 0);
    state.playing = false;
    audition.tick(300);
    state.position = 8500;
    audition.tick(700);
    audition.tick(760);
    state.playing = true;
    audition.tick(900);
  };
  return { state, commands, changes, errors, player, audition, start };
}

test("试听按暂停、定位确认、播放确认排序，旧位置不会误停或提前播放", () => {
  const h = harness();
  h.audition.toggle(8500, 12600, 0);
  h.audition.tick(200);
  assert.deepEqual(h.commands, ["pause"]);
  h.state.playing = false;
  h.audition.tick(300);
  h.state.position = 12600;
  h.audition.tick(500);
  assert.deepEqual(h.commands, ["pause", 8500]);
  h.state.position = 8500;
  h.audition.tick(800);
  h.audition.tick(860);
  assert.deepEqual(h.commands, ["pause", 8500, "play"]);
  h.state.playing = true;
  h.state.position = 12600;
  h.audition.tick(5000);
  assert.deepEqual(h.changes, [true, false]);
  assert.equal(h.commands.at(-1), "pause");
});

test("长时间暂停再播放不消耗试听长度，只有歌曲实际到达终点才停止", () => {
  const h = harness();
  h.start();
  h.state.position = 10000;
  h.state.playing = false;
  h.audition.tick(2000);
  h.audition.tick(60000);
  assert.deepEqual(h.changes, [true]);
  h.state.playing = true;
  h.audition.tick(61000);
  h.state.position = 12600;
  h.audition.tick(63600);
  assert.deepEqual(h.changes, [true, false]);
});

test("快速停止/重启不会留下延迟播放，旧异步失败不能取消新试听", async () => {
  const h = harness();
  h.state.playing = false;
  let reject!: (error: Error) => void;
  h.player.seek = () => new Promise((_, fail) => { reject = fail; });
  h.audition.toggle(8500, 12600, 0);
  h.audition.stop();
  h.player.seek = time => { h.commands.push(time); };
  h.audition.toggle(18500, 22600, 100);
  reject(new Error("old seek"));
  await Promise.resolve();
  h.state.position = 18500;
  h.audition.tick(200);
  h.audition.tick(260);
  assert.equal(h.commands.filter(command => command === "play").length, 1);
  assert.deepEqual(h.changes, [true, false, true]);
  assert.deepEqual(h.errors, []);
});

test("命令失败或超时恢复按钮，切歌和手动跳走不会暂停新位置", async () => {
  for (const asyncFailure of [false, true]) {
    const h = harness();
    if (asyncFailure) h.player.pause = () => Promise.reject(new Error("offline"));
    h.audition.toggle(8500, 12600, 0);
    if (asyncFailure) await Promise.resolve(); else h.audition.tick(6000);
    assert.deepEqual(h.changes, [true, false]);
    assert.equal(h.errors.length, 1);
  }
  for (const trackChange of [false, true]) {
    const h = harness();
    h.start();
    const before = h.commands.length;
    if (trackChange) h.player.data.item.uri = "track:b";
    else h.state.position = 50000;
    h.audition.tick(1000);
    assert.equal(h.commands.length, before);
    assert.deepEqual(h.changes, [true, false]);
  }
});
