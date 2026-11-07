/**
 * # Chart Pattern Vocabulary
 *
 * This module defines the vocabulary of the pattern recognition DSL (see
 * ADR-008), which follows CPL: Anand, Chin and Khoo, *Charting Patterns on
 * Price History*, ICFP 2001.
 *
 * ## Bars, patterns and instances
 *
 * A **bar** is a position in a `PriceSeries`: the integer index of one
 * trading day. All geometry in the DSL is expressed in bars and prices, so no
 * `Date` arithmetic is needed.
 *
 * A **pattern** is a *description* of a shape, such as "a rise followed by a
 * fall". A pattern is a function. Given a series and an interval of bars, it
 * returns every **instance** of the shape that lies entirely inside the
 * interval. An instance is one concrete occurrence: which bars anchor it and
 * how well it matches the description.
 *
 * ## Landmarks
 *
 * The bars that anchor an instance's shape are its **landmarks**: the start
 * and end of a rise, the two ends of a trend line, and so on. Constraints on a
 * pattern are written over its landmarks ("the middle peak is higher than the
 * outer ones"), which lets a pattern be described at a macroscopic level,
 * ignoring the small fluctuations between landmarks.
 *
 * ## Composition
 *
 * Instances are either primitive or composite. A composite instance records
 * the instances it was built from, its **components**. Composites are
 * produced by the combinators `followedBy` and `overlay`; the landmarks of a
 * composite are derived from its components, never stored, so a composite
 * cannot disagree with its parts.
 */

import type { PriceSeries } from "./types.js"
import type { Fuzzy } from "./fuzzy.js"

/**
 * A position in a `PriceSeries`: the zero-based index of one row.
 *
 * Bar `b` of a series `S` is the row `S[b]`. Bars are plain integers so
 * that intervals of bars are cheap to compute with; a bar that does not
 * exist in the series being searched is a caller error.
 */
export type Bar = number

/**
 * An instance of a primitive shape that is not a line: a single bar, a rise
 * (`up`), a fall (`down`) or a level stretch (`horizontal`).
 *
 * - `bar` has one landmark, the bar itself.
 * - `up`, `down` and `horizontal` have two landmarks, the first and last bar
 *   of the stretch, in ascending order.
 *
 * `score` is the degree to which the stretch matches its definition, in [0, 1].
 */
export interface ShapeInstance {
  readonly kind: "bar" | "up" | "down" | "horizontal"
  readonly landmarks: ReadonlyArray<Bar>
  readonly score: Fuzzy
}

/**
 * An instance of a resistance line or a support line over an interval of bars.
 *
 * The line is the straight line through the prices at its two `touches`:
 *
 *   price(t) = intercept + slope × t
 *
 * where t is a bar and `slope` is in price units per bar. A resistance line
 * lies on or above every high in its span; a support line lies on or below
 * every low. `landmarks` are the first and last bar of the span (the touches
 * lie strictly between them).
 */
export interface LineInstance {
  readonly kind: "resistance" | "support"
  readonly landmarks: readonly [Bar, Bar]
  readonly touches: readonly [Bar, Bar]
  readonly slope: number
  readonly intercept: number
  readonly score: Fuzzy
}

/**
 * An instance built from other instances by a combinator.
 *
 * - `followedBy`: the parts follow one another in time, each ending at the
 *   bar where the next begins.
 * - `overlay`: the parts all span exactly the same interval of bars.
 *
 * `parts` are the components, in the order of the combinator's operands.
 * Landmarks are not stored; see `landmarks`.
 */
export interface CompositeInstance {
  readonly kind: "followedBy" | "overlay"
  readonly parts: ReadonlyArray<Instance>
  readonly score: Fuzzy
}

/** One occurrence of a pattern: a shape, a line, or a composite of instances. */
export type Instance = ShapeInstance | LineInstance | CompositeInstance

/**
 * A pattern: a pure function from a series and a closed interval of bars
 * [from, to] to all instances of the pattern that lie entirely inside that
 * interval.
 *
 *   pattern(series, from, to) = { i | every landmark of i lies in [from, to] }
 *
 * **Contract.** A pattern never modifies the series. It returns instances in
 * ascending order of (first landmark, last landmark); the combinators rely on
 * this order. An interval that extends past the series is clipped to it.
 *
 * Patterns are values, so they are built and combined with ordinary function
 * calls; see `constrainedBy`, `followedBy` and `overlay`.
 */
export type Pattern = (series: PriceSeries, from: Bar, to: Bar) => ReadonlyArray<Instance>

/**
 * Returns the landmarks of an instance: the bars that anchor its shape.
 * This is `lms` in CPL.
 *
 * - A primitive instance stores its landmarks.
 * - A `followedBy` instance lists the landmarks of its first part, then those
 *   of every later part without its first one, because that bar is the
 *   junction already listed. For parts with n₁, n₂, ..., nₖ landmarks the
 *   result has n₁ + n₂ + ... + nₖ − (k − 1) landmarks.
 * - An `overlay` instance has parts that start and end at the same bars, so
 *   the first and last bar are listed once and the inner landmarks of each
 *   part are listed in between, part by part. For two parts with n₁ and n₂
 *   landmarks the result has n₁ + n₂ − 2 landmarks. If the parts are single
 *   bars, the result is that one bar.
 *
 * @param instance - Any instance.
 * @returns The landmarks, ascending within each part. An overlay lists the inner landmarks of its parts one part after another, so the list is ordered by part rather than strictly by bar.
 */
export function landmarks(instance: Instance): ReadonlyArray<Bar> {
  switch (instance.kind) {
    case "followedBy": {
      const lists = instance.parts.map(landmarks)
      const [head, ...rest] = lists
      if (head === undefined) return []
      return [...head, ...rest.flatMap((l) => l.slice(1))]
    }
    case "overlay": {
      const lists = instance.parts.map(landmarks)
      const first = lists[0]
      if (first === undefined) return []
      if (first.length === 1) return first
      const inner = lists.flatMap((l) => l.slice(1, -1))
      return [first[0]!, ...inner, first[first.length - 1]!]
    }
    default:
      return instance.landmarks
  }
}

/**
 * Returns the components of an instance: the instances it was built from.
 * This is `sub` in CPL.
 *
 * For a composite instance these are its parts, in the order of the
 * combinator's operands. For a primitive instance, which is not built from
 * anything, the result is the instance itself as a one-element list, so
 * callers can treat primitives and composites uniformly.
 *
 * @param instance - Any instance.
 * @returns The components.
 */
export function components(instance: Instance): ReadonlyArray<Instance> {
  return instance.kind === "followedBy" || instance.kind === "overlay" ? instance.parts : [instance]
}

/**
 * Returns the span of an instance: its first and last bar,
 *
 *   span(i) = [ min of landmarks(i), max of landmarks(i) ]
 *
 * The span of a single bar is [b, b].
 *
 * @param instance - Any instance with at least one landmark.
 * @throws {Error} if the instance has no landmarks.
 * @returns A pair [first bar, last bar].
 */
export function span(instance: Instance): readonly [Bar, Bar] {
  const ls = landmarks(instance)
  if (ls.length === 0) {
    throw new Error("span: instance has no landmarks.")
  }
  let first = ls[0]!
  let last = ls[0]!
  for (const b of ls) {
    if (b < first) first = b
    if (b > last) last = b
  }
  return [first, last]
}
