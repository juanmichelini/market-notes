import { describe, it, expect } from "vitest"
import {
  landmarks,
  components,
  span,
  type Instance,
  type ShapeInstance,
  type LineInstance,
  type CompositeInstance,
} from "../src/patterns.js"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function shape(kind: ShapeInstance["kind"], ...bars: number[]): ShapeInstance {
  return { kind, landmarks: bars, score: 1 }
}

function line(kind: LineInstance["kind"], from: number, to: number): LineInstance {
  return { kind, landmarks: [from, to], touches: [from + 1, to - 1], slope: 0, intercept: 5, score: 1 }
}

function followedBy(...parts: Instance[]): CompositeInstance {
  return { kind: "followedBy", parts, score: 1 }
}

function overlay(...parts: Instance[]): CompositeInstance {
  return { kind: "overlay", parts, score: 1 }
}

// ---------------------------------------------------------------------------
// landmarks of primitives
// ---------------------------------------------------------------------------

describe("landmarks of primitive instances", () => {
  it("of a bar instance is its single bar", () => {
    expect(landmarks(shape("bar", 7))).toEqual([7])
  })

  it("of an up instance is its start and end bars", () => {
    expect(landmarks(shape("up", 2, 5))).toEqual([2, 5])
  })

  it("of a line instance is the first and last bar of its span", () => {
    expect(landmarks(line("resistance", 0, 4))).toEqual([0, 4])
  })
})

// ---------------------------------------------------------------------------
// landmarks of followed-by
// ---------------------------------------------------------------------------

describe("landmarks of followedBy instances", () => {
  it("list the left landmarks then the right ones, counting the junction once", () => {
    expect(landmarks(followedBy(shape("up", 0, 3), shape("down", 3, 6)))).toEqual([0, 3, 6])
  })

  it("number one fewer than the sum of the parts' landmarks", () => {
    const parts = [shape("up", 0, 2), shape("down", 2, 5), shape("up", 5, 9)]
    expect(landmarks(followedBy(...parts))).toHaveLength(2 + 2 + 2 - 2)
  })

  it("chain through three parts in chronological order", () => {
    const parts = [shape("up", 0, 2), shape("down", 2, 5), shape("up", 5, 9)]
    expect(landmarks(followedBy(...parts))).toEqual([0, 2, 5, 9])
  })

  it("use the landmarks of an overlay part", () => {
    const overlaid = overlay(line("resistance", 0, 4), line("support", 0, 4))
    expect(landmarks(followedBy(overlaid, shape("up", 4, 6)))).toEqual([0, 4, 6])
  })
})

// ---------------------------------------------------------------------------
// landmarks of overlay
// ---------------------------------------------------------------------------

describe("landmarks of overlay instances", () => {
  it("of two lines over the same interval are that interval's two ends", () => {
    expect(landmarks(overlay(line("resistance", 0, 5), line("support", 0, 5)))).toEqual([0, 5])
  })

  it("number two fewer than the sum of the parts' landmarks", () => {
    expect(landmarks(overlay(line("resistance", 0, 5), line("support", 0, 5)))).toHaveLength(2 + 2 - 2)
  })

  it("keep the inner landmarks of each part between the shared ends", () => {
    const a = followedBy(shape("up", 0, 2), shape("down", 2, 6))
    const b = shape("horizontal", 0, 6)
    expect(landmarks(overlay(a, b))).toEqual([0, 2, 6])
  })

  it("collapse to one landmark when the parts are single bars", () => {
    expect(landmarks(overlay(shape("bar", 3), shape("bar", 3)))).toEqual([3])
  })
})

// ---------------------------------------------------------------------------
// components
// ---------------------------------------------------------------------------

describe("components", () => {
  it("of a primitive instance is the instance itself as a one-element list", () => {
    const up = shape("up", 0, 2)
    expect(components(up)).toEqual([up])
  })

  it("of a line instance is the instance itself as a one-element list", () => {
    const res = line("resistance", 0, 4)
    expect(components(res)).toEqual([res])
  })

  it("of a composite instance is its parts, in order", () => {
    const up = shape("up", 0, 2)
    const down = shape("down", 2, 5)
    expect(components(followedBy(up, down))).toEqual([up, down])
  })
})

// ---------------------------------------------------------------------------
// span
// ---------------------------------------------------------------------------

describe("span", () => {
  it("is the first and last landmark of a primitive", () => {
    expect(span(shape("up", 2, 5))).toEqual([2, 5])
  })

  it("is the first and last landmark of a composite", () => {
    expect(span(followedBy(shape("up", 0, 3), shape("down", 3, 6)))).toEqual([0, 6])
  })

  it("of a bar instance starts and ends at that bar", () => {
    expect(span(shape("bar", 4))).toEqual([4, 4])
  })
})
