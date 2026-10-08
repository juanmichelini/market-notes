/**
 * WFP food prices adapter (via the Humanitarian Data Exchange, HDX).
 *
 * The World Food Programme publishes one CSV per country with monthly
 * market-level prices for staple foods, under CC BY-IGO. We resolve the
 * CSV's current URL through the HDX CKAN API, download it, and select a
 * single (market, commodity, unit, pricetype) series. See ADR-005.
 *
 * Prices are in the local currency (the `price` column). Dates are the
 * dataset's own monthly convention (the 15th of each month).
 * No authentication is required.
 */
import { type IndexSeries, type IndexRow, type WfpQuery, isoDate } from "@market-notes/core"

const HDX_API = "https://data.humdata.org/api/3/action/package_show"

interface HdxResource {
  name: string
  format: string
  url: string
}

interface HdxPackageResponse {
  success: boolean
  result: { resources: HdxResource[] }
}

/** Country CSVs are large (up to ~40 MB); cache them for the duration of a run. */
const csvCache = new Map<string, Promise<string>>()

async function downloadCountryCSV(country: string): Promise<string> {
  const id = `wfp-food-prices-for-${country}`
  const pkgRes = await fetch(`${HDX_API}?id=${encodeURIComponent(id)}`)
  if (!pkgRes.ok) throw new Error(`HDX API error for "${id}": HTTP ${pkgRes.status}`)
  const pkg = (await pkgRes.json()) as HdxPackageResponse
  const resource = pkg.result.resources.find(
    (r) => r.format.toUpperCase() === "CSV" && r.name.endsWith("Food Prices")
  )
  if (!resource) throw new Error(`HDX dataset "${id}" has no "Food Prices" CSV resource`)

  const csvRes = await fetch(resource.url)
  if (!csvRes.ok) throw new Error(`HDX download error for "${id}": HTTP ${csvRes.status}`)
  return csvRes.text()
}

function countryCSV(country: string): Promise<string> {
  let pending = csvCache.get(country)
  if (!pending) {
    pending = downloadCountryCSV(country)
    csvCache.set(country, pending)
  }
  return pending
}

/** Splits one RFC 4180 CSV line into fields (handles quoted fields with commas and "" escapes). */
function splitCSVLine(line: string): string[] {
  const fields: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") { fields.push(field); field = "" }
    else field += ch
  }
  fields.push(field)
  return fields
}

export async function fetchWfpSeries(
  query: WfpQuery,
  from: string,
  to: string
): Promise<IndexSeries> {
  const lines = (await countryCSV(query.country)).replace(/\r\n?/g, "\n").split("\n")
  const header = splitCSVLine(lines[0] ?? "")
  const col = (name: string): number => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`WFP CSV for "${query.country}" has no "${name}" column`)
    return i
  }
  const iDate = col("date")
  const iMarket = col("market")
  const iCommodity = col("commodity")
  const iUnit = col("unit")
  const iType = col("pricetype")
  const iPrice = col("price")

  const byDate = new Map<string, IndexRow>()
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("#")) continue  // blank lines and the HXL tag row
    const f = splitCSVLine(line)
    if (
      f[iMarket] !== query.market ||
      f[iCommodity] !== query.commodity ||
      f[iUnit] !== query.unit ||
      f[iType] !== query.pricetype
    ) continue
    const date = f[iDate] ?? ""
    if (date < from || date > to) continue
    if (byDate.has(date)) {
      throw new Error(`WFP series ${JSON.stringify(query)} has more than one price for ${date}`)
    }
    const value = parseFloat(f[iPrice] ?? "")
    byDate.set(date, { date: isoDate(date), value: Number.isFinite(value) ? value : NaN })
  }

  if (byDate.size === 0) {
    throw new Error(`WFP series ${JSON.stringify(query)} matched no rows`)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
