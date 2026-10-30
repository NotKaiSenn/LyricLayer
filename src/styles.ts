import { VISUAL_EDITOR_STYLES } from "./visual-editor-styles";

export const STYLES = `
.lyric-layer-translation {
  display: block;
  width: 100%;
  flex-basis: 100%;
  min-width: 0;
  box-sizing: border-box;
  margin-top: 0.22em;
  font-size: 0.74em;
  font-family: inherit;
  font-weight: inherit;
  font-style: inherit;
  line-height: 1.35;
  letter-spacing: 0;
  opacity: 1;
  color: inherit !important;
  -webkit-text-fill-color: inherit !important;
  background: none !important;
  text-shadow: inherit !important;
  overflow-wrap: anywhere;
  pointer-events: none !important;
  user-select: text;
  direction: ltr;
  transform: none !important;
  scale: 1 !important;
  filter: none !important;
}
/* Line/static lyrics are painted by the parent line's clipped background and
   inherited shadow. Keeping that paint also follows its live gradient variables. */
/* Syllable lyrics paint the words themselves, so use their palette rather than
   the line's different dim alpha. Without timing, highlight the whole active line. */
#SpicyLyricsPage .line > .lyric-layer-translation[data-lyric-layer-paint="syllable"] {
  -webkit-text-fill-color: transparent !important;
  text-shadow: 0 0 var(--BlurAmount, 0px)
    rgba(var(--lyric-layer-gradient-color), var(--lyric-layer-gradient-color), var(--lyric-layer-gradient-color), var(--lyric-layer-gradient-alpha-end)) !important;
}
#SpicyLyricsPage .line.Sung > .lyric-layer-translation[data-lyric-layer-paint="syllable"] {
  text-shadow: 0 0 var(--BlurAmount, 0px)
    rgba(var(--lyric-layer-gradient-color), var(--lyric-layer-gradient-color), var(--lyric-layer-gradient-color), var(--lyric-layer-gradient-alpha)) !important;
}
#SpicyLyricsPage .line.Active > .lyric-layer-translation[data-lyric-layer-paint="syllable"] {
  background-image: linear-gradient(
    rgba(255, 255, 255, var(--lyric-layer-gradient-alpha)),
    rgba(255, 255, 255, var(--lyric-layer-gradient-alpha))
  ) !important;
  background-clip: text !important;
  -webkit-background-clip: text !important;
  text-shadow: none !important;
}
#SpicyLyricsPage .line > .lyric-layer-translation[data-lyric-layer-paint="solid"] {
  color: var(--lyric-layer-source-color) !important;
  -webkit-text-fill-color: var(--lyric-layer-source-fill) !important;
  text-shadow: var(--lyric-layer-source-shadow) !important;
}
.lyric-layer-segment {
  display: inline-block;
  max-width: 100%;
  white-space: pre-wrap;
  vertical-align: baseline;
  -webkit-text-fill-color: inherit;
  text-shadow: inherit;
}
#SpicyLyricsPage .line.Active > .lyric-layer-translation[data-lyric-layer-animated="true"] {
  background: none !important;
  text-shadow: none !important;
}
#SpicyLyricsPage .line.Active > .lyric-layer-translation[data-lyric-layer-animated="true"] > .lyric-layer-segment:not([data-lyric-layer-native]) {
  -webkit-text-fill-color: transparent;
  background-image: linear-gradient(90deg,
    rgba(255, 255, 255, var(--lyric-layer-gradient-alpha)) calc(var(--lyric-layer-sweep, -10%) - 8%),
    rgba(255, 255, 255, var(--lyric-layer-gradient-alpha-end)) calc(var(--lyric-layer-sweep, -10%) + 8%));
  background-clip: text;
  -webkit-background-clip: text;
  transform: translateY(calc(var(--lyric-layer-lift, 0) * -0.055em));
  text-shadow: 0 0 0.3em rgba(255, 255, 255, calc(var(--lyric-layer-lift, 0) * 0.12));
}
.lyric-layer-motion-group, .lyric-layer-motion-ink {
  display: inline-block;
  max-width: 100%;
  white-space: pre-wrap;
  vertical-align: baseline;
}
/* Keep a small stable breathing space. Actual animation amplitude is computed
   from the available gaps, including whitespace and neighbouring wrapped rows. */
.lyric-layer-segment[data-lyric-layer-native] {
  display: inline-grid;
  vertical-align: baseline;
}
.lyric-layer-segment[data-lyric-layer-native]::before {
  content: attr(data-lyric-layer-reserve);
  grid-area: 1 / 1;
  font-size: 1.05em;
  visibility: hidden;
  white-space: inherit;
}
.lyric-layer-segment[data-lyric-layer-native] > .lyric-layer-motion-ink {
  grid-area: 1 / 1;
  justify-self: center;
  align-self: center;
}
#SpicyLyricsPage .line .lyric-layer-segment[data-lyric-layer-native],
#SpicyLyricsPage .line .lyric-layer-motion-group {
  background: none !important;
  text-shadow: none !important;
}
@media (prefers-reduced-motion: reduce) {
  #SpicyLyricsPage .line .lyric-layer-segment,
  #SpicyLyricsPage .line .lyric-layer-motion-group,
  #SpicyLyricsPage .line .lyric-layer-motion-ink {
    transform: none !important;
    scale: none !important;
    translate: none !important;
    rotate: none !important;
    text-shadow: none !important;
  }
}
#SpicyLyricsPage .line.OppositeAligned > .lyric-layer-translation { text-align: end; }
#SpicyLyricsPage .line.rtl > .lyric-layer-translation { direction: ltr !important; }

.lyric-layer-control svg { width: 22px; height: 22px; display: block; }

sl-generic-modal.SpicyLyricsModal .sl-modal.slmodal-lyricLayer .sl-modal-container-large {
  width: min(720px, calc(100vw - 48px));
}
sl-generic-modal.SpicyLyricsModal .sl-modal.slmodal-lyricLayer:has(.lyric-layer-editor, .lyric-layer-visual-editor) .sl-modal-container-large {
  width: min(920px, calc(100vw - 48px));
}

.lyric-layer-panel {
  color: var(--color-text-primary, var(--spice-text, #fff));
  min-width: min(620px, 78vw);
  font-family: var(--encore-body-font-stack, var(--fallback-fonts, sans-serif));
}
.lyric-layer-track {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: var(--space-4, 16px);
  align-items: center;
  padding: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
  border-radius: var(--radius-md, 12px);
  background: rgba(255,255,255,.035);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.12), inset 0 0 0 1px var(--hairline, rgba(255,255,255,.08));
}
.lyric-layer-cover {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-sm, 8px);
  object-fit: cover;
  background: var(--accent-tint-bg, rgba(255,255,255,.06));
  box-shadow: 0 8px 18px -8px rgba(0,0,0,.7);
}
.lyric-layer-track-details { min-width: 0; }
.lyric-layer-track-title {
  overflow: hidden;
  color: var(--color-text-primary, #fff);
  font-size: var(--text-headline-size, 15px);
  font-weight: var(--w-semibold, 600);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lyric-layer-track-sub {
  overflow: hidden;
  margin-top: 3px;
  color: var(--color-text-secondary, rgba(255,255,255,.6));
  font-size: var(--text-caption-size, 13px);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lyric-layer-uri {
  overflow: hidden;
  margin-top: 6px;
  color: var(--color-text-tertiary, rgba(255,255,255,.35));
  font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lyric-layer-status {
  align-self: start;
  padding: 5px 9px;
  border-radius: var(--radius-pill, 999px);
  background: var(--accent-tint-bg, rgba(255,255,255,.06));
  box-shadow: inset 0 0 0 1px var(--hairline, rgba(255,255,255,.08));
  color: var(--color-text-secondary, rgba(255,255,255,.6));
  font-size: var(--text-footnote-size, 12px);
  font-weight: var(--w-medium, 500);
  white-space: nowrap;
}
.lyric-layer-status.active {
  color: var(--color-text-primary, #fff);
  background: rgba(255,255,255,.1);
}
.lyric-layer-section-title {
  margin: var(--space-2, 8px) 0 var(--space-1, 4px);
  padding: var(--space-4, 16px) 2px var(--space-2, 8px);
  border-top: 1px solid var(--hairline, rgba(255,255,255,.08));
  color: var(--color-text-primary, #fff);
  font-size: var(--text-headline-size, 15px) !important;
  font-weight: var(--w-semibold, 600);
  letter-spacing: -.005em;
}
.lyric-layer-track + .lyric-layer-section-title {
  border-top: 0;
  margin-top: 0;
  padding-top: var(--space-2, 8px);
}
.lyric-layer-setting-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  padding: var(--space-3, 12px);
  border-radius: var(--radius-md, 12px);
  transition: background var(--dur-fast, .15s) var(--ease-standard, ease);
}
.lyric-layer-setting-row:hover { background: var(--accent-tint-bg, rgba(255,255,255,.06)); }
.lyric-layer-setting-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.lyric-layer-setting-label {
  color: var(--color-text-primary, #fff);
  font-size: var(--text-body-size, 14px);
  font-weight: var(--w-medium, 500);
}
.lyric-layer-setting-description {
  color: var(--color-text-secondary, rgba(255,255,255,.6));
  font-size: var(--text-caption-size, 13px);
  font-weight: var(--w-regular, 400);
  line-height: 1.4;
  opacity: .85;
}
.lyric-layer-setting-control { display: flex; flex-shrink: 0; align-items: center; }
.lyric-layer-button {
  display: inline-flex;
  min-height: var(--tap-min, 36px);
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px);
  border: 0;
  border-radius: var(--radius-sm, 8px);
  background: var(--accent-tint-bg, rgba(255,255,255,.06));
  box-shadow: inset 0 0 0 1px var(--hairline, rgba(255,255,255,.08));
  color: var(--color-text-primary, #fff);
  font: inherit;
  font-size: var(--text-caption-size, 13px);
  font-weight: var(--w-semibold, 600);
  letter-spacing: .01em;
  cursor: pointer;
  transition: background .2s var(--ease-standard, ease), box-shadow .2s var(--ease-standard, ease), transform .12s ease, opacity .15s ease;
}
.lyric-layer-button:hover {
  background: var(--accent-tint-bg-hover, rgba(255,255,255,.14));
  box-shadow: inset 0 0 0 1px var(--hairline-strong, rgba(255,255,255,.14));
}
.lyric-layer-button:active { transform: scale(.97); }
.lyric-layer-button:focus-visible { outline: 2px solid var(--color-text-primary, #fff); outline-offset: 2px; }
.lyric-layer-button:disabled { opacity: .35; pointer-events: none; }
.lyric-layer-button.primary {
  background: rgba(255,255,255,.15);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.36), inset 0 0 0 1px rgba(255,255,255,.22), inset 0 -1px 0 rgba(255,255,255,.18);
}
.lyric-layer-button.primary:hover {
  background: rgba(255,255,255,.22);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.5), inset 0 0 0 1px rgba(255,255,255,.32), 0 0 20px -5px rgba(255,255,255,.24);
}
.lyric-layer-button.danger {
  background: rgba(255,59,59,.1);
  box-shadow: inset 0 0 0 1px rgba(255,59,59,.18);
  color: var(--color-status-danger, #ff8585);
}
.lyric-layer-button.danger:hover { background: rgba(255,59,59,.18); }
.lyric-layer-button.quiet { padding: 0 11px; background: transparent; box-shadow: none; color: var(--color-text-secondary, rgba(255,255,255,.6)); }
.lyric-layer-button-icon { display: inline-flex; width: 15px; height: 15px; }
.lyric-layer-button-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.lyric-layer-toggle { position: relative; display: inline-flex; width: 42px; height: 24px; align-items: center; cursor: pointer; }
.lyric-layer-toggle input { position: absolute; width: 0; height: 0; opacity: 0; }
.lyric-layer-toggle-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 12px;
  background: rgba(0,0,0,.42);
  box-shadow: inset 0 1px 2px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.06);
  transition: background .22s cubic-bezier(.23,1,.32,1);
}
.lyric-layer-toggle-track::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.18);
  content: "";
  transition: transform .22s cubic-bezier(.23,1,.32,1);
}
.lyric-layer-toggle input:checked + .lyric-layer-toggle-track { background: rgba(255,255,255,.5); }
.lyric-layer-toggle input:checked + .lyric-layer-toggle-track::after { transform: translateX(18px); }
.lyric-layer-toggle input:focus-visible + .lyric-layer-toggle-track { box-shadow: 0 0 0 3px var(--accent-tint-bg-hover, rgba(255,255,255,.14)); }

.lyric-layer-editor { min-width: min(820px, 80vw); }
.lyric-layer-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3, 12px);
}
.lyric-layer-editor-progress {
  color: var(--color-text-secondary, rgba(255,255,255,.6));
  font-size: var(--text-caption-size, 13px);
  font-variant-numeric: tabular-nums;
}
.lyric-layer-editor-head,
.lyric-layer-editor-row {
  display: grid;
  grid-template-columns: 36px minmax(180px, 1fr) minmax(220px, 1fr);
  gap: var(--space-3, 12px);
  align-items: start;
}
.lyric-layer-editor-head {
  position: sticky;
  top: -20px;
  z-index: 2;
  padding: 10px 12px;
  border-bottom: 1px solid var(--hairline-strong, rgba(255,255,255,.14));
  background: rgba(22,22,22,.86);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  backdrop-filter: blur(18px) saturate(1.4);
  color: var(--color-text-tertiary, rgba(255,255,255,.35));
  font-size: var(--text-footnote-size, 12px);
  font-weight: var(--w-semibold, 600);
}
.lyric-layer-editor-row {
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-md, 12px);
  transition: background var(--dur-fast, .15s) var(--ease-standard, ease);
}
.lyric-layer-editor-row:hover { background: var(--accent-tint-bg, rgba(255,255,255,.06)); }
.lyric-layer-editor-index {
  padding-top: 11px;
  color: var(--color-text-tertiary, rgba(255,255,255,.35));
  font-size: var(--text-footnote-size, 12px);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.lyric-layer-original {
  padding: 10px 2px;
  color: var(--color-text-secondary, rgba(255,255,255,.6));
  font-size: var(--text-body-size, 14px);
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.lyric-layer-input {
  width: 100%;
  min-height: 42px;
  max-height: 160px;
  resize: none;
  box-sizing: border-box;
  overflow-y: auto;
  border: 0;
  border-radius: var(--radius-sm, 8px);
  padding: 10px 12px;
  background: var(--accent-tint-bg, rgba(255,255,255,.06));
  box-shadow: inset 0 0 0 1px var(--hairline, rgba(255,255,255,.08));
  color: var(--color-text-primary, #fff);
  font: inherit;
  font-size: var(--text-body-size, 14px);
  line-height: 1.45;
  transition: background var(--dur-fast, .15s) ease, box-shadow var(--dur-fast, .15s) ease;
}
.lyric-layer-input::placeholder { color: var(--color-text-tertiary, rgba(255,255,255,.35)); }
.lyric-layer-editor-translation { min-width: 0; }
.lyric-layer-editor-translation > .lyric-layer-button { margin-top: 4px; padding: 5px 8px; font-size: 12px; }
.lyric-layer-input:hover { background: rgba(255,255,255,.09); }
.lyric-layer-input:focus {
  outline: none;
  background: rgba(255,255,255,.1);
  box-shadow: inset 0 0 0 1px var(--hairline-strong, rgba(255,255,255,.14)), 0 0 0 3px rgba(255,255,255,.06);
}
.lyric-layer-editor-footer {
  position: sticky;
  bottom: -24px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  margin-top: var(--space-3, 12px);
  padding: 14px 12px 18px;
  border-top: 1px solid var(--hairline-strong, rgba(255,255,255,.14));
  background: rgba(22,22,22,.86);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  backdrop-filter: blur(18px) saturate(1.4);
}
.lyric-layer-hint { color: var(--color-text-tertiary, rgba(255,255,255,.35)); font-size: var(--text-footnote-size, 12px); }
.lyric-layer-export-description {
  margin: 0 var(--space-3, 12px) var(--space-4, 16px);
  color: var(--color-text-secondary, rgba(255,255,255,.6));
  font-size: var(--text-caption-size, 13px);
  line-height: 1.5;
}

@media (max-width: 720px) {
  .lyric-layer-panel, .lyric-layer-editor { min-width: 0; }
  .lyric-layer-track { grid-template-columns: 54px minmax(0, 1fr); }
  .lyric-layer-cover { width: 54px; height: 54px; }
  .lyric-layer-status { grid-column: 1 / -1; justify-self: start; }
  .lyric-layer-setting-row { align-items: flex-start; }
  .lyric-layer-editor-head { display: none; }
  .lyric-layer-editor-row { grid-template-columns: 28px minmax(0, 1fr); }
  .lyric-layer-editor-translation { grid-column: 2; }
}
` + VISUAL_EDITOR_STYLES;

export function injectStyles(): void {
  if (document.getElementById("lyric-layer-styles")) return;
  const style = document.createElement("style");
  style.id = "lyric-layer-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}
