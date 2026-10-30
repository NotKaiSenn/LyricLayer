import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import type { LyricLine, TrackInfo, TranslationEntry, TranslationLine } from "../src/types.ts";

// The real ui.ts, with only the visual editor replaced so a test can drive
// its onApply/onClose callbacks directly.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/ui.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "LyricLayerUi",
  plugins: [{ name: "visual-editor-boundary", setup(builder) {
    builder.onResolve({ filter: /^\.\/visual-editor$/ }, () => ({ path: "visual", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
      contents: "export const createVisualEditor = options => globalThis.__createVisualEditor(options);",
    }));
  } }],
});

export const settle = () => new Promise<void>(resolve => setImmediate(resolve));

type Listener = (event: FixtureEvent) => void;
export interface FixtureEvent {
  target: ElementFixture;
  key?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  clipboardData?: { getData(type: string): string };
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface VisualOptions {
  line: LyricLine;
  translation: TranslationLine;
  onApply: (draft: TranslationLine) => void;
  onClose: () => void;
}

export interface HarnessOptions {
  entry?: TranslationEntry;
  lyrics?: LyricLine[];
  exportLyrics?: (uri: string) => Promise<LyricLine[]>;
  track?: TrackInfo;
  blockStorage?: boolean;
}

export const defaultTrack: TrackInfo = { uri: "spotify:track:example", title: "Example", artist: "Artist" };

export function createUiHarness(options: HarnessOptions = {}) {
  let entry = options.entry ? structuredClone(options.entry) : undefined;
  let currentTrack = options.track ?? defaultTrack;
  const saved: TranslationEntry[] = [];
  const deleted: string[] = [];
  const events: string[] = [];
  const notifications: Array<{ message: string; isError: boolean }> = [];
  const preferences = new Map<string, string>();
  const downloads: Array<{ filename: string; blob: Blob }> = [];
  const requests: Array<{ source: string; uri: string }> = [];
  const blobs = new Map<string, Blob>();
  let file: { name?: string; text: () => Promise<string> } | undefined;
  let root: ElementFixture | undefined;
  let modalTitle = "";
  let visualOptions: VisualOptions | undefined;
  let active: ElementFixture | undefined;

  class ElementFixture {
    tag: string;
    children: ElementFixture[] = [];
    parent?: ElementFixture;
    attributes = new Map<string, string>();
    listeners = new Map<string, Listener[]>();
    style = { height: "", setProperty() {}, removeProperty() {} };
    dataset: Record<string, string> = {};
    className = "";
    type = "";
    value = "";
    checked = false;
    disabled = false;
    hidden = false;
    title = "";
    placeholder = "";
    rows = 0;
    alt = "";
    src = "";
    href = "";
    download = "";
    accept = "";
    spellcheck = true;
    scrollHeight = 40;
    selectionStart = 0;
    selectionEnd = 0;
    files?: Array<{ name?: string; text: () => Promise<string> }>;
    private ownText = "";
    constructor(tag: string) { this.tag = tag; }
    get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(""); }
    set textContent(value: string) { this.ownText = value; this.replaceChildren(); }
    set innerHTML(_value: string) { this.ownText = ""; this.replaceChildren(); }
    append(...nodes: ElementFixture[]) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node: ElementFixture) {
      node.remove();
      node.parent = this;
      this.children.push(node);
      return node;
    }
    replaceChildren(...nodes: ElementFixture[]) {
      this.children.forEach(child => { child.parent = undefined; });
      this.children = [];
      this.append(...nodes);
    }
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = undefined;
    }
    contains(node: ElementFixture | undefined): boolean {
      return !!node && (node === this || this.children.some(child => child.contains(node)));
    }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    removeAttribute(name: string) { this.attributes.delete(name); }
    addEventListener(name: string, callback: Listener) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
    }
    removeEventListener(name: string, callback: Listener) {
      this.listeners.set(name, (this.listeners.get(name) ?? []).filter(listener => listener !== callback));
    }
    /** Dispatch on this element, then bubble through its ancestors like the DOM. */
    dispatch(name: string, init: Partial<FixtureEvent> = {}): FixtureEvent {
      let stopped = false;
      const event: FixtureEvent = { target: this, defaultPrevented: false, ...init,
        preventDefault() { event.defaultPrevented = true; }, stopPropagation() { stopped = true; } };
      for (let node: ElementFixture | undefined = this; node && !stopped; node = node.parent) {
        node.listeners.get(name)?.forEach(listener => listener(event));
      }
      return event;
    }
    focus() { active = this; }
    setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; }
    click() {
      assert.equal(this.disabled, false, `Cannot click disabled ${this.tag} ${this.text()}`);
      if (this.type === "file") {
        assert.ok(file, "No file prepared for the file picker");
        this.files = [file];
        this.dispatch("change");
      } else if (this.tag === "a") downloads.push({ filename: this.download, blob: blobs.get(this.href)! });
      else this.dispatch("click");
    }
    all(): ElementFixture[] { return [this, ...this.children.flatMap(child => child.all())]; }
    text(): string { return this.textContent; }
  }

  const body = new ElementFixture("body");
  const context = {
    Blob, Event, console,
    __createVisualEditor: (value: VisualOptions) => {
      visualOptions = value;
      return new ElementFixture("visual-editor");
    },
    document: {
      createElement: (tag: string) => new ElementFixture(tag),
      body,
      get activeElement() { return active; },
      addEventListener() {},
      removeEventListener() {},
    },
    window: {
      localStorage: {
        getItem: (key: string) => { if (options.blockStorage) throw new Error("blocked"); return preferences.get(key) ?? null; },
        setItem: (key: string, value: string) => { if (options.blockStorage) throw new Error("blocked"); preferences.set(key, value); },
      },
      dispatchEvent: (event: Event) => { events.push(event.type); return true; },
      Spicetify: {
        PopupModal: {
          display: ({ title, content }: { title: string; content: ElementFixture }) => { modalTitle = title; root = content; },
          hide: () => { root = undefined; },
        },
        showNotification: (message: string, isError = false) => { notifications.push({ message, isError }); },
      },
    },
    URL: {
      createObjectURL: (blob: Blob) => { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; },
      revokeObjectURL: () => {},
    },
    setTimeout: () => 0,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const { TranslationUi } = (context as typeof context & { LyricLayerUi: { TranslationUi: any } }).LyricLayerUi;
  const ui = new TranslationUi({
    getTrack: () => currentTrack,
    getLyrics: async () => options.lyrics ?? [],
    getExportLyrics: (uri: string) => {
      requests.push({ source: "lyrics", uri });
      return options.exportLyrics ? options.exportLyrics(uri) : Promise.resolve(options.lyrics ?? []);
    },
    store: {
      get: async (uri: string) => { requests.push({ source: "translations", uri }); return entry && structuredClone(entry); },
      save: async (next: TranslationEntry) => { entry = JSON.parse(JSON.stringify(next)); saved.push(entry!); },
      delete: async (uri: string) => { deleted.push(uri); entry = undefined; },
      getAll: async () => entry ? [entry] : [],
    },
    onEntryChanged: async () => {},
  });

  const view = () => { assert.ok(root, "The modal is not open"); return root; };
  const find = (predicate: (node: ElementFixture) => boolean, description: string, scope = view()) => {
    const found = scope.all().find(predicate);
    assert.ok(found, `Missing ${description}`);
    return found;
  };
  const harness = {
    ui, saved, deleted, events, notifications, preferences, downloads, requests,
    open: async () => { await ui.open(); await settle(); },
    title: () => modalTitle,
    all: () => view().all(),
    text: () => view().text(),
    isOpen: () => !!root,
    active: () => active,
    visual: () => { assert.ok(visualOptions, "The visual editor was not opened"); return visualOptions; },
    inputs: () => view().all().filter(node => node.tag === "textarea"),
    button: (label: string) => find(node => node.tag === "button" && node.text() === label, `button ${label}`),
    labelled: (label: string) => find(node => node.attributes.get("aria-label") === label, `control ${label}`),
    banner: () => find(node => node.className === "ll-banner", "banner"),
    status: () => find(node => node.className === "ll-footer-status", "footer status").text(),
    /** Type into a row the way a browser would report it: value, then input. */
    type: (row: number, value: string) => {
      const input = harness.inputs()[row];
      assert.ok(input, `Missing row ${row + 1}`);
      input.value = value;
      input.dispatch("input");
    },
    menu: async (label: string) => {
      find(node => node.tag === "button" && (node.text() === label || node.attributes.get("aria-label") === label), `menu ${label}`).click();
      await settle();
    },
    dialog: () => body.children.find(node => node.className.includes("ll-dialog-backdrop")),
    dialogButton: (label: string) => find(node => node.tag === "button" && node.text() === label, `dialog button ${label}`, body),
    setFile: (text: string, name?: string) => { file = { name, text: async () => text }; },
    setTrack: (next: TrackInfo) => { currentTrack = next; },
    entry: () => entry,
  };
  return harness;
}
