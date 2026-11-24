/**
 * # Pattern Combinators
 *
 * The operators that build new patterns from existing ones (ADR-008), with the
 * meaning they have in CPL (Anand, Chin, Khoo, ICFP 2001):
 *
 *   constrainedBy   keep the instances that satisfy a condition
 *   followedBy      one pattern, then another, sharing a junction bar
 *   overlay         two patterns over exactly the same interval
 *
 * Every combinator is a pure function from patterns to a pattern.
 */

import type { PriceSeries } from "./types.js"
import { span, type Bar, type CompositeInstance, type Instance, type Pattern } from "./patterns.js"
import type { Fuzzy } from "./fuzzy.js"

/**
 * A condition on an instance, written over its landmarks and the series.
 *
 * Returns the degree, in [0, 1], to which the instance satisfies the
 * condition: 1 is fully, 0 not at all. Returns NaN when the condition cannot
 * be decided because a price it needs is missing. Build constraints from the
 * comparators in `fuzzy.ts`, and join them with `fuzzyAnd` and `fuzzyOr`.
 */
export type Constraint = (series: PriceSeries, instance: Instance) => Fuzzy

/**
 * Restricts a pattern to the instances that satisfy a constraint.
 *
 * For an instance i of `pattern` with score s and constraint value c:
 *
 *   c = 0 or c is NaN   →  i is dropped
 *   otherwise           →  i is kept, with score min(s, c)
 *
 * An unknown constraint (NaN) drops the instance rather than counting as 0
 * or 1, in line with ADR-008. The result is never larger than `pattern`'s and
 * keeps its order. Constraining twice equals constraining once by the minimum
 * of the two constraints.
 *
 * @param pattern - The pattern to restrict.
 * @param constraint - The condition each instance must satisfy.
 * @throws {Error} (when the returned pattern is run) if a constraint returns a number outside [0, 1] other than NaN.
 * @returns A pattern whose instances are those of `pattern` that satisfy `constraint`.
 */
export function constrainedBy(pattern: Pattern, constraint: Constraint): Pattern {
  return (series, from, to) => {
    const out: Instance[] = []
    for (const instance of pattern(series, from, to)) {
      const c = constraint(series, instance)
      if (Number.isNaN(c)) continue
      if (c < 0 || c > 1) {
        throw new Error(`constrainedBy: constraint must be in [0, 1] or NaN, got ${c}.`)
      }
      if (c === 0) continue
      out.push({ ...instance, score: Math.min(instance.score, c) })
    }
    return out
  }
}

/** Orders instances by (first bar, last bar) of their span, as the `Pattern` contract requires. */
function bySpan(x: Instance, y: Instance): number {
  const [xa, xb] = span(x)
  const [ya, yb] = span(y)
  return xa - ya || xb - yb
}

/**
 * Chains two patterns in time: an instance of `first` followed by an instance
 * of `second` that starts at the very bar where the first ends.
 *
 * For instances i of `first` and j of `second`, both inside [from, to]:
 *
 *   last bar of span(i) = first bar of span(j)
 *
 * gives one composite instance with parts [i, j] and score min(score i, score j).
 * The junction bar is listed once in the landmarks (see `landmarks`). The
 * operator is associative: chaining three patterns gives the same landmarks and
 * scores however the chaining is bracketed.
 *
 * @param first - The pattern that comes first in time.
 * @param second - The pattern that comes next.
 * @returns A pattern whose instances are `followedBy` composites, ascending by span.
 */
export function followedBy(first: Pattern, second: Pattern): Pattern {
  return (series, from, to) => {
    const starts = new Map<Bar, Instance[]>()
    for (const j of second(series, from, to)) {
      const start = span(j)[0]
      const list = starts.get(start)
      if (list === undefined) starts.set(start, [j])
      else list.push(j)
    }
    const out: CompositeInstance[] = []
    for (const i of first(series, from, to)) {
      for (const j of starts.get(span(i)[1]) ?? []) {
        out.push({ kind: "followedBy", parts: [i, j], score: Math.min(i.score, j.score) })
      }
    }
    return out.sort(bySpan)
  }
}

/**
 * Lays two patterns over exactly the same stretch of bars: an instance of
 * `first` and one of `second` with the same span.
 *
 * For instances i and j inside [from, to] with span(i) = span(j), the result
 * has one composite with parts [i, j] and score min(score i, score j). Every
 * such pair is reported. The operator is associative in landmarks and scores.
 *
 * @param first - One pattern.
 * @param second - The pattern to lay over it.
 * @returns A pattern whose instances are `overlay` composites, ascending by span.
 */
export function overlay(first: Pattern, second: Pattern): Pattern {
  return (series, from, to) => {
    const spans = new Map<string, Instance[]>()
    for (const j of second(series, from, to)) {
      const key = span(j).join(",")
      const list = spans.get(key)
      if (list === undefined) spans.set(key, [j])
      else list.push(j)
    }
    const out: CompositeInstance[] = []
    for (const i of first(series, from, to)) {
      for (const j of spans.get(span(i).join(",")) ?? []) {
        out.push({ kind: "overlay", parts: [i, j], score: Math.min(i.score, j.score) })
      }
    }
    return out.sort(bySpan)
  }
}
