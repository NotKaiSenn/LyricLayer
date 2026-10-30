export const TRANSLATION_ANIMATION_EVENT = "lyric-layer-animation-change";
const ANIMATION_STORAGE_KEY = "lyric-layer-animation-enabled";

// Keep the toggle usable for this session even if Spotify blocks localStorage.
let sessionPreference: boolean | undefined;

export function isTranslationAnimationEnabled(): boolean {
  if (sessionPreference !== undefined) return sessionPreference;
  try {
    return window.localStorage.getItem(ANIMATION_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setTranslationAnimationEnabled(enabled: boolean): void {
  sessionPreference = enabled;
  try {
    window.localStorage.setItem(ANIMATION_STORAGE_KEY, String(enabled));
  } catch { /* The in-memory preference still applies until the next reload. */ }
  window.dispatchEvent(new Event(TRANSLATION_ANIMATION_EVENT));
}
