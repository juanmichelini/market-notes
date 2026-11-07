/**
 * # Pattern Search
 *
 * Runs a pattern over a series and returns the best matches first.
 */

import type { PriceSeries } from "./types.js"
import { span, type Bar, type Instance, type Pattern } from "./patterns.js"

/** Options for `findPatterns`. */
export interface FindOptions {
  /** First bar to search. Defaults to 0. */
  readonly from?: Bar
  /** Last bar to search. Defaults to the last bar of the series. */
  readonly to?: Bar
  /** Drop instances scoring below this, in [0, 1]. Defaults to 0 (keep all matches). */
  readonly minScore?: number
}

/**
 * Finds all instances of a pattern in a series and orders them for display.
 *
 * Runs `pattern` over [from, to], drops instances whose score is below
 * `minScore`, and sorts the rest by descending score, then by ascending first
 * bar, then by ascending last bar, so ties come out in a stable order.
 *
 * @param series - The prices to search.
 * @param pattern - The pattern to find.
 * @param options - See `FindOptions`.
 * @throws {Error} if `minScore` is outside [0, 1].
 * @returns The matching instances, best first; empty for an empty series.
 */
export function findPatterns(
  series: PriceSeries,
  pattern: Pattern,
  options: FindOptions = {}
): ReadonlyArray<Instance> {
  const minScore = options.minScore ?? 0
  if (!(minScore >= 0 && minScore <= 1)) {
    throw new Error(`findPatterns: minScore must be in [0, 1], got ${minScore}.`)
  }
  if (series.length === 0) return []
  const from = options.from ?? 0
  const to = options.to ?? series.length - 1
  return pattern(series, from, to)
    .filter((i) => i.score >= minScore)
    .map((i) => ({ i, s: span(i) }))
    .sort((x, y) => y.i.score - x.i.score || x.s[0] - y.s[0] || x.s[1] - y.s[1])
    .map((x) => x.i)
}
