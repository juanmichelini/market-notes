import { describe, it, expect } from "vitest"
import { bar, up, down, horizontal } from "../src/primitives.js"
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

// ---------------------------------------------------------------------------
// down
// ---------------------------------------------------------------------------

describe("down", () => {
  it("finds every fall in a steadily falling series, ascending by start then end", () => {
    const s = makeSeries([3, 2, 1], [2.5, 1.5, 0.5])
    expect(lms(down(s, 0, 2))).toEqual([[0, 1], [0, 2], [1, 2]])
  })

  it("finds nothing in a rising series", () => {
    const s = makeSeries([1, 2, 3], [0.5, 1.5, 2.5])
    expect(down(s, 0, 2)).toHaveLength(0)
  })

  it("stops extending a fall once a high rises to or above the starting high", () => {
    // From bar 0 the high at bar 2 (5) is above the starting high (4), so only [0, 1] survives.
    const s = makeSeries([4, 3, 5, 2], [3, 2, 1, 0.5])
    expect(lms(down(s, 0, 3))).toEqual([[0, 1], [2, 3]])
  })

  it("requires the low at the end to be below every earlier low in the fall", () => {
    // Bar 0 has the lowest low, so nothing that starts at bar 0 qualifies.
    const s = makeSeries([3, 3, 2], [1, 3, 2])
    expect(lms(down(s, 0, 2))).toEqual([[1, 2]])
  })

  it("scores every instance 1", () => {
    const s = makeSeries([3, 2, 1], [2.5, 1.5, 0.5])
    expect(down(s, 0, 2).map((i) => i.score)).toEqual([1, 1, 1])
  })

  it("gives nothing for an interval of a single bar", () => {
    const s = makeSeries([3, 2, 1], [2.5, 1.5, 0.5])
    expect(down(s, 1, 1)).toHaveLength(0)
  })

  it("only reports falls that lie entirely inside the interval", () => {
    const s = makeSeries([4, 3, 2, 1], [3.5, 2.5, 1.5, 0.5])
    expect(lms(down(s, 1, 2))).toEqual([[1, 2]])
  })

  it("never reports a fall that spans a missing low", () => {
    const s = makeSeries([3, 2, 1], [2.5, NaN, 0.5])
    expect(down(s, 0, 2)).toHaveLength(0)
  })

  it("never reports a fall that starts or ends on a missing high", () => {
    const s = makeSeries([NaN, 2, 1], [2.5, 1.5, 0.5])
    expect(lms(down(s, 0, 2))).toEqual([[1, 2]])
  })

  it("mirrors up: a series and its negation give the same instances", () => {
    const highs = [1, 2, 3, 4, 2, 6]
    const lows = [0.5, 1.5, 2.5, 3.5, 1.5, 5.5]
    const rising = makeSeries(highs, lows)
    // Negating prices swaps the roles of highs and lows.
    const mirrored = makeSeries(lows.map((l) => -l), highs.map((h) => -h))
    expect(lms(down(mirrored, 0, 5))).toEqual(lms(up(rising, 0, 5)))
  })
})

// ---------------------------------------------------------------------------
// horizontal
// ---------------------------------------------------------------------------

describe("horizontal", () => {
  /** A series whose closes are exactly `closes` (highs and lows are irrelevant here). */
  function closing(closes: number[]): PriceSeries {
    return makeSeries(closes.map((c) => c + 1), closes.map((c) => c - 1), closes)
  }

  it("finds every stretch of a perfectly flat series, scored 1", () => {
    const found = horizontal()(closing([10, 10, 10]), 0, 2)
    expect(lms(found)).toEqual([[0, 1], [0, 2], [1, 2]])
    expect(found.map((i) => i.score)).toEqual([1, 1, 1])
  })

  it("scores a stretch by how closely its closes match the last close", () => {
    // width 2: |100 - 101| = 1 is halfway to the width, so the score is 0.5.
    const found = horizontal({ width: 2 })(closing([100, 101, 103]), 0, 2)
    expect(lms(found)).toEqual([[0, 1]])
    expect(found[0]!.score).toBeCloseTo(0.5, 10)
  })

  it("gives a stretch the lowest score of any close in it", () => {
    // Every stretch passes through the 10.5 close, which scores 0.5 against 10.
    const found = horizontal({ width: 1 })(closing([10, 10.5, 10]), 0, 2)
    expect(lms(found)).toEqual([[0, 1], [0, 2], [1, 2]])
    expect(found.map((i) => i.score)).toEqual([0.5, 0.5, 0.5])
  })

  it("finds nothing when every pair of closes is further apart than the width", () => {
    expect(horizontal({ width: 1 })(closing([10, 12, 14]), 0, 2)).toHaveLength(0)
  })

  it("never reports a stretch that spans a missing close", () => {
    expect(horizontal()(closing([10, NaN, 10]), 0, 2)).toHaveLength(0)
  })

  it("lists instances in ascending order of start, then end", () => {
    const found = horizontal()(closing([10, 10, 10, 10]), 0, 3)
    expect(lms(found)).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]])
  })

  it("only reports stretches that lie entirely inside the interval", () => {
    expect(lms(horizontal()(closing([10, 10, 10, 10]), 1, 2))).toEqual([[1, 2]])
  })

  it("gives nothing for an interval of a single bar", () => {
    expect(horizontal()(closing([10, 10, 10]), 1, 1)).toHaveLength(0)
  })

  it("by default tolerates differences up to 5% of the price", () => {
    expect(lms(horizontal()(closing([100, 103]), 0, 1))).toEqual([[0, 1]])
    expect(horizontal()(closing([100, 106]), 0, 1)).toHaveLength(0)
  })

  it("with width 0 accepts only identical closes", () => {
    expect(lms(horizontal({ width: 0 })(closing([10, 10, 10.01]), 0, 2))).toEqual([[0, 1]])
  })

  it("rejects a negative width when the pattern is built", () => {
    expect(() => horizontal({ width: -1 })).toThrow("horizontal")
  })
})

