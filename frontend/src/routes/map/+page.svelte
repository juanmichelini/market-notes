<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import {
    closeIndex,
    majorCurrency,
    observationAt,
    pricePerCalorie,
    spreadPercent,
    toPricePerKg,
    toPricePerTonne,
    isoDate,
    type DatasetMeta,
    type IndexSeries,
    type ISODate,
    type NutritionTable,
  } from "@market-notes/core"
  import { loadManifest, loadNutrition, loadPriceSeries, loadIndexSeries } from "$lib/data.js"
  import type { MapMarker } from "$lib/mapTypes.js"
  import PriceMap from "$lib/charts/PriceMap.svelte"
  import type * as d3 from "d3"

  type Metric = "usd_t" | "kcal"

  /** Observations older than this are not drawn as a price (they are shown hollow). */
  const MAX_STALE_DAYS = 366
  const PLAY_INTERVAL_MS = 250

  let located: DatasetMeta[] = []
  let nutrition: NutritionTable | null = null
  let products: string[] = []
  let product = ""
  let metric: Metric = "usd_t"
  /** Ticker of the reference market for the spread overlay; "" for none. */
  let reference = ""
  let dates: ISODate[] = []
  let dateIdx = 0
  let playing = false
  let ready = false
  let loading = true
  let error: string | null = null
  let countries: d3.GeoPermissibleObjects | null = null

  let raw: Record<string, IndexSeries> = {}
  const converted = new Map<string, IndexSeries | null>()
  let timer: ReturnType<typeof setInterval> | undefined

  $: productDatasets = located.filter((d) => d.product === product)
  $: date = dates[dateIdx]
  $: priced = ready && date ? computeMarkers(productDatasets, date, metric, raw) : []
  $: shown = applySpread(priced, reference)
  $: markers = shown.markers
  $: diverging = shown.active
  $: referenceNote = reference && !shown.active ? "The reference market has no price on this date." : ""
  $: unitLabel = diverging
    ? "% above (+) or below (−) reference"
    : metric === "usd_t"
      ? "USD per tonne"
      : "USD per 1,000 kcal"

  /** Last calendar day of the month containing `d`, so a slider step shows that month's latest price. */
  function endOfMonth(key: string): ISODate {
    const [y, m] = key.split("-").map(Number) as [number, number]
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return isoDate(`${key}-${String(last).padStart(2, "0")}`)
  }

  /** The dataset's series on a common footing for `metric`, or null if it cannot be converted. */
  function convert(d: DatasetMeta, series: IndexSeries): IndexSeries | null {
    const key = `${d.ticker}:${metric}`
    if (converted.has(key)) return converted.get(key) ?? null
    let result: IndexSeries | null = null
    // Without an exchange-rate series, only dollar-denominated quotes can be compared.
    if (majorCurrency(d.currency).major === "USD" && d.kgPerUnit) {
      if (metric === "usd_t") {
        result = toPricePerTonne(series, d.kgPerUnit, d.currency)
      } else {
        const entry = nutrition?.entries.find((e) => e.product === d.product && e.form === d.form)
        if (entry) {
          result = pricePerCalorie(
            toPricePerKg(series, d.kgPerUnit, d.currency),
            entry.kcalPer100g * 10,
            entry.edibleFraction
          )
        }
      }
    }
    converted.set(key, result)
    return result
  }

  function computeMarkers(
    datasets: DatasetMeta[],
    on: ISODate,
    m: Metric,
    series: Record<string, IndexSeries>
  ): MapMarker[] {
    return datasets.flatMap((d): MapMarker[] => {
      const loc = d.location
      const s = series[d.ticker]
      if (!loc || !s) return []
      const base = { id: d.ticker, label: `${loc.place} — ${d.name}`, lat: loc.lat, lon: loc.lon }
      const local = observationAt(s, on, MAX_STALE_DAYS)
      if (!local) return [{ ...base, value: null, valueText: "No recent price", detail: "No observation within a year before this date." }]

      const conv = convert(d, s)
      const age = local.staleDays === 0 ? "observed this day" : `observed ${local.observedOn}, ${local.staleDays} days earlier`
      const quote = `${local.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${d.currency} per ${d.kgPerUnit ?? "?"} kg`
      if (!conv) {
        return [{ ...base, value: null, valueText: quote, detail: `Not in dollars, so not on the colour scale (needs an exchange-rate series). ${age}.` }]
      }
      const obs = observationAt(conv, on, MAX_STALE_DAYS)
      if (!obs) return [{ ...base, value: null, valueText: quote, detail: age }]
      const text =
        m === "usd_t"
          ? `$${obs.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} per tonne`
          : `$${obs.value.toFixed(3)} per 1,000 kcal`
      return [{ ...base, value: obs.value, valueText: text, detail: `Quoted ${quote}; ${age}.` }]
    })
  }

  /**
   * With a reference market chosen, recolour every priced marker by its spread over the reference
   * (percentage of the reference price), keeping the underlying price in the hover text.
   */
  function applySpread(list: MapMarker[], ref: string): { markers: MapMarker[]; active: boolean } {
    const refMarker = ref ? list.find((m) => m.id === ref) : undefined
    if (!refMarker || refMarker.value === null) return { markers: list, active: false }
    const base = refMarker.value
    const refPlace = refMarker.label
    return {
      active: true,
      markers: list.map((m) => {
        if (m.value === null) return m
        if (m.id === ref) return { ...m, value: 0, valueText: `Reference — ${m.valueText}` }
        const spread = spreadPercent(m.value, base)
        if (!isFinite(spread)) return { ...m, value: null }
        const sign = spread > 0 ? "+" : ""
        return { ...m, value: spread, valueText: `${sign}${spread.toFixed(1)}% vs ${refPlace} (${m.valueText})` }
      }),
    }
  }

  async function selectProduct(next: string) {
    stop()
    product = next
    reference = ""
    ready = false
    error = null
    try {
      const wanted = located.filter((d) => d.product === next)
      const loaded = await Promise.all(
        wanted.map(async (d) =>
          d.seriesType === "price" ? closeIndex(await loadPriceSeries(d.path)) : await loadIndexSeries(d.path)
        )
      )
      raw = Object.fromEntries(wanted.map((d, i) => [d.ticker, loaded[i]!]))
      // Slider steps: every month in which any of the product's markets reported.
      const months = new Set<string>()
      for (const s of loaded) for (const row of s) months.add(row.date.slice(0, 7))
      dates = [...months].sort().map(endOfMonth)
      dateIdx = Math.max(dates.length - 1, 0)
      ready = true
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  function setMetric(next: Metric) {
    metric = next
  }

  function play() {
    if (dates.length === 0) return
    if (dateIdx >= dates.length - 1) dateIdx = 0
    playing = true
    timer = setInterval(() => {
      if (dateIdx >= dates.length - 1) stop()
      else dateIdx += 1
    }, PLAY_INTERVAL_MS)
  }

  function stop() {
    playing = false
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  onMount(async () => {
    try {
      const [manifest, table] = await Promise.all([loadManifest(), loadNutrition()])
      nutrition = table
      located = manifest.datasets.filter((d) => d.location && d.product && d.kgPerUnit)
      products = [...new Set(located.map((d) => d.product!))].sort()
      // Country outlines are optional: the map draws without them.
      try {
        const res = await fetch("/geo/countries.geojson")
        if (res.ok) countries = (await res.json()) as d3.GeoPermissibleObjects
      } catch {
        countries = null
      }
      const first = products.includes("maize") ? "maize" : products[0]
      if (first) await selectProduct(first)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  })

  onDestroy(stop)
</script>

<svelte:head>
  <title>Price Map — Market Notes</title>
</svelte:head>

<main>
  <header>
    <a href="/" class="back">← Market Notes</a>
    <h1>Price Map</h1>
    <p class="tagline">The price of one product at every market we track, on a chosen date.</p>
  </header>

  {#if loading}
    <p class="status">Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="controls">
      <label>
        Product
        <select value={product} on:change={(e) => selectProduct(e.currentTarget.value)}>
          {#each products as p (p)}<option value={p}>{p}</option>{/each}
        </select>
      </label>

      <label>
        Spread vs
        <select bind:value={reference}>
          <option value="">none</option>
          {#each productDatasets as d (d.ticker)}
            <option value={d.ticker}>{d.location?.place} — {d.name}</option>
          {/each}
        </select>
      </label>

      <div class="toggle" role="group" aria-label="Price unit">
        <button class:active={metric === "usd_t"} on:click={() => setMetric("usd_t")}>USD / tonne</button>
        <button class:active={metric === "kcal"} on:click={() => setMetric("kcal")}>USD / 1,000 kcal</button>
      </div>
    </div>

    <PriceMap {markers} {unitLabel} {countries} {diverging} />
    {#if referenceNote}<p class="meta">{referenceNote}</p>{/if}

    {#if dates.length > 0}
      <div class="slider">
        <button on:click={() => (playing ? stop() : play())} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min="0"
          max={dates.length - 1}
          bind:value={dateIdx}
          on:input={stop}
          aria-label="Date"
        />
        <span class="date">{date}</span>
      </div>
    {/if}

    <p class="meta">
      Filled circles are priced in dollars and share the colour scale; hollow dashed circles have no recent
      price or are quoted in a local currency that cannot yet be converted. Monthly series are carried forward
      between observations; hover a marker to see how old its price is.
      {#if !countries}Country outlines are not loaded (<code>frontend/static/geo/countries.geojson</code>).{/if}
    </p>
  {/if}
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    font-family: system-ui, -apple-system, sans-serif;
    color: #111827;
  }
  header { margin-bottom: 1.5rem; }
  .back { font-size: 0.85rem; color: #6b7280; text-decoration: none; }
  .back:hover { color: #2563eb; }
  h1 { font-size: 1.75rem; font-weight: 700; margin: 0.5rem 0 0.25rem; }
  .tagline { color: #6b7280; font-size: 0.85rem; margin: 0; }
  .status { color: #6b7280; font-size: 0.875rem; }
  .error {
    color: #dc2626; font-size: 0.875rem;
    padding: 0.75rem; background: #fef2f2;
    border-radius: 6px; border: 1px solid #fecaca;
  }
  .controls { display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; align-items: center; margin-bottom: 1rem; }
  label { font-size: 0.85rem; display: inline-flex; gap: 0.5rem; align-items: center; }
  select { font-size: 0.85rem; padding: 0.25rem 0.5rem; }
  .toggle button {
    font-size: 0.8rem; padding: 0.3rem 0.7rem; border: 1px solid #d1d5db;
    background: #fff; cursor: pointer;
  }
  .toggle button.active { background: #111827; color: #fff; border-color: #111827; }
  .slider { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.75rem; }
  .slider input[type="range"] { flex: 1; }
  .slider button { width: 2rem; height: 2rem; cursor: pointer; }
  .date { font-variant-numeric: tabular-nums; font-size: 0.85rem; min-width: 6.5rem; text-align: right; }
  .meta { font-size: 0.75rem; color: #9ca3af; margin-top: 0.75rem; }
</style>
