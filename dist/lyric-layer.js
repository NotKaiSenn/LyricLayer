/* LyricLayer v0.1.0 — local translations for Spicy Lyrics */
"use strict";(()=>{function I(i){return i.normalize("NFKC").toLocaleLowerCase().replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/[\s\p{P}\p{S}]+/gu,"")}function F(i,e,t=1e3){let r=new Map,n=new Set,a=[];i.forEach((o,s)=>{let c=o.startTime;c!==void 0&&e.forEach((p,y)=>{if(p.startTime===void 0)return;let u=Math.abs(c-p.startTime);u<=t&&a.push({lyric:s,translation:y,difference:u})})}),a.sort((o,s)=>o.difference-s.difference);for(let o of a){let s=i[o.lyric]?.index;s===void 0||r.has(s)||n.has(o.translation)||(r.set(s,e[o.translation]),n.add(o.translation))}return e.forEach((o,s)=>{if(n.has(s)||o.index===void 0)return;let c=i.find(p=>p.index===o.index);!c||r.has(c.index)||(r.set(c.index,o),n.add(s))}),e.forEach((o,s)=>{if(n.has(s)||!o.originalText)return;let c=I(o.originalText);if(!c)return;let p=i.find(y=>!r.has(y.index)&&I(y.text)===c);p&&(r.set(p.index,o),n.add(s))}),r}var ce=["SpicyLyrics_LyricsStore_g1","SpicyLyrics_LyricsStore"],Z=/[\u200B-\u200D\u2060\uFEFF]/g;function q(i){if(!i||typeof i!="object")return!1;let e=i;return Array.isArray(e.Lines)||Array.isArray(e.Content)}function le(i){if(q(i))return i;if(!i||typeof i!="object")return;let e=i;if(e.Value!=="NO_LYRICS"&&!(typeof e.ExpiresAt=="number"&&e.ExpiresAt<Date.now())){if(q(e.Content))return e.Content;if(q(e.Value))return e.Value}}function X(i){return typeof i=="number"&&Number.isFinite(i)?Math.round(i*1e3):void 0}function de(i){let e="";return i.forEach((t,r)=>{let n=i[r-1];n&&!n.IsPartOfWord&&(e+=" "),e+=(t.Text??"").replace(Z,"")}),e.trim()}function pe(i){if(i.Type==="Static"||i.Lines&&!i.Content)return(i.Lines??[]).map((t,r)=>({index:r,text:(t.Text??"").trim()}));let e=[];for(let t of i.Content??[]){if(t.Type==="Instrumental")continue;let r=t.Lead?.Syllables,n=r?.length?de(r):String(t.Text??t.Lead?.Text??"").replace(Z,"").trim();n&&e.push({index:e.length,text:n,startTime:X(t.Lead?.StartTime??t.StartTime),endTime:X(t.Lead?.EndTime??t.EndTime)})}return e}async function O(i){let e=i.split(":"),t=e[e.length-1];if(!t||typeof caches>"u")return[];try{for(let r of ce){if(typeof caches.has=="function"&&!await caches.has(r))continue;let a=await(await caches.open(r)).match(`/${t}`);if(!a)continue;let o=le(await a.clone().json());if(o)return pe(o)}}catch(r){console.warn("LyricLayer: cannot read Spicy Lyrics cache",r)}return[]}function H(i){let e=i.cloneNode(!0);e.querySelectorAll("[data-lyric-layer-translation], .slt-interleaved-translation, .slt-romanization-line, .slt-original-line, .slt-replace-line").forEach(r=>r.remove());let t=e.querySelectorAll(".word:not(.dot), .letterGroup");return t.length?Array.from(t).map(r=>r.textContent?.trim()??"").filter(Boolean).join(" ").replace(/\s+/g," ").trim():e.textContent?.replace(/\s+/g," ").trim()??""}function Y(i=document){let e=new Set,t=[];return i.querySelectorAll("#SpicyLyricsPage .SpicyLyricsScrollContainer .line:not(.musical-line):not(.bg-line)").forEach(n=>{let a=H(n),o=Number(n.parentElement?.dataset.index),s=`${Number.isFinite(o)?o:"?"}\0${a}`;!a||e.has(s)||(e.add(s),t.push({index:t.length,text:a}))}),t}var ue=".line:not(.musical-line):not(.bg-line)",Q="[data-lyric-layer-translation]",$=class{constructor(){this.roots=new Map;this.scheduled=!1;this.lyricLines=[];this.translations=new Map}start(e){this.onLyricsUiChanged=e,this.discoverRoots(),this.pageObserver=new MutationObserver(()=>this.schedule()),this.pageObserver.observe(document.body,{childList:!0,subtree:!0})}stop(){this.pageObserver?.disconnect(),this.roots.forEach(e=>e.disconnect()),this.roots.clear(),this.clearDom()}update(e,t){this.lyricLines=e,this.translations=t,this.clearDom(),this.schedule()}clear(){this.lyricLines=[],this.translations=new Map,this.clearDom()}refresh(){this.schedule()}schedule(){this.scheduled||(this.scheduled=!0,requestAnimationFrame(()=>{this.scheduled=!1;let e=this.discoverRoots();this.renderMountedLines(),(e||this.roots.size>0)&&this.onLyricsUiChanged?.()}))}discoverRoots(){let e=!1,t=new Set(document.querySelectorAll("#SpicyLyricsPage .SpicyLyricsScrollContainer"));for(let[r,n]of this.roots)r.isConnected&&t.has(r)||(n.disconnect(),this.roots.delete(r));return t.forEach(r=>{if(this.roots.has(r))return;let n=new MutationObserver(()=>this.schedule());n.observe(r,{childList:!0,subtree:!0}),this.roots.set(r,n),e=!0}),e}resolveLineIndex(e){let t=I(H(e));if(!t)return;let r=this.lyricLines.filter(o=>I(o.text)===t),n=r[0];if(!n)return;if(r.length===1)return n.index;let a=Number(e.parentElement?.dataset.index);return Number.isFinite(a)?r.reduce((o,s)=>Math.abs(s.index-a)<Math.abs(o.index-a)?s:o,n).index:n.index}renderMountedLines(){this.roots.forEach((e,t)=>{t.querySelectorAll(ue).forEach(r=>{let n=this.resolveLineIndex(r),a=n===void 0?void 0:this.translations.get(n),o=r.querySelector(`:scope > ${Q}`);if(!a?.translatedText.trim()){o?.remove();return}let s=o??document.createElement("div");s.className="lyric-layer-translation",s.dataset.lyricLayerTranslation="true",s.dataset.lineIndex=String(n),s.textContent!==a.translatedText&&(s.textContent=a.translatedText),o||r.appendChild(s)})})}clearDom(){document.querySelectorAll(Q).forEach(e=>e.remove())}};var ye="lyric-layer",j="translations";var _=class{open(){return this.dbPromise?this.dbPromise:(this.dbPromise=new Promise((e,t)=>{let r=indexedDB.open(ye,1);r.onupgradeneeded=()=>{let n=r.result;n.objectStoreNames.contains(j)||n.createObjectStore(j,{keyPath:"trackUri"})},r.onsuccess=()=>e(r.result),r.onerror=()=>t(r.error??new Error("\u65E0\u6CD5\u6253\u5F00\u7FFB\u8BD1\u6570\u636E\u5E93"))}),this.dbPromise)}async request(e,t){let r=await this.open();return new Promise((n,a)=>{let o=r.transaction(j,e),s=t(o.objectStore(j));s.onsuccess=()=>n(s.result),s.onerror=()=>a(s.error??new Error("\u6570\u636E\u5E93\u64CD\u4F5C\u5931\u8D25")),o.onabort=()=>a(o.error??new Error("\u6570\u636E\u5E93\u4E8B\u52A1\u5DF2\u4E2D\u6B62"))})}get(e){return this.request("readonly",t=>t.get(e))}async save(e){await this.request("readwrite",t=>t.put(e))}async delete(e){await this.request("readwrite",t=>t.delete(e))}getAll(){return this.request("readonly",e=>e.getAll())}};var me=`
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
  .lyric-layer-input { grid-column: 2; }
}
`;function ee(){if(document.getElementById("lyric-layer-styles"))return;let i=document.createElement("style");i.id="lyric-layer-styles",i.textContent=me,document.head.appendChild(i)}function te(i,e){let t=e==="translation"||e==="translation-timed",r=e==="original-timed"||e==="translation-timed",n=[];for(let[a,o]of i.entries()){let s=he(t?o.translatedText:o.originalText);if(s)if(r){if(typeof o.startTime!="number"||!Number.isFinite(o.startTime)||o.startTime<0)throw new Error(`\u7B2C ${a+1} \u884C\u6B4C\u8BCD\u7F3A\u5C11\u6709\u6548\u65F6\u95F4\u6233\uFF0C\u8BF7\u4F7F\u7528\u4E0D\u5E26\u65F6\u95F4\u6233\u7684\u5BFC\u51FA\u65B9\u5F0F\u3002`);n.push(`${ge(o.startTime)}${s}`)}else n.push(s)}if(!n.length)throw new Error(t?"\u6682\u65E0\u53EF\u5BFC\u51FA\u7684\u7FFB\u8BD1\uFF0C\u8BF7\u5148\u6DFB\u52A0\u5E76\u4FDD\u5B58\u7FFB\u8BD1\u3002":"\u6682\u65E0\u53EF\u5BFC\u51FA\u7684\u539F\u6587\u6B4C\u8BCD\uFF0C\u8BF7\u5148\u6253\u5F00 Spicy Lyrics \u5E76\u7B49\u5F85\u6B4C\u8BCD\u52A0\u8F7D\u3002");return{text:n.join(`
`),extension:r?"lrc":"txt",lineCount:n.length}}function he(i){return(i??"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s*[\r\n\u2028\u2029]+\s*/g," ").trim()}function ge(i){let e=Math.round(i),t=Math.floor(e/6e4),r=Math.floor(e%6e4/1e3),n=e%1e3;return`[${String(t).padStart(2,"0")}:${String(r).padStart(2,"0")}.${String(n).padStart(3,"0")}]`}function ie(i,e=!1){let r=i.replace(/^\uFEFF/,"").replace(/\r\n?/g,`
`).split(`
`);return r[r.length-1]===""&&(r=r.slice(0,-1)),e||(r=r.filter(n=>n.trim().length>0)),r.map((n,a)=>({index:a,translatedText:n.trim()}))}function fe(i,e,t){let r=Number(i)*6e4+Number(e)*1e3;return t?r+Number(t.padEnd(3,"0").slice(0,3)):r}function ne(i){let e=[],t=/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;for(let r of i.replace(/^\uFEFF/,"").split(/\r?\n/)){let n=[...r.matchAll(t)];if(!n.length)continue;let a=r.replace(t,"").trim();if(a)for(let o of n)e.push({startTime:fe(o[1]??"0",o[2]??"0",o[3]),translatedText:a})}return e.sort((r,n)=>(r.startTime??0)-(n.startTime??0))}function re(i){return typeof i=="object"&&i!==null&&!Array.isArray(i)}function ae(i){let e=JSON.parse(i.replace(/^\uFEFF/,""));if(!re(e)||!Array.isArray(e.lines))throw new Error("JSON \u5FC5\u987B\u5305\u542B lines \u6570\u7EC4");let t=e.lines.map((a,o)=>{if(!re(a)||typeof a.translatedText!="string")throw new Error(`JSON \u7B2C ${o+1} \u884C\u7F3A\u5C11 translatedText`);let s={translatedText:a.translatedText};return typeof a.index=="number"&&Number.isInteger(a.index)&&a.index>=0&&(s.index=a.index),typeof a.startTime=="number"&&Number.isFinite(a.startTime)&&(s.startTime=a.startTime),typeof a.originalText=="string"&&(s.originalText=a.originalText),s}),r=typeof e.trackUri=="string"?e.trackUri:void 0,n=e.version===1&&r&&typeof e.createdAt=="number"&&typeof e.updatedAt=="number";return{trackUri:r,lines:t,entry:n?e:void 0}}function w(i,e=!1){window.Spicetify?.showNotification?window.Spicetify.showNotification(i,e,4e3):console[e?"error":"info"](`LyricLayer: ${i}`)}function L(i,e="",t=""){let r=document.createElement("button");if(r.type="button",r.className=`lyric-layer-button ${e}`.trim(),t){let a=document.createElement("span");a.className="lyric-layer-button-icon",a.innerHTML=t,r.appendChild(a)}let n=document.createElement("span");return n.textContent=i,r.appendChild(n),r}function U(i){let e=document.createElement("p");return e.className="lyric-layer-section-title",e.textContent=i,e}function S(i,e,t,r=""){let n=document.createElement("div");n.className=`lyric-layer-setting-row ${r}`.trim();let a=document.createElement("div");a.className="lyric-layer-setting-copy";let o=document.createElement("span");o.className="lyric-layer-setting-label",o.textContent=i;let s=document.createElement("span");s.className="lyric-layer-setting-description",s.textContent=e,a.append(o,s);let c=document.createElement("div");return c.className="lyric-layer-setting-control",c.appendChild(t),n.append(a,c),n}var T={upload:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5V19h14v-3.5"/></svg>',edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 5.3 4 4M5 19l3.9-.8L19 7.1 16.9 5 5.8 15.1 5 19Z"/></svg>',download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 19h14"/></svg>',trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>',save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Zm3 0v6h8V4M8 20v-6h8v6"/></svg>'};function V(i){i.style.height="auto",i.style.height=`${Math.max(42,i.scrollHeight)}px`}function J(i,e){if(!e.length)return i;let t=F(e,i);return e.map(r=>({index:r.index,startTime:r.startTime,originalText:r.text,translatedText:t.get(r.index)?.translatedText??""}))}function W(i,e,t){let r=Date.now();return{version:1,trackUri:i.uri,title:i.title,artist:i.artist,lines:e,createdAt:t?.createdAt??r,updatedAt:r}}async function xe(i){return new Promise(e=>{let t=document.createElement("input");t.type="file",t.accept=i,t.hidden=!0,t.addEventListener("change",()=>e(t.files?.[0]),{once:!0}),t.addEventListener("cancel",()=>e(void 0),{once:!0}),t.click()})}function ve(i){let e=i.trackUri.split(":"),t=e[e.length-1]??"track";oe(`${JSON.stringify(i,null,2)}
`,`lyric-layer-${t}.json`,"application/json")}function oe(i,e,t="text/plain"){let r=new Blob([i],{type:`${t};charset=utf-8`}),n=URL.createObjectURL(r),a=document.createElement("a");a.href=n,a.download=e,a.click(),setTimeout(()=>URL.revokeObjectURL(n),1e3)}function be(i,e,t){return`${Array.from(`${i.artist} - ${i.title}`.replace(/[<>:"/\\|?*\u0000-\u001F]/g,"_").trim()).slice(0,60).join("").replace(/[. ]+$/,"")||"lyrics"} - ${e.startsWith("translation")?"\u7FFB\u8BD1":"\u539F\u6587"}.${t}`}var D=class{constructor(e){this.dependencies=e}displayModal(e,t,r=!1){let n=window.customElements?.get("sl-generic-modal");if(n){if(r&&this.modal?.isConnected&&this.modal.transition){this.modal.transition({title:e,content:t,modalId:"lyricLayer"});return}this.modal?.isConnected&&this.modal.hide();let o=new n;this.modal=o,o.display({title:e,content:t,isLarge:!0,modalId:"lyricLayer"});return}let a=window.Spicetify?.PopupModal;if(!a)throw new Error("\u5F39\u7A97\u7EC4\u4EF6\u5C1A\u672A\u5C31\u7EEA");a.display({title:e,content:t,isLarge:!0})}hideModal(){this.modal?.isConnected?this.modal.hide():window.Spicetify?.PopupModal?.hide?.()}async open(e=!1){let t=this.dependencies.getTrack();if(!t?.uri){w("\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684 Spotify Track URI",!0);return}let r=await this.dependencies.store.get(t.uri),n=document.createElement("div");n.className="lyric-layer-panel";let a=document.createElement("div");a.className="lyric-layer-track";let o=document.createElement("img");o.className="lyric-layer-cover",o.alt="",t.coverUrl&&(o.src=t.coverUrl);let s=document.createElement("div");s.className="lyric-layer-track-details";let c=document.createElement("div");c.className="lyric-layer-track-title",c.textContent=t.title;let p=document.createElement("div");p.className="lyric-layer-track-sub",p.textContent=t.artist;let y=document.createElement("div");y.className="lyric-layer-uri",y.textContent=t.uri;let u=document.createElement("span"),M=r?.lines.filter(h=>h.translatedText.trim()).length??0;u.className=`lyric-layer-status${r?" active":""}`,u.textContent=r?`\u5DF2\u542F\u7528 \xB7 ${M} \u884C`:"\u5C1A\u672A\u6DFB\u52A0\u7FFB\u8BD1",s.append(c,p,y),a.append(o,s,u);let d=L("\u9009\u62E9\u6587\u4EF6","secondary",T.upload),g=L("\u9009\u62E9\u6587\u4EF6","secondary",T.upload),E=L("\u9009\u62E9\u6587\u4EF6","secondary",T.upload),f=L(r?"\u7EE7\u7EED\u7F16\u8F91":"\u5F00\u59CB\u7F16\u8F91","primary",T.edit),l=L("\u9009\u62E9\u683C\u5F0F","secondary",T.download),v=L("\u5BFC\u51FA","secondary",T.download),k=L("\u5220\u9664","danger",T.trash),N=document.createElement("label");N.className="lyric-layer-toggle";let P=document.createElement("input");P.type="checkbox";let x=document.createElement("span");x.className="lyric-layer-toggle-track",N.append(P,x),n.append(a,U("\u6DFB\u52A0\u7FFB\u8BD1"),S("TXT \u6587\u4EF6","\u6BCF\u4E00\u884C\u5BF9\u5E94\u4E00\u884C\u539F\u6B4C\u8BCD\uFF0C\u9002\u5408\u7EAF\u6587\u672C\u7FFB\u8BD1\u3002",d),S("\u4FDD\u7559 TXT \u7A7A\u884C","\u5F00\u542F\u540E\uFF0C\u7A7A\u767D\u884C\u4E5F\u4F1A\u5360\u7528\u4E00\u4E2A\u6B4C\u8BCD\u4F4D\u7F6E\u3002",N),S("LRC \u6587\u4EF6","\u6839\u636E\u65F6\u95F4\u6233\u81EA\u52A8\u5339\u914D\u539F\u6B4C\u8BCD\u3002",g),S("LyricLayer JSON","\u5BFC\u5165\u4E4B\u524D\u5BFC\u51FA\u7684\u5B8C\u6574\u7FFB\u8BD1\u5907\u4EFD\u3002",E),U("\u7F16\u8F91\u4E0E\u7BA1\u7406"),S("\u9010\u884C\u7F16\u8F91","\u5BF9\u7167\u5F53\u524D\u539F\u6B4C\u8BCD\u586B\u5199\u6216\u6279\u91CF\u7C98\u8D34\u4E2D\u6587\u7FFB\u8BD1\u3002",f),S("\u5BFC\u51FA\u6B4C\u8BCD","\u5BFC\u51FA\u539F\u6587\u6216\u7FFB\u8BD1\uFF0C\u7528\u4E8E\u5236\u4F5C\u7FFB\u8BD1\u548C\u6B4C\u8BCD\u6295\u7A3F\u3002",l),S("\u5BFC\u51FA\u5907\u4EFD","\u5C06\u5F53\u524D\u6B4C\u66F2\u7FFB\u8BD1\u5BFC\u51FA\u4E3A\u53EF\u518D\u6B21\u5BFC\u5165\u7684 JSON\u3002",v),S("\u5220\u9664\u672C\u5730\u7FFB\u8BD1","\u53EA\u5220\u9664\u5F53\u524D\u6B4C\u66F2\u4FDD\u5B58\u5728\u6B64\u8BBE\u5907\u4E0A\u7684\u7FFB\u8BD1\u3002",k,"danger"));let R=async h=>{try{let b=await xe(h==="txt"?".txt,text/plain":h==="lrc"?".lrc,text/plain":".json,application/json");if(!b)return;let z=await b.text(),B=await this.dependencies.getLyrics();if(h==="json"){let m=ae(z),C=t;if(m.trackUri&&m.trackUri!==t.uri){if(!window.confirm(`JSON \u5C5E\u4E8E ${m.trackUri}\uFF0C\u662F\u5426\u6309\u8BE5 URI \u5BFC\u5165\uFF1F`))return;C={...t,uri:m.trackUri}}let se=await this.dependencies.store.get(C.uri),K=m.entry?{...m.entry,trackUri:C.uri,updatedAt:Date.now()}:W(C,C.uri===t.uri?J(m.lines,B):m.lines,se);await this.dependencies.store.save(K),await this.dependencies.onEntryChanged(C.uri),w(`\u5DF2\u5BFC\u5165 ${K.lines.length} \u884C JSON \u7FFB\u8BD1`)}else{let m=h==="txt"?ie(z,P.checked):ne(z),C=W(t,J(m,B),r);await this.dependencies.store.save(C),await this.dependencies.onEntryChanged(t.uri),w(`\u5DF2\u5BFC\u5165 ${m.length} \u884C ${h.toUpperCase()} \u7FFB\u8BD1`)}this.hideModal()}catch(b){w(b instanceof Error?b.message:"\u5BFC\u5165\u5931\u8D25",!0)}};d.addEventListener("click",()=>void R("txt")),g.addEventListener("click",()=>void R("lrc")),E.addEventListener("click",()=>void R("json")),f.addEventListener("click",()=>void this.openEditor(t)),l.addEventListener("click",async()=>{l.disabled=!0;try{await this.openLyricsExport(t)}catch(h){w(h instanceof Error?h.message:"\u8BFB\u53D6\u6B4C\u8BCD\u5931\u8D25",!0)}finally{l.disabled=!1}}),v.disabled=!r,v.addEventListener("click",()=>{r&&ve(r)}),k.disabled=!r,k.addEventListener("click",async()=>{!r||!window.confirm("\u786E\u5B9A\u5220\u9664\u5F53\u524D\u6B4C\u66F2\u7684\u672C\u5730\u7FFB\u8BD1\u5417\uFF1F")||(await this.dependencies.store.delete(t.uri),await this.dependencies.onEntryChanged(t.uri),this.hideModal(),w("\u5DF2\u5220\u9664\u5F53\u524D\u6B4C\u66F2\u7684\u7FFB\u8BD1"))}),this.displayModal("\u81EA\u5B9A\u4E49\u7FFB\u8BD1",n,e)}async openLyricsExport(e){let[t,r]=await Promise.all([this.dependencies.getExportLyrics(e.uri),this.dependencies.store.get(e.uri)]),n=r?.lines??[],a=t.length?t.map(d=>({originalText:d.text,startTime:d.startTime,translatedText:""})):n,o=F(t,n),s=n.map(d=>({...d,startTime:t.find(g=>o.get(g.index)===d)?.startTime??d.startTime})),c=document.createElement("div");c.className="lyric-layer-panel";let p=document.createElement("div");p.className="lyric-layer-editor-toolbar";let y=L("\u8FD4\u56DE","quiet",T.back);y.addEventListener("click",()=>void this.open(!0)),p.appendChild(y);let u=document.createElement("p");u.className="lyric-layer-export-description",u.textContent=t.length?"\u5BFC\u51FA Spicy Lyrics \u7684\u4E3B\u6B4C\u8BCD\uFF1B\u7FFB\u8BD1\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684\u5185\u5BB9\u3002":r?.lines.length?"\u5F53\u524D\u539F\u6B4C\u8BCD\u6682\u4E0D\u53EF\u7528\uFF0C\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684\u6B4C\u8BCD\u5185\u5BB9\u5BFC\u51FA\u3002":"\u8FD8\u6CA1\u6709\u53D6\u5F97\u539F\u6B4C\u8BCD\uFF0C\u8BF7\u5148\u6253\u5F00 Spicy Lyrics \u6B4C\u8BCD\u9875\uFF0C\u7B49\u5F85\u52A0\u8F7D\u5B8C\u6210\u540E\u91CD\u8BD5\u3002",c.append(p,u);let M=[{mode:"original",label:"\u4EC5\u539F\u6587",description:"\u7EAF\u6587\u672C\uFF0C\u6BCF\u884C\u4E00\u53E5\uFF0C\u65B9\u4FBF\u5BF9\u7167\u539F\u6587\u5236\u4F5C\u7FFB\u8BD1\u3002"},{mode:"original-timed",label:"\u539F\u6587\u5E26\u65F6\u95F4\u6233",description:"\u4FDD\u7559\u539F\u6B4C\u8BCD\u65F6\u95F4\u8F74\uFF0C\u683C\u5F0F\u4E3A [00:30.660]\u539F\u6587\u3002"},{mode:"translation",label:"\u4EC5\u7FFB\u8BD1",description:"\u7EAF\u6587\u672C\uFF0C\u53EA\u5305\u542B\u5DF2\u586B\u5199\u7684\u8BD1\u6587\uFF0C\u8DF3\u8FC7\u672A\u7FFB\u8BD1\u884C\u3002"},{mode:"translation-timed",label:"\u7FFB\u8BD1\u5E26\u65F6\u95F4\u6233",description:"\u8BD1\u6587\u6CBF\u7528\u5BF9\u5E94\u539F\u6B4C\u8BCD\u7684\u65F6\u95F4\u6233\uFF0C\u8DF3\u8FC7\u672A\u7FFB\u8BD1\u884C\u3002"}];for(let d of M){d.mode==="original"&&c.appendChild(U("\u539F\u6587")),d.mode==="translation"&&c.appendChild(U("\u7FFB\u8BD1"));let g=L(d.mode.endsWith("-timed")?"\u5BFC\u51FA LRC":"\u5BFC\u51FA TXT","secondary",T.download);g.setAttribute("aria-label",`\u5BFC\u51FA${d.label}`);let E=d.description;try{let f=te(d.mode.startsWith("translation")?s:a,d.mode);g.addEventListener("click",()=>{try{oe(f.text,be(e,d.mode,f.extension)),w(`\u5DF2\u5BFC\u51FA ${f.lineCount} \u884C${d.label}`)}catch(l){w(l instanceof Error?l.message:"\u5BFC\u51FA\u5931\u8D25",!0)}})}catch(f){g.disabled=!0,E=f instanceof Error?f.message:"\u5F53\u524D\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u6B4C\u8BCD"}c.appendChild(S(d.label,E,g))}this.displayModal(`\u5BFC\u51FA\u6B4C\u8BCD \xB7 ${e.title}`,c,!0)}async openEditor(e){let[t,r]=await Promise.all([this.dependencies.getLyrics(),this.dependencies.store.get(e.uri)]),n=t.length?J(r?.lines??[],t):(r?.lines??[]).map((l,v)=>({...l,index:l.index??v}));if(!n.length){w("\u8FD8\u6CA1\u6709\u53D6\u5F97\u539F\u6B4C\u8BCD\u3002\u8BF7\u5148\u6253\u5F00 Spicy Lyrics \u6B4C\u8BCD\u9875\uFF0C\u518D\u91CD\u8BD5\u3002",!0);return}let a=document.createElement("div");a.className="lyric-layer-panel lyric-layer-editor";let o=document.createElement("div");o.className="lyric-layer-editor-toolbar";let s=L("\u8FD4\u56DE","quiet",T.back);s.addEventListener("click",()=>void this.open(!0));let c=document.createElement("span");c.className="lyric-layer-editor-progress";let p=()=>{c.textContent=`\u5DF2\u586B\u5199 ${u.filter(l=>l.value.trim()).length} / ${n.length} \u884C`};o.append(s,c),a.appendChild(o);let y=document.createElement("div");y.className="lyric-layer-editor-head",y.innerHTML="<span>#</span><span>\u539F\u6B4C\u8BCD\uFF08\u53EA\u8BFB\uFF09</span><span>\u4E2D\u6587\u7FFB\u8BD1</span>",a.appendChild(y);let u=[];n.forEach((l,v)=>{let k=document.createElement("div");k.className="lyric-layer-editor-row";let N=document.createElement("div");N.className="lyric-layer-editor-index",N.textContent=String(v+1);let P=document.createElement("div");P.className="lyric-layer-original",P.textContent=l.originalText??t[v]?.text??"\u2014";let x=document.createElement("textarea");x.className="lyric-layer-input",x.rows=1,x.value=l.translatedText,x.placeholder="\u8F93\u5165\u4E2D\u6587\u7FFB\u8BD1",x.addEventListener("input",()=>{V(x),p()}),x.addEventListener("paste",R=>{let h=R.clipboardData?.getData("text/plain")??"";if(!/[\r\n]/.test(h))return;R.preventDefault();let b=h.replace(/\r\n?/g,`
`).split(`
`);b[b.length-1]===""&&(b=b.slice(0,-1)),b.forEach((z,B)=>{let m=u[v+B];m&&(m.value=z,V(m))}),p()}),u.push(x),k.append(N,P,x),a.appendChild(k)});let M=document.createElement("div");M.className="lyric-layer-editor-footer";let d=document.createElement("span");d.className="lyric-layer-hint",d.textContent="\u652F\u6301\u7C98\u8D34\u591A\u884C \xB7 Ctrl/Cmd + S \u4FDD\u5B58";let g=L("\u4FDD\u5B58\u7FFB\u8BD1","primary",T.save);M.append(d,g),a.appendChild(M),u.forEach(V),p();let E=!1,f=async()=>{if(!E){E=!0;try{let l=n.map((v,k)=>({...v,translatedText:u[k]?.value.trim()??""}));await this.dependencies.store.save(W(e,l,r)),await this.dependencies.onEntryChanged(e.uri),this.hideModal(),w("\u7FFB\u8BD1\u5DF2\u4FDD\u5B58\u5E76\u5237\u65B0")}catch(l){E=!1,w(l instanceof Error?l.message:"\u4FDD\u5B58\u5931\u8D25",!0)}}};g.addEventListener("click",()=>void f()),a.addEventListener("keydown",l=>{(l.ctrlKey||l.metaKey)&&l.key.toLowerCase()==="s"&&(l.preventDefault(),f())}),this.displayModal(`\u7F16\u8F91\u7FFB\u8BD1 \xB7 ${e.title}`,a,!0)}};var we='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M4 6h12M4 10h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 15h5m-5 4h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".68"/><path d="M18 13v7m-3.5-3.5h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';function A(){let i=window.Spicetify?.Player?.data?.item,e=i?.uri;if(!i||!e?.startsWith("spotify:track:"))return;let t=i.metadata??{},r=i.artists?.map(n=>n.name).filter(Boolean).join(", ");return{uri:e,title:i.name??t.title??"\u672A\u77E5\u6B4C\u66F2",artist:r||t.artist_name||"\u672A\u77E5\u827A\u4EBA",coverUrl:i.album?.images?.[0]?.url??t.image_xlarge_url??t.image_url}}async function Le(){for(;!window.Spicetify?.Player||!window.Spicetify.PopupModal||!document.body;)await new Promise(i=>setTimeout(i,100))}var G=class{constructor(){this.store=new _;this.renderer=new $;this.ui=new D({store:this.store,getTrack:A,getLyrics:()=>this.ensureLyrics(!0),getExportLyrics:O,onEntryChanged:e=>this.reloadEntry(e)});this.lyrics=[];this.sourceResolved=!1;this.loadGeneration=0;this.interfaceScheduled=!1;this.songChange=()=>void this.loadCurrentTrack()}async start(){ee(),this.renderer.start(()=>{this.insertButtons(),this.sourceResolved||this.ensureLyrics(!1)}),window.Spicetify?.Player?.addEventListener?.("songchange",this.songChange),await this.loadCurrentTrack(),this.insertButtons()}async loadCurrentTrack(){let e=++this.loadGeneration;this.entry=void 0,this.lyrics=[],this.sourceResolved=!1,this.sourceLoad=void 0,this.renderer.clear();let t=A();if(!t)return;let r=await this.store.get(t.uri);if(e!==this.loadGeneration||A()?.uri!==t.uri)return;this.entry=r;let n=await O(t.uri);e!==this.loadGeneration||A()?.uri!==t.uri||(this.sourceResolved=n.length>0,this.lyrics=n.length?n:this.linesFromEntry(r),this.render())}linesFromEntry(e){return(e?.lines??[]).filter(t=>t.originalText).map((t,r)=>({index:t.index??r,text:t.originalText??"",startTime:t.startTime}))}async ensureLyrics(e){let t=A();if(!t)return[];if(this.sourceResolved)return this.lyrics;if(this.sourceLoad)return this.sourceLoad;let r=this.loadGeneration;return this.sourceLoad=(async()=>{let n=await O(t.uri);if(r!==this.loadGeneration||A()?.uri!==t.uri)return[];let a=e?Y():[],o=n.length?n:this.lyrics.length?this.lyrics:a;return o.length&&(n.length||!this.lyrics.length)&&(this.sourceResolved=n.length>0,this.lyrics=o,this.render()),o})().finally(()=>{this.sourceLoad=void 0}),this.sourceLoad}render(){let e=this.entry?F(this.lyrics,this.entry.lines):new Map;this.renderer.update(this.lyrics,e)}async reloadEntry(e){A()?.uri===e&&(this.entry=await this.store.get(e),this.lyrics.length||(this.lyrics=this.linesFromEntry(this.entry)),this.render())}insertButtons(){this.interfaceScheduled||(this.interfaceScheduled=!0,queueMicrotask(()=>{this.interfaceScheduled=!1,document.querySelectorAll("#SpicyLyricsPage .ViewControls, #SpicyLyricsNPVCard .CardControls").forEach(t=>{if(t.querySelector("[data-lyric-layer-button]"))return;let r=document.createElement("button");r.className=t.classList.contains("CardControls")?"ViewControl CardControl lyric-layer-control":"ViewControl lyric-layer-control",r.dataset.lyricLayerButton="true",r.title="\u81EA\u5B9A\u4E49\u7FFB\u8BD1",r.setAttribute("aria-label","\u81EA\u5B9A\u4E49\u7FFB\u8BD1"),r.innerHTML=we,r.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),this.ui.open()});try{window.Spicetify?.Tippy?.(r,{...window.Spicetify.TippyProps??{},content:"\u81EA\u5B9A\u4E49\u7FFB\u8BD1"})}catch{}let n=t.querySelector("#RomanizationToggle");n?n.insertAdjacentElement("afterend",r):t.appendChild(r)})}))}};(async()=>{await Le();let i=new G;await i.start(),window.LyricLayer=i})().catch(i=>{console.error("LyricLayer failed to initialize",i),window.Spicetify?.showNotification?.("LyricLayer \u521D\u59CB\u5316\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63A7\u5236\u53F0",!0)});})();
