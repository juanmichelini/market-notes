import { describe, it, expect } from "vitest"
import { findPatterns } from "../src/search.js"
import { lineThrough, valueAt, extendLine } from "../src/extrapolation.js"
import { span, type Pattern } from "../src/patterns.js"
import type { PriceSeries } from "../src/types.js"

const series = [1, 2, 3, 4, 5].map((p, i) => ({
  date: `2024-01-0${i + 1}`,
  ohlcv: { open: p, high: p, low: p, close: p, adjClose: p, volume: 1 },
})) as unknown as PriceSeries

const three: Pattern = () => [
  { kind: "bar", landmarks: [3], score: 0.5 },
  { kind: "bar", landmarks: [1], score: 0.9 },
  { kind: "bar", landmarks: [2], score: 0.9 },
]

describe("findPatterns", () => {
  it("sorts by descending score, then ascending first bar", () => {
    expect(findPatterns(series, three).map((i) => span(i)[0])).toEqual([1, 2, 3])
  })

  it("drops instances below minScore", () => {
    expect(findPatterns(series, three, { minScore: 0.6 })).toHaveLength(2)
  })

  it("passes the interval to the pattern", () => {
    let seen: [number, number] = [-1, -1]
    findPatterns(series, (_s, f, t) => { seen = [f, t]; return [] }, { from: 1, to: 3 })
    expect(seen).toEqual([1, 3])
  })

  it("defaults to the whole series", () => {
    let seen: [number, number] = [-1, -1]
    findPatterns(series, (_s, f, t) => { seen = [f, t]; return [] })
    expect(seen).toEqual([0, 4])
  })

  it("returns nothing for an empty series and rejects a bad minScore", () => {
    expect(findPatterns([], three)).toEqual([])
    expect(() => findPatterns(series, three, { minScore: 2 })).toThrow("findPatterns")
  })
})

describe("lineThrough and extendLine", () => {
  it("computes slope and intercept", () => {
    expect(lineThrough({ bar: 2, price: 10 }, { bar: 4, price: 14 })).toEqual({ slope: 2, intercept: 6 })
  })

  it("passes through both defining points", () => {
    const p = { bar: 3, price: 7.5 }
    const q = { bar: 11, price: 2.5 }
    const line = lineThrough(p, q)
    expect(valueAt(line, p.bar)).toBeCloseTo(p.price, 12)
    expect(valueAt(line, q.bar)).toBeCloseTo(q.price, 12)
  })

  it("gives a flat line slope 0, not -0", () => {
    const line = lineThrough({ bar: 1, price: 5 }, { bar: 4, price: 5 })
    expect(Object.is(line.slope, 0)).toBe(true)
  })

  it("rejects two points on the same bar", () => {
    expect(() => lineThrough({ bar: 1, price: 1 }, { bar: 1, price: 2 })).toThrow("lineThrough")
  })

  it("extends a line beyond its defining points", () => {
    const line = lineThrough({ bar: 0, price: 0 }, { bar: 1, price: 2 })
    expect(extendLine(line, 1, 5)).toEqual([{ bar: 1, price: 2 }, { bar: 5, price: 10 }])
  })

  it("rejects a backwards range", () => {
    expect(() => extendLine({ slope: 1, intercept: 0 }, 5, 1)).toThrow("extendLine")
  })
})
