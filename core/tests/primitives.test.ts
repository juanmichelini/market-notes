import { describe, it, expect } from "vitest"
import { bar, up } from "../src/primitives.js"
import { landmarks, type Instance } from "../src/patterns.js"
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

/** The landmarks of each instance, for compact assertions. */
function lms(instances: ReadonlyArray<Instance>): ReadonlyArray<ReadonlyArray<number>> {
  return instances.map((i) => landmarks(i))
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

// ---------------------------------------------------------------------------
// up
// ---------------------------------------------------------------------------

describe("up", () => {
  it("finds every rise in a steadily rising series, ascending by start then end", () => {
    const s = makeSeries([1, 2, 3], [0.5, 1.5, 2.5])
    expect(lms(up(s, 0, 2))).toEqual([[0, 1], [0, 2], [1, 2]])
  })

  it("finds nothing in a falling series", () => {
    const s = makeSeries([3, 2, 1], [2.5, 1.5, 0.5])
    expect(up(s, 0, 2)).toHaveLength(0)
  })

  it("stops extending a rise once a low falls to or below the starting low", () => {
    // From bar 0 the low at bar 2 (0.5) is below the starting low (1), so only [0, 1] survives.
    const s = makeSeries([1, 2, 3, 4], [1, 2, 0.5, 3])
    expect(lms(up(s, 0, 3))).toEqual([[0, 1], [2, 3]])
  })

  it("requires the high at the end to exceed every earlier high in the rise", () => {
    // Bar 0 has the highest high, so nothing that starts at bar 0 qualifies.
    const s = makeSeries([3, 1, 2], [1, 1, 2])
    expect(lms(up(s, 0, 2))).toEqual([[1, 2]])
  })

  it("scores every instance 1", () => {
    const s = makeSeries([1, 2, 3], [0.5, 1.5, 2.5])
    expect(up(s, 0, 2).map((i) => i.score)).toEqual([1, 1, 1])
  })

  it("gives nothing for an interval of a single bar", () => {
    const s = makeSeries([1, 2, 3], [0.5, 1.5, 2.5])
    expect(up(s, 1, 1)).toHaveLength(0)
  })

  it("only reports rises that lie entirely inside the interval", () => {
    const s = makeSeries([1, 2, 3, 4], [0.5, 1.5, 2.5, 3.5])
    expect(lms(up(s, 1, 2))).toEqual([[1, 2]])
  })

  it("never reports a rise that spans a missing high", () => {
    const s = makeSeries([1, NaN, 3], [0.5, 1.5, 2.5])
    expect(up(s, 0, 2)).toHaveLength(0)
  })

  it("never reports a rise that starts or ends on a missing low", () => {
    const s = makeSeries([1, 2, 3], [NaN, 1.5, 2.5])
    expect(lms(up(s, 0, 2))).toEqual([[1, 2]])
  })
})

