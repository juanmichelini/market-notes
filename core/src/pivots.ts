/**
 * # Pivot Segmentation
 *
 * Real price series wiggle. A pattern such as "head and shoulders" is a
 * statement about the large swings, not the daily noise, so before searching
 * we reduce a series to its **pivots**: the highs and lows of the swings that
 * are at least a given size. FCPL calls this PIP segmentation; the version
 * here is the classic zigzag filter.
 *
 * The reduced series keeps only the pivots, one row each, with open, high,
 * low and close all equal to the pivot price. The pattern primitives then see
 * a short, alternating sequence of peaks and troughs, and the search stays
 * fast. Each reduced row remembers nothing about its origin, so callers keep
 * the list of original bars (the result of `pivots`) to map landmarks back.
 */

import type { PriceRow, PriceSeries } from "./types.js"
import type { Bar } from "./patterns.js"

/**
 * Finds the pivot bars of a series: the turning points of its swings of at
 * least `threshold`, measured on the adjusted close.
 *
 * A swing is a move from one extreme to the next in the opposite direction. A
 * rising swing is confirmed when the price falls from its highest point by a
 * fraction `threshold` of that point,
 *
 *   price ≤ peak × (1 − threshold)
 *
 * and a falling swing is confirmed when the price rises from its lowest point
 * by a fraction `threshold`,
 *
 *   price ≥ trough × (1 + threshold)
 *
 * The extreme of each confirmed swing is a pivot. The last extreme, which has
 * not been confirmed yet, is included as the final pivot. Pivots alternate
 * between peaks and troughs. Missing (NaN) prices are skipped.
 *
 * @param series - The prices; adjusted closes must be positive where present.
 * @param threshold - The smallest swing to keep, as a fraction in (0, 1); 0.05 is 5%.
 * @throws {Error} if `threshold` is not in (0, 1) or a price is zero or negative.
 * @returns The pivot bars in ascending order; empty if fewer than two swings' worth of data exists.
 */
export function pivots(series: PriceSeries, threshold: number): ReadonlyArray<Bar> {
  if (!(threshold > 0 && threshold < 1)) {
    throw new Error(`pivots: threshold must be in (0, 1), got ${threshold}.`)
  }
  const price = (b: Bar): number => series[b]!.ohlcv.adjClose
  const out: Bar[] = []
  let direction: 0 | 1 | -1 = 0
  let lowBar = -1
  let highBar = -1
  let extreme = -1

  for (let i = 0; i < series.length; i++) {
    const p = price(i)
    if (Number.isNaN(p)) continue
    if (p <= 0) throw new Error(`pivots: prices must be positive, got ${p} at bar ${i}.`)
    if (direction === 0) {
      if (lowBar < 0) {
        lowBar = i
        highBar = i
        continue
      }
      if (p > price(highBar)) highBar = i
      if (p < price(lowBar)) lowBar = i
      if (p >= price(lowBar) * (1 + threshold) && highBar === i) {
        out.push(lowBar)
        direction = 1
        extreme = i
      } else if (p <= price(highBar) * (1 - threshold) && lowBar === i) {
        out.push(highBar)
        direction = -1
        extreme = i
      }
    } else if (direction === 1) {
      if (p > price(extreme)) extreme = i
      else if (p <= price(extreme) * (1 - threshold)) {
        out.push(extreme)
        direction = -1
        extreme = i
      }
    } else {
      if (p < price(extreme)) extreme = i
      else if (p >= price(extreme) * (1 + threshold)) {
        out.push(extreme)
        direction = 1
        extreme = i
      }
    }
  }
  if (direction !== 0) out.push(extreme)
  return out
}

/**
 * Builds the reduced series that keeps only the given bars. Each row has its
 * open, high, low, close and adjusted close set to the adjusted close of the
 * original bar, so that comparing "the high at a landmark" means comparing the
 * pivot price.
 *
 * @param series - The original series.
 * @param bars - Bars of `series` in ascending order, such as the result of `pivots`.
 * @returns A series of the same length as `bars`; row k is built from bar `bars[k]`.
 */
export function reduceSeries(series: PriceSeries, bars: ReadonlyArray<Bar>): PriceSeries {
  return bars.map((b): PriceRow => {
    const row = series[b]!
    const p = row.ohlcv.adjClose
    return {
      date: row.date,
      ohlcv: { open: p, high: p, low: p, close: p, adjClose: p, volume: row.ohlcv.volume },
    }
  })
}
