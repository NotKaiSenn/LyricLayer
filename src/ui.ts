import { clickNativeLine, type EditHooks } from "./dom-renderer";
import { EditSession, exportChoices, type DraftState } from "./edit-session";
import { createLinePanel, type LinePanel } from "./line-panel";
import type { TranslationStore } from "./storage";
import { isTranslationAnimationEnabled, setTranslationAnimationEnabled } from "./translation-settings";
import type { LyricLine, TrackInfo, TranslationLine } from "./types";
import { button, choiceDialog, chooseFile, confirmDialog, downloadFile, element, iconButton, ICONS, menu,
  notify, switchControl, type MenuContent } from "./ui-kit";

interface UiDependencies {
  store: TranslationStore;
  getTrack: () => TrackInfo | undefined;
  getLyrics: () => Promise<LyricLine[]>;
  getExportLyrics: (trackUri: string) => Promise<LyricLine[]>;
  onEntryChanged: (trackUri: string) => Promise<void>;
  /** Show unsaved lines on the lyrics page, or undefined to show the saved ones. */
  onPreview: (trackUri: string, lines: TranslationLine[] | undefined) => void;
  setEditHooks: (hooks: EditHooks | undefined) => void;
  renderNow: () => void;
  onModeChange?: (active: boolean) => void;
}

const PLACEHOLDER = "点击输入译文";

interface Chrome {
  page: HTMLElement;
  root: HTMLElement;
  progress: HTMLElement;
  status: HTMLElement;
  save: HTMLButtonElement;
  banner: HTMLElement;
}

interface InlineEditor {
  root: HTMLElement;
  input: HTMLTextAreaElement;
}

function player() {
  return window.Spicetify?.Player;
}

function pausePlayback(): void {
  try {
    if (player()?.isPlaying?.()) player()?.pause?.();
  } catch { /* Editing still works without playback control. */ }
}

function resizeTextarea(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  input.style.height = `${Math.max(32, input.scrollHeight)}px`;
}

/** Edit mode turns the Spicy Lyrics page itself into the editor: translations
 * are typed under their lines, and the page shows the draft as it will play. */
export class TranslationUi {
  private session?: EditSession;
  private chrome?: Chrome;
  private editor?: InlineEditor;
  /** Position of the line being typed into, if any. */
  private editing?: number;
  private panel?: LinePanel;
  private panelPosition?: number;
  private drafts = new Map<string, DraftState>();
  private busy = false;
  private saving = false;
  private cleanups: Array<() => void> = [];

  constructor(private dependencies: UiDependencies) {}

  get active(): boolean {
    return !!this.session;
  }

  async toggle(): Promise<void> {
    if (this.session) await this.exit();
    else await this.enter();
  }

  async enter(): Promise<void> {
    // A second click while the lyrics are still loading must not start twice.
    if (this.session || this.busy) return;
    this.busy = true;
    try {
      const track = this.dependencies.getTrack();
      if (!track?.uri) {
        notify("当前没有正在播放的 Spotify 歌曲", true);
        return;
      }
      const page = document.getElementById("SpicyLyricsPage");
      if (!page) {
        notify("请在 Spicy Lyrics 的歌词页里编辑译文", true);
        return;
      }
      const [lyrics, saved] = await Promise.all([this.dependencies.getLyrics(), this.dependencies.store.get(track.uri)]);
      if (this.dependencies.getTrack()?.uri !== track.uri) return;
      if (!lyrics.length) {
        notify("还没有取得这首歌的原歌词，请等歌词加载完成后再试", true);
        return;
      }
      const session = new EditSession(track, lyrics, saved);
      this.session = session;
      this.mountChrome(page);
      const draft = this.drafts.get(track.uri);
      if (draft && session.fits(draft)) {
        const clean = session.snapshot();
        session.restore(draft);
        this.showBanner("已恢复上次未保存的修改", { label: "放弃修改", run: () => {
          session.restore(clean);
          this.syncEditor();
          this.changed();
        } });
      } else this.drafts.delete(track.uri);
      this.installHooks();
      this.changed();
      this.dependencies.onModeChange?.(true);
    } finally {
      this.busy = false;
    }
  }

  async exit(): Promise<void> {
    const session = this.session;
    if (!session || this.busy) return;
    if (session.dirty) {
      this.busy = true;
      let choice: "save" | "discard" | "stay";
      try {
        choice = await choiceDialog({
          title: "保存修改吗？",
          message: "退出编辑前，还有未保存的修改。",
          cancel: "stay",
          focus: "save",
          choices: [
            { value: "discard", label: "放弃修改", tone: "danger" },
            { value: "stay", label: "继续编辑" },
            { value: "save", label: "保存并退出", tone: "primary" },
          ],
        });
      } finally {
        this.busy = false;
      }
      if (this.session !== session || choice === "stay") return;
      if (choice === "save" && !(await this.save())) return;
      if (choice === "discard") this.drafts.delete(session.track.uri);
    }
    this.teardown();
  }

  /** The song changed: leave edit mode, keeping unsaved work for next time. */
  trackChanged(trackUri: string | undefined): void {
    const session = this.session;
    if (!session || session.track.uri === trackUri) return;
    const dirty = session.dirty;
    this.teardown();
    notify(dirty ? "已切换歌曲，未保存的修改已暂存，回到这首歌时可以恢复" : "已切换歌曲，编辑模式已退出");
  }

  private teardown(): void {
    const session = this.session;
    if (!session) return;
    this.closePanel();
    this.editing = undefined;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.chrome?.page.classList.remove("ll-edit-mode");
    this.chrome?.root.remove();
    this.chrome = undefined;
    this.session = undefined;
    this.dependencies.setEditHooks(undefined);
    this.dependencies.onPreview(session.track.uri, undefined);
    this.dependencies.onModeChange?.(false);
  }

  private installHooks(): void {
    const session = this.session;
    if (!session) return;
    const editor = this.editing === undefined ? undefined : this.inlineEditor();
    const index = this.editing === undefined ? undefined : session.lines[this.editing]?.index;
    this.dependencies.setEditHooks({
      placeholder: PLACEHOLDER,
      editing: editor && index !== undefined ? { index, element: editor.root } : undefined,
      onActivate: (lyricIndex, line) => this.activateFromPage(lyricIndex, line),
      onEditorMounted: () => this.focusEditor(),
    });
  }

  /** After every change: progress, save state, the stored draft and the page preview. */
  private changed(): void {
    const session = this.session;
    const chrome = this.chrome;
    if (!session || !chrome) return;
    const dirty = session.dirty;
    chrome.progress.textContent = `已翻译 ${session.filled()} / ${session.size} 行`;
    chrome.status.dataset.dirty = String(dirty);
    chrome.status.textContent = dirty ? "未保存" : "已保存";
    chrome.save.disabled = !dirty || this.saving;
    if (dirty) this.drafts.set(session.track.uri, session.snapshot());
    else this.drafts.delete(session.track.uri);
    this.dependencies.onPreview(session.track.uri, session.buildLines());
  }

  private mountChrome(page: HTMLElement): void {
    const root = element("div", "ll-scope ll-toolbar-wrap");
    const toolbar = element("div", "ll-toolbar");
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "编辑译文");
    const progress = element("span", "ll-toolbar-progress");
    const importButton = button("导入", "small", ICONS.upload);
    importButton.title = "从 TXT、LRC 或 LyricLayer JSON 导入，格式自动识别";
    importButton.addEventListener("click", () => void this.importFile());
    const exportTrigger = button("导出", "small", ICONS.download);
    const moreTrigger = iconButton("更多", ICONS.more, "small");
    const status = element("span", "ll-toolbar-status");
    const save = button("保存", "small primary");
    save.title = "Ctrl/Cmd + S";
    save.addEventListener("click", () => void this.save());
    const exit = button("退出编辑", "small", ICONS.close);
    exit.addEventListener("click", () => void this.exit());
    toolbar.append(element("span", "ll-toolbar-title", "编辑译文"), progress,
      element("span", "ll-toolbar-separator"), importButton, menu(exportTrigger, () => this.exportEntries()),
      menu(moreTrigger, () => this.moreEntries()), element("span", "ll-toolbar-separator"), status, save, exit);
    const banner = element("div", "ll-banner");
    banner.hidden = true;
    banner.setAttribute("role", "status");
    root.append(toolbar, banner);
    page.classList.add("ll-edit-mode");
    if (getComputedStyle(page).position === "static") page.classList.add("ll-panel-host");
    page.appendChild(root);
    this.chrome = { page, root, progress, status, save, banner };

    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.save();
      }
    };
    // A press anywhere else ends typing into a line; the click itself then does
    // what it natively does (seek to a line, play, ...).
    const onPointer = (event: Event) => {
      const target = event.target as Node | null;
      if (this.editing === undefined || !target) return;
      if (this.editor?.root.contains(target) || root.contains(target)
        || (target as Element).closest?.(".ll-line-panel, .ll-dialog-backdrop")) return;
      this.deactivate();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    this.cleanups.push(() => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      page.classList.remove("ll-panel-host");
    });
  }

  private showBanner(text: string, action?: { label: string; run: () => void }): void {
    const banner = this.chrome?.banner;
    if (!banner) return;
    banner.replaceChildren(element("span", "ll-banner-text", text));
    if (action) {
      const undo = button(action.label, "small quiet");
      undo.addEventListener("click", () => { banner.hidden = true; action.run(); });
      banner.appendChild(undo);
    }
    const close = iconButton("关闭提示", ICONS.close, "small quiet");
    close.addEventListener("click", () => { banner.hidden = true; });
    banner.appendChild(close);
    banner.hidden = false;
  }

  private inlineEditor(): InlineEditor {
    if (this.editor) return this.editor;
    const root = element("div", "lyric-layer-translation ll-scope ll-inline-editor");
    // Marked like a translation so lyric text extraction and cleanup skip it.
    root.dataset.lyricLayerTranslation = "true";
    root.dataset.llEditor = "true";
    const input = element("textarea", "ll-inline-input");
    input.rows = 1;
    input.spellcheck = false;
    input.placeholder = "输入译文";
    const tune = iconButton("对齐与动画", ICONS.tune, "small ll-inline-tune");
    root.append(input, tune);
    input.addEventListener("focus", pausePlayback);
    input.addEventListener("input", () => {
      if (this.editing === undefined) return;
      this.session?.setValue(this.editing, input.value);
      resizeTextarea(input);
      this.changed();
    });
    input.addEventListener("keydown", (event) => {
      // Enter confirms an IME candidate while composing; never steal that.
      if (event.isComposing || event.keyCode === 229) return;
      const plain = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
      const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.deactivate();
      } else if (plain && event.key === "Enter") {
        event.preventDefault();
        this.move(1);
      } else if (plain && event.key === "ArrowDown" && atEnd) {
        event.preventDefault();
        this.move(1);
      } else if (plain && event.key === "ArrowUp" && atStart) {
        event.preventDefault();
        this.move(-1);
      }
    });
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!/[\r\n]/.test(text) || this.editing === undefined || !this.session) return;
      event.preventDefault();
      let rows = text.replace(/\r\n?/g, "\n").split("\n");
      if (rows[rows.length - 1] === "") rows = rows.slice(0, -1);
      const { filled, overflow } = this.session.fillFrom(this.editing, rows);
      input.value = this.session.values[this.editing] ?? "";
      resizeTextarea(input);
      this.changed();
      this.showBanner(overflow > 0
        ? `已填入 ${filled} 行，剩余 ${overflow} 行超出歌词末尾，未使用`
        : `已从第 ${this.editing + 1} 行起依次填入 ${filled} 行`);
    });
    tune.addEventListener("click", () => {
      if (this.editing !== undefined) this.openPanel(this.editing);
    });
    this.editor = { root, input };
    return this.editor;
  }

  private activateFromPage(lyricIndex: number, line: Element): void {
    const position = this.session?.positionOf(lyricIndex);
    if (position === undefined) return;
    // The click is a native one too: Spicy seeks to the clicked line.
    clickNativeLine(line);
    if (this.panelPosition !== undefined) this.openPanel(position);
    else this.activate(position);
  }

  /** Start typing into one line, in place on the page. */
  private activate(position: number, seek = false): void {
    const session = this.session;
    if (!session || position < 0 || position >= session.size) return;
    const editor = this.inlineEditor();
    this.editing = position;
    editor.root.dataset.lineIndex = String(session.lines[position]!.index);
    this.syncEditor();
    this.installHooks();
    this.dependencies.renderNow();
    if (seek) this.seekTo(position);
    pausePlayback();
    this.focusEditor();
  }

  private deactivate(): void {
    if (this.editing === undefined) return;
    this.editing = undefined;
    this.editor?.input.blur();
    this.installHooks();
  }

  private move(delta: -1 | 1): void {
    if (this.editing === undefined || !this.session) return;
    const next = this.editing + delta;
    if (next < 0 || next >= this.session.size) return;
    this.activate(next, true);
  }

  private syncEditor(): void {
    const editor = this.editor;
    if (!editor || this.editing === undefined || !this.session) return;
    editor.input.value = this.session.values[this.editing] ?? "";
    resizeTextarea(editor.input);
  }

  private focusEditor(): void {
    const editor = this.editor;
    if (!editor || this.editing === undefined || !editor.root.isConnected) return;
    if (document.activeElement !== editor.input) {
      editor.input.focus({ preventScroll: true });
      const end = editor.input.value.length;
      editor.input.setSelectionRange?.(end, end);
    }
    resizeTextarea(editor.input);
    const box = editor.root.getBoundingClientRect?.();
    if (box && (box.top < 96 || box.bottom > window.innerHeight * 0.55)) {
      editor.root.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
  }

  /** Move playback to a line the way a click on it would. */
  private seekTo(position: number): void {
    const session = this.session;
    const index = session?.lines[position]?.index;
    if (!session || index === undefined) return;
    const marker = document.querySelector(`#SpicyLyricsPage [data-lyric-layer-translation][data-line-index="${index}"]`);
    if (marker?.parentElement) {
      clickNativeLine(marker.parentElement);
      return;
    }
    const start = session.lyricAt(position).startTime;
    try {
      if (start !== undefined) player()?.seek?.(start);
    } catch { /* The line stays selected even if playback cannot move. */ }
  }

  /** Alignment and animation for one line, in the panel under the page. */
  private openPanel(position: number): void {
    const session = this.session;
    if (!session || position < 0 || position >= session.size) return;
    if (this.editing !== undefined) this.deactivate();
    this.panelPosition = position;
    this.panel ??= createLinePanel();
    this.panel.open({
      line: session.lyricAt(position),
      translation: session.lineDraft(position),
      title: `第 ${position + 1} 行`,
      canNavigate: { previous: position > 0, next: position < session.size - 1 },
      onChange: (draft) => {
        session.setLine(position, draft);
        this.changed();
      },
      onClose: () => this.closePanel(),
      onNavigate: (delta, draft) => {
        session.setLine(position, draft);
        this.changed();
        this.openPanel(position + delta);
        this.seekTo(position + delta);
      },
    });
  }

  private closePanel(): void {
    if (this.panelPosition === undefined) return;
    this.panelPosition = undefined;
    this.panel?.close();
  }

  private async save(): Promise<boolean> {
    const session = this.session;
    if (!session || this.saving || !session.dirty) return false;
    this.saving = true;
    this.changed();
    try {
      const entry = session.toEntry();
      await this.dependencies.store.save(entry);
      await this.dependencies.onEntryChanged(session.track.uri);
      session.markSaved(entry);
      this.drafts.delete(session.track.uri);
      if (this.chrome) this.chrome.banner.hidden = true;
      notify("翻译已保存");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败", true);
      return false;
    } finally {
      this.saving = false;
      this.changed();
    }
  }

  private async importFile(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      const file = await chooseFile(".txt,.lrc,.json,text/plain,application/json");
      if (!file || this.session !== session) return;
      const text = await file.text();
      const before = session.snapshot();
      const outcome = session.import(file, text);
      if (outcome.kind === "other-track") {
        const accepted = await confirmDialog({
          title: "这是另一首歌的翻译",
          message: `文件属于${outcome.name}，不是当前播放的《${session.track.title}》。要直接保存到${outcome.name}吗？当前歌曲的翻译不受影响。`,
          confirm: `保存到${outcome.name}`,
        });
        if (!accepted) return;
        await this.dependencies.store.save(outcome.entry);
        await this.dependencies.onEntryChanged(outcome.entry.trackUri);
        notify(`已保存到${outcome.name}`);
        return;
      }
      this.syncEditor();
      this.changed();
      this.showBanner(`${outcome.message}。确认无误后保存。`, { label: "撤销导入", run: () => {
        session.restore(before);
        this.syncEditor();
        this.changed();
      } });
    } catch (error) {
      notify(error instanceof Error ? error.message : "导入失败", true);
    }
  }

  private async exportEntries(): Promise<MenuContent> {
    const session = this.session;
    if (!session) return [];
    const [lyrics, entry] = await Promise.all([
      this.dependencies.getExportLyrics(session.track.uri),
      this.dependencies.store.get(session.track.uri),
    ]);
    const content: MenuContent = [];
    if (session.dirty) content.push({ note: "有未保存的修改，译文导出的是上次保存的版本" });
    exportChoices(session.track, lyrics, entry).forEach((choice, index) => {
      if (index === 2 || index === 4) content.push("separator");
      const file = choice.file;
      content.push({ label: choice.label, detail: choice.detail, ariaLabel: choice.ariaLabel, disabled: !file,
        action: () => {
          if (!file) return;
          downloadFile(file.text, file.filename, file.mimeType);
          notify(file.message);
        } });
    });
    return content;
  }

  private moreEntries(): MenuContent {
    const session = this.session;
    if (!session) return [];
    return [
      { label: "译文动态跟随", content: switchControl("译文动态跟随", "译文随原歌词逐字点亮、跳动",
        isTranslationAnimationEnabled(), setTranslationAnimationEnabled) },
      "separator",
      { label: "删除这首歌的翻译…", danger: true, disabled: !session.saved, ariaLabel: "删除这首歌的翻译",
        detail: session.saved ? "只删除保存在这台设备上的内容" : "还没有保存过翻译", action: async () => {
          const accepted = await confirmDialog({
            title: "删除这首歌的翻译？",
            message: `《${session.track.title}》保存在这台设备上的译文、对齐和动画设置都会被删除，无法恢复。`,
            confirm: "删除",
            danger: true,
          });
          if (!accepted || this.session !== session) return;
          await this.dependencies.store.delete(session.track.uri);
          await this.dependencies.onEntryChanged(session.track.uri);
          this.drafts.delete(session.track.uri);
          this.closePanel();
          this.session = new EditSession(session.track, session.lyrics, undefined);
          this.syncEditor();
          this.changed();
          notify("已删除这首歌的翻译");
        } },
    ];
  }
}
