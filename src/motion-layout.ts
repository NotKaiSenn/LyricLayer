export interface MotionRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface MotionLayout {
  /** Text fragments at their neutral pose, in viewport coordinates. */
  rects: MotionRect[];
  /** Centre of the complete neutral ink box, including its surrounding spaces. */
  originX: number;
  originY: number;
  /** Local font em converted to viewport pixels on each parent scale axis. */
  pxPerEmX: number;
  pxPerEmY: number;
}

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;
const near = (value: number, expected: number): boolean => Math.abs(value - expected) < 1e-7;

function borderBox(style: CSSStyleDeclaration, axis: "width" | "height"): number {
  let size = parseFloat(style.getPropertyValue(axis));
  if (style.boxSizing !== "border-box") {
    for (const side of axis === "width" ? ["left", "right"] : ["top", "bottom"]) {
      size += (parseFloat(style.getPropertyValue(`padding-${side}`)) || 0)
        + (parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0);
    }
  }
  return size;
}

function uniformScale(value: string): number | undefined {
  if (!value || value === "none") return 1;
  const values = value.trim().split(/\s+/).map(part => parseFloat(part) / (part.endsWith("%") ? 100 : 1));
  const x = values[0]!;
  const y = values[1] ?? x;
  const z = values[2] ?? 1;
  return values.length <= 3 && positive(x) && near(x, y) && near(z, 1) ? x : undefined;
}

function translation(value: string): { x: number; y: number } | undefined {
  if (!value || value === "none") return { x: 0, y: 0 };
  try {
    const matrix = new DOMMatrixReadOnly(value);
    // Our ink owns only uniform scale and translation. Do not pretend to undo
    // a theme's rotation, skew or perspective with an axis-aligned inverse.
    if (!matrix.is2D || !near(matrix.a, 1) || !near(matrix.b, 0)
      || !near(matrix.c, 0) || !near(matrix.d, 1)
      || !Number.isFinite(matrix.e) || !Number.isFinite(matrix.f)) return undefined;
    return { x: matrix.e, y: matrix.f };
  } catch { return undefined; }
}

/** Read the glyph's current text fragments and undo only our own animation.
 * The unmoving container carries the parent's current translation/scale, so
 * scrolling, resizing, font changes and native line animation need no cache
 * invalidation. All reads must happen before the next batch of style writes.
 *
 * CSS Transforms 2 applies individual scale before the transform list (S*T).
 * Hence its translate() is multiplied by that scale in viewport coordinates.
 * https://drafts.csswg.org/css-transforms-2/#ctm
 */
export function measureMotionLayout(container: HTMLElement, ink: HTMLElement): MotionLayout | undefined {
  if (!container.isConnected || !ink.isConnected || !container.contains(ink)) return undefined;
  const textNode = ink.firstChild;
  if (!textNode || textNode.nodeType !== 3 || textNode !== ink.lastChild) return undefined;
  const text = textNode.textContent ?? "";
  const first = text.search(/\S/u);
  if (first < 0) return undefined;
  const last = text.trimEnd().length;

  try {
    const parentStyle = getComputedStyle(container);
    const inkStyle = getComputedStyle(ink);
    const parentRect = container.getBoundingClientRect();
    const width = borderBox(parentStyle, "width");
    const height = borderBox(parentStyle, "height");
    if (![width, height, parentRect.width, parentRect.height].every(positive)) return undefined;
    const parentScaleX = parentRect.width / width;
    const parentScaleY = parentRect.height / height;
    const fontSize = parseFloat(inkStyle.fontSize);
    const scale = uniformScale(inkStyle.scale);
    const offset = translation(inkStyle.transform);
    if (!positive(fontSize) || scale === undefined || !offset) return undefined;
    // Independent translate/rotate are not used by LyricLayer. Reduced-motion
    // styles serialize them as none and are measured as an identity pose.
    if (inkStyle.rotate && inkStyle.rotate !== "none" && parseFloat(inkStyle.rotate) !== 0) return undefined;
    if (inkStyle.translate && inkStyle.translate !== "none"
      && inkStyle.translate.split(/\s+/).some(value => parseFloat(value) !== 0)) return undefined;

    const box = ink.getBoundingClientRect();
    if (![box.width, box.height].every(positive)) return undefined;
    const currentX = (box.left + box.right) / 2;
    const currentY = (box.top + box.bottom) / 2;
    const originX = currentX - scale * offset.x * parentScaleX;
    const originY = currentY - scale * offset.y * parentScaleY;
    const pxPerEmX = fontSize * parentScaleX;
    const pxPerEmY = fontSize * parentScaleY;
    if (![originX, originY].every(Number.isFinite) || ![pxPerEmX, pxPerEmY].every(positive)) return undefined;

    const range = ink.ownerDocument.createRange();
    range.setStart(textNode, first);
    range.setEnd(textNode, last);
    const rects: MotionRect[] = [];
    for (const rect of range.getClientRects()) {
      if (![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)) return undefined;
      if (rect.width <= 0 || rect.height <= 0) continue;
      rects.push({
        left: originX + (rect.left - currentX) / scale,
        right: originX + (rect.right - currentX) / scale,
        top: originY + (rect.top - currentY) / scale,
        bottom: originY + (rect.bottom - currentY) / scale,
      });
    }
    if (!rects.length || rects.some(rect => !Object.values(rect).every(Number.isFinite))) return undefined;
    return { rects, originX, originY, pxPerEmX, pxPerEmY };
  } catch {
    // Detached or not-yet-laid-out text must remain at rest until measurable.
    return undefined;
  }
}
