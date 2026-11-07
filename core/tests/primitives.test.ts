import { describe, it, expect } from "vitest"
import { bar } from "../src/primitives.js"
import { isoDate, type PriceSeries } from "../src/types.js"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Builds a series from per-bar highs and lows. The close is the midpoint
 * unless `closes` is given. Dates run daily from 2024-01-01.
 */
function makeSeries(highs: number[], lows: number[], closes?: number[]): PriceSeries {
  return highs.map((high, i) => {
    const low = lows[i]!
    const close = closes?.[i] ?? (high + low) / 2
    const date = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)
    return {
      date: isoDate(date),
      ohlcv: { open: close, high, low, close, adjClose: close, volume: 1000 },
    }
  })
}

/** A series of `n` flat bars, useful where only the number of bars matters. */
function flat(n: number): PriceSeries {
  return makeSeries(Array(n).fill(10), Array(n).fill(9))
}

// ---------------------------------------------------------------------------
// bar
// ---------------------------------------------------------------------------

describe("bar", () => {
  it("gives one instance per bar in the interval", () => {
    expect(bar(flat(5), 1, 3)).toHaveLength(3)
  })

  it("gives each instance a single landmark, the bar itself", () => {
    expect(bar(flat(5), 1, 3).map((i) => i.kind === "bar" && i.landmarks)).toEqual([[1], [2], [3]])
  })

  it("scores every instance 1", () => {
    expect(bar(flat(3), 0, 2).map((i) => i.score)).toEqual([1, 1, 1])
  })

  it("lists instances in ascending bar order", () => {
    const bars = bar(flat(4), 0, 3).map((i) => (i.kind === "bar" ? i.landmarks[0] : -1))
    expect(bars).toEqual([0, 1, 2, 3])
  })

  it("gives nothing for an empty interval (from after to)", () => {
    expect(bar(flat(5), 3, 1)).toHaveLength(0)
  })

  it("clips an interval that extends past the series", () => {
    expect(bar(flat(3), -2, 10)).toHaveLength(3)
  })

  it("gives nothing for an empty series", () => {
    expect(bar([], 0, 5)).toHaveLength(0)
  })
})

