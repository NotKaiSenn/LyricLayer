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

function notify(message: string, isError = false): void {
  if (window.Spicetify?.showNotification) window.Spicetify.showNotification(message, isError, 4_000);
  else console[isError ? "error" : "info"](`LyricLayer: ${message}`);
}

function button(label: string, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `lyric-layer-button ${className}`.trim();
  element.textContent = label;
  return element;
}

function displayModal(title: string, content: HTMLElement, isLarge = true): void {
  const popup = window.Spicetify?.PopupModal;
  if (!popup) throw new Error("Spicetify PopupModal 尚未就绪");
  popup.display({ title, content, isLarge });
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
  constructor(private dependencies: UiDependencies) {}

  async open(): Promise<void> {
    const track = this.dependencies.getTrack();
    if (!track?.uri) {
      notify("当前没有可用的 Spotify Track URI", true);
      return;
    }
    const entry = await this.dependencies.store.get(track.uri);
    const root = document.createElement("div");
    root.className = "lyric-layer-modal";

    const trackBox = document.createElement("div");
    trackBox.className = "lyric-layer-track";
    const cover = document.createElement("img");
    cover.className = "lyric-layer-cover";
    cover.alt = "";
    if (track.coverUrl) cover.src = track.coverUrl;
    const details = document.createElement("div");
    const title = document.createElement("div");
    title.className = "lyric-layer-track-title";
    title.textContent = track.title;
    const artist = document.createElement("div");
    artist.className = "lyric-layer-track-sub";
    artist.textContent = track.artist;
    const uri = document.createElement("div");
    uri.className = "lyric-layer-uri";
    uri.textContent = track.uri;
    details.append(title, artist, uri);
    trackBox.append(cover, details);

    const actions = document.createElement("div");
    actions.className = "lyric-layer-actions";
    const txtButton = button("上传 TXT");
    const lrcButton = button("上传 LRC");
    const jsonButton = button("上传 JSON");
    const editButton = button("编辑翻译", "primary");
    const exportButton = button("导出 JSON");
    const deleteButton = button("删除当前翻译", "danger");
    actions.append(txtButton, lrcButton, jsonButton, editButton, exportButton, deleteButton);

    const option = document.createElement("label");
    option.className = "lyric-layer-option";
    const preserveEmpty = document.createElement("input");
    preserveEmpty.type = "checkbox";
    option.append(preserveEmpty, document.createTextNode("TXT 保留空行（默认忽略空行）"));
    const status = document.createElement("div");
    status.className = "lyric-layer-status";
    status.textContent = entry ? `已保存 ${entry.lines.filter((line) => line.translatedText.trim()).length} 行翻译` : "当前歌曲尚无自定义翻译";
    root.append(trackBox, actions, option, status);

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
        window.Spicetify?.PopupModal?.hide?.();
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
      window.Spicetify?.PopupModal?.hide?.();
      notify("已删除当前歌曲的翻译");
    });

    displayModal("自定义翻译", root);
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
    root.className = "lyric-layer-modal lyric-layer-editor";
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
      input.addEventListener("paste", (event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!/[\r\n]/.test(text)) return;
        event.preventDefault();
        let rows = text.replace(/\r\n?/g, "\n").split("\n");
        if (rows[rows.length - 1] === "") rows = rows.slice(0, -1);
        rows.forEach((value, offset) => { if (inputs[position + offset]) inputs[position + offset]!.value = value; });
      });
      inputs.push(input);
      row.append(index, original, input);
      root.appendChild(row);
    });

    const footer = document.createElement("div");
    footer.className = "lyric-layer-editor-footer";
    const hint = document.createElement("span");
    hint.className = "lyric-layer-hint";
    hint.textContent = "可粘贴多行；Ctrl/Cmd+S 保存";
    const save = button("保存翻译", "primary");
    footer.append(hint, save);
    root.appendChild(footer);

    let saving = false;
    const saveEditor = async () => {
      if (saving) return;
      saving = true;
      try {
        const lines = editorLines.map((line, position) => ({ ...line, translatedText: inputs[position]?.value.trim() ?? "" }));
        await this.dependencies.store.save(entryFrom(track, lines, existing));
        await this.dependencies.onEntryChanged(track.uri);
        window.Spicetify?.PopupModal?.hide?.();
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
    displayModal(`编辑翻译 · ${track.title}`, root);
  }
}
