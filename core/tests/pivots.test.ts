import { describe, it, expect } from "vitest"
import { pivots, reduceSeries } from "../src/pivots.js"
import type { PriceSeries } from "../src/types.js"

function prices(values: number[]): PriceSeries {
  return values.map((p, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    ohlcv: { open: p, high: p, low: p, close: p, adjClose: p, volume: 100 + i },
  })) as unknown as PriceSeries
}

describe("pivots", () => {
  it("finds the peaks and troughs of swings at least as large as the threshold", () => {
    //                 0    1    2    3   4   5    6    7
    const s = prices([100, 110, 120, 100, 90, 100, 115, 105])
    expect(pivots(s, 0.1)).toEqual([0, 2, 4, 6])
  })

  it("ignores swings smaller than the threshold", () => {
    const s = prices([100, 101, 100, 101, 100, 130, 100])
    expect(pivots(s, 0.1)).toEqual([0, 5, 6])
  })

  it("alternates between peaks and troughs", () => {
    let x = 5
    const values = Array.from({ length: 300 }, () => {
      x = (x * 1103515245 + 12345) % 2147483648
      return 100 + (x / 2147483648) * 40
    })
    const s = prices(values)
    const bars = pivots(s, 0.08)
    expect(bars.length).toBeGreaterThan(4)
    for (let k = 2; k < bars.length; k++) {
      const a = values[bars[k - 2]!]!
      const b = values[bars[k - 1]!]!
      const c = values[bars[k]!]!
      expect((b - a) * (c - b) < 0).toBe(true)
    }
  })

  it("returns bars in ascending order", () => {
    const bars = pivots(prices([1, 2, 1, 2, 1, 2, 1, 2]), 0.2)
    expect(bars).toEqual([...bars].sort((x, y) => x - y))
  })

  it("returns nothing for a flat or empty series", () => {
    expect(pivots(prices([]), 0.1)).toEqual([])
    expect(pivots(prices([5, 5, 5, 5]), 0.1)).toEqual([])
  })

  it("skips missing prices", () => {
    const s = prices([100, NaN, 120, 100, 90])
    expect(pivots(s, 0.1)).toEqual([0, 2, 4])
  })

  it("rejects a threshold outside (0, 1) and non-positive prices", () => {
    expect(() => pivots(prices([1, 2]), 0)).toThrow("pivots")
    expect(() => pivots(prices([1, 2]), 1)).toThrow("pivots")
    expect(() => pivots(prices([1, -2]), 0.1)).toThrow("pivots")
  })
})

describe("reduceSeries", () => {
  it("keeps the chosen bars, with every price set to the adjusted close", () => {
    const s = prices([10, 20, 30, 40])
    const r = reduceSeries(s, [1, 3])
    expect(r).toHaveLength(2)
    expect(r[0]!.date).toBe(s[1]!.date)
    expect(r[1]!.ohlcv).toEqual({ open: 40, high: 40, low: 40, close: 40, adjClose: 40, volume: 103 })
  })
})
