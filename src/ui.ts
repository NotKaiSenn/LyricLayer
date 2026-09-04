import { matchTranslations } from "./matcher";
import { parseJson, parseLrc, parseTxt } from "./parsers";
import type { TranslationStore } from "./storage";
import type { LyricLine, TrackInfo, TranslationEntry, TranslationLine } from "./types";

interface UiDependencies {
  store: TranslationStore;
  getTrack: () => TrackInfo | undefined;
  getLyrics: () => Promise<LyricLine[]>;
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

function notify(message: string, isError = false): void {
  if (window.Spicetify?.showNotification) window.Spicetify.showNotification(message, isError, 4_000);
  else console[isError ? "error" : "info"](`LyricLayer: ${message}`);
}

function button(label: string, className = "", icon = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `lyric-layer-button ${className}`.trim();
  if (icon) {
    const iconElement = document.createElement("span");
    iconElement.className = "lyric-layer-button-icon";
    iconElement.innerHTML = icon;
    element.appendChild(iconElement);
  }
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  element.appendChild(labelElement);
  return element;
}

function sectionTitle(label: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = "lyric-layer-section-title";
  element.textContent = label;
  return element;
}

function settingRow(label: string, description: string, control: HTMLElement, className = ""): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `lyric-layer-setting-row ${className}`.trim();
  const copy = document.createElement("div");
  copy.className = "lyric-layer-setting-copy";
  const title = document.createElement("span");
  title.className = "lyric-layer-setting-label";
  title.textContent = label;
  const detail = document.createElement("span");
  detail.className = "lyric-layer-setting-description";
  detail.textContent = description;
  copy.append(title, detail);
  const action = document.createElement("div");
  action.className = "lyric-layer-setting-control";
  action.appendChild(control);
  row.append(copy, action);
  return row;
}

const ICONS = {
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5V19h14v-3.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 5.3 4 4M5 19l3.9-.8L19 7.1 16.9 5 5.8 15.1 5 19Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 19h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Zm3 0v6h8V4M8 20v-6h8v6"/></svg>',
};

function resizeTextarea(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  input.style.height = `${Math.max(42, input.scrollHeight)}px`;
}

function canonicalize(lines: TranslationLine[], lyrics: LyricLine[]): TranslationLine[] {
  if (!lyrics.length) return lines;
  const matches = matchTranslations(lyrics, lines);
  return lyrics.map((lyric) => ({
    index: lyric.index,
    startTime: lyric.startTime,
    originalText: lyric.text,
    translatedText: matches.get(lyric.index)?.translatedText ?? "",
  }));
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

function downloadJson(entry: TranslationEntry): void {
  const blob = new Blob([`${JSON.stringify(entry, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const uriParts = entry.trackUri.split(":");
  const trackId = uriParts[uriParts.length - 1] ?? "track";
  anchor.href = url;
  anchor.download = `lyric-layer-${trackId}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export class TranslationUi {
  private modal?: SpicyModalElement;

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

  private hideModal(): void {
    if (this.modal?.isConnected) this.modal.hide();
    else window.Spicetify?.PopupModal?.hide?.();
  }

  async open(transition = false): Promise<void> {
    const track = this.dependencies.getTrack();
    if (!track?.uri) {
      notify("当前没有可用的 Spotify Track URI", true);
      return;
    }
    const entry = await this.dependencies.store.get(track.uri);
    const root = document.createElement("div");
    root.className = "lyric-layer-panel";

    const trackBox = document.createElement("div");
    trackBox.className = "lyric-layer-track";
    const cover = document.createElement("img");
    cover.className = "lyric-layer-cover";
    cover.alt = "";
    if (track.coverUrl) cover.src = track.coverUrl;
    const details = document.createElement("div");
    details.className = "lyric-layer-track-details";
    const title = document.createElement("div");
    title.className = "lyric-layer-track-title";
    title.textContent = track.title;
    const artist = document.createElement("div");
    artist.className = "lyric-layer-track-sub";
    artist.textContent = track.artist;
    const uri = document.createElement("div");
    uri.className = "lyric-layer-uri";
    uri.textContent = track.uri;
    const status = document.createElement("span");
    const savedLineCount = entry?.lines.filter((line) => line.translatedText.trim()).length ?? 0;
    status.className = `lyric-layer-status${entry ? " active" : ""}`;
    status.textContent = entry ? `已启用 · ${savedLineCount} 行` : "尚未添加翻译";
    details.append(title, artist, uri);
    trackBox.append(cover, details, status);

    const txtButton = button("选择文件", "secondary", ICONS.upload);
    const lrcButton = button("选择文件", "secondary", ICONS.upload);
    const jsonButton = button("选择文件", "secondary", ICONS.upload);
    const editButton = button(entry ? "继续编辑" : "开始编辑", "primary", ICONS.edit);
    const exportButton = button("导出", "secondary", ICONS.download);
    const deleteButton = button("删除", "danger", ICONS.trash);

    const option = document.createElement("label");
    option.className = "lyric-layer-toggle";
    const preserveEmpty = document.createElement("input");
    preserveEmpty.type = "checkbox";
    const toggleTrack = document.createElement("span");
    toggleTrack.className = "lyric-layer-toggle-track";
    option.append(preserveEmpty, toggleTrack);

    root.append(
      trackBox,
      sectionTitle("添加翻译"),
      settingRow("TXT 文件", "每一行对应一行原歌词，适合纯文本翻译。", txtButton),
      settingRow("保留 TXT 空行", "开启后，空白行也会占用一个歌词位置。", option),
      settingRow("LRC 文件", "根据时间戳自动匹配原歌词。", lrcButton),
      settingRow("LyricLayer JSON", "导入之前导出的完整翻译备份。", jsonButton),
      sectionTitle("编辑与管理"),
      settingRow("逐行编辑", "对照当前原歌词填写或批量粘贴中文翻译。", editButton),
      settingRow("导出备份", "将当前歌曲翻译导出为可再次导入的 JSON。", exportButton),
      settingRow("删除本地翻译", "只删除当前歌曲保存在此设备上的翻译。", deleteButton, "danger"),
    );

    const importFile = async (kind: "txt" | "lrc" | "json") => {
      try {
        const file = await chooseFile(kind === "txt" ? ".txt,text/plain" : kind === "lrc" ? ".lrc,text/plain" : ".json,application/json");
        if (!file) return;
        const text = await file.text();
        const lyrics = await this.dependencies.getLyrics();
        if (kind === "json") {
          const parsed = parseJson(text);
          let targetTrack = track;
          if (parsed.trackUri && parsed.trackUri !== track.uri) {
            const accepted = window.confirm(`JSON 属于 ${parsed.trackUri}，是否按该 URI 导入？`);
            if (!accepted) return;
            targetTrack = { ...track, uri: parsed.trackUri };
          }
          const previous = await this.dependencies.store.get(targetTrack.uri);
          const imported = parsed.entry
            ? { ...parsed.entry, trackUri: targetTrack.uri, updatedAt: Date.now() }
            : entryFrom(targetTrack, targetTrack.uri === track.uri ? canonicalize(parsed.lines, lyrics) : parsed.lines, previous);
          await this.dependencies.store.save(imported);
          await this.dependencies.onEntryChanged(targetTrack.uri);
          notify(`已导入 ${imported.lines.length} 行 JSON 翻译`);
        } else {
          const parsed = kind === "txt" ? parseTxt(text, preserveEmpty.checked) : parseLrc(text);
          const imported = entryFrom(track, canonicalize(parsed, lyrics), entry);
          await this.dependencies.store.save(imported);
          await this.dependencies.onEntryChanged(track.uri);
          notify(`已导入 ${parsed.length} 行 ${kind.toUpperCase()} 翻译`);
        }
        this.hideModal();
      } catch (error) {
        notify(error instanceof Error ? error.message : "导入失败", true);
      }
    };

    txtButton.addEventListener("click", () => void importFile("txt"));
    lrcButton.addEventListener("click", () => void importFile("lrc"));
    jsonButton.addEventListener("click", () => void importFile("json"));
    editButton.addEventListener("click", () => void this.openEditor(track));
    exportButton.disabled = !entry;
    exportButton.addEventListener("click", () => { if (entry) downloadJson(entry); });
    deleteButton.disabled = !entry;
    deleteButton.addEventListener("click", async () => {
      if (!entry || !window.confirm("确定删除当前歌曲的本地翻译吗？")) return;
      await this.dependencies.store.delete(track.uri);
      await this.dependencies.onEntryChanged(track.uri);
      this.hideModal();
      notify("已删除当前歌曲的翻译");
    });

    this.displayModal("自定义翻译", root, transition);
  }

  private async openEditor(track: TrackInfo): Promise<void> {
    const [lyrics, existing] = await Promise.all([
      this.dependencies.getLyrics(),
      this.dependencies.store.get(track.uri),
    ]);
    const editorLines = lyrics.length
      ? canonicalize(existing?.lines ?? [], lyrics)
      : (existing?.lines ?? []).map((line, index) => ({ ...line, index: line.index ?? index }));
    if (!editorLines.length) {
      notify("还没有取得原歌词。请先打开 Spicy Lyrics 歌词页，再重试。", true);
      return;
    }

    const root = document.createElement("div");
    root.className = "lyric-layer-panel lyric-layer-editor";
    const toolbar = document.createElement("div");
    toolbar.className = "lyric-layer-editor-toolbar";
    const back = button("返回", "quiet", ICONS.back);
    back.addEventListener("click", () => void this.open(true));
    const progress = document.createElement("span");
    progress.className = "lyric-layer-editor-progress";
    const updateProgress = () => {
      progress.textContent = `已填写 ${inputs.filter((input) => input.value.trim()).length} / ${editorLines.length} 行`;
    };
    toolbar.append(back, progress);
    root.appendChild(toolbar);
    const head = document.createElement("div");
    head.className = "lyric-layer-editor-head";
    head.innerHTML = "<span>#</span><span>原歌词（只读）</span><span>中文翻译</span>";
    root.appendChild(head);
    const inputs: HTMLTextAreaElement[] = [];
    editorLines.forEach((line, position) => {
      const row = document.createElement("div");
      row.className = "lyric-layer-editor-row";
      const index = document.createElement("div");
      index.className = "lyric-layer-editor-index";
      index.textContent = String(position + 1);
      const original = document.createElement("div");
      original.className = "lyric-layer-original";
      original.textContent = line.originalText ?? lyrics[position]?.text ?? "—";
      const input = document.createElement("textarea");
      input.className = "lyric-layer-input";
      input.rows = 1;
      input.value = line.translatedText;
      input.placeholder = "输入中文翻译";
      input.addEventListener("input", () => {
        resizeTextarea(input);
        updateProgress();
      });
      input.addEventListener("paste", (event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!/[\r\n]/.test(text)) return;
        event.preventDefault();
        let rows = text.replace(/\r\n?/g, "\n").split("\n");
        if (rows[rows.length - 1] === "") rows = rows.slice(0, -1);
        rows.forEach((value, offset) => {
          const target = inputs[position + offset];
          if (!target) return;
          target.value = value;
          resizeTextarea(target);
        });
        updateProgress();
      });
      inputs.push(input);
      row.append(index, original, input);
      root.appendChild(row);
    });

    const footer = document.createElement("div");
    footer.className = "lyric-layer-editor-footer";
    const hint = document.createElement("span");
    hint.className = "lyric-layer-hint";
    hint.textContent = "支持粘贴多行 · Ctrl/Cmd + S 保存";
    const save = button("保存翻译", "primary", ICONS.save);
    footer.append(hint, save);
    root.appendChild(footer);
    inputs.forEach(resizeTextarea);
    updateProgress();

    let saving = false;
    const saveEditor = async () => {
      if (saving) return;
      saving = true;
      try {
        const lines = editorLines.map((line, position) => ({ ...line, translatedText: inputs[position]?.value.trim() ?? "" }));
        await this.dependencies.store.save(entryFrom(track, lines, existing));
        await this.dependencies.onEntryChanged(track.uri);
        this.hideModal();
        notify("翻译已保存并刷新");
      } catch (error) {
        saving = false;
        notify(error instanceof Error ? error.message : "保存失败", true);
      }
    };
    save.addEventListener("click", () => void saveEditor());
    root.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveEditor();
      }
    });
    this.displayModal(`编辑翻译 · ${track.title}`, root, true);
  }
}
