import { describe, it, expect } from "vitest"
import { parsePriceCSV, parseIndexCSV, serializePriceCSV, serializeIndexCSV } from "../src/io.js"
import { isoDate, type PriceRow, type IndexRow } from "../src/types.js"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function row(date: string, close: number, adjClose = close, volume = 1000): PriceRow {
  return {
    date: isoDate(date),
    ohlcv: {
      open: close,
      high: close + 1,
      low: close - 1,
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
// parsePriceCSV
// ---------------------------------------------------------------------------

describe("parsePriceCSV", () => {
  it("parses a well-formed CSV with two data rows", () => {
    const csv = [
      "date,open,high,low,close,volume,adj_close",
      "2024-01-01,100.0000,101.0000,99.0000,100.5000,50000,100.5000",
      "2024-01-02,101.0000,102.0000,100.0000,101.5000,60000,101.5000",
    ].join("\n") + "\n"

    const result = parsePriceCSV(csv)
    expect(result).toHaveLength(2)
    expect(result[0]!.date).toBe("2024-01-01")
    expect(result[0]!.ohlcv.close).toBeCloseTo(100.5)
    expect(result[1]!.ohlcv.volume).toBe(60000)
  })

  it("handles CRLF line endings", () => {
    const csv = "date,open,high,low,close,volume,adj_close\r\n2024-01-01,10,11,9,10,100,10\r\n"
    const result = parsePriceCSV(csv)
    expect(result).toHaveLength(1)
    expect(result[0]!.date).toBe("2024-01-01")
  })

  it("ignores blank lines", () => {
    const csv = [
      "date,open,high,low,close,volume,adj_close",
      "",
      "2024-01-01,10,11,9,10,100,10",
      "",
      "2024-01-02,11,12,10,11,200,11",
    ].join("\n")
    const result = parsePriceCSV(csv)
    expect(result).toHaveLength(2)
  })

  it("ignores comment lines beginning with #", () => {
    const csv = [
      "# This file was generated automatically.",
      "date,open,high,low,close,volume,adj_close",
      "# Source: Yahoo Finance",
      "2024-01-01,10,11,9,10,100,10",
    ].join("\n")
    const result = parsePriceCSV(csv)
    expect(result).toHaveLength(1)
  })

  it("parses empty numeric fields as NaN", () => {
    const csv = "date,open,high,low,close,volume,adj_close\n2024-01-01,,,,,,"
    const result = parsePriceCSV(csv)
    expect(result).toHaveLength(1)
    expect(isNaN(result[0]!.ohlcv.open)).toBe(true)
    expect(isNaN(result[0]!.ohlcv.close)).toBe(true)
    expect(isNaN(result[0]!.ohlcv.adjClose)).toBe(true)
  })

  it("sorts rows in ascending date order regardless of CSV order", () => {
    const csv = [
      "date,open,high,low,close,volume,adj_close",
      "2024-01-03,30,31,29,30,300,30",
      "2024-01-01,10,11,9,10,100,10",
      "2024-01-02,20,21,19,20,200,20",
    ].join("\n")
    const result = parsePriceCSV(csv)
    expect(result.map((r) => r.date)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"])
  })

  it("deduplicates rows by date, keeping the last occurrence", () => {
    const csv = [
      "date,open,high,low,close,volume,adj_close",
      "2024-01-01,10,11,9,10,100,10",
      "2024-01-01,99,100,98,99,999,99",
    ].join("\n")
    const result = parsePriceCSV(csv)
    expect(result).toHaveLength(1)
    expect(result[0]!.ohlcv.close).toBe(99)
  })
})

// ---------------------------------------------------------------------------
// parseIndexCSV
// ---------------------------------------------------------------------------

describe("parseIndexCSV", () => {
  it("parses a well-formed index CSV", () => {
    const csv = "date,value\n2024-01-01,200.5000\n2024-02-01,201.0000\n"
    const result = parseIndexCSV(csv)
    expect(result).toHaveLength(2)
    expect(result[0]!.value).toBeCloseTo(200.5)
  })

  it("handles CRLF line endings", () => {
    const csv = "date,value\r\n2024-01-01,200\r\n"
    const result = parseIndexCSV(csv)
    expect(result).toHaveLength(1)
  })

  it("ignores blank lines and comment lines", () => {
    const csv = "date,value\n# comment\n\n2024-01-01,200\n"
    const result = parseIndexCSV(csv)
    expect(result).toHaveLength(1)
  })

  it("parses empty value fields as NaN", () => {
    const csv = "date,value\n2024-01-01,\n"
    const result = parseIndexCSV(csv)
    expect(isNaN(result[0]!.value)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// serializePriceCSV
// ---------------------------------------------------------------------------

describe("serializePriceCSV", () => {
  it("produces the canonical header as the first line", () => {
    const csv = serializePriceCSV([])
    expect(csv.startsWith("date,open,high,low,close,volume,adj_close")).toBe(true)
  })

  it("serializes NaN price fields as empty strings", () => {
    const series: PriceRow[] = [
      {
        date: isoDate("2024-01-01"),
        ohlcv: { open: NaN, high: NaN, low: NaN, close: NaN, adjClose: NaN, volume: NaN },
      },
    ]
    const csv = serializePriceCSV(series)
    const dataLine = csv.split("\n")[1]!
    expect(dataLine).toBe("2024-01-01,,,,,,")
  })

  it("formats prices to 4 decimal places", () => {
    const series: PriceRow[] = [
      {
        date: isoDate("2024-01-01"),
        ohlcv: { open: 100, high: 101, low: 99, close: 100.1234, adjClose: 100.1234, volume: 1000 },
      },
    ]
    const csv = serializePriceCSV(series)
    expect(csv).toContain("100.1234")
  })

  it("formats volume as an integer", () => {
    const series: PriceRow[] = [
      {
        date: isoDate("2024-01-01"),
        ohlcv: { open: 10, high: 11, low: 9, close: 10, adjClose: 10, volume: 1234567 },
      },
    ]
    const csv = serializePriceCSV(series)
    expect(csv).toContain("1234567")
  })
})

// ---------------------------------------------------------------------------
// Round-trip: parsePriceCSV → serializePriceCSV → parsePriceCSV
// ---------------------------------------------------------------------------

describe("price CSV round-trip", () => {
  it("produces an identical series after serialize → parse", () => {
    const original = [
      row("2024-01-01", 100, 98, 50000),
      row("2024-01-02", 105, 103, 60000),
      row("2024-01-03", 102, 100, 55000),
    ]

    const csv = serializePriceCSV(original)
    const parsed = parsePriceCSV(csv)

    expect(parsed).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      const orig = original[i]!
      const p = parsed[i]!
      expect(p.date).toBe(orig.date)
      expect(p.ohlcv.close).toBeCloseTo(orig.ohlcv.close, 4)
      expect(p.ohlcv.adjClose).toBeCloseTo(orig.ohlcv.adjClose, 4)
      expect(p.ohlcv.volume).toBe(orig.ohlcv.volume)
    }
  })

  it("NaN fields survive round-trip as empty strings", () => {
    const series: PriceRow[] = [
      {
        date: isoDate("2024-01-01"),
        ohlcv: { open: NaN, high: 101, low: 99, close: 100, adjClose: NaN, volume: 0 },
      },
    ]
    const csv = serializePriceCSV(series)
    const parsed = parsePriceCSV(csv)
    expect(isNaN(parsed[0]!.ohlcv.open)).toBe(true)
    expect(isNaN(parsed[0]!.ohlcv.adjClose)).toBe(true)
    expect(parsed[0]!.ohlcv.close).toBeCloseTo(100)
  })
})

// ---------------------------------------------------------------------------
// Round-trip: parseIndexCSV → serializeIndexCSV → parseIndexCSV
// ---------------------------------------------------------------------------

describe("index CSV round-trip", () => {
  it("produces an identical series after serialize → parse", () => {
    const original = [
      indexRow("2024-01-01", 200.5),
      indexRow("2024-02-01", 202.1234),
    ]

    const csv = serializeIndexCSV(original)
    const parsed = parseIndexCSV(csv)

    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.value).toBeCloseTo(200.5, 4)
    expect(parsed[1]!.value).toBeCloseTo(202.1234, 4)
  })

  it("NaN value survives round-trip as empty string", () => {
    const series: IndexRow[] = [{ date: isoDate("2024-01-01"), value: NaN }]
    const csv = serializeIndexCSV(series)
    const parsed = parseIndexCSV(csv)
    expect(isNaN(parsed[0]!.value)).toBe(true)
  })
})
