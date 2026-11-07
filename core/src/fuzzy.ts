/**
 * # Fuzzy Truth Values
 *
 * Chart patterns are defined subjectively: one analyst's "approximately level
 * shoulders" is another's "clearly uneven". Instead of fixing one threshold
 * for everybody, a pattern instance carries a *degree of truth* saying how
 * well it matches its definition. This is the approach of CPL (Anand, Chin,
 * Khoo, ICFP 2001); see ADR-008.
 *
 * A degree of truth is a number in the closed interval [0, 1]. The value 1
 * means the statement holds completely, 0 means it does not hold at all, and
 * values in between mean it holds to that degree. On the values 0 and 1 the
 * connectives below agree with ordinary Boolean logic.
 *
 * `NaN` is not a degree of truth. A missing observation is unknown, not
 * false, so the connectives reject it instead of silently treating it as
 * 0 or 1.
 */

/**
 * A degree of truth: a number in [0, 1].
 *
 * The alias documents intent in signatures. It does not enforce the range;
 * the functions in this module check it at their boundaries.
 */
export type Fuzzy = number

/**
 * Checks that `x` is a degree of truth and returns it.
 *
 * @throws {Error} if `x` is NaN or lies outside [0, 1]; the message names
 *         the calling function `who`.
 */
function requireFuzzy(x: number, who: string): Fuzzy {
  if (Number.isNaN(x)) {
    throw new Error(`${who}: NaN is not a degree of truth (missing is not zero).`)
  }
  if (x < 0 || x > 1) {
    throw new Error(`${who}: degree of truth must lie in [0, 1], got ${x}.`)
  }
  return x
}

/**
 * Fuzzy conjunction ("and") of a list of degrees of truth, defined as the
 * minimum:
 *
 *   AND(x₁, ..., xₙ) = min(x₁, ..., xₙ)
 *
 * A conjunction is only as true as its least true part. The empty
 * conjunction is 1, the identity of the minimum on [0, 1]: a pattern with no
 * constraints is fully satisfied.
 *
 * @param values - Degrees of truth, each in [0, 1].
 * @throws {Error} if any value is NaN or outside [0, 1].
 * @returns The minimum of the values, or 1 when the list is empty.
 */
export function fuzzyAnd(values: ReadonlyArray<Fuzzy>): Fuzzy {
  let result: Fuzzy = 1
  for (const v of values) {
    result = Math.min(result, requireFuzzy(v, "fuzzyAnd"))
  }
  return result
}

/**
 * Fuzzy disjunction ("or") of a list of degrees of truth, defined as the
 * maximum:
 *
 *   OR(x₁, ..., xₙ) = max(x₁, ..., xₙ)
 *
 * A disjunction is as true as its most true part. The empty disjunction is
 * 0, the identity of the maximum on [0, 1]: with no alternatives, nothing
 * holds.
 *
 * @param values - Degrees of truth, each in [0, 1].
 * @throws {Error} if any value is NaN or outside [0, 1].
 * @returns The maximum of the values, or 0 when the list is empty.
 */
export function fuzzyOr(values: ReadonlyArray<Fuzzy>): Fuzzy {
  let result: Fuzzy = 0
  for (const v of values) {
    result = Math.max(result, requireFuzzy(v, "fuzzyOr"))
  }
  return result
}

/**
 * Fuzzy negation ("not") of a degree of truth:
 *
 *   NOT(x) = 1 − x
 *
 * Negation is an involution (NOT(NOT(x)) = x) and, together with `fuzzyAnd`
 * and `fuzzyOr`, satisfies De Morgan's laws:
 *
 *   NOT(AND(a, b)) = OR(NOT(a), NOT(b))
 *   NOT(OR(a, b))  = AND(NOT(a), NOT(b))
 *
 * @param x - A degree of truth in [0, 1].
 * @throws {Error} if `x` is NaN or outside [0, 1].
 * @returns 1 − x.
 */
export function fuzzyNot(x: Fuzzy): Fuzzy {
  return 1 - requireFuzzy(x, "fuzzyNot")
}
