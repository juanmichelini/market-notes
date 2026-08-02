/**
 * Yahoo Finance adapter.
 *
 * Fetches historical daily OHLCV data using the yahoo-finance2 package.
 * Returns a PriceSeries sorted in ascending date order.
 */
import { YahooFinance } from "yahoo-finance2"
const yahooFinance = new YahooFinance()
import { type PriceSeries, type PriceRow, isoDate } from "@market-notes/core"

export async function fetchPriceSeries(
  sym: string,
  from: string,
  to: string
): Promise<PriceSeries> {
  const result = await yahooFinance.chart(sym, {
    period1: from,
    period2: to,
    interval: "1d",
  })

  const rows: PriceRow[] = result.quotes
    .filter((r) => r.open != null && r.close != null)
    .map((r) => ({
      date: isoDate(new Date(r.date).toISOString().slice(0, 10)),
      ohlcv: {
        open: r.open ?? NaN,
        high: r.high ?? NaN,
        low: r.low ?? NaN,
        close: r.close ?? NaN,
        adjClose: r.adjclose ?? r.close ?? NaN,
        volume: r.volume ?? 0,
      },
    }))

  return rows.sort((a, b) => a.date.localeCompare(b.date))
}
