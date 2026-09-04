export const STYLES = `
.lyric-layer-translation {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.22em;
  font-size: 0.74em;
  font-weight: 450;
  line-height: 1.35;
  letter-spacing: 0;
  opacity: 0.72;
  color: currentColor !important;
  -webkit-text-fill-color: currentColor !important;
  background: none !important;
  text-shadow: none !important;
  pointer-events: none !important;
  user-select: text;
  direction: ltr;
  transform: none !important;
  scale: 1 !important;
  filter: none !important;
  transition: opacity 180ms ease;
}
#SpicyLyricsPage .line.Active > .lyric-layer-translation { opacity: 0.86; }
#SpicyLyricsPage .line.OppositeAligned > .lyric-layer-translation { text-align: end; }
#SpicyLyricsPage .line.rtl > .lyric-layer-translation { direction: ltr !important; }

.lyric-layer-control svg { width: 22px; height: 22px; display: block; }

.lyric-layer-modal { color: var(--spice-text, #fff); min-width: min(760px, 82vw); }
.lyric-layer-track { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 16px; align-items: center; margin-bottom: 20px; }
.lyric-layer-cover { width: 76px; height: 76px; border-radius: 8px; object-fit: cover; background: rgba(255,255,255,.08); }
.lyric-layer-track-title { font-size: 20px; font-weight: 700; line-height: 1.2; }
.lyric-layer-track-sub { opacity: .7; margin-top: 5px; }
.lyric-layer-uri { opacity: .45; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; margin-top: 5px; }
.lyric-layer-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.lyric-layer-button { border: 0; border-radius: 999px; padding: 9px 15px; background: rgba(255,255,255,.11); color: inherit; font-weight: 650; cursor: pointer; }
.lyric-layer-button:hover { background: rgba(255,255,255,.18); }
.lyric-layer-button.primary { background: var(--spice-button-active, #1ed760); color: #000; }
.lyric-layer-button.danger { color: #ff8b8b; }
.lyric-layer-option { display: flex; align-items: center; gap: 8px; opacity: .72; font-size: 13px; margin: 14px 0 0; }
.lyric-layer-status { min-height: 20px; margin-top: 14px; opacity: .68; font-size: 13px; }
.lyric-layer-editor { max-height: min(68vh, 720px); overflow: auto; padding-right: 5px; }
.lyric-layer-editor-head, .lyric-layer-editor-row { display: grid; grid-template-columns: 42px minmax(180px, 1fr) minmax(220px, 1fr); gap: 10px; align-items: start; }
.lyric-layer-editor-head { position: sticky; top: 0; z-index: 2; padding: 9px 0; background: var(--spice-main, #121212); font-size: 12px; font-weight: 700; opacity: .8; }
.lyric-layer-editor-row { padding: 7px 0; border-top: 1px solid rgba(255,255,255,.07); }
.lyric-layer-editor-index { opacity: .45; padding-top: 9px; text-align: right; }
.lyric-layer-original { padding: 8px 10px; line-height: 1.4; overflow-wrap: anywhere; }
.lyric-layer-input { width: 100%; min-height: 38px; resize: vertical; box-sizing: border-box; border: 1px solid rgba(255,255,255,.11); border-radius: 8px; padding: 8px 10px; color: inherit; background: rgba(255,255,255,.055); font: inherit; line-height: 1.4; }
.lyric-layer-input:focus { outline: 2px solid var(--spice-button-active, #1ed760); outline-offset: -1px; }
.lyric-layer-editor-footer { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0 4px; background: var(--spice-main, #121212); }
.lyric-layer-hint { opacity: .55; font-size: 12px; }
`;

export function injectStyles(): void {
  if (document.getElementById("lyric-layer-styles")) return;
  const style = document.createElement("style");
  style.id = "lyric-layer-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}
