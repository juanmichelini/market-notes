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
import type { Bar, LineInstance, Pattern, ShapeInstance } from "./patterns.js"
import { approxEqual, type Fuzzy } from "./fuzzy.js"

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

/**
 * The pattern of a fall: the mirror image of `up`.
 *
 * An instance spans bars a < b such that the price made lower lows all the
 * way and never rose back above its starting high:
 *
 *   low(t)  > low(b)    for every bar t with a ≤ t < b
 *   high(t) < high(a)   for every bar t with a < t ≤ b
 *
 * The landmarks are [a, b]. Every pair (a, b) inside the interval that
 * satisfies both conditions is an instance, so a long fall also contains the
 * shorter falls within it. Instances are crisp: the score is 1. The search
 * is O(n²), as for `up`, and a missing (NaN) high or low ends the search from
 * that start.
 *
 * @param series - The price series searched.
 * @param from   - The first bar of the interval (inclusive).
 * @param to     - The last bar of the interval (inclusive).
 * @returns Instances with two landmarks [a, b], ascending by (a, b).
 */
export const down: Pattern = (series, from, to) => {
  const range = clipInterval(series, from, to)
  if (range === undefined) return []
  const [lo, hi] = range
  const out: ShapeInstance[] = []
  for (let a = lo; a < hi; a++) {
    const { high: highA, low: lowA } = series[a]!.ohlcv
    let lowestSoFar = lowA // smallest low over [a, b - 1]
    for (let b = a + 1; b <= hi; b++) {
      const { high, low } = series[b]!.ohlcv
      if (!(high < highA) || Number.isNaN(low)) break
      if (low < lowestSoFar) {
        out.push({ kind: "down", landmarks: [a, b], score: 1 })
        lowestSoFar = low
      }
    }
  }
  return out
}

/** Options for `horizontal`. */
export interface HorizontalOptions {
  /**
   * Width of the fuzzy comparison of closes, in price units: closes further
   * apart than this are not level at all. Defaults to 5% of the price (see
   * `approxEqual`). A width of 0 accepts only identical closes. Must be ≥ 0.
   */
  readonly width?: number
}

/**
 * Builds the pattern of a level stretch of prices.
 *
 * An instance spans bars a < b such that every close from a up to b − 1 is
 * approximately equal to the close at b. Its score is the lowest degree of
 * equality found:
 *
 *   score = min over t in [a, b) of approxEqual(close(t), close(b), width)
 *
 * and a stretch is an instance only if the score is above 0. The landmarks
 * are [a, b]. A flat series scores 1 everywhere; a drifting one scores less
 * the further the earlier closes are from the last.
 *
 * Implementation note: for a fixed end b the search walks backwards from b − 1
 * and stops when the score reaches 0, since a longer stretch can only score
 * lower. It therefore only does work proportional to the length of the level
 * runs it finds. A missing (NaN) close stops the walk.
 *
 * @param options - See `HorizontalOptions`.
 * @throws {Error} if `options.width` is negative or NaN.
 * @returns A `Pattern` whose instances have landmarks [a, b], ascending by (a, b).
 */
export function horizontal(options: HorizontalOptions = {}): Pattern {
  const { width } = options
  if (width !== undefined && !(width >= 0)) {
    throw new Error(`horizontal: width must be a non-negative number, got ${width}.`)
  }
  return (series, from, to) => {
    const range = clipInterval(series, from, to)
    if (range === undefined) return []
    const [lo, hi] = range
    const out: ShapeInstance[] = []
    for (let b = lo + 1; b <= hi; b++) {
      const closeB = series[b]!.ohlcv.close
      let score: Fuzzy = 1
      for (let a = b - 1; a >= lo; a--) {
        const equality = approxEqual(series[a]!.ohlcv.close, closeB, width)
        if (Number.isNaN(equality)) break
        score = Math.min(score, equality)
        if (score === 0) break
        out.push({ kind: "horizontal", landmarks: [a, b], score })
      }
    }
    // Instances were found by end bar; the contract orders them by start bar first.
    return out.sort((x, y) => x.landmarks[0]! - y.landmarks[0]! || x.landmarks[1]! - y.landmarks[1]!)
  }
}

// ---------------------------------------------------------------------------
// Lines: resistance and support
// ---------------------------------------------------------------------------

/** Options for `resistanceLine` and `supportLine`. Lengths count bar steps, b − a. */
export interface LineOptions {
  /**
   * The shortest span to report, in bar steps (last bar minus first bar).
   * Must be an integer ≥ 3: a span needs two touches strictly inside it, so
   * at least four bars. Defaults to 3.
   */
  readonly minLength?: number
  /**
   * The longest span to report, in bar steps. Must be an integer ≥
   * `minLength`. Bounds the number of instances and the work done. Defaults
   * to 60.
   */
  readonly maxLength?: number
}

const DEFAULT_MIN_LINE_LENGTH = 3
const DEFAULT_MAX_LINE_LENGTH = 60

/**
 * Finds the resistance lines (side "upper") or support lines (side "lower")
 * of every span of bars inside [from, to].
 *
 * For a span [a, b] and the series y(t) of highs (upper) or negated lows
 * (lower), the candidate lines are the edges of the *upper convex hull* of
 * the points (t, y(t)) for t in [a, b]. An edge of the upper hull is exactly
 * a line through two of the points that no point lies above, so every edge
 * is a valid line and every valid line through two touches is an edge.
 * Edges that start at bar a or end at bar b are skipped: the touches must lie
 * strictly inside the span, as in CPL. Support lines are found as resistance
 * lines of the negated lows, and mapped back.
 *
 * For a fixed start a the hull is extended one bar at a time, which keeps the
 * work per span proportional to the size of the hull, not the span.
 */
function findLines(
  kind: "resistance" | "support",
  series: PriceSeries,
  from: Bar,
  to: Bar,
  minLength: number,
  maxLength: number
): LineInstance[] {
  const range = clipInterval(series, from, to)
  if (range === undefined) return []
  const [lo, hi] = range
  const sign = kind === "resistance" ? 1 : -1
  const y = (t: Bar): number => sign * (kind === "resistance" ? series[t]!.ohlcv.high : series[t]!.ohlcv.low)

  // Positive when o → p → q turns counter-clockwise; the upper hull keeps only right turns.
  const cross = (o: Bar, p: Bar, q: Bar): number => (p - o) * (y(q) - y(o)) - (y(p) - y(o)) * (q - o)

  const out: LineInstance[] = []
  for (let a = lo; a <= hi - minLength; a++) {
    if (!Number.isFinite(y(a))) continue
    const hull: Bar[] = [a]
    const last = Math.min(hi, a + maxLength)
    for (let b = a + 1; b <= last; b++) {
      if (!Number.isFinite(y(b))) break
      while (hull.length >= 2 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, b) >= 0) {
        hull.pop()
      }
      hull.push(b)
      if (b - a < minLength) continue
      // Hull vertices 1 .. length − 2 are strictly inside the span.
      for (let k = 1; k <= hull.length - 3; k++) {
        const u = hull[k]!
        const v = hull[k + 1]!
        const slopeY = (y(v) - y(u)) / (v - u)
        const interceptY = y(u) - slopeY * u
        // "+ 0" turns a negative zero into 0, so a flat line has slope 0 on either side.
        out.push({
          kind,
          landmarks: [a, b],
          touches: [u, v],
          slope: sign * slopeY + 0,
          intercept: sign * interceptY + 0,
          score: 1,
        })
      }
    }
  }
  return out
}

/**
 * Checks the length options shared by `resistanceLine` and `supportLine` and
 * returns them with defaults applied.
 *
 * @throws {Error} if a length is not an integer, `minLength` is below 3, or
 *         `maxLength` is below `minLength`; the message names `who`.
 */
function resolveLineOptions(options: LineOptions, who: string): readonly [number, number] {
  const minLength = options.minLength ?? DEFAULT_MIN_LINE_LENGTH
  const maxLength = options.maxLength ?? DEFAULT_MAX_LINE_LENGTH
  if (!Number.isInteger(minLength) || minLength < DEFAULT_MIN_LINE_LENGTH) {
    throw new Error(`${who}: minLength must be an integer ≥ ${DEFAULT_MIN_LINE_LENGTH}, got ${minLength}.`)
  }
  if (!Number.isInteger(maxLength) || maxLength < minLength) {
    throw new Error(`${who}: maxLength must be an integer ≥ minLength (${minLength}), got ${maxLength}.`)
  }
  return [minLength, maxLength]
}

/**
 * Builds the pattern of a resistance line: a line that prices do not rise
 * above, touched at least twice.
 *
 * An instance spans bars a < b and has a line

 *   price(t) = intercept + slope × t
 *
 * through the highs at two bars u < v (its *touches*) such that
 *
 *   a < u < v < b                       (the touches lie strictly inside the span)
 *   high(t) ≤ price(t)  for every t in [a, b]     (no high is above the line)
 *
 * The landmarks are [a, b]. For each span there is one instance per such line,
 * and these lines are exactly the edges of the upper convex hull of the highs
 * that do not touch the ends of the span (see `findLines`). Prices that merely
 * come close to a line do not count: the touches are exact, and the score is 1.
 *
 * Spans range from `minLength` to `maxLength` bar steps, which keeps the
 * number of instances and the work bounded on long series. Spans that contain
 * a missing (NaN) high are skipped.
 *
 * @param options - See `LineOptions`.
 * @throws {Error} if the options are invalid.
 * @returns A `Pattern` whose instances are `LineInstance`s with landmarks [a, b], ascending by (a, b).
 */
export function resistanceLine(options: LineOptions = {}): Pattern {
  const [minLength, maxLength] = resolveLineOptions(options, "resistanceLine")
  return (series, from, to) => findLines("resistance", series, from, to, minLength, maxLength)
}

/**
 * Builds the pattern of a support line: a line that prices do not fall below,
 * touched at least twice. It is the mirror image of `resistanceLine`.
 *
 * An instance spans bars a < b and has a line
 *
 *   price(t) = intercept + slope × t
 *
 * through the lows at two bars u < v (its *touches*) such that
 *
 *   a < u < v < b                       (the touches lie strictly inside the span)
 *   low(t) ≥ price(t)  for every t in [a, b]      (no low is below the line)
 *
 * The landmarks are [a, b]. These lines are exactly the edges of the lower
 * convex hull of the lows that do not touch the ends of the span; they are
 * found by running the resistance search on the negated lows and negating the
 * result. The score is 1. Spans range from `minLength` to `maxLength` bar
 * steps, and spans that contain a missing (NaN) low are skipped.
 *
 * @param options - See `LineOptions`.
 * @throws {Error} if the options are invalid.
 * @returns A `Pattern` whose instances are `LineInstance`s with landmarks [a, b], ascending by (a, b).
 */
export function supportLine(options: LineOptions = {}): Pattern {
  const [minLength, maxLength] = resolveLineOptions(options, "supportLine")
  return (series, from, to) => findLines("support", series, from, to, minLength, maxLength)
}

