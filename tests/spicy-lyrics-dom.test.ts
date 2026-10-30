import assert from "node:assert/strict";
import test from "node:test";
import { extractLyricLines, textWithoutInjectedTranslation } from "../src/spicy-lyrics-source.ts";

// A small DOM tree fixture keeps these extraction tests runnable in Node.
// Text nodes, ancestry, selectors, cloning and removal behave independently
// of the extraction algorithm; the production function runs unchanged.
class FixtureElement {
  parentElement: FixtureElement | null = null;
  children: Array<FixtureElement | string>;
  attributes = new Set<string>();
  classes: Set<string>;

  constructor(classes: string, ...children: Array<FixtureElement | string>) {
    this.classes = new Set(classes.split(/\s+/).filter(Boolean));
    this.children = children;
    children.forEach((child) => { if (typeof child !== "string") child.parentElement = this; });
  }

  get classList() { return { contains: (name: string) => this.classes.has(name) }; }
  get textContent(): string {
    return this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }

  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const value = part.trim();
      if (value.startsWith("[")) return this.attributes.has(value.slice(1, -1));
      const [positive, negative] = value.split(":not(");
      return this.classes.has(positive!.slice(1)) && (!negative || !this.classes.has(negative.slice(1, -1)));
    });
  }

  closest(selector: string): FixtureElement | null {
    return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;
  }

  querySelectorAll(selector: string): FixtureElement[] {
    return this.children.flatMap((child) => typeof child === "string" ? [] : [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }

  cloneNode(): FixtureElement {
    const copy = new FixtureElement([...this.classes].join(" "), ...this.children.map((child) =>
      typeof child === "string" ? child : child.cloneNode()));
    copy.attributes = new Set(this.attributes);
    return copy;
  }

  remove(): void {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

const element = (classes: string, ...children: Array<FixtureElement | string>) => new FixtureElement(classes, ...children);
const read = (line: FixtureElement) => textWithoutInjectedTranslation(line as unknown as Element);
const letters = (text: string) => [...text].map((letter) => element(letter.trim() ? "letter Emphasis" : "letter Emphasis SpaceLetter", letter));

test("动态歌词的分组音节与强调字母还原为缓存中的完整单词", () => {
  const line = element("line Active",
    element("word", "I"),
    element("word-group",
      element("word PartOfWord", "re\u200B"),
      element("letterGroup PartOfWord", ...letters("mem")),
      element("word", "ber")),
    element("letterGroup LastWordInLine", ...letters("this day")));
  const cached = extractLyricLines({ Type: "Syllable", Content: [{ Type: "Vocal", Lead: { Syllables: [
    { Text: "I" }, { Text: "re\u200B", IsPartOfWord: true },
    { Text: "mem", IsPartOfWord: true }, { Text: "ber" }, { Text: "this day" },
  ] } }] });

  assert.equal(read(line), "I remember this day");
  assert.equal(read(line), cached[0]!.text);
});

test("旧版无 word-group 的音节结构仍按 PartOfWord 拼接", () => {
  const line = element("line",
    element("letterGroup PartOfWord", ...letters("un")),
    element("word PartOfWord", "break"),
    element("word", "able"),
    element("word LastWordInLine", "now"));
  assert.equal(read(line), "unbreakable now");
});

test("嵌套的 word 和 letterGroup 不重复提取内容，保留字母间空白", () => {
  const line = element("line",
    element("letterGroup", element("word", ...letters("Watch this"))),
    element("word", element("letterGroup", ...letters("glow"))));
  assert.equal(read(line), "Watch this glow");
});

test("提取只清理副本中的注入译文与罗马音，不修改正在播放的歌词 DOM", () => {
  const translation = element("lyric-layer-translation", element("word", "翻译"));
  translation.attributes.add("data-lyric-layer-translation");
  const line = element("line",
    element("word", "Hello"), element("word dot", "..."),
    element("word LastWordInLine", "world"), translation,
    element("slt-interleaved-translation", "另一译文"),
    element("slt-romanization-line", element("word", "romanization")));
  const before = line.textContent;
  assert.equal(read(line), "Hello world");
  assert.equal(line.textContent, before);
  assert.equal(translation.parentElement, line);
});

test("静态和逐行歌词清理零宽字符并保留原有词边界", () => {
  const line = element("line", "  Come\u200B ", element("", "and\u2060"), "\n go  ",
    element("slt-romanization-line", "unrelated"));
  assert.equal(read(line), "Come and go");
  assert.equal(read(element("line", "你\uFEFF好世界")), "你好世界");
});
