/**
 * Fetcher entry point.
 *
 * Downloads all instruments listed in data/manifest.json and writes
 * them to their respective CSV files. Designed to be run both locally
 * and in the GitHub Actions scheduled workflow.
 *
 * Required environment variable: FRED_API_KEY
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { type Manifest } from "@market-notes/core"
import { fetchPriceSeries } from "./sources/yahoo.js"
import { fetchIndexSeries } from "./sources/fred.js"
import { writePriceSeries, writeIndexSeries } from "./writer.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const MANIFEST_PATH = resolve(ROOT, "data/manifest.json")

const FRED_API_KEY = process.env["FRED_API_KEY"]
if (!FRED_API_KEY) {
  console.error("Error: FRED_API_KEY environment variable is not set.")
  process.exit(1)
}

const END_DATE = new Date().toISOString().slice(0, 10)
const YAHOO_DELAY_MS = 5000  // 5s between Yahoo requests to avoid rate limiting

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const manifestRaw = await readFile(MANIFEST_PATH, "utf8")
  const manifest = JSON.parse(manifestRaw) as Manifest

  let errors = 0
  let lastYahooFetch = 0

  for (const dataset of manifest.datasets) {
    const filePath = resolve(ROOT, dataset.path)
    const startDate = dataset.startDate
    try {
      if (dataset.seriesType === "price") {
        const elapsed = Date.now() - lastYahooFetch
        if (elapsed < YAHOO_DELAY_MS) await sleep(YAHOO_DELAY_MS - elapsed)
        console.log(`Fetching ${dataset.ticker} from Yahoo Finance (from ${startDate})...`)
        const series = await fetchPriceSeries(dataset.ticker, startDate, END_DATE)
        lastYahooFetch = Date.now()
        await writePriceSeries(series, filePath)
        console.log(`  ✓ ${series.length} rows → ${dataset.path}`)
      } else if (dataset.seriesType === "index" && dataset.source === "fred") {
        console.log(`Fetching ${dataset.ticker} from FRED (from ${startDate})...`)
        const series = await fetchIndexSeries(dataset.ticker, startDate, END_DATE, FRED_API_KEY)
        await writeIndexSeries(series, filePath)
        console.log(`  ✓ ${series.length} rows → ${dataset.path}`)
      }
    } catch (err) {
      console.error(`  ✗ Failed to fetch ${dataset.ticker}:`, err)
      errors++
    }
  }

  // Update manifest timestamp
  const updated = { ...manifest, updatedAt: new Date().toISOString() }
  await writeFile(MANIFEST_PATH, JSON.stringify(updated, null, 2) + "\n", "utf8")
  console.log(`\nManifest updated. ${errors} error(s).`)

  if (errors > 0) process.exit(1)
}

main()
