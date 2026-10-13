/**
 * Converts the `world-atlas` countries TopoJSON (Natural Earth, public
 * domain) into one GeoJSON FeatureCollection of country polygons.
 *
 * Usage: node build-countries-geojson.mjs <dir with node_modules> <output file>
 */
import { createRequire } from "node:module"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

const [dir, out] = process.argv.slice(2)
if (!dir || !out) {
  console.error("usage: build-countries-geojson.mjs <dir with node_modules> <output file>")
  process.exit(2)
}
const require = createRequire(resolve(dir, "package.json"))
const { feature } = require("topojson-client")
const topology = JSON.parse(readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"))
const collection = feature(topology, topology.objects.countries)
if (collection.type !== "FeatureCollection" || collection.features.length < 150) {
  throw new Error(`Unexpected result: ${collection.type} with ${collection.features?.length} features`)
}
// Round to 3 decimals (about 100 m): plenty for a world map, and smaller.
const round = (c) => (typeof c[0] === "number" ? c.map((v) => Math.round(v * 1e3) / 1e3) : c.map(round))
for (const f of collection.features) if (f.geometry) f.geometry.coordinates = round(f.geometry.coordinates)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(collection) + "\n")
console.log(`Wrote ${collection.features.length} countries to ${out}`)
