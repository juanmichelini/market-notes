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
import type { Instance, Pattern } from "./patterns.js"
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
