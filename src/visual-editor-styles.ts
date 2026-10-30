export const VISUAL_EDITOR_STYLES = `
.lyric-layer-visual-editor {
  display: grid; gap: 10px; min-width: 0; width: 100%; box-sizing: border-box;
  color: var(--color-text-primary, #f7f7fa); font: 13px/1.5 var(--encore-body-font-stack, sans-serif);
  --ll-ve-border: rgba(255,255,255,.11); --ll-ve-muted: rgba(255,255,255,.56);
}
.lyric-layer-visual-editor * { box-sizing: border-box; }
.lyric-layer-visual-editor .ll-ve-heading { padding: 0 2px 2px; }
.lyric-layer-visual-editor .ll-ve-kicker { color: #bcb8ff; font-size: 11px; font-weight: 600; letter-spacing: .08em; }
.lyric-layer-visual-editor .ll-ve-original { margin: 3px 0 0; font-size: 16px; line-height: 1.4; font-weight: 600; white-space: pre-wrap; overflow-wrap: anywhere; }
.lyric-layer-visual-editor .ll-ve-card { min-width: 0; margin: 0; padding: 10px; border: 1px solid var(--ll-ve-border); border-radius: 10px; background: rgba(255,255,255,.025); }
.lyric-layer-visual-editor .ll-ve-section-heading { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 7px; }
.lyric-layer-visual-editor .ll-ve-label { color: rgba(255,255,255,.88); font-size: 12px; font-weight: 600; }
.lyric-layer-visual-editor .ll-ve-hint { color: var(--ll-ve-muted); font-size: 11px; }
.lyric-layer-visual-editor .ll-ve-field { display: grid; gap: 4px; min-width: 0; }
.lyric-layer-visual-editor .ll-ve-text,
.lyric-layer-visual-editor .ll-ve-input {
  display: block; width: 100%; min-width: 0; margin: 0; padding: 6px 8px; color: #f8f8fa; background: rgba(0,0,0,.2);
  border: 1px solid rgba(255,255,255,.16); border-radius: 7px; outline: none; font: inherit; line-height: 1.5;
}
.lyric-layer-visual-editor .ll-ve-text { min-height: 42px; resize: vertical; white-space: pre-wrap; }
.lyric-layer-visual-editor .ll-ve-input option { background: #25252b; color: #fff; }
.lyric-layer-visual-editor .ll-ve-text:focus,
.lyric-layer-visual-editor .ll-ve-input:focus { border-color: #b5afff; box-shadow: 0 0 0 2px rgba(165,160,255,.14); }
.lyric-layer-visual-editor .ll-ve-text[aria-invalid="true"] { border-color: #f09095; }
.lyric-layer-visual-editor button { font: inherit; }
.lyric-layer-visual-editor button:focus-visible,
.lyric-layer-visual-editor input[type="range"]:focus-visible { outline: 2px solid #d4d0ff; outline-offset: 3px; }
.lyric-layer-visual-editor button:disabled,
.lyric-layer-visual-editor fieldset:disabled { opacity: .42; cursor: default; }
.lyric-layer-visual-editor .ll-ve-button {
  display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 6px 11px; border: 1px solid var(--ll-ve-border);
  border-radius: 7px; background: rgba(255,255,255,.055); color: #eeeef4; cursor: pointer; white-space: nowrap;
}
.lyric-layer-visual-editor .ll-ve-button:hover:not(:disabled) { background: rgba(255,255,255,.12); }
.lyric-layer-visual-editor .ll-ve-inline-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.lyric-layer-visual-editor .ll-ve-inline-actions .ll-ve-button { min-height: 28px; padding: 4px 8px; font-size: 11px; }
.lyric-layer-visual-editor .ll-ve-chips { display: flex; flex-wrap: wrap; gap: 7px; }
.lyric-layer-visual-editor .ll-ve-chip { padding: 5px 9px; border: 1px solid var(--ll-ve-border); border-radius: 7px; color: var(--ll-ve-color); background: rgba(255,255,255,.035); cursor: pointer; white-space: pre-wrap; }
.lyric-layer-visual-editor .ll-ve-chip[data-mapped="true"] { border-bottom: 2px solid var(--ll-ve-color); }
.lyric-layer-visual-editor .ll-ve-chip[aria-pressed="true"] { border-color: var(--ll-ve-color); background: color-mix(in srgb, var(--ll-ve-color) 16%, transparent); }
.lyric-layer-visual-editor .ll-ve-workspace { display: grid; grid-template-columns: minmax(0,1fr) minmax(240px,1fr); gap: 10px; }
.lyric-layer-visual-editor .ll-ve-fragments-card { align-self: start; }
.lyric-layer-visual-editor .ll-ve-fragment-list { display: grid; gap: 6px; max-height: 260px; overflow-y: auto; padding: 2px; }
.lyric-layer-visual-editor .ll-ve-fragment { display: grid; grid-template-columns: 23px minmax(0,1fr); gap: 2px 8px; width: 100%; padding: 9px; border: 1px solid var(--ll-ve-border); border-radius: 8px; background: rgba(0,0,0,.1); color: #fff; text-align: left; cursor: pointer; }
.lyric-layer-visual-editor .ll-ve-fragment[aria-pressed="true"] { border-color: var(--ll-ve-color); background: color-mix(in srgb, var(--ll-ve-color) 9%, transparent); }
.lyric-layer-visual-editor .ll-ve-number { grid-row: span 2; align-self: center; color: var(--ll-ve-color); font-variant-numeric: tabular-nums; }
.lyric-layer-visual-editor .ll-ve-fragment-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.lyric-layer-visual-editor .ll-ve-fragment-time { grid-column: 2; color: var(--ll-ve-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.lyric-layer-visual-editor .ll-ve-detail { display: grid; align-content: start; gap: 8px; }
.lyric-layer-visual-editor .ll-ve-detail legend { padding: 0 4px; }
.lyric-layer-visual-editor .ll-ve-detail > .ll-ve-button { justify-self: start; font-size: 11px; }
.lyric-layer-visual-editor .ll-ve-two-columns { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; }
.lyric-layer-visual-editor .ll-ve-empty { margin: 9px 0; color: var(--ll-ve-muted); font-size: 12px; }
.lyric-layer-visual-editor .ll-ve-axis { display: flex; justify-content: space-between; margin: 3px 0 6px 25px; color: var(--ll-ve-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.lyric-layer-visual-editor .ll-ve-tracks { display: grid; gap: 6px; max-height: 260px; overflow-y: auto; padding: 3px 2px; }
.lyric-layer-visual-editor .ll-ve-track-row { display: grid; grid-template-columns: 18px minmax(0,1fr); gap: 7px; min-width: 0; align-items: center; }
.lyric-layer-visual-editor .ll-ve-track-number { color: var(--ll-ve-color); font-size: 10px; }
.lyric-layer-visual-editor .ll-ve-track { position: relative; height: 32px; border-radius: 5px; background: repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0,rgba(255,255,255,.06) 1px,transparent 1px,transparent 25%),rgba(255,255,255,.025); }
.lyric-layer-visual-editor .ll-ve-bar { position: absolute; top: 1px; bottom: 1px; display: flex; min-width: 4px; color: var(--ll-ve-color); background: color-mix(in srgb,var(--ll-ve-color) 20%,#202026); border: 1px solid color-mix(in srgb,var(--ll-ve-color) 55%,transparent); border-radius: 5px; }
.lyric-layer-visual-editor .ll-ve-bar[hidden] { display: none; }
.lyric-layer-visual-editor .ll-ve-bar[data-selected="true"] { border-color: var(--ll-ve-color); box-shadow: 0 0 0 1px color-mix(in srgb,var(--ll-ve-color) 25%,transparent); }
.lyric-layer-visual-editor .ll-ve-bar-body { flex: 1; min-width: 0; padding: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: inherit; background: none; border: 0; cursor: grab; touch-action: none; font-size: 11px; }
.lyric-layer-visual-editor .ll-ve-bar-body:active { cursor: grabbing; }
.lyric-layer-visual-editor .ll-ve-handle { position: relative; flex: 0 0 7px; width: 7px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; cursor: ew-resize; touch-action: none; }
.lyric-layer-visual-editor .ll-ve-handle::after { content: ""; position: absolute; top: 7px; bottom: 7px; left: 2px; width: 2px; border-radius: 1px; background: currentColor; opacity: .7; }
.lyric-layer-visual-editor .ll-ve-motion { display: grid; grid-template-columns: auto repeat(3,minmax(0,1fr)); gap: 12px; align-items: center; }
.lyric-layer-visual-editor .ll-ve-motion-control { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 7px; min-width: 0; font-size: 11px; }
.lyric-layer-visual-editor .ll-ve-range { display: block; width: 100%; min-width: 0; margin: 0; padding: 0; accent-color: #aba4ff; cursor: pointer; }
.lyric-layer-visual-editor .ll-ve-motion-value { min-width: 32px; color: var(--ll-ve-muted); font-variant-numeric: tabular-nums; text-align: right; }
.lyric-layer-visual-editor .ll-ve-footer { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--ll-ve-border); padding: 8px 2px; }
.lyric-layer-visual-editor .ll-ve-status { flex: 1; margin: 0; min-width: 0; color: var(--ll-ve-muted); font-size: 11px; overflow-wrap: anywhere; }
.lyric-layer-visual-editor .ll-ve-status[data-error="true"] { color: #ffadb0; }
.lyric-layer-visual-editor .ll-ve-primary { color: #17141f; background: #beb8ff; border-color: transparent; font-weight: 600; }
.lyric-layer-visual-editor .ll-ve-primary:hover:not(:disabled) { background: #d2cdff; }
.lyric-layer-visual-editor .ll-ve-preview { padding: 10px; }
.lyric-layer-visual-editor .ll-ve-preview .ll-preview-stage { min-height: 80px; padding: 8px 6px; }
.lyric-layer-visual-editor .ll-ve-preview .ll-preview-controls { margin-top: 8px; }
/* Leave a useful editing area below the pinned preview. Short windows and
   phones use normal document flow, so neither panel can cover the controls. */
@media(min-width: 760px) and (min-height: 700px) {
  .lyric-layer-visual-editor .ll-ve-preview { position: sticky; top: 0; z-index: 3; align-self: start; background: #1b1b21; box-shadow: 0 8px 18px #0005; }
  .lyric-layer-visual-editor .ll-ve-preview .ll-preview-stage { max-height: min(220px, 28vh); overflow: auto; }
  .lyric-layer-visual-editor .ll-ve-footer { position: sticky; bottom: 0; z-index: 4; background: #1b1b21; box-shadow: 0 -6px 16px #0004; }
}
@media(max-width: 650px) {
  .lyric-layer-visual-editor .ll-ve-workspace { grid-template-columns: minmax(0,1fr); }
  .lyric-layer-visual-editor .ll-ve-fragment-list { max-height: 200px; }
  .lyric-layer-visual-editor .ll-ve-motion { grid-template-columns: minmax(0,1fr); gap: 12px; }
  .lyric-layer-visual-editor .ll-ve-motion-control { grid-template-columns: 36px minmax(0,1fr) 48px; }
  .lyric-layer-visual-editor .ll-ve-footer { flex-wrap: wrap; }
  .lyric-layer-visual-editor .ll-ve-status { flex-basis: 100%; }
  .lyric-layer-visual-editor .ll-ve-card { padding: 9px; }
}
`;
