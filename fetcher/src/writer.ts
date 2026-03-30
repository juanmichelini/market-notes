/**
 * CSV writer with merge semantics.
 *
 * Reads the existing CSV, parses it, merges with the incoming series
 * (new values overwrite existing rows for the same date), re-sorts,
 * and writes back. This makes the fetch operation idempotent.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import {
  type PriceSeries,
  type IndexSeries,
  parsePriceCSV,
  parseIndexCSV,
  serializePriceCSV,
  serializeIndexCSV,
} from "@market-notes/core"

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return ""
  }
}

export async function writePriceSeries(
  incoming: PriceSeries,
  filePath: string
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const existing = await readOrEmpty(filePath)
  const existingRows = existing.trim() ? parsePriceCSV(existing) : []

  const byDate = new Map(existingRows.map((r) => [r.date, r]))
  for (const row of incoming) byDate.set(row.date, row)

  const merged = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  await writeFile(filePath, serializePriceCSV(merged), "utf8")
}

export async function writeIndexSeries(
  incoming: IndexSeries,
  filePath: string
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const existing = await readOrEmpty(filePath)
  const existingRows = existing.trim() ? parseIndexCSV(existing) : []

  const byDate = new Map(existingRows.map((r) => [r.date, r]))
  for (const row of incoming) byDate.set(row.date, row)

  const merged = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  await writeFile(filePath, serializeIndexCSV(merged), "utf8")
}
