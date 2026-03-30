/**
 * Data loading utilities.
 *
 * Fetches CSV and JSON data files from the static /data/ directory.
 * All functions return typed domain objects from @market-notes/core.
 */
import {
  type Manifest,
  type PriceSeries,
  type IndexSeries,
  parsePriceCSV,
  parseIndexCSV,
} from "@market-notes/core"

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch("/data/manifest.json")
  if (!res.ok) throw new Error(`Failed to load manifest: HTTP ${res.status}`)
  return res.json() as Promise<Manifest>
}

export async function loadPriceSeries(path: string): Promise<PriceSeries> {
  const res = await fetch(`/${path}`)
  if (!res.ok) throw new Error(`Failed to load price series at ${path}: HTTP ${res.status}`)
  const text = await res.text()
  return parsePriceCSV(text)
}

export async function loadIndexSeries(path: string): Promise<IndexSeries> {
  const res = await fetch(`/${path}`)
  if (!res.ok) throw new Error(`Failed to load index series at ${path}: HTTP ${res.status}`)
  const text = await res.text()
  return parseIndexCSV(text)
}
