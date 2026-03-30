import { describe, it, expect } from "vitest"
import {
  sliceByDate,
  sliceIndexByDate,
  alignDates,
  alignPriceToIndex,
  mapPrices,
  mapIndex,
  normalizePriceSeries,
  normalizeIndexSeries,
} from "../src/series.js"
import { isoDate, type PriceRow, type IndexRow, type OHLCV } from "../src/types.js"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PriceRow. By default, adjClose equals close.
 * Open, high, low are set to close for simplicity unless overridden.
 */
function row(
  date: string,
  close: number,
  adjClose = close,
  volume = 1000
): PriceRow {
  return {
    date: isoDate(date),
    ohlcv: {
      open: close,
      high: close,
      low: close,
      close,
      adjClose,
      volume,
    },
  }
}

function indexRow(date: string, value: number): IndexRow {
  return { date: isoDate(date), value }
}

// ---------------------------------------------------------------------------
// sliceByDate
// ---------------------------------------------------------------------------

describe("sliceByDate", () => {
  const series = [
    row("2024-01-01", 100),
    row("2024-01-02", 101),
    row("2024-01-03", 102),
    row("2024-01-04", 103),
    row("2024-01-05", 104),
  ]

  it("returns rows within the inclusive date range", () => {
    const result = sliceByDate(series, isoDate("2024-01-02"), isoDate("2024-01-04"))
    expect(result.map((r) => r.date)).toEqual([
      "2024-01-02",
      "2024-01-03",
      "2024-01-04",
    ])
  })

  it("includes both boundary dates", () => {
    const result = sliceByDate(series, isoDate("2024-01-01"), isoDate("2024-01-05"))
    expect(result).toHaveLength(5)
  })

  it("returns empty series when range has no overlap", () => {
    const result = sliceByDate(series, isoDate("2025-01-01"), isoDate("2025-12-31"))
    expect(result).toHaveLength(0)
  })

  it("returns a single row when from equals to and matches a date", () => {
    const result = sliceByDate(series, isoDate("2024-01-03"), isoDate("2024-01-03"))
    expect(result).toHaveLength(1)
    expect(result[0]!.date).toBe("2024-01-03")
  })

  it("returns empty series for inverted range (from > to)", () => {
    const result = sliceByDate(series, isoDate("2024-01-05"), isoDate("2024-01-01"))
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// sliceIndexByDate
// ---------------------------------------------------------------------------

describe("sliceIndexByDate", () => {
  const series = [
    indexRow("2024-01-01", 200),
    indexRow("2024-02-01", 201),
    indexRow("2024-03-01", 202),
  ]

  it("returns rows within the inclusive date range", () => {
    const result = sliceIndexByDate(series, isoDate("2024-01-01"), isoDate("2024-02-01"))
    expect(result.map((r) => r.value)).toEqual([200, 201])
  })

  it("returns empty series when range has no overlap", () => {
    const result = sliceIndexByDate(series, isoDate("2025-01-01"), isoDate("2025-12-31"))
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// alignDates
// ---------------------------------------------------------------------------

describe("alignDates", () => {
  const a = [
    row("2024-01-01", 10),
    row("2024-01-02", 11),
    row("2024-01-03", 12),
  ]
  const b = [
    row("2024-01-02", 20),
    row("2024-01-03", 21),
    row("2024-01-04", 22),
  ]

  it("returns only rows with dates present in both series", () => {
    const [alignedA, alignedB] = alignDates(a, b)
    expect(alignedA.map((r) => r.date)).toEqual(["2024-01-02", "2024-01-03"])
    expect(alignedB.map((r) => r.date)).toEqual(["2024-01-02", "2024-01-03"])
  })

  it("produces output arrays of equal length", () => {
    const [alignedA, alignedB] = alignDates(a, b)
    expect(alignedA.length).toBe(alignedB.length)
  })

  it("dates at each index match between the two aligned arrays", () => {
    const [alignedA, alignedB] = alignDates(a, b)
    for (let i = 0; i < alignedA.length; i++) {
      expect(alignedA[i]!.date).toBe(alignedB[i]!.date)
    }
  })

  it("returns empty arrays when the series share no dates", () => {
    const c = [row("2025-01-01", 99)]
    const [alignedA, alignedC] = alignDates(a, c)
    expect(alignedA).toHaveLength(0)
    expect(alignedC).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// alignPriceToIndex
// ---------------------------------------------------------------------------

describe("alignPriceToIndex", () => {
  const prices = [
    row("2024-01-01", 10),
    row("2024-01-02", 11),
    row("2024-01-03", 12),
  ]
  const index = [
    indexRow("2024-01-01", 200),
    indexRow("2024-01-03", 202),
  ]

  it("keeps only dates present in both series", () => {
    const [p, idx] = alignPriceToIndex(prices, index)
    expect(p.map((r) => r.date)).toEqual(["2024-01-01", "2024-01-03"])
    expect(idx.map((r) => r.date)).toEqual(["2024-01-01", "2024-01-03"])
  })

  it("produces aligned arrays of equal length", () => {
    const [p, idx] = alignPriceToIndex(prices, index)
    expect(p.length).toBe(idx.length)
  })
})

// ---------------------------------------------------------------------------
// mapPrices
// ---------------------------------------------------------------------------

describe("mapPrices", () => {
  const series = [row("2024-01-01", 100), row("2024-01-02", 200)]

  it("applies the function to every OHLCV value", () => {
    const doubled = mapPrices(series, (ohlcv) => ({
      ...ohlcv,
      close: ohlcv.close * 2,
    }))
    expect(doubled[0]!.ohlcv.close).toBe(200)
    expect(doubled[1]!.ohlcv.close).toBe(400)
  })

  it("preserves dates unchanged", () => {
    const result = mapPrices(series, (ohlcv) => ohlcv)
    expect(result.map((r) => r.date)).toEqual(["2024-01-01", "2024-01-02"])
  })

  it("does not mutate the original series", () => {
    mapPrices(series, (ohlcv) => ({ ...ohlcv, close: 0 }))
    expect(series[0]!.ohlcv.close).toBe(100)
  })

  it("passes the date to the function", () => {
    const dates: string[] = []
    mapPrices(series, (ohlcv, date) => {
      dates.push(date)
      return ohlcv
    })
    expect(dates).toEqual(["2024-01-01", "2024-01-02"])
  })
})

// ---------------------------------------------------------------------------
// mapIndex
// ---------------------------------------------------------------------------

describe("mapIndex", () => {
  const series = [indexRow("2024-01-01", 100), indexRow("2024-02-01", 200)]

  it("applies the function to every value", () => {
    const result = mapIndex(series, (v) => v * 2)
    expect(result[0]!.value).toBe(200)
    expect(result[1]!.value).toBe(400)
  })

  it("preserves dates unchanged", () => {
    const result = mapIndex(series, (v) => v)
    expect(result.map((r) => r.date)).toEqual(["2024-01-01", "2024-02-01"])
  })
})

// ---------------------------------------------------------------------------
// normalizePriceSeries
// ---------------------------------------------------------------------------

describe("normalizePriceSeries", () => {
  it("sets adjClose to 100 on the base date (first row by default)", () => {
    const series = [
      row("2024-01-01", 50, 50),
      row("2024-01-02", 100, 100),
    ]
    const result = normalizePriceSeries(series)
    expect(result[0]!.ohlcv.adjClose).toBe(100)
  })

  it("scales other rows proportionally relative to base adjClose", () => {
    const series = [
      row("2024-01-01", 50, 50),
      row("2024-01-02", 100, 100),
    ]
    const result = normalizePriceSeries(series)
    // adjClose on day 2 = 100 * (100/50) = 200
    expect(result[1]!.ohlcv.adjClose).toBeCloseTo(200)
  })

  it("accepts an explicit baseDate", () => {
    const series = [
      row("2024-01-01", 50, 50),
      row("2024-01-02", 100, 100),
      row("2024-01-03", 200, 200),
    ]
    const result = normalizePriceSeries(series, isoDate("2024-01-02"))
    expect(result[1]!.ohlcv.adjClose).toBeCloseTo(100)
    expect(result[2]!.ohlcv.adjClose).toBeCloseTo(200)
    expect(result[0]!.ohlcv.adjClose).toBeCloseTo(50)
  })

  it("preserves volume unchanged", () => {
    const series = [row("2024-01-01", 50, 50, 99999)]
    const result = normalizePriceSeries(series)
    expect(result[0]!.ohlcv.volume).toBe(99999)
  })

  it("returns empty series for empty input", () => {
    expect(normalizePriceSeries([])).toHaveLength(0)
  })

  it("throws when baseDate is not found in the series", () => {
    const series = [row("2024-01-01", 100)]
    expect(() => normalizePriceSeries(series, isoDate("2025-01-01"))).toThrow()
  })
})

// ---------------------------------------------------------------------------
// normalizeIndexSeries
// ---------------------------------------------------------------------------

describe("normalizeIndexSeries", () => {
  it("sets value to 100 on the base date (first row by default)", () => {
    const series = [indexRow("2024-01-01", 250), indexRow("2024-02-01", 500)]
    const result = normalizeIndexSeries(series)
    expect(result[0]!.value).toBe(100)
  })

  it("scales other rows proportionally", () => {
    const series = [indexRow("2024-01-01", 250), indexRow("2024-02-01", 500)]
    const result = normalizeIndexSeries(series)
    expect(result[1]!.value).toBeCloseTo(200)
  })

  it("returns empty series for empty input", () => {
    expect(normalizeIndexSeries([])).toHaveLength(0)
  })

  it("throws when baseDate is not found in the series", () => {
    const series = [indexRow("2024-01-01", 100)]
    expect(() => normalizeIndexSeries(series, isoDate("2025-01-01"))).toThrow()
  })
})
