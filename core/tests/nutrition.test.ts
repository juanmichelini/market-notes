import { describe, it, expect } from "vitest"
import { pricePerCalorie, cheapestCalorie, type CalorieCandidate } from "../src/nutrition.js"
import { isoDate, type IndexRow } from "../src/types.js"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function indexRow(date: string, value: number): IndexRow {
  return { date: isoDate(date), value }
}

// ---------------------------------------------------------------------------
// pricePerCalorie
// ---------------------------------------------------------------------------

describe("pricePerCalorie", () => {
  // Milled rice: 3600 kcal per kg, all of it edible.
  const kcalPerKg = 3600

  it("divides the price per kg by the thousands of kcal in one kg", () => {
    // $0.72/kg ÷ 3.6 thousand kcal/kg = $0.20 per 1,000 kcal
    expect(pricePerCalorie([indexRow("2024-01-15", 0.72)], kcalPerKg, 1)[0]!.value).toBeCloseTo(0.2, 12)
  })

  it("makes a calorie dearer when only part of the purchased mass is edible", () => {
    // Rough rice, milling yield 0.5: half the kg is husk, so a calorie costs twice as much.
    const whole = pricePerCalorie([indexRow("2024-01-15", 0.72)], kcalPerKg, 1)[0]!.value
    const rough = pricePerCalorie([indexRow("2024-01-15", 0.72)], kcalPerKg, 0.5)[0]!.value
    expect(rough).toBeCloseTo(2 * whole, 12)
  })

  it("is linear in price: doubling the price doubles the price of a calorie", () => {
    const [a, b] = pricePerCalorie([indexRow("2024-01-15", 1), indexRow("2024-02-15", 2)], kcalPerKg, 1)
    expect(b!.value).toBeCloseTo(2 * a!.value, 12)
  })

  it("preserves NaN as a missing observation", () => {
    expect(pricePerCalorie([indexRow("2024-01-15", NaN)], kcalPerKg, 1)[0]!.value).toBeNaN()
  })

  it("preserves dates", () => {
    const series = [indexRow("2024-01-15", 1), indexRow("2024-02-15", 2)]
    expect(pricePerCalorie(series, kcalPerKg, 1).map((r) => r.date)).toEqual(series.map((r) => r.date))
  })

  it("does not mutate the input", () => {
    const series = [indexRow("2024-01-15", 0.72)]
    pricePerCalorie(series, kcalPerKg, 1)
    expect(series[0]!.value).toBe(0.72)
  })

  it("throws for non-positive calorie density", () => {
    expect(() => pricePerCalorie([], 0, 1)).toThrow()
  })

  it("throws for an edible fraction of zero", () => {
    expect(() => pricePerCalorie([], kcalPerKg, 0)).toThrow()
  })

  it("throws for an edible fraction above one", () => {
    expect(() => pricePerCalorie([], kcalPerKg, 1.2)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// cheapestCalorie
// ---------------------------------------------------------------------------

describe("cheapestCalorie", () => {
  const rice: CalorieCandidate = {
    id: "rice",
    series: [indexRow("2024-01-15", 0.2), indexRow("2024-02-15", 0.3)],
  }
  const cassava: CalorieCandidate = {
    id: "cassava",
    series: [indexRow("2024-01-15", 0.25), indexRow("2024-02-15", 0.1)],
  }
  const dates = [isoDate("2024-01-15"), isoDate("2024-02-15")]

  it("picks the candidate with the lowest price at each date", () => {
    expect(cheapestCalorie([rice, cassava], dates).map((r) => r.id)).toEqual(["rice", "cassava"])
  })

  it("reports the lowest value", () => {
    expect(cheapestCalorie([rice, cassava], dates).map((r) => r.value)).toEqual([0.2, 0.1])
  })

  it("forward-fills a candidate observed less often than the query dates", () => {
    const monthly: CalorieCandidate = { id: "wheat", series: [indexRow("2024-01-01", 0.05)] }
    expect(cheapestCalorie([rice, monthly], [isoDate("2024-02-20")])[0]!.id).toBe("wheat")
  })

  it("ignores a candidate that has no observation yet at a date", () => {
    const late: CalorieCandidate = { id: "late", series: [indexRow("2024-02-15", 0.01)] }
    expect(cheapestCalorie([rice, late], [isoDate("2024-01-15")])[0]!.id).toBe("rice")
  })

  it("ignores NaN observations", () => {
    const missing: CalorieCandidate = { id: "missing", series: [indexRow("2024-01-15", NaN)] }
    expect(cheapestCalorie([rice, missing], [isoDate("2024-01-15")])[0]!.id).toBe("rice")
  })

  it("omits a date at which no candidate has a value", () => {
    expect(cheapestCalorie([rice], [isoDate("2023-12-01")])).toEqual([])
  })

  it("breaks ties in favour of the candidate listed first", () => {
    const twin: CalorieCandidate = { id: "twin", series: rice.series }
    expect(cheapestCalorie([rice, twin], [isoDate("2024-01-15")])[0]!.id).toBe("rice")
  })
})
