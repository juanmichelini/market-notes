import { describe, it, expect } from "vitest"
import { constrainedBy, type Constraint } from "../src/combinators.js"
import { bar, up } from "../src/primitives.js"
import { landmarks, type Instance, type Pattern } from "../src/patterns.js"
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
