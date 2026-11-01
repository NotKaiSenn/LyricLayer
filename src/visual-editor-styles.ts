export const VISUAL_EDITOR_STYLES = `
.lyric-layer-visual-editor {
  display: grid; gap: 12px; min-width: 0; width: 100%; box-sizing: border-box;
  color: var(--ll-text); font: 13px/1.5 var(--encore-body-font-stack, var(--fallback-fonts, sans-serif));
}
.lyric-layer-visual-editor * { box-sizing: border-box; }
.lyric-layer-visual-editor .ll-ve-section { display: grid; gap: 8px; min-width: 0; }
.lyric-layer-visual-editor .ll-ve-section-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 28px; }
.lyric-layer-visual-editor .ll-ve-title { color: var(--ll-text); font-size: 14px; font-weight: 600; }
.lyric-layer-visual-editor .ll-ve-hint { margin: 0; color: var(--ll-text-2); font-size: 12px; line-height: 1.45; }
.lyric-layer-visual-editor .ll-ve-badge {
  padding: 1px 8px; border-radius: 999px; background: var(--ll-fill); color: var(--ll-text-2);
  font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums;
}
.lyric-layer-visual-editor .ll-ve-badge[data-manual="true"] { color: var(--ll-text); background: var(--ll-fill-strong); }
.lyric-layer-visual-editor .ll-ve-actions { display: flex; gap: 4px; margin-left: auto; }
.lyric-layer-visual-editor .ll-ve-text {
  display: block; width: 100%; min-height: 44px; margin: 0; padding: 10px 12px; resize: none; overflow: hidden;
  border: 0; border-radius: 8px; outline: none; background: var(--ll-fill); box-shadow: inset 0 0 0 1px var(--ll-line);
  color: var(--ll-text); font: inherit; font-size: 15px; line-height: 1.5; white-space: pre-wrap;
}
.lyric-layer-visual-editor .ll-ve-text::placeholder { color: var(--ll-text-3); }
.lyric-layer-visual-editor .ll-ve-text:focus { background: var(--ll-fill-strong); box-shadow: inset 0 0 0 1px var(--ll-line-strong); }
.lyric-layer-visual-editor .ll-ve-text[aria-invalid="true"] { box-shadow: inset 0 0 0 1px var(--ll-danger); }

.lyric-layer-visual-editor .ll-ve-lanes { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 6px 10px; align-items: center; }
.lyric-layer-visual-editor .ll-ve-lane-label { color: var(--ll-text-3); font-size: 11px; }
.lyric-layer-visual-editor .ll-ve-axis { display: flex; justify-content: space-between; color: var(--ll-text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.lyric-layer-visual-editor .ll-ve-track { position: relative; height: 30px; border-radius: 6px; background: rgba(255,255,255,.03); }
.lyric-layer-visual-editor .ll-ve-track.target { height: 38px; }
.lyric-layer-visual-editor .ll-ve-syllable {
  position: absolute; top: 3px; bottom: 3px; display: flex; align-items: center; justify-content: center;
  min-width: 2px; padding: 0 3px; overflow: hidden; border-radius: 4px; border-left: 1px solid rgba(0,0,0,.35);
  background: rgba(255,255,255,.05); color: var(--ll-text-3); font-size: 11px; white-space: nowrap; text-overflow: ellipsis;
}
.lyric-layer-visual-editor .ll-ve-syllable[data-mapped="true"] {
  color: var(--ll-ve-color); background: color-mix(in srgb, var(--ll-ve-color) 13%, transparent);
}
.lyric-layer-visual-editor .ll-ve-bar {
  position: absolute; top: 3px; bottom: 3px; display: flex; min-width: 20px; border-radius: 6px;
  color: var(--ll-ve-color); background: color-mix(in srgb, var(--ll-ve-color) 20%, #1c1c20);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ll-ve-color) 55%, transparent);
}
.lyric-layer-visual-editor .ll-ve-bar[data-auto="true"] { background: transparent; box-shadow: none; outline: 1px dashed rgba(255,255,255,.28); outline-offset: -1px; }
.lyric-layer-visual-editor .ll-ve-bar[data-manual="true"] { box-shadow: inset 0 0 0 1.5px var(--ll-ve-color); }
.lyric-layer-visual-editor .ll-ve-bar-label {
  flex: 1; min-width: 0; align-self: center; overflow: hidden; color: var(--ll-text); font-size: 12px;
  text-align: center; text-overflow: ellipsis; white-space: pre; pointer-events: none;
}
.lyric-layer-visual-editor .ll-ve-bar[data-auto="true"] .ll-ve-bar-label { color: var(--ll-text-2); }
.lyric-layer-visual-editor .ll-ve-handle {
  position: relative; flex: 0 0 12px; min-width: 0; margin: 0; padding: 0; border: 0; border-radius: 5px;
  background: none; color: inherit; cursor: ew-resize; touch-action: none;
}
.lyric-layer-visual-editor .ll-ve-handle::after {
  position: absolute; top: 8px; bottom: 8px; left: 5px; width: 2px; border-radius: 1px;
  background: currentColor; opacity: .55; content: ""; transition: opacity .12s ease;
}
.lyric-layer-visual-editor .ll-ve-handle:hover::after,
.lyric-layer-visual-editor .ll-ve-handle:focus-visible::after,
.lyric-layer-visual-editor .ll-ve-handle[data-dragging]::after { opacity: 1; }
.lyric-layer-visual-editor .ll-ve-handle:hover,
.lyric-layer-visual-editor .ll-ve-handle[data-dragging] { background: color-mix(in srgb, currentColor 18%, transparent); }
.lyric-layer-visual-editor .ll-ve-handle:focus-visible { outline: 2px solid var(--ll-text); outline-offset: -2px; }

.lyric-layer-visual-editor .ll-ve-details > summary {
  display: inline-flex; align-items: center; gap: 7px; width: fit-content; padding: 2px 0;
  color: var(--ll-text-2); font-size: 12px; cursor: pointer; list-style: none; user-select: none;
}
.lyric-layer-visual-editor .ll-ve-details > summary::-webkit-details-marker { display: none; }
.lyric-layer-visual-editor .ll-ve-details > summary::before {
  width: 5px; height: 5px; margin: 0 2px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
  content: ""; transform: rotate(-45deg); transition: transform .15s ease;
}
.lyric-layer-visual-editor .ll-ve-details[open] > summary::before { transform: rotate(45deg); }
.lyric-layer-visual-editor .ll-ve-details > summary:hover { color: var(--ll-text); }
.lyric-layer-visual-editor .ll-ve-details[hidden] { display: none; }
.lyric-layer-visual-editor .ll-ve-precise { display: grid; gap: 4px; margin-top: 8px; }
.lyric-layer-visual-editor .ll-ve-precise-row {
  display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 96px 96px 82px; gap: 8px; align-items: center;
}
.lyric-layer-visual-editor .ll-ve-precise-row.head { color: var(--ll-text-3); font-size: 11px; }
.lyric-layer-visual-editor .ll-ve-precise-text { overflow: hidden; color: var(--ll-text); text-overflow: ellipsis; white-space: pre; }
.lyric-layer-visual-editor .ll-ve-precise-text::before {
  display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 2px; background: var(--ll-ve-color); content: "";
}
.lyric-layer-visual-editor .ll-ve-precise-source { overflow: hidden; color: var(--ll-text-2); text-overflow: ellipsis; white-space: nowrap; }
.lyric-layer-visual-editor .ll-ve-number {
  width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 6px; outline: none;
  background: var(--ll-fill); box-shadow: inset 0 0 0 1px var(--ll-line); color: var(--ll-text);
  font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
}
.lyric-layer-visual-editor .ll-ve-number:focus { box-shadow: inset 0 0 0 1px var(--ll-line-strong); }

.lyric-layer-visual-editor .ll-ve-presets { display: inline-flex; gap: 2px; padding: 3px; border-radius: 9px; background: var(--ll-fill); }
.lyric-layer-visual-editor .ll-ve-preset {
  padding: 4px 13px; border: 0; border-radius: 6px; background: transparent; color: var(--ll-text-2);
  font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: background .15s ease, color .15s ease;
}
.lyric-layer-visual-editor button.ll-ve-preset:not([aria-pressed="true"]):hover { color: var(--ll-text); background: var(--ll-fill); }
.lyric-layer-visual-editor .ll-ve-preset[aria-pressed="true"],
.lyric-layer-visual-editor .ll-ve-preset.custom { background: var(--ll-accent); color: var(--ll-on-accent); }
.lyric-layer-visual-editor .ll-ve-preset.custom { cursor: default; }
.lyric-layer-visual-editor .ll-ve-preset[hidden] { display: none; }
.lyric-layer-visual-editor .ll-ve-preset:focus-visible { outline: 2px solid var(--ll-text); outline-offset: 1px; }
.lyric-layer-visual-editor .ll-ve-sliders { display: grid; gap: 12px; margin-top: 10px; }
.lyric-layer-visual-editor .ll-ve-slider { display: grid; grid-template-columns: minmax(0, 1fr) minmax(140px, 1.1fr) 56px; gap: 14px; align-items: center; }
.lyric-layer-visual-editor .ll-ve-slider-copy { display: grid; min-width: 0; }
.lyric-layer-visual-editor .ll-ve-slider-label { color: var(--ll-text); font-size: 13px; }
.lyric-layer-visual-editor .ll-ve-range { width: 100%; margin: 0; accent-color: var(--ll-accent); cursor: pointer; }
.lyric-layer-visual-editor .ll-ve-range:focus-visible { outline: 2px solid var(--ll-text); outline-offset: 3px; }
.lyric-layer-visual-editor .ll-ve-slider-value { color: var(--ll-text-2); font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }

/* The line editor lives in a panel docked under the real lyrics, which act
   as the preview. It only exists while a line is being edited. */
.ll-line-panel {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 60; box-sizing: border-box;
  max-height: min(50%, 400px); overflow-y: auto; padding: 14px 28px 16px;
  border-top: 1px solid rgba(255,255,255,.1); background: rgba(20,20,22,.94);
  -webkit-backdrop-filter: blur(24px) saturate(1.2); backdrop-filter: blur(24px) saturate(1.2);
  box-shadow: 0 -18px 40px rgba(0,0,0,.35); animation: ll-panel-in .22s cubic-bezier(.2,.8,.2,1);
}
/* Without a lyrics page (e.g. opened from a side card) it floats above the player bar. */
.ll-line-panel.floating {
  position: fixed; left: 0; right: 0; bottom: 96px; width: min(960px, calc(100vw - 48px)); margin: 0 auto;
  border: 1px solid rgba(255,255,255,.1); border-radius: 14px; max-height: min(60vh, 440px);
}
@keyframes ll-panel-in { from { opacity: 0; translate: 0 16px; } }
#SpicyLyricsPage.ll-panel-host { position: relative; }
#SpicyLyricsPage.ll-panel-open .LyricsContainer {
  align-self: flex-start; height: calc(100% - var(--ll-panel-height, 0px)) !important; transition: height .22s cubic-bezier(.2,.8,.2,1);
}
#SpicyLyricsPage .ll-editing-line { outline: 1.5px dashed rgba(255,199,128,.65); outline-offset: 10px; border-radius: 12px; }
@media (prefers-reduced-motion: reduce) { .ll-line-panel { animation: none; } }

.lyric-layer-visual-editor .ll-ve-header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.lyric-layer-visual-editor .ll-ve-heading { display: flex; flex: 1; align-items: baseline; gap: 10px; min-width: 0; }
.lyric-layer-visual-editor .ll-ve-heading-title { flex: none; font-size: 14px; font-weight: 600; }
.lyric-layer-visual-editor .ll-ve-heading-line { overflow: hidden; color: var(--ll-text-2); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.lyric-layer-visual-editor .ll-ve-header-actions { display: flex; flex: none; flex-wrap: wrap; gap: 6px; }
.lyric-layer-visual-editor .ll-ve-status { margin: -4px 0 0; color: var(--ll-text-3); font-size: 12px; }
.lyric-layer-visual-editor .ll-ve-status[data-error="true"] { color: var(--ll-danger); }
.lyric-layer-visual-editor .ll-ve-body { display: grid; gap: 14px; }
.lyric-layer-visual-editor .ll-ve-playhead {
  position: absolute; top: -3px; bottom: -3px; z-index: 3; width: 2px; margin-left: -1px; border-radius: 1px;
  background: #fff; box-shadow: 0 0 6px rgba(255,255,255,.6); pointer-events: none;
}
@media (max-width: 680px) {
  .lyric-layer-visual-editor .ll-ve-actions { margin-left: 0; }
  .lyric-layer-visual-editor .ll-ve-precise-row { grid-template-columns: minmax(0, 1fr) 84px 84px; }
  .lyric-layer-visual-editor .ll-ve-precise-source, .lyric-layer-visual-editor .ll-ve-precise-row > :last-child { display: none; }
  .lyric-layer-visual-editor .ll-ve-slider { grid-template-columns: minmax(0, 1fr) 52px; }
  .lyric-layer-visual-editor .ll-ve-slider .ll-ve-range { grid-column: 1 / -1; grid-row: 2; }
}
`;
