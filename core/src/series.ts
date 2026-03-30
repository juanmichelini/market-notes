/**
 * # Time Series Operations
 *
 * This module provides pure transformations over `PriceSeries` and
 * `IndexSeries` values. Each operation takes one or more series as input
 * and returns a new series, never modifying the inputs.
 *
 * ## Design rationale
 *
 * Financial time series analysis is fundamentally a discipline of
 * transforming ordered sequences of observations. By expressing all
 * operations as pure functions over immutable arrays, we gain three
 * properties that are difficult to achieve with mutable objects:
 *
 * 1. **Referential transparency**: calling a function twice with the same
 *    inputs always produces the same output. This makes testing trivial and
 *    debugging straightforward.
 *
 * 2. **Composability**: the output of any function can be passed directly
 *    to any other function that accepts the same type. Complex analyses
 *    are built by composing simple operations.
 *
 * 3. **Invariant preservation**: since we never modify the inputs, the
 *    invariants of the input series (ascending date order, no duplicates,
 *    no ±Infinity) need only be checked once at parse time and are then
 *    guaranteed throughout the computation.
 *
 * All functions in this module assume their inputs satisfy the PriceSeries
 * and IndexSeries invariants. Violations will produce silently incorrect
 * results, not thrown exceptions — this is an intentional design choice
 * that mirrors mathematical convention (garbage in, garbage out).
 */

import type { ISODate, OHLCV, PriceRow, PriceSeries, IndexRow, IndexSeries } from "./types.js"

/**
 * Returns the sub-range of a PriceSeries whose dates fall within the
 * closed interval [from, to].
 *
 * Formally, given a series S = [s₁, s₂, ..., sₙ] sorted by date,
 * `sliceByDate(S, from, to)` returns the subsequence
 * { sᵢ ∈ S | from ≤ sᵢ.date ≤ to }.
 *
 * The comparison is lexicographic on the ISO 8601 date string, which is
 * equivalent to chronological order for well-formed YYYY-MM-DD strings.
 *
 * @param series - The input price series, sorted in ascending date order.
 * @param from   - The earliest date to include (inclusive).
 * @param to     - The latest date to include (inclusive).
 * @returns A new PriceSeries containing only rows within [from, to].
 */
export function sliceByDate(
  series: PriceSeries,
  from: ISODate,
  to: ISODate
): PriceSeries {
  return series.filter((row) => row.date >= from && row.date <= to)
}

/**
 * Returns the sub-range of an IndexSeries whose dates fall within the
 * closed interval [from, to].
 *
 * This is the IndexSeries analogue of `sliceByDate`. The same semantics
 * and lexicographic date comparison apply.
 *
 * @param series - The input index series, sorted in ascending date order.
 * @param from   - The earliest date to include (inclusive).
 * @param to     - The latest date to include (inclusive).
 * @returns A new IndexSeries containing only rows within [from, to].
 */
export function sliceIndexByDate(
  series: IndexSeries,
  from: ISODate,
  to: ISODate
): IndexSeries {
  return series.filter((row) => row.date >= from && row.date <= to)
}

/**
 * Computes the inner join of two PriceSeries on the `date` field.
 *
 * Given series A and B, `alignDates(A, B)` returns the pair [A', B'] where:
 *   - A' = { a ∈ A | ∃ b ∈ B such that b.date = a.date }
 *   - B' = { b ∈ B | ∃ a ∈ A such that a.date = b.date }
 *
 * The result arrays have equal length and aligned indices:
 * A'[i].date = B'[i].date for all i.
 *
 * This operation is necessary before computing ratios, correlations, or
 * any element-wise arithmetic between two series. For example, computing
 * the price ratio of AAPL to GOOGL requires that both series have
 * observations on exactly the same trading days.
 *
 * @param a - First price series.
 * @param b - Second price series.
 * @returns A tuple [a', b'] of equal-length series with matching dates.
 */
export function alignDates(
  a: PriceSeries,
  b: PriceSeries
): [PriceSeries, PriceSeries] {
  const bDates = new Set(b.map((r) => r.date))
  const filteredA = a.filter((r) => bDates.has(r.date))
  const aDates = new Set(filteredA.map((r) => r.date))
  const filteredB = b.filter((r) => aDates.has(r.date))
  return [filteredA, filteredB]
}

/**
 * Aligns a PriceSeries to an IndexSeries by retaining only the dates
 * present in both series.
 *
 * This is a restricted inner join used when an economic index (e.g. CPI)
 * has been resampled or forward-filled to daily frequency and we need to
 * confirm that every price observation has a corresponding index value.
 *
 * Note: for the typical use case of applying CPI deflation to daily prices,
 * prefer `deflate` in operations.ts, which handles the monthly-to-daily
 * frequency mismatch via forward-filling rather than inner join.
 * Use `alignPriceToIndex` only when an exact date match is required.
 *
 * @param prices - The price series.
 * @param index  - The index series.
 * @returns A tuple [prices', index'] of equal-length series with matching dates.
 */
export function alignPriceToIndex(
  prices: PriceSeries,
  index: IndexSeries
): [PriceSeries, IndexSeries] {
  const indexDates = new Set(index.map((r) => r.date))
  const filteredPrices = prices.filter((r) => indexDates.has(r.date))
  const priceDates = new Set(filteredPrices.map((r) => r.date))
  const filteredIndex = index.filter((r) => priceDates.has(r.date))
  return [filteredPrices, filteredIndex]
}

/**
 * Applies a pure function to the OHLCV value of every row in a PriceSeries,
 * returning a new PriceSeries with the transformed values.
 *
 * The date of each row and the structural invariants of the series are
 * preserved. The function `fn` receives both the OHLCV value and the
 * corresponding date, enabling date-dependent transformations.
 *
 * This is the fundamental building block for price transformations such
 * as deflation and normalization.
 *
 * @param series - The input price series.
 * @param fn     - A pure function from (OHLCV, ISODate) to OHLCV.
 * @returns A new PriceSeries with `fn` applied to each OHLCV value.
 */
export function mapPrices(
  series: PriceSeries,
  fn: (ohlcv: OHLCV, date: ISODate) => OHLCV
): PriceSeries {
  return series.map((row) => ({
    date: row.date,
    ohlcv: fn(row.ohlcv, row.date),
  }))
}

/**
 * Applies a pure function to the scalar value of every row in an IndexSeries,
 * returning a new IndexSeries with the transformed values.
 *
 * The date of each row is preserved. The function `fn` receives both the
 * scalar value and the corresponding date.
 *
 * @param series - The input index series.
 * @param fn     - A pure function from (number, ISODate) to number.
 * @returns A new IndexSeries with `fn` applied to each value.
 */
export function mapIndex(
  series: IndexSeries,
  fn: (value: number, date: ISODate) => number
): IndexSeries {
  return series.map((row) => ({
    date: row.date,
    value: fn(row.value, row.date),
  }))
}

/**
 * Rebases a PriceSeries so that the `adjClose` on the base date equals 100,
 * with all other price fields scaled proportionally.
 *
 * Given a series S and a base date t₀, the normalized price field p at
 * date t is:
 *
 *   p_normalized(t) = p(t) × 100 / adjClose(t₀)
 *
 * This transformation makes it straightforward to compare the relative
 * performance of multiple instruments over a common time horizon: all
 * series start at 100 on the base date, and subsequent values represent
 * percentage of the base-date price.
 *
 * The scalar factor is derived from `adjClose` on the base date (not `close`)
 * so that the rebased series correctly represents split- and dividend-adjusted
 * performance from the base date forward.
 *
 * Volume is preserved unchanged, as it is not a price and should not be
 * scaled by a price factor.
 *
 * @param series   - The input price series, sorted in ascending date order.
 * @param baseDate - The date at which the rebased series equals 100.
 *                   Defaults to the date of the first row.
 * @throws {Error} if `baseDate` is specified but not found in the series.
 * @throws {Error} if the adjClose on `baseDate` is zero or NaN.
 * @returns A new PriceSeries with all price fields rebased to 100 at baseDate.
 */
export function normalizePriceSeries(
  series: PriceSeries,
  baseDate?: ISODate
): PriceSeries {
  if (series.length === 0) return series

  const targetDate = baseDate ?? series[0]!.date
  const baseRow = series.find((r) => r.date === targetDate)
  if (!baseRow) {
    throw new Error(
      `normalizePriceSeries: base date "${targetDate}" not found in series.`
    )
  }
  const baseValue = baseRow.ohlcv.adjClose
  if (!isFinite(baseValue) || baseValue === 0) {
    throw new Error(
      `normalizePriceSeries: adjClose on base date "${targetDate}" is ${baseValue}; cannot normalize.`
    )
  }

  const factor = 100 / baseValue
  return mapPrices(series, (ohlcv) => ({
    open: ohlcv.open * factor,
    high: ohlcv.high * factor,
    low: ohlcv.low * factor,
    close: ohlcv.close * factor,
    adjClose: ohlcv.adjClose * factor,
    volume: ohlcv.volume,
  }))
}

/**
 * Rebases an IndexSeries so that the value on the base date equals 100.
 *
 * Given a series S and a base date t₀, the normalized value at date t is:
 *
 *   v_normalized(t) = v(t) × 100 / v(t₀)
 *
 * This is the scalar analogue of `normalizePriceSeries`. It is used, for
 * example, to rebase a CPI series to a chosen base period before comparing
 * it with a rebased equity series on the same chart.
 *
 * @param series   - The input index series, sorted in ascending date order.
 * @param baseDate - The date at which the rebased series equals 100.
 *                   Defaults to the date of the first row.
 * @throws {Error} if `baseDate` is specified but not found in the series.
 * @throws {Error} if the value on `baseDate` is zero or NaN.
 * @returns A new IndexSeries with values rebased to 100 at baseDate.
 */
export function normalizeIndexSeries(
  series: IndexSeries,
  baseDate?: ISODate
): IndexSeries {
  if (series.length === 0) return series

  const targetDate = baseDate ?? series[0]!.date
  const baseRow = series.find((r) => r.date === targetDate)
  if (!baseRow) {
    throw new Error(
      `normalizeIndexSeries: base date "${targetDate}" not found in series.`
    )
  }
  const baseValue = baseRow.value
  if (!isFinite(baseValue) || baseValue === 0) {
    throw new Error(
      `normalizeIndexSeries: value on base date "${targetDate}" is ${baseValue}; cannot normalize.`
    )
  }

  const factor = 100 / baseValue
  return mapIndex(series, (v) => v * factor)
}
