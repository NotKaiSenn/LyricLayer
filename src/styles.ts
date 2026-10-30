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
  width: min(920px, calc(100vw - 48px));
}

/* Shared tokens for the editor, the line editor and dialogs. Spicy Lyrics'
   variables win when present; the fallbacks match its dark glass modal. */
.ll-scope {
  --ll-text: var(--color-text-primary, #fff);
  --ll-text-2: rgba(255,255,255,.62);
  --ll-text-3: rgba(255,255,255,.38);
  --ll-fill: rgba(255,255,255,.06);
  --ll-fill-strong: rgba(255,255,255,.1);
  --ll-fill-hover: rgba(255,255,255,.15);
  --ll-line: rgba(255,255,255,.08);
  --ll-line-strong: rgba(255,255,255,.34);
  --ll-accent: #fff;
  --ll-on-accent: #121212;
  --ll-danger: #ff8a8a;
  --ll-surface-solid: #1c1c1e;
  color: var(--ll-text);
  font-family: var(--encore-body-font-stack, var(--fallback-fonts, sans-serif));
}
/* Component display rules must not resurrect elements hidden by the hidden attribute. */
.ll-scope [hidden] { display: none !important; }
.ll-scope .ll-btn {
  display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 14px; border: 0; border-radius: 8px;
  background: var(--ll-fill-strong); color: var(--ll-text);
  font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer;
  transition: background .15s ease, color .15s ease, opacity .15s ease, transform .1s ease;
}
.ll-scope .ll-btn:hover { background: var(--ll-fill-hover); }
.ll-scope .ll-btn:active { transform: scale(.97); }
.ll-scope .ll-btn:focus-visible { outline: 2px solid var(--ll-text); outline-offset: 2px; }
.ll-scope .ll-btn:disabled { opacity: .38; cursor: default; pointer-events: none; }
.ll-scope .ll-btn.primary { background: var(--ll-accent); color: var(--ll-on-accent); font-weight: 600; }
.ll-scope .ll-btn.primary:hover { background: #fff; box-shadow: 0 0 0 4px rgba(255,255,255,.12); }
.ll-scope .ll-btn.danger { background: rgba(255,90,90,.16); color: var(--ll-danger); font-weight: 600; }
.ll-scope .ll-btn.danger:hover { background: rgba(255,90,90,.26); }
.ll-scope .ll-btn.quiet { background: transparent; color: var(--ll-text-2); }
.ll-scope .ll-btn.quiet:hover { background: var(--ll-fill); color: var(--ll-text); }
.ll-scope .ll-btn.small { height: 30px; padding: 0 11px; font-size: 12.5px; }
.ll-scope .ll-btn.icon { width: 30px; padding: 0; }
.ll-scope .ll-btn-icon { display: inline-flex; width: 16px; height: 16px; }
.ll-scope .ll-btn-icon svg, .ll-scope .ll-row-tune svg {
  width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
}

.lyric-layer-panel { min-width: min(760px, 80vw); font-size: 14px; }
.lyric-layer-panel .ll-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.lyric-layer-panel .ll-cover {
  flex: none; width: 44px; height: 44px; border-radius: 6px; object-fit: cover;
  background: var(--ll-fill); box-shadow: 0 6px 14px -8px rgba(0,0,0,.8);
}
.lyric-layer-panel .ll-head-copy { flex: 1; min-width: 0; }
.lyric-layer-panel .ll-head-title, .lyric-layer-panel .ll-head-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lyric-layer-panel .ll-head-title { font-size: 15px; font-weight: 600; line-height: 1.3; }
.lyric-layer-panel .ll-head-sub { margin-top: 2px; color: var(--ll-text-2); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.lyric-layer-panel .ll-head-actions { display: flex; flex: none; align-items: center; gap: 6px; }

.lyric-layer-panel .ll-menu-anchor { position: relative; display: inline-flex; }
.lyric-layer-panel .ll-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; display: grid; gap: 1px;
  width: max-content; min-width: 240px; max-width: 320px; padding: 6px; border-radius: 10px;
  background: #2a2a2d; box-shadow: 0 18px 40px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.08);
}
.lyric-layer-panel .ll-menu[hidden] { display: none; }
.lyric-layer-panel .ll-menu-item {
  display: grid; gap: 1px; width: 100%; padding: 7px 10px; border: 0; border-radius: 6px;
  background: transparent; color: var(--ll-text); font: inherit; text-align: left; cursor: pointer;
}
.lyric-layer-panel .ll-menu-item:hover:not(:disabled), .lyric-layer-panel .ll-menu-item:focus-visible { background: var(--ll-fill-strong); outline: none; }
.lyric-layer-panel .ll-menu-item:disabled { cursor: default; }
.lyric-layer-panel .ll-menu-item:disabled .ll-menu-label { color: var(--ll-text-3); }
.lyric-layer-panel .ll-menu-item.danger .ll-menu-label { color: var(--ll-danger); }
.lyric-layer-panel .ll-menu-item.danger:disabled .ll-menu-label { color: var(--ll-text-3); }
.lyric-layer-panel .ll-menu-label { font-size: 13px; font-weight: 500; }
.lyric-layer-panel .ll-menu-detail { color: var(--ll-text-2); font-size: 11.5px; line-height: 1.4; }
.lyric-layer-panel .ll-menu-separator { height: 1px; margin: 5px 6px; background: var(--ll-line); }
.lyric-layer-panel .ll-menu-note { padding: 6px 10px; color: var(--ll-text-2); font-size: 12px; line-height: 1.45; }
.lyric-layer-panel .ll-switch-row { display: flex; align-items: center; gap: 14px; padding: 7px 10px; border-radius: 6px; cursor: pointer; }
.lyric-layer-panel .ll-switch-row:hover { background: var(--ll-fill-strong); }
.lyric-layer-panel .ll-switch-copy { display: grid; flex: 1; gap: 1px; }
.lyric-layer-panel .ll-switch-row input { position: absolute; width: 0; height: 0; opacity: 0; }
.lyric-layer-panel .ll-switch {
  position: relative; flex: none; width: 34px; height: 20px; border-radius: 10px;
  background: rgba(255,255,255,.18); transition: background .2s ease;
}
.lyric-layer-panel .ll-switch::after {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.4); content: ""; transition: transform .2s cubic-bezier(.23,1,.32,1);
}
.lyric-layer-panel .ll-switch-row input:checked + .ll-switch { background: rgba(255,255,255,.62); }
.lyric-layer-panel .ll-switch-row input:checked + .ll-switch::after { transform: translateX(14px); }
.lyric-layer-panel .ll-switch-row input:focus-visible + .ll-switch { outline: 2px solid var(--ll-text); outline-offset: 2px; }

.lyric-layer-panel .ll-banner {
  display: flex; align-items: center; gap: 12px; margin: 0 0 12px; padding: 8px 8px 8px 14px;
  border-radius: 8px; background: var(--ll-fill-strong); font-size: 13px; line-height: 1.45;
}
.lyric-layer-panel .ll-banner[hidden] { display: none; }
.lyric-layer-panel .ll-banner-text { flex: 1; min-width: 0; padding: 4px 0; }

.lyric-layer-panel .ll-lines { display: grid; gap: 2px; }
.lyric-layer-panel .ll-row {
  display: grid; grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start;
  padding: 5px 8px; border-radius: 10px; transition: background .15s ease;
}
.lyric-layer-panel .ll-row:focus-within { background: var(--ll-fill); }
.lyric-layer-panel .ll-row-index {
  padding-top: 10px; color: var(--ll-text-3); font-size: 12px; font-variant-numeric: tabular-nums; text-align: right;
}
.lyric-layer-panel .ll-row-original {
  padding: 9px 0; color: var(--ll-text-2); font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; transition: color .15s ease;
}
.lyric-layer-panel .ll-row:focus-within .ll-row-original { color: var(--ll-text); }
.lyric-layer-panel .ll-row-translation { position: relative; min-width: 0; }
.lyric-layer-panel .ll-input {
  display: block; width: 100%; min-height: 40px; box-sizing: border-box; margin: 0; padding: 9px 40px 9px 12px;
  overflow: hidden; resize: none; border: 0; border-radius: 8px; outline: none;
  background: var(--ll-fill); box-shadow: inset 0 0 0 1px var(--ll-line); color: var(--ll-text);
  font: inherit; font-size: 14px; line-height: 1.45;
  transition: background .15s ease, box-shadow .15s ease;
}
.lyric-layer-panel .ll-input::placeholder { color: var(--ll-text-3); }
.lyric-layer-panel .ll-input:hover { background: rgba(255,255,255,.08); }
.lyric-layer-panel .ll-input:focus { background: var(--ll-fill-strong); box-shadow: inset 0 0 0 1px var(--ll-line-strong); }
.lyric-layer-panel .ll-row-tune {
  position: absolute; top: 6px; right: 6px; display: grid; width: 28px; height: 28px; padding: 6px;
  box-sizing: border-box; border: 0; border-radius: 6px; background: transparent; color: var(--ll-text-3);
  opacity: .5; cursor: pointer; transition: opacity .15s ease, background .15s ease, color .15s ease;
}
.lyric-layer-panel .ll-row:hover .ll-row-tune, .lyric-layer-panel .ll-row:focus-within .ll-row-tune { opacity: 1; }
.lyric-layer-panel .ll-row-tune:hover { background: var(--ll-fill-strong); color: var(--ll-text); }
.lyric-layer-panel .ll-row-tune:focus-visible { opacity: 1; outline: 2px solid var(--ll-text); outline-offset: -2px; }
.lyric-layer-panel .ll-row-tune[data-custom="true"] { color: var(--ll-text); opacity: 1; }
.lyric-layer-panel .ll-row-tune[data-custom="true"]::after {
  position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%;
  background: #8fd6ff; box-shadow: 0 0 0 2px #1e1e20; content: "";
}

.lyric-layer-panel .ll-empty { display: grid; justify-items: center; gap: 10px; padding: 56px 16px 64px; text-align: center; }
.lyric-layer-panel .ll-empty-title { margin: 0; font-size: 15px; font-weight: 600; }
.lyric-layer-panel .ll-empty-text { max-width: 380px; margin: 0 0 6px; color: var(--ll-text-2); font-size: 13px; line-height: 1.55; }

.ll-scope .ll-footer {
  position: sticky; bottom: -24px; z-index: 5; display: flex; align-items: center; gap: 8px;
  margin-top: 12px; padding: 14px 0 18px; border-top: 1px solid var(--ll-line);
  background: rgba(24,24,26,.92); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
}
.ll-scope .ll-footer[hidden] { display: none; }
.ll-scope .ll-footer-status { flex: 1; min-width: 0; margin: 0; color: var(--ll-text-3); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.ll-scope .ll-footer-status[data-dirty="true"] { color: var(--ll-text); }
.ll-scope .ll-footer-status[data-dirty="true"]::before {
  display: inline-block; width: 7px; height: 7px; margin: 0 8px 1px 2px; border-radius: 50%; background: #ffc780; content: "";
}
.ll-scope .ll-footer-status[data-error="true"] { color: var(--ll-danger); }

.ll-dialog-backdrop {
  position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 24px;
  background: rgba(0,0,0,.5); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
}
.ll-dialog-backdrop .ll-dialog {
  width: min(400px, 100%); box-sizing: border-box; padding: 22px 22px 18px; border-radius: 14px;
  background: #262628; box-shadow: 0 24px 60px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08);
}
.ll-dialog-backdrop .ll-dialog-title { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
.ll-dialog-backdrop .ll-dialog-text { margin: 0 0 22px; color: var(--ll-text-2); font-size: 13px; line-height: 1.6; }
.ll-dialog-backdrop .ll-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 720px) {
  .lyric-layer-panel { min-width: 0; }
  .lyric-layer-panel .ll-head { flex-wrap: wrap; }
  .lyric-layer-panel .ll-head-actions { width: 100%; }
  .lyric-layer-panel .ll-row { grid-template-columns: 22px minmax(0, 1fr); gap: 4px 10px; }
  .lyric-layer-panel .ll-row-original { padding-bottom: 2px; }
  .lyric-layer-panel .ll-row-translation { grid-column: 2; }
}
` + VISUAL_EDITOR_STYLES;

export function injectStyles(): void {
  if (document.getElementById("lyric-layer-styles")) return;
  const style = document.createElement("style");
  style.id = "lyric-layer-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}
