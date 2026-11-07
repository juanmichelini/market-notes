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

/**
 * The pattern of a rise.
 *
 * An instance spans bars a < b such that the price made higher highs all the
 * way and never gave back its starting low:
 *
 *   high(t) < high(b)   for every bar t with a ≤ t < b
 *   low(t)  > low(a)    for every bar t with a < t ≤ b
 *
 * The landmarks are [a, b]. Every pair (a, b) inside the interval that
 * satisfies both conditions is an instance, so a long rise also contains
 * the shorter rises within it. Instances are crisp: the score is 1. If you
 * want only maximal rises, filter the result.
 *
 * Implementation note: for a fixed start a, the largest earlier high is
 * tracked as b advances and the search stops at the first low that is not
 * above low(a), because no longer rise from a can contain that bar. This
 * makes the search O(n²) in the number of bars rather than O(n³).
 *
 * A missing (NaN) high or low ends the search from that start.
 *
 * @param series - The price series searched.
 * @param from   - The first bar of the interval (inclusive).
 * @param to     - The last bar of the interval (inclusive).
 * @returns Instances with two landmarks [a, b], ascending by (a, b).
 */
export const up: Pattern = (series, from, to) => {
  const range = clipInterval(series, from, to)
  if (range === undefined) return []
  const [lo, hi] = range
  const out: ShapeInstance[] = []
  for (let a = lo; a < hi; a++) {
    const { high: highA, low: lowA } = series[a]!.ohlcv
    let highestSoFar = highA // largest high over [a, b - 1]
    for (let b = a + 1; b <= hi; b++) {
      const { high, low } = series[b]!.ohlcv
      if (!(low > lowA) || Number.isNaN(high)) break
      if (high > highestSoFar) {
        out.push({ kind: "up", landmarks: [a, b], score: 1 })
        highestSoFar = high
      }
    }
  }
  return out
}

