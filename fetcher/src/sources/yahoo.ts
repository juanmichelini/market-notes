/**
 * Yahoo Finance adapter.
 *
 * Fetches historical daily OHLCV data using the yahoo-finance2 package.
 * Returns a PriceSeries sorted in ascending date order.
 */
import yahooFinance from "yahoo-finance2"
import { type PriceSeries, type PriceRow, isoDate } from "@market-notes/core"

export async function fetchPriceSeries(
  sym: string,
  from: string,
  to: string
): Promise<PriceSeries> {
  const result = await yahooFinance.historical(sym, {
    period1: from,
    period2: to,
    interval: "1d",
  })

  const rows: PriceRow[] = result
    .filter((r) => r.open != null && r.close != null)
    .map((r) => ({
      date: isoDate(r.date.toISOString().slice(0, 10)),
      ohlcv: {
        open: r.open ?? NaN,
        high: r.high ?? NaN,
        low: r.low ?? NaN,
        close: r.close ?? NaN,
        adjClose: r.adjClose ?? r.close ?? NaN,
        volume: r.volume ?? 0,
      },
    }))

  return rows.sort((a, b) => a.date.localeCompare(b.date))
}
