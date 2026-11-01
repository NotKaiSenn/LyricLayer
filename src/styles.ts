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
  /* Clickable: the renderer forwards a click to Spicy's own line seek. */
  pointer-events: auto !important;
  cursor: inherit;
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

/* Edit mode: the lyrics page is the editor. A toolbar floats over its top. */
.lyric-layer-control.ll-active { color: #121212 !important; background: #fff !important; border-radius: 50%; }
#SpicyLyricsPage.ll-panel-host { position: relative; }
.ll-toolbar-wrap {
  position: absolute; top: 14px; left: 50%; z-index: 102; display: flex; flex-direction: column; align-items: center; gap: 8px;
  max-width: calc(100% - 32px); transform: translateX(-50%); font-size: 13px; pointer-events: none; transition: top .2s ease;
}
.ll-toolbar-wrap > * { pointer-events: auto; }
.ll-scope .ll-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; padding: 6px 6px 6px 14px;
  border-radius: 14px; background: rgba(22,22,24,.92); box-shadow: 0 12px 32px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.1);
  -webkit-backdrop-filter: blur(20px) saturate(1.2); backdrop-filter: blur(20px) saturate(1.2);
}
.ll-scope .ll-toolbar-title { font-weight: 600; white-space: nowrap; }
.ll-scope .ll-toolbar-progress { color: var(--ll-text-2); font-size: 12.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ll-scope .ll-toolbar-separator { width: 1px; height: 18px; margin: 0 4px; background: var(--ll-line-strong); opacity: .5; }
.ll-scope .ll-toolbar-status { padding: 0 4px; color: var(--ll-text-3); font-size: 12.5px; white-space: nowrap; }
.ll-scope .ll-toolbar-status[data-dirty="true"] { color: var(--ll-text); }
.ll-scope .ll-toolbar-status[data-dirty="true"]::before {
  display: inline-block; width: 7px; height: 7px; margin: 0 7px 1px 0; border-radius: 50%; background: #ffc780; content: "";
}

.ll-scope .ll-menu-anchor { position: relative; display: inline-flex; }
.ll-scope .ll-menu {
  position: absolute; top: calc(100% + 8px); left: 50%; z-index: 30; display: grid; gap: 1px;
  width: max-content; min-width: 240px; max-width: 320px; padding: 6px; border-radius: 10px; transform: translateX(-50%);
  background: #2a2a2d; box-shadow: 0 18px 40px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.08); text-align: left;
}
.ll-scope .ll-menu-item {
  display: grid; gap: 1px; width: 100%; padding: 7px 10px; border: 0; border-radius: 6px;
  background: transparent; color: var(--ll-text); font: inherit; text-align: left; cursor: pointer;
}
.ll-scope .ll-menu-item:hover:not(:disabled), .ll-scope .ll-menu-item:focus-visible { background: var(--ll-fill-strong); outline: none; }
.ll-scope .ll-menu-item:disabled { cursor: default; }
.ll-scope .ll-menu-item:disabled .ll-menu-label { color: var(--ll-text-3); }
.ll-scope .ll-menu-item.danger .ll-menu-label { color: var(--ll-danger); }
.ll-scope .ll-menu-item.danger:disabled .ll-menu-label { color: var(--ll-text-3); }
.ll-scope .ll-menu-label { font-size: 13px; font-weight: 500; }
.ll-scope .ll-menu-detail { color: var(--ll-text-2); font-size: 11.5px; line-height: 1.4; }
.ll-scope .ll-menu-separator { height: 1px; margin: 5px 6px; background: var(--ll-line); }
.ll-scope .ll-menu-note { padding: 6px 10px; color: var(--ll-text-2); font-size: 12px; line-height: 1.45; }
.ll-scope .ll-switch-row { display: flex; align-items: center; gap: 14px; padding: 7px 10px; border-radius: 6px; cursor: pointer; }
.ll-scope .ll-switch-row:hover { background: var(--ll-fill-strong); }
.ll-scope .ll-switch-copy { display: grid; flex: 1; gap: 1px; }
.ll-scope .ll-switch-row input { position: absolute; width: 0; height: 0; opacity: 0; }
.ll-scope .ll-switch {
  position: relative; flex: none; width: 34px; height: 20px; border-radius: 10px;
  background: rgba(255,255,255,.18); transition: background .2s ease;
}
.ll-scope .ll-switch::after {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.4); content: ""; transition: transform .2s cubic-bezier(.23,1,.32,1);
}
.ll-scope .ll-switch-row input:checked + .ll-switch { background: rgba(255,255,255,.62); }
.ll-scope .ll-switch-row input:checked + .ll-switch::after { transform: translateX(14px); }
.ll-scope .ll-switch-row input:focus-visible + .ll-switch { outline: 2px solid var(--ll-text); outline-offset: 2px; }

.ll-scope .ll-banner {
  display: flex; align-items: center; gap: 8px; max-width: 560px; padding: 6px 6px 6px 14px;
  border-radius: 10px; background: rgba(40,40,44,.94); box-shadow: 0 10px 26px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.08);
  font-size: 13px; line-height: 1.45;
}
.ll-scope .ll-banner-text { flex: 1; min-width: 0; }

/* Lines and their translations, while editing. */
#SpicyLyricsPage.ll-edit-mode .lyric-layer-translation:not(.ll-inline-editor) {
  cursor: text; text-decoration: underline dashed rgba(255,255,255,.22); text-decoration-thickness: 1.5px; text-underline-offset: .28em;
}
#SpicyLyricsPage .lyric-layer-translation.ll-placeholder,
#SpicyLyricsPage .line > .lyric-layer-translation.ll-placeholder {
  color: rgba(255,255,255,.32) !important; -webkit-text-fill-color: rgba(255,255,255,.32) !important;
  background: none !important; text-shadow: none !important; font-weight: 500;
}
#SpicyLyricsPage .line:has(> .ll-inline-editor), #SpicyLyricsPage .line:has(+ .ll-inline-editor) { outline: 1.5px dashed rgba(255,199,128,.6); outline-offset: 8px; border-radius: 12px; }
#SpicyLyricsPage .line > .lyric-layer-translation.ll-inline-editor {
  position: relative; display: block; margin-top: .3em; color: #fff !important; -webkit-text-fill-color: #fff !important;
  background: none !important; text-shadow: none !important; filter: none !important; cursor: auto;
}
#SpicyLyricsPage .ll-inline-editor .ll-inline-input {
  display: block; width: 100%; min-height: 1.5em; box-sizing: border-box; margin: 0; padding: .18em 2.4em .18em .35em;
  overflow: hidden; resize: none; border: 0; border-radius: 8px; outline: none;
  background: rgba(255,255,255,.1); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.45);
  color: #fff; -webkit-text-fill-color: #fff; caret-color: #fff; font: inherit; line-height: 1.35; text-shadow: none;
}
#SpicyLyricsPage .ll-inline-editor .ll-inline-input::placeholder { color: rgba(255,255,255,.35); -webkit-text-fill-color: rgba(255,255,255,.35); }
#SpicyLyricsPage .ll-inline-editor .ll-inline-tune {
  position: absolute; top: 50%; right: .3em; width: 30px; height: 30px; transform: translateY(-50%);
  background: transparent; color: rgba(255,255,255,.75); -webkit-text-fill-color: currentColor; font-size: 13px;
}
#SpicyLyricsPage .ll-inline-editor .ll-inline-tune:hover { background: var(--ll-fill-strong); color: #fff; }

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

` + VISUAL_EDITOR_STYLES;

export function injectStyles(): void {
  if (document.getElementById("lyric-layer-styles")) return;
  const style = document.createElement("style");
  style.id = "lyric-layer-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}
