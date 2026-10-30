import { matchTranslations } from "./matcher";
import { exportLyrics, type LyricExportMode } from "./lyric-export";
import { parseJson, parseLrc, parseTxt } from "./parsers";
import type { TranslationStore } from "./storage";
import { isTranslationAnimationEnabled, setTranslationAnimationEnabled } from "./translation-settings";
import { createVisualEditor } from "./visual-editor";
import { validateVisualTranslation } from "./translation-timing";
import type { LyricLine, TrackInfo, TranslationEntry, TranslationLine } from "./types";

interface UiDependencies {
  store: TranslationStore;
  getTrack: () => TrackInfo | undefined;
  getLyrics: () => Promise<LyricLine[]>;
  getExportLyrics: (trackUri: string) => Promise<LyricLine[]>;
  onEntryChanged: (trackUri: string) => Promise<void>;
}

interface SpicyModalElement extends HTMLElement {
  display(options: {
    title: string;
    content: HTMLElement;
    isLarge?: boolean;
    modalId?: string;
  }): void;
  transition?(options: {
    title?: string;
    content: HTMLElement;
    modalId?: string;
  }): void;
  hide(): void;
}

/** Unsaved editor state, kept in memory so closing the modal never loses work. */
interface Draft {
  savedAt: number;
  lines: TranslationLine[];
  values: string[];
}

const MODAL_TITLE = "自定义翻译";

function notify(message: string, isError = false): void {
  if (window.Spicetify?.showNotification) window.Spicetify.showNotification(message, isError, 4_000);
  else console[isError ? "error" : "info"](`LyricLayer: ${message}`);
}

const ICONS = {
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5V19h14v-3.5"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 15.5V19h14v-3.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/></svg>',
  tune: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className = "", icon = ""): HTMLButtonElement {
  const node = element("button", `ll-btn ${className}`.trim());
  node.type = "button";
  if (icon) {
    const iconElement = element("span", "ll-btn-icon");
    iconElement.innerHTML = icon;
    node.appendChild(iconElement);
  }
  if (label) node.appendChild(element("span", "", label));
  return node;
}

function resizeTextarea(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  input.style.height = `${Math.max(40, input.scrollHeight)}px`;
}

const cloneLine = (line: TranslationLine): TranslationLine => JSON.parse(JSON.stringify(line)) as TranslationLine;

function canonicalize(lines: TranslationLine[], lyrics: LyricLine[], allowUnboundAlignment = false): TranslationLine[] {
  if (!lyrics.length) return lines;
  const matches = matchTranslations(lyrics, lines);
  return lyrics.map((lyric) => {
    const saved = matches.get(lyric.index);
    const alignment = saved?.alignment && (saved.originalText === lyric.text
      || (allowUnboundAlignment && saved.originalText === undefined)) ? saved.alignment : undefined;
    return {
      index: lyric.index,
      startTime: lyric.startTime,
      originalText: lyric.text,
      translatedText: saved?.translatedText ?? "",
      ...(alignment ? { alignment } : {}),
      ...(saved?.motion ? { motion: { ...saved.motion } } : {}),
    };
  });
}

function entryFrom(track: TrackInfo, lines: TranslationLine[], existing?: TranslationEntry): TranslationEntry {
  const now = Date.now();
  return {
    version: 1,
    trackUri: track.uri,
    title: track.title,
    artist: track.artist,
    lines,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function chooseFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.hidden = true;
    input.addEventListener("change", () => resolve(input.files?.[0]), { once: true });
    input.addEventListener("cancel", () => resolve(undefined), { once: true });
    input.click();
  });
}

type ImportKind = "txt" | "lrc" | "json";

/** Trust the extension, then the content: users should not have to pick a format. */
function importKind(file: { name?: string }, text: string): ImportKind {
  const extension = file.name?.split(".").pop()?.toLowerCase();
  if (extension === "json" || extension === "lrc" || extension === "txt") return extension;
  if (text.replace(/^﻿/, "").trimStart().startsWith("{")) return "json";
  return /^\s*\[\d{1,3}:\d{2}/m.test(text) ? "lrc" : "txt";
}

/** Blank rows are placeholders only when keeping them makes the file line up
 * exactly with the lyrics; otherwise they are stanza breaks and are dropped. */
function parseTxtFor(text: string, lyricCount: number): TranslationLine[] {
  const compact = parseTxt(text, false);
  const spaced = parseTxt(text, true);
  return lyricCount && spaced.length === lyricCount && compact.length !== lyricCount ? spaced : compact;
}

function downloadJson(entry: TranslationEntry): void {
  const uriParts = entry.trackUri.split(":");
  const trackId = uriParts[uriParts.length - 1] ?? "track";
  downloadFile(`${JSON.stringify(entry, null, 2)}\n`, `lyric-layer-${trackId}.json`, "application/json");
}

function downloadFile(text: string, filename: string, mimeType = "text/plain"): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function lyricFilename(track: TrackInfo, mode: LyricExportMode, extension: string): string {
  const name = Array.from(`${track.artist} - ${track.title}`
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim())
    .slice(0, 60)
    .join("")
    .replace(/[. ]+$/, "");
  return `${name || "lyrics"} - ${mode.startsWith("translation") ? "翻译" : "原文"}.${extension}`;
}

/** An in-app confirmation that matches the modal, instead of the browser's dialog. */
function confirmDialog(options: { title: string; message: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = element("div", "ll-scope ll-dialog-backdrop");
    const dialog = element("div", "ll-dialog");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    const title = element("h2", "ll-dialog-title", options.title);
    const message = element("p", "ll-dialog-text", options.message);
    const actions = element("div", "ll-dialog-actions");
    const cancel = button("取消");
    const confirm = button(options.confirm, options.danger ? "danger" : "primary");
    actions.append(cancel, confirm);
    dialog.append(title, message, actions);
    backdrop.appendChild(dialog);
    const close = (result: boolean) => {
      backdrop.remove();
      resolve(result);
    };
    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    backdrop.addEventListener("pointerdown", (event) => { if (event.target === backdrop) close(false); });
    dialog.addEventListener("keydown", (event) => {
      // Escape belongs to this dialog, not to the modal underneath it.
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(false); }
      if (event.key === "Tab") {
        event.preventDefault();
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
    });
    (document.body ?? document.documentElement).appendChild(backdrop);
    (options.danger ? cancel : confirm).focus();
  });
}

interface MenuEntry {
  label: string;
  detail?: string;
  ariaLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  action?: () => void | Promise<void>;
  /** A custom control, rendered as-is instead of a clickable item. */
  content?: HTMLElement;
}
type MenuContent = Array<MenuEntry | "separator" | { note: string }>;

/** A small popover anchored to a toolbar button. Entries are built on open so
 * they always reflect the current state. */
function menu(trigger: HTMLButtonElement, build: () => MenuContent | Promise<MenuContent>): HTMLElement {
  const anchor = element("div", "ll-menu-anchor");
  const popover = element("div", "ll-menu");
  popover.setAttribute("role", "menu");
  popover.hidden = true;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  anchor.append(trigger, popover);
  let generation = 0;
  const outside = (event: Event) => {
    if (!anchor.contains(event.target as Node)) close();
  };
  const close = () => {
    generation++;
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener?.("pointerdown", outside, true);
  };
  const open = async () => {
    const current = ++generation;
    popover.replaceChildren(element("div", "ll-menu-note", "正在读取…"));
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener?.("pointerdown", outside, true);
    let entries: MenuContent;
    try {
      entries = await build();
    } catch (error) {
      entries = [{ note: error instanceof Error ? error.message : "读取失败" }];
    }
    if (current !== generation) return;
    popover.replaceChildren();
    for (const entry of entries) {
      if (entry === "separator") { popover.appendChild(element("div", "ll-menu-separator")); continue; }
      if ("note" in entry) { popover.appendChild(element("div", "ll-menu-note", entry.note)); continue; }
      if (entry.content) {
        const row = element("div", "ll-menu-custom");
        row.appendChild(entry.content);
        popover.appendChild(row);
        continue;
      }
      const item = element("button", `ll-menu-item${entry.danger ? " danger" : ""}`);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.disabled = !!entry.disabled;
      if (entry.ariaLabel) item.setAttribute("aria-label", entry.ariaLabel);
      item.append(element("span", "ll-menu-label", entry.label));
      if (entry.detail) item.append(element("span", "ll-menu-detail", entry.detail));
      item.addEventListener("click", () => {
        close();
        void entry.action?.();
      });
      popover.appendChild(item);
    }
  };
  trigger.addEventListener("click", () => { if (popover.hidden) void open(); else close(); });
  anchor.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) {
      event.stopPropagation();
      close();
      trigger.focus();
    }
  });
  return anchor;
}

function switchControl(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const control = element("label", "ll-switch-row");
  const copy = element("span", "ll-switch-copy");
  copy.append(element("span", "ll-menu-label", label), element("span", "ll-menu-detail", "译文随原歌词逐字点亮、跳动"));
  const input = element("input", "");
  input.type = "checkbox";
  input.checked = checked;
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => onChange(input.checked));
  const track = element("span", "ll-switch");
  control.append(copy, input, track);
  return control;
}

export class TranslationUi {
  private modal?: SpicyModalElement;
  private drafts = new Map<string, Draft>();

  constructor(private dependencies: UiDependencies) {}

  private displayModal(title: string, content: HTMLElement, transition = false): void {
    const ModalConstructor = window.customElements?.get("sl-generic-modal") as (new () => SpicyModalElement) | undefined;
    if (ModalConstructor) {
      if (transition && this.modal?.isConnected && this.modal.transition) {
        this.modal.transition({ title, content, modalId: "lyricLayer" });
        return;
      }
      if (this.modal?.isConnected) this.modal.hide();
      // Spicy Lyrics constructs its modal class directly. Calling createElement here
      // throws in Chromium because the custom element constructor adds a class.
      const modal = new ModalConstructor();
      this.modal = modal;
      modal.display({ title, content, isLarge: true, modalId: "lyricLayer" });
      return;
    }
    const popup = window.Spicetify?.PopupModal;
    if (!popup) throw new Error("弹窗组件尚未就绪");
    popup.display({ title, content, isLarge: true });
  }

  /** The translation editor is the home view: a song's translation is the
   * document, and import, export and delete are actions on it. */
  async open(transition = false): Promise<void> {
    const track = this.dependencies.getTrack();
    if (!track?.uri) {
      notify("当前没有正在播放的 Spotify 歌曲", true);
      return;
    }
    const [lyrics, existing] = await Promise.all([
      this.dependencies.getLyrics(),
      this.dependencies.store.get(track.uri),
    ]);
    const { store, onEntryChanged, getExportLyrics } = this.dependencies;
    let saved = existing;
    const savedLines = (): TranslationLine[] => lyrics.length
      ? canonicalize(saved?.lines ?? [], lyrics)
      : (saved?.lines ?? []).map((line, index) => ({ ...line, index: line.index ?? index }));
    let editorLines = savedLines();
    let baseline = "";
    let dirty = false;
    let saving = false;
    let inputs: HTMLTextAreaElement[] = [];
    let tuneButtons: HTMLButtonElement[] = [];
    let rows: HTMLElement[] = [];
    const visuallyEdited = new Set<number>();

    const root = element("div", "ll-scope lyric-layer-panel lyric-layer-editor");

    // Header: what this is, how far along it is, and what can be done with it.
    const head = element("div", "ll-head");
    const cover = element("img", "ll-cover");
    cover.alt = "";
    if (track.coverUrl) cover.src = track.coverUrl;
    else cover.hidden = true;
    const copy = element("div", "ll-head-copy");
    const title = element("div", "ll-head-title", track.title);
    const subtitle = element("div", "ll-head-sub");
    copy.append(title, subtitle);
    const actions = element("div", "ll-head-actions");
    const importButton = button("导入", "small", ICONS.upload);
    importButton.title = "从 TXT、LRC 或 LyricLayer JSON 导入，格式自动识别";
    const exportTrigger = button("导出", "small", ICONS.download);
    const moreTrigger = button("", "small icon", ICONS.more);
    moreTrigger.setAttribute("aria-label", "更多");
    moreTrigger.title = "更多";
    head.append(cover, copy, actions);

    const banner = element("div", "ll-banner");
    banner.hidden = true;
    banner.setAttribute("role", "status");
    const list = element("div", "ll-lines");
    const footer = element("div", "ll-footer");
    const status = element("p", "ll-footer-status");
    const save = button("保存", "primary");
    save.title = "Ctrl/Cmd + S";
    footer.append(status, save);
    root.append(head, banner, list, footer);

    const showBanner = (text: string, action?: { label: string; run: () => void }, tone: "info" | "warn" = "info") => {
      banner.replaceChildren(element("span", "ll-banner-text", text));
      banner.dataset.tone = tone;
      if (action) {
        const undo = button(action.label, "small quiet");
        undo.addEventListener("click", () => { banner.hidden = true; action.run(); });
        banner.appendChild(undo);
      }
      banner.hidden = false;
    };

    const buildLines = (): TranslationLine[] => editorLines.map((line, position) => {
      const translatedText = inputs[position]?.value ?? line.translatedText;
      const { alignment, ...rest } = line;
      // Phrase offsets are only valid for the exact source and translation.
      // canonicalize already discarded alignment if the source changed.
      return { ...rest, translatedText, ...(alignment && translatedText === line.translatedText ? { alignment } : {}) };
    });

    const changed = () => {
      const lines = buildLines();
      dirty = JSON.stringify(lines) !== baseline;
      const filled = lines.filter((line) => line.translatedText.trim()).length;
      subtitle.textContent = editorLines.length
        ? `${track.artist} · 已翻译 ${filled} / ${editorLines.length} 行`
        : track.artist;
      tuneButtons.forEach((tune, position) => {
        const line = lines[position];
        tune.dataset.custom = String(!!(line?.alignment || line?.motion));
      });
      status.dataset.dirty = String(dirty);
      status.textContent = dirty ? "有未保存的修改"
        : "Enter 下一句 · 粘贴多行会依次填入 · Ctrl/Cmd + S 保存";
      save.disabled = !dirty || saving;
      footer.hidden = !editorLines.length;
      if (dirty) {
        this.drafts.set(track.uri, { savedAt: saved?.updatedAt ?? 0,
          lines: editorLines.map(cloneLine), values: inputs.map((input) => input.value) });
      } else this.drafts.delete(track.uri);
    };

    const focusRow = (position: number) => {
      const target = inputs[position];
      if (!target) return;
      target.focus();
      target.setSelectionRange?.(target.value.length, target.value.length);
      rows[position]?.scrollIntoView?.({ block: "nearest" });
    };

    const openVisualEditor = (position: number) => {
      const current = editorLines[position]!;
      const input = inputs[position]!;
      const translatedText = input.value;
      const { alignment, ...rest } = current;
      const draft: TranslationLine = { ...rest, translatedText,
        ...(alignment && translatedText === current.translatedText ? { alignment } : {}) };
      const source = lyrics.find((lyric) => lyric.index === current.index)
        ?? { index: current.index ?? position, text: current.originalText ?? "", startTime: current.startTime };
      const restoreEditor = () => {
        // Reuse the existing form and its unsaved values, but give it a fresh
        // modal scroller instead of inheriting the visual editor's position.
        this.displayModal(MODAL_TITLE, root);
        inputs.forEach(resizeTextarea);
        changed();
        tuneButtons[position]?.focus?.({ preventScroll: true });
        rows[position]?.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
      };
      const visualEditor = createVisualEditor({ line: source, translation: draft,
        onApply: (next) => {
          editorLines[position] = { ...next, index: current.index,
            originalText: current.originalText, startTime: current.startTime };
          visuallyEdited.add(position);
          input.value = next.translatedText;
          restoreEditor();
        }, onClose: restoreEditor });
      // Spicy's transition retains the old scrollTop (and can mount content
      // asynchronously). A fresh modal always opens this new view at the top.
      this.displayModal(`第 ${position + 1} 行 · 对齐与动画`, visualEditor);
    };

    const renderRows = (values?: string[]) => {
      list.replaceChildren();
      inputs = [];
      tuneButtons = [];
      rows = [];
      if (!editorLines.length) {
        const empty = element("div", "ll-empty");
        const retry = button("重新读取", "small");
        retry.addEventListener("click", () => void this.open(true));
        empty.append(
          element("p", "ll-empty-title", "还没有取得这首歌的原歌词"),
          element("p", "ll-empty-text", "请先在 Spicy Lyrics 中打开歌词页，等歌词加载完成后再试。也可以直接导入之前导出的 LyricLayer JSON 备份。"),
          retry,
        );
        list.appendChild(empty);
        return;
      }
      editorLines.forEach((line, position) => {
        const row = element("div", "ll-row");
        const index = element("div", "ll-row-index", String(position + 1));
        const original = element("div", "ll-row-original", line.originalText ?? lyrics[position]?.text ?? "—");
        const cell = element("div", "ll-row-translation");
        const input = element("textarea", "ll-input");
        input.rows = 1;
        input.value = values?.[position] ?? line.translatedText;
        input.placeholder = "输入译文";
        input.setAttribute("aria-label", `第 ${position + 1} 行译文`);
        input.addEventListener("input", () => {
          resizeTextarea(input);
          changed();
        });
        input.addEventListener("keydown", (event) => {
          // Enter confirms an IME candidate while composing; never steal that.
          if (event.isComposing || event.keyCode === 229) return;
          const plain = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
          if (event.key === "Enter" && plain) {
            event.preventDefault();
            focusRow(position + 1);
          } else if (plain && event.key === "ArrowDown" && input.selectionStart === input.value.length
            && input.selectionEnd === input.value.length && inputs[position + 1]) {
            event.preventDefault();
            focusRow(position + 1);
          } else if (plain && event.key === "ArrowUp" && input.selectionStart === 0 && input.selectionEnd === 0
            && inputs[position - 1]) {
            event.preventDefault();
            focusRow(position - 1);
          }
        });
        input.addEventListener("paste", (event) => {
          const text = event.clipboardData?.getData("text/plain") ?? "";
          if (!/[\r\n]/.test(text)) return;
          event.preventDefault();
          let pasted = text.replace(/\r\n?/g, "\n").split("\n");
          if (pasted[pasted.length - 1] === "") pasted = pasted.slice(0, -1);
          pasted.forEach((value, offset) => {
            const target = inputs[position + offset];
            if (!target) return;
            target.value = value;
            resizeTextarea(target);
          });
          changed();
          const overflow = pasted.length - (inputs.length - position);
          showBanner(overflow > 0
            ? `已填入 ${pasted.length - overflow} 行，剩余 ${overflow} 行超出歌词末尾，未使用`
            : `已从第 ${position + 1} 行起依次填入 ${pasted.length} 行`);
        });
        const tune = element("button", "ll-row-tune");
        tune.type = "button";
        tune.innerHTML = ICONS.tune;
        tune.title = "对齐与动画";
        tune.setAttribute("aria-label", `调整第 ${position + 1} 行的对齐与动画`);
        tune.addEventListener("click", () => openVisualEditor(position));
        cell.append(input, tune);
        row.append(index, original, cell);
        list.appendChild(row);
        inputs.push(input);
        tuneButtons.push(tune);
        rows.push(row);
      });
      inputs.forEach(resizeTextarea);
    };

    const snapshot = (): Draft => ({ savedAt: saved?.updatedAt ?? 0,
      lines: editorLines.map(cloneLine), values: inputs.map((input) => input.value) });
    const restore = (state: Draft) => {
      editorLines = state.lines.map(cloneLine);
      visuallyEdited.clear();
      renderRows(state.values);
      changed();
    };
    const replaceLines = (lines: TranslationLine[], message: string) => {
      const before = snapshot();
      editorLines = lines.map(cloneLine);
      visuallyEdited.clear();
      renderRows();
      changed();
      showBanner(`${message}。确认无误后保存。`, { label: "撤销导入", run: () => restore(before) });
    };

    const importFile = async () => {
      try {
        const file = await chooseFile(".txt,.lrc,.json,text/plain,application/json");
        if (!file) return;
        const text = await file.text();
        const kind = importKind(file, text);
        if (kind === "json") {
          const parsed = parseJson(text);
          if (parsed.trackUri && parsed.trackUri !== track.uri) {
            const name = parsed.entry?.title ? `《${parsed.entry.title}》` : "另一首歌";
            const accepted = await confirmDialog({
              title: "这是另一首歌的翻译",
              message: `文件属于${name}，不是当前播放的《${track.title}》。要直接保存到${name}吗？当前歌曲的翻译不受影响。`,
              confirm: `保存到${name}`,
            });
            if (!accepted) return;
            const target: TrackInfo = { ...track, uri: parsed.trackUri,
              title: parsed.entry?.title ?? track.title, artist: parsed.entry?.artist ?? track.artist };
            const previous = await store.get(target.uri);
            const imported = parsed.entry
              ? { ...parsed.entry, lines: parsed.lines, trackUri: target.uri, updatedAt: Date.now() }
              : entryFrom(target, parsed.lines, previous);
            await store.save(imported);
            await onEntryChanged(target.uri);
            notify(`已保存到${name}`);
            return;
          }
          const lines = canonicalize(parsed.lines, lyrics, true);
          if (lyrics.length) {
            for (const [position, line] of lines.entries()) {
              const lyric = lyrics[position];
              if (!lyric || (!line.alignment?.some((part) => part.startTime !== undefined || part.endTime !== undefined) && !line.motion)) continue;
              const error = validateVisualTranslation(lyric, line);
              if (error) throw new Error(`第 ${lyric.index + 1} 行：${error}`);
            }
          }
          const count = lines.filter((line) => line.translatedText.trim()).length;
          replaceLines(lines, `已导入 JSON 备份中的 ${count} 行译文`);
          return;
        }
        if (!lyrics.length) throw new Error("还没有取得原歌词，暂时只能导入 LyricLayer JSON 备份");
        if (kind === "txt") {
          const parsed = parseTxtFor(text, lyrics.length);
          replaceLines(canonicalize(parsed, lyrics), parsed.length === lyrics.length
            ? `已导入 ${parsed.length} 行，与原歌词逐行对应`
            : `已导入 ${parsed.length} 行，但原歌词有 ${lyrics.length} 行，请检查是否错位`);
        } else {
          const lines = canonicalize(parseLrc(text), lyrics);
          const matched = lines.filter((line) => line.translatedText.trim()).length;
          replaceLines(lines, `已按时间戳匹配 ${matched} / ${lyrics.length} 行`);
        }
      } catch (error) {
        notify(error instanceof Error ? error.message : "导入失败", true);
      }
    };

    const exportEntries = async (): Promise<MenuContent> => {
      const [exportLyricsLines, entry] = await Promise.all([
        getExportLyrics(track.uri),
        store.get(track.uri),
      ]);
      const savedTranslation = entry?.lines ?? [];
      const originalLines = exportLyricsLines.length
        ? exportLyricsLines.map((line) => ({ originalText: line.text, startTime: line.startTime, translatedText: "" }))
        : savedTranslation;
      const matches = matchTranslations(exportLyricsLines, savedTranslation);
      // Keep every saved translation, even if the current provider has different
      // lines or only static lyrics. Missing source timing must not erase saved timing.
      const translationLines = savedTranslation.map((line) => ({
        ...line,
        startTime: exportLyricsLines.find((lyric) => matches.get(lyric.index) === line)?.startTime ?? line.startTime,
      }));
      const formats: Array<{ mode: LyricExportMode; label: string; detail: string; ariaLabel: string; name: string }> = [
        { mode: "original", label: "原文 · TXT", detail: "纯文本，每行一句", ariaLabel: "导出仅原文", name: "原文" },
        { mode: "original-timed", label: "原文 · LRC", detail: "带时间戳，如 [00:30.660]", ariaLabel: "导出原文带时间戳", name: "带时间戳的原文" },
        { mode: "translation", label: "译文 · TXT", detail: "纯文本，跳过未翻译的行", ariaLabel: "导出仅翻译", name: "译文" },
        { mode: "translation-timed", label: "译文 · LRC", detail: "沿用原歌词的时间戳", ariaLabel: "导出翻译带时间戳", name: "带时间戳的译文" },
      ];
      const content: MenuContent = [];
      if (dirty) content.push({ note: "有未保存的修改，译文导出的是上次保存的版本" });
      for (const format of formats) {
        try {
          const result = exportLyrics(format.mode.startsWith("translation") ? translationLines : originalLines, format.mode);
          content.push({ label: format.label, detail: format.detail, ariaLabel: format.ariaLabel, action: () => {
            downloadFile(result.text, lyricFilename(track, format.mode, result.extension));
            notify(`已导出 ${result.lineCount} 行${format.name}`);
          } });
        } catch (error) {
          content.push({ label: format.label, ariaLabel: format.ariaLabel, disabled: true,
            detail: error instanceof Error ? error.message : "当前没有可导出的歌词" });
        }
        if (format.mode === "original-timed") content.push("separator");
      }
      content.push("separator", { label: "备份 · JSON", ariaLabel: "导出备份", disabled: !entry,
        detail: entry ? "含对齐与动画设置，可再次导入" : "保存翻译后才能导出备份",
        action: () => { if (entry) downloadJson(entry); } });
      return content;
    };

    const moreEntries = (): MenuContent => [
      { label: "译文动态跟随", content: switchControl("译文动态跟随", isTranslationAnimationEnabled(), setTranslationAnimationEnabled) },
      "separator",
      { label: "删除这首歌的翻译…", danger: true, disabled: !saved, ariaLabel: "删除这首歌的翻译",
        detail: saved ? "只删除保存在这台设备上的内容" : "还没有保存过翻译", action: async () => {
          const accepted = await confirmDialog({
            title: "删除这首歌的翻译？",
            message: `《${track.title}》保存在这台设备上的译文、对齐和动画设置都会被删除，无法恢复。`,
            confirm: "删除",
            danger: true,
          });
          if (!accepted) return;
          await store.delete(track.uri);
          await onEntryChanged(track.uri);
          this.drafts.delete(track.uri);
          notify("已删除这首歌的翻译");
          await this.open(true);
        } },
    ];

    actions.append(importButton, menu(exportTrigger, exportEntries), menu(moreTrigger, moreEntries));
    importButton.addEventListener("click", () => void importFile());

    const saveEditor = async () => {
      if (saving || !dirty) return;
      saving = true;
      save.disabled = true;
      try {
        const lines = buildLines();
        for (const [position, line] of lines.entries()) {
          if (!visuallyEdited.has(position)) continue;
          const source = lyrics.find((lyric) => lyric.index === line.index);
          if (!source || (!line.alignment && !line.motion)) continue;
          const error = validateVisualTranslation(source, line);
          if (error) throw new Error(`第 ${(line.index ?? 0) + 1} 行：${error}`);
        }
        const entry = entryFrom(track, lines, saved);
        await store.save(entry);
        await onEntryChanged(track.uri);
        saved = entry;
        editorLines = lines.map(cloneLine);
        baseline = JSON.stringify(lines);
        banner.hidden = true;
        notify("翻译已保存");
      } catch (error) {
        notify(error instanceof Error ? error.message : "保存失败", true);
      } finally {
        saving = false;
        changed();
      }
    };
    save.addEventListener("click", () => void saveEditor());
    root.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveEditor();
      }
    });

    renderRows();
    baseline = JSON.stringify(buildLines());
    const draft = this.drafts.get(track.uri);
    if (draft && draft.savedAt === (saved?.updatedAt ?? 0) && draft.lines.length === editorLines.length
      && draft.lines.every((line, position) => line.originalText === editorLines[position]?.originalText)) {
      const clean = snapshot();
      restore(draft);
      showBanner("已恢复上次未保存的修改", { label: "放弃修改", run: () => restore(clean) });
    } else {
      this.drafts.delete(track.uri);
      changed();
    }
    this.displayModal(MODAL_TITLE, root, transition);
  }
}
