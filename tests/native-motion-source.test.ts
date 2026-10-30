import assert from "node:assert/strict";
import test from "node:test";
import { bindNativeMotionSources } from "../src/native-motion-source.ts";
import type { LyricLine } from "../src/types.ts";

// Minimal independent tree fixture, as in the existing extraction regressions.
class ElementFixture {
  parentElement: ElementFixture | null = null;
  children: Array<ElementFixture | string>;
  attributes = new Set<string>();
  classes: Set<string>;
  constructor(classes: string, ...children: Array<ElementFixture | string>) {
    this.classes = new Set(classes.split(/\s+/).filter(Boolean));
    this.children = children;
    children.forEach((child) => { if (typeof child !== "string") child.parentElement = this; });
  }
  get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(""); }
  get classList() { return { contains: (name: string) => this.classes.has(name) }; }
  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const value = part.trim();
      if (value.startsWith("[")) return this.attributes.has(value.slice(1, -1));
      const [positive, negative] = value.split(":not(");
      return this.classes.has(positive!.slice(1)) && (!negative || !this.classes.has(negative.slice(1, -1)));
    });
  }
  closest(selector: string): ElementFixture | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  contains(other: ElementFixture): boolean { return other === this || this.children.some((child) => typeof child !== "string" && child.contains(other)); }
  querySelectorAll(selector: string): ElementFixture[] {
    return this.children.flatMap((child) => typeof child === "string" ? [] : [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  cloneNode(): ElementFixture {
    const clone = new ElementFixture([...this.classes].join(" "), ...this.children.map((child) => typeof child === "string" ? child : child.cloneNode()));
    clone.attributes = new Set(this.attributes);
    return clone;
  }
  remove(): void { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; }
}
const node = (classes: string, ...children: Array<ElementFixture | string>) => new ElementFixture(classes, ...children);
const letters = (text: string) => [...text].map((text) => node(text.trim() ? "letter Emphasis" : "letter SpaceLetter", text));
const lyric = (...texts: string[]): LyricLine => ({ index: 0, text: texts.join(" "), syllables: texts.map((text, index) => ({ text, startTime: index * 500, endTime: (index + 1) * 500 })) });
const bind = (element: ElementFixture, data: LyricLine) => bindNativeMotionSources(element as unknown as Element, data);
const dom = (element: ElementFixture) => element as unknown as HTMLElement;

test("绑定普通词、词内音节和强调字母，保留实际原节点与外层word-group", () => {
  const first = node("word PartOfWord", "re\u200B");
  const emphasis = node("letterGroup PartOfWord", ...letters("mem"));
  const last = node("word", "ber");
  const wrapper = node("word-group", first, emphasis, last);
  const line = node("line", wrapper, node("word", "me"));
  const data = lyric("re", "mem", "ber", "me");
  data.syllables![0]!.isPartOfWord = true;
  data.syllables![1]!.isPartOfWord = true;
  const result = bind(line, data);
  assert.equal(result.size, 4);
  assert.equal(result.get(0)!.element, dom(first));
  assert.equal(result.get(1)!.element, dom(emphasis));
  assert.deepEqual(result.get(1)!.ancestors, [dom(wrapper)]);
  assert.equal(result.get(1)!.letters.length, 3);
  assert.equal(result.get(1)!.letterStart, 0);
  assert.equal(result.get(1)!.letterEnd, 3);
});

test("joined split words仍使用原音节下标，并限制每个音节的原文字母范围", () => {
  const word = node("letterGroup", ...letters("remember"));
  const line = node("line", word);
  const result = bind(line, lyric("re", "", "mem", "ber"));
  assert.deepEqual([...result.keys()], [0, 2, 3]);
  assert.equal(result.get(0)!.element, dom(word));
  assert.equal(result.get(2)!.element, dom(word));
  assert.deepEqual([result.get(0)!.letterStart, result.get(0)!.letterEnd], [0, 2]);
  assert.deepEqual([result.get(2)!.letterStart, result.get(2)!.letterEnd], [2, 5]);
  assert.deepEqual([result.get(3)!.letterStart, result.get(3)!.letterEnd], [5, 8]);
  const ordinary = node("word", "remember");
  const plain = bind(node("line", ordinary), lyric("re", "mem", "ber"));
  assert.equal(plain.size, 3);
  assert.deepEqual(plain.get(1)!.letters, []);
  assert.equal(plain.get(1)!.element, dom(ordinary));
});

test("嵌套word/letterGroup只读取一次，并保留强调容器外的完整变换链", () => {
  const inner = node("letterGroup", ...letters("glow"));
  const outer = node("word", inner);
  const wrapper = node("word-group", outer);
  const reverseInner = node("word", ...letters("now"));
  const reverseOuter = node("letterGroup", reverseInner);
  const line = node("line", wrapper, reverseOuter);
  const result = bind(line, lyric("glow", "now"));
  assert.equal(result.size, 2);
  assert.equal(result.get(0)!.element, dom(inner));
  assert.deepEqual(result.get(0)!.ancestors, [dom(wrapper), dom(outer)]);
  assert.equal(result.get(1)!.element, dom(reverseInner));
  assert.deepEqual(result.get(1)!.ancestors, [dom(reverseOuter)]);
});

test("排除注入译文、罗马音、背景声部和dots，且不修改原DOM", () => {
  const translation = node("lyric-layer-translation", node("word", "你好"));
  translation.attributes.add("data-lyric-layer-translation");
  const word = node("word", "Hello");
  const line = node("line", word, translation,
    node("slt-romanization-line", node("word", "hello")),
    node("line bg-line", node("word bg-word", "hello")),
    node("word dot", "..."));
  const before = line.textContent;
  const result = bind(line, lyric("Hello"));
  assert.equal(result.size, 1);
  assert.equal(result.get(0)!.element, dom(word));
  assert.equal(line.textContent, before);
  assert.equal(translation.parentElement, line);
});

test("空白与零宽字符不会移动音节下标或丢失内部SpaceLetter", () => {
  const group = node("letterGroup", ...letters("Watch this"));
  const result = bind(node("line", group), lyric("", "Watch\u200B", " ", "this"));
  assert.deepEqual([...result.keys()], [1, 3]);
  assert.deepEqual([result.get(1)!.letterStart, result.get(1)!.letterEnd], [0, 5]);
  assert.deepEqual([result.get(3)!.letterStart, result.get(3)!.letterEnd], [6, 10]);
  assert.equal(result.get(3)!.letters.length, 10);
  const whole = bind(node("line", node("letterGroup", ...letters("Watch this"))), lyric("Watch this"));
  assert.deepEqual([whole.get(0)!.letterStart, whole.get(0)!.letterEnd], [0, 10]);
});

test("重复文字按顺序绑定；整行文字不一致时不借用错误动画", () => {
  const first = node("word", "down,");
  const second = node("letterGroup", ...letters("down"));
  const line = node("line", first, second);
  const result = bind(line, lyric("down,", "down"));
  assert.equal(result.get(0)!.element, dom(first));
  assert.equal(result.get(1)!.element, dom(second));
  for (const data of [lyric("down", "down"), lyric("Down,", "down"), lyric("down,", "another")]) assert.equal(bind(line, data).size, 0);
});

test("一个缓存音节跨多个独立原词时跳过该音节，其余可靠绑定保留", () => {
  const valid = node("word", "go");
  const line = node("line", node("word", "Watch"), node("word", "this"), valid);
  const result = bind(line, lyric("Watch this", "go"));
  assert.deepEqual([...result.keys()], [1]);
  assert.equal(result.get(1)!.element, dom(valid));
});
