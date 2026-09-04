/* LyricLayer v0.1.0 — local translations for Spicy Lyrics */
"use strict";(()=>{function z(n){return n.normalize("NFKC").toLocaleLowerCase().replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/[\s\p{P}\p{S}]+/gu,"")}function O(n,e,t=1e3){let r=new Map,i=new Set,a=[];n.forEach((o,s)=>{let c=o.startTime;c!==void 0&&e.forEach((d,y)=>{if(d.startTime===void 0)return;let m=Math.abs(c-d.startTime);m<=t&&a.push({lyric:s,translation:y,difference:m})})}),a.sort((o,s)=>o.difference-s.difference);for(let o of a){let s=n[o.lyric]?.index;s===void 0||r.has(s)||i.has(o.translation)||(r.set(s,e[o.translation]),i.add(o.translation))}return e.forEach((o,s)=>{if(i.has(s)||o.index===void 0)return;let c=n.find(d=>d.index===o.index);!c||r.has(c.index)||(r.set(c.index,o),i.add(s))}),e.forEach((o,s)=>{if(i.has(s)||!o.originalText)return;let c=z(o.originalText);if(!c)return;let d=n.find(y=>!r.has(y.index)&&z(y.text)===c);d&&(r.set(d.index,o),i.add(s))}),r}var ae=["SpicyLyrics_LyricsStore_g1","SpicyLyrics_LyricsStore"],K=/[\u200B-\u200D\u2060\uFEFF]/g;function D(n){if(!n||typeof n!="object")return!1;let e=n;return Array.isArray(e.Lines)||Array.isArray(e.Content)}function oe(n){if(D(n))return n;if(!n||typeof n!="object")return;let e=n;if(e.Value!=="NO_LYRICS"&&!(typeof e.ExpiresAt=="number"&&e.ExpiresAt<Date.now())){if(D(e.Content))return e.Content;if(D(e.Value))return e.Value}}function W(n){return typeof n=="number"&&Number.isFinite(n)?Math.round(n*1e3):void 0}function se(n){let e="";return n.forEach((t,r)=>{let i=n[r-1];i&&!i.IsPartOfWord&&(e+=" "),e+=(t.Text??"").replace(K,"")}),e.trim()}function ce(n){if(n.Type==="Static"||n.Lines&&!n.Content)return(n.Lines??[]).map((t,r)=>({index:r,text:(t.Text??"").trim()}));let e=[];for(let t of n.Content??[]){if(t.Type==="Instrumental")continue;let r=t.Lead?.Syllables,i=r?.length?se(r):String(t.Text??t.Lead?.Text??"").replace(K,"").trim();i&&e.push({index:e.length,text:i,startTime:W(t.Lead?.StartTime??t.StartTime),endTime:W(t.Lead?.EndTime??t.EndTime)})}return e}async function _(n){let e=n.split(":"),t=e[e.length-1];if(!t||typeof caches>"u")return[];try{for(let r of ae){if(typeof caches.has=="function"&&!await caches.has(r))continue;let a=await(await caches.open(r)).match(`/${t}`);if(!a)continue;let o=oe(await a.clone().json());if(o)return ce(o)}}catch(r){console.warn("LyricLayer: cannot read Spicy Lyrics cache",r)}return[]}function q(n){let e=n.cloneNode(!0);e.querySelectorAll("[data-lyric-layer-translation], .slt-interleaved-translation, .slt-romanization-line, .slt-original-line, .slt-replace-line").forEach(r=>r.remove());let t=e.querySelectorAll(".word:not(.dot), .letterGroup");return t.length?Array.from(t).map(r=>r.textContent?.trim()??"").filter(Boolean).join(" ").replace(/\s+/g," ").trim():e.textContent?.replace(/\s+/g," ").trim()??""}function X(n=document){let e=new Set,t=[];return n.querySelectorAll("#SpicyLyricsPage .SpicyLyricsScrollContainer .line:not(.musical-line):not(.bg-line)").forEach(i=>{let a=q(i),o=Number(i.parentElement?.dataset.index),s=`${Number.isFinite(o)?o:"?"}\0${a}`;!a||e.has(s)||(e.add(s),t.push({index:t.length,text:a}))}),t}var le=".line:not(.musical-line):not(.bg-line)",Z="[data-lyric-layer-translation]",B=class{constructor(){this.roots=new Map;this.scheduled=!1;this.lyricLines=[];this.translations=new Map}start(e){this.onLyricsUiChanged=e,this.discoverRoots(),this.pageObserver=new MutationObserver(()=>this.schedule()),this.pageObserver.observe(document.body,{childList:!0,subtree:!0})}stop(){this.pageObserver?.disconnect(),this.roots.forEach(e=>e.disconnect()),this.roots.clear(),this.clearDom()}update(e,t){this.lyricLines=e,this.translations=t,this.clearDom(),this.schedule()}clear(){this.lyricLines=[],this.translations=new Map,this.clearDom()}refresh(){this.schedule()}schedule(){this.scheduled||(this.scheduled=!0,requestAnimationFrame(()=>{this.scheduled=!1;let e=this.discoverRoots();this.renderMountedLines(),(e||this.roots.size>0)&&this.onLyricsUiChanged?.()}))}discoverRoots(){let e=!1,t=new Set(document.querySelectorAll("#SpicyLyricsPage .SpicyLyricsScrollContainer"));for(let[r,i]of this.roots)r.isConnected&&t.has(r)||(i.disconnect(),this.roots.delete(r));return t.forEach(r=>{if(this.roots.has(r))return;let i=new MutationObserver(()=>this.schedule());i.observe(r,{childList:!0,subtree:!0}),this.roots.set(r,i),e=!0}),e}resolveLineIndex(e){let t=z(q(e));if(!t)return;let r=this.lyricLines.filter(o=>z(o.text)===t),i=r[0];if(!i)return;if(r.length===1)return i.index;let a=Number(e.parentElement?.dataset.index);return Number.isFinite(a)?r.reduce((o,s)=>Math.abs(s.index-a)<Math.abs(o.index-a)?s:o,i).index:i.index}renderMountedLines(){this.roots.forEach((e,t)=>{t.querySelectorAll(le).forEach(r=>{let i=this.resolveLineIndex(r),a=i===void 0?void 0:this.translations.get(i),o=r.querySelector(`:scope > ${Z}`);if(!a?.translatedText.trim()){o?.remove();return}let s=o??document.createElement("div");s.className="lyric-layer-translation",s.dataset.lyricLayerTranslation="true",s.dataset.lineIndex=String(i),s.textContent!==a.translatedText&&(s.textContent=a.translatedText),o||r.appendChild(s)})})}clearDom(){document.querySelectorAll(Z).forEach(e=>e.remove())}};var de="lyric-layer",F="translations";var j=class{open(){return this.dbPromise?this.dbPromise:(this.dbPromise=new Promise((e,t)=>{let r=indexedDB.open(de,1);r.onupgradeneeded=()=>{let i=r.result;i.objectStoreNames.contains(F)||i.createObjectStore(F,{keyPath:"trackUri"})},r.onsuccess=()=>e(r.result),r.onerror=()=>t(r.error??new Error("\u65E0\u6CD5\u6253\u5F00\u7FFB\u8BD1\u6570\u636E\u5E93"))}),this.dbPromise)}async request(e,t){let r=await this.open();return new Promise((i,a)=>{let o=r.transaction(F,e),s=t(o.objectStore(F));s.onsuccess=()=>i(s.result),s.onerror=()=>a(s.error??new Error("\u6570\u636E\u5E93\u64CD\u4F5C\u5931\u8D25")),o.onabort=()=>a(o.error??new Error("\u6570\u636E\u5E93\u4E8B\u52A1\u5DF2\u4E2D\u6B62"))})}get(e){return this.request("readonly",t=>t.get(e))}async save(e){await this.request("readwrite",t=>t.put(e))}async delete(e){await this.request("readwrite",t=>t.delete(e))}getAll(){return this.request("readonly",e=>e.getAll())}};var pe=`
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

sl-generic-modal.SpicyLyricsModal .sl-modal.slmodal-lyricLayer .sl-modal-container-large {
  width: min(720px, calc(100vw - 48px));
}
sl-generic-modal.SpicyLyricsModal .sl-modal.slmodal-lyricLayer:has(.lyric-layer-editor) .sl-modal-container-large {
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

@media (max-width: 720px) {
  .lyric-layer-panel, .lyric-layer-editor { min-width: 0; }
  .lyric-layer-track { grid-template-columns: 54px minmax(0, 1fr); }
  .lyric-layer-cover { width: 54px; height: 54px; }
  .lyric-layer-status { grid-column: 1 / -1; justify-self: start; }
  .lyric-layer-setting-row { align-items: flex-start; }
  .lyric-layer-editor-head { display: none; }
  .lyric-layer-editor-row { grid-template-columns: 28px minmax(0, 1fr); }
  .lyric-layer-input { grid-column: 2; }
}
`;function Y(){if(document.getElementById("lyric-layer-styles"))return;let n=document.createElement("style");n.id="lyric-layer-styles",n.textContent=pe,document.head.appendChild(n)}function ee(n,e=!1){let r=n.replace(/^\uFEFF/,"").replace(/\r\n?/g,`
`).split(`
`);return r[r.length-1]===""&&(r=r.slice(0,-1)),e||(r=r.filter(i=>i.trim().length>0)),r.map((i,a)=>({index:a,translatedText:i.trim()}))}function ue(n,e,t){let r=Number(n)*6e4+Number(e)*1e3;return t?r+Number(t.padEnd(3,"0").slice(0,3)):r}function te(n){let e=[],t=/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;for(let r of n.replace(/^\uFEFF/,"").split(/\r?\n/)){let i=[...r.matchAll(t)];if(!i.length)continue;let a=r.replace(t,"").trim();if(a)for(let o of i)e.push({startTime:ue(o[1]??"0",o[2]??"0",o[3]),translatedText:a})}return e.sort((r,i)=>(r.startTime??0)-(i.startTime??0))}function Q(n){return typeof n=="object"&&n!==null&&!Array.isArray(n)}function re(n){let e=JSON.parse(n.replace(/^\uFEFF/,""));if(!Q(e)||!Array.isArray(e.lines))throw new Error("JSON \u5FC5\u987B\u5305\u542B lines \u6570\u7EC4");let t=e.lines.map((a,o)=>{if(!Q(a)||typeof a.translatedText!="string")throw new Error(`JSON \u7B2C ${o+1} \u884C\u7F3A\u5C11 translatedText`);let s={translatedText:a.translatedText};return typeof a.index=="number"&&Number.isInteger(a.index)&&a.index>=0&&(s.index=a.index),typeof a.startTime=="number"&&Number.isFinite(a.startTime)&&(s.startTime=a.startTime),typeof a.originalText=="string"&&(s.originalText=a.originalText),s}),r=typeof e.trackUri=="string"?e.trackUri:void 0,i=e.version===1&&r&&typeof e.createdAt=="number"&&typeof e.updatedAt=="number";return{trackUri:r,lines:t,entry:i?e:void 0}}function w(n,e=!1){window.Spicetify?.showNotification?window.Spicetify.showNotification(n,e,4e3):console[e?"error":"info"](`LyricLayer: ${n}`)}function L(n,e="",t=""){let r=document.createElement("button");if(r.type="button",r.className=`lyric-layer-button ${e}`.trim(),t){let a=document.createElement("span");a.className="lyric-layer-button-icon",a.innerHTML=t,r.appendChild(a)}let i=document.createElement("span");return i.textContent=n,r.appendChild(i),r}function ne(n){let e=document.createElement("p");return e.className="lyric-layer-section-title",e.textContent=n,e}function k(n,e,t,r=""){let i=document.createElement("div");i.className=`lyric-layer-setting-row ${r}`.trim();let a=document.createElement("div");a.className="lyric-layer-setting-copy";let o=document.createElement("span");o.className="lyric-layer-setting-label",o.textContent=n;let s=document.createElement("span");s.className="lyric-layer-setting-description",s.textContent=e,a.append(o,s);let c=document.createElement("div");return c.className="lyric-layer-setting-control",c.appendChild(t),i.append(a,c),i}var T={upload:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5V19h14v-3.5"/></svg>',edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 5.3 4 4M5 19l3.9-.8L19 7.1 16.9 5 5.8 15.1 5 19Z"/></svg>',download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 19h14"/></svg>',trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>',save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Zm3 0v6h8V4M8 20v-6h8v6"/></svg>'};function H(n){n.style.height="auto",n.style.height=`${Math.max(42,n.scrollHeight)}px`}function $(n,e){if(!e.length)return n;let t=O(e,n);return e.map(r=>({index:r.index,startTime:r.startTime,originalText:r.text,translatedText:t.get(r.index)?.translatedText??""}))}function V(n,e,t){let r=Date.now();return{version:1,trackUri:n.uri,title:n.title,artist:n.artist,lines:e,createdAt:t?.createdAt??r,updatedAt:r}}async function ye(n){return new Promise(e=>{let t=document.createElement("input");t.type="file",t.accept=n,t.hidden=!0,t.addEventListener("change",()=>e(t.files?.[0]),{once:!0}),t.addEventListener("cancel",()=>e(void 0),{once:!0}),t.click()})}function me(n){let e=new Blob([`${JSON.stringify(n,null,2)}
`],{type:"application/json;charset=utf-8"}),t=URL.createObjectURL(e),r=document.createElement("a"),i=n.trackUri.split(":"),a=i[i.length-1]??"track";r.href=t,r.download=`lyric-layer-${a}.json`,r.click(),setTimeout(()=>URL.revokeObjectURL(t),1e3)}var U=class{constructor(e){this.dependencies=e}displayModal(e,t,r=!1){let i=window.customElements?.get("sl-generic-modal");if(i){if(r&&this.modal?.isConnected&&this.modal.transition){this.modal.transition({title:e,content:t,modalId:"lyricLayer"});return}this.modal?.isConnected&&this.modal.hide();let o=new i;this.modal=o,o.display({title:e,content:t,isLarge:!0,modalId:"lyricLayer"});return}let a=window.Spicetify?.PopupModal;if(!a)throw new Error("\u5F39\u7A97\u7EC4\u4EF6\u5C1A\u672A\u5C31\u7EEA");a.display({title:e,content:t,isLarge:!0})}hideModal(){this.modal?.isConnected?this.modal.hide():window.Spicetify?.PopupModal?.hide?.()}async open(e=!1){let t=this.dependencies.getTrack();if(!t?.uri){w("\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684 Spotify Track URI",!0);return}let r=await this.dependencies.store.get(t.uri),i=document.createElement("div");i.className="lyric-layer-panel";let a=document.createElement("div");a.className="lyric-layer-track";let o=document.createElement("img");o.className="lyric-layer-cover",o.alt="",t.coverUrl&&(o.src=t.coverUrl);let s=document.createElement("div");s.className="lyric-layer-track-details";let c=document.createElement("div");c.className="lyric-layer-track-title",c.textContent=t.title;let d=document.createElement("div");d.className="lyric-layer-track-sub",d.textContent=t.artist;let y=document.createElement("div");y.className="lyric-layer-uri",y.textContent=t.uri;let m=document.createElement("span"),P=r?.lines.filter(g=>g.translatedText.trim()).length??0;m.className=`lyric-layer-status${r?" active":""}`,m.textContent=r?`\u5DF2\u542F\u7528 \xB7 ${P} \u884C`:"\u5C1A\u672A\u6DFB\u52A0\u7FFB\u8BD1",s.append(c,d,y),a.append(o,s,m);let C=L("\u9009\u62E9\u6587\u4EF6","secondary",T.upload),A=L("\u9009\u62E9\u6587\u4EF6","secondary",T.upload),M=L("\u9009\u62E9\u6587\u4EF6","secondary",T.upload),R=L(r?"\u7EE7\u7EED\u7F16\u8F91":"\u5F00\u59CB\u7F16\u8F91","primary",T.edit),l=L("\u5BFC\u51FA","secondary",T.download),f=L("\u5220\u9664","danger",T.trash),x=document.createElement("label");x.className="lyric-layer-toggle";let E=document.createElement("input");E.type="checkbox";let N=document.createElement("span");N.className="lyric-layer-toggle-track",x.append(E,N),i.append(a,ne("\u6DFB\u52A0\u7FFB\u8BD1"),k("TXT \u6587\u4EF6","\u6BCF\u4E00\u884C\u5BF9\u5E94\u4E00\u884C\u539F\u6B4C\u8BCD\uFF0C\u9002\u5408\u7EAF\u6587\u672C\u7FFB\u8BD1\u3002",C),k("\u4FDD\u7559 TXT \u7A7A\u884C","\u5F00\u542F\u540E\uFF0C\u7A7A\u767D\u884C\u4E5F\u4F1A\u5360\u7528\u4E00\u4E2A\u6B4C\u8BCD\u4F4D\u7F6E\u3002",x),k("LRC \u6587\u4EF6","\u6839\u636E\u65F6\u95F4\u6233\u81EA\u52A8\u5339\u914D\u539F\u6B4C\u8BCD\u3002",A),k("LyricLayer JSON","\u5BFC\u5165\u4E4B\u524D\u5BFC\u51FA\u7684\u5B8C\u6574\u7FFB\u8BD1\u5907\u4EFD\u3002",M),ne("\u7F16\u8F91\u4E0E\u7BA1\u7406"),k("\u9010\u884C\u7F16\u8F91","\u5BF9\u7167\u5F53\u524D\u539F\u6B4C\u8BCD\u586B\u5199\u6216\u6279\u91CF\u7C98\u8D34\u4E2D\u6587\u7FFB\u8BD1\u3002",R),k("\u5BFC\u51FA\u5907\u4EFD","\u5C06\u5F53\u524D\u6B4C\u66F2\u7FFB\u8BD1\u5BFC\u51FA\u4E3A\u53EF\u518D\u6B21\u5BFC\u5165\u7684 JSON\u3002",l),k("\u5220\u9664\u672C\u5730\u7FFB\u8BD1","\u53EA\u5220\u9664\u5F53\u524D\u6B4C\u66F2\u4FDD\u5B58\u5728\u6B64\u8BBE\u5907\u4E0A\u7684\u7FFB\u8BD1\u3002",f,"danger"));let p=async g=>{try{let b=await ye(g==="txt"?".txt,text/plain":g==="lrc"?".lrc,text/plain":".json,application/json");if(!b)return;let v=await b.text(),I=await this.dependencies.getLyrics();if(g==="json"){let u=re(v),h=t;if(u.trackUri&&u.trackUri!==t.uri){if(!window.confirm(`JSON \u5C5E\u4E8E ${u.trackUri}\uFF0C\u662F\u5426\u6309\u8BE5 URI \u5BFC\u5165\uFF1F`))return;h={...t,uri:u.trackUri}}let ie=await this.dependencies.store.get(h.uri),G=u.entry?{...u.entry,trackUri:h.uri,updatedAt:Date.now()}:V(h,h.uri===t.uri?$(u.lines,I):u.lines,ie);await this.dependencies.store.save(G),await this.dependencies.onEntryChanged(h.uri),w(`\u5DF2\u5BFC\u5165 ${G.lines.length} \u884C JSON \u7FFB\u8BD1`)}else{let u=g==="txt"?ee(v,E.checked):te(v),h=V(t,$(u,I),r);await this.dependencies.store.save(h),await this.dependencies.onEntryChanged(t.uri),w(`\u5DF2\u5BFC\u5165 ${u.length} \u884C ${g.toUpperCase()} \u7FFB\u8BD1`)}this.hideModal()}catch(b){w(b instanceof Error?b.message:"\u5BFC\u5165\u5931\u8D25",!0)}};C.addEventListener("click",()=>void p("txt")),A.addEventListener("click",()=>void p("lrc")),M.addEventListener("click",()=>void p("json")),R.addEventListener("click",()=>void this.openEditor(t)),l.disabled=!r,l.addEventListener("click",()=>{r&&me(r)}),f.disabled=!r,f.addEventListener("click",async()=>{!r||!window.confirm("\u786E\u5B9A\u5220\u9664\u5F53\u524D\u6B4C\u66F2\u7684\u672C\u5730\u7FFB\u8BD1\u5417\uFF1F")||(await this.dependencies.store.delete(t.uri),await this.dependencies.onEntryChanged(t.uri),this.hideModal(),w("\u5DF2\u5220\u9664\u5F53\u524D\u6B4C\u66F2\u7684\u7FFB\u8BD1"))}),this.displayModal("\u81EA\u5B9A\u4E49\u7FFB\u8BD1",i,e)}async openEditor(e){let[t,r]=await Promise.all([this.dependencies.getLyrics(),this.dependencies.store.get(e.uri)]),i=t.length?$(r?.lines??[],t):(r?.lines??[]).map((l,f)=>({...l,index:l.index??f}));if(!i.length){w("\u8FD8\u6CA1\u6709\u53D6\u5F97\u539F\u6B4C\u8BCD\u3002\u8BF7\u5148\u6253\u5F00 Spicy Lyrics \u6B4C\u8BCD\u9875\uFF0C\u518D\u91CD\u8BD5\u3002",!0);return}let a=document.createElement("div");a.className="lyric-layer-panel lyric-layer-editor";let o=document.createElement("div");o.className="lyric-layer-editor-toolbar";let s=L("\u8FD4\u56DE","quiet",T.back);s.addEventListener("click",()=>void this.open(!0));let c=document.createElement("span");c.className="lyric-layer-editor-progress";let d=()=>{c.textContent=`\u5DF2\u586B\u5199 ${m.filter(l=>l.value.trim()).length} / ${i.length} \u884C`};o.append(s,c),a.appendChild(o);let y=document.createElement("div");y.className="lyric-layer-editor-head",y.innerHTML="<span>#</span><span>\u539F\u6B4C\u8BCD\uFF08\u53EA\u8BFB\uFF09</span><span>\u4E2D\u6587\u7FFB\u8BD1</span>",a.appendChild(y);let m=[];i.forEach((l,f)=>{let x=document.createElement("div");x.className="lyric-layer-editor-row";let E=document.createElement("div");E.className="lyric-layer-editor-index",E.textContent=String(f+1);let N=document.createElement("div");N.className="lyric-layer-original",N.textContent=l.originalText??t[f]?.text??"\u2014";let p=document.createElement("textarea");p.className="lyric-layer-input",p.rows=1,p.value=l.translatedText,p.placeholder="\u8F93\u5165\u4E2D\u6587\u7FFB\u8BD1",p.addEventListener("input",()=>{H(p),d()}),p.addEventListener("paste",g=>{let b=g.clipboardData?.getData("text/plain")??"";if(!/[\r\n]/.test(b))return;g.preventDefault();let v=b.replace(/\r\n?/g,`
`).split(`
`);v[v.length-1]===""&&(v=v.slice(0,-1)),v.forEach((I,u)=>{let h=m[f+u];h&&(h.value=I,H(h))}),d()}),m.push(p),x.append(E,N,p),a.appendChild(x)});let P=document.createElement("div");P.className="lyric-layer-editor-footer";let C=document.createElement("span");C.className="lyric-layer-hint",C.textContent="\u652F\u6301\u7C98\u8D34\u591A\u884C \xB7 Ctrl/Cmd + S \u4FDD\u5B58";let A=L("\u4FDD\u5B58\u7FFB\u8BD1","primary",T.save);P.append(C,A),a.appendChild(P),m.forEach(H),d();let M=!1,R=async()=>{if(!M){M=!0;try{let l=i.map((f,x)=>({...f,translatedText:m[x]?.value.trim()??""}));await this.dependencies.store.save(V(e,l,r)),await this.dependencies.onEntryChanged(e.uri),this.hideModal(),w("\u7FFB\u8BD1\u5DF2\u4FDD\u5B58\u5E76\u5237\u65B0")}catch(l){M=!1,w(l instanceof Error?l.message:"\u4FDD\u5B58\u5931\u8D25",!0)}}};A.addEventListener("click",()=>void R()),a.addEventListener("keydown",l=>{(l.ctrlKey||l.metaKey)&&l.key.toLowerCase()==="s"&&(l.preventDefault(),R())}),this.displayModal(`\u7F16\u8F91\u7FFB\u8BD1 \xB7 ${e.title}`,a,!0)}};var he='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M4 6h12M4 10h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 15h5m-5 4h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".68"/><path d="M18 13v7m-3.5-3.5h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';function S(){let n=window.Spicetify?.Player?.data?.item,e=n?.uri;if(!n||!e?.startsWith("spotify:track:"))return;let t=n.metadata??{},r=n.artists?.map(i=>i.name).filter(Boolean).join(", ");return{uri:e,title:n.name??t.title??"\u672A\u77E5\u6B4C\u66F2",artist:r||t.artist_name||"\u672A\u77E5\u827A\u4EBA",coverUrl:n.album?.images?.[0]?.url??t.image_xlarge_url??t.image_url}}async function fe(){for(;!window.Spicetify?.Player||!window.Spicetify.PopupModal||!document.body;)await new Promise(n=>setTimeout(n,100))}var J=class{constructor(){this.store=new j;this.renderer=new B;this.ui=new U({store:this.store,getTrack:S,getLyrics:()=>this.ensureLyrics(!0),onEntryChanged:e=>this.reloadEntry(e)});this.lyrics=[];this.sourceResolved=!1;this.loadGeneration=0;this.interfaceScheduled=!1;this.songChange=()=>void this.loadCurrentTrack()}async start(){Y(),this.renderer.start(()=>{this.insertButtons(),this.sourceResolved||this.ensureLyrics(!1)}),window.Spicetify?.Player?.addEventListener?.("songchange",this.songChange),await this.loadCurrentTrack(),this.insertButtons()}async loadCurrentTrack(){let e=++this.loadGeneration;this.entry=void 0,this.lyrics=[],this.sourceResolved=!1,this.sourceLoad=void 0,this.renderer.clear();let t=S();if(!t)return;let r=await this.store.get(t.uri);if(e!==this.loadGeneration||S()?.uri!==t.uri)return;this.entry=r;let i=await _(t.uri);e!==this.loadGeneration||S()?.uri!==t.uri||(this.sourceResolved=i.length>0,this.lyrics=i.length?i:this.linesFromEntry(r),this.render())}linesFromEntry(e){return(e?.lines??[]).filter(t=>t.originalText).map((t,r)=>({index:t.index??r,text:t.originalText??"",startTime:t.startTime}))}async ensureLyrics(e){let t=S();if(!t)return[];if(this.sourceResolved)return this.lyrics;if(this.sourceLoad)return this.sourceLoad;let r=this.loadGeneration;return this.sourceLoad=(async()=>{let i=await _(t.uri);if(r!==this.loadGeneration||S()?.uri!==t.uri)return[];let a=e?X():[],o=i.length?i:this.lyrics.length?this.lyrics:a;return o.length&&(i.length||!this.lyrics.length)&&(this.sourceResolved=i.length>0,this.lyrics=o,this.render()),o})().finally(()=>{this.sourceLoad=void 0}),this.sourceLoad}render(){let e=this.entry?O(this.lyrics,this.entry.lines):new Map;this.renderer.update(this.lyrics,e)}async reloadEntry(e){S()?.uri===e&&(this.entry=await this.store.get(e),this.lyrics.length||(this.lyrics=this.linesFromEntry(this.entry)),this.render())}insertButtons(){this.interfaceScheduled||(this.interfaceScheduled=!0,queueMicrotask(()=>{this.interfaceScheduled=!1,document.querySelectorAll("#SpicyLyricsPage .ViewControls, #SpicyLyricsNPVCard .CardControls").forEach(t=>{if(t.querySelector("[data-lyric-layer-button]"))return;let r=document.createElement("button");r.className=t.classList.contains("CardControls")?"ViewControl CardControl lyric-layer-control":"ViewControl lyric-layer-control",r.dataset.lyricLayerButton="true",r.title="\u81EA\u5B9A\u4E49\u7FFB\u8BD1",r.setAttribute("aria-label","\u81EA\u5B9A\u4E49\u7FFB\u8BD1"),r.innerHTML=he,r.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),this.ui.open()});try{window.Spicetify?.Tippy?.(r,{...window.Spicetify.TippyProps??{},content:"\u81EA\u5B9A\u4E49\u7FFB\u8BD1"})}catch{}let i=t.querySelector("#RomanizationToggle");i?i.insertAdjacentElement("afterend",r):t.appendChild(r)})}))}};(async()=>{await fe();let n=new J;await n.start(),window.LyricLayer=n})().catch(n=>{console.error("LyricLayer failed to initialize",n),window.Spicetify?.showNotification?.("LyricLayer \u521D\u59CB\u5316\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63A7\u5236\u53F0",!0)});})();
