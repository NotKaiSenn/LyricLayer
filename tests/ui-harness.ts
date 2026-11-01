import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import type { LyricLine, TrackInfo, TranslationEntry, TranslationLine } from "../src/types.ts";

// The real ui.ts (edit mode), with only the docked line panel replaced so a
// test can drive its callbacks directly. The renderer is the host's: the test
// records the hooks it is given and plays the page's part.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/ui.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "LyricLayerUi",
  plugins: [{ name: "line-panel-boundary", setup(builder) {
    builder.onResolve({ filter: /^\.\/line-panel$/ }, () => ({ path: "panel", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
      contents: "export const createLinePanel = () => ({ open: options => { globalThis.__openLinePanel(options); return document.createElement('div'); }, close: () => globalThis.__closeLinePanel() });",
    }));
  } }],
});

export const settle = () => new Promise<void>(resolve => setImmediate(resolve));

type Listener = (event: FixtureEvent) => void;
export interface FixtureEvent {
  type: string;
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

export interface PanelOptions {
  line: LyricLine;
  translation: TranslationLine;
  title: string;
  canNavigate?: { previous: boolean; next: boolean };
  onClose: () => void;
  onChange?: (draft: TranslationLine) => void;
  onNavigate?: (delta: -1 | 1, draft: TranslationLine) => void;
}

export interface Hooks {
  placeholder: string;
  editing?: { index: number; element: ElementFixture };
  onActivate(index: number, line: ElementFixture): void;
  onEditorMounted?(): void;
}

export interface HarnessOptions {
  entry?: TranslationEntry;
  lyrics?: LyricLine[];
  exportLyrics?: (uri: string) => Promise<LyricLine[]>;
  track?: TrackInfo;
  blockStorage?: boolean;
  noPage?: boolean;
}

export const defaultTrack: TrackInfo = { uri: "spotify:track:example", title: "Example", artist: "Artist" };

// Created per harness; exported for type annotations in tests.
export type ElementFixture = InstanceType<ReturnType<typeof createUiHarness>["Element"]>;

export function createUiHarness(options: HarnessOptions = {}) {
  let entry = options.entry ? structuredClone(options.entry) : undefined;
  let currentTrack = options.track ?? defaultTrack;
  const saved: TranslationEntry[] = [];
  const deleted: string[] = [];
  const events: string[] = [];
  const notifications: Array<{ message: string; isError: boolean }> = [];
  const preferences = new Map<string, string>();
  const downloads: Array<{ filename: string; blob: Blob }> = [];
  const previews: Array<TranslationLine[] | undefined> = [];
  const modes: boolean[] = [];
  const nativeClicks: number[] = [];
  const player = { playing: true, position: 0, seeks: [] as number[] };
  const blobs = new Map<string, Blob>();
  let file: { name?: string; text: () => Promise<string> } | undefined;
  let hooks: Hooks | undefined;
  let panel: PanelOptions | undefined;
  let panelOpen = false;
  let active: ElementFixture | undefined;
  const documentListeners = new Map<string, Listener[]>();

  class Element {
    tag: string;
    children: Element[] = [];
    parent?: Element;
    attributes = new Map<string, string>();
    listeners = new Map<string, Listener[]>();
    classes = new Set<string>();
    style = { height: "", setProperty() {}, removeProperty() {} };
    dataset: Record<string, string> = {};
    type = "";
    value = "";
    checked = false;
    disabled = false;
    hidden = false;
    title = "";
    placeholder = "";
    rows = 0;
    href = "";
    download = "";
    accept = "";
    spellcheck = true;
    scrollHeight = 32;
    selectionStart = 0;
    selectionEnd = 0;
    files?: Array<{ name?: string; text: () => Promise<string> }>;
    private ownText = "";
    constructor(tag: string) { this.tag = tag; }
    get className(): string { return [...this.classes].join(" "); }
    set className(value: string) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get classList() {
      return { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name),
        contains: (name: string) => this.classes.has(name),
        toggle: (name: string, force?: boolean) => (force ?? !this.classes.has(name)) ? this.classes.add(name) : this.classes.delete(name) };
    }
    get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(""); }
    set textContent(value: string) { this.ownText = value; this.replaceChildren(); }
    set innerHTML(_value: string) { this.ownText = ""; this.replaceChildren(); }
    get parentElement() { return this.parent; }
    get isConnected(): boolean { return this === body || !!this.parent?.isConnected; }
    append(...nodes: Element[]) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node: Element) {
      node.remove();
      node.parent = this;
      this.children.push(node);
      return node;
    }
    replaceChildren(...nodes: Element[]) {
      this.children.forEach(child => { child.parent = undefined; });
      this.children = [];
      this.append(...nodes);
    }
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = undefined;
    }
    contains(node: Element | undefined): boolean {
      return !!node && (node === this || this.children.some(child => child.contains(node)));
    }
    closest(): null { return null; }
    querySelector(): null { return null; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    removeAttribute(name: string) { this.attributes.delete(name); }
    addEventListener(name: string, callback: Listener) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
    }
    removeEventListener(name: string, callback: Listener) {
      this.listeners.set(name, (this.listeners.get(name) ?? []).filter(listener => listener !== callback));
    }
    /** Dispatch on this element, bubble through its ancestors, then reach the document. */
    dispatch(name: string, init: Partial<FixtureEvent> = {}): FixtureEvent {
      let stopped = false;
      const event: FixtureEvent = { type: name, target: this, defaultPrevented: false, ...init,
        preventDefault() { event.defaultPrevented = true; }, stopPropagation() { stopped = true; } };
      for (let node: Element | undefined = this; node && !stopped; node = node.parent) {
        node.listeners.get(name)?.forEach(listener => listener(event));
      }
      if (!stopped) documentListeners.get(name)?.forEach(listener => listener(event));
      return event;
    }
    dispatchEvent(event: { type: string }) {
      if (event.type === "click" && this.dataset.lineIndex !== undefined) nativeClicks.push(Number(this.dataset.lineIndex));
      return true;
    }
    focus() { active = this; }
    blur() { if (active === this) active = undefined; }
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
    all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
    text(): string { return this.textContent; }
  }

  const body = new Element("body");
  const page = new Element("div");
  page.attributes.set("id", "SpicyLyricsPage");
  if (!options.noPage) body.appendChild(page);
  // One mounted line element per lyric, standing in for Spicy's DOM.
  const lines = new Map<number, Element>();
  const lineFor = (index: number) => {
    let line = lines.get(index);
    if (!line) {
      line = new Element("div");
      line.className = "line";
      line.dataset.lineIndex = String(index);
      lines.set(index, line);
      page.appendChild(line);
    }
    return line;
  };

  const context = {
    Blob, Event, console,
    MouseEvent: class { type: string; constructor(type: string) { this.type = type; } },
    __openLinePanel: (value: PanelOptions) => { panel = value; panelOpen = true; },
    __closeLinePanel: () => { panelOpen = false; },
    getComputedStyle: () => ({ position: "relative" }),
    document: {
      createElement: (tag: string) => new Element(tag),
      body,
      getElementById: (id: string) => id === "SpicyLyricsPage" && page.isConnected ? page : null,
      querySelector: () => null,
      get activeElement() { return active; },
      addEventListener: (name: string, callback: Listener) => {
        documentListeners.set(name, [...(documentListeners.get(name) ?? []), callback]);
      },
      removeEventListener: (name: string, callback: Listener) => {
        documentListeners.set(name, (documentListeners.get(name) ?? []).filter(listener => listener !== callback));
      },
    },
    window: {
      innerHeight: 800,
      localStorage: {
        getItem: (key: string) => { if (options.blockStorage) throw new Error("blocked"); return preferences.get(key) ?? null; },
        setItem: (key: string, value: string) => { if (options.blockStorage) throw new Error("blocked"); preferences.set(key, value); },
      },
      dispatchEvent: (event: Event) => { events.push(event.type); return true; },
      Spicetify: {
        Player: {
          isPlaying: () => player.playing,
          pause: () => { player.playing = false; },
          seek: (position: number) => { player.seeks.push(position); },
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

  /** Play the renderer's part: put the editor into its line. */
  const render = () => {
    const editing = hooks?.editing;
    if (!editing) {
      lines.forEach(line => line.children.filter(child => child.dataset.llEditor).forEach(child => child.remove()));
      return;
    }
    const line = lineFor(editing.index);
    if (editing.after) {
      // Unfolded editors sit after their line; any non-line parent stands in for that.
      if (editing.element.parent === line || !editing.element.parent) {
        page.appendChild(editing.element);
        hooks?.onEditorMounted?.();
      }
      return;
    }
    if (editing.element.parent !== line) {
      line.appendChild(editing.element);
      hooks?.onEditorMounted?.();
    }
  };

  const ui = new TranslationUi({
    getTrack: () => currentTrack,
    getLyrics: async () => options.lyrics ?? [],
    getExportLyrics: (uri: string) => options.exportLyrics ? options.exportLyrics(uri) : Promise.resolve(options.lyrics ?? []),
    store: {
      get: async () => entry && structuredClone(entry),
      save: async (next: TranslationEntry) => { const copy = JSON.parse(JSON.stringify(next)); if (copy.trackUri === currentTrack.uri) entry = copy; saved.push(copy); },
      delete: async (uri: string) => { deleted.push(uri); entry = undefined; },
      getAll: async () => entry ? [entry] : [],
    },
    onEntryChanged: async () => {},
    onPreview: (uri: string, value: TranslationLine[] | undefined) => {
      assert.equal(uri, currentTrack.uri);
      previews.push(value && JSON.parse(JSON.stringify(value)));
    },
    setEditHooks: (value: Hooks | undefined) => { hooks = value; render(); },
    renderNow: () => render(),
    onModeChange: (value: boolean) => modes.push(value),
  });

  const toolbar = () => page.all().find(node => node.classes.has("ll-toolbar-wrap"));
  const scope = () => { const found = toolbar(); assert.ok(found, "Edit mode is not on"); return found; };
  const find = (predicate: (node: Element) => boolean, description: string, root: Element = scope()) => {
    const found = root.all().find(predicate);
    assert.ok(found, `Missing ${description}`);
    return found;
  };
  const editorInput = () => find(node => node.classes.has("ll-inline-input"), "inline editor", page);

  const harness = {
    Element, ui, saved, deleted, events, notifications, preferences, downloads, previews, modes, nativeClicks, player,
    enter: async () => { await ui.enter(); await settle(); },
    toolbar,
    hooks: () => hooks,
    panel: () => { assert.ok(panel, "The line panel was not opened"); return panel; },
    panelOpen: () => panelOpen,
    active: () => active,
    text: () => scope().text(),
    button: (label: string) => find(node => node.tag === "button" && node.text() === label, `button ${label}`),
    labelled: (label: string) => find(node => node.attributes.get("aria-label") === label, `control ${label}`, body),
    banner: () => find(node => node.classes.has("ll-banner"), "banner"),
    status: () => find(node => node.classes.has("ll-toolbar-status"), "status").text(),
    progress: () => find(node => node.classes.has("ll-toolbar-progress"), "progress").text(),
    /** Click the translation (or placeholder) of a lyric line on the page. */
    clickLine: (index: number) => { assert.ok(hooks, "No edit hooks installed"); hooks.onActivate(index, lineFor(index)); },
    editorInput,
    editingIndex: () => hooks?.editing?.index,
    type: (value: string) => { const input = editorInput(); input.value = value; input.dispatch("input"); },
    key: (key: string, init: Partial<FixtureEvent> = {}) => editorInput().dispatch("keydown", { key, ...init }),
    documentKey: (key: string, init: Partial<FixtureEvent> = {}) => {
      const event = { type: "keydown", key, target: body, defaultPrevented: false, ...init,
        preventDefault() { event.defaultPrevented = true; }, stopPropagation() {} } as FixtureEvent;
      documentListeners.get("keydown")?.forEach(listener => listener(event));
      return event;
    },
    pressOutside: () => {
      const event = { type: "pointerdown", target: lineFor(99), defaultPrevented: false,
        preventDefault() {}, stopPropagation() {} } as FixtureEvent;
      documentListeners.get("pointerdown")?.forEach(listener => listener(event));
    },
    menu: async (label: string) => {
      find(node => node.tag === "button" && (node.text() === label || node.attributes.get("aria-label") === label), `menu ${label}`).click();
      await settle();
    },
    dialog: () => body.children.find(node => node.classes.has("ll-dialog-backdrop")),
    dialogButton: (label: string) => find(node => node.tag === "button" && node.text() === label, `dialog button ${label}`, body),
    setFile: (text: string, name?: string) => { file = { name, text: async () => text }; },
    setTrack: (next: TrackInfo) => { currentTrack = next; },
    /** Spicy closes the page, or turns it into the small Now Playing card. */
    closePage: (cardMode = false) => { if (cardMode) page.classList.add("CardMode"); else page.remove(); },
    entry: () => entry,
  };
  return harness;
}
