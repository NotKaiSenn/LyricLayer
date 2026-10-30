/** Coordinates are in one shared space (normally viewport CSS pixels). Text
 * rectangles exclude leading/trailing whitespace and describe the neutral pose. */
export interface Rect { left: number; right: number; top: number; bottom: number }
export interface MotionGlyph {
  rects: Rect[];
  /** Centre of the complete neutral ink box, including any whitespace. */
  originX: number;
  originY: number;
  scale: number;
  /** Actual target translation, not a pre-scale CSS transform translation. */
  x: number;
  y: number;
}
export interface MotionLimit {
  scale: number;
  x: number;
  y: number;
  scaleGain: number;
  xGain: number;
  yGain: number;
}

type Axis = "x" | "y";
interface Prepared extends MotionGlyph { index: number }
interface Cost { scale: number; translation: number }
interface Separation { axis: Axis; gain: number; first: Prepared; second: Prepared; firstCost: Cost; secondCost: Cost }
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const validRect = (rect: Rect): boolean => [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)
  && rect.right > rect.left && rect.bottom > rect.top;

function prepare(glyph: MotionGlyph, index: number): Prepared {
  const rects = glyph.rects.filter(validRect);
  const first = rects[0];
  return { ...glyph, index, rects,
    originX: finite(glyph.originX, first ? first.left / 2 + first.right / 2 : 0),
    originY: finite(glyph.originY, first ? first.top / 2 + first.bottom / 2 : 0),
    scale: Number.isFinite(glyph.scale) && glyph.scale >= 0 ? glyph.scale : 1,
    x: finite(glyph.x, 0), y: finite(glyph.y, 0),
  };
}

function closingCost(glyph: Prepared, edge: number, axis: Axis, direction: 1 | -1): Cost {
  const origin = axis === "x" ? glyph.originX : glyph.originY;
  // A trimmed or wrapped text fragment need not be centred on the element's
  // transform origin. Contraction can move such a fragment toward a neighbour.
  return {
    scale: Math.max(0, direction * (glyph.scale - 1) * (edge - origin)),
    translation: Math.max(0, direction * glyph[axis]),
  };
}

/** A narrow, conservative C1 knee removes the velocity corner at demand=budget.
 * Outside it, preserve the original pose or the full available amplitude.
 * Inside it, used <= min(demand, budget), so smoothing cannot create overlap.
 * The greatest extra reduction is width/4: at most 1/16 of a viewport pixel. */
function budgetGain(demand: number, budget: number): number {
  if (demand === 0) return 1;
  if (!Number.isFinite(demand) || budget <= 0) return 0;
  const width = Math.min(budget * 0.1, 0.25);
  if (demand <= budget - width) return 1;
  if (demand >= budget + width) return budget / demand;
  const within = (demand - budget + width) / width;
  const used = demand - width * within * within / 4;
  return Math.max(0, Math.min(1, budget / demand, used / demand));
}

function separation(first: Prepared, firstRect: Rect, second: Prepared, secondRect: Rect,
  axis: Axis, margin: number): Separation {
  const far = axis === "x" ? firstRect.right : firstRect.bottom;
  const near = axis === "x" ? secondRect.left : secondRect.top;
  const gap = near - far;
  const firstCost = closingCost(first, far, axis, 1);
  const secondCost = closingCost(second, near, axis, -1);
  const demand = firstCost.scale + firstCost.translation + secondCost.scale + secondCost.translation;
  const budget = Math.max(0, gap - margin);
  // Overflow can only occur for nonsensical imported geometry. Returning to
  // neutral is safer than allowing NaN/Infinity to escape into a CSS property.
  const gain = budgetGain(demand, budget);
  return { axis, gain, first, second, firstCost, secondCost };
}

function chooseSeparations(first: Prepared, a: Rect, second: Prepared, b: Rect, margin: number): Separation[] {
  const forwardX = b.left - a.right, backwardX = a.left - b.right;
  const forwardY = b.top - a.bottom, backwardY = a.top - b.bottom;
  // A diagonal pair only needs one separating axis. Choose from neutral
  // geometry alone: comparing pose-dependent gains can suddenly transfer the
  // constraint from x to y, jumping by pixels even for a continuous input.
  // The wider signed gap wins; ties always choose x. For already overlapping
  // layout, this is its shallowest penetration and the budget is zero. Keep
  // tangential/away motion instead of suddenly retiring the whole glyph when
  // a moving obstacle passes through the neutral contact boundary.
  const axis: Axis = Math.max(forwardY, backwardY) > Math.max(forwardX, backwardX) ? "y" : "x";
  const forward = axis === "x" ? forwardX : forwardY;
  const backward = axis === "x" ? backwardX : backwardY;
  const choices: Separation[] = [];
  // Exactly aligned centres have no unique outward direction on this axis.
  // Constrain both orientations so swapping the pair cannot change the result.
  if (forward >= backward) choices.push(separation(first, a, second, b, axis, margin));
  if (backward >= forward) choices.push(separation(second, b, first, a, axis, margin));
  return choices;
}

/** Preserve each native target pose wherever it fits. For a crowded pair, only
 * the components that move its edges inward lose amplitude. Positive demands
 * are computed from the ORIGINAL target poses, not the progressively limited
 * ones: taking their minima is safe in one pass and independent of pair order.
 *
 * We do not spend space temporarily created by a neighbour shrinking or moving
 * away. Another constraint could reduce that helpful movement later. Ignoring
 * that credit makes every resolved pair remain safe without iterative physics.
 *
 * Non-overlapping neutral layout remains separated. If layout already overlaps,
 * do not increase its shallowest penetration; restoring layout itself requires
 * the caller to move/reflow it, rather than stopping unrelated animation. */
export function constrainMotion(glyphs: MotionGlyph[], obstacles: Rect[] = [], margin = 0.5): MotionLimit[] {
  const safeMargin = Math.max(0, finite(margin, 0.5));
  const prepared = glyphs.map(prepare);
  const limits: MotionLimit[] = prepared.map(glyph => ({ scale: glyph.scale, x: glyph.x, y: glyph.y,
    scaleGain: 1, xGain: 1, yGain: 1 }));
  const fixed: Prepared = { index: -1, rects: obstacles.filter(validRect), originX: 0, originY: 0, scale: 1, x: 0, y: 0 };

  const restrict = (glyph: Prepared, cost: Cost, axis: Axis, gain: number) => {
    const limit = limits[glyph.index];
    if (!limit) return;
    if (cost.scale > 0) limit.scaleGain = Math.min(limit.scaleGain, gain);
    if (cost.translation > 0) {
      if (axis === "x") limit.xGain = Math.min(limit.xGain, gain);
      else limit.yGain = Math.min(limit.yGain, gain);
    }
  };
  const compare = (first: Prepared, second: Prepared) => {
    for (const a of first.rects) for (const b of second.rects) {
      for (const fit of chooseSeparations(first, a, second, b, safeMargin)) {
        restrict(fit.first, fit.firstCost, fit.axis, fit.gain);
        restrict(fit.second, fit.secondCost, fit.axis, fit.gain);
      }
    }
  };
  prepared.forEach((glyph, index) => {
    for (let next = index + 1; next < prepared.length; next++) compare(glyph, prepared[next]!);
    if (fixed.rects.length) compare(glyph, fixed);
  });
  return limits.map((limit, index) => {
    const glyph = prepared[index]!;
    return { ...limit,
      scale: limit.scaleGain === 0 ? 1 : 1 + (glyph.scale - 1) * limit.scaleGain,
      x: limit.xGain === 0 ? 0 : glyph.x * limit.xGain,
      y: limit.yGain === 0 ? 0 : glyph.y * limit.yGain,
    };
  });
}
