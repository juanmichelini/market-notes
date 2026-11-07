import { describe, it, expect } from "vitest"
import { fuzzyAnd, fuzzyOr, fuzzyNot } from "../src/fuzzy.js"

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
