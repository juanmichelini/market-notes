/**
 * # Domain Types
 *
 * This module defines the foundational vocabulary of market-notes.
 * Every other module is written in terms of these types.
 * A change here is a breaking change — accompany it with an ADR update.
 *
 * ## Design principles
 *
 * 1. **Branded primitives** prevent accidental misuse of raw strings and numbers.
 * 2. **Readonly arrays and objects** enforce immutability at the type level.
 * 3. **Nominal separation** of PriceSeries and IndexSeries prevents passing
 *    CPI scalar data where OHLCV is expected.
 */

/**
 * An ISO 8601 calendar date (YYYY-MM-DD), branded to prevent
 * accidental substitution of arbitrary strings.
 *
 * We deliberately avoid the `Date` object here: time-zone ambiguity
 * in `Date` has caused numerous off-by-one errors in financial code.
 * All date arithmetic in this codebase operates on plain strings with
 * lexicographic ordering, which is correct for ISO 8601 calendar dates.
 */
export type ISODate = string & { readonly _brand: "ISODate" }

/**
 * Smart constructor for ISODate.
 * Validates the YYYY-MM-DD format before applying the brand.
 *
 * @throws {Error} if `s` does not match YYYY-MM-DD
 */
export function isoDate(s: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Invalid ISO date string: "${s}". Expected YYYY-MM-DD.`)
  }
  return s as ISODate
}

/**
 * A ticker symbol as used by Yahoo Finance (e.g. "AAPL", "GC=F").
 * Branded to distinguish it from arbitrary strings in function signatures.
 */
export type Ticker = string & { readonly _brand: "Ticker" }

/** Smart constructor for Ticker. No format validation — Yahoo symbols vary. */
export function ticker(s: string): Ticker {
  return s as Ticker
}

/**
 * A single Open-High-Low-Close-Volume observation for a traded instrument.
 *
 * Field semantics:
 * - `open`     : first transaction price of the trading day
 * - `high`     : maximum transaction price of the trading day
 * - `low`      : minimum transaction price of the trading day
 * - `close`    : last transaction price (unadjusted for corporate actions)
 * - `adjClose` : close adjusted for splits and dividends; use this for
 *                return calculations to avoid artificial discontinuities
 * - `volume`   : number of shares or contracts traded; 0 for indices/ETFs
 *                where volume is not meaningful
 *
 * All prices are in the instrument's native currency (typically USD).
 * `NaN` denotes a missing observation; it must never be treated as zero.
 */
export interface OHLCV {
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly adjClose: number
  readonly volume: number
}

/**
 * A PriceRow pairs a calendar date with an OHLCV observation.
 * The `date` is the trading day; weekends and market holidays are absent
 * from a well-formed PriceSeries.
 */
export interface PriceRow {
  readonly date: ISODate
  readonly ohlcv: OHLCV
}

/**
 * A PriceSeries is a finite, totally-ordered sequence of OHLCV observations
 * for a single instrument.
 *
 * **Invariants** (established by `parsePriceCSV` in io.ts, preserved by all
 * operations in series.ts and operations.ts):
 *   1. Rows are sorted in strictly ascending date order.
 *   2. No two rows share a date.
 *   3. All numeric values are finite or NaN — never ±Infinity.
 *
 * Operations that would violate these invariants must not be exported.
 */
export type PriceSeries = ReadonlyArray<PriceRow>

/**
 * An IndexRow pairs a calendar date with a single scalar value.
 *
 * Used for economic indices — such as the US Consumer Price Index (CPI) —
 * that represent a single aggregate number per period and have no
 * bid/ask spread, no volume, and no meaningful open/high/low/close.
 *
 * The `value` is in the index's native units. For CPI (CPIAUCSL), this
 * is approximately 100 at the 1982–84 base period and ~300 in 2024.
 */
export interface IndexRow {
  readonly date: ISODate
  readonly value: number
}

/**
 * An IndexSeries is a finite, totally-ordered sequence of scalar observations.
 * The same three invariants as PriceSeries apply.
 *
 * IndexSeries observations need not be daily; CPI is reported monthly.
 * Operations that combine PriceSeries with IndexSeries (see operations.ts)
 * handle this frequency mismatch explicitly via forward-filling.
 */
export type IndexSeries = ReadonlyArray<IndexRow>

/**
 * Metadata for a single dataset, as recorded in `data/manifest.json`.
 * This record is the authoritative description of a dataset's provenance,
 * schema, and location on disk.
 */
export interface DatasetMeta {
  readonly ticker: Ticker
  readonly name: string
  readonly description: string
  readonly currency: string       // ISO 4217 code, e.g. "USD"; "INDEX" for dimensionless series
  readonly source: "yahoo" | "fred"
  readonly seriesType: "price" | "index"
  readonly startDate: ISODate
  readonly path: string           // relative path from repository root
}

/**
 * The Manifest is the registry of all datasets in the repository.
 * It is loaded by the frontend at runtime and by the fetcher at update time.
 * It is the single source of truth for what data exists and where to find it.
 */
export interface Manifest {
  readonly version: string
  readonly updatedAt: string       // ISO 8601 datetime, e.g. "2024-01-15T02:00:00Z"
  readonly datasets: ReadonlyArray<DatasetMeta>
}
