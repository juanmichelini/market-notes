import { describe, it, expect } from "vitest"
import { constrainedBy, followedBy, overlay, type Constraint } from "../src/combinators.js"
import { bar, up, down, horizontal, resistanceLine, supportLine } from "../src/primitives.js"
import { landmarks, type CompositeInstance, type Instance, type Pattern } from "../src/patterns.js"
import type { PriceSeries } from "../src/types.js"

function makeSeries(highs: number[], lows: number[]): PriceSeries {
  return highs.map((high, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    ohlcv: { open: lows[i]!, high, low: lows[i]!, close: high, volume: 1 },
  })) as unknown as PriceSeries
}

const series = makeSeries([1, 2, 3, 4, 5], [0, 1, 2, 3, 4])
const lms = (xs: ReadonlyArray<Instance>) => xs.map((i) => landmarks(i))

describe("constrainedBy", () => {
  it("with a constraint that is always 1 returns the instances unchanged", () => {
    const always: Constraint = () => 1
    expect(constrainedBy(bar, always)(series, 0, 4)).toEqual(bar(series, 0, 4))
  })

  it("drops instances whose constraint is 0", () => {
    const evenOnly: Constraint = (_s, i) => (landmarks(i)[0]! % 2 === 0 ? 1 : 0)
    expect(lms(constrainedBy(bar, evenOnly)(series, 0, 4))).toEqual([[0], [2], [4]])
  })

  it("lowers the score to the minimum of the old score and the constraint", () => {
    const half: Constraint = () => 0.5
    const out = constrainedBy(bar, half)(series, 0, 4)
    expect(out.every((i) => i.score === 0.5)).toBe(true)
  })

  it("never raises a score above the instance's own score", () => {
    const base: Pattern = () => [{ kind: "bar", landmarks: [0], score: 0.25 }]
    expect(constrainedBy(base, () => 1)(series, 0, 4)[0]!.score).toBe(0.25)
  })

  it("drops instances whose constraint is NaN (unknown is not 0 and not 1)", () => {
    expect(constrainedBy(bar, () => NaN)(series, 0, 4)).toHaveLength(0)
  })

  it("never adds instances and keeps their order", () => {
    const base = up(series, 0, 4)
    const out = constrainedBy(up, () => 0.7)(series, 0, 4)
    expect(lms(out)).toEqual(lms(base))
  })

  it("passes the series and the instance to the constraint", () => {
    const seen: Array<[number, number]> = []
    constrainedBy(up, (s, i) => {
      seen.push([s.length, landmarks(i).length])
      return 1
    })(series, 0, 1)
    expect(seen).toEqual([[5, 2]])
  })

  it("composes: constraining twice equals constraining by the minimum", () => {
    const c1: Constraint = (_s, i) => (landmarks(i)[0]! + 1) / 10
    const c2: Constraint = () => 0.3
    const twice = constrainedBy(constrainedBy(bar, c1), c2)(series, 0, 4)
    const once = constrainedBy(bar, (s, i) => Math.min(c1(s, i), c2(s, i)))(series, 0, 4)
    expect(twice).toEqual(once)
  })

  it("rejects a constraint value outside [0, 1]", () => {
    expect(() => constrainedBy(bar, () => 2)(series, 0, 4)).toThrow("constrainedBy")
  })
})

describe("followedBy", () => {
  // Highs rise 0→3, fall 3→5.
  const s = makeSeries([1, 2, 3, 4, 3, 2], [0, 1, 2, 3, 2, 1])

  it("joins an instance of the first pattern to one of the second at a shared bar", () => {
    const out = followedBy(up, down)(s, 0, 5)
    expect(out.every((i) => i.kind === "followedBy")).toBe(true)
    expect(lms(out).some((l) => l.join() === "0,3,5")).toBe(true)
  })

  it("requires the second instance to start exactly where the first ends", () => {
    const out = followedBy(up, down)(s, 0, 5)
    for (const i of out) {
      const [a, b] = (i as CompositeInstance).parts
      expect(landmarks(a!).at(-1)).toBe(landmarks(b!)[0])
    }
  })

  it("scores each result with the minimum of its parts' scores", () => {
    const low: Pattern = () => [{ kind: "bar", landmarks: [1], score: 0.4 }]
    const high: Pattern = () => [{ kind: "bar", landmarks: [1], score: 0.9 }]
    expect(followedBy(low, high)(s, 0, 5)[0]!.score).toBe(0.4)
  })

  it("finds nothing when the second pattern never starts where the first ends", () => {
    expect(followedBy(down, up)(makeSeries([1, 2, 3], [0, 1, 2]), 0, 2)).toHaveLength(0)
  })

  it("only reports instances inside the interval", () => {
    expect(lms(followedBy(up, down)(s, 0, 4)).every((l) => l.every((b) => b <= 4))).toBe(true)
    expect(followedBy(up, down)(s, 1, 5).every((i) => landmarks(i)[0]! >= 1)).toBe(true)
  })

  it("lists instances in ascending order of (first, last) landmark", () => {
    const out = lms(followedBy(bar, bar)(series, 0, 4))
    const keys = out.map((l) => l[0]! * 100 + l.at(-1)!)
    expect(keys).toEqual([...keys].sort((x, y) => x - y))
  })

  it("is associative in landmarks and scores", () => {
    const left = followedBy(followedBy(up, horizontal()), down)(s, 0, 5)
    const right = followedBy(up, followedBy(horizontal(), down))(s, 0, 5)
    const summary = (xs: ReadonlyArray<Instance>) => xs.map((i) => [landmarks(i), i.score])
    expect(summary(left)).toEqual(summary(right))
  })
})

describe("overlay", () => {
  const s = makeSeries([1, 5, 3, 5, 2, 1], [0, 4, 2, 4, 1, 0])

  it("joins instances that span exactly the same interval", () => {
    const out = overlay(resistanceLine(), supportLine())(s, 0, 5)
    expect(out.every((i) => i.kind === "overlay")).toBe(true)
    for (const i of out) {
      const [a, b] = (i as CompositeInstance).parts
      expect([landmarks(a!)[0], landmarks(a!).at(-1)]).toEqual([landmarks(b!)[0], landmarks(b!).at(-1)])
    }
  })

  it("finds nothing when no two instances share a span", () => {
    expect(overlay(up, down)(makeSeries([1, 2, 3], [0, 1, 2]), 0, 2)).toHaveLength(0)
  })

  it("scores each result with the minimum of its parts' scores", () => {
    const low: Pattern = () => [{ kind: "bar", landmarks: [2], score: 0.3 }]
    const high: Pattern = () => [{ kind: "bar", landmarks: [2], score: 0.8 }]
    const out = overlay(low, high)(s, 0, 5)
    expect(out).toHaveLength(1)
    expect(out[0]!.score).toBe(0.3)
    expect(landmarks(out[0]!)).toEqual([2])
  })

  it("pairs every instance of one pattern with every instance of the other on that span", () => {
    const two: Pattern = () => [
      { kind: "up", landmarks: [0, 2], score: 1 },
      { kind: "down", landmarks: [0, 2], score: 1 },
    ]
    expect(overlay(two, two)(s, 0, 5)).toHaveLength(4)
  })

  it("is associative in landmarks and scores", () => {
    const l = overlay(overlay(resistanceLine(), supportLine()), up)(s, 0, 5)
    const r = overlay(resistanceLine(), overlay(supportLine(), up))(s, 0, 5)
    const summary = (xs: ReadonlyArray<Instance>) => xs.map((i) => [landmarks(i), i.score])
    expect(summary(l)).toEqual(summary(r))
  })
})
