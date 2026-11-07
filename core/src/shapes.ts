/**
 * # Named Chart Shapes
 *
 * Classic chart formations written with the combinators of the DSL. They
 * describe the large swings of a series, so run them on the pivots of a
 * series (see `pivots`) and not on raw daily prices; `detectPatterns` does so.
 *
 * Each formation chains rises (`up`) and falls (`down`) and then constrains
 * the prices at its landmarks. Peak prices are the highs at a landmark and
 * trough prices the lows, which on a pivot series are the same pivot price.
 * Comparisons are fuzzy (see `fuzzy.ts`), so a formation that is nearly right
 * scores low rather than being missed.
 */

import type { PriceSeries } from "./types.js"
import { approxEqual, approxGreater, approxLess, fuzzyAnd, type Fuzzy } from "./fuzzy.js"
import { constrainedBy, followedBy } from "./combinators.js"
import { landmarks, type Bar, type Pattern } from "./patterns.js"
import { down, up } from "./primitives.js"

/** Chains patterns in time, left to right: chain(a, b, c) = a followed by (b followed by c). */
export function chain(first: Pattern, ...rest: ReadonlyArray<Pattern>): Pattern {
  const [next, ...others] = rest
  return next === undefined ? first : followedBy(first, chain(next, ...others))
}

/** Constrains a pattern by a function of the prices at its landmarks, returning NaN-safe fuzzy values. */
function byLandmarks(
  pattern: Pattern,
  count: number,
  f: (high: (k: number) => number, low: (k: number) => number) => Fuzzy
): Pattern {
  return constrainedBy(pattern, (series: PriceSeries, instance) => {
    const ls: ReadonlyArray<Bar> = landmarks(instance)
    if (ls.length !== count) return NaN
    return f(
      (k) => series[ls[k]!]!.ohlcv.high,
      (k) => series[ls[k]!]!.ohlcv.low
    )
  })
}

/** How much higher, as a factor, the head must be than the shoulders. */
const HEAD_MARGIN = 1.03
/** How much lower, as a factor, the dip between two tops must be than the tops. */
const DIP_MARGIN = 0.95

/**
 * A hill: a rise followed by a fall. Landmarks: start, top, end.
 */
export const hill: Pattern = followedBy(up, down)

/**
 * A valley: a fall followed by a rise. Landmarks: start, bottom, end.
 */
export const valley: Pattern = followedBy(down, up)

/**
 * Head and shoulders, a bearish reversal formation. Landmarks, in order:
 * start, left shoulder, trough, head, trough, right shoulder, end. With peaks
 * P₁ (left shoulder), P₃ (head), P₅ (right shoulder) and troughs T₂, T₄,
 * the score is the minimum of how well
 *
 *   P₃ > 1.03 × P₁     (the head clears the left shoulder)
 *   P₃ > 1.03 × P₅     (the head clears the right shoulder)
 *   P₁ ≈ P₅            (the shoulders are level)
 *   T₂ ≈ T₄            (the neckline through the troughs is level)
 *
 * hold.
 */
export const headAndShoulders: Pattern = byLandmarks(
  chain(up, down, up, down, up, down),
  7,
  (hi, lo) =>
    fuzzyAnd([
      approxGreater(hi(3), HEAD_MARGIN * hi(1)),
      approxGreater(hi(3), HEAD_MARGIN * hi(5)),
      approxEqual(hi(1), hi(5)),
      approxEqual(lo(2), lo(4)),
    ])
)

/**
 * Inverse head and shoulders, a bullish reversal formation: the mirror image
 * of `headAndShoulders`. Landmarks: start, left shoulder (a trough), peak,
 * head (a lower trough), peak, right shoulder (a trough), end.
 */
export const inverseHeadAndShoulders: Pattern = byLandmarks(
  chain(down, up, down, up, down, up),
  7,
  (hi, lo) =>
    fuzzyAnd([
      approxLess(lo(3), lo(1) / HEAD_MARGIN),
      approxLess(lo(3), lo(5) / HEAD_MARGIN),
      approxEqual(lo(1), lo(5)),
      approxEqual(hi(2), hi(4)),
    ])
)

/**
 * Double top, a bearish reversal formation. Landmarks: start, first top,
 * dip, second top, end. The score is the minimum of how well the two tops are
 * level (P₁ ≈ P₃) and the dip is at least 5% below them (T₂ < 0.95 × min(P₁, P₃)).
 */
export const doubleTop: Pattern = byLandmarks(chain(up, down, up, down), 5, (hi, lo) =>
  fuzzyAnd([approxEqual(hi(1), hi(3)), approxLess(lo(2), DIP_MARGIN * Math.min(hi(1), hi(3)))])
)

/**
 * Double bottom, a bullish reversal formation: the mirror image of `doubleTop`.
 * Landmarks: start, first bottom, rally, second bottom, end.
 */
export const doubleBottom: Pattern = byLandmarks(chain(down, up, down, up), 5, (hi, lo) =>
  fuzzyAnd([
    approxEqual(lo(1), lo(3)),
    approxGreater(hi(2), Math.max(lo(1), lo(3)) / DIP_MARGIN),
  ])
)
