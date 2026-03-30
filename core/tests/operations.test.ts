import { describe, it, expect } from "vitest"
import { forwardFillIndex, deflate, percentChange, rollingMean } from "../src/operations.js"
import { isoDate, type PriceRow, type IndexRow } from "../src/types.js"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function row(date: string, close: number, adjClose = close): PriceRow {
  return {
    date: isoDate(date),
    ohlcv: {
      open: close,
      high: close,
      low: close,
      close,
      adjClose,
      volume: 1000,
    },
  }
}

function indexRow(date: string, value: number): IndexRow {
  return { date: isoDate(date), value }
}

// ---------------------------------------------------------------------------
// forwardFillIndex
// ---------------------------------------------------------------------------

describe("forwardFillIndex", () => {
  const cpi = [
    indexRow("2024-01-01", 200),
    indexRow("2024-02-01", 202),
    indexRow("2024-03-01", 204),
  ]

  it("returns the exact value for dates that match an index observation", () => {
    const filled = forwardFillIndex(cpi, [isoDate("2024-02-01")])
    expect(filled.get(isoDate("2024-02-01"))).toBe(202)
  })

  it("forward-fills: a mid-month daily date inherits the last monthly reading", () => {
    const filled = forwardFillIndex(cpi, [isoDate("2024-01-15")])
    expect(filled.get(isoDate("2024-01-15"))).toBe(200)
  })

  it("fills multiple dates in a single call", () => {
    const dates = [
      isoDate("2024-01-10"),
      isoDate("2024-01-31"),
      isoDate("2024-02-15"),
    ]
    const filled = forwardFillIndex(cpi, dates)
    expect(filled.get(isoDate("2024-01-10"))).toBe(200)
    expect(filled.get(isoDate("2024-01-31"))).toBe(200)
    expect(filled.get(isoDate("2024-02-15"))).toBe(202)
  })

  it("throws when a date precedes the earliest index observation", () => {
    expect(() =>
      forwardFillIndex(cpi, [isoDate("2005-12-31")])
    ).toThrow()
  })

  it("throws for an empty index series", () => {
    expect(() => forwardFillIndex([], [isoDate("2024-01-01")])).toThrow()
  })
})

// ---------------------------------------------------------------------------
// deflate — real-price formula
// ---------------------------------------------------------------------------

describe("deflate", () => {
  // Monthly CPI: Jan=200, Feb=220
  const cpi = [
    indexRow("2024-01-01", 200),
    indexRow("2024-02-01", 220),
  ]

  // Daily prices spanning both CPI months
  const prices = [
    row("2024-01-15", 100),
    row("2024-02-15", 110),
  ]

  it("correctly applies the real-price formula: p_real = p × I(t₀) / I(t)", () => {
    // base date = 2024-01-15, I(t₀) = 200 (forward-filled from 2024-01-01 CPI)
    // For 2024-01-15: p_real = 100 × 200/200 = 100
    // For 2024-02-15: p_real = 110 × 200/220 ≈ 100
    const deflated = deflate(prices, cpi)
    expect(deflated[0]!.ohlcv.close).toBeCloseTo(100)
    expect(deflated[1]!.ohlcv.close).toBeCloseTo(100)
  })

  it("forward-fills monthly CPI to daily prices correctly", () => {
    // Three daily prices in January all get CPI=200
    const dailyPrices = [
      row("2024-01-10", 100),
      row("2024-01-20", 102),
      row("2024-01-30", 104),
    ]
    const deflated = deflate(dailyPrices, cpi)
    // All three dates use the same CPI (200), so deflated = nominal
    expect(deflated[0]!.ohlcv.close).toBeCloseTo(100)
    expect(deflated[1]!.ohlcv.close).toBeCloseTo(102)
    expect(deflated[2]!.ohlcv.close).toBeCloseTo(104)
  })

  it("preserves volume unchanged", () => {
    const p = [{ date: isoDate("2024-01-15"), ohlcv: { open: 100, high: 100, low: 100, close: 100, adjClose: 100, volume: 42000 } }]
    const deflated = deflate(p, cpi)
    expect(deflated[0]!.ohlcv.volume).toBe(42000)
  })

  it("deflates all price fields (open, high, low, close, adjClose)", () => {
    const p = [
      {
        date: isoDate("2024-02-01"),
        ohlcv: { open: 110, high: 120, low: 105, close: 115, adjClose: 113, volume: 500 },
      },
    ]
    // base = 2024-01-01 CPI = 200, target CPI for 2024-02-01 = 220
    // factor = 200/220 ≈ 0.9091
    const factor = 200 / 220
    const deflated = deflate(p, cpi, isoDate("2024-01-01"))
    expect(deflated[0]!.ohlcv.open).toBeCloseTo(110 * factor)
    expect(deflated[0]!.ohlcv.high).toBeCloseTo(120 * factor)
    expect(deflated[0]!.ohlcv.low).toBeCloseTo(105 * factor)
    expect(deflated[0]!.ohlcv.close).toBeCloseTo(115 * factor)
    expect(deflated[0]!.ohlcv.adjClose).toBeCloseTo(113 * factor)
  })

  it("returns empty series for empty input", () => {
    expect(deflate([], cpi)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// percentChange
// ---------------------------------------------------------------------------

describe("percentChange", () => {
  const series = [
    row("2024-01-01", 100),
    row("2024-01-02", 110),
    row("2024-01-03", 99),
  ]

  it("returns NaN for the first row (no previous observation)", () => {
    const result = percentChange(series, "close")
    expect(isNaN(result[0]!.value)).toBe(true)
  })

  it("computes the correct percentage change for the second row", () => {
    const result = percentChange(series, "close")
    // (110 - 100) / 100 * 100 = 10
    expect(result[1]!.value).toBeCloseTo(10)
  })

  it("computes negative percentage changes correctly", () => {
    const result = percentChange(series, "close")
    // (99 - 110) / 110 * 100 ≈ -10
    expect(result[2]!.value).toBeCloseTo(-10)
  })

  it("produces an output series of the same length as the input", () => {
    const result = percentChange(series, "close")
    expect(result).toHaveLength(3)
  })

  it("preserves dates from the input series", () => {
    const result = percentChange(series, "close")
    expect(result.map((r) => r.date)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"])
  })

  it("returns NaN when the previous value is zero (division by zero)", () => {
    const s = [row("2024-01-01", 0), row("2024-01-02", 10)]
    const result = percentChange(s, "close")
    expect(isNaN(result[1]!.value)).toBe(true)
  })

  it("returns empty series for empty input", () => {
    expect(percentChange([], "close")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// rollingMean
// ---------------------------------------------------------------------------

describe("rollingMean", () => {
  const series = [
    indexRow("2024-01-01", 10),
    indexRow("2024-01-02", 20),
    indexRow("2024-01-03", 30),
    indexRow("2024-01-04", 40),
    indexRow("2024-01-05", 50),
  ]

  it("returns NaN for the first window-1 rows", () => {
    const result = rollingMean(series, 3)
    expect(isNaN(result[0]!.value)).toBe(true)
    expect(isNaN(result[1]!.value)).toBe(true)
  })

  it("returns a valid mean starting at index window-1", () => {
    const result = rollingMean(series, 3)
    // (10 + 20 + 30) / 3 = 20
    expect(result[2]!.value).toBeCloseTo(20)
  })

  it("slides the window correctly for subsequent values", () => {
    const result = rollingMean(series, 3)
    // (20 + 30 + 40) / 3 ≈ 30
    expect(result[3]!.value).toBeCloseTo(30)
    // (30 + 40 + 50) / 3 ≈ 40
    expect(result[4]!.value).toBeCloseTo(40)
  })

  it("produces output of the same length as input", () => {
    expect(rollingMean(series, 3)).toHaveLength(5)
  })

  it("window=1 returns the original values (no smoothing)", () => {
    const result = rollingMean(series, 1)
    series.forEach((r, i) => {
      expect(result[i]!.value).toBeCloseTo(r.value)
    })
  })

  it("window equal to series length returns NaN for all but the last row", () => {
    const result = rollingMean(series, 5)
    expect(isNaN(result[0]!.value)).toBe(true)
    expect(isNaN(result[1]!.value)).toBe(true)
    expect(isNaN(result[2]!.value)).toBe(true)
    expect(isNaN(result[3]!.value)).toBe(true)
    expect(result[4]!.value).toBeCloseTo(30) // (10+20+30+40+50)/5
  })

  it("throws for window < 1", () => {
    expect(() => rollingMean(series, 0)).toThrow()
  })

  it("returns empty series for empty input", () => {
    expect(rollingMean([], 3)).toHaveLength(0)
  })
})
