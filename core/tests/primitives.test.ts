import { describe, it, expect } from "vitest"
import { bar, up, down, horizontal, resistanceLine } from "../src/primitives.js"
import { landmarks, type Instance, type LineInstance } from "../src/patterns.js"
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

// ---------------------------------------------------------------------------
// resistanceLine
// ---------------------------------------------------------------------------

/** A deterministic pseudo-random walk of `n` bars, for property tests. */
function randomWalk(n: number, seed: number): PriceSeries {
  let x = seed
  const next = (): number => {
    x = (x * 1664525 + 1013904223) % 4294967296
    return x / 4294967296
  }
  const highs: number[] = []
  const lows: number[] = []
  let price = 100
  for (let i = 0; i < n; i++) {
    price += (next() - 0.5) * 4
    highs.push(price + next())
    lows.push(price - next())
  }
  return makeSeries(highs, lows)
}

/** The instances of `pattern` that are lines, so their fields can be inspected. */
function lines(instances: ReadonlyArray<Instance>): ReadonlyArray<LineInstance> {
  return instances.filter((i): i is LineInstance => i.kind === "resistance" || i.kind === "support")
}

describe("resistanceLine", () => {
  // Highs 1, 5, 3, 5, 2: the two peaks at bars 1 and 3 define a flat line at 5.
  const peaks = makeSeries([1, 5, 3, 5, 2], [0, 4, 2, 4, 1])

  it("finds the flat line through two equal peaks, with its touches, slope and intercept", () => {
    expect(resistanceLine()(peaks, 0, 4)).toEqual([
      { kind: "resistance", landmarks: [0, 4], touches: [1, 3], slope: 0, intercept: 5, score: 1 },
    ])
  })

  it("finds a sloped line through two rising peaks", () => {
    // Highs 0, 2, 1.5, 4, 3: the peaks at bars 1 and 3 lie on price = 1 + t.
    const s = makeSeries([0, 2, 1.5, 4, 3], [-1, 1, 0.5, 3, 2])
    expect(resistanceLine()(s, 0, 4)).toEqual([
      { kind: "resistance", landmarks: [0, 4], touches: [1, 3], slope: 1, intercept: 1, score: 1 },
    ])
  })

  it("finds nothing when the highs are perfectly collinear (no two interior touches)", () => {
    const s = makeSeries([1, 2, 3, 4, 5], [0, 1, 2, 3, 4])
    expect(resistanceLine()(s, 0, 4)).toHaveLength(0)
  })

  it("never has a high above the line anywhere in its span", () => {
    const s = randomWalk(300, 7)
    const found = lines(resistanceLine()(s, 0, 299))
    const violations = found.filter((line) => {
      const [a, b] = line.landmarks
      for (let t = a; t <= b; t++) {
        if (s[t]!.ohlcv.high > line.intercept + line.slope * t + 1e-9) return true
      }
      return false
    })
    expect(found.length).toBeGreaterThan(0)
    expect(violations).toHaveLength(0)
  })

  it("has the highs at its two touches on the line, strictly inside its span", () => {
    const s = randomWalk(200, 11)
    const found = lines(resistanceLine()(s, 0, 199))
    const bad = found.filter((line) => {
      const [a, b] = line.landmarks
      const [u, v] = line.touches
      const onLine = (t: number) => Math.abs(s[t]!.ohlcv.high - (line.intercept + line.slope * t)) < 1e-9
      return !(a < u && u < v && v < b && onLine(u) && onLine(v))
    })
    expect(bad).toHaveLength(0)
  })

  it("lists instances in ascending order of start, then end", () => {
    const found = resistanceLine()(randomWalk(120, 3), 0, 119)
    const keys = found.map((i) => landmarks(i)[0]! * 1000 + landmarks(i)[1]!)
    expect(keys).toEqual([...keys].sort((x, y) => x - y))
  })

  it("only reports lines whose span lies entirely inside the interval", () => {
    const s = makeSeries([9, 1, 5, 3, 5, 2], [8, 0, 4, 2, 4, 1])
    expect(resistanceLine()(s, 1, 5).map((i) => landmarks(i))).toEqual([[1, 5]])
    expect(resistanceLine()(s, 0, 4)).toHaveLength(0)
  })

  it("respects maxLength: a span of 4 steps is too long for maxLength 3", () => {
    expect(resistanceLine({ maxLength: 3 })(peaks, 0, 4)).toHaveLength(0)
  })

  it("respects minLength: a span of 4 steps is too short for minLength 5", () => {
    expect(resistanceLine({ minLength: 5 })(peaks, 0, 4)).toHaveLength(0)
  })

  it("rejects a minLength below 3, since two interior touches need 4 bars", () => {
    expect(() => resistanceLine({ minLength: 2 })).toThrow("resistanceLine")
  })

  it("rejects a maxLength below minLength", () => {
    expect(() => resistanceLine({ minLength: 5, maxLength: 4 })).toThrow("resistanceLine")
  })

  it("never reports a line over a missing high", () => {
    const s = makeSeries([1, 5, NaN, 5, 2], [0, 4, 2, 4, 1])
    expect(resistanceLine()(s, 0, 4)).toHaveLength(0)
  })

  it("scores every instance 1", () => {
    const found = resistanceLine()(randomWalk(100, 5), 0, 99)
    expect(found.every((i) => i.score === 1)).toBe(true)
  })
})

