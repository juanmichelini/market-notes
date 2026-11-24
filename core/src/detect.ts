/**
 * # Pattern Detection
 *
 * The entry point used by the frontend: given a price series and the name of
 * a formation, report where the formation occurs, in terms of the original
 * bars and prices.
 *
 * Detection works in four steps:
 *
 *   1. take the last `window` bars (if a window is given);
 *   2. reduce them to their pivots, the turning points of swings of at least
 *      `threshold` (see `pivots`);
 *   3. search the pivots for the formation (see `findPatterns`);
 *   4. map each match back to the original bars, and drop matches that mostly
 *      cover the same stretch as a better one.
 */

import type { PriceSeries } from "./types.js"
import { landmarks, type Bar, type Pattern } from "./patterns.js"
import { pivots, reduceSeries } from "./pivots.js"
import { findPatterns } from "./search.js"
import { lineThrough, type Line, type Point } from "./extrapolation.js"
import {
  doubleBottom,
  doubleTop,
  headAndShoulders,
  hill,
  inverseHeadAndShoulders,
  valley,
} from "./shapes.js"

/** The names of the formations that can be detected. */
export type PatternName =
  | "hill"
  | "valley"
  | "doubleTop"
  | "doubleBottom"
  | "headAndShoulders"
  | "inverseHeadAndShoulders"

/** A formation the user can ask for: its name, a label and a plain description. */
export interface PatternInfo {
  readonly name: PatternName
  readonly label: string
  readonly description: string
  readonly pattern: Pattern
}

/** Every formation that can be detected, in display order. */
export const PATTERNS: ReadonlyArray<PatternInfo> = [
  { name: "headAndShoulders", label: "Head and shoulders", description: "Three peaks, the middle one highest, with the two dips between them level. Often read as a bearish reversal.", pattern: headAndShoulders },
  { name: "inverseHeadAndShoulders", label: "Inverse head and shoulders", description: "Three troughs, the middle one lowest, with the two rallies between them level. Often read as a bullish reversal.", pattern: inverseHeadAndShoulders },
  { name: "doubleTop", label: "Double top", description: "Two peaks at about the same price with a dip of at least 5% between them.", pattern: doubleTop },
  { name: "doubleBottom", label: "Double bottom", description: "Two troughs at about the same price with a rally of at least 5% between them.", pattern: doubleBottom },
  { name: "hill", label: "Hill", description: "A rise followed by a fall.", pattern: hill },
  { name: "valley", label: "Valley", description: "A fall followed by a rise.", pattern: valley },
]

/** Options for `detectPatterns`. */
export interface DetectOptions {
  /** Smallest swing to treat as significant, as a fraction in (0, 1). Defaults to 0.05. */
  readonly threshold?: number
  /** Drop matches scoring below this, in [0, 1]. Defaults to 0.5. */
  readonly minScore?: number
  /** Search only the last this many bars. Defaults to the whole series. */
  readonly window?: number
}

/** One detected formation, in terms of the original series. */
export interface Detection {
  readonly pattern: PatternName
  /** How well the formation matches its definition, in [0, 1]. */
  readonly score: number
  /** The anchor points of the formation, ascending by bar, at the adjusted close. */
  readonly points: ReadonlyArray<Point>
  /**
   * For head-and-shoulders formations and double tops and bottoms, the line
   * whose break is read as confirming the formation, and where it starts. The
   * line can be continued to the right with `extendLine`. Absent for hills and
   * valleys.
   */
  readonly neckline?: { readonly from: Point; readonly line: Line }
}

/**
 * Chooses the matches to report: best score first, skipping any match whose
 * span overlaps an already chosen one by more than half of the shorter span.
 */
function withoutOverlaps(
  items: ReadonlyArray<{ readonly bars: ReadonlyArray<Bar>; readonly score: number }>
): number[] {
  const order = items
    .map((_, k) => k)
    .sort((x, y) => items[y]!.score - items[x]!.score || items[x]!.bars[0]! - items[y]!.bars[0]!)
  const chosen: number[] = []
  for (const k of order) {
    const a = items[k]!.bars
    const [a0, a1] = [a[0]!, a[a.length - 1]!]
    const clashes = chosen.some((c) => {
      const b = items[c]!.bars
      const [b0, b1] = [b[0]!, b[b.length - 1]!]
      const overlap = Math.min(a1, b1) - Math.max(a0, b0)
      return overlap > 0.5 * Math.min(a1 - a0, b1 - b0)
    })
    if (!clashes) chosen.push(k)
  }
  return chosen.sort((x, y) => items[x]!.bars[0]! - items[y]!.bars[0]!)
}

/**
 * Finds the occurrences of a named formation in a price series.
 *
 * @param series - The prices; adjusted closes must be positive where present.
 * @param name - The formation to look for.
 * @param options - See `DetectOptions`.
 * @throws {Error} if an option is out of range or the name is unknown.
 * @returns The detections in ascending order of their first bar; empty if there are none.
 */
export function detectPatterns(
  series: PriceSeries,
  name: PatternName,
  options: DetectOptions = {}
): ReadonlyArray<Detection> {
  const info = PATTERNS.find((p) => p.name === name)
  if (info === undefined) throw new Error(`detectPatterns: unknown pattern "${name}".`)
  const threshold = options.threshold ?? 0.05
  const minScore = options.minScore ?? 0.5
  const window = options.window
  if (window !== undefined && !(Number.isInteger(window) && window > 0)) {
    throw new Error(`detectPatterns: window must be a positive integer, got ${window}.`)
  }

  const offset = window === undefined ? 0 : Math.max(0, series.length - window)
  const bars = pivots(offset === 0 ? series : series.slice(offset), threshold).map((b) => b + offset)
  if (bars.length < 2) return []
  const reduced = reduceSeries(series, bars)

  const matches = findPatterns(reduced, info.pattern, { minScore }).map((instance) => {
    return {
      score: instance.score,
      bars: landmarks(instance).map((l) => bars[l]!),
    }
  })
  const keep = withoutOverlaps(matches)

  return keep.map((k): Detection => {
    const { score, bars: anchors } = matches[k]!
    const point = (b: Bar): Point => ({ bar: b, price: series[b]!.ohlcv.adjClose })
    const points = anchors.map(point)
    const base = { pattern: name, score, points }
    if (name === "headAndShoulders" || name === "inverseHeadAndShoulders") {
      const [t1, t2] = [points[2]!, points[4]!]
      return { ...base, neckline: { from: t1, line: lineThrough(t1, t2) } }
    }
    if (name === "doubleTop" || name === "doubleBottom") {
      const dip = points[2]!
      return { ...base, neckline: { from: dip, line: { slope: 0, intercept: dip.price } } }
    }
    return base
  })
}
