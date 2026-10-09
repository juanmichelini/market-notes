import { describe, it, expect } from "vitest"
import { daysBetween, observationAt } from "../src/markets.js"
import { isoDate, type IndexRow } from "../src/types.js"

function indexRow(date: string, value: number): IndexRow {
  return { date: isoDate(date), value }
}

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe("daysBetween", () => {
  it("is zero for the same date", () => {
    expect(daysBetween(isoDate("2024-03-01"), isoDate("2024-03-01"))).toBe(0)
  })

  it("counts days across a month boundary", () => {
    expect(daysBetween(isoDate("2024-01-30"), isoDate("2024-02-02"))).toBe(3)
  })

  it("counts the leap day in 2024", () => {
    expect(daysBetween(isoDate("2024-02-28"), isoDate("2024-03-01"))).toBe(2)
  })

  it("is negative when the second date is earlier", () => {
    expect(daysBetween(isoDate("2024-02-02"), isoDate("2024-01-30"))).toBe(-3)
  })

  it("is not affected by a daylight-saving change", () => {
    expect(daysBetween(isoDate("2024-03-09"), isoDate("2024-03-11"))).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// observationAt
// ---------------------------------------------------------------------------

describe("observationAt", () => {
  const monthly = [indexRow("2024-01-15", 10), indexRow("2024-02-15", 20), indexRow("2024-03-15", 30)]

  it("returns the observation dated exactly on the query date", () => {
    expect(observationAt(monthly, isoDate("2024-02-15"))!.value).toBe(20)
  })

  it("carries the previous observation forward between observations", () => {
    expect(observationAt(monthly, isoDate("2024-02-20"))!.value).toBe(20)
  })

  it("reports the date of the observation it used", () => {
    expect(observationAt(monthly, isoDate("2024-02-20"))!.observedOn).toBe("2024-02-15")
  })

  it("reports how many days old the observation is", () => {
    expect(observationAt(monthly, isoDate("2024-02-20"))!.staleDays).toBe(5)
  })

  it("reports zero staleness on an observation date", () => {
    expect(observationAt(monthly, isoDate("2024-01-15"))!.staleDays).toBe(0)
  })

  it("returns undefined before the first observation", () => {
    expect(observationAt(monthly, isoDate("2024-01-01"))).toBeUndefined()
  })

  it("returns undefined for an empty series", () => {
    expect(observationAt([], isoDate("2024-01-01"))).toBeUndefined()
  })

  it("returns undefined when the latest observation is missing (NaN)", () => {
    expect(observationAt([indexRow("2024-01-15", 10), indexRow("2024-02-15", NaN)], isoDate("2024-02-20"))).toBeUndefined()
  })

  it("carries forward indefinitely when no staleness limit is given", () => {
    expect(observationAt(monthly, isoDate("2030-01-01"))!.value).toBe(30)
  })

  it("returns undefined when the observation is older than the staleness limit", () => {
    expect(observationAt(monthly, isoDate("2024-04-30"), 30)).toBeUndefined()
  })

  it("returns the observation when it is exactly at the staleness limit", () => {
    expect(observationAt(monthly, isoDate("2024-04-14"), 30)!.value).toBe(30)
  })
})
