/**
 * # Units and Currencies
 *
 * Commodity prices arrive quoted in many units: CBOT corn in US cents per
 * bushel, rough rice in US dollars per hundredweight, IMF benchmarks in US
 * dollars per metric tonne, WFP market prices in local currency per
 * kilogram. Before two such series can be compared, both must be expressed
 * as the same currency per the same mass.
 *
 * A price quoted per unit of mass is converted in two independent steps:
 *
 *   1. **Mass:** a price per unit A becomes a price per unit B by
 *      multiplying by the number of A-units in one B-unit (`perUnitFactor`).
 *   2. **Currency:** a price in local currency becomes a price in a target
 *      currency by dividing by the exchange rate (`convertCurrency`).
 *
 * Both steps are exact linear rescalings, so they commute and compose.
 */
import { type PriceSeries, type IndexSeries, type ISODate } from "./types.js"
import { mapPrices, mapIndex } from "./series.js"
import { forwardFillIndex } from "./operations.js"

/**
 * Kilograms in one unit of each mass unit used by commodity price quotes.
 *
 * The pound is defined exactly as 0.45359237 kg (International Yard and
 * Pound Agreement, 1959). US grain bushels are units of *volume*, but for
 * pricing and trade they are standardised by weight per commodity
 * (USDA / CME contract specifications):
 *
 *   - corn and sorghum: 1 bu = 56 lb ≈ 25.4012 kg
 *   - wheat and soybeans: 1 bu = 60 lb ≈ 27.2155 kg
 *
 * The hundredweight is the US (short) hundredweight of 100 lb, used by
 * CBOT rough rice.
 */
export const KG_PER = {
  kilogram: 1,
  tonne: 1000,
  pound: 0.45359237,
  hundredweight: 100 * 0.45359237,
  bushelCorn: 56 * 0.45359237,
  bushelSorghum: 56 * 0.45359237,
  bushelWheat: 60 * 0.45359237,
  bushelSoybeans: 60 * 0.45359237,
} as const

/**
 * Returns the factor that converts a price per unit of mass `fromKg` into
 * a price per unit of mass `toKg`, where both are given in kilograms.
 *
 * If a good costs p per unit A, where one A weighs a kg, then one unit B
 * weighing b kg contains b / a units of A, and so costs:
 *
 *   p_B = p_A × (b / a)
 *
 * For example, converting a price per kilogram to a price per tonne
 * multiplies by 1000 / 1 = 1000. Factors compose by multiplication:
 * perUnitFactor(a, b) × perUnitFactor(b, c) = perUnitFactor(a, c).
 *
 * @param fromKg - Mass in kilograms of the unit the price is quoted per.
 * @param toKg   - Mass in kilograms of the unit to express the price per.
 * @throws {Error} if either mass is not a finite positive number.
 */
export function perUnitFactor(fromKg: number, toKg: number): number {
  for (const kg of [fromKg, toKg]) {
    if (!Number.isFinite(kg) || kg <= 0) {
      throw new Error(`perUnitFactor: mass must be a finite positive number of kg, got ${kg}.`)
    }
  }
  return toKg / fromKg
}

function assertFiniteFactor(name: string, k: number): void {
  if (!Number.isFinite(k)) {
    throw new Error(`${name}: factor must be finite, got ${k}.`)
  }
}

/**
 * Multiplies every value of a scalar series by a constant factor k:
 *
 *   v'(t) = k × v(t)
 *
 * This is the general form of a unit change for prices quoted per unit:
 * k may combine a currency subunit (e.g. 0.01 for cents → dollars) and a
 * mass conversion from `perUnitFactor`. NaN (missing) values stay NaN.
 *
 * @param series - The input series.
 * @param k      - The scale factor. Must be finite.
 * @throws {Error} if k is not finite (which would break the no-±Infinity invariant).
 */
export function scaleIndex(series: IndexSeries, k: number): IndexSeries {
  assertFiniteFactor("scaleIndex", k)
  return mapIndex(series, (v) => v * k)
}

/**
 * Multiplies every price field (open, high, low, close, adjClose) of a
 * PriceSeries by a constant factor k, leaving volume unchanged:
 *
 *   p'(t) = k × p(t)    for p ∈ {open, high, low, close, adjClose}
 *
 * Volume counts contracts or shares, not money, so a change of price unit
 * does not affect it.
 *
 * Example — CBOT corn from US cents per bushel to US dollars per tonne:
 *
 *   k = 0.01 × perUnitFactor(KG_PER.bushelCorn, KG_PER.tonne) ≈ 0.39368
 *
 * so 500 ¢/bu ≈ 196.84 $/t.
 *
 * @param prices - The input price series.
 * @param k      - The scale factor. Must be finite.
 * @throws {Error} if k is not finite.
 */
export function scalePrices(prices: PriceSeries, k: number): PriceSeries {
  assertFiniteFactor("scalePrices", k)
  return mapPrices(prices, (o) => ({
    open: o.open * k,
    high: o.high * k,
    low: o.low * k,
    close: o.close * k,
    adjClose: o.adjClose * k,
    volume: o.volume,
  }))
}

/**
 * Converts a scalar price series from a local currency into a target
 * currency, using an exchange-rate series quoted as **local currency units
 * per one unit of the target currency** (e.g. Nigerian naira per US dollar).
 *
 * For each observation date t:
 *
 *   v_target(t) = v_local(t) / FX(t)
 *
 * where FX(t) is the exchange rate forward-filled to t (the most recent
 * rate observed on or before t; see `forwardFillIndex`). For monthly price
 * series this samples the rate at the observation date rather than
 * averaging over the month.
 *
 * Exchange rates quoted the other way round (target per local, e.g. FRED's
 * USD per EUR) must first be inverted with `mapIndex(fx, (r) => 1 / r)`.
 *
 * Where FX(t) is not a positive finite number, v_target(t) is NaN rather
 * than ±Infinity, preserving the series invariants.
 *
 * @param series - The price series in local currency.
 * @param fx     - Exchange rates, local currency per unit of target currency.
 * @throws {Error} if `series` has an observation before the first exchange rate.
 */
export function convertCurrency(series: IndexSeries, fx: IndexSeries): IndexSeries {
  if (series.length === 0) return series
  const rates = forwardFillIndex(fx, series.map((r) => r.date))
  return mapIndex(series, (v, date: ISODate) => {
    const rate = rates.get(date) ?? NaN
    return Number.isFinite(rate) && rate > 0 ? v / rate : NaN
  })
}
