/**
 * # Price of a Calorie
 *
 * Staple foods are priced in different units and forms — maize per bushel,
 * rice per hundredweight of paddy, cassava per kilogram of flour — so their
 * prices cannot be compared directly. But nearly all of a staple is energy,
 * and energy is the same thing in every food. Dividing a price by the energy
 * it buys gives a common yardstick, the **price of a calorie**, expressed
 * here as money per 1,000 kilocalories (kcal).
 *
 * Two facts about a food determine the conversion:
 *
 *   - its **energy density** e, in kcal per kilogram *of edible food*; and
 *   - its **edible fraction** f, the share of the purchased mass that is
 *     actually eaten, 0 < f ≤ 1. Milled rice has f = 1; rough (paddy) rice
 *     is sold with its husk, so f is its milling yield (about 0.67); a
 *     plantain is sold with its peel.
 *
 * Both are properties of a food *in the form it is priced in*, which is why
 * every dataset states its form (see `DatasetMeta.form`).
 *
 * This module is currency-agnostic: it divides by energy and never touches
 * money. Feed it a price per kilogram in any currency and it returns that
 * currency per 1,000 kcal.
 */

import type { ISODate, IndexSeries } from "./types.js"
import { mapIndex } from "./series.js"

/**
 * One row of `data/nutrition.json`: the energy density and edible fraction
 * of a staple in the form it is priced in.
 *
 * - `kcalPer100g`    : energy of 100 g of the *edible* food (kcal)
 * - `edibleFraction` : edible mass ÷ purchased mass, 0 < f ≤ 1
 * - `status`         : "issue" if the value comes from the table in issue
 *                      #106, "estimate" if it is approximate and still to
 *                      be checked against `source`
 */
export interface NutritionEntry {
  readonly product: string
  readonly form: string
  readonly kcalPer100g: number
  readonly edibleFraction: number
  readonly status: "issue" | "estimate"
  readonly source: string
}

/** The contents of `data/nutrition.json`. */
export interface NutritionTable {
  readonly version: string
  readonly description: string
  readonly entries: ReadonlyArray<NutritionEntry>
}

/**
 * Converts a price per kilogram into a price per 1,000 kcal.
 *
 * One purchased kilogram contains f kilograms of edible food, which holds
 * e × f kilocalories. If the price of that kilogram is p, the price of
 * 1,000 kcal is:
 *
 *   c(t) = 1000 × p(t) / (e × f)
 *
 * For example, milled rice at 0.72 $/kg with e = 3600 kcal/kg and f = 1
 * costs 1000 × 0.72 / 3600 = 0.20 $ per 1,000 kcal. The same rice sold as
 * paddy with f = 0.5 would cost twice as much per calorie, because half of
 * each kilogram is husk.
 *
 * The result is linear in p, so it preserves the shape of the input series
 * and rescales its level. Missing values (NaN) stay missing.
 *
 * @param series       - Price per kilogram of the food as traded, in any currency.
 * @param kcalPerKg    - Energy density e of the edible food, in kcal per kg. Must be finite and positive.
 * @param edibleFraction - The edible fraction f of the purchased mass. Must satisfy 0 < f ≤ 1.
 * @throws {Error} if `kcalPerKg` or `edibleFraction` is outside its range.
 * @returns The same dates, with values in currency per 1,000 kcal.
 */
export function pricePerCalorie(
  series: IndexSeries,
  kcalPerKg: number,
  edibleFraction: number
): IndexSeries {
  if (!Number.isFinite(kcalPerKg) || kcalPerKg <= 0) {
    throw new Error(`pricePerCalorie: kcalPerKg must be a finite positive number, got ${kcalPerKg}.`)
  }
  if (!Number.isFinite(edibleFraction) || edibleFraction <= 0 || edibleFraction > 1) {
    throw new Error(`pricePerCalorie: edibleFraction must satisfy 0 < f ≤ 1, got ${edibleFraction}.`)
  }
  const kcalPerPurchasedKg = kcalPerKg * edibleFraction
  return mapIndex(series, (p) => (1000 * p) / kcalPerPurchasedKg)
}

/**
 * A food competing to be the cheapest source of calories: an identifier
 * (e.g. "rice") and its price-per-calorie series from `pricePerCalorie`.
 * All candidates must be in the same currency.
 */
export interface CalorieCandidate {
  readonly id: string
  readonly series: IndexSeries
}

/** The cheapest calorie at one date: which food, and its price per 1,000 kcal. */
export interface CheapestCalorie {
  readonly date: ISODate
  readonly id: string
  readonly value: number
}

/**
 * Finds, at each requested date, which candidate food offers the cheapest
 * calorie.
 *
 * For each candidate j let c_j(t) be its most recent observation on or
 * before t (forward-filled, since staples are often reported monthly while
 * others are daily). Then the cheapest calorie at t is:
 *
 *   c*(t) = min over j of c_j(t),   attained by  j*(t) = argmin_j c_j(t)
 *
 * A candidate takes part at t only if it has an observation on or before t
 * and that observation is a number: a missing (NaN) latest observation
 * excludes the candidate rather than falling back to an older value. If no
 * candidate takes part at t, that date is omitted from the result. Ties go
 * to the candidate listed first.
 *
 * Forward-filling can carry an old observation a long way. Callers that
 * need to bound staleness should drop dates before filtering.
 *
 * @param candidates - The foods to compare, in one common currency per 1,000 kcal.
 * @param dates      - The dates at which to compare, in any order.
 * @returns One entry per date that has at least one participating candidate, in the order of `dates`.
 */
export function cheapestCalorie(
  candidates: ReadonlyArray<CalorieCandidate>,
  dates: ReadonlyArray<ISODate>
): ReadonlyArray<CheapestCalorie> {
  const sorted = candidates.map((c) => ({
    id: c.id,
    rows: [...c.series].sort((a, b) => a.date.localeCompare(b.date)),
  }))

  const result: CheapestCalorie[] = []
  for (const date of dates) {
    let best: { id: string; value: number } | undefined
    for (const candidate of sorted) {
      const value = lastValueOnOrBefore(candidate.rows, date)
      if (value === undefined || Number.isNaN(value)) continue
      if (best === undefined || value < best.value) best = { id: candidate.id, value }
    }
    if (best !== undefined) result.push({ date, id: best.id, value: best.value })
  }
  return result
}

/**
 * Value of the latest row dated on or before `date`, or undefined if every
 * row is later. `rows` must be sorted by ascending date.
 */
function lastValueOnOrBefore(
  rows: ReadonlyArray<{ readonly date: ISODate; readonly value: number }>,
  date: ISODate
): number | undefined {
  let lo = 0
  let hi = rows.length - 1
  let found: number | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const row = rows[mid]!
    if (row.date <= date) {
      found = row.value
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
