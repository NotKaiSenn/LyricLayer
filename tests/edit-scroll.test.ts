import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/edit-scroll.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "TestScroll", footer: { js: "globalThis.TestScroll = TestScroll;" } });

function harness() {
  const dom = new JSDOM(`<div id="SpicyLyricsPage"><div class="LyricsContent"><div class="simplebar-content-wrapper"><div class="SpicyLyricsScrollContainer"><div id="editor"></div></div></div><div class="simplebar-track simplebar-vertical"><div class="simplebar-scrollbar"></div></div></div></div>`,
    { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const page = w.document.getElementById("SpicyLyricsPage")!;
  const viewport = page.querySelector<HTMLElement>(".simplebar-content-wrapper")!;
  const editor = w.document.getElementById("editor")!;
  const thumb = page.querySelector<HTMLElement>(".simplebar-scrollbar")!;
  const raw = Object.getOwnPropertyDescriptor(w.Element.prototype, "scrollTop")!;
  const geometry = { y: 800, height: 300 };
  const area = { height: 800 };
  const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 800, width: 800, x: 0, y: top, toJSON() {} });
  viewport.getBoundingClientRect = () => rect(100, area.height);
  Object.defineProperty(viewport, "clientHeight", { get: () => area.height });
  editor.getBoundingClientRect = () => rect(geometry.y - viewport.scrollTop, geometry.height);
  thumb.getBoundingClientRect = () => rect(400, 100);
  viewport.scrollTop = 300;
  viewport.scrollTo = (value: ScrollToOptions | number, y?: number) => raw.set!.call(viewport, typeof value === "number" ? y : value.top);
  viewport.scroll = viewport.scrollTo;
  viewport.scrollBy = (value: ScrollToOptions | number, y?: number) => raw.set!.call(viewport, viewport.scrollTop + (typeof value === "number" ? y! : value.top!));
  const originalTo = viewport.scrollTo;
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  w.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  w.cancelAnimationFrame = id => { frames.delete(id); };
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); };
  w.eval(bundle.outputFiles[0]!.text);
  const scroll = new w.TestScroll.EditScroll(page);
  const input = (target: Element, name: string, clientY = 0) => target.dispatchEvent(new w.MouseEvent(name, { bubbles: true, cancelable: true, clientY }));
  return { w, page, viewport, editor, thumb, raw, geometry, area, originalTo, frames, frame, scroll, input,
    close: () => { scroll.stop(); w.close(); } };
}

test("拦住强制居中和旧平滑动画的 scrollTop/scrollTo/scrollBy，释放后完整恢复", () => {
  const h = harness();
  try {
    h.scroll.reveal(h.editor);
    for (let i = 0; i < 30; i++) {
      h.viewport.scrollTop = 2000;
      h.viewport.scrollTo({ top: 2500, behavior: "smooth" });
      h.viewport.scroll(0, 2600);
      h.viewport.scrollBy({ top: 500 });
      h.frame();
      assert.equal(h.viewport.scrollTop, 300);
      assert.equal(h.editor.getBoundingClientRect().top, 500);
    }
    h.scroll.stop();
    assert.equal(h.frames.size, 0);
    assert.equal(Object.hasOwn(h.viewport, "scrollTop"), false);
    assert.equal(h.viewport.scrollTo, h.originalTo);
    h.viewport.scrollTo({ top: 900 });
    assert.equal(h.viewport.scrollTop, 900);
  } finally { h.close(); }
});

test("上下句和虚拟列表重新测量后保持面板顶端，不居中或滚动外部页面", () => {
  const h = harness();
  try {
    h.scroll.reveal(h.editor);
    const anchor = h.scroll.capture();
    h.geometry.y += 700;
    h.scroll.reveal(h.editor, anchor);
    assert.equal(h.editor.getBoundingClientRect().top, 500);
    // The old expanded row shrinks after ResizeObserver measures it.
    h.geometry.y -= 430;
    h.frame();
    assert.equal(h.editor.getBoundingClientRect().top, 500);
    h.geometry.y += 280;
    h.frame();
    assert.equal(h.editor.getBoundingClientRect().top, 500);
    assert.equal(h.w.document.documentElement.scrollTop, 0);
  } finally { h.close(); }
});

test("手动滚轮滚动采用新锚点；滚动条拖动只放行输入事件内的写入", async () => {
  const h = harness();
  try {
    h.scroll.reveal(h.editor);
    // Browser default scrolling bypasses JS property setters.
    h.input(h.editor, "wheel");
    h.raw.set!.call(h.viewport, 500);
    h.frame();
    assert.equal(h.viewport.scrollTop, 500);
    h.geometry.y += 80;
    h.frame();
    assert.equal(h.viewport.scrollTop, 580);
    h.w.document.addEventListener("mousemove", () => { h.viewport.scrollTop = 650; }, true);
    h.input(h.thumb, "pointerdown");
    await Promise.resolve();
    h.viewport.scrollTop = 3000;
    assert.equal(h.viewport.scrollTop, 580, "auto-centering during a drag is still blocked");
    h.input(h.page, "mousemove");
    assert.equal(h.viewport.scrollTop, 650);
    await Promise.resolve();
    h.input(h.page, "mouseup");
    await Promise.resolve();
    h.frame();
    h.viewport.scrollTo({ top: 3500 });
    assert.equal(h.viewport.scrollTop, 650);
  } finally { h.close(); }
});

test("点击滚动条轨道翻页、较高面板靠上显示，关闭页面释放所有拦截", () => {
  const h = harness();
  try {
    h.geometry.height = 1200;
    h.scroll.reveal(h.editor);
    assert.equal(h.editor.getBoundingClientRect().top, 220);
    const start = h.viewport.scrollTop;
    h.input(h.thumb.parentElement!, "pointerdown", 700);
    h.frame();
    assert.equal(h.viewport.scrollTop, start + 800);
    h.page.remove();
    h.frame();
    assert.equal(h.frames.size, 0);
    assert.equal(Object.hasOwn(h.viewport, "scrollTop"), false);
    assert.equal(h.viewport.classList.contains("ll-scroll-owned"), false);
  } finally { h.close(); }
});

test("原生重建滚动容器时迁移所有权，结束时保留其他代码后来设置的方法", () => {
  const h = harness();
  try {
    const replacement = h.viewport.cloneNode(true) as HTMLElement;
    h.viewport.replaceWith(replacement);
    h.frame();
    assert.equal(Object.hasOwn(h.viewport, "scrollTop"), false);
    assert.equal(Object.hasOwn(replacement, "scrollTop"), true);
    replacement.scrollTop = 1000;
    assert.equal(replacement.scrollTop, 0);
    const external = () => {};
    Object.defineProperty(replacement, "scrollTo", { configurable: true, value: external });
    h.scroll.stop();
    assert.equal(replacement.scrollTo, external);
    replacement.scrollTop = 1000;
    assert.equal(replacement.scrollTop, 1000);
  } finally { h.close(); }
});

test("非用户布局位移不改写锚点；窗口缩小时重新露出面板", () => {
  const h = harness();
  try {
    h.scroll.reveal(h.editor);
    h.raw.set!.call(h.viewport, 500);
    h.frame();
    assert.equal(h.editor.getBoundingClientRect().top, 500, "a layout clamp is not a manual scroll");
    h.area.height = 500;
    h.frame();
    assert.equal(h.editor.getBoundingClientRect().bottom, 584);
    h.frame();
    assert.equal(h.editor.getBoundingClientRect().bottom, 584);
  } finally { h.close(); }
});
