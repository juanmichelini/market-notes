/**
 * Lists the WFP market-level series for a commodity in some countries, so
 * that manifest entries can use the exact `market`, `commodity`, `unit` and
 * `pricetype` strings the fetcher matches on (see ADR-005).
 *
 * Usage:  node fetcher/scripts/discover-wfp.mjs <countries> <commodity-regex> [min-rows]
 * e.g.    node fetcher/scripts/discover-wfp.mjs thailand,vietnam,india '^Rice' 60
 *
 * Writes a Markdown report to stdout. It reads from HDX only; it changes no files.
 */
const HDX_API = "https://data.humdata.org/api/3/action/package_show"

/** Splits one RFC 4180 CSV line into fields (quoted fields, "" escapes). */
export function splitCSVLine(line) {
  const fields = []
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

/**
 * Groups the rows of a WFP country CSV whose commodity matches `commodity`
 * by (market, commodity, unit, pricetype) and summarises each group.
 * Returns the groups with at least `minRows` rows, longest first.
 */
export function summarise(csvText, commodity, minRows) {
  const lines = csvText.replace(/\r\n?/g, "\n").split("\n")
  const header = splitCSVLine(lines[0] ?? "")
  const col = (name) => header.indexOf(name)
  const idx = Object.fromEntries(
    ["date", "market", "latitude", "longitude", "commodity", "unit", "pricetype", "currency", "price", "usdprice"].map((n) => [n, col(n)])
  )
  for (const required of ["date", "market", "commodity", "unit", "pricetype", "price"]) {
    if (idx[required] < 0) throw new Error(`WFP CSV has no "${required}" column`)
  }
  const matcher = new RegExp(commodity, "i")
  const groups = new Map()
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("#")) continue // blank lines and the HXL tag row
    const f = splitCSVLine(line)
    if (!matcher.test(f[idx.commodity] ?? "")) continue
    const key = [f[idx.market], f[idx.commodity], f[idx.unit], f[idx.pricetype]].join("\u0000")
    const date = f[idx.date] ?? ""
    const g = groups.get(key) ?? {
      market: f[idx.market], commodity: f[idx.commodity], unit: f[idx.unit], pricetype: f[idx.pricetype],
      currency: idx.currency >= 0 ? f[idx.currency] : "", lat: idx.latitude >= 0 ? f[idx.latitude] : "",
      lon: idx.longitude >= 0 ? f[idx.longitude] : "", dates: new Set(), first: date, last: date,
      hasUsd: false,
    }
    g.dates.add(date)
    if (date < g.first) g.first = date
    if (date > g.last) g.last = date
    if (idx.usdprice >= 0 && (f[idx.usdprice] ?? "") !== "") g.hasUsd = true
    groups.set(key, g)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rows: g.dates.size }))
    .filter((g) => g.rows >= minRows)
    .sort((a, b) => b.rows - a.rows || b.last.localeCompare(a.last))
}

/**
 * Counts, for each (commodity, unit, pricetype) in a WFP country CSV whose
 * commodity matches `commodity`, the markets that have at least `minRows`
 * distinct monthly dates, and how many of those still report on or after
 * `recentFrom` (an ISO date). Used to ask "does this staple have enough
 * comparable markets?" without listing every series.
 */
export function summariseMarkets(csvText, commodity, minRows, recentFrom) {
  const lines = csvText.replace(/\r\n?/g, "\n").split("\n")
  const header = splitCSVLine(lines[0] ?? "")
  const idx = Object.fromEntries(
    ["date", "market", "commodity", "unit", "pricetype", "currency", "usdprice"].map((n) => [n, header.indexOf(n)])
  )
  for (const required of ["date", "market", "commodity", "unit", "pricetype"]) {
    if (idx[required] < 0) throw new Error(`WFP CSV has no "${required}" column`)
  }
  const matcher = new RegExp(commodity, "i")
  const series = new Map() // key: commodity|unit|pricetype|market
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("#")) continue
    const f = splitCSVLine(line)
    if (!matcher.test(f[idx.commodity] ?? "")) continue
    const key = [f[idx.commodity], f[idx.unit], f[idx.pricetype], f[idx.market]].join("\u0000")
    const date = f[idx.date] ?? ""
    const g = series.get(key) ?? {
      commodity: f[idx.commodity], unit: f[idx.unit], pricetype: f[idx.pricetype],
      currency: idx.currency >= 0 ? f[idx.currency] : "", dates: new Set(), first: date, last: date,
    }
    g.dates.add(date)
    if (date < g.first) g.first = date
    if (date > g.last) g.last = date
    series.set(key, g)
  }
  const groups = new Map() // key: commodity|unit|pricetype
  for (const g of series.values()) {
    if (g.dates.size < minRows) continue
    const key = [g.commodity, g.unit, g.pricetype].join("\u0000")
    const t = groups.get(key) ?? {
      commodity: g.commodity, unit: g.unit, pricetype: g.pricetype, currency: g.currency,
      markets: 0, current: 0, first: g.first, last: g.last,
    }
    t.markets += 1
    if (g.last >= recentFrom) t.current += 1
    if (g.first < t.first) t.first = g.first
    if (g.last > t.last) t.last = g.last
    groups.set(key, t)
  }
  return [...groups.values()].sort((a, b) => b.current - a.current || b.markets - a.markets)
}

async function downloadCountryCSV(country) {
  const id = `wfp-food-prices-for-${country}`
  const pkgRes = await fetch(`${HDX_API}?id=${encodeURIComponent(id)}`)
  if (!pkgRes.ok) throw new Error(`HDX API error for "${id}": HTTP ${pkgRes.status}`)
  const pkg = await pkgRes.json()
  const resource = pkg.result.resources.find((r) => r.format.toUpperCase() === "CSV" && r.name.endsWith("Food Prices"))
  if (!resource) throw new Error(`HDX dataset "${id}" has no "Food Prices" CSV resource`)
  const csvRes = await fetch(resource.url)
  if (!csvRes.ok) throw new Error(`HDX download error for "${id}": HTTP ${csvRes.status}`)
  return csvRes.text()
}

async function main() {
  const [countriesArg, commodity, minRowsArg, modeArg, recentFromArg] = process.argv.slice(2)
  if (!countriesArg || !commodity) {
    console.error("usage: discover-wfp.mjs <countries> <commodity-regex> [min-rows] [list|summary] [recent-from]")
    process.exit(2)
  }
  const minRows = Number(minRowsArg ?? 60)
  const mode = modeArg ?? "list"
  const recentFrom = recentFromArg ?? "2024-01-01"
  const countries = countriesArg.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean)

  if (mode === "summary") return summaryReport(countries, commodity, minRows, recentFrom)

  console.log(`# WFP series matching \`${commodity}\` with at least ${minRows} monthly rows\n`)
  console.log("Use the exact `market`, `commodity`, `unit` and `pricetype` values in a manifest `wfp` query. `country` is the HDX slug.\n")
  let failed = 0
  for (const country of countries) {
    console.log(`## ${country}\n`)
    try {
      const groups = summarise(await downloadCountryCSV(country), commodity, minRows)
      if (groups.length === 0) { console.log("No series with enough rows.\n"); continue }
      console.log("| market | commodity | unit | pricetype | currency | rows | first | last | lat | lon | usdprice |")
      console.log("|---|---|---|---|---|---|---|---|---|---|---|")
      for (const g of groups.slice(0, 20)) {
        console.log(`| ${g.market} | ${g.commodity} | ${g.unit} | ${g.pricetype} | ${g.currency} | ${g.rows} | ${g.first} | ${g.last} | ${g.lat} | ${g.lon} | ${g.hasUsd ? "yes" : "no"} |`)
      }
      console.log()
    } catch (err) {
      failed++
      console.log(`Failed: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  }
  if (failed === countries.length) process.exit(1)
}

/** Market counts per commodity, per country and overall, to see which staples have enough comparable markets. */
async function summaryReport(countries, commodity, minRows, recentFrom) {
  console.log(`# WFP market counts for \`${commodity}\`\n`)
  console.log(`A market counts if it has at least ${minRows} monthly rows; **current** means it reports on or after ${recentFrom}. Markets are only comparable within one row of the overall table (same commodity name, unit and price type).\n`)
  const overall = new Map()
  const failures = []
  const perCountry = []
  for (const country of countries) {
    try {
      const groups = summariseMarkets(await downloadCountryCSV(country), commodity, minRows, recentFrom)
      perCountry.push([country, groups])
      for (const g of groups) {
        const key = [g.commodity, g.unit, g.pricetype].join("\u0000")
        const t = overall.get(key) ?? { commodity: g.commodity, unit: g.unit, pricetype: g.pricetype, countries: 0, markets: 0, current: 0 }
        t.countries += 1
        t.markets += g.markets
        t.current += g.current
        overall.set(key, t)
      }
    } catch (err) {
      failures.push(`${country}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log("## Overall (same commodity name, unit and price type, all countries)\n")
  console.log("| commodity | unit | pricetype | countries | markets | current markets |")
  console.log("|---|---|---|---|---|---|")
  const rows = [...overall.values()].sort((a, b) => b.current - a.current || b.markets - a.markets)
  for (const r of rows.slice(0, 40)) console.log(`| ${r.commodity} | ${r.unit} | ${r.pricetype} | ${r.countries} | ${r.markets} | ${r.current} |`)
  console.log("\n## By country (top 4 groups each)\n")
  console.log("| country | commodity | unit | pricetype | currency | markets | current | first | last |")
  console.log("|---|---|---|---|---|---|---|---|---|")
  for (const [country, groups] of perCountry) {
    for (const g of groups.slice(0, 4)) console.log(`| ${country} | ${g.commodity} | ${g.unit} | ${g.pricetype} | ${g.currency} | ${g.markets} | ${g.current} | ${g.first} | ${g.last} |`)
  }
  if (failures.length > 0) console.log(`\n## Failed countries\n\n${failures.map((f) => `- ${f}`).join("\n")}`)
  if (failures.length === countries.length) process.exit(1)
}

import { fileURLToPath } from "node:url"
if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
