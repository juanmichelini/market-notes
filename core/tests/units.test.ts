import { describe, it, expect } from "vitest"
import { KG_PER, perUnitFactor, scaleIndex, scalePrices, convertCurrency, majorCurrency, toPricePerKg, toPricePerTonne } from "../src/units.js"
import { isoDate, type PriceRow, type IndexRow } from "../src/types.js"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function row(date: string, close: number): PriceRow {
  return {
    date: isoDate(date),
    ohlcv: { open: close - 1, high: close + 2, low: close - 2, close, adjClose: close, volume: 1000 },
  }
}

function indexRow(date: string, value: number): IndexRow {
  return { date: isoDate(date), value }
}

// ---------------------------------------------------------------------------
// KG_PER
// ---------------------------------------------------------------------------

describe("KG_PER", () => {
  it("defines the pound exactly as 0.45359237 kg", () => {
    expect(KG_PER.pound).toBe(0.45359237)
  })

  it("defines a corn bushel as 56 lb", () => {
    expect(KG_PER.bushelCorn).toBeCloseTo(56 * 0.45359237, 10)
  })

  it("defines a wheat or soybean bushel as 60 lb", () => {
    expect(KG_PER.bushelWheat).toBeCloseTo(60 * 0.45359237, 10)
  })

  it("defines a hundredweight (short) as 100 lb", () => {
    expect(KG_PER.hundredweight).toBeCloseTo(45.359237, 10)
  })
})

// ---------------------------------------------------------------------------
// perUnitFactor
// ---------------------------------------------------------------------------

describe("perUnitFactor", () => {
  it("is the ratio of target mass to source mass", () => {
    // A price per kg becomes a price per tonne by multiplying by 1000.
    expect(perUnitFactor(KG_PER.kilogram, KG_PER.tonne)).toBe(1000)
  })

  it("is 1 when source and target units are the same", () => {
    expect(perUnitFactor(KG_PER.bushelCorn, KG_PER.bushelCorn)).toBe(1)
  })

  it("composes: kg → lb → tonne equals kg → tonne", () => {
    const viaPound = perUnitFactor(KG_PER.kilogram, KG_PER.pound) * perUnitFactor(KG_PER.pound, KG_PER.tonne)
    expect(viaPound).toBeCloseTo(1000, 10)
  })

  it("throws for a non-positive mass", () => {
    expect(() => perUnitFactor(0, KG_PER.tonne)).toThrow()
  })

  it("throws for a non-finite mass", () => {
    expect(() => perUnitFactor(KG_PER.kilogram, Infinity)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// scaleIndex
// ---------------------------------------------------------------------------

describe("scaleIndex", () => {
  const series = [indexRow("2024-01-15", 2.5), indexRow("2024-02-15", NaN)]

  it("multiplies every value by the factor", () => {
    expect(scaleIndex(series, 4)[0]!.value).toBe(10)
  })

  it("preserves NaN as a missing observation", () => {
    expect(scaleIndex(series, 4)[1]!.value).toBeNaN()
  })

  it("preserves dates", () => {
    expect(scaleIndex(series, 4).map((r) => r.date)).toEqual(series.map((r) => r.date))
  })

  it("does not mutate the input", () => {
    scaleIndex(series, 4)
    expect(series[0]!.value).toBe(2.5)
  })

  it("throws for a non-finite factor", () => {
    expect(() => scaleIndex(series, NaN)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// scalePrices
// ---------------------------------------------------------------------------

describe("scalePrices", () => {
  const prices = [row("2024-01-02", 500)]

  it("scales all price fields (open, high, low, close, adjClose)", () => {
    const { ohlcv } = scalePrices(prices, 0.01)[0]!
    const fields = [ohlcv.open, ohlcv.high, ohlcv.low, ohlcv.close, ohlcv.adjClose]
    expect(fields.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([4.99, 5.02, 4.98, 5, 5])
  })

  it("leaves volume unchanged", () => {
    expect(scalePrices(prices, 0.01)[0]!.ohlcv.volume).toBe(1000)
  })

  it("converts CBOT corn from US cents/bushel to USD/tonne", () => {
    // 500 ¢/bu = $5.00 per 25.401 kg ≈ $196.84 per tonne
    const factor = 0.01 * perUnitFactor(KG_PER.bushelCorn, KG_PER.tonne)
    expect(scalePrices(prices, factor)[0]!.ohlcv.close).toBeCloseTo(196.84, 2)
  })

  it("throws for a non-finite factor", () => {
    expect(() => scalePrices(prices, Infinity)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// convertCurrency
// ---------------------------------------------------------------------------

describe("convertCurrency", () => {
  // Local currency units per 1 USD, observed on the 1st of each month.
  const fx = [indexRow("2024-01-01", 1000), indexRow("2024-02-01", 1250)]

  it("divides each value by the exchange rate: v_usd = v_local / fx", () => {
    const local = [indexRow("2024-01-01", 2000)]
    expect(convertCurrency(local, fx)[0]!.value).toBe(2)
  })

  it("forward-fills the exchange rate to dates between observations", () => {
    // 2024-02-15 uses the 2024-02-01 rate (1250).
    const local = [indexRow("2024-02-15", 2500)]
    expect(convertCurrency(local, fx)[0]!.value).toBe(2)
  })

  it("preserves dates and length", () => {
    const local = [indexRow("2024-01-15", 1), indexRow("2024-02-15", 1)]
    expect(convertCurrency(local, fx).map((r) => r.date)).toEqual(local.map((r) => r.date))
  })

  it("returns NaN where the exchange rate is not positive", () => {
    const badFx = [indexRow("2024-01-01", 0)]
    expect(convertCurrency([indexRow("2024-01-15", 100)], badFx)[0]!.value).toBeNaN()
  })

  it("throws when the series starts before the first exchange rate", () => {
    expect(() => convertCurrency([indexRow("2023-12-15", 100)], fx)).toThrow()
  })

  it("returns an empty series for empty input", () => {
    expect(convertCurrency([], fx)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// majorCurrency
// ---------------------------------------------------------------------------

describe("majorCurrency", () => {
  it("maps US cents (USX) to dollars with factor 0.01", () => {
    expect(majorCurrency("USX")).toEqual({ major: "USD", factor: 0.01 })
  })

  it("maps an ordinary currency to itself with factor 1", () => {
    expect(majorCurrency("NGN")).toEqual({ major: "NGN", factor: 1 })
  })
})

// ---------------------------------------------------------------------------
// toPricePerKg
// ---------------------------------------------------------------------------

describe("toPricePerKg", () => {
  it("converts CBOT corn from US cents per bushel to dollars per kg", () => {
    // 500 USX/bu = $5.00 per 25.4012 kg ≈ $0.19684 per kg
    const result = toPricePerKg([indexRow("2024-01-02", 500)], KG_PER.bushelCorn, "USX")
    expect(result[0]!.value).toBeCloseTo(0.19684, 5)
  })

  it("divides a price per tonne by 1000", () => {
    expect(toPricePerKg([indexRow("2024-01-15", 400)], KG_PER.tonne, "USD")[0]!.value).toBeCloseTo(0.4, 12)
  })

  it("leaves the currency amount unchanged for a price already per kg", () => {
    expect(toPricePerKg([indexRow("2024-01-15", 120)], KG_PER.kilogram, "NGN")[0]!.value).toBe(120)
  })

  it("divides by the pack size for a price quoted per 2.5 kg", () => {
    expect(toPricePerKg([indexRow("2024-01-15", 500)], 2.5, "NGN")[0]!.value).toBe(200)
  })

  it("throws for a non-positive pack size", () => {
    expect(() => toPricePerKg([indexRow("2024-01-15", 1)], 0, "USD")).toThrow()
  })
})

// ---------------------------------------------------------------------------
// toPricePerTonne
// ---------------------------------------------------------------------------

describe("toPricePerTonne", () => {
  it("converts CBOT corn from US cents per bushel to dollars per tonne", () => {
    // 500 USX/bu ≈ $196.84 per tonne (the same worked example as scalePrices above)
    expect(toPricePerTonne([indexRow("2024-01-02", 500)], KG_PER.bushelCorn, "USX")[0]!.value).toBeCloseTo(196.84, 2)
  })

  it("leaves a price already per tonne unchanged", () => {
    expect(toPricePerTonne([indexRow("2024-01-15", 400)], KG_PER.tonne, "USD")[0]!.value).toBeCloseTo(400, 10)
  })

  it("multiplies a price per kg by 1000", () => {
    expect(toPricePerTonne([indexRow("2024-01-15", 0.25)], KG_PER.kilogram, "COP")[0]!.value).toBe(250)
  })
})
