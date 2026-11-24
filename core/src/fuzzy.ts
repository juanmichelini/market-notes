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

// ---------------------------------------------------------------------------
// Fuzzy comparison
// ---------------------------------------------------------------------------

/**
 * The share of the reference magnitude used as the width of a fuzzy
 * comparison when the caller gives none: 5 percent.
 *
 * Prices of different instruments live on different scales, so a default
 * expressed in price units would suit none of them. A relative default
 * behaves the same for a 10-dollar stock and a 2000-dollar future.
 */
export const DEFAULT_RELATIVE_WIDTH = 0.05

/**
 * Resolves the width of a fuzzy comparison: the caller's explicit width, or
 * `DEFAULT_RELATIVE_WIDTH` times the magnitude of `scale`.
 *
 * @throws {Error} if the explicit width is negative or NaN; the message
 *         names the calling function `who`.
 */
function resolveWidth(a: number | undefined, scale: number, who: string): number {
  const width = a ?? DEFAULT_RELATIVE_WIDTH * Math.abs(scale)
  if (!(width >= 0)) {
    throw new Error(`${who}: width must be a non-negative number, got ${a}.`)
  }
  return width
}

/**
 * Degree to which x is approximately equal to y, using a triangular
 * membership function of half-width a:
 *
 *   approxEqual(x, y, a) = max(0, 1 − |x − y| / a)
 *
 * The value is 1 when x = y and falls in a straight line to 0 at a distance
 * of a. In CPL this is the fuzzy operator written ≍ (Anand, Chin, Khoo,
 * section 4.2); the larger a is, the more distant values still count as
 * "nearly equal" to some degree. The function is symmetric in x and y.
 *
 * When `a` is omitted, the width is `DEFAULT_RELATIVE_WIDTH` times
 * max(|x|, |y|), which keeps the function symmetric. A width of 0 gives
 * crisp equality. Infinite operands are compared exactly.
 *
 * @param x - The first value.
 * @param y - The second value.
 * @param a - The width of the membership function, in the units of x and y. Must be ≥ 0.
 * @throws {Error} if `a` is negative or NaN.
 * @returns A degree of truth in [0, 1], or NaN if x or y is NaN.
 */
export function approxEqual(x: number, y: number, a?: number): Fuzzy {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN
  const width = resolveWidth(a, Math.max(Math.abs(x), Math.abs(y)), "approxEqual")
  if (x === y) return 1
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0
  if (width === 0) return 0
  return Math.max(0, 1 - Math.abs(x - y) / width)
}

/**
 * Degree to which x is approximately greater than or equal to y:
 *
 *   approxGreater(x, y, a) = clamp((x − (y − a)) / a, 0, 1)
 *
 * The value is 1 whenever x ≥ y, falls in a straight line as x drops below
 * y, and is 0 once x ≤ y − a. It is non-decreasing in x. This is the fuzzy
 * operator written ≻ in CPL, which lets a definition such as "the rise is
 * usually greater than 10 units" accept a rise of 9.5 to a high degree
 * instead of rejecting it outright.
 *
 * When `a` is omitted, the width is `DEFAULT_RELATIVE_WIDTH` times |y|; if
 * that is 0 (y = 0) the comparison is crisp. A width of 0 gives the crisp
 * comparison x ≥ y. Infinite operands are compared exactly.
 *
 * @param x - The value being compared.
 * @param y - The reference value.
 * @param a - The width of the membership function, in the units of x and y. Must be ≥ 0.
 * @throws {Error} if `a` is negative or NaN.
 * @returns A degree of truth in [0, 1], or NaN if x or y is NaN.
 */
export function approxGreater(x: number, y: number, a?: number): Fuzzy {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN
  const width = resolveWidth(a, y, "approxGreater")
  if (width === 0 || !Number.isFinite(x) || !Number.isFinite(y)) return x >= y ? 1 : 0
  return Math.min(1, Math.max(0, (x - (y - width)) / width))
}

/**
 * Degree to which x is approximately less than or equal to y:
 *
 *   approxLess(x, y, a) = clamp(((y + a) − x) / a, 0, 1)
 *
 * The mirror image of `approxGreater`: 1 whenever x ≤ y, falling to 0 at
 * x ≥ y + a. It is non-increasing in x. This is the fuzzy operator written
 * ≺ in CPL.
 *
 * When `a` is omitted, the width is `DEFAULT_RELATIVE_WIDTH` times |y|; if
 * that is 0 (y = 0) the comparison is crisp. A width of 0 gives the crisp
 * comparison x ≤ y. Infinite operands are compared exactly.
 *
 * @param x - The value being compared.
 * @param y - The reference value.
 * @param a - The width of the membership function, in the units of x and y. Must be ≥ 0.
 * @throws {Error} if `a` is negative or NaN.
 * @returns A degree of truth in [0, 1], or NaN if x or y is NaN.
 */
export function approxLess(x: number, y: number, a?: number): Fuzzy {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN
  const width = resolveWidth(a, y, "approxLess")
  if (width === 0 || !Number.isFinite(x) || !Number.isFinite(y)) return x <= y ? 1 : 0
  return Math.min(1, Math.max(0, (y + width - x) / width))
}
