/** Small DOM building blocks shared by the editing UI. */

export function notify(message: string, isError = false): void {
  if (window.Spicetify?.showNotification) window.Spicetify.showNotification(message, isError, 4_000);
  else console[isError ? "error" : "info"](`LyricLayer: ${message}`);
}

export const ICONS = {
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5V19h14v-3.5"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 15.5V19h14v-3.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/></svg>',
  tune: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
};

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, className = "", icon = ""): HTMLButtonElement {
  const node = element("button", `ll-btn ${className}`.trim());
  node.type = "button";
  if (icon) {
    const iconElement = element("span", "ll-btn-icon");
    iconElement.innerHTML = icon;
    node.appendChild(iconElement);
  }
  if (label) node.appendChild(element("span", "", label));
  return node;
}

/** An icon-only button; the label is its accessible name and tooltip. */
export function iconButton(label: string, icon: string, className = ""): HTMLButtonElement {
  const node = button("", `icon ${className}`.trim(), icon);
  node.setAttribute("aria-label", label);
  node.title = label;
  return node;
}

export async function chooseFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.hidden = true;
    input.addEventListener("change", () => resolve(input.files?.[0]), { once: true });
    input.addEventListener("cancel", () => resolve(undefined), { once: true });
    input.click();
  });
}

export function downloadFile(text: string, filename: string, mimeType = "text/plain"): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** An in-app dialog that matches the page, instead of the browser's dialog.
 * Escape and a click outside choose `cancel`. */
export function choiceDialog<T extends string>(options: {
  title: string;
  message: string;
  choices: Array<{ value: T; label: string; tone?: "primary" | "danger" }>;
  cancel: T;
  focus?: T;
}): Promise<T> {
  return new Promise((resolve) => {
    const backdrop = element("div", "ll-scope ll-dialog-backdrop");
    const dialog = element("div", "ll-dialog");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    const actions = element("div", "ll-dialog-actions");
    const buttons = options.choices.map((choice) => {
      const node = button(choice.label, choice.tone ?? "");
      node.addEventListener("click", () => close(choice.value));
      actions.appendChild(node);
      return node;
    });
    dialog.append(element("h2", "ll-dialog-title", options.title), element("p", "ll-dialog-text", options.message), actions);
    backdrop.appendChild(dialog);
    let settled = false;
    const close = (value: T) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      resolve(value);
    };
    backdrop.addEventListener("pointerdown", (event) => { if (event.target === backdrop) close(options.cancel); });
    dialog.addEventListener("keydown", (event) => {
      // Escape belongs to this dialog, not to the page underneath it.
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(options.cancel); }
      if (event.key === "Tab") {
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
      }
    });
    (document.body ?? document.documentElement).appendChild(backdrop);
    const focus = options.choices.findIndex((choice) => choice.value === (options.focus ?? options.cancel));
    buttons[Math.max(0, focus)]?.focus();
  });
}

export async function confirmDialog(options: { title: string; message: string; confirm: string; danger?: boolean }): Promise<boolean> {
  const result = await choiceDialog({ title: options.title, message: options.message, cancel: "cancel",
    focus: options.danger ? "cancel" : "confirm",
    choices: [{ value: "cancel", label: "取消" }, { value: "confirm", label: options.confirm, tone: options.danger ? "danger" : "primary" }] });
  return result === "confirm";
}

export interface MenuEntry {
  label: string;
  detail?: string;
  ariaLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  action?: () => void | Promise<void>;
  /** A custom control, rendered as-is instead of a clickable item. */
  content?: HTMLElement;
}
export type MenuContent = Array<MenuEntry | "separator" | { note: string }>;

/** A small popover anchored to a toolbar button. Entries are built on open so
 * they always reflect the current state. */
export function menu(trigger: HTMLButtonElement, build: () => MenuContent | Promise<MenuContent>): HTMLElement {
  const anchor = element("div", "ll-menu-anchor");
  const popover = element("div", "ll-menu");
  popover.setAttribute("role", "menu");
  popover.hidden = true;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  anchor.append(trigger, popover);
  let generation = 0;
  const outside = (event: Event) => {
    if (!anchor.contains(event.target as Node)) close();
  };
  const close = () => {
    generation++;
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener?.("pointerdown", outside, true);
  };
  const open = async () => {
    const current = ++generation;
    popover.replaceChildren(element("div", "ll-menu-note", "正在读取…"));
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener?.("pointerdown", outside, true);
    let entries: MenuContent;
    try {
      entries = await build();
    } catch (error) {
      entries = [{ note: error instanceof Error ? error.message : "读取失败" }];
    }
    if (current !== generation) return;
    popover.replaceChildren();
    for (const entry of entries) {
      if (entry === "separator") { popover.appendChild(element("div", "ll-menu-separator")); continue; }
      if ("note" in entry) { popover.appendChild(element("div", "ll-menu-note", entry.note)); continue; }
      if (entry.content) {
        const row = element("div", "ll-menu-custom");
        row.appendChild(entry.content);
        popover.appendChild(row);
        continue;
      }
      const item = element("button", `ll-menu-item${entry.danger ? " danger" : ""}`);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.disabled = !!entry.disabled;
      if (entry.ariaLabel) item.setAttribute("aria-label", entry.ariaLabel);
      item.append(element("span", "ll-menu-label", entry.label));
      if (entry.detail) item.append(element("span", "ll-menu-detail", entry.detail));
      item.addEventListener("click", () => {
        close();
        void entry.action?.();
      });
      popover.appendChild(item);
    }
  };
  trigger.addEventListener("click", () => { if (popover.hidden) void open(); else close(); });
  anchor.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) {
      event.stopPropagation();
      close();
      trigger.focus();
    }
  });
  return anchor;
}

export function switchControl(label: string, detail: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const control = element("label", "ll-switch-row");
  const copy = element("span", "ll-switch-copy");
  copy.append(element("span", "ll-menu-label", label), element("span", "ll-menu-detail", detail));
  const input = element("input", "");
  input.type = "checkbox";
  input.checked = checked;
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => onChange(input.checked));
  control.append(copy, input, element("span", "ll-switch"));
  return control;
}
