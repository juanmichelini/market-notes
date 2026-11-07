/**
 * # Primitive Chart Patterns
 *
 * The six primitive patterns of CPL (Anand, Chin, Khoo, ICFP 2001), from
 * which all other patterns are built with the combinators of the DSL (see
 * ADR-008):
 *
 *   bar              one trading day
 *   up               a rise
 *   down             a fall
 *   horizontal       a level stretch
 *   resistanceLine   a line that prices stay below
 *   supportLine      a line that prices stay above
 *
 * Each primitive is a `Pattern`: a pure function from a series and an
 * interval of bars to the instances inside the interval, in ascending order
 * of (first landmark, last landmark).
 *
 * ## Missing data
 *
 * A `NaN` price is a missing observation. It is never treated as a value:
 * no instance is reported that depends on comparing against a missing price
 * or that spans one.
 */

import type { PriceSeries } from "./types.js"
import type { Bar, Pattern, ShapeInstance } from "./patterns.js"

/**
 * Clips the closed interval [from, to] to the bars that exist in `series`
 * and returns the first and last bar, or `undefined` if nothing is left.
 *
 * Fractional bounds are narrowed inwards: from is rounded up, to is rounded
 * down, so only whole bars lying inside the requested interval are kept.
 */
function clipInterval(series: PriceSeries, from: Bar, to: Bar): readonly [Bar, Bar] | undefined {
  const lo = Math.max(Math.ceil(from), 0)
  const hi = Math.min(Math.floor(to), series.length - 1)
  return lo <= hi ? [lo, hi] : undefined
}

/**
 * The pattern of a single trading day.
 *
 * Every bar in the interval is an instance with one landmark, the bar
 * itself, and a score of 1. By itself the pattern says nothing about the
 * bar; it becomes useful once a constraint is attached with `constrainedBy`,
 * for example to describe an "inside day" whose range lies within the
 * previous day's range.
 *
 * @param series - The price series searched.
 * @param from   - The first bar of the interval (inclusive).
 * @param to     - The last bar of the interval (inclusive).
 * @returns One instance per bar in [from, to] that exists in the series, ascending.
 */
export const bar: Pattern = (series, from, to) => {
  const range = clipInterval(series, from, to)
  if (range === undefined) return []
  const out: ShapeInstance[] = []
  for (let b = range[0]; b <= range[1]; b++) {
    out.push({ kind: "bar", landmarks: [b], score: 1 })
  }
  return out
}

