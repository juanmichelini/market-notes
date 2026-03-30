/**
 * FRED (Federal Reserve Economic Data) adapter.
 *
 * Fetches economic index series from the St. Louis Fed public API.
 * No authentication is required for public series.
 * Missing values (reported as ".") are silently skipped.
 */
import { type IndexSeries, type IndexRow, isoDate } from "@market-notes/core"

interface FredObservation {
  date: string
  value: string
}

interface FredResponse {
  observations: FredObservation[]
}

export async function fetchIndexSeries(
  seriesId: string,
  from: string,
  to: string,
  apiKey: string
): Promise<IndexSeries> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${seriesId}` +
    `&observation_start=${from}` +
    `&observation_end=${to}` +
    `&api_key=${apiKey}` +
    `&file_type=json`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `FRED API error for series "${seriesId}": HTTP ${response.status}`
    )
  }

  const data = (await response.json()) as FredResponse
  const rows: IndexRow[] = data.observations
    .filter((o) => o.value !== ".")
    .map((o) => ({
      date: isoDate(o.date),
      value: parseFloat(o.value),
    }))

  return rows.sort((a, b) => a.date.localeCompare(b.date))
}
