/**
 * # Economic Operations
 *
 * This module provides operations that combine or transform series to
 * produce economically meaningful quantities.
 *
 * ## Real price deflation
 *
 * A nominal price p(t) is expressed in the currency units of time t.
 * Given a price level index I(t) (e.g. CPI), the real price in the
 * units of a chosen base period t₀ is:
 *
 *   p_real(t) = p(t) × I(t₀) / I(t)
 *
 * This deflation removes the effect of general price-level inflation,
 * revealing whether an instrument's price has risen in real terms
 * (above inflation) or merely kept pace with it.
 *
 * ## Forward-filling
 *
 * The CPI is published monthly. To apply CPI deflation to daily prices,
 * we use forward-filling: each daily observation inherits the most recent
 * CPI value for which a reading exists on or before that date. This is
 * the standard approach in financial economics.
 */

import type { ISODate, PriceSeries, IndexSeries, IndexRow } from "./types.js"
import { mapPrices } from "./series.js"

/**
 * Constructs a forward-filled mapping from dates to index values.
 *
 * For each date d in `dates`, the returned Map contains the value of the
 * most recent IndexRow whose date is less than or equal to d. Formally,
 * if I = [i₁, i₂, ..., iₘ] is the index series sorted by date, then:
 *
 *   forwardFill(d) = iₖ.value  where  k = max{ j | iⱼ.date ≤ d }
 *
 * This implements the standard econometric technique of carrying the
 * last known observation forward in time (LOCF — Last Observation
 * Carried Forward).
 *
 * Time complexity: O(m log m + n log m) where m = index.length and
 * n = dates.length. The index is sorted once; each date requires a
 * binary-search-style scan.
 *
 * @param index  - The index series providing reference values.
 * @param dates  - The target dates for which values are needed.
 * @throws {Error} if any date in `dates` precedes the earliest date in `index`.
 * @returns A Map from each date in `dates` to its forward-filled index value.
 */
export function forwardFillIndex(
  index: IndexSeries,
  dates: ReadonlyArray<ISODate>
): Map<ISODate, number> {
  if (index.length === 0) {
    throw new Error("forwardFillIndex: index series is empty.")
  }

  // Work with a sorted copy to ensure correct LOCF semantics.
  const sorted = [...index].sort((a, b) => a.date.localeCompare(b.date))
  const result = new Map<ISODate, number>()

  for (const date of dates) {
    // Find the last index row with date <= target date.
    // We scan from the end for efficiency on mostly-ascending date queries.
    let value: number | undefined
    for (let i = sorted.length - 1; i >= 0; i--) {
      const row = sorted[i]!
      if (row.date <= date) {
        value = row.value
        break
      }
    }
    if (value === undefined) {
      throw new Error(
        `forwardFillIndex: no index value exists on or before date "${date}". ` +
          `Earliest available index date is "${sorted[0]!.date}".`
      )
    }
    result.set(date, value)
  }

  return result
}

/**
 * Deflates all price fields in a PriceSeries by a price-level index,
 * expressing nominal prices in the real units of a chosen base period.
 *
 * For each trading day t and base date t₀, the deflated price of field p is:
 *
 *   p_real(t) = p(t) × I(t₀) / I(t)
 *
 * where I(t) is the forward-filled index value at date t (see
 * `forwardFillIndex`). The fields deflated are: open, high, low, close,
 * adjClose. Volume is preserved unchanged.
 *
 * When `baseDate` is not specified, it defaults to the date of the first
 * row in `prices`. This means the returned series has the same nominal
 * value as the original on the first day, with all subsequent values
 * expressed in the purchasing-power units of that first day.
 *
 * **Precondition:** the index series must contain at least one observation
 * on or before the earliest date in `prices`. This is typically satisfied
 * when using FRED CPI data starting from 2006.
 *
 * @param prices   - The nominal price series to deflate.
 * @param index    - The price-level index series (e.g. CPIAUCSL).
 * @param baseDate - The base period for real prices. Defaults to the first date in prices.
 * @throws {Error} if forwardFillIndex fails (no index value before earliest price date).
 * @returns A new PriceSeries with all price fields expressed in real base-period units.
 */
export function deflate(
  prices: PriceSeries,
  index: IndexSeries,
  baseDate?: ISODate
): PriceSeries {
  if (prices.length === 0) return prices

  const dates = prices.map((r) => r.date)
  const filled = forwardFillIndex(index, dates)

  const t0 = baseDate ?? prices[0]!.date
  const baseIndexValue = filled.get(t0)
  if (baseIndexValue === undefined) {
    throw new Error(
      `deflate: no forward-filled index value found for base date "${t0}".`
    )
  }

  return mapPrices(prices, (ohlcv, date) => {
    const I_t = filled.get(date) ?? NaN
    const factor = baseIndexValue / I_t
    return {
      open: ohlcv.open * factor,
      high: ohlcv.high * factor,
      low: ohlcv.low * factor,
      close: ohlcv.close * factor,
      adjClose: ohlcv.adjClose * factor,
      volume: ohlcv.volume,
    }
  })
}

/**
 * Computes the day-over-day percentage change of a single price field
 * across a PriceSeries, returning the result as an IndexSeries.
 *
 * For a series with observations p(t₁), p(t₂), ..., p(tₙ), the
 * percentage change at position i (i ≥ 2) is:
 *
 *   r(tᵢ) = (p(tᵢ) − p(tᵢ₋₁)) / p(tᵢ₋₁) × 100
 *
 * The first observation has no previous value, so r(t₁) = NaN.
 * This convention preserves the length of the output series,
 * making it easy to align with the original series by index.
 *
 * **Note:** for return calculations, prefer `field: "adjClose"` to avoid
 * artificial discontinuities from stock splits and dividends.
 *
 * @param series - The input price series.
 * @param field  - The OHLCV field to compute returns for.
 * @returns An IndexSeries of percentage changes, same length as input.
 *          First value is NaN.
 */
export function percentChange(
  series: PriceSeries,
  field: keyof import("./types.js").OHLCV
): IndexSeries {
  if (series.length === 0) return []

  const rows: IndexRow[] = series.map((row, i) => {
    if (i === 0) {
      return { date: row.date, value: NaN }
    }
    const prev = series[i - 1]!.ohlcv[field]
    const curr = row.ohlcv[field]
    const value = prev === 0 ? NaN : ((curr - prev) / prev) * 100
    return { date: row.date, value }
  })

  return rows
}

/**
 * Computes the simple moving average (SMA) of an IndexSeries over a
 * rolling window of `window` consecutive observations.
 *
 * For a series x₁, x₂, ..., xₙ and window size w, the SMA at position
 * t (1-indexed) is:
 *
 *   SMA(t) = (1/w) × Σᵢ₌ₜ₋ w₊₁ᵗ xᵢ     for t ≥ w
 *   SMA(t) = NaN                           for t < w
 *
 * The first `w - 1` observations are NaN because there is insufficient
 * historical data to form a complete window. This convention preserves
 * the length of the output series.
 *
 * **Common uses:** smoothing noisy daily return series; computing
 * 50-day and 200-day moving averages of price series (via `percentChange`
 * or directly on an IndexSeries extracted from a PriceSeries).
 *
 * @param series - The input scalar series.
 * @param window - The number of observations to average. Must be ≥ 1.
 * @throws {Error} if `window` is less than 1.
 * @returns A new IndexSeries of the same length. The first `window - 1`
 *          values are NaN; subsequent values are simple moving averages.
 */
export function rollingMean(series: IndexSeries, window: number): IndexSeries {
  if (window < 1) {
    throw new Error(`rollingMean: window must be ≥ 1, got ${window}.`)
  }
  if (series.length === 0) return []

  return series.map((row, i) => {
    if (i < window - 1) {
      return { date: row.date, value: NaN }
    }
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) {
      sum += series[j]!.value
    }
    return { date: row.date, value: sum / window }
  })
}
