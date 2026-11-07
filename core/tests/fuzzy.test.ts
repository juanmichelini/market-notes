import { describe, it, expect } from "vitest"
import {
  fuzzyAnd,
  fuzzyOr,
  fuzzyNot,
  approxEqual,
  approxGreater,
  approxLess,
} from "../src/fuzzy.js"

// ---------------------------------------------------------------------------
// fuzzyAnd
// ---------------------------------------------------------------------------

describe("fuzzyAnd", () => {
  it("is the minimum of its operands", () => {
    expect(fuzzyAnd([0.7, 0.2, 0.9])).toBe(0.2)
  })

  it("is 1 for no operands (the identity of conjunction)", () => {
    expect(fuzzyAnd([])).toBe(1)
  })

  it("does not depend on the order of the operands", () => {
    expect(fuzzyAnd([0.3, 0.8])).toBe(fuzzyAnd([0.8, 0.3]))
  })

  it("equals ordinary conjunction on crisp values", () => {
    expect(fuzzyAnd([1, 1])).toBe(1)
    expect(fuzzyAnd([1, 0])).toBe(0)
  })

  it("rejects values above 1", () => {
    expect(() => fuzzyAnd([0.5, 1.2])).toThrow("fuzzyAnd")
  })

  it("rejects negative values", () => {
    expect(() => fuzzyAnd([-0.1])).toThrow("fuzzyAnd")
  })

  it("rejects NaN rather than treating it as 0 or 1", () => {
    expect(() => fuzzyAnd([0.5, NaN])).toThrow("NaN")
  })
})

// ---------------------------------------------------------------------------
// fuzzyOr
// ---------------------------------------------------------------------------

describe("fuzzyOr", () => {
  it("is the maximum of its operands", () => {
    expect(fuzzyOr([0.7, 0.2, 0.9])).toBe(0.9)
  })

  it("is 0 for no operands (the identity of disjunction)", () => {
    expect(fuzzyOr([])).toBe(0)
  })

  it("equals ordinary disjunction on crisp values", () => {
    expect(fuzzyOr([0, 0])).toBe(0)
    expect(fuzzyOr([0, 1])).toBe(1)
  })

  it("rejects values outside [0, 1]", () => {
    expect(() => fuzzyOr([2])).toThrow("fuzzyOr")
  })

  it("rejects NaN", () => {
    expect(() => fuzzyOr([NaN])).toThrow("NaN")
  })
})

// ---------------------------------------------------------------------------
// fuzzyNot
// ---------------------------------------------------------------------------

describe("fuzzyNot", () => {
  it("is 1 minus its operand", () => {
    expect(fuzzyNot(0.25)).toBeCloseTo(0.75, 10)
  })

  it("is an involution: negating twice returns the original value", () => {
    expect(fuzzyNot(fuzzyNot(0.3))).toBeCloseTo(0.3, 10)
  })

  it("maps 0 to 1 and 1 to 0", () => {
    expect(fuzzyNot(0)).toBe(1)
    expect(fuzzyNot(1)).toBe(0)
  })

  it("rejects values outside [0, 1]", () => {
    expect(() => fuzzyNot(1.5)).toThrow("fuzzyNot")
  })

  it("rejects NaN", () => {
    expect(() => fuzzyNot(NaN)).toThrow("NaN")
  })
})

// ---------------------------------------------------------------------------
// De Morgan duality
// ---------------------------------------------------------------------------

describe("fuzzy connectives together", () => {
  it("satisfy De Morgan: not(a and b) = (not a) or (not b)", () => {
    const a = 0.3
    const b = 0.8
    expect(fuzzyNot(fuzzyAnd([a, b]))).toBeCloseTo(fuzzyOr([fuzzyNot(a), fuzzyNot(b)]), 10)
  })

  it("satisfy De Morgan: not(a or b) = (not a) and (not b)", () => {
    const a = 0.3
    const b = 0.8
    expect(fuzzyNot(fuzzyOr([a, b]))).toBeCloseTo(fuzzyAnd([fuzzyNot(a), fuzzyNot(b)]), 10)
  })
})

// ---------------------------------------------------------------------------
// approxEqual
// ---------------------------------------------------------------------------

describe("approxEqual", () => {
  it("is 1 when the operands are equal", () => {
    expect(approxEqual(5, 5, 1)).toBe(1)
  })

  it("is symmetric in its operands", () => {
    expect(approxEqual(4.2, 5, 1)).toBe(approxEqual(5, 4.2, 1))
  })

  it("falls linearly: halfway to the width it is 0.5", () => {
    expect(approxEqual(5, 5.5, 1)).toBeCloseTo(0.5, 10)
  })

  it("is 0 at a distance equal to the width", () => {
    expect(approxEqual(5, 6, 1)).toBe(0)
  })

  it("is 0 beyond the width", () => {
    expect(approxEqual(5, 9, 1)).toBe(0)
  })

  it("by default uses 5% of the larger magnitude as the width", () => {
    expect(approxEqual(100, 95)).toBe(0)
    expect(approxEqual(100, 97.5)).toBeCloseTo(0.5, 10)
  })

  it("with width 0 is crisp equality", () => {
    expect(approxEqual(5, 5, 0)).toBe(1)
    expect(approxEqual(5, 5.0001, 0)).toBe(0)
  })

  it("is NaN when an operand is NaN", () => {
    expect(approxEqual(NaN, 5, 1)).toBeNaN()
    expect(approxEqual(5, NaN, 1)).toBeNaN()
  })

  it("rejects a negative width", () => {
    expect(() => approxEqual(1, 1, -1)).toThrow("approxEqual")
  })

  it("treats infinite operands as exact", () => {
    expect(approxEqual(Infinity, Infinity)).toBe(1)
    expect(approxEqual(Infinity, 5)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// approxGreater
// ---------------------------------------------------------------------------

describe("approxGreater", () => {
  it("is 1 when x is at least y", () => {
    expect(approxGreater(6, 5, 1)).toBe(1)
    expect(approxGreater(5, 5, 1)).toBe(1)
  })

  it("is partly true just below y (CPL: 4.9 is approximately greater than 5.0)", () => {
    expect(approxGreater(4.9, 5.0, 1)).toBeCloseTo(0.9, 10)
  })

  it("is 0 at a distance equal to the width below y", () => {
    expect(approxGreater(4, 5, 1)).toBe(0)
  })

  it("is non-decreasing in x", () => {
    const xs = [3, 3.5, 4, 4.25, 4.5, 4.9, 5, 5.5, 7]
    const values = xs.map((x) => approxGreater(x, 5, 1))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]! >= values[i - 1]!).toBe(true)
    }
  })

  it("by default uses 5% of |y| as the width", () => {
    expect(approxGreater(95, 100)).toBe(0)
    expect(approxGreater(97.5, 100)).toBeCloseTo(0.5, 10)
  })

  it("with width 0 is the crisp comparison x >= y", () => {
    expect(approxGreater(5, 5, 0)).toBe(1)
    expect(approxGreater(4.999, 5, 0)).toBe(0)
  })

  it("is crisp when y is 0 and no width is given", () => {
    expect(approxGreater(0.001, 0)).toBe(1)
    expect(approxGreater(-0.001, 0)).toBe(0)
  })

  it("is NaN when an operand is NaN", () => {
    expect(approxGreater(NaN, 5, 1)).toBeNaN()
    expect(approxGreater(5, NaN, 1)).toBeNaN()
  })

  it("rejects a negative width", () => {
    expect(() => approxGreater(1, 1, -1)).toThrow("approxGreater")
  })
})

// ---------------------------------------------------------------------------
// approxLess
// ---------------------------------------------------------------------------

describe("approxLess", () => {
  it("is 1 when x is at most y", () => {
    expect(approxLess(4, 5, 1)).toBe(1)
    expect(approxLess(5, 5, 1)).toBe(1)
  })

  it("is partly true just above y", () => {
    expect(approxLess(5.1, 5.0, 1)).toBeCloseTo(0.9, 10)
  })

  it("is 0 at a distance equal to the width above y", () => {
    expect(approxLess(6, 5, 1)).toBe(0)
  })

  it("is the mirror image of approxGreater", () => {
    expect(approxLess(5.3, 5, 1)).toBeCloseTo(approxGreater(-5.3, -5, 1), 10)
  })

  it("is non-increasing in x", () => {
    const xs = [3, 4.5, 5, 5.1, 5.5, 5.9, 6, 8]
    const values = xs.map((x) => approxLess(x, 5, 1))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]! <= values[i - 1]!).toBe(true)
    }
  })

  it("is NaN when an operand is NaN", () => {
    expect(approxLess(NaN, 5, 1)).toBeNaN()
  })

  it("rejects a negative width", () => {
    expect(() => approxLess(1, 1, -1)).toThrow("approxLess")
  })
})
