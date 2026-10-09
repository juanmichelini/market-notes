<script lang="ts">
  import { onMount } from "svelte"
  import {
    closeIndex,
    majorCurrency,
    toPricePerKg,
    pricePerCalorie,
    cheapestCalorie,
    type DatasetMeta,
    type IndexSeries,
    type NutritionEntry,
  } from "@market-notes/core"
  import { loadManifest, loadNutrition, loadPriceSeries, loadIndexSeries } from "$lib/data.js"
  import MultiLineChart from "$lib/charts/MultiLineChart.svelte"

  type Candidate = { dataset: DatasetMeta; nutrition: NutritionEntry; color: string }

  // One benchmark per product by default: IMF monthly prices for the grains
  // (the futures contracts quote the same grain, so showing both would double
  // count) and CBOT rough rice. US retail potatoes (APU0000712112) are
  // offered but off by default: fresh retail potatoes cost roughly 30 times
  // more per calorie than grain and would flatten every other line.
  const DEFAULT_TICKERS = ["PMAIZMTUSDM", "PWHEAMTUSDM", "PSOYBUSDM", "ZR=F"]
  const COLORS = ["#f59e0b", "#2563eb", "#16a34a", "#dc2626", "#8b5cf6", "#0ea5e9", "#f97316", "#64748b"]

  let candidates: Candidate[] = []
  let selected = new Set<string>()
  let lines: Array<{ label: string; series: IndexSeries; color: string }> = []
  let cheapest: { date: string; label: string; value: number } | null = null
  let loading = true
  let error: string | null = null

  const calorieCache = new Map<string, IndexSeries>()

  /** Price per 1,000 kcal in USD for one dataset, memoised. */
  async function calorieSeries(c: Candidate): Promise<IndexSeries> {
    const cached = calorieCache.get(c.dataset.ticker)
    if (cached) return cached
    const d = c.dataset
    const raw =
      d.seriesType === "price"
        ? closeIndex(await loadPriceSeries(d.path))
        : await loadIndexSeries(d.path)
    const perKg = toPricePerKg(raw, d.kgPerUnit!, d.currency)
    const result = pricePerCalorie(perKg, c.nutrition.kcalPer100g * 10, c.nutrition.edibleFraction)
    calorieCache.set(d.ticker, result)
    return result
  }

  function label(c: Candidate): string {
    return `${c.dataset.product} (${c.dataset.form})`
  }

  async function refresh() {
    try {
      const active = candidates.filter((c) => selected.has(c.dataset.ticker))
      const series = await Promise.all(active.map(calorieSeries))
      lines = active.map((c, i) => ({ label: label(c), series: series[i]!, color: c.color }))

      // Cheapest calorie on the most recent date every selected series covers.
      const latest = series
        .map((s) => s[s.length - 1]?.date)
        .filter((d): d is NonNullable<typeof d> => d !== undefined)
        .sort()[0]
      if (latest && active.length > 0) {
        const best = cheapestCalorie(
          active.map((c, i) => ({ id: label(c), series: series[i]! })),
          [latest]
        )[0]
        cheapest = best ? { date: best.date, label: best.id, value: best.value } : null
      } else {
        cheapest = null
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  function toggle(ticker: string) {
    if (selected.has(ticker)) selected.delete(ticker)
    else selected.add(ticker)
    selected = selected
    void refresh()
  }

  onMount(async () => {
    try {
      const [manifest, nutrition] = await Promise.all([loadManifest(), loadNutrition()])
      const found: Candidate[] = []
      for (const dataset of manifest.datasets) {
        if (!dataset.product || !dataset.form || !dataset.kgPerUnit) continue
        if (majorCurrency(dataset.currency).major !== "USD") continue
        const entry = nutrition.entries.find(
          (e) => e.product === dataset.product && e.form === dataset.form
        )
        if (!entry) continue
        found.push({ dataset, nutrition: entry, color: COLORS[found.length % COLORS.length]! })
      }
      candidates = found
      selected = new Set(DEFAULT_TICKERS.filter((t) => found.some((c) => c.dataset.ticker === t)))
      await refresh()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>Price of a Calorie — Market Notes</title>
</svelte:head>

<main>
  <header>
    <a href="/" class="back">← Market Notes</a>
    <h1>Price of a Calorie</h1>
    <p class="tagline">
      Each staple's price converted to US dollars per 1,000 kcal, so different foods can be compared.
    </p>
  </header>

  {#if loading}
    <p class="status">Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="picker" role="group" aria-label="Choose series">
      {#each candidates as c (c.dataset.ticker)}
        <label class="choice">
          <input
            type="checkbox"
            checked={selected.has(c.dataset.ticker)}
            on:change={() => toggle(c.dataset.ticker)}
          />
          <span class="swatch" style="background:{c.color}"></span>
          {label(c)} · {c.dataset.ticker}
          {#if c.nutrition.status === "estimate"}<em title="Approximate nutrition values">~</em>{/if}
        </label>
      {/each}
    </div>

    <MultiLineChart {lines} yLabel="USD per 1,000 kcal" />

    {#if cheapest}
      <p class="cheapest">
        Cheapest calorie on {cheapest.date}: <strong>{cheapest.label}</strong> at
        ${cheapest.value.toFixed(3)} per 1,000 kcal.
      </p>
    {/if}

    <p class="meta">
      price per 1,000 kcal = 1000 × price per kg ÷ (kcal per kg × edible fraction).
      Energy values and edible fractions are in <code>data/nutrition.json</code>; ~ marks approximate values.
      Monthly series are carried forward between observations.
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
  .picker { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin-bottom: 1rem; }
  .choice { font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer; }
  .swatch { width: 12px; height: 3px; display: inline-block; }
  .cheapest { font-size: 0.9rem; margin-top: 0.75rem; }
  .meta { font-size: 0.75rem; color: #9ca3af; margin-top: 0.5rem; }
</style>
