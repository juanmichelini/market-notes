import { describe, it, expect } from "vitest"
import { hill, valley, headAndShoulders, inverseHeadAndShoulders, doubleTop, doubleBottom } from "../src/shapes.js"
import { landmarks, type Pattern } from "../src/patterns.js"
import type { PriceSeries } from "../src/types.js"

/** A series whose every bar is a pivot: open = high = low = close = adjClose = the price. */
function pivotSeries(values: number[]): PriceSeries {
  return values.map((p, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    ohlcv: { open: p, high: p, low: p, close: p, adjClose: p, volume: 1 },
  })) as unknown as PriceSeries
}

const run = (p: Pattern, values: number[]) => {
  const s = pivotSeries(values)
  return p(s, 0, s.length - 1)
}

describe("hill and valley", () => {
  it("hill finds a rise followed by a fall", () => {
    expect(run(hill, [1, 3, 2]).map((i) => landmarks(i))).toEqual([[0, 1, 2]])
  })

  it("valley finds a fall followed by a rise", () => {
    expect(run(valley, [3, 1, 2]).map((i) => landmarks(i))).toEqual([[0, 1, 2]])
  })

  it("hill finds nothing in a straight climb", () => {
    expect(run(hill, [1, 2, 3, 4])).toHaveLength(0)
  })
})

describe("headAndShoulders", () => {
  const classic = [100, 120, 105, 130, 105, 120, 100]

  it("finds the textbook formation with full score", () => {
    const out = run(headAndShoulders, classic)
    expect(out).toHaveLength(1)
    expect(landmarks(out[0]!)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(out[0]!.score).toBe(1)
  })

  it("scores a head that is level with the shoulders below one half", () => {
    const out = run(headAndShoulders, [100, 120, 105, 120, 105, 120, 100])
    expect(out.every((i) => i.score < 0.5)).toBe(true)
  })

  it("scores unequal shoulders lower than level ones", () => {
    const out = run(headAndShoulders, [100, 120, 105, 140, 105, 125, 100])
    expect(out).toHaveLength(1)
    expect(out[0]!.score).toBeLessThan(1)
    expect(out[0]!.score).toBeGreaterThan(0)
  })

  it("rejects wildly unequal shoulders", () => {
    expect(run(headAndShoulders, [100, 110, 105, 200, 105, 150, 100])).toHaveLength(0)
  })

  it("does not find the inverted formation", () => {
    expect(run(headAndShoulders, [130, 110, 125, 100, 125, 110, 130])).toHaveLength(0)
  })
})

describe("inverseHeadAndShoulders", () => {
  it("finds the mirror image of the textbook formation", () => {
    const out = run(inverseHeadAndShoulders, [130, 110, 125, 100, 125, 110, 130])
    expect(out).toHaveLength(1)
    expect(out[0]!.score).toBe(1)
  })

  it("does not find the upright formation", () => {
    expect(run(inverseHeadAndShoulders, [100, 120, 105, 130, 105, 120, 100])).toHaveLength(0)
  })
})

describe("doubleTop and doubleBottom", () => {
  it("doubleTop finds two level peaks with a dip between", () => {
    const out = run(doubleTop, [100, 120, 100, 120, 100])
    expect(out).toHaveLength(1)
    expect(out[0]!.score).toBe(1)
  })

  it("doubleTop scores a too-shallow dip below one half", () => {
    const out = run(doubleTop, [100, 120, 118, 120, 100])
    expect(out.every((i) => i.score < 0.5)).toBe(true)
  })

  it("doubleTop rejects peaks at different prices", () => {
    expect(run(doubleTop, [100, 120, 100, 160, 100])).toHaveLength(0)
  })

  it("doubleBottom finds two level troughs with a rally between", () => {
    const out = run(doubleBottom, [120, 100, 120, 100, 120])
    expect(out).toHaveLength(1)
    expect(out[0]!.score).toBe(1)
  })
})
