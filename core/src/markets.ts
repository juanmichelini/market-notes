/**
 * # Prices at a Point in Space and Time
 *
 * To compare a product's price at one market with its price at another, we
 * ask the same question of every market: *what was the price on this date?*
 * Markets report at different rhythms — futures daily, WFP markets monthly
 * on the 15th, some not for years — so most dates have no observation
 * exactly on them. The standard answer, used throughout this codebase, is
 * to carry the last observation forward (see `forwardFillIndex`).
 *
 * Carrying forward is only honest if the reader can see how far it went.
 * This module therefore returns, with each price, the date of the
 * observation that was used and its age in days, so a viewer can tell a
 * price observed today from one that is two months old.
 */

import type { DatasetMeta, ISODate, IndexSeries } from "./types.js"

/**
 * Number of whole days from `from` to `to` (negative if `to` is earlier).
 *
 * Both dates are read as calendar dates and placed at midnight UTC, so the
 * result is exact and unaffected by time zones or daylight-saving changes:
 *
 *   daysBetween(from, to) = (to − from) / 86,400,000 ms
 *
 * @param from - The earlier date (for a positive result).
 * @param to   - The later date.
 */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000)
}

function toUtcMs(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

/** The price known at a date, with the observation it came from. */
export interface Observation {
  /** The value of the observation used. */
  readonly value: number
  /** The date the observation was recorded. */
  readonly observedOn: ISODate
  /** Days from `observedOn` to the date asked about; 0 if observed that day. */
  readonly staleDays: number
}

/**
 * The most recent observation of a series on or before `date`, with its age.
 *
 * Formally, for a series with observations at dates d₁ < d₂ < … < dₙ and a
 * query date t, let k = max{ j | dⱼ ≤ t }. The result is the value vₖ,
 * observed on dₖ, with staleness t − dₖ in days.
 *
 * The result is `undefined` — "no price known" — when:
 *   - the series is empty or begins after t;
 *   - the latest observation is missing (NaN). A missing latest value is
 *     not papered over with an older one, which would present a stale
 *     number as current; or
 *   - `maxStaleDays` is given and the observation is older than that.
 *
 * Unlike `forwardFillIndex`, this does not throw before the first
 * observation: a market that has not started reporting simply has no price.
 *
 * @param series       - Observations sorted in ascending date order.
 * @param date         - The date to ask about.
 * @param maxStaleDays - Optional limit, in days, on how old the observation may be.
 */
export function observationAt(
  series: IndexSeries,
  date: ISODate,
  maxStaleDays?: number
): Observation | undefined {
  let lo = 0
  let hi = series.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (series[mid]!.date <= date) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found < 0) return undefined

  const row = series[found]!
  if (Number.isNaN(row.value)) return undefined

  const staleDays = daysBetween(row.date, date)
  if (maxStaleDays !== undefined && staleDays > maxStaleDays) return undefined
  return { value: row.value, observedOn: row.date, staleDays }
}

/**
 * The spread of a price over a reference price, as a percentage of the
 * reference:
 *
 *   spread = 100 × (p − r) / r  =  100 × (p / r − 1)
 *
 * Positive means the market is dearer than the reference, negative cheaper.
 * Expressing the gap as a share of the reference makes spreads comparable
 * across products with very different price levels (rice against maize).
 * Both prices must be in the same currency and per the same unit; see
 * `toPricePerTonne`.
 *
 * Returns NaN, not ±Infinity, when the reference is not a positive finite
 * number or the price is missing, so the series invariants are kept.
 *
 * @param price     - The price at the market of interest.
 * @param reference - The reference price, e.g. an export benchmark.
 */
export function spreadPercent(price: number, reference: number): number {
  if (!Number.isFinite(reference) || reference <= 0 || !Number.isFinite(price)) return NaN
  return 100 * (price / reference - 1)
}

/**
 * The step in the supply chain at which a price is quoted. A futures price,
 * an export price and a shop price for the same grain differ by freight,
 * duties, milling and margins, so a map that colours them on one scale
 * mostly measures the difference in stage, not in place.
 */
export type PriceStage = "exchange" | "export" | "wholesale" | "retail" | "national"

/**
 * Names the stage of a dataset from what its manifest entry already says:
 *
 *   - `exchange` : a futures or exchange quote;
 *   - `export`   : a price at a port, free on board;
 *   - `wholesale` or `retail` : a WFP market price, by its price type;
 *   - `national` : a national average (the US retail potato price, say).
 *
 * Returns undefined for a dataset with no location, since its stage is not
 * recorded.
 */
export function priceStage(dataset: Pick<DatasetMeta, "location" | "wfp">): PriceStage | undefined {
  const scope = dataset.location?.scope
  if (scope === undefined) return undefined
  if (scope === "exchange") return "exchange"
  if (scope === "port") return "export"
  if (scope === "national") return "national"
  return dataset.wfp?.pricetype === "Wholesale" ? "wholesale" : "retail"
}
