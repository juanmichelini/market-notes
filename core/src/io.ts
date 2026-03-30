/**
 * # CSV Input/Output
 *
 * This module provides parsers and serializers for the two CSV formats
 * used by market-notes, as defined in ADR-001.
 *
 * ## Price series CSV schema
 *
 * ```
 * date,open,high,low,close,volume,adj_close
 * 2006-01-03,72.38,74.75,72.25,74.75,201843200,9.6012
 * ```
 *
 * Column order: date, open, high, low, close, volume, adj_close (fixed contract).
 * Missing numeric values: empty string (not "NaN", not "null", not "N/A").
 * Date format: YYYY-MM-DD.
 *
 * ## Index series CSV schema
 *
 * ```
 * date,value
 * 2006-01-01,198.3
 * ```
 *
 * ## Robustness conventions
 *
 * Parsers in this module are intentionally permissive on input and strict
 * on output. They accept:
 * - CRLF and LF line endings
 * - Blank lines (ignored)
 * - Lines beginning with `#` (treated as comments, ignored)
 * - Empty numeric fields (parsed as NaN)
 *
 * The output series always satisfies the PriceSeries / IndexSeries invariants:
 * sorted ascending, deduplicated (last value wins on duplicate dates),
 * no ±Infinity values.
 */

import { isoDate, type ISODate, type PriceSeries, type PriceRow, type IndexSeries, type IndexRow, type OHLCV } from "./types.js"

/** Parse a numeric field, returning NaN for empty or non-numeric strings. */
function parseNum(s: string): number {
  const trimmed = s.trim()
  if (trimmed === "") return NaN
  const n = Number(trimmed)
  // Guard against Infinity which violates the series invariant.
  return isFinite(n) ? n : NaN
}

/** Format a number for CSV output: 4 decimal places, empty string for NaN. */
function fmtPrice(n: number): string {
  if (isNaN(n)) return ""
  return n.toFixed(4)
}

/** Format volume as integer, empty string for NaN. */
function fmtVolume(n: number): string {
  if (isNaN(n)) return ""
  return Math.round(n).toString()
}

/** Format an index value to 4 decimal places, empty string for NaN. */
function fmtValue(n: number): string {
  if (isNaN(n)) return ""
  return n.toFixed(4)
}

/**
 * Parses a price series CSV string into a PriceSeries.
 *
 * The expected column order is:
 *   date, open, high, low, close, volume, adj_close
 *
 * The parser skips the header row (which must be present), blank lines,
 * and comment lines (beginning with `#`). Both LF and CRLF line endings
 * are supported. Rows with an unparseable date are silently skipped.
 *
 * After parsing, the rows are sorted by date in ascending order and
 * deduplicated: if two rows share the same date, the last one (in the
 * order they appear in the CSV) is retained.
 *
 * @param csv - The raw CSV string, including header row.
 * @returns A PriceSeries satisfying all invariants.
 */
export function parsePriceCSV(csv: string): PriceSeries {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")

  const byDate = new Map<ISODate, PriceRow>()

  let headerSeen = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith("#")) continue
    if (!headerSeen) {
      headerSeen = true
      continue // skip header
    }

    const parts = line.split(",")
    if (parts.length < 7) continue

    let date: ISODate
    try {
      date = isoDate(parts[0]!.trim())
    } catch {
      continue // skip rows with invalid dates
    }

    const ohlcv: OHLCV = {
      open: parseNum(parts[1] ?? ""),
      high: parseNum(parts[2] ?? ""),
      low: parseNum(parts[3] ?? ""),
      close: parseNum(parts[4] ?? ""),
      volume: parseNum(parts[5] ?? ""),
      adjClose: parseNum(parts[6] ?? ""),
    }

    byDate.set(date, { date, ohlcv })
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Parses an index series CSV string into an IndexSeries.
 *
 * The expected column order is:
 *   date, value
 *
 * The same robustness conventions apply as for `parsePriceCSV`.
 *
 * @param csv - The raw CSV string, including header row.
 * @returns An IndexSeries satisfying all invariants.
 */
export function parseIndexCSV(csv: string): IndexSeries {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")

  const byDate = new Map<ISODate, IndexRow>()

  let headerSeen = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith("#")) continue
    if (!headerSeen) {
      headerSeen = true
      continue // skip header
    }

    const parts = line.split(",")
    if (parts.length < 2) continue

    let date: ISODate
    try {
      date = isoDate(parts[0]!.trim())
    } catch {
      continue
    }

    const value = parseNum(parts[1] ?? "")
    byDate.set(date, { date, value })
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Serializes a PriceSeries to a CSV string.
 *
 * Produces the canonical header followed by one row per PriceRow.
 * Prices are formatted to 4 decimal places. Volume is formatted as an
 * integer. NaN values are serialized as empty strings (the contracted
 * representation for missing data per ADR-001).
 *
 * The output is suitable for writing directly to a `.csv` file and
 * subsequently parsing with `parsePriceCSV` to recover the original series.
 *
 * @param series - The price series to serialize.
 * @returns A CSV string with LF line endings, header included.
 */
export function serializePriceCSV(series: PriceSeries): string {
  const header = "date,open,high,low,close,volume,adj_close"
  const rows = series.map((row) => {
    const { open, high, low, close, volume, adjClose } = row.ohlcv
    return [
      row.date,
      fmtPrice(open),
      fmtPrice(high),
      fmtPrice(low),
      fmtPrice(close),
      fmtVolume(volume),
      fmtPrice(adjClose),
    ].join(",")
  })
  return [header, ...rows].join("\n") + "\n"
}

/**
 * Serializes an IndexSeries to a CSV string.
 *
 * Produces the canonical header followed by one row per IndexRow.
 * Values are formatted to 4 decimal places. NaN values are serialized
 * as empty strings.
 *
 * @param series - The index series to serialize.
 * @returns A CSV string with LF line endings, header included.
 */
export function serializeIndexCSV(series: IndexSeries): string {
  const header = "date,value"
  const rows = series.map((row) => `${row.date},${fmtValue(row.value)}`)
  return [header, ...rows].join("\n") + "\n"
}
