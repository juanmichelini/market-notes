import { describe, it, expect } from "vitest"
import { detectPatterns, PATTERNS } from "../src/detect.js"
import { valueAt } from "../src/extrapolation.js"
import type { PriceSeries } from "../src/types.js"

/** Daily series through the given waypoints, moving in a straight line between them. */
function through(waypoints: number[], stepsBetween = 10): PriceSeries {
  const values: number[] = []
  for (let k = 0; k < waypoints.length - 1; k++) {
    const a = waypoints[k]!
    const b = waypoints[k + 1]!
    for (let s = 0; s < stepsBetween; s++) values.push(a + ((b - a) * s) / stepsBetween)
  }
  values.push(waypoints[waypoints.length - 1]!)
  return values.map((p, i) => ({
    date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
    ohlcv: { open: p, high: p * 1.001, low: p * 0.999, close: p, adjClose: p, volume: 1 },
  })) as unknown as PriceSeries
}

describe("detectPatterns", () => {
  const hs = through([100, 120, 105, 130, 105, 120, 100])

  it("finds a head and shoulders on the original bars", () => {
    const out = detectPatterns(hs, "headAndShoulders")
    expect(out).toHaveLength(1)
    expect(out[0]!.points.map((p) => p.bar)).toEqual([0, 10, 20, 30, 40, 50, 60])
    expect(out[0]!.points.map((p) => p.price)).toEqual([100, 120, 105, 130, 105, 120, 100])
  })

  it("gives the neckline through the two troughs, ready to extend", () => {
    const d = detectPatterns(hs, "headAndShoulders")[0]!
    expect(d.neckline!.from.bar).toBe(20)
    expect(valueAt(d.neckline!.line, 60)).toBeCloseTo(105, 9)
  })

  it("finds nothing of the wrong formation", () => {
    expect(detectPatterns(hs, "inverseHeadAndShoulders")).toHaveLength(0)
  })

  it("ignores swings smaller than the threshold", () => {
    const small = through([100, 102, 101, 103, 101, 102, 100])
    expect(detectPatterns(small, "headAndShoulders", { threshold: 0.1 })).toHaveLength(0)
  })

  it("searches only the last `window` bars", () => {
    const long = through([50, 60, 50, ...[100, 120, 105, 130, 105, 120, 100].slice(0)])
    const all = detectPatterns(long, "headAndShoulders")
    const recent = detectPatterns(long, "headAndShoulders", { window: 70 })
    expect(all).toHaveLength(1)
    expect(recent).toHaveLength(1)
    expect(recent[0]!.points[3]!.bar).toBe(all[0]!.points[3]!.bar)
    expect(detectPatterns(long, "headAndShoulders", { window: 20 })).toHaveLength(0)
  })

  it("reports each hill once, not once per nested rise", () => {
    const bumpy = through([100, 120, 100, 120, 100, 120, 100])
    const hills = detectPatterns(bumpy, "hill")
    const starts = hills.map((h) => h.points[0]!.bar)
    expect(new Set(starts).size).toBe(starts.length)
    expect(hills.length).toBeGreaterThanOrEqual(3)
  })

  it("has a neckline for double tops and none for hills", () => {
    const dt = detectPatterns(through([100, 120, 100, 120, 100]), "doubleTop")
    expect(dt.length).toBeGreaterThan(0)
    expect(dt[0]!.neckline!.line.slope).toBe(0)
    expect(detectPatterns(through([1, 2, 1]), "hill")[0]!.neckline).toBeUndefined()
  })

  it("returns nothing for an empty or flat series", () => {
    expect(detectPatterns([], "hill")).toEqual([])
    expect(detectPatterns(through([5, 5, 5]), "hill")).toEqual([])
  })

  it("rejects bad options and unknown names", () => {
    expect(() => detectPatterns(hs, "hill", { window: 0 })).toThrow("detectPatterns")
    expect(() => detectPatterns(hs, "nope" as never)).toThrow("detectPatterns")
    expect(() => detectPatterns(hs, "hill", { threshold: 2 })).toThrow("pivots")
  })

  it("runs fast on ten years of noisy prices", () => {
    let x = 42
    let price = 100
    const noisy = Array.from({ length: 2520 }, (_, i) => {
      x = (x * 1103515245 + 12345) % 2147483648
      price = Math.max(1, price * (1 + ((x / 2147483648) - 0.5) * 0.04))
      return {
        date: new Date(Date.UTC(2010, 0, 1 + i)).toISOString().slice(0, 10),
        ohlcv: { open: price, high: price, low: price, close: price, adjClose: price, volume: 1 },
      }
    }) as unknown as PriceSeries
    const t0 = Date.now()
    for (const p of PATTERNS) detectPatterns(noisy, p.name, { threshold: 0.1 })
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})
