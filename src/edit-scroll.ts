interface ScrollBinding {
  element: HTMLElement;
  write(top: number): void;
  restore(): void;
}
const INPUT_EVENTS = ["wheel", "touchstart", "touchmove", "keydown", "pointerdown", "pointermove", "mousemove", "pointerup", "mouseup", "pointercancel"];

function propertyDescriptor(object: object, name: string): PropertyDescriptor | undefined {
  for (let current: object | null = object; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
  }
}

/** Own just the lyrics viewport while editing. Spicy's forced seeks and resize
 * centering bypass its wheel cooldown, so intercept their scroll writes before
 * they move the viewport. Browser wheel/touch/keyboard scrolling still works.
 * No global DOM prototypes or player APIs are changed. */
export class EditScroll {
  private binding?: ScrollBinding;
  private target?: HTMLElement;
  private anchor?: number;
  private knownTop = 0;
  private frame?: number;
  private stopped = false;
  private inputDepth = 0;
  private dragging = false;
  private userScrollUntil = 0;
  private viewportHeight = 0;

  constructor(private page: HTMLElement) {
    for (const name of INPUT_EVENTS) {
      document.addEventListener(name, this.onInput, true);
    }
    this.connect();
    this.schedule();
  }

  /** Call before replacing/moving the panel, to keep its controls at that height. */
  capture(): number | undefined {
    return this.target?.isConnected ? this.anchor ?? this.target.getBoundingClientRect?.().top : undefined;
  }

  reveal(target: HTMLElement, preferredTop?: number): void {
    this.target = target;
    this.connect();
    const viewport = this.binding?.element;
    if (!viewport || !target.isConnected) return;
    const box = target.getBoundingClientRect();
    const area = viewport.getBoundingClientRect();
    if (!area.height || !box.height) return;
    this.viewportHeight = area.height;
    const toolbar = this.page.querySelector(".ll-toolbar-wrap")?.getBoundingClientRect();
    // Leave room for the original line above the card, and never center a card
    // taller than the viewport. Navigation preserves the header's screen position.
    const top = Math.max(area.top + Math.min(120, area.height / 4), (toolbar?.bottom ?? 0) + 16);
    const bottom = Math.max(top, area.bottom - 100);
    const desired = preferredTop ?? Math.min(box.top, area.bottom - box.height - 16);
    this.anchor = Math.max(top, Math.min(bottom, desired));
    this.knownTop = viewport.scrollTop;
    this.pin();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    for (const name of INPUT_EVENTS) {
      document.removeEventListener(name, this.onInput, true);
    }
    this.binding?.restore();
    this.binding = undefined;
    this.target = undefined;
  }

  private readonly onInput = (event: Event) => {
    const viewport = this.binding?.element;
    if (!viewport) return;
    const target = event.target as Element | null;
    if (["wheel", "touchstart", "touchmove", "keydown"].includes(event.type)) {
      if (!target || !viewport.contains(target)) return;
      if (event.type === "keydown" && (target.closest("input, textarea, button, [contenteditable]")
        || !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes((event as KeyboardEvent).key))) return;
      this.userScrollUntil = performance.now() + 1200;
      return;
    }
    if (event.type === "pointerdown") {
      const track = target?.closest?.(".simplebar-vertical");
      if (!track || !this.page.contains(track)) return;
      const thumb = track.querySelector(".simplebar-scrollbar");
      if (!thumb) return;
      this.userScrollUntil = performance.now() + 1200;
      if (!thumb.contains(target)) {
        // SimpleBar animates track clicks with JS writes on later frames. Do
        // the same page step directly so those writes need no broad exemption.
        event.preventDefault();
        event.stopImmediatePropagation();
        this.binding!.write(viewport.scrollTop + ((event as PointerEvent).clientY < thumb.getBoundingClientRect().top ? -1 : 1) * viewport.clientHeight);
        return;
      }
      this.dragging = true;
    } else if (!this.dragging) return;
    this.userScrollUntil = performance.now() + 1200;
    if (["pointerup", "mouseup", "pointercancel"].includes(event.type)) this.dragging = false;
    // SimpleBar's thumb drag writes synchronously from the same input event.
    // Revoke the exemption before rAF, where native auto-follow runs.
    this.inputDepth++;
    queueMicrotask(() => { this.inputDepth--; });
  };

  private connect(): void {
    const list = this.page.querySelector(".SpicyLyricsScrollContainer");
    const viewport = list?.closest<HTMLElement>(".simplebar-content-wrapper, .LyricsContent");
    if (viewport === this.binding?.element) return;
    this.binding?.restore();
    this.binding = undefined;
    if (!viewport) return;
    const top = propertyDescriptor(viewport, "scrollTop");
    if (!top?.get || !top.set) return;
    const read = () => top.get!.call(viewport) as number;
    const write = (value: number) => top.set!.call(viewport, value);
    const restore: Array<() => void> = [];
    const replace = (name: string, descriptor: PropertyDescriptor) => {
      const previous = Object.getOwnPropertyDescriptor(viewport, name);
      Object.defineProperty(viewport, name, { configurable: true, ...descriptor });
      restore.push(() => {
        const current = Object.getOwnPropertyDescriptor(viewport, name);
        if (current?.get !== descriptor.get || current?.set !== descriptor.set || current?.value !== descriptor.value) return;
        if (previous) Object.defineProperty(viewport, name, previous);
        else Reflect.deleteProperty(viewport, name);
      });
    };
    try {
      replace("scrollTop", { get: read, set: (value: number) => { if (this.inputDepth) write(value); } });
      for (const name of ["scroll", "scrollTo", "scrollBy"] as const) {
        const original = viewport[name];
        if (typeof original !== "function") continue;
        replace(name, { writable: true, value: (...args: unknown[]) => {
          if (this.inputDepth) Reflect.apply(original, viewport, args);
        } });
      }
    } catch {
      restore.reverse().forEach(undo => undo());
      return;
    }
    viewport.classList.add("ll-scroll-owned");
    this.binding = { element: viewport, write, restore: () => {
      restore.reverse().forEach(undo => undo());
      viewport.classList.remove("ll-scroll-owned");
    } };
    this.knownTop = read();
    // Cancel a CSS smooth scroll already in flight before ownership changed.
    write(this.knownTop);
  }

  private pin(): void {
    const viewport = this.binding?.element;
    if (!viewport || !this.target?.isConnected || this.anchor === undefined) return;
    if (Math.abs(viewport.getBoundingClientRect().height - this.viewportHeight) > 1) {
      this.reveal(this.target);
      return;
    }
    const actual = viewport.scrollTop;
    const top = this.target.getBoundingClientRect().top;
    if (Math.abs(actual - this.knownTop) > 1 && performance.now() < this.userScrollUntil) {
      // A browser scroll (wheel, touch, keyboard) or a scrollbar drag is the
      // user's new anchor. Never pull them back to the old editing position.
      this.anchor = top;
    } else if (Math.abs(top - this.anchor) > 1) {
      this.binding!.write(actual + top - this.anchor);
    }
    this.knownTop = viewport.scrollTop;
  }

  private schedule(): void {
    if (typeof requestAnimationFrame !== "function" || this.stopped) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (!this.page.isConnected) { this.stop(); return; }
      this.connect();
      this.pin();
      this.schedule();
    });
  }
}
