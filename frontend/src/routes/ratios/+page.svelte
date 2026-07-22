<script lang="ts">
  import { onMount } from "svelte"
  import { divideSeries } from "@market-notes/core"
  import type { PriceSeries, IndexSeries } from "@market-notes/core"
  import { loadPriceSeries, loadIndexSeries } from "$lib/data.js"
  import RatioChart from "$lib/charts/RatioChart.svelte"

  type RatioEntry = { label: string; series: IndexSeries; color: string }

  let ratios: RatioEntry[] = []
  let loading = true
  let error: string | null = null

  // Oil as IndexSeries needs converting to PriceSeries-like for divideSeries
  // We'll treat oil IndexSeries as adjClose by creating a synthetic PriceSeries
  function indexToPriceSeries(index: IndexSeries): PriceSeries {
    return index.map(row => ({
      date: row.date,
      ohlcv: {
        open: row.value,
        high: row.value,
        low: row.value,
        close: row.value,
        adjClose: row.value,
        volume: 0,
      }
    }))
  }

  onMount(async () => {
    try {
      const [sp500, gold, oilIndex] = await Promise.all([
        loadPriceSeries("data/prices/GSPC.csv"),
        loadPriceSeries("data/prices/GC=F.csv"),
        loadIndexSeries("data/indices/OIL.csv"),
      ])

      const oil = indexToPriceSeries(oilIndex)

      ratios = [
        { label: "Gold / SP500",  series: divideSeries(gold, sp500), color: "#f59e0b" },
        { label: "Oil / SP500",   series: divideSeries(oil,  sp500), color: "#3b82f6" },
        { label: "Gold / Oil",    series: divideSeries(gold, oil),   color: "#8b5cf6" },
      ]
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>Ratios — Market Notes</title>
</svelte:head>

<main>
  <header>
    <a href="/" class="back">← Market Notes</a>
    <h1>Macro Ratios</h1>
    <p class="tagline">
      Gold/SP500 — trust in the system &nbsp;·&nbsp;
      Oil/SP500 — real vs speculative growth &nbsp;·&nbsp;
      Gold/Oil — economic activity
    </p>
  </header>

  {#if loading}
    <p class="status">Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <RatioChart {ratios} />
    <p class="meta">
      Ratios rebased to 100 at first shared date.
      Vertical lines mark polarity flips (green = bullish, red = bearish).
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
  header { margin-bottom: 2rem; }
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
  .meta { font-size: 0.75rem; color: #9ca3af; margin-top: 0.5rem; }
</style>
